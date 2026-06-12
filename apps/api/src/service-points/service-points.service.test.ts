import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { RequestPriority, RequestStatus, SenderType } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { isEncryptedMessageBody } from "../security/message-crypto";
import { PublicGuestMessageDto } from "./dto/public-guest-message.dto";
import { ServicePointsService } from "./service-points.service";

function createService(
  aiTriage: ConstructorParameters<typeof ServicePointsService>[0],
  priorityClassifier: ConstructorParameters<typeof ServicePointsService>[3],
  prisma: ConstructorParameters<typeof ServicePointsService>[4],
  venueAccess: ConstructorParameters<typeof ServicePointsService>[5],
  events?: ConstructorParameters<typeof ServicePointsService>[6],
  queueOverride?: ConstructorParameters<typeof ServicePointsService>[2]
) {
  const triageService =
    aiTriage && typeof (aiTriage as { triage?: unknown }).triage === "function"
      ? aiTriage
      : ({
          ...(aiTriage as object),
          triage: (input: unknown) => (aiTriage as { createFallback?: (input: unknown) => unknown }).createFallback?.(input)
        } as never);
  const cache = {
    get: async () => null,
    set: async () => undefined
  } as never;

  const queue = queueOverride ?? ({ add: async () => ({ id: "mock-job-id" }) } as never);

  return new ServicePointsService(triageService, cache, queue, priorityClassifier, prisma, venueAccess, events);
}

