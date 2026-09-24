import { supabaseAdmin } from "@/lib/supabase/server";
import { EXCLUDE_PROP_ACCOUNT_EMAIL_OR, isPropAccountEmail } from "@/lib/prop-accounts";

export type ActivityItem = {
  id: string;
  type: "report" | "user" | "moderation" | "post";
  title: string;
  detail: string;
  timestamp: string;
  severity?: "low" | "medium" | "high" | "critical";
};

export async function fetchRecentActivity(): Promise<{
  activity: ActivityItem[];
  alerts: ActivityItem[];
  changes: ActivityItem[];
}> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const [reportsRes, usersRes] = await Promise.all([
    supabaseAdmin
      .from("reports")
      .select("id,created_at,category,description,status,report_type")
      .gte("created_at", threeDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(20),

    supabaseAdmin
      .from("profiles")
      .select("id,created_at,full_name,username,account_role,email")
      .or(EXCLUDE_PROP_ACCOUNT_EMAIL_OR)
      .gte("created_at", threeDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const reports: ActivityItem[] = ((reportsRes.data ?? []) as any[]).map((r) => ({
    id: `report-${r.id}`,
    type: "report" as const,
    title: `New ${r.report_type} report`,
    detail: (r.description ?? r.category ?? "No description").slice(0, 100),
    timestamp: timeAgo(r.created_at),
    severity: r.status === "pending" ? "high" as const : "medium" as const,
  }));

  const users: ActivityItem[] = ((usersRes.data ?? []) as any[])
    .filter((u) => !isPropAccountEmail(u.email))
    .slice(0, 10)
    .map((u) => ({
      id: `user-${u.id}`,
      type: "user" as const,
      title: u.full_name ?? u.username ?? "New user",
      detail: `Joined as ${u.account_role}`,
      timestamp: timeAgo(u.created_at),
      severity: "low" as const,
    }));

  const allActivity = [...reports, ...users].sort(
    (a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp)
  );

  return {
    activity: allActivity.slice(0, 10),
    alerts: reports.filter((r) => r.severity === "high").slice(0, 5),
    changes: users.slice(0, 5),
  };
}

function parseTimestamp(ts: string): number {
  const now = Date.now();
  if (ts.includes("min")) return now - parseInt(ts) * 60 * 1000;
  if (ts.includes("hr")) return now - parseInt(ts) * 3600 * 1000;
  if (ts.includes("d")) return now - parseInt(ts) * 86400 * 1000;
  return now;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}