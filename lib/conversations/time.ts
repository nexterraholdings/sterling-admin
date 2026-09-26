const NY = "America/New_York";

export function nyDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function nyHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(hour);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function nyWeekday(date = new Date()): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: NY, weekday: "short" }).format(date);
  return WEEKDAY_INDEX[label] ?? 0;
}

/** UTC instant of an hour and minute on an America/New_York calendar day (`YYYY-MM-DD`). */
export function nyInstant(dayKey: string, hour: number, minute = 0): Date {
  const hh = String(Math.min(23, Math.max(0, hour))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, minute))).padStart(2, "0");
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const offset of ["-04:00", "-05:00"]) {
    const instant = new Date(`${dayKey}T${hh}:${mm}:00${offset}`);
    const parts = Object.fromEntries(fmt.formatToParts(instant).map((part) => [part.type, part.value]));
    const got = `${parts.year}-${parts.month}-${parts.day}`;
    if (got === dayKey && Number(parts.hour) === Number(hh) && Number(parts.minute) === Number(mm)) return instant;
  }
  return new Date(`${dayKey}T${hh}:${mm}:00-04:00`);
}

export function nyDayKeysAhead(count: number, from = new Date()): string[] {
  const keys: string[] = [];
  let cursor = nyInstant(nyDateKey(from), 12, 0);
  for (let index = 0; index < count; index += 1) {
    keys.push(nyDateKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

/** UTC instant of midnight in America/New_York for the NY calendar day of `date`. */
export function startOfNyDay(date = new Date()): string {
  const key = nyDateKey(date);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const offset of ["-04:00", "-05:00"]) {
    const instant = new Date(`${key}T00:00:00${offset}`);
    const parts = Object.fromEntries(fmt.formatToParts(instant).map((part) => [part.type, part.value]));
    const got = `${parts.year}-${parts.month}-${parts.day}`;
    if (got === key && parts.hour === "00") return instant.toISOString();
  }
  return new Date(`${key}T04:00:00.000Z`).toISOString();
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
