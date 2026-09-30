import { GEMINI_MODEL, geminiConfigured, geminiJson } from "@/lib/ai/gemini";
import { groqJson, parseJsonObject } from "@/lib/ai/groq-json";
import { listPropProfiles, loadPropMemberIdsByGroup } from "@/lib/conversations/db";
import type { DirectorPlan, DroppedAction } from "@/lib/conversations/director";
import { loadGroupLocales, loadHubLocales } from "@/lib/conversations/hub-locale";
import { recordRunMoment } from "@/lib/conversations/moments";
import { hubListsByProp, loadPropHomes } from "@/lib/conversations/prop-home";
import { loadExcludedByHub, loadPausedGroupIds } from "@/lib/conversations/region-runs";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { addGroupMembers, countOwnedLiveGroups, createPropGroup } from "@/lib/groups/db";
import { GROUP_CATEGORY_LABELS } from "@/lib/groups/types";
import { ensureHubWatch } from "@/lib/knowledge/auto-watch";
import { isMinorVoice } from "@/lib/prop-voice";
import { loadAccountVoices } from "@/lib/prop-voice-store";
import { supabaseAdmin } from "@/lib/supabase/server";

export type CreateGroupAction = {
  type: "create_group";
  hubId: string;
  title: string;
  description: string;
  categories: string[];
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  memberNames: string[];
  firstPostBrief: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CANDIDATES_IN_PROMPT = 18;

function titleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Once a week per hub: looks for something locals keep talking about that no group covers yet,
 * and saves at most one new group proposal. Proposals always wait for approval.
 */
export async function proposeGroupForHub(hubId: string): Promise<DirectorPlan["id"] | null> {
  const [hubLocales, { data: groupRows, error: groupError }, { data: factRows }, profiles, voices, propGroups, excludedByHub] = await Promise.all([
    loadHubLocales([hubId]),
    supabaseAdmin.from("discussion_groups").select("id, title, description, categories").eq("discussion_id", hubId).is("archived_at", null).limit(200),
    supabaseAdmin
      .from("knowledge_items")
      .select("claim, source")
      .eq("hub_id", hubId)
      .eq("status", "approved")
      .gte("fetched_at", new Date(Date.now() - 2 * WEEK_MS).toISOString())
      .order("fetched_at", { ascending: false })
      .limit(40),
    listPropProfiles(),
    loadAccountVoices(),
    loadPropMemberIdsByGroup(),
    loadExcludedByHub(),
  ]);
  if (groupError) throw new Error(groupError.message);
  const place = hubLocales.get(hubId)?.place ?? "";
  const groups = (groupRows ?? []) as Array<{ id: string; title: string | null; description: string | null; categories: string[] | null }>;

  const locales = await loadGroupLocales([...propGroups.keys()]);
  const hubLists = hubListsByProp(propGroups, locales);
  for (const row of profiles) if (!hubLists.has(String(row.id))) hubLists.set(String(row.id), []);
  const homes = await loadPropHomes(hubLists);
  const excluded = excludedByHub.get(hubId);
  const names = new Map(profiles.map((row) => [String(row.id), row.full_name?.trim() || row.username?.trim() || "Member"]));
  const local = profiles
    .map((row) => String(row.id))
    .filter((id) => homes.get(id)?.hubId === hubId && !excluded?.has(id) && !isMinorVoice(voices.get(id)));
  const candidates = local.slice(0, CANDIDATES_IN_PROMPT);
  const ownsNone = new Set<string>();
  for (const id of candidates) if ((await countOwnedLiveGroups(id)) === 0) ownsNone.add(id);
  if (candidates.length < 3 || ![...ownsNone].some((id) => candidates.includes(id))) return null;

  const system = [
    `You look after the prop members of a local social app in ${place || "one area"}. They are AI characters. Decide whether one of them would start a new group this week.`,
    "Only propose a group when the facts or the members' interests show something locals keep talking about that no existing group covers. Proposing nothing is normal.",
    "The group should sound like a real neighbor made it: a short casual title under 40 characters, and a one sentence description.",
    "The owner has to be a member marked can own. Pick 2 to 4 other members whose interests fit.",
    `Categories come from this list: ${Object.keys(GROUP_CATEGORY_LABELS).join(", ")}.`,
    'Answer with JSON only: {"propose":true,"title":"...","description":"...","categories":["..."],"owner":1,"members":[2,3],"first_post":"one sentence on what the owner says to kick it off","reason":"why this gap is real"} or {"propose":false,"reason":"..."}',
  ].join("\n");
  const prompt = [
    "Existing groups:",
    ...(groups.length ? groups.map((group) => `- ${group.title ?? "Group"}${group.categories?.length ? ` [${group.categories.join(", ")}]` : ""}${group.description ? `: ${group.description.slice(0, 120)}` : ""}`) : ["(none)"]),
    "",
    "Recent approved facts about this area:",
    ...(((factRows ?? []) as Array<{ claim: string; source: string }>).map((row) => `- [${row.source}] ${row.claim.slice(0, 180)}`)),
    "",
    "Members:",
    ...candidates.map((id, index) => {
      const traits = voices.get(id)?.traits;
      const bits = [traits?.age != null ? `${traits.age}` : "", traits?.temperament || "", traits?.interests ? `into ${traits.interests}` : "", voices.get(id)?.personality?.slice(0, 100) || ""].filter(Boolean);
      return `M${index + 1}. ${names.get(id)}${ownsNone.has(id) ? " (can own)" : ""}: ${bits.join(", ") || "no persona"}`;
    }),
  ].join("\n");

  let text = "";
  let model = "";
  if (geminiConfigured()) {
    try {
      const reply = await geminiJson({ system, prompt, model: GEMINI_MODEL, maxOutputTokens: 1500, timeoutMs: 18_000 });
      text = reply.text;
      model = reply.model;
    } catch (error) {
      console.error("[prop-groups] gemini failed:", error instanceof Error ? error.message : error);
    }
  }
  if (!text) {
    const reply = await groqJson(system, prompt, { label: "new group", maxTokens: 1200, timeoutMs: 12_000 });
    text = reply.text;
    model = reply.model;
  }

  const raw = parseJsonObject(text);
  const reason = String(raw?.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const dropped: DroppedAction[] = [];
  let action: CreateGroupAction | null = null;
  if (raw?.propose === true) {
    const title = String(raw.title ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const owner = candidates[Number(raw.owner) - 1];
    const memberIds = [...new Set((Array.isArray(raw.members) ? raw.members : []).map((value) => candidates[Number(value) - 1]).filter(Boolean))]
      .filter((id) => id !== owner)
      .slice(0, 4) as string[];
    const categories = (Array.isArray(raw.categories) ? raw.categories : [])
      .map((value) => String(value).trim().toLowerCase())
      .filter((value) => value in GROUP_CATEGORY_LABELS)
      .slice(0, 4);
    const taken = groups.some((group) => titleKey(group.title ?? "") === titleKey(title));
    const problem =
      title.length < 3
        ? "title too short"
        : taken
          ? "a group with that name already exists"
          : !owner || !ownsNone.has(owner)
            ? "owner cannot own a group"
            : memberIds.length < 2
              ? "needs at least 2 other members"
              : null;
    if (problem) dropped.push({ action: JSON.stringify(raw).slice(0, 300), reason: problem });
    else {
      action = {
        type: "create_group",
        hubId,
        title,
        description: String(raw.description ?? "").replace(/\s+/g, " ").trim().slice(0, 280),
        categories: categories.length ? categories : ["other"],
        ownerId: owner as string,
        ownerName: names.get(owner as string) ?? "Member",
        memberIds,
        memberNames: memberIds.map((id) => names.get(id) ?? "Member"),
        firstPostBrief: String(raw.first_post ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
      };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("prop_director_plans")
    .insert({
      hub_id: hubId,
      kind: "new_group",
      status: action ? "proposed" : "rejected",
      model,
      reasoning: reason || (action ? "" : "Nothing worth a new group this week."),
      actions: action ? [action] : [],
      dropped,
      decided_by: action ? null : "director",
      decided_at: action ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

/** Creates the approved group, seeds its members and settings, and queues the owner's first post. */
export async function applyNewGroupPlan(plan: DirectorPlan): Promise<{ applied: number; dropped: DroppedAction[] }> {
  const action = (plan.actions as CreateGroupAction[]).find((item) => item.type === "create_group");
  if (!action) throw new Error("This plan has no group to create.");
  const groupId = await createPropGroup({
    hubId: action.hubId,
    title: action.title,
    description: action.description,
    categories: action.categories,
    ownerId: action.ownerId,
  });
  const dropped: DroppedAction[] = [];
  const members = action.memberIds.filter((id) => id !== action.ownerId);
  if (members.length > 0) await addGroupMembers(groupId, members, "member");
  const cast = [action.ownerId, ...members];
  const { error: settingsError } = await supabaseAdmin.from("prop_conversation_groups").upsert(
    {
      group_id: groupId,
      enabled: true,
      planner: "director",
      topic: action.description.slice(0, 280),
      posts_per_day: 2,
      replies_per_post: 2,
      auto_continue: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id" },
  );
  if (settingsError) dropped.push({ action: "conversation settings", reason: settingsError.message });
  const { data: job, error: jobError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .insert({
      group_id: groupId,
      author_id: action.ownerId,
      kind: "start_post",
      run_at: new Date(Date.now() + (5 + Math.random() * 15) * 60_000).toISOString(),
      status: "pending",
      cast_ids: cast,
      brief: action.firstPostBrief || null,
      director_plan_id: plan.id,
    })
    .select("id")
    .maybeSingle();
  if (jobError) dropped.push({ action: "first post", reason: jobError.message });
  else
    await recordRunMoment({
      groupId,
      userId: action.ownerId,
      jobId: job?.id ? String(job.id) : null,
      decision: "jumped_in",
      subject: action.firstPostBrief,
      pace: "Started the group",
    });
  await supabaseAdmin.from("prop_director_plans").update({ group_id: groupId }).eq("id", plan.id);
  await ensureHubWatch(action.hubId);
  return { applied: 1 + members.length, dropped };
}

/** Proposes for the hub whose last new-group check is oldest, at most once a week per hub. */
export async function runGroupProposals(): Promise<string | null> {
  const { data: configs, error } = await supabaseAdmin.from("prop_conversation_groups").select("group_id").eq("enabled", true);
  if (error) throw new Error(error.message);
  const paused = await loadPausedGroupIds();
  const groupIds = ((configs ?? []) as Array<{ group_id: string }>).map((row) => String(row.group_id)).filter((id) => !paused.has(id));
  if (groupIds.length === 0) return null;
  const locales = await loadGroupLocales(groupIds);
  const hubIds = [...new Set([...locales.values()].map((locale) => locale.hubId))];
  const { data: recent, error: recentError } = await supabaseAdmin
    .from("prop_director_plans")
    .select("hub_id, created_at")
    .eq("kind", "new_group")
    .in("hub_id", hubIds)
    .gte("created_at", new Date(Date.now() - WEEK_MS).toISOString());
  if (recentError && isMissingSchemaError(recentError)) return null;
  if (recentError) throw new Error(recentError.message);
  const checked = new Set(((recent ?? []) as Array<{ hub_id: string }>).map((row) => String(row.hub_id)));
  const hubId = hubIds.find((id) => !checked.has(id));
  return hubId ? proposeGroupForHub(hubId) : null;
}
