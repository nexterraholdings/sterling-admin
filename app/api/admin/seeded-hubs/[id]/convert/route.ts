import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { convertUserHubsToGroups } from "@/lib/seeded-hubs/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;
  let body: { sourceIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceIds = (body.sourceIds ?? []).map((value) => String(value).trim()).filter(Boolean);
  if (sourceIds.length === 0) {
    return NextResponse.json({ error: "Select at least one hub to convert" }, { status: 400 });
  }
  if (sourceIds.length > 50) {
    return NextResponse.json({ error: "Convert at most 50 hubs at a time" }, { status: 400 });
  }

  try {
    const payload = await convertUserHubsToGroups(id, sourceIds);
    await logAdminAction({
      category: "admin",
      action: "convert_user_hubs_to_groups",
      detail: `Converted ${payload.converted_count} hub(s) into groups on ${id}`
        + (payload.error_count ? `; ${payload.error_count} failed` : ""),
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to convert hubs";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}
