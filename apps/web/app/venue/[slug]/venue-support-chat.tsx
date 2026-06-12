"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Send, Sparkles, Star } from "lucide-react";
import { publicApiRequest } from "@/lib/api/client";
import type {
  CommandMessage,
  CommandSupportRequest,
  PublicChatAvailability,
  PublicQrConversationState,
  PublicVenueSummary
} from "@/lib/auth/types";
import { createClosedVenueBody, createSendErrorBody, createUpdateErrorBody, createVenueWelcomeBody } from "@/lib/chat-copy";
import { formatClientChatTimestamp } from "@/lib/chat-time";
import { normalizeGuestChatMessages } from "@/lib/guest-chat-messages";
import { reconcileGuestConversationMessages } from "@/lib/guest-chat-state";
import { shouldShowGuestIntroActions, shouldShowGuestMessageTimestamp } from "@/lib/guest-chat-ui";
import { createGuestSessionHeaders, getOrCreateGuestSessionId } from "@/lib/guest-session";
import { connectGuestConversationEvents } from "@/lib/realtime-events";
import type { ClientRequestAction, SatisfactionRating } from "@/lib/request-actions";
import { createGuestRequestStatusLabel } from "@/lib/request-display";
import { supportLocationOptions, supportQuickActions } from "@/lib/support-intake";

const satisfactionRatings: SatisfactionRating[] = [1, 2, 3, 4, 5];
const intakeRefreshMs = 5000;
const endedRequestStatuses = new Set(["RESOLVED", "CANCELLED"]);
type LocalVenueMessage = CommandMessage & { isPending?: boolean };

function createLocalMessage(body: string, sender: CommandMessage["sender"]): LocalVenueMessage {
  return {
    body,
    conversationId: "",
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    metadata: null,
    requestId: null,
    sender,
    qrPointId: "",
    venueId: ""
  };
}

function createPendingAssistantMessage(): LocalVenueMessage {
  return {
    ...createLocalMessage("", "ASSISTANT"),
    id: `pending-${crypto.randomUUID()}`,
    isPending: true
  };
}

function createSessionEndedMessage() {
  return createLocalMessage("This chat session has ended. Send a new message if you need anything else.", "SYSTEM");
}

function createWelcomeMessage(venueName: string) {
  return createLocalMessage(createVenueWelcomeBody(venueName), "ASSISTANT");
}

function normalizeVenueMessages(messages: CommandMessage[], venueName: string) {
  return normalizeGuestChatMessages(messages, venueName) as LocalVenueMessage[];
}

function reconcileVenueConversationMessages(input: {
  currentMessages: LocalVenueMessage[];
  replyPending: boolean;
  serverMessages: CommandMessage[];
  venueName: string;
}) {
  return reconcileGuestConversationMessages({
    currentMessages: input.currentMessages,
    replyPending: input.replyPending,
    serverMessages: normalizeVenueMessages(input.serverMessages, input.venueName),
    servicePointLabel: input.venueName,
    welcomeMessage: createWelcomeMessage(input.venueName)
  }) as LocalVenueMessage[];
}

