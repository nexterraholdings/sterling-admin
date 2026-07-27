"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  clearCopyOverride,
  defaultCopyForType,
  saveCopyOverride,
  type ProductNotificationCopy,
} from "@/lib/notifications/defaultProductNotificationCopy";
import { wrapSelectionWithBold } from "@/lib/notifications/notificationMarkup";
import type { SystemNotificationDefinition } from "@/lib/notifications/systemNotificationCatalog";
import { ProductNotificationPreview } from "@/app/dashboard/notifications/ProductNotificationPreview";

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

function BoldToolbar({
  onBold,
  hint,
}: {
  onBold: () => void;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBold}
        title="Bold selected text"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
      >
        B
      </button>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

export function SystemNotificationEditorDrawer({
  row,
  initialCopy,
  onClose,
  onSaved,
}: {
  row: SystemNotificationDefinition;
  initialCopy: ProductNotificationCopy;
  onClose: () => void;
  onSaved: (type: string, copy: ProductNotificationCopy) => void;
}) {
  const [title, setTitle] = useState(initialCopy.title);
  const [body, setBody] = useState(initialCopy.body ?? "");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(initialCopy.title);
    setBody(initialCopy.body ?? "");
  }, [row.type, initialCopy.title, initialCopy.body]);

  function applyBold(ref: RefObject<HTMLTextAreaElement | null>, value: string, setValue: (v: string) => void) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const { next, selectStart, selectEnd } = wrapSelectionWithBold(value, selectionStart, selectionEnd);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectStart, selectEnd);
    });
  }

  const draft: ProductNotificationCopy = {
    title: title.trim(),
    body: body.trim() ? body.trim() : null,
  };

  function handleSave() {
    if (!draft.title) return;
    saveCopyOverride(row.type, draft);
    onSaved(row.type, draft);
    onClose();
  }

  function handleReset() {
    const def = defaultCopyForType(row.type);
    clearCopyOverride(row.type);
    onSaved(row.type, def);
    setTitle(def.title);
    setBody(def.body ?? "");
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden border-l border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-50">Preview copy</h2>
            <p className="mt-0.5 truncate font-mono text-xs text-emerald-400/90">{row.type}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p className="mb-5 text-sm text-zinc-400">
            Edit sample title and message to see how this type reads in the inbox. Use{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">**bold**</code> markup (same as broadcast notifications).
            Saves in this browser only — does not change live app copy.
          </p>

          <div className="space-y-5">
            <Field label="Title (inbox headline)">
              <BoldToolbar
                onBold={() => applyBold(titleRef, title, setTitle)}
                hint="Select text in title, then B — renders bold in inbox"
              />
              <textarea
                ref={titleRef}
                rows={3}
                className={`${inputCls} resize-none`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </Field>

            <Field label="Message (subtitle body)">
              <BoldToolbar
                onBold={() => applyBold(bodyRef, body, setBody)}
                hint="Optional — shown as quoted subtitle when set"
              />
              <textarea
                ref={bodyRef}
                rows={3}
                className={`${inputCls} resize-none`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Leave empty if this type has no subtitle"
                maxLength={200}
              />
            </Field>

            <ProductNotificationPreview type={row.type} copy={draft.title ? draft : initialCopy} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-zinc-800 px-6 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save preview copy
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
