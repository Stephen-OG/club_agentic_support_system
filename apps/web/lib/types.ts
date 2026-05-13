export type RequestStatus =
  | "new"
  | "acknowledged"
  | "declined"
  | "in_progress"
  | "completed"
  | "resolved"
  | "cancelled";
export type RequestPriority = "low" | "normal" | "high" | "urgent";
export type SenderType = "guest" | "assistant" | "staff" | "system";
export type StaffRole = "manager" | "admin" | "staff";

export type ClubTable = {
  id: string;
  club_id: string;
  label: string;
  qr_token: string;
  zone: string | null;
};

export type SupportRequest = {
  id: string;
  club_id: string;
  table_id: string;
  conversation_id: string;
  title: string;
  category: string;
  status: RequestStatus;
  priority: RequestPriority;
  assigned_to: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  satisfaction_rating?: number | null;
  club_tables?: Pick<ClubTable, "label" | "zone"> | null;
  staff_profiles?: Pick<StaffProfile, "display_name" | "role"> | null;
};

export type StaffProfile = {
  id: string;
  club_id: string;
  display_name: string;
  role: StaffRole;
  created_at: string;
};

export type Message = {
  id: string;
  club_id: string;
  table_id: string;
  conversation_id: string;
  request_id: string | null;
  sender: SenderType;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AiTriage = {
  title: string;
  category: string;
  priority: RequestPriority;
  assistantReply: string;
  needsStaff: boolean;
};
