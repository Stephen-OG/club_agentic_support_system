export type OpenRequestGuestMessageIntent = "courtesy" | "new_request";

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

  return "new_request";
}
