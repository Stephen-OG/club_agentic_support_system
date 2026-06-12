"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Radar, UserPlus } from "lucide-react";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";
import { apiRequest } from "@/lib/api/client";
import { getSignedInRouteAction, mustChangePassword } from "@/lib/auth/session-route-policy";
import {
  getAuthEntryHref,
  getLoginModeFromSearchParams,
  getSignupCompletionAction
} from "@/lib/auth/signup-flow";
import type { CommandUser } from "@/lib/auth/types";

type LoginMode = "signin" | "signup" | "reset_request" | "reset_confirm";

export function LoginPanel() {
  const router = useRouter();
  const authClient = createBrowserAuthClient();
  const [mode, setMode] = useState<LoginMode>(() => {
    if (typeof window === "undefined") {
      return "signin";
    }

    return getLoginModeFromSearchParams(new URLSearchParams(window.location.search));
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetCode, setPasswordResetCode] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [changingVerificationEmail, setChangingVerificationEmail] = useState(false);
  const [replacementEmail, setReplacementEmail] = useState("");
  const [verificationEmailPassword, setVerificationEmailPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextResetToken = params.get("resetToken");

    if (nextResetToken) {
      setResetToken(nextResetToken);
      setPasswordResetCode("");
      setMode("reset_confirm");
      return;
    }

    setMode(getLoginModeFromSearchParams(params));

    if (params.get("verified") === "1") {
      setNotice("Email verified. You can sign in now.");
    }
  }, []);

  function showAuthMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setVerificationEmail(null);
    setVerificationCode("");

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", getAuthEntryHref(nextMode));
    }
  }

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
      setPasswordResetEmail(email.trim().toLowerCase());
      setPasswordResetCode("");
      setMode("reset_confirm");
      setNotice("If an account exists for that email, a reset code has been sent.");
      return;
    }

    if (mode === "reset_confirm") {
      const resetCode = passwordResetCode.trim();
      if (!resetToken && !/^\d{6}$/.test(resetCode)) {
        setError("Enter the 6-digit reset code from your email.");
        setLoading(false);
        return;
      }

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

      const result = await authClient.auth.resetPassword(
        resetToken
          ? { token: resetToken, password }
          : { email: passwordResetEmail || email.trim().toLowerCase(), code: resetCode, password }
      );
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (result.data.session) {
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
          router.replace("/signup");
        }
        return;
      }

      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      setPasswordResetCode("");
      setPasswordResetEmail("");
      setResetToken("");
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
      setVerificationCode("");
      setChangingVerificationEmail(false);
      setReplacementEmail("");
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

  async function submitVerificationEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authClient || !verificationEmail) {
      setError("app auth is not configured for this environment.");
      return;
    }

    const nextEmail = replacementEmail.trim().toLowerCase();
    if (!nextEmail || nextEmail === verificationEmail) {
      setError("Enter a different email address.");
      return;
    }

    if (!verificationEmailPassword) {
      setError("Enter the password you used to create the account.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const result = await authClient.auth.changeUnverifiedEmail({
      currentEmail: verificationEmail,
      newEmail: nextEmail,
      password: verificationEmailPassword
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setVerificationEmail(nextEmail);
    setEmail(nextEmail);
    setVerificationCode("");
    setReplacementEmail("");
    setVerificationEmailPassword("");
    setChangingVerificationEmail(false);
  }

  async function submitVerificationCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authClient || !verificationEmail) {
      setError("app auth is not configured for this environment.");
      return;
    }

    const code = verificationCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const result = await authClient.auth.verifyEmailCode({
      email: verificationEmail,
      code
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMode("signin");
    setVerificationEmail(null);
    setVerificationCode("");
    setNotice("Email verified. You can sign in now.");
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
            <p className="muted">Enter the 6-digit code sent to {verificationEmail} to verify your account.</p>
          ) : (
            <p className="muted">
              {mode === "signin"
                ? "Sign in with your email and password."
                : mode === "reset_request"
                ? "Enter your account email and we will send a secure reset code."
                : mode === "reset_confirm"
                ? resetToken
                  ? "Choose a new password for your account."
                  : `Enter the reset code sent to ${passwordResetEmail || "your email"} and choose a new password.`
                : "Create your owner login first. We will email you a verification code before organization setup."}
            </p>
          )}
        </div>

        {verificationEmail ? (
          changingVerificationEmail ? (
            <form className="auth-form" onSubmit={submitVerificationEmailChange}>
              <label>
                <span>New email</span>
                <span className="input-shell">
                  <Mail size={16} />
                  <input
                    autoComplete="email"
                    onChange={(event) => setReplacementEmail(event.target.value.trim())}
                    required
                    type="email"
                    value={replacementEmail}
                  />
                </span>
              </label>
              <label>
                <span>Account password</span>
                <span className="input-shell">
                  <LockKeyhole size={16} />
                  <input
                    autoComplete="current-password"
                    onChange={(event) => setVerificationEmailPassword(event.target.value)}
                    required
                    type="password"
                    value={verificationEmailPassword}
                  />
                </span>
              </label>
              {notice ? <div className="form-success">{notice}</div> : null}
              {error ? <div className="form-error">{error}</div> : null}
              <button className="command-button primary" disabled={loading} type="submit">
                {loading ? "Sending..." : "Send verification to new email"}
              </button>
              <button
                className="link-button"
                onClick={() => {
                  setChangingVerificationEmail(false);
                  setReplacementEmail("");
                  setVerificationEmailPassword("");
                  setError(null);
                }}
                type="button"
              >
                Keep using {verificationEmail}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitVerificationCode}>
              <label>
                <span>Verification code</span>
                <span className="input-shell">
                  <LockKeyhole size={16} />
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    pattern="[0-9]{6}"
                    required
                    type="text"
                    value={verificationCode}
                  />
                </span>
              </label>
              {notice ? <div className="form-success">{notice}</div> : null}
              {error ? <div className="form-error">{error}</div> : null}
              <button
                className="command-button primary"
                disabled={loading}
                type="submit"
              >
                {loading ? "Checking..." : "Verify email"}
              </button>
              <button
                className="link-button"
                onClick={() => {
                  setChangingVerificationEmail(true);
                  setReplacementEmail("");
                  setError(null);
                  setNotice(null);
                }}
                type="button"
              >
                Use a different email
              </button>
            </form>
          )
        ) : (
        <form className="auth-form" onSubmit={submit}>
          {mode !== "reset_confirm" ? <label>
            <span>Email</span>
            <span className="input-shell">
              <Mail size={16} />
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value.trim())} required type="email" value={email} />
            </span>
          </label> : null}
          {mode === "reset_confirm" && !resetToken ? (
            <label>
              <span>Reset code</span>
              <span className="input-shell">
                <LockKeyhole size={16} />
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setPasswordResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="[0-9]{6}"
                  required
                  type="text"
                  value={passwordResetCode}
                />
              </span>
            </label>
          ) : null}
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
              ? "Send reset code"
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
              <Link className="link-button" href={getAuthEntryHref("signup")} onClick={() => showAuthMode("signup")}>
                <UserPlus size={14} />
                Create one
              </Link>
            </p>
            </>
          ) : (
            <p>
              Already have an account?{" "}
              <Link className="link-button" href={getAuthEntryHref("signin")} onClick={() => showAuthMode("signin")}>
                Sign in
              </Link>
            </p>
          )}
        </div> : null}
      </section>
    </main>
  );
}
