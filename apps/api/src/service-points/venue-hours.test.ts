import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVenueChatAvailability, type VenueOpeningHourWindow } from "./venue-hours";

const mondayOpenLate: VenueOpeningHourWindow = {
  closesAt: "02:00",
  dayOfWeek: 1,
  isClosed: false,
  opensAt: "20:00"
};

describe("venue hours", () => {
  it("keeps chat open inside same-day opening hours", () => {
    const availability = getVenueChatAvailability({
      now: new Date("2026-05-25T13:30:00.000Z"),
      openingHours: [
        {
          closesAt: "17:00",
          dayOfWeek: 1,
          isClosed: false,
          opensAt: "09:00"
        }
      ],
      timezone: "UTC"
    });

    assert.equal(availability.isOpen, true);
    assert.equal(availability.reason, "open");
  });

  it("keeps chat open after midnight for overnight venue hours", () => {
    const availability = getVenueChatAvailability({
      now: new Date("2026-05-26T00:30:00.000Z"),
      openingHours: [mondayOpenLate],
      timezone: "UTC"
    });

    assert.equal(availability.isOpen, true);
    assert.equal(availability.reason, "open");
  });

  it("closes chat outside configured venue hours", () => {
    const availability = getVenueChatAvailability({
      now: new Date("2026-05-25T18:00:00.000Z"),
      openingHours: [
        {
          closesAt: "17:00",
          dayOfWeek: 1,
          isClosed: false,
          opensAt: "09:00"
        }
      ],
      timezone: "UTC"
    });

    assert.equal(availability.isOpen, false);
    assert.equal(availability.reason, "closed");
  });
});
