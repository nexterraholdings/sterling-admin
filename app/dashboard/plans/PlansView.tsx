"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  fetchPlusCommunities,
  fetchCommunities,
  setCommunityIsPlus,
} from "@/app/dashboard/communities/actions";
import { searchUsers, type UserSearchResult } from "@/app/dashboard/invite-points/actions";
import { setManualUserBilling, syncUserBillingFromRevenueCat } from "@/app/dashboard/plans/actions";
import type { Community } from "@/lib/communities/types";
import type {
  BillingEventsResponse,
  BillingListResponse,
  BillingMetrics,
  BillingPlanId,
  BillingStatus,
  BillingSubscriberRow,
} from "@/lib/billing/types";
import {
  EmptyState,
  FilterChip,
  FilterField,
  LoadMoreBar,
  SectionCard,
  filterInputProps,
  formatRelativeTime,
  personLabel,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  formatMembershipUsd,
  sterlingMembershipMonthlyPriceUsd,
} from '@/lib/billing/sterlingMembershipPricing';

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

const SUBSCRIBER_PAGE_SIZE = 25;

const PLAN_FILTERS: { value: BillingPlanId | ""; label: string }[] = [
  { value: "", label: "All plans" },
  { value: "sterling_plus", label: "Plus" },
  { value: "sterling_premium", label: "Premium" },
  { value: "free", label: "Free" },
];

const STATUS_FILTERS: { value: BillingStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "grace_period", label: "Grace" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "inactive", label: "Inactive" },
];

const PLAN_BADGE: Record<BillingPlanId, "emerald" | "violet" | "default"> = {
  sterling_plus: "emerald",
  sterling_premium: "violet",
  free: "default",
};

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
    { label: "Expired (30d)", value: metrics.expired_last_30_days },
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

function BillingSubscribersPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<BillingSubscriberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<BillingPlanId | "">("");
  const [statusFilter, setStatusFilter] = useState<BillingStatus | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncBusyId, setSyncBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const append = page > 1;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams({
        mode: "list",
        page: String(page),
        pageSize: String(SUBSCRIBER_PAGE_SIZE),
      });
      if (search.trim()) params.set("search", search.trim());
      if (planFilter) params.set("plan", planFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/billing?${params.toString()}`);
      const body = (await res.json()) as BillingListResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load subscribers");
      const incoming = body.subscribers ?? [];
      setTotal(body.total ?? 0);
      setRows((prev) => {
        if (page === 1) return incoming;
        const ids = new Set(prev.map((r) => r.user_id));
        return [...prev, ...incoming.filter((r) => !ids.has(r.user_id))];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, planFilter, statusFilter, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  async function syncRow(userId: string) {
    setSyncBusyId(userId);
    try {
      const updated = await syncUserBillingFromRevenueCat(userId);
      setRows((prev) => prev.map((r) => (r.user_id === userId ? updated : r)));
      toast.success("Synced from RevenueCat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncBusyId(null);
    }
  }

  const hasMore = rows.length < total;

  return (
    <SectionCard
      title="Billing subscribers"
      description="Synced from RevenueCat webhooks and post-purchase sync. Use Sync to pull the latest subscriber from RevenueCat, or grant comp access below."
    >
      <FilterField label="Search">
        <input
          {...filterInputProps()}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Username, email, or user id…"
          autoComplete="off"
        />
      </FilterField>

      <div className="mt-4 flex flex-wrap gap-2">
        {PLAN_FILTERS.map((f) => (
          <FilterChip
            key={f.value || "all-plans"}
            active={planFilter === f.value}
            tone={f.value === "sterling_premium" ? "violet" : f.value === "sterling_plus" ? "emerald" : "neutral"}
            onClick={() => {
              setPlanFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <FilterChip
            key={f.value || "all-statuses"}
            active={statusFilter === f.value}
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : loading && page === 1 ? (
        <p className="mt-3 text-xs text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No billing rows yet"
          hint="Run a sandbox purchase, configure the RevenueCat webhook, or grant comp access below."
        />
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <div
                key={row.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-zinc-100">
                      {row.full_name ?? row.username ?? row.email ?? row.user_id}
                    </p>
                    <Badge variant={PLAN_BADGE[row.plan]}>{formatPlanLabel(row.plan)}</Badge>
                    <Badge variant="default">{row.status}</Badge>
                    {row.is_sandbox && <Badge variant="amber">sandbox</Badge>}
                    {row.store === "admin" && <Badge variant="violet">manual</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.email ?? row.user_id}
                    {row.product_id ? ` · ${row.product_id}` : ""}
                    {row.environment ? ` · ${row.environment}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {row.expires_at ? `Expires ${new Date(row.expires_at).toLocaleString()}` : "No expiry"}
                    {" · "}
                    Updated {formatRelativeTime(row.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={syncBusyId === row.user_id}
                    onClick={() => syncRow(row.user_id)}
                  >
                    {syncBusyId === row.user_id ? "Syncing…" : "Sync RC"}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/dashboard/users">Users</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <LoadMoreBar
            shown={rows.length}
            total={total}
            loading={loadingMore}
            hasMore={hasMore}
            onLoadMore={() => {
              if (!loadingMore && !loading && hasMore) setPage((p) => p + 1);
            }}
          />
        </>
      )}
    </SectionCard>
  );
}

