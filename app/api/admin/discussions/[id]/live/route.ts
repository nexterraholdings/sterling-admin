import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id } = await params;
  let enabled = false;
  try {
    const body = await req.json();
    enabled = Boolean(body?.enabled);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_set_area_discussion_live_mode", {
      p_discussion_id: id,
      p_enabled: enabled,
    });
    if (error) throw new Error(error.message);
    await logAdminAction({
      category: "moderation",
      action: enabled ? "start_discussion_live" : "end_discussion_live",
      detail: `${enabled ? "Started" : "Ended"} live for hub ${id}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ discussion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update live mode";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
