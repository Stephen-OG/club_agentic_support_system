import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { of, throwError } from "rxjs";
import { HttpLoggingInterceptor, redactSensitiveData, sanitizeRequestPath } from "./http-logging.interceptor";

describe("HttpLoggingInterceptor", () => {
  it("removes query strings before writing request paths to logs", () => {
    assert.equal(
      sanitizeRequestPath("/public/qr/token/conversations/id?sessionId=guest_secret&other=1"),
      "/public/qr/token/conversations/id"
    );
    assert.equal(sanitizeRequestPath("/admin/venues"), "/admin/venues");
  });

  it("uses sanitized paths for successful and failed HTTP logs", () => {
    const paths: string[] = [];
    const interceptor = new HttpLoggingInterceptor({
      logHttpRequest: (input: { path: string }) => {
        paths.push(input.path);
      }
    } as never);

    const context = createContext("/public/qr/token/conversations/id?sessionId=guest_secret");

    interceptor.intercept(context as never, { handle: () => of({ ok: true }) } as never).subscribe();

    interceptor.intercept(context as never, { handle: () => throwError(() => Object.assign(new Error("fail"), { status: 403 })) } as never).subscribe({
      error: () => {
        // The interceptor logs the sanitized path in the error tap before the subscriber receives it.
      }
    });

    assert.deepEqual(paths, [
      "/public/qr/token/conversations/id",
      "/public/qr/token/conversations/id"
    ]);
  });

  it("redacts nested sensitive fields before writing failed request bodies", () => {
    const redacted = redactSensitiveData({
      email: "guest@example.com",
      password: "plaintext",
      profile: {
        access_token: "token",
        safe: "visible"
      },
      venues: [
        {
          apiKey: "secret-key",
          label: "Lobby"
        }
      ]
    });

    assert.deepEqual(redacted, {
      email: "guest@example.com",
      password: "[REDACTED]",
      profile: {
        access_token: "[REDACTED]",
        safe: "visible"
      },
      venues: [
        {
          apiKey: "[REDACTED]",
          label: "Lobby"
        }
      ]
    });
  });
});

function createContext(originalUrl: string) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return {
            headers: {},
            method: "GET",
            originalUrl,
            url: originalUrl
          };
        },
        getResponse() {
          return {
            statusCode: 200
          };
        }
      };
    }
  };
}
