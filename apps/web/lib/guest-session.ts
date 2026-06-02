type SessionStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function createGuestSessionId(randomValue: string) {
  return `guest_${randomValue.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function defaultRandomValue() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function browserStorage(): SessionStorageLike | null {
  const scope = globalThis as typeof globalThis & {
    window?: {
      localStorage?: SessionStorageLike;
    };
  };

  return scope.window?.localStorage ?? null;
}

export function getOrCreateGuestSessionId(
  storageKey: string,
  storage: SessionStorageLike | null = browserStorage(),
  randomValue: () => string = defaultRandomValue
) {
  const existing = storage?.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const next = createGuestSessionId(randomValue());
  storage?.setItem(storageKey, next);
  return next;
}

export function createGuestSessionHeaders(sessionId: string): Record<string, string> {
  return sessionId ? { "X-Guest-Session": sessionId } : {};
}
