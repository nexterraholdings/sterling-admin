import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { createPropFolder, listPropFolders } from "@/lib/groups/propFolders";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;
  try {
    const folders = await listPropFolders(id);
    return NextResponse.json({ folders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load folders";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;
  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const folder = await createPropFolder(id, body.name ?? "");
    await logAdminAction({
      category: "admin",
      action: "create_prop_folder",
      detail: `Created prop folder "${folder.name}" in group ${id}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ folder });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create folder";
    const status = message === "group_not_found" ? 404 : 400;
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status });
  }
}
