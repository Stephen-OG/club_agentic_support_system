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
      workspaceName: input.workspaceName,
      venueName: input.venueName
    }, "SetupService");

    // Check if email already has a staff profile
    const existingProfile = await this.prisma.staffProfile.findUnique({ where: { email } });
    if (existingProfile) {
      this.logger.warn(`Setup failed: profile already exists for ${email}`, "SetupService");
      throw new ConflictException("A staff profile already exists for this email. Please sign in instead.");
    }

    // Check if workspace slug is taken
    const existingWorkspace = await this.prisma.workspace.findUnique({ where: { slug: input.workspaceSlug } });
    if (existingWorkspace) {
      this.logger.warn(`Setup failed: workspace slug "${input.workspaceSlug}" already taken`, "SetupService");
      throw new ConflictException(`Workspace slug "${input.workspaceSlug}" is already taken.`);
    }

    // Check if venue slug is taken within the future workspace
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
      throw new UnauthorizedException("Workspace setup must match your authenticated session");
    }

    const timezone = input.timezone || "Europe/London";

    // Create everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create workspace
      const workspace = await tx.workspace.create({
        data: {
          name: input.workspaceName.trim(),
          slug: input.workspaceSlug
        }
      });
      this.logger.logEvent("signup.workspace_created", { workspaceId: workspace.id, name: workspace.name }, "SetupService");

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
          workspaceId: workspace.id,
          name: input.venueName.trim(),
          slug: input.venueSlug,
          timezone,
          openingHours: {
            create: defaultOpeningHours()
          }
        }
      });
      this.logger.logEvent("signup.venue_created", { venueId: venue.id, name: venue.name }, "SetupService");

      // 4. Create the initial owner as a venue-scoped operator for the venue they just set up.
      await tx.staffMembership.create({
        data: {
          workspaceId: workspace.id,
          venueId: venue.id,
          staffProfileId: staff.id,
          role: "OWNER"
        }
      });
      this.logger.logEvent("signup.staff_created", { staffProfileId: staff.id, email, venueId: venue.id }, "SetupService");

      return { workspace, staff, venue };
    });

    this.logger.logEvent("signup.completed", {
      workspaceId: result.workspace.id,
      staffProfileId: result.staff.id,
      venueId: result.venue.id
    }, "SetupService");

    return {
      workspaceId: result.workspace.id,
      workspaceName: result.workspace.name,
      staffProfileId: result.staff.id,
      venueId: result.venue.id,
      venueName: result.venue.name
    };
  }
}
