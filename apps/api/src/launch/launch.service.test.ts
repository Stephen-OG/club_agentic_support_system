import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { LaunchService } from "./launch.service";

const ownerAuth: AuthContext = {
  staffProfileId: "staff_owner",
  organizationId: "organization_1",
  role: "owner"
};

describe("LaunchService", () => {
  it("derives launch checklist status from existing organization data", async () => {
    const calls: Array<{ model: string; args: unknown }> = [];
    const service = new LaunchService({
      venue: {
        count: async (args: unknown) => {
          calls.push({ model: "venue.count", args });
          if ((args as any).where.hours) return 1;
          return 1;
        }
      },
      qrPoint: {
        count: async (args: unknown) => {
          calls.push({ model: "qrPoint.count", args });
          return 2;
        }
      },
      teamRole: {
        count: async (args: unknown) => {
          calls.push({ model: "teamRole.count", args });
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
        ["organization", true, "account"],
        ["venue", true, "venues"],
        ["opening_hours", true, "account"],
        ["qr_points", true, "venues"],
        ["team", true, "team"],
        ["test_request", false, "operations"]
      ]
    );
    assert.deepEqual(calls[0], {
      model: "venue.count",
      args: { where: { organizationId: ownerAuth.organizationId } }
    });
    assert.deepEqual(calls[3], {
      model: "teamRole.count",
      args: { where: { organizationId: ownerAuth.organizationId, isActive: true } }
    });

    const servicePointStep = result.steps.find((step) => step.id === "qr_points");
    assert.equal(servicePointStep?.label, "Generate guest service points");
    assert.equal(servicePointStep?.detail, "2 active service points ready.");
    assert.equal(servicePointStep?.actionLabel, "Manage service points");
  });

  it("requires owner or admin access", async () => {
    const service = new LaunchService({} as never);

    await assert.rejects(() => service.getStatus({ ...ownerAuth, role: "manager" }), ForbiddenException);
  });

  it("requires at least one operational staff role before marking team setup complete", async () => {
    const service = new LaunchService({
      venue: {
        count: async () => 1
      },
      qrPoint: {
        count: async () => 1
      },
      teamRole: {
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
