import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { moveGroupsToHub } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  let body: { groupIds?: string[]; targetHubId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupIds = (body.groupIds ?? []).map((value) => String(value).trim()).filter(Boolean);
  const targetHubId = String(body.targetHubId ?? "").trim();
  if (groupIds.length === 0) {
    return NextResponse.json({ error: "Select at least one group to move" }, { status: 400 });
  }
  if (groupIds.length > 50) {
    return NextResponse.json({ error: "Move at most 50 groups at a time" }, { status: 400 });
  }
  if (!targetHubId) {
    return NextResponse.json({ error: "Pick a destination hub" }, { status: 400 });
  }

  try {
    const payload = await moveGroupsToHub(groupIds, targetHubId);
    const targetTitle = payload.moved[0]?.target_hub_title ?? targetHubId;
    await logAdminAction({
      category: "admin",
      action: "move_groups_between_hubs",
      detail: `Moved ${payload.moved_count} group(s) to ${targetTitle}`
        + (payload.skipped_count ? `; ${payload.skipped_count} already there` : "")
        + (payload.error_count ? `; ${payload.error_count} failed` : ""),
      targetType: "area_discussion",
      targetId: targetHubId,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to move groups";
    const mapped = mapSeededHubRpcError(message);
    const clientError =
      mapped.toLowerCase().includes("select at least")
      || mapped.toLowerCase().includes("at most")
      || mapped.toLowerCase().includes("destination")
      || mapped.toLowerCase().includes("seeded")
      || mapped.toLowerCase().includes("not found");
    return NextResponse.json({ error: mapped }, { status: clientError ? 400 : 500 });
  }
}
