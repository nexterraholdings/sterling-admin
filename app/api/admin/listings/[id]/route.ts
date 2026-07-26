import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import type {
  CommunityListingRow,
  LeadListItem,
  ListingCommunityStub,
  ListingCreatorStub,
  ListingStatus,
} from "@/lib/commercial/types";

const LISTING_STATUSES = new Set<ListingStatus>(["active", "pending", "sold", "expired"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await getCurrentAdmin();
  const { id } = await params;

  try {
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("community_listings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (listingError) throw new Error(listingError.message);
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const l = listing as CommunityListingRow;

    const [communityRes, creatorRes, leadsRes] = await Promise.all([
      supabaseAdmin
        .from("communities")
        .select("id,name,community_type")
        .eq("id", l.community_id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id,full_name,username,avatar_url")
        .eq("id", l.created_by)
        .maybeSingle(),
      supabaseAdmin.rpc("admin_list_community_leads", {
        p_listing_id: id,
        p_page: 1,
        p_page_size: 50,
      }),
    ]);

    if (communityRes.error) throw new Error(communityRes.error.message);
    if (creatorRes.error) throw new Error(creatorRes.error.message);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    const community = (communityRes.data ?? null) as ListingCommunityStub | null;
    const creator = (creatorRes.data ?? null) as ListingCreatorStub | null;
    const leadsPayload = (leadsRes.data ?? {}) as { leads?: LeadListItem[]; total?: number };

    return NextResponse.json({
      listing: l,
      community,
      creator,
      leads: leadsPayload.leads ?? [],
      leadCount: Number(leadsPayload.total ?? 0),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch listing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.status !== "string" || !LISTING_STATUSES.has(body.status as ListingStatus)) {
    return NextResponse.json({ error: "A valid status is required" }, { status: 400 });
  }

  try {
    const { data: before, error: fetchError } = await supabaseAdmin
      .from("community_listings")
      .select("title,status")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!before) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("community_listings")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);

    await logAdminAction({
      category: "moderation",
      action: "update_listing_status",
      detail: `Changed listing "${before.title}" (${id}) status: ${before.status} → ${body.status}`,
      targetType: "community_listing",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ listing: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update listing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  const { id } = await params;

  try {
    const { data: listing, error: fetchError } = await supabaseAdmin
      .from("community_listings")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const { error: deleteError } = await supabaseAdmin.from("community_listings").delete().eq("id", id);
    if (deleteError) throw new Error(deleteError.message);

    await logAdminAction({
      category: "moderation",
      action: "delete_listing",
      detail: `Deleted listing "${listing.title}" (${id})`,
      targetType: "community_listing",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete listing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
