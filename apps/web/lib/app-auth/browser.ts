"use client";

import { apiBaseUrl, createApiUnreachableError } from "@/lib/api/client";

export type AppAuthUser = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  user_metadata: {
    displayName?: string;
    mustChangePassword?: boolean;
    [key: string]: unknown;
  };
};

export type AppAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
  user: AppAuthUser;
};

export type AppAuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: AppAuthSession | null } }>;
    getUser: () => Promise<{ data: { user: AppAuthUser | null } }>;
    signInWithPassword: (input: { email: string; password: string }) => Promise<{ data: { session: AppAuthSession | null }; error: Error | null }>;
    signOut: () => Promise<{ error: Error | null }>;
    signUp: (input: {
      email: string;
      password: string;
      options?: { data?: { displayName?: string; [key: string]: unknown }; emailRedirectTo?: string };
    }) => Promise<{ data: { session: AppAuthSession | null }; error: Error | null }>;
    changeUnverifiedEmail: (input: { currentEmail: string; newEmail: string }) => Promise<{ error: Error | null }>;
    verifyEmailCode: (input: { email: string; code: string }) => Promise<{ error: Error | null }>;
    updatePassword: (input: { oldPassword: string; password: string }) => Promise<{ error: Error | null }>;
    requestPasswordReset: (input: { email: string }) => Promise<{ error: Error | null }>;
    resetPassword: (input: { token: string; password: string }) => Promise<{ error: Error | null }>;
    onAuthStateChange: (
      callback: (event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED", session: AppAuthSession | null) => void
    ) => { data: { subscription: { unsubscribe: () => void } } };
  };
};

type BrowserAuthRegistry = {
  client: AppAuthClient | null;
};

const registryKey = "__madupeBrowserAuth";
const storageKey = "madupe.auth.session";
const subscribers = new Set<(event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED", session: AppAuthSession | null) => void>();

function getRegistry() {
  const globalScope = globalThis as typeof globalThis & {
    [registryKey]?: BrowserAuthRegistry;
  };

  globalScope[registryKey] ??= {
    client: null
  };

  return globalScope[registryKey];
}

export function createBrowserAuthClient() {
  const registry = getRegistry();

  if (registry.client) {
    return registry.client;
  }

  registry.client = {
    auth: {
      getSession: async () => ({ data: { session: await readValidSession() } }),
      getUser: async () => ({ data: { user: (await readValidSession())?.user ?? null } }),
      signInWithPassword: async ({ email, password }) => authRequest("/auth/signin", { email, password }),
      signOut: async () => {
        const session = readStoredSession();

        if (session) {
          await fetch(`${apiBaseUrl}/auth/signout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            }
          }).catch(() => undefined);
        }

        writeSession(null, "SIGNED_OUT");
        return { error: null };
      },
      signUp: async ({ email, password, options }) =>
        authRequest("/auth/signup", { email, password, displayName: options?.data?.displayName }),
      changeUnverifiedEmail: async ({ currentEmail, newEmail }) => commandRequest("/auth/signup/email", { currentEmail, newEmail }),
      verifyEmailCode: async ({ email, code }) => commandRequest("/auth/verify-email", { email, code }),
      requestPasswordReset: async ({ email }) => commandRequest("/auth/password-reset/request", { email }),
      resetPassword: async ({ token, password }) => commandRequest("/auth/password-reset/confirm", { token, password }),
      updatePassword: async ({ oldPassword, password }) => {
        const session = await readValidSession();

        if (!session) {
          return { error: new Error("You are not signed in") };
        }

        try {
          const response = await fetch(`${apiBaseUrl}/auth/password`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ oldPassword, password })
          });

          if (!response.ok) {
            const body = await response.json().catch(() => null);
            return { error: new Error(body?.message || body?.error || "Password update failed") };
          }

          const nextSession = (await response.json().catch(() => null)) as AppAuthSession | null;
          if (!nextSession?.access_token || !nextSession.refresh_token) {
            writeSession(null, "SIGNED_OUT");
            return { error: new Error("Password update did not return a new session") };
          }

          writeSession(nextSession, "TOKEN_REFRESHED");
          return { error: null };
        } catch {
          return { error: createApiUnreachableError() };
        }
      },
      onAuthStateChange: (callback) => {
        subscribers.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => subscribers.delete(callback)
            }
          }
        };
      }
    }
  };

  return registry.client;
}

async function commandRequest(path: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return { error: new Error(data?.message || data?.error || "Request failed") };
    }

    return { error: null };
  } catch {
    return { error: createApiUnreachableError() };
  }
}

async function authRequest(path: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return { data: { session: null }, error: new Error(data?.message || data?.error || "Authentication failed") };
    }

    const session = (data?.access_token ? data : data?.session) as AppAuthSession | null;
    if (!session) {
      return { data: { session: null }, error: null };
    }

    writeSession(session, "SIGNED_IN");
    return { data: { session }, error: null };
  } catch {
    return { data: { session: null }, error: createApiUnreachableError() };
  }
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppAuthSession;
  } catch {
    writeSession(null, "SIGNED_OUT");
    return null;
  }
}

async function readValidSession() {
  const session = readStoredSession();
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() > Date.now() + 30_000) {
    return session;
  }

  if (!session.refresh_token || new Date(session.refresh_expires_at).getTime() <= Date.now()) {
    writeSession(null, "SIGNED_OUT");
    return null;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    if (!response.ok) {
      writeSession(null, "SIGNED_OUT");
      return null;
    }

    const refreshed = (await response.json()) as AppAuthSession;
    writeSession(refreshed, "TOKEN_REFRESHED");
    return refreshed;
  } catch {
    return session;
  }
}

function writeSession(session: AppAuthSession | null, event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED") {
  if (typeof window !== "undefined") {
    if (session) {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }

  subscribers.forEach((subscriber) => subscriber(event, session));
}
