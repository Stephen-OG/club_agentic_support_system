import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SenderType } from "@prisma/client";
import { TriageReplyProcessor } from "./triage-reply.processor";

describe("TriageReplyProcessor realtime events", () => {
  it("publishes request and message events after writing the assistant reply", async () => {
    const request = {
      id: "request_1",
      title: "Guest support request",
      category: "general",
      agentPolicyVersion: "v1-backend-routing",
      agentSuggestedAction: "Route to floor queue: general guest support."
    };
    const message = {
      id: "message_assistant_1"
    };
    const published: unknown[] = [];
    const processor = new TriageReplyProcessor(
      {
        triage: async () => ({
          assistantReply: "Of course, I have let the team know for Table 4.",
          category: "service",
          confidence: 0.8,
          guestLocationLabel: null,
          needsStaff: true,
          priority: "normal",
          suggestedAction: "reply",
          summary: "Guest is waiting.",
          title: "Guest waiting"
        })
      } as never,
      {
        supportRequest: {
          findFirst: async () => request,
          update: async (args: any) => {
            assert.equal(args.data.agentSuggestedAction, undefined);
            assert.equal(args.data.agentPolicyVersion, undefined);
            return { ...request, title: "Guest waiting", category: "service" };
          }
        },
        message: {
          findFirst: async () => null,
          create: async (args: any) => {
            assert.equal(args.data.sender, SenderType.ASSISTANT);
            return message;
          }
        }
      } as never,
      {
        classifyOrDefault: () => "normal"
      } as never,
      {
        publish: (event: unknown) => {
          published.push(event);
        }
      } as never
    );

    await processor.process({
      data: {
        conversationId: "conversation_1",
        venueId: "venue_1",
        servicePointId: "sp_1",
        servicePointLabel: "Table 4",
        guestMessageBody: "I have been waiting too long.",
        qrToken: "qr_1",
        source: "public_qr",
        deterministicPriority: "normal"
      }
    } as never);

    assert.deepEqual(
      published.map((event) => ({ ...(event as any), occurredAt: "Any<Date>" })),
      [
        {
          type: "request.updated",
          venueId: "venue_1",
          requestId: request.id,
          conversationId: "conversation_1",
          occurredAt: "Any<Date>"
        },
        {
          type: "message.created",
          venueId: "venue_1",
          requestId: request.id,
          conversationId: "conversation_1",
          messageId: message.id,
          occurredAt: "Any<Date>"
        }
      ]
    );
  });
});
