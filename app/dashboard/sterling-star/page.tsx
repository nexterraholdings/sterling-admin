"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStarApplications, updateStarApplication } from "./actions";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type StarApplication,
} from "./data";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  declined: "Declined",
};

const STATUS_CLASS: Record<ApplicationStatus, string> = {
  new: "bg-sky-500/15 text-sky-300",
  reviewing: "bg-amber-500/15 text-amber-300",
  accepted: "bg-emerald-500/15 text-emerald-300",
  declined: "bg-rose-500/15 text-rose-300",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function SterlingStarPage() {
  const [rows, setRows] = useState<StarApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await fetchStarApplications({
        status: statusFilter,
        query,
      });
      setRows(data);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load applicants");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => {
    const next = { all: rows.length, new: 0, reviewing: 0, accepted: 0, declined: 0 };
    for (const row of rows) next[row.status] += 1;
    return next;
  }, [rows]);

  async function patch(id: string, patch: { status?: ApplicationStatus; notes?: string }) {
    setSavingId(id);
    try {
      const updated = await updateStarApplication({ id, ...patch });
      setRows((prev) => prev.map((row) => (row.id === id ? updated : row)));
      setToast("Applicant updated");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Creators</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Sterling Star applicants</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Applications from the public Sterling Star form. Review visibility, socials, and location, then negotiate terms creator by creator.
        </p>

        <div className="mt-5 flex flex-col gap-3 border-t border-zinc-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", ...APPLICATION_STATUSES] as const).map((status) => {
              const active = statusFilter === status;
              const label = status === "all" ? "All" : STATUS_LABEL[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, city"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 sm:w-64"
            />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {loading ? "Loading" : `${rows.length} applicant${rows.length === 1 ? "" : "s"}`}
          {!loading && statusFilter === "all" ? ` · ${counts.new} new` : ""}
        </p>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-800" />
            ))}
          </div>
        ) : listError ? (
          <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{listError}</div>
        ) : rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
            No applicants yet
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const open = openId === row.id;
              return (
                <article key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-800/60 p-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : row.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-50">{row.full_name}</p>
                        <StatusBadge status={row.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-zinc-400">{row.email}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {row.city}, {row.state}, {row.country} · age {row.age} · {formatDate(row.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">{open ? "Hide" : "View"}</span>
                  </button>

                  {open && (
                    <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Socials</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{row.socials}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {APPLICATION_STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={savingId === row.id || row.status === status}
                            onClick={() => void patch(row.id, { status })}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                              row.status === status
                                ? STATUS_CLASS[status] + " ring-1 ring-white/10"
                                : "bg-zinc-900 text-zinc-400 hover:text-zinc-50"
                            }`}
                          >
                            {STATUS_LABEL[status]}
                          </button>
                        ))}
                      </div>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-zinc-400">Internal notes</span>
                        <textarea
                          defaultValue={row.notes ?? ""}
                          rows={3}
                          onBlur={(e) => {
                            const next = e.target.value;
                            if ((row.notes ?? "") === next) return;
                            void patch(row.id, { notes: next });
                          }}
                          placeholder="Negotiation notes, visibility, next step"
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
                        />
                      </label>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-zinc-800 px-4 py-3 text-sm text-zinc-100 shadow-lg ring-1 ring-zinc-700">
          {toast}
        </div>
      )}
    </div>
  );
}
