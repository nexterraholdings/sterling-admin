import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { addGroupMember, listGroupMembers } from "@/lib/groups/db";
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

  let body: { userId?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  const role = body.role?.trim() || "member";
  if (!userId) return NextResponse.json({ error: "Choose a prop account to add" }, { status: 400 });

  try {
    await addGroupMember(id, userId, role);
    await logAdminAction({
      category: "admin",
      action: "add_group_member",
      detail: `Added member ${userId} to group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add member";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped === "group_not_found" || mapped === "account_not_found" ? 404 : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
