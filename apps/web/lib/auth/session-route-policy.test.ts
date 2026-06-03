import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSignedInRouteAction, mustChangePassword } from "./session-route-policy";
import type { CommandUser } from "./types";

const userWithRole = (role: CommandUser["memberships"][number]["role"]): CommandUser => ({
  id: `user_${role}`,
  authUserId: `auth_${role}`,
  email: `${role}@example.com`,
  displayName: role,
  memberships: [
    {
      id: `membership_${role}`,
      workspaceId: "workspace_1",
      venueId: role === "admin" ? null : "venue_1",
      role,
      workspace: { id: "workspace_1", name: "Workspace", slug: "workspace" },
      venue: role === "admin" ? null : { id: "venue_1", name: "Main Room", slug: "main-room" }
    }
  ]
});

describe("session route policy", () => {
  it("keeps temporary-password sessions on the password change flow", () => {
    assert.equal(mustChangePassword({ user_metadata: { mustChangePassword: true } }), true);
    assert.deepEqual(
      getSignedInRouteAction({
        user: userWithRole("staff"),
        userMetadata: { mustChangePassword: true }
      }),
      { kind: "password-change" }
    );
  });

  it("routes command roles to command and venue roles to staff", () => {
    assert.deepEqual(getSignedInRouteAction({ user: userWithRole("admin"), userMetadata: {} }), {
      kind: "redirect",
      path: "/command"
    });
    assert.deepEqual(getSignedInRouteAction({ user: userWithRole("staff"), userMetadata: {} }), {
      kind: "redirect",
      path: "/staff"
    });
  });
});
