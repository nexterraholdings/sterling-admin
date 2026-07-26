import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import type { CommunityStub, DiscussionRow, LiveSessionRow, ProfileStub } from "@/lib/discussions/types";

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

type CommentRow = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  likes_count: number;
  created_at: string;
};

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
  await getCurrentAdmin();
  const { id } = await params;

  try {
    const { data: discussion, error: discussionError } = await supabaseAdmin
      .from("area_discussions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (discussionError) throw new Error(discussionError.message);
    if (!discussion) return NextResponse.json({ error: "Hub not found" }, { status: 404 });

    const d = discussion as DiscussionRow;

    const [commentsRes, ratesRes, reportsRes, sessionsRes, communityRes, address, auctionRes] =
      await Promise.all([
        supabaseAdmin
          .from("area_discussion_comments")
          .select("*")
          .eq("discussion_id", id)
          .order("created_at", { ascending: true })
          .limit(200),
        supabaseAdmin.from("area_rates").select("value").eq("discussion_id", id),
        supabaseAdmin
          .from("reports")
          .select("id,reporter_id,report_type,category,description,status,discussion_id,created_at")
          .eq("discussion_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("discussion_live_sessions")
          .select("id,discussion_id,started_at,ended_at,end_reason")
          .eq("discussion_id", id)
          .order("started_at", { ascending: false })
          .limit(50),
        d.community_id
          ? supabaseAdmin.from("communities").select("id,name").eq("id", d.community_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        reverseGeocode(d.center_lat, d.center_lng),
        supabaseAdmin.rpc("get_discussion_auction", { p_discussion_id: id }),
      ]);

    if (commentsRes.error) throw new Error(commentsRes.error.message);
    if (ratesRes.error) throw new Error(ratesRes.error.message);
    if (reportsRes.error) throw new Error(reportsRes.error.message);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    if (communityRes.error) throw new Error(communityRes.error.message);

    const comments = (commentsRes.data ?? []) as CommentRow[];
    const reports = (reportsRes.data ?? []) as ReportRow[];
    const liveSessions = (sessionsRes.data ?? []) as LiveSessionRow[];
    const community: CommunityStub | null = communityRes.data
      ? { id: String(communityRes.data.id), name: communityRes.data.name ?? null }
      : null;

    const profileIds = [
      ...new Set([
        d.creator_id,
        ...comments.map((c) => c.author_id),
        ...reports.map((r) => r.reporter_id),
      ]),
    ];
    const { data: profiles, error: profilesError } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,username,avatar_url").in("id", profileIds)
      : { data: [] as ProfileStub[], error: null };
    if (profilesError) throw new Error(profilesError.message);

    const profileMap = new Map<string, ProfileStub>(((profiles as ProfileStub[]) ?? []).map((p) => [p.id, p]));

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of (ratesRes.data ?? []) as { value: number }[]) {
      const bucket = Math.min(5, Math.max(1, Math.round(r.value))) as 1 | 2 | 3 | 4 | 5;
      distribution[bucket]++;
    }

    const liveLimitsRes = await supabaseAdmin.rpc("get_discussion_live_limits", { p_discussion_id: id });

    return NextResponse.json({
      discussion: {
        ...d,
        creator: profileMap.get(d.creator_id) ?? null,
        community,
        auto_share_updates: Boolean(d.auto_share_updates),
        auto_share_feed: Boolean(d.auto_share_feed),
      },
      comments: comments.map((c) => ({ ...c, author: profileMap.get(c.author_id) ?? null })),
      ratings: {
        avg_rate: d.avg_rate,
        rate_count: d.rate_count,
        distribution,
      },
      reports: reports.map((r) => ({ ...r, reporter: profileMap.get(r.reporter_id) ?? null })),
      address,
      liveSessions,
      liveLimits: liveLimitsRes.data ?? null,
      auction: auctionRes.error ? null : auctionRes.data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch hub";
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

  const updates: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (title.length < 1 || title.length > 60) {
      return NextResponse.json({ error: "Title must be 1–60 characters" }, { status: 400 });
    }
    updates.title = title;
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
    if (updateError) throw new Error(updateError.message);

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
  const admin = await getCurrentAdmin();
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
