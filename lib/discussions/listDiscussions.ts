import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeDiscussionLifecycleStatus } from "@/lib/discussions/lifecycle";
import type { DiscussionListItem, ProfileStub } from "@/lib/discussions/types";

const LIST_SELECT =
  "id,creator_id,title,description,center_lat,center_lng,radius_miles,location_hint,lifecycle_status,engagement_score,unique_participant_count,comment_count,created_at,updated_at,origin";

const CORE_SELECT =
  "id,creator_id,title,description,center_lat,center_lng,radius_miles,location_hint,lifecycle_status,unique_participant_count,comment_count,created_at";

const SORT_COLUMNS = new Set([
  "created_at",
  "comment_count",
  "engagement_score",
  "title",
]);

export function isMissingSchemaError(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    code === "42703" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the function") ||
    msg.includes("could not find the column") ||
    msg.includes("schema cache")
  );
}

function sanitizeIlike(raw: string): string {
  return raw.replace(/[%_,()]/g, "").trim().slice(0, 80);
}

function parseSort(sort: string): { column: string; ascending: boolean } {
  const ascending = !sort.startsWith("-");
  const column = sort.replace(/^-/, "");
  if (!SORT_COLUMNS.has(column)) return { column: "created_at", ascending: false };
  return { column, ascending };
}

function toListItem(
  row: Record<string, unknown>,
  creator: ProfileStub | null,
  reportCount: number
): DiscussionListItem {
  return {
    id: String(row.id),
    creator_id: String(row.creator_id ?? ""),
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    center_lat: Number(row.center_lat ?? 0),
    center_lng: Number(row.center_lng ?? 0),
    radius_miles: Number(row.radius_miles ?? 1),
    location_hint: typeof row.location_hint === "string" ? row.location_hint : null,
    avg_rate: null,
    rate_count: 0,
    comment_count: Number(row.comment_count ?? 0),
    lifecycle_status: normalizeDiscussionLifecycleStatus(String(row.lifecycle_status ?? "active")),
    is_live: false,
    engagement_score: Number(row.engagement_score ?? 0),
    bootstrap_expires_at: typeof row.bootstrap_expires_at === "string" ? row.bootstrap_expires_at : null,
    unique_participant_count: Number(row.unique_participant_count ?? 0),
    last_check_in_at: typeof row.last_check_in_at === "string" ? row.last_check_in_at : null,
    check_in_due_at: typeof row.check_in_due_at === "string" ? row.check_in_due_at : null,
    grace_expires_at: typeof row.grace_expires_at === "string" ? row.grace_expires_at : null,
    claim_window_opens_at: typeof row.claim_window_opens_at === "string" ? row.claim_window_opens_at : null,
    claim_window_closes_at: typeof row.claim_window_closes_at === "string" ? row.claim_window_closes_at : null,
    live_started_at: null,
    live_expires_at: null,
    live_last_go_live_at: null,
    live_cooldown_until: null,
    auto_share_updates: Boolean(row.auto_share_updates),
    auto_share_feed: Boolean(row.auto_share_feed),
    steward_glow_until: typeof row.steward_glow_until === "string" ? row.steward_glow_until : null,
    steward_boost_until: typeof row.steward_boost_until === "string" ? row.steward_boost_until : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
    creator,
    report_count: reportCount,
  };
}

async function pendingReportIds(): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("discussion_id")
    .eq("status", "pending")
    .not("discussion_id", "is", null)
    .limit(5000);
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw new Error(error.message);
  }
  return [...new Set((data ?? []).map((row: { discussion_id: string | null }) => row.discussion_id).filter(Boolean))] as string[];
}

async function reportCountsFor(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("discussion_id")
    .eq("status", "pending")
    .in("discussion_id", ids);
  if (error) {
    if (isMissingSchemaError(error)) return counts;
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const id = String(row.discussion_id ?? "");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function loadCreators(ids: string[]): Promise<Map<string, ProfileStub>> {
  const map = new Map<string, ProfileStub>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const profile of (data ?? []) as ProfileStub[]) {
    map.set(profile.id, profile);
  }
  return map;
}

export type ListDiscussionsInput = {
  search: string | null;
  city: string | null;
  creatorSearch: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  lifecycleStatus: string | null;
  minReports: number;
  sort: string;
  page: number;
  pageSize: number;
};

export async function listAdminDiscussions(input: ListDiscussionsInput): Promise<{
  discussions: DiscussionListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(1, input.pageSize));
  const { column, ascending } = parseSort(input.sort);

  let creatorIds: string[] | null = null;
  const creatorQ = input.creatorSearch ? sanitizeIlike(input.creatorSearch) : "";
  if (creatorQ) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .or(`username.ilike.%${creatorQ}%,full_name.ilike.%${creatorQ}%`)
      .limit(100);
    if (error) throw new Error(error.message);
    const matchedCreatorIds = (data ?? []).map((row: { id: string }) => row.id);
    if (!matchedCreatorIds.length) {
      return { discussions: [], total: 0, page, pageSize };
    }
    creatorIds = matchedCreatorIds;
  }

  let reportedIds: string[] | null = null;
  if (input.minReports > 0) {
    reportedIds = await pendingReportIds();
    if (!reportedIds?.length) {
      return { discussions: [], total: 0, page, pageSize };
    }
  }

  async function run(select: string, sortColumn: string) {
    let query = supabaseAdmin
      .from("area_discussions")
      .select(select, { count: "exact" });

    const titleQ = input.search ? sanitizeIlike(input.search) : "";
    if (titleQ) query = query.ilike("title", `%${titleQ}%`);
    const cityQ = input.city ? sanitizeIlike(input.city) : "";
    if (cityQ) query = query.ilike("location_hint", `%${cityQ}%`);
    if (input.lifecycleStatus) query = query.eq("lifecycle_status", input.lifecycleStatus);
    if (input.dateFrom) query = query.gte("created_at", input.dateFrom);
    if (input.dateTo) query = query.lte("created_at", input.dateTo);
    if (creatorIds) query = query.in("creator_id", creatorIds);
    if (reportedIds) query = query.in("id", reportedIds);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    return query.order(sortColumn, { ascending: sortColumn === column ? ascending : false }).range(from, to);
  }

  let result = await run(LIST_SELECT, column);
  if (result.error && isMissingSchemaError(result.error)) {
    result = await run(CORE_SELECT, "created_at");
  }
  if (result.error) throw new Error(result.error.message);

  const rows = (result.data ?? []) as Record<string, unknown>[];
  const ids = rows.map((row) => String(row.id));
  const [creators, reports] = await Promise.all([
    loadCreators(rows.map((row) => String(row.creator_id ?? ""))),
    reportCountsFor(ids),
  ]);

  return {
    discussions: rows.map((row) =>
      toListItem(row, creators.get(String(row.creator_id ?? "")) ?? null, reports.get(String(row.id)) ?? 0)
    ),
    total: Number(result.count ?? rows.length),
    page,
    pageSize,
  };
}
