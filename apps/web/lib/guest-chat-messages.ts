type GuestVisibleSender = "assistant" | "staff" | "system" | "guest";

export type GuestVisibleMessage = {
  body: string;
  sender: GuestVisibleSender | string;
};

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const servicePointTokenPattern = "sp_[a-z0-9_]+_[a-f0-9]{16,}";
const internalIdentifierRegex = new RegExp(`\\b(?:${uuidPattern}|${servicePointTokenPattern})\\b`, "gi");

function meaningfulLocation(label: string) {
  const trimmed = label.trim();

  if (!trimmed || internalIdentifierRegex.test(trimmed)) {
    internalIdentifierRegex.lastIndex = 0;
    return null;
  }

  internalIdentifierRegex.lastIndex = 0;
  return trimmed;
}

export function sanitizeGuestChatBody(body: string, servicePointLabel: string) {
  const location = meaningfulLocation(servicePointLabel);
  const notifiedBase = "Of course, I have let the team know";
  const notifiedWithoutLocation = `${notifiedBase}.`;
  const followupWithoutLocation = "Got it, I added that to your open request so the team has the full picture.";
  let nextBody = body.trim();

  nextBody = nextBody.replace(new RegExp(`Of course\\. I have notified the team for ${uuidPattern}\\.`, "gi"), () =>
    location ? `${notifiedBase} for ${location}.` : notifiedWithoutLocation
  );
  nextBody = nextBody.replace(new RegExp(`Thanks, I added that to your open request for ${uuidPattern}\\.`, "gi"), followupWithoutLocation);
  nextBody = nextBody.replace(/^Of course\. I have notified the team\.$/i, notifiedWithoutLocation);
  nextBody = nextBody.replace(/^Thanks, I added that to your open request\.$/i, followupWithoutLocation);
  nextBody = nextBody.replace(internalIdentifierRegex, location || "your location");

  return nextBody;
}

export function normalizeGuestChatMessages<T extends GuestVisibleMessage>(messages: T[], servicePointLabel: string) {
  const normalized: T[] = [];
  const seenStatusBodies = new Set<string>();

  for (const message of messages) {
    const body = sanitizeGuestChatBody(message.body, servicePointLabel);
    const sender = message.sender.toLowerCase();

    if (/^The team has acknowledged your request and will help from here\.$/i.test(body)) {
      continue;
    }

    if ((sender === "assistant" || sender === "system") && seenStatusBodies.has(body)) {
      continue;
    }

    if (sender === "assistant" || sender === "system") {
      seenStatusBodies.add(body);
    }

    normalized.push({ ...message, body });
  }

  return normalized;
}
