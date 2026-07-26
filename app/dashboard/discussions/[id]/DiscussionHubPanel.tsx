"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DISCUSSION_HUB_TABS, type DiscussionHubTab } from "@/lib/discussions/types";
import { formatDiscussionDate } from "./discussionDetailTypes";
import {
  Avatar,
  EmptyState,
  LoadMoreBar,
  ModerationMenu,
  SectionCard,
  personLabel,
} from "../discussionUi";

const HUB_PAGE_SIZE = 25;

type Props = {
  discussionId: string;
  tab: DiscussionHubTab;
  onActionError: (msg: string | null) => void;
};

const TAB_BLURBS: Record<DiscussionHubTab, string> = {
  feed: "Top-level opinions and replies — hide, pin, or remove violating posts.",
  updates: "Steward check-ins and manual updates shared with members.",
  events: "Meetups linked to this hub’s map area.",
  media: "Photos and GIFs uploaded to the hub.",
  resources: "Links, notes, and documents pinned in the hub.",
  wiki: "Collaborative wiki sections.",
  people: "Participants and appointed moderators.",
  polls: "Active and historical polls — close any that should end early.",
  live_chat: "Messages from live sessions — hide spam without deleting history.",
};

export function DiscussionHubPanel({ discussionId, tab, onActionError }: Props) {
  const [items, setItems] = useState<unknown[]>([]);
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchPage = useCallback(
    (nextOffset: number, mode: "replace" | "append") => {
      if (mode === "replace") {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      return fetch(
        `/api/admin/discussions/${discussionId}/hub?tab=${tab}&limit=${HUB_PAGE_SIZE}&offset=${nextOffset}`,
      )
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || "Failed to load");
          if (tab === "people") {
            setItems((body.participants as unknown[]) ?? []);
            setExtra({ moderators: body.moderators, profiles: body.profiles });
            setHasMore(false);
          } else {
            const batch = (body.items as unknown[]) ?? [];
            setItems((prev) => {
              if (mode === "replace") return batch;
              const ids = new Set((prev as { id?: string }[]).map((r) => String(r.id ?? "")));
              return [...prev, ...batch.filter((r) => !ids.has(String((r as { id?: string }).id ?? "")))];
            });
            setHasMore(batch.length >= HUB_PAGE_SIZE);
            setExtra({});
          }
          setOffset(nextOffset);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [discussionId, tab],
  );

  const load = useCallback(() => {
    void fetchPage(0, "replace");
  }, [fetchPage]);

  function loadMore() {
    if (loadingMore || loading || !hasMore || tab === "people") return;
    void fetchPage(offset + HUB_PAGE_SIZE, "append");
  }

  useEffect(() => {
    setQuery("");
    load();
  }, [load]);

  async function moderateComment(commentId: string, action: string) {
    if (action === "delete" && !confirm("Delete this comment permanently?")) return;
    onActionError(null);
    const res = await fetch(`/api/admin/discussions/${discussionId}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!res.ok) {
      onActionError(body.error || "Failed");
      return;
    }
    load();
  }

  async function deleteItem(itemId: string, kind: string) {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    onActionError(null);
    const res = await fetch(
      `/api/admin/discussions/${discussionId}/items/${itemId}?kind=${kind}`,
      { method: "DELETE" }
    );
    const body = await res.json();
    if (!res.ok) {
      onActionError(body.error || "Failed");
      return;
    }
    load();
  }

  async function closePoll(pollId: string) {
    onActionError(null);
    const res = await fetch(`/api/admin/discussions/${discussionId}/polls/${pollId}/close`, {
      method: "POST",
    });
    const body = await res.json();
    if (!res.ok) {
      onActionError(body.error || "Failed");
      return;
    }
    load();
  }

  async function toggleLiveChatHidden(messageId: string, hidden: boolean) {
    onActionError(null);
    const res = await fetch(
      `/api/admin/discussions/${discussionId}/items/${messageId}?kind=live_chat`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      }
    );
    const body = await res.json();
    if (!res.ok) {
      onActionError(body.error || "Failed");
      return;
    }
    load();
  }

  const filteredItems = useMemo(() => {
    if (!query.trim() || tab === "people") return items;
    const q = query.toLowerCase();
    return (items as Record<string, unknown>[]).filter((row) =>
      JSON.stringify(row).toLowerCase().includes(q)
    );
  }, [items, query, tab]);

  if (loading) {
    return (
      <SectionCard title="Loading…" description={TAB_BLURBS[tab]}>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-800/80" />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-300">{error}</div>;
  }

  const showSearch = tab !== "people" && items.length > 3;

  return (
    <SectionCard
      title={DISCUSSION_HUB_TABS.find((t) => t.id === tab)?.label ?? tab}
      description={TAB_BLURBS[tab]}
    >
      {showSearch && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter loaded items…"
          className="mb-4 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-emerald-500/50"
        />
      )}

      {tab === "feed" && (
        <ItemList
          empty="No feed posts yet."
          items={filteredItems as Record<string, unknown>[]}
          render={(c) => {
            const commentId = String(c.id);
            const hidden = Boolean(c.is_hidden);
            const pinned = Boolean(c.is_pinned);
            return (
              <article
                key={commentId}
                className={`rounded-2xl border p-4 ${
                  hidden ? "border-zinc-800/60 bg-zinc-950/40 opacity-70" : "border-zinc-800 bg-zinc-950"
                }`}
              >
                <div className="flex flex-wrap gap-2">
                  {pinned && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      Pinned
                    </span>
                  )}
                  {hidden && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{String(c.body ?? "")}</p>
                {Boolean(c.image_url || c.gif_preview_url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={String(c.image_url ?? c.gif_preview_url)}
                    alt=""
                    className="mt-3 max-h-48 rounded-xl border border-zinc-800 object-cover"
                  />
                )}
                <p className="mt-3 text-[11px] text-zinc-500">{formatDiscussionDate(String(c.created_at ?? ""))}</p>
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <ModerationMenu
                    actions={[
                      { id: "hide", label: hidden ? "Already hidden" : "Hide", onClick: () => moderateComment(commentId, "hide") },
                      { id: "unhide", label: "Unhide", onClick: () => moderateComment(commentId, "unhide") },
                      { id: "pin", label: pinned ? "Pinned" : "Pin", onClick: () => moderateComment(commentId, "pin") },
                      { id: "unpin", label: "Unpin", onClick: () => moderateComment(commentId, "unpin") },
                      { id: "delete", label: "Delete", tone: "danger", onClick: () => moderateComment(commentId, "delete") },
                    ]}
                  />
                </div>
              </article>
            );
          }}
        />
      )}

      {tab === "people" && <PeopleTab items={items} extra={extra} />}

      {tab === "polls" && (
        <ItemList
          empty="No polls yet."
          items={filteredItems as Record<string, unknown>[]}
          render={(poll) => {
            const pollId = String(poll.id ?? "");
            return (
              <div key={pollId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="font-medium text-zinc-100">{String(poll.question ?? "")}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatDiscussionDate(String(poll.created_at ?? ""))}</p>
                <div className="mt-3">
                  <ModerationMenu actions={[{ id: "close", label: "Close poll", onClick: () => closePoll(pollId) }]} />
                </div>
              </div>
            );
          }}
        />
      )}

      {tab === "live_chat" && (
        <ItemList
          empty="No live chat messages."
          items={filteredItems as Record<string, unknown>[]}
          render={(m) => {
            const messageId = String(m.id);
            const hidden = Boolean(m.is_hidden);
            return (
              <div key={messageId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-sm text-zinc-300">{String(m.body ?? "")}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {formatDiscussionDate(String(m.created_at ?? ""))}
                  {hidden ? " · hidden" : ""}
                </p>
                <div className="mt-3">
                  <ModerationMenu
                    actions={[
                      {
                        id: "toggle",
                        label: hidden ? "Unhide message" : "Hide message",
                        onClick: () => toggleLiveChatHidden(messageId, !hidden),
                      },
                    ]}
                  />
                </div>
              </div>
            );
          }}
        />
      )}

      {!["feed", "people", "polls", "live_chat"].includes(tab) && (
        <GenericTab tab={tab} items={filteredItems as Record<string, unknown>[]} onDelete={deleteItem} />
      )}

      {tab !== "people" && (
        <LoadMoreBar
          shown={items.length}
          loading={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      )}
    </SectionCard>
  );
}
function ItemList<T>({
  items,
  render,
  empty,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  empty: string;
}) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return <div className="space-y-3">{items.map((item) => render(item))}</div>;
}

function PeopleTab({ items, extra }: { items: unknown[]; extra: Record<string, unknown> }) {
  const profiles = (extra.profiles as { id: string; full_name: string | null; username: string | null }[]) ?? [];
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const participants = items as { user_id: string; first_engaged_at: string }[];
  const moderators = (extra.moderators as { user_id: string; created_at: string }[]) ?? [];

  if (participants.length === 0 && moderators.length === 0) {
    return <EmptyState title="No participants yet" hint="People appear here after they engage with the hub." />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Participants ({participants.length})</p>
        <ul className="mt-3 space-y-2">
          {participants.map((p) => {
            const prof = profileMap.get(p.user_id);
            return (
              <li key={p.user_id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <Avatar id={p.user_id} person={prof ?? null} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {personLabel(prof ?? null)}
                  </p>
                  <p className="text-[11px] text-zinc-500">Joined {formatDiscussionDate(p.first_engaged_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Moderators ({moderators.length})</p>
        <ul className="mt-3 space-y-2">
          {moderators.length === 0 ? (
            <li className="text-sm text-zinc-500">Steward only</li>
          ) : (
            moderators.map((m) => {
              const prof = profileMap.get(m.user_id);
              return (
                <li key={m.user_id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <Avatar id={m.user_id} person={prof ?? null} size="sm" />
                  <p className="text-sm text-zinc-200">{personLabel(prof ?? null)}</p>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function GenericTab({
  tab,
  items,
  onDelete,
}: {
  tab: DiscussionHubTab;
  items: Record<string, unknown>[];
  onDelete: (id: string, kind: string) => void;
}) {
  const kindByTab: Partial<Record<DiscussionHubTab, string>> = {
    updates: "update",
    media: "media",
    resources: "resource",
    wiki: "wiki",
    events: "event",
  };
  const deleteKind = kindByTab[tab];

  if (items.length === 0) {
    return <EmptyState title="Nothing here yet" />;
  }

  return (
    <div className="space-y-3">
      {items.map((row) => {
        const rowId = String(row.id ?? Math.random());
        const title = row.title ?? row.name ?? row.question ?? row.body ?? row.media_url ?? rowId;
        return (
          <div key={rowId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="line-clamp-4 text-sm leading-relaxed text-zinc-300">{String(title)}</p>
            {row.created_at != null && (
              <p className="mt-2 text-[11px] text-zinc-500">{formatDiscussionDate(String(row.created_at))}</p>
            )}
            {deleteKind && (
              <div className="mt-3">
                <ModerationMenu
                  actions={[
                    { id: "del", label: "Delete", tone: "danger", onClick: () => onDelete(rowId, deleteKind) },
                  ]}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
