"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginPanel } from "../login-panel";
import { PasswordChangePanel } from "../password-change-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { apiRequest } from "@/lib/api/client";
import { getSignedInRouteAction, mustChangePassword } from "@/lib/auth/session-route-policy";
import type { CommandUser } from "@/lib/auth/types";
import { useSupabaseSession } from "@/lib/supabase/use-session";
import { safeReplace } from "@/lib/navigation";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const session = useSupabaseSession();
  const [isChecking, setIsChecking] = useState(false);
  const [sessionValidated, setSessionValidated] = useState<boolean | null>(null);

  useEffect(() => {
    if (session === undefined) {
      return;
    }

    if (!session) {
      setSessionValidated(false);
      return;
    }

    if (mustChangePassword(session.user)) {
      setIsChecking(false);
      setSessionValidated(false);
      return;
    }

    if (!supabase) {
      setSessionValidated(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    void apiRequest<CommandUser>(supabase, "/me")
      .then((user) => {
        if (cancelled) {
          return;
        }

        const action = getSignedInRouteAction({
          user,
          userMetadata: session.user.user_metadata
        });

        if (action.kind === "redirect") {
          safeReplace(router, action.path);
        }
      })
      .catch(async () => {
        if (cancelled) {
          return;
        }

        try {
          await supabase.auth.signOut();
        } catch {
          // signOut can fail if the session is already gone
        }

        setSessionValidated(false);
      })
      .finally(() => {
        if (!cancelled) {
          setIsChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, session, supabase]);

  if (session && mustChangePassword(session.user)) {
    return <PasswordChangePanel />;
  }

  if (session === undefined || isChecking || sessionValidated === null) {
    return <main aria-busy="true" className="auth-screen" />;
  }

  if (session && sessionValidated === false) {
    return <LoginPanel />;
  }

  if (!session) {
    return <LoginPanel />;
  }

  return null;
}
