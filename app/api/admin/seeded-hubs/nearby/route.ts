import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { listNearbyUserHubs } from "@/lib/seeded-hubs/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function GET(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Number(searchParams.get("radius"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Latitude and longitude are required" }, { status: 400 });
  }
  if (!Number.isFinite(radius) || radius < 1 || radius > 50) {
    return NextResponse.json({ error: "Radius must be between 1 and 50 miles" }, { status: 400 });
  }

  try {
    const hubs = await listNearbyUserHubs(lat, lng, radius);
    return NextResponse.json({ hubs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list nearby hubs";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}
