import fs from "node:fs";
import path from "node:path";

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return env;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        return env;
      }

      const [, key, rawValue] = match;
      env[key] = unquoteEnvValue(rawValue.trim());
      return env;
    }, {});
}

export function loadWorkspaceEnv({ appDir, repoRoot, existingEnv = process.env }) {
  const rootEnv = parseEnvFile(path.join(repoRoot, ".env"));
  const appEnv = parseEnvFile(path.join(appDir, ".env"));
  const merged = {
    ...rootEnv,
    ...appEnv,
    ...existingEnv
  };

  const apiUrl =
    merged.NEXT_PUBLIC_API_URL ||
    buildLocalApiUrl({
      host: merged.NEXT_PUBLIC_API_HOST || merged.HOST,
      port: merged.NEXT_PUBLIC_API_PORT || merged.PORT
    });

  return {
    merged,
    publicEnv: compactEnv({
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: merged.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_URL: merged.NEXT_PUBLIC_SUPABASE_URL
    })
  };
}

function buildLocalApiUrl({ host, port }) {
  if (!host || !port) {
    return undefined;
  }

  return `http://${host}:${port}`;
}

function compactEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => Boolean(value)));
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
