export const DEFAULT_ZONE = "America/New_York";

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isTimeZone(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

export function dateKeyIn(zone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function hourIn(zone: string, date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(hour);
}

export function weekdayIn(zone: string, date = new Date()): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(date);
  return WEEKDAY_INDEX[label] ?? 0;
}

function zoneOffsetMs(zone: string, at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** UTC instant of an hour and minute on a calendar day (`YYYY-MM-DD`) in `zone`. */
export function instantIn(zone: string, dayKey: string, hour: number, minute = 0): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const wall = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, Math.min(23, Math.max(0, hour)), Math.min(59, Math.max(0, minute)));
  let at = wall - zoneOffsetMs(zone, wall);
  at = wall - zoneOffsetMs(zone, at);
  return new Date(at);
}

export function dayKeysAheadIn(zone: string, count: number, from = new Date()): string[] {
  const keys: string[] = [];
  let cursor = instantIn(zone, dateKeyIn(zone, from), 12, 0);
  for (let index = 0; index < count; index += 1) {
    keys.push(dateKeyIn(zone, cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

/** UTC instant of midnight in `zone` for that zone's calendar day of `date`. */
export function startOfDayIn(zone: string, date = new Date()): string {
  return instantIn(zone, dateKeyIn(zone, date), 0, 0).toISOString();
}

export function nyDateKey(date = new Date()): string {
  return dateKeyIn(DEFAULT_ZONE, date);
}

export function nyHour(date = new Date()): number {
  return hourIn(DEFAULT_ZONE, date);
}

export function nyWeekday(date = new Date()): number {
  return weekdayIn(DEFAULT_ZONE, date);
}

export function nyInstant(dayKey: string, hour: number, minute = 0): Date {
  return instantIn(DEFAULT_ZONE, dayKey, hour, minute);
}

export function nyDayKeysAhead(count: number, from = new Date()): string[] {
  return dayKeysAheadIn(DEFAULT_ZONE, count, from);
}

export function startOfNyDay(date = new Date()): string {
  return startOfDayIn(DEFAULT_ZONE, date);
}

/** `endHour` is exclusive. Equal hours means the window is open all day. */
export function withinActiveHours(startHour: number, endHour: number, hour = nyHour()): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

export function minutesFromNow(min: number, max: number): string {
  const span = Math.max(0, max - min);
  const minutes = min + Math.random() * span;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
