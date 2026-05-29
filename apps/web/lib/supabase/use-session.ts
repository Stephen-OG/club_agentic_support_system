"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "./browser";

type Subscriber = (session: Session | null | undefined) => void;

const sessionState: {
  session: Session | null | undefined;
  initialized: boolean;
  subscribers: Subscriber[];
  subscription: { unsubscribe: () => void } | null;
} = {
  session: undefined,
  initialized: false,
  subscribers: [],
  subscription: null
};

function notifySubscribers(nextSession: Session | null | undefined) {
  // Deduplicate: skip if the session hasn't changed (same access_token)
  const prev = sessionState.session;

  if (!shouldNotifySessionChange(prev, nextSession)) {
    return;
  }

  sessionState.session = nextSession;
  sessionState.subscribers.forEach((subscriber) => subscriber(nextSession));
}

export function shouldNotifySessionChange(previous: Session | null | undefined, next: Session | null | undefined) {
  if (previous === undefined) {
    return true;
  }

  const prevToken = previous?.access_token ?? null;
  const nextToken = next?.access_token ?? null;

  return prevToken !== nextToken || previous?.user?.id !== next?.user?.id;
}

export function getCachedSupabaseSession() {
  return sessionState.session;
}

function initSession() {
  const supabase = createBrowserSupabaseClient();

  if (!supabase) {
    notifySubscribers(null);
    return;
  }

  // Fall back to null if getSession takes longer than 15 s
  const timeout = window.setTimeout(() => {
    notifySubscribers(null);
  }, 15_000);

  void supabase.auth.getSession().then(({ data }) => {
    window.clearTimeout(timeout);
    notifySubscribers(data.session ?? null);
  }).catch(() => {
    window.clearTimeout(timeout);
    notifySubscribers(null);
  });

  if (!sessionState.subscription) {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      notifySubscribers(nextSession ?? null);
    });
    sessionState.subscription = data.subscription;
  }
}

export function useSupabaseSession() {
  const [session, setSession] = useState<Session | null | undefined>(() => sessionState.session);

  useEffect(() => {
    sessionState.subscribers.push(setSession);

    if (!sessionState.initialized) {
      sessionState.initialized = true;
      initSession();
    } else {
      setSession(sessionState.session);
    }

    return () => {
      sessionState.subscribers = sessionState.subscribers.filter((subscriber) => subscriber !== setSession);
    };
  }, []);

  return session;
}
