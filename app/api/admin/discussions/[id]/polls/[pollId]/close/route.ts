import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

type Ctx = { params: Promise<{ id: string; pollId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id, pollId } = await params;

  try {
    const { error } = await supabaseAdmin.rpc("close_discussion_poll", { p_poll_id: pollId });
    if (error) throw new Error(error.message);
    await logAdminAction({
      category: "moderation",
      action: "close_discussion_poll",
      detail: `Closed poll ${pollId} on hub ${id}`,
      targetType: "discussion_poll",
      targetId: pollId,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to close poll";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
