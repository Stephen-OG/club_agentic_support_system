import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SetupService } from "./signup.service";

const setupInput = {
  displayName: "Alex Owner",
  email: "OWNER@example.com",
  venueName: "Main Venue",
  venueSlug: "main-venue",
  workspaceName: "Madupe Group",
  workspaceSlug: "madupe-group"
};

describe("SetupService", () => {
  it("creates the initial owner membership scoped to the created venue", async () => {
    let membershipData: Record<string, unknown> | null = null;
    const service = new SetupService(
      {
        authUser: {
          findUnique: async ({ where }: any) => (where.id === "auth-1" ? { id: "auth-1", email: "owner@example.com", emailVerifiedAt: new Date() } : null)
        },
        staffProfile: {
          findUnique: async () => null
        },
        workspace: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => null
        },
        $transaction: async (operation: any) =>
          operation({
            workspace: {
              create: async ({ data }: any) => ({ id: "workspace-1", ...data }),
              findUnique: async () => null
            },
            staffProfile: {
              create: async ({ data }: any) => ({ id: "staff-1", ...data })
            },
            venue: {
              create: async ({ data }: any) => ({ id: "venue-1", ...data }),
              findFirst: async () => null
            },
            staffMembership: {
              create: async ({ data }: any) => {
                membershipData = data;
                return { id: "membership-1", ...data };
              }
            }
          })
      } as any,
      {
        error: () => undefined,
        logEvent: () => undefined,
        warn: () => undefined
      } as any
    );

    const result = await service.initialize(setupInput, "auth-1");

    assert.equal(result.venueId, "venue-1");
    assert.deepEqual(membershipData, {
      workspaceId: "workspace-1",
      venueId: "venue-1",
      staffProfileId: "staff-1",
      role: "OWNER"
    });
  });

  it("requires setup to use the authenticated auth user id", async () => {
    const service = new SetupService(
      {
        authUser: {
          findUnique: async ({ where }: any) =>
            where.id === "auth-2" ? { id: "auth-2", email: "other@example.com", emailVerifiedAt: new Date() } : null
        },
        staffProfile: {
          findUnique: async () => null
        },
        workspace: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => null
        }
      } as any,
      {
        error: () => undefined,
        logEvent: () => undefined,
        warn: () => undefined
      } as any
    );

    await assert.rejects(() => service.initialize(setupInput, "auth-2"), /authenticated session/);
  });
});
