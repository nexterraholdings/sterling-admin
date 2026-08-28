import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

const VALID_STATUSES = new Set(["pending", "reviewed", "resolved", "dismissed"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("reports")
      .update({ status })
      .eq("id", id)
      .select("id,report_type,status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    await logAdminAction({
      category: "moderation",
      action: "update_report_status",
      detail: `Report ${id} (${data.report_type}) → ${status}`,
      targetType: "report",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });

    return NextResponse.json({ report: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update report" }, { status: 500 });
  }
}
