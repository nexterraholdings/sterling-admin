import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { addGroupMembers, listGroupMembers } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  try {
    const members = await listGroupMembers(id);
    return NextResponse.json({ members });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load group members";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  let body: { userId?: string; userIds?: string[]; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = body.role?.trim() || "member";
  const userIds = [
    ...new Set(
      [...(Array.isArray(body.userIds) ? body.userIds : []), body.userId ?? ""]
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "Choose a prop account to add" }, { status: 400 });
  }

  try {
    const result = await addGroupMembers(id, userIds, role);
    await logAdminAction({
      category: "admin",
      action: "add_group_member",
      detail:
        result.added === 1
          ? `Added member ${userIds[0]} to group ${id}`
          : `Added ${result.added} members to group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true, added: result.added });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add member";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped === "group_not_found" || mapped === "account_not_found" ? 404 : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
