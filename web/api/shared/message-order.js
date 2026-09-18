function sortMessages(messages, unreadOnly) {
  const direction = unreadOnly ? 1 : -1;
  messages.sort(
    (a, b) =>
      direction * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  );
  return messages;
}

function getPageSize(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 10;
  return Math.min(20, Math.max(1, Number.parseInt(value, 10)));
}

function formatDeviceTimestamp(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.filter(part => part.type !== "literal").map(part => [part.type, part.value])
    );
    return `${values.month} ${values.day}, ${values.hour}:${values.minute} ${values.dayPeriod}`;
  } catch {
    return formatDeviceTimestamp(value, "UTC");
  }
}

module.exports = { formatDeviceTimestamp, getPageSize, sortMessages };
