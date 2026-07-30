import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingPlanId, BillingStatus } from "@/lib/billing/types";

export type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null;
        product_identifier?: string;
        purchase_date?: string;
      }
    >;
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null;
        store?: string;
        period_type?: string;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
      }
    >;
  };
};

function planFromEntitlementIds(entitlementIds: string[] | null | undefined): BillingPlanId {
  const ids = entitlementIds ?? [];
  for (const id of ids) {
    const lower = id.toLowerCase();
    if (id === "sterling_premium" || lower.includes("premium")) return "sterling_premium";
  }
  for (const id of ids) {
    const lower = id.toLowerCase();
    if (id === "sterling_plus" || lower.includes("plus")) return "sterling_plus";
  }
  return "free";
}

function isSandboxEnvironment(environment: string | null | undefined): boolean {
  return (environment ?? "").toUpperCase() === "SANDBOX";
}

export function planFromSubscriberPayload(payload: RevenueCatSubscriberResponse): {
  plan: BillingPlanId;
  status: BillingStatus;
  entitlementIds: string[];
  productId: string | null;
  expiresAt: string | null;
  store: string | null;
  willRenew: boolean;
} {
  const entitlements = payload.subscriber?.entitlements ?? {};
  const activeIds: string[] = [];
  let latestExpiry: string | null = null;
  let productId: string | null = null;
  const now = Date.now();

  for (const [id, info] of Object.entries(entitlements)) {
    const exp = info.expires_date ?? null;
    const expMs = exp ? Date.parse(exp) : null;
    if (expMs != null && !Number.isNaN(expMs) && expMs <= now) continue;
    activeIds.push(id);
    if (exp && (!latestExpiry || Date.parse(exp) > Date.parse(latestExpiry))) {
      latestExpiry = exp;
    }
    if (!productId && info.product_identifier) productId = info.product_identifier;
  }

  const plan = planFromEntitlementIds(activeIds);
  const subscriptions = payload.subscriber?.subscriptions ?? {};
  let store: string | null = null;
  let willRenew = plan !== "free";

  for (const sub of Object.values(subscriptions)) {
    if (sub.store) store = sub.store;
    if (sub.unsubscribe_detected_at) willRenew = false;
    if (sub.billing_issues_detected_at && plan !== "free") {
      return {
        plan,
        status: "grace_period",
        entitlementIds: activeIds,
        productId,
        expiresAt: latestExpiry,
        store,
        willRenew: false,
      };
    }
  }

  const status: BillingStatus = plan === "free" ? "inactive" : willRenew ? "active" : "cancelled";

  return {
    plan,
    status,
    entitlementIds: activeIds,
    productId,
    expiresAt: latestExpiry,
    store,
    willRenew,
  };
}

export async function applySubscriptionFromSubscriber(
  supabase: SupabaseClient,
  userId: string,
  payload: RevenueCatSubscriberResponse,
  environment: string | null,
): Promise<void> {
  const parsed = planFromSubscriberPayload(payload);
  const plan = parsed.status === "expired" ? "free" : parsed.plan;
  const { error } = await supabase.rpc("apply_user_sterling_billing", {
    p_user_id: userId,
    p_plan: plan,
    p_status: parsed.status,
    p_store: parsed.store,
    p_environment: environment,
    p_product_id: parsed.productId,
    p_entitlement_ids: parsed.entitlementIds,
    p_expires_at: parsed.expiresAt,
    p_will_renew: parsed.willRenew,
    p_is_sandbox: isSandboxEnvironment(environment),
    p_rc_customer_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchRevenueCatSubscriber(
  appUserId: string,
  secretKey: string,
): Promise<RevenueCatSubscriberResponse> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RevenueCat API ${res.status}: ${text.slice(0, 240)}`);
  }
  return (await res.json()) as RevenueCatSubscriberResponse;
}

export async function applyManualUserBilling(
  supabase: SupabaseClient,
  userId: string,
  plan: BillingPlanId,
  options: { expiresAt?: string | null; status?: BillingStatus } = {},
): Promise<void> {
  const entitlementIds =
    plan === "sterling_premium"
      ? ["sterling_premium"]
      : plan === "sterling_plus"
        ? ["sterling_plus"]
        : [];

  const status: BillingStatus =
    options.status ?? (plan === "free" ? "inactive" : "active");

  const { error } = await supabase.rpc("apply_user_sterling_billing", {
    p_user_id: userId,
    p_plan: plan,
    p_status: status,
    p_store: "admin",
    p_environment: "ADMIN",
    p_product_id: null,
    p_entitlement_ids: entitlementIds,
    p_expires_at: options.expiresAt ?? null,
    p_will_renew: false,
    p_is_sandbox: false,
    p_rc_customer_id: userId,
  });
  if (error) throw new Error(error.message);
}
