import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RequestPriority } from "@guestos/shared";
import { isAgentActionAllowed } from "./agent-policy";
import { AiTriageService, GUESTOS_TRIAGE_SYSTEM_PROMPT } from "./ai-triage.service";

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

function replyGuard() {
  return {
    createGuestReply(priority: RequestPriority, servicePointLabel: string, isFollowup?: boolean) {
      if (priority === "urgent") {
        return `I have alerted the team for ${servicePointLabel}.`;
      }

      if (isFollowup) {
        return `Thanks, I added that to your open request for ${servicePointLabel}.`;
      }

      return `Of course. I have notified the team for ${servicePointLabel}.`;
    }
  };
}

function cacheStub() {
  return {
    get: async () => null,
    set: async () => undefined
  };
}

describe("AI triage", () => {
  it("uses GPT-4o mini with the GuestOS structured triage prompt", async () => {
    let capturedBody: any;
    const service = new AiTriageService(cacheStub() as never, replyGuard() as never, {
      get(key: string) {
        return key === "OPENAI_API_KEY" ? "test-key" : undefined;
      }
    } as never);

    (service as any).openai = {
      responses: {
        parse: async (body: any) => {
          capturedBody = body;
          return {
            output_parsed: {
              assistantReply: "Absolutely. I have shared this with the venue team.",
              category: "service",
              confidence: 0.91,
              guestLocationLabel: "Table 12",
              needsStaff: true,
              priority: "normal",
              suggestedAction: "reply",
              summary: "Guest needs napkins at table 12.",
              title: "Napkins needed"
            }
          };
        }
      }
    };

    const triage = await service.triage({
      deterministicPriority: "normal",
      message: "Could we get napkins at table 12?",
      servicePointLabel: "Venue support"
    });

    assert.equal(capturedBody.model, "gpt-4o-mini");
    assert.equal(capturedBody.instructions, GUESTOS_TRIAGE_SYSTEM_PROMPT);
    assert.equal(capturedBody.text.format.name, "guestos_triage");
    assert.match(capturedBody.input, /table 12/i);
    assert.match(GUESTOS_TRIAGE_SYSTEM_PROMPT, /ask for location/i);
    assert.match(GUESTOS_TRIAGE_SYSTEM_PROMPT, /non-staff intents/i);
    assert.match(GUESTOS_TRIAGE_SYSTEM_PROMPT, /3 consecutive request/i);
    assert.equal(triage.title, "Napkins needed");
    assert.equal(triage.guestLocationLabel, "Table 12");
  });

  it("keeps deterministic urgent safety classification even if the model under-prioritizes", async () => {
    const service = new AiTriageService(cacheStub() as never, replyGuard() as never, {
      get(key: string) {
        return key === "OPENAI_API_KEY" ? "test-key" : undefined;
      }
    } as never);

    (service as any).openai = {
      responses: {
        parse: async () => ({
          output_parsed: {
            assistantReply: "Thanks, I will let the team know.",
            category: "general",
            confidence: 0.8,
            needsStaff: true,
            priority: "normal",
            suggestedAction: "reply",
            summary: "Guest mentioned smoke.",
            title: "Guest support request"
          }
        })
      }
    };

    const triage = await service.triage({
      deterministicPriority: "urgent",
      message: "There is smoke near the bar",
      servicePointLabel: "Main bar"
    });

    assert.equal(triage.priority, "urgent");
    assert.equal(triage.suggestedAction, "escalate");
    assert.equal(triage.assistantReply, "I have alerted the team for Main bar.");
  });

  it("replaces model replies that expose internal location identifiers", async () => {
    const service = new AiTriageService(cacheStub() as never, replyGuard() as never, {
      get(key: string) {
        return key === "OPENAI_API_KEY" ? "test-key" : undefined;
      }
    } as never);

    (service as any).openai = {
      responses: {
        parse: async () => ({
          output_parsed: {
            assistantReply: "Of course. I have notified the team for 7548ab6e-e8ac-4aeb-8867-d2ff290d9b46.",
            category: "general",
            confidence: 0.8,
            needsStaff: true,
            priority: "normal",
            suggestedAction: "reply",
            summary: "Guest has waited too long.",
            title: "Guest support request"
          }
        })
      }
    };

    const triage = await service.triage({
      deterministicPriority: "normal",
      message: "I have been waiting too long.",
      servicePointLabel: "Table 4"
    });

    assert.equal(triage.assistantReply, "Of course. I have notified the team for Table 4.");
  });

  it("classifies greetings and venue information questions as no-staff fallback intents", () => {
    const service = new AiTriageService(cacheStub() as never, replyGuard() as never);

    const greeting = service.createFallback({
      deterministicPriority: "normal",
      message: "hello",
      servicePointLabel: "Blue Note"
    });
    const infoQuestion = service.createFallback({
      deterministicPriority: "normal",
      message: "what is the wifi password?",
      servicePointLabel: "Blue Note"
    });

    assert.equal(greeting.needsStaff, false);
    assert.equal(greeting.priority, "low");
    assert.match(greeting.assistantReply, /Lily/i);
    assert.equal(infoQuestion.needsStaff, false);
    assert.equal(infoQuestion.title, "No staff action needed");
  });
});
