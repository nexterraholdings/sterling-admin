type MembershipPlanId = "sterling_plus" | "sterling_premium";
type MembershipPeriodId = "1_week" | "1_month" | "3_months" | "lifetime";

/**
 * Canonical USD list prices for Sterling memberships.
 * Keep in sync with Sterling/src/lib/business/sterlingMembershipPricing.ts
 * (admin deploys from this repo only — no monorepo import at build time).
 */
export const STERLING_MEMBERSHIP_USD = {
  plus: {
    week: 2.99,
    month: 7.99,
    months3: 19.99,
  },
  premium: {
    week: 12.99,
    month: 49.99,
    months3: 109,
    lifetime: 499,
  },
} as const;

/** App Store product IDs (auto-renewable + lifetime SKU). */
export const STERLING_MEMBERSHIP_STORE_PRODUCT_IDS = {
  plus: {
    "1_week": "sterling_plus_1w",
    "1_month": "sterling_plus_1mo",
    "3_months": "sterling_plus_3mo",
  },
  premium: {
    "1_week": "sterling_premium_1w",
    "1_month": "sterling_premium_1mo",
    "3_months": "sterling_premium_3mo",
    lifetime: "sterling_premium_lifetime",
  },
} as const;

export function formatMembershipUsd(amount: number, options?: { trimCents?: boolean }): string {
  const trim = options?.trimCents ?? false;
  if (trim && Number.isInteger(amount)) {
    return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function savePercentVsMonthly(monthly: number, bundleTotal: number, months: number): number | null {
  if (monthly <= 0 || months <= 1) return null;
  const fullPrice = monthly * months;
  if (bundleTotal >= fullPrice) return null;
  return Math.round(((fullPrice - bundleTotal) / fullPrice) * 100);
}

function threeMonthSaveHint(monthly: number, bundleTotal: number): string | undefined {
  const pct = savePercentVsMonthly(monthly, bundleTotal, 3);
  return pct != null && pct > 0 ? `Save ${pct}%` : undefined;
}

export type MembershipPeriodPriceDef = {
  id: MembershipPeriodId;
  label: string;
  priceUsd: number;
  hint?: string;
};

const STERLING_PREMIUM_LIFETIME_OFFER_ENABLED = false;

export function sterlingMembershipPeriodPrices(planId: MembershipPlanId): MembershipPeriodPriceDef[] {
  if (planId === "sterling_premium") {
    const p = STERLING_MEMBERSHIP_USD.premium;
    const periods: MembershipPeriodPriceDef[] = [
      { id: "1_week", label: "1 week", priceUsd: p.week, hint: "Trial run" },
      { id: "1_month", label: "1 month", priceUsd: p.month, hint: "Most popular" },
      {
        id: "3_months",
        label: "3 months",
        priceUsd: p.months3,
        hint: threeMonthSaveHint(p.month, p.months3),
      },
    ];
    if (STERLING_PREMIUM_LIFETIME_OFFER_ENABLED) {
      periods.push({ id: "lifetime", label: "Lifetime", priceUsd: p.lifetime, hint: "Pay once" });
    }
    return periods;
  }

  const p = STERLING_MEMBERSHIP_USD.plus;
  return [
    { id: "1_week", label: "1 week", priceUsd: p.week, hint: "Try Plus" },
    { id: "1_month", label: "1 month", priceUsd: p.month },
    {
      id: "3_months",
      label: "3 months",
      priceUsd: p.months3,
      hint: "Most popular",
    },
  ];
}

export function sterlingMembershipMonthlyPriceUsd(planId: MembershipPlanId): number {
  return planId === "sterling_premium"
    ? STERLING_MEMBERSHIP_USD.premium.month
    : STERLING_MEMBERSHIP_USD.plus.month;
}

/** Rough normalized monthly revenue for admin MRR (matches SQL helper). */
export function sterlingMembershipMrrMonthlyUsd(productId: string | null | undefined): number {
  const id = (productId ?? "").trim().toLowerCase();
  if (!id) return 0;

  const plus = STERLING_MEMBERSHIP_USD.plus;
  const premium = STERLING_MEMBERSHIP_USD.premium;

  switch (id) {
    case "sterling_plus_1w":
      return (plus.week * 52) / 12;
    case "sterling_plus_1mo":
    case "monthly":
    case "1_month":
      return plus.month;
    case "sterling_plus_3mo":
    case "yearly":
    case "3_months":
      return plus.months3 / 3;
    case "sterling_premium_1w":
      return (premium.week * 52) / 12;
    case "sterling_premium_1mo":
      return premium.month;
    case "sterling_premium_3mo":
      return premium.months3 / 3;
    case "sterling_premium_lifetime":
    case "lifetime":
      return 0;
    default:
      if (id.includes("premium")) return premium.month;
      if (id.includes("plus")) return plus.month;
      return 0;
  }
}
