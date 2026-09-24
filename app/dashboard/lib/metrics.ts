import { supabaseAdmin } from "@/lib/supabase/server";
import { PROP_ACCOUNT_EMAIL_PATTERN } from "@/lib/prop-accounts";

function minus(total: number | null | undefined, seeded: number | null | undefined): number {
  return Math.max(0, (total ?? 0) - (seeded ?? 0));
}

async function countSeededTopLevelPosts(propAccountIds: string[]): Promise<number> {
  if (propAccountIds.length === 0) return 0;
  const chunkSize = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < propAccountIds.length; i += chunkSize) {
    chunks.push(propAccountIds.slice(i, i + chunkSize));
  }
  const counts = await Promise.all(
    chunks.map(async (chunk) => {
      const { count } = await supabaseAdmin
        .from("area_discussion_comments")
        .select("id", { count: "exact", head: true })
        .is("parent_id", null)
        .in("author_id", chunk);
      return count ?? 0;
    })
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

export async function fetchDashboardMetrics() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekIso = weekAgo.toISOString();

  // Prop accounts (seeded for group/hub content, always @sterlingtest.local)
  // are admin tooling, not real users. User headline numbers are total − seeded
  // so a fragile `not.ilike` filter can't accidentally keep them in the count.
  const { data: propAccountRows } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", PROP_ACCOUNT_EMAIL_PATTERN)
    .limit(10000);
  const propAccountIds = (propAccountRows ?? []).map((row: { id: string }) => String(row.id));

  const [
    usersAllRes,
    usersSeededRes,
    pendingFlagsRes,
    reportsTodayRes,
    modActionsRes,
    newUsersTodayAllRes,
    newUsersTodaySeededRes,
    hubPostsAllRes,
    reportsWeekRes,
    usersWeekAllRes,
    usersWeekSeededRes,
    hubPostsSeeded,
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .ilike("email", PROP_ACCOUNT_EMAIL_PATTERN),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayIso),

    supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }),

    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayIso),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .ilike("email", PROP_ACCOUNT_EMAIL_PATTERN)
      .gte("created_at", todayIso),

    // Live feed posts live in hub/group threads, not the legacy `posts` table.
    supabaseAdmin
      .from("area_discussion_comments")
      .select("id", { count: "exact", head: true })
      .is("parent_id", null),

    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekIso),

    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekIso),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .ilike("email", PROP_ACCOUNT_EMAIL_PATTERN)
      .gte("created_at", weekIso),

    countSeededTopLevelPosts(propAccountIds),
  ]);

  return {
    activeUsers: minus(usersAllRes.count, usersSeededRes.count),
    pendingFlags: pendingFlagsRes.count ?? 0,
    reportsToday: reportsTodayRes.count ?? 0,
    modActions: modActionsRes.count ?? 0,
    newUsersToday: minus(newUsersTodayAllRes.count, newUsersTodaySeededRes.count),
    totalPosts: minus(hubPostsAllRes.count, hubPostsSeeded),
    reportsThisWeek: reportsWeekRes.count ?? 0,
    newUsersThisWeek: minus(usersWeekAllRes.count, usersWeekSeededRes.count),
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof fetchDashboardMetrics>>;
