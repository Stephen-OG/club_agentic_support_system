import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestPriority, RequestStatus, SenderType } from "@prisma/client";
import { ServicePointsService } from "./service-points.service";

type PublicGuestMessageResult = {
  conversationId: string;
  messages: unknown[];
  request: unknown;
  servicePoint: unknown;
};

describe("ServicePointsService public QR workflow", () => {
  it("persists a public QR guest message and returns conversation state", async () => {
    const servicePoint = {
      id: "sp_1",
      venueId: "venue_1",
      label: "Patio 4",
      qrToken: "qr_public_123",
      isActive: true
    };
    const conversation = {
      id: "conversation_1",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      guestSessionId: "session_public_123"
    };
    const supportRequest = {
      id: "request_1",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      conversationId: conversation.id,
      title: "High priority guest request",
      category: "facilities",
      summary: "There is a spill by our table",
      priority: RequestPriority.HIGH,
      deterministicPriority: RequestPriority.HIGH,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      {
        id: "message_guest_1",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.GUEST,
        body: "There is a spill by our table"
      },
      {
        id: "message_assistant_1",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Thanks, the team has been notified."
      }
    ];

    const calls: Array<{ model: string; args: unknown }> = [];
    const prisma = {
      servicePoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "servicePoint.findFirst", args });
          return servicePoint;
        }
      },
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
    const service = new ServicePointsService(
      {
        createFallback: () => ({
          assistantReply: "Thanks, the team has been notified.",
          category: "facilities",
          needsStaff: true,
          priority: "high",
          summary: "There is a spill by our table",
          title: "High priority guest request"
        })
      } as never,
      {
        classifyOrDefault: () => "high"
      } as never,
      prisma as never,
      {} as never
    );

    const result = (await service.createGuestMessage("qr_public_123", {
      message: "There is a spill by our table",
      sessionId: "session_public_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.deepEqual(result.request, supportRequest);
    assert.deepEqual(result.servicePoint, servicePoint);
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_public_123",
            isActive: true
          }
        }
      },
      {
        model: "conversation.create",
        args: {
          data: {
            guestSessionId: "session_public_123",
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }
      },
      {
        model: "supportRequest.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            title: "High priority guest request",
            category: "facilities",
            summary: "There is a spill by our table",
            priority: RequestPriority.HIGH,
            deterministicPriority: RequestPriority.HIGH,
            status: RequestStatus.NEW
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            requestId: supportRequest.id,
            sender: SenderType.GUEST,
            body: "There is a spill by our table",
            metadata: {
              source: "public_qr",
              qrToken: "qr_public_123"
            }
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            requestId: supportRequest.id,
            sender: SenderType.ASSISTANT,
            body: "Thanks, the team has been notified.",
            metadata: {
              source: "public_qr",
              triage: {
                category: "facilities",
                needsStaff: true,
                priority: "high",
                summary: "There is a spill by our table",
                title: "High priority guest request"
              }
            }
          }
        }
      },
      {
        model: "requestEvent.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            requestId: supportRequest.id,
            type: "request.created",
            toStatus: RequestStatus.NEW,
            metadata: {
              source: "public_qr",
              qrToken: "qr_public_123"
            }
          }
        }
      },
      {
        model: "message.findMany",
        args: {
          where: {
            conversationId: conversation.id
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    ]);
  });
});
