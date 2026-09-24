import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { deletePropFolder, renamePropFolder } from "@/lib/groups/propFolders";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string; folderId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id, folderId } = await params;
  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const folder = await renamePropFolder(id, folderId, body.name ?? "");
    await logAdminAction({
      category: "admin",
      action: "rename_prop_folder",
      detail: `Renamed prop folder to "${folder.name}" in group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ folder });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to rename folder";
    const status = message === "folder_not_found" ? 404 : 400;
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id, folderId } = await params;
  try {
    await deletePropFolder(id, folderId);
    await logAdminAction({
      category: "admin",
      action: "delete_prop_folder",
      detail: `Deleted prop folder ${folderId} in group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete folder";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}
