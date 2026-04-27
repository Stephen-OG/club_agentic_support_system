import OpenAI from "openai";
import type { AiTriage } from "@/lib/types";

const fallbackCategories: Array<{ match: RegExp; category: string; title: string }> = [
  { match: /spoon|fork|knife|cutlery|utensil/i, category: "utensils", title: "Utensils needed" },
  { match: /tissue|napkin|wipe/i, category: "supplies", title: "Supplies needed" },
  { match: /clean|spill|mess|sticky/i, category: "cleaning", title: "Cleaning needed" },
  { match: /bill|pay|payment|card|receipt/i, category: "payment", title: "Payment help" },
  { match: /hurt|injured|fight|security|danger|emergency/i, category: "safety", title: "Urgent safety support" }
];

export async function triageMessage(message: string, tableLabel: string): Promise<AiTriage> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackTriage(message, tableLabel);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You triage table support requests in a club. Return compact JSON with title, category, priority, assistantReply, needsStaff. Never promise exact arrival times. Escalate safety or injury as urgent."
      },
      {
        role: "user",
        content: `Table: ${tableLabel}\nGuest message: ${message}`
      }
    ]
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    return fallbackTriage(message, tableLabel);
  }

  try {
    const parsed = JSON.parse(raw) as AiTriage;
    return {
      title: parsed.title || "Guest support request",
      category: parsed.category || "general",
      priority: parsed.priority || "normal",
      assistantReply:
        parsed.assistantReply || `Thanks. I have notified the team for ${tableLabel}.`,
      needsStaff: parsed.needsStaff ?? true
    };
  } catch {
    return fallbackTriage(message, tableLabel);
  }
}

function fallbackTriage(message: string, tableLabel: string): AiTriage {
  const category = fallbackCategories.find((item) => item.match.test(message));
  const urgent = /hurt|injured|fight|security|danger|emergency/i.test(message);

  return {
    title: category?.title || "Guest support request",
    category: category?.category || "general",
    priority: urgent ? "urgent" : "normal",
    assistantReply: urgent
      ? `I have alerted the team that ${tableLabel} needs urgent support. Please stay where you are if it is safe to do so.`
      : `Of course. I have notified the team for ${tableLabel}.`,
    needsStaff: true
  };
}
