"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  fetchPlusCommunities,
  fetchCommunities,
  setCommunityIsPlus,
} from "@/app/dashboard/communities/actions";
import type { Community } from "@/lib/communities/types";
import type { BillingListResponse, BillingMetrics, BillingSubscriberRow } from "@/lib/billing/types";
import { EmptyState, SectionCard } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  formatMembershipUsd,
  sterlingMembershipMonthlyPriceUsd,
} from '@/lib/billing/sterlingMembershipPricing';

// Mirrors Sterling/src/lib/business/sterlingMembershipPricing.ts (STERLING_MEMBERSHIP_USD).
const REFERENCE_PLANS = [
  {
    id: 'sterling_plus',
    name: 'Sterling Plus',
    tagline: 'More room on the map for everyday members',
    priceLabel: formatMembershipUsd(sterlingMembershipMonthlyPriceUsd('sterling_plus')),
    priceHint: 'per month',
    features: [
      'Free mobile icons',
      'Recover streaks free, 2× per week',
      'Up to 4 map hubs per month',
      'Up to 6 map events per month',
    ],
  },
  {
    id: 'sterling_premium',
    name: 'Sterling Premium',
    tagline: 'For brokerages, teams, and local businesses',
    priceLabel: formatMembershipUsd(sterlingMembershipMonthlyPriceUsd('sterling_premium')),
    priceHint: 'per month',
    features: [
      'Unlimited map hubs & events',
      'Unlimited business communities (brokerage)',
      'Deals & property listings',
      'Buyer leads & advanced listing analytics',
    ],
  },
];

function formatPlanLabel(plan: string): string {
  if (plan === "sterling_plus") return "Sterling Plus";
  if (plan === "sterling_premium") return "Sterling Premium";
  return "Free";
}

