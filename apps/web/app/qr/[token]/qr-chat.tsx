"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, Star } from "lucide-react";
import { publicApiRequest } from "@/lib/api/client";
import type { CommandMessage, CommandSupportRequest, PublicChatAvailability, PublicQrConversationState, PublicQrIntakeState } from "@/lib/auth/types";
import { createClosedVenueBody, createSendErrorBody, createUpdateErrorBody, createWelcomeBody } from "@/lib/chat-copy";
import { formatClientChatTimestamp } from "@/lib/chat-time";
import { reconcileGuestConversationMessages } from "@/lib/guest-chat-state";
import { shouldShowGuestIntroActions, shouldShowGuestMessageTimestamp } from "@/lib/guest-chat-ui";
import { createGuestSessionHeaders, getOrCreateGuestSessionId } from "@/lib/guest-session";
import { getPublicQrServicePoint } from "@/lib/public-qr-state";
import { connectGuestConversationEvents } from "@/lib/realtime-events";
import type { ClientRequestAction, SatisfactionRating } from "@/lib/request-actions";
import { createGuestRequestStatusLabel } from "@/lib/request-display";
import { supportQuickActions } from "@/lib/support-intake";

type LocalMessage = {
  id: string;
  sender: "guest" | "assistant" | "staff" | "system";
  body: string;
  createdAt: string;
  isPending?: boolean;
};

const satisfactionRatings: SatisfactionRating[] = [1, 2, 3, 4, 5];
const intakeRefreshMs = 5000;
const endedRequestStatuses = new Set(["RESOLVED", "CANCELLED"]);

function createWelcomeMessage(label: string): LocalMessage {
  return {
    id: "welcome",
    sender: "assistant",
    body: createWelcomeBody(label),
    createdAt: new Date().toISOString()
  };
}

function createGuestDraftMessage(body: string): LocalMessage {
  return {
    id: `draft-${crypto.randomUUID()}`,
    sender: "guest",
    body,
    createdAt: new Date().toISOString()
  };
}

function createPendingAssistantMessage(): LocalMessage {
  return {
    id: `pending-${crypto.randomUUID()}`,
    sender: "assistant",
    body: "",
    createdAt: new Date().toISOString(),
    isPending: true
  };
}

function createSessionEndedMessage(): LocalMessage {
  return {
    id: "session-ended",
    sender: "system",
    body: "This chat session has ended. Send a new message if you need anything else.",
    createdAt: new Date().toISOString()
  };
}

function createIntakeLoadErrorMessage(): LocalMessage {
  return {
    id: "service-point-load-error",
    sender: "system",
    body: "I could not load this service point. Please refresh, scan the QR code again, or speak to a team member nearby.",
    createdAt: new Date().toISOString()
  };
}

function normalizeMessage(message: CommandMessage): LocalMessage {
  return {
    id: message.id,
    sender: message.sender.toLowerCase() as LocalMessage["sender"],
    body: message.body,
    createdAt: message.createdAt
  };
}

function reconcileConversationMessages(input: {
  currentMessages: LocalMessage[];
  label: string;
  replyPending: boolean;
  serverMessages: CommandMessage[];
}) {
  return reconcileGuestConversationMessages({
    currentMessages: input.currentMessages,
    replyPending: input.replyPending,
    serverMessages: input.serverMessages.map(normalizeMessage),
    servicePointLabel: input.label,
    welcomeMessage: createWelcomeMessage(input.label)
  }) as LocalMessage[];
}

