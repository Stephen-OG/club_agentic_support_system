# Production Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app foundation from demo/simple Supabase routes toward the approved hybrid production architecture: Supabase auth/Postgres, NestJS business logic, Prisma production model, multi-venue access, and tested request workflows.

**Architecture:** This first plan builds the backend foundation only. NestJS becomes the source of truth for production workflows, Prisma uses the existing `Workspace -> Venue -> ServicePoint` model, and shared packages hold workflow constants. The Next.js UI remains functional during this phase; UI migration gets its own follow-up plan after production APIs exist.

**Tech Stack:** TypeScript, NestJS, Prisma, Supabase-hosted Postgres, Node test runner, `@guestos/shared`, `@guestos/database`.

---

## Scope Check

The approved spec covers data, auth, APIs, UI, and operations. That is too large for one safe implementation pass, so production work should be split into plans:

1. **Production Foundation**: shared workflow constants, API test harness, auth context, venue access, Prisma-backed public QR request creation, request lifecycle, and audit events.
2. **Admin And Manager UI**: Next.js login, venue switcher, admin venue/service-point/staff screens, and API client migration.
3. **Operations Dashboard UI**: production dashboard against Nest APIs, request assignment, staff actions, and guest chat migration.
4. **Deployment And Hardening**: env validation, deployment docs, observability, rate limiting, and smoke tests.

This plan implements item 1.

## File Structure

- Modify `packages/shared/src/schemas.ts`: export request status, role, sender, and transition schemas.
- Add `packages/shared/src/request-workflow.ts`: pure workflow transition helpers.
- Add `packages/shared/src/request-workflow.test.ts`: request transition tests.
- Modify `packages/shared/src/index.ts`: export new workflow helpers.
- Modify `apps/api/package.json`: add an API test script.
- Add `apps/api/src/auth/auth-context.ts`: normalized authenticated staff context.
- Add `apps/api/src/auth/auth-context.decorator.ts`: request decorator for controllers.
- Add `apps/api/src/auth/dev-auth.guard.ts`: development guard that reads staff context from headers.
- Add `apps/api/src/auth/auth.module.ts`: export auth guard.
- Add `apps/api/src/venues/access.service.ts`: role and venue permission checks.
- Add `apps/api/src/venues/access.service.test.ts`: admin/manager/staff access tests.
- Modify `apps/api/src/venues/venues.module.ts`: export access service.
- Add `apps/api/src/service-points/dto/create-venue.dto.ts`: admin venue creation DTO.
- Add `apps/api/src/service-points/dto/create-service-point.dto.ts`: service point creation DTO.
- Add `apps/api/src/service-points/admin-venues.controller.ts`: admin venue/service-point endpoints.
- Modify `apps/api/src/service-points/service-points.service.ts`: replace stub with Prisma-backed public QR workflow and admin helpers.
- Add `apps/api/src/service-points/service-points.service.test.ts`: unit tests for public QR workflow.
- Modify `apps/api/src/service-points/service-points.module.ts`: include new controller and exports.
- Add `apps/api/src/requests/dto/update-request-status.dto.ts`: lifecycle update DTO.
- Add `apps/api/src/requests/requests.service.ts`: Prisma-backed request listing, assignment, status transitions, and audit events.
- Add `apps/api/src/requests/requests.controller.ts`: protected request operations endpoints.
- Add `apps/api/src/requests/requests.service.test.ts`: lifecycle and permission tests.
- Modify `apps/api/src/requests/requests.module.ts`: wire controller/service.
- Add `docs/production-api-foundation.md`: short reference for first production API endpoints and required headers.

---

### Task 1: Shared Request Workflow Constants

**Files:**
- Create: `packages/shared/src/request-workflow.ts`
- Create: `packages/shared/src/request-workflow.test.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing request workflow tests**

Create `packages/shared/src/request-workflow.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransitionRequest, getNextGuestActionStatus } from "./request-workflow";

