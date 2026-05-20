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
    const service = new ServicePointsService(
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
              source: "public_qr"
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

  it("appends follow-up text to an existing open request instead of creating a new support request", async () => {
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
        requestId: supportRequest.id,
        sender: SenderType.GUEST,
        body: "Could we get more water?"
      },
      {
        id: "message_followup_assistant_1",
        conversationId: conversation.id,
        requestId: supportRequest.id,
        sender: SenderType.ASSISTANT,
        body: "Thanks, I added that to your open request for Table 2."
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
          throw new Error("supportRequest.create should not be called for a follow-up on an open request");
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
          assistantReply: "Thanks, I added that to your open request for Table 2.",
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
    assert.deepEqual(result.request, supportRequest);
    assert.deepEqual(result.servicePoint, servicePoint);
    assert.equal(calls.some((call) => call.model === "supportRequest.create"), false);
    assert.deepEqual(calls, [
      {
        model: "servicePoint.findFirst",
        args: {
          where: {
            qrToken: "qr_followup_123",
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
            id: conversation.id,
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
              qrToken: "qr_followup_123"
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
            body: "Thanks, I added that to your open request for Table 2.",
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
            type: "request.updated",
            toStatus: RequestStatus.NEW,
            metadata: {
              source: "public_qr",
              qrToken: "qr_followup_123"
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
    const service = new ServicePointsService(
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
      conversationId: conversation.id,
      messages,
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
              orderBy: {
                createdAt: "asc"
              }
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

  it("trims whitespace-only DTO messages before validating length", async () => {
    const input = plainToInstance(PublicGuestMessageDto, {
      message: "   "
    });

    const errors = await validate(input);

    assert.equal(input.message, "");
    assert.equal(errors.some((error) => error.property === "message"), true);
  });
});
