import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServicePointPayload, servicePointGuestUrl, venueWideGuestUrl } from "./venue-controls";

describe("venue controls", () => {
  it("builds guest URLs for venue-wide and service-point QR codes", () => {
    assert.equal(venueWideGuestUrl("https://app.example.com", "blue-note"), "https://app.example.com/venue/blue-note");
    assert.equal(servicePointGuestUrl("https://app.example.com/", "qr_table_1"), "https://app.example.com/qr/qr_table_1");
  });

  it("trims service-point labels and omits blank location IDs", () => {
    assert.deepEqual(createServicePointPayload({ label: "  VIP Booth  ", locationId: "" }), {
      label: "VIP Booth"
    });
    assert.deepEqual(createServicePointPayload({ label: "Bar 1", locationId: "location_1" }), {
      label: "Bar 1",
      locationId: "location_1"
    });
  });
});
