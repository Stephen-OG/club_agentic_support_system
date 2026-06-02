import { normalizeGuestChatMessages } from "./guest-chat-messages";

export type GuestChatMessage = {
  id: string;
  sender: "guest" | "assistant" | "staff" | "system" | string;
  body: string;
  createdAt: string;
  isPending?: boolean;
};

export function createPendingGuestAssistantMessage(now = new Date()) {
  return {
    id: `pending-${crypto.randomUUID()}`,
    sender: "assistant",
    body: "",
    createdAt: now.toISOString(),
    isPending: true
  } satisfies GuestChatMessage;
}

export function reconcileGuestConversationMessages(input: {
  currentMessages: GuestChatMessage[];
  replyPending: boolean;
  serverMessages: GuestChatMessage[];
  servicePointLabel: string;
  welcomeMessage: GuestChatMessage;
}) {
  const normalizedMessages = normalizeGuestChatMessages(input.serverMessages, input.servicePointLabel);
  const hasPending = input.currentMessages.some((message) => message.isPending);
  const pendingMessage = input.currentMessages.find((message) => message.isPending) ?? createPendingGuestAssistantMessage();
  const nextMessages = [input.welcomeMessage, ...normalizedMessages];

  if (!input.replyPending) {
    return nextMessages;
  }

  const hasServerReplyAfterNewestGuest = hasReplyAfterNewestGuest(normalizedMessages);
  if (hasServerReplyAfterNewestGuest) {
    return nextMessages;
  }

  return [...nextMessages.filter((message) => !message.isPending), hasPending ? pendingMessage : createPendingGuestAssistantMessage()];
}

function hasReplyAfterNewestGuest(messages: GuestChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const sender = messages[index]?.sender.toLowerCase();
    if (sender === "guest") {
      return false;
    }

    if (sender === "assistant" || sender === "staff" || sender === "system") {
      continue;
    }
  }

  return true;
}
