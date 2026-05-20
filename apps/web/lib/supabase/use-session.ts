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

function notifySubscribers(session: Session | null | undefined) {
  sessionState.session = session;
  sessionState.subscribers.forEach((subscriber) => subscriber(session));
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

  void supabase.auth.getSession().then(({ data }) => {
    notifySubscribers(data.session);
  }).catch(() => {
    notifySubscribers(null);
  });

  if (!sessionState.subscription) {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      notifySubscribers(nextSession);
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
