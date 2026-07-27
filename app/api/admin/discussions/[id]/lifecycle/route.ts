import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { isAdminDiscussionLifecycleStatus } from "@/lib/discussions/lifecycle";

type Ctx = { params: Promise<{ id: string }> };

async function logMutation(
  admin: Awaited<ReturnType<typeof getCurrentAdmin>>,
  id: string,
  action: string,
  detail: string
) {
  await logAdminAction({
    category: "moderation",
    action,
    detail,
    targetType: "area_discussion",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id } = await params;
  let body: { status?: string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }
  if (!isAdminDiscussionLifecycleStatus(body.status)) {
    return NextResponse.json(
      { error: "Invalid lifecycle status. Use bootstrap, active, grace, claimable, or expired." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_set_area_discussion_lifecycle", {
      p_discussion_id: id,
      p_status: body.status,
      p_reason: body.reason ?? null,
    });
    if (error) throw new Error(error.message);
    await logMutation(admin, id, "set_discussion_lifecycle", `Lifecycle → ${body.status}${body.reason ? `: ${body.reason}` : ""}`);
    return NextResponse.json({ discussion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update lifecycle";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
