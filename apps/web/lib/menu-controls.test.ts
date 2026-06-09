import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMenuItemPayload, createMenuSectionPayload, parseTagInput } from "./menu-controls";

describe("menu controls", () => {
  it("trims section names", () => {
    assert.deepEqual(createMenuSectionPayload({ name: " Mains ", sortOrder: 2, isActive: true }), {
      name: "Mains",
      sortOrder: 2,
      isActive: true
    });
  });

  it("normalizes item payload tags and nullable text", () => {
    assert.deepEqual(
      createMenuItemPayload({
        sectionId: "section_1",
        name: " Risotto ",
        description: " ",
        priceLabel: " GBP 16 ",
        dietaryTags: "vegetarian, gluten-free",
        allergens: "milk|gluten",
        available: true,
        sortOrder: 1
      }),
      {
        sectionId: "section_1",
        name: "Risotto",
        description: null,
        priceLabel: "GBP 16",
        dietaryTags: ["vegetarian", "gluten-free"],
        allergens: ["milk", "gluten"],
        available: true,
        sortOrder: 1
      }
    );
  });

  it("parses comma and pipe separated tags", () => {
    assert.deepEqual(parseTagInput("vegan | gluten-free, halal"), ["vegan", "gluten-free", "halal"]);
  });
});
