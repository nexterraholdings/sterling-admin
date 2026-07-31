"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchAudiencePreview,
  sendBroadcastNotification,
  sendCustomTypeBroadcast,
  type AudiencePreview,
  type BroadcastResult,
  type CustomBroadcastResult,
} from "@/app/dashboard/notifications/actions";
import { listNotificationDefinitions } from "@/app/dashboard/notifications/definitions/actions";
import { ProductNotificationPreview } from "@/app/dashboard/notifications/ProductNotificationPreview";
import type { NotificationTypeDefinition } from "@/lib/notifications/definitionTypes";
import { TAP_DESTINATION_ROUTE_FIELDS } from "@/lib/notifications/tapDestinations";
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

type BroadcastMode = "system" | "custom";

export function CustomBroadcastPanel({ definitionsVersion }: { definitionsVersion: number }) {
  const [mode, setMode] = useState<BroadcastMode>("system");
  const [definitions, setDefinitions] = useState<NotificationTypeDefinition[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [postId, setPostId] = useState("");
  const [discussionId, setDiscussionId] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [actorId, setActorId] = useState("");
  const [sendPush, setSendPush] = useState(true);
  const [addToInbox, setAddToInbox] = useState(true);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemResult, setSystemResult] = useState<BroadcastResult | null>(null);
  const [customResult, setCustomResult] = useState<CustomBroadcastResult | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const selectedDef = definitions.find((d) => d.type === selectedType) ?? null;

  useEffect(() => {
    let cancelled = false;
    setError(null);

    listNotificationDefinitions()
      .then((rows) => {
        if (cancelled) return;
        const enabled = rows.filter((d) => d.enabled);
        setDefinitions(enabled);
        setSelectedType((prev) => {
          if (prev && enabled.some((d) => d.type === prev)) return prev;
          return enabled[0]?.type ?? "";
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load custom types");
          setDefinitions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [definitionsVersion]);

  useEffect(() => {
    if (selectedDef) {
      setTitle(selectedDef.title_template);
      setBody(selectedDef.body_template ?? "");
    }
  }, [selectedDef?.id]);

  useEffect(() => {
    fetchAudiencePreview()
      .then(setPreview)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Preview failed"))
      .finally(() => setPreviewLoading(false));
  }, []);

  function applyBold(ref: React.RefObject<HTMLTextAreaElement | null>, value: string, setValue: (v: string) => void) {
    const el = ref.current;
    if (!el) return;
    const { next, selectStart, selectEnd } = wrapSelectionWithBold(value, el.selectionStart, el.selectionEnd);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectStart, selectEnd);
    });
  }

  const hasMethod = sendPush || addToInbox;
  const audienceCount =
    sendPush && addToInbox
      ? Math.max(preview?.pushRecipients ?? 0, preview?.inboxRecipients ?? 0)
      : sendPush
        ? (preview?.pushRecipients ?? 0)
        : (preview?.inboxRecipients ?? 0);

  const canSendSystem = mode === "system" && message.trim().length > 0 && hasMethod && audienceCount > 0;
  const canSendCustom =
    mode === "custom" &&
    selectedDef &&
    title.trim().length > 0 &&
    hasMethod &&
    audienceCount > 0;
  const canSend = mode === "system" ? canSendSystem : canSendCustom;

  const routeFields = selectedDef ? TAP_DESTINATION_ROUTE_FIELDS[selectedDef.tap_destination] : [];

  async function handleSend() {
    setSending(true);
    setError(null);
    setSystemResult(null);
    setCustomResult(null);
    try {
      if (mode === "system") {
        const res = await sendBroadcastNotification({ message, sendPush, addToInbox });
        setSystemResult(res);
        setMessage("");
      } else if (selectedDef) {
        const res = await sendCustomTypeBroadcast({
          customType: selectedDef.type,
          title,
          body: body.trim() || null,
          tap_destination: selectedDef.tap_destination,
          routeIds: {
            post_id: postId.trim() || null,
            discussion_id: discussionId.trim() || null,
            community_id: communityId.trim() || null,
            actor_id: actorId.trim() || null,
          },
          sendPush,
          addToInbox,
        });
        setCustomResult(res);
      }
      setConfirming(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-zinc-50">Send to all users</h3>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("system")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${mode === "system" ? "bg-white text-zinc-900" : "border border-zinc-700 text-zinc-400"}`}
        >
          System broadcast
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${mode === "custom" ? "bg-white text-zinc-900" : "border border-zinc-700 text-zinc-400"}`}
        >
          Custom type
        </button>
      </div>

      <div className="mt-5 max-w-xl space-y-5">
        {mode === "custom" && (
          <>
            <Field label="Custom type">
              <select
                className={inputCls}
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                {definitions.length === 0 ? (
                  <option value="">Create a custom type first</option>
                ) : (
                  definitions.map((d) => (
                    <option key={d.id} value={d.type}>
                      {d.display_name} ({d.type})
                    </option>
                  ))
                )}
              </select>
            </Field>
            <Field label="Title">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applyBold(titleRef, title, setTitle)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300"
                >
                  B
                </button>
                <textarea
                  ref={titleRef}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
              </div>
            </Field>
            <Field label="Message (optional)">
              <textarea
                rows={2}
                className={`${inputCls} resize-none`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={200}
              />
            </Field>
            {routeFields.includes("post_id") && (
              <Field label="Post ID">
                <input className={inputCls} value={postId} onChange={(e) => setPostId(e.target.value)} />
              </Field>
            )}
            {routeFields.includes("discussion_id") && (
              <Field label="Discussion ID">
                <input className={inputCls} value={discussionId} onChange={(e) => setDiscussionId(e.target.value)} />
              </Field>
            )}
            {routeFields.includes("community_id") && (
              <Field label="Community ID">
                <input className={inputCls} value={communityId} onChange={(e) => setCommunityId(e.target.value)} />
              </Field>
            )}
            {routeFields.includes("actor_id") && (
              <Field label="Actor user ID">
                <input className={inputCls} value={actorId} onChange={(e) => setActorId(e.target.value)} />
              </Field>
            )}
            {selectedDef && (
              <ProductNotificationPreview
                type={selectedDef.type}
                copy={{ title: title || "Title", body: body || null }}
                compact
              />
            )}
          </>
        )}

        {mode === "system" && (
          <Field label="Message">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyBold(messageRef, message, setMessage)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-300"
                >
                  B
                </button>
                <p className="text-xs text-zinc-500">Legacy system type — tap opens inbox only</p>
              </div>
              <textarea
                ref={messageRef}
                rows={4}
                className={`${inputCls} resize-none`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={200}
              />
            </div>
          </Field>
        )}

        <Field label="Delivery">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
              Device pop-up (push notification)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={addToInbox} onChange={(e) => setAddToInbox(e.target.checked)} />
              Add to in-app notification inbox
            </label>
          </div>
        </Field>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-400">
          {previewLoading ? (
            "Calculating recipients…"
          ) : (
            <>
              {sendPush && <p>{preview?.pushRecipients ?? 0} devices (push)</p>}
              {addToInbox && <p>{preview?.inboxRecipients ?? 0} users (inbox)</p>}
            </>
          )}
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        {systemResult && (
          <p className="text-sm text-emerald-300">System broadcast completed.</p>
        )}
        {customResult && (
          <p className="text-sm text-emerald-300">
            Custom send: {customResult.inbox?.inserted ?? 0} inbox rows; push sent {customResult.pushSent}
            {customResult.pushFailed > 0 ? `, ${customResult.pushFailed} push failures` : ""}.
          </p>
        )}

        {!confirming ? (
          <button
            type="button"
            disabled={!canSend}
            onClick={() => setConfirming(true)}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            Send to all users
          </button>
        ) : (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-300">Send this notification to all users now?</p>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
                Cancel
              </button>
              <button type="button" disabled={sending} onClick={handleSend} className="rounded-full bg-amber-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {sending ? "Sending…" : "Confirm send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