export function VenueSupportChat({ venueSlug }: { venueSlug: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [messages, setMessages] = useState<LocalVenueMessage[]>([]);
  const [request, setRequest] = useState<CommandSupportRequest | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [chatAvailability, setChatAvailability] = useState<PublicChatAvailability | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState("");
  const chatClosed = chatAvailability?.isOpen === false;
  const formRef = useRef<HTMLFormElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const conversationStorageKey = `venue-support:${venueSlug}:conversationId`;
  const sessionStorageKey = `venue-support:${venueSlug}:sessionId`;
  const statusText = useMemo(() => createGuestRequestStatusLabel(request?.status), [request]);
  const statusClassName = request
    ? `pill status-${request.status.toLowerCase()} priority-${request.priority.toLowerCase()}`
    : "pill";
  const canCancel = request && !["COMPLETED", "RESOLVED", "CANCELLED"].includes(request.status);
  const awaitingSatisfaction = request?.status === "COMPLETED";
  const showIntroActions = shouldShowGuestIntroActions({
    awaitingSatisfaction,
    chatClosed,
    messages,
    requestStatus: request?.status ?? null
  });

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    messagesElement?.scrollTo({ top: messagesElement.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const resetGuestSession = useCallback(() => {
    window.localStorage.removeItem(conversationStorageKey);
    window.localStorage.removeItem(sessionStorageKey);
    setConversationId(null);
    setRequest(null);
    setLocationLabel("");
    setGuestSessionId(getOrCreateGuestSessionId(sessionStorageKey));
  }, [conversationStorageKey, sessionStorageKey]);

  const applyClosedState = useCallback(() => {
    resetGuestSession();
    setMessages([createLocalMessage(createClosedVenueBody(), "SYSTEM")]);
  }, [resetGuestSession]);

  const applyEndedState = useCallback((name: string) => {
    resetGuestSession();
    setMessages([createWelcomeMessage(name), createSessionEndedMessage()]);
  }, [resetGuestSession]);

  useEffect(() => {
    setGuestSessionId(getOrCreateGuestSessionId(sessionStorageKey));
  }, [sessionStorageKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadVenue() {
      const result = await publicApiRequest<{ chatAvailability: PublicChatAvailability; venue: PublicVenueSummary }>(`/public/qr/venues/${encodeURIComponent(venueSlug)}`, {
        cache: "no-store"
      }).catch(() => null);

      if (!result || cancelled) {
        return;
      }

      setVenueName(result.venue.name);
      setChatAvailability(result.chatAvailability);

      if (!result.chatAvailability.isOpen) {
        applyClosedState();
      } else if (!conversationId) {
        setMessages([createWelcomeMessage(result.venue.name)]);
      }
    }

    void loadVenue();
    const interval = window.setInterval(() => void loadVenue(), intakeRefreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [applyClosedState, conversationId, venueSlug]);

  useEffect(() => {
    const stored = window.localStorage.getItem(conversationStorageKey);
    if (stored) {
      setConversationId(stored);
    }
  }, [conversationStorageKey]);

  useEffect(() => {
    if (conversationId) {
      window.localStorage.setItem(conversationStorageKey, conversationId);
    }
  }, [conversationId, conversationStorageKey]);

  // --- poll handler ---
  useEffect(() => {
    if (!conversationId || !guestSessionId) {
      return;
    }

    let cancelled = false;
    const activeConversationId = conversationId;

    async function loadConversation() {
      if (isSendingRef.current) {
        return;
      }

      const result = await publicApiRequest<PublicQrConversationState>(
        `/public/qr/venues/${encodeURIComponent(venueSlug)}/conversations/${encodeURIComponent(activeConversationId)}`,
        {
          cache: "no-store",
          headers: createGuestSessionHeaders(guestSessionId)
        }
      ).catch(() => null);

      if (!result || cancelled) {
        return;
      }

      setVenueName((current) => result.venue?.name ?? current);
      setChatAvailability(result.chatAvailability ?? null);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState();
        return;
      }

      const name = result.venue?.name ?? venueName ?? "the venue";
      if (result.request && endedRequestStatuses.has(result.request.status)) {
        applyEndedState(name);
        return;
      }

      setMessages((current) =>
        reconcileVenueConversationMessages({
          currentMessages: current,
          replyPending: Boolean(result.replyPending),
          serverMessages: result.messages,
          venueName: name
        })
      );
      setRequest(result.request);
    }

    void loadConversation();
    const interval = window.setInterval(() => void loadConversation(), 3000);
    const disconnectRealtime = connectGuestConversationEvents({
      conversationId: activeConversationId,
      guestSessionId,
      qrToken: `venue_support_${venueSlug}`,
      onEvent: () => {
        void loadConversation();
      }
    });

    return () => {
      cancelled = true;
      disconnectRealtime();
      window.clearInterval(interval);
    };
  }, [applyClosedState, applyEndedState, conversationId, guestSessionId, venueName, venueSlug]);

  async function sendMessage(nextMessage?: string, quickAction?: string) {
    const body = (nextMessage || input).trim();
    if (!body || isSending || chatClosed || !guestSessionId) {
      return;
    }

    setInput("");
    setIsSending(true);
    setMessages((current) => [...current.filter((message) => !message.isPending), createLocalMessage(body, "GUEST"), createPendingAssistantMessage()]);

    try {
      const result = await publicApiRequest<PublicQrConversationState>(
        `/public/qr/venues/${encodeURIComponent(venueSlug)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            locationLabel: locationLabel.trim() || undefined,
            message: body,
            quickAction,
            sessionId: guestSessionId
          })
        }
      );

      setConversationId(result.conversationId);
      setVenueName((current) => result.venue?.name ?? current);
      setChatAvailability(result.chatAvailability ?? null);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState();
        return;
      }

      const name = result.venue?.name ?? venueName ?? "the venue";
      if (result.request && endedRequestStatuses.has(result.request.status)) {
        applyEndedState(name);
        return;
      }

      setMessages((current) =>
        reconcileVenueConversationMessages({
          currentMessages: current,
          replyPending: Boolean(result.replyPending),
          serverMessages: result.messages,
          venueName: name
        })
      );
      setRequest(result.request);
    } catch {
      setMessages((current) => [...current.filter((message) => !message.isPending), createLocalMessage(createSendErrorBody(), "SYSTEM")]);
    } finally {
      setIsSending(false);
    }
  }

  async function updateRequest(action: ClientRequestAction, rating?: SatisfactionRating) {
    if (!request || isSending || !guestSessionId) {
      return;
    }

    setIsSending(true);

    try {
      const result = await publicApiRequest<{
        request: CommandSupportRequest;
        message?: CommandMessage;
      }>(`/public/requests/${request.id}/action`, {
        method: "PATCH",
        body: JSON.stringify({ action, rating, sessionId: guestSessionId })
      });

      setRequest(result.request);
      if (endedRequestStatuses.has(result.request.status)) {
        applyEndedState(venueName ?? "the venue");
        return;
      }

      if (result.message) {
        setMessages((current) => [...current, ...normalizeVenueMessages([result.message as CommandMessage], venueName ?? "the venue")]);
      }
    } catch {
      setMessages((current) => [...current, createLocalMessage(createUpdateErrorBody(), "SYSTEM")]);
    } finally {
      setIsSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <section className="grid two-col venue-support-layout">
      <div className="panel chat">
        <div className="chat-header">
          <div>
            <strong>{venueName || "Venue support"}</strong>
            <div className="meta">
              {chatClosed ? "Closed for now" : locationLabel ? `Lily has your location as ${locationLabel}` : "Tell Lily where you are and what you need"}
            </div>
          </div>
          <span className={statusClassName}>{statusText}</span>
        </div>
        <div ref={messagesRef} className="chat-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div className="message-cluster" key={message.id}>
              <div className={`bubble ${message.sender.toLowerCase()}${message.isPending ? " pending" : ""}`}>
                {message.isPending ? (
                  <span className="typing-loader" aria-label="Lily is typing">
                    <span className="typing-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="typing-label">Lily is routing this</span>
                  </span>
                ) : (
                  message.body
                )}
              </div>
              {shouldShowGuestMessageTimestamp(message) ? <time className="message-timestamp" dateTime={message.createdAt}>{formatClientChatTimestamp(message.createdAt)}</time> : null}
              {index === 0 && showIntroActions ? (
                <div className="quick-actions intro-actions" aria-label="Common requests">
                  {supportQuickActions.map((action) => (
                    <button
                      className={action.id === "safety" ? "urgent-action" : undefined}
                      disabled={isSending}
                      key={`intro-${action.id}`}
                      onClick={() => void sendMessage(action.prompt, action.id)}
                      type="button"
                    >
                      <span className="quick-action-icon">
                        <Sparkles size={14} />
                      </span>
                      <span>
                        <strong>{action.label}</strong>
                        <small>{action.prompt}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {awaitingSatisfaction ? (
          <div className="guest-actions satisfaction-panel">
            <div className="satisfaction-copy">
              <strong>How satisfied are you?</strong>
              <span>Tap a rating so we know how the visit is going.</span>
            </div>
            <div className="rating-options" aria-label="Satisfaction rating">
              {satisfactionRatings.map((rating) => (
                <button
                  aria-label={`Rate ${rating} out of 5`}
                  className="rating-button"
                  disabled={isSending}
                  key={rating}
                  onClick={() => void updateRequest("confirm_resolved", rating)}
                  type="button"
                >
                  <Star size={15} />
                  {rating}
                </button>
              ))}
            </div>
            <button className="button ghost" disabled={isSending} onClick={() => void updateRequest("not_satisfied")} type="button">
              Still need help
            </button>
          </div>
        ) : canCancel ? (
          <div className="guest-actions">
            <button className="button ghost cancel-request-button" disabled={isSending} onClick={() => void updateRequest("cancel")} type="button">
              Cancel request
            </button>
          </div>
        ) : null}
        <form ref={formRef} className="composer" onSubmit={onSubmit}>
          <textarea
            aria-label="Message"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            placeholder="Tell us what you need..."
            disabled={chatClosed}
            value={input}
          />
          <button className="button" disabled={isSending || chatClosed} type="submit" title="Send message">
            <Send size={18} />
          </button>
        </form>
      </div>
      <aside className="panel support-panel">
        <div className="eyebrow">Support</div>
        <h1 className="page-title compact-title">How can we help?</h1>
        <label className="venue-location-input">
          <span>
            <MapPin size={15} /> Where are you?
          </span>
          <input
            onChange={(event) => setLocationLabel(event.target.value)}
            placeholder="Table 14, bar area, VIP booth..."
            disabled={chatClosed}
            value={locationLabel}
          />
        </label>
        <div className="location-chips">
          {supportLocationOptions.map((option) => (
            <button disabled={chatClosed} key={option} onClick={() => setLocationLabel(option)} type="button">
              {option}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
