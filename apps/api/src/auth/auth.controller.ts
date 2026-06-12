import { Body, Controller, Get, Headers, Post, Query, Redirect, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { getPublicAppBaseUrl } from "../security/security-config";
import { AppAuthService } from "./app-auth.service";

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
  user: {
    id: string;
    email: string;
    email_confirmed_at: string | null;
    confirmed_at: string | null;
    user_metadata: {
      displayName: string;
      mustChangePassword: boolean;
    };
  };
};

type SignupResponse = {
  session: null;
  user: AuthResponse["user"];
};

@Controller("auth")
export class AuthController {
  constructor(private readonly appAuth: AppAuthService) {}

  @Post("signup")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async signUp(@Body() input: { email: string; password: string; displayName?: string }): Promise<SignupResponse> {
    const result = await this.appAuth.signUp(input);
    return {
      session: null,
      user: this.toUserResponse(result.user)
    };
  }

  @Post("signup/email")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changeSignupEmail(@Body() input: { currentEmail: string; newEmail: string; password: string }): Promise<SignupResponse> {
    const result = await this.appAuth.changeUnverifiedEmail(input);
    return {
      session: null,
      user: this.toUserResponse(result.user)
    };
  }

  @Post("signin")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async signIn(@Body() input: { email: string; password: string }): Promise<AuthResponse> {
    const session = await this.appAuth.signIn(input);
    return this.toResponse(session);
  }

  @Post("password")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async changePassword(
    @Body() input: { oldPassword: string; password: string },
    @Headers("authorization") authorization?: string
  ): Promise<AuthResponse> {
    const token = this.getBearerToken(authorization);
    const session = await this.appAuth.changePassword(token, input);
    return this.toResponse(session);
  }

  @Post("password-reset/request")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestPasswordReset(@Body() input: { email: string }) {
    await this.appAuth.requestPasswordReset(input);
    return { ok: true };
  }

  @Post("password-reset/confirm")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() input: { token?: string; email?: string; code?: string; password: string }): Promise<AuthResponse> {
    const session = await this.appAuth.resetPassword(input);
    return this.toResponse(session);
  }

  @Post("refresh")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async refresh(@Body() input: { refresh_token?: string }): Promise<AuthResponse> {
    if (!input.refresh_token) {
      throw new UnauthorizedException("Missing refresh token");
    }

    const session = await this.appAuth.refreshSession(input.refresh_token);
    return this.toResponse(session);
  }

  @Get("verify-email")
  @Redirect()
  async verifyEmail(@Query("token") token: string) {
    await this.appAuth.verifyEmail({ token });
    return {
      url: new URL("/login?verified=1", getPublicAppBaseUrl()).toString()
    };
  }

  @Post("verify-email")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyEmailCode(@Body() input: { email: string; code: string }) {
    await this.appAuth.verifyEmailCode(input);
    return { ok: true };
  }

  @Post("signout")
  async signOut(
    @Headers("authorization") authorization?: string,
    @Body() body?: { refresh_token?: string }
  ) {
    const token = this.getBearerToken(authorization);
    await this.appAuth.signOut(token, body?.refresh_token);
    return { ok: true };
  }

  private toResponse(session: Awaited<ReturnType<AppAuthService["signIn"]>>): AuthResponse {
    return {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_at: session.expiresAt.toISOString(),
      refresh_expires_at: session.refreshExpiresAt.toISOString(),
      user: this.toUserResponse(session.user)
    };
  }

  private toUserResponse(user: Awaited<ReturnType<AppAuthService["signIn"]>>["user"]): AuthResponse["user"] {
    const verifiedAt = user.emailVerifiedAt?.toISOString() ?? null;

    return {
      id: user.id,
      email: user.email,
      email_confirmed_at: verifiedAt,
      confirmed_at: verifiedAt,
      user_metadata: {
        displayName: user.displayName,
        mustChangePassword: user.mustChangePassword
      }
    };
  }

  private getBearerToken(value: string | string[] | undefined) {
    const header = Array.isArray(value) ? value[0] : value;
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    return token;
  }
}
