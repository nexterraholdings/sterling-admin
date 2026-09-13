import { supabaseAdmin } from "@/lib/supabase/server";
import { isPropAccountEmail } from "@/lib/prop-accounts";
import { requireAdmin, ANALYST_ROLES } from "./dal";

export type RoleDistribution = { name: string; count: number; percentage: number; color: string };
export type CategoryBreakdown = { name: string; count: number; percentage: number; color: string };
export type TimeSeriesPoint = { label: string; value: number };
export type TrendingHub = {
  id: string;
  title: string;
  location_hint: string | null;
  recent_comment_count: number;
  total_comment_count: number;
  participant_count: number;
};
export type PropAccountsSummary = {
  total: number;
  newThisWeek: number;
  activeThisWeek: number;
  totalPosts: number;
  postsThisWeek: number;
  commentsThisWeek: number;
};

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

function dailyTrend(rows: { created_at: string }[], days: number, now: Date): TimeSeriesPoint[] {
  const byDate: Record<string, number> = {};
  const order: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    byDate[key] = 0;
    order.push(key);
  }
  rows.forEach((row) => {
    const d = new Date(row.created_at);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (byDate[key] !== undefined) byDate[key]++;
  });
  return order.map((label) => ({ label, value: byDate[label] }));
}

export async function fetchAnalytics() {
  await requireAdmin(ANALYST_ROLES);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    profilesRes,
    reportsRes,
    postsRes,
    hubsRes,
    reportsWeekRes,
    profilesGrowthRes,
    postsWeekRes,
    commentsWeekRes,
  ] = await Promise.all([
    // All profiles for role distribution
    supabaseAdmin
      .from("profiles")
      .select("id,email,account_role,role,operating_markets,moderation_strike_count"),

    // All reports for category breakdown
    supabaseAdmin
      .from("reports")
      .select("category,status,report_type,created_at"),

    // All posts for post type distribution + author for activity
    supabaseAdmin
      .from("posts")
      .select("post_type,author_id,created_at"),

    // Hubs (area_discussions) for the trending list
    supabaseAdmin
      .from("area_discussions")
      .select("id,title,location_hint,comment_count,unique_participant_count")
      .order("comment_count", { ascending: false })
      .limit(200),

    // Reports this week for trend
    supabaseAdmin
      .from("reports")
      .select("created_at")
      .gte("created_at", weekAgo.toISOString()),

    // Profiles for the last two weeks, to chart daily growth
    supabaseAdmin
      .from("profiles")
      .select("created_at,email")
      .gte("created_at", twoWeeksAgo.toISOString()),

    // Posts this week for trend + activity
    supabaseAdmin
      .from("posts")
      .select("created_at,author_id")
      .gte("created_at", weekAgo.toISOString()),

    // Hub comments this week for trending hubs + activity
    supabaseAdmin
      .from("area_discussion_comments")
      .select("discussion_id,created_at,author_id")
      .gte("created_at", weekAgo.toISOString())
      .limit(5000),
  ]);

  // Prop accounts (generated for seeding groups/hubs, always @sterlingtest.local)
  // are admin tooling, not real users. They're split out everywhere below
  // rather than just dropped — the "real" numbers exclude them so seeded
  // content never inflates growth or engagement, but their own footprint is
  // still surfaced separately so it isn't silently invisible either.
  const allProfiles = (profilesRes.data ?? []) as any[];
  const profiles = allProfiles.filter((p: any) => !isPropAccountEmail(p.email));
  const propProfiles = allProfiles.filter((p: any) => isPropAccountEmail(p.email));
  const propAccountIds = new Set(propProfiles.map((p: any) => String(p.id)));

  const reports = (reportsRes.data ?? []) as any[];
  const allPosts = (postsRes.data ?? []) as any[];
  const posts = allPosts.filter((p: any) => !propAccountIds.has(String(p.author_id ?? "")));
  const propPosts = allPosts.filter((p: any) => propAccountIds.has(String(p.author_id ?? "")));
  const hubs = (hubsRes.data ?? []) as any[];
  const reportsWeek = (reportsWeekRes.data ?? []) as any[];
  const allProfilesGrowth = (profilesGrowthRes.data ?? []) as any[];
  const profilesGrowth = allProfilesGrowth.filter((p: any) => !isPropAccountEmail(p.email));
  const propProfilesGrowth = allProfilesGrowth.filter((p: any) => isPropAccountEmail(p.email));
  const allPostsWeek = (postsWeekRes.data ?? []) as any[];
  const postsWeek = allPostsWeek.filter((p: any) => !propAccountIds.has(String(p.author_id ?? "")));
  const propPostsWeek = allPostsWeek.filter((p: any) => propAccountIds.has(String(p.author_id ?? "")));
  const allCommentsWeek = (commentsWeekRes.data ?? []) as any[];
  const commentsWeek = allCommentsWeek.filter((c: any) => !propAccountIds.has(String(c.author_id ?? "")));
  const propCommentsWeek = allCommentsWeek.filter((c: any) => propAccountIds.has(String(c.author_id ?? "")));

  // ── User role distribution ──
  const roleCounts: Record<string, number> = {};
  profiles.forEach((p: any) => {
    const role = p.account_role ?? "user";
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

  // ── Moderation stats ──
  const usersWithStrikes = profiles.filter((p: any) => (p.moderation_strike_count ?? 0) > 0).length;
  const avgStrikes = profiles.length > 0
    ? (profiles.reduce((sum: number, p: any) => sum + (p.moderation_strike_count ?? 0), 0) / profiles.length).toFixed(1)
    : "0";

  // ── Weekly trends (reports, posts) ──
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const reportsByDay: Record<string, number> = {};
  const postsByDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayNames[d.getDay()];
    reportsByDay[key] = 0;
    postsByDay[key] = 0;
  }
  reportsWeek.forEach((r: any) => {
    const key = dayNames[new Date(r.created_at).getDay()];
    if (reportsByDay[key] !== undefined) reportsByDay[key]++;
  });
  postsWeek.forEach((p: any) => {
    const key = dayNames[new Date(p.created_at).getDay()];
    if (postsByDay[key] !== undefined) postsByDay[key]++;
  });
  const reportTrend: TimeSeriesPoint[] = Object.entries(reportsByDay).map(([label, value]) => ({ label, value }));
  const postTrend: TimeSeriesPoint[] = Object.entries(postsByDay).map(([label, value]) => ({ label, value }));

  // ── User growth: daily new signups over the last 14 days ──
  const userGrowthTrend = dailyTrend(profilesGrowth, 14, now);
  const newUsersThisWeek = profilesGrowth.filter((p: any) => new Date(p.created_at) >= weekAgo).length;
  const newUsersLastWeek = profilesGrowth.filter(
    (p: any) => new Date(p.created_at) >= twoWeeksAgo && new Date(p.created_at) < weekAgo,
  ).length;
  const userGrowthPct = newUsersLastWeek > 0
    ? Math.round(((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100)
    : newUsersThisWeek > 0 ? 100 : 0;

  // ── Account activity: posts + hub comments per day, distinct active accounts ──
  const activityByDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    activityByDay[dayNames[d.getDay()]] = 0;
  }
  postsWeek.forEach((p: any) => {
    const key = dayNames[new Date(p.created_at).getDay()];
    if (activityByDay[key] !== undefined) activityByDay[key]++;
  });
  commentsWeek.forEach((c: any) => {
    const key = dayNames[new Date(c.created_at).getDay()];
    if (activityByDay[key] !== undefined) activityByDay[key]++;
  });
  const accountActivityTrend: TimeSeriesPoint[] = Object.entries(activityByDay).map(([label, value]) => ({ label, value }));

  const activeAccountIds = new Set<string>();
  postsWeek.forEach((p: any) => { if (p.author_id) activeAccountIds.add(String(p.author_id)); });
  commentsWeek.forEach((c: any) => { if (c.author_id) activeAccountIds.add(String(c.author_id)); });
  const activeAccounts = activeAccountIds.size;

  // ── Trending hubs: ranked by comment activity in the last 7 days, falling
  // back to lifetime comment_count when nothing has happened recently ──
  const recentCommentsByHub: Record<string, number> = {};
  commentsWeek.forEach((c: any) => {
    const id = String(c.discussion_id ?? "");
    if (!id) return;
    recentCommentsByHub[id] = (recentCommentsByHub[id] ?? 0) + 1;
  });
  const trendingHubs: TrendingHub[] = hubs
    .map((h: any) => ({
      id: String(h.id),
      title: String(h.title ?? "Untitled hub"),
      location_hint: h.location_hint ?? null,
      recent_comment_count: recentCommentsByHub[String(h.id)] ?? 0,
      total_comment_count: h.comment_count ?? 0,
      participant_count: h.unique_participant_count ?? 0,
    }))
    .sort((a, b) => (b.recent_comment_count - a.recent_comment_count) || (b.total_comment_count - a.total_comment_count))
    .slice(0, 8);

  // ── Prop accounts: surfaced separately, never folded into the numbers above ──
  const propActiveAccountIds = new Set<string>();
  propPostsWeek.forEach((p: any) => { if (p.author_id) propActiveAccountIds.add(String(p.author_id)); });
  propCommentsWeek.forEach((c: any) => { if (c.author_id) propActiveAccountIds.add(String(c.author_id)); });
  const propAccounts: PropAccountsSummary = {
    total: propAccountIds.size,
    newThisWeek: propProfilesGrowth.filter((p: any) => new Date(p.created_at) >= weekAgo).length,
    activeThisWeek: propActiveAccountIds.size,
    totalPosts: propPosts.length,
    postsThisWeek: propPostsWeek.length,
    commentsThisWeek: propCommentsWeek.length,
  };

  return {
    totalUsers,
    roleDistribution,
    totalReports,
    categoryBreakdown,
    statusCounts,
    totalPosts,
    postTypeCounts,
    marketCounts,
    reportTrend,
    postTrend,
    usersWithStrikes,
    avgStrikes,
    userGrowthTrend,
    newUsersThisWeek,
    newUsersLastWeek,
    userGrowthPct,
    accountActivityTrend,
    activeAccounts,
    trendingHubs,
    propAccounts,
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof fetchAnalytics>>;
