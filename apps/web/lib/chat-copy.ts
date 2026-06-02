import { createGuestStatusMessage as createSharedGuestStatusMessage } from "@guestos/shared";

export type RequestPriority = "low" | "normal" | "high" | "urgent";
export type RequestStatus =
  | "new"
  | "acknowledged"
  | "assigned"
  | "declined"
  | "in_progress"
  | "completed"
  | "resolved"
  | "cancelled"
  | "escalated";

export function createWelcomeBody(tableLabel: string) {
  return `Hi, I'm Lily. You're chatting from ${tableLabel}. What can I help with?`;
}

export function createVenueWelcomeBody(venueName: string) {
  return `Hi, I'm Lily, your ${venueName} concierge. Tell me where you are and what you need, and I will get it to the team.`;
}

export function createFollowupReply() {
  return "Got it, I added that to your open request so the team has the full picture.";
}

export function createServiceRecoveryReply() {
  return "Thanks for letting us know. I have reopened this for the team, and they will keep working on it.";
}

export function createSatisfactionReply(rating: number) {
  return `Thank you. You rated this service ${rating}/5, and we really appreciate the feedback.`;
}

export function createCancelledReply() {
  return "No problem, I have cancelled that request. Send another message if you need anything else.";
}

export function createAssistantReply(priority: RequestPriority, tableLabel: string) {
  if (priority === "urgent") {
    return `I have alerted the team that ${tableLabel} needs urgent support. Please stay where you are if it is safe to do so.`;
  }

  if (priority === "high") {
    return `Thanks for telling us. I have flagged this for the team at ${tableLabel} so they can help as soon as they can.`;
  }

  return `Of course, I have let the team know for ${tableLabel}.`;
}

export function createSendErrorBody() {
  return "I could not send that just now. Please try again, or speak to a team member nearby.";
}

export function createClosedVenueBody() {
  return "Lily is offline while the venue is closed. Please come back during opening hours or speak to a team member nearby if it is urgent.";
}

export function createUpdateErrorBody() {
  return "I could not update that request just now. Please try again, or speak to a team member nearby.";
}

export function createGuestStatusMessage(status: RequestStatus) {
  return createSharedGuestStatusMessage(status);
}
