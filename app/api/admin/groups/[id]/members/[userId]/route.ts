import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { removeGroupMember } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id, userId } = await params;

  try {
    await removeGroupMember(id, userId);
    await logAdminAction({
      category: "admin",
      action: "remove_group_member",
      detail: `Removed member ${userId} from group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove member";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}
