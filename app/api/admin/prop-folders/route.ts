import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { createUniversalPropFolder } from "@/lib/groups/propFolders";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  let body: { name?: string; parentId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const folder = await createUniversalPropFolder(body.name ?? "", body.parentId ?? null);
    await logAdminAction({
      category: "admin",
      action: "create_prop_folder",
      detail: `Created prop folder "${folder.name}"`,
      targetType: "prop_folder",
      targetId: folder.id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ folder });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create folder";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 400 });
  }
}
