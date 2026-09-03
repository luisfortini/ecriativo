const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

export function zonedDateTime(date: string, time: string | null | undefined, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = String(time || "00:00:00").split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error("Data ou horário inválido no planejamento.");
  }

  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let timestamp = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(timestamp), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    timestamp += desiredAsUtc - actualAsUtc;
  }
  return new Date(timestamp);
}

export function zonedDateKey(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function zonedHourKey(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}`;
}

export function zonedWeekday(value: Date, timeZone: string) {
  let formatter = weekdayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
    weekdayFormatters.set(timeZone, formatter);
  }
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return weekdays[formatter.format(value)];
}

export function calendarDayDifference(currentDate: string, startDate: string) {
  return Math.floor((parseCalendarDate(currentDate) - parseCalendarDate(startDate)) / 86_400_000);
}

function zonedParts(value: Date, timeZone: string) {
  let formatter = dateTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    dateTimeFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function parseCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
