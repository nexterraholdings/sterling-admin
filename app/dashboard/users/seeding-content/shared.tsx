"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, formatRelativeTime, personLabel } from "@/app/dashboard/discussions/discussionUi";
import type { AdminGroupContentItem } from "@/lib/groups/types";

export async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.status === 404
        ? "That admin API route is missing. Refresh the page and try again."
        : "The server returned a page instead of data. Refresh and try again."
    );
  }
}

export const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15";

export function normalizeContentItem(item: AdminGroupContentItem): AdminGroupContentItem {
  return { ...item, replies: (item.replies ?? []).map(normalizeContentItem) };
}

export function SeedingBreadcrumb({
  hub,
  group,
}: {
  hub?: { id: string; title: string } | null;
  group?: { title: string } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      <Link
        href="/dashboard/users/seeding-content"
        className={!hub ? "text-blue-300" : "hover:text-zinc-200"}
      >
        Hubs
      </Link>
      {hub && (
        <>
          <span>/</span>
          <Link
            href={`/dashboard/users/seeding-content/${hub.id}`}
            className={!group ? "text-blue-300" : "hover:text-zinc-200"}
          >
            {hub.title}
          </Link>
        </>
      )}
      {group && (
        <>
          <span>/</span>
          <span className="text-blue-300">{group.title}</span>
        </>
      )}
    </div>
  );
}

export type ReplyContext = {
  replyAsLabel: string | null;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onDelete: (commentId: string) => Promise<boolean>;
};

export function ContentPost({
  item,
  isReply = false,
  ctx,
}: {
  item: AdminGroupContentItem;
  isReply?: boolean;
  ctx: ReplyContext;
}) {
  const image = item.image_url ?? item.gif_preview_url;
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function submitReply() {
    const text = replyBody.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const ok = await ctx.onReply(item.id, text);
      if (ok) {
        setReplyBody("");
        setShowReply(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    const replyCount = (item.replies ?? []).length;
    const warning = replyCount > 0
      ? `Delete this post and its ${replyCount} repl${replyCount === 1 ? "y" : "ies"}? This can't be undone.`
      : "Delete this post? This can't be undone.";
    if (!window.confirm(warning)) return;
    setDeleting(true);
    try {
      await ctx.onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={isReply ? "flex gap-3" : "rounded-2xl border border-zinc-800 bg-zinc-900 p-4"}>
      <div className={isReply ? "flex flex-1 gap-3" : "flex gap-3"}>
        <Avatar id={item.id} person={item.author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-zinc-300">{personLabel(item.author)}</span>
            <span className="text-[11px] text-zinc-500">{formatRelativeTime(item.created_at)}</span>
          </div>
          {item.body && <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{item.body}</p>}
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="mt-2 max-h-64 rounded-xl border border-zinc-800 object-cover"
            />
          )}

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowReply((v) => !v)}
              className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
            >
              {showReply ? "Cancel" : "Reply"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>

          {showReply && (
            <div className="mt-2 space-y-2">
              <div className="text-[11px] text-zinc-500">
                {ctx.replyAsLabel ? `Replying as ${ctx.replyAsLabel}` : "Choose a prop account above to reply"}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a reply..."
                  className={`${inputCls} min-h-[38px] flex-1 resize-y`}
                />
                <Button
                  size="sm"
                  className="bg-blue-500 text-zinc-950 hover:bg-blue-400"
                  onClick={submitReply}
                  disabled={submitting || !ctx.replyAsLabel || !replyBody.trim()}
                >
                  {submitting ? "Replying..." : "Reply"}
                </Button>
              </div>
            </div>
          )}

          {(item.replies ?? []).length > 0 && (
            <div className="mt-3 space-y-3 border-l border-zinc-800 pl-4">
              {(item.replies ?? []).map((reply) => (
                <ContentPost key={reply.id} item={reply} isReply ctx={ctx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
