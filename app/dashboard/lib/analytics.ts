import { supabaseAdmin } from "@/lib/supabase/server";

export type RoleDistribution = { name: string; count: number; percentage: number; color: string };
export type CategoryBreakdown = { name: string; count: number; percentage: number; color: string };
export type TimeSeriesPoint = { label: string; value: number };

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-rose-500",
  moderator: "bg-amber-500",
  member: "bg-emerald-500",
  creator: "bg-blue-500",
  owner: "bg-violet-500",
  banned: "bg-zinc-500",
};

const CATEGORY_COLORS: Record<string, string> = {
  hate_speech: "bg-rose-500",
  harassment: "bg-rose-400",
  spam: "bg-amber-500",
  misinformation: "bg-amber-400",
  nudity: "bg-violet-500",
  violence: "bg-red-600",
  impersonation: "bg-blue-500",
  crash: "bg-zinc-500",
  ui_issue: "bg-zinc-400",
  performance: "bg-zinc-300",
  data_loss: "bg-orange-500",
  other: "bg-zinc-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  hate_speech: "Hate Speech",
  harassment: "Harassment",
  spam: "Spam",
  misinformation: "Misinformation",
  nudity: "Nudity / NSFW",
  violence: "Violence",
  impersonation: "Impersonation",
  crash: "App Crash",
  ui_issue: "UI Issue",
  performance: "Performance",
  data_loss: "Data Loss",
  other: "Other",
};

