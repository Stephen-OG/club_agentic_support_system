export type CommandMembership = {
  id: string;
  workspaceId: string;
  venueId: string | null;
  role: "owner" | "admin" | "manager" | "staff" | "security" | "read_only";
  workspace: { id: string; name: string; slug: string };
  venue: { id: string; name: string; slug: string } | null;
};

export type CommandUser = {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  memberships: CommandMembership[];
};

export type CreatedStaffCredential = {
  staff: {
    id: string;
    authUserId: string;
    email: string;
    displayName: string;
  };
  temporaryPassword: string;
};
