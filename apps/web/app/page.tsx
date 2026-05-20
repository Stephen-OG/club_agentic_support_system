"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { apiRequest } from "@/lib/api/client";
import { hasCommandDashboardAccess } from "@/lib/auth/role-policy";
import { mustChangePassword } from "@/lib/auth/session-route-policy";
import type { CommandUser } from "@/lib/auth/types";
import { useSupabaseSession } from "@/lib/supabase/use-session";
import { safeReplace } from "@/lib/navigation";

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const session = useSupabaseSession();
  const [currentUser, setCurrentUser] = useState<CommandUser | null | undefined>(undefined);

  useEffect(() => {
    if (session === undefined) {
      return;
    }

    if (!supabase || !session || mustChangePassword(session.user)) {
      setCurrentUser(null);
      return;
    }

    let cancelled = false;
    setCurrentUser(undefined);
    void apiRequest<CommandUser>(supabase, "/me")
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, supabase]);

  useEffect(() => {
    if (session === undefined || currentUser === undefined) {
      return;
    }

    if (!session) {
      safeReplace(router, "/login");
      return;
    }

    if (mustChangePassword(session.user)) {
      safeReplace(router, "/login");
      return;
    }

    if (!currentUser) {
      safeReplace(router, "/login");
      return;
    }

    if (hasCommandDashboardAccess(currentUser)) {
      safeReplace(router, "/admin");
    } else {
      safeReplace(router, "/staff");
    }
  }, [session, currentUser, router]);

  return (
    <main className="auth-screen">
      <div className="loading-panel">Checking access…</div>
    </main>
  );
}
