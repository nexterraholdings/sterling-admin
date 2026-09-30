import { GEMINI_LITE_MODEL, geminiConfigured, geminiJson } from "@/lib/ai/gemini";
import { groqJson } from "@/lib/ai/groq-json";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";

export const MEMORY_SCHEMA_HINT = "Run supabase/sql/prop_memories.sql in Supabase first.";

const MAX_PER_PROP = 60;
const IN_PROMPT = 8;
const GROUPS_PER_PASS = 3;
const LINES_PER_GROUP = 30;
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const BATCH_LINES = 6;
const BATCH_WAIT_MS = 2 * 60 * 60 * 1000;

export type PropMemory = {
  id: string;
  propId: string;
  groupId: string | null;
  aboutId: string | null;
  aboutName: string | null;
  fact: string;
  importance: number;
  createdAt: string;
};

type MemoryRow = {
  id: string;
  prop_id: string;
  group_id: string | null;
  about_id: string | null;
  fact: string;
  importance: number;
  created_at: string;
};

/** The notes a prop should keep in mind for its next line, most important and most local first. */
export async function memoriesForLine(propId: string, groupId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("prop_memories")
    .select("id, prop_id, group_id, about_id, fact, importance, created_at")
    .eq("prop_id", propId)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as MemoryRow[];
  if (rows.length === 0) return [];
  const now = Date.now();
  const picked = rows
    .map((row) => {
      const ageDays = (now - new Date(row.created_at).getTime()) / 86_400_000;
      const score = Number(row.importance) * 2 + (row.group_id === groupId ? 3 : 0) - Math.min(ageDays, 30) / 10;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, IN_PROMPT)
    .map((item) => item.row);
  const names = await namesFor(picked.map((row) => row.about_id).filter((id): id is string => Boolean(id)));
  await supabaseAdmin
    .from("prop_memories")
    .update({ last_used_at: new Date().toISOString() })
    .in(
      "id",
      picked.map((row) => row.id),
    );
  return picked.map((row) => {
    const about = row.about_id ? names.get(row.about_id) : null;
    return about ? `About ${about}: ${row.fact}` : row.fact;
  });
}

export async function listPropMemories(propId: string): Promise<PropMemory[]> {
  const { data, error } = await supabaseAdmin
    .from("prop_memories")
    .select("id, prop_id, group_id, about_id, fact, importance, created_at")
    .eq("prop_id", propId)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_PROP);
  if (error) {
    if (isMissingSchemaError(error)) throw new Error(MEMORY_SCHEMA_HINT);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as MemoryRow[];
  const names = await namesFor(rows.map((row) => row.about_id).filter((id): id is string => Boolean(id)));
  return rows.map((row) => ({
    id: String(row.id),
    propId: String(row.prop_id),
    groupId: row.group_id ? String(row.group_id) : null,
    aboutId: row.about_id ? String(row.about_id) : null,
    aboutName: row.about_id ? names.get(row.about_id) ?? null : null,
    fact: row.fact,
    importance: Number(row.importance),
    createdAt: row.created_at,
  }));
}

export async function deletePropMemory(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("prop_memories").delete().eq("id", id);
  if (error) throw new Error(isMissingSchemaError(error) ? MEMORY_SCHEMA_HINT : error.message);
}

export type RememberResult = { groups: number; lines: number; saved: number; model: string | null; error: string | null };

type DoneJob = {
  id: string;
  group_id: string;
  author_id: string;
  kind: string;
  body: string | null;
  comment_id: string | null;
  parent_comment_id: string | null;
  finished_at: string | null;
};

/** Reads lines props posted since the last pass and saves what they revealed. One model call per group. */
export async function rememberRecentLines(): Promise<RememberResult> {
  const result: RememberResult = { groups: 0, lines: 0, saved: 0, model: null, error: null };
  const { data, error } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .select("id, group_id, author_id, kind, body, comment_id, parent_comment_id, finished_at")
    .eq("status", "done")
    .is("remembered_at", null)
    .gte("finished_at", new Date(Date.now() - LOOKBACK_MS).toISOString())
    .order("finished_at", { ascending: true })
    .limit(GROUPS_PER_PASS * LINES_PER_GROUP * 2);
  if (error) {
    if (isMissingSchemaError(error)) return result;
    throw new Error(error.message);
  }
  const byGroup = new Map<string, DoneJob[]>();
  for (const job of (data ?? []) as DoneJob[]) {
    if (!job.body?.trim()) continue;
    const list = byGroup.get(job.group_id) ?? [];
    if (list.length < LINES_PER_GROUP) list.push(job);
    byGroup.set(job.group_id, list);
  }

  const ready = [...byGroup].filter(
    ([, jobs]) => jobs.length >= BATCH_LINES || Date.now() - new Date(jobs[0].finished_at ?? 0).getTime() >= BATCH_WAIT_MS,
  );
  for (const [groupId, jobs] of ready.slice(0, GROUPS_PER_PASS)) {
    try {
      const saved = await rememberGroup(groupId, jobs);
      result.groups += 1;
      result.lines += jobs.length;
      result.saved += saved.count;
      result.model = saved.model;
    } catch (caught) {
      result.error = caught instanceof Error ? caught.message : "Memory pass failed";
      break;
    }
  }
  return result;
}

async function rememberGroup(groupId: string, jobs: DoneJob[]): Promise<{ count: number; model: string }> {
  const parentIds = [...new Set(jobs.map((job) => job.parent_comment_id).filter((id): id is string => Boolean(id)))];
  const parentAuthor = new Map<string, string>();
  if (parentIds.length > 0) {
    const { data } = await supabaseAdmin.from("prop_engagement_jobs").select("comment_id, author_id").in("comment_id", parentIds);
    for (const row of (data ?? []) as Array<{ comment_id: string; author_id: string }>) {
      parentAuthor.set(String(row.comment_id), String(row.author_id));
    }
  }
  const people = [...new Set([...jobs.map((job) => job.author_id), ...parentAuthor.values()])];
  const names = await namesFor(people);
  const indexOf = new Map(people.map((id, index) => [id, index + 1]));

  const { data: known } = await supabaseAdmin
    .from("prop_memories")
    .select("prop_id, fact")
    .in("prop_id", people)
    .order("created_at", { ascending: false })
    .limit(200);
  const knownByProp = new Map<string, string[]>();
  for (const row of (known ?? []) as Array<{ prop_id: string; fact: string }>) {
    const list = knownByProp.get(String(row.prop_id)) ?? [];
    if (list.length < 12) list.push(row.fact);
    knownByProp.set(String(row.prop_id), list);
  }

  const roster = people
    .map((id) => {
      const notes = knownByProp.get(id) ?? [];
      return `${indexOf.get(id)}. ${names.get(id) ?? "Member"}${notes.length ? `. Already known: ${notes.join(" | ")}` : ""}`;
    })
    .join("\n");
  const lines = jobs
    .map((job) => {
      const to = job.parent_comment_id ? parentAuthor.get(job.parent_comment_id) : undefined;
      return `[${indexOf.get(job.author_id)}]${to ? ` replying to [${indexOf.get(to)}]` : ""}: ${job.body}`;
    })
    .join("\n");

  const system = [
    "You keep private notes for the members of a neighborhood group chat so each one stays consistent over time.",
    "From the new messages, pull out lasting facts an author revealed about their own life: family, pets, job, school, where they live or go, plans with a day, things they own, and strong opinions they would repeat.",
    "Also note relationship facts between two members when a reply shows one, like an ongoing argument, a shared plan, or an inside joke. Put the other member's number in about.",
    "Skip small talk, reactions, questions, weather, and anything already known. Never invent. If nothing lasting was revealed, return an empty list.",
    "Write each fact as a short third person note without the name, like 'Has a dog named Rocco.' or 'Keeps arguing that the Magic will miss the playoffs.'",
    "importance: 5 core identity, 4 family or pets or job, 3 lasting opinion or relationship, 2 plan or recent event, 1 minor detail.",
    'Answer with JSON only: {"memories":[{"author":1,"about":null,"fact":"...","importance":3}]}',
  ].join("\n");
  const prompt = `Members:\n${roster}\n\nNew messages:\n${lines}`;

  const reply = geminiConfigured()
    ? await geminiJson({ system, prompt, model: GEMINI_LITE_MODEL })
    : await groqJson(system, prompt, { label: "memory" });

  const parsed = parseMemories(reply.text);
  const byNumber = new Map(people.map((id, index) => [index + 1, id]));
  const authors = new Set(jobs.map((job) => job.author_id));
  const rows = parsed
    .map((item) => {
      const propId = byNumber.get(item.author);
      if (!propId || !authors.has(propId)) return null;
      const aboutId = item.about != null ? byNumber.get(item.about) ?? null : null;
      const fact = item.fact.replace(/\s+/g, " ").trim().slice(0, 240);
      if (fact.length < 3) return null;
      const seen = (knownByProp.get(propId) ?? []).some((note) => sameNote(note, fact));
      if (seen) return null;
      const source = jobs.find((job) => job.author_id === propId);
      return {
        prop_id: propId,
        group_id: groupId,
        about_id: aboutId && aboutId !== propId ? aboutId : null,
        fact,
        importance: Math.min(5, Math.max(1, Math.round(item.importance || 2))),
        source_job_id: source?.id ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from("prop_memories").insert(rows);
    if (error) throw new Error(error.message);
  }
  const { error: markError } = await supabaseAdmin
    .from("prop_engagement_jobs")
    .update({ remembered_at: new Date().toISOString() })
    .in(
      "id",
      jobs.map((job) => job.id),
    );
  if (markError) throw new Error(markError.message);
  for (const propId of new Set(rows.map((row) => row.prop_id))) await prune(propId);
  return { count: rows.length, model: reply.model };
}

async function prune(propId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("prop_memories")
    .select("id")
    .eq("prop_id", propId)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .range(MAX_PER_PROP, MAX_PER_PROP + 200);
  const extra = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (extra.length > 0) await supabaseAdmin.from("prop_memories").delete().in("id", extra);
}

function parseMemories(text: string): Array<{ author: number; about: number | null; fact: string; importance: number }> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const payload = JSON.parse(text.slice(start, end + 1)) as { memories?: unknown };
    if (!Array.isArray(payload.memories)) return [];
    return payload.memories
      .map((item) => item as { author?: unknown; about?: unknown; fact?: unknown; importance?: unknown })
      .filter((item) => typeof item.fact === "string" && Number.isFinite(Number(item.author)))
      .map((item) => ({
        author: Number(item.author),
        about: item.about == null || item.about === "" ? null : Number(item.about),
        fact: String(item.fact),
        importance: Number(item.importance ?? 2),
      }));
  } catch {
    return [];
  }
}

function sameNote(a: string, b: string): boolean {
  const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 0.7;
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name, username").in("id", unique);
  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null; username: string | null }>).map((row) => [
      String(row.id),
      row.full_name?.trim() || row.username?.trim() || "Member",
    ]),
  );
}