function BillingMetricsPanel({ metrics }: { metrics: BillingMetrics | null }) {
  if (!metrics) return null;
  const cards = [
    { label: "Active Plus", value: metrics.active_plus },
    { label: "Active Premium", value: metrics.active_premium },
    { label: "Active total", value: metrics.active_total },
    { label: "Sandbox active", value: metrics.sandbox_active },
    { label: "Purchases (30d)", value: metrics.purchase_events_last_30_days },
    { label: "Webhooks (30d)", value: metrics.webhook_events_last_30_days },
    {
      label: "Est. MRR",
      value: `$${metrics.estimated_mrr_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{c.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function BillingSubscribersPanel() {
  const [rows, setRows] = useState<BillingSubscriberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode: "list", pageSize: "25" });
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/admin/billing?${params.toString()}`);
      const body = (await res.json()) as BillingListResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load subscribers");
      setRows(body.subscribers ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <SectionCard
      title="Billing subscribers"
      description="Synced from RevenueCat webhooks and post-purchase sync. Quotas and streak perks use this data."
    >
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search username, email, or user id…"
        autoComplete="off"
      />
      {error ? (
        <div className="mt-3 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : loading ? (
        <p className="mt-3 text-xs text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No billing rows yet"
          hint="Run a sandbox purchase or configure the RevenueCat webhook to populate user_sterling_billing."
        />
      ) : (
        <>
          <p className="mt-3 text-xs text-zinc-500">{total} subscriber record{total === 1 ? "" : "s"}</p>
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <div
                key={row.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100">
                    {row.full_name ?? row.username ?? row.email ?? row.user_id}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatPlanLabel(row.plan)} · {row.status}
                    {row.is_sandbox ? " · sandbox" : ""}
                    {row.store ? ` · ${row.store}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  {row.expires_at ? `Expires ${new Date(row.expires_at).toLocaleDateString()}` : "No expiry"}
                  <br />
                  Updated {new Date(row.updated_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function PlanReferenceCard({ plan }: { plan: (typeof REFERENCE_PLANS)[number] }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
      <div className="flex items-baseline justify-between">
        <h4 className="text-base font-semibold text-zinc-50">{plan.name}</h4>
        <p className="text-sm font-semibold text-emerald-300">
          {plan.priceLabel} <span className="text-xs font-normal text-zinc-500">{plan.priceHint}</span>
        </p>
      </div>
      <p className="mt-1 text-sm text-zinc-500">{plan.tagline}</p>
      <ul className="mt-3 space-y-1.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GrantPlusPanel({ onGranted }: { onGranted: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { communities } = await fetchCommunities(1, search.trim());
        setResults(communities.filter((c) => !c.is_plus));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function grant(community: Community) {
    const reason = window.prompt(`Reason for granting Plus to "${community.name}"?`) ?? undefined;
    setBusyId(community.id);
    try {
      await setCommunityIsPlus(community.id, true, reason);
      toast.success(`Granted Plus to ${community.name}`);
      setResults((prev) => prev.filter((c) => c.id !== community.id));
      onGranted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant Plus");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SectionCard title="Grant Plus" description="Search for a community to manually grant Plus/Premium status.">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search communities by name…"
        autoComplete="off"
      />
      {loading && <p className="mt-3 text-xs text-zinc-500">Searching…</p>}
      {!loading && results.length > 0 && (
        <div className="mt-3 space-y-2">
          {results.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{c.name ?? "Untitled"}</p>
                <p className="text-xs text-zinc-500">{c.community_type === "brokerage" ? "Brokerage" : "Standard"}</p>
              </div>
              <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => grant(c)}>
                {busyId === c.id ? "Granting…" : "Grant Plus"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {!loading && search.trim() && results.length === 0 && (
        <p className="mt-3 text-xs text-zinc-500">No matching communities without Plus already.</p>
      )}
    </SectionCard>
  );
}

export function PlansView() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchPlusCommunities(),
      fetch("/api/admin/billing?mode=metrics").then(async (res) => {
        const body = (await res.json()) as BillingMetrics & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Failed to load billing metrics");
        return body;
      }),
    ])
      .then(([plusCommunities, billingMetrics]) => {
        setCommunities(plusCommunities);
        setMetrics(billingMetrics);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plans data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(community: Community) {
    const reason = window.prompt(`Reason for revoking Plus from "${community.name}"?`) ?? undefined;
    setBusyId(community.id);
    try {
      await setCommunityIsPlus(community.id, false, reason);
      toast.success(`Revoked Plus from ${community.name}`);
      setCommunities((prev) => prev.filter((c) => c.id !== community.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke Plus");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Live billing"
        description="Counts from Supabase user_sterling_billing (RevenueCat webhook + client sync). MRR is a rough list-price estimate."
      >
        {error ? (
          <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
        ) : loading ? (
          <p className="text-xs text-zinc-500">Loading metrics…</p>
        ) : (
          <BillingMetricsPanel metrics={metrics} />
        )}
      </SectionCard>

      <BillingSubscribersPanel />

      <SectionCard
        title="Reference plans"
        description="Display copy shown in the mobile shop. Store products must match RevenueCat package ids in sterlingShopContent / revenueCatCatalog."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {REFERENCE_PLANS.map((plan) => (
            <PlanReferenceCard key={plan.id} plan={plan} />
          ))}
        </div>
      </SectionCard>

      <GrantPlusPanel onGranted={load} />

      <SectionCard
        title="Communities with Plus"
        description="Manually granted or (in the future) billing-granted Plus status, all in one place."
      >
        {error ? (
          <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-800/60" />
            ))}
          </div>
        ) : communities.length === 0 ? (
          <EmptyState title="No communities have Plus yet" hint="Use the panel above to grant Plus to a brokerage." />
        ) : (
          <div className="space-y-2">
            {communities.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/communities`} className="font-medium text-zinc-100 hover:text-emerald-300">
                      {c.name ?? "Untitled"}
                    </Link>
                    <Badge variant={c.community_type === "brokerage" ? "violet" : "default"}>
                      {c.community_type === "brokerage" ? "Brokerage" : "Standard"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {c.is_plus_source === "manual" ? "Manually granted" : "Granted via billing"}
                    {c.is_plus_granted_at && ` · ${new Date(c.is_plus_granted_at).toLocaleDateString()}`}
                  </p>
                </div>
                <Button size="sm" variant="destructive" disabled={busyId === c.id} onClick={() => revoke(c)}>
                  {busyId === c.id ? "Revoking…" : "Revoke Plus"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
