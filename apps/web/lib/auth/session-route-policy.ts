import { hasCommandDashboardAccess } from "./role-policy";
import type { CommandUser } from "./types";

export type SignedInRouteAction =
  | { kind: "password-change" }
  | { kind: "redirect"; path: "/command" | "/staff" };

type UserMetadataSource = {
  user_metadata?: {
    mustChangePassword?: unknown;
  } | null;
};

export function mustChangePassword(source: UserMetadataSource | null | undefined) {
  return source?.user_metadata?.mustChangePassword === true;
}

export function getSignedInRouteAction(input: {
  user: CommandUser;
  userMetadata: { mustChangePassword?: unknown } | null | undefined;
}): SignedInRouteAction {
  if (input.userMetadata?.mustChangePassword === true) {
    return { kind: "password-change" };
  }

  if (hasCommandDashboardAccess(input.user)) {
    return { kind: "redirect", path: "/command" };
  }

  return { kind: "redirect", path: "/staff" };
}
