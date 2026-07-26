import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id } = await params;
  let communityId: string | undefined;
  try {
    const body = await req.json();
    communityId = body?.community_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!communityId) {
    return NextResponse.json({ error: "community_id is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_set_area_discussion_community", {
      p_discussion_id: id,
      p_community_id: communityId,
    });
    if (error) throw new Error(error.message);
    await logAdminAction({
      category: "moderation",
      action: "set_discussion_community",
      detail: `Linked hub ${id} to community ${communityId}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ discussion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update community";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
