import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { StaffService } from "./staff.service";

const adminAuth = { staffProfileId: "admin-1", workspaceId: "workspace-1", role: "admin" as const };
const staffAuth = { staffProfileId: "staff-1", workspaceId: "workspace-1", venueId: "venue-1", role: "staff" as const };

describe("StaffService", () => {
  it("creates a Supabase auth user, staff profile, and membership for admins", async () => {
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        $transaction: async (operation: any) =>
          operation({
            staffProfile: {
              create: async ({ data }: any) => ({ id: "profile-1", ...data })
            },
            staffMembership: {
              create: async ({ data }: any) => ({ id: "membership-1", ...data })
            }
          })
      } as any,
      {
        createTemporaryPasswordUser: async () => ({ id: "auth-1", email: "sam@example.com" })
      } as any
    );

    const result = await service.createStaffUser(adminAuth, {
      email: "sam@example.com",
      displayName: "Sam Service",
      role: "staff",
      venueId: "venue-1"
    });

    assert.equal(result.staff.authUserId, "auth-1");
    assert.equal(result.staff.email, "sam@example.com");
    assert.equal(result.membership.role, "STAFF");
    assert.match(result.temporaryPassword, /^GuestOS-/);
  });

  it("rejects non-admin user creation", async () => {
    const service = new StaffService({} as any, {} as any);
    await assert.rejects(
      () =>
        service.createStaffUser(staffAuth, {
          email: "new@example.com",
          displayName: "New User",
          role: "staff",
          venueId: "venue-1"
        }),
      ForbiddenException
    );
  });
});
