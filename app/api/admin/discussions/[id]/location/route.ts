import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  const { id } = await params;
  let body: { center_lat?: number; center_lng?: number; location_hint?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.center_lat !== "number" || typeof body.center_lng !== "number") {
    return NextResponse.json({ error: "center_lat and center_lng are required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_update_area_discussion_location", {
      p_discussion_id: id,
      p_center_lat: body.center_lat,
      p_center_lng: body.center_lng,
      p_location_hint: body.location_hint ?? null,
    });
    if (error) throw new Error(error.message);
    await logAdminAction({
      category: "moderation",
      action: "update_discussion_location",
      detail: `Updated location for ${id} → ${body.center_lat}, ${body.center_lng}`,
      targetType: "area_discussion",
      targetId: id,
      actorId: admin.id,
      actorLabel: admin.email,
    });
    return NextResponse.json({ discussion: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update location";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
