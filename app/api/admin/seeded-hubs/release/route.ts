import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { getCityHubsLaunchPreview, releaseCityHubs } from "@/lib/seeded-hubs/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function GET() {
  await requireAdmin(OPERATOR_ROLES);
  try {
    const launch = await getCityHubsLaunchPreview();
    return NextResponse.json({ launch });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load launch state";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (String(body.confirm ?? "").trim() !== "RELEASE") {
    return NextResponse.json({ error: "Type RELEASE to confirm this cannot be undone." }, { status: 400 });
  }

  try {
    const launch = await releaseCityHubs(admin.id);
    await logAdminAction({
      category: "admin",
      action: "release_city_hubs",
      detail:
        `Published ${launch.seeded_count} seeded hubs, paused lifecycle, moved ${launch.leftover_converted} leftover pin(s) onto groups`
        + (launch.leftover_failed ? `; ${launch.leftover_failed} failed` : ""),
      targetType: "city_hubs_launch",
      targetId: "1",
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ launch });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to release city hubs";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped.toLowerCase().includes("already live") || mapped.toLowerCase().includes("already_released")
      ? 409
      : mapped.toLowerCase().includes("plant at least")
        ? 400
        : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
