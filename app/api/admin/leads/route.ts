import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type { LeadListItem, LeadStatus } from "@/lib/commercial/types";

const LEAD_STATUSES = new Set<LeadStatus>(["new", "contacted", "closed"]);

export async function GET(req: NextRequest) {
  await getCurrentAdmin();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const communityId = searchParams.get("communityId")?.trim() || null;
  const listingId = searchParams.get("listingId")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "-created_at";

  if (status && !LEAD_STATUSES.has(status as LeadStatus)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_list_community_leads", {
      p_community_id: communityId,
      p_listing_id: listingId,
      p_status: status,
      p_search: search,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    });

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as {
      total?: number;
      page?: number;
      page_size?: number;
      leads?: LeadListItem[];
    };

    return NextResponse.json({
      leads: payload.leads ?? [],
      total: Number(payload.total ?? 0),
      page: Number(payload.page ?? page),
      pageSize: Number(payload.page_size ?? pageSize),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch leads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
