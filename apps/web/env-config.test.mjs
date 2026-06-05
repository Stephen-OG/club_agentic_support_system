import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadWorkspaceEnv } from "./env-config.mjs";

describe("loadWorkspaceEnv", () => {
  it("uses app env values over repo root values", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, ".env"), "NEXT_PUBLIC_SUPABASE_URL=https://root.example\nPORT=5000\nHOST=\"127.0.0.1\"\n");
    fs.writeFileSync(path.join(appDir, ".env"), "NEXT_PUBLIC_SUPABASE_URL=https://app.example\n");

    const result = loadWorkspaceEnv({ appDir, repoRoot: workspace, existingEnv: {} });

    assert.equal(result.publicEnv.NEXT_PUBLIC_SUPABASE_URL, "https://app.example");
    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:5000");
  });

  it("keeps explicit process env values as highest priority", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
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

  it("exposes the configured app URL to browser code", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, ".env"), "NEXT_PUBLIC_APP_URL=https://madupe.com\n");

    const result = loadWorkspaceEnv({ appDir, repoRoot: workspace, existingEnv: {} });

    assert.equal(result.publicEnv.NEXT_PUBLIC_APP_URL, "https://madupe.com");
  });

  it("ignores a public API URL that points at the configured web app origin", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".env"),
      [
        "NEXT_PUBLIC_APP_URL=https://app.example.com",
        "NEXT_PUBLIC_API_URL=https://app.example.com",
        "NEXT_PUBLIC_API_HOST=127.0.0.1",
        "NEXT_PUBLIC_API_PORT=4000"
      ].join("\n")
    );

    const result = loadWorkspaceEnv({ appDir, repoRoot: workspace, existingEnv: {} });

    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:4000");
  });

  it("uses explicit API host and port ahead of generic deployment host and port", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".env"),
      [
        "HOST=0.0.0.0",
        "PORT=3001",
        "NEXT_PUBLIC_API_HOST=127.0.0.1",
        "NEXT_PUBLIC_API_PORT=4000"
      ].join("\n")
    );

    const result = loadWorkspaceEnv({ appDir, repoRoot: workspace, existingEnv: {} });

    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:4000");
  });

  it("does not let generic shell host and port override workspace env API settings", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, ".env"), "PORT=4000\nHOST=127.0.0.1\n");

    const result = loadWorkspaceEnv({
      appDir,
      repoRoot: workspace,
      existingEnv: {
        HOST: "Stephens-MacBook-Pro.local",
        PORT: "5000"
      }
    });

    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:4000");
  });

  it("does not use the web dev server port as the API port", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "madupe-env-"));
    const appDir = path.join(workspace, "apps", "web");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, ".env"), "PORT=4000\nHOST=127.0.0.1\n");
    fs.writeFileSync(path.join(appDir, ".env"), "WEB_PORT=3001\n");

    const result = loadWorkspaceEnv({ appDir, repoRoot: workspace, existingEnv: {} });

    assert.equal(result.publicEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:4000");
  });

  it("pins the web dev server away from the API PORT unless WEB_PORT is set", async () => {
    const packageJson = JSON.parse(
      await fs.promises.readFile(new URL("./package.json", import.meta.url), "utf8")
    );

    assert.equal(packageJson.scripts.dev, "next dev -p ${WEB_PORT:-3001}");
  });
});
