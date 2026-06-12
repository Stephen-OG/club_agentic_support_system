type QrPointDraft = {
  label: string;
  locationId?: string | null;
};

type LocationDraft = {
  name: string;
};

export type OpeningHourDraft = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  [key: string]: unknown;
};

export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function defaultOpeningHours(): OpeningHourDraft[] {
  return weekdayLabels.map((_, dayOfWeek) => ({
    closesAt: "23:00",
    dayOfWeek,
    isClosed: false,
    opensAt: "09:00"
  }));
}

export function normalizeOpeningHours(hours: OpeningHourDraft[] | undefined) {
  const byDay = new Map((hours || []).map((item) => [item.dayOfWeek, item]));
  return defaultOpeningHours().map((fallback) => byDay.get(fallback.dayOfWeek) ?? fallback);
}

export function getVenueChatAvailabilityPreview(openingHours: OpeningHourDraft[], timeZone: string, now: Date = new Date()) {
  const normalized = normalizeOpeningHours(openingHours);
  const current = timePartsForZone(now, timeZone);
  const currentHours = normalized[current.dayOfWeek];
  const previousHours = normalized[(current.dayOfWeek + 6) % 7];
  const isOpen =
    isTimeInsideHours(current.minutes, currentHours) ||
    isTimeInsidePreviousOvernightHours(current.minutes, previousHours);

  return {
    isOpen,
    label: isOpen ? "Chat open now" : "Chat closed now"
  };
}

function isTimeInsideHours(minutes: number, hours: OpeningHourDraft) {
  if (!hours || hours.isClosed) {
    return false;
  }

  const opensAt = timeToMinutes(hours.opensAt);
  const closesAt = timeToMinutes(hours.closesAt);

  if (closesAt <= opensAt) {
    return minutes >= opensAt || minutes < closesAt;
  }

  return minutes >= opensAt && minutes < closesAt;
}

function isTimeInsidePreviousOvernightHours(minutes: number, hours: OpeningHourDraft) {
  if (!hours || hours.isClosed) {
    return false;
  }

  const opensAt = timeToMinutes(hours.opensAt);
  const closesAt = timeToMinutes(hours.closesAt);

  return closesAt <= opensAt && minutes < closesAt;
}

function timePartsForZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short"
  }).formatToParts(now);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const dayOfWeek = weekdayLabels.indexOf(valueByType.get("weekday") ?? "Sun");
  const hour = Number(valueByType.get("hour") ?? "0");
  const minute = Number(valueByType.get("minute") ?? "0");

  return {
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0,
    minutes: hour * 60 + minute
  };
}

function timeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveGuestAppOrigin(configuredOrigin?: string, browserOrigin?: string) {
  const origin = configuredOrigin?.trim() || browserOrigin?.trim() || "http://127.0.0.1:3000";
  return trimTrailingSlash(origin);
}

export function venueWideGuestUrl(origin: string, slug: string) {
  return `${trimTrailingSlash(origin)}/venue/${slug}`;
}

export function qrPointGuestUrl(origin: string, qrToken: string) {
  return `${trimTrailingSlash(origin)}/qr/${qrToken}`;
}

export function adminVenuesPath() {
  return "/admin/venues";
}

export function adminVenueLocationsPath(venueId: string) {
  return `/admin/venues/${venueId}/locations`;
}

export function adminVenueOpeningHoursPath(venueId: string) {
  return `/admin/venues/${venueId}/opening-hours`;
}

export function adminVenueServicePointsPath(venueId: string) {
  return `/admin/venues/${venueId}/service-points`;
}

export function adminVenueServicePointPath(venueId: string, servicePointId: string) {
  return `${adminVenueServicePointsPath(venueId)}/${servicePointId}`;
}

export function createQrPointPayload(draft: QrPointDraft) {
  const label = draft.label.trim();
  const locationId = draft.locationId?.trim();

  return {
    label,
    ...(locationId ? { locationId } : {})
  };
}

export function createQrPointUpdatePayload(draft: QrPointDraft) {
  const label = draft.label.trim();
  const locationId = draft.locationId?.trim();

  return {
    label,
    locationId: locationId || null
  };
}

export function createLocationPayload(draft: LocationDraft) {
  return {
    name: draft.name.trim()
  };
}

export function createOpeningHoursPayload(openingHours: OpeningHourDraft[]) {
  return {
    openingHours: openingHours.map((hours) => ({
      dayOfWeek: hours.dayOfWeek,
      opensAt: hours.opensAt,
      closesAt: hours.closesAt,
      isClosed: hours.isClosed
    }))
  };
}
