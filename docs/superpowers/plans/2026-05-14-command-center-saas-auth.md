# Command Center SaaS Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production SaaS vertical slice: real Supabase Auth login, admin-created staff credentials, required password change, and a Command Center app shell replacing the demo home page.

**Architecture:** Supabase Auth owns browser sessions, passwords, and created auth users. NestJS owns staff identity, workspace/venue memberships, permission checks, and user-management APIs backed by Prisma. Next.js owns the login/password screens and Command Center UI, calling Nest with Supabase access tokens.

**Tech Stack:** Next.js 16, React 19, Supabase JS, NestJS 11, Prisma 6, Node test runner, TypeScript, lucide-react.

---

## Scope Check

This plan implements one vertical production slice. It does not include public signup, billing, platform-owner workspace creation UI, QR export, or third-party integrations.

## File Structure

- Modify `packages/database/prisma/schema.prisma`: add `StaffProfile.authUserId`.
- Modify `packages/database/prisma/seed.ts`: allow seeded staff profiles to remain unlinked unless a Supabase auth ID is supplied.
- Modify `apps/api/package.json`: add `@supabase/supabase-js`.
- Create `apps/api/src/auth/supabase-auth.guard.ts`: verify bearer tokens with Supabase and load staff auth context from Prisma.
- Create `apps/api/src/auth/supabase-admin.service.ts`: create users and clear password-change metadata through Supabase Admin API.
- Modify `apps/api/src/auth/auth.module.ts`: export the new guard/service.
- Create `apps/api/src/staff/dto/create-staff-user.dto.ts`: validate admin-created user input.
- Create `apps/api/src/staff/staff.service.ts`: current-user lookup, team listing, admin-created user workflow, and password-change flag clearing.
- Create `apps/api/src/staff/staff.controller.ts`: `/me`, `/team`, and `/team` creation endpoints.
- Create `apps/api/src/staff/staff.service.test.ts`: service tests with mocked Prisma and Supabase admin client.
- Modify `apps/api/src/staff/staff.module.ts`: wire controller/service.
- Create `apps/web/lib/api/client.ts`: browser API helper that attaches Supabase access tokens.
- Create `apps/web/lib/auth/types.ts`: web auth view models.
- Create `apps/web/app/app-shell.tsx`: Command Center shell component.
- Create `apps/web/app/login-panel.tsx`: Supabase login form.
- Create `apps/web/app/password-change-panel.tsx`: required password-change form.
- Replace `apps/web/app/page.tsx`: root auth/session router and Command Center entry.
- Modify `apps/web/app/layout.tsx`: remove demo navigation and support auth-first shell styling.
- Create `apps/web/app/components/command-center-dashboard.tsx`: dashboard summary.
- Create `apps/web/app/components/team-command.tsx`: admin-created credential UI.
- Create `apps/web/app/components/venues-command.tsx`: venue list and service-point surface.
- Create `apps/web/app/components/account-command.tsx`: account/password actions.
- Modify `apps/web/app/admin/admin-dashboard.tsx`: visually align existing operations UI with Command Center.
- Modify `apps/web/app/globals.css`: replace demo theme with Command Center design system.
- This repository currently has no web component test harness. This slice verifies web behavior with TypeScript build, ESLint, and manual smoke checks; API behavior receives automated Node tests.

---

