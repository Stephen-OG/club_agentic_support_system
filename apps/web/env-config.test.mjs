import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadWorkspaceEnv } from "./env-config.mjs";

describe("loadWorkspaceEnv", () => {
  it("uses app env values over repo root values", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "guestos-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, ".env"), "NEXT_PUBLIC_SUPABASE_URL=https://root.example\nPORT=5000\nHOST=\"127.0.0.1\"\n");
    fs.writeFileSync(path.join(appDir, ".env"), "NEXT_PUBLIC_SUPABASE_URL=https://app.example\n");

    const result = loadWorkspaceEnv({ appDir, repoRoot: workspace, existingEnv: {} });

    assert.equal(result.publicEnv.NEXT_PUBLIC_SUPABASE_URL, "https://app.example");
    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:5000");
  });

  it("keeps explicit process env values as highest priority", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "guestos-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, ".env"), "PORT=5000\nHOST=127.0.0.1\n");

    const result = loadWorkspaceEnv({
      appDir,
      repoRoot: workspace,
      existingEnv: {
        NEXT_PUBLIC_API_URL: "https://api.example"
      }
    });

    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "https://api.example");
  });
});
