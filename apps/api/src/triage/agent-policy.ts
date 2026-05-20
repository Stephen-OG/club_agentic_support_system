import type { AgentAction, AgentPolicyVersion, RequestPriority } from "@guestos/shared";

const routinePriorities = new Set<RequestPriority>(["low", "normal"]);

export function isAgentActionAllowed(
  version: AgentPolicyVersion,
  action: AgentAction,
  priority: RequestPriority
) {
  if (version === "v1-assistive") {
    return false;
  }

  if (version === "v1-semi-autonomous") {
    if (action === "reply") {
      return priority !== "urgent";
    }

    if (action === "assign") {
      return routinePriorities.has(priority);
    }

    return false;
  }

  if (version === "v2-autonomous-within-rules") {
    return priority === "urgent" ? action === "escalate" : true;
  }

  return false;
}
