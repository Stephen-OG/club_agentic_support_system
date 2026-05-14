"use client";

import { FormEvent, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CreatedStaffCredential } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function TeamCommand() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("staff");
  const [venueId, setVenueId] = useState("");
  const [created, setCreated] = useState<CreatedStaffCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          venueId: ["owner", "admin"].includes(role) ? undefined : venueId
        })
      });
      setCreated(result);
      setEmail("");
      setDisplayName("");
      setVenueId("");
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
            <select onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="security">Security</option>
              <option value="read_only">Read only</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          {!["owner", "admin"].includes(role) ? (
            <label>
              <span>Venue ID</span>
              <input onChange={(event) => setVenueId(event.target.value)} required value={venueId} />
            </label>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            <UserPlus size={16} />
            {loading ? "Creating..." : "Create credentials"}
          </button>
        </form>
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
