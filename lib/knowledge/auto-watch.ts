import { loadHubLocales } from "@/lib/conversations/hub-locale";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { createWatch } from "@/lib/knowledge/db";
import { DEFAULT_FEEDS } from "@/lib/knowledge/types";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Gives a hub a default news and weather watch the first time it gets a prop group.
 * Hubs that already have any watch, even a disabled one, are left alone. Never throws.
 */
export async function ensureHubWatch(hubId: string): Promise<boolean> {
  if (!hubId) return false;
  try {
    const { data, error } = await supabaseAdmin.from("knowledge_watches").select("id").eq("hub_id", hubId).limit(1);
    if (error && isMissingSchemaError(error)) return false;
    if (error) throw new Error(error.message);
    if ((data ?? []).length > 0) return false;
    const place = (await loadHubLocales([hubId])).get(hubId)?.place.trim() ?? "";
    await createWatch({
      hubId,
      label: place ? `${place} (auto)` : "Auto watch",
      feeds: [...DEFAULT_FEEDS],
      searchTerms: place,
      xHandles: [],
      teams: [],
      everyMinutes: 360,
      approval: "review",
      enabled: true,
    });
    return true;
  } catch (error) {
    console.error("[knowledge] could not add a default watch:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Same as ensureHubWatch, starting from a group. */
export async function ensureGroupHubWatch(groupId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("discussion_groups").select("discussion_id").eq("id", groupId).maybeSingle();
  return data?.discussion_id ? ensureHubWatch(String(data.discussion_id)) : false;
}
