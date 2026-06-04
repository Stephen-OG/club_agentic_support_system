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

  it("allows venue-scoped roles to omit venueId so the service can resolve the actor venue", async () => {
    const dto = Object.assign(new CreateStaffUserDto(), {
      email: "staff2@example.com",
      displayName: "Staff 2",
      role: "staff"
    });

    const errors = await validate(dto);

    assert.deepEqual(errors, []);
  });

  it("rejects malformed venue ids when provided", async () => {
    const dto = Object.assign(new CreateStaffUserDto(), {
      email: "staff3@example.com",
      displayName: "Staff 3",
      role: "staff",
      venueId: "venue-1"
    });

    const errors = await validate(dto);

    assert.equal(errors.some((error) => error.property === "venueId"), true);
  });
});
