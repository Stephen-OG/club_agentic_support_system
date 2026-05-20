# Venue QR LLM Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable vertical slice for venue-level QR conversational intake, semi-autonomous LLM request handling, conversational Operations rows, request ratings, and durable SaaS documentation.

**Architecture:** Keep the existing service-point request workflow intact, but add venue-level intake that creates conversations through a hidden/default venue support service point. Store guest location and agent policy metadata separately from fixed service-point context. The API derives ratings and conversation previews server-side; the web app renders support-style guest intake and rating-led Operations UI.

**Tech Stack:** NestJS API, Prisma/Postgres, Next.js app router, React client components, OpenAI SDK, Zod/shared schemas, Node test runner, TypeScript.

---

## Scope Check

The design spec covers several related surfaces. This plan implements one integrated vertical slice:

- Venue QR intake and support-style client UI.
- LLM-backed semi-autonomous request handling.
- Versioned agent policy data model with `v1-assistive`, `v1-semi-autonomous`, and `v2-autonomous-within-rules` values.
- Hybrid assignment policy metadata and audit reasons.
- Request ratings and conversational request previews in Operations.
- User-story and API documentation that can be updated as the SaaS grows.

The full `v2-autonomous-within-rules` runtime behavior is represented in policy types and docs, but only `v1-semi-autonomous` is enabled as the default behavior in this slice.

## File Structure

- Modify `packages/shared/src/schemas.ts`: add venue intake, location, agent policy, and rating analytics schemas.
- Modify `packages/shared/src/index.ts`: re-export the new shared schemas through the existing barrel.
- Modify `packages/database/prisma/schema.prisma`: add request/conversation location fields and agent policy metadata fields.
- Modify `packages/database/prisma/seed.ts`: seed a hidden/default `Venue support` service point.
- Create `apps/api/src/triage/agent-policy.ts`: centralize policy constants and allowed-action checks.
- Modify `apps/api/src/triage/ai-triage.service.ts`: add OpenAI-backed conversational triage with deterministic fallback.
- Create `apps/api/src/service-points/dto/public-venue-message.dto.ts`: DTO for venue QR messages.
- Modify `apps/api/src/service-points/public-qr.controller.ts`: add `/public/venues/:venueSlug` endpoints.
- Modify `apps/api/src/service-points/service-points.service.ts`: add venue intake workflow and conversation-location persistence.
- Modify `apps/api/src/requests/requests.service.ts`: add `satisfactionRating` and conversation preview data to request list results.
- Modify `apps/api/src/requests/requests.service.test.ts`: cover ratings and conversation preview derivation.
- Modify `apps/api/src/service-points/service-points.service.test.ts`: cover venue QR intake and semi-autonomous metadata.
- Modify `apps/web/lib/auth/types.ts`: add `satisfactionRating`, `guestLocationLabel`, recent messages, and agent metadata to command types.
- Modify `apps/web/lib/rating-analytics.ts`: support camelCase command-center rating fields.
- Modify `apps/web/lib/rating-analytics.test.ts`: cover camelCase analytics and high-rating percentage.
- Create `apps/web/lib/support-intake.ts`: shared quick-action and location-option copy.
- Create `apps/web/app/venue/[slug]/page.tsx`: public venue QR route.
- Create `apps/web/app/venue/[slug]/venue-support-chat.tsx`: support-style client UI for venue QR intake.
- Modify `apps/web/app/components/operations-command.tsx`: render rating metrics, conversational request rows, and agent loop panel.
- Modify `apps/web/app/globals.css`: add compact styles for support intake, rating chips, conversation previews, and agent policy panel.
- Create `docs/product/guestos-user-stories.md`: SaaS product user stories.
- Create `docs/api/guestos-api.md`: API documentation for public intake, requests, agent policy, and Operations.

---

### Task 1: Shared Schemas And Rating Analytics Contract

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `apps/web/lib/rating-analytics.ts`
- Modify: `apps/web/lib/rating-analytics.test.ts`

- [ ] **Step 1: Write the failing web analytics test**

Add this test case to `apps/web/lib/rating-analytics.test.ts`:

```ts
it("calculates command center analytics from camelCase satisfaction ratings", () => {
  assert.deepEqual(
    calculateRatingAnalytics([
      { satisfactionRating: 5 },
      { satisfactionRating: 4 },
      { satisfactionRating: 1 },
      { satisfactionRating: null },
      {}
    ]),
    {
      averageRating: 3.3,
      ratedCount: 3,
      highRatingCount: 2,
      lowRatingCount: 1,
      highRatingPercent: 67,
      ratingDistribution: {
        1: 1,
        2: 0,
        3: 0,
        4: 1,
        5: 1
      }
    }
  );
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test -r ts-node/register apps/web/lib/rating-analytics.test.ts
```

Expected: FAIL because `highRatingPercent` and camelCase `satisfactionRating` are not supported.

- [ ] **Step 3: Update the rating analytics helper**

Change `apps/web/lib/rating-analytics.ts` so `RateableRequest` and `calculateRatingAnalytics` read both legacy snake_case and command-center camelCase fields:

```ts
type RateableRequest = {
  satisfaction_rating?: number | null;
  satisfactionRating?: number | null;
};

export type RatingAnalytics = {
  averageRating: number | null;
  ratedCount: number;
  highRatingCount: number;
  lowRatingCount: number;
  highRatingPercent: number;
  ratingDistribution: Record<RatingValue, number>;
};

function requestRating(request: RateableRequest) {
  return normalizeRating(request.satisfactionRating ?? request.satisfaction_rating);
}
```

