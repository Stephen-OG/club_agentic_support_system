export type CommandRole = "owner" | "admin" | "manager" | "staff" | "security" | "read_only";

export type CommandMembership = {
  id: string;
  organizationId: string;
  venueId: string | null;
  role: CommandRole;
  organization: { id: string; name: string; slug: string };
  venue: { id: string; name: string; slug: string } | null;
};

export type CommandUser = {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  memberships: CommandMembership[];
};

export type LaunchStatus = {
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: Array<{
    id: "organization" | "venue" | "opening_hours" | "qr_points" | "team" | "test_request";
    label: string;
    detail: string;
    complete: boolean;
    actionLabel: string;
    actionView: "account" | "venues" | "team" | "operations";
  }>;
};

export type CreatedStaffCredential = {
  staff: {
    id: string;
    authUserId: string;
    email: string;
    displayName: string;
  };
  invitationSent: boolean;
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

export type CommandVenueHours = {
  id?: string;
  venueId?: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CommandQrPoint = {
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
  organizationId: string;
  name: string;
  slug: string;
  timezone: string;
  locations: CommandVenueLocation[];
  hours: CommandVenueHours[];
  qrPoints: CommandQrPoint[];
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
  qrPointId: string;
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
  qrPoint?: CommandQrPoint;
};

export type CommandMessage = {
  id: string;
  venueId: string;
  qrPointId: string;
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
  qrPoint: CommandQrPoint;
  venue?: PublicVenueSummary;
};

export type PublicQrIntakeState = {
  chatAvailability: PublicChatAvailability;
  qrPoint: CommandQrPoint;
  venue?: PublicVenueSummary;
};
