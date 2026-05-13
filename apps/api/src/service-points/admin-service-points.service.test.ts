import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServicePointsService } from "./service-points.service";

describe("ServicePointsService admin helpers", () => {
  it("creates URL-safe QR tokens", () => {
    const service = new ServicePointsService({} as never, {} as never, {} as never, {} as never);
    const token = service.createQrToken("Main Bar");

    assert.match(token, /^sp_[a-z0-9_]+_[a-f0-9]{24}$/);
  });
});
