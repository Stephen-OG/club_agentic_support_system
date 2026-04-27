import type { ClubTable, Message, RequestStatus, SupportRequest } from "@/lib/types";

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

export function addDemoRequest(input: Omit<SupportRequest, "id" | "created_at" | "updated_at" | "resolved_at">) {
  const table = getDemoTableById(input.table_id);
  const request: SupportRequest = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    club_tables: {
      label: table.label,
      zone: table.zone
    }
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

export function updateDemoRequest(id: string, status: RequestStatus) {
  const request = requests.find((item) => item.id === id);
  if (!request) {
    return null;
  }

  request.status = status;
  request.updated_at = new Date().toISOString();
  request.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  return request;
}

export function getDemoRequest(id: string) {
  return requests.find((item) => item.id === id) || null;
}
