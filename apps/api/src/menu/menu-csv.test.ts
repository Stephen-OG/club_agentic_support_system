import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMenuCsv } from "./menu-csv";

describe("parseMenuCsv", () => {
  it("normalizes valid menu rows", () => {
    const result = parseMenuCsv(
      "section,name,description,price,dietary_tags,allergens,available\n" +
        "Mains,Roasted Cauliflower Bowl,Herbs and tahini,GBP 14,vegan|gluten-free,sesame,yes\n"
    );

    assert.deepEqual(result.invalidRows, []);
    assert.deepEqual(result.rows, [
      {
        section: "Mains",
        name: "Roasted Cauliflower Bowl",
        description: "Herbs and tahini",
        priceLabel: "GBP 14",
        dietaryTags: ["vegan", "gluten-free"],
        allergens: ["sesame"],
        available: true
      }
    ]);
  });

  it("reports row numbers for missing required fields and keeps valid rows", () => {
    const result = parseMenuCsv(
      "section,name,description,price,dietary_tags,allergens,available\n" +
        ",Nameless Section,,,,,\n" +
        "Desserts,Lemon Tart,,GBP 8,vegetarian,gluten|milk,no\n"
    );

    assert.deepEqual(result.rows.map((row) => row.name), ["Lemon Tart"]);
    assert.deepEqual(result.invalidRows, [
      {
        rowNumber: 2,
        reason: "section and name are required"
      }
    ]);
  });
});
