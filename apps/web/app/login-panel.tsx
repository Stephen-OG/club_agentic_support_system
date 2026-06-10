"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Radar, UserPlus } from "lucide-react";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";
import { apiRequest } from "@/lib/api/client";
import { getSignedInRouteAction, mustChangePassword } from "@/lib/auth/session-route-policy";
import { getSignupCompletionAction, getSignupEmailRedirectTo } from "@/lib/auth/signup-flow";
import type { CommandUser } from "@/lib/auth/types";

type LoginMode = "signin" | "signup" | "reset_request" | "reset_confirm";

export function LoginPanel() {
  const router = useRouter();
  const authClient = createBrowserAuthClient();
  const [mode, setMode] = useState<LoginMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextResetToken = params.get("resetToken");

    if (nextResetToken) {
      setResetToken(nextResetToken);
      setMode("reset_confirm");
      return;
    }

    if (params.get("verified") === "1") {
      setNotice("Email verified. You can sign in now.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authClient) {
      setError("app auth is not configured for this environment.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    if (mode === "reset_request") {
      const result = await authClient.auth.requestPasswordReset({ email });
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setNotice("If an account exists for that email, a reset link has been sent.");
      return;
    }

    if (mode === "reset_confirm") {
      if (password.length < 10) {
        setError("Use at least 10 characters for the password.");
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        setLoading(false);
        return;
      }

      const result = await authClient.auth.resetPassword({ token: resetToken, password });
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      setNotice("Password updated. You can sign in now.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 10) {
        setError("Use at least 10 characters for the password.");
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        setLoading(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window === "undefined" ? undefined : getSignupEmailRedirectTo(window.location.origin),
          data: { mustChangePassword: false }
        }
      });

      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const action = getSignupCompletionAction({ hasSession: Boolean(signUpData.session) });
      if (action.kind === "setup") {
        router.replace("/signup");
        return;
      }

      setVerificationEmail(email.trim().toLowerCase());
      setNotice(null);
      setPassword("");
      setConfirmPassword("");
      return;
    }

    // Sign in flow
    const result = await authClient.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (result.error) {
      setError("Email or password is incorrect.");
      return;
    }

    if (!result.data.session) {
      setError("Unable to sign in. Please try again.");
      return;
    }

    if (mustChangePassword(result.data.session.user)) {
      router.replace("/login");
      return;
    }

    const accessToken = result.data.session.access_token;

    try {
      const user = await apiRequest<CommandUser>(authClient, "/me", { accessToken });
      const action = getSignedInRouteAction({
        user,
        userMetadata: result.data.session.user.user_metadata
      });
      if (action.kind === "redirect") {
        router.replace(action.path);
      }
    } catch {
      // /me failed — staff profile not found, redirect to signup
      router.replace("/signup");
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-label="Madupe command center">
        <div className="auth-signal">
          <Radar size={18} />
          Live venue command
        </div>
        <h1>Madupe Command Center</h1>
        <p>Sign in to manage venues, service points, staff credentials, and live guest requests.</p>
      </section>

      <section className="auth-panel" aria-label="Sign in">
        <div>
          <div className="eyebrow">Secure access</div>
          <h2>{mode === "signup" ? "Create account" : mode === "reset_request" ? "Reset password" : mode === "reset_confirm" ? "Set new password" : "Sign in"}</h2>
          {verificationEmail ? (
            <p className="muted">Check {verificationEmail} to verify your account. After confirming, sign in here to finish workspace setup.</p>
          ) : (
            <p className="muted">
              {mode === "signin"
                ? "Sign in with your email and password."
                : mode === "reset_request"
                ? "Enter your account email and we will send a secure reset link."
                : mode === "reset_confirm"
                ? "Choose a new password for your account."
                : "Create your owner login first. We will email you a verification link before workspace setup."}
            </p>
          )}
        </div>

        {verificationEmail ? (
          <div className="auth-form">
            <button
              className="command-button primary"
              onClick={() => {
                setMode("signin");
                setVerificationEmail(null);
                setError(null);
              }}
              type="button"
            >
              Sign in after confirming
            </button>
          </div>
        ) : (
        <form className="auth-form" onSubmit={submit}>
          {mode !== "reset_confirm" ? <label>
            <span>Email</span>
            <span className="input-shell">
              <Mail size={16} />
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value.trim())} required type="email" value={email} />
            </span>
          </label> : null}
          {mode !== "reset_request" ? <label>
            <span>Password</span>
            <span className="input-shell">
              <LockKeyhole size={16} />
              <input
                autoComplete={mode === "signup" || mode === "reset_confirm" ? "new-password" : "current-password"}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </span>
          </label> : null}
          {(mode === "signup" || mode === "reset_confirm") && (
            <label>
              <span>Confirm password</span>
              <span className="input-shell">
                <LockKeyhole size={16} />
                <input
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </span>
            </label>
          )}
          {notice ? <div className="form-success">{notice}</div> : null}
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            {loading
              ? "Please wait..."
              : mode === "signin"
              ? "Enter command center"
              : mode === "reset_request"
              ? "Send reset link"
              : mode === "reset_confirm"
              ? "Save new password"
              : "Create account"}
          </button>
        </form>
        )}

        {!verificationEmail ? <div className="auth-switch">
          {mode === "signin" ? (
            <>
            <p>
              Forgot your password?{" "}
              <button className="link-button" onClick={() => { setMode("reset_request"); setError(null); setNotice(null); setVerificationEmail(null); }} type="button">
                Reset it
              </button>
            </p>
            <p>
              Don&apos;t have an account?{" "}
              <button className="link-button" onClick={() => { setMode("signup"); setError(null); setVerificationEmail(null); }} type="button">
                <UserPlus size={14} />
                Create one
              </button>
            </p>
            </>
          ) : (
            <p>
              Already have an account?{" "}
              <button className="link-button" onClick={() => { setMode("signin"); setError(null); setVerificationEmail(null); }} type="button">
                Sign in
              </button>
            </p>
          )}
        </div> : null}
      </section>
    </main>
  );
}
