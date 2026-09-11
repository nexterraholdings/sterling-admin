import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { createSeededHub, listSeededHubs } from "@/lib/seeded-hubs/db";
import {
  clampSeededRadius,
  isValidSeededCoordinate,
  mapSeededHubRpcError,
  type SeededPlaceKind,
} from "@/lib/seeded-hubs/types";
import { hubNameConflictMessage, hubNameFormatError, sanitizeHubNameInput } from "@/lib/hub-name";
import { findHubNameConflict } from "@/lib/hub-name-db";

const PLACE_KINDS = new Set<SeededPlaceKind>(["city", "neighborhood"]);

export async function GET(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);
  const params = new URL(req.url).searchParams;
  const checkName = params.get("checkName")?.trim();
  if (checkName) {
    const slug = sanitizeHubNameInput(checkName);
    const formatError = hubNameFormatError(slug);
    if (!slug || formatError) {
      return NextResponse.json({
        slug,
        available: false,
        error: formatError || "Hub name is required.",
        conflict: null,
      });
    }
    try {
      const conflict = await findHubNameConflict(slug);
      if (conflict) {
        return NextResponse.json({
          slug,
          available: false,
          error: hubNameConflictMessage(conflict),
          conflict,
        });
      }
      return NextResponse.json({ slug, available: true, error: null, conflict: null });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to check hub name";
      return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
    }
  }

  const search = params.get("search")?.trim() || null;

  try {
    const hubs = await listSeededHubs(search);
    return NextResponse.json({ hubs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list seeded hubs";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  let body: {
    title?: string;
    center_lat?: number;
    center_lng?: number;
    radius_miles?: number;
    location_hint?: string | null;
    place_kind?: string;
    description?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body.title?.trim() ?? "";
  const lat = Number(body.center_lat);
  const lng = Number(body.center_lng);
  const rawRadius = Number(body.radius_miles);
  const radius = clampSeededRadius(rawRadius);
  const placeKind = (body.place_kind?.trim() || "city") as SeededPlaceKind;

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!isValidSeededCoordinate(lat, lng)) {
    return NextResponse.json({ error: "Enter a valid latitude and longitude." }, { status: 400 });
  }
  if (!Number.isFinite(rawRadius) || radius < 1 || radius > 50) {
    return NextResponse.json({ error: "Radius must be between 1 and 50 miles" }, { status: 400 });
  }
  if (!PLACE_KINDS.has(placeKind)) {
    return NextResponse.json({ error: "Size must be city or neighborhood" }, { status: 400 });
  }

  try {
    const hub = await createSeededHub({
      title,
      centerLat: lat,
      centerLng: lng,
      radiusMiles: radius,
      locationHint: body.location_hint?.trim() || null,
      placeKind,
      description: body.description?.trim() || null,
    });
    await logAdminAction({
      category: "admin",
      action: "create_seeded_hub",
      detail: `Planted ${hub.title} (${hub.place_kind ?? placeKind}, ${hub.radius_miles} mi) at ${lat}, ${lng}`,
      targetType: "area_discussion",
      targetId: hub.id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ hub });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create seeded hub";
    const mapped = mapSeededHubRpcError(message);
    const clientError =
      mapped.toLowerCase().includes("hub name")
      || mapped.toLowerCase().includes("already in use")
      || mapped.toLowerCase().includes("already used")
      || mapped.toLowerCase().includes("reserved");
    return NextResponse.json({ error: mapped }, { status: clientError ? 400 : 500 });
  }
}
