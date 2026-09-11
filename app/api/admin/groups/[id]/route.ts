import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { updateSystemGroup } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const hasTitle = formData.has("title");
  const hasDescription = formData.has("description");
  const hasCategories = formData.has("categories");
  const hasVisibility = formData.has("visibility");
  const hubId = String(formData.get("hubId") ?? "").trim() || undefined;
  const clearAvatar = String(formData.get("clearAvatar") ?? "") === "1";

  const avatarEntry = formData.get("avatar");
  const avatar =
    avatarEntry instanceof File && avatarEntry.size > 0
      ? { buffer: Buffer.from(await avatarEntry.arrayBuffer()), contentType: avatarEntry.type || null }
      : null;

  try {
    const group = await updateSystemGroup(id, {
      hubId,
      title: hasTitle ? String(formData.get("title") ?? "") : undefined,
      description: hasDescription ? String(formData.get("description") ?? "") : undefined,
      categories: hasCategories
        ? formData.getAll("categories").map((v) => String(v)).filter(Boolean)
        : undefined,
      visibility: hasVisibility ? String(formData.get("visibility") ?? "") : undefined,
      avatar,
      clearAvatar,
    });
    await logAdminAction({
      category: "admin",
      action: "update_system_group",
      detail: `Updated Sterling-owned group "${group.title}"`,
      targetType: "discussion_group",
      targetId: group.id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ group });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update group";
    const mapped = mapSeededHubRpcError(message);
    const status = mapped === "Group not found." ? 404 : 400;
    return NextResponse.json({ error: mapped }, { status });
  }
}
