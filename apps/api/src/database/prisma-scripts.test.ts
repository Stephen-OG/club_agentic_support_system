import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(__dirname, "../../../../", path), "utf8")) as {
    scripts?: Record<string, string>;
  };
}

describe("Prisma package scripts", () => {
  it("keeps production migration deploy separate from local schema sync", () => {
    const rootPackage = readJson("package.json");
    const databasePackage = readJson("packages/database/package.json");

    assert.equal(rootPackage.scripts?.["prisma:push"], "npm run prisma:push -w @madupe/database");
    assert.equal(rootPackage.scripts?.["prisma:migrate:deploy"], "npm run prisma:migrate:deploy -w @madupe/database");
    assert.equal(databasePackage.scripts?.["prisma:push"], "prisma db push --schema prisma/schema.prisma");
    assert.equal(databasePackage.scripts?.["prisma:migrate:deploy"], "prisma migrate deploy --schema prisma/schema.prisma");
    assert.notEqual(databasePackage.scripts?.["prisma:migrate"], "prisma migrate dev --schema prisma/schema.prisma");
  });
});
