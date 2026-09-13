import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { bulkCreateSeededHubs, type BulkSeedCityInput } from "@/lib/seeded-hubs/db";
import { clampSeededRadius, isValidSeededCoordinate } from "@/lib/seeded-hubs/types";

type BulkBody = {
  radius_miles?: number;
  cities?: Array<{
    title?: string;
    center_lat?: number;
    center_lng?: number;
    location_hint?: string | null;
  }>;
};

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);

  let body: BulkBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawRadius = Number(body.radius_miles);
  const radius = clampSeededRadius(rawRadius);
  if (!Number.isFinite(rawRadius) || radius < 1 || radius > 50) {
    return NextResponse.json({ error: "Radius must be between 1 and 50 miles" }, { status: 400 });
  }

  const rawCities = Array.isArray(body.cities) ? body.cities : [];
  if (rawCities.length === 0) {
    return NextResponse.json({ error: "Pick at least one city to plant." }, { status: 400 });
  }
  if (rawCities.length > 200) {
    return NextResponse.json({ error: "Plant at most 200 cities at a time." }, { status: 400 });
  }

  const cities: BulkSeedCityInput[] = [];
  const upfrontErrors: Array<{ title: string; error: string }> = [];
  for (const city of rawCities) {
    const title = String(city.title ?? "").trim();
    const lat = Number(city.center_lat);
    const lng = Number(city.center_lng);
    if (!title) {
      upfrontErrors.push({ title: title || "(untitled)", error: "Title is required" });
      continue;
    }
    if (!isValidSeededCoordinate(lat, lng)) {
      upfrontErrors.push({ title, error: "Invalid coordinates" });
      continue;
    }
    cities.push({ title, centerLat: lat, centerLng: lng, locationHint: city.location_hint ?? null });
  }

  try {
    const result = await bulkCreateSeededHubs(cities, radius);
    const errors = [...upfrontErrors, ...result.errors];
    await logAdminAction({
      category: "admin",
      action: "bulk_create_seeded_hubs",
      detail: `Planted ${result.created.length} of ${rawCities.length} cities at ${radius} mi${errors.length ? ` (${errors.length} failed)` : ""}`,
      targetType: "area_discussion",
      targetId: result.created[0]?.id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({
      created: result.created,
      errors,
      created_count: result.created.length,
      error_count: errors.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to plant hubs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
