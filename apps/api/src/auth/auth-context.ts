import type { StaffRole } from "@madupe/shared";

export type AuthContext = {
  staffProfileId: string;
  organizationId: string;
  venueId?: string;
  role: StaffRole;
};

export type RequestWithAuth = {
  auth?: AuthContext;
};
