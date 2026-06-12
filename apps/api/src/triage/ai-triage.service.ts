import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AgentActionSchema,
  AiTriageSchema,
  RequestPrioritySchema,
  type AiTriageOutput,
  type RequestPriority
} from "@madupe/shared";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { RedisCacheService } from "../common/cache/redis-cache.service";
import { ReplyGuardService } from "./reply-guard.service";

const TRIAGE_CACHE_TTL = 60; // 1 minute — venue context changes slowly

export const MADUPE_TRIAGE_SYSTEM_PROMPT = `You are Lily, the Madupe AI operations assistant for hospitality venues.

Your job is to turn guest chat messages into safe, concise support request triage.

QR support is the guest-facing venue support chat. Treat QR support messages as requests from guests currently at the venue.

You must:
- acknowledge the guest warmly
- decide if staff are needed
- treat greetings, casual chat, and answerable venue-information questions as non-staff intents when no action is being requested
- route menu, price, availability, allergen, and dietary-option questions to the operations team because this app has no live menu source
- classify category
- infer location if stated
- summarize the request for staff
- choose priority
- escalate safety, medical, harassment, fire, smoke, security, or emergency issues
- never claim staff completed an action
- never promise exact wait times
- never invent menus, prices, venue policies, availability, opening hours, or operational facts not supplied in the input
- ask for location if the venue-wide QR request needs staff and location is missing

Return only structured triage data matching the schema.`;

const AiTriageStructuredOutputSchema = z.object({
  assistantReply: z.string().min(1),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  guestLocationLabel: z.string().min(1).max(120).nullable(),
  needsStaff: z.boolean(),
  priority: RequestPrioritySchema,
  suggestedAction: AgentActionSchema,
  summary: z.string().min(1).nullable(),
  title: z.string().min(1)
});

const internalIdentifierRegex =
  /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|sp_[a-z0-9_]+_[a-f0-9]{16,})\b/i;

type TriageInput = {
  deterministicPriority: RequestPriority;
  message: string;
  servicePointLabel: string;
  isFollowup?: boolean;
  venueId?: string;
};

@Injectable()
export class AiTriageService {
  private readonly model: string;
  private openai: OpenAI | null;
  private readonly logger = new Logger(AiTriageService.name);

