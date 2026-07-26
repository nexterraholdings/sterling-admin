import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type { ListingListItem, ListingStatus, ListingType } from "@/lib/commercial/types";

const LISTING_TYPES = new Set<ListingType>(["sale", "rent", "deal"]);
const LISTING_STATUSES = new Set<ListingStatus>(["active", "pending", "sold", "expired"]);

export async function GET(req: NextRequest) {
  await getCurrentAdmin();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const communitySearch = searchParams.get("community")?.trim() || null;
  const communityId = searchParams.get("communityId")?.trim() || null;
  const listingType = searchParams.get("listingType")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "-created_at";

  if (listingType && !LISTING_TYPES.has(listingType as ListingType)) {
    return NextResponse.json({ error: `Invalid listing type: ${listingType}` }, { status: 400 });
  }
  if (status && !LISTING_STATUSES.has(status as ListingStatus)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_list_community_listings", {
      p_search: search,
      p_community_search: communitySearch,
      p_community_id: communityId,
      p_listing_type: listingType,
      p_status: status,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    });

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as {
      total?: number;
      page?: number;
      page_size?: number;
      listings?: ListingListItem[];
    };

    return NextResponse.json({
      listings: payload.listings ?? [],
      total: Number(payload.total ?? 0),
      page: Number(payload.page ?? page),
      pageSize: Number(payload.page_size ?? pageSize),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch listings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
