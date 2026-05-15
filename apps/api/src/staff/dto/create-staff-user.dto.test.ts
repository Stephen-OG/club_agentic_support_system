import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate } from "class-validator";
import { CreateStaffUserDto } from "./create-staff-user.dto";

describe("CreateStaffUserDto", () => {
  it("accepts deterministic seeded Postgres UUIDs for venue-scoped roles", async () => {
    const dto = Object.assign(new CreateStaffUserDto(), {
      email: "staff1@example.com",
      displayName: "Staff 1",
      role: "staff",
      venueId: "00000000-0000-0000-0000-000000000101"
    });

    const errors = await validate(dto);

    assert.deepEqual(errors, []);
  });
});
