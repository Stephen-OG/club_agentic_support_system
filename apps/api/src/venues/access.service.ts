import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context";

type VenueTarget = {
  workspaceId: string;
  venueId: string;
};

@Injectable()
export class VenueAccessService {
  canManageWorkspace(auth: AuthContext, workspaceId: string) {
    return auth.workspaceId === workspaceId && auth.role === "admin";
  }

  canManageVenue(auth: AuthContext, target: VenueTarget) {
    if (auth.workspaceId !== target.workspaceId) {
      return false;
    }

    if (auth.role === "admin") {
      return true;
    }

    if (auth.role === "owner" || auth.role === "manager") {
      return auth.venueId === target.venueId;
    }

    return false;
  }

  canOperateVenue(auth: AuthContext, target: VenueTarget) {
    if (this.canManageVenue(auth, target)) {
      return true;
    }

    return auth.workspaceId === target.workspaceId && auth.venueId === target.venueId && ["staff", "security"].includes(auth.role);
  }

  canReadVenue(auth: AuthContext, target: VenueTarget) {
    if (this.canOperateVenue(auth, target)) {
      return true;
    }

    return auth.workspaceId === target.workspaceId && auth.venueId === target.venueId && auth.role === "read_only";
  }

  assertCanManageWorkspace(auth: AuthContext, workspaceId: string) {
    if (!this.canManageWorkspace(auth, workspaceId)) {
      throw new ForbiddenException("You cannot manage this workspace");
    }
  }

  assertCanManageVenue(auth: AuthContext, target: VenueTarget) {
    if (!this.canManageVenue(auth, target)) {
      throw new ForbiddenException("You cannot manage this venue");
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
