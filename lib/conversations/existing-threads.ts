import { supabaseAdmin } from "@/lib/supabase/server";

export const EXISTING_THREAD_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const EXISTING_THREADS_PER_DAY = 4;

/** How many more replies this group can add today to threads that were not one of today's prop start posts. */
export async function existingThreadRoom(groupId: string, sinceIso: string): Promise<number> {
  const { data: starts, error: startError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("comment_id")
    .eq("group_id", groupId)
    .eq("kind", "start_post")
    .gte("created_at", sinceIso);
  if (startError) throw new Error(startError.message);
  const startedHere = new Set(
    ((starts ?? []) as Array<{ comment_id: string | null }>).map((row) => String(row.comment_id ?? "")).filter(Boolean),
  );

  const { data: replies, error: replyError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("parent_comment_id")
    .eq("group_id", groupId)
    .eq("kind", "reply")
    .in("status", ["pending", "running", "done"])
    .gte("created_at", sinceIso);
  if (replyError) throw new Error(replyError.message);
  const alreadyJoined = ((replies ?? []) as Array<{ parent_comment_id: string | null }>).filter((row) => {
    const parent = String(row.parent_comment_id ?? "");
    return parent && !startedHere.has(parent);
  }).length;
  return Math.max(0, EXISTING_THREADS_PER_DAY - alreadyJoined);
}
