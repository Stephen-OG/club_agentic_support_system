export type CommandRole = "owner" | "admin" | "manager" | "staff" | "security" | "read_only";

export type CommandMembership = {
  id: string;
  workspaceId: string;
  venueId: string | null;
  role: CommandRole;
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

export type CommandTeamMember = {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  memberships: CommandMembership[];
  createdAt?: string;
  updatedAt?: string;
};

export type CommandVenueLocation = {
  id: string;
  venueId: string;
  name: string;
  zone: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CommandServicePoint = {
  id: string;
  venueId: string;
  locationId: string | null;
  label: string;
  qrToken: string;
  tokenVersion: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommandVenue = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  timezone: string;
  locations: CommandVenueLocation[];
  servicePoints: CommandServicePoint[];
  createdAt: string;
  updatedAt: string;
};

export type CommandRequestStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "RESOLVED"
  | "DECLINED"
  | "CANCELLED"
  | "ESCALATED";

export type CommandRequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type CommandSupportRequest = {
  id: string;
  venueId: string;
  servicePointId: string;
  conversationId: string;
  assignedToId: string | null;
  title: string;
  category: string;
  summary: string | null;
  priority: CommandRequestPriority;
  deterministicPriority: CommandRequestPriority | null;
  aiPriority: CommandRequestPriority | null;
  status: CommandRequestStatus;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  resolvedAt: string | null;
  assignedTo?: Pick<CommandTeamMember, "id" | "displayName" | "email"> | null;
  servicePoint?: CommandServicePoint;
};

export type CommandMessage = {
  id: string;
  venueId: string;
  servicePointId: string;
  conversationId: string;
  requestId: string | null;
  sender: "GUEST" | "ASSISTANT" | "STAFF" | "SYSTEM";
  body: string;
  metadata: unknown;
  createdAt: string;
};

export type PublicQrConversationState = {
  conversationId: string;
  messages: CommandMessage[];
  request: CommandSupportRequest | null;
  servicePoint: CommandServicePoint;
};
