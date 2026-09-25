import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { deleteUniversalPropFolder, moveUniversalPropFolder, renameUniversalPropFolder } from "@/lib/groups/propFolders";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ folderId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { folderId } = await params;
  let body: { name?: string; parentId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (typeof body.name === "string") {
      const folder = await renameUniversalPropFolder(folderId, body.name);
      await logAdminAction({
        category: "admin",
        action: "rename_prop_folder",
        detail: `Renamed prop folder to "${folder.name}"`,
        targetType: "prop_folder",
        targetId: folderId,
        actorId: admin.id,
        actorLabel: admin.email,
      });
      return NextResponse.json({ folder });
    }

    const parentId = body.parentId ? String(body.parentId) : null;
    await moveUniversalPropFolder(folderId, parentId);
    await logAdminAction({
      category: "admin",
      action: "move_prop_folder",
      detail: parentId ? `Moved prop folder ${folderId} into ${parentId}` : `Moved prop folder ${folderId} to the main directory`,
      targetType: "prop_folder",
      targetId: folderId,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update folder";
    const status = message === "folder_not_found" ? 404 : 400;
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { folderId } = await params;
  try {
    await deleteUniversalPropFolder(folderId);
    await logAdminAction({
      category: "admin",
      action: "delete_prop_folder",
      detail: `Deleted prop folder ${folderId}`,
      targetType: "prop_folder",
      targetId: folderId,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete folder";
    const status = message === "folder_not_found" ? 404 : 400;
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status });
  }
}
