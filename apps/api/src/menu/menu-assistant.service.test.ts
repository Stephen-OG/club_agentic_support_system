import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MenuAssistantService, type MenuItem } from "./menu-assistant.service";

const menu: MenuItem[] = [
  {
    id: "item_vegan_bowl",
    name: "Roasted Cauliflower Bowl",
    category: "mains",
    description: "Cauliflower, grains, herbs, and tahini dressing.",
    priceLabel: "GBP 14",
    dietaryTags: ["vegan", "gluten-free"],
    allergens: ["sesame"],
    available: true
  },
  {
    id: "item_mushroom_risotto",
    name: "Mushroom Risotto",
    category: "mains",
    description: "Wild mushroom risotto with optional parmesan.",
    priceLabel: "GBP 16",
    dietaryTags: ["vegetarian"],
    allergens: ["milk"],
    available: true
  },
  {
    id: "item_beef_burger",
    name: "House Beef Burger",
    category: "mains",
    description: "Beef patty, cheddar, pickles, and fries.",
    priceLabel: "GBP 15",
    dietaryTags: [],
    allergens: ["milk", "gluten"],
    available: true
  }
];

describe("MenuAssistantService", () => {
  it("stays disabled by default so the menu assistant is hidden from guest chat", async () => {
    const service = new MenuAssistantService();

    const result = await service.answer({
      menu,
      message: "What vegan mains do you have?",
      venueName: "Blue Note"
    });

    assert.deepEqual(result, {
      handled: false,
      reason: "disabled"
    });
  });

  it("retrieves a small relevant menu subset before calling AI", async () => {
    let capturedBody: any;
    const service = new MenuAssistantService({
      get(key: string) {
        if (key === "MENU_ASSISTANT_ENABLED") return "true";
        if (key === "OPENAI_API_KEY") return "test-key";
        return undefined;
      }
    } as never);
    (service as any).openai = {
      responses: {
        parse: async (body: any) => {
          capturedBody = body;
          return {
            output_parsed: {
              reply: "The Roasted Cauliflower Bowl is vegan and gluten-free. The Mushroom Risotto is vegetarian.",
              matchedItemIds: ["item_vegan_bowl", "item_mushroom_risotto"]
            }
          };
        }
      }
    };

    const result = await service.answer({
      menu,
      message: "What vegan mains do you have?",
      venueName: "Blue Note"
    });

    assert.equal(result.handled, true);
    assert.equal(result.usedAi, true);
    assert.deepEqual(result.matchedItemIds, ["item_vegan_bowl", "item_mushroom_risotto"]);
    assert.match(capturedBody.input, /Roasted Cauliflower Bowl/);
    assert.match(capturedBody.input, /Mushroom Risotto/);
    assert.doesNotMatch(capturedBody.input, /House Beef Burger/);
  });

  it("marks staff-action menu requests for escalation", () => {
    const service = new MenuAssistantService({
      get(key: string) {
        if (key === "MENU_ASSISTANT_ENABLED") return "true";
        return undefined;
      }
    } as never);

    assert.equal(
      service.escalationReason("Can someone come over and confirm if the risotto is safe for my nut allergy?"),
      "allergen_confirmation"
    );
    assert.equal(service.escalationReason("Can I order the burger please?"), "ordering_help");
    assert.equal(service.escalationReason("What vegan mains do you have?"), null);
  });

  it("returns framework metadata for handled replies", async () => {
    const service = new MenuAssistantService({
      get(key: string) {
        if (key === "MENU_ASSISTANT_ENABLED") return "true";
        return undefined;
      }
    } as never);

    const result = await service.answer({
      menu,
      message: "What vegan mains do you have?",
      venueName: "Blue Note"
    });

    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.agenticFramework, "menu_concierge");
      assert.equal(result.usedAi, false);
    }
  });
});
