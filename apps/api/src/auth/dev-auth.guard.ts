import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { StaffRoleSchema } from "@madupe/shared";
import type { RequestWithAuth } from "./auth-context";

@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      throw new UnauthorizedException("Dev auth is not available in this environment");
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuth & { headers: Record<string, string | string[] | undefined> }>();
    const staffProfileId = this.header(request.headers, "x-staff-id");
    const organizationId = this.header(request.headers, "x-organization-id");
    const roleInput = this.header(request.headers, "x-staff-role");
    const venueId = this.header(request.headers, "x-venue-id");
    const role = StaffRoleSchema.safeParse(roleInput);

    if (!staffProfileId || !organizationId || !role.success) {
      throw new UnauthorizedException("Missing staff auth headers");
    }

    request.auth = {
      staffProfileId,
      organizationId,
      venueId,
      role: role.data
    };

    return true;
  }

  private header(headers: Record<string, string | string[] | undefined>, key: string) {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
}
