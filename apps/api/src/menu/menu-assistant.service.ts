import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  priceLabel?: string | null;
  dietaryTags?: string[];
  allergens?: string[];
  available?: boolean;
};

export type MenuAssistantInput = {
  menu: MenuItem[];
  message: string;
  venueName: string;
};

export type MenuAssistantResult =
  | {
      handled: false;
      reason: "disabled" | "not_menu_request" | "no_relevant_items";
    }
  | {
      handled: true;
      matchedItemIds: string[];
      reply: string;
      usedAi: boolean;
    };

const MENU_ASSISTANT_SYSTEM_PROMPT = `You are Lily, a hidden GuestOS menu assistant.

Answer guest menu questions only from the supplied menu_items JSON.
Do not invent items, prices, allergens, ingredients, or availability.
If allergen or dietary safety is uncertain, say the team should confirm before the guest orders.
Keep the reply concise and guest-friendly.`;

const MenuAssistantOutputSchema = z.object({
  matchedItemIds: z.array(z.string()),
  reply: z.string().min(1)
});

@Injectable()
export class MenuAssistantService {
  private readonly enabled: boolean;
  private readonly model: string;
  private openai: OpenAI | null;

  constructor(@Optional() private readonly config?: ConfigService) {
    this.enabled = this.config?.get<string>("MENU_ASSISTANT_ENABLED") === "true";
    const apiKey = this.config?.get<string>("OPENAI_API_KEY");
    this.model = this.config?.get<string>("OPENAI_MENU_MODEL") || "gpt-4o-mini";
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async answer(input: MenuAssistantInput): Promise<MenuAssistantResult> {
    if (!this.enabled) {
      return { handled: false, reason: "disabled" };
    }

    if (!this.isMenuRequest(input.message)) {
      return { handled: false, reason: "not_menu_request" };
    }

    const relevantItems = this.relevantMenuItems(input.message, input.menu);
    if (!relevantItems.length) {
      return { handled: false, reason: "no_relevant_items" };
    }

    if (!this.openai) {
      return this.createFallback(input.message, relevantItems);
    }

    const response = await this.openai.responses.parse({
      input: JSON.stringify({
        message: input.message,
        menu_items: relevantItems.map(toPromptMenuItem),
        venueName: input.venueName
      }),
      instructions: MENU_ASSISTANT_SYSTEM_PROMPT,
      model: this.model,
      store: false,
      text: {
        format: zodTextFormat(MenuAssistantOutputSchema, "guestos_menu_answer")
      }
    });

    const parsed = MenuAssistantOutputSchema.parse(response.output_parsed);

    return {
      handled: true,
      matchedItemIds: parsed.matchedItemIds.filter((id) => relevantItems.some((item) => item.id === id)),
      reply: parsed.reply,
      usedAi: true
    };
  }

  private isMenuRequest(message: string) {
    return /\b(menu|food|dish|eat|vegan|vegetarian|gluten|allerg|dairy|halal|dessert|starter|main|drink|cocktail|beer|wine)\b/i.test(
      message
    );
  }

  private relevantMenuItems(message: string, menu: MenuItem[]) {
    const normalized = message.toLowerCase();
    const queryTerms = new Set(normalized.match(/[a-z0-9]+/g) ?? []);
    const dietaryTerms = ["vegan", "vegetarian", "gluten-free", "gluten", "dairy", "halal"];
    const categoryTerms = ["starter", "starters", "main", "mains", "dessert", "desserts", "drink", "drinks", "cocktail", "cocktails"];

    return menu
      .filter((item) => item.available !== false)
      .filter((item) => !this.hasDietaryQuery(normalized) || (item.dietaryTags?.length ?? 0) > 0)
      .map((item) => ({
        item,
        score: this.scoreMenuItem(item, queryTerms, normalized, dietaryTerms, categoryTerms)
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
      .slice(0, 6)
      .map(({ item }) => item);
  }

  private scoreMenuItem(
    item: MenuItem,
    queryTerms: Set<string>,
    normalizedMessage: string,
    dietaryTerms: string[],
    categoryTerms: string[]
  ) {
    const searchable = [item.name, item.category, item.description, ...(item.dietaryTags ?? []), ...(item.allergens ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if (term.length > 2 && searchable.includes(term)) {
        score += 1;
      }
    }

    for (const term of dietaryTerms) {
      if (normalizedMessage.includes(term) && searchable.includes(term)) {
        score += 4;
      }
    }

    for (const term of categoryTerms) {
      if (normalizedMessage.includes(term) && searchable.includes(term.replace(/s$/, ""))) {
        score += 2;
      }
    }

    return score;
  }

  private hasDietaryQuery(normalizedMessage: string) {
    return /\b(vegan|vegetarian|gluten|gluten-free|dairy|halal|allerg)\b/i.test(normalizedMessage);
  }

  private createFallback(message: string, items: MenuItem[]): MenuAssistantResult {
    const names = items.slice(0, 3).map((item) => item.name).join(", ");
    return {
      handled: true,
      matchedItemIds: items.map((item) => item.id),
      reply: `I found these menu options that may match: ${names}. Please ask the team to confirm allergens before ordering.`,
      usedAi: false
    };
  }
}

function toPromptMenuItem(item: MenuItem) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description || null,
    priceLabel: item.priceLabel || null,
    dietaryTags: item.dietaryTags ?? [],
    allergens: item.allergens ?? [],
    available: item.available !== false
  };
}
