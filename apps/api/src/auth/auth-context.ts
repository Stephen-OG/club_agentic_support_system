import type { StaffRole } from "@madupe/shared";

export type AuthContext = {
  staffProfileId: string;
  workspaceId: string;
  venueId?: string;
  role: StaffRole;
};

export type RequestWithAuth = {
  auth?: AuthContext;
};
