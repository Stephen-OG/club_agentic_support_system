"use client";

import { useEffect, useMemo, useState } from "react";
import type { CommandView } from "@/lib/auth/role-policy";
import { AppShell } from "./app-shell";
import { LoginPanel } from "./login-panel";
import { PasswordChangePanel } from "./password-change-panel";
import { apiRequest } from "@/lib/api/client";
import type { CommandUser } from "@/lib/auth/types";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";
import { useAuthSession } from "@/lib/app-auth/use-session";

export function CommandCenterPage({ initialView }: { initialView?: CommandView }) {
  const authClient = useMemo(() => createBrowserAuthClient(), []);
  const session = useAuthSession();
  const [currentUser, setCurrentUser] = useState<CommandUser | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!authClient || !session || session.user.user_metadata?.mustChangePassword === true) {
      setCurrentUser(null);
      return;
    }

    let cancelled = false;

    void apiRequest<CommandUser>(authClient, "/me")
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCurrentUser(null);
          setProfileError(error instanceof Error ? error.message : "Could not load your command profile");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, authClient]);

  if (session === undefined) {
    return <main aria-busy="true" className="auth-screen" />;
  }

  if (!session) {
    return <LoginPanel />;
  }

  if (session.user.user_metadata?.mustChangePassword === true) {
    return <PasswordChangePanel />;
  }

  if (currentUser === undefined) {
    return <main aria-busy="true" className="auth-screen" />;
  }

  if (!currentUser) {
    return (
      <main className="auth-screen compact">
        <div className="auth-panel password-panel">
          <div>
            <div className="eyebrow">Profile access</div>
            <h1>Staff profile unavailable</h1>
            <p className="muted">{profileError || "This login is not linked to an active staff profile."}</p>
          </div>
          <button className="command-button primary" onClick={() => void authClient?.auth.signOut().then(() => window.location.reload())} type="button">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return <AppShell currentUser={currentUser} initialView={initialView} />;
}
