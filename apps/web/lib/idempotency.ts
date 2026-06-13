const pendingKeys = new Map<string, { expiresAt: number }>();

export function createIdempotencyKey(): string {
  return `idem-${Date.now()}-${crypto.randomUUID()}`;
}

export function claimIdempotencyKey(key: string): boolean {
  if (pendingKeys.has(key)) {
    return false;
  }
  pendingKeys.set(key, { expiresAt: Date.now() + 300_000 });
  return true;
}

export function releaseIdempotencyKey(key: string): void {
  pendingKeys.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingKeys) {
    if (now > entry.expiresAt) {
      pendingKeys.delete(key);
    }
  }
}, 60_000);
