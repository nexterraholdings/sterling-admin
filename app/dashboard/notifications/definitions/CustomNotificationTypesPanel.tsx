"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNotificationDefinition,
  listNotificationDefinitions,
  setNotificationDefinitionEnabled,
  updateNotificationDefinition,
} from "@/app/dashboard/notifications/definitions/actions";
import { ProductNotificationPreview } from "@/app/dashboard/notifications/ProductNotificationPreview";
import type { NotificationTypeDefinition } from "@/lib/notifications/definitionTypes";
import {
  NOTIFICATION_TAP_DESTINATIONS,
  TAP_DESTINATION_LABELS,
  TAP_DESTINATION_ROUTE_FIELDS,
  normalizeCustomTypeSlug,
} from "@/lib/notifications/tapDestinations";
import type { NotificationTapDestination } from "@/lib/notifications/tapDestinations";
import { wrapSelectionWithBold } from "@/lib/notifications/notificationMarkup";

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function BoldField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <Field label={label}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const el = ref.current;
              if (!el) return;
              const { next, selectStart, selectEnd } = wrapSelectionWithBold(
                value,
                el.selectionStart,
                el.selectionEnd,
              );
              onChange(next);
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(selectStart, selectEnd);
              });
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            B
          </button>
          <p className="text-xs text-zinc-500">**bold** renders in the app inbox</p>
        </div>
        <textarea
          ref={ref}
          rows={rows}
          className={`${inputCls} resize-none`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
        />
      </div>
    </Field>
  );
}

function DefinitionForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: NotificationTypeDefinition | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [typeSlug, setTypeSlug] = useState(initial?.type ?? "custom_");
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [titleTemplate, setTitleTemplate] = useState(initial?.title_template ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(initial?.body_template ?? "");
  const [tapDestination, setTapDestination] = useState<NotificationTapDestination>(
    initial?.tap_destination ?? "inbox",
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routeFields = TAP_DESTINATION_ROUTE_FIELDS[tapDestination];

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateNotificationDefinition(initial.id, {
          display_name: displayName,
          title_template: titleTemplate,
          body_template: bodyTemplate || null,
          tap_destination: tapDestination,
          enabled,
        });
      } else {
        await createNotificationDefinition({
          typeSlug,
          display_name: displayName,
          title_template: titleTemplate,
          body_template: bodyTemplate || null,
          tap_destination: tapDestination,
          enabled,
        });
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-800/40 p-4">
      <p className="text-sm font-semibold text-zinc-100">{initial ? "Edit custom type" : "New custom type"}</p>
      {!initial && (
        <Field label="Type slug">
          <input
            className={inputCls}
            value={typeSlug}
            onChange={(e) => setTypeSlug(normalizeCustomTypeSlug(e.target.value))}
            placeholder="custom_product_launch"
          />
          <p className="text-xs text-zinc-600">Saved as {normalizeCustomTypeSlug(typeSlug)}</p>
        </Field>
      )}
      {initial && (
        <p className="font-mono text-xs text-emerald-400/90">{initial.type}</p>
      )}
      <Field label="Display name">
        <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Tap destination">
        <select
          className={inputCls}
          value={tapDestination}
          onChange={(e) => setTapDestination(e.target.value as NotificationTapDestination)}
        >
          {NOTIFICATION_TAP_DESTINATIONS.map((d) => (
            <option key={d} value={d}>
              {TAP_DESTINATION_LABELS[d]}
            </option>
          ))}
        </select>
        {routeFields.length > 0 && (
          <p className="text-xs text-amber-400/90">
            When sending, provide: {routeFields.join(", ")}
          </p>
        )}
      </Field>
      <BoldField label="Title template" value={titleTemplate} onChange={setTitleTemplate} />
      <BoldField
        label="Message template (optional)"
        value={bodyTemplate}
        onChange={setBodyTemplate}
        placeholder="Subtitle in inbox"
      />
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>
      <ProductNotificationPreview
        type={initial?.type ?? normalizeCustomTypeSlug(typeSlug)}
        copy={{ title: titleTemplate || "Title preview", body: bodyTemplate || null }}
        compact
      />
      <p className="text-xs text-zinc-600">Uses global in-app / push toggles only (no per-type preference in v1).</p>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !displayName.trim() || !titleTemplate.trim()}
          onClick={handleSave}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CustomNotificationTypesPanel({ onDefinitionsChange }: { onDefinitionsChange?: () => void }) {
  const [definitions, setDefinitions] = useState<NotificationTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"closed" | "new" | "edit">("closed");
  const [editTarget, setEditTarget] = useState<NotificationTypeDefinition | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listNotificationDefinitions()
      .then((rows) => {
        setDefinitions(rows);
        onDefinitionsChange?.();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [onDefinitionsChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(def: NotificationTypeDefinition) {
    try {
      await setNotificationDefinitionEnabled(def.id, !def.enabled);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50">Custom notification types</h3>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">
            Define types with inbox copy and tap destination. Send via the broadcast panel below.
          </p>
        </div>
        {formMode === "closed" && (
          <button
            type="button"
            onClick={() => {
              setFormMode("new");
              setEditTarget(null);
            }}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            + Add type
          </button>
        )}
      </div>

      {formMode !== "closed" && (
        <div className="mt-4">
          <DefinitionForm
            initial={formMode === "edit" ? editTarget : null}
            onCancel={() => {
              setFormMode("closed");
              setEditTarget(null);
            }}
            onDone={() => {
              setFormMode("closed");
              setEditTarget(null);
              load();
            }}
          />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-zinc-800" />
        ) : definitions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 py-10 text-center text-sm text-zinc-500">
            No custom types yet. Add one to send routed notifications.
          </div>
        ) : (
          <div className="space-y-2">
            {definitions.map((def) => (
              <div
                key={def.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-50">{def.display_name}</p>
                  <p className="font-mono text-xs text-emerald-400/80">{def.type}</p>
                  <p className="truncate text-xs text-zinc-500">{def.title_template}</p>
                  <p className="text-[11px] text-zinc-600">{TAP_DESTINATION_LABELS[def.tap_destination]}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleEnabled(def)}
                    className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                  >
                    {def.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    disabled={formMode !== "closed"}
                    onClick={() => {
                      setEditTarget(def);
                      setFormMode("edit");
                    }}
                    className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
