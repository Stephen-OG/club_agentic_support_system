import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthEmailTokenType } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { MailService } from "../mail/mail.service";
import { getPublicAppBaseUrl } from "../security/security-config";

const passwordHashParams = { keyLength: 64, cost: 16_384, blockSize: 8, parallelization: 1 };
const accessTokenTtlSeconds = 60 * 15;
const refreshTokenTtlMs = 1000 * 60 * 60 * 24 * 30;
const emailVerificationTtlMs = 1000 * 60 * 60 * 24;
const passwordResetTtlMs = 1000 * 60 * 60;
const staffInvitationTtlMs = 1000 * 60 * 60 * 24 * 7;

export type AppSessionUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  mustChangePassword: boolean;
  tokenVersion: number;
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  tv: number;
  iat: number;
  exp: number;
};

@Injectable()
export class AppAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail?: MailService
  ) {}

  async signUp(input: { email: string; password: string; displayName?: string }) {
    const email = this.normalizeEmail(input.email);
    const existing = await this.prisma.authUser.findUnique({ where: { email } });

    if (existing) {
      if (!existing.emailVerifiedAt) {
        const updated = await this.prisma.authUser.update({
          where: { id: existing.id },
          data: {
            passwordHash: await this.hashPassword(input.password),
            displayName: input.displayName?.trim() || existing.displayName
          }
        });

        await this.sendEmailVerification(updated);
        return {
          session: null,
          user: this.serializeUser(updated)
        };
      }

      throw new ConflictException("An account already exists for this email");
    }

    const user = await this.prisma.authUser.create({
      data: {
        email,
        passwordHash: await this.hashPassword(input.password),
        displayName: input.displayName?.trim() || this.defaultDisplayName(email),
        emailVerifiedAt: null,
        mustChangePassword: false,
        tokenVersion: 1
      }
    });

    await this.sendEmailVerification(user);

    return {
      session: null,
      user: this.serializeUser(user)
    };
  }

  async changeUnverifiedEmail(input: { currentEmail: string; newEmail: string; password: string }) {
    const currentEmail = this.normalizeEmail(input.currentEmail);
    const newEmail = this.normalizeEmail(input.newEmail);

    if (currentEmail === newEmail) {
      throw new BadRequestException("Enter a different email address");
    }

    const currentUser = await this.prisma.authUser.findUnique({ where: { email: currentEmail } });
    if (!currentUser || currentUser.emailVerifiedAt) {
      throw new BadRequestException("Email can only be changed before verification");
    }

    if (!(await this.verifyPassword(input.password, currentUser.passwordHash))) {
      throw new UnauthorizedException("Email or password is incorrect");
    }

    const existingNewEmailUser = await this.prisma.authUser.findUnique({ where: { email: newEmail } });
    if (existingNewEmailUser) {
      throw new ConflictException("An account already exists for this email");
    }

    await this.prisma.authEmailToken.updateMany({
      where: {
        authUserId: currentUser.id,
        type: AuthEmailTokenType.EMAIL_VERIFICATION,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });

    const updated = await this.prisma.authUser.update({
      where: { id: currentUser.id },
      data: { email: newEmail }
    });
    await this.sendEmailVerification(updated);

    return {
      session: null,
      user: this.serializeUser(updated)
    };
  }

  async signIn(input: { email: string; password: string }) {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.authUser.findUnique({ where: { email } });

    if (!user || !(await this.verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Email or password is incorrect");
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Email must be verified before signing in");
    }

    return this.createSession(user);
  }

  async createTemporaryPasswordUser(input: { email: string; password: string; displayName: string }) {
    const email = this.normalizeEmail(input.email);

    return this.prisma.authUser.create({
      data: {
        email,
        passwordHash: await this.hashPassword(input.password),
        displayName: input.displayName.trim(),
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
        tokenVersion: 1
      }
    });
  }

  async sendStaffInvitationEmail(input: { authUserId: string; email: string; displayName: string; temporaryPassword: string }) {
    if (!this.mail) {
      return;
    }

    const token = await this.createEmailToken(input.authUserId, AuthEmailTokenType.STAFF_INVITATION, staffInvitationTtlMs);
    await this.mail.sendTemplate({
      template: "staff_invitation",
      to: input.email,
      variables: {
        actionUrl: this.buildAppUrl(`/login?inviteToken=${encodeURIComponent(token)}`),
        appName: "Madupe",
        displayName: input.displayName,
        temporaryPassword: input.temporaryPassword
      }
    });
  }

  async deleteUser(authUserId: string) {
    await this.prisma.authUser.delete({ where: { id: authUserId } });
  }

  async invalidateUserTokens(authUserId: string) {
    await this.prisma.authUser.update({
      where: { id: authUserId },
      data: { tokenVersion: { increment: 1 } }
    });
    await this.revokeUserRefreshSessions(authUserId);
  }

  async verifyBearerToken(token: string) {
    const payload = this.verifyAccessToken(token);
    const user = await this.prisma.authUser.findUnique({
      where: { id: payload.sub }
    });

    if (!user || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException("Invalid session");
    }

    return {
      sessionId: null,
      user: this.serializeUser(user)
    };
  }

  async refreshSession(refreshToken: string) {
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
      include: { authUser: true }
    });

    if (!session) {
      throw new UnauthorizedException("Invalid session");
    }

    if (session.revokedAt) {
      await this.revokeUserRefreshSessions(session.authUserId);
      throw new UnauthorizedException("Invalid session");
    }

    if (session.expiresAt <= new Date() || session.tokenVersion !== session.authUser.tokenVersion) {
      await this.revokeRefreshSession(session.id);
      throw new UnauthorizedException("Invalid session");
    }

    await this.revokeRefreshSession(session.id);
    return this.createSession(session.authUser);
  }

  async changePassword(token: string, input: { oldPassword: string; password: string }) {
    const session = await this.verifyBearerToken(token);
    const user = await this.prisma.authUser.findUnique({ where: { id: session.user.id } });

    if (!user || !(await this.verifyPassword(input.oldPassword, user.passwordHash))) {
      throw new UnauthorizedException("Old password is incorrect");
    }

    const updated = await this.prisma.authUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.hashPassword(input.password),
        mustChangePassword: false,
        tokenVersion: { increment: 1 }
      }
    });
    await this.revokeUserRefreshSessions(user.id);

    return this.createSession(updated);
  }

  async requestPasswordReset(input: { email: string }) {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.authUser.findUnique({ where: { email } });

    if (!user || !user.emailVerifiedAt || !this.mail) {
      return;
    }

    await this.prisma.authEmailToken.updateMany({
      where: {
        authUserId: user.id,
        type: AuthEmailTokenType.PASSWORD_RESET,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });

    const code = await this.createEmailCode(user.id, AuthEmailTokenType.PASSWORD_RESET, passwordResetTtlMs);
    await this.mail.sendTemplate({
      template: "password_reset",
      to: user.email,
      variables: {
        appName: "Madupe",
        displayName: user.displayName,
        verificationCode: code
      }
    });
  }

  async resetPassword(input: { token?: string; email?: string; code?: string; password: string }) {
    const token = input.token
      ? await this.consumeEmailToken(input.token, AuthEmailTokenType.PASSWORD_RESET)
      : await this.consumePasswordResetCode(input);
    const updated = await this.prisma.authUser.update({
      where: { id: token.authUserId },
      data: {
        passwordHash: await this.hashPassword(input.password),
        mustChangePassword: false,
        tokenVersion: { increment: 1 }
      }
    });
    await this.revokeUserRefreshSessions(token.authUserId);

    return this.createSession(updated);
  }

  async verifyEmail(input: { token: string }) {
    const token = await this.consumeEmailToken(input.token, AuthEmailTokenType.EMAIL_VERIFICATION);
    const updated = await this.prisma.authUser.update({
      where: { id: token.authUserId },
      data: { emailVerifiedAt: new Date() }
    });

    return this.serializeUser(updated);
  }

  async verifyEmailCode(input: { email: string; code: string }) {
    const email = this.normalizeEmail(input.email);
    const code = input.code.trim();

    if (!/^\d{6}$/.test(code)) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    const user = await this.prisma.authUser.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    const token = await this.consumeEmailCodeForUser(user.id, code);
    const updated = await this.prisma.authUser.update({
      where: { id: token.authUserId },
      data: { emailVerifiedAt: new Date() }
    });

    return this.serializeUser(updated);
  }

  async signOut(token: string) {
    const payload = this.verifyAccessToken(token);
    await this.revokeUserRefreshSessions(payload.sub);
  }

  private async createSession(user: AppSessionUser) {
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshExpiresAt = new Date(Date.now() + refreshTokenTtlMs);
    const accessTokenExpiresAt = new Date(Date.now() + accessTokenTtlSeconds * 1000);

    await this.prisma.authSession.create({
      data: {
        authUserId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        tokenVersion: user.tokenVersion,
        expiresAt: refreshExpiresAt
      }
    });

    return {
      accessToken: this.signAccessToken(user, accessTokenExpiresAt),
      refreshToken,
      expiresAt: accessTokenExpiresAt,
      refreshExpiresAt,
      user: this.serializeUser(user)
    };
  }

  private serializeUser(user: AppSessionUser) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private defaultDisplayName(email: string) {
    return email.split("@")[0]?.replace(/[._-]+/g, " ") || email;
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async revokeRefreshSession(id: string) {
    await this.prisma.authSession.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }

  private async revokeUserRefreshSessions(authUserId: string) {
    await this.prisma.authSession.updateMany({
      where: {
        authUserId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  private signAccessToken(user: AppSessionUser, expiresAt = new Date(Date.now() + accessTokenTtlSeconds * 1000)) {
    const header = { alg: "HS256", typ: "JWT" };
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      tv: user.tokenVersion,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000)
    };
    const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signature = createHmac("sha256", this.getJwtSecret()).update(unsigned).digest("base64url");
    return `${unsigned}.${signature}`;
  }

  private verifyAccessToken(token: string): AccessTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid session");
    }

    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const expected = createHmac("sha256", this.getJwtSecret()).update(unsigned).digest("base64url");
    if (!constantTimeEqual(signature, expected)) {
      throw new UnauthorizedException("Invalid session");
    }

    const header = parseBase64UrlJson(encodedHeader) as { alg?: string; typ?: string };
    const payload = parseBase64UrlJson(encodedPayload) as Partial<AccessTokenPayload>;
    if (header.alg !== "HS256" || payload.sub === undefined || payload.tv === undefined || payload.exp === undefined) {
      throw new UnauthorizedException("Invalid session");
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Invalid session");
    }

    return payload as AccessTokenPayload;
  }

  private getJwtSecret() {
    return process.env.AUTH_JWT_SECRET || "development-only-auth-jwt-secret-change-me";
  }

  private async sendEmailVerification(user: AppSessionUser) {
    if (!this.mail) {
      return;
    }

    await this.prisma.authEmailToken.updateMany({
      where: {
        authUserId: user.id,
        type: AuthEmailTokenType.EMAIL_VERIFICATION,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });

    const code = await this.createEmailCode(user.id, AuthEmailTokenType.EMAIL_VERIFICATION, emailVerificationTtlMs);
    await this.mail.sendTemplate({
      template: "email_verification",
      to: user.email,
      variables: {
        appName: "Madupe",
        displayName: user.displayName,
        verificationCode: code
      }
    });
  }

  private async createEmailCode(authUserId: string, type: AuthEmailTokenType, ttlMs: number) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

    await this.prisma.authEmailToken.create({
      data: {
        authUserId,
        type,
        tokenHash: this.hashToken(code),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    return code;
  }

  private async createEmailToken(authUserId: string, type: AuthEmailTokenType, ttlMs: number) {
    const token = randomBytes(32).toString("base64url");

    await this.prisma.authEmailToken.create({
      data: {
        authUserId,
        type,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    return token;
  }

  private async consumeEmailToken(token: string, type: AuthEmailTokenType) {
    const record = await this.prisma.authEmailToken.findUnique({
      where: { tokenHash: this.hashToken(token) }
    });

    if (!record || record.type !== type || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    await this.prisma.authEmailToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    return record;
  }

  private async consumeEmailCodeForUser(authUserId: string, code: string) {
    const record = await this.prisma.authEmailToken.findUnique({
      where: { tokenHash: this.hashToken(code) }
    });

    if (
      !record ||
      record.authUserId !== authUserId ||
      record.type !== AuthEmailTokenType.EMAIL_VERIFICATION ||
      record.usedAt ||
      record.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    await this.prisma.authEmailToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    return record;
  }

  private async consumePasswordResetCode(input: { email?: string; code?: string }) {
    const email = input.email ? this.normalizeEmail(input.email) : "";
    const code = input.code?.trim() ?? "";

    if (!email || !/^\d{6}$/.test(code)) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    const user = await this.prisma.authUser.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    const record = await this.prisma.authEmailToken.findUnique({
      where: { tokenHash: this.hashToken(code) }
    });

    if (
      !record ||
      record.authUserId !== user.id ||
      record.type !== AuthEmailTokenType.PASSWORD_RESET ||
      record.usedAt ||
      record.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("Invalid or expired code");
    }

    await this.prisma.authEmailToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    return record;
  }

  private buildAppUrl(path: string) {
    return new URL(path, getPublicAppBaseUrl()).toString();
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString("base64url");
    const key = await derivePasswordKey(password, salt, passwordHashParams.keyLength, {
      N: passwordHashParams.cost,
      r: passwordHashParams.blockSize,
      p: passwordHashParams.parallelization
    });

    return [
      "scrypt",
      passwordHashParams.cost,
      passwordHashParams.blockSize,
      passwordHashParams.parallelization,
      salt,
      key.toString("base64url")
    ].join("$");
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [algorithm, cost, blockSize, parallelization, salt, key] = storedHash.split("$");

    if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !salt || !key) {
      return false;
    }

    const expected = Buffer.from(key, "base64url");
    const actual = await derivePasswordKey(password, salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization)
    });

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64UrlJson(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new UnauthorizedException("Invalid session");
  }
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function derivePasswordKey(password: string, salt: string, length: number, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}
