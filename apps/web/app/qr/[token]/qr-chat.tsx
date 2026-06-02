"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, Star } from "lucide-react";
import { publicApiRequest } from "@/lib/api/client";
import type { CommandMessage, CommandSupportRequest, PublicChatAvailability, PublicQrConversationState, PublicQrIntakeState } from "@/lib/auth/types";
import { createClosedVenueBody, createSendErrorBody, createUpdateErrorBody, createWelcomeBody } from "@/lib/chat-copy";
import { reconcileGuestConversationMessages } from "@/lib/guest-chat-state";
import { createGuestSessionHeaders, getOrCreateGuestSessionId } from "@/lib/guest-session";
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
  const [servicePointLabel, setServicePointLabel] = useState("this QR point");
  const [venueName, setVenueName] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>(() => [createWelcomeMessage("this QR point")]);
  const [chatAvailability, setChatAvailability] = useState<PublicChatAvailability | null>(null);
  const [guestSessionId, setGuestSessionId] = useState("");
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

  const applyClosedState = useCallback(() => {
    resetGuestSession();
    setMessages([
      createWelcomeMessage(servicePointLabel),
      {
        id: "closed",
        sender: "system",
        body: createClosedVenueBody(),
        createdAt: new Date().toISOString()
      }
    ]);
  }, [resetGuestSession, servicePointLabel]);

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
        return;
      }

      setServicePointLabel(result.servicePoint.label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability);

      if (!result.chatAvailability.isOpen) {
        applyClosedState();
      } else if (!conversationId) {
        setMessages([createWelcomeMessage(result.servicePoint.label)]);
      }
    }

    void loadIntake();
    const interval = window.setInterval(() => void loadIntake(), intakeRefreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [applyClosedState, conversationId, qrToken]);

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

      const label = result.servicePoint.label || servicePointLabel;
      setServicePointLabel(label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability ?? null);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState();
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
    if (!body || isSending || chatClosed || !guestSessionId) {
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

      setServicePointLabel(result.servicePoint.label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability ?? null);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState();
        return;
      }

      if (result.request && endedRequestStatuses.has(result.request.status)) {
        applyEndedState(result.servicePoint.label);
        return;
      }

      setMessages((current) =>
        reconcileConversationMessages({
          currentMessages: current,
          label: result.servicePoint.label,
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
            <strong>{venueName || servicePointLabel}</strong>
            <div className="meta">{chatClosed ? "Closed for now" : venueName ? `${servicePointLabel} support with Lily` : "Guest support with Lily"}</div>
          </div>
          <span className={statusClassName}>{statusText}</span>
        </div>

        <div ref={messagesRef} className="chat-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div className="message-cluster" key={message.id}>
              <div className={`bubble ${message.sender}${message.isPending ? " pending" : ""}`}>
                {message.isPending ? (
                  <span className="typing-loader" aria-label="Lily is typing">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  message.body
                )}
              </div>
              {index === 0 && !awaitingSatisfaction && !chatClosed ? (
                <div className="quick-actions intro-actions" aria-label="Common requests">
                  {supportQuickActions.map((action) => (
                    <button disabled={isSending} key={`intro-${action.id}`} onClick={() => void sendMessage(action.prompt)} type="button">
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
            <button className="button ghost" disabled={isSending} onClick={() => void updateRequest("cancel")} type="button">
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
            placeholder="Tell us what would help..."
            disabled={chatClosed}
            value={input}
          />
          <button className="button" disabled={isSending || chatClosed} type="submit" title="Send message">
            <Send size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}
