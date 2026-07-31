"use server";

import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { describeUser, logAdminAction } from "@/app/dashboard/lib/audit-log";
import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import {
  assertValidUserId,
  addUtcDays,
  buildMissedYesterdayVisitDates,
  computeServerStreakRestorePreview,
  utcDayKey,
} from "@/lib/testing/streakSimulation";

export type UserSearchResult = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  referral_count: number;
};

export type UserStreakSnapshot = {
  userId: string;
  streakCurrent: number;
  streakLongest: number;
  lastVisitDate: string | null;
  visitDates: string[];
  restoreEligible: boolean;
  brokenStreak: number;
};

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — testing helpers require service-role access."
    );
  }
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/[\\%,.():]/g, (c) => `\\${c}`);
}

function normalizeVisitDates(rows: { visit_date: unknown }[] | null | undefined): string[] {
  return (rows ?? []).map((row) => String(row.visit_date).slice(0, 10));
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  await getCurrentAdmin();
  requireServiceRole();
  const term = query.trim();
  if (!term) return [];

  const escaped = escapeIlikeTerm(term);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,username,full_name,referral_count")
    .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,username.ilike.%${escaped}%`)
    .order("full_name", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    email: row.email != null ? String(row.email) : null,
    username: row.username != null ? String(row.username) : null,
    full_name: row.full_name != null ? String(row.full_name) : null,
    referral_count: Number(row.referral_count ?? 0),
  }));
}

export async function fetchUserStreakSnapshot(userId: string): Promise<UserStreakSnapshot> {
  await getCurrentAdmin();
  requireServiceRole();
  assertValidUserId(userId);

  const [
    { data: profile, error: profileErr },
    { data: appStreak, error: appStreakErr },
    { data: visitDays, error: visitDaysErr },
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("streak_current,streak_longest,last_visit_date")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_app_streaks")
      .select("streak_current,streak_longest,last_visit_date,last_broken_streak,visit_dates")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_app_visit_days")
      .select("visit_date")
      .eq("user_id", userId)
      .order("visit_date", { ascending: false })
      .limit(31),
  ]);

  if (profileErr) throw new Error(profileErr.message);
  if (appStreakErr) throw new Error(appStreakErr.message);
  if (visitDaysErr) throw new Error(visitDaysErr.message);
  if (!profile) throw new Error("User not found");

  const visitDatesFromDays = normalizeVisitDates(visitDays);
  const visitDatesFromStreak = Array.isArray(appStreak?.visit_dates)
    ? appStreak.visit_dates.map((d: unknown) => String(d).slice(0, 10))
    : [];
  const visitDates = visitDatesFromDays.length > 0 ? visitDatesFromDays : visitDatesFromStreak;

  const streakCurrent = Number(appStreak?.streak_current ?? profile.streak_current ?? 0);
  const streakLongest = Math.max(
    Number(profile.streak_longest ?? 0),
    Number(appStreak?.streak_longest ?? 0),
  );
  const lastVisitDate = (appStreak?.last_visit_date ?? profile.last_visit_date)
    ? String(appStreak?.last_visit_date ?? profile.last_visit_date).slice(0, 10)
    : null;

  const restore = computeServerStreakRestorePreview({
    streakCurrent,
    lastVisitDate,
    lastBrokenStreak: Number(appStreak?.last_broken_streak ?? 0),
    visitDates,
  });

  return {
    userId,
    streakCurrent,
    streakLongest,
    lastVisitDate,
    visitDates,
    restoreEligible: restore.eligible,
    brokenStreak: restore.brokenStreak,
  };
}

/**
 * Sets server state to "opened today but skipped yesterday" so SterlingMobile
 * streak restore UI can be exercised (map overlay → missed day on week row).
 */
export async function simulateMissedStreakYesterday(params: {
  targetUserId: string;
  priorStreakDays?: number;
}): Promise<UserStreakSnapshot> {
  const admin = await getCurrentAdmin();
  requireServiceRole();
  assertValidUserId(params.targetUserId);
  const priorStreakDays = Math.max(1, Math.min(30, Math.floor(Number(params.priorStreakDays ?? 7) || 7)));

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("streak_longest")
    .eq("id", params.targetUserId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  if (!profile) throw new Error("User not found");

  const { data: existingStreak } = await supabaseAdmin
    .from("user_app_streaks")
    .select("streak_longest")
    .eq("user_id", params.targetUserId)
    .maybeSingle();

  const today = utcDayKey();
  const yesterday = addUtcDays(today, -1);
  const visitDates = buildMissedYesterdayVisitDates(priorStreakDays);
  const nextLongest = Math.max(
    Number(profile.streak_longest ?? 0),
    Number(existingStreak?.streak_longest ?? 0),
    priorStreakDays + 1,
  );

  const { error: deleteVisitDaysErr } = await supabaseAdmin
    .from("user_app_visit_days")
    .delete()
    .eq("user_id", params.targetUserId);
  if (deleteVisitDaysErr) throw new Error(deleteVisitDaysErr.message);

  const { error: deleteVisitsErr } = await supabaseAdmin
    .from("user_visits")
    .delete()
    .eq("user_id", params.targetUserId);
  if (deleteVisitsErr) throw new Error(deleteVisitsErr.message);

  const { error: insertVisitDaysErr } = await supabaseAdmin.from("user_app_visit_days").insert(
    visitDates.map((visit_date) => ({
      user_id: params.targetUserId,
      visit_date,
    })),
  );
  if (insertVisitDaysErr) throw new Error(insertVisitDaysErr.message);

  const { error: insertVisitsErr } = await supabaseAdmin.from("user_visits").insert(
    visitDates.map((visit_date) => ({
      user_id: params.targetUserId,
      visit_date,
    })),
  );
  if (insertVisitsErr) throw new Error(insertVisitsErr.message);

  const { error: upsertStreakErr } = await supabaseAdmin.from("user_app_streaks").upsert(
    {
      user_id: params.targetUserId,
      streak_current: 1,
      streak_longest: nextLongest,
      last_visit_date: today,
      last_broken_streak: priorStreakDays,
      visit_dates: visitDates,
    },
    { onConflict: "user_id" },
  );
  if (upsertStreakErr) throw new Error(upsertStreakErr.message);

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({
      streak_current: 1,
      streak_longest: nextLongest,
      last_visit_date: today,
    })
    .eq("id", params.targetUserId);
  if (updateErr) throw new Error(updateErr.message);

  const snapshot = await fetchUserStreakSnapshot(params.targetUserId);

  if (!snapshot.restoreEligible || snapshot.brokenStreak !== priorStreakDays) {
    throw new Error(
      `Simulation wrote data but restore preview failed (eligible=${snapshot.restoreEligible}, broken=${snapshot.brokenStreak}, expected=${priorStreakDays}). Check user_app_streaks / user_app_visit_days.`,
    );
  }

  await logAdminAction({
    category: "admin",
    action: "simulate_missed_streak_yesterday",
    detail: `Set missed-yesterday streak test for ${await describeUser(params.targetUserId)} (${priorStreakDays}-day broken streak). Yesterday ${yesterday} omitted; today ${today} recorded.`,
    targetType: "user",
    targetId: params.targetUserId,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return snapshot;
}
