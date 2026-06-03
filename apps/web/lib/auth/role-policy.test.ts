import type { CommandUser } from "./types";
import assert from "node:assert/strict";
import { getCommandViewHref, getRoleDashboardMode, getVisibleCommandViews, resolveCommandView } from "./role-policy";

const baseUser = (role: CommandUser["memberships"][number]["role"], venueId: string | null = "venue_1"): CommandUser => ({
  id: `user_${role}`,
  authUserId: `auth_${role}`,
  email: `${role}@email.com`,
  displayName: role,
  memberships: [
    {
      id: `membership_${role}`,
      workspaceId: "workspace_1",
      venueId,
      role,
      workspace: { id: "workspace_1", name: "Workspace", slug: "workspace" },
      venue: venueId ? { id: venueId, name: "Main Room", slug: "main-room" } : null
    }
  ]
});

const visibleIds = (user: CommandUser) => getVisibleCommandViews(user).map((view) => view.id);

assert.deepEqual(visibleIds(baseUser("admin", null)), ["dashboard", "operations", "team", "venues", "account"]);
assert.deepEqual(visibleIds(baseUser("owner")), ["dashboard", "operations", "team", "venues", "account"]);
assert.deepEqual(visibleIds(baseUser("manager")), ["dashboard", "operations", "team", "venues", "account"]);
assert.deepEqual(visibleIds(baseUser("staff")), ["staff", "account"]);
assert.deepEqual(visibleIds(baseUser("security")), ["staff", "account"]);
assert.deepEqual(visibleIds(baseUser("read_only")), ["staff", "account"]);
assert.equal(getVisibleCommandViews(baseUser("admin", null)).find((view) => view.id === "account")?.label, "Settings");

assert.equal(getRoleDashboardMode(baseUser("admin", null)), "command");
assert.equal(getRoleDashboardMode(baseUser("manager")), "command");
assert.equal(getRoleDashboardMode(baseUser("staff")), "staff");

assert.equal(resolveCommandView(baseUser("admin", null), "operations", "dashboard"), "operations");
assert.equal(resolveCommandView(baseUser("staff"), "operations", "staff"), "staff");
assert.equal(resolveCommandView(baseUser("manager"), "team", "dashboard"), "team");
assert.equal(getCommandViewHref("/command", "operations"), "/command?view=operations");
