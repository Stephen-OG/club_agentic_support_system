import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { StaffService } from "./staff.service";

const adminAuth = { staffProfileId: "admin-1", workspaceId: "workspace-1", role: "admin" as const };
const staffAuth = { staffProfileId: "staff-1", workspaceId: "workspace-1", venueId: "venue-1", role: "staff" as const };
const ownerAuth = { staffProfileId: "owner-1", workspaceId: "workspace-1", venueId: "venue-1", role: "owner" as const };
const managerAuth = { staffProfileId: "manager-1", workspaceId: "workspace-1", venueId: "venue-1", role: "manager" as const };

describe("StaffService", () => {
  it("creates an app auth user, staff profile, and membership for admins", async () => {
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => ({ id: "venue-1", workspaceId: "workspace-1" })
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
    assert.match(result.temporaryPassword, /^Madupe-/);
  });

  it("sends a staff invitation email after creating app auth credentials", async () => {
    const invitations: unknown[] = [];
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => ({ id: "venue-1", workspaceId: "workspace-1" })
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
        createTemporaryPasswordUser: async () => ({ id: "auth-1", email: "sam@example.com" }),
        sendStaffInvitationEmail: async (input: unknown) => {
          invitations.push(input);
        }
      } as any
    );

    await service.createStaffUser(adminAuth, {
      email: "sam@example.com",
      displayName: "Sam Service",
      role: "staff",
      temporaryPassword: "Madupe-temporary-1!",
      venueId: "venue-1"
    });

    assert.deepEqual(invitations, [
      {
        authUserId: "auth-1",
        email: "sam@example.com",
        displayName: "Sam Service",
        temporaryPassword: "Madupe-temporary-1!"
      }
    ]);
  });

  it("stores venue owners as venue-scoped memberships", async () => {
    let membershipData: any = null;
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => ({ id: "venue-1", workspaceId: "workspace-1" })
        },
        $transaction: async (operation: any) =>
          operation({
            staffProfile: {
              create: async ({ data }: any) => ({ id: "profile-owner", ...data })
            },
            staffMembership: {
              create: async ({ data }: any) => {
                membershipData = data;
                return { id: "membership-owner", ...data };
              }
            }
          })
      } as any,
      {
        createTemporaryPasswordUser: async () => ({ id: "auth-owner", email: "owner@example.com" })
      } as any
    );

    const result = await service.createStaffUser(adminAuth, {
      email: "owner@example.com",
      displayName: "Venue Owner",
      role: "owner",
      venueId: "venue-1"
    });

    assert.equal(result.membership.role, "OWNER");
    assert.equal(membershipData.venueId, "venue-1");
  });

  it("allows venue owners and managers to create venue-scoped staff for their own venue", async () => {
    const createdMemberships: any[] = [];
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => ({ id: "venue-1", workspaceId: "workspace-1" })
        },
        $transaction: async (operation: any) =>
          operation({
            staffProfile: {
              create: async ({ data }: any) => ({ id: `profile-${createdMemberships.length + 1}`, ...data })
            },
            staffMembership: {
              create: async ({ data }: any) => {
                createdMemberships.push(data);
                return { id: `membership-${createdMemberships.length}`, ...data };
              }
            }
          })
      } as any,
      {
        createTemporaryPasswordUser: async ({ email }: any) => ({ id: `auth-${email}`, email })
      } as any
    );

    await service.createStaffUser(ownerAuth, {
      email: "owner-created@example.com",
      displayName: "Owner Created",
      role: "staff",
      venueId: "venue-1"
    });
    await service.createStaffUser(managerAuth, {
      email: "manager-created@example.com",
      displayName: "Manager Created",
      role: "security"
    });

    assert.deepEqual(
      createdMemberships.map((membership) => ({ role: membership.role, venueId: membership.venueId })),
      [
        { role: "STAFF", venueId: "venue-1" },
        { role: "SECURITY", venueId: "venue-1" }
      ]
    );
  });

  it("allows workspace owners without a venue membership to manage venue-scoped staff", async () => {
    const workspaceOwnerAuth = { staffProfileId: "owner-workspace", workspaceId: "workspace-1", role: "owner" as const };
    const createdMemberships: any[] = [];
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => ({ id: "venue-1", workspaceId: "workspace-1" })
        },
        $transaction: async (operation: any) =>
          operation({
            staffProfile: {
              create: async ({ data }: any) => ({ id: `profile-${createdMemberships.length + 1}`, ...data })
            },
            staffMembership: {
              create: async ({ data }: any) => {
                createdMemberships.push(data);
                return { id: `membership-${createdMemberships.length}`, ...data };
              }
            }
          })
      } as any,
      {
        createTemporaryPasswordUser: async ({ email }: any) => ({ id: `auth-${email}`, email })
      } as any
    );

    await service.createStaffUser(workspaceOwnerAuth, {
      email: "workspace-owner-created@example.com",
      displayName: "Workspace Owner Created",
      role: "staff",
      venueId: "venue-1"
    });

    assert.deepEqual(createdMemberships.map((membership) => ({ role: membership.role, venueId: membership.venueId })), [
      { role: "STAFF", venueId: "venue-1" }
    ]);
  });

  it("rejects venue managers creating users for a different venue or platform role", async () => {
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        }
      } as any,
      {} as any
    );

    await assert.rejects(
      () =>
        service.createStaffUser(managerAuth, {
          email: "other@example.com",
          displayName: "Other Venue",
          role: "staff",
          venueId: "venue-2"
        }),
      ForbiddenException
    );
    await assert.rejects(
      () =>
        service.createStaffUser(managerAuth, {
          email: "admin@example.com",
          displayName: "Admin",
          role: "admin"
        }),
      ForbiddenException
    );
  });

  it("rejects admin venue-scoped user creation when the venue is outside the workspace", async () => {
    let createdAuthUser = false;
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => null
        }
      } as any,
      {
        createTemporaryPasswordUser: async () => {
          createdAuthUser = true;
          return { id: "auth-cross-workspace" };
        }
      } as any
    );

    await assert.rejects(
      () =>
        service.createStaffUser(adminAuth, {
          email: "cross-workspace@example.com",
          displayName: "Cross Workspace",
          role: "staff",
          venueId: "venue-outside-workspace"
        }),
      ForbiddenException
    );
    assert.equal(createdAuthUser, false);
  });

  it("rejects admin venue-scoped user creation when no venue is selected", async () => {
    let createdAuthUser = false;
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        }
      } as any,
      {
        createTemporaryPasswordUser: async () => {
          createdAuthUser = true;
          return { id: "auth-missing-venue" };
        }
      } as any
    );

    await assert.rejects(
      () =>
        service.createStaffUser(adminAuth, {
          email: "missing-venue@example.com",
          displayName: "Missing Venue",
          role: "staff"
        }),
      ForbiddenException
    );
    assert.equal(createdAuthUser, false);
  });

  it("deletes the temporary app auth user when staff profile persistence fails", async () => {
    const deletedAuthUserIds: string[] = [];
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null
        },
        venue: {
          findFirst: async () => ({ id: "venue-1", workspaceId: "workspace-1" })
        },
        $transaction: async () => {
          throw new Error("database write failed");
        }
      } as any,
      {
        createTemporaryPasswordUser: async () => ({ id: "auth-to-clean-up" }),
        deleteUser: async (authUserId: string) => {
          deletedAuthUserIds.push(authUserId);
        }
      } as any
    );

    await assert.rejects(
      () =>
        service.createStaffUser(adminAuth, {
          email: "rollback@example.com",
          displayName: "Rollback User",
          role: "staff",
          venueId: "venue-1"
        }),
      /database write failed/
    );
    assert.deepEqual(deletedAuthUserIds, ["auth-to-clean-up"]);
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
