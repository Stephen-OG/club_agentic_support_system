import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { StructuredLogger } from "../common/logger/structured-logger.service";
import type { SetupRequestDto } from "./dto/signup-request.dto";
import type { SetupResponseDto } from "./dto/signup-response.dto";

function defaultOpeningHours() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closesAt: "23:00",
    dayOfWeek,
    isClosed: false,
    opensAt: "09:00"
  }));
}

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLogger
  ) {}

  async initialize(input: SetupRequestDto, authUserId: string): Promise<SetupResponseDto> {
    const email = input.email.trim().toLowerCase();

    this.logger.logEvent("signup.started", {
      email,
      organizationName: input.organizationName,
      venueName: input.venueName
    }, "SetupService");

    // Check if email already has a staff profile
    const existingProfile = await this.prisma.staffProfile.findUnique({ where: { email } });
    if (existingProfile) {
      this.logger.warn(`Setup failed: profile already exists for ${email}`, "SetupService");
      throw new ConflictException("A staff profile already exists for this email. Please sign in instead.");
    }

    // NOTE: This is a best-effort early check; the authoritative check happens inside the
    // transaction to avoid TOCTOU races and to scope the check to the organization.
    const existingVenue = await this.prisma.venue.findFirst({
      where: { slug: input.venueSlug }
    });
    if (existingVenue) {
      this.logger.warn(`Setup failed: venue slug "${input.venueSlug}" already taken`, "SetupService");
      throw new ConflictException(`Venue slug "${input.venueSlug}" is already taken.`);
    }

    const authUser = await this.prisma.authUser.findUnique({ where: { id: authUserId } });

    if (!authUser) {
      this.logger.error(`Setup failed: no app auth user found for ${email}`, undefined, "SetupService");
      throw new InternalServerErrorException(
        "No app auth user found for this email. Please sign up first."
      );
    }

    if (authUser.email.toLowerCase() !== email || !authUser.emailVerifiedAt) {
      throw new UnauthorizedException("Organization setup must match your authenticated session");
    }

    const timezone = input.timezone || "Europe/London";

    // Create everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Check organization slug uniqueness inside transaction (TOCTOU-safe)
      const txExistingOrg = await tx.organization.findUnique({ where: { slug: input.organizationSlug } });
      if (txExistingOrg) {
        this.logger.warn(`Setup failed: organization slug "${input.organizationSlug}" already taken`, "SetupService");
        throw new ConflictException(`Organization slug "${input.organizationSlug}" is already taken.`);
      }

      // 1. Create organization
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          slug: input.organizationSlug
        }
      });
      this.logger.logEvent("signup.organization_created", { organizationId: organization.id, name: organization.name }, "SetupService");

      // NOTE: venue slug is checked scoped to the organization to avoid TOCTOU race and
      // ensure per-organization uniqueness.
      const txExistingVenue = await tx.venue.findFirst({
        where: { slug: input.venueSlug, organizationId: organization.id }
      });
      if (txExistingVenue) {
        this.logger.warn(`Setup failed: venue slug "${input.venueSlug}" already taken in this organization`, "SetupService");
        throw new ConflictException(`Venue slug "${input.venueSlug}" is already taken in this organization.`);
      }

      // 2. Create staff profile with auth link
      const staff = await tx.staffProfile.create({
        data: {
          authUserId: authUser.id,
          email,
          displayName: input.displayName.trim()
        }
      });

      // 3. Create venue with default opening hours
      const venue = await tx.venue.create({
        data: {
          organizationId: organization.id,
          name: input.venueName.trim(),
          slug: input.venueSlug,
          timezone,
          hours: {
            create: defaultOpeningHours()
          }
        }
      });
      this.logger.logEvent("signup.venue_created", { venueId: venue.id, name: venue.name }, "SetupService");

      // 4. Create the initial owner as a venue-scoped operator for the venue they just set up.
      await tx.teamRole.create({
        data: {
          organizationId: organization.id,
          venueId: venue.id,
          staffProfileId: staff.id,
          role: "OWNER"
        }
      });
      this.logger.logEvent("signup.staff_created", { staffProfileId: staff.id, email, venueId: venue.id }, "SetupService");

      return { organization, staff, venue };
    }).catch((error) => {
      if ((error as any)?.code === 'P2002') {
        throw new ConflictException("A unique constraint violation occurred. Please try again.");
      }
      throw error;
    });

    this.logger.logEvent("signup.completed", {
      organizationId: result.organization.id,
      staffProfileId: result.staff.id,
      venueId: result.venue.id
    }, "SetupService");

    return {
      organizationId: result.organization.id,
      organizationName: result.organization.name,
      staffProfileId: result.staff.id,
      venueId: result.venue.id,
      venueName: result.venue.name
    };
  }
}
