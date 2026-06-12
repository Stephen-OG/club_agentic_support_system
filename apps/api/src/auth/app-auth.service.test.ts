import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AppAuthService } from "./app-auth.service";

describe("AppAuthService", () => {
  const originalJwtSecret = process.env.AUTH_JWT_SECRET;

  function withEnv(values: Record<string, string | undefined>) {
    const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return () => {
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    };
  }

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

  it("signs up an unverified user and sends a verification email code", async () => {
    const restoreEnv = withEnv({ PUBLIC_API_URL: "https://api.madupe.com" });
    const createdTokens: any[] = [];
    const sentEmails: any[] = [];
    const service = new AppAuthService(
      {
        authUser: {
          findUnique: async () => null,
          create: async ({ data }: any) => ({ id: "auth-1", ...data })
        },
        authEmailToken: {
          updateMany: async () => ({ count: 0 }),
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

    try {
      const result = await service.signUp({
        email: "alex@example.com",
        password: "temporary-secret",
        displayName: "Alex"
      });

      assert.equal(result.session, null);
      assert.equal(createdTokens[0].type, "EMAIL_VERIFICATION");
      assert.equal(sentEmails[0].template, "email_verification");
      assert.equal(sentEmails[0].to, "alex@example.com");
      assert.match(sentEmails[0].variables.verificationCode, /^\d{6}$/);
      assert.equal(sentEmails[0].variables.actionUrl, undefined);
    } finally {
      restoreEnv();
    }
  });

  it("resends verification email when an unverified account signs up again", async () => {
    const createdTokens: any[] = [];
    const sentEmails: any[] = [];
    const tokenUpdates: any[] = [];
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
          findUnique: async () => existingUser,
          update: async ({ data }: any) => ({ ...existingUser, ...data })
        },
        authEmailToken: {
          updateMany: async ({ where, data }: any) => {
            tokenUpdates.push({ where, data });
            return { count: 1 };
          },
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
    assert.equal(tokenUpdates[0].where.authUserId, "auth-1");
    assert.equal(tokenUpdates[0].where.type, "EMAIL_VERIFICATION");
    assert.equal(tokenUpdates[0].where.usedAt, null);
    assert.ok(tokenUpdates[0].data.usedAt);
    assert.equal(createdTokens[0].type, "EMAIL_VERIFICATION");
    assert.equal(sentEmails[0].template, "email_verification");
    assert.equal(sentEmails[0].to, "alex@example.com");
  });

  it("verifies an email address with its one-time code", async () => {
    const service = new AppAuthService({} as any);
    const codeHash = (service as any).hashToken("123456");
    const user = {
      id: "auth-1",
      email: "alex@example.com",
      displayName: "Alex",
      emailVerifiedAt: null,
      mustChangePassword: false,
      tokenVersion: 1
    };
    const tokenUpdates: any[] = [];
    const userUpdates: any[] = [];
    const serviceWithPrisma = new AppAuthService({
      authUser: {
        findUnique: async ({ where }: any) => (where.email === "alex@example.com" ? user : null),
        update: async ({ where, data }: any) => {
          userUpdates.push({ where, data });
          return { ...user, ...data };
        }
      },
      authEmailToken: {
        findUnique: async ({ where }: any) =>
          where.tokenHash === codeHash
            ? {
                id: "token-1",
                authUserId: user.id,
                type: "EMAIL_VERIFICATION",
                tokenHash: codeHash,
                usedAt: null,
                expiresAt: new Date(Date.now() + 60_000)
              }
            : null,
        update: async ({ where, data }: any) => {
          tokenUpdates.push({ where, data });
          return { id: where.id, ...data };
        }
      }
    } as any);

    const result = await serviceWithPrisma.verifyEmailCode({
      email: "ALEX@example.com",
      code: "123456"
    });

    assert.equal(result.id, "auth-1");
    assert.equal(userUpdates[0].where.id, "auth-1");
    assert.ok(userUpdates[0].data.emailVerifiedAt);
    assert.equal(tokenUpdates[0].where.id, "token-1");
    assert.ok(tokenUpdates[0].data.usedAt);
  });

  it("updates the password when an unverified account signs up again", async () => {
    const existingUser = {
      id: "auth-1",
      email: "alex@example.com",
      displayName: "Alex",
      emailVerifiedAt: null,
      mustChangePassword: false,
      tokenVersion: 1,
      passwordHash: await (new AppAuthService({} as any) as any).hashPassword("old-signup-password")
    };
    let updatedPasswordHash = "";
    const service = new AppAuthService(
      {
        authUser: {
          findUnique: async () => existingUser,
          update: async ({ data }: any) => {
            updatedPasswordHash = data.passwordHash;
            return { ...existingUser, ...data };
          }
        },
        authEmailToken: {
          updateMany: async () => ({ count: 0 }),
          create: async ({ data }: any) => ({ id: "token-1", ...data })
        }
      } as any,
      {
        sendTemplate: async () => undefined
      } as any
    );

    const result = await service.signUp({
      email: "alex@example.com",
      password: "new-signup-password",
      displayName: "New Name"
    });

    assert.equal(result.session, null);
    assert.equal(result.user.id, "auth-1");
    assert.equal(await (service as any).verifyPassword("new-signup-password", updatedPasswordHash), true);
    assert.equal(await (service as any).verifyPassword("old-signup-password", updatedPasswordHash), false);
  });

  it("changes an unverified signup email and sends a fresh verification code", async () => {
    const user = {
      id: "auth-1",
      email: "wrong@example.com",
      displayName: "Alex",
      emailVerifiedAt: null,
      mustChangePassword: false,
      tokenVersion: 1
    };
    const updates: any[] = [];
    const tokenUpdates: any[] = [];
    const createdTokens: any[] = [];
    const sentEmails: any[] = [];
    const service = new AppAuthService(
      {
        authUser: {
          findUnique: async ({ where }: any) => {
            if (where.email === "wrong@example.com") {
              return user;
            }
            return null;
          },
          update: async ({ where, data }: any) => {
            updates.push({ where, data });
            return { ...user, ...data };
          }
        },
        authEmailToken: {
          updateMany: async ({ where, data }: any) => {
            tokenUpdates.push({ where, data });
            return { count: 1 };
          },
          create: async ({ data }: any) => {
            createdTokens.push(data);
            return { id: "token-2", ...data };
          }
        }
      } as any,
      {
        sendTemplate: async (message: any) => {
          sentEmails.push(message);
        }
      } as any
    );

    const result = await service.changeUnverifiedEmail({
      currentEmail: "wrong@example.com",
      newEmail: "right@example.com"
    });

    assert.equal(result.user.email, "right@example.com");
    assert.equal(updates[0].where.id, "auth-1");
    assert.equal(updates[0].data.email, "right@example.com");
    assert.equal(tokenUpdates[0].where.authUserId, "auth-1");
    assert.equal(tokenUpdates[0].where.type, "EMAIL_VERIFICATION");
    assert.ok(tokenUpdates[0].data.usedAt);
    assert.equal(createdTokens[0].type, "EMAIL_VERIFICATION");
    assert.equal(sentEmails[0].template, "email_verification");
    assert.equal(sentEmails[0].to, "right@example.com");
  });

  it("rejects unverified email changes when the new email is already registered", async () => {
    const service = new AppAuthService({
      authUser: {
        findUnique: async ({ where }: any) => {
          if (where.email === "wrong@example.com") {
            return { id: "auth-1", email: "wrong@example.com", emailVerifiedAt: null };
          }
          if (where.email === "taken@example.com") {
            return { id: "auth-2", email: "taken@example.com", emailVerifiedAt: new Date() };
          }
          return null;
        }
      }
    } as any);

    await assert.rejects(
      () => service.changeUnverifiedEmail({ currentEmail: "wrong@example.com", newEmail: "taken@example.com" }),
      ConflictException
    );
  });

  it("sends password reset as a one-time code", async () => {
    const user = {
      id: "auth-1",
      email: "alex@example.com",
      displayName: "Alex",
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1
    };
    const tokenUpdates: any[] = [];
    const createdTokens: any[] = [];
    const sentEmails: any[] = [];
    const service = new AppAuthService(
      {
        authUser: {
          findUnique: async ({ where }: any) => (where.email === "alex@example.com" ? user : null)
        },
        authEmailToken: {
          updateMany: async ({ where, data }: any) => {
            tokenUpdates.push({ where, data });
            return { count: 1 };
          },
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

    await service.requestPasswordReset({ email: "ALEX@example.com" });

    assert.equal(tokenUpdates[0].where.authUserId, "auth-1");
    assert.equal(tokenUpdates[0].where.type, "PASSWORD_RESET");
    assert.equal(tokenUpdates[0].where.usedAt, null);
    assert.ok(tokenUpdates[0].data.usedAt);
    assert.equal(createdTokens[0].type, "PASSWORD_RESET");
    assert.equal(sentEmails[0].template, "password_reset");
    assert.equal(sentEmails[0].to, "alex@example.com");
    assert.match(sentEmails[0].variables.verificationCode, /^\d{6}$/);
    assert.equal(sentEmails[0].variables.actionUrl, undefined);
  });

  it("resets a password with a one-time code", async () => {
    const serviceForHash = new AppAuthService({} as any);
    const codeHash = (serviceForHash as any).hashToken("654321");
    const user = {
      id: "auth-1",
      email: "alex@example.com",
      displayName: "Alex",
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      tokenVersion: 1,
      passwordHash: await (serviceForHash as any).hashPassword("old-password")
    };
    const tokenUpdates: any[] = [];
    const userUpdates: any[] = [];
    const service = new AppAuthService({
      authUser: {
        findUnique: async ({ where }: any) => (where.email === "alex@example.com" ? user : null),
        update: async ({ where, data }: any) => {
          userUpdates.push({ where, data });
          return { ...user, ...data };
        }
      },
      authEmailToken: {
        findUnique: async ({ where }: any) =>
          where.tokenHash === codeHash
            ? {
                id: "token-1",
                authUserId: user.id,
                type: "PASSWORD_RESET",
                tokenHash: codeHash,
                usedAt: null,
                expiresAt: new Date(Date.now() + 60_000)
              }
            : null,
        update: async ({ where, data }: any) => {
          tokenUpdates.push({ where, data });
          return { id: where.id, ...data };
        },
        updateMany: async () => ({ count: 1 })
      },
      authSession: {
        updateMany: async () => ({ count: 1 })
      }
    } as any);

    await service.resetPassword({
      email: "alex@example.com",
      code: "654321",
      password: "new-secure-password"
    });

    assert.equal(userUpdates[0].where.id, "auth-1");
    assert.equal(await (serviceForHash as any).verifyPassword("new-secure-password", userUpdates[0].data.passwordHash), true);
    assert.equal(tokenUpdates[0].where.id, "token-1");
    assert.ok(tokenUpdates[0].data.usedAt);
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

  it("returns a fresh session after password changes invalidate existing tokens", async () => {
    const restore = withJwtSecret();
    const createdSessions: any[] = [];
    const sessionUpdates: any[] = [];
    const serviceForHash = new AppAuthService({} as any);
    const originalUser = {
      id: "auth-1",
      email: "sam@example.com",
      displayName: "Sam Service",
      emailVerifiedAt: new Date(),
      mustChangePassword: true,
      tokenVersion: 1,
      passwordHash: await (serviceForHash as any).hashPassword("old-password")
    };
    const updatedUser = {
      ...originalUser,
      mustChangePassword: false,
      tokenVersion: 2,
      passwordHash: "new-password-hash"
    };
    const service = new AppAuthService({
      authUser: {
        findUnique: async () => originalUser,
        update: async ({ data }: any) => {
          assert.deepEqual(data.tokenVersion, { increment: 1 });
          return updatedUser;
        }
      },
      authSession: {
        updateMany: async ({ where, data }: any) => {
          sessionUpdates.push({ where, data });
          return { count: 1 };
        },
        create: async ({ data }: any) => {
          createdSessions.push(data);
          return { id: "session-2", ...data };
        }
      }
    } as any);

    try {
      const oldAccessToken = (service as any).signAccessToken(originalUser);
      const nextSession = (await service.changePassword(oldAccessToken, {
        oldPassword: "old-password",
        password: "new-secure-password"
      })) as any;

      assert.match(nextSession.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);
      assert.equal(nextSession.user.mustChangePassword, false);
      assert.equal(nextSession.user.tokenVersion, 2);
      assert.equal(createdSessions[0].authUserId, "auth-1");
      assert.equal(createdSessions[0].tokenVersion, 2);
      assert.equal(sessionUpdates[0].where.authUserId, "auth-1");
    } finally {
      restore();
    }
  });
});
