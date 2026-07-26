import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

const TABLE_BY_KIND: Record<string, string> = {
  update: "discussion_updates",
  media: "discussion_media",
  resource: "discussion_resources",
  wiki: "discussion_wiki_sections",
  event: "events",
  live_chat: "discussion_live_chat_messages",
};

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id, itemId } = await params;
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const table = TABLE_BY_KIND[kind];
  if (!table) {
    return NextResponse.json({ error: "Invalid kind query param" }, { status: 400 });
  }

  try {
    let query = supabaseAdmin.from(table).delete().eq("id", itemId);
    if (table !== "events") {
      query = query.eq("discussion_id", id);
    }
    const { error } = await query;
    if (error) throw new Error(error.message);

    await logAdminAction({
      category: "moderation",
      action: `delete_discussion_${kind}`,
      detail: `Deleted ${kind} ${itemId} from hub ${id}`,
      targetType: `discussion_${kind}`,
      targetId: itemId,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id, itemId } = await params;
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  if (kind !== "live_chat") {
    return NextResponse.json({ error: "PATCH only supported for live_chat" }, { status: 400 });
  }
  let hidden = true;
  try {
    const body = await req.json();
    hidden = body?.hidden !== false;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin
      .from("discussion_live_chat_messages")
      .update({ is_hidden: hidden })
      .eq("id", itemId)
      .eq("discussion_id", id);
    if (error) throw new Error(error.message);

    await logAdminAction({
      category: "moderation",
      action: hidden ? "hide_live_chat_message" : "unhide_live_chat_message",
      detail: `${hidden ? "Hid" : "Unhid"} live chat message ${itemId} on ${id}`,
      targetType: "discussion_live_chat_message",
      targetId: itemId,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
