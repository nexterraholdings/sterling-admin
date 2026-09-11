import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import type { DiscussionLifecycleStatus } from "@/lib/discussions/types";
import { listAdminDiscussions } from "@/lib/discussions/listDiscussions";
import {
  ADMIN_DISCUSSION_LIFECYCLE_STATUSES,
  normalizeLifecycleFilterParam,
} from "@/lib/discussions/lifecycle";

export type { DiscussionLifecycleStatus, DiscussionRow, ProfileStub } from "@/lib/discussions/types";
export type { DiscussionListItem } from "@/lib/discussions/types";

const LIFECYCLE_STATUSES = new Set<DiscussionLifecycleStatus>([
  ...ADMIN_DISCUSSION_LIFECYCLE_STATUSES,
  "bootstrap",
  "auction",
]);

export async function GET(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const city = searchParams.get("city")?.trim() || null;
  const creatorSearch = searchParams.get("creator")?.trim() || null;
  const dateFrom = searchParams.get("dateFrom") || null;
  const dateTo = searchParams.get("dateTo") || null;
  const minReports = Number(searchParams.get("minReports") ?? "0") || 0;
  const lifecycleStatusRaw = searchParams.get("lifecycleStatus")?.trim() || null;
  const lifecycleStatus = normalizeLifecycleFilterParam(lifecycleStatusRaw);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "-created_at";

  if (lifecycleStatus && !LIFECYCLE_STATUSES.has(lifecycleStatus as DiscussionLifecycleStatus)) {
    return NextResponse.json({ error: `Invalid lifecycle status: ${lifecycleStatus}` }, { status: 400 });
  }

  try {
    const payload = await listAdminDiscussions({
      search,
      city,
      creatorSearch,
      dateFrom,
      dateTo,
      lifecycleStatus,
      minReports,
      sort,
      page,
      pageSize,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch hubs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
