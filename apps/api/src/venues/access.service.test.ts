import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { VenueAccessService } from "./access.service";

describe("VenueAccessService", () => {
  const service = new VenueAccessService();

  it("allows admin to access any venue in their organization", () => {
    assert.equal(
      service.canManageVenue({ staffProfileId: "a", organizationId: "o1", role: "admin" }, { organizationId: "o1", venueId: "v2" }),
      true
    );
  });

  it("allows manager only for their assigned venue", () => {
    assert.equal(
      service.canManageVenue({ staffProfileId: "m", organizationId: "o1", venueId: "v1", role: "manager" }, { organizationId: "o1", venueId: "v1" }),
      true
    );
    assert.equal(
      service.canManageVenue({ staffProfileId: "m", organizationId: "o1", venueId: "v1", role: "manager" }, { organizationId: "o1", venueId: "v2" }),
      false
    );
  });

  it("treats owner as organization-wide", () => {
    const ownerAuth = { staffProfileId: "o", organizationId: "o1", venueId: "v1", role: "owner" as const };

    assert.equal(service.canManageOrganization(ownerAuth, "o1"), true);
    assert.equal(service.canManageVenue(ownerAuth, { organizationId: "o1", venueId: "v1" }), true);
    assert.equal(service.canManageVenue(ownerAuth, { organizationId: "o1", venueId: "v2" }), true);
  });

  it("throws forbidden when access is denied", () => {
    assert.throws(
      () => service.assertCanManageVenue({ staffProfileId: "s", organizationId: "o1", venueId: "v1", role: "staff" }, { organizationId: "o1", venueId: "v1" }),
      ForbiddenException
    );
  });

  it("allows read-only staff to read their assigned venue without operating it", () => {
    const auth = { staffProfileId: "r", organizationId: "o1", venueId: "v1", role: "read_only" as const };

    assert.equal(service.canReadVenue(auth, { organizationId: "o1", venueId: "v1" }), true);
    assert.equal(service.canOperateVenue(auth, { organizationId: "o1", venueId: "v1" }), false);
  });
});
