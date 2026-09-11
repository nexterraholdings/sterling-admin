import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { listGroupContent, publishGroupContent } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  try {
    const items = await listGroupContent(id);
    return NextResponse.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load group content";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  let body: { accountId?: string; body?: string; parentId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = body.accountId?.trim() ?? "";
  const text = body.body?.trim() ?? "";
  const parentId = body.parentId?.trim() || null;
  if (!accountId) return NextResponse.json({ error: "Choose a prop account to post as" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Post body is required" }, { status: 400 });

  try {
    const item = await publishGroupContent({ groupId: id, accountId, body: text, parentId });
    await logAdminAction({
      category: "admin",
      action: parentId ? "seed_group_reply" : "seed_group_content",
      detail: `Seeded ${parentId ? "reply" : "content"} into group ${id} as ${item.author?.username ?? accountId}`,
      targetType: "discussion_group",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to publish group content";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped === "group_not_found" ? 404 : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
