import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { isPropAccountEmail } from "@/lib/prop-accounts";
import type { PropVoice } from "@/lib/prop-voice";
import { supabaseAdmin } from "@/lib/supabase/server";

export const LIKES_SCHEMA_HINT = "Run supabase/sql/prop_likes.sql in Supabase first.";

const MAX_QUEUED_LIKES_PER_COMMENT = 3;

/**
 * Whether props may like this author's posts. Props always can. Real members only when
 * like_real_users is on and the prop is disclosed as AI, which needs a disclosed_ai flag
 * that does not exist yet, so for now this is props only.
 */
async function canLikeAuthor(authorId: string, propId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("profiles").select("email").eq("id", authorId).maybeSingle();
  if (isPropAccountEmail(data?.email)) return true;
  const { data: settings, error } = await supabaseAdmin.from("prop_conversation_settings").select("like_real_users").eq("id", 1).maybeSingle();
  if (error || !settings?.like_real_users) return false;
  const { data: persona, error: personaError } = await supabaseAdmin
    .from("prop_account_personas")
    .select("disclosed_ai")
    .eq("user_id", propId)
    .maybeSingle();
  if (personaError) return false;
  return Boolean((persona as { disclosed_ai?: boolean } | null)?.disclosed_ai);
}

/**
 * One prop likes one comment. Database triggers keep likes_count and ranking points in sync.
 * The in-app notification is sent by the Sterling app, not a trigger, so none is sent here;
 * prop authors never read them.
 */
export async function likeComment(propId: string, commentId: string, groupId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: comment, error } = await supabaseAdmin
    .from("area_discussion_comments")
    .select("id, author_id, group_id")
    .eq("id", commentId)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!comment || String(comment.group_id ?? "") !== groupId) return { ok: false, reason: "The post is gone" };
  if (String(comment.author_id) === propId) return { ok: false, reason: "Their own post" };
  if (!(await canLikeAuthor(String(comment.author_id), propId))) return { ok: false, reason: "A real member's post, waiting on the AI badge" };
  const { error: likeError } = await supabaseAdmin.from("area_discussion_comment_likes").insert({ comment_id: commentId, user_id: propId });
  if (likeError?.code === "23505") return { ok: false, reason: "Already liked" };
  if (likeError) return { ok: false, reason: likeError.message };
  return { ok: true };
}

function likeChance(voice: PropVoice | undefined): number {
  const temperament = `${voice?.traits.temperament ?? ""} ${voice?.personality ?? ""}`.toLowerCase();
  if (/\b(upbeat|warm|friendly|hype|excited|sweet|supportive|easygoing|funny)\b/.test(temperament)) return 0.45;
  if (/\b(dry|blunt|quiet|skeptical|grumpy|shy|mean|observer)\b/.test(temperament)) return 0.15;
  return 0.28;
}

/** After a prop line posts, a few other props in the group may like it 1 to 90 minutes later. No model call. */
export async function queueLikesAfterPost(input: {
  groupId: string;
  commentId: string;
  authorId: string;
  memberIds: string[];
  voices: Map<string, PropVoice>;
}): Promise<number> {
  const others = input.memberIds.filter((id) => id !== input.authorId).sort(() => Math.random() - 0.5);
  const likers = others.filter((id) => Math.random() < likeChance(input.voices.get(id))).slice(0, MAX_QUEUED_LIKES_PER_COMMENT);
  if (likers.length === 0) return 0;
  const { error } = await supabaseAdmin.from("prop_engagement_jobs").insert(
    likers.map((id) => ({
      group_id: input.groupId,
      author_id: id,
      kind: "like",
      parent_comment_id: input.commentId,
      run_at: new Date(Date.now() + (1 + Math.random() * 89) * 60_000).toISOString(),
      status: "pending",
    })),
  );
  if (error) {
    if (error.code !== "23514" && error.code !== "23505" && !isMissingSchemaError(error)) {
      console.error("[likes] could not queue likes:", error.message);
    }
    return 0;
  }
  return likers.length;
}