export async function fetchAnalytics() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    profilesRes,
    reportsRes,
    postsRes,
    eventsRes,
    reportsWeekRes,
    profilesWeekRes,
    postsWeekRes,
    eventsWeekRes,
  ] = await Promise.all([
    // All profiles for role distribution
    supabaseAdmin
      .from("profiles")
      .select("account_role,role,operating_markets,moderation_strike_count"),

    // All reports for category breakdown
    supabaseAdmin
      .from("reports")
      .select("category,status,report_type,created_at"),

    // All posts for post type distribution
    supabaseAdmin
      .from("posts")
      .select("post_type,likes_count,comments_count,created_at"),

    // Events
    supabaseAdmin
      .from("events")
      .select("event_type,is_private,attendee_count,starts_at,created_at"),

    // Reports this week for trend
    supabaseAdmin
      .from("reports")
      .select("created_at")
      .gte("created_at", weekAgo.toISOString()),

    // Profiles this week for trend
    supabaseAdmin
      .from("profiles")
      .select("created_at")
      .gte("created_at", monthAgo.toISOString()),

    // Posts this week for trend
    supabaseAdmin
      .from("posts")
      .select("created_at")
      .gte("created_at", weekAgo.toISOString()),

    // Events this week for trend
    supabaseAdmin
      .from("events")
      .select("created_at")
      .gte("created_at", weekAgo.toISOString()),
  ]);

  const profiles = (profilesRes.data ?? []) as any[];
  const reports = (reportsRes.data ?? []) as any[];
  const posts = (postsRes.data ?? []) as any[];
  const events = (eventsRes.data ?? []) as any[];
  const reportsWeek = (reportsWeekRes.data ?? []) as any[];
  const profilesWeek = (profilesWeekRes.data ?? []) as any[];
  const postsWeek = (postsWeekRes.data ?? []) as any[];
  const eventsWeek = (eventsWeekRes.data ?? []) as any[];

  // ── User role distribution ──
  const roleCounts: Record<string, number> = {};
  profiles.forEach((p: any) => {
    const role = p.account_role ?? "member";
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  });
  const totalUsers = profiles.length;
  const roleDistribution: RoleDistribution[] = Object.entries(roleCounts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0,
      color: ROLE_COLORS[name] ?? "bg-zinc-200",
    }))
    .sort((a, b) => b.count - a.count);

  // ── Report category breakdown ──
  const categoryCounts: Record<string, number> = {};
  reports.forEach((r: any) => {
    const cat = r.category ?? "other";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  });
  const totalReports = reports.length;
  const categoryBreakdown: CategoryBreakdown[] = Object.entries(categoryCounts)
    .map(([name, count]) => ({
      name: CATEGORY_LABELS[name] ?? name,
      count,
      percentage: totalReports > 0 ? Math.round((count / totalReports) * 100) : 0,
      color: CATEGORY_COLORS[name] ?? "bg-zinc-200",
    }))
    .sort((a, b) => b.count - a.count);

  // ── Report status breakdown ──
  const statusCounts: Record<string, number> = {};
  reports.forEach((r: any) => {
    const s = r.status ?? "pending";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });

  // ── Post type distribution ──
  const postTypeCounts: Record<string, number> = {};
  posts.forEach((p: any) => {
    const t = p.post_type ?? "general";
    postTypeCounts[t] = (postTypeCounts[t] ?? 0) + 1;
  });
  const totalPosts = posts.length;

  // ── Market distribution ──
  const marketCounts: Record<string, number> = {};
  profiles.forEach((p: any) => {
    const markets = p.operating_markets ?? [];
    (Array.isArray(markets) ? markets : []).forEach((m: string) => {
      marketCounts[m] = (marketCounts[m] ?? 0) + 1;
    });
  });

  // ── Weekly trend (reports per day this week) ──
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const reportsByDay: Record<string, number> = {};
  const postsByDay: Record<string, number> = {};
  const usersByDay: Record<string, number> = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayNames[d.getDay()];
    reportsByDay[key] = 0;
    postsByDay[key] = 0;
    usersByDay[key] = 0;
  }

  reportsWeek.forEach((r: any) => {
    const d = new Date(r.created_at);
    const key = dayNames[d.getDay()];
    if (reportsByDay[key] !== undefined) reportsByDay[key]++;
  });
  postsWeek.forEach((p: any) => {
    const d = new Date(p.created_at);
    const key = dayNames[d.getDay()];
    if (postsByDay[key] !== undefined) postsByDay[key]++;
  });
  profilesWeek.forEach((p: any) => {
    const d = new Date(p.created_at);
    const key = dayNames[d.getDay()];
    if (usersByDay[key] !== undefined) usersByDay[key]++;
  });

  const reportTrend: TimeSeriesPoint[] = Object.entries(reportsByDay).map(([label, value]) => ({ label, value }));
  const postTrend: TimeSeriesPoint[] = Object.entries(postsByDay).map(([label, value]) => ({ label, value }));
  const userTrend: TimeSeriesPoint[] = Object.entries(usersByDay).map(([label, value]) => ({ label, value }));

  // ── Moderation stats ──
  const usersWithStrikes = profiles.filter((p: any) => (p.moderation_strike_count ?? 0) > 0).length;
  const avgStrikes = profiles.length > 0
    ? (profiles.reduce((sum: number, p: any) => sum + (p.moderation_strike_count ?? 0), 0) / profiles.length).toFixed(1)
    : "0";

  // ── Event stats ──
  const totalEvents = events.length;
  const upcomingEvents = events.filter((e: any) => e.starts_at && new Date(e.starts_at) >= now).length;
  const pastEvents = totalEvents - upcomingEvents;
  const privateEvents = events.filter((e: any) => e.is_private).length;
  const publicEvents = totalEvents - privateEvents;
  const avgAttendees = totalEvents > 0
    ? (events.reduce((sum: number, e: any) => sum + (e.attendee_count ?? 0), 0) / totalEvents).toFixed(1)
    : "0";

  const eventTypeCounts: Record<string, number> = {};
  events.forEach((e: any) => {
    const t = e.event_type ?? "other";
    eventTypeCounts[t] = (eventTypeCounts[t] ?? 0) + 1;
  });

  const eventsByDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    eventsByDay[dayNames[d.getDay()]] = 0;
  }
  eventsWeek.forEach((e: any) => {
    const d = new Date(e.created_at);
    const key = dayNames[d.getDay()];
    if (eventsByDay[key] !== undefined) eventsByDay[key]++;
  });
  const eventTrend: TimeSeriesPoint[] = Object.entries(eventsByDay).map(([label, value]) => ({ label, value }));

  return {
    totalUsers,
    totalReports,
    totalPosts,
    roleDistribution,
    categoryBreakdown,
    statusCounts,
    postTypeCounts,
    marketCounts,
    reportTrend,
    postTrend,
    userTrend,
    usersWithStrikes,
    avgStrikes,
    totalEvents,
    upcomingEvents,
    pastEvents,
    privateEvents,
    publicEvents,
    avgAttendees,
    eventTypeCounts,
    eventTrend,
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof fetchAnalytics>>;