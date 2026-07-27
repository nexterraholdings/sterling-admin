import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type { DiscussionLifecycleStatus, DiscussionListItem } from "@/lib/discussions/types";
import {
  ADMIN_DISCUSSION_LIFECYCLE_STATUSES,
  isAdminDiscussionLifecycleStatus,
  normalizeLifecycleFilterParam,
} from "@/lib/discussions/lifecycle";

export type { DiscussionLifecycleStatus, DiscussionRow, ProfileStub } from "@/lib/discussions/types";
export type { DiscussionListItem };

const LIFECYCLE_STATUSES = new Set<DiscussionLifecycleStatus>([
  ...ADMIN_DISCUSSION_LIFECYCLE_STATUSES,
  "auction",
]);

export async function GET(req: NextRequest) {
  await getCurrentAdmin();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const city = searchParams.get("city")?.trim() || null;
  const communitySearch = searchParams.get("community")?.trim() || null;
  const creatorSearch = searchParams.get("creator")?.trim() || null;
  const dateFrom = searchParams.get("dateFrom") || null;
  const dateTo = searchParams.get("dateTo") || null;
  const minReports = Number(searchParams.get("minReports") ?? "0") || 0;
  const lifecycleStatusRaw = searchParams.get("lifecycleStatus")?.trim() || null;
  const lifecycleStatus = normalizeLifecycleFilterParam(lifecycleStatusRaw);
  const liveOnly = searchParams.get("liveOnly") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "-created_at";

  if (lifecycleStatus && !LIFECYCLE_STATUSES.has(lifecycleStatus as DiscussionLifecycleStatus)) {
    return NextResponse.json({ error: `Invalid lifecycle status: ${lifecycleStatus}` }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_list_area_discussions", {
      p_search: search,
      p_location_hint: city,
      p_community_search: communitySearch,
      p_creator_search: creatorSearch,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_lifecycle_status: lifecycleStatus,
      p_live_only: liveOnly,
      p_min_reports: minReports,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    });

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as {
      total?: number;
      page?: number;
      page_size?: number;
      discussions?: Array<{
        discussion: Record<string, unknown>;
        creator: DiscussionListItem["creator"];
        community: DiscussionListItem["community"];
        report_count: number;
      }>;
    };

    const discussions: DiscussionListItem[] = (payload.discussions ?? []).map((row) => ({
      ...(row.discussion as DiscussionListItem),
      creator: row.creator ?? null,
      community: row.community ?? null,
      report_count: row.report_count ?? 0,
    }));

    return NextResponse.json({
      discussions,
      total: Number(payload.total ?? 0),
      page: Number(payload.page ?? page),
      pageSize: Number(payload.page_size ?? pageSize),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch hubs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
