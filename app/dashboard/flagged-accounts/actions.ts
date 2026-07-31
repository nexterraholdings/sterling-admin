"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type { Report } from "@/lib/types";
import { strikeUser as strikeUserAction, banUser as banUserAction } from "@/app/dashboard/moderation/actions";
import {
  fetchActiveBans as fetchActiveBansAction,
  fetchActiveDeviceBans as fetchActiveDeviceBansAction,
  unbanUser as unbanUserAction,
} from "@/app/dashboard/banned-users/actions";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — flagged accounts require service-role access."
    );
  }
}

async function assertAdmin(): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = "Critical" | "High" | "Medium" | "Low";

export type FlaggedAccount = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  account_role: string;
  created_at: string;
  moderationStrikeCount: number;
  suspicionScore: number;
  suspicionSignals: string[];
  severity: Severity;
};

type PostEntry = {
  id: string;
  body?: string | null;
  author_username?: string | null;
  community_name?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  image_urls?: string[] | null;
  post_type?: string | null;
};

export type ReportedPostEntry = {
  id: string;
  category?: string | null;
  description?: string | null;
  status?: string | null;
  review_priority?: string | null;
  offense_label?: string | null;
  created_at?: string;
  post_id?: string | null;
  post: PostEntry | null;
};

// ---------------------------------------------------------------------------
// Suspicion scoring (copied from the former suspicious-accounts/actions.ts)
// ---------------------------------------------------------------------------

const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_MIN_POSTS = 5;
const DUPLICATE_MIN_POSTS = 3;
const NEW_ACCOUNT_MAX_AGE_DAYS = 3;
const NEW_ACCOUNT_MIN_POSTS = 10;
const NO_PROFILE_MIN_POSTS = 5;

function getStrikeSeverity(strikes: number): Severity {
  if (strikes >= 5) return "Critical";
  if (strikes >= 3) return "High";
  return "Medium"; // strikes === 2; strikes === 1 is handled by rank below
}

function getSuspicionLevel(score: number): Severity {
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

const SEVERITY_RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function combinedSeverity(strikes: number, suspicionScore: number): Severity {
  const strikeSeverity: Severity | null =
    strikes >= 2 ? getStrikeSeverity(strikes) : strikes === 1 ? "Low" : null;
  const suspicionSeverity: Severity | null = suspicionScore > 0 ? getSuspicionLevel(suspicionScore) : null;

  if (strikeSeverity && suspicionSeverity) {
    return SEVERITY_RANK[strikeSeverity] >= SEVERITY_RANK[suspicionSeverity] ? strikeSeverity : suspicionSeverity;
  }
  return strikeSeverity ?? suspicionSeverity ?? "Low";
}

function hasPostBurst(timestamps: number[]): { hit: boolean; windowCount: number } {
  const sorted = [...timestamps].sort((a, b) => a - b);
  let left = 0;
  let best = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > BURST_WINDOW_MS) left++;
    const windowCount = right - left + 1;
    if (windowCount > best) best = windowCount;
  }
  return { hit: best >= BURST_MIN_POSTS, windowCount: best };
}

function maxDuplicateGroup(bodies: (string | null)[]): number {
  const counts: Record<string, number> = {};
  let max = 0;
  for (const body of bodies) {
    const key = (body ?? "").trim().toLowerCase().slice(0, 80);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
    if (counts[key] > max) max = counts[key];
  }
  return max;
}

// ---------------------------------------------------------------------------
// Data — flagged accounts (merged strikes + suspicion scoring)
// ---------------------------------------------------------------------------

