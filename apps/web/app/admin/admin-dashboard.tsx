"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  MessageSquareReply,
  Play,
  RefreshCw,
  Siren,
  Star,
  TrendingUp,
  UserPlus,
  XCircle
} from "lucide-react";
import { calculateRatingAnalytics } from "@/lib/rating-analytics";
import type { Message, RequestStatus, StaffProfile, StaffRole, SupportRequest } from "@/lib/types";

const roleLabels: Record<StaffRole, string> = {
  manager: "Manager",
  admin: "Admin",
  staff: "Staff"
};

export function AdminDashboard() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [role, setRole] = useState<StaffRole>("admin");
  const [actingStaffId, setActingStaffId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("staff");
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) || requests[0] || null,
    [requests, selectedId]
  );
  const assignableStaff = staff.filter((person) => person.role === "staff");
  const actingStaff = staff.find((person) => person.id === actingStaffId) || assignableStaff[0] || null;
  const visibleRequests =
    role === "staff" && actingStaff
      ? requests.filter((request) => request.assigned_to === actingStaff.id)
      : requests;
  const ratingAnalytics = useMemo(() => calculateRatingAnalytics(visibleRequests), [visibleRequests]);
  const ratingDenominator = Math.max(1, ratingAnalytics.ratedCount);

  const canManage = role === "manager" || role === "admin";
  const canStaffAct = role === "staff" && selected?.assigned_to === actingStaff?.id;

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

  async function loadStaff() {
    const response = await fetch("/api/admin/staff", { cache: "no-store" });
    const result = (await response.json()) as { staff: StaffProfile[] };
    const nextStaff = result.staff || [];
    setStaff(nextStaff);
    setActingStaffId((current) => current || nextStaff.find((person) => person.role === "staff")?.id || "");
  }

  async function loadMessages(conversationId: string) {
    const response = await fetch(`/api/admin/messages?conversationId=${conversationId}`, { cache: "no-store" });
    const result = (await response.json()) as { messages: Message[] };
    setMessages(result.messages || []);
  }

  async function updateRequest(input: { status?: RequestStatus; assignedTo?: string | null }) {
    if (!selected) {
      return;
    }

    const response = await fetch("/api/admin/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, ...input })
    });
    const result = (await response.json()) as { request: SupportRequest };
    setRequests((current) => current.map((item) => (item.id === selected.id ? result.request : item)));
    if (selected.conversation_id) {
      await loadMessages(selected.conversation_id);
    }
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

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = staffName.trim();

    if (!displayName || staffSaving) {
      return;
    }

    setStaffSaving(true);
    setStaffError(null);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, role: staffRole })
      });

      if (!response.ok) {
        throw new Error("Staff create failed");
      }

      const result = (await response.json()) as { staff: StaffProfile };
      setStaff((current) => [...current, result.staff].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      if (result.staff.role === "staff") {
        setActingStaffId((current) => current || result.staff.id);
      }
      setStaffName("");
      setStaffRole("staff");
    } catch {
      setStaffError("Could not add that staff member. Please try again.");
    } finally {
      setStaffSaving(false);
    }
  }

  useEffect(() => {
    void loadStaff();
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
      <div className="dashboard-header">
        <h1 className="page-title">Operations Dashboard</h1>
        <p className="lead">Track guest requests, service recovery, staff handoffs, and satisfaction signals in one live queue.</p>
        <div className="toolbar">
          {(["manager", "admin", "staff"] as StaffRole[]).map((nextRole) => (
            <button
              className={`button ghost ${role === nextRole ? "selected" : ""}`}
              key={nextRole}
              onClick={() => setRole(nextRole)}
              type="button"
            >
              {roleLabels[nextRole]}
            </button>
          ))}
          {role === "staff" ? (
            <select
              aria-label="Acting staff member"
              onChange={(event) => setActingStaffId(event.target.value)}
              value={actingStaff?.id || ""}
            >
              {assignableStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <div className="panel team-panel">
          <div>
            <h2>Team</h2>
            <div className="meta">Add staff for assignment and role testing.</div>
          </div>

          <form className="staff-form" onSubmit={createStaff}>
            <input
              aria-label="Staff display name"
              onChange={(event) => setStaffName(event.target.value)}
              placeholder="Display name"
              value={staffName}
            />
            <select
              aria-label="Staff role"
              onChange={(event) => setStaffRole(event.target.value as StaffRole)}
              value={staffRole}
            >
              {(["staff", "admin", "manager"] as StaffRole[]).map((nextRole) => (
                <option key={nextRole} value={nextRole}>
                  {roleLabels[nextRole]}
                </option>
              ))}
            </select>
            <button className="button secondary" disabled={staffSaving || !staffName.trim()} type="submit">
              <UserPlus size={16} />
              Add
            </button>
          </form>

          <div className="staff-list">
            {staff.map((person) => (
              <span className="staff-chip" key={person.id}>
                <strong>{person.display_name}</strong>
                <span>{roleLabels[person.role]}</span>
              </span>
            ))}
          </div>
          {staffError ? <div className="form-error">{staffError}</div> : null}
        </div>
      ) : null}

      <div className="analytics-grid">
        <div className="metric-card">
          <span className="metric-icon">
            <Star size={18} />
          </span>
          <div>
            <div className="metric-value">
              {ratingAnalytics.averageRating ? `${ratingAnalytics.averageRating}/5` : "No ratings"}
            </div>
            <div className="meta">Average satisfaction</div>
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-icon">
            <TrendingUp size={18} />
          </span>
          <div>
            <div className="metric-value">{ratingAnalytics.ratedCount}</div>
            <div className="meta">Rated requests</div>
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-icon alert">
            <XCircle size={18} />
          </span>
          <div>
            <div className="metric-value">{ratingAnalytics.lowRatingCount}</div>
            <div className="meta">Needs follow-up</div>
          </div>
        </div>

        <div className="panel rating-breakdown">
          <div>
            <strong>Rating Mix</strong>
            <div className="meta">Distribution from guest satisfaction responses.</div>
          </div>
          <div className="rating-bars">
            {([5, 4, 3, 2, 1] as const).map((rating) => {
              const count = ratingAnalytics.ratingDistribution[rating];
              const width = `${Math.round((count / ratingDenominator) * 100)}%`;

              return (
                <div className="rating-bar-row" key={rating}>
                  <span>{rating}</span>
                  <div className="rating-bar-track">
                    <div className="rating-bar-fill" style={{ width }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dashboard">
        <aside className="panel request-queue">
          <div className="section-heading">
            <h2>Requests</h2>
            <button className="button ghost" onClick={() => void loadRequests()} title="Refresh requests" type="button">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="request-list">
            {visibleRequests.length === 0 ? (
              <div className="empty">{loading ? "Loading requests..." : "No active requests yet."}</div>
            ) : (
              visibleRequests.map((request) => (
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
                  <div className="meta">
                    {request.staff_profiles?.display_name
                      ? `Assigned to ${request.staff_profiles.display_name}`
                      : "Unassigned"}
                  </div>
                  <div className="pill-row">
                    <span className={`pill priority-${request.priority}`}>{request.priority}</span>
                    <span className={`pill status-${request.status}`}>{request.status.replace("_", " ")}</span>
                    <span className="pill">{request.category}</span>
                    {request.satisfaction_rating ? (
                      <span className="pill rating-pill">
                        <Star size={12} />
                        {request.satisfaction_rating}/5
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="panel request-detail">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <h2>{selected.title}</h2>
                  <div className="meta">
                    {selected.club_tables?.label || "Table"} · {selected.club_tables?.zone || "Floor"} · {selected.category}
                  </div>
                  <div className="meta">
                    {selected.staff_profiles?.display_name
                      ? `Assigned to ${selected.staff_profiles.display_name}`
                      : "Waiting for assignment"}
                  </div>
                  {selected.satisfaction_rating ? (
                    <div className="selected-rating">
                      <Star size={16} />
                      Guest rated this service {selected.satisfaction_rating}/5
                    </div>
                  ) : null}
                </div>
                {selected.priority === "urgent" ? <Siren color="var(--danger)" /> : <Clock3 color="var(--accent)" />}
              </div>

              {canManage ? (
                <div className="assignment-controls">
                  <select
                    aria-label="Assign staff"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        void updateRequest({ assignedTo: event.target.value, status: "acknowledged" });
                        event.target.value = "";
                      }
                    }}
                  >
                    <option value="">Assign to staff...</option>
                    {assignableStaff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.display_name}
                      </option>
                    ))}
                  </select>
                  <button className="button ghost" onClick={() => void updateRequest({ status: "cancelled" })} type="button">
                    <XCircle size={16} />
                    Cancel
                  </button>
                </div>
              ) : null}

              {role === "staff" ? (
                <div className="status-controls">
                  <button
                    className="button ghost"
                    disabled={!canStaffAct || selected.status !== "acknowledged"}
                    onClick={() => void updateRequest({ status: "in_progress" })}
                    type="button"
                  >
                    <Play size={16} />
                    Accept
                  </button>
                  <button
                    className="button ghost"
                    disabled={!canStaffAct || selected.status !== "acknowledged"}
                    onClick={() => void updateRequest({ assignedTo: null, status: "declined" })}
                    type="button"
                  >
                    <XCircle size={16} />
                    Decline
                  </button>
                  <button
                    className="button ghost"
                    disabled={!canStaffAct || selected.status !== "in_progress"}
                    onClick={() => void updateRequest({ status: "completed" })}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    Complete
                  </button>
                </div>
              ) : null}

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
