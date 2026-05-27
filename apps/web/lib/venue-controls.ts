type ServicePointDraft = {
  label: string;
  locationId?: string;
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
