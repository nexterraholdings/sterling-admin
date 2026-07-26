import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

const ACTIONS = new Set(["hide", "unhide", "pin", "unpin", "delete"]);

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id, commentId } = await params;
  let action = "";
  try {
    const body = await req.json();
    action = String(body?.action ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_moderate_discussion_comment", {
      p_comment_id: commentId,
      p_action: action,
    });
    if (error) throw new Error(error.message);

    await logAdminAction({
      category: "moderation",
      action: `moderate_discussion_comment_${action}`,
      detail: `${action} comment ${commentId} on hub ${id}`,
      targetType: "area_discussion_comment",
      targetId: commentId,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to moderate comment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id, commentId } = await params;

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_moderate_discussion_comment", {
      p_comment_id: commentId,
      p_action: "delete",
    });
    if (error) throw new Error(error.message);

    await logAdminAction({
      category: "moderation",
      action: "delete_discussion_comment",
      detail: `Deleted comment ${commentId} on hub ${id}`,
      targetType: "area_discussion_comment",
      targetId: commentId,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete comment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