  constructor(
    @Optional() private readonly cache?: RedisCacheService,
    @Optional() private readonly replyGuard?: ReplyGuardService,
    @Optional() private readonly config?: ConfigService
  ) {
    const apiKey = this.config?.get<string>("OPENAI_API_KEY");
    this.model = this.config?.get<string>("OPENAI_TRIAGE_MODEL") || "gpt-4o-mini";
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async triage(input: TriageInput): Promise<AiTriageOutput> {
    const fallback = this.createFallback(input);

    // Try cache first for non-followup messages
    if (!input.isFollowup) {
      const cacheKey = this.buildCacheKey(input);
      const cached = await this.cache?.get<AiTriageOutput>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    if (!this.openai) {
      return fallback;
    }

    try {
      const response = await this.openai.responses.parse({
        input: JSON.stringify({
          deterministicPriority: input.deterministicPriority,
          isFollowup: Boolean(input.isFollowup),
          message: this.sanitizeInput(input.message, input.venueId),
          servicePointLabel: input.servicePointLabel
        }),
        instructions: MADUPE_TRIAGE_SYSTEM_PROMPT,
        model: this.model,
        store: false,
        text: {
          format: zodTextFormat(AiTriageStructuredOutputSchema, "madupe_triage")
        }
      });

      const parsed = this.normalizeModelOutput(response.output_parsed);
      const result = this.applyDeterministicGuardrails(parsed, fallback, input.deterministicPriority);

      // Cache the result for future similar messages
      if (!input.isFollowup) {
        const cacheKey = this.buildCacheKey(input);
        await this.cache?.set(cacheKey, result, TRIAGE_CACHE_TTL);
      }

      return result;
    } catch (error) {
      this.logger.warn(`AI triage failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      return fallback;
    }
  }

  createFallback(input: TriageInput): AiTriageOutput {
    if (!input.isFollowup && this.isOperationsInformationRequest(input.message)) {
      return AiTriageSchema.parse({
        assistantReply: `I have asked the team to help with that at ${input.servicePointLabel}.`,
        category: this.categoryFromMessage(input.message),
        confidence: 0.86,
        guestLocationLabel: this.locationFromMessage(input.message),
        needsStaff: true,
        priority: input.deterministicPriority,
        suggestedAction: "reply",
        summary: input.message,
        title: this.titleFromMessage(input.message, input.deterministicPriority)
      });
    }

    const nonStaffReply = this.nonStaffReply(input.message, input.servicePointLabel);

    if (!input.isFollowup && nonStaffReply) {
      return AiTriageSchema.parse({
        assistantReply: nonStaffReply,
        category: "general",
        confidence: 0.82,
        guestLocationLabel: this.locationFromMessage(input.message),
        needsStaff: false,
        priority: "low",
        suggestedAction: "reply",
        title: "No staff action needed"
      });
    }

    return AiTriageSchema.parse({
      assistantReply: this.replyGuard?.createGuestReply(
        input.deterministicPriority,
        input.servicePointLabel,
        input.isFollowup
      ) ?? `A staff member will be with you at ${input.servicePointLabel}.`,
      category: this.categoryFromMessage(input.message),
      confidence: 0.72,
      guestLocationLabel: this.locationFromMessage(input.message),
      needsStaff: true,
      priority: input.deterministicPriority,
      suggestedAction: input.deterministicPriority === "urgent" ? "escalate" : "reply",
      summary: input.message,
      title: this.titleFromPriority(input.deterministicPriority)
    });
  }

  /**
   * Build a cache key from the triage input.
   * Normalizes the message to handle common variations.
   */
  private buildCacheKey(input: TriageInput): string {
    const normalizedMessage = input.message
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 100);

    const venueId = input.venueId || "global";
    return `triage:${input.deterministicPriority}:${input.servicePointLabel}:${venueId}:${normalizedMessage}`;
  }

  private sanitizeInput(message: string, venueId?: string): string {
    let sanitized = message
      .replace(/\0/g, "")
      .replace(/---[\s\S]*?---/g, "");

    const injectionPattern =
      /\b(ignore\s+(all\s+)?previous\s+(instructions|directions|commands|prompts?)|forget\s+(all\s+)?(previous\s+)?(instructions|directions)|new\s+(instructions|prompt)|override\s+(instructions|prompt)|disregard|you\s+are\s+now|act\s+as\s+if|from\s+now\s+on)\b/i;

    if (injectionPattern.test(sanitized)) {
      this.logger.warn(`Prompt injection detected in message from venue ${venueId || "unknown"}`);
      sanitized = sanitized.replace(new RegExp(injectionPattern.source, "gi"), "[REDACTED]");
    }

    return sanitized;
  }

  private normalizeModelOutput(output: unknown): AiTriageOutput {
    if (!output || typeof output !== "object") {
      throw new Error("Missing AI triage output");
    }

    const triage = output as Record<string, unknown>;

    return AiTriageSchema.parse({
      ...triage,
      guestLocationLabel: triage.guestLocationLabel || undefined,
      summary: triage.summary || undefined
    });
  }

  private applyDeterministicGuardrails(
    modelTriage: AiTriageOutput,
    fallback: AiTriageOutput,
    deterministicPriority: RequestPriority
  ): AiTriageOutput {
    if (deterministicPriority === "urgent" && modelTriage.priority !== "urgent") {
      return {
        ...modelTriage,
        assistantReply: fallback.assistantReply,
        priority: "urgent",
        suggestedAction: "escalate",
        title: fallback.title
      };
    }

    if (internalIdentifierRegex.test(modelTriage.assistantReply)) {
      return {
        ...modelTriage,
        assistantReply: fallback.assistantReply
      };
    }

    if (this.priorityRank(deterministicPriority) > this.priorityRank(modelTriage.priority)) {
      return {
        ...modelTriage,
        priority: deterministicPriority
      };
    }

    return modelTriage;
  }

  private priorityRank(priority: RequestPriority) {
    return { low: 0, normal: 1, high: 2, urgent: 3 }[priority];
  }

  private nonStaffReply(message: string, servicePointLabel: string) {
    const normalized = message.trim().toLowerCase();

    if (/^(hi|hello|hey|yo|hiya|howdy|greetings|good morning|good afternoon|good evening)[!. ]*$/.test(normalized)) {
      return `Hello. I am Lily for ${servicePointLabel}. Ask me for help when you need the team.`;
    }

    const asksForVenueInfo =
      /\b(wifi|wi-fi|password|opening hours|hours|close|closing|open|dress code|age limit|parking|where is|where are|toilet|restroom|bathroom)\b/i.test(
        normalized
      );
    const asksForAction =
      /\b(need|bring|send|help|issue|problem|spill|broken|blocked|clogged|dirty|mess|clean|paper|soap|missing|wrong|waiting|allerg|medical|injur|fight|security|harass|fire|smoke|emergency)\b/i.test(
        normalized
      );

    if (asksForVenueInfo && !asksForAction) {
      return `I can help with service requests at ${servicePointLabel}. For venue info, please check with the team nearby.`;
    }

    return null;
  }

  private isOperationsInformationRequest(message: string) {
    return /\b(menu|food menu|drink menu|wine list|cocktail list|prices?|price list|available|availability|vegan|vegetarian|gluten[-\s]?free|halal|kosher|allergen|allergens|dietary)\b/i.test(
      message
    );
  }

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

  private categoryFromMessage(message: string) {
    if (this.isOperationsInformationRequest(message)) {
      return "menu";
    }

    if (/\b(allerg|medical|injur|fight|security|harass|fire|smoke|emergency)\b/i.test(message)) {
      return "safety";
    }

    if (/\b(spill|mess|leak|bathroom|restroom)\b/i.test(message)) {
      return "facilities";
    }

    if (/\b(bill|pay|payment|refund|overcharged)\b/i.test(message)) {
      return "payment";
    }

    return "general";
  }

  private titleFromMessage(message: string, priority: RequestPriority) {
    if (this.isOperationsInformationRequest(message)) {
      return "Menu request";
    }

    return this.titleFromPriority(priority);
  }

  private titleFromPriority(priority: RequestPriority) {
    if (priority === "urgent") {
      return "Urgent guest support";
    }

    if (priority === "high") {
      return "High priority guest request";
    }

    return "Guest support request";
  }
}
