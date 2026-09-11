import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { deleteGroupContent } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id, commentId } = await params;

  try {
    await deleteGroupContent(id, commentId);
    await logAdminAction({
      category: "admin",
      action: "delete_seeded_group_content",
      detail: `Deleted post ${commentId} from group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete post";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped === "comment_not_found" ? 404 : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
