export type OpenRequestGuestMessageIntent = "courtesy" | "conversation" | "new_request";

const courtesyOnlyMessages = new Set([
  "alright",
  "cheers",
  "cool",
  "got it",
  "great",
  "great thanks",
  "ok",
  "okay",
  "perfect",
  "thank you",
  "thanks",
  "thanks lily",
  "thanks so much",
  "thank you so much",
  "ty"
]);

const greetingOnlyMessages = new Set([
  "good afternoon",
  "good evening",
  "good morning",
  "greetings",
  "hello",
  "hey",
  "hi",
  "hiya",
  "how are you",
  "how are you doing",
  "how's it going",
  "howdy",
  "yo"
]);

function normalizeGuestText(message: string) {
  return message
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyOpenRequestGuestMessage(message: string): OpenRequestGuestMessageIntent {
  const normalized = normalizeGuestText(message);

  if (!normalized) {
    return "courtesy";
  }

  if (courtesyOnlyMessages.has(normalized)) {
    return "courtesy";
  }

  if (/^(thank you|thanks|cheers)\s+(again|lily|so much|very much)$/.test(normalized)) {
    return "courtesy";
  }

  if (greetingOnlyMessages.has(normalized)) {
    return "conversation";
  }

  const asksForStaffAction =
    /\b(need|needs|bring|send|help|assist|please|can i get|can we get|could i get|could we get|would like|order|drink|water|ice|food|bill|check|pay|missing|wrong|spill|broken|dirty|clean|waiting|lost|allerg|medical|injur|hurt|fight|security|harass|fire|smoke|emergency)\b/i.test(
      normalized
    );

  if (!asksForStaffAction) {
    return "conversation";
  }

  return "new_request";
}
