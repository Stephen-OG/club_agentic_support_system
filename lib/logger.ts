type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = getLogLevel(process.env.LOG_LEVEL);

function getLogLevel(value: string | undefined): LogLevel {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  return process.env.NODE_ENV === "development" ? "debug" : "info";
}

function shouldLog(level: LogLevel) {
  return levelWeights[level] >= levelWeights[configuredLevel];
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  return value;
}

function write(level: LogLevel, event: string, context: LogContext = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...Object.fromEntries(Object.entries(context).map(([key, value]) => [key, normalizeValue(value)]))
  };

  const message = JSON.stringify(entry);

  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.log(message);
}

export const logger = {
  debug: (event: string, context?: LogContext) => write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) => write("error", event, context)
};
