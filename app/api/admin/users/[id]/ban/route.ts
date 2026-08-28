import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";

// Thin wrapper around the same admin_ban_user RPC app/dashboard/moderation/actions.ts
// uses, exposed as a REST route for callers (like the discussions detail page) that
// need to ban a user without pulling in the moderation server actions module.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const reason = (body?.reason as string | undefined)?.trim() || "Violation of platform rules";

  try {
    const { error } = await supabaseAdmin.rpc("admin_ban_user", {
      p_user_id: id,
      p_reason: reason,
      p_also_ban_devices: true,
    });
    if (error) throw new Error(error.message);

    await logAdminAction({
      category: "moderation",
      action: "ban_user",
      detail: `Banned ${await describeUser(id)}: ${reason} — devices also banned`,
      targetType: "user",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to ban user" }, { status: 500 });
  }
}
