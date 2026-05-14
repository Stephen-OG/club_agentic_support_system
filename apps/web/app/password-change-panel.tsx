"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function PasswordChangePanel() {
  const supabase = createBrowserSupabaseClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }

    if (password.length < 10) {
      setError("Use at least 10 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await supabase.auth.updateUser({
      password,
      data: { mustChangePassword: false }
    });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    window.location.reload();
  }

  return (
    <main className="auth-screen compact">
      <section className="auth-panel password-panel" aria-label="Set new password">
        <span className="status-orbit">
          <ShieldCheck size={22} />
        </span>
        <div>
          <div className="eyebrow">Temporary credential</div>
          <h1>Set a new password</h1>
          <p className="muted">Your workspace admin created this account with a temporary password. Set your own password before entering GuestOS.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>New password</span>
            <input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label>
            <span>Confirm password</span>
            <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            {loading ? "Securing account..." : "Save password"}
          </button>
        </form>
      </section>
    </main>
  );
}
