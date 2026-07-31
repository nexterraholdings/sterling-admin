"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type { ReportStatus } from "@/lib/types";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — moderation actions require service-role access."
    );
  }
}

async function assertAdmin(): Promise<void> {
  await getCurrentAdmin();
  requireServiceRole();
}

type ReportRow = {
  id: string;
  created_at: string;
  reporter_id: string;
  report_type: "post" | "profile" | "bug";
  post_id?: string | null;
  reported_user_id?: string | null;
  category: string;
  description?: string | null;
  screenshot_urls?: string[] | null;
  status: ReportStatus;
  review_priority?: string | null;
  offense_label?: string | null;
};

type ProfileStub = { id: string; full_name?: string | null; username?: string | null };
type PostStub    = { id: string; body?: string | null; author_username?: string | null; community_name?: string | null; image_urls?: string[] | null; author_id?: string | null; status?: string | null };

export type EnrichedReport = ReportRow & {
  reported_user: ProfileStub | null;
  post: PostStub | null;
};

export type QueueStats = { postPending: number; profilePending: number; bugPending: number };

export async function fetchQueueStats(): Promise<QueueStats> {
  await assertAdmin();
  const base = (type: string) =>
    supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("report_type", type)
      .eq("status", "pending");

  const [posts, profiles, bugs] = await Promise.all([
    base("post"),
    base("profile"),
    base("bug"),
  ]);

  return {
    postPending:    posts.count    ?? 0,
    profilePending: profiles.count ?? 0,
    bugPending:     bugs.count     ?? 0,
  };
}

export async function fetchReports(
  types: ("post" | "profile" | "bug")[],
  statuses?: ReportStatus[]
): Promise<EnrichedReport[]> {
  await assertAdmin();
  let query = supabaseAdmin
    .from("reports")
    .select("id,created_at,reporter_id,report_type,post_id,reported_user_id,category,description,screenshot_urls,status,review_priority,offense_label")
    .in("report_type", types)
    .order("created_at", { ascending: false })
    .limit(50);

  if (statuses?.length) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows: ReportRow[] = (data ?? []) as ReportRow[];
  if (!rows.length) return [];

  const userIds = [...new Set(rows.map((r) => r.reported_user_id).filter(Boolean))] as string[];
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];

  const [profilesRes, postsRes] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("profiles").select("id,full_name,username").in("id", userIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabaseAdmin.from("posts").select("id,body,author_username,community_name,image_urls,author_id,status").in("id", postIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap: Record<string, ProfileStub> = Object.fromEntries(
    ((profilesRes.data as any[]) ?? []).map((p: ProfileStub) => [p.id, p])
  );
  const postMap: Record<string, PostStub> = Object.fromEntries(
    ((postsRes.data as any[]) ?? []).map((p: PostStub) => [p.id, p])
  );

  return rows.map((r) => ({
    ...r,
    reported_user: r.reported_user_id ? (profileMap[r.reported_user_id] || null) : null,
    post:          r.post_id          ? (postMap[r.post_id]              || null) : null,
  }));
}

export async function updateReportStatus(id: string, status: ReportStatus): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin
    .from("reports")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function strikeUser(userId: string): Promise<void> {
  await assertAdmin();
  const { error: fetchError, data: profile } = await supabaseAdmin
    .from("profiles")
    .select("moderation_strike_count")
    .eq("id", userId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const newStrikeCount = (profile?.moderation_strike_count ?? 0) + 1;
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ moderation_strike_count: newStrikeCount })
    .eq("id", userId);

  if (updateError) throw new Error(updateError.message);

  await logAdminAction({
    category: "moderation",
    action: "strike_user",
    detail: `Added moderation strike to ${await describeUser(userId)} (now ${newStrikeCount})`,
    targetType: "user",
    targetId: userId,
  });
}

export async function banUser(userId: string, reason?: string): Promise<void> {
  await assertAdmin();
  const finalReason = reason || "Violation of platform rules";
  const { error } = await supabaseAdmin.rpc("admin_ban_user", {
    p_user_id: userId,
    p_reason: finalReason,
    p_also_ban_devices: true,
  });

  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "ban_user",
    detail: `Banned ${await describeUser(userId)}: ${finalReason} — devices also banned`,
    targetType: "user",
    targetId: userId,
  });
}

export async function unbanUser(userId: string): Promise<void> {
  await assertAdmin();
  const { error } = await supabaseAdmin.rpc("admin_unban_user", {
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);

  await logAdminAction({
    category: "moderation",
    action: "unban_user",
    detail: `Lifted ban on ${await describeUser(userId)}`,
    targetType: "user",
    targetId: userId,
  });
}

export async function strikePostAuthor(postId: string, reportId: string): Promise<void> {
  await assertAdmin();
  const { data: post, error: postError } = await supabaseAdmin
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (postError || !post?.author_id) throw new Error("Could not find post author");

  await strikeUser(post.author_id);
  await updateReportStatus(reportId, "reviewed");
}

export async function banPostAuthor(postId: string, reportId: string): Promise<void> {
  await assertAdmin();
  const { data: post, error: postError } = await supabaseAdmin
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (postError || !post?.author_id) throw new Error("Could not find post author");

  await banUser(post.author_id, `Banned for post violation (report: ${reportId})`);
  await updateReportStatus(reportId, "reviewed");
}

export async function removePost(reportId: string, postId: string): Promise<void> {
  await assertAdmin();
  const [r1, r2] = await Promise.all([
    supabaseAdmin.from("reports").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", reportId),
    supabaseAdmin.from("posts").update({ status: "removed", is_pinned: false }).eq("id", postId),
  ]);
  if (r1.error) throw new Error(r1.error.message);
  if (r2.error) throw new Error(r2.error.message);

  await logAdminAction({
    category: "moderation",
    action: "remove_post",
    detail: `Removed post ${postId} (report: ${reportId})`,
    targetType: "post",
    targetId: postId,
  });
}

// Reverses an auto-hide from the auto-moderation trigger (see
// supabase/sql/auto_moderation.sql) when a moderator confirms it was a
// false positive. Restores posts.status to 'active' (every feed/read query
// filters on status = 'active' specifically — setting it back to null left
// the post excluded everywhere, so "restore" silently did nothing) and
// dismisses the report so it drops out of the pending queue.
export async function restorePost(postId: string, reportId: string): Promise<void> {
  await assertAdmin();
  const { error: postError } = await supabaseAdmin
    .from("posts")
    .update({ status: "active" })
    .eq("id", postId);
  if (postError) throw new Error(postError.message);

  await updateReportStatus(reportId, "dismissed");

  await logAdminAction({
    category: "moderation",
    action: "restore_post",
    detail: `Restored auto-hidden post ${postId}`,
    targetType: "post",
    targetId: postId,
  });
}
