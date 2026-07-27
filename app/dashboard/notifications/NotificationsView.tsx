"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type NotificationTemplate,
} from "@/app/dashboard/notifications/actions";
import { SystemNotificationsTable } from "@/app/dashboard/notifications/SystemNotificationsTable";
import { CustomNotificationTypesPanel } from "@/app/dashboard/notifications/definitions/CustomNotificationTypesPanel";
import { CustomBroadcastPanel } from "@/app/dashboard/notifications/CustomBroadcastPanel";

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700";

export function NotificationsView() {
  const [definitionsVersion, setDefinitionsVersion] = useState(0);

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
      .catch((e: unknown) => setTemplatesError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setTemplatesLoading(false));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function openNewTemplateForm() {
    setFormMode("new");
    setFormTemplateId(null);
    setFormName("");
    setFormMessage("");
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
          prev.map((t) => (t.id === updated.id ? updated : t)).sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        const created = await createTemplate({ name: formName, message: formMessage });
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      closeTemplateForm();
    } catch (e: unknown) {
      setTemplatesError(e instanceof Error ? e.message : "Save failed");
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
    } catch (e: unknown) {
      setTemplatesError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <CustomNotificationTypesPanel onDefinitionsChange={() => setDefinitionsVersion((v) => v + 1)} />
      <SystemNotificationsTable />

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-zinc-50">Broadcast templates</h3>
          <button
            type="button"
            onClick={() => openNewTemplateForm()}
            disabled={formMode !== "closed"}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + New template
          </button>
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
                type="button"
                onClick={handleSaveTemplateForm}
                disabled={!formName.trim() || !formMessage.trim() || savingTemplate}
                className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingTemplate ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
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
                      type="button"
                      onClick={() => openEditTemplateForm(t)}
                      disabled={formMode !== "closed"}
                      className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
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

      <CustomBroadcastPanel definitionsVersion={definitionsVersion} />
    </div>
  );
}
