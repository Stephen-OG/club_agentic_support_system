import type { RequestStatus } from "./request-workflow";

export function createGuestStatusMessage(status: RequestStatus) {
  const messages: Partial<Record<RequestStatus, string>> = {
    assigned: "A team member has been assigned to your request.",
    declined: "That team member could not take it, so we are sending it back for another teammate to pick up.",
    in_progress: "The team is working on this now.",
    completed: "The team marked this complete. How did it go?",
    resolved: "Thank you for confirming. We have closed this request.",
    cancelled: "No problem, this request is cancelled. Send another message if you need anything else.",
    escalated: "We have escalated this so the right team can respond quickly."
  };

  return messages[status];
}
