import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id } = await params;
  let body: { auto_share_updates?: boolean; auto_share_feed?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_set_discussion_auto_share", {
      p_discussion_id: id,
      p_auto_share_updates: body.auto_share_updates ?? null,
      p_auto_share_feed: body.auto_share_feed ?? null,
    });
    if (error) throw new Error(error.message);
    await logAdminAction({
      category: "moderation",
      action: "set_discussion_auto_share",
      detail: `Auto-share for ${id}: ${JSON.stringify(body)}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ discussion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update auto-share";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
