import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLocationPayload,
  createOpeningHoursPayload,
  createServicePointPayload,
  createServicePointUpdatePayload,
  servicePointGuestUrl,
  venueWideGuestUrl
} from "./venue-controls";

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

  it("builds QR point update payloads with nullable locations", () => {
    assert.deepEqual(createServicePointUpdatePayload({ label: "  Patio Door  ", locationId: "" }), {
      label: "Patio Door",
      locationId: null
    });
    assert.deepEqual(createServicePointUpdatePayload({ label: "DJ Booth", locationId: "location_2" }), {
      label: "DJ Booth",
      locationId: "location_2"
    });
  });

  it("trims new zone names before submission", () => {
    assert.deepEqual(createLocationPayload({ name: "  Upstairs Bar  " }), {
      name: "Upstairs Bar"
    });
  });

  it("strips database-only fields from opening-hours updates", () => {
    assert.deepEqual(
      createOpeningHoursPayload([
        {
          id: "hours_1",
          venueId: "venue_1",
          dayOfWeek: 1,
          opensAt: "10:00",
          closesAt: "02:00",
          isClosed: false,
          createdAt: "2026-05-27T08:00:00.000Z",
          updatedAt: "2026-05-27T09:00:00.000Z"
        },
        {
          dayOfWeek: 2,
          opensAt: "11:00",
          closesAt: "23:00",
          isClosed: true
        }
      ]),
      {
        openingHours: [
          {
            dayOfWeek: 1,
            opensAt: "10:00",
            closesAt: "02:00",
            isClosed: false
          },
          {
            dayOfWeek: 2,
            opensAt: "11:00",
            closesAt: "23:00",
            isClosed: true
          }
        ]
      }
    );
  });
});
