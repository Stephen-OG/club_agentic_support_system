const { spawnSync } = require("node:child_process");
const { readdirSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");

function collectTests(dir) {
  const tests = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      tests.push(...collectTests(path));
      continue;
    }

    if (entry.endsWith(".test.ts")) {
      tests.push(path);
    }
  }

  return tests;
}

const explicitFiles = process.argv.slice(2);
const testFiles =
  explicitFiles.length > 0 ? explicitFiles : collectTests("src").map((path) => relative(process.cwd(), path));

if (testFiles.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "-r", "ts-node/register", "-r", "tsconfig-paths/register", ...testFiles],
  {
    stdio: "inherit"
  }
);

process.exit(result.status ?? 1);
