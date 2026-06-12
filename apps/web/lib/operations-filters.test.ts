import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultOperationsFilters,
  getOperationsFilterChips,
  getOperationsFilterOptions,
  getOperationsPriorityLabel,
  runOperationsFilterPipeline
} from "./operations-filters";

const requests = [
  {
    id: "request-1",
    title: "Water",
    category: "drink",
    priority: "LOW",
    createdAt: "2026-06-03T09:00:00.000Z",
    satisfactionRating: null,
    qrPoint: { label: "Table 1" }
  },
  {
    id: "request-2",
    title: "Payment",
    category: "payment",
    priority: "HIGH",
    createdAt: "2026-06-02T10:00:00.000Z",
    satisfactionRating: 2,
    qrPoint: { label: "Table 5" }
  },
  {
    id: "request-3",
    title: "Safety",
    category: "safety",
    priority: "URGENT",
    createdAt: "2026-05-27T08:00:00.000Z",
    satisfactionRating: 5,
    qrPoint: { label: "Bar" }
  },
  {
    id: "request-4",
    title: "Long wait",
    category: "long_wait",
    priority: "NORMAL",
    createdAt: "2026-06-01T12:00:00.000Z",
    satisfactionRating: 4,
    qrPoint: { label: "Table 12" }
  }
] as const;

describe("operations filters", () => {
  it("normalizes LOW as normal for visible priority filters", () => {
    assert.equal(getOperationsPriorityLabel("LOW"), "Normal");
    assert.equal(getOperationsPriorityLabel("NORMAL"), "Normal");
    assert.equal(getOperationsPriorityLabel("HIGH"), "High");
    assert.equal(getOperationsPriorityLabel("URGENT"), "Urgent");
  });

  it("filters by date range, rating, priority, category, and table search", () => {
    const filtered = runOperationsFilterPipeline(
      requests,
      {
        ...defaultOperationsFilters,
        categories: ["payment"],
        dateRange: "last_7_days",
        priorities: ["HIGH"],
        rating: 2,
        tableQuery: "table 5"
      },
      new Date("2026-06-03T12:00:00.000Z")
    );

    assert.deepEqual(filtered.map((request) => request.id), ["request-2"]);
  });

  it("treats low-priority legacy rows as normal when filtering", () => {
    const filtered = runOperationsFilterPipeline(requests, { ...defaultOperationsFilters, priorities: ["NORMAL"] }, new Date("2026-06-03T12:00:00.000Z"));

    assert.deepEqual(
      filtered.map((request) => request.id),
      ["request-1", "request-4"]
    );
  });

  it("sorts requests by selected table and wait options", () => {
    const byTable = runOperationsFilterPipeline(requests, { ...defaultOperationsFilters, sortBy: "table", sortDirection: "asc" });
    const byWait = runOperationsFilterPipeline(requests, { ...defaultOperationsFilters, sortBy: "wait", sortDirection: "desc" });

    assert.deepEqual(
      byTable.map((request) => request.id),
      ["request-3", "request-1", "request-4", "request-2"]
    );
    assert.deepEqual(
      byWait.map((request) => request.id),
      ["request-3", "request-4", "request-2", "request-1"]
    );
  });

  it("uses completion time for the default completed tab order", () => {
    const filtered = runOperationsFilterPipeline(
      [
        {
          id: "request-1",
          title: "Urgent old completion",
          category: "safety",
          priority: "URGENT",
          createdAt: "2026-06-02T09:00:00.000Z",
          completedAt: "2026-06-02T10:00:00.000Z",
          satisfactionRating: 5,
          qrPoint: { label: "Table 1" }
        },
        {
          id: "request-2",
          title: "Normal newer completion",
          category: "drink",
          priority: "NORMAL",
          createdAt: "2026-06-02T09:05:00.000Z",
          completedAt: "2026-06-02T10:20:00.000Z",
          satisfactionRating: 4,
          qrPoint: { label: "Table 2" }
        }
      ],
      defaultOperationsFilters,
      new Date("2026-06-03T12:00:00.000Z"),
      "completed"
    );

    assert.deepEqual(
      filtered.map((request) => request.id),
      ["request-2", "request-1"]
    );
  });

  it("keeps urgent priority pinned only for the default active tab order", () => {
    const filtered = runOperationsFilterPipeline(
      [
        {
          id: "request-1",
          title: "Normal first",
          category: "drink",
          priority: "NORMAL",
          createdAt: "2026-06-02T09:00:00.000Z",
          satisfactionRating: null,
          qrPoint: { label: "Table 1" }
        },
        {
          id: "request-2",
          title: "Urgent second",
          category: "safety",
          priority: "URGENT",
          createdAt: "2026-06-02T09:05:00.000Z",
          satisfactionRating: null,
          qrPoint: { label: "Table 2" }
        }
      ],
      defaultOperationsFilters,
      new Date("2026-06-03T12:00:00.000Z"),
      "active"
    );

    assert.deepEqual(
      filtered.map((request) => request.id),
      ["request-2", "request-1"]
    );
  });


  it("derives category and table options from current requests", () => {
    assert.deepEqual(getOperationsFilterOptions(requests), {
      categories: ["drink", "long_wait", "payment", "safety"],
      tables: ["Bar", "Table 1", "Table 12", "Table 5"]
    });
  });

  it("creates concise active filter chips", () => {
    const chips = getOperationsFilterChips({
      ...defaultOperationsFilters,
      categories: ["payment", "safety"],
      dateRange: "last_30_days",
      priorities: ["URGENT"],
      rating: 5,
      sortBy: "rating",
      sortDirection: "desc",
      tableQuery: "table"
    });

    assert.deepEqual(chips, [
      "Date: Last 30 days",
      "Rating: 5 stars",
      "Priority: Urgent",
      "Types: 2 selected",
      "Table: table",
      "Sort: Rating high to low"
    ]);
  });
});
