import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { RequestWithAuth } from "./auth-context";
import { SUPABASE_ADMIN_CLIENT, type SupabaseAdminClient } from "./supabase-admin.service";

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
      role: "owner" | "manager" | "admin" | "staff" | "security" | "read_only";
      workspace: { id: string; name: string; slug: string };
      venue: { id: string; name: string; slug: string } | null;
    }>;
  };
  headers: Record<string, string | string[] | undefined>;
};

const roleByPrismaRole: Record<string, "owner" | "manager" | "admin" | "staff" | "security" | "read_only"> = {
  OWNER: "owner",
  MANAGER: "manager",
  ADMIN: "admin",
  STAFF: "staff",
  SECURITY: "security",
  READ_ONLY: "read_only"
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseAdminClient,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithCurrentUser>();
    const token = this.getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException("Invalid session");
    }

    const profile = await this.prisma.staffProfile.findUnique({
      where: { authUserId: data.user.id },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const membership = profile?.memberships[0];

    if (!profile || !membership) {
      throw new UnauthorizedException("Staff account is not configured");
    }

    const role = this.mapRole(membership.role);

    request.auth = {
      staffProfileId: profile.id,
      workspaceId: membership.workspaceId,
      venueId: membership.venueId ?? undefined,
      role
    };
    request.currentUser = {
      authUserId: data.user.id,
      email: data.user.email ?? profile.email ?? null,
      displayName: profile.displayName,
      mustChangePassword: data.user.user_metadata?.mustChangePassword === true,
      memberships: profile.memberships.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        venueId: item.venueId,
        role: this.mapRole(item.role),
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

  private mapRole(role: string) {
    const mapped = roleByPrismaRole[role];

    if (!mapped) {
      throw new UnauthorizedException("Staff role is not configured");
    }

    return mapped;
  }
}
