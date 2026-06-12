import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { getPrimaryStaffRole, type StaffRole } from "@madupe/shared";
import { PrismaService } from "../database/prisma.service";
import type { RequestWithAuth } from "./auth-context";
import { AppAuthService } from "./app-auth.service";

type AuthRole = StaffRole;

type RequestWithCurrentUser = RequestWithAuth & {
  user?: {
    roles: AuthRole[];
  };
  currentUser?: {
    authUserId: string;
    email: string | null;
    displayName: string;
    mustChangePassword: boolean;
    memberships: Array<{
      id: string;
      organizationId: string;
      venueId: string | null;
      role: AuthRole;
      organization: { id: string; name: string; slug: string };
      venue: { id: string; name: string; slug: string } | null;
    }>;
  };
  headers: Record<string, string | string[] | undefined>;
};

const roleByPrismaRole: Record<string, AuthRole> = {
  OWNER: "owner",
  MANAGER: "manager",
  ADMIN: "admin",
  STAFF: "staff",
  SECURITY: "security",
  READ_ONLY: "read_only"
};
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly appAuth: AppAuthService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithCurrentUser>();
    const token = this.getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const session = await this.appAuth.verifyBearerToken(token);
    if (session.user.mustChangePassword) {
      throw new UnauthorizedException("Password must be changed before continuing");
    }

    const profile = await this.prisma.staffProfile.findUnique({
      where: { authUserId: session.user.id },
      include: {
        teamRoles: {
          where: { isActive: true },
          include: { organization: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const memberships = profile?.teamRoles.map((item) => ({ ...item, role: this.mapRole(item.role) })) ?? [];
    const membership = getPrimaryStaffRole(memberships);

    if (!profile || !membership) {
      throw new UnauthorizedException("Staff account is not configured");
    }

    const allRoles = memberships.map((item) => item.role);

    request.auth = {
      staffProfileId: profile.id,
      organizationId: membership.organizationId,
      venueId: membership.venueId ?? undefined,
      role: membership.role
    };
    request.user = { roles: allRoles };
    request.currentUser = {
      authUserId: session.user.id,
      email: session.user.email ?? profile.email ?? null,
      displayName: profile.displayName,
      mustChangePassword: session.user.mustChangePassword,
      memberships
    };

    return true;
  }

  private getBearerToken(value: string | string[] | undefined) {
    const header = Array.isArray(value) ? value[0] : value;
    const match = header?.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }

  private mapRole(role: string): AuthRole {
    const mapped = roleByPrismaRole[role];

    if (!mapped) {
      throw new UnauthorizedException("Staff role is not configured");
    }

    return mapped;
  }
}
