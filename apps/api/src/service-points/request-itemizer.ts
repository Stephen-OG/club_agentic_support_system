const staffActionPattern =
  /\b(need|needs|bring|send|help|assist|please|can i get|can we get|could i get|could we get|would like|order|drink|water|ice|food|bill|check|pay|missing|wrong|spill|broken|dirty|clean|waiting|waited|allerg|medical|injur|hurt|fight|security|harass|fire|smoke|emergency)\b/i;

export function itemizeGuestRequestMessage(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/\s+(?:and\s+(?:i\s+)?(?:also\s+)?(?:said\s+)?|also\s+|plus\s+)/i)
    .map((part) => part.replace(/^(?:i\s+also\s+said\s+|i\s+also\s+|also\s+said\s+|said\s+)/i, ""))
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2 || parts.some((part) => !staffActionPattern.test(part))) {
    return [normalized];
  }

  return parts;
}
