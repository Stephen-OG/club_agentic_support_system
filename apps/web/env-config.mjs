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
    resolveExplicitApiUrl({
      existingEnv,
      appEnv,
      rootEnv
    }) ||
    buildLocalApiUrl({
      host:
        existingEnv.NEXT_PUBLIC_API_HOST ||
        appEnv.NEXT_PUBLIC_API_HOST ||
        rootEnv.NEXT_PUBLIC_API_HOST ||
        appEnv.HOST ||
        rootEnv.HOST,
      port:
        existingEnv.NEXT_PUBLIC_API_PORT ||
        appEnv.NEXT_PUBLIC_API_PORT ||
        rootEnv.NEXT_PUBLIC_API_PORT ||
        appEnv.PORT ||
        rootEnv.PORT
    });

  return {
    merged,
    publicEnv: compactEnv({
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_APP_URL: merged.NEXT_PUBLIC_APP_URL || merged.NEXT_PUBLIC_WEB_URL
    })
  };
}

function buildLocalApiUrl({ host, port }) {
  if (!host || !port) {
    return undefined;
  }

  return `http://${host}:${port}`;
}

function resolveExplicitApiUrl({ existingEnv, appEnv, rootEnv }) {
  const localDevelopment = !isProductionLike(existingEnv);
  const explicitApiUrl = localDevelopment
    ? appEnv.NEXT_PUBLIC_API_URL || rootEnv.NEXT_PUBLIC_API_URL || existingEnv.NEXT_PUBLIC_API_URL
    : existingEnv.NEXT_PUBLIC_API_URL || appEnv.NEXT_PUBLIC_API_URL || rootEnv.NEXT_PUBLIC_API_URL;

  if (!explicitApiUrl) {
    return undefined;
  }

  const appOrigin =
    existingEnv.NEXT_PUBLIC_APP_URL ||
    existingEnv.NEXT_PUBLIC_WEB_URL ||
    appEnv.NEXT_PUBLIC_APP_URL ||
    appEnv.NEXT_PUBLIC_WEB_URL ||
    rootEnv.NEXT_PUBLIC_APP_URL ||
    rootEnv.NEXT_PUBLIC_WEB_URL;

  if (sameOrigin(explicitApiUrl, appOrigin)) {
    return undefined;
  }

  return explicitApiUrl;
}

function isProductionLike(env) {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

function sameOrigin(left, right) {
  if (!left || !right) {
    return false;
  }

  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
  }
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
