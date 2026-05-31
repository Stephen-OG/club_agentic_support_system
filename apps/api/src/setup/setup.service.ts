import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import type { SetupRequestDto } from "./dto/setup-request.dto";
import type { SetupResponseDto } from "./dto/setup-response.dto";

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
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  async initialize(input: SetupRequestDto): Promise<SetupResponseDto> {
    const email = input.email.trim().toLowerCase();

    // Check if email already has a staff profile
    const existingProfile = await this.prisma.staffProfile.findUnique({ where: { email } });
    if (existingProfile) {
      throw new ConflictException("A staff profile already exists for this email. Please sign in instead.");
    }

    // Check if workspace slug is taken
    const existingWorkspace = await this.prisma.workspace.findUnique({ where: { slug: input.workspaceSlug } });
    if (existingWorkspace) {
      throw new ConflictException(`Workspace slug "${input.workspaceSlug}" is already taken.`);
    }

    // Check if venue slug is taken within the future workspace
    const existingVenue = await this.prisma.venue.findFirst({
      where: { slug: input.venueSlug }
    });
    if (existingVenue) {
      throw new ConflictException(`Venue slug "${input.venueSlug}" is already taken.`);
    }

    // Look up the Supabase user by email to get their authUserId
    // The user must already exist in Supabase Auth (signed up via the login page)
    const { data: users } = await this.supabaseAdmin.getClient().auth.admin.listUsers();
    const authUser = users?.users?.find((u) => u.email === email);

    if (!authUser) {
      throw new InternalServerErrorException(
        "No Supabase auth user found for this email. Please sign up first."
      );
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

      // 2. Create staff profile with auth link
      const staff = await tx.staffProfile.create({
        data: {
          authUserId: authUser.id,
          email,
          displayName: input.displayName.trim()
        }
      });

      // 3. Create owner membership
      await tx.staffMembership.create({
        data: {
          workspaceId: workspace.id,
          staffProfileId: staff.id,
          role: "OWNER"
        }
      });

      // 4. Create venue with default opening hours
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

      return { workspace, staff, venue };
    });

    return {
      workspaceId: result.workspace.id,
      workspaceName: result.workspace.name,
      staffProfileId: result.staff.id,
      venueId: result.venue.id,
      venueName: result.venue.name
    };
  }
}
