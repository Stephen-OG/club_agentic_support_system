"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandCenterPage } from "../command-center-page";
import { apiRequest } from "@/lib/api/client";
import { createBrowserAuthClient } from "@/lib/app-auth/browser";
import { hasCommandDashboardAccess } from "@/lib/auth/role-policy";
import type { CommandUser } from "@/lib/auth/types";
import { useAuthSession } from "@/lib/app-auth/use-session";
import { safeReplace } from "@/lib/navigation";

export default function CommandPage() {
  const router = useRouter();
  const authClient = useMemo(() => createBrowserAuthClient(), []);
  const session = useAuthSession();
  const [currentUser, setCurrentUser] = useState<CommandUser | null | undefined>(undefined);

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
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, authClient]);

  useEffect(() => {
    if (session === undefined || currentUser === undefined) {
      return;
    }

    if (!session || session.user.user_metadata?.mustChangePassword === true || !currentUser) {
      safeReplace(router, "/login");
      return;
    }

    if (!hasCommandDashboardAccess(currentUser)) {
      safeReplace(router, "/staff");
    }
  }, [session, currentUser, router]);

  if (session === undefined || currentUser === undefined) {
    return <main aria-busy="true" className="auth-screen" />;
  }

  return <CommandCenterPage initialView="dashboard" />;
}
