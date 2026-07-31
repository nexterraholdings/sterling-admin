import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(key, delta) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDayKey(d);
}

function buildMissedYesterdayVisitDates(priorStreakDays) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(priorStreakDays)));
  const today = utcDayKey();
  const visitDates = [today];
  for (let i = 0; i < safeDays; i += 1) {
    visitDates.push(addUtcDays(today, -2 - i));
  }
  return visitDates;
}

function computeServerStreakRestorePreview(params) {
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

const { data: users, error: uerr } = await admin
  .from("profiles")
  .select("id,email,username")
  .ilike("email", "%test%")
  .limit(1);

if (uerr) {
  console.error("user fetch:", uerr.message);
  process.exit(1);
}

const fallback = await admin.from("profiles").select("id,email,username").limit(1);
const user = users?.[0] ?? fallback.data?.[0];
if (!user) {
  console.error("No users found");
  process.exit(1);
}

console.log("test user:", user.email || user.username || user.id);

const priorStreakDays = 7;
const visitDates = buildMissedYesterdayVisitDates(priorStreakDays);
const today = utcDayKey();
console.log("visit dates to insert:", visitDates.join(", "));

for (const table of ["user_app_visit_days", "user_visits"]) {
  const { error } = await admin.from(table).delete().eq("user_id", user.id);
  if (error) {
    console.error(`delete ${table}:`, error.message);
    process.exit(1);
  }
}

const { error: insertVisitDaysErr } = await admin
  .from("user_app_visit_days")
  .insert(visitDates.map((visit_date) => ({ user_id: user.id, visit_date })));
if (insertVisitDaysErr) {
  console.error("insert user_app_visit_days:", insertVisitDaysErr.message);
  process.exit(1);
}

const { error: insertVisitsErr } = await admin
  .from("user_visits")
  .insert(visitDates.map((visit_date) => ({ user_id: user.id, visit_date })));
if (insertVisitsErr) {
  console.error("insert user_visits:", insertVisitsErr.message);
  process.exit(1);
}

const { error: upsertErr } = await admin.from("user_app_streaks").upsert(
  {
    user_id: user.id,
    streak_current: 1,
    streak_longest: 8,
    last_visit_date: today,
    last_broken_streak: priorStreakDays,
    visit_dates: visitDates,
  },
  { onConflict: "user_id" },
);
if (upsertErr) {
  console.error("upsert user_app_streaks:", upsertErr.message);
  process.exit(1);
}

const { error: updateErr } = await admin
  .from("profiles")
  .update({ streak_current: 1, streak_longest: 8, last_visit_date: today })
  .eq("id", user.id);
if (updateErr) {
  console.error("update profiles:", updateErr.message);
  process.exit(1);
}

const { data: appStreak } = await admin
  .from("user_app_streaks")
  .select("streak_current,last_visit_date,last_broken_streak")
  .eq("user_id", user.id)
  .maybeSingle();

const { data: visitDays } = await admin
  .from("user_app_visit_days")
  .select("visit_date")
  .eq("user_id", user.id)
  .order("visit_date", { ascending: false })
  .limit(31);

const visitDateStrs = (visitDays ?? []).map((r) => String(r.visit_date).slice(0, 10));
const preview = computeServerStreakRestorePreview({
  streakCurrent: Number(appStreak?.streak_current ?? 0),
  lastVisitDate: appStreak?.last_visit_date ? String(appStreak.last_visit_date).slice(0, 10) : null,
  lastBrokenStreak: Number(appStreak?.last_broken_streak ?? 0),
  visitDates: visitDateStrs,
});

console.log("user_app_streaks:", appStreak);
console.log("visit days:", visitDateStrs.join(", "));
console.log("preview:", preview);

if (preview.eligible && preview.brokenStreak === priorStreakDays) {
  console.log("SIMULATION OK");
} else {
  console.error("SIMULATION FAILED");
  process.exit(1);
}
