import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClientChatTimestamp } from "./chat-time";

describe("client chat timestamps", () => {
  it("formats message timestamps with hour and minute precision", () => {
    assert.equal(formatClientChatTimestamp(new Date(2026, 5, 3, 23, 39, 26), "en-GB"), "23:39");
  });

  it("returns an empty string for unavailable timestamps", () => {
    assert.equal(formatClientChatTimestamp("not-a-date"), "");
  });
});
