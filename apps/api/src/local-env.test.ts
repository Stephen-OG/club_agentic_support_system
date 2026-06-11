import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadLocalEnvOverrides } from "./local-env";

describe("loadLocalEnvOverrides", () => {
  it("lets local repo env override inherited shell env outside production", () => {
    const root = mkdtempSync(join(tmpdir(), "madupe-env-"));
    const apiDir = join(root, "apps", "api");
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(root, ".env"), "DATABASE_URL=postgresql://mac@localhost:5432/madupe\n");
    writeFileSync(join(root, "apps", "api", ".env"), "PORT=4000\n");
    const env = {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://remote.example.com/postgres",
      PORT: "5000"
    };

    try {
      loadLocalEnvOverrides({ apiDir, env, repoRoot: root });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }

    assert.equal(env.DATABASE_URL, "postgresql://mac@localhost:5432/madupe");
    assert.equal(env.PORT, "4000");
  });

  it("does not override hosting env in production", () => {
    const root = mkdtempSync(join(tmpdir(), "madupe-env-"));
    const apiDir = join(root, "apps", "api");
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(root, ".env"), "DATABASE_URL=postgresql://mac@localhost:5432/madupe\n");
    writeFileSync(join(root, "apps", "api", ".env"), "PORT=4000\n");
    const env = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://remote.example.com/postgres",
      PORT: "5000"
    };

    try {
      loadLocalEnvOverrides({ apiDir, env, repoRoot: root });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }

    assert.equal(env.DATABASE_URL, "postgresql://remote.example.com/postgres");
    assert.equal(env.PORT, "5000");
  });
});
