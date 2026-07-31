import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type {
  BillingEventsResponse,
  BillingListResponse,
  BillingMetrics,
  BillingPlanId,
  BillingStatus,
} from "@/lib/billing/types";

const PLANS = new Set<BillingPlanId>(["free", "sterling_plus", "sterling_premium"]);
const STATUSES = new Set<BillingStatus>(["active", "grace_period", "cancelled", "expired", "inactive"]);

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — billing admin requires service-role access."
    );
  }
}

export async function GET(req: NextRequest) {
  await getCurrentAdmin();
  requireServiceRole();

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "list";

  if (mode === "metrics") {
    try {
      const { data, error } = await supabaseAdmin.rpc("admin_billing_metrics");
      if (error) throw new Error(error.message);
      return NextResponse.json((data ?? {}) as BillingMetrics);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load billing metrics";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "events") {
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
    const offset = (page - 1) * pageSize;

    try {
      const { count, error: countError } = await supabaseAdmin
        .from("billing_revenuecat_events")
        .select("*", { count: "exact", head: true });
      if (countError) throw new Error(countError.message);

      const { data, error } = await supabaseAdmin
        .from("billing_revenuecat_events")
        .select(
          "id,rc_event_id,event_type,app_user_id,product_id,store,environment,received_at,apply_error",
        )
        .order("received_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);

      return NextResponse.json({
        events: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
      } satisfies BillingEventsResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load webhook events";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const search = searchParams.get("search")?.trim() || null;
  const plan = searchParams.get("plan")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));

  if (plan && !PLANS.has(plan as BillingPlanId)) {
    return NextResponse.json({ error: `Invalid plan: ${plan}` }, { status: 400 });
  }
  if (status && !STATUSES.has(status as BillingStatus)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("admin_list_billing_subscribers", {
      p_search: search,
      p_plan: plan,
      p_status: status,
      p_page: page,
      p_page_size: pageSize,
    });

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as {
      total?: number;
      page?: number;
      page_size?: number;
      subscribers?: BillingListResponse["subscribers"];
    };

    return NextResponse.json({
      subscribers: payload.subscribers ?? [],
      total: Number(payload.total ?? 0),
      page: Number(payload.page ?? page),
      pageSize: Number(payload.page_size ?? pageSize),
    } satisfies BillingListResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch billing subscribers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
