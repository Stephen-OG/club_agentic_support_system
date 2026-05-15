"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CommandRole, CommandTeamMember, CommandVenue, CreatedStaffCredential } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const roles: Array<{ label: string; value: CommandRole }> = [
  { label: "Staff", value: "staff" },
  { label: "Manager", value: "manager" },
  { label: "Security", value: "security" },
  { label: "Read only", value: "read_only" },
  { label: "Admin", value: "admin" },
  { label: "Owner", value: "owner" }
];

function roleRequiresVenue(role: CommandRole) {
  return !["owner", "admin"].includes(role);
}

export function TeamCommand() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<CommandRole>("staff");
  const [venueId, setVenueId] = useState("");
  const [team, setTeam] = useState<CommandTeamMember[]>([]);
  const [venues, setVenues] = useState<CommandVenue[]>([]);
  const [created, setCreated] = useState<CreatedStaffCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setListError("Supabase is not configured.");
      return;
    }

    setRefreshing(true);
    setListError(null);

    try {
      const [nextTeam, nextVenues] = await Promise.all([
        apiRequest<CommandTeamMember[]>(supabase, "/team"),
        apiRequest<CommandVenue[]>(supabase, "/admin/venues")
      ]);
      setTeam(nextTeam);
      setVenues(nextVenues);
      setVenueId((current) => current || nextVenues[0]?.id || "");
    } catch (nextError) {
      setListError(nextError instanceof Error ? nextError.message : "Could not load team data");
    } finally {
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiRequest<CreatedStaffCredential>(supabase, "/team", {
        method: "POST",
        body: JSON.stringify({
          email,
          displayName,
          role,
          venueId: roleRequiresVenue(role) ? venueId : undefined
        })
      });
      setCreated(result);
      setEmail("");
      setDisplayName("");
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create staff user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Credential control</div>
          <h1>Team</h1>
        </div>
        <button className="command-button" disabled={refreshing} onClick={() => void refresh()} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <div className="command-panel">
        <h2>Create user</h2>
        <form className="command-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>Display name</span>
            <input onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
          </label>
          <label>
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value as CommandRole)} value={role}>
              {roles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {roleRequiresVenue(role) ? (
            <label>
              <span>Venue</span>
              <select onChange={(event) => setVenueId(event.target.value)} required value={venueId}>
                <option value="">Select venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            <UserPlus size={16} />
            {loading ? "Creating..." : "Create credentials"}
          </button>
        </form>
      </div>
      <div className="command-panel">
        <div className="panel-title-row">
          <h2>Active credentials</h2>
          <span className="data-chip">{team.length} users</span>
        </div>
        {listError ? <div className="form-error">{listError}</div> : null}
        <div className="team-directory">
          {team.map((member) => {
            const membership = member.memberships[0];
            return (
              <article className="directory-row" key={member.id}>
                <div>
                  <strong>{member.displayName}</strong>
                  <span>{member.email || "No email"}</span>
                </div>
                <div className="directory-meta">
                  <span className="data-chip">{membership?.role.replace("_", " ") || "unassigned"}</span>
                  <small>{membership?.venue?.name || membership?.workspace?.name || "Workspace"}</small>
                </div>
              </article>
            );
          })}
          {!team.length && !listError ? <div className="empty-state">No team members returned by the API yet.</div> : null}
        </div>
      </div>
      {created ? (
        <div className="command-panel credential-panel">
          <h2>Temporary password</h2>
          <p>This password is shown once. The user must change it at first login.</p>
          <code>{created.temporaryPassword}</code>
          <button className="command-button" onClick={() => void navigator.clipboard.writeText(created.temporaryPassword)} type="button">
            <Copy size={16} />
            Copy password
          </button>
        </div>
      ) : null}
    </section>
  );
}
