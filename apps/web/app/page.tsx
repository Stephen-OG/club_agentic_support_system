"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppShell } from "./app-shell";
import { LoginPanel } from "./login-panel";
import { PasswordChangePanel } from "./password-change-panel";
import { apiRequest } from "@/lib/api/client";
import type { CommandUser } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function HomePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState<CommandUser | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session || session.user.user_metadata?.mustChangePassword === true) {
      setCurrentUser(session ? undefined : null);
      return;
    }

    let cancelled = false;
    setCurrentUser(undefined);
    setProfileError(null);

    void apiRequest<CommandUser>(supabase, "/me")
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
  }, [session, supabase]);

  if (session === undefined) {
    return (
      <main className="auth-screen">
        <div className="loading-panel">Loading command center...</div>
      </main>
    );
  }

  if (!session) {
    return <LoginPanel />;
  }

  if (session.user.user_metadata?.mustChangePassword === true) {
    return <PasswordChangePanel />;
  }

  if (currentUser === undefined) {
    return (
      <main className="auth-screen">
        <div className="loading-panel">Loading your workspace...</div>
      </main>
    );
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
          <button className="command-button primary" onClick={() => void supabase?.auth.signOut().then(() => window.location.reload())} type="button">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return <AppShell currentUser={currentUser} />;
}
