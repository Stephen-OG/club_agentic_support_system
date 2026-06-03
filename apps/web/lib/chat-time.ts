export function formatClientChatTimestamp(value: string | Date, locale?: string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit"
  });
}
