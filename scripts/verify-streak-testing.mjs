/**
 * Smoke test for missed-yesterday streak simulation helpers.
 * Run: node scripts/verify-streak-testing.mjs
 */
import assert from "node:assert/strict";

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(key, delta) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDayKey(d);
}

function buildMissedYesterdayVisitDates(priorStreakDays, referenceDate = new Date()) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(priorStreakDays)));
  const today = utcDayKey(referenceDate);
  const visitDates = [today];
  for (let i = 0; i < safeDays; i += 1) {
    visitDates.push(addUtcDays(today, -2 - i));
  }
  return visitDates;
}

function computeStreakRestorePreview(visitDates, streakCurrent, referenceDate = new Date()) {
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

const ref = new Date("2026-07-30T15:00:00.000Z");
const today = utcDayKey(ref);
const yesterday = addUtcDays(today, -1);

const visits = buildMissedYesterdayVisitDates(7, ref);
assert.equal(visits.length, 8, "today + 7 prior days");
assert.equal(visits[0], today);
assert(!visits.includes(yesterday), "yesterday must be omitted");

const preview = computeStreakRestorePreview(visits, 1, ref);
assert.equal(preview.eligible, true);
assert.equal(preview.brokenStreak, 7);

const badStreak = computeStreakRestorePreview(visits, 5, ref);
assert.equal(badStreak.eligible, false);

console.log("streak testing helpers: OK");
