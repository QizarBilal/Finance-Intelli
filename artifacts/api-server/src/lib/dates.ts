export type WeekStart = "monday" | "sunday";

export function zonedDateParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function dateString(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function calendarDate(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

function addDays(value: Date, days: number) {
  const copy = new Date(value); copy.setUTCDate(copy.getUTCDate() + days); return copy;
}

function fromDate(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function periodRange(
  period: "today" | "weekly" | "monthly" | "yearly",
  timeZone = "UTC",
  weekStarts: WeekStart = "monday",
  now = new Date(),
) {
  const parts = zonedDateParts(now, timeZone);
  const current = calendarDate(parts);
  if (period === "today") return { from: dateString(parts), to: dateString(parts) };
  if (period === "weekly") {
    const day = current.getUTCDay();
    const offset = weekStarts === "sunday" ? day : (day + 6) % 7;
    return {
      from: dateString(fromDate(addDays(current, -offset))),
      to: dateString(fromDate(addDays(current, 6 - offset))),
    };
  }
  if (period === "monthly") {
    return {
      from: dateString({ ...parts, day: 1 }),
      to: dateString({ year: parts.year, month: parts.month, day: new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate() }),
    };
  }
  return { from: `${parts.year}-01-01`, to: `${parts.year}-12-31` };
}

export function nextOccurrence(date: string, frequency: string, interval = 1): string {
  const current = new Date(`${date}T12:00:00Z`);
  if (frequency === "daily") current.setUTCDate(current.getUTCDate() + interval);
  else if (frequency === "weekly") current.setUTCDate(current.getUTCDate() + 7 * interval);
  else {
    const originalDay = current.getUTCDate();
    const months = frequency === "monthly" ? interval : frequency === "quarterly" ? 3 * interval : 12 * interval;
    const target = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, 1, 12));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
    target.setUTCDate(Math.min(originalDay, lastDay));
    current.setTime(target.getTime());
  }
  return current.toISOString().slice(0, 10);
}
