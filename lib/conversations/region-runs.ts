import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isTimeZone } from "@/lib/conversations/time";

const SCHEMA_HINT = "Run supabase/sql/prop_region_runs.sql in the Supabase SQL editor, then try again.";

export async function loadRegionObjectives(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin.from("prop_region_runs").select("hub_id, objective").limit(500);
  if (error && isMissingSchemaError(error)) return new Map();
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as Array<{ hub_id: string; objective: string | null }>).map((row) => [
      String(row.hub_id),
      String(row.objective ?? ""),
    ]),
  );
}

export async function loadExcludedByHub(): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabaseAdmin.from("prop_run_exclusions").select("hub_id, user_id").limit(5000);
  if (error && isMissingSchemaError(error)) return new Map();
  if (error) throw new Error(error.message);
  const map = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<{ hub_id: string; user_id: string }>) {
    const hubId = String(row.hub_id);
    const set = map.get(hubId) ?? new Set<string>();
    set.add(String(row.user_id));
    map.set(hubId, set);
  }
  return map;
}

export async function loadRunPause(): Promise<Map<string, boolean>> {
  const { data, error } = await supabaseAdmin.from("prop_region_runs").select("hub_id, paused").limit(500);
  if (error && isMissingSchemaError(error)) return new Map();
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as Array<{ hub_id: string; paused: boolean | null }>).map((row) => [String(row.hub_id), Boolean(row.paused)]),
  );
}

export async function loadPausedGroupIds(): Promise<Set<string>> {
  const hubIds = [...(await loadRunPause()).entries()].filter(([, paused]) => paused).map(([hubId]) => hubId);
  if (hubIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin.from("discussion_groups").select("id").in("discussion_id", hubIds);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ id: string }>).map((row) => String(row.id)));
}

export async function setRunPaused(hubId: string, paused: boolean): Promise<void> {
  if (!hubId) throw new Error("This run has no region yet.");
  const { data, error } = await supabaseAdmin
    .from("prop_region_runs")
    .update({ paused, updated_at: new Date().toISOString() })
    .eq("hub_id", hubId)
    .select("hub_id");
  if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
  if (error) throw new Error(error.message);
  if ((data ?? []).length > 0) return;
  const { error: insertError } = await supabaseAdmin.from("prop_region_runs").insert({
    hub_id: hubId,
    objective: "",
    paused,
    updated_at: new Date().toISOString(),
  });
  if (insertError && isMissingSchemaError(insertError)) throw new Error(SCHEMA_HINT);
  if (insertError) throw new Error(insertError.message);
}

export async function saveRegionObjective(hubId: string, objective: string): Promise<void> {
  if (!hubId) throw new Error("This run has no region yet.");
  const { error } = await supabaseAdmin.from("prop_region_runs").upsert(
    {
      hub_id: hubId,
      objective: objective.trim().slice(0, 400),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hub_id" },
  );
  if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
  if (error) throw new Error(error.message);
}

export async function saveRegionLocale(hubId: string, input: { timeZone: string; language: string }): Promise<void> {
  if (!hubId) throw new Error("This run has no region yet.");
  const timeZone = input.timeZone.trim();
  const language = input.language.trim().slice(0, 40);
  if (timeZone && !isTimeZone(timeZone)) throw new Error(`${timeZone} is not a time zone. Use a name like Asia/Tokyo.`);
  const { error } = await supabaseAdmin.from("prop_region_runs").upsert(
    {
      hub_id: hubId,
      timezone: timeZone || null,
      language: language || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hub_id" },
  );
  if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
  if (error) throw new Error(error.message);
}

export async function setAccountExcluded(hubId: string, userId: string, excluded: boolean): Promise<void> {
  if (!hubId) throw new Error("This run has no region yet.");
  if (excluded) {
    const { error } = await supabaseAdmin.from("prop_run_exclusions").upsert(
      { hub_id: hubId, user_id: userId },
      { onConflict: "hub_id,user_id" },
    );
    if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabaseAdmin.from("prop_run_exclusions").delete().eq("hub_id", hubId).eq("user_id", userId);
  if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
  if (error) throw new Error(error.message);
}

export async function loadObjectivesByGroup(): Promise<Map<string, string>> {
  const objectives = await loadRegionObjectives();
  if (objectives.size === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("discussion_groups")
    .select("id, discussion_id")
    .in("discussion_id", [...objectives.keys()]);
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; discussion_id: string | null }>) {
    const objective = objectives.get(String(row.discussion_id ?? "")) ?? "";
    if (objective) map.set(String(row.id), objective);
  }
  return map;
}

export async function loadExcludedByGroup(): Promise<Map<string, Set<string>>> {
  const byHub = await loadExcludedByHub();
  if (byHub.size === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("discussion_groups")
    .select("id, discussion_id")
    .in("discussion_id", [...byHub.keys()]);
  if (error) throw new Error(error.message);
  const map = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<{ id: string; discussion_id: string | null }>) {
    const excluded = byHub.get(String(row.discussion_id ?? ""));
    if (excluded && excluded.size > 0) map.set(String(row.id), excluded);
  }
  return map;
}
