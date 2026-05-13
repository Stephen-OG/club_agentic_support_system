import OpenAI from "openai";
import { createAssistantReply } from "@/lib/chat-copy";
import { logger } from "@/lib/logger";
import type { AiTriage, RequestPriority } from "@/lib/types";

const deterministicPriorityRules: Array<{ priority: RequestPriority; match: RegExp }> = [
  {
    priority: "urgent",
    match:
      /\b(allerg(?:y|ic|ies)|anaphylaxis|can't breathe|cannot breathe|chok(?:e|ing)|medical|medic|ambulance|faint(?:ed|ing)?|unconscious|seizure|chest pain|heart attack|stroke|bleed(?:ing)?|blood|injur(?:y|ed)|hurt|burn(?:ed|ing)?|broken glass|glass broke|cut|fire|smoke|fight|assault|attack|harass(?:ed|ment)|threat(?:en|ening)?|security|danger|emergency)\b/i
  },
  {
    priority: "high",
    match:
      /\b(spill(?:ed)?|mess|sticky|broken|shattered|wrong order|missing order|missing food|food.*cold|cold food|wait(?:ed|ing)? (?:too )?long|still waiting|angry|upset|complain(?:t|ing)?|refund|overcharged|charged twice|card declined|payment problem|bill problem|toilet|bathroom|restroom|overflow|leak(?:ing)?)\b/i
  },
  {
    priority: "normal",
    match:
      /\b(bill|pay|payment|card|receipt|order|menu|drink|water|refill|spoon|fork|knife|cutlery|utensil|napkin|tissue|wipe|help|server|waiter|waitress)\b/i
  },
  {
    priority: "low",
    match:
      /\b(wifi|wi-fi|password|music|volume|recommend(?:ation)?|question|info|information|where is|what time|lost property|lost and found)\b/i
  }
];

const fallbackCategories: Array<{ match: RegExp; category: string; title: string }> = [
  { match: /spoon|fork|knife|cutlery|utensil/i, category: "utensils", title: "Utensils needed" },
  { match: /tissue|napkin|wipe/i, category: "supplies", title: "Supplies needed" },
  { match: /clean|spill|mess|sticky/i, category: "cleaning", title: "Cleaning needed" },
  { match: /bill|pay|payment|card|receipt/i, category: "payment", title: "Payment help" },
  { match: /hurt|injured|fight|security|danger|emergency/i, category: "safety", title: "Urgent safety support" }
];

const requestPriorities = new Set<RequestPriority>(["low", "normal", "high", "urgent"]);

export async function triageMessage(message: string, tableLabel: string): Promise<AiTriage> {
  const deterministicPriority = classifyPriority(message);

  if (!process.env.OPENAI_API_KEY) {
    logger.info("ai.triage.fallback.missing_api_key", {
      tableLabel,
      messageLength: message.length
    });
    return fallbackTriage(message, tableLabel, deterministicPriority);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const startedAt = Date.now();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You triage table support requests in a club. Return compact JSON with title, category, priority, assistantReply, needsStaff. priority must be one of: low, normal, high, urgent. Use lowercase category and priority values. Never promise exact arrival times. Escalate safety or injury as urgent."
      },
      {
        role: "user",
        content: `Table: ${tableLabel}\nGuest message: ${message}`
      }
    ]
  }).catch((error) => {
    logger.error("ai.triage.openai_error", {
      tableLabel,
      messageLength: message.length,
      durationMs: Date.now() - startedAt,
      error
    });
    return null;
  });

  if (!response) {
    return fallbackTriage(message, tableLabel, deterministicPriority);
  }

  logger.info("ai.triage.completed", {
    tableLabel,
    messageLength: message.length,
    durationMs: Date.now() - startedAt,
    model: response.model
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    logger.warn("ai.triage.empty_response", {
      tableLabel,
      messageLength: message.length
    });
    return fallbackTriage(message, tableLabel);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AiTriage>;
    const priority = deterministicPriority || normalizePriority(parsed.priority);
    return {
      title: parsed.title || "Guest support request",
      category: normalizeCategory(parsed.category),
      priority,
      assistantReply:
        parsed.assistantReply || createAssistantReply(priority, tableLabel),
      needsStaff: parsed.needsStaff ?? true
    };
  } catch (error) {
    logger.warn("ai.triage.invalid_json", {
      tableLabel,
      messageLength: message.length,
      error
    });
    return fallbackTriage(message, tableLabel, deterministicPriority);
  }
}

export function classifyPriority(message: string): RequestPriority | null {
  const matchedRule = deterministicPriorityRules.find((rule) => rule.match.test(message));
  return matchedRule?.priority || null;
}

function normalizeCategory(category: unknown) {
  if (typeof category !== "string" || !category.trim()) {
    return "general";
  }

  return category.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizePriority(priority: unknown): RequestPriority {
  if (typeof priority !== "string") {
    return "normal";
  }

  const normalized = priority.trim().toLowerCase();
  return requestPriorities.has(normalized as RequestPriority) ? (normalized as RequestPriority) : "normal";
}

function fallbackTriage(message: string, tableLabel: string, deterministicPriority = classifyPriority(message)): AiTriage {
  const category = fallbackCategories.find((item) => item.match.test(message));
  const priority = deterministicPriority || "normal";

  return {
    title: category?.title || "Guest support request",
    category: category?.category || "general",
    priority,
    assistantReply: createAssistantReply(priority, tableLabel),
    needsStaff: true
  };
}
