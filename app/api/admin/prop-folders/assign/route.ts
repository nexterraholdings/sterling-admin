import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { assignUniversalPropFolder } from "@/lib/groups/propFolders";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  let body: { userIds?: string[]; folderId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userIds = [...new Set((body.userIds ?? []).map((value) => String(value).trim()).filter(Boolean))];
  const folderId = body.folderId ? String(body.folderId) : null;

  try {
    await assignUniversalPropFolder(userIds, folderId);
    await logAdminAction({
      category: "admin",
      action: "assign_prop_folder",
      detail: folderId
        ? `Moved ${userIds.length} prop account${userIds.length === 1 ? "" : "s"} into folder ${folderId}`
        : `Removed ${userIds.length} prop account${userIds.length === 1 ? "" : "s"} from folders`,
      targetType: "prop_folder",
      targetId: folderId ?? undefined,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to move accounts";
    const status = message === "folder_not_found" ? 404 : 400;
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status });
  }
}