Inside `calculateRatingAnalytics`, replace the current `ratings` expression and return object with:

```ts
const ratings = requests
  .map((request) => requestRating(request))
  .filter((rating): rating is RatingValue => Boolean(rating));

const highRatingCount = ratings.filter((rating) => rating >= 4).length;
const lowRatingCount = ratings.filter((rating) => rating <= 2).length;
const highRatingPercent = ratings.length > 0 ? Math.round((highRatingCount / ratings.length) * 100) : 0;

return {
  averageRating,
  ratedCount: ratings.length,
  highRatingCount,
  lowRatingCount,
  highRatingPercent,
  ratingDistribution
};
```

Update the older expected object in `apps/web/lib/rating-analytics.test.ts` to include `highRatingPercent: 67`.

- [ ] **Step 4: Add shared schemas**

Append these exports to `packages/shared/src/schemas.ts`:

```ts
export const GuestLocationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  source: z.enum(["guest", "agent", "qr"]).default("guest")
});

export const AgentPolicyVersionSchema = z.enum([
  "v1-assistive",
  "v1-semi-autonomous",
  "v2-autonomous-within-rules"
]);

export const AgentActionSchema = z.enum([
  "reply",
  "assign",
  "escalate",
  "reopen",
  "summarize",
  "mark_handled"
]);

export const VenueIntakeMessageSchema = PublicGuestMessageSchema.extend({
  locationLabel: z.string().trim().min(1).max(120).optional(),
  quickAction: z
    .enum([
      "drink",
      "missing_order",
      "long_wait",
      "spill",
      "dirty_area",
      "lost_property",
      "payment",
      "restroom",
      "accessibility",
      "vip",
      "safety",
      "medical",
      "general"
    ])
    .optional()
});

export type GuestLocation = z.infer<typeof GuestLocationSchema>;
export type AgentPolicyVersion = z.infer<typeof AgentPolicyVersionSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type VenueIntakeMessageInput = z.infer<typeof VenueIntakeMessageSchema>;
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test -r ts-node/register apps/web/lib/rating-analytics.test.ts
npm run build -w @guestos/shared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas.ts apps/web/lib/rating-analytics.ts apps/web/lib/rating-analytics.test.ts
git commit -m "feat: add command rating analytics contract"
```

---

### Task 2: Database Fields For Venue Intake And Agent Metadata

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/prisma/seed.ts`
- Create: `supabase/migrations/20260520120000_venue_intake_agent_metadata.sql`

- [ ] **Step 1: Write the Prisma schema changes**

Modify `Conversation` in `packages/database/prisma/schema.prisma`:

```prisma
  guestLocationLabel String?
  guestLocationSource String?
```

Modify `SupportRequest`:

```prisma
  guestLocationLabel String?
  guestLocationSource String?
  agentPolicyVersion String?
  agentConfidence Float?
  agentSuggestedAction String?
```

Keep `servicePointId` required for this vertical slice.

- [ ] **Step 2: Add the SQL migration**

Create `supabase/migrations/20260520120000_venue_intake_agent_metadata.sql`:

```sql
alter table conversations
  add column if not exists guest_location_label text,
  add column if not exists guest_location_source text;

alter table support_requests
  add column if not exists guest_location_label text,
  add column if not exists guest_location_source text,
  add column if not exists agent_policy_version text,
  add column if not exists agent_confidence double precision,
  add column if not exists agent_suggested_action text;
```

- [ ] **Step 3: Seed the default venue support service point**

In `packages/database/prisma/seed.ts`, add this ID near the other constants:

```ts
const venueSupportServicePointId = "00000000-0000-0000-0000-000000000300";
```

Before the table service point loop, add:

```ts
await prisma.servicePoint.upsert({
  create: {
    id: venueSupportServicePointId,
    label: "Venue support",
    locationId: mainFloorId,
    qrToken: "demo-venue-support",
    venueId
  },
  update: {
    isActive: true,
    label: "Venue support",
    locationId: mainFloorId
  },
  where: {
    id: venueSupportServicePointId
  }
});
```

- [ ] **Step 4: Run generation/build**

Run:

```bash
npm run prisma:generate
npm run build -w @guestos/database
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/seed.ts supabase/migrations/20260520120000_venue_intake_agent_metadata.sql
git commit -m "feat: add venue intake agent metadata"
```

---

### Task 3: Agent Policy And LLM Conversational Triage

**Files:**
- Create: `apps/api/src/triage/agent-policy.ts`
- Modify: `apps/api/src/triage/ai-triage.service.ts`
- Test: `apps/api/src/triage/ai-triage.service.test.ts`

- [ ] **Step 1: Write agent policy unit tests**

Create `apps/api/src/triage/ai-triage.service.test.ts` with:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAgentActionAllowed } from "./agent-policy";

describe("agent policy", () => {
  it("allows safe replies and low-risk assignment in semi-autonomous mode", () => {
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "reply", "normal"), true);
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "assign", "low"), true);
  });

  it("blocks risky semi-autonomous actions", () => {
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "mark_handled", "normal"), false);
    assert.equal(isAgentActionAllowed("v1-semi-autonomous", "assign", "urgent"), false);
  });

  it("keeps assistive mode approval-only", () => {
    assert.equal(isAgentActionAllowed("v1-assistive", "reply", "low"), false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test -w @guestos/api -- src/triage/ai-triage.service.test.ts
```

