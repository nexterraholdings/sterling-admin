/** Pure helpers — keep in sync with SterlingMobile streakRestore.computeStreakRestoreEligibility. */

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDayKey(d);
}

export function buildMissedYesterdayVisitDates(priorStreakDays: number, referenceDate = new Date()): string[] {
  const safeDays = Math.max(1, Math.min(30, Math.floor(priorStreakDays)));
  const today = utcDayKey(referenceDate);
  const visitDates = [today];
  for (let i = 0; i < safeDays; i += 1) {
    visitDates.push(addUtcDays(today, -2 - i));
  }
  return visitDates;
}

export function computeStreakRestorePreview(
  visitDates: string[],
  streakCurrent: number,
  referenceDate = new Date(),
): { eligible: boolean; brokenStreak: number } {
  if (streakCurrent !== 1 || visitDates.length === 0) {
    return { eligible: false, brokenStreak: 0 };
  }

  const today = utcDayKey(referenceDate);
  const yesterday = addUtcDays(today, -1);
  const dayBeforeYesterday = addUtcDays(today, -2);
  const visits = new Set(visitDates.map((d) => d.slice(0, 10)));

  if (!visits.has(today) || visits.has(yesterday) || !visits.has(dayBeforeYesterday)) {
    return { eligible: false, brokenStreak: 0 };
  }

  let brokenStreak = 0;
  let cursor = dayBeforeYesterday;
  while (visits.has(cursor)) {
    brokenStreak += 1;
    cursor = addUtcDays(cursor, -1);
  }

  if (brokenStreak < 1) {
    return { eligible: false, brokenStreak: 0 };
  }

  return { eligible: true, brokenStreak };
}

/** Mirrors `get_streak_restore_status()` eligibility (user_app_streaks + user_app_visit_days). */
export function computeServerStreakRestorePreview(params: {
  streakCurrent: number;
  lastVisitDate: string | null;
  lastBrokenStreak: number;
  visitDates: string[];
  referenceDate?: Date;
}): { eligible: boolean; brokenStreak: number } {
  const today = utcDayKey(params.referenceDate);
  const yesterday = addUtcDays(today, -1);
  const visits = new Set(params.visitDates.map((d) => d.slice(0, 10)));
  const lastVisit = params.lastVisitDate?.slice(0, 10) ?? null;
  const brokenStreak = Math.max(0, Math.floor(params.lastBrokenStreak));

  const eligible =
    lastVisit === today
    && params.streakCurrent === 1
    && brokenStreak > 0
    && !visits.has(yesterday);

  return { eligible, brokenStreak: eligible ? brokenStreak : 0 };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidUserId(userId: string): void {
  if (!UUID_RE.test(userId)) {
    throw new Error("Invalid user id");
  }
}
