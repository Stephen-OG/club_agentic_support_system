import { getValidAccessToken } from "./api/client";
import type { AppAuthClient } from "./app-auth/browser";

const realtimeApiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export type ClientDomainEvent = {
  type: string;
  venueId?: string;
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  occurredAt?: string;
};

type ConnectOptions = {
  onEvent: (event: ClientDomainEvent) => void;
  onError?: () => void;
};

type StaffConnectOptions = ConnectOptions & {
  authClient: AppAuthClient;
  venueId: string;
};

type GuestConnectOptions = ConnectOptions & {
  conversationId: string;
  guestSessionId: string;
  qrToken: string;
};

export function shouldRefreshForRealtimeEvent(event: Pick<ClientDomainEvent, "type">) {
  return event.type === "request.created" || event.type === "request.updated" || event.type === "message.created";
}

export function sseReconnectDelayMs(attempt: number) {
  return Math.min(5000, 500 * 2 ** attempt);
}

export function parseSseMessages(text: string) {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const dataLines = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim());

      if (!dataLines.length) {
        return null;
      }

      return JSON.parse(dataLines.join("\n")) as ClientDomainEvent;
    })
    .filter((event): event is ClientDomainEvent => Boolean(event));
}

export function connectStaffVenueEvents(options: StaffConnectOptions) {
  const abortController = new AbortController();

  void (async () => {
    const token = await getValidAccessToken(options.authClient);

    if (!token) {
      options.onError?.();
      return;
    }

    await connectSseStreamWithReconnect(`${realtimeApiBaseUrl}/venues/${encodeURIComponent(options.venueId)}/events`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abortController.signal,
      onEvent: options.onEvent,
      onError: options.onError
    });
  })();

  return () => abortController.abort();
}

export function connectGuestConversationEvents(options: GuestConnectOptions) {
  const abortController = new AbortController();

  void connectSseStreamWithReconnect(
    `${realtimeApiBaseUrl}/public/qr/${encodeURIComponent(options.qrToken)}/conversations/${encodeURIComponent(options.conversationId)}/events`,
    {
      headers: { "X-Guest-Session": options.guestSessionId },
      signal: abortController.signal,
      onEvent: options.onEvent,
      onError: options.onError
    }
  );

  return () => abortController.abort();
}

async function connectSseStreamWithReconnect(input: string, options: ConnectOptions & { headers: Record<string, string>; signal: AbortSignal }) {
  let attempt = 0;

  while (!options.signal.aborted) {
    await connectSseStream(input, options);
    if (options.signal.aborted) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, sseReconnectDelayMs(attempt)));
    attempt += 1;
  }
}

async function connectSseStream(input: string, options: ConnectOptions & { headers: Record<string, string>; signal: AbortSignal }) {
  try {
    const response = await (globalThis.fetch as typeof fetch)(input, {
      cache: "no-store",
      headers: options.headers,
      signal: options.signal
    } as RequestInit);

    if (!response.ok || !response.body) {
      options.onError?.();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!options.signal.aborted) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      buffer += decoder.decode(next.value, { stream: true });
      const boundary = buffer.lastIndexOf("\n\n");

      if (boundary === -1) {
        continue;
      }

      const ready = buffer.slice(0, boundary + 2);
      buffer = buffer.slice(boundary + 2);

      for (const event of parseSseMessages(ready)) {
        if (shouldRefreshForRealtimeEvent(event)) {
          options.onEvent(event);
        }
      }
    }
  } catch {
    if (!options.signal.aborted) {
      options.onError?.();
    }
  }
}
