import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandRole, CommandUser } from "./auth/types";
import { getDashboardExperience } from "./dashboard-experience";

function userWithRole(role: CommandRole, venueId: string | null = "venue-1"): CommandUser {
  return {
    authUserId: `auth-${role}`,
    displayName: `${role} user`,
    email: `${role}@example.com`,
    id: `user-${role}`,
    memberships: [
      {
        id: `membership-${role}`,
        role,
        venueId,
        workspaceId: "workspace-1",
        workspace: { id: "workspace-1", name: "Demo Workspace", slug: "demo" },
        venue: venueId ? { id: venueId, name: "Main Room", slug: "main-room" } : null
      }
    ]
  };
}

describe("dashboard experience", () => {
  it("gives owners a workspace-level business dashboard", () => {
    const experience = getDashboardExperience(userWithRole("owner", null));

    assert.equal(experience.mode, "owner");
    assert.equal(experience.eyebrow, "Owner intelligence");
    assert.equal(experience.title, "Workspace Dashboard");
    assert.equal(experience.showLaunchChecklist, true);
    assert.equal(experience.scopeVenueIds, null);
    assert.equal(experience.panels.venuePerformance, true);
    assert.equal(experience.panels.aiTriageQuality, true);
  });

  it("gives admins a cross-venue operations dashboard", () => {
    const experience = getDashboardExperience(userWithRole("admin", null));

    assert.equal(experience.mode, "admin");
    assert.equal(experience.eyebrow, "Admin intelligence");
    assert.equal(experience.title, "Operations Dashboard");
    assert.equal(experience.showLaunchChecklist, false);
    assert.equal(experience.scopeVenueIds, null);
    assert.equal(experience.panels.adminControls, true);
    assert.equal(experience.panels.venuePerformance, true);
    assert.equal(experience.panels.staffWorkload, true);
  });

  it("scopes managers to their assigned venue and removes cross-venue panels", () => {
    const experience = getDashboardExperience(userWithRole("manager", "venue-1"));

    assert.equal(experience.mode, "manager");
    assert.equal(experience.eyebrow, "Manager intelligence");
    assert.equal(experience.title, "Venue Dashboard");
    assert.equal(experience.showLaunchChecklist, false);
    assert.deepEqual(experience.scopeVenueIds, ["venue-1"]);
    assert.equal(experience.scopeLabel, "Main Room");
    assert.equal(experience.panels.venuePerformance, false);
    assert.equal(experience.panels.aiTriageQuality, false);
    assert.equal(experience.panels.adminControls, false);
    assert.equal(experience.panels.servicePointHotspots, true);
  });
});
