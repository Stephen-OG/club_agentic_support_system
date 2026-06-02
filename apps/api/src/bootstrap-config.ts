const localApiPort = 4001;

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

export function getApiPort(env: Partial<Pick<NodeJS.ProcessEnv, "PORT" | "API_PORT">> = process.env) {
  return parsePort(env.PORT) ?? parsePort(env.API_PORT) ?? localApiPort;
}
