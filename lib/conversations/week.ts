export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DEFAULT_WEEK_DAYS = 127;
export const DEFAULT_WEEK_START = 9;
export const DEFAULT_WEEK_END = 21;
export const DEFAULT_WEEK_EVERY = 120;
export const DEFAULT_CALLS_PER_DAY = 8;

export function parseWeekDays(value: number | string | null | undefined): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(127, Math.max(0, parsed));
}

export function parseWeekHour(value: number | string | null | undefined, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parseEveryMinutes(value: number | string | null | undefined): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_WEEK_EVERY;
  const hours = Math.min(6, Math.max(1, Math.round(parsed / 60)));
  return hours * 60;
}

export function parseCallsPerDay(value: number | string | null | undefined): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_CALLS_PER_DAY;
  return Math.min(40, Math.max(1, parsed));
}

export function dayOn(days: number, index: number): boolean {
  return (parseWeekDays(days) & (1 << index)) !== 0;
}

export function toggleDay(days: number, index: number): number {
  return parseWeekDays(days) ^ (1 << index);
}

export function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function postsInWindow(startHour: number, endHour: number, everyMinutes: number, callsPerDay: number, repliesPerPost: number): number {
  if (endHour <= startHour || everyMinutes < 30) return 0;
  const span = (endHour - startHour) * 60;
  const slots = Math.floor((span - 1) / everyMinutes) + 1;
  const cost = 1 + Math.max(0, Math.min(6, repliesPerPost));
  const byCalls = Math.floor(parseCallsPerDay(callsPerDay) / cost);
  if (byCalls < 1) return 0;
  return Math.min(slots, byCalls, 12);
}

export function daySummary(days: number): string {
  const on = WEEKDAY_LABELS.filter((_, index) => dayOn(days, index));
  if (on.length === 7) return "Every day";
  if (on.join(",") === "Mon,Tue,Wed,Thu,Fri") return "Weekdays";
  if (on.join(",") === "Sun,Sat") return "Weekends";
  return on.join(", ");
}

export function describeWeek(days: number, startHour: number, endHour: number, everyMinutes: number, callsPerDay: number): string {
  const hours = Math.max(1, Math.round(everyMinutes / 60));
  const calls = parseCallsPerDay(callsPerDay);
  return `${daySummary(days)}, ${formatHour(startHour)}–${formatHour(endHour)}, every ${hours} ${hours === 1 ? "hour" : "hours"}, ${calls} ${calls === 1 ? "call" : "calls"} a day`;
}
