import { parseAttitude, parseSwearStrength, type Attitude, type SwearStrength } from "@/lib/conversations/rules";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";

export type RunEdge = { swearStrength: SwearStrength; attitude: Attitude };

export const DEFAULT_EDGE: RunEdge = { swearStrength: "mild", attitude: "normal" };

export const EDGE_SCHEMA_HINT = "Run supabase/sql/prop_conversation_edge.sql in Supabase first.";

/** Swear strength and attitude per group. Every group reads as the default until the columns exist. */
export async function loadRunEdges(groupIds?: string[]): Promise<Map<string, RunEdge>> {
  let query = supabaseAdmin.from("prop_conversation_groups").select("group_id, swear_strength, attitude");
  if (groupIds) {
    if (groupIds.length === 0) return new Map();
    query = query.in("group_id", groupIds);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map(
    ((data ?? []) as Array<{ group_id: string; swear_strength: string | null; attitude: string | null }>).map((row) => [
      String(row.group_id),
      { swearStrength: parseSwearStrength(row.swear_strength), attitude: parseAttitude(row.attitude) },
    ]),
  );
}

export async function saveRunEdge(groupId: string, edge: RunEdge): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("prop_conversation_groups")
    .update({
      swear_strength: parseSwearStrength(edge.swearStrength),
      attitude: parseAttitude(edge.attitude),
      updated_at: new Date().toISOString(),
    })
    .eq("group_id", groupId)
    .select("group_id");
  if (error && isMissingSchemaError(error)) {
    if (edge.swearStrength === DEFAULT_EDGE.swearStrength && edge.attitude === DEFAULT_EDGE.attitude) return;
    throw new Error(EDGE_SCHEMA_HINT);
  }
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That group has no conversation settings yet. Start a run first.");
}
