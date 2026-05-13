import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { RequestPriority, RequestStatus, SenderType } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
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
      servicePoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "servicePoint.findFirst", args });
          return servicePoint;
        }
      },
      conversation: tx.conversation,
      supportRequest: tx.supportRequest,
      message: tx.message,
      requestEvent: tx.requestEvent,
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
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
        model: "$transaction",
        args: "callback"
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

  it("resumes an existing conversation scoped to the active service point", async () => {
    const servicePoint = {
      id: "sp_resume",
      venueId: "venue_resume",
      label: "Booth 12",
      qrToken: "qr_resume_123",
      isActive: true
    };
    const conversation = {
      id: "conversation_resume_1",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      guestSessionId: "session_existing_123"
    };
    const supportRequest = {
      id: "request_resume_1",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      conversationId: conversation.id,
      title: "Guest support request",
      category: "general",
      summary: "Could we get more water?",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      {
        id: "message_resume_guest_1",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.GUEST,
        body: "Could we get more water?"
      },
      {
        id: "message_resume_assistant_1",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "The team has your request."
      }
    ];

    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      conversation: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "conversation.findFirst", args });
          return conversation;
        },
        create: async (args: unknown) => {
          calls.push({ model: "conversation.create", args });
          throw new Error("conversation.create should not be called when resuming");
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
      servicePoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "servicePoint.findFirst", args });
          return servicePoint;
        }
      },
      conversation: tx.conversation,
      supportRequest: tx.supportRequest,
      message: tx.message,
      requestEvent: tx.requestEvent,
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new ServicePointsService(
      {
        createFallback: () => ({
          assistantReply: "The team has your request.",
          category: "general",
          needsStaff: true,
          priority: "normal",
          summary: "Could we get more water?",
          title: "Guest support request"
        })
      } as never,
      {
        classifyOrDefault: () => "normal"
      } as never,
      prisma as never,
      {} as never
    );

    const result = (await service.createGuestMessage("qr_resume_123", {
      conversationId: "conversation_resume_1",
      message: "Could we get more water?",
      sessionId: "ignored_session_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.deepEqual(result.request, supportRequest);
    assert.deepEqual(result.servicePoint, servicePoint);
    assert.equal(calls.some((call) => call.model === "conversation.create"), false);
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_resume_123",
            isActive: true
          }
        }
      },
      {
        model: "$transaction",
        args: "callback"
      },
      {
        model: "conversation.findFirst",
        args: {
          where: {
            id: "conversation_resume_1",
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
            title: "Guest support request",
            category: "general",
            summary: "Could we get more water?",
            priority: RequestPriority.NORMAL,
            deterministicPriority: RequestPriority.NORMAL,
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
            body: "Could we get more water?",
            metadata: {
              source: "public_qr",
              qrToken: "qr_resume_123"
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
            body: "The team has your request.",
            metadata: {
              source: "public_qr",
              triage: {
                category: "general",
                needsStaff: true,
                priority: "normal",
                summary: "Could we get more water?",
                title: "Guest support request"
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
              qrToken: "qr_resume_123"
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

  it("throws NotFoundException when the requested conversation is not scoped to the service point", async () => {
    const servicePoint = {
      id: "sp_missing_conversation",
      venueId: "venue_missing_conversation",
      label: "Counter 2",
      qrToken: "qr_missing_conversation_123",
      isActive: true
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      conversation: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "conversation.findFirst", args });
          return null;
        },
        create: async (args: unknown) => {
          calls.push({ model: "conversation.create", args });
          throw new Error("conversation.create should not be called when conversationId is provided");
        }
      },
      supportRequest: {
        create: async (args: unknown) => {
          calls.push({ model: "supportRequest.create", args });
          throw new Error("supportRequest.create should not be called for a missing conversation");
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "message.create", args });
          throw new Error("message.create should not be called for a missing conversation");
        }
      },
      requestEvent: {
        create: async (args: unknown) => {
          calls.push({ model: "requestEvent.create", args });
          throw new Error("requestEvent.create should not be called for a missing conversation");
        }
      }
    };
    const prisma = {
      servicePoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "servicePoint.findFirst", args });
          return servicePoint;
        }
      },
      conversation: tx.conversation,
      supportRequest: tx.supportRequest,
      message: tx.message,
      requestEvent: tx.requestEvent,
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new ServicePointsService(
      {
        createFallback: () => {
          throw new Error("triage should not run for a missing conversation");
        }
      } as never,
      {
        classifyOrDefault: () => {
          throw new Error("priority should not run for a missing conversation");
        }
      } as never,
      prisma as never,
      {} as never
    );

    await assert.rejects(
      service.createGuestMessage("qr_missing_conversation_123", {
        conversationId: "conversation_from_another_place",
        message: "Hello"
      }),
      NotFoundException
    );
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_missing_conversation_123",
            isActive: true
          }
        }
      },
      {
        model: "$transaction",
        args: "callback"
      },
      {
        model: "conversation.findFirst",
        args: {
          where: {
            id: "conversation_from_another_place",
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }
      }
    ]);
  });

  it("rejects through the transaction when a later request write fails", async () => {
    const servicePoint = {
      id: "sp_failed_write",
      venueId: "venue_failed_write",
      label: "Patio 9",
      qrToken: "qr_failed_write_123",
      isActive: true
    };
    const conversation = {
      id: "conversation_failed_write_1",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      guestSessionId: "session_failed_write_123"
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const failure = new Error("request write failed");
    const rootWriteFailure = () => {
      throw new Error("writes must use the transaction delegate");
    };
    const tx = {
      conversation: {
        create: async (args: unknown) => {
          calls.push({ model: "tx.conversation.create", args });
          return conversation;
        }
      },
      supportRequest: {
        create: async (args: unknown) => {
          calls.push({ model: "tx.supportRequest.create", args });
          throw failure;
        }
      },
      message: {
        create: async (args: unknown) => {
          calls.push({ model: "tx.message.create", args });
          return args;
        }
      },
      requestEvent: {
        create: async (args: unknown) => {
          calls.push({ model: "tx.requestEvent.create", args });
          return args;
        }
      }
    };
    const prisma = {
      servicePoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "servicePoint.findFirst", args });
          return servicePoint;
        }
      },
      conversation: {
        create: rootWriteFailure
      },
      supportRequest: {
        create: rootWriteFailure
      },
      message: {
        create: rootWriteFailure
      },
      requestEvent: {
        create: rootWriteFailure
      },
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    };
    const service = new ServicePointsService(
      {
        createFallback: () => ({
          assistantReply: "The team has your request.",
          category: "general",
          needsStaff: true,
          priority: "normal",
          summary: "Could we get more water?",
          title: "Guest support request"
        })
      } as never,
      {
        classifyOrDefault: () => "normal"
      } as never,
      prisma as never,
      {} as never
    );

    await assert.rejects(
      service.createGuestMessage("qr_failed_write_123", {
        message: "Could we get more water?",
        sessionId: "session_failed_write_123"
      }),
      failure
    );
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_failed_write_123",
            isActive: true
          }
        }
      },
      {
        model: "$transaction",
        args: "callback"
      },
      {
        model: "tx.conversation.create",
        args: {
          data: {
            guestSessionId: "session_failed_write_123",
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }
      },
      {
        model: "tx.supportRequest.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
            conversationId: conversation.id,
            title: "Guest support request",
            category: "general",
            summary: "Could we get more water?",
            priority: RequestPriority.NORMAL,
            deterministicPriority: RequestPriority.NORMAL,
            status: RequestStatus.NEW
          }
        }
      }
    ]);
  });

  it("trims whitespace-only DTO messages before validating length", async () => {
    const input = plainToInstance(PublicGuestMessageDto, {
      message: "   "
    });

    const errors = await validate(input);

    assert.equal(input.message, "");
    assert.equal(errors.some((error) => error.property === "message"), true);
  });
});
