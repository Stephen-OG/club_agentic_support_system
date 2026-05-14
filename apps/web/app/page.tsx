"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppShell } from "./app-shell";
import { LoginPanel } from "./login-panel";
import { PasswordChangePanel } from "./password-change-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function HomePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

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

  return <AppShell />;
}