describe("request workflow", () => {
  it("allows staff to move assigned requests into progress and completion", () => {
    assert.equal(canTransitionRequest("acknowledged", "in_progress", "staff"), true);
    assert.equal(canTransitionRequest("in_progress", "completed", "staff"), true);
  });

  it("prevents staff from resolving without guest confirmation", () => {
    assert.equal(canTransitionRequest("completed", "resolved", "staff"), false);
  });

  it("allows guest resolution confirmation from completed", () => {
    assert.equal(getNextGuestActionStatus("completed", "confirm_resolved"), "resolved");
    assert.equal(getNextGuestActionStatus("completed", "not_satisfied"), "in_progress");
  });

  it("rejects guest actions from the wrong state", () => {
    assert.throws(() => getNextGuestActionStatus("new", "confirm_resolved"), /not awaiting satisfaction/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @guestos/shared`

Expected: FAIL with an import error because `./request-workflow` does not exist.

- [ ] **Step 3: Implement workflow constants**

Create `packages/shared/src/request-workflow.ts`:

```ts
export const requestStatuses = [
  "new",
  "acknowledged",
  "assigned",
  "declined",
  "in_progress",
  "completed",
  "resolved",
  "cancelled",
  "escalated"
] as const;

export const staffRoles = ["owner", "manager", "admin", "staff", "security", "read_only"] as const;

export type RequestStatus = (typeof requestStatuses)[number];
export type StaffRole = (typeof staffRoles)[number];
export type RequestActor = "admin" | "manager" | "staff" | "guest" | "system";
export type GuestRequestAction = "cancel" | "confirm_resolved" | "not_satisfied";

const allowedTransitions: Record<RequestActor, Partial<Record<RequestStatus, RequestStatus[]>>> = {
  admin: {
    new: ["acknowledged", "assigned", "cancelled", "escalated"],
    acknowledged: ["assigned", "in_progress", "declined", "cancelled", "escalated"],
    assigned: ["in_progress", "declined", "cancelled", "escalated"],
    declined: ["assigned", "cancelled"],
    in_progress: ["completed", "cancelled", "escalated"],
    completed: ["in_progress", "resolved"],
    escalated: ["assigned", "in_progress", "cancelled", "resolved"]
  },
  manager: {
    new: ["acknowledged", "assigned", "cancelled", "escalated"],
    acknowledged: ["assigned", "in_progress", "declined", "cancelled", "escalated"],
    assigned: ["in_progress", "declined", "cancelled", "escalated"],
    declined: ["assigned", "cancelled"],
    in_progress: ["completed", "cancelled", "escalated"],
    completed: ["in_progress", "resolved"],
    escalated: ["assigned", "in_progress", "cancelled", "resolved"]
  },
  staff: {
    acknowledged: ["in_progress", "declined"],
    assigned: ["in_progress", "declined"],
    in_progress: ["completed"]
  },
  guest: {
    new: ["cancelled"],
    acknowledged: ["cancelled"],
    assigned: ["cancelled"],
    declined: ["cancelled"],
    in_progress: ["cancelled"],
    completed: ["resolved", "in_progress"]
  },
  system: {
    new: ["escalated"],
    acknowledged: ["escalated"],
    assigned: ["escalated"],
    in_progress: ["escalated"]
  }
};

export function canTransitionRequest(from: RequestStatus, to: RequestStatus, actor: RequestActor) {
  return allowedTransitions[actor][from]?.includes(to) ?? false;
}

export function getNextGuestActionStatus(current: RequestStatus, action: GuestRequestAction): RequestStatus {
  if (action === "cancel") {
    if (["completed", "resolved", "cancelled"].includes(current)) {
      throw new Error("This request can no longer be cancelled");
    }
    return "cancelled";
  }

  if (current !== "completed") {
    throw new Error("This request is not awaiting satisfaction confirmation");
  }

  return action === "confirm_resolved" ? "resolved" : "in_progress";
}
```

- [ ] **Step 4: Export workflow helpers and schemas**

Modify `packages/shared/src/schemas.ts` to import from the workflow file and add role/status schemas:

```ts
import { z } from "zod";
import { requestPriorities } from "./priority-classifier";
import { requestStatuses, staffRoles } from "./request-workflow";

export const RequestPrioritySchema = z.enum(requestPriorities);
export const RequestStatusSchema = z.enum(requestStatuses);
export const StaffRoleSchema = z.enum(staffRoles);
```

Keep the existing `AiTriageSchema` and `PublicGuestMessageSchema` exports below those constants.

Modify `packages/shared/src/index.ts`:

```ts
export * from "./priority-classifier";
export * from "./request-workflow";
export * from "./schemas";
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test -w @guestos/shared
npm run build -w @guestos/shared
```

Expected: both commands exit 0; request workflow tests and priority classifier tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/request-workflow.ts packages/shared/src/request-workflow.test.ts packages/shared/src/schemas.ts packages/shared/src/index.ts
git commit -m "feat: add shared request workflow rules"
```

---

### Task 2: API Test Harness And Auth Context

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/auth/auth-context.ts`
- Create: `apps/api/src/auth/auth-context.decorator.ts`
- Create: `apps/api/src/auth/dev-auth.guard.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

- [ ] **Step 1: Add failing auth guard test**

Create `apps/api/src/auth/dev-auth.guard.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExecutionContext } from "@nestjs/common";
import { DevAuthGuard } from "./dev-auth.guard";

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers })
    })
  } as ExecutionContext;
}

describe("DevAuthGuard", () => {
  it("creates a staff auth context from development headers", () => {
    const guard = new DevAuthGuard();
    const context = contextWithHeaders({
      "x-staff-id": "staff-1",
      "x-workspace-id": "workspace-1",
      "x-venue-id": "venue-1",
      "x-staff-role": "manager"
    });

    assert.equal(guard.canActivate(context), true);
    const request = context.switchToHttp().getRequest();
    assert.deepEqual(request.auth, {
      staffProfileId: "staff-1",
      workspaceId: "workspace-1",
      venueId: "venue-1",
      role: "manager"
    });
  });
});
```

- [ ] **Step 2: Add API test script and verify failure**

Modify `apps/api/package.json` scripts:

```json
"test": "node --test -r ts-node/register -r tsconfig-paths/register \"src/**/*.test.ts\""
```

Run: `npm test -w @guestos/api`

Expected: FAIL because `./dev-auth.guard` does not exist.

- [ ] **Step 3: Add auth context files**

Create `apps/api/src/auth/auth-context.ts`:

```ts
import type { StaffRole } from "@guestos/shared";

export type AuthContext = {
  staffProfileId: string;
  workspaceId: string;
  venueId?: string;
  role: StaffRole;
};

export type RequestWithAuth = {
  auth?: AuthContext;
};
```

Create `apps/api/src/auth/auth-context.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthContext, RequestWithAuth } from "./auth-context";

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<RequestWithAuth>();
  if (!request.auth) {
    throw new Error("Auth context missing");
  }
  return request.auth;
});
```

Create `apps/api/src/auth/dev-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { StaffRoleSchema } from "@guestos/shared";
import type { RequestWithAuth } from "./auth-context";

@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithAuth & { headers: Record<string, string | string[] | undefined> }>();
    const staffProfileId = this.header(request.headers, "x-staff-id");
    const workspaceId = this.header(request.headers, "x-workspace-id");
    const roleInput = this.header(request.headers, "x-staff-role");
    const venueId = this.header(request.headers, "x-venue-id");
    const role = StaffRoleSchema.safeParse(roleInput);

    if (!staffProfileId || !workspaceId || !role.success) {
      throw new UnauthorizedException("Missing staff auth headers");
    }

    request.auth = {
      staffProfileId,
      workspaceId,
      venueId,
      role: role.data
    };

    return true;
  }

  private header(headers: Record<string, string | string[] | undefined>, key: string) {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
}
```

Modify `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DevAuthGuard } from "./dev-auth.guard";

@Module({
  exports: [DevAuthGuard],
  providers: [DevAuthGuard]
})
export class AuthModule {}
```

- [ ] **Step 4: Run API auth tests**

Run: `npm test -w @guestos/api -- src/auth/dev-auth.guard.test.ts`

Expected: PASS.

- [ ] **Step 5: Build API**

Run: `npm run build -w @guestos/api`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/auth/auth-context.ts apps/api/src/auth/auth-context.decorator.ts apps/api/src/auth/dev-auth.guard.ts apps/api/src/auth/dev-auth.guard.test.ts apps/api/src/auth/auth.module.ts
git commit -m "feat: add API auth context"
```

---

### Task 3: Venue Access Service

**Files:**
- Create: `apps/api/src/venues/access.service.ts`
- Create: `apps/api/src/venues/access.service.test.ts`
- Modify: `apps/api/src/venues/venues.module.ts`

- [ ] **Step 1: Write failing access tests**

Create `apps/api/src/venues/access.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { VenueAccessService } from "./access.service";

describe("VenueAccessService", () => {
  const service = new VenueAccessService();

  it("allows admin to access any venue in their workspace", () => {
    assert.equal(
      service.canManageVenue({ staffProfileId: "a", workspaceId: "w1", role: "admin" }, { workspaceId: "w1", venueId: "v2" }),
      true
    );
  });

  it("allows manager only for their assigned venue", () => {
    assert.equal(
      service.canManageVenue({ staffProfileId: "m", workspaceId: "w1", venueId: "v1", role: "manager" }, { workspaceId: "w1", venueId: "v1" }),
      true
    );
    assert.equal(
      service.canManageVenue({ staffProfileId: "m", workspaceId: "w1", venueId: "v1", role: "manager" }, { workspaceId: "w1", venueId: "v2" }),
      false
    );
  });

  it("throws forbidden when access is denied", () => {
    assert.throws(
      () => service.assertCanManageVenue({ staffProfileId: "s", workspaceId: "w1", venueId: "v1", role: "staff" }, { workspaceId: "w1", venueId: "v1" }),
      ForbiddenException
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @guestos/api -- src/venues/access.service.test.ts`

Expected: FAIL because `./access.service` does not exist.

- [ ] **Step 3: Implement access service**

Create `apps/api/src/venues/access.service.ts`:

```ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context";

type VenueTarget = {
  workspaceId: string;
  venueId: string;
};

@Injectable()
export class VenueAccessService {
  canManageWorkspace(auth: AuthContext, workspaceId: string) {
    return auth.workspaceId === workspaceId && (auth.role === "owner" || auth.role === "admin");
  }

  canManageVenue(auth: AuthContext, target: VenueTarget) {
    if (auth.workspaceId !== target.workspaceId) {
      return false;
    }

    if (auth.role === "owner" || auth.role === "admin") {
      return true;
    }

    if (auth.role === "manager") {
      return auth.venueId === target.venueId;
    }

    return false;
  }

  canOperateVenue(auth: AuthContext, target: VenueTarget) {
    if (this.canManageVenue(auth, target)) {
      return true;
    }

    return auth.workspaceId === target.workspaceId && auth.venueId === target.venueId && ["staff", "security"].includes(auth.role);
  }

  assertCanManageWorkspace(auth: AuthContext, workspaceId: string) {
    if (!this.canManageWorkspace(auth, workspaceId)) {
      throw new ForbiddenException("You cannot manage this workspace");
    }
  }

  assertCanManageVenue(auth: AuthContext, target: VenueTarget) {
    if (!this.canManageVenue(auth, target)) {
      throw new ForbiddenException("You cannot manage this venue");
    }
  }

  assertCanOperateVenue(auth: AuthContext, target: VenueTarget) {
    if (!this.canOperateVenue(auth, target)) {
      throw new ForbiddenException("You cannot operate this venue");
    }
  }
}
```

Modify `apps/api/src/venues/venues.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { VenueAccessService } from "./access.service";

@Module({
  exports: [VenueAccessService],
  providers: [VenueAccessService]
})
export class VenuesModule {}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test -w @guestos/api -- src/venues/access.service.test.ts
npm run build -w @guestos/api
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/venues/access.service.ts apps/api/src/venues/access.service.test.ts apps/api/src/venues/venues.module.ts
git commit -m "feat: add venue access checks"
```

---

### Task 4: Admin Venue And Service Point APIs

**Files:**
- Create: `apps/api/src/service-points/dto/create-venue.dto.ts`
- Create: `apps/api/src/service-points/dto/create-service-point.dto.ts`
- Create: `apps/api/src/service-points/admin-venues.controller.ts`
- Modify: `apps/api/src/service-points/service-points.service.ts`
- Modify: `apps/api/src/service-points/service-points.module.ts`

- [ ] **Step 1: Add service-level tests for admin helpers**

Create `apps/api/src/service-points/admin-service-points.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServicePointsService } from "./service-points.service";

describe("ServicePointsService admin helpers", () => {
  it("creates URL-safe QR tokens", () => {
    const service = new ServicePointsService({} as never, {} as never, {} as never, {} as never);
    const token = service.createQrToken("Main Bar");

    assert.match(token, /^sp_[a-z0-9_]+_[a-f0-9]{24}$/);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @guestos/api -- src/service-points/admin-service-points.service.test.ts`

Expected: FAIL because constructor signature and `createQrToken` do not match the desired service.

- [ ] **Step 3: Add DTOs**

Create `apps/api/src/service-points/dto/create-venue.dto.ts`:

```ts
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateVenueDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
```

Create `apps/api/src/service-points/dto/create-service-point.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateServicePointDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
```

- [ ] **Step 4: Extend service with admin helpers while preserving public method**

Modify `apps/api/src/service-points/service-points.service.ts` to use this constructor and helpers:

```ts
constructor(
  private readonly aiTriage: AiTriageService,
  private readonly priorityClassifier: PriorityClassifierService,
  private readonly prisma: PrismaService,
  private readonly venueAccess: VenueAccessService
) {}

createQrToken(label: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "service_point";
  return `sp_${slug}_${randomBytes(12).toString("hex")}`;
}

async createVenue(auth: AuthContext, input: CreateVenueDto) {
  this.venueAccess.assertCanManageWorkspace(auth, auth.workspaceId);
  return this.prisma.venue.create({
    data: {
      workspaceId: auth.workspaceId,
      name: input.name.trim(),
      slug: input.slug,
      timezone: input.timezone || "Europe/London"
    }
  });
}

async createServicePoint(auth: AuthContext, venueId: string, input: CreateServicePointDto) {
  const venue = await this.prisma.venue.findUniqueOrThrow({ where: { id: venueId } });
  this.venueAccess.assertCanManageVenue(auth, { workspaceId: venue.workspaceId, venueId });

  return this.prisma.servicePoint.create({
    data: {
      venueId,
      locationId: input.locationId || null,
      label: input.label.trim(),
      qrToken: this.createQrToken(input.label)
    }
  });
}
```

Also import the required dependencies:

```ts
import { randomBytes } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import type { AuthContext } from "../auth/auth-context";
import { VenueAccessService } from "../venues/access.service";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
```

- [ ] **Step 5: Add admin controller**

Create `apps/api/src/service-points/admin-venues.controller.ts`:

```ts
import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { DevAuthGuard } from "../auth/dev-auth.guard";
import type { AuthContext } from "../auth/auth-context";
import { CreateServicePointDto } from "./dto/create-service-point.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { ServicePointsService } from "./service-points.service";

@ApiTags("admin venues")
@ApiBearerAuth()
@UseGuards(DevAuthGuard)
@Controller("admin")
export class AdminVenuesController {
  constructor(private readonly servicePoints: ServicePointsService) {}

  @Post("venues")
  @ApiCreatedResponse({ description: "Creates a venue in the authenticated workspace" })
  createVenue(@CurrentAuth() auth: AuthContext, @Body() input: CreateVenueDto) {
    return this.servicePoints.createVenue(auth, input);
  }

  @Post("venues/:venueId/service-points")
  @ApiCreatedResponse({ description: "Creates a QR service point in a venue" })
  createServicePoint(
    @CurrentAuth() auth: AuthContext,
    @Param("venueId") venueId: string,
    @Body() input: CreateServicePointDto
  ) {
    return this.servicePoints.createServicePoint(auth, venueId, input);
  }
}
```

- [ ] **Step 6: Wire module**

Modify `apps/api/src/service-points/service-points.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { TriageModule } from "../triage/triage.module";
import { VenuesModule } from "../venues/venues.module";
import { AdminVenuesController } from "./admin-venues.controller";
import { PublicQrController } from "./public-qr.controller";
import { ServicePointsService } from "./service-points.service";

@Module({
  controllers: [PublicQrController, AdminVenuesController],
  exports: [ServicePointsService],
  imports: [TriageModule, VenuesModule],
  providers: [ServicePointsService]
})
export class ServicePointsModule {}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test -w @guestos/api -- src/service-points/admin-service-points.service.test.ts
npm run build -w @guestos/api
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/service-points apps/api/src/venues apps/api/src/auth apps/api/package.json
git commit -m "feat: add admin venue service point APIs"
```

---

### Task 5: Prisma-Backed Public QR Guest Message Workflow

**Files:**
- Modify: `apps/api/src/service-points/service-points.service.ts`
- Modify: `apps/api/src/service-points/public-qr.controller.ts`
- Modify: `apps/api/src/service-points/dto/public-guest-message.dto.ts`
- Create: `apps/api/src/service-points/service-points.service.test.ts`

- [ ] **Step 1: Write failing public QR workflow test**

Create `apps/api/src/service-points/service-points.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServicePointsService } from "./service-points.service";

describe("ServicePointsService public QR workflow", () => {
  it("creates a conversation, support request, guest message, and assistant message", async () => {
    const created: Array<{ model: string; data: unknown }> = [];
    const prisma = {
      servicePoint: {
        findUnique: async () => ({ id: "sp1", label: "Table 1", venueId: "venue1", isActive: true })
      },
      conversation: {
        create: async ({ data }: { data: unknown }) => {
          created.push({ model: "conversation", data });
          return { id: "conversation1", venueId: "venue1", servicePointId: "sp1" };
        }
      },
      supportRequest: {
        create: async ({ data }: { data: unknown }) => {
          created.push({ model: "supportRequest", data });
          return { id: "request1", ...(data as object) };
        }
      },
      message: {
        createMany: async ({ data }: { data: unknown[] }) => {
          created.push({ model: "messages", data });
          return { count: data.length };
        },
        findMany: async () => [
          { id: "m1", sender: "GUEST", body: "Need water" },
          { id: "m2", sender: "ASSISTANT", body: "Of course. I have notified the team for Table 1." }
        ]
      },
      requestEvent: {
        create: async ({ data }: { data: unknown }) => {
          created.push({ model: "requestEvent", data });
          return data;
        }
      }
    };
    const aiTriage = {
      createFallback: () => ({
        assistantReply: "Of course. I have notified the team for Table 1.",
        category: "general",
        needsStaff: true,
        priority: "normal",
        summary: "Need water",
        title: "Guest support request"
      })
    };
    const priorityClassifier = { classifyOrDefault: () => "normal" };
    const service = new ServicePointsService(aiTriage as never, priorityClassifier as never, prisma as never, {} as never);

    const result = await service.createGuestMessage("demo-table-1", { message: "Need water" });

    assert.equal(result.request.id, "request1");
    assert.equal(result.conversationId, "conversation1");
    assert.equal(created.some((item) => item.model === "supportRequest"), true);
    assert.equal(created.some((item) => item.model === "messages"), true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @guestos/api -- src/service-points/service-points.service.test.ts`

Expected: FAIL because `createGuestMessage` currently returns a stub and does not create records.

- [ ] **Step 3: Update public DTO**

Modify `apps/api/src/service-points/dto/public-guest-message.dto.ts` so it accepts optional conversation/session IDs:

```ts
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class PublicGuestMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  message!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(160)
  sessionId?: string;
}
```

- [ ] **Step 4: Replace public QR stub with Prisma workflow**

In `apps/api/src/service-points/service-points.service.ts`, implement `createGuestMessage` with this behavior:

```ts
async createGuestMessage(token: string, input: PublicGuestMessageDto) {
  const servicePoint = await this.prisma.servicePoint.findUnique({
    where: { qrToken: token }
  });

  if (!servicePoint || !servicePoint.isActive) {
    throw new NotFoundException("Service point not found");
  }

  const conversation = input.conversationId
    ? await this.prisma.conversation.findFirstOrThrow({
        where: {
          id: input.conversationId,
          servicePointId: servicePoint.id,
          venueId: servicePoint.venueId
        }
      })
    : await this.prisma.conversation.create({
        data: {
          guestSessionId: input.sessionId || null,
          servicePointId: servicePoint.id,
          venueId: servicePoint.venueId
        }
      });

  const priority = this.priorityClassifier.classifyOrDefault(input.message);
  const triage = this.aiTriage.createFallback({
    deterministicPriority: priority,
    message: input.message,
    servicePointLabel: servicePoint.label
  });

  const supportRequest = await this.prisma.supportRequest.create({
    data: {
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      conversationId: conversation.id,
      title: triage.title,
      category: triage.category,
      summary: triage.summary || input.message,
      priority: triage.priority.toUpperCase() as never,
      deterministicPriority: priority.toUpperCase() as never,
      status: priority === "urgent" ? "ESCALATED" : "NEW"
    }
  });

  await this.prisma.message.createMany({
    data: [
      {
        venueId: servicePoint.venueId,
        servicePointId: servicePoint.id,
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: "GUEST",
        body: input.message
      },
      {
        venueId: servicePoint.venueId,
        servicePointId: servicePoint.id,
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: "ASSISTANT",
        body: triage.assistantReply
      }
    ]
  });

  await this.prisma.requestEvent.create({
    data: {
      venueId: servicePoint.venueId,
      requestId: supportRequest.id,
      type: priority === "urgent" ? "request.escalated" : "request.created",
      toStatus: supportRequest.status,
      metadata: { source: "public_qr", qrToken: token }
    }
  });

  const messages = await this.prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" }
  });

  return {
    conversationId: conversation.id,
    messages,
    request: supportRequest,
    servicePoint
  };
}
```

Import `NotFoundException` from `@nestjs/common`.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test -w @guestos/api -- src/service-points/service-points.service.test.ts
npm run build -w @guestos/api
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/service-points
git commit -m "feat: persist public QR requests"
```

---

### Task 6: Request Lifecycle API

**Files:**
- Create: `apps/api/src/requests/dto/update-request-status.dto.ts`
- Create: `apps/api/src/requests/requests.service.ts`
- Create: `apps/api/src/requests/requests.controller.ts`
- Create: `apps/api/src/requests/requests.service.test.ts`
- Modify: `apps/api/src/requests/requests.module.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `apps/api/src/requests/requests.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { RequestsService } from "./requests.service";

describe("RequestsService", () => {
  it("rejects invalid staff transitions", async () => {
    const prisma = {
      supportRequest: {
        findUniqueOrThrow: async () => ({
          id: "r1",
          venueId: "v1",
          status: "COMPLETED",
          assignedToId: "staff1",
          venue: { workspaceId: "w1" }
        })
      }
    };
    const service = new RequestsService(prisma as never, { assertCanOperateVenue: () => undefined } as never);

    await assert.rejects(
      () =>
        service.updateStatus(
          { staffProfileId: "staff1", workspaceId: "w1", venueId: "v1", role: "staff" },
          "r1",
          { status: "resolved" }
        ),
      ConflictException
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -w @guestos/api -- src/requests/requests.service.test.ts`

Expected: FAIL because `RequestsService` does not exist.

- [ ] **Step 3: Add lifecycle DTO**

Create `apps/api/src/requests/dto/update-request-status.dto.ts`:

```ts
import { IsIn, IsOptional, IsString } from "class-validator";
import { requestStatuses } from "@guestos/shared";

export class UpdateRequestStatusDto {
  @IsIn(requestStatuses)
  status!: (typeof requestStatuses)[number];

  @IsOptional()
  @IsString()
  assignedToId?: string;
}
```

- [ ] **Step 4: Implement requests service**

Create `apps/api/src/requests/requests.service.ts`:

```ts
import { ConflictException, Injectable } from "@nestjs/common";
import { canTransitionRequest, type RequestActor, type RequestStatus } from "@guestos/shared";
import { PrismaService } from "../database/prisma.service";
import { VenueAccessService } from "../venues/access.service";
import type { AuthContext } from "../auth/auth-context";
import { UpdateRequestStatusDto } from "./dto/update-request-status.dto";

function toSharedStatus(status: string): RequestStatus {
  return status.toLowerCase() as RequestStatus;
}

function toPrismaStatus(status: RequestStatus) {
  return status.toUpperCase() as never;
}

function actorFromAuth(auth: AuthContext): RequestActor {
  if (auth.role === "owner" || auth.role === "admin") {
    return "admin";
  }
  if (auth.role === "manager") {
    return "manager";
  }
  return "staff";
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueAccess: VenueAccessService
  ) {}

  async listForVenue(auth: AuthContext, venueId: string) {
    const venue = await this.prisma.venue.findUniqueOrThrow({ where: { id: venueId } });
    this.venueAccess.assertCanOperateVenue(auth, { workspaceId: venue.workspaceId, venueId });

    return this.prisma.supportRequest.findMany({
      include: {
        assignedTo: true,
        servicePoint: true
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      where: { venueId }
    });
  }

  async updateStatus(auth: AuthContext, requestId: string, input: UpdateRequestStatusDto) {
    const request = await this.prisma.supportRequest.findUniqueOrThrow({
      include: { venue: true },
      where: { id: requestId }
    });
    this.venueAccess.assertCanOperateVenue(auth, { workspaceId: request.venue.workspaceId, venueId: request.venueId });

    const fromStatus = toSharedStatus(request.status);
    const toStatus = input.status;
    const actor = actorFromAuth(auth);

    if (!canTransitionRequest(fromStatus, toStatus, actor)) {
      throw new ConflictException(`Cannot transition request from ${fromStatus} to ${toStatus} as ${actor}`);
    }

    const updated = await this.prisma.supportRequest.update({
      data: {
        assignedToId: input.assignedToId,
        completedAt: toStatus === "completed" ? new Date() : undefined,
        resolvedAt: toStatus === "resolved" ? new Date() : undefined,
        status: toPrismaStatus(toStatus)
      },
      include: {
        assignedTo: true,
        servicePoint: true
      },
      where: { id: requestId }
    });

    await this.prisma.requestEvent.create({
      data: {
        actorStaffId: auth.staffProfileId,
        fromStatus: request.status,
        metadata: { assignedToId: input.assignedToId || null },
        requestId,
        toStatus: updated.status,
        type: "request.status_changed",
        venueId: request.venueId
      }
    });

    return updated;
  }
}
```

- [ ] **Step 5: Add controller**

Create `apps/api/src/requests/requests.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/auth-context.decorator";
import { DevAuthGuard } from "../auth/dev-auth.guard";
import type { AuthContext } from "../auth/auth-context";
import { UpdateRequestStatusDto } from "./dto/update-request-status.dto";
import { RequestsService } from "./requests.service";

@ApiTags("requests")
@ApiBearerAuth()
@UseGuards(DevAuthGuard)
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get("venues/:venueId/requests")
  @ApiOkResponse({ description: "Lists requests for an accessible venue" })
  listForVenue(@CurrentAuth() auth: AuthContext, @Param("venueId") venueId: string) {
    return this.requests.listForVenue(auth, venueId);
  }

  @Patch("requests/:requestId/status")
  @ApiOkResponse({ description: "Updates request status when transition is allowed" })
  updateStatus(
    @CurrentAuth() auth: AuthContext,
    @Param("requestId") requestId: string,
    @Body() input: UpdateRequestStatusDto
  ) {
    return this.requests.updateStatus(auth, requestId, input);
  }
}
```

- [ ] **Step 6: Wire requests module**

Modify `apps/api/src/requests/requests.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { VenuesModule } from "../venues/venues.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

@Module({
  controllers: [RequestsController],
  exports: [RequestsService],
  imports: [VenuesModule],
  providers: [RequestsService]
})
export class RequestsModule {}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test -w @guestos/api -- src/requests/requests.service.test.ts
npm run build -w @guestos/api
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/requests
git commit -m "feat: add request lifecycle API"
```

---

### Task 7: Production API Foundation Reference

**Files:**
- Create: `docs/production-api-foundation.md`

- [ ] **Step 1: Write endpoint reference**

Create `docs/production-api-foundation.md`:

```md
# Production API Foundation

The production foundation moves business logic into the NestJS API while Supabase remains the auth and Postgres provider.

## Development Auth Headers

Until Supabase JWT verification is wired, protected API endpoints use development headers:

- `x-staff-id`
- `x-workspace-id`
- `x-venue-id`
- `x-staff-role`

Roles must be one of `owner`, `admin`, `manager`, `staff`, `security`, or `read_only`.

## Public Endpoints

- `POST /public/qr/:token/messages`

Creates or resumes a service-point conversation, stores the guest message, triages it, creates a support request, stores the assistant reply, and returns the conversation state.

## Protected Endpoints

- `POST /admin/venues`
- `POST /admin/venues/:venueId/service-points`
- `GET /venues/:venueId/requests`
- `PATCH /requests/:requestId/status`

Protected endpoints enforce workspace and venue access in the NestJS API.
```

- [ ] **Step 2: Verify docs and build**

Run:

```bash
npm run build -w @guestos/api
npm test -w @guestos/shared
npm test -w @guestos/api
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/production-api-foundation.md
git commit -m "docs: document production API foundation"
```

---

## Final Verification

- [ ] **Step 1: Generate Prisma client**

Run: `npm run prisma:generate`

Expected: Prisma client generation completes successfully for `packages/database/prisma/schema.prisma`.

- [ ] **Step 2: Run workspace tests**

Run: `npm test --workspaces --if-present`

Expected: shared tests and API tests exit 0.

- [ ] **Step 3: Run workspace build**

Run: `npm run build --workspaces --if-present`

Expected: database, shared, API, and web builds exit 0.

- [ ] **Step 4: Review git status**

Run: `git status --short`

Expected: only intentional files from this plan are modified or untracked. Do not revert unrelated existing worktree changes.
