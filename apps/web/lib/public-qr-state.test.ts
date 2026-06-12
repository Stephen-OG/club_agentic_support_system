import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPublicQrServicePoint } from "./public-qr-state";

describe("public QR state", () => {
  it("reads the canonical servicePoint response field", () => {
    assert.deepEqual(
      getPublicQrServicePoint({
        servicePoint: { id: "sp_1", label: "Table 1", venueId: "venue_1", locationId: null, isActive: true }
      }),
      { id: "sp_1", label: "Table 1", venueId: "venue_1", locationId: null, isActive: true }
    );
  });

  it("keeps legacy qrPoint responses working during the service-point rename", () => {
    assert.deepEqual(
      getPublicQrServicePoint({
        qrPoint: { id: "sp_2", label: "Bar", venueId: "venue_1", locationId: null, isActive: true }
      }),
      { id: "sp_2", label: "Bar", venueId: "venue_1", locationId: null, isActive: true }
    );
  });
});
