import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExecutionContext } from "@nestjs/common";
import { DevAuthGuard } from "./dev-auth.guard";

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  const request = { headers };

  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}

describe("DevAuthGuard", () => {
  it("creates a staff auth context from development headers", () => {
    const guard = new DevAuthGuard();
    const context = contextWithHeaders({
      "x-staff-id": "staff-1",
      "x-workspace-id": "workspace-1",
      "x-venue-id": "venue-1",
      "x-staff-role": "manager"
    });

    assert.equal(guard.canActivate(context), true);
    const request = context.switchToHttp().getRequest();
    assert.deepEqual(request.auth, {
      staffProfileId: "staff-1",
      workspaceId: "workspace-1",
      venueId: "venue-1",
      role: "manager"
    });
  });
});
