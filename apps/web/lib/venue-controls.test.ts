import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminVenueLocationsPath,
  adminVenueOpeningHoursPath,
  adminVenuesPath,
  adminVenueServicePointPath,
  adminVenueServicePointsPath,
  createLocationPayload,
  createOpeningHoursPayload,
  createQrPointPayload,
  createQrPointUpdatePayload,
  getVenueChatAvailabilityPreview,
  normalizeOpeningHours,
  resolveGuestAppOrigin,
  qrPointGuestUrl,
  venueWideGuestUrl
} from "./venue-controls";

describe("venue controls", () => {
  it("prefers the configured app URL when building public guest links", () => {
    assert.equal(resolveGuestAppOrigin("https://madupe.com/", "https://preview.vercel.app"), "https://madupe.com");
    assert.equal(resolveGuestAppOrigin("", "https://preview.vercel.app"), "https://preview.vercel.app");
    assert.equal(resolveGuestAppOrigin(undefined, undefined), "http://127.0.0.1:3000");
  });

  it("builds guest URLs for venue-wide and service-point QR codes", () => {
    assert.equal(venueWideGuestUrl("https://app.example.com", "blue-note"), "https://app.example.com/venue/blue-note");
    assert.equal(qrPointGuestUrl("https://app.example.com/", "qr_table_1"), "https://app.example.com/qr/qr_table_1");
  });

  it("builds admin venue control paths used by the API", () => {
    assert.equal(adminVenuesPath(), "/admin/venues");
    assert.equal(adminVenueLocationsPath("venue_1"), "/admin/venues/venue_1/locations");
    assert.equal(adminVenueOpeningHoursPath("venue_1"), "/admin/venues/venue_1/opening-hours");
    assert.equal(adminVenueServicePointsPath("venue_1"), "/admin/venues/venue_1/service-points");
    assert.equal(adminVenueServicePointPath("venue_1", "point_1"), "/admin/venues/venue_1/service-points/point_1");
  });

  it("trims service-point labels and omits blank location IDs", () => {
    assert.deepEqual(createQrPointPayload({ label: "  VIP Booth  ", locationId: "" }), {
      label: "VIP Booth"
    });
    assert.deepEqual(createQrPointPayload({ label: "Bar 1", locationId: "location_1" }), {
      label: "Bar 1",
      locationId: "location_1"
    });
  });

  it("builds QR point update payloads with nullable locations", () => {
    assert.deepEqual(createQrPointUpdatePayload({ label: "  Patio Door  ", locationId: "" }), {
      label: "Patio Door",
      locationId: null
    });
    assert.deepEqual(createQrPointUpdatePayload({ label: "DJ Booth", locationId: "location_2" }), {
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

  it("previews venue chat availability from opening hours and timezone", () => {
    const openingHours = normalizeOpeningHours([
      { dayOfWeek: 1, opensAt: "09:00", closesAt: "17:00", isClosed: false },
      { dayOfWeek: 2, opensAt: "18:00", closesAt: "02:00", isClosed: false }
    ]);

    assert.deepEqual(
      getVenueChatAvailabilityPreview(openingHours, "Europe/London", new Date("2026-06-01T10:00:00.000Z")),
      { isOpen: true, label: "Chat open now" }
    );
    assert.deepEqual(
      getVenueChatAvailabilityPreview(openingHours, "Europe/London", new Date("2026-06-01T20:00:00.000Z")),
      { isOpen: false, label: "Chat closed now" }
    );
    assert.deepEqual(
      getVenueChatAvailabilityPreview(openingHours, "Europe/London", new Date("2026-06-03T00:30:00.000Z")),
      { isOpen: true, label: "Chat open now" }
    );
  });
});
