import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSignedInRouteAction } from "./auth/session-route-policy";
import type { CommandSupportRequest, CommandUser } from "./auth/types";
import { createGuestSessionHeaders, getOrCreateGuestSessionId } from "./guest-session";
import { reconcileGuestConversationMessages, type GuestChatMessage } from "./guest-chat-state";
import { getStaffNextStatus, getStaffQueueBucket, summarizeStaffQueueBuckets } from "./staff-workflow";

describe("MVP smoke path", () => {
  it("carries a staff user from login through QR chat into the active staff queue", () => {
    const staffUser = buildUser("staff");
    assert.deepEqual(getSignedInRouteAction({ user: staffUser, userMetadata: null }), { kind: "redirect", path: "/staff" });

    const storage = memoryStorage();
    const sessionId = getOrCreateGuestSessionId("madupe:qr:table-12", storage, () => "table-12-session");
    assert.equal(sessionId, "guest_table_12_session");
    assert.deepEqual(createGuestSessionHeaders(sessionId), { "X-Guest-Session": "guest_table_12_session" });

    const request = buildRequest({ conversationId: "conversation_1", status: "NEW" });
    const serverMessages: GuestChatMessage[] = [
      {
        id: "message_guest_1",
        sender: "guest",
        body: "Can someone bring water to table 12?",
        createdAt: "2026-06-05T12:00:00.000Z"
      }
    ];
    const pendingAssistantMessage: GuestChatMessage = {
      id: "pending-assistant-1",
      sender: "assistant",
      body: "",
      createdAt: "2026-06-05T12:00:01.000Z",
      isPending: true
    };

    const guestChat = reconcileGuestConversationMessages({
      currentMessages: [pendingAssistantMessage],
      replyPending: true,
      serverMessages,
      servicePointLabel: "Table 12",
      welcomeMessage: {
        id: "welcome",
        sender: "assistant",
        body: "Hi, I am Lily. How can I help?",
        createdAt: "2026-06-05T11:59:59.000Z"
      }
    });

    assert.equal(guestChat.at(-1)?.id, "pending-assistant-1");
    assert.equal(getStaffQueueBucket(request.status), "active");
    assert.equal(getStaffNextStatus(request.status), "ACKNOWLEDGED");
    assert.deepEqual(summarizeStaffQueueBuckets([request]), { activeCount: 1, completedCount: 0 });
  });
});

function buildUser(role: CommandUser["memberships"][number]["role"]): CommandUser {
  return {
    id: `user_${role}`,
    authUserId: `auth_${role}`,
    displayName: `MVP ${role}`,
    email: `${role}@example.com`,
    memberships: [
      {
        id: `membership_${role}`,
        role,
        organizationId: "workspace_1",
        venueId: "venue_1",
        organization: { id: "workspace_1", name: "Workspace", slug: "workspace" },
        venue: { id: "venue_1", name: "Main Room", slug: "main-room" }
      }
    ]
  };
}

function buildRequest(input: Pick<CommandSupportRequest, "conversationId" | "status">): CommandSupportRequest {
  return {
    id: "request_1",
    venueId: "venue_1",
    qrPointId: "service_point_1",
    conversationId: input.conversationId,
    assignedToId: null,
    title: "Guest support request",
    category: "general",
    summary: "Can someone bring water to table 12?",
    priority: "NORMAL",
    deterministicPriority: "NORMAL",
    aiPriority: null,
    status: input.status,
    createdAt: "2026-06-05T12:00:00.000Z",
    updatedAt: "2026-06-05T12:00:00.000Z",
    acknowledgedAt: null,
    completedAt: null,
    resolvedAt: null
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}
