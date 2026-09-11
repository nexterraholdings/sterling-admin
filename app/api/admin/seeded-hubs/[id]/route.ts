import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { deleteSeededHub, updateSeededHubCoverage } from "@/lib/seeded-hubs/db";
import {
  clampSeededRadius,
  isValidSeededCoordinate,
  mapSeededHubRpcError,
  type SeededPlaceKind,
} from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string }> };

const PLACE_KINDS = new Set<SeededPlaceKind>(["city", "neighborhood"]);

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;
  let body: {
    center_lat?: number;
    center_lng?: number;
    radius_miles?: number;
    location_hint?: string | null;
    place_kind?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.place_kind && !PLACE_KINDS.has(body.place_kind as SeededPlaceKind)) {
    return NextResponse.json({ error: "Size must be city or neighborhood" }, { status: 400 });
  }
  const rawRadius = body.radius_miles == null ? null : Number(body.radius_miles);
  const radius = rawRadius == null ? null : clampSeededRadius(rawRadius);
  if (rawRadius != null && (!Number.isFinite(rawRadius) || radius == null || radius < 1 || radius > 50)) {
    return NextResponse.json({ error: "Radius must be between 1 and 50 miles" }, { status: 400 });
  }
  const lat = body.center_lat == null ? undefined : Number(body.center_lat);
  const lng = body.center_lng == null ? undefined : Number(body.center_lng);
  if ((lat != null || lng != null) && (lat == null || lng == null || !isValidSeededCoordinate(lat, lng))) {
    return NextResponse.json({ error: "Enter a valid latitude and longitude." }, { status: 400 });
  }

  try {
    const hub = await updateSeededHubCoverage(id, {
      centerLat: lat,
      centerLng: lng,
      radiusMiles: radius ?? undefined,
      locationHint: body.location_hint,
      placeKind: body.place_kind as SeededPlaceKind | undefined,
    });
    await logAdminAction({
      category: "admin",
      action: "update_seeded_hub_coverage",
      detail: `Updated coverage for ${hub.title} (${hub.place_kind ?? "city"}, ${hub.radius_miles} mi)`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ hub });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update seeded hub";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;
  try {
    const deleted = await deleteSeededHub(id);
    await logAdminAction({
      category: "admin",
      action: "delete_seeded_hub",
      detail: `Deleted seeded hub ${deleted.title} (${deleted.group_count} groups, ${deleted.comment_count} posts, ${deleted.member_count} members)`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ deleted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete seeded hub";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
