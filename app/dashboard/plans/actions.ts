"use server";

import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { logAdminAction, describeUser } from "@/app/dashboard/lib/audit-log";
import {
  applyManualUserBilling,
  applySubscriptionFromSubscriber,
  fetchRevenueCatSubscriber,
} from "@/lib/billing/revenueCatServer";
import type { BillingPlanId, BillingSubscriberRow } from "@/lib/billing/types";

function requireServiceRole(): void {
  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — billing admin requires service-role access."
    );
  }
}

export async function syncUserBillingFromRevenueCat(userId: string): Promise<BillingSubscriberRow> {
  const admin = await getCurrentAdmin();
  requireServiceRole();
  const secret = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (!secret || !projectId) {
    throw new Error(
      "Set REVENUECAT_SECRET_API_KEY and REVENUECAT_PROJECT_ID in adminsterling (.env.local / Vercel) to pull subscriber state from RevenueCat.",
    );
  }

  const subscriber = await fetchRevenueCatSubscriber(userId, secret, projectId);
  await applySubscriptionFromSubscriber(supabaseAdmin, userId, subscriber, null);

  const row = await fetchBillingRowForUser(userId);

  await logAdminAction({
    category: "admin",
    action: "sync_user_billing_revenuecat",
    detail: `Synced billing from RevenueCat for ${await describeUser(userId)} → ${row.plan} (${row.status})`,
    targetType: "user",
    targetId: userId,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return row;
}

export async function setManualUserBilling(params: {
  userId: string;
  plan: BillingPlanId;
  reason: string;
  expiresAt?: string | null;
}): Promise<BillingSubscriberRow> {
  const admin = await getCurrentAdmin();
  requireServiceRole();
  const reason = params.reason.trim();
  if (!reason) throw new Error("Reason is required");

  if (!["free", "sterling_plus", "sterling_premium"].includes(params.plan)) {
    throw new Error("Invalid plan");
  }

  await applyManualUserBilling(supabaseAdmin, params.userId, params.plan, {
    expiresAt: params.expiresAt ?? null,
  });

  const row = await fetchBillingRowForUser(params.userId);

  await logAdminAction({
    category: "admin",
    action: params.plan === "free" ? "revoke_user_billing_manual" : "grant_user_billing_manual",
    detail: `Manual billing ${params.plan} for ${await describeUser(params.userId)} — ${reason}`,
    targetType: "user",
    targetId: params.userId,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return row;
}

async function fetchBillingRowForUser(userId: string): Promise<BillingSubscriberRow> {
  requireServiceRole();

  const { data, error } = await supabaseAdmin.rpc("admin_list_billing_subscribers", {
    p_search: userId,
    p_plan: null,
    p_status: null,
    p_page: 1,
    p_page_size: 1,
  });
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as { subscribers?: BillingSubscriberRow[] };
  const row = payload.subscribers?.[0];
  if (!row) {
    throw new Error("Billing row not found after update");
  }
  return row;
}
