import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { SessionAuthGuard } from "./session-auth.guard";

function contextWithAuthHeader(value?: string): ExecutionContext {
  const request = {
    headers: value ? { authorization: value } : {}
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}

describe("SessionAuthGuard", () => {
  it("creates auth context from an app session linked to active membership", async () => {
    const guard = new SessionAuthGuard(
      {
        verifyBearerToken: async (token: string) => ({
          user: {
            id: token,
            email: "admin@example.com",
            displayName: "Admin User",
            mustChangePassword: false
          }
        })
      } as any,
      {
        staffProfile: {
          findUnique: async () => ({
            id: "staff-1",
            authUserId: "auth-1",
            email: "admin@example.com",
            displayName: "Admin User",
            memberships: [
              {
                id: "membership-1",
                workspaceId: "workspace-1",
                venueId: null,
                role: "ADMIN",
                isActive: true,
                workspace: { id: "workspace-1", name: "Workspace", slug: "workspace" },
                venue: null
              }
            ]
          })
        }
      } as any
    );

    const context = contextWithAuthHeader("Bearer auth-1");
    assert.equal(await guard.canActivate(context), true);
    const request = context.switchToHttp().getRequest() as any;
    assert.equal(request.auth.staffProfileId, "staff-1");
    assert.equal(request.auth.workspaceId, "workspace-1");
    assert.equal(request.auth.role, "admin");
    assert.equal(request.currentUser.mustChangePassword, false);
  });

  it("rejects requests without bearer tokens", async () => {
    const guard = new SessionAuthGuard({} as any, {} as any);
    await assert.rejects(() => guard.canActivate(contextWithAuthHeader()), UnauthorizedException);
  });
});