Expected: FAIL because `agent-policy.ts` does not exist.

- [ ] **Step 3: Add agent policy helper**

Create `apps/api/src/triage/agent-policy.ts`:

```ts
import type { AgentAction, AgentPolicyVersion, RequestPriority } from "@guestos/shared";

const routinePriorities = new Set<RequestPriority>(["low", "normal"]);

export function isAgentActionAllowed(
  version: AgentPolicyVersion,
  action: AgentAction,
  priority: RequestPriority
) {
  if (version === "v1-assistive") {
    return false;
  }

  if (version === "v1-semi-autonomous") {
    if (action === "reply") {
      return priority !== "urgent";
    }

    if (action === "assign") {
      return routinePriorities.has(priority);
    }

    return false;
  }

  if (version === "v2-autonomous-within-rules") {
    return priority === "urgent" ? action === "escalate" : true;
  }

  return false;
}
```

- [ ] **Step 4: Extend AI triage output with location and confidence**

Modify `packages/shared/src/schemas.ts` `AiTriageSchema` to include:

```ts
  confidence: z.number().min(0).max(1).default(0.6),
  guestLocationLabel: z.string().min(1).max(120).optional(),
  suggestedAction: z.enum(["reply", "assign", "escalate", "reopen", "summarize", "mark_handled"]).default("reply")
```

Modify `apps/api/src/triage/ai-triage.service.ts` fallback `AiTriageSchema.parse` object to include:

```ts
confidence: 0.72,
guestLocationLabel: this.locationFromMessage(input.message),
suggestedAction: input.deterministicPriority === "urgent" ? "escalate" : "reply",
```

Add this private method to the service:

```ts
private locationFromMessage(message: string) {
  const tableMatch = message.match(/\btable\s*([a-z0-9-]+)\b/i);
  if (tableMatch?.[1]) {
    return `Table ${tableMatch[1].toUpperCase()}`;
  }

  if (/\b(bar|main bar)\b/i.test(message)) {
    return "Bar area";
  }

  if (/\b(dance floor|floor)\b/i.test(message)) {
    return "Dance floor";
  }

  if (/\b(vip|booth)\b/i.test(message)) {
    return "VIP area";
  }

  if (/\b(toilet|restroom|bathroom)\b/i.test(message)) {
    return "Toilet/restroom";
  }

  return undefined;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -w @guestos/api -- src/triage/ai-triage.service.test.ts
npm run build -w @guestos/shared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas.ts apps/api/src/triage/agent-policy.ts apps/api/src/triage/ai-triage.service.ts apps/api/src/triage/ai-triage.service.test.ts
git commit -m "feat: add semi autonomous agent policy"
```

---

### Task 4: Venue QR Public Intake API

**Files:**
- Create: `apps/api/src/service-points/dto/public-venue-message.dto.ts`
- Modify: `apps/api/src/service-points/public-qr.controller.ts`
- Modify: `apps/api/src/service-points/service-points.service.ts`
- Test: `apps/api/src/service-points/service-points.service.test.ts`

- [ ] **Step 1: Write the failing service test**

Add a test to `apps/api/src/service-points/service-points.service.test.ts`:

```ts
it("creates a venue QR conversation with guest location and semi-autonomous metadata", async () => {
  const venue = { id: "venue_1", slug: "blue-note", workspaceId: "workspace_1", name: "Blue Note" };
  const servicePoint = {
    id: "sp_venue_support",
    venueId: venue.id,
    label: "Venue support",
    qrToken: "venue_support_blue_note",
    isActive: true
  };
  const conversation = {
    id: "conversation_venue_1",
    venueId: venue.id,
    servicePointId: servicePoint.id,
    guestLocationLabel: "Table 14",
    guestLocationSource: "guest"
  };
  const supportRequest = {
    id: "request_venue_1",
    venueId: venue.id,
    servicePointId: servicePoint.id,
    conversationId: conversation.id,
    title: "Missing order",
    category: "missing_order",
    summary: "Guest says drinks never arrived",
    priority: RequestPriority.HIGH,
    deterministicPriority: RequestPriority.HIGH,
    status: RequestStatus.NEW,
    guestLocationLabel: "Table 14",
    guestLocationSource: "guest",
    agentPolicyVersion: "v1-semi-autonomous",
    agentConfidence: 0.82,
    agentSuggestedAction: "reply"
  };
  const storedMessages = [
    { id: "message_guest", conversationId: conversation.id, sender: SenderType.GUEST, body: "My drinks never came" },
    { id: "message_agent", conversationId: conversation.id, sender: SenderType.ASSISTANT, body: "Sorry about that. I have sent this to the team for Table 14." }
  ];
  const calls: Array<{ model: string; args: unknown }> = [];
  const tx = {
    conversation: {
      create: async (args: unknown) => {
        calls.push({ model: "conversation.create", args });
        return conversation;
      }
    },
    supportRequest: {
      create: async (args: unknown) => {
        calls.push({ model: "supportRequest.create", args });
        return supportRequest;
      }
    },
    message: {
      create: async (args: unknown) => {
        calls.push({ model: "message.create", args });
        return args;
      },
      findMany: async (args: unknown) => {
        calls.push({ model: "message.findMany", args });
        return storedMessages;
      }
    },
    requestEvent: {
      create: async (args: unknown) => {
        calls.push({ model: "requestEvent.create", args });
        return args;
      }
    }
  };
  const prisma = {
    venue: { findFirst: async () => venue },
    servicePoint: {
      findFirst: async () => servicePoint,
      create: async () => servicePoint
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const service = new ServicePointsService(
    {
      createFallback: () => ({
        assistantReply: "Sorry about that. I have sent this to the team for Table 14.",
        category: "missing_order",
        confidence: 0.82,
        guestLocationLabel: "Table 14",
        needsStaff: true,
        priority: "high",
        suggestedAction: "reply",
        summary: "Guest says drinks never arrived",
        title: "Missing order"
      })
    } as never,
    { classifyOrDefault: () => "high" } as never,
    prisma as never,
    {} as never
  );

  const result = await service.createVenueGuestMessage("blue-note", {
    message: "My drinks never came",
    locationLabel: "Table 14",
    sessionId: "session_venue_123"
  });

  assert.equal((result as any).conversationId, conversation.id);
  assert.deepEqual((result as any).messages, storedMessages);
  assert.deepEqual((result as any).request, supportRequest);
});
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
npm run test -w @guestos/api -- src/service-points/service-points.service.test.ts
```

