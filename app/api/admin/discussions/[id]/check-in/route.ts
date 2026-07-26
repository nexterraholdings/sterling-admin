import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_force_area_discussion_check_in", {
      p_discussion_id: id,
    });
    if (error) throw new Error(error.message);
    await logAdminAction({
      category: "moderation",
      action: "force_discussion_check_in",
      detail: `Forced steward check-in for hub ${id}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ discussion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check in";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
