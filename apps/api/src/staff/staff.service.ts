import { randomBytes } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { PrismaService } from "../database/prisma.service";
import type { CreateStaffUserDto } from "./dto/create-staff-user.dto";

const prismaRoleBySharedRole: Record<CreateStaffUserDto["role"], StaffRole> = {
  owner: StaffRole.OWNER,
  admin: StaffRole.ADMIN,
  manager: StaffRole.MANAGER,
  staff: StaffRole.STAFF,
  security: StaffRole.SECURITY,
  read_only: StaffRole.READ_ONLY
};

const sharedRoleByPrismaRole: Record<StaffRole, CreateStaffUserDto["role"]> = {
  OWNER: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  STAFF: "staff",
  SECURITY: "security",
  READ_ONLY: "read_only"
};

const venueManagerCreatableRoles = new Set<CreateStaffUserDto["role"]>(["manager", "staff", "security", "read_only"]);

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  async getCurrentUser(auth: AuthContext) {
    const profile = await this.prisma.staffProfile.findUnique({
      where: { id: auth.staffProfileId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!profile) {
      return null;
    }

    return {
      ...profile,
      memberships: profile.memberships.map((membership) => ({
        ...membership,
        role: sharedRoleByPrismaRole[membership.role]
      }))
    };
  }

  async listTeam(auth: AuthContext) {
    this.assertCanManageTeam(auth);
    const membershipWhere =
      auth.role === "admin" || (auth.role === "owner" && !auth.venueId)
        ? {
            workspaceId: auth.workspaceId,
            isActive: true
          }
        : {
            workspaceId: auth.workspaceId,
            venueId: auth.venueId ?? "00000000-0000-0000-0000-000000000000",
            isActive: true
          };

    const profiles = await this.prisma.staffProfile.findMany({
      where: {
        memberships: {
          some: membershipWhere
        }
      },
      include: {
        memberships: {
          where: membershipWhere,
          include: { venue: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { displayName: "asc" }
    });

    return profiles.map((profile) => ({
      ...profile,
      memberships: profile.memberships.map((membership) => ({
        ...membership,
        role: sharedRoleByPrismaRole[membership.role]
      }))
    }));
  }

  async createStaffUser(auth: AuthContext, input: CreateStaffUserDto) {
    const venueId = this.resolveCreatableVenueId(auth, input);
    await this.assertVenueInWorkspace(auth, venueId);

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.staffProfile.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException("A staff profile already exists for this email");
    }

    const temporaryPassword = input.temporaryPassword || this.generateTemporaryPassword();
    const authUser = await this.supabaseAdmin.createTemporaryPasswordUser({
      email,
      password: temporaryPassword,
      displayName: input.displayName.trim()
    });

    let result: {
      staff: { id: string; authUserId: string | null; email: string | null; displayName: string };
      membership: { id: string; role: StaffRole; venueId: string | null };
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const staff = await tx.staffProfile.create({
          data: {
            authUserId: authUser.id,
            email,
            displayName: input.displayName.trim()
          }
        });

        const membership = await tx.staffMembership.create({
          data: {
            workspaceId: auth.workspaceId,
            venueId,
            staffProfileId: staff.id,
            role: prismaRoleBySharedRole[input.role]
          }
        });

        return { staff, membership };
      });
    } catch (error) {
      await this.supabaseAdmin.deleteUser(authUser.id);
      throw error;
    }

    return {
      staff: result.staff,
      membership: result.membership,
      temporaryPassword
    };
  }

  private assertCanManageTeam(auth: AuthContext) {
    if (auth.role === "admin") {
      return;
    }

    if (auth.role === "owner") {
      return;
    }

    if (auth.role === "manager" && auth.venueId) {
      return;
    }

    throw new ForbiddenException("Only venue managers can manage staff");
  }

  private resolveCreatableVenueId(auth: AuthContext, input: CreateStaffUserDto) {
    this.assertCanManageTeam(auth);

    if (auth.role === "admin") {
      if (input.role === "admin") {
        return null;
      }

      if (!input.venueId) {
        throw new ForbiddenException("Admins must choose a venue for venue-scoped staff");
      }

      return input.venueId;
    }

    if (auth.role === "owner" && !auth.venueId) {
      if (!venueManagerCreatableRoles.has(input.role)) {
        throw new ForbiddenException("Workspace owners cannot create platform admin or owner accounts here");
      }

      if (!input.venueId) {
        throw new ForbiddenException("Workspace owners must choose a venue for venue-scoped staff");
      }

      return input.venueId;
    }

    if (!venueManagerCreatableRoles.has(input.role)) {
      throw new ForbiddenException("Venue managers cannot create platform admin or owner accounts");
    }

    if (input.venueId && input.venueId !== auth.venueId) {
      throw new ForbiddenException("Venue managers can only create users for their assigned venue");
    }

    return auth.venueId;
  }

  private async assertVenueInWorkspace(auth: AuthContext, venueId: string | null | undefined) {
    if (!venueId) {
      return;
    }

    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        workspaceId: auth.workspaceId
      },
      select: {
        id: true
      }
    });

    if (!venue) {
      throw new ForbiddenException("Venue does not belong to this workspace");
    }
  }

  private generateTemporaryPassword() {
    const suffix = randomBytes(9).toString("hex").slice(0, 14);
    return `Madupe-${suffix}!`;
  }
}