### Task 1: Prisma Identity Link

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/prisma/seed.ts`

- [ ] **Step 1: Add the auth user link to the Prisma schema**

Modify `StaffProfile` in `packages/database/prisma/schema.prisma`:

```prisma
model StaffProfile {
  id                         String              @id @default(uuid()) @db.Uuid
  authUserId                 String?             @unique
  email                      String?             @unique
  displayName                String
  memberships                StaffMembership[]
  assignedRequests           SupportRequest[]    @relation("AssignedRequests")
  requestAssignments         RequestAssignment[] @relation("AssignmentStaff")
  assignedRequestAssignments RequestAssignment[] @relation("AssignmentActor")
  requestEvents              RequestEvent[]
  auditLogs                  AuditLog[]
  createdAt                  DateTime            @default(now())
  updatedAt                  DateTime            @updatedAt
}
```

- [ ] **Step 2: Keep seed profiles unlinked by default**

In `packages/database/prisma/seed.ts`, leave the existing `staffProfile.upsert` shape unchanged except for allowing an optional `authUserId` in seed input. Use this helper above `main()`:

```ts
type SeedStaff = readonly [id: string, email: string, displayName: string, role: StaffRole, authUserId?: string];
```

Change the `staff` declaration to:

```ts
const staff: readonly SeedStaff[] = [
  ["00000000-0000-0000-0000-000000000401", "owner@demo.local", "Olivia Owner", StaffRole.OWNER],
  ["00000000-0000-0000-0000-000000000402", "maya.manager@demo.local", "Maya Manager", StaffRole.MANAGER],
  ["00000000-0000-0000-0000-000000000403", "alex.admin@demo.local", "Alex Admin", StaffRole.ADMIN],
  ["00000000-0000-0000-0000-000000000404", "sam.staff@demo.local", "Sam Staff", StaffRole.STAFF],
  ["00000000-0000-0000-0000-000000000405", "riley.runner@demo.local", "Riley Runner", StaffRole.STAFF],
  ["00000000-0000-0000-0000-000000000406", "casey.security@demo.local", "Casey Security", StaffRole.SECURITY]
];
```

Change the loop head and profile write:

```ts
for (const [id, email, displayName, role, authUserId] of staff) {
  await prisma.staffProfile.upsert({
    create: {
      id,
      authUserId,
      displayName,
      email
    },
    update: {
      authUserId,
      displayName,
      email
    },
    where: {
      id
    }
  });
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
npm run prisma:generate
```

Expected: exits 0 and prints `Generated Prisma Client`.

- [ ] **Step 4: Build database package**

Run:

```bash
npm run build -w @guestos/database
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/seed.ts
git commit -m "feat: link staff profiles to auth users"
```

---

### Task 2: Supabase Auth Guard For Nest

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/auth/supabase-auth.guard.ts`
- Create: `apps/api/src/auth/supabase-admin.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/supabase-auth.guard.test.ts`

- [ ] **Step 1: Add Supabase dependency to API**

Run:

```bash
npm install @supabase/supabase-js -w @guestos/api
```

Expected: exits 0 and updates `apps/api/package.json` plus `package-lock.json`.

- [ ] **Step 2: Write Supabase auth guard tests**

Create `apps/api/src/auth/supabase-auth.guard.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { SupabaseAuthGuard } from "./supabase-auth.guard";

function contextWithAuthHeader(value?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: value ? { authorization: value } : {}
      })
    })
  } as ExecutionContext;
}

describe("SupabaseAuthGuard", () => {
  it("creates auth context from a Supabase user linked to active membership", async () => {
    const guard = new SupabaseAuthGuard(
      {
        auth: {
          getUser: async (token: string) => ({
            data: { user: { id: token, email: "admin@example.com", user_metadata: { mustChangePassword: false } } },
            error: null
          })
        }
      } as any,
      {
        staffProfile: {
          findUnique: async () => ({
            id: "staff-1",
            authUserId: "auth-1",
            email: "admin@example.com",
            displayName: "Admin User",
            memberships: [
              {
                id: "membership-1",
                workspaceId: "workspace-1",
                venueId: null,
                role: "ADMIN",
                isActive: true,
                workspace: { id: "workspace-1", name: "Workspace", slug: "workspace" },
                venue: null
              }
            ]
          })
        }
      } as any
    );

    const context = contextWithAuthHeader("Bearer auth-1");
    assert.equal(await guard.canActivate(context), true);
    const request = context.switchToHttp().getRequest() as any;
    assert.equal(request.auth.staffProfileId, "staff-1");
    assert.equal(request.auth.workspaceId, "workspace-1");
    assert.equal(request.auth.role, "admin");
    assert.equal(request.currentUser.mustChangePassword, false);
  });

  it("rejects requests without bearer tokens", async () => {
    const guard = new SupabaseAuthGuard({} as any, {} as any);
    await assert.rejects(() => guard.canActivate(contextWithAuthHeader()), UnauthorizedException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm test -w @guestos/api
```

Expected: FAIL with an import error for `./supabase-auth.guard`.

- [ ] **Step 4: Implement the Supabase auth guard**

Create `apps/api/src/auth/supabase-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { RequestWithAuth } from "./auth-context";
import { SUPABASE_ADMIN_CLIENT, type SupabaseAdminClient } from "./supabase-admin.service";

type RequestWithCurrentUser = RequestWithAuth & {
  currentUser?: {
    authUserId: string;
    email: string | null;
    displayName: string;
    mustChangePassword: boolean;
    memberships: Array<{
      id: string;
      workspaceId: string;
      venueId: string | null;
      role: string;
      workspace: { id: string; name: string; slug: string };
      venue: { id: string; name: string; slug: string } | null;
    }>;
  };
  headers: Record<string, string | string[] | undefined>;
};

const roleByPrismaRole: Record<string, "owner" | "manager" | "admin" | "staff" | "security" | "read_only"> = {
  OWNER: "owner",
  MANAGER: "manager",
  ADMIN: "admin",
  STAFF: "staff",
  SECURITY: "security",
  READ_ONLY: "read_only"
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseAdminClient,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithCurrentUser>();
    const token = this.getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException("Invalid session");
    }

    const profile = await this.prisma.staffProfile.findUnique({
      where: { authUserId: data.user.id },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const membership = profile?.memberships[0];

    if (!profile || !membership) {
      throw new UnauthorizedException("Staff account is not configured");
    }

    request.auth = {
      staffProfileId: profile.id,
      workspaceId: membership.workspaceId,
      venueId: membership.venueId ?? undefined,
      role: roleByPrismaRole[membership.role]
    };
    request.currentUser = {
      authUserId: data.user.id,
      email: data.user.email ?? profile.email ?? null,
      displayName: profile.displayName,
      mustChangePassword: data.user.user_metadata?.mustChangePassword === true,
      memberships: profile.memberships.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        venueId: item.venueId,
        role: roleByPrismaRole[item.role],
        workspace: item.workspace,
        venue: item.venue
      }))
    };

    return true;
  }

  private getBearerToken(value: string | string[] | undefined) {
    const header = Array.isArray(value) ? value[0] : value;
    const match = header?.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }
}
```

- [ ] **Step 5: Implement Supabase admin service/provider**

Create `apps/api/src/auth/supabase-admin.service.ts`:

```ts
import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseAdminClient = SupabaseClient;
export const SUPABASE_ADMIN_CLIENT = Symbol("SUPABASE_ADMIN_CLIENT");

export const supabaseAdminProvider = {
  provide: SUPABASE_ADMIN_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const url = config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = config.get<string>("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      throw new InternalServerErrorException("Supabase admin configuration is missing");
    }

    return createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
};

@Injectable()
export class SupabaseAdminService {
  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseAdminClient) {}

  async createTemporaryPasswordUser(input: { email: string; password: string; displayName: string }) {
    const result = await this.supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        displayName: input.displayName,
        mustChangePassword: true
      }
    });

    if (result.error || !result.data.user) {
      throw new InternalServerErrorException(result.error?.message || "Could not create auth user");
    }

    return result.data.user;
  }

  async clearPasswordChangeRequired(authUserId: string) {
    const result = await this.supabase.auth.admin.updateUserById(authUserId, {
      user_metadata: {
        mustChangePassword: false
      }
    });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.data.user;
  }
}
```

- [ ] **Step 6: Wire auth module**

Modify `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DevAuthGuard } from "./dev-auth.guard";
import { SupabaseAdminService, supabaseAdminProvider } from "./supabase-admin.service";
import { SupabaseAuthGuard } from "./supabase-auth.guard";

@Module({
  imports: [DatabaseModule],
  providers: [DevAuthGuard, SupabaseAuthGuard, SupabaseAdminService, supabaseAdminProvider],
  exports: [DevAuthGuard, SupabaseAuthGuard, SupabaseAdminService, supabaseAdminProvider]
})
export class AuthModule {}
```

- [ ] **Step 7: Run API tests and build**

Run:

```bash
npm test -w @guestos/api
npm run build -w @guestos/api
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/auth
git commit -m "feat: verify Supabase staff sessions"
```

---

### Task 3: Staff User Management API

**Files:**
- Create: `apps/api/src/staff/dto/create-staff-user.dto.ts`
- Create: `apps/api/src/staff/staff.service.ts`
- Create: `apps/api/src/staff/staff.controller.ts`
- Create: `apps/api/src/staff/staff.service.test.ts`
- Modify: `apps/api/src/staff/staff.module.ts`

- [ ] **Step 1: Write staff service tests**

Create `apps/api/src/staff/staff.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { StaffService } from "./staff.service";

const adminAuth = { staffProfileId: "admin-1", workspaceId: "workspace-1", role: "admin" as const };
const staffAuth = { staffProfileId: "staff-1", workspaceId: "workspace-1", venueId: "venue-1", role: "staff" as const };

describe("StaffService", () => {
  it("creates a Supabase auth user, staff profile, and membership for admins", async () => {
    const service = new StaffService(
      {
        staffProfile: {
          findUnique: async () => null,
          create: async ({ data }: any) => ({ id: "profile-1", ...data })
        },
        staffMembership: {
          create: async ({ data }: any) => ({ id: "membership-1", ...data })
        }
      } as any,
      {
        createTemporaryPasswordUser: async () => ({ id: "auth-1", email: "sam@example.com" })
      } as any
    );

    const result = await service.createStaffUser(adminAuth, {
      email: "sam@example.com",
      displayName: "Sam Service",
      role: "staff",
      venueId: "venue-1"
    });

    assert.equal(result.staff.authUserId, "auth-1");
    assert.equal(result.staff.email, "sam@example.com");
    assert.equal(result.membership.role, "STAFF");
    assert.match(result.temporaryPassword, /^GuestOS-/);
  });

  it("rejects non-admin user creation", async () => {
    const service = new StaffService({} as any, {} as any);
    await assert.rejects(
      () =>
        service.createStaffUser(staffAuth, {
          email: "new@example.com",
          displayName: "New User",
          role: "staff",
          venueId: "venue-1"
        }),
      ForbiddenException
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -w @guestos/api
```

Expected: FAIL with an import error for `./staff.service`.

- [ ] **Step 3: Add create-staff DTO**

Create `apps/api/src/staff/dto/create-staff-user.dto.ts`:

```ts
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from "class-validator";

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsIn(["owner", "admin", "manager", "staff", "security", "read_only"])
  role!: "owner" | "admin" | "manager" | "staff" | "security" | "read_only";

  @ValidateIf((input: CreateStaffUserDto) => !["owner", "admin"].includes(input.role))
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @IsString()
  temporaryPassword?: string;
}
```

- [ ] **Step 4: Implement staff service**

Create `apps/api/src/staff/staff.service.ts`:

```ts
import { randomBytes } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { SupabaseAdminService } from "../auth/supabase-admin.service";
import { PrismaService } from "../database/prisma.service";
import type { CreateStaffUserDto } from "./dto/create-staff-user.dto";

const prismaRoleBySharedRole: Record<CreateStaffUserDto["role"], StaffRole> = {
  owner: StaffRole.OWNER,
  admin: StaffRole.ADMIN,
  manager: StaffRole.MANAGER,
  staff: StaffRole.STAFF,
  security: StaffRole.SECURITY,
  read_only: StaffRole.READ_ONLY
};

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService
  ) {}

  async getCurrentUser(auth: AuthContext) {
    return this.prisma.staffProfile.findUnique({
      where: { id: auth.staffProfileId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { workspace: true, venue: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });
  }

  async listTeam(auth: AuthContext) {
    this.assertWorkspaceAdmin(auth);

    return this.prisma.staffProfile.findMany({
      where: {
        memberships: {
          some: {
            workspaceId: auth.workspaceId,
            isActive: true
          }
        }
      },
      include: {
        memberships: {
          where: { workspaceId: auth.workspaceId },
          include: { venue: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { displayName: "asc" }
    });
  }

  async createStaffUser(auth: AuthContext, input: CreateStaffUserDto) {
    this.assertWorkspaceAdmin(auth);

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.staffProfile.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException("A staff profile already exists for this email");
    }

    const temporaryPassword = input.temporaryPassword || this.generateTemporaryPassword();
    const authUser = await this.supabaseAdmin.createTemporaryPasswordUser({
      email,
      password: temporaryPassword,
      displayName: input.displayName.trim()
    });

    const staff = await this.prisma.staffProfile.create({
      data: {
        authUserId: authUser.id,
        email,
        displayName: input.displayName.trim()
      }
    });

    const membership = await this.prisma.staffMembership.create({
      data: {
        workspaceId: auth.workspaceId,
        venueId: ["owner", "admin"].includes(input.role) ? null : input.venueId,
        staffProfileId: staff.id,
        role: prismaRoleBySharedRole[input.role]
      }
    });

    return {
      staff,
      membership,
      temporaryPassword
    };
  }

  private assertWorkspaceAdmin(auth: AuthContext) {
    if (auth.role !== "owner" && auth.role !== "admin") {
      throw new ForbiddenException("Only workspace admins can manage staff");
    }
  }

  private generateTemporaryPassword() {
    const suffix = randomBytes(9).toString("hex").slice(0, 14);
    return `GuestOS-${suffix}!`;
  }
}
```

- [ ] **Step 5: Implement staff controller**

Create `apps/api/src/staff/staff.controller.ts`:

```ts
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import type { AuthContext } from "../auth/auth-context";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import { StaffService } from "./staff.service";

@ApiTags("staff")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("me")
  @ApiOkResponse({ description: "Returns the authenticated staff profile and active memberships" })
  getCurrentUser(@CurrentAuth() auth: AuthContext) {
    return this.staff.getCurrentUser(auth);
  }

  @Get("team")
  @ApiOkResponse({ description: "Lists staff in the authenticated workspace" })
  listTeam(@CurrentAuth() auth: AuthContext) {
    return this.staff.listTeam(auth);
  }

  @Post("team")
  @ApiCreatedResponse({ description: "Creates a Supabase Auth user and staff membership" })
  createStaffUser(@CurrentAuth() auth: AuthContext, @Body() input: CreateStaffUserDto) {
    return this.staff.createStaffUser(auth, input);
  }
}
```

- [ ] **Step 6: Wire staff module**

Modify `apps/api/src/staff/staff.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService]
})
export class StaffModule {}
```

- [ ] **Step 7: Run API tests and build**

Run:

```bash
npm test -w @guestos/api
npm run build -w @guestos/api
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/staff
git commit -m "feat: add staff credential management API"
```

---

### Task 4: Web API Client And Auth Screens

**Files:**
- Create: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/auth/types.ts`
- Create: `apps/web/app/login-panel.tsx`
- Create: `apps/web/app/password-change-panel.tsx`
- Replace: `apps/web/app/page.tsx`

- [ ] **Step 1: Add web auth types**

Create `apps/web/lib/auth/types.ts`:

```ts
export type CommandMembership = {
  id: string;
  workspaceId: string;
  venueId: string | null;
  role: "owner" | "admin" | "manager" | "staff" | "security" | "read_only";
  workspace: { id: string; name: string; slug: string };
  venue: { id: string; name: string; slug: string } | null;
};

export type CommandUser = {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  memberships: CommandMembership[];
};

export type CreatedStaffCredential = {
  staff: {
    id: string;
    authUserId: string;
    email: string;
    displayName: string;
  };
  temporaryPassword: string;
};
```

- [ ] **Step 2: Add API client**

Create `apps/web/lib/api/client.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export async function apiRequest<T>(supabase: SupabaseClient, path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("You are not signed in");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.message || body?.error || "Request failed");
  }

  return body as T;
}
```

- [ ] **Step 3: Create login panel**

Create `apps/web/app/login-panel.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, Mail, Radar } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function LoginPanel() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (result.error) {
      setError("Email or password is incorrect.");
      return;
    }

    window.location.reload();
  }

  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-label="GuestOS command center">
        <div className="auth-signal">
          <Radar size={18} />
          Live venue command
        </div>
        <h1>GuestOS Command Center</h1>
        <p>Sign in to manage venues, service points, staff credentials, and live guest requests.</p>
      </section>

      <section className="auth-panel" aria-label="Sign in">
        <div>
          <div className="eyebrow">Secure access</div>
          <h2>Sign in</h2>
          <p className="muted">Accounts are created by workspace admins. There is no public signup.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <span className="input-shell">
              <Mail size={16} />
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </span>
          </label>
          <label>
            <span>Password</span>
            <span className="input-shell">
              <LockKeyhole size={16} />
              <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </span>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            {loading ? "Checking credentials..." : "Enter command center"}
          </button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Create required password-change panel**

