import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMissingDatabaseTablesError, getMissingDatabaseTables, assertDatabaseUrl } from "./prisma.service";

describe("PrismaService", () => {
  it("fails fast when DATABASE_URL is missing", async () => {
    assert.throws(() => assertDatabaseUrl(""), /DATABASE_URL is required/);
  });

  it("detects missing first-party auth tables with a migration hint", () => {
    const missing = getMissingDatabaseTables(["Workspace", "StaffProfile"]);

    assert.deepEqual(missing, ["AuthUser", "AuthSession", "AuthEmailToken"]);
    assert.match(formatMissingDatabaseTablesError(missing), /npx prisma db push --schema packages\/database\/prisma\/schema.prisma/);
  });
});
