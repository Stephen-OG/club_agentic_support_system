import { randomUUID } from "node:crypto";
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { StructuredLogger } from "./structured-logger.service";
import type { Request, Response } from "express";

export function sanitizeRequestPath(path: string | undefined) {
  if (!path) {
    return "/";
  }

  return path.split("?")[0] || "/";
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request & { requestId?: string; auth?: { staffProfileId?: string; workspaceId?: string; venueId?: string } }>();
    const response = httpContext.getResponse<Response>();

    const requestId = (request.headers["x-request-id"] as string) || randomUUID();
    request.requestId = requestId;

    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Math.round(performance.now() - start);
          this.logger.logHttpRequest({
            durationMs,
            method: request.method,
            path: sanitizeRequestPath(request.originalUrl || request.url),
            requestId,
            statusCode: response.statusCode,
            userId: request.auth?.staffProfileId,
            workspaceId: request.auth?.workspaceId,
            venueId: request.auth?.venueId
          });
        },
        error: (error: Error) => {
          const durationMs = Math.round(performance.now() - start);
          const statusCode = (error as any).status || 500;

          // Capture request body on errors (redact sensitive fields)
          let body: Record<string, unknown> | undefined;
          if (statusCode >= 400 && request.body && typeof request.body === "object") {
            body = { ...(request.body as Record<string, unknown>) };
            // Redact sensitive fields
            const sensitive = ["password", "token", "secret", "key", "authorization", "access_token"];
            for (const key of sensitive) {
              if (body[key] !== undefined) {
                body[key] = "[REDACTED]";
              }
            }
          }

          const extraMetadata = body ? { requestBody: body } : undefined;

          this.logger.logHttpRequest({
            durationMs,
            error,
            method: request.method,
            path: sanitizeRequestPath(request.originalUrl || request.url),
            requestId,
            statusCode,
            userId: request.auth?.staffProfileId,
            workspaceId: request.auth?.workspaceId,
            venueId: request.auth?.venueId,
            ...(extraMetadata ? { metadata: extraMetadata } : {})
          });
        }
      })
    );
  }
}
