import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { RequestStatus, SenderType } from "@prisma/client";
import type { AuthContext } from "../auth/auth-context";
import { RequestsService } from "./requests.service";

const auth: AuthContext = {
  staffProfileId: "staff_1",
  workspaceId: "workspace_1",
  venueId: "venue_1",
  role: "staff"
};

function createVenueAccess() {
  return {
    assertCanReadVenue: () => undefined,
    assertCanOperateVenue: () => undefined
  };
}

describe("RequestsService lifecycle", () => {
  it("uses read permission when listing venue requests", async () => {
    const venue = {
      id: "venue_1",
      workspaceId: "workspace_1"
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    let readPermissionChecked = false;
    const prisma = {
      venue: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "venue.findFirst", args });
          return venue;
        }
      },
      supportRequest: {
        findMany: async (args: unknown) => {
          calls.push({ model: "supportRequest.findMany", args });
          return [];
        }
      }
    };
    const service = new RequestsService(prisma as never, {
      assertCanReadVenue: () => {
        readPermissionChecked = true;
      },
      assertCanOperateVenue: () => {
        throw new Error("listing requests must not require operate permission");
      }
    } as never);

    const result = await service.listForVenue({ ...auth, role: "read_only" }, venue.id);

    assert.deepEqual(result, []);
    assert.equal(readPermissionChecked, true);
    assert.deepEqual(calls, [
      {
        model: "venue.findFirst",
        args: {
          where: {
            id: venue.id,
            workspaceId: auth.workspaceId
          }
        }
      },
      {
        model: "supportRequest.findMany",
        args: {
          where: {
            venueId: venue.id
          },
          include: {
            assignedTo: {
              select: {
                id: true,
                displayName: true,
                email: true
              }
            },
            servicePoint: {
              select: {
                id: true,
                label: true
              }
            },
            messages: {
              select: {
                id: true,
                sender: true,
                body: true,
                metadata: true,
                createdAt: true
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 20
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 100
        }
      }
    ]);
  });

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
      status: RequestStatus.RESOLVED,
      guestLocationLabel: "Table 14",
      guestLocationSource: "guest",
      agentPolicyVersion: "v1-semi-autonomous",
      agentConfidence: 0.82,
      agentSuggestedAction: "reply",
      messages: [
        {
          id: "msg_1",
          requestId: "request_1",
          body: "Drinks never came",
          sender: SenderType.GUEST,
          metadata: null,
          createdAt: "2026-05-20T10:00:00.000Z"
        },
        {
          id: "msg_2",
          requestId: "request_1",
          body: "Rating: 5/5",
          sender: SenderType.SYSTEM,
          metadata: { satisfactionRating: 5 },
          createdAt: "2026-05-20T10:10:00.000Z"
        }
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
    assert.equal((result[0] as any).recentMessages.length, 1);
    assert.equal((result[0] as any).recentMessages[0].sender, SenderType.GUEST);
  });

  it("keeps operations previews focused on guest messages after staff acknowledgements", async () => {
    const venue = { id: "venue_1", workspaceId: "workspace_1" };
    const request = {
      id: "request_guest_preview_1",
      venueId: venue.id,
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      title: "Drink request",
      category: "drink",
      summary: "Guest asked for a drink",
      priority: "NORMAL",
      status: RequestStatus.ACKNOWLEDGED,
      messages: [
        {
          id: "msg_acknowledged",
          body: "The team has acknowledged your request and will help from here.",
          sender: SenderType.SYSTEM,
          metadata: null,
          createdAt: "2026-05-20T10:03:00.000Z"
        },
        {
          id: "msg_ai_reply",
          body: "Thanks, I will let the team know.",
          sender: SenderType.ASSISTANT,
          metadata: null,
          createdAt: "2026-05-20T10:02:00.000Z"
        },
        {
          id: "msg_guest_request",
          body: "Can I get a glass of water?",
          sender: SenderType.GUEST,
          metadata: null,
          createdAt: "2026-05-20T10:01:00.000Z"
        }
      ],
      assignedTo: null,
      servicePoint: { id: "sp_1", label: "Table 4" }
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

    assert.deepEqual((result[0] as any).recentMessages, [
      {
        id: "msg_guest_request",
        sender: SenderType.GUEST,
        body: "Can I get a glass of water?",
        createdAt: "2026-05-20T10:01:00.000Z"
      }
    ]);
  });

  it("rejects an invalid staff transition from completed to resolved", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      status: RequestStatus.COMPLETED,
      assignedToId: null,
      venue: {
        id: "venue_1",
        workspaceId: "workspace_1"
      }
    };
    const prisma = {
      supportRequest: {
        findUnique: async () => request
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await assert.rejects(
      service.updateStatus(auth, request.id, { status: "resolved" }),
      (error: unknown) => error instanceof ConflictException
    );
  });

  it("allows staff to acknowledge a new request and records when it happened", async () => {
    const request = {
      id: "request_acknowledge_1",
      venueId: "venue_1",
      servicePointId: "service_point_1",
      conversationId: "conversation_1",
      status: RequestStatus.NEW,
      assignedToId: null,
      venue: {
        id: "venue_1",
        workspaceId: "workspace_1"
      }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.ACKNOWLEDGED,
      acknowledgedAt: new Date("2026-05-26T10:00:00.000Z")
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return updatedRequest;
        }
      },
      requestEvent: {
        create: async (args: unknown) => {
          calls.push({ model: "requestEvent.create", args });
          return args;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return args;
        }
      }
    };
    const prisma = {
      supportRequest: {
        findUnique: async (args: unknown) => {
          calls.push({ model: "supportRequest.findUnique", args });
          return request;
        }
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await service.updateStatus(auth, request.id, { status: "acknowledged" });

    const updateCall = calls.find((call) => call.model === "supportRequest.update") as {
      args: { data: { acknowledgedAt?: unknown } };
    };
    assert.ok(updateCall.args.data.acknowledgedAt instanceof Date);
    updateCall.args.data.acknowledgedAt = "Any<Date>";
    assert.deepEqual(updateCall.args.data, {
      status: RequestStatus.ACKNOWLEDGED,
      acknowledgedAt: "Any<Date>"
    });
  });

  it("updates staff lifecycle status and creates an event in a transaction", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      servicePointId: "service_point_1",
      conversationId: "conversation_1",
      status: RequestStatus.IN_PROGRESS,
      assignedToId: null,
      venue: {
        id: "venue_1",
        workspaceId: "workspace_1"
      }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.COMPLETED,
      completedAt: new Date("2026-05-13T12:00:00.000Z")
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return updatedRequest;
        }
      },
      requestEvent: {
        create: async (args: unknown) => {
          calls.push({ model: "requestEvent.create", args });
          return args;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return args;
        }
      }
    };
    const prisma = {
      supportRequest: {
        findUnique: async (args: unknown) => {
          calls.push({ model: "supportRequest.findUnique", args });
          return request;
        }
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    const result = await service.updateStatus(auth, request.id, {
      status: "completed",
      assignedToId: "11111111-1111-4111-8111-111111111111"
    });

    assert.deepEqual(result, updatedRequest);
    const updateCall = calls[2] as { args: { data: { completedAt?: unknown } } };
    assert.ok(updateCall.args.data.completedAt instanceof Date);
    updateCall.args.data.completedAt = "Any<Date>";
    assert.deepEqual(calls, [
      {
        model: "supportRequest.findUnique",
        args: {
          where: { id: request.id },
          include: { venue: true }
        }
      },
      {
        model: "$transaction",
        args: "callback"
      },
      {
        model: "supportRequest.update",
        args: {
          where: { id: request.id },
          data: {
            status: RequestStatus.COMPLETED,
            assignedToId: "11111111-1111-4111-8111-111111111111",
            completedAt: "Any<Date>"
          },
          include: {
            assignedTo: true,
            servicePoint: true
          }
        }
      },
      {
        model: "requestEvent.create",
        args: {
          data: {
            venueId: request.venueId,
            requestId: request.id,
            actorStaffId: auth.staffProfileId,
            type: "request.status_changed",
            fromStatus: RequestStatus.IN_PROGRESS,
            toStatus: RequestStatus.COMPLETED,
            metadata: {
              assignedToId: "11111111-1111-4111-8111-111111111111"
            }
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: request.venueId,
            servicePointId: request.servicePointId,
            conversationId: request.conversationId,
            requestId: request.id,
            sender: SenderType.SYSTEM,
            body: "The team marked this complete. How did it go?",
            metadata: {
              source: "request_status",
              status: "completed"
            }
          }
        }
      }
    ]);
  });

  it("does not create a guest-visible acknowledged message", async () => {
    const request = {
      id: "request_status_message_1",
      venueId: "venue_1",
      servicePointId: "service_point_1",
      conversationId: "conversation_status_message_1",
      status: RequestStatus.NEW,
      assignedToId: null,
      venue: {
        id: "venue_1",
        workspaceId: "workspace_1"
      }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.ACKNOWLEDGED
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return updatedRequest;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return args;
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
      supportRequest: {
        findUnique: async (args: unknown) => {
          calls.push({ model: "supportRequest.findUnique", args });
          return request;
        }
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await service.updateStatus({ ...auth, role: "admin" }, request.id, { status: "acknowledged" });

    assert.equal(calls.some((call) => call.model === "message.create"), false);
    assert.equal(calls.some((call) => call.model === "requestEvent.create"), true);
  });

  it("creates a guest-visible in-progress message when staff starts work", async () => {
    const request = {
      id: "request_in_progress_message_1",
      venueId: "venue_1",
      servicePointId: "service_point_1",
      conversationId: "conversation_in_progress_message_1",
      status: RequestStatus.ACKNOWLEDGED,
      assignedToId: null,
      venue: {
        id: "venue_1",
        workspaceId: "workspace_1"
      }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.IN_PROGRESS
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return updatedRequest;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return args;
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
      supportRequest: {
        findUnique: async (args: unknown) => {
          calls.push({ model: "supportRequest.findUnique", args });
          return request;
        }
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await service.updateStatus({ ...auth, role: "admin" }, request.id, { status: "in_progress" });

    assert.deepEqual(
      calls.find((call) => call.model === "message.create"),
      {
        model: "message.create",
        args: {
          data: {
            venueId: request.venueId,
            servicePointId: request.servicePointId,
            conversationId: request.conversationId,
            requestId: request.id,
            sender: SenderType.SYSTEM,
            body: "The team is working on this now.",
            metadata: {
              source: "request_status",
              status: "in_progress"
            }
          }
        }
      }
    );
  });

  it("publishes realtime events after staff status updates commit", async () => {
    const request = {
      id: "request_realtime_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.ACKNOWLEDGED,
      venue: { workspaceId: auth.workspaceId }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.IN_PROGRESS,
      assignedTo: null,
      servicePoint: null
    };
    const message = {
      id: "message_realtime_1",
      venueId: request.venueId,
      conversationId: request.conversationId,
      requestId: request.id
    };
    const prisma = {
      supportRequest: {
        findUnique: async () => request
      },
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          supportRequest: {
            update: async () => updatedRequest
          },
          conversation: {
            update: async () => ({})
          },
          requestEvent: {
            create: async () => ({})
          },
          message: {
            create: async () => message
          }
        })
    };
    const published: unknown[] = [];
    const service = new RequestsService(prisma as never, createVenueAccess() as never, {
      publish: (event: unknown) => {
        published.push(event);
      }
    } as never);

    await service.updateStatus(auth, request.id, { status: "in_progress" });

    assert.deepEqual(
      published.map((event) => ({ ...(event as any), occurredAt: "Any<Date>" })),
      [
        {
          type: "request.updated",
          venueId: request.venueId,
          requestId: request.id,
          conversationId: request.conversationId,
          occurredAt: "Any<Date>"
        },
        {
          type: "message.created",
          venueId: request.venueId,
          requestId: request.id,
          conversationId: request.conversationId,
          messageId: message.id,
          occurredAt: "Any<Date>"
        }
      ]
    );
  });

  it("requires a rating before guests confirm a completed request is resolved", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.COMPLETED,
      conversation: { guestSessionId: null }
    };
    const prisma = {
      supportRequest: {
        findUnique: async () => request
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await assert.rejects(
      service.applyGuestAction({ requestId: request.id, action: "confirm_resolved" }),
      (error: unknown) =>
        error instanceof BadRequestException && error.message === "A satisfaction rating from 1 to 5 is required"
    );
  });

  it("stores guest satisfaction rating on system message and event metadata when resolving", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.COMPLETED,
      conversation: { guestSessionId: null }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.RESOLVED,
      resolvedAt: new Date("2026-05-13T12:00:00.000Z")
    };
    const message = {
      id: "message_1",
      requestId: request.id,
      sender: SenderType.SYSTEM,
      body: "Thanks for confirming this was resolved. Rating: 5/5.",
      metadata: {
        satisfactionRating: 5
      }
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return updatedRequest;
        }
      },
      conversation: {
        update: async (args: unknown) => {
          calls.push({ model: "conversation.update", args });
          return args;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return message;
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
      supportRequest: {
        findUnique: async (args: unknown) => {
          calls.push({ model: "supportRequest.findUnique", args });
          return request;
        }
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    const result = await service.applyGuestAction({
      requestId: request.id,
      action: "confirm_resolved",
      rating: 5
    });

    assert.deepEqual(result, { request: updatedRequest, message });
    const updateCall = calls[2] as { args: { data: { resolvedAt?: unknown } } };
    assert.ok(updateCall.args.data.resolvedAt instanceof Date);
    updateCall.args.data.resolvedAt = "Any<Date>";
    const conversationUpdateCall = calls[3] as { args: { data: { closedAt?: unknown } } };
    assert.ok(conversationUpdateCall.args.data.closedAt instanceof Date);
    conversationUpdateCall.args.data.closedAt = "Any<Date>";
    assert.deepEqual(calls, [
      {
        model: "supportRequest.findUnique",
        args: {
          where: { id: request.id },
          include: { conversation: true }
        }
      },
      {
        model: "$transaction",
        args: "callback"
      },
      {
        model: "supportRequest.update",
        args: {
          where: { id: request.id },
          data: {
            status: RequestStatus.RESOLVED,
            resolvedAt: "Any<Date>"
          }
        }
      },
      {
        model: "conversation.update",
        args: {
          where: { id: request.conversationId },
          data: {
            status: "closed",
            closedAt: "Any<Date>"
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: request.venueId,
            servicePointId: request.servicePointId,
            conversationId: request.conversationId,
            requestId: request.id,
            sender: SenderType.SYSTEM,
            body: "Thanks for confirming this was resolved. Rating: 5/5.",
            metadata: {
              satisfactionRating: 5
            }
          }
        }
      },
      {
        model: "requestEvent.create",
        args: {
          data: {
            venueId: request.venueId,
            requestId: request.id,
            type: "request.resolved_by_guest",
            fromStatus: RequestStatus.COMPLETED,
            toStatus: RequestStatus.RESOLVED,
            metadata: {
              satisfactionRating: 5
            }
          }
        }
      }
    ]);
  });

  it("publishes realtime events after guest request actions commit", async () => {
    const request = {
      id: "request_guest_realtime_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.COMPLETED,
      conversation: { guestSessionId: "guest_session_1" }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.IN_PROGRESS
    };
    const message = {
      id: "message_guest_realtime_1",
      venueId: request.venueId,
      conversationId: request.conversationId,
      requestId: request.id,
      sender: SenderType.SYSTEM,
      body: "Thanks for letting us know. The team will keep working on this.",
      createdAt: new Date("2026-06-02T06:20:00.000Z"),
      metadata: {}
    };
    const prisma = {
      supportRequest: {
        findUnique: async () => request
      },
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          supportRequest: {
            update: async () => updatedRequest
          },
          conversation: {
            update: async () => ({})
          },
          message: {
            create: async () => message
          },
          requestEvent: {
            create: async () => ({})
          }
        })
    };
    const published: unknown[] = [];
    const service = new RequestsService(prisma as never, createVenueAccess() as never, {
      publish: (event: unknown) => {
        published.push(event);
      }
    } as never);

    await service.applyGuestAction({
      requestId: request.id,
      action: "not_satisfied",
      sessionId: "guest_session_1"
    });

    assert.deepEqual(
      published.map((event) => ({ ...(event as any), occurredAt: "Any<Date>" })),
      [
        {
          type: "request.updated",
          venueId: request.venueId,
          requestId: request.id,
          conversationId: request.conversationId,
          occurredAt: "Any<Date>"
        },
        {
          type: "message.created",
          venueId: request.venueId,
          requestId: request.id,
          conversationId: request.conversationId,
          messageId: message.id,
          occurredAt: "Any<Date>"
        }
      ]
    );
  });

  it("closes the guest conversation when guests cancel a request", async () => {
    const request = {
      id: "request_cancel_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_cancel_1",
      status: RequestStatus.NEW,
      conversation: { guestSessionId: "session_cancel_1" }
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return { ...request, status: RequestStatus.CANCELLED };
        }
      },
      conversation: {
        update: async (args: unknown) => {
          calls.push({ model: "conversation.update", args });
          return args;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return { id: "message_cancel_1" };
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
      supportRequest: {
        findUnique: async () => request
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await service.applyGuestAction({ requestId: request.id, action: "cancel", sessionId: "session_cancel_1" });

    const conversationUpdateCall = calls.find((call) => call.model === "conversation.update") as {
      args: { data: { closedAt?: unknown } };
    };
    assert.ok(conversationUpdateCall.args.data.closedAt instanceof Date);
    conversationUpdateCall.args.data.closedAt = "Any<Date>";
    assert.deepEqual(conversationUpdateCall, {
      model: "conversation.update",
      args: {
        where: { id: request.conversationId },
        data: {
          status: "closed",
          closedAt: "Any<Date>"
        }
      }
    });
  });

  it("reopens completed requests when guests are not satisfied without requiring a rating", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.COMPLETED,
      conversation: { guestSessionId: null }
    };
    const updatedRequest = {
      ...request,
      status: RequestStatus.IN_PROGRESS
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      supportRequest: {
        update: async (args: unknown) => {
          calls.push({ model: "supportRequest.update", args });
          return updatedRequest;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          return { id: "message_1" };
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
      supportRequest: {
        findUnique: async () => request
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
    };
    const service = new RequestsService(prisma as never, createVenueAccess() as never);

    await service.applyGuestAction({ requestId: request.id, action: "not_satisfied" });

    assert.deepEqual(calls, [
      {
        model: "supportRequest.update",
        args: {
          where: { id: request.id },
          data: {
            status: RequestStatus.IN_PROGRESS,
            resolvedAt: null
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: request.venueId,
            servicePointId: request.servicePointId,
            conversationId: request.conversationId,
            requestId: request.id,
            sender: SenderType.SYSTEM,
            body: "Thanks for letting us know. The team will keep working on this.",
            metadata: {}
          }
        }
      },
      {
        model: "requestEvent.create",
        args: {
          data: {
            venueId: request.venueId,
            requestId: request.id,
            type: "request.reopened_by_guest",
            fromStatus: RequestStatus.COMPLETED,
            toStatus: RequestStatus.IN_PROGRESS,
            metadata: {}
          }
        }
      }
    ]);
  });
});
