import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertDatabaseUrl } from "./prisma.service";

describe("PrismaService", () => {
  it("fails fast when DATABASE_URL is missing", async () => {
    assert.throws(() => assertDatabaseUrl(""), /DATABASE_URL is required/);
  });
});