function BillingWebhookEventsPanel({ refreshKey }: { refreshKey: number }) {
  const [events, setEvents] = useState<BillingEventsResponse["events"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const append = page > 1;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams({
        mode: "events",
        page: String(page),
        pageSize: "20",
      });
      const res = await fetch(`/api/admin/billing?${params.toString()}`);
      const body = (await res.json()) as BillingEventsResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load events");
      setTotal(body.total ?? 0);
      setEvents((prev) => {
        const incoming = body.events ?? [];
        if (page === 1) return incoming;
        const ids = new Set(prev.map((e) => e.id));
        return [...prev, ...incoming.filter((e) => !ids.has(e.id))];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const hasMore = events.length < total;

  return (
    <SectionCard
      title="RevenueCat webhooks"
      description="Recent webhook deliveries stored in billing_revenuecat_events. Failures usually mean apply_user_sterling_billing rejected the payload."
    >
      {error ? (
        <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : loading && page === 1 ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyState
          title="No webhook events yet"
          hint="Point RevenueCat at your revenuecat-webhook edge function URL and send a test event."
        />
      ) : (
        <>
          <div className="space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-100">{ev.event_type}</span>
                  {ev.apply_error && <Badge variant="rose">apply error</Badge>}
                  <span className="text-xs text-zinc-500">{formatRelativeTime(ev.received_at)}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {ev.product_id ?? "no product"}
                  {ev.store ? ` · ${ev.store}` : ""}
                  {ev.environment ? ` · ${ev.environment}` : ""}
                </p>
                {ev.app_user_id && (
                  <p className="mt-0.5 truncate text-xs text-zinc-600">User {ev.app_user_id}</p>
                )}
                {ev.apply_error && <p className="mt-2 text-xs text-rose-300">{ev.apply_error}</p>}
              </div>
            ))}
          </div>
          <LoadMoreBar
            shown={events.length}
            total={total}
            loading={loadingMore}
            hasMore={hasMore}
            onLoadMore={() => {
              if (!loadingMore && !loading && hasMore) setPage((p) => p + 1);
            }}
          />
        </>
      )}
    </SectionCard>
  );
}

function ManualUserBillingPanel({ onChanged }: { onChanged: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [plan, setPlan] = useState<BillingPlanId>("sterling_plus");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchUsers(search.trim()));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function apply() {
    if (!selected) {
      toast.error("Select a user first");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setBusy(true);
    try {
      await setManualUserBilling({
        userId: selected.id,
        plan,
        reason: reason.trim(),
        expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
      });
      toast.success(
        plan === "free"
          ? `Revoked billing for ${personLabel(selected)}`
          : `Granted ${formatPlanLabel(plan)} to ${personLabel(selected)}`,
      );
      setReason("");
      setExpiresAt("");
      setSelected(null);
      setSearch("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update billing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Comp / manual membership"
      description="Write directly to user_sterling_billing (store=admin). Use for comps, support fixes, or brokerages before automated community linking."
    >
      <FilterField label="Find user">
        <input
          {...filterInputProps()}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
          }}
          placeholder="Name, email, or username…"
          autoComplete="off"
        />
      </FilterField>
      {loading && <p className="mt-2 text-xs text-zinc-500">Searching…</p>}
      {!loading && results.length > 0 && !selected && (
        <div className="mt-3 space-y-1">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelected(u)}
              className="flex w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-left text-sm transition hover:border-emerald-500/40"
            >
              <span className="font-medium text-zinc-200">{personLabel(u)}</span>
              <span className="ml-2 truncate text-xs text-zinc-500">{u.email}</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-4 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="text-sm text-zinc-300">
            Target: <span className="font-semibold text-zinc-100">{personLabel(selected)}</span>
            <button
              type="button"
              className="ml-2 text-xs text-zinc-500 underline hover:text-zinc-300"
              onClick={() => setSelected(null)}
            >
              Change
            </button>
          </p>
          <div className="flex flex-wrap gap-2">
            {(["sterling_plus", "sterling_premium", "free"] as BillingPlanId[]).map((p) => (
              <FilterChip key={p} active={plan === p} tone={p === "free" ? "rose" : "emerald"} onClick={() => setPlan(p)}>
                {p === "free" ? "Revoke (free)" : formatPlanLabel(p)}
              </FilterChip>
            ))}
          </div>
          {plan !== "free" && (
            <div>
              <Label htmlFor="billing-expires">Expiry (optional)</Label>
              <Input
                id="billing-expires"
                type="date"
                className="mt-1.5"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">Leave blank for no expiry on the comp grant.</p>
            </div>
          )}
          <div>
            <Label htmlFor="billing-reason">Reason</Label>
            <Input
              id="billing-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Support ticket, brokerage invoice, etc."
            />
          </div>
          <Button disabled={busy} onClick={() => void apply()}>
            {busy ? "Saving…" : plan === "free" ? "Revoke membership" : "Apply membership"}
          </Button>
        </div>
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
  const [refreshKey, setRefreshKey] = useState(0);

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

  const refreshAll = useCallback(() => {
    load();
    setRefreshKey((k) => k + 1);
  }, [load]);

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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" disabled={loading} onClick={refreshAll}>
          Refresh all
        </Button>
      </div>

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

      <ManualUserBillingPanel onChanged={refreshAll} />

      <BillingSubscribersPanel refreshKey={refreshKey} />

      <BillingWebhookEventsPanel refreshKey={refreshKey} />

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

      <GrantPlusPanel onGranted={refreshAll} />

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
