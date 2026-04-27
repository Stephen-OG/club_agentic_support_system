"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import type { Message, SupportRequest } from "@/lib/types";

type LocalMessage = Pick<Message, "id" | "sender" | "body" | "created_at">;

const prompts = [
  "I need more spoons",
  "Can I get tissues?",
  "There is a spill here",
  "Can someone help with the bill?"
];

export function TableChat({ tableToken, tableLabel }: { tableToken: string; tableLabel: string }) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [request, setRequest] = useState<SupportRequest | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      body: `Hi, you are chatting from ${tableLabel}. What can the team help you with?`,
      created_at: new Date().toISOString()
    }
  ]);
  const formRef = useRef<HTMLFormElement>(null);

  const statusText = useMemo(() => {
    if (!request) {
      return "Ready";
    }

    return request.status.replace("_", " ");
  }, [request]);

  async function sendMessage(nextMessage?: string) {
    const body = (nextMessage || input).trim();
    if (!body || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableToken, message: body, conversationId })
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const result = (await response.json()) as {
        conversationId: string;
        messages: LocalMessage[];
        request: SupportRequest;
      };

      setMessages((current) => [...current, ...result.messages]);
      setConversationId(result.conversationId);
      setRequest(result.request);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: "system",
          body: "The request could not be sent. Please try again or speak to a team member.",
          created_at: new Date().toISOString()
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
    <section className="grid two-col">
      <div className="panel chat">
        <div className="chat-header">
          <div>
            <strong>{tableLabel}</strong>
            <div className="meta">Conversational support</div>
          </div>
          <span className="pill">{statusText}</span>
        </div>

        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`bubble ${message.sender}`} key={message.id}>
              {message.body}
            </div>
          ))}
        </div>

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
            placeholder="Ask for anything you need..."
            value={input}
          />
          <button className="button" disabled={isSending} type="submit" title="Send message">
            <Send size={18} />
          </button>
        </form>
      </div>

      <aside className="panel">
        <h1 className="page-title" style={{ fontSize: 42 }}>
          Ask the team
        </h1>
        <p className="lead">
          The assistant will understand the request, notify staff, and keep this chat open for updates.
        </p>
        <div className="quick-actions">
          {prompts.map((prompt) => (
            <button disabled={isSending} key={prompt} onClick={() => void sendMessage(prompt)} type="button">
              <Sparkles size={15} /> {prompt}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
