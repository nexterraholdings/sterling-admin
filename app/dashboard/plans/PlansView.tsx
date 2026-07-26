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
import { EmptyState, SectionCard } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mirrors Sterling/src/lib/business/sterlingShopContent.ts (STERLING_PLUS_PLAN /
// STERLING_PREMIUM_PLAN). Not billing-backed — keep in sync by hand if pricing changes.
const REFERENCE_PLANS = [
  {
    id: "sterling_plus",
    name: "Sterling Plus",
    tagline: "More room on the map for everyday members",
    priceLabel: "$9.99",
    priceHint: "per month",
    features: [
      "Free mobile icons",
      "Recover streaks free, 2× per week",
      "2 extra hubs each month",
      "5 extra events each month",
    ],
  },
  {
    id: "sterling_premium",
    name: "Sterling Premium",
    tagline: "For brokerages, teams, and local businesses",
    priceLabel: "$49",
    priceHint: "per month",
    features: [
      "Create a business community (brokerage)",
      "Add deals and property listings",
      "Collect leads from interested buyers",
      "Advanced listing analytics",
    ],
  },
];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPlusCommunities()
      .then(setCommunities)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load Plus communities"))
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
        title="Reference plans"
        description="Display copy only — not billed. There is no Stripe/StoreKit/Play integration yet; these are the plans shown to users in the mobile app shop."
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