Expected: FAIL because `createVenueGuestMessage` is not implemented.

- [ ] **Step 3: Add the DTO**

Create `apps/api/src/service-points/dto/public-venue-message.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class PublicVenueMessageDto {
  @ApiProperty({ example: "My drinks never came" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(160)
  sessionId?: string;

  @ApiPropertyOptional({ example: "Table 14" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  locationLabel?: string;

  @ApiPropertyOptional({ example: "missing_order" })
  @IsOptional()
  @IsIn([
    "drink",
    "missing_order",
    "long_wait",
    "spill",
    "dirty_area",
    "lost_property",
    "payment",
    "restroom",
    "accessibility",
    "vip",
    "safety",
    "medical",
    "general"
  ])
  quickAction?: string;
}
```

- [ ] **Step 4: Add controller endpoints**

Modify `apps/api/src/service-points/public-qr.controller.ts`:

```ts
import { PublicVenueMessageDto } from "./dto/public-venue-message.dto";
```

Add methods to `PublicQrController`:

```ts
@Get("venues/:venueSlug")
@ApiOkResponse({ description: "Loads public venue intake details" })
getVenueIntake(@Param("venueSlug") venueSlug: string) {
  return this.servicePoints.getVenueIntake(venueSlug);
}

@Post("venues/:venueSlug/messages")
@ApiCreatedResponse({ description: "Accepts a guest message from a venue QR intake" })
createVenueGuestMessage(@Param("venueSlug") venueSlug: string, @Body() input: PublicVenueMessageDto) {
  return this.servicePoints.createVenueGuestMessage(venueSlug, input);
}
```

- [ ] **Step 5: Implement venue intake service methods**

Add helpers and methods to `apps/api/src/service-points/service-points.service.ts`:

```ts
private venueSupportQrToken(venueSlug: string) {
  return `venue_support_${venueSlug}`;
}

private async findOrCreateVenueSupportServicePoint(
  tx: {
    servicePoint: {
      findFirst(args: unknown): Promise<{ id: string; venueId: string; label: string; qrToken: string } | null>;
      create(args: unknown): Promise<{ id: string; venueId: string; label: string; qrToken: string }>;
    };
  },
  venue: { id: string; slug: string }
) {
  const existing = await tx.servicePoint.findFirst({
    where: {
      venueId: venue.id,
      label: "Venue support"
    }
  });

  if (existing) {
    return existing;
  }

  return tx.servicePoint.create({
    data: {
      venueId: venue.id,
      label: "Venue support",
      qrToken: this.venueSupportQrToken(venue.slug)
    }
  });
}

async getVenueIntake(venueSlug: string) {
  const venue = await this.prisma.venue.findFirst({
    where: { slug: venueSlug },
    select: { id: true, name: true, slug: true }
  });

  if (!venue) {
    throw new NotFoundException("Venue not found");
  }

  return {
    venue,
    quickActions: [
      "drink",
      "missing_order",
      "long_wait",
      "spill",
      "dirty_area",
      "lost_property",
      "payment",
      "restroom",
      "accessibility",
      "vip",
      "safety",
      "medical",
      "general"
    ]
  };
}
```

Add `createVenueGuestMessage` to `ServicePointsService`:

