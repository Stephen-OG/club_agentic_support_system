"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, LogOut, ShieldCheck } from "lucide-react";
import { validatePasswordChange } from "@/lib/account-security";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function AccountCommand() {
  const supabase = createBrowserSupabaseClient();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleFields, setVisibleFields] = useState({ old: false, next: false, confirm: false });

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const validationError = validatePasswordChange({ oldPassword, newPassword, confirmPassword });
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const userResult = await supabase.auth.getUser();
      const email = userResult.data.user?.email;

      if (!email) {
        setMessage("Could not confirm the signed-in email.");
        return;
      }

      const signInResult = await supabase.auth.signInWithPassword({ email, password: oldPassword });
      if (signInResult.error) {
        setMessage("Old password is incorrect.");
        return;
      }

      const result = await supabase.auth.updateUser({ password: newPassword });
      setMessage(result.error ? result.error.message : "Password updated.");
      if (!result.error) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } finally {
      setLoading(false);
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
          <label className="password-field">
            <span>Old password</span>
            <div className="input-shell">
              <input
                autoComplete="current-password"
                onChange={(event) => setOldPassword(event.target.value)}
                required
                type={visibleFields.old ? "text" : "password"}
                value={oldPassword}
              />
              <button
                aria-label={visibleFields.old ? "Hide old password" : "Show old password"}
                className="password-toggle"
                onClick={() => setVisibleFields((current) => ({ ...current, old: !current.old }))}
                type="button"
              >
                {visibleFields.old ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label className="password-field">
            <span>New password</span>
            <div className="input-shell">
              <input
                autoComplete="new-password"
                minLength={10}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type={visibleFields.next ? "text" : "password"}
                value={newPassword}
              />
              <button
                aria-label={visibleFields.next ? "Hide new password" : "Show new password"}
                className="password-toggle"
                onClick={() => setVisibleFields((current) => ({ ...current, next: !current.next }))}
                type="button"
              >
                {visibleFields.next ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label className="password-field">
            <span>Confirm new password</span>
            <div className="input-shell">
              <input
                autoComplete="new-password"
                minLength={10}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type={visibleFields.confirm ? "text" : "password"}
                value={confirmPassword}
              />
              <button
                aria-label={visibleFields.confirm ? "Hide confirmed password" : "Show confirmed password"}
                className="password-toggle"
                onClick={() => setVisibleFields((current) => ({ ...current, confirm: !current.confirm }))}
                type="button"
              >
                {visibleFields.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {message ? <div className="form-note">{message}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            <ShieldCheck size={16} />
            {loading ? "Updating..." : "Update password"}
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
