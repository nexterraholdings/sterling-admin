"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { previewNotificationCopy, type ProductNotificationCopy } from "@/lib/notifications/defaultProductNotificationCopy";
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 sm:h-8 sm:w-8"
      >
        B
      </button>
      <p className="min-w-0 text-xs leading-relaxed text-zinc-500">{hint}</p>
    </div>
  );
}

export function SystemNotificationEditorDrawer({
  row,
  initialCopy,
  onClose,
  onSaved,
  onReset,
  saving,
}: {
  row: SystemNotificationDefinition;
  initialCopy: ProductNotificationCopy;
  onClose: () => void;
  onSaved: (copy: ProductNotificationCopy) => Promise<void>;
  onReset: () => Promise<void>;
  saving: boolean;
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

  async function handleSave() {
    if (!draft.title || saving) return;
    await onSaved(draft);
  }

  async function handleReset() {
    if (saving) return;
    await onReset();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-50 flex w-full flex-col overflow-hidden bg-zinc-900 shadow-2xl sm:inset-y-0 sm:left-auto sm:max-w-lg sm:border-l sm:border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-50">Edit wording</h2>
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

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <p className="mb-5 text-sm text-zinc-400">
            This wording is saved and used for new notifications of this type.{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">{"{{name}}"}</code> is the person,{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">{"{{hub}}"}</code> the place,{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">{"{{post}}"}</code> the post, and{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">{"{{community}}"}</code> the community. Wrap text in{" "}
            <code className="rounded bg-zinc-800 px-1 text-xs">**bold**</code>.
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

            <ProductNotificationPreview type={row.type} copy={previewNotificationCopy(draft.title ? draft : initialCopy)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-800 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:px-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-2"
          >
            {saving ? "Saving…" : "Save wording"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="min-h-11 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 sm:min-h-0 sm:py-2"
          >
            Delete saved wording
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full border border-zinc-800 px-4 text-sm font-medium text-zinc-500 transition hover:text-zinc-300 sm:min-h-0 sm:py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
