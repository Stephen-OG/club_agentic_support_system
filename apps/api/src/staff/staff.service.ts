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

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  async getCurrentUser(auth: AuthContext) {
    return this.prisma.staffProfile.findUnique({
      where: { id: auth.staffProfileId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  async listTeam(auth: AuthContext) {
    this.assertWorkspaceAdmin(auth);

    return this.prisma.staffProfile.findMany({
      where: {
        memberships: {
          some: {
            workspaceId: auth.workspaceId,
            isActive: true
          }
        }
      },
      include: {
        memberships: {
          where: { workspaceId: auth.workspaceId },
          include: { venue: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { displayName: "asc" }
    });
  }

  async createStaffUser(auth: AuthContext, input: CreateStaffUserDto) {
    this.assertWorkspaceAdmin(auth);

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

    const { staff, membership } = await this.prisma.$transaction(async (tx) => {
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
          venueId: ["owner", "admin"].includes(input.role) ? null : input.venueId,
          staffProfileId: staff.id,
          role: prismaRoleBySharedRole[input.role]
        }
      });

      return { staff, membership };
    });

    return {
      staff,
      membership,
      temporaryPassword
    };
  }

  private assertWorkspaceAdmin(auth: AuthContext) {
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new ForbiddenException("Only workspace admins can manage staff");
    }
  }

  private generateTemporaryPassword() {
    const suffix = randomBytes(9).toString("hex").slice(0, 14);
    return `GuestOS-${suffix}!`;
  }
}