type PublicGuestMessageResult = {
  conversationId: string;
  messages: unknown[];
  replyPending: boolean;
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
      qrPointId: servicePoint.id,
      guestSessionId: "session_public_123"
    };
    const supportRequest = {
      id: "request_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
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
        body: "I have let the team know about your message."
      }
    ];

    const calls: Array<{ model: string; args: unknown }> = [];
    const published: unknown[] = [];
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
    const { qrToken: _1, ...publicServicePoint } = servicePoint;
    const prisma = {
      qrPoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "qrPoint.findFirst", args });
          return servicePoint;
        },
        upsert: async (args: unknown) => {
          calls.push({ model: "qrPoint.upsert", args });
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
    const service = createService(
      {
        createFallback: (args: unknown) => {
          calls.push({ model: "aiTriage.createFallback", args });
          return {
            assistantReply: "I have let the team know about your message.",
            category: "facilities",
            needsStaff: true,
            priority: "high",
            summary: "There is a spill by our table",
            title: "High priority guest request"
          };
        }
      } as never,
      {
        classifyOrDefault: () => "high"
      } as never,
      prisma as never,
      {} as never,
      {
        publish: (event: unknown) => {
          published.push(event);
        }
      } as never
    );

    const result = (await service.createGuestMessage("qr_public_123", {
      message: "There is a spill by our table",
      sessionId: "session_public_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.deepEqual(result.request, supportRequest);
    assert.deepEqual(result.servicePoint, publicServicePoint);
    assert.deepEqual(
      published.map((event) => ({ ...(event as any), occurredAt: "Any<Date>" })),
      [
        {
          type: "request.created",
          venueId: supportRequest.venueId,
          requestId: supportRequest.id,
          conversationId: supportRequest.conversationId,
          occurredAt: "Any<Date>"
        },
        {
          type: "message.created",
          venueId: servicePoint.venueId,
          requestId: supportRequest.id,
          conversationId: conversation.id,
          messageId: "message_guest_1",
          occurredAt: "Any<Date>"
        }
      ]
    );
    assert.equal(calls.some((call) => call.model === "supportRequest.create"), true);
    const createRequestCall = calls.find((call) => call.model === "supportRequest.create") as { args: { data: Record<string, unknown> } };
    assert.equal(createRequestCall.args.data.assignedToId, undefined);
    assert.equal(createRequestCall.args.data.agentSuggestedAction, "Route to operations queue: venue facilities support.");
    const createEventCall = calls.find((call) => call.model === "requestEvent.create") as { args: { data: { metadata: unknown } } };
    assert.deepEqual((createEventCall.args.data.metadata as Record<string, unknown>).assignmentRouting, {
      queue: "operations",
      reason: "venue facilities support",
      requiresHumanAssignment: true
    });
    assert.deepEqual(
      calls
        .filter((call) => call.model === "message.create")
        .map((call) => (call.args as { data: { sender: SenderType; body: string; requestId: string } }).data),
      [
        {
          venueId: servicePoint.venueId,
          qrPointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          body: "There is a spill by our table",
          metadata: {
            source: "public_qr",
            qrToken: "qr_public_123"
          }
        },
        {
          venueId: servicePoint.venueId,
          qrPointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.ASSISTANT,
          body: "Of course, I have let the team know for Patio 4.",
          metadata: {
            source: "public_qr",
            qrToken: "qr_public_123",
            intent: "request_acknowledgement"
          }
        }
      ]
    );
  });

  it("stores encrypted message bodies and returns decrypted conversation messages", async () => {
    const previousKey = process.env.MESSAGE_ENCRYPTION_KEY;
    process.env.MESSAGE_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString("base64");

    try {
      const servicePoint = {
        id: "sp_encrypted",
        venueId: "venue_encrypted",
        label: "Terrace 7",
        qrToken: "qr_encrypted_123",
        isActive: true
      };
      const conversation = {
        id: "conversation_encrypted_1",
        venueId: servicePoint.venueId,
        qrPointId: servicePoint.id,
        guestSessionId: "session_encrypted_123"
      };
      const supportRequest = {
        id: "request_encrypted_1",
        venueId: servicePoint.venueId,
        qrPointId: servicePoint.id,
        conversationId: conversation.id,
        title: "Guest needs water",
        category: "service",
        summary: "Please bring water",
        priority: RequestPriority.NORMAL,
        deterministicPriority: RequestPriority.NORMAL,
        status: RequestStatus.NEW
      };
      const createdMessages: any[] = [];
      const tx = {
        conversation: {
          create: async () => conversation
        },
        supportRequest: {
          create: async () => supportRequest
        },
        message: {
          create: async (args: any) => {
            createdMessages.push({
              id: `message_${createdMessages.length + 1}`,
              ...args.data
            });
            return createdMessages.at(-1);
          },
          findMany: async () => createdMessages
        },
        requestEvent: {
          create: async () => ({})
        }
      };
      const prisma = {
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      };
      const service = createService(
        {
          createFallback: () => ({
            assistantReply: "I have let the team know about your message.",
            category: "service",
            needsStaff: true,
            priority: "normal",
            summary: "Please bring water",
            title: "Guest needs water"
          })
        } as never,
        {
          classifyOrDefault: () => "normal"
        } as never,
        prisma as never,
        {} as never
      );

      const result = (await service.createGuestMessage("qr_encrypted_123", {
        message: "Please bring water",
        sessionId: "session_encrypted_123"
      })) as unknown as PublicGuestMessageResult;

      assert.equal(createdMessages.every((message) => isEncryptedMessageBody(message.body)), true);
      assert.equal(createdMessages.some((message) => message.body.includes("Please bring water")), false);
      assert.deepEqual(
        result.messages.map((message: any) => message.body),
        ["Please bring water", "Of course, I have let the team know for Terrace 7."]
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.MESSAGE_ENCRYPTION_KEY;
      } else {
        process.env.MESSAGE_ENCRYPTION_KEY = previousKey;
      }
    }
  });

  it("handles simple greetings without creating a support request", async () => {
    const servicePoint = {
      id: "sp_greeting",
      venueId: "venue_greeting",
      label: "Table 2",
      qrToken: "qr_greeting_123",
      isActive: true
    };
    const conversation = {
      id: "conversation_greeting_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      guestSessionId: "session_greeting_123"
    };
    const storedMessages = [
      {
        id: "message_guest_1",
        conversationId: conversation.id,
        sender: SenderType.GUEST,
        body: "hello"
      },
      {
        id: "message_assistant_1",
        conversationId: conversation.id,
        sender: SenderType.ASSISTANT,
        body: "Hello. If you'd like help at Table 2, just send your request and the team will respond."
      }
    ];

    const { qrToken: _1, ...publicServicePoint } = servicePoint;
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      conversation: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "conversation.findFirst", args });
          return null;
        },
        create: async (args: unknown) => {
          calls.push({ model: "conversation.create", args });
          return conversation;
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
      }
    };
    const prisma = {
      qrPoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "qrPoint.findFirst", args });
          return servicePoint;
        },
        upsert: async (args: unknown) => {
          calls.push({ model: "qrPoint.upsert", args });
          return servicePoint;
        }
      },
      conversation: tx.conversation,
      message: tx.message,
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ model: "$transaction", args: "callback" });
        return callback(tx);
      }
    } as never;
    const service = createService(
      {} as never,
      {} as never,
      prisma,
      {} as never
    );

    const result = (await service.createGuestMessage("qr_greeting_123", {
      message: "hello",
      sessionId: "session_greeting_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.equal(result.request, null);
    assert.deepEqual(result.servicePoint, publicServicePoint);
    assert.deepEqual(calls, [
      {
        model: "qrPoint.findFirst",
        args: {
          where: {
            qrToken: "qr_greeting_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                hours: {
                  orderBy: {
                    dayOfWeek: "asc"
                  }
                }
              }
            }
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
            guestSessionId: "session_greeting_123",
            qrPointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            qrPointId: servicePoint.id,
            conversationId: conversation.id,
            sender: SenderType.GUEST,
            body: "hello",
            metadata: {
              source: "public_qr",
              qrToken: "qr_greeting_123"
            }
          }
        }
      },
      {
        model: "message.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            qrPointId: servicePoint.id,
            conversationId: conversation.id,
            sender: SenderType.ASSISTANT,
            body: "Hello. If you'd like help at Table 2, just send your request and the team will respond.",
            metadata: {
              source: "public_qr",
              intent: "non_request"
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
      qrPointId: servicePoint.id,
      guestSessionId: "session_existing_123"
    };
    const supportRequest = {
      id: "request_resume_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
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

    const { qrToken: _1, ...publicServicePoint } = servicePoint;
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
      qrPoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "qrPoint.findFirst", args });
          return servicePoint;
        },
        upsert: async (args: unknown) => {
          calls.push({ model: "qrPoint.upsert", args });
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
    const service = createService(
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
      sessionId: "session_existing_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.deepEqual(result.request, supportRequest);
    assert.deepEqual(result.servicePoint, publicServicePoint);
    assert.equal(calls.some((call) => call.model === "conversation.create"), false);
    assert.equal(calls.some((call) => call.model === "supportRequest.create"), true);
    assert.deepEqual(
      calls
        .filter((call) => call.model === "message.create")
        .map((call) => (call.args as { data: unknown }).data),
      [
        {
          venueId: servicePoint.venueId,
          qrPointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.GUEST,
          body: "Could we get more water?",
          metadata: {
            source: "public_qr",
            qrToken: "qr_resume_123"
          }
        },
        {
          venueId: servicePoint.venueId,
          qrPointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: supportRequest.id,
          sender: SenderType.ASSISTANT,
          body: "Of course, I have let the team know for Booth 12.",
          metadata: {
            source: "public_qr",
            qrToken: "qr_resume_123",
            intent: "request_acknowledgement"
          }
        }
      ]
    );
  });

  it("creates a new request for actionable follow-up text while another request is open", async () => {
    const servicePoint = {
      id: "sp_followup",
      venueId: "venue_followup",
      label: "Table 2",
      qrToken: "qr_followup_123",
      isActive: true
    };
    const supportRequest = {
      id: "request_followup_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: "conversation_followup_1",
      title: "Guest support request",
      category: "general",
      summary: "Could we get more water?",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const newSupportRequest = {
      ...supportRequest,
      id: "request_followup_2",
      summary: "Could we get more water?"
    };
    const conversation = {
      id: "conversation_followup_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      guestSessionId: "session_followup_123",
      requests: [supportRequest]
    };
    const storedMessages = [
      {
        id: "message_followup_guest_1",
        conversationId: conversation.id,
        requestId: newSupportRequest.id,
        sender: SenderType.GUEST,
        body: "Could we get more water?"
      },
      {
        id: "message_followup_assistant_1",
        conversationId: conversation.id,
        requestId: newSupportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Of course, I have let the team know for Table 2."
      }
    ];

    const { qrToken: _1, ...publicServicePoint } = servicePoint;
    const calls: Array<{ model: string; args: unknown }> = [];
    const tx = {
      conversation: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "conversation.findFirst", args });
          return conversation;
        }
      },
      supportRequest: {
        create: async (args: unknown) => {
          calls.push({ model: "supportRequest.create", args });
          return newSupportRequest;
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
      qrPoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "qrPoint.findFirst", args });
          return servicePoint;
        },
        upsert: async (args: unknown) => {
          calls.push({ model: "qrPoint.upsert", args });
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
    const service = createService(
      {
        createFallback: () => ({
          assistantReply: "Got it, I added that to your open request so the team has the full picture.",
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

    const result = (await service.createGuestMessage("qr_followup_123", {
      conversationId: conversation.id,
      message: "Could we get more water?",
      sessionId: "session_followup_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.deepEqual(result.request, newSupportRequest);
    assert.deepEqual(result.servicePoint, publicServicePoint);
    const createCall = calls.find((call) => call.model === "supportRequest.create") as { args: { data: { summary: string } } };
    assert.equal(createCall.args.data.summary, "Could we get more water?");
    assert.deepEqual(
      calls
        .filter((call) => call.model === "message.create")
        .map((call) => (call.args as { data: unknown }).data),
      [
        {
          venueId: servicePoint.venueId,
          qrPointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: newSupportRequest.id,
          sender: SenderType.GUEST,
          body: "Could we get more water?",
          metadata: {
            source: "public_qr",
            qrToken: "qr_followup_123"
          }
        },
        {
          venueId: servicePoint.venueId,
          qrPointId: servicePoint.id,
          conversationId: conversation.id,
          requestId: newSupportRequest.id,
          sender: SenderType.ASSISTANT,
          body: "Of course, I have let the team know for Table 2.",
          metadata: {
            source: "public_qr",
            qrToken: "qr_followup_123",
            intent: "request_acknowledgement"
          }
        }
      ]
    );
  });

  it("creates a new public QR request after the previous request is resolved", async () => {
    const servicePoint = {
      id: "sp_resolved_followup",
      venueId: "venue_resolved_followup",
      label: "Table 7",
      qrToken: "qr_resolved_followup_123",
      isActive: true
    };
    const resolvedRequest = {
      id: "request_resolved_old",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: "conversation_resolved_followup_1",
      status: RequestStatus.RESOLVED
    };
    const newRequest = {
      id: "request_resolved_new",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: "conversation_resolved_followup_1",
      title: "Guest support request",
      category: "general",
      summary: "Could we get some ice?",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const conversation = {
      id: "conversation_resolved_followup_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      requests: [resolvedRequest]
    };
    let createCount = 0;
    const tx = {
      conversation: {
        findFirst: async () => conversation
      },
      supportRequest: {
        create: async () => {
          createCount += 1;
          return newRequest;
        }
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => []
      },
      requestEvent: {
        create: async (args: unknown) => args
      }
    };
    const service = createService(
      {
        createFallback: () => ({
          assistantReply: "Of course, I have let the team know.",
          category: "general",
          needsStaff: true,
          priority: "normal",
          summary: "Could we get some ice?",
          title: "Guest support request"
        })
      } as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        conversation: {
          findFirst: async () => conversation
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createGuestMessage("qr_resolved_followup_123", {
      conversationId: conversation.id,
      message: "Could we get some ice?"
    });

    assert.equal(createCount, 1);
    assert.deepEqual((result as any).request, newRequest);
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
      qrPoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "qrPoint.findFirst", args });
          return servicePoint;
        },
        upsert: async (args: unknown) => {
          calls.push({ model: "qrPoint.upsert", args });
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
    const service = createService(
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
        model: "qrPoint.findFirst",
        args: {
          where: {
            qrToken: "qr_missing_conversation_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                hours: {
                  orderBy: {
                    dayOfWeek: "asc"
                  }
                }
              }
            }
          }
        }
      },
      {
        model: "conversation.findFirst",
        args: {
          where: {
            id: "conversation_from_another_place",
            qrPointId: servicePoint.id,
            venueId: servicePoint.venueId
          },
          include: {
            requests: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        }
      }
    ]);
  });

  it("loads public QR conversation state scoped to the active service point", async () => {
    const servicePoint = {
      id: "sp_public_state",
      venueId: "venue_public_state",
      label: "Cabana 8",
      qrToken: "qr_public_state_123",
      isActive: true
    };
    const messages = [
      {
        id: "message_public_state_1",
        conversationId: "conversation_public_state_1",
        sender: SenderType.GUEST,
        body: "Can we get towels?"
      }
    ];
    const request = {
      id: "request_public_state_1",
      conversationId: "conversation_public_state_1",
      title: "Guest support request",
      status: RequestStatus.NEW,
      qrPoint: servicePoint
    };
    const conversation = {
      id: "conversation_public_state_1",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      messages,
      requests: [request]
    };
    const { qrToken: _1, ...publicServicePoint } = servicePoint;
    const calls: Array<{ model: string; args: unknown }> = [];
    const service = createService(
      {} as never,
      {} as never,
      {
        qrPoint: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "qrPoint.findFirst", args });
            return servicePoint;
          },
          upsert: async (args: unknown) => {
            calls.push({ model: "qrPoint.upsert", args });
            return servicePoint;
          }
        },
        conversation: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "conversation.findFirst", args });
            return conversation;
          }
        }
      } as never,
      {} as never
    );

    const result = await service.getGuestConversation("qr_public_state_123", "conversation_public_state_1");

    assert.deepEqual(result, {
      chatAvailability: {
        isOpen: true,
        reason: "hours_not_configured"
      },
      conversationId: conversation.id,
      messages,
      replyPending: true,
      request,
      servicePoint: publicServicePoint
    });
    assert.deepEqual(calls, [
      {
        model: "qrPoint.findFirst",
        args: {
          where: {
            qrToken: "qr_public_state_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                hours: {
                  orderBy: {
                    dayOfWeek: "asc"
                  }
                }
              }
            }
          }
        }
      },
      {
        model: "conversation.findFirst",
        args: {
          where: {
            id: "conversation_public_state_1",
            qrPointId: servicePoint.id,
            venueId: servicePoint.venueId
          },
          include: {
            messages: {
              select: {
                id: true,
                venueId: true,
                qrPointId: true,
                conversationId: true,
                requestId: true,
                sender: true,
                body: true,
                metadata: true,
                createdAt: true
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 50
            },
            requests: {
              include: {
                assignedTo: true,
                qrPoint: true
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
          }
        }
      }
    ]);
  });

  it("rejects public QR conversation reads after the conversation is closed", async () => {
    const servicePoint = {
      id: "sp_public_closed",
      venueId: "venue_public_closed",
      label: "Cabana 9",
      qrToken: "qr_public_closed_123",
      isActive: true
    };
    const service = createService(
      {} as never,
      {} as never,
      {
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        conversation: {
          findFirst: async () => ({
            id: "conversation_public_closed_1",
            venueId: servicePoint.venueId,
            qrPointId: servicePoint.id,
            status: "closed",
            closedAt: new Date("2026-06-01T10:00:00.000Z"),
            updatedAt: new Date(),
            messages: [],
            requests: []
          })
        }
      } as never,
      {} as never
    );

    await assert.rejects(
      service.getGuestConversation("qr_public_closed_123", "conversation_public_closed_1"),
      NotFoundException
    );
  });

  it("rejects public QR conversation reads after the guest session TTL expires", async () => {
    const previousTtl = process.env.PUBLIC_GUEST_SESSION_TTL_MINUTES;
    process.env.PUBLIC_GUEST_SESSION_TTL_MINUTES = "30";

    try {
      const servicePoint = {
        id: "sp_public_expired",
        venueId: "venue_public_expired",
        label: "Cabana 10",
        qrToken: "qr_public_expired_123",
        isActive: true
      };
      const service = createService(
        {} as never,
        {} as never,
        {
          qrPoint: {
            findFirst: async () => servicePoint,
            upsert: async () => servicePoint
          },
          conversation: {
            findFirst: async () => ({
              id: "conversation_public_expired_1",
              venueId: servicePoint.venueId,
              qrPointId: servicePoint.id,
              status: "open",
              closedAt: null,
              updatedAt: new Date(Date.now() - 31 * 60 * 1000),
              messages: [],
              requests: []
            })
          }
        } as never,
        {} as never
      );

      await assert.rejects(
        service.getGuestConversation("qr_public_expired_123", "conversation_public_expired_1"),
        NotFoundException
      );
    } finally {
      if (previousTtl === undefined) {
        delete process.env.PUBLIC_GUEST_SESSION_TTL_MINUTES;
      } else {
        process.env.PUBLIC_GUEST_SESSION_TTL_MINUTES = previousTtl;
      }
    }
  });

  it("loads public venue QR conversation state scoped to the venue support service point", async () => {
    const venue = { id: "venue_venue_state", slug: "blue-note", name: "Blue Note" };
    const servicePoint = {
      id: "sp_venue_support",
      venueId: venue.id,
      label: "Venue support",
      qrToken: "venue_support_blue-note",
      isActive: true
    };
    const messages = [
      {
        id: "message_venue_state_1",
        conversationId: "conversation_venue_state_1",
        sender: SenderType.SYSTEM,
        body: "The team is working on this now."
      }
    ];
    const request = {
      id: "request_venue_state_1",
      conversationId: "conversation_venue_state_1",
      title: "Guest support request",
      status: RequestStatus.IN_PROGRESS,
      qrPoint: servicePoint
    };
    const conversation = {
      id: "conversation_venue_state_1",
      venueId: venue.id,
      qrPointId: servicePoint.id,
      messages,
      requests: [request]
    };
    const { qrToken: _1, ...publicServicePoint } = servicePoint;
    const calls: Array<{ model: string; args: unknown }> = [];
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "venue.findFirst", args });
            return venue;
          }
        },
        qrPoint: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "qrPoint.findFirst", args });
            return servicePoint;
          },
          upsert: async (args: unknown) => {
            calls.push({ model: "qrPoint.upsert", args });
            return servicePoint;
          }
        },
        conversation: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "conversation.findFirst", args });
            return conversation;
          }
        }
      } as never,
      {} as never
    );

    const result = await service.getVenueGuestConversation("blue-note", "conversation_venue_state_1");

    assert.deepEqual(result, {
      chatAvailability: {
        isOpen: true,
        reason: "hours_not_configured"
      },
      conversationId: conversation.id,
      messages,
      replyPending: false,
      request,
      servicePoint: publicServicePoint,
      venue: { id: venue.id, name: venue.name, slug: venue.slug }
    });
    assert.deepEqual(calls, [
      {
        model: "venue.findFirst",
        args: {
          where: { slug: "blue-note" },
          include: {
            hours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      },
      {
        model: "qrPoint.upsert",
        args: {
          where: {
            venueId_label: {
              venueId: venue.id,
              label: "Venue support"
            }
          },
          create: {
            venueId: venue.id,
            label: "Venue support",
            qrToken: "venue_support_blue-note"
          },
          update: {}
        }
      },
      {
        model: "conversation.findFirst",
        args: {
          where: {
            id: "conversation_venue_state_1",
            qrPointId: servicePoint.id,
            venueId: venue.id
          },
          include: {
            messages: {
              select: {
                id: true,
                venueId: true,
                qrPointId: true,
                conversationId: true,
                requestId: true,
                sender: true,
                body: true,
                metadata: true,
                createdAt: true
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 50
            },
            requests: {
              include: {
                assignedTo: true,
                qrPoint: true
              },
              orderBy: {
                createdAt: "desc"
              },
              take: 1
            }
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
      qrPointId: servicePoint.id,
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
      qrPoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "qrPoint.findFirst", args });
          return servicePoint;
        },
        upsert: async (args: unknown) => {
          calls.push({ model: "qrPoint.upsert", args });
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
    const service = createService(
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
        model: "qrPoint.findFirst",
        args: {
          where: {
            qrToken: "qr_failed_write_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                hours: {
                  orderBy: {
                    dayOfWeek: "asc"
                  }
                }
              }
            }
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
            qrPointId: servicePoint.id,
            venueId: servicePoint.venueId
          }
        }
      },
      {
        model: "tx.supportRequest.create",
        args: {
          data: {
            venueId: servicePoint.venueId,
            qrPointId: servicePoint.id,
            conversationId: conversation.id,
            title: "Guest support request",
            category: "general",
            summary: "Could we get more water?",
            priority: RequestPriority.NORMAL,
            deterministicPriority: RequestPriority.NORMAL,
            status: RequestStatus.NEW,
            agentSuggestedAction: "Route to operations queue: venue facilities support.",
            agentPolicyVersion: "v1-backend-routing"
          }
        }
      }
    ]);
  });

  it("creates a venue QR conversation with guest location and semi-autonomous metadata", async () => {
    const venue = { id: "venue_1", slug: "blue-note", organizationId: "workspace_1", name: "Blue Note" };
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
      qrPointId: servicePoint.id,
      guestLocationLabel: "Table 14",
      guestLocationSource: "guest"
    };
    const supportRequest = {
      id: "request_venue_1",
      venueId: venue.id,
      qrPointId: servicePoint.id,
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
      { id: "message_guest", conversationId: conversation.id, requestId: supportRequest.id, sender: SenderType.GUEST, body: "My drinks never came" },
      {
        id: "message_agent",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Sorry about that. I have sent this to the team for Table 14."
      }
    ];
    const published: unknown[] = [];
    const tx = {
      conversation: {
        create: async () => conversation
      },
      supportRequest: {
        create: async () => supportRequest
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: {
        create: async (args: unknown) => args
      }
    };
    const prisma = {
        venue: { findFirst: async () => venue },
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
    };
    const service = createService(
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
      {} as never,
      {
        publish: (event: unknown) => {
          published.push(event);
        }
      } as never
    );

    const result = await service.createVenueGuestMessage("blue-note", {
      message: "My drinks never came",
      locationLabel: "Table 14",
      sessionId: "session_venue_123"
    });

    assert.equal((result as any).conversationId, conversation.id);
    assert.deepEqual((result as any).messages, storedMessages);
    assert.deepEqual((result as any).request, supportRequest);
    assert.deepEqual(
      published.map((event) => ({ ...(event as any), occurredAt: "Any<Date>" })),
      [
        {
          type: "request.created",
          venueId: supportRequest.venueId,
          requestId: supportRequest.id,
          conversationId: supportRequest.conversationId,
          occurredAt: "Any<Date>"
        },
        {
          type: "message.created",
          venueId: supportRequest.venueId,
          requestId: supportRequest.id,
          conversationId: supportRequest.conversationId,
          messageId: "message_guest",
          occurredAt: "Any<Date>"
        }
      ]
    );
  });

  it("keeps venue QR replies pending when a status message is newer than the latest guest message", async () => {
    const venue = { id: "venue_pending_reply", slug: "blue-note", organizationId: "workspace_1", name: "Blue Note" };
    const servicePoint = {
      id: "sp_pending_reply",
      venueId: venue.id,
      label: "Venue support",
      qrToken: "venue_support_blue_note",
      isActive: true,
      venue
    };
    const conversation = {
      id: "conversation_pending_reply",
      venueId: venue.id,
      qrPointId: servicePoint.id,
      guestSessionId: "session_pending_reply",
      status: "open",
      updatedAt: new Date()
    };
    const request = {
      id: "request_pending_reply",
      venueId: venue.id,
      qrPointId: servicePoint.id,
      conversationId: conversation.id,
      status: RequestStatus.IN_PROGRESS
    };
    const messages = [
      {
        id: "message_status",
        conversationId: conversation.id,
        sender: SenderType.SYSTEM,
        body: "The team is working on this now.",
        createdAt: new Date("2026-06-02T10:00:03.000Z")
      },
      {
        id: "message_guest",
        conversationId: conversation.id,
        sender: SenderType.GUEST,
        body: "Can you add napkins too?",
        createdAt: new Date("2026-06-02T10:00:02.000Z")
      },
      {
        id: "message_assistant_old",
        conversationId: conversation.id,
        sender: SenderType.ASSISTANT,
        body: "Of course.",
        createdAt: new Date("2026-06-02T10:00:01.000Z")
      }
    ];
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: { findFirst: async () => venue },
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        conversation: {
          findFirst: async () => ({
            ...conversation,
            messages,
            requests: [request]
          })
        }
      } as never,
      {} as never
    );

    const result = await service.getVenueGuestConversation("blue-note", conversation.id, "session_pending_reply");

    assert.equal((result as any).replyPending, true);
  });

  it("asks venue QR guests for a location before creating a staff request", async () => {
    const venue = { id: "venue_location_prompt", slug: "blue-note", organizationId: "workspace_1", name: "Blue Note" };
    const servicePoint = {
      id: "sp_venue_location_prompt",
      venueId: venue.id,
      label: "Venue support",
      qrToken: "venue_support_blue_note",
      isActive: true
    };
    const conversation = {
      id: "conversation_location_prompt",
      venueId: venue.id,
      qrPointId: servicePoint.id
    };
    const storedMessages = [
      { id: "message_guest", conversationId: conversation.id, sender: SenderType.GUEST, body: "Can we get more napkins?" },
      {
        id: "message_assistant",
        conversationId: conversation.id,
        sender: SenderType.ASSISTANT,
        body: "Where are you in Blue Note? Please send a table number, bar area, VIP booth, or nearby landmark so the team can find you."
      }
    ];
    const tx = {
      conversation: {
        create: async () => conversation
      },
      supportRequest: {
        create: async () => {
          throw new Error("supportRequest.create should wait until the guest provides a location");
        }
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: {
        create: async () => {
          throw new Error("requestEvent.create should wait until a request exists");
        }
      }
    };
    const service = createService(
      {
        createFallback: () => ({
          assistantReply: "I have let the team know.",
          category: "general",
          needsStaff: true,
          priority: "normal",
          summary: "Can we get more napkins?",
          title: "Guest support request"
        })
      } as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        venue: { findFirst: async () => venue },
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createVenueGuestMessage("blue-note", {
      message: "Can we get more napkins?",
      sessionId: "session_location_prompt"
    });

    assert.equal((result as any).request, null);
    assert.deepEqual((result as any).messages, storedMessages);
    assert.deepEqual((result as any).venue, { id: venue.id, name: venue.name, slug: venue.slug });
  });

  it("does not create a venue QR staff request for greetings or informational questions", async () => {
    const venue = { id: "venue_non_request", slug: "blue-note", organizationId: "workspace_1", name: "Blue Note" };
    const servicePoint = {
      id: "sp_venue_non_request",
      venueId: venue.id,
      label: "Venue support",
      qrToken: "venue_support_blue_note",
      isActive: true
    };
    const conversation = {
      id: "conversation_non_request",
      venueId: venue.id,
      qrPointId: servicePoint.id
    };
    const storedMessages = [
      { id: "message_guest", conversationId: conversation.id, sender: SenderType.GUEST, body: "hello" },
      {
        id: "message_assistant",
        conversationId: conversation.id,
        sender: SenderType.ASSISTANT,
        body: "Hello. I am Lily for Blue Note. Ask me for help when you need the team."
      }
    ];
    let requestCreated = false;
    const tx = {
      conversation: {
        create: async () => conversation
      },
      supportRequest: {
        create: async () => {
          requestCreated = true;
          throw new Error("supportRequest.create should not run for non-request intent");
        }
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: {
        create: async () => {
          throw new Error("requestEvent.create should wait until a staff request exists");
        }
      }
    };
    const service = createService(
      {
        createFallback: () => {
          throw new Error("triage should not run for deterministic non-request intent");
        }
      } as never,
      {
        classifyOrDefault: () => {
          throw new Error("priority should not run for deterministic non-request intent");
        }
      } as never,
      {
        venue: { findFirst: async () => venue },
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createVenueGuestMessage("blue-note", {
      message: "hello",
      sessionId: "session_non_request"
    });

    assert.equal(requestCreated, false);
    assert.equal((result as any).request, null);
    assert.deepEqual((result as any).messages, storedMessages);
  });

  it("routes restroom issue wording to operations instead of venue information", async () => {
    const servicePoint = {
      id: "sp_restroom_issue",
      venueId: "venue_restroom_issue",
      label: "Table 2",
      qrToken: "qr_restroom_issue",
      isActive: true,
      venue: { id: "venue_restroom_issue", name: "Cipher", hours: [] }
    };
    const conversation = {
      id: "conversation_restroom_issue",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      guestSessionId: "session_restroom_issue"
    };
    const supportRequest = {
      id: "request_restroom_issue",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: conversation.id,
      title: "Guest support request",
      category: "general",
      summary: "There is a toilet or restroom issue.",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      { id: "message_guest", conversationId: conversation.id, requestId: supportRequest.id, sender: SenderType.GUEST, body: "There is a toilet or restroom issue." },
      {
        id: "message_assistant",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Of course, I have let the team know for Table 2."
      }
    ];
    let requestCreated = false;
    const tx = {
      conversation: { create: async () => conversation },
      supportRequest: {
        create: async () => {
          requestCreated = true;
          return supportRequest;
        }
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: { create: async () => ({}) }
    };
    const service = createService(
      {
        createFallback: () => {
          throw new Error("synchronous request acknowledgement should not need fallback triage");
        }
      } as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        qrPoint: { findFirst: async () => servicePoint, upsert: async () => servicePoint },
        conversation: { findFirst: async () => null },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createGuestMessage("qr_restroom_issue", {
      message: "There is a toilet or restroom issue.",
      sessionId: "session_restroom_issue"
    });

    assert.equal(requestCreated, true);
    assert.deepEqual((result as any).request, supportRequest);
  });

  it("does not append a duplicate fallback reply when service-point triage enqueue fails", async () => {
    const servicePoint = {
      id: "sp_queue_down",
      venueId: "venue_queue_down",
      label: "Table 2",
      qrToken: "qr_queue_down",
      isActive: true,
      venue: { id: "venue_queue_down", name: "Cipher", hours: [] }
    };
    const conversation = {
      id: "conversation_queue_down",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      guestSessionId: "session_queue_down"
    };
    const supportRequest = {
      id: "request_queue_down",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: conversation.id,
      title: "Guest support request",
      category: "general",
      summary: "There is a toilet or restroom issue.",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      {
        id: "message_guest_queue_down",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.GUEST,
        body: "There is a toilet or restroom issue."
      },
      {
        id: "message_assistant_queue_down",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Of course, I have let the team know for Table 2."
      }
    ];
    const tx = {
      conversation: { create: async () => conversation },
      supportRequest: { create: async () => supportRequest },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: { create: async () => ({}) }
    };
    let fallbackCalled = false;
    const service = createService(
      {
        createFallback: () => {
          fallbackCalled = true;
          throw new Error("fallback triage is unavailable");
        }
      } as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        qrPoint: { findFirst: async () => servicePoint, upsert: async () => servicePoint },
        conversation: { findFirst: async () => null },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
        message: {
          create: async () => {
            throw new Error("silent metadata fallback must not write a visible assistant message");
          }
        }
      } as never,
      {} as never,
      undefined,
      {
        add: async () => {
          throw new Error("Background jobs are unavailable");
        }
      } as never
    );

    const result = await service.createGuestMessage("qr_queue_down", {
      message: "There is a toilet or restroom issue.",
      sessionId: "session_queue_down"
    });

    assert.deepEqual((result as any).messages, storedMessages);
    assert.equal((result as any).messages.filter((message: { sender: SenderType }) => message.sender === SenderType.ASSISTANT).length, 1);
    assert.equal(fallbackCalled, false);
  });

  it("keeps ambiguous chatter open-request-aware instead of sending a fresh greeting", async () => {
    const servicePoint = {
      id: "sp_open_request_chat",
      venueId: "venue_open_request_chat",
      label: "Table 2",
      qrToken: "qr_open_request_chat",
      isActive: true,
      venue: { id: "venue_open_request_chat", name: "Cipher", hours: [] }
    };
    const supportRequest = {
      id: "request_open_request_chat",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: "conversation_open_request_chat",
      title: "Guest support request",
      category: "general",
      summary: "I asked for a tissue",
      priority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const conversation = {
      id: "conversation_open_request_chat",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      guestSessionId: "session_open_request_chat",
      requests: [supportRequest]
    };
    const createdMessages: Array<{ data: { sender: SenderType; body: string; metadata: Record<string, unknown> } }> = [];
    const tx = {
      message: {
        create: async (args: { data: { sender: SenderType; body: string; metadata: Record<string, unknown> } }) => {
          createdMessages.push(args);
          return args;
        },
        findMany: async () => createdMessages.map((message, index) => ({ id: `message_${index}`, conversationId: conversation.id, ...message.data }))
      }
    };
    const service = createService(
      {} as never,
      {
        classifyOrDefault: () => {
          throw new Error("conversation chatter should not create a new request");
        }
      } as never,
      {
        qrPoint: { findFirst: async () => servicePoint, upsert: async () => servicePoint },
        conversation: { findFirst: async () => conversation },
        supportRequest: {
          create: async () => {
            throw new Error("supportRequest.create should not run for conversation chatter");
          }
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createGuestMessage("qr_open_request_chat", {
      conversationId: conversation.id,
      message: "And so",
      sessionId: "session_open_request_chat"
    });

    assert.equal((result as any).request, supportRequest);
    assert.equal(createdMessages.at(-1)?.data.body, "I am keeping this with your open request. If you need anything else, send it here and the team will see it.");
  });

  it("rejects public QR conversation writes from a different guest session", async () => {
    const servicePoint = {
      id: "sp_session_guard",
      venueId: "venue_session_guard",
      label: "Table 5",
      qrToken: "qr_session_guard",
      isActive: true,
      venue: { id: "venue_session_guard", name: "Cipher", hours: [] }
    };
    const service = createService(
      {} as never,
      {} as never,
      {
        qrPoint: { findFirst: async () => servicePoint, upsert: async () => servicePoint },
        conversation: {
          findFirst: async () => ({
            id: "conversation_session_guard",
            venueId: servicePoint.venueId,
            qrPointId: servicePoint.id,
            guestSessionId: "session_original",
            requests: []
          })
        },
        $transaction: async () => {
          throw new Error("transaction should not run for a mismatched session");
        }
      } as never,
      {} as never
    );

    await assert.rejects(
      service.createGuestMessage("qr_session_guard", {
        conversationId: "conversation_session_guard",
        message: "I should not be able to write here",
        sessionId: "session_other_browser"
      }),
      ForbiddenException
    );
  });

  it("routes service-point QR menu questions to operations instead of answering as venue info", async () => {
    const servicePoint = {
      id: "sp_menu_request",
      venueId: "venue_menu_request",
      label: "Table 8",
      qrToken: "qr_menu_request",
      isActive: true,
      venue: { id: "venue_menu_request", name: "Blue Note", hours: [] }
    };
    const conversation = {
      id: "conversation_menu_request",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id
    };
    const supportRequest = {
      id: "request_menu_request",
      venueId: servicePoint.venueId,
      qrPointId: servicePoint.id,
      conversationId: conversation.id,
      title: "Menu request",
      category: "menu",
      summary: "Can I see the menu?",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      { id: "message_guest", conversationId: conversation.id, requestId: supportRequest.id, sender: SenderType.GUEST, body: "Can I see the menu?" },
      {
        id: "message_assistant",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Of course, I have let the team know for Table 8."
      }
    ];
    let requestCreated = false;
    let requestCreateArgs: any;
    const tx = {
      conversation: {
        create: async () => conversation
      },
      supportRequest: {
        create: async (args: unknown) => {
          requestCreated = true;
          requestCreateArgs = args;
          return supportRequest;
        }
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: {
        create: async () => ({})
      }
    };
    const service = createService(
      {
        createFallback: () => {
          throw new Error("synchronous request acknowledgement should not need fallback triage");
        }
      } as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        conversation: {
          findFirst: async () => null
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createGuestMessage("qr_menu_request", {
      message: "Can I see the menu?",
      sessionId: "session_menu_request"
    });

    assert.equal(requestCreated, true);
    assert.equal(requestCreateArgs.data.title, "Menu request");
    assert.equal(requestCreateArgs.data.category, "menu");
    assert.deepEqual((result as any).request, supportRequest);
    assert.equal((result as any).replyPending, false);
  });

  it("routes venue QR menu questions to operations without asking for location first", async () => {
    const venue = { id: "venue_menu_request", slug: "blue-note", organizationId: "workspace_1", name: "Blue Note" };
    const servicePoint = {
      id: "sp_venue_menu_request",
      venueId: venue.id,
      label: "Venue support",
      qrToken: "venue_support_blue_note",
      isActive: true
    };
    const conversation = {
      id: "conversation_venue_menu_request",
      venueId: venue.id,
      qrPointId: servicePoint.id
    };
    const supportRequest = {
      id: "request_venue_menu_request",
      venueId: venue.id,
      qrPointId: servicePoint.id,
      conversationId: conversation.id,
      guestLocationLabel: null,
      guestLocationSource: null,
      title: "Menu request",
      category: "menu",
      summary: "Do you have a food menu?",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      { id: "message_guest", conversationId: conversation.id, requestId: supportRequest.id, sender: SenderType.GUEST, body: "Do you have a food menu?" }
    ];
    let requestCreated = false;
    let requestCreateArgs: any;
    const tx = {
      conversation: {
        create: async () => conversation
      },
      supportRequest: {
        create: async (args: unknown) => {
          requestCreated = true;
          requestCreateArgs = args;
          return supportRequest;
        }
      },
      message: {
        create: async (args: unknown) => args,
        findMany: async () => storedMessages
      },
      requestEvent: {
        create: async () => ({})
      }
    };
    const service = createService(
      {
        createFallback: () => ({
          assistantReply: "I have asked the team to help with the menu.",
          category: "menu",
          needsStaff: true,
          priority: "normal",
          summary: "Guest asked for the food menu.",
          title: "Menu request"
        })
      } as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        venue: { findFirst: async () => venue },
        qrPoint: {
          findFirst: async () => servicePoint,
          upsert: async () => servicePoint
        },
        conversation: {
          findFirst: async () => null
        },
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never
    );

    const result = await service.createVenueGuestMessage("blue-note", {
      message: "Do you have a food menu?",
      sessionId: "session_venue_menu_request"
    });

    assert.equal(requestCreated, true);
    assert.equal(requestCreateArgs.data.title, "Menu request");
    assert.equal(requestCreateArgs.data.category, "menu");
    assert.equal(requestCreateArgs.data.guestLocationLabel, null);
    assert.deepEqual((result as any).request, supportRequest);
    assert.equal((result as any).replyPending, true);
  });

  it("returns closed chat availability when updated venue hours close every day", async () => {
    const closedHours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      closesAt: "17:00",
      dayOfWeek,
      isClosed: true,
      opensAt: "09:00"
    }));
    const venue = {
      id: "venue_closed_hours",
      slug: "blue-note",
      organizationId: "workspace_1",
      name: "Blue Note",
      timezone: "UTC",
      hours: closedHours
    };
    const service = createService(
      {} as never,
      {} as never,
      {
        venue: {
          findFirst: async () => venue
        }
      } as never,
      {} as never
    );

    const result = await service.getVenueIntake("blue-note");

    assert.deepEqual((result as any).chatAvailability, {
      isOpen: false,
      reason: "closed"
    });
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
