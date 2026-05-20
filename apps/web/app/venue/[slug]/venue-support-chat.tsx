"use client";

import { FormEvent, useEffect, useState } from "react";
import { MapPin, Send, Sparkles } from "lucide-react";
import { publicApiRequest } from "@/lib/api/client";
import type { CommandMessage, CommandSupportRequest, PublicQrConversationState } from "@/lib/auth/types";
import { supportLocationOptions, supportQuickActions } from "@/lib/support-intake";

export function VenueSupportChat({ venueSlug }: { venueSlug: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [request, setRequest] = useState<CommandSupportRequest | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(`venue-support:${venueSlug}:conversationId`);
    if (stored) {
      setConversationId(stored);
    }
  }, [venueSlug]);

  useEffect(() => {
    if (conversationId) {
      window.localStorage.setItem(`venue-support:${venueSlug}:conversationId`, conversationId);
    }
  }, [conversationId, venueSlug]);

  async function sendMessage(nextMessage?: string, quickAction?: string) {
    const body = (nextMessage || input).trim();
    if (!body || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);

    try {
      const result = await publicApiRequest<PublicQrConversationState>(
        `/public/qr/venues/${encodeURIComponent(venueSlug)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            locationLabel: locationLabel.trim() || undefined,
            message: body,
            quickAction
          })
        }
      );

      setConversationId(result.conversationId);
      setMessages(result.messages);
      setRequest(result.request);
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
            <strong>Venue support</strong>
            <div className="meta">{request ? request.status.toLowerCase().replace("_", " ") : "Tell us what you need"}</div>
          </div>
        </div>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`bubble ${message.sender.toLowerCase()}`} key={message.id}>
              {message.body}
            </div>
          ))}
        </div>
        <form className="composer" onSubmit={onSubmit}>
          <textarea
            aria-label="Message"
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tell us what would help..."
            value={input}
          />
          <button className="button" disabled={isSending} type="submit" title="Send message">
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
            value={locationLabel}
          />
        </label>
        <div className="location-chips">
          {supportLocationOptions.map((option) => (
            <button key={option} onClick={() => setLocationLabel(option)} type="button">
              {option}
            </button>
          ))}
        </div>
        <div className="quick-actions">
          {supportQuickActions.map((action) => (
            <button disabled={isSending} key={action.id} onClick={() => void sendMessage(action.prompt, action.id)} type="button">
              <Sparkles size={15} /> {action.label}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
