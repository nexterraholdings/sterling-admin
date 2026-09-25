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
