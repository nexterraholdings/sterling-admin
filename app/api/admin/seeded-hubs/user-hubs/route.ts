import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { listAllUserHubs } from "@/lib/seeded-hubs/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function GET(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radius = Number(searchParams.get("radius"));
  const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);

  try {
    const hubs = await listAllUserHubs({
      search,
      fromLat: hasCenter ? lat : null,
      fromLng: hasCenter ? lng : null,
      radiusMiles: Number.isFinite(radius) ? radius : null,
    });
    return NextResponse.json({ hubs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list user hubs";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}
