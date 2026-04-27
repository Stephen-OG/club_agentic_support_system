"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, MessageSquareReply, RefreshCw, Siren } from "lucide-react";
import type { Message, RequestStatus, SupportRequest } from "@/lib/types";

const statuses: RequestStatus[] = ["acknowledged", "in_progress", "resolved"];

export function AdminDashboard() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) || requests[0] || null,
    [requests, selectedId]
  );

  async function loadRequests() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/requests", { cache: "no-store" });
      const result = (await response.json()) as { requests: SupportRequest[] };
      setRequests(result.requests || []);
      setSelectedId((current) => current || result.requests?.[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    const response = await fetch(`/api/admin/messages?conversationId=${conversationId}`, { cache: "no-store" });
    const result = (await response.json()) as { messages: Message[] };
    setMessages(result.messages || []);
  }

  async function updateStatus(status: RequestStatus) {
    if (!selected) {
      return;
    }

    const response = await fetch("/api/admin/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, status })
    });
    const result = (await response.json()) as { request: SupportRequest };
    setRequests((current) => current.map((item) => (item.id === selected.id ? result.request : item)));
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected || !reply.trim()) {
      return;
    }

    const response = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: selected.id, body: reply })
    });
    const result = (await response.json()) as { message: Message };
    setMessages((current) => [...current, result.message]);
    setReply("");
  }

  useEffect(() => {
    void loadRequests();
    const interval = window.setInterval(() => void loadRequests(), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selected?.conversation_id) {
      void loadMessages(selected.conversation_id);
    } else {
      setMessages([]);
    }
  }, [selected?.conversation_id]);

  return (
    <section className="grid">
      <div>
        <h1 className="page-title">Staff Dashboard</h1>
        <p className="lead">Track table requests, reply to guests, and keep the queue moving.</p>
      </div>

      <div className="dashboard">
        <aside className="panel">
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2>Requests</h2>
            <button className="button ghost" onClick={() => void loadRequests()} title="Refresh requests" type="button">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="request-list">
            {requests.length === 0 ? (
              <div className="empty">{loading ? "Loading requests..." : "No active requests yet."}</div>
            ) : (
              requests.map((request) => (
                <button
                  className={`request-card ${request.id === selected?.id ? "active" : ""}`}
                  key={request.id}
                  onClick={() => setSelectedId(request.id)}
                  type="button"
                >
                  <strong>{request.title}</strong>
                  <div className="meta">
                    {request.club_tables?.label || "Table"} · {new Date(request.created_at).toLocaleTimeString()}
                  </div>
                  <div className="pill-row">
                    <span className={`pill ${request.priority}`}>{request.priority}</span>
                    <span className="pill">{request.status.replace("_", " ")}</span>
                    <span className="pill">{request.category}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="panel">
          {selected ? (
            <>
              <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between", gap: 14 }}>
                <div>
                  <h2>{selected.title}</h2>
                  <div className="meta">
                    {selected.club_tables?.label || "Table"} · {selected.club_tables?.zone || "Floor"} · {selected.category}
                  </div>
                </div>
                {selected.priority === "urgent" ? <Siren color="var(--danger)" /> : <Clock3 color="var(--accent)" />}
              </div>

              <div className="status-controls">
                {statuses.map((status) => (
                  <button className="button ghost" key={status} onClick={() => void updateStatus(status)} type="button">
                    {status === "resolved" ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>

              <div className="chat-messages" style={{ minHeight: 280 }}>
                {messages.map((message) => (
                  <div className={`bubble ${message.sender}`} key={message.id}>
                    {message.body}
                  </div>
                ))}
              </div>

              <form className="composer" onSubmit={sendReply}>
                <textarea
                  aria-label="Staff reply"
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply to the guest..."
                  value={reply}
                />
                <button className="button secondary" title="Send reply" type="submit">
                  <MessageSquareReply size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="empty">Select a request to see the conversation.</div>
          )}
        </div>
      </div>
    </section>
  );
}
