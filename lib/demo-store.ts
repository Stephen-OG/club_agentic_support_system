import type { ClubTable, Message, RequestStatus, StaffProfile, StaffRole, SupportRequest } from "@/lib/types";

const demoClubId = "00000000-0000-0000-0000-000000000001";

const demoTables: ClubTable[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    club_id: demoClubId,
    label: "Table 1",
    qr_token: "demo-table-1",
    zone: "Main Floor"
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    club_id: demoClubId,
    label: "Table 2",
    qr_token: "demo-table-2",
    zone: "Main Floor"
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    club_id: demoClubId,
    label: "Table 3",
    qr_token: "demo-table-3",
    zone: "Main Floor"
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    club_id: demoClubId,
    label: "Table 4",
    qr_token: "demo-table-4",
    zone: "Main Floor"
  },
  {
    id: "10000000-0000-0000-0000-000000000005",
    club_id: demoClubId,
    label: "VIP 1",
    qr_token: "demo-vip-1",
    zone: "VIP"
  }
];

const demoStaff: StaffProfile[] = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    club_id: demoClubId,
    display_name: "Maya Manager",
    role: "manager",
    created_at: new Date().toISOString()
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    club_id: demoClubId,
    display_name: "Alex Admin",
    role: "admin",
    created_at: new Date().toISOString()
  },
  {
    id: "20000000-0000-0000-0000-000000000003",
    club_id: demoClubId,
    display_name: "Sam Staff",
    role: "staff",
    created_at: new Date().toISOString()
  },
  {
    id: "20000000-0000-0000-0000-000000000004",
    club_id: demoClubId,
    display_name: "Riley Runner",
    role: "staff",
    created_at: new Date().toISOString()
  }
];

const conversations = new Map<string, string>();
const messages: Message[] = [];
const requests: SupportRequest[] = [];

export function getDemoTable(token: string) {
  return demoTables.find((table) => table.qr_token === token) || demoTables[0];
}

export function getDemoTableById(id: string) {
  return demoTables.find((table) => table.id === id) || demoTables[0];
}

export function getDemoConversation(tableId: string) {
  const existing = conversations.get(tableId);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  conversations.set(tableId, id);
  return id;
}

export function addDemoMessage(input: Omit<Message, "id" | "created_at" | "metadata"> & { metadata?: Record<string, unknown> }) {
  const message: Message = {
    ...input,
    id: crypto.randomUUID(),
    metadata: input.metadata || {},
    created_at: new Date().toISOString()
  };
  messages.push(message);
  return message;
}

export function addDemoRequest(
  input: Omit<SupportRequest, "id" | "assigned_to" | "created_at" | "updated_at" | "resolved_at" | "staff_profiles"> & {
    assigned_to?: string | null;
  }
) {
  const table = getDemoTableById(input.table_id);
  const assignedStaff = input.assigned_to ? getDemoStaffById(input.assigned_to) : null;
	  const request: SupportRequest = {
	    ...input,
	    id: crypto.randomUUID(),
	    assigned_to: input.assigned_to || null,
	    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    club_tables: {
      label: table.label,
      zone: table.zone
    },
    staff_profiles: assignedStaff
      ? { display_name: assignedStaff.display_name, role: assignedStaff.role }
      : null
  };
  requests.unshift(request);
  return request;
}

export function listDemoMessages(conversationId: string) {
  return messages.filter((message) => message.conversation_id === conversationId);
}

export function listDemoRequests() {
  return requests;
}

export function listDemoStaff() {
  return demoStaff;
}

export function addDemoStaff(input: { displayName: string; role: StaffRole }) {
  const staff: StaffProfile = {
    id: crypto.randomUUID(),
    club_id: demoClubId,
    display_name: input.displayName,
    role: input.role,
    created_at: new Date().toISOString()
  };
  demoStaff.push(staff);
  return staff;
}

export function getDemoStaffById(id: string) {
  return demoStaff.find((staff) => staff.id === id) || null;
}

export function getLatestDemoRequestForConversation(conversationId: string) {
  return requests.find((item) => item.conversation_id === conversationId) || null;
}

export function getActiveDemoRequestForConversation(conversationId: string) {
  return requests.find(
    (item) =>
      item.conversation_id === conversationId &&
      item.status !== "resolved" &&
      item.status !== "cancelled"
  ) || null;
}

export function updateDemoRequest(id: string, status: RequestStatus, assignedTo?: string | null) {
  const request = requests.find((item) => item.id === id);
  if (!request) {
    return null;
  }

  request.status = status;
  if (assignedTo !== undefined) {
    const assignedStaff = assignedTo ? getDemoStaffById(assignedTo) : null;
    request.assigned_to = assignedTo;
    request.staff_profiles = assignedStaff
      ? { display_name: assignedStaff.display_name, role: assignedStaff.role }
      : null;
  }
  request.updated_at = new Date().toISOString();
  request.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  return request;
}

export function getDemoRequest(id: string) {
  return requests.find((item) => item.id === id) || null;
}
