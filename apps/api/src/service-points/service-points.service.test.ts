import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
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
  menuService?: ConstructorParameters<typeof ServicePointsService>[7],
  menuAssistant?: ConstructorParameters<typeof ServicePointsService>[8]
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

  const queue = { add: async () => ({ id: "mock-job-id" }) } as never;

  return new ServicePointsService(triageService, cache, queue, priorityClassifier, prisma, venueAccess, events, menuService, menuAssistant);
}

type PublicGuestMessageResult = {
  conversationId: string;
  messages: unknown[];
  replyPending: boolean;
  request: unknown;
  servicePoint: unknown;
};

describe("ServicePointsService public QR workflow", () => {
  it("answers public QR menu questions without creating a support request", async () => {
    const servicePoint = {
      id: "sp_1",
      venueId: "venue_1",
      label: "Patio",
      qrToken: "qr_1",
      isActive: true,
      venue: { id: "venue_1", name: "Blue Note", slug: "blue-note", timezone: "Europe/London", openingHours: [] }
    };
    const conversation = { id: "conversation_1", venueId: "venue_1", servicePointId: "sp_1" };
    const storedMessages = [
      { id: "guest_1", conversationId: "conversation_1", sender: SenderType.GUEST, body: "What vegan mains do you have?", requestId: null },
      { id: "assistant_1", conversationId: "conversation_1", sender: SenderType.ASSISTANT, body: "The Roasted Cauliflower Bowl is vegan.", requestId: null }
    ];
    let requestCreated = false;
    const tx = {
      conversation: { create: async () => conversation },
      message: { create: async () => ({}), findMany: async () => storedMessages }
    };
    const service = createService(
      {} as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        servicePoint: { findFirst: async () => servicePoint },
        conversation: tx.conversation,
        supportRequest: {
          create: async () => {
            requestCreated = true;
          }
        },
        message: tx.message,
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never,
      undefined,
      {
        listAvailableItemsForVenue: async () => [
          {
            id: "item_1",
            name: "Roasted Cauliflower Bowl",
            category: "Mains",
            dietaryTags: ["vegan"],
            allergens: [],
            available: true
          }
        ]
      } as never,
      {
        escalationReason: () => null,
        answer: async () => ({
          handled: true,
          agenticFramework: "menu_concierge",
          matchedItemIds: ["item_1"],
          reply: "The Roasted Cauliflower Bowl is vegan.",
          usedAi: false
        })
      } as never
    );

    const result = await service.createGuestMessage("qr_1", { message: "What vegan mains do you have?", sessionId: "session_1" });

    assert.equal((result as any).replyPending, false);
    assert.equal((result as any).request, null);
    assert.equal(requestCreated, false);
  });

  it("adds menu escalation metadata when public QR menu requests need staff", async () => {
    const servicePoint = {
      id: "sp_menu_escalation",
      venueId: "venue_1",
      label: "Patio",
      qrToken: "qr_menu_escalation",
      isActive: true,
      venue: { id: "venue_1", name: "Blue Note", slug: "blue-note", timezone: "Europe/London", openingHours: [] }
    };
    const conversation = { id: "conversation_menu_escalation", venueId: "venue_1", servicePointId: servicePoint.id };
    const supportRequest = {
      id: "request_menu_escalation",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      conversationId: conversation.id,
      title: "Guest support request",
      category: "general",
      summary: "Can someone confirm if the risotto is safe for my nut allergy?",
      priority: RequestPriority.NORMAL,
      deterministicPriority: RequestPriority.NORMAL,
      status: RequestStatus.NEW
    };
    const storedMessages = [
      {
        id: "message_guest_menu_escalation",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.GUEST,
        body: "Can someone confirm if the risotto is safe for my nut allergy?"
      }
    ];
    const calls: Array<{ model: string; args: any }> = [];
    const tx = {
      conversation: { create: async () => conversation },
      supportRequest: {
        create: async (args: any) => {
          calls.push({ model: "supportRequest.create", args });
          return supportRequest;
        }
      },
      message: {
        create: async (args: any) => {
          calls.push({ model: "message.create", args });
          return args;
        },
        findMany: async () => storedMessages
      },
      requestEvent: {
        create: async (args: any) => {
          calls.push({ model: "requestEvent.create", args });
          return args;
        }
      }
    };
    const service = createService(
      {} as never,
      { classifyOrDefault: () => "normal" } as never,
      {
        servicePoint: { findFirst: async () => servicePoint },
        conversation: tx.conversation,
        supportRequest: tx.supportRequest,
        message: tx.message,
        requestEvent: tx.requestEvent,
        $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
      } as never,
      {} as never,
      undefined,
      { listAvailableItemsForVenue: async () => [] } as never,
      { escalationReason: () => "allergen_confirmation", answer: async () => ({ handled: false, reason: "not_menu_request" }) } as never
    );

    const result = await service.createGuestMessage("qr_menu_escalation", {
      message: "Can someone confirm if the risotto is safe for my nut allergy?",
      sessionId: "session_1"
    });

    assert.deepEqual((result as any).request, supportRequest);
    const guestMessage = calls.find((call) => call.model === "message.create" && call.args.data.sender === SenderType.GUEST);
    assert.deepEqual(guestMessage?.args.data.metadata, {
      source: "public_qr",
      qrToken: "qr_menu_escalation",
      agenticFramework: "menu_concierge",
      menuEscalationReason: "allergen_confirmation"
    });
    const event = calls.find((call) => call.model === "requestEvent.create");
    assert.equal(event?.args.data.metadata.agenticFramework, "menu_concierge");
    assert.equal(event?.args.data.metadata.menuEscalationReason, "allergen_confirmation");
  });

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
    assert.deepEqual(result.servicePoint, servicePoint);
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
          servicePointId: servicePoint.id,
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
          servicePointId: servicePoint.id,
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
        servicePointId: servicePoint.id,
        guestSessionId: "session_encrypted_123"
      };
      const supportRequest = {
        id: "request_encrypted_1",
        venueId: servicePoint.venueId,
        servicePointId: servicePoint.id,
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
        servicePoint: {
          findFirst: async () => servicePoint
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
      servicePointId: servicePoint.id,
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
      servicePoint: {
        findFirst: async (args: unknown) => {
          calls.push({ model: "servicePoint.findFirst", args });
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
    assert.deepEqual(result.servicePoint, servicePoint);
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_greeting_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                openingHours: {
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
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
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
            servicePointId: servicePoint.id,
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
      sessionId: "ignored_session_123"
    })) as unknown as PublicGuestMessageResult;

    assert.equal(result.conversationId, conversation.id);
    assert.deepEqual(result.messages, storedMessages);
    assert.deepEqual(result.request, supportRequest);
    assert.deepEqual(result.servicePoint, servicePoint);
    assert.equal(calls.some((call) => call.model === "conversation.create"), false);
    assert.equal(calls.some((call) => call.model === "supportRequest.create"), true);
    assert.deepEqual(
      calls
        .filter((call) => call.model === "message.create")
        .map((call) => (call.args as { data: unknown }).data),
      [
        {
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
        },
        {
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
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
      servicePointId: servicePoint.id,
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
      servicePointId: servicePoint.id,
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
    assert.deepEqual(result.servicePoint, servicePoint);
    const createCall = calls.find((call) => call.model === "supportRequest.create") as { args: { data: { summary: string } } };
    assert.equal(createCall.args.data.summary, "Could we get more water?");
    assert.deepEqual(
      calls
        .filter((call) => call.model === "message.create")
        .map((call) => (call.args as { data: unknown }).data),
      [
        {
          venueId: servicePoint.venueId,
          servicePointId: servicePoint.id,
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
          servicePointId: servicePoint.id,
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
      servicePointId: servicePoint.id,
      conversationId: "conversation_resolved_followup_1",
      status: RequestStatus.RESOLVED
    };
    const newRequest = {
      id: "request_resolved_new",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
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
      servicePointId: servicePoint.id,
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
        servicePoint: {
          findFirst: async () => servicePoint
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
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_missing_conversation_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                openingHours: {
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
            servicePointId: servicePoint.id,
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
      servicePoint
    };
    const conversation = {
      id: "conversation_public_state_1",
      venueId: servicePoint.venueId,
      servicePointId: servicePoint.id,
      messages,
      requests: [request]
    };
    const calls: Array<{ model: string; args: unknown }> = [];
    const service = createService(
      {} as never,
      {} as never,
      {
        servicePoint: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "servicePoint.findFirst", args });
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
      servicePoint
    });
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_public_state_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                openingHours: {
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
            servicePointId: servicePoint.id,
            venueId: servicePoint.venueId
          },
          include: {
            messages: {
              select: {
                id: true,
                venueId: true,
                servicePointId: true,
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
                servicePoint: true
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
        servicePoint: {
          findFirst: async () => servicePoint
        },
        conversation: {
          findFirst: async () => ({
            id: "conversation_public_closed_1",
            venueId: servicePoint.venueId,
            servicePointId: servicePoint.id,
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
          servicePoint: {
            findFirst: async () => servicePoint
          },
          conversation: {
            findFirst: async () => ({
              id: "conversation_public_expired_1",
              venueId: servicePoint.venueId,
              servicePointId: servicePoint.id,
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
      servicePoint
    };
    const conversation = {
      id: "conversation_venue_state_1",
      venueId: venue.id,
      servicePointId: servicePoint.id,
      messages,
      requests: [request]
    };
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
        servicePoint: {
          findFirst: async (args: unknown) => {
            calls.push({ model: "servicePoint.findFirst", args });
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
      servicePoint,
      venue: { id: venue.id, name: venue.name, slug: venue.slug }
    });
    assert.deepEqual(calls, [
      {
        model: "venue.findFirst",
        args: {
          where: { slug: "blue-note" },
          include: {
            openingHours: {
              orderBy: {
                dayOfWeek: "asc"
              }
            }
          }
        }
      },
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            venueId: venue.id,
            label: "Venue support"
          }
        }
      },
      {
        model: "conversation.findFirst",
        args: {
          where: {
            id: "conversation_venue_state_1",
            servicePointId: servicePoint.id,
            venueId: venue.id
          },
          include: {
            messages: {
              select: {
                id: true,
                venueId: true,
                servicePointId: true,
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
                servicePoint: true
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
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_failed_write_123",
            isActive: true
          },
          include: {
            venue: {
              include: {
                openingHours: {
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
            status: RequestStatus.NEW,
            agentSuggestedAction: "Route to operations queue: venue facilities support.",
            agentPolicyVersion: "v1-backend-routing"
          }
        }
      }
    ]);
  });

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
      servicePoint: {
        findFirst: async () => servicePoint,
        create: async () => servicePoint
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
    const venue = { id: "venue_pending_reply", slug: "blue-note", workspaceId: "workspace_1", name: "Blue Note" };
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
      servicePointId: servicePoint.id,
      guestSessionId: "session_pending_reply",
      status: "open",
      updatedAt: new Date()
    };
    const request = {
      id: "request_pending_reply",
      venueId: venue.id,
      servicePointId: servicePoint.id,
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
        servicePoint: {
          findFirst: async () => servicePoint,
          create: async () => servicePoint
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
    const venue = { id: "venue_location_prompt", slug: "blue-note", workspaceId: "workspace_1", name: "Blue Note" };
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
      servicePointId: servicePoint.id
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
        servicePoint: {
          findFirst: async () => servicePoint,
          create: async () => servicePoint
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
    const venue = { id: "venue_non_request", slug: "blue-note", workspaceId: "workspace_1", name: "Blue Note" };
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
      servicePointId: servicePoint.id
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
        servicePoint: {
          findFirst: async () => servicePoint,
          create: async () => servicePoint
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
      workspaceId: "workspace_1",
      name: "Blue Note",
      timezone: "UTC",
      openingHours: closedHours
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
