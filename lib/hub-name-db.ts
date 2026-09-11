import { supabaseAdmin } from "@/lib/supabase/server";
import {
  assertHubName,
  hubNameConflictMessage,
  hubNamesCollide,
  mapHubNameDbError,
  sanitizeHubNameInput,
  type HubNameConflict,
} from "@/lib/hub-name";

type HubNameRow = {
  id: string;
  title: string;
  origin: string | null;
  lifecycle_status: string | null;
};

function toConflict(row: HubNameRow): HubNameConflict {
  return {
    id: String(row.id),
    title: String(row.title),
    origin: row.origin === "seeded" ? "seeded" : "user",
    lifecycle_status: row.lifecycle_status ?? null,
  };
}

function isMissingRpc(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function")
    || lower.includes("schema cache")
    || lower.includes("does not exist")
    || lower.includes("42703")
    || lower.includes("pgrst202")
    || lower.includes("permission denied")
    || lower.includes("42501")
  );
}

async function scanHubNameConflict(
  slug: string,
  excludeId?: string | null,
): Promise<HubNameConflict | null> {
  const pageSize = 1000;
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("area_discussions")
      .select("id,title,origin,lifecycle_status")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || "Failed to check hub names");
    const batch = (data ?? []) as HubNameRow[];
    const hit = batch.find(
      (row) => hubNamesCollide(row.title, slug) && (!excludeId || row.id !== excludeId),
    );
    if (hit) return toConflict(hit);
    if (batch.length < pageSize) break;
  }
  return null;
}

export async function findHubNameConflict(
  raw: string,
  excludeId?: string | null,
): Promise<HubNameConflict | null> {
  const slug = sanitizeHubNameInput(raw);
  if (!slug) return null;

  try {
    const { data: available, error } = await supabaseAdmin.rpc("is_hub_name_available", {
      candidate_name: slug,
      exclude_discussion_id: excludeId ?? null,
    });
    if (!error && available === true) return null;
  } catch {
    // Fall through to a table scan if the RPC is missing or throws.
  }

  return scanHubNameConflict(slug, excludeId);
}

export async function prepareUniqueHubName(
  raw: string,
  excludeId?: string | null,
): Promise<string> {
  const slug = assertHubName(raw);

  try {
    const { data, error } = await supabaseAdmin.rpc("prepare_hub_name", {
      p_name: slug,
      p_exclude_id: excludeId ?? null,
    });
    if (!error && typeof data === "string" && data.trim()) {
      return sanitizeHubNameInput(data);
    }
    if (error && !isMissingRpc(error.message ?? "")) {
      const conflict = await findHubNameConflict(slug, excludeId);
      if (conflict) throw new Error(hubNameConflictMessage(conflict));
      throw new Error(mapHubNameDbError(error.message) || error.message);
    }
  } catch (error: unknown) {
    if (error instanceof Error && (mapHubNameDbError(error.message) || error.message.includes("already"))) {
      throw error;
    }
  }

  const conflict = await findHubNameConflict(slug, excludeId);
  if (conflict) throw new Error(hubNameConflictMessage(conflict));
  return slug;
}

export function isHubNameUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "23505" || /area_discussions_hub_name|discussion_name_taken/i.test(message);
}
