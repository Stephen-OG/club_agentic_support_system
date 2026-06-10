import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { RequestWithAuth } from "./auth-context";
import { AppAuthService } from "./app-auth.service";

type AuthRole = "owner" | "manager" | "admin" | "staff" | "security" | "read_only";

type RequestWithCurrentUser = RequestWithAuth & {
  currentUser?: {
    authUserId: string;
    email: string | null;
    displayName: string;
    mustChangePassword: boolean;
    memberships: Array<{
      id: string;
      workspaceId: string;
      venueId: string | null;
      role: AuthRole;
      workspace: { id: string; name: string; slug: string };
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
const authRoleRank: Record<AuthRole, number> = {
  admin: 6,
  owner: 5,
  manager: 4,
  security: 3,
  staff: 2,
  read_only: 1
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
    const profile = await this.prisma.staffProfile.findUnique({
      where: { authUserId: session.user.id },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const memberships = profile?.memberships.map((item) => ({ ...item, role: this.mapRole(item.role) })) ?? [];
    const membership = [...memberships].sort((left, right) => authRoleRank[right.role] - authRoleRank[left.role])[0];

    if (!profile || !membership) {
      throw new UnauthorizedException("Staff account is not configured");
    }

    request.auth = {
      staffProfileId: profile.id,
      workspaceId: membership.workspaceId,
      venueId: membership.venueId ?? undefined,
      role: membership.role
    };
    request.currentUser = {
      authUserId: session.user.id,
      email: session.user.email ?? profile.email ?? null,
      displayName: profile.displayName,
      mustChangePassword: session.user.mustChangePassword,
      memberships: memberships.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        venueId: item.venueId,
        role: item.role,
        workspace: item.workspace,
        venue: item.venue
      }))
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
