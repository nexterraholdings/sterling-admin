"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchAudiencePreview,
  sendBroadcastNotification,
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type AudiencePreview,
  type BroadcastResult,
  type NotificationTemplate,
} from "@/app/dashboard/notifications/actions";

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

export function NotificationsView() {
  const [message, setMessage] = useState("");
  const [sendPush, setSendPush] = useState(true);
  const [addToInbox, setAddToInbox] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"closed" | "new" | "edit">("closed");
  const [formTemplateId, setFormTemplateId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = useCallback(() => {
    setTemplatesLoading(true);
    fetchTemplates()
      .then(setTemplates)
      .catch((e: any) => setTemplatesError(e.message))
      .finally(() => setTemplatesLoading(false));
  }, []);

  useEffect(() => {
    fetchAudiencePreview()
      .then(setPreview)
      .catch((e: any) => setError(e.message))
      .finally(() => setPreviewLoading(false));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function handleUseTemplate(t: NotificationTemplate) {
    setMessage(t.message);
  }

  function openNewTemplateForm(prefillMessage = "") {
    setFormMode("new");
    setFormTemplateId(null);
    setFormName("");
    setFormMessage(prefillMessage);
    setTemplatesError(null);
  }

  function openEditTemplateForm(t: NotificationTemplate) {
    setFormMode("edit");
    setFormTemplateId(t.id);
    setFormName(t.name);
    setFormMessage(t.message);
    setTemplatesError(null);
  }

  function closeTemplateForm() {
    setFormMode("closed");
    setFormTemplateId(null);
    setFormName("");
    setFormMessage("");
  }

  async function handleSaveTemplateForm() {
    setSavingTemplate(true);
    setTemplatesError(null);
    try {
      if (formMode === "edit" && formTemplateId) {
        const updated = await updateTemplate(formTemplateId, { name: formName, message: formMessage });
        setTemplates((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)).sort((a, b) => a.name.localeCompare(b.name))
        );
      } else {
        const created = await createTemplate({ name: formName, message: formMessage });
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      closeTemplateForm();
    } catch (e: any) {
      setTemplatesError(e.message);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    setDeletingId(id);
    setTemplatesError(null);
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      setTemplatesError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleBold() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;

    if (selectionStart === selectionEnd) {
      const placeholder = "bold text";
      const next = `${value.slice(0, selectionStart)}**${placeholder}**${value.slice(selectionEnd)}`;
      setMessage(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(selectionStart + 2, selectionStart + 2 + placeholder.length);
      });
      return;
    }

    const selected = value.slice(selectionStart, selectionEnd);
    const next = `${value.slice(0, selectionStart)}**${selected}**${value.slice(selectionEnd)}`;
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart, selectionStart + selected.length + 4);
    });
  }

  const hasMethod = sendPush || addToInbox;
  const audienceCount = sendPush && addToInbox
    ? Math.max(preview?.pushRecipients ?? 0, preview?.inboxRecipients ?? 0)
    : sendPush
    ? preview?.pushRecipients ?? 0
    : preview?.inboxRecipients ?? 0;
  const canSend = message.trim().length > 0 && !previewLoading && hasMethod && audienceCount > 0;

  async function handleSend() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await sendBroadcastNotification({ message, sendPush, addToInbox });
      setResult(res);
      setConfirming(false);
      setMessage("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-zinc-50">Templates</h3>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => openNewTemplateForm(message)}
              disabled={!message.trim() || formMode !== "closed"}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save current as template
            </button>
            <button
              onClick={() => openNewTemplateForm()}
              disabled={formMode !== "closed"}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + New template
            </button>
          </div>
        </div>

        {formMode !== "closed" && (
          <div className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-800/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {formMode === "edit" ? "Edit template" : "New template"}
            </p>
            <input
              className={inputCls}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Template name"
              maxLength={60}
              autoFocus
            />
            <textarea
              rows={3}
              className={`${inputCls} resize-none`}
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
              placeholder="Template message…"
              maxLength={200}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTemplateForm}
                disabled={!formName.trim() || !formMessage.trim() || savingTemplate}
                className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingTemplate ? "Saving…" : "Save"}
              </button>
              <button
                onClick={closeTemplateForm}
                disabled={savingTemplate}
                className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {templatesError && (
          <p className="mt-3 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{templatesError}</p>
        )}

        <div className="mt-4">
          {templatesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-zinc-800" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-800/60 text-sm text-zinc-500">
              No saved templates yet
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-50">{t.name}</p>
                    <p className="truncate text-xs text-zinc-500">{t.message}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleUseTemplate(t)}
                      className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => openEditTemplateForm(t)}
                      disabled={formMode !== "closed"}
                      className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      disabled={deletingId === t.id}
                      className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === t.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="max-w-xl space-y-5">
          <Field label="Message">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBold}
                  title="Bold selected text"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  B
                </button>
                <p className="text-xs text-zinc-500">Select text, then click B to bold it in the app inbox</p>
              </div>
              <textarea
                ref={textareaRef}
                rows={4}
                className={`${inputCls} resize-none`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the notification…"
                maxLength={200}
              />
            </div>
          </Field>

          <Field label="Delivery">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={sendPush}
                  onChange={(e) => setSendPush(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 text-zinc-50 focus:ring-zinc-500"
                />
                Device pop-up (push notification)
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={addToInbox}
                  onChange={(e) => setAddToInbox(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 text-zinc-50 focus:ring-zinc-500"
                />
                Add to in-app notification inbox
              </label>
            </div>
            {!hasMethod && (
              <p className="mt-1 text-xs text-rose-400">Select at least one delivery method.</p>
            )}
          </Field>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-400">
            {previewLoading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                Calculating recipients…
              </span>
            ) : (
              <div className="space-y-0.5">
                {sendPush && (
                  <p>
                    <span className="font-semibold text-zinc-50">{preview?.pushRecipients ?? 0}</span>{" "}
                    {preview?.pushRecipients === 1 ? "device" : "devices"} will get the pop-up
                  </p>
                )}
                {addToInbox && (
                  <p>
                    <span className="font-semibold text-zinc-50">{preview?.inboxRecipients ?? 0}</span>{" "}
                    {preview?.inboxRecipients === 1 ? "user" : "users"} will see it in their inbox
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</p>
          )}

          {result && (
            <div className="space-y-3">
              {result.push && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  <p className="font-semibold">Push notification sent</p>
                  <p className="mt-1">
                    {result.push.sent} delivered, {result.push.failed} failed, out of {result.push.targeted} targeted.
                  </p>
                  {result.push.errors.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-emerald-400">
                      {result.push.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {result.inbox && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  <p className="font-semibold">Added to inbox</p>
                  <p className="mt-1">
                    {result.inbox.inserted} of {result.inbox.targeted} users now have this in their inbox.
                  </p>
                  {result.inbox.errors.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-emerald-400">
                      {result.inbox.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!canSend}
              className="rounded-full bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send to all users
            </button>
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-300">
                {sendPush && addToInbox
                  ? "Push this notification and add it to every user's inbox now?"
                  : sendPush
                  ? "Push this notification to all devices now?"
                  : "Add this notification to every user's inbox now?"}
              </p>
              <p className="mt-1 text-xs text-amber-400">This cannot be undone once sent.</p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={sending}
                  className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Confirm send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
