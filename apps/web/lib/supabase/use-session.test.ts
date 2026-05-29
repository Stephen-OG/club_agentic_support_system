import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldNotifySessionChange } from "./use-session";

describe("Supabase session cache", () => {
  it("notifies subscribers when the initial unknown session resolves to signed out", () => {
    assert.equal(shouldNotifySessionChange(undefined, null), true);
  });

  it("does not notify subscribers when the same resolved session repeats", () => {
    const session = {
      access_token: "token_1",
      user: {
        id: "auth_user_1"
      }
    };

    assert.equal(shouldNotifySessionChange(session as never, session as never), false);
  });
});
