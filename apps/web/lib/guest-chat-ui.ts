export type GuestChatUiMessage = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
  isPending?: boolean;
};

export function shouldShowGuestIntroActions(input: {
  awaitingSatisfaction: boolean;
  chatClosed: boolean;
  messages: GuestChatUiMessage[];
  requestStatus?: string | null;
}) {
  if (input.chatClosed || input.awaitingSatisfaction || input.requestStatus) {
    return false;
  }

  return !input.messages.some((message) => message.sender.toLowerCase() === "guest" || message.isPending);
}

export function shouldShowGuestMessageTimestamp(message: GuestChatUiMessage) {
  return message.id !== "welcome" && !message.isPending;
}