```ts
async createVenueGuestMessage(venueSlug: string, input: PublicVenueMessageDto) {
  const venue = await this.prisma.venue.findFirst({
    where: {
      slug: venueSlug
    }
  });

  if (!venue) {
    throw new NotFoundException("Venue not found");
  }

  return this.prisma.$transaction(async (tx) => {
    const servicePoint = await this.findOrCreateVenueSupportServicePoint(tx, venue);
    const conversation = input.conversationId
      ? await tx.conversation.findFirst({
          where: {
            id: input.conversationId,
            servicePointId: servicePoint.id,
            venueId: venue.id
          },
          include: {
            requests: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        })
      : await tx.conversation.create({
          data: {
            guestLocationLabel: input.locationLabel || null,
            guestLocationSource: input.locationLabel ? "guest" : null,
            guestSessionId: input.sessionId || null,
            servicePointId: servicePoint.id,
            venueId: venue.id
          }
        });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const latestRequest = Array.isArray((conversation as any).requests) ? (conversation as any).requests[0] : null;
    const hasOpenRequest = latestRequest ? this.isActiveRequestStatus(latestRequest.status) : false;
    const deterministicPriority = this.priorityClassifier.classifyOrDefault(input.message);
    const triage = this.aiTriage.createFallback({
      deterministicPriority,
      message: `${input.quickAction ? `Quick action: ${input.quickAction}\n` : ""}${input.message}`,
      servicePointLabel: input.locationLabel || servicePoint.label,
      isFollowup: Boolean(hasOpenRequest)
    });
    const locationLabel = input.locationLabel?.trim() || triage.guestLocationLabel || null;
    const locationSource = input.locationLabel ? "guest" : triage.guestLocationLabel ? "agent" : null;
    const prismaPriority = prismaPriorityBySharedPriority[deterministicPriority];
    const status = deterministicPriority === "urgent" ? RequestStatus.ESCALATED : RequestStatus.NEW;
    const supportRequest = hasOpenRequest
      ? latestRequest
      : await tx.supportRequest.create({
          data: {
            agentConfidence: triage.confidence,
            agentPolicyVersion: "v1-semi-autonomous",
            agentSuggestedAction: triage.suggestedAction,
            category: triage.category,
            conversationId: conversation.id,
            deterministicPriority: prismaPriority,
            guestLocationLabel: locationLabel,
            guestLocationSource: locationSource,
            priority: prismaPriority,
            servicePointId: servicePoint.id,
            status,
            summary: triage.summary || input.message,
            title: triage.title,
            venueId: venue.id
          }
        });
    const eventType = hasOpenRequest ? "request.updated" : deterministicPriority === "urgent" ? "request.escalated" : "request.created";

    await tx.message.create({
      data: {
        body: input.message,
        conversationId: conversation.id,
        metadata: {
          locationLabel,
          quickAction: input.quickAction || null,
          source: "public_venue_qr",
          venueSlug
        },
        requestId: supportRequest.id,
        sender: SenderType.GUEST,
        servicePointId: servicePoint.id,
        venueId: venue.id
      }
    });

    await tx.message.create({
      data: {
        body: triage.assistantReply,
        conversationId: conversation.id,
        metadata: {
          source: "public_venue_qr",
          triage
        },
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        servicePointId: servicePoint.id,
        venueId: venue.id
      }
    });

    await tx.requestEvent.create({
      data: {
        metadata: {
          agentPolicyVersion: "v1-semi-autonomous",
          locationLabel,
          quickAction: input.quickAction || null,
          source: "public_venue_qr",
          venueSlug
        },
        requestId: supportRequest.id,
        toStatus: supportRequest.status,
        type: eventType,
        venueId: venue.id
      }
    });

    const messages = await tx.message.findMany({
      where: {
        conversationId: conversation.id
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return {
      conversationId: conversation.id,
      messages,
      request: supportRequest,
      servicePoint
    };
  });
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -w @guestos/api -- src/service-points/service-points.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/service-points/dto/public-venue-message.dto.ts apps/api/src/service-points/public-qr.controller.ts apps/api/src/service-points/service-points.service.ts apps/api/src/service-points/service-points.service.test.ts
git commit -m "feat: add venue qr conversational intake api"
```

---

### Task 5: Operations API Ratings And Conversation Preview

**Files:**
- Modify: `apps/api/src/requests/requests.service.ts`
- Modify: `apps/api/src/requests/requests.service.test.ts`
- Modify: `apps/web/lib/auth/types.ts`

- [ ] **Step 1: Write the failing request-list test**

Add a test to `apps/api/src/requests/requests.service.test.ts`:

```ts
it("returns satisfaction rating and recent conversation preview for venue requests", async () => {
  const venue = { id: "venue_1", workspaceId: "workspace_1" };
  const request = {
    id: "request_1",
    venueId: venue.id,
    servicePointId: "sp_1",
    conversationId: "conversation_1",
    title: "Missing order",
    category: "missing_order",
    summary: "Guest is missing drinks",
    priority: "HIGH",
    status: "RESOLVED",
    guestLocationLabel: "Table 14",
    guestLocationSource: "guest",
    agentPolicyVersion: "v1-semi-autonomous",
    agentConfidence: 0.82,
    agentSuggestedAction: "reply",
    messages: [
      { id: "msg_1", requestId: "request_1", body: "Drinks never came", sender: "GUEST", metadata: null, createdAt: "2026-05-20T10:00:00.000Z" },
      { id: "msg_2", requestId: "request_1", body: "Rating: 5/5", sender: "SYSTEM", metadata: { satisfactionRating: 5 }, createdAt: "2026-05-20T10:10:00.000Z" }
    ],
    assignedTo: null,
    servicePoint: { id: "sp_1", label: "Venue support" }
  };
  const prisma = {
    venue: { findFirst: async () => venue },
    supportRequest: { findMany: async () => [request] }
  };
  const service = new RequestsService(prisma as never, { assertCanReadVenue: () => undefined } as never);

  const result = await service.listForVenue(
    { workspaceId: "workspace_1", role: "admin", venueId: null } as never,
    venue.id
  );

  assert.equal((result[0] as any).satisfactionRating, 5);
  assert.equal((result[0] as any).guestLocationLabel, "Table 14");
  assert.equal((result[0] as any).recentMessages.length, 2);
});
```

