import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import {
  mapDiscussionAnalyticsRow,
  mapDiscussionTrendRows,
} from "@/lib/discussions/mapDiscussionAnalytics";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await getCurrentAdmin();
  const { id } = await params;

  try {
    const [analyticsRes, trendRes] = await Promise.all([
      supabaseAdmin.rpc("get_discussion_analytics", { p_discussion_id: id }).maybeSingle(),
      supabaseAdmin.rpc("get_discussion_activity_trend", { p_discussion_id: id }),
    ]);

    if (analyticsRes.error) throw new Error(analyticsRes.error.message);
    if (trendRes.error) throw new Error(trendRes.error.message);

    const analytics = analyticsRes.data
      ? mapDiscussionAnalyticsRow(analyticsRes.data as Record<string, unknown>)
      : null;

    const trend = mapDiscussionTrendRows((trendRes.data ?? []) as Record<string, unknown>[]);

    return NextResponse.json({ analytics, trend });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
