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

export type CommandVenueOpeningHour = {
  id?: string;
  venueId?: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CommandServicePoint = {
  id: string;
  venueId: string;
  locationId: string | null;
  location?: CommandVenueLocation | null;
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
  openingHours: CommandVenueOpeningHour[];
  servicePoints: CommandServicePoint[];
  createdAt: string;
  updatedAt: string;
};

export type PublicVenueSummary = Pick<CommandVenue, "id" | "name" | "slug">;

export type PublicChatAvailability = {
  isOpen: boolean;
  reason: "open" | "closed" | "hours_not_configured";
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
  guestLocationLabel?: string | null;
  guestLocationSource?: string | null;
  agentPolicyVersion?: string | null;
  agentConfidence?: number | null;
  agentSuggestedAction?: string | null;
  satisfactionRating?: number | null;
  recentMessages?: Array<Pick<CommandMessage, "id" | "sender" | "body" | "createdAt">>;
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
  chatAvailability?: PublicChatAvailability;
  conversationId: string;
  messages: CommandMessage[];
  replyPending?: boolean;
  request: CommandSupportRequest | null;
  servicePoint: CommandServicePoint;
  venue?: PublicVenueSummary;
};

export type PublicQrIntakeState = {
  chatAvailability: PublicChatAvailability;
  servicePoint: CommandServicePoint;
  venue?: PublicVenueSummary;
};
