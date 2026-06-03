import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { OnboardingService } from "./onboarding.service";

const ownerAuth: AuthContext = {
  staffProfileId: "staff_owner",
  workspaceId: "workspace_1",
  role: "owner"
};

describe("OnboardingService", () => {
  it("derives launch checklist status from existing workspace data", async () => {
    const calls: Array<{ model: string; args: unknown }> = [];
    const service = new OnboardingService({
      venue: {
        count: async (args: unknown) => {
          calls.push({ model: "venue.count", args });
          if ((args as any).where.openingHours) return 1;
          return 1;
        }
      },
      servicePoint: {
        count: async (args: unknown) => {
          calls.push({ model: "servicePoint.count", args });
          return 2;
        }
      },
      staffMembership: {
        count: async (args: unknown) => {
          calls.push({ model: "staffMembership.count", args });
          if ((args as any).where.role) return 1;
          return 3;
        }
      },
      supportRequest: {
        count: async (args: unknown) => {
          calls.push({ model: "supportRequest.count", args });
          return 0;
        }
      }
    } as never);

    const result = await service.getStatus(ownerAuth);

    assert.equal(result.totalCount, 6);
    assert.equal(result.completedCount, 5);
    assert.equal(result.isComplete, false);
    assert.deepEqual(
      result.steps.map((step) => [step.id, step.complete, step.actionView]),
      [
        ["workspace", true, "account"],
        ["venue", true, "venues"],
        ["opening_hours", true, "account"],
        ["qr_points", true, "venues"],
        ["team", true, "team"],
        ["test_request", false, "operations"]
      ]
    );
    assert.deepEqual(calls[0], {
      model: "venue.count",
      args: { where: { workspaceId: ownerAuth.workspaceId } }
    });
    assert.deepEqual(calls[3], {
      model: "staffMembership.count",
      args: { where: { workspaceId: ownerAuth.workspaceId, isActive: true } }
    });
  });

  it("requires owner or admin access", async () => {
    const service = new OnboardingService({} as never);

    await assert.rejects(() => service.getStatus({ ...ownerAuth, role: "manager" }), ForbiddenException);
  });

  it("requires at least one operational staff role before marking team setup complete", async () => {
    const service = new OnboardingService({
      venue: {
        count: async () => 1
      },
      servicePoint: {
        count: async () => 1
      },
      staffMembership: {
        count: async (args: unknown) => ((args as any).where.role?.in?.includes(StaffRole.STAFF) ? 0 : 2)
      },
      supportRequest: {
        count: async () => 1
      }
    } as never);

    const result = await service.getStatus(ownerAuth);
    const teamStep = result.steps.find((step) => step.id === "team");

    assert.equal(teamStep?.complete, false);
    assert.equal(result.isComplete, false);
  });
});
