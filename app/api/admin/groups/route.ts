import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { createSystemGroup, listAdminGroups } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

async function readAvatarField(formData: FormData): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  const entry = formData.get("avatar");
  if (!(entry instanceof File) || entry.size === 0) return null;
  return { buffer: Buffer.from(await entry.arrayBuffer()), contentType: entry.type || null };
}

export async function GET(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const hubId = searchParams.get("hubId")?.trim() || null;
  const includeArchived = searchParams.get("includeArchived") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "-created_at";

  try {
    const payload = await listAdminGroups({
      search,
      hubId,
      includeArchived,
      sort,
      page,
      pageSize,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch groups";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const hubId = String(formData.get("hubId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!hubId) return NextResponse.json({ error: "Pick a hub for this group." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const description = String(formData.get("description") ?? "").trim() || null;
  const visibility = String(formData.get("visibility") ?? "public");
  const categories = formData
    .getAll("categories")
    .map((v) => String(v))
    .filter(Boolean);

  try {
    const avatar = await readAvatarField(formData);
    const group = await createSystemGroup({
      hubId,
      title,
      description,
      categories,
      visibility,
      avatar,
    });
    await logAdminAction({
      category: "admin",
      action: "create_system_group",
      detail: `Created Sterling-owned group "${group.title}" in ${group.hub?.title ?? hubId}`,
      targetType: "discussion_group",
      targetId: group.id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ group });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create group";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped === "Hub not found." || mapped === "Pick a seeded city hub as the destination." ? 404 : 400;
    return NextResponse.json({ error: mapped }, { status });
  }
}