export async function fetchFlaggedAccounts(): Promise<FlaggedAccount[]> {
  await assertAdmin();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [profilesRes, postsRes, dismissalsRes, sharedDevicesRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,username,account_role,moderation_strike_count,created_at,avatar_url,bio"),
    supabaseAdmin
      .from("posts")
      .select("author_id,body,created_at")
      .gte("created_at", monthAgo),
    supabaseAdmin.from("suspicious_account_dismissals").select("user_id"),
    supabaseAdmin.rpc("admin_get_shared_devices"),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (dismissalsRes.error) throw new Error(dismissalsRes.error.message);
  if (sharedDevicesRes.error) throw new Error(sharedDevicesRes.error.message);

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    email: string | null;
    full_name: string | null;
    username: string | null;
    account_role: string | null;
    moderation_strike_count: number | null;
    created_at: string;
    avatar_url: string | null;
    bio: string | null;
  }[];
  const posts = (postsRes.data ?? []) as { author_id: string | null; body: string | null; created_at: string }[];
  const dismissedIds = new Set((dismissalsRes.data ?? []).map((r: { user_id: string }) => r.user_id));
  const sharedDevices = (sharedDevicesRes.data ?? []) as { device_id: string; user_ids: string[]; account_count: number }[];

  const extraLinkedAccounts = new Map<string, number>();
  for (const row of sharedDevices) {
    for (const userId of row.user_ids) {
      const extra = row.account_count - 1;
      extraLinkedAccounts.set(userId, Math.max(extraLinkedAccounts.get(userId) ?? 0, extra));
    }
  }

  const postsByAuthor = new Map<string, { body: string | null; created_at: string }[]>();
  for (const post of posts) {
    if (!post.author_id) continue;
    const list = postsByAuthor.get(post.author_id) ?? [];
    list.push({ body: post.body, created_at: post.created_at });
    postsByAuthor.set(post.author_id, list);
  }

  const results: FlaggedAccount[] = [];

  for (const profile of profiles) {
    const strikes = profile.moderation_strike_count ?? 0;

    let suspicionScore = 0;
    const suspicionSignals: string[] = [];

    if (!dismissedIds.has(profile.id)) {
      const extra = extraLinkedAccounts.get(profile.id) ?? 0;
      if (extra >= 1) {
        suspicionScore += Math.min(30 + extra * 15, 60);
        suspicionSignals.push(`Shares device with ${extra} other account${extra === 1 ? "" : "s"}`);
      }

      const authorPosts = postsByAuthor.get(profile.id) ?? [];
      if (authorPosts.length > 0) {
        const { hit, windowCount } = hasPostBurst(authorPosts.map((p) => new Date(p.created_at).getTime()));
        if (hit) {
          suspicionScore += 25;
          suspicionSignals.push(`${windowCount} posts within 10 minutes`);
        }

        const accountAgeDays = (Date.now() - new Date(profile.created_at).getTime()) / (24 * 60 * 60 * 1000);
        if (accountAgeDays < NEW_ACCOUNT_MAX_AGE_DAYS && authorPosts.length > NEW_ACCOUNT_MIN_POSTS) {
          suspicionScore += 20;
          suspicionSignals.push(`${authorPosts.length} posts within ${Math.floor(accountAgeDays)}-day-old account`);
        }

        const dupCount = maxDuplicateGroup(authorPosts.map((p) => p.body));
        if (dupCount >= DUPLICATE_MIN_POSTS) {
          suspicionScore += 20;
          suspicionSignals.push(`Duplicate content ×${dupCount}`);
        }

        if (!profile.avatar_url && !profile.bio && authorPosts.length > NO_PROFILE_MIN_POSTS) {
          suspicionScore += 10;
          suspicionSignals.push("No profile photo or bio despite high posting activity");
        }
      }
    }

    if (strikes === 0 && suspicionScore === 0) continue;

    results.push({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      username: profile.username,
      account_role: profile.account_role ?? "member",
      created_at: profile.created_at,
      moderationStrikeCount: strikes,
      suspicionScore,
      suspicionSignals,
      severity: combinedSeverity(strikes, suspicionScore),
    });
  }

  return results.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.suspicionScore - a.suspicionScore);
}

export async function fetchUserReports(userId: string): Promise<Report[]> {
  await assertAdmin();
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id,category,description,status,review_priority,offense_label,created_at,reporter_id,report_type")
    .eq("reported_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateStrikes(userId: string, count: number): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ moderation_strike_count: count })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function dismissSuspicion(userId: string, dismissedBy?: string): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin
    .from("suspicious_account_dismissals")
    .upsert({ user_id: userId, dismissed_by: dismissedBy ?? null, dismissed_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export const strikeUser = strikeUserAction;
export const banUser = banUserAction;
export const fetchActiveBans = fetchActiveBansAction;
export const fetchActiveDeviceBans = fetchActiveDeviceBansAction;
export const unbanUser = unbanUserAction;

// ---------------------------------------------------------------------------
// Data — reported posts
// ---------------------------------------------------------------------------

type ReportedPostRow = Omit<ReportedPostEntry, "post">;

export async function fetchReportedPosts(): Promise<ReportedPostEntry[]> {
  await assertAdmin();
  const { data: reports, error } = await supabaseAdmin
    .from("reports")
    .select("id,category,description,status,review_priority,offense_label,created_at,post_id")
    .not("post_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  if (!reports?.length) return [];

  const reportRows = reports as ReportedPostRow[];
  const postIds = [...new Set(reportRows.map((r) => r.post_id).filter(Boolean))];
  const { data: posts } = await supabaseAdmin
    .from("posts")
    .select("id,body,author_username,community_name,likes_count,comments_count,image_urls,post_type")
    .in("id", postIds);

  const postMap: Record<string, PostEntry> = Object.fromEntries(
    ((posts ?? []) as PostEntry[]).map((p) => [p.id, p])
  );

  return reportRows.map((r) => ({
    ...r,
    post: r.post_id ? (postMap[r.post_id] ?? null) : null,
  }));
}

export async function dismissReport(reportId: string): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin
    .from("reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) throw new Error(error.message);
}

export async function removePost(reportId: string, postId: string): Promise<void> {
  await assertAdmin();
  const [r1, r2] = await Promise.all([
    supabaseAdmin.from("reports").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", reportId),
    supabaseAdmin.from("posts").update({ status: "removed" }).eq("id", postId),
  ]);
  if (r1.error) throw new Error(r1.error.message);
  if (r2.error) throw new Error(r2.error.message);
}