Create `apps/web/app/password-change-panel.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function PasswordChangePanel() {
  const supabase = createBrowserSupabaseClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured for this environment.");
      return;
    }

    if (password.length < 10) {
      setError("Use at least 10 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await supabase.auth.updateUser({
      password,
      data: { mustChangePassword: false }
    });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    window.location.reload();
  }

  return (
    <main className="auth-screen compact">
      <section className="auth-panel password-panel" aria-label="Set new password">
        <span className="status-orbit">
          <ShieldCheck size={22} />
        </span>
        <div>
          <div className="eyebrow">Temporary credential</div>
          <h1>Set a new password</h1>
          <p className="muted">Your workspace admin created this account with a temporary password. Set your own password before entering GuestOS.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>New password</span>
            <input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label>
            <span>Confirm password</span>
            <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            {loading ? "Securing account..." : "Save password"}
          </button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Replace root page with auth router**

Replace `apps/web/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppShell } from "./app-shell";
import { LoginPanel } from "./login-panel";
import { PasswordChangePanel } from "./password-change-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function HomePage() {
  const supabase = createBrowserSupabaseClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) {
    return <main className="auth-screen"><div className="loading-panel">Loading command center...</div></main>;
  }

  if (!session) {
    return <LoginPanel />;
  }

  if (session.user.user_metadata?.mustChangePassword === true) {
    return <PasswordChangePanel />;
  }

  return <AppShell />;
}
```

- [ ] **Step 6: Run web build**

Run:

```bash
npm run build -w @guestos/web
```

Expected: FAIL with an import error for `./app-shell`; Task 5 creates it.

- [ ] **Step 7: Commit partial auth screens after Task 5 passes**

Do not commit at this point. Commit after Task 5 creates `AppShell` and the web build passes.

---

### Task 5: Command Center App Shell And Core Screens

**Files:**
- Create: `apps/web/app/app-shell.tsx`
- Create: `apps/web/app/components/command-center-dashboard.tsx`
- Create: `apps/web/app/components/team-command.tsx`
- Create: `apps/web/app/components/venues-command.tsx`
- Create: `apps/web/app/components/account-command.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Create dashboard component**

Create `apps/web/app/components/command-center-dashboard.tsx`:

```tsx
import { Activity, BellRing, MapPinned, Star } from "lucide-react";

export function CommandCenterDashboard() {
  const metrics = [
    { label: "Active requests", value: "18", detail: "5 high priority", icon: BellRing },
    { label: "Open venues", value: "3", detail: "2 in service", icon: MapPinned },
    { label: "Avg satisfaction", value: "4.6", detail: "last 24h", icon: Star },
    { label: "Live signals", value: "92%", detail: "queue health", icon: Activity }
  ];

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Operations overview</div>
          <h1>Command Center</h1>
        </div>
        <span className="live-pill">Live</span>
      </div>
      <div className="metric-strip">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="command-metric" key={metric.label}>
              <Icon size={18} />
              <div>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
                <small>{metric.detail}</small>
              </div>
            </article>
          );
        })}
      </div>
      <div className="command-panel wide">
        <h2>Priority queue</h2>
        <div className="queue-list">
          {["VIP booth needs security support", "Table 12 waiting on payment", "Bar area spill cleanup"].map((item, index) => (
            <div className="queue-row" key={item}>
              <span className={`severity-dot severity-${index}`} />
              <strong>{item}</strong>
              <span>{index === 0 ? "Urgent" : "In progress"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create Team screen**

Create `apps/web/app/components/team-command.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import type { CreatedStaffCredential } from "@/lib/auth/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function TeamCommand() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("staff");
  const [venueId, setVenueId] = useState("");
  const [created, setCreated] = useState<CreatedStaffCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiRequest<CreatedStaffCredential>(supabase, "/team", {
        method: "POST",
        body: JSON.stringify({
          email,
          displayName,
          role,
          venueId: ["owner", "admin"].includes(role) ? undefined : venueId
        })
      });
      setCreated(result);
      setEmail("");
      setDisplayName("");
      setVenueId("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create staff user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Credential control</div>
          <h1>Team</h1>
        </div>
      </div>
      <div className="command-panel">
        <h2>Create user</h2>
        <form className="command-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>Display name</span>
            <input onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
          </label>
          <label>
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="security">Security</option>
              <option value="read_only">Read only</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          {!["owner", "admin"].includes(role) ? (
            <label>
              <span>Venue ID</span>
              <input onChange={(event) => setVenueId(event.target.value)} required value={venueId} />
            </label>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <button className="command-button primary" disabled={loading} type="submit">
            <UserPlus size={16} />
            {loading ? "Creating..." : "Create credentials"}
          </button>
        </form>
      </div>
      {created ? (
        <div className="command-panel credential-panel">
          <h2>Temporary password</h2>
          <p>This password is shown once. The user must change it at first login.</p>
          <code>{created.temporaryPassword}</code>
          <button className="command-button" onClick={() => void navigator.clipboard.writeText(created.temporaryPassword)} type="button">
            <Copy size={16} />
            Copy password
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Create Venues screen**

Create `apps/web/app/components/venues-command.tsx`:

```tsx
import { MapPinned, QrCode } from "lucide-react";

export function VenuesCommand() {
  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Workspace topology</div>
          <h1>Venues & service points</h1>
        </div>
      </div>
      <div className="command-panel wide">
        <div className="empty-state">
          <MapPinned size={28} />
          <h2>Production venue controls</h2>
          <p>Venue and QR service point APIs are ready to be connected to this surface. Use the seeded workspace and service points while wiring live data.</p>
        </div>
      </div>
      <div className="command-panel">
        <h2>QR readiness</h2>
        <div className="qr-row">
          <QrCode size={26} />
          <span>Service-point tokens stay active for guest chat routes.</span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create Account screen**

Create `apps/web/app/components/account-command.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function AccountCommand() {
  const supabase = createBrowserSupabaseClient();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const result = await supabase.auth.updateUser({ password });
    setMessage(result.error ? result.error.message : "Password updated.");
    if (!result.error) {
      setPassword("");
    }
  }

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.reload();
  }

  return (
    <section className="command-grid">
      <div className="command-heading">
        <div>
          <div className="eyebrow">Account security</div>
          <h1>Account</h1>
        </div>
      </div>
      <div className="command-panel">
        <h2>Change password</h2>
        <form className="command-form" onSubmit={changePassword}>
          <label>
            <span>New password</span>
            <input minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {message ? <div className="form-note">{message}</div> : null}
          <button className="command-button primary" type="submit">
            <ShieldCheck size={16} />
            Update password
          </button>
        </form>
      </div>
      <div className="command-panel">
        <h2>Session</h2>
        <button className="command-button danger" onClick={signOut} type="button">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create app shell**

Create `apps/web/app/app-shell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Activity, Building2, LayoutDashboard, RadioTower, Settings, Users } from "lucide-react";
import { AccountCommand } from "./components/account-command";
import { CommandCenterDashboard } from "./components/command-center-dashboard";
import { TeamCommand } from "./components/team-command";
import { VenuesCommand } from "./components/venues-command";
import { AdminDashboard } from "./admin/admin-dashboard";

type View = "dashboard" | "operations" | "team" | "venues" | "account";

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "operations", label: "Operations", icon: RadioTower },
  { id: "team", label: "Team", icon: Users },
  { id: "venues", label: "Venues", icon: Building2 },
  { id: "account", label: "Account", icon: Settings }
];

export function AppShell() {
  const [view, setView] = useState<View>("dashboard");

  return (
    <main className="command-shell">
      <aside className="command-sidebar">
        <div className="command-brand">
          <span className="command-mark">
            <Activity size={18} />
          </span>
          <div>
            <strong>GuestOS</strong>
            <span>Command Center</span>
          </div>
        </div>
        <nav aria-label="Command center navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="live-pill">Live service</span>
          <small>Workspace access enforced by API.</small>
        </div>
      </aside>
      <section className="command-main">
        {view === "dashboard" ? <CommandCenterDashboard /> : null}
        {view === "operations" ? <AdminDashboard /> : null}
        {view === "team" ? <TeamCommand /> : null}
        {view === "venues" ? <VenuesCommand /> : null}
        {view === "account" ? <AccountCommand /> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Simplify root layout**

Modify `apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuestOS Command Center",
  description: "Production command center for venue guest support"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Replace global theme**

Modify `apps/web/app/globals.css` to keep existing request-dashboard class support but define the Command Center foundation at the top:

```css
:root {
  --bg: #080d0b;
  --surface: #0f1614;
  --surface-2: #151f1c;
  --panel: #101714;
  --panel-2: #17221e;
  --line: #26352f;
  --line-strong: #385247;
  --ink: #f5f2e8;
  --muted: #9caaa4;
  --accent: #d8ff68;
  --accent-2: #63d7ff;
  --danger: #ff6b4a;
  --warning: #ffcc5c;
  --success: #54d8a7;
  --shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
}

* {
  box-sizing: border-box;
}

body {
  background:
    radial-gradient(circle at 18% 12%, rgba(216, 255, 104, 0.12), transparent 28%),
    linear-gradient(180deg, #0d1411 0%, #070b0a 100%);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.auth-screen,
.command-shell {
  min-height: 100vh;
}

.auth-screen {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 520px);
}

.auth-screen.compact {
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-hero {
  align-content: end;
  background:
    linear-gradient(140deg, rgba(8, 13, 11, 0.18), rgba(8, 13, 11, 0.92)),
    url("https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=80");
  background-position: center;
  background-size: cover;
  display: grid;
  padding: clamp(32px, 7vw, 88px);
}

.auth-hero h1,
.command-heading h1 {
  font-size: clamp(42px, 6vw, 76px);
  letter-spacing: 0;
  line-height: 0.95;
  margin: 12px 0;
}

.auth-hero p,
.muted {
  color: var(--muted);
  line-height: 1.55;
}

.auth-signal,
.live-pill,
.eyebrow {
  align-items: center;
  color: var(--accent);
  display: inline-flex;
  font-size: 12px;
  font-weight: 900;
  gap: 8px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.auth-panel,
.command-panel,
.command-metric {
  background: rgba(15, 22, 20, 0.92);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}

.auth-panel {
  align-content: center;
  display: grid;
  gap: 26px;
  padding: clamp(28px, 5vw, 58px);
}

.password-panel {
  border-radius: 8px;
  max-width: 560px;
}

.auth-form,
.command-form {
  display: grid;
  gap: 16px;
}

.auth-form label,
.command-form label {
  color: var(--muted);
  display: grid;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
}

.auth-form input,
.command-form input,
.command-form select,
.input-shell {
  background: #0a100e;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
}

.auth-form input,
.command-form input,
.command-form select {
  min-height: 44px;
  padding: 0 12px;
  width: 100%;
}

.input-shell {
  align-items: center;
  display: flex;
  gap: 8px;
  padding-left: 12px;
}

.input-shell input {
  border: 0;
}

.command-button {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-weight: 900;
  gap: 8px;
  justify-content: center;
  min-height: 42px;
  padding: 0 14px;
}

.command-button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #0a100e;
}

.command-button.danger {
  border-color: rgba(255, 107, 74, 0.5);
  color: var(--danger);
}

.form-error {
  background: rgba(255, 107, 74, 0.12);
  border: 1px solid rgba(255, 107, 74, 0.38);
  border-radius: 8px;
  color: #ffb3a2;
  padding: 12px;
}

.form-note {
  background: rgba(84, 216, 167, 0.12);
  border: 1px solid rgba(84, 216, 167, 0.3);
  border-radius: 8px;
  color: #b7f7dc;
  padding: 12px;
}

.command-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
}

.command-sidebar {
  background: rgba(8, 13, 11, 0.96);
  border-right: 1px solid var(--line);
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  padding: 18px;
}

.command-brand {
  align-items: center;
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.command-brand span:last-child {
  color: var(--muted);
  display: block;
  font-size: 12px;
}

.command-mark {
  align-items: center;
  background: var(--accent);
  border-radius: 8px;
  color: #0a100e;
  display: inline-flex;
  height: 38px;
  justify-content: center;
  width: 38px;
}

.command-sidebar nav {
  display: grid;
  gap: 8px;
}

.command-sidebar button {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  gap: 10px;
  min-height: 40px;
  padding: 0 10px;
  text-align: left;
}

.command-sidebar button.active,
.command-sidebar button:hover {
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--ink);
}

.sidebar-footer {
  color: var(--muted);
  display: grid;
  gap: 8px;
}

.command-main {
  min-width: 0;
  padding: clamp(20px, 4vw, 44px);
}

.command-grid {
  display: grid;
  gap: 18px;
}

.command-heading {
  align-items: end;
  display: flex;
  justify-content: space-between;
}

.metric-strip {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.command-metric,
.command-panel {
  border-radius: 8px;
  padding: 18px;
}

.command-metric {
  align-items: flex-start;
  display: flex;
  gap: 12px;
}

.command-metric strong {
  display: block;
  font-size: 28px;
}

.command-metric span,
.command-metric small {
  color: var(--muted);
  display: block;
}

.wide {
  grid-column: 1 / -1;
}

.queue-list {
  display: grid;
  gap: 10px;
}

.queue-row {
  align-items: center;
  background: #0a100e;
  border: 1px solid var(--line);
  border-radius: 8px;
  display: grid;
  gap: 12px;
  grid-template-columns: auto 1fr auto;
  padding: 13px;
}

.severity-dot {
  border-radius: 999px;
  height: 10px;
  width: 10px;
}

.severity-0 {
  background: var(--danger);
}

.severity-1 {
  background: var(--warning);
}

.severity-2 {
  background: var(--accent-2);
}

.credential-panel code {
  background: #0a100e;
  border: 1px solid var(--line);
  border-radius: 8px;
  display: block;
  margin: 12px 0;
  padding: 14px;
}

.empty-state,
.qr-row {
  align-items: center;
  color: var(--muted);
  display: grid;
  gap: 10px;
}

@media (max-width: 900px) {
  .auth-screen,
  .command-shell,
  .metric-strip {
    grid-template-columns: 1fr;
  }

  .command-sidebar {
    min-height: auto;
  }
}
```

Keep any existing class rules needed by `AdminDashboard` below this foundation and update their color variables to use the new `--surface`, `--panel`, `--line`, `--ink`, and `--muted` values.

- [ ] **Step 8: Run web build**

Run:

```bash
npm run build -w @guestos/web
```

Expected: exits 0.

- [ ] **Step 9: Commit auth screens and shell**

```bash
git add apps/web/app apps/web/lib
git commit -m "feat: add command center auth shell"
```

---

### Task 6: Operations Dashboard Visual Integration

**Files:**
- Modify: `apps/web/app/admin/admin-dashboard.tsx`
- Modify: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Remove production-blocking demo role switch language**

In `apps/web/app/admin/admin-dashboard.tsx`, keep the role-switching logic for local preview behavior, but rename visible copy so it does not look like production auth. Replace:

```tsx
<h1 className="page-title">Operations Dashboard</h1>
<p className="lead">Track guest requests, service recovery, staff handoffs, and satisfaction signals in one live queue.</p>
```

with:

```tsx
<h1 className="page-title">Operations</h1>
<p className="lead">Live guest requests, staff handoffs, service recovery, and satisfaction signals.</p>
```

Replace the role toolbar wrapper with a development-only label:

```tsx
<div className="toolbar">
  <span className="dev-chip">Local role preview</span>
  {(["manager", "admin", "staff"] as StaffRole[]).map((nextRole) => (
```

- [ ] **Step 2: Wrap admin page for legacy route**

Modify `apps/web/app/admin/page.tsx` so direct `/admin` still works but visually matches the shell:

```tsx
import { AdminDashboard } from "./admin-dashboard";

export default function AdminPage() {
  return (
    <main className="legacy-command-page">
      <AdminDashboard />
    </main>
  );
}
```

- [ ] **Step 3: Add CSS compatibility styles**

Append to `apps/web/app/globals.css`:

```css
.legacy-command-page {
  min-height: 100vh;
  padding: clamp(20px, 4vw, 44px);
}

.page-title {
  font-size: clamp(36px, 5vw, 64px);
  line-height: 0.98;
  margin: 0;
}

.lead,
.meta {
  color: var(--muted);
}

.panel,
.request-card,
.metric-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  color: var(--ink);
}

.button {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  color: var(--ink);
  display: inline-flex;
  font-weight: 900;
  gap: 8px;
  min-height: 40px;
  padding: 0 13px;
}

.button.secondary,
.button.selected {
  background: var(--accent);
  color: #0a100e;
}

.button.ghost {
  background: transparent;
}

.dev-chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  padding: 8px 10px;
  text-transform: uppercase;
}
```

- [ ] **Step 4: Run web lint and build**

Run:

```bash
npm run lint -w @guestos/web
npm run build -w @guestos/web
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/admin apps/web/app/globals.css
git commit -m "style: align operations dashboard with command center"
```

---

### Task 7: End-To-End Verification

**Files:**
- Review all changed files.

- [ ] **Step 1: Generate Prisma client**

Run:

```bash
npm run prisma:generate
```

Expected: exits 0 and prints `Generated Prisma Client`.

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected: shared and API tests exit 0.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: all workspace lint commands exit 0.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: database, shared, API, and web builds exit 0.

- [ ] **Step 5: Run high-severity audit**

Run:

```bash
npm audit --audit-level=high
```

Expected: exits 0. If npm reports only moderate advisories inside Next's bundled PostCSS path and suggests `npm audit fix --force` with a downgrade, document the residual moderate advisory in the final report and do not force-downgrade Next.

- [ ] **Step 6: Start both dev servers**

Run API:

```bash
npm run dev:api
```

Expected: Nest listens on `http://127.0.0.1:4000`.

Run web in a second shell:

```bash
npm run dev:web
```

Expected: Next listens on `http://localhost:3000`.

- [ ] **Step 7: Manual smoke checks**

Open `http://localhost:3000` and verify:

- Signed-out root shows the Command Center login page.
- Login form shows an error for invalid credentials.
- Guest route `/table/demo-table-1` remains reachable.
- If Supabase credentials and a seeded admin exist, login reaches the Command Center shell.
- Team screen can submit create-user requests to the API.

- [ ] **Step 8: Review git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified. Commit any final intentional verification/doc updates with a specific message.
