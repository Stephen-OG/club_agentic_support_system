const localApiPort = 4000;

function parsePort(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }

  return parsed;
}

export function getApiPort(env: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "PORT" | "API_PORT">> = process.env) {
  const apiPort = parsePort(env.API_PORT);
  const platformPort = parsePort(env.PORT);

  if (env.NODE_ENV === "production") {
    return platformPort ?? apiPort ?? localApiPort;
  }

  return apiPort ?? localApiPort;
}
