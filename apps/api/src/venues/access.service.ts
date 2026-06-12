import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context";

type VenueTarget = {
  organizationId: string;
  venueId: string;
};

@Injectable()
export class VenueAccessService {
  canManageOrganization(auth: AuthContext, organizationId: string) {
    return auth.organizationId === organizationId && (auth.role === "admin" || auth.role === "owner");
  }

  canManageVenue(auth: AuthContext, target: VenueTarget) {
    if (auth.organizationId !== target.organizationId) {
      return false;
    }

    if (auth.role === "admin" || auth.role === "owner") {
      return true;
    }

    if (auth.role === "manager") {
      return auth.venueId === target.venueId;
    }

    return false;
  }

  canOperateVenue(auth: AuthContext, target: VenueTarget) {
    if (this.canManageVenue(auth, target)) {
      return true;
    }

    return auth.organizationId === target.organizationId && auth.venueId === target.venueId && ["staff", "security"].includes(auth.role);
  }

  canReadVenue(auth: AuthContext, target: VenueTarget) {
    if (this.canOperateVenue(auth, target)) {
      return true;
    }

    return auth.organizationId === target.organizationId && auth.venueId === target.venueId && auth.role === "read_only";
  }

  assertCanManageOrganization(auth: AuthContext, organizationId: string) {
    if (!this.canManageOrganization(auth, organizationId)) {
      throw new ForbiddenException("You cannot manage this organization");
    }
  }

  assertCanManageVenue(auth: AuthContext, target: VenueTarget) {
    if (!this.canManageVenue(auth, target)) {
      throw new ForbiddenException("You cannot manage this venue");
    }
  }

  assertCanManageWorkspace(auth: AuthContext, organizationId: string) {
    if (!this.canManageOrganization(auth, organizationId)) {
      throw new ForbiddenException("You cannot manage this organization");
    }
  }

  assertCanOperateVenue(auth: AuthContext, target: VenueTarget) {
    if (!this.canOperateVenue(auth, target)) {
      throw new ForbiddenException("You cannot operate this venue");
    }
  }

  assertCanReadVenue(auth: AuthContext, target: VenueTarget) {
    if (!this.canReadVenue(auth, target)) {
      throw new ForbiddenException("You cannot read this venue");
    }
  }
}

