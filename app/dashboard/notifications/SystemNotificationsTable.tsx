"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SYSTEM_NOTIFICATION_CATALOG,
  SYSTEM_NOTIFICATION_CATEGORIES,
  pipelineLabel,
  type SystemNotificationCategory,
  type SystemNotificationDefinition,
} from "@/lib/notifications/systemNotificationCatalog";
import {
  notificationCopyTemplate,
  previewNotificationCopy,
  type ProductNotificationCopy,
} from "@/lib/notifications/defaultProductNotificationCopy";
import { stripBoldMarkup } from "@/lib/notifications/notificationMarkup";
import { FilterChip } from "@/components/admin/ui";
import { SystemNotificationEditorDrawer } from "@/app/dashboard/notifications/SystemNotificationEditorDrawer";
import {
  fetchProductNotificationCopy,
  removeProductNotificationCopy,
  resetProductNotificationCopy,
  saveProductNotificationCopy,
} from "@/app/dashboard/notifications/actions";

const pipelineTone: Record<string, string> = {
  app: "bg-blue-500/10 text-blue-300 ring-blue-500/25",
  discussion: "bg-violet-500/10 text-violet-300 ring-violet-500/25",
  cron: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  admin: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
};

function previewTitleLine(copy: ProductNotificationCopy): string {
  return stripBoldMarkup(copy.title);
}

function PipelineBadge({ pipeline }: { pipeline: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        pipelineTone[pipeline] ?? "bg-zinc-800 text-zinc-400 ring-zinc-700"
      }`}
    >
      {pipelineLabel(pipeline as SystemNotificationDefinition["pipeline"])}
    </span>
  );
}

export function SystemNotificationsTable() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SystemNotificationCategory | "all">("all");
  const [overrides, setOverrides] = useState<Record<string, ProductNotificationCopy>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<SystemNotificationDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingType, setDeletingType] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProductNotificationCopy()
      .then((state) => {
        if (!cancelled) {
          setOverrides(state.copy);
          setRemoved(state.removed);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load saved wording");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyFor = useCallback(
    (type: string) => overrides[type] ?? notificationCopyTemplate(type),
    [overrides],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SYSTEM_NOTIFICATION_CATALOG.filter((row) => {
      if (removed.includes(row.type)) return false;
      if (category !== "all" && row.category !== category) return false;
      if (!q) return true;
      const copy = previewNotificationCopy(copyFor(row.type));
      return (
        row.type.includes(q) ||
        row.trigger.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        previewTitleLine(copy).toLowerCase().includes(q) ||
        (copy.body ?? "").toLowerCase().includes(q)
      );
    });
  }, [query, category, copyFor, removed]);

  const editingCopy = editingRow ? copyFor(editingRow.type) : null;

  async function handleSave(copy: ProductNotificationCopy) {
    if (!editingRow) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveProductNotificationCopy(editingRow.type, copy);
      setOverrides((prev) => ({ ...prev, [editingRow.type]: saved }));
      setEditingRow(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!editingRow) return;
    setSaving(true);
    setSaveError(null);
    try {
      await resetProductNotificationCopy(editingRow.type);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[editingRow.type];
        return next;
      });
      setEditingRow(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: SystemNotificationDefinition) {
    if (saving || deletingType) return;
    if (!window.confirm(`Remove ${row.type} from Copy?`)) return;
    setDeletingType(row.type);
    setSaveError(null);
    try {
      await removeProductNotificationCopy(row.type);
      setRemoved((prev) => (prev.includes(row.type) ? prev : [...prev, row.type]));
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[row.type];
        return next;
      });
      if (editingRow?.type === row.type) setEditingRow(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingType(null);
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50">How they are written</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
            The title and message for each notification ({SYSTEM_NOTIFICATION_CATALOG.length} types). Edit a row to
            change the wording used for new notifications.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search type, trigger, preference…"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 sm:max-w-xs sm:py-2"
        />
      </div>

      {loadError && (
        <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{loadError}</p>
      )}
      {saveError && (
        <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{saveError}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
          All
        </FilterChip>
        {SYSTEM_NOTIFICATION_CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </FilterChip>
        ))}
      </div>

      <div className="mt-5 space-y-3 lg:hidden">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            No types match your filters.
          </p>
        ) : (
          rows.map((row) => {
            const copy = previewNotificationCopy(copyFor(row.type));
            const edited = overrides[row.type] != null;
            return (
              <article key={row.type} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">{previewTitleLine(copy)}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-emerald-300/90">{row.type}</p>
                    {edited && (
                      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
                        Edited
                      </span>
                    )}
                  </div>
                  <PipelineBadge pipeline={row.pipeline} />
                </div>
                {copy.body ? <p className="mt-3 text-sm leading-relaxed text-zinc-400">{copy.body}</p> : null}
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{row.trigger}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSaveError(null);
                      setEditingRow(row);
                    }}
                    className="min-h-11 rounded-full border border-zinc-800 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(row)}
                    disabled={deletingType === row.type}
                    className="min-h-11 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingType === row.type ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-zinc-800 lg:block">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950/80">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Title</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Message</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">When it sends</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Source</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  No types match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const copy = previewNotificationCopy(copyFor(row.type));
                const edited = overrides[row.type] != null;
                return (
                  <tr key={row.type} className="align-top hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-emerald-300/90">{row.type}</td>
                    <td className="max-w-xs px-4 py-3 text-zinc-100">
                      {previewTitleLine(copy)}
                      {edited && (
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
                          Edited
                        </span>
                      )}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-zinc-400">
                      {copy.body ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="max-w-md px-4 py-3 text-zinc-300">{row.trigger}</td>
                    <td className="px-4 py-3">
                      <PipelineBadge pipeline={row.pipeline} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSaveError(null);
                            setEditingRow(row);
                          }}
                          className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          disabled={deletingType === row.type}
                          className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingType === row.type ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-600">
        Showing {rows.length.toLocaleString()} of {(SYSTEM_NOTIFICATION_CATALOG.length - removed.length).toLocaleString()}.
      </p>

      {editingRow && editingCopy && (
        <SystemNotificationEditorDrawer
          key={editingRow.type}
          row={editingRow}
          initialCopy={editingCopy}
          saving={saving}
          onClose={() => setEditingRow(null)}
          onSaved={handleSave}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
