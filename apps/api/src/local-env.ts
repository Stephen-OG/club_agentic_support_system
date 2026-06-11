import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function loadLocalEnvOverrides({
  apiDir = resolve(__dirname, ".."),
  env = process.env,
  repoRoot = resolve(apiDir, "..", "..")
}: {
  apiDir?: string;
  env?: EnvMap;
  repoRoot?: string;
} = {}) {
  if (env.NODE_ENV === "production") {
    return;
  }

  for (const file of [resolve(repoRoot, ".env"), resolve(apiDir, ".env")]) {
    if (!existsSync(file)) {
      continue;
    }

    loadDotenv({
      path: file,
      override: true,
      processEnv: env,
      quiet: true
    });
  }
}
