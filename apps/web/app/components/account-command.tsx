"use client";

import { FormEvent, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function AccountCommand() {
  const supabase = createBrowserSupabaseClient();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const result = await supabase.auth.updateUser({ password });
    setMessage(result.error ? result.error.message : "Password updated.");
    if (!result.error) {
      setPassword("");
    }
  }

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.reload();
  }

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Account security</div>
          <h1>Account</h1>
        </div>
      </div>
      <div className="command-panel">
        <h2>Change password</h2>
        <form className="command-form" onSubmit={changePassword}>
          <label>
            <span>New password</span>
            <input minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {message ? <div className="form-note">{message}</div> : null}
          <button className="command-button primary" type="submit">
            <ShieldCheck size={16} />
            Update password
          </button>
        </form>
      </div>
      <div className="command-panel">
        <h2>Session</h2>
        <button className="command-button danger" onClick={signOut} type="button">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </section>
  );
}
