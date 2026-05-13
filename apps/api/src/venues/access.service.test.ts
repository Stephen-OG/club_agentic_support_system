import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { VenueAccessService } from "./access.service";

describe("VenueAccessService", () => {
  const service = new VenueAccessService();

  it("allows admin to access any venue in their workspace", () => {
    assert.equal(
      service.canManageVenue({ staffProfileId: "a", workspaceId: "w1", role: "admin" }, { workspaceId: "w1", venueId: "v2" }),
      true
    );
  });

  it("allows manager only for their assigned venue", () => {
    assert.equal(
      service.canManageVenue({ staffProfileId: "m", workspaceId: "w1", venueId: "v1", role: "manager" }, { workspaceId: "w1", venueId: "v1" }),
      true
    );
    assert.equal(
      service.canManageVenue({ staffProfileId: "m", workspaceId: "w1", venueId: "v1", role: "manager" }, { workspaceId: "w1", venueId: "v2" }),
      false
    );
  });

  it("throws forbidden when access is denied", () => {
    assert.throws(
      () => service.assertCanManageVenue({ staffProfileId: "s", workspaceId: "w1", venueId: "v1", role: "staff" }, { workspaceId: "w1", venueId: "v1" }),
      ForbiddenException
    );
  });
});
