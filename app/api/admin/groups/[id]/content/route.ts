import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { listGroupContent, publishGroupContent, type GroupContentImageInput } from "@/lib/groups/db";
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

async function readPublishInput(req: NextRequest): Promise<{
  accountId: string;
  text: string;
  parentId: string | null;
  image: GroupContentImageInput | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const imageEntry = formData.get("image");
    const image =
      imageEntry instanceof File && imageEntry.size > 0
        ? { buffer: Buffer.from(await imageEntry.arrayBuffer()), contentType: imageEntry.type || null }
        : null;
    return {
      accountId: String(formData.get("accountId") ?? "").trim(),
      text: String(formData.get("body") ?? "").trim(),
      parentId: String(formData.get("parentId") ?? "").trim() || null,
      image,
    };
  }

  const body = (await req.json()) as { accountId?: string; body?: string; parentId?: string | null };
  return {
    accountId: body.accountId?.trim() ?? "",
    text: body.body?.trim() ?? "",
    parentId: body.parentId?.trim() || null,
    image: null,
  };
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  let accountId = "";
  let text = "";
  let parentId: string | null = null;
  let image: GroupContentImageInput | null = null;
  try {
    const input = await readPublishInput(req);
    accountId = input.accountId;
    text = input.text;
    parentId = input.parentId;
    image = input.image;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!accountId) return NextResponse.json({ error: "Choose a prop account to post as" }, { status: 400 });
  if (!text && !image) {
    return NextResponse.json({ error: "Write a post or attach a photo." }, { status: 400 });
  }

  try {
    const item = await publishGroupContent({ groupId: id, accountId, body: text, parentId, image });
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
