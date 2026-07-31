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

const REVENUECAT_V2_BASE = "https://api.revenuecat.com";

type RevenueCatNonSubscriptionPurchase = {
  id?: string;
  store_transaction_id?: string;
  purchase_date?: string;
  is_sandbox?: boolean;
};

type RevenueCatV2List<T> = {
  items?: T[];
  next_page?: string | null;
};

type RevenueCatV2Entitlement = {
  lookup_key?: string;
  products?: { items?: Array<{ store_identifier?: string }> };
};

type RevenueCatV2Subscription = {
  gives_access?: boolean;
  current_period_ends_at?: number | null;
  current_period_starts_at?: number | null;
  store?: string | null;
  environment?: string | null;
  auto_renewal_status?: string | null;
  status?: string | null;
  pending_payment?: boolean | null;
  entitlements?: { items?: RevenueCatV2Entitlement[] };
};

type RevenueCatV2Purchase = {
  id?: string;
  purchased_at?: number | null;
  environment?: string | null;
  store_purchase_identifier?: string | number | null;
  status?: string | null;
  entitlements?: { items?: RevenueCatV2Entitlement[] };
};

function msToIso(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function firstStoreIdentifierFromEntitlements(
  entitlements: RevenueCatV2Entitlement[] | undefined,
): string | null {
  for (const ent of entitlements ?? []) {
    for (const prod of ent.products?.items ?? []) {
      if (prod.store_identifier) return prod.store_identifier;
    }
  }
  return null;
}

function subscriptionHasBillingIssue(subscription: RevenueCatV2Subscription): boolean {
  return (
    subscription.pending_payment === true ||
    subscription.status === "in_grace_period" ||
    subscription.status === "in_billing_retry"
  );
}

function normalizeRevenueCatV2Customer(
  subscriptions: RevenueCatV2Subscription[],
  purchases: RevenueCatV2Purchase[],
): RevenueCatSubscriberResponse {
  const entitlements: NonNullable<RevenueCatSubscriberResponse["subscriber"]>["entitlements"] = {};
  const subs: NonNullable<RevenueCatSubscriberResponse["subscriber"]>["subscriptions"] = {};
  const nonSubscriptions: Record<string, RevenueCatNonSubscriptionPurchase[]> = {};

  for (const subscription of subscriptions) {
    const entitlementItems = subscription.entitlements?.items ?? [];
    const storeIdentifier = firstStoreIdentifierFromEntitlements(entitlementItems);
    const subKey = storeIdentifier ?? `subscription_${Object.keys(subs).length}`;
    const expiresDate = msToIso(subscription.current_period_ends_at);
    const willNotRenew = subscription.auto_renewal_status === "will_not_renew";
    const billingIssue = subscriptionHasBillingIssue(subscription);

    subs[subKey] = {
      expires_date: expiresDate,
      store: subscription.store ?? null,
      unsubscribe_detected_at: willNotRenew ? expiresDate ?? new Date().toISOString() : null,
      billing_issues_detected_at: billingIssue ? new Date().toISOString() : null,
    };

    if (!subscription.gives_access) continue;

    for (const ent of entitlementItems) {
      const lookupKey = ent.lookup_key;
      if (!lookupKey) continue;
      entitlements[lookupKey] = {
        expires_date: expiresDate,
        product_identifier: storeIdentifier ?? undefined,
        purchase_date: msToIso(subscription.current_period_starts_at) ?? undefined,
      };
    }
  }

  for (const purchase of purchases) {
    if (purchase.status && purchase.status !== "owned") continue;
    const storeIdentifier = firstStoreIdentifierFromEntitlements(purchase.entitlements?.items);
    if (!storeIdentifier) continue;

    const entry: RevenueCatNonSubscriptionPurchase = {
      id: purchase.id,
      store_transaction_id:
        purchase.store_purchase_identifier != null
          ? String(purchase.store_purchase_identifier)
          : undefined,
      purchase_date: msToIso(purchase.purchased_at) ?? undefined,
      is_sandbox: (purchase.environment ?? "").toLowerCase() === "sandbox",
    };

    if (!nonSubscriptions[storeIdentifier]) {
      nonSubscriptions[storeIdentifier] = [];
    }
    nonSubscriptions[storeIdentifier].push(entry);
  }

  return {
    subscriber: {
      entitlements,
      subscriptions: subs,
      non_subscriptions: nonSubscriptions,
    },
  };
}

async function revenueCatV2Get<T>(path: string, secretKey: string): Promise<T> {
  const res = await fetch(`${REVENUECAT_V2_BASE}${path}`, {
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
  return (await res.json()) as T;
}

async function fetchRevenueCatV2AllItems<T>(initialPath: string, secretKey: string): Promise<T[]> {
  const items: T[] = [];
  let nextPath: string | null = initialPath;

  while (nextPath) {
    const page = await revenueCatV2Get<RevenueCatV2List<T>>(nextPath, secretKey);
    items.push(...(page.items ?? []));
    nextPath = page.next_page ?? null;
  }

  return items;
}

export async function fetchRevenueCatSubscriber(
  appUserId: string,
  secretKey: string,
  projectId: string,
): Promise<RevenueCatSubscriberResponse> {
  const customerPath =
    `/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(appUserId)}`;

  try {
    await revenueCatV2Get<{ id?: string }>(customerPath, secretKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("404")) {
      return { subscriber: { entitlements: {}, subscriptions: {}, non_subscriptions: {} } };
    }
    throw err;
  }

  const [subscriptions, purchases] = await Promise.all([
    fetchRevenueCatV2AllItems<RevenueCatV2Subscription>(
      `${customerPath}/subscriptions?limit=100`,
      secretKey,
    ),
    fetchRevenueCatV2AllItems<RevenueCatV2Purchase>(
      `${customerPath}/purchases?limit=100`,
      secretKey,
    ),
  ]);

  return normalizeRevenueCatV2Customer(subscriptions, purchases);
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
