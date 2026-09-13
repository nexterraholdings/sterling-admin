import { supabaseAdmin } from "@/lib/supabase/server";
import { PROP_ACCOUNT_EMAIL_SUFFIX } from "@/lib/prop-accounts";

export async function fetchDashboardMetrics() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Prop accounts (seeded for group/hub content, always @sterlingtest.local)
  // are admin tooling, not real users — excluded from every count below so
  // seeded activity never inflates these headline numbers.
  const { data: propAccountRows } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", `%${PROP_ACCOUNT_EMAIL_SUFFIX}`)
    .limit(10000);
  const propAccountIds = (propAccountRows ?? []).map((row: { id: string }) => String(row.id));
  // Postgres's NULL semantics mean a plain `.not(col, "ilike"/"in", ...)` would
  // also silently exclude rows where the column itself is null — an `.or()`
  // that explicitly keeps nulls avoids undercounting real users/posts that
  // just don't have an email/author on file.
  const notPropEmail = "email.is.null,email.not.ilike." + `%${PROP_ACCOUNT_EMAIL_SUFFIX}`;
  const notPropAuthor =
    propAccountIds.length > 0 ? `author_id.is.null,author_id.not.in.(${propAccountIds.join(",")})` : null;

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
      .select("id", { count: "exact", head: true })
      .or(notPropEmail),

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
      .or(notPropEmail)
      .gte("created_at", todayStart.toISOString()),

    notPropAuthor
      ? supabaseAdmin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .or(notPropAuthor)
      : supabaseAdmin.from("posts").select("id", { count: "exact", head: true }),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString()),

    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .or(notPropEmail)
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
