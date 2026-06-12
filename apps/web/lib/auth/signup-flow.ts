export type SignupCompletionAction = { kind: "setup" } | { kind: "verify-email" };
export type AuthEntry = "signin" | "signup";
export type LoginMode = AuthEntry | "reset_request" | "reset_confirm";

export function getSignupCompletionAction(input: { hasSession: boolean }): SignupCompletionAction {
  return input.hasSession ? { kind: "setup" } : { kind: "verify-email" };
}

export function normalizeSignupSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getSignupSlugError(label: string, slug: string) {
  if (!slug) {
    return `${label} slug is required.`;
  }

  if (slug.length < 3) {
    return `${label} slug must be at least 3 characters.`;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return `${label} slug can only use lowercase letters, numbers, and single hyphens.`;
  }

  return null;
}

export function getAuthEntryHref(entry: AuthEntry) {
  return entry === "signup" ? "/login?mode=signup" : "/login";
}

export function getLoginModeFromSearchParams(params: URLSearchParams): LoginMode {
  const mode = params.get("mode");

  if (mode === "signup" || mode === "reset_request" || mode === "reset_confirm") {
    return mode;
  }

  return "signin";
}
