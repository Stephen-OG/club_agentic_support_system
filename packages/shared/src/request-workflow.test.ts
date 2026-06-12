import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareStaffRolesByAuthority, getPrimaryStaffRole } from "./request-workflow";

describe("staff role authority", () => {
  it("orders staff roles by authorization authority", () => {
    const roles = ["read_only", "staff", "security", "manager", "owner", "admin"] as const;

    assert.deepEqual([...roles].sort(compareStaffRolesByAuthority), ["owner", "admin", "manager", "security", "staff", "read_only"]);
  });

  it("selects the primary membership using the shared role authority order", () => {
    const primary = getPrimaryStaffRole([
      { id: "staff-membership", role: "staff" as const },
      { id: "manager-membership", role: "manager" as const },
      { id: "owner-membership", role: "owner" as const }
    ]);

    assert.equal(primary?.id, "owner-membership");
  });
});
