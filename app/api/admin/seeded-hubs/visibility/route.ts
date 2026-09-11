import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { setSeededHubsVisibility } from "@/lib/seeded-hubs/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  let body: { ids?: unknown; seeded_visible?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.seeded_visible !== "boolean") {
    return NextResponse.json({ error: "seeded_visible must be true or false." }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [];

  try {
    const { hubs, launch } = await setSeededHubsVisibility(ids, body.seeded_visible);
    const titles = hubs
      .filter((hub) => ids.includes(hub.id))
      .map((hub) => hub.title)
      .slice(0, 8);
    const named = titles.join(", ");
    const extra = ids.length > titles.length ? ` +${ids.length - titles.length} more` : "";
    await logAdminAction({
      category: "admin",
      action: body.seeded_visible ? "show_seeded_hubs_on_store" : "hide_seeded_hubs_from_store",
      detail: body.seeded_visible
        ? `Showed ${ids.length} seeded hub(s) on store apps${named ? `: ${named}${extra}` : ""}`
        : `Hid ${ids.length} seeded hub(s) from store apps${named ? `: ${named}${extra}` : ""}`,
      targetType: "area_discussion",
      targetId: ids[0],
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ hubs, launch });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update store visibility";
    const mapped = mapSeededHubRpcError(message);
    const status =
      mapped.toLowerCase().includes("select at least") || mapped.toLowerCase().includes("plant at least")
        ? 400
        : 500;
    return NextResponse.json({ error: mapped }, { status });
  }
}