- [ ] **Step 2: Run the failing request test**

Run:

```bash
npm run test -w @guestos/api -- src/requests/requests.service.test.ts
```

Expected: FAIL because list results do not include `messages`, `satisfactionRating`, or `recentMessages`.

- [ ] **Step 3: Update request list include**

In `apps/api/src/requests/requests.service.ts`, update `supportRequest.findMany` include:

```ts
include: {
  assignedTo: true,
  servicePoint: true,
  messages: {
    orderBy: {
      createdAt: "desc"
    },
    take: 6
  }
}
```

- [ ] **Step 4: Add normalization helpers**

Add these functions above `RequestsService`:

```ts
function normalizeSatisfactionRating(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function latestSatisfactionRating(messages: Array<{ metadata: unknown; createdAt: Date | string }>) {
  const sortedMessages = [...messages].sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt))
  );

  for (const message of sortedMessages) {
    const metadata = message.metadata as { satisfactionRating?: unknown } | null;
    const rating = normalizeSatisfactionRating(metadata?.satisfactionRating);
    if (rating) {
      return rating;
    }
  }

  return null;
}

function recentMessages(messages: Array<{ id: string; sender: SenderType; body: string; createdAt: Date | string }>) {
  return [...messages]
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
    .map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt
    }));
}
```

Map the Prisma result before returning:

```ts
const requests = await this.prisma.supportRequest.findMany({
  where: {
    venueId
  },
  include: {
    assignedTo: true,
    servicePoint: true,
    messages: {
      orderBy: {
        createdAt: "desc"
      },
      take: 6
    }
  },
  orderBy: {
    createdAt: "desc"
  }
});

return requests.map((request) => ({
  ...request,
  satisfactionRating: latestSatisfactionRating(request.messages),
  recentMessages: recentMessages(request.messages)
}));
```

- [ ] **Step 5: Update web types**

In `apps/web/lib/auth/types.ts`, add to `CommandSupportRequest`:

```ts
  guestLocationLabel?: string | null;
  guestLocationSource?: string | null;
  agentPolicyVersion?: string | null;
  agentConfidence?: number | null;
  agentSuggestedAction?: string | null;
  satisfactionRating?: number | null;
  recentMessages?: Array<Pick<CommandMessage, "id" | "sender" | "body" | "createdAt">>;
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -w @guestos/api -- src/requests/requests.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/requests/requests.service.ts apps/api/src/requests/requests.service.test.ts apps/web/lib/auth/types.ts
git commit -m "feat: add operations rating conversation preview api"
```

---

### Task 6: Venue QR Support UI

**Files:**
- Create: `apps/web/lib/support-intake.ts`
- Create: `apps/web/app/venue/[slug]/page.tsx`
- Create: `apps/web/app/venue/[slug]/venue-support-chat.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add support intake copy**

Create `apps/web/lib/support-intake.ts`:

```ts
export const supportQuickActions = [
  { id: "drink", label: "Get a drink", prompt: "I would like to order a drink." },
  { id: "missing_order", label: "Missing order", prompt: "My order is missing or wrong." },
  { id: "long_wait", label: "Long wait", prompt: "I have been waiting too long." },
  { id: "spill", label: "Spill or glass", prompt: "There is a spill or broken glass nearby." },
  { id: "lost_property", label: "Lost property", prompt: "I need help with lost property." },
  { id: "payment", label: "Payment issue", prompt: "I need help with my bill or payment." },
  { id: "restroom", label: "Toilet issue", prompt: "There is a toilet or restroom issue." },
  { id: "safety", label: "Safety", prompt: "I need help with a safety or security concern." }
] as const;

export const supportLocationOptions = [
  "Table",
  "Bar area",
  "Dance floor",
  "VIP booth",
  "Outside",
  "Toilet/restroom",
  "Entrance/queue",
  "Not seated"
] as const;
```

- [ ] **Step 2: Add venue route page**

Create `apps/web/app/venue/[slug]/page.tsx`:

```tsx
import { VenueSupportChat } from "./venue-support-chat";

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main className="table-chat-page venue-support-page">
      <VenueSupportChat venueSlug={slug} />
    </main>
  );
}
```

- [ ] **Step 3: Add venue support chat component**

Create `apps/web/app/venue/[slug]/venue-support-chat.tsx` based on `TableChat`, using these endpoint changes:

```tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { MapPin, Send, Sparkles } from "lucide-react";
import { publicApiRequest } from "@/lib/api/client";
import type { CommandMessage, CommandSupportRequest, PublicQrConversationState } from "@/lib/auth/types";
import { supportLocationOptions, supportQuickActions } from "@/lib/support-intake";

