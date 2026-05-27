export type VenueOpeningHourWindow = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type VenueChatAvailability = {
  isOpen: boolean;
  reason: "open" | "closed" | "hours_not_configured";
};

const minutesPerDay = 24 * 60;

function parseTimeToMinutes(time: string) {
  const parts = time.split(":");
  const hours = Number.parseInt(parts[0] ?? "", 10);
  const minutes = Number.parseInt(parts[1] ?? "", 10);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function getLocalDayAndMinute(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone,
    weekday: "short"
  }).formatToParts(now);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = valueByType.get("weekday") || "Sun";
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const hour = Number.parseInt(valueByType.get("hour") || "0", 10);
  const minute = Number.parseInt(valueByType.get("minute") || "0", 10);

  return {
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : now.getUTCDay(),
    minuteOfDay: hour * 60 + minute
  };
}

function previousDay(dayOfWeek: number) {
  return (dayOfWeek + 6) % 7;
}

function isInsideWindow(localMinute: number, opensAt: number, closesAt: number) {
  if (opensAt === closesAt) {
    return true;
  }

  if (opensAt < closesAt) {
    return localMinute >= opensAt && localMinute < closesAt;
  }

  return localMinute >= opensAt || localMinute < closesAt;
}

export function getVenueChatAvailability(input: {
  now?: Date;
  openingHours: VenueOpeningHourWindow[];
  timezone: string;
}): VenueChatAvailability {
  const { dayOfWeek, minuteOfDay } = getLocalDayAndMinute(input.now ?? new Date(), input.timezone);

  if (!input.openingHours.length) {
    return { isOpen: true, reason: "hours_not_configured" };
  }

  const relevantHours = input.openingHours.filter((hours) => hours.dayOfWeek === dayOfWeek || hours.dayOfWeek === previousDay(dayOfWeek));

  for (const hours of relevantHours) {
    if (hours.isClosed) {
      continue;
    }

    const opensAt = parseTimeToMinutes(hours.opensAt);
    const closesAt = parseTimeToMinutes(hours.closesAt);

    if (opensAt === null || closesAt === null) {
      continue;
    }

    const adjustedMinute =
      hours.dayOfWeek === previousDay(dayOfWeek) && opensAt > closesAt ? minuteOfDay + minutesPerDay : minuteOfDay;
    const adjustedClosesAt = opensAt > closesAt ? closesAt + minutesPerDay : closesAt;

    if (hours.dayOfWeek === dayOfWeek && isInsideWindow(minuteOfDay, opensAt, closesAt)) {
      return { isOpen: true, reason: "open" };
    }

    if (hours.dayOfWeek === previousDay(dayOfWeek) && opensAt > closesAt && adjustedMinute >= opensAt && adjustedMinute < adjustedClosesAt) {
      return { isOpen: true, reason: "open" };
    }
  }

  return { isOpen: false, reason: "closed" };
}
