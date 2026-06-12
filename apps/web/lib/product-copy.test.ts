import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const repoRoot = join(__dirname, "../../..");
const userFacingFiles = [
  "apps/web/app/components/venues-command.tsx",
  "apps/web/app/components/command-center-dashboard.tsx",
  "apps/web/app/components/operations-command.tsx",
  "apps/web/app/components/staff-dashboard.tsx",
  "apps/web/app/page.tsx"
];

describe("product copy", () => {
  it("uses service-point language in user-facing surfaces", () => {
    const forbidden = /\bQR point(s)?\b/g;
    const offenders = userFacingFiles.flatMap((file) => {
      const body = readFileSync(join(repoRoot, file), "utf8");
      return [...body.matchAll(forbidden)].map((match) => `${file}: ${match[0]}`);
    });

    assert.deepEqual(offenders, []);
  });
});