export function QrChat({ qrToken }: { qrToken: string }) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [request, setRequest] = useState<CommandSupportRequest | null>(null);
  const [servicePointLabel, setServicePointLabel] = useState("your location");
  const [venueName, setVenueName] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [chatAvailability, setChatAvailability] = useState<PublicChatAvailability | null>(null);
  const [guestSessionId, setGuestSessionId] = useState("");
  const [intakeLoaded, setIntakeLoaded] = useState(false);
  const [intakeError, setIntakeError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const conversationStorageKey = `qr-chat:${qrToken}:conversationId`;
  const sessionStorageKey = `qr-chat:${qrToken}:sessionId`;

  const statusText = useMemo(() => createGuestRequestStatusLabel(request?.status), [request]);
  const statusClassName = request
    ? `pill status-${request.status.toLowerCase()} priority-${request.priority.toLowerCase()}`
    : "pill";
  const canCancel = request && !["COMPLETED", "RESOLVED", "CANCELLED"].includes(request.status);
  const awaitingSatisfaction = request?.status === "COMPLETED";
  const chatClosed = chatAvailability?.isOpen === false;
  const showIntroActions = shouldShowGuestIntroActions({
    awaitingSatisfaction,
    chatClosed,
    messages,
    requestStatus: request?.status ?? null
  });

  const applyIntakeLoadError = useCallback(() => {
    setIntakeError(true);
    setIntakeLoaded(true);
    setServicePointLabel("Service point unavailable");
    setMessages((current) =>
      current.some((message) => message.id === "service-point-load-error") ? current : [createIntakeLoadErrorMessage()]
    );
  }, []);

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
    setGuestSessionId(getOrCreateGuestSessionId(sessionStorageKey));
  }, [conversationStorageKey, sessionStorageKey]);

  const applyClosedState = useCallback((label: string) => {
    resetGuestSession();
    setMessages([
      createWelcomeMessage(label),
      {
        id: "closed",
        sender: "system",
        body: createClosedVenueBody(),
        createdAt: new Date().toISOString()
      }
    ]);
  }, [resetGuestSession]);

  const applyEndedState = useCallback((label: string) => {
    resetGuestSession();
    setMessages([createWelcomeMessage(label), createSessionEndedMessage()]);
  }, [resetGuestSession]);

  useEffect(() => {
    setGuestSessionId(getOrCreateGuestSessionId(sessionStorageKey));
  }, [sessionStorageKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadIntake() {
      const result = await publicApiRequest<PublicQrIntakeState>(`/public/qr/${encodeURIComponent(qrToken)}`, {
        cache: "no-store"
      }).catch(() => null);

      if (!result || cancelled) {
        if (!result && !cancelled) {
          applyIntakeLoadError();
        }
        return;
      }

      const servicePoint = getPublicQrServicePoint(result);
      if (!servicePoint) {
        applyIntakeLoadError();
        return;
      }

      setIntakeError(false);
      setServicePointLabel(servicePoint.label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability);
      setIntakeLoaded(true);

      if (!result.chatAvailability.isOpen) {
        applyClosedState(servicePoint.label);
      } else if (!conversationId) {
        setMessages([createWelcomeMessage(servicePoint.label)]);
      }
    }

    void loadIntake();
    const interval = window.setInterval(() => void loadIntake(), intakeRefreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [applyClosedState, applyIntakeLoadError, conversationId, qrToken]);

  useEffect(() => {
    const storedConversationId = window.localStorage.getItem(conversationStorageKey);
    if (storedConversationId) {
      setConversationId(storedConversationId);
    }
  }, [conversationStorageKey]);

  useEffect(() => {
    if (conversationId) {
      window.localStorage.setItem(conversationStorageKey, conversationId);
    }
  }, [conversationId, conversationStorageKey]);

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
        `/public/qr/${encodeURIComponent(qrToken)}/conversations/${encodeURIComponent(activeConversationId)}`,
        {
          cache: "no-store",
          headers: createGuestSessionHeaders(guestSessionId)
        }
      ).catch(() => null);

      if (!result || cancelled) {
        return;
      }

      const servicePoint = getPublicQrServicePoint(result);
      const label = servicePoint?.label || servicePointLabel;
      setIntakeError(false);
      setServicePointLabel(label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability ?? null);
      setIntakeLoaded(true);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState(label);
        return;
      }

      if (result.request && endedRequestStatuses.has(result.request.status)) {
        applyEndedState(label);
        return;
      }

      setMessages((current) =>
        reconcileConversationMessages({
          currentMessages: current,
          label,
          replyPending: Boolean(result.replyPending),
          serverMessages: result.messages
        })
      );
      setRequest(result.request);
    }

    void loadConversation();
    const interval = window.setInterval(() => void loadConversation(), 3000);
    const disconnectRealtime = connectGuestConversationEvents({
      conversationId: activeConversationId,
      guestSessionId,
      qrToken,
      onEvent: () => {
        void loadConversation();
      }
    });

    return () => {
      cancelled = true;
      disconnectRealtime();
      window.clearInterval(interval);
    };
  }, [applyClosedState, applyEndedState, conversationId, guestSessionId, qrToken, servicePointLabel]);

  async function sendMessage(nextMessage?: string) {
    const body = (nextMessage || input).trim();
    if (!body || isSending || chatClosed || !guestSessionId || !intakeLoaded || intakeError) {
      return;
    }

    setInput("");
    setIsSending(true);
    setMessages((current) => [...current.filter((message) => !message.isPending), createGuestDraftMessage(body), createPendingAssistantMessage()]);

    try {
      const result = await publicApiRequest<PublicQrConversationState>(`/public/qr/${encodeURIComponent(qrToken)}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: body, conversationId, sessionId: guestSessionId })
      });

      const servicePoint = getPublicQrServicePoint(result);
      const label = servicePoint?.label || servicePointLabel;
      setIntakeError(false);
      setServicePointLabel(label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability ?? null);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState(label);
        return;
      }

      if (result.request && endedRequestStatuses.has(result.request.status)) {
        applyEndedState(label);
        return;
      }

      setMessages((current) =>
        reconcileConversationMessages({
          currentMessages: current,
          label,
          replyPending: Boolean(result.replyPending),
          serverMessages: result.messages
        })
      );
      setConversationId(result.conversationId);
      setRequest(result.request);
    } catch {
      setMessages((current) => [
        ...current.filter((message) => !message.isPending),
        {
          id: crypto.randomUUID(),
          sender: "system",
          body: createSendErrorBody(),
          createdAt: new Date().toISOString()
        }
      ]);
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
        applyEndedState(servicePointLabel);
        return;
      }

      if (result.message) {
        setMessages((current) => [
          ...current,
          ...(reconcileGuestConversationMessages({
            currentMessages: [],
            replyPending: false,
            serverMessages: [normalizeMessage(result.message as CommandMessage)],
            servicePointLabel,
            welcomeMessage: createWelcomeMessage(servicePointLabel)
          }).slice(1) as LocalMessage[])
        ]);
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: "system",
          body: createUpdateErrorBody(),
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <section className="grid qr-chat-shell">
      <div className="panel chat">
        <div className="chat-header">
          <div>
            <h1>{intakeLoaded ? servicePointLabel : "Loading service point"}</h1>
            <div className="meta">{chatClosed ? "Closed for now" : venueName ? `${venueName} support with Lily` : "Guest support with Lily"}</div>
          </div>
          <span className={statusClassName}>{statusText}</span>
        </div>

        <div ref={messagesRef} className="chat-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div className="message-cluster" key={message.id}>
              <div className={`bubble ${message.sender}${message.isPending ? " pending" : ""}`}>
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
                      disabled={isSending || intakeError}
                      key={`intro-${action.id}`}
                      onClick={() => void sendMessage(action.prompt)}
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
            disabled={chatClosed || !intakeLoaded || intakeError}
            value={input}
          />
          <button className="button" disabled={isSending || chatClosed || !intakeLoaded || intakeError} type="submit" title="Send message">
            <Send size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}
