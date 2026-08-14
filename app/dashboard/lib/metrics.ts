import { supabaseAdmin } from "@/lib/supabase/server";

export async function fetchDashboardMetrics() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    usersRes,
    pendingFlagsRes,
    reportsTodayRes,
    modActionsRes,
    newUsersTodayRes,
    totalPostsRes,
    reportsWeekRes,
    usersWeekRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true }),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),

    supabaseAdmin
      .from("audit_logs")
      .select("id", { count: "exact", head: true }),

    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),

    supabaseAdmin
      .from("posts")
      .select("id", { count: "exact", head: true }),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString()),

    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString()),
  ]);

  return {
    activeUsers:       usersRes.count        ?? 0,
    pendingFlags:      pendingFlagsRes.count  ?? 0,
    reportsToday:      reportsTodayRes.count  ?? 0,
    modActions:        modActionsRes.count    ?? 0,
    newUsersToday:     newUsersTodayRes.count ?? 0,
    totalPosts:        totalPostsRes.count    ?? 0,
    reportsThisWeek:   reportsWeekRes.count   ?? 0,
    newUsersThisWeek:  usersWeekRes.count     ?? 0,
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof fetchDashboardMetrics>>;