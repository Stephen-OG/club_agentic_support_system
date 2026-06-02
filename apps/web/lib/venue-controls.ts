type ServicePointDraft = {
  label: string;
  locationId?: string | null;
};

type LocationDraft = {
  name: string;
};

type OpeningHourDraft = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  [key: string]: unknown;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function venueWideGuestUrl(origin: string, slug: string) {
  return `${trimTrailingSlash(origin)}/venue/${slug}`;
}

export function servicePointGuestUrl(origin: string, qrToken: string) {
  return `${trimTrailingSlash(origin)}/qr/${qrToken}`;
}

export function createServicePointPayload(draft: ServicePointDraft) {
  const label = draft.label.trim();
  const locationId = draft.locationId?.trim();

  return {
    label,
    ...(locationId ? { locationId } : {})
  };
}

export function createServicePointUpdatePayload(draft: ServicePointDraft) {
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
