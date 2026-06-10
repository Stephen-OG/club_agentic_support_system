"use client";

import { useEffect, useState } from "react";
import type { AppAuthSession } from "./browser";
import { createBrowserAuthClient } from "./browser";

type Subscriber = (session: AppAuthSession | null | undefined) => void;

const sessionState: {
  session: AppAuthSession | null | undefined;
  initialized: boolean;
  subscribers: Subscriber[];
  subscription: { unsubscribe: () => void } | null;
} = {
  session: undefined,
  initialized: false,
  subscribers: [],
  subscription: null
};

function notifySubscribers(nextSession: AppAuthSession | null | undefined) {
  const prev = sessionState.session;

  if (!shouldNotifySessionChange(prev, nextSession)) {
    return;
  }

  sessionState.session = nextSession;
  sessionState.subscribers.forEach((subscriber) => subscriber(nextSession));
}

export function shouldNotifySessionChange(previous: AppAuthSession | null | undefined, next: AppAuthSession | null | undefined) {
  if (previous === undefined) {
    return true;
  }

  const prevToken = previous?.access_token ?? null;
  const nextToken = next?.access_token ?? null;

  return prevToken !== nextToken || previous?.user?.id !== next?.user?.id;
}

export function getCachedAuthSession() {
  return sessionState.session;
}

function initSession() {
  const auth = createBrowserAuthClient();

  void auth.auth.getSession().then(({ data }) => {
    notifySubscribers(data.session ?? null);
  }).catch(() => {
    notifySubscribers(null);
  });

  if (!sessionState.subscription) {
    const { data } = auth.auth.onAuthStateChange((_event, nextSession) => {
      notifySubscribers(nextSession ?? null);
    });
    sessionState.subscription = data.subscription;
  }
}

export function useAuthSession() {
  const [session, setSession] = useState<AppAuthSession | null | undefined>(() => sessionState.session);

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
