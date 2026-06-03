export type SignupCompletionAction = { kind: "setup" } | { kind: "verify-email" };

export function getSignupCompletionAction(input: { hasSession: boolean }): SignupCompletionAction {
  return input.hasSession ? { kind: "setup" } : { kind: "verify-email" };
}
