import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import type { LeadStatus } from "@/lib/commercial/types";

const LEAD_STATUSES = new Set<LeadStatus>(["new", "contacted", "closed"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.status !== "string" || !LEAD_STATUSES.has(body.status as LeadStatus)) {
    return NextResponse.json({ error: "A valid status is required" }, { status: 400 });
  }

  try {
    const { data: before, error: fetchError } = await supabaseAdmin
      .from("community_leads")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!before) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("community_leads")
      .update({ status: body.status })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);

    await logAdminAction({
      category: "moderation",
      action: "update_lead_status",
      detail: `Changed lead (${id}) status: ${before.status} → ${body.status}`,
      targetType: "community_lead",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ lead: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
