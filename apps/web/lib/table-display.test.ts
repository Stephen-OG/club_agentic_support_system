import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTableDisplay } from "./table-display";

describe("getTableDisplay", () => {
  it("uses seeded demo tokens for normal demo tables", () => {
    assert.deepEqual(getTableDisplay("demo-table-4"), {
      label: "Table 4",
      tableToken: "demo-table-4"
    });
  });

  it("treats demo-table-5 as the seeded VIP table alias", () => {
    assert.deepEqual(getTableDisplay("demo-table-5"), {
      label: "VIP 1",
      tableToken: "demo-vip-1"
    });
  });

  it("formats unknown tokens as a readable label without changing the token", () => {
    assert.deepEqual(getTableDisplay("patio-bar-2"), {
      label: "Patio Bar 2",
      tableToken: "patio-bar-2"
    });
  });
});
