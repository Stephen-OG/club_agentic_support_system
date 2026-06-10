import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { AppAuthService } from "./app-auth.service";

describe("AppAuthService", () => {
  const originalJwtSecret = process.env.AUTH_JWT_SECRET;

  function withJwtSecret() {
    process.env.AUTH_JWT_SECRET = "test-jwt-secret-with-enough-entropy";
    return () => {
      if (originalJwtSecret === undefined) {
        delete process.env.AUTH_JWT_SECRET;
      } else {
        process.env.AUTH_JWT_SECRET = originalJwtSecret;
      }
    };
  }

  it("creates a first-party auth user with a hashed temporary password", async () => {
    let createdUser: any = null;
    const service = new AppAuthService({
      authUser: {
        create: async ({ data }: any) => {
          createdUser = data;
          return { id: "auth-1", ...data };
        }
      }
    } as any);

    const user = await service.createTemporaryPasswordUser({
      email: "SAM@example.com",
      password: "temporary-secret",
      displayName: "Sam Service"
    });

    assert.equal(user.id, "auth-1");
    assert.equal(user.email, "sam@example.com");
    assert.notEqual(createdUser?.passwordHash, "temporary-secret");
    assert.equal(createdUser?.mustChangePassword, true);
  });

  it("signs up an unverified user and sends a verification email token", async () => {
    const createdTokens: any[] = [];
    const sentEmails: any[] = [];
    const service = new AppAuthService(
      {
        authUser: {
          findUnique: async () => null,
          create: async ({ data }: any) => ({ id: "auth-1", ...data })
        },
        authEmailToken: {
          create: async ({ data }: any) => {
            createdTokens.push(data);
            return { id: "token-1", ...data };
          }
        }
      } as any,
      {
        sendTemplate: async (message: any) => {
          sentEmails.push(message);
        }
      } as any
    );

    const result = await service.signUp({
      email: "alex@example.com",
      password: "temporary-secret",
      displayName: "Alex"
    });

    assert.equal(result.session, null);
    assert.equal(createdTokens[0].type, "EMAIL_VERIFICATION");
    assert.equal(sentEmails[0].template, "email_verification");
    assert.equal(sentEmails[0].to, "alex@example.com");
  });

  it("resends verification email when an unverified account signs up again", async () => {
    const createdTokens: any[] = [];
    const sentEmails: any[] = [];
    const existingUser = {
      id: "auth-1",
      email: "alex@example.com",
      displayName: "Alex",
      emailVerifiedAt: null,
      mustChangePassword: false
    };
    const service = new AppAuthService(
      {
        authUser: {
          findUnique: async () => existingUser
        },
        authEmailToken: {
          create: async ({ data }: any) => {
            createdTokens.push(data);
            return { id: "token-1", ...data };
          }
        }
      } as any,
      {
        sendTemplate: async (message: any) => {
          sentEmails.push(message);
        }
      } as any
    );

    const result = await service.signUp({
      email: "alex@example.com",
      password: "ignored-secret",
      displayName: "Ignored Name"
    });

    assert.equal(result.session, null);
    assert.equal(result.user.id, "auth-1");
    assert.equal(createdTokens[0].type, "EMAIL_VERIFICATION");
    assert.equal(sentEmails[0].template, "email_verification");
    assert.equal(sentEmails[0].to, "alex@example.com");
  });

  it("signs in with a short-lived JWT access token and hashed refresh token", async () => {
    const restore = withJwtSecret();
    const createdSessions: any[] = [];
    const user = {
      id: "auth-1",
      email: "sam@example.com",
      displayName: "Sam Service",
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
      passwordHash: await (new AppAuthService({} as any) as any).hashPassword("correct-password")
    };
    const service = new AppAuthService({
      authUser: {
        findUnique: async () => user
      },
      authSession: {
        create: async ({ data }: any) => {
          createdSessions.push(data);
          return { id: "session-1", ...data };
        }
      }
    } as any);

    try {
      const session = (await service.signIn({ email: "sam@example.com", password: "correct-password" })) as any;

      assert.match(session.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);
      assert.equal(typeof session.refreshToken, "string");
      assert.notEqual(session.refreshToken, session.accessToken);
      assert.equal(createdSessions[0].refreshTokenHash.length, 64);
      assert.notEqual(createdSessions[0].refreshTokenHash, session.refreshToken);
      assert.equal(createdSessions[0].tokenVersion, 1);
    } finally {
      restore();
    }
  });

  it("rotates refresh tokens and revokes the previous refresh session", async () => {
    const restore = withJwtSecret();
    const updates: any[] = [];
    const creates: any[] = [];
    const user = {
      id: "auth-1",
      email: "sam@example.com",
      displayName: "Sam Service",
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 2
    };
    const service = new AppAuthService({
      authSession: {
        findUnique: async ({ where }: any) => ({
          id: "session-1",
          authUserId: user.id,
          refreshTokenHash: where.refreshTokenHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          tokenVersion: 2,
          authUser: user
        }),
        update: async ({ where, data }: any) => {
          updates.push({ where, data });
          return { id: where.id, ...data };
        },
        create: async ({ data }: any) => {
          creates.push(data);
          return { id: "session-2", ...data };
        }
      }
    } as any);

    try {
      const session = await (service as any).refreshSession("plain-refresh-token");

      assert.match(session.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);
      assert.equal(typeof session.refreshToken, "string");
      assert.equal(updates[0].where.id, "session-1");
      assert.ok(updates[0].data.revokedAt);
      assert.equal(creates[0].authUserId, "auth-1");
      assert.equal(creates[0].tokenVersion, 2);
    } finally {
      restore();
    }
  });

  it("revokes a user's active refresh sessions when a revoked refresh token is reused", async () => {
    const updates: any[] = [];
    const service = new AppAuthService({
      authSession: {
        findUnique: async () => ({
          id: "session-1",
          authUserId: "auth-1",
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          authUser: { id: "auth-1" }
        }),
        updateMany: async ({ where, data }: any) => {
          updates.push({ where, data });
          return { count: 2 };
        }
      }
    } as any);

    await assert.rejects(() => (service as any).refreshSession("reused-refresh-token"), UnauthorizedException);
    assert.equal(updates[0].where.authUserId, "auth-1");
    assert.equal(updates[0].where.revokedAt, null);
    assert.ok(updates[0].data.revokedAt);
  });

  it("rejects access tokens after the auth user's token version advances", async () => {
    const restore = withJwtSecret();
    const user = {
      id: "auth-1",
      email: "sam@example.com",
      displayName: "Sam Service",
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1
    };
    const service = new AppAuthService({
      authUser: {
        findUnique: async ({ where }: any) => ({
          ...user,
          tokenVersion: where.id === "auth-1" ? 2 : user.tokenVersion
        })
      },
      authSession: {
        create: async ({ data }: any) => ({ id: "session-1", ...data })
      }
    } as any);

    try {
      const accessToken = (service as any).signAccessToken(user);
      await assert.rejects(() => service.verifyBearerToken(accessToken), UnauthorizedException);
    } finally {
      restore();
    }
  });

  it("invalidates a user's access and refresh tokens for role or membership changes", async () => {
    const userUpdates: any[] = [];
    const sessionUpdates: any[] = [];
    const service = new AppAuthService({
      authUser: {
        update: async ({ where, data }: any) => {
          userUpdates.push({ where, data });
          return { id: where.id, tokenVersion: 3 };
        }
      },
      authSession: {
        updateMany: async ({ where, data }: any) => {
          sessionUpdates.push({ where, data });
          return { count: 1 };
        }
      }
    } as any);

    await (service as any).invalidateUserTokens("auth-1");

    assert.equal(userUpdates[0].where.id, "auth-1");
    assert.deepEqual(userUpdates[0].data.tokenVersion, { increment: 1 });
    assert.equal(sessionUpdates[0].where.authUserId, "auth-1");
    assert.equal(sessionUpdates[0].where.revokedAt, null);
    assert.ok(sessionUpdates[0].data.revokedAt);
  });
});
