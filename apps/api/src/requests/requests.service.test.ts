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
    assert.equal((result[0] as any).recentMessages.length, 2);
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

  it("updates staff lifecycle status and creates an event in a transaction", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
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
      }
    ]);
  });

  it("requires a rating before guests confirm a completed request is resolved", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.COMPLETED
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
      status: RequestStatus.COMPLETED
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
    assert.deepEqual(calls, [
      {
        model: "supportRequest.findUnique",
        args: {
          where: { id: request.id }
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

  it("reopens completed requests when guests are not satisfied without requiring a rating", async () => {
    const request = {
      id: "request_1",
      venueId: "venue_1",
      servicePointId: "sp_1",
      conversationId: "conversation_1",
      status: RequestStatus.COMPLETED
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
