import { Injectable, LoggerService, ShutdownSignal } from "@nestjs/common";

type LogLevel = "debug" | "verbose" | "log" | "warn" | "error";

type LogEntry = {
  context?: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  trace?: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  venueId?: string;
  durationMs?: number;
  method?: string;
  path?: string;
  statusCode?: number;
  error?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  verbose: 1,
  log: 2,
  warn: 3,
  error: 4
};

function getConfiguredLevel(): number {
  if (typeof process === "undefined") return LOG_LEVELS.log;
  const env = process.env.LOG_LEVEL || "log";
  return LOG_LEVELS[env as LogLevel] ?? LOG_LEVELS.log;
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly minLevel = getConfiguredLevel();

  log(message: string, context?: string) {
    this.write("log", message, context);
  }

  error(message: string, trace?: string, context?: string) {
    this.write("error", message, context, { trace });
  }

  warn(message: string, context?: string) {
    this.write("warn", message, context);
  }

  debug(message: string, context?: string) {
    this.write("debug", message, context);
  }

  verbose(message: string, context?: string) {
    this.write("verbose", message, context);
  }

  /**
   * Log an HTTP request with timing information.
   */
  logHttpRequest(input: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    requestId?: string;
    userId?: string;
    organizationId?: string;
    venueId?: string;
    error?: Error | null;
  }) {
    const level = input.statusCode >= 500 ? "error" : input.statusCode >= 400 ? "warn" : "log";
    const message = `${input.method} ${input.path} ${input.statusCode} ${input.durationMs}ms`;

    this.write(level, message, "HTTP", {
      durationMs: input.durationMs,
      method: input.method,
      path: input.path,
      requestId: input.requestId,
      statusCode: input.statusCode,
      userId: input.userId,
      organizationId: input.organizationId,
      venueId: input.venueId,
      error: input.error
        ? {
            message: input.error.message,
            name: input.error.name,
            stack: input.error.stack
          }
        : undefined
    });
  }

  /**
   * Log a database query with timing.
   */
  logQuery(durationMs: number, query: string, params?: unknown[]) {
    if (this.minLevel > LOG_LEVELS.debug) return;

    this.write("debug", `Query ${durationMs}ms`, "Prisma", {
      durationMs,
      query: query.length > 200 ? query.slice(0, 200) + "..." : query,
      params: params ? params.map((p) => (typeof p === "string" && p.length > 100 ? p.slice(0, 100) + "..." : p)) : undefined
    });
  }

  /**
   * Log an outgoing API call (e.g. OpenAI, Supabase).
   */
  logApiCall(input: {
    service: string;
    method: string;
    path: string;
    durationMs: number;
    statusCode?: number;
    error?: Error | null;
  }) {
    const level = input.error || (input.statusCode && input.statusCode >= 400) ? "error" : "log";
    const message = `${input.service} ${input.method} ${input.path} ${input.statusCode ?? "?"} ${input.durationMs}ms`;

    this.write(level, message, "ExternalAPI", {
      durationMs: input.durationMs,
      method: input.method,
      path: input.path,
      service: input.service,
      statusCode: input.statusCode,
      error: input.error
        ? {
            message: input.error.message,
            name: input.error.name
          }
        : undefined
    });
  }

  /**
   * Log a business event for audit/debugging.
   */
  logEvent(event: string, metadata?: Record<string, unknown>, context?: string) {
    this.write("log", event, context ?? "Event", {
      event,
      metadata
    });
  }

  private write(level: LogLevel, message: string, context?: string, extra?: Record<string, unknown>) {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const entry: LogEntry = {
      context,
      level,
      message,
      timestamp: new Date().toISOString()
    };

    if (extra) {
      Object.assign(entry, extra);
    }

    // Use stderr for errors, stdout for everything else
    if (level === "error") {
      process.stderr.write(safeStringify(entry) + "\n");
    } else {
      process.stdout.write(safeStringify(entry) + "\n");
    }
  }
}