export function VenueSupportChat({ venueSlug }: { venueSlug: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [request, setRequest] = useState<CommandSupportRequest | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(`venue-support:${venueSlug}:conversationId`);
    if (stored) setConversationId(stored);
  }, [venueSlug]);

  useEffect(() => {
    if (conversationId) {
      window.localStorage.setItem(`venue-support:${venueSlug}:conversationId`, conversationId);
    }
  }, [conversationId, venueSlug]);

  async function sendMessage(nextMessage?: string, quickAction?: string) {
    const body = (nextMessage || input).trim();
    if (!body || isSending) return;

    setInput("");
    setIsSending(true);
    const result = await publicApiRequest<PublicQrConversationState>(
      `/public/qr/venues/${encodeURIComponent(venueSlug)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          locationLabel: locationLabel.trim() || undefined,
          message: body,
          quickAction
        })
      }
    ).finally(() => setIsSending(false));

    setConversationId(result.conversationId);
    setMessages(result.messages);
    setRequest(result.request);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <section className="grid two-col venue-support-layout">
      <div className="panel chat">
        <div className="chat-header">
          <div>
            <strong>Venue support</strong>
            <div className="meta">{request ? request.status.toLowerCase().replace("_", " ") : "Tell us what you need"}</div>
          </div>
        </div>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`bubble ${message.sender.toLowerCase()}`} key={message.id}>
              {message.body}
            </div>
          ))}
        </div>
        <form className="composer" onSubmit={onSubmit}>
          <textarea aria-label="Message" onChange={(event) => setInput(event.target.value)} placeholder="Tell us what would help..." value={input} />
          <button className="button" disabled={isSending} type="submit" title="Send message">
            <Send size={18} />
          </button>
        </form>
      </div>
      <aside className="panel support-panel">
        <div className="eyebrow">Support</div>
        <h1 className="page-title compact-title">How can we help?</h1>
        <label className="venue-location-input">
          <span><MapPin size={15} /> Where are you?</span>
          <input onChange={(event) => setLocationLabel(event.target.value)} placeholder="Table 14, bar area, VIP booth..." value={locationLabel} />
        </label>
        <div className="location-chips">
          {supportLocationOptions.map((option) => (
            <button key={option} onClick={() => setLocationLabel(option)} type="button">{option}</button>
          ))}
        </div>
        <div className="quick-actions">
          {supportQuickActions.map((action) => (
            <button disabled={isSending} key={action.id} onClick={() => void sendMessage(action.prompt, action.id)} type="button">
              <Sparkles size={15} /> {action.label}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
```

- [ ] **Step 4: Add CSS**

Append to `apps/web/app/globals.css`:

```css
.venue-support-page .support-panel {
  gap: 16px;
}

.venue-location-input {
  display: grid;
  gap: 8px;
}

.venue-location-input span {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 13px;
  font-weight: 900;
  gap: 6px;
}

.venue-location-input input {
  background: #0a100e;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  min-height: 42px;
  padding: 0 12px;
}

.location-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.location-chips button {
  background: rgba(245, 242, 232, 0.08);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-weight: 850;
  min-height: 34px;
  padding: 0 10px;
}
```

- [ ] **Step 5: Run lint/build**

Run:

```bash
npm run lint -w @guestos/web
npm run build -w @guestos/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/support-intake.ts apps/web/app/venue apps/web/app/globals.css
git commit -m "feat: add venue qr support intake ui"
```

---

### Task 7: Operations Ratings And Conversational Rows

**Files:**
- Modify: `apps/web/app/components/operations-command.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Import analytics and icons**

In `apps/web/app/components/operations-command.tsx`, add:

```ts
import { MessageSquareText, Star, Workflow } from "lucide-react";
import { calculateRatingAnalytics } from "@/lib/rating-analytics";
```

Merge icon imports instead of duplicating `lucide-react` imports.

- [ ] **Step 2: Calculate ratings**

After existing request filters, add:

```ts
const ratingAnalytics = calculateRatingAnalytics(requests);
const ratingAverage = ratingAnalytics.averageRating === null ? "No ratings" : ratingAnalytics.averageRating.toFixed(1);
```

Replace the four `metrics` entries with:

```ts
const metrics = [
  { label: "Open queue", value: openRequests.length.toString(), detail: `${requests.length} total`, tone: "ok", icon: RadioTower },
  { label: "Avg rating", value: ratingAverage, detail: `${ratingAnalytics.ratedCount} rated`, tone: "idle", icon: Star },
  { label: "Low ratings", value: ratingAnalytics.lowRatingCount.toString(), detail: "1-2 star recovery", tone: "warn", icon: ShieldAlert },
  { label: "High ratings", value: `${ratingAnalytics.highRatingPercent}%`, detail: "4-5 star requests", tone: "ok", icon: CheckCircle2 }
];
```

- [ ] **Step 3: Add row helpers**

Add these helpers above the component:

```ts
function ratingLabel(request: CommandSupportRequest) {
  if (request.satisfactionRating) {
    return `${request.satisfactionRating}/5`;
  }

  if (request.status === "COMPLETED" || request.status === "RESOLVED") {
    return "Not rated";
  }

  return "Awaiting completion";
}

function latestPreview(request: CommandSupportRequest) {
  return request.recentMessages?.at(-1)?.body || request.summary || "No conversation preview yet.";
}
```

- [ ] **Step 4: Render conversational request rows**

Inside each `.request-row`, under the title/category line, add:

```tsx
<span className="request-preview">
  <MessageSquareText size={13} />
  {latestPreview(request)}
</span>
{request.guestLocationLabel ? <span className="request-preview">Location: {request.guestLocationLabel}</span> : null}
```

In the compact pill row, add:

```tsx
<span className={`pill rating-chip ${request.satisfactionRating && request.satisfactionRating <= 2 ? "low-rating" : ""}`}>
  <Star size={12} />
  {ratingLabel(request)}
</span>
```

- [ ] **Step 5: Replace control state panel with agent panel**

Replace the right-side `ops-incident-panel` body with:

```tsx
<section className="command-panel ops-incident-panel agent-loop-panel">
  <span className="ops-incident-icon">
    <Workflow size={20} />
  </span>
  <div>
    <h2>Agent loop</h2>
    <p className="meta">Semi-autonomous mode can reply to safe routine requests and assign low-risk work inside manager rules.</p>
  </div>
  <div className="agent-loop-steps">
    <div><strong>Observe</strong><span>Status, priority, location, rating, conversation</span></div>
    <div><strong>Decide</strong><span>Recovery, stale threads, escalation risk</span></div>
    <div><strong>Act</strong><span>Reply, recommend, assign inside policy</span></div>
  </div>
</section>
```

- [ ] **Step 6: Add CSS**

Append to `apps/web/app/globals.css`:

```css
.request-preview {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 12px;
  gap: 6px;
  line-height: 1.35;
  margin-top: 5px;
}

.rating-chip {
  background: rgba(255, 204, 102, 0.12);
  color: var(--warning);
}

.rating-chip.low-rating {
  background: rgba(255, 107, 74, 0.13);
  color: var(--danger);
}

.agent-loop-panel {
  align-content: start;
}

.agent-loop-steps {
  display: grid;
  gap: 10px;
}

.agent-loop-steps div {
  border-left: 3px solid var(--accent);
  padding-left: 10px;
}

.agent-loop-steps strong,
.agent-loop-steps span {
  display: block;
}

.agent-loop-steps span {
  color: var(--muted);
  font-size: 12px;
}
```

- [ ] **Step 7: Run lint/build**

Run:

```bash
npm run lint -w @guestos/web
npm run build -w @guestos/web
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/components/operations-command.tsx apps/web/app/globals.css
git commit -m "feat: show conversational ratings in operations"
```

---

### Task 8: SaaS User Stories And API Documentation

**Files:**
- Create: `docs/product/guestos-user-stories.md`
- Create: `docs/api/guestos-api.md`

- [ ] **Step 1: Write product user stories**

Create `docs/product/guestos-user-stories.md`:

```md
# GuestOS User Stories

## Venue Guest

As a guest in a pub or club, I want to scan one venue QR code from anywhere, describe what I need, and tell the venue where I am, so I can get help without finding a staff member.

Common guest needs:

- Get a drink.
- Missing or wrong order.
- Long wait.
- Spill or broken glass.
- Dirty table or area.
- Lost property.
- Payment or bill issue.
- Toilet/restroom problem.
- Accessibility help.
- VIP or table service help.
- Harassment or safety concern.
- Medical/security emergency.
- General help.

## Staff Member

As staff, I want guest requests to arrive as clear conversational tasks with category, priority, location, and latest message context, so I can respond quickly.

## Manager

As a manager, I want to define assignment and autonomy rules, so the agent can handle routine work while escalating risky decisions to humans.

## Admin

As an admin, I want to manage venues, staff, service points, QR modes, and agent policy versions, so each customer can configure the SaaS for their venue.
```

- [ ] **Step 2: Write API documentation**

Create `docs/api/guestos-api.md`:

````md
# GuestOS API

## Public Venue Intake

`GET /public/qr/venues/:venueSlug`

Returns public venue intake details and quick actions.

`POST /public/qr/venues/:venueSlug/messages`

Accepts a venue QR guest message.

Request body:

```json
{
  "message": "My drinks never came",
  "conversationId": "optional-uuid",
  "sessionId": "guest-session-12345",
  "locationLabel": "Table 14",
  "quickAction": "missing_order"
}
```

Response:

```json
{
  "conversationId": "uuid",
  "messages": [],
  "request": {
    "id": "uuid",
    "status": "NEW",
    "priority": "HIGH",
    "guestLocationLabel": "Table 14",
    "agentPolicyVersion": "v1-semi-autonomous"
  },
  "servicePoint": {
    "label": "Venue support"
  }
}
```

## Operations Requests

`GET /venues/:venueId/requests`

Returns requests with `satisfactionRating`, `recentMessages`, `guestLocationLabel`, assignment, service point, and agent metadata.

## Agent Policy

Supported policy versions:

- `v1-assistive`
- `v1-semi-autonomous`
- `v2-autonomous-within-rules`

Semi-autonomous mode can send safe routine replies and assign low-risk requests inside manager-defined rules.
````

- [ ] **Step 3: Commit**

```bash
git add docs/product/guestos-user-stories.md docs/api/guestos-api.md
git commit -m "docs: add guestos user stories and api"
```

---

### Task 9: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run API tests**

Run:

```bash
npm run test -w @guestos/api
```

Expected: PASS.

- [ ] **Step 2: Run shared build**

Run:

```bash
npm run build -w @guestos/shared
```

Expected: PASS.

- [ ] **Step 3: Run database generation**

Run:

```bash
npm run prisma:generate
```

Expected: PASS.

- [ ] **Step 4: Run web lint/build**

Run:

```bash
npm run lint -w @guestos/web
npm run build -w @guestos/web
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Start the services:

```bash
npm run dev:api
npm run dev:web
```

Open:

```text
http://localhost:3000/venue/demo-venue
```

Smoke flow:

1. Enter location `Table 14`.
2. Click `Missing order`.
3. Confirm a conversation appears.
4. Confirm a request appears in the Operations tab.
5. Confirm Operations shows a conversation preview and rating metric states.
