"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { validatePasswordChange } from "@/lib/account-security";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function PasswordChangePanel() {
  const supabase = createBrowserSupabaseClient();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleFields, setVisibleFields] = useState({ old: false, next: false, confirm: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }

    const validationError = validatePasswordChange({ oldPassword, newPassword: password, confirmPassword });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    const userResult = await supabase.auth.getUser();
    const email = userResult.data.user?.email;

    if (!email) {
      setLoading(false);
      setError("Could not confirm the signed-in email.");
      return;
    }

    const signInResult = await supabase.auth.signInWithPassword({ email, password: oldPassword });
    if (signInResult.error) {
      setLoading(false);
      setError("Old password is incorrect.");
      return;
    }

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
          <p className="muted">Your workspace admin created this account with a temporary password. Set your own password before entering Madupe.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
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
                onChange={(event) => setPassword(event.target.value)}
                required
                type={visibleFields.next ? "text" : "password"}
                value={password}
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
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            {loading ? "Securing account..." : "Save password"}
          </button>
        </form>
      </section>
    </main>
  );
}
