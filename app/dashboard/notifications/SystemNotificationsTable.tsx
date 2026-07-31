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
  loadCopyOverrides,
  resolveProductNotificationCopy,
  type ProductNotificationCopy,
} from "@/lib/notifications/defaultProductNotificationCopy";
import { stripBoldMarkup } from "@/lib/notifications/notificationMarkup";
import { FilterChip } from "@/components/admin/ui";
import { SystemNotificationEditorDrawer } from "@/app/dashboard/notifications/SystemNotificationEditorDrawer";

const pipelineTone: Record<string, string> = {
  app: "bg-blue-500/10 text-blue-300 ring-blue-500/25",
  discussion: "bg-violet-500/10 text-violet-300 ring-violet-500/25",
  cron: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  admin: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
};

function previewTitleLine(copy: ProductNotificationCopy): string {
  return stripBoldMarkup(copy.title);
}

export function SystemNotificationsTable() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SystemNotificationCategory | "all">("all");
  const [overrides, setOverrides] = useState<Record<string, ProductNotificationCopy>>({});
  const [editingRow, setEditingRow] = useState<SystemNotificationDefinition | null>(null);

  useEffect(() => {
    setOverrides(loadCopyOverrides());
  }, []);

  const handleSaved = useCallback((type: string, copy: ProductNotificationCopy) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const def = resolveProductNotificationCopy(type, {});
      if (copy.title === def.title && copy.body === def.body) {
        delete next[type];
      } else {
        next[type] = copy;
      }
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SYSTEM_NOTIFICATION_CATALOG.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (!q) return true;
      const copy = resolveProductNotificationCopy(row.type, overrides);
      return (
        row.type.includes(q) ||
        row.trigger.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.preferenceColumn ?? "").includes(q) ||
        previewTitleLine(copy).toLowerCase().includes(q)
      );
    });
  }, [query, category, overrides]);

  const editingCopy =
    editingRow != null ? resolveProductNotificationCopy(editingRow.type, overrides) : null;

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50">Product notifications</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Every in-app / push type the app sends ({SYSTEM_NOTIFICATION_CATALOG.length} types). Use{" "}
            <span className="text-zinc-400">Edit</span> to adjust sample title, message, and{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-300">**bold**</code> and preview the
            public inbox look.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search type, trigger, preference…"
          className="w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700"
        />
      </div>

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

      <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950/80">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Sample title</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Category</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Trigger</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Source</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Preference</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  No types match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const copy = resolveProductNotificationCopy(row.type, overrides);
                const customized = overrides[row.type] != null;
                return (
                  <tr key={row.type} className="align-top hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-emerald-300/90">{row.type}</td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate text-zinc-200" title={previewTitleLine(copy)}>
                        {previewTitleLine(copy)}
                      </p>
                      {copy.body && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500" title={copy.body}>
                          &ldquo;{copy.body}&rdquo;
                        </p>
                      )}
                      {customized && (
                        <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
                          Custom preview
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{row.category}</td>
                    <td className="max-w-md px-4 py-3 text-zinc-300">{row.trigger}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                          pipelineTone[row.pipeline] ?? "bg-zinc-800 text-zinc-400 ring-zinc-700"
                        }`}
                      >
                        {pipelineLabel(row.pipeline)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                      {row.preferenceColumn ?? (
                        <span className="text-zinc-600" title="Only global in-app / push toggles apply">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditingRow(row)}
                        className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-600">
        Showing {rows.length} of {SYSTEM_NOTIFICATION_CATALOG.length}. Preview edits are stored in your browser only.
      </p>

      {editingRow && editingCopy && (
        <SystemNotificationEditorDrawer
          key={editingRow.type}
          row={editingRow}
          initialCopy={editingCopy}
          onClose={() => setEditingRow(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
