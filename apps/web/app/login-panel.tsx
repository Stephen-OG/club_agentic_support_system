"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, Mail, Radar } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function LoginPanel() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (result.error) {
      setError("Email or password is incorrect.");
      return;
    }

    window.location.reload();
  }

  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-label="GuestOS command center">
        <div className="auth-signal">
          <Radar size={18} />
          Live venue command
        </div>
        <h1>GuestOS Command Center</h1>
        <p>Sign in to manage venues, service points, staff credentials, and live guest requests.</p>
      </section>

      <section className="auth-panel" aria-label="Sign in">
        <div>
          <div className="eyebrow">Secure access</div>
          <h2>Sign in</h2>
          <p className="muted">Accounts are created by workspace admins. There is no public signup.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <span className="input-shell">
              <Mail size={16} />
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </span>
          </label>
          <label>
            <span>Password</span>
            <span className="input-shell">
              <LockKeyhole size={16} />
              <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </span>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            {loading ? "Checking credentials..." : "Enter command center"}
          </button>
        </form>
      </section>
    </main>
  );
}
