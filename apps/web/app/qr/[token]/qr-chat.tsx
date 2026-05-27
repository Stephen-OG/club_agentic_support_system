"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Star } from "lucide-react";
import { publicApiRequest } from "@/lib/api/client";
import type { CommandMessage, CommandSupportRequest, PublicChatAvailability, PublicQrConversationState, PublicQrIntakeState } from "@/lib/auth/types";
import { createClosedVenueBody, createSendErrorBody, createUpdateErrorBody, createWelcomeBody } from "@/lib/chat-copy";
import type { ClientRequestAction, SatisfactionRating } from "@/lib/request-actions";
import { supportQuickActions } from "@/lib/support-intake";

type LocalMessage = {
  id: string;
  sender: "guest" | "assistant" | "staff" | "system";
  body: string;
  createdAt: string;
};

const satisfactionRatings: SatisfactionRating[] = [1, 2, 3, 4, 5];
const intakeRefreshMs = 5000;

function createWelcomeMessage(label: string): LocalMessage {
  return {
    id: "welcome",
    sender: "assistant",
    body: createWelcomeBody(label),
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

function statusLabel(request: CommandSupportRequest | null) {
  if (!request) {
    return "Ready";
  }

  if (request.status === "RESOLVED") {
    return "complete";
  }

  return request.status.toLowerCase().replace("_", " ");
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
  const formRef = useRef<HTMLFormElement>(null);

  const statusText = useMemo(() => statusLabel(request), [request]);
  const statusClassName = request
    ? `pill status-${request.status.toLowerCase()} priority-${request.priority.toLowerCase()}`
    : "pill";
  const canCancel = request && !["COMPLETED", "RESOLVED", "CANCELLED"].includes(request.status);
  const awaitingSatisfaction = request?.status === "COMPLETED";
  const chatClosed = chatAvailability?.isOpen === false;

  const applyClosedState = useCallback(() => {
    window.localStorage.removeItem(`qr-chat:${qrToken}:conversationId`);
    setConversationId(null);
    setRequest(null);
    setMessages([
      createWelcomeMessage(servicePointLabel),
      {
        id: "closed",
        sender: "system",
        body: createClosedVenueBody(),
        createdAt: new Date().toISOString()
      }
    ]);
  }, [qrToken, servicePointLabel]);

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
    const storedConversationId = window.localStorage.getItem(`qr-chat:${qrToken}:conversationId`);
    if (storedConversationId) {
      setConversationId(storedConversationId);
    }
  }, [qrToken]);

  useEffect(() => {
    if (conversationId) {
      window.localStorage.setItem(`qr-chat:${qrToken}:conversationId`, conversationId);
    }
  }, [conversationId, qrToken]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    let cancelled = false;
    const activeConversationId = conversationId;

    async function loadConversation() {
      const result = await publicApiRequest<PublicQrConversationState>(
        `/public/qr/${encodeURIComponent(qrToken)}/conversations/${encodeURIComponent(activeConversationId)}`,
        { cache: "no-store" }
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

      setMessages([createWelcomeMessage(label), ...result.messages.map(normalizeMessage)]);
      setRequest(result.request);
    }

    void loadConversation();
    const interval = window.setInterval(() => void loadConversation(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [applyClosedState, conversationId, qrToken, servicePointLabel]);

  async function sendMessage(nextMessage?: string) {
    const body = (nextMessage || input).trim();
    if (!body || isSending || chatClosed) {
      return;
    }

    setInput("");
    setIsSending(true);

    try {
      const result = await publicApiRequest<PublicQrConversationState>(`/public/qr/${encodeURIComponent(qrToken)}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: body, conversationId })
      });

      setServicePointLabel(result.servicePoint.label);
      setVenueName(result.venue?.name ?? null);
      setChatAvailability(result.chatAvailability ?? null);

      if (result.chatAvailability?.isOpen === false) {
        applyClosedState();
        return;
      }

      setMessages([createWelcomeMessage(result.servicePoint.label), ...result.messages.map(normalizeMessage)]);
      setConversationId(result.conversationId);
      setRequest(result.request);
    } catch {
      setMessages((current) => [
        ...current,
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
    if (!request || isSending) {
      return;
    }

    setIsSending(true);

    try {
      const result = await publicApiRequest<{
        request: CommandSupportRequest;
        message?: CommandMessage;
      }>(`/public/requests/${request.id}/action`, {
        method: "PATCH",
        body: JSON.stringify({ action, rating })
      });

      setRequest(result.request);
      if (result.message) {
        setMessages((current) => [...current, normalizeMessage(result.message as CommandMessage)]);
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

        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`bubble ${message.sender}`} key={message.id}>
              {message.body}
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
              Not yet
            </button>
          </div>
        ) : canCancel ? (
          <div className="guest-actions">
            <button className="button ghost" disabled={isSending} onClick={() => void updateRequest("cancel")} type="button">
              Cancel request
            </button>
          </div>
        ) : null}

        {!awaitingSatisfaction && !chatClosed ? (
          <div className="quick-actions">
            {supportQuickActions.slice(0, 6).map((action) => (
              <button disabled={isSending} key={action.id} onClick={() => void sendMessage(action.prompt)} type="button">
                {action.label}
              </button>
            ))}
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
