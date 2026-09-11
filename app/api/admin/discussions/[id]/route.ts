import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { mapHubNameDbError } from "@/lib/hub-name";
import { isHubNameUniqueViolation, prepareUniqueHubName } from "@/lib/hub-name-db";
import type { DiscussionRow, ProfileStub } from "@/lib/discussions/types";

const DETAIL_SELECT =
  "id,creator_id,title,description,center_lat,center_lng,radius_miles,location_hint,comment_count,lifecycle_status,engagement_score,unique_participant_count,bootstrap_expires_at,last_check_in_at,check_in_due_at,grace_expires_at,claim_window_opens_at,claim_window_closes_at,auto_share_updates,auto_share_feed,created_at,updated_at,origin,avatar_url,never_expires,place_kind,place_key";

const DETAIL_CORE_SELECT =
  "id,creator_id,title,description,center_lat,center_lng,radius_miles,location_hint,comment_count,lifecycle_status,engagement_score,unique_participant_count,created_at,updated_at";

export type ReverseGeocodedAddress = {
  display_name: string;
  road: string | null;
  house_number: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
};

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodedAddress | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SterlingAdminDashboard/1.0 (admin moderation tool)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const addr = body?.address ?? {};
    return {
      display_name: body?.display_name ?? "",
      road: addr.road ?? null,
      house_number: addr.house_number ?? null,
      city: addr.city ?? addr.town ?? addr.village ?? null,
      state: addr.state ?? null,
      postcode: addr.postcode ?? null,
      country: addr.country ?? null,
    };
  } catch {
    return null;
  }
}

type ReportRow = {
  id: string;
  reporter_id: string;
  report_type: string;
  category: string;
  description: string | null;
  status: string;
  discussion_id: string;
  created_at: string;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  try {
    let discussionRes = await supabaseAdmin
      .from("area_discussions")
      .select(DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (discussionRes.error && isMissingSchemaError(discussionRes.error)) {
      discussionRes = await supabaseAdmin
        .from("area_discussions")
        .select(DETAIL_CORE_SELECT)
        .eq("id", id)
        .maybeSingle();
    }
    if (discussionRes.error) throw new Error(discussionRes.error.message);
    if (!discussionRes.data) return NextResponse.json({ error: "Hub not found" }, { status: 404 });

    const d = discussionRes.data as DiscussionRow;

    const [reportsRes, address, claimsRes] = await Promise.all([
      supabaseAdmin
        .from("reports")
        .select("id,reporter_id,report_type,category,description,status,discussion_id,created_at")
        .eq("discussion_id", id)
        .order("created_at", { ascending: false }),
      reverseGeocode(d.center_lat, d.center_lng),
      supabaseAdmin
        .from("discussion_stewardship_claims")
        .select("user_id,created_at")
        .eq("discussion_id", id)
        .order("created_at", { ascending: true }),
    ]);

    const reports = reportsRes.error ? [] : ((reportsRes.data ?? []) as ReportRow[]);

    const profileIds = [...new Set([d.creator_id, ...reports.map((r) => r.reporter_id)].filter(Boolean))];
    const { data: profiles, error: profilesError } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,username,avatar_url").in("id", profileIds)
      : { data: [] as ProfileStub[], error: null };
    if (profilesError && !isMissingSchemaError(profilesError)) throw new Error(profilesError.message);

    const profileMap = new Map<string, ProfileStub>(((profiles as ProfileStub[]) ?? []).map((p) => [p.id, p]));

    return NextResponse.json({
      discussion: {
        ...d,
        avg_rate: null,
        rate_count: 0,
        is_live: false,
        creator: profileMap.get(d.creator_id) ?? null,
        auto_share_updates: Boolean(d.auto_share_updates),
        auto_share_feed: Boolean(d.auto_share_feed),
      },
      comments: [],
      reports: reports.map((r) => ({ ...r, reporter: profileMap.get(r.reporter_id) ?? null })),
      address,
      stewardshipClaims: Array.isArray(claimsRes.data) ? claimsRes.data : [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    try {
      updates.title = await prepareUniqueHubName(body.title, id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid hub name";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.description === null) {
    updates.description = null;
  } else if (typeof body.description === "string") {
    updates.description = body.description.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  try {
    const { data: before, error: fetchError } = await supabaseAdmin
      .from("area_discussions")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!before) return NextResponse.json({ error: "Hub not found" }, { status: 404 });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("area_discussions")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (updateError) {
      if (isHubNameUniqueViolation(updateError)) {
        return NextResponse.json({ error: "That hub name is already in use." }, { status: 400 });
      }
      throw new Error(mapHubNameDbError(updateError.message) || updateError.message);
    }

    await logAdminAction({
      category: "moderation",
      action: "update_discussion",
      detail: `Updated hub "${(before as { title: string }).title}" (${id}): ${JSON.stringify(updates)}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ discussion: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  let resolveReports = true;
  let reason: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.resolveReports === "boolean") resolveReports = body.resolveReports;
    reason = body?.reason;
  } catch {
    // defaults
  }

  try {
    const { data: discussion, error: fetchError } = await supabaseAdmin
      .from("area_discussions")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!discussion) return NextResponse.json({ error: "Hub not found" }, { status: 404 });

    const { error: deleteError } = await supabaseAdmin.from("area_discussions").delete().eq("id", id);
    if (deleteError) throw new Error(deleteError.message);

    if (resolveReports) {
      const { error: reportsError } = await supabaseAdmin
        .from("reports")
        .update({ status: "resolved" })
        .eq("discussion_id", id)
        .eq("status", "pending");
      if (reportsError) throw new Error(reportsError.message);
    }

    await logAdminAction({
      category: "moderation",
      action: "delete_discussion",
      detail: `Deleted hub "${discussion.title}" (${id})${reason ? `: ${reason}` : ""}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
