"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, formatRelativeTime, personLabel } from "@/app/dashboard/discussions/discussionUi";
import { generateProAccount, listProAccounts, updateProAccount, type ProAccountStub } from "./actions";
import type { AdminGroupContentItem, AdminGroupListItem } from "@/lib/groups/types";
import { groupCategoryLabel } from "@/lib/groups/types";
import type { SeededHubListItem } from "@/lib/seeded-hubs/types";

type View = "hubs" | "groups" | "group";

async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
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

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15";

function normalizeContentItem(item: AdminGroupContentItem): AdminGroupContentItem {
  return { ...item, replies: (item.replies ?? []).map(normalizeContentItem) };
}

type ReplyContext = {
  replyAsLabel: string | null;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onDelete: (commentId: string) => Promise<boolean>;
};

function ContentPost({
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

export function SeedingContentView() {
  const [view, setView] = useState<View>("hubs");
  const [error, setError] = useState<string | null>(null);

  const [hubs, setHubs] = useState<SeededHubListItem[]>([]);
  const [hubsLoading, setHubsLoading] = useState(true);
  const [hubSearch, setHubSearch] = useState("");
  const [hubSort, setHubSort] = useState<"popularity" | "name">("popularity");
  const [selectedHub, setSelectedHub] = useState<SeededHubListItem | null>(null);

  const [groups, setGroups] = useState<AdminGroupListItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AdminGroupListItem | null>(null);

  const [content, setContent] = useState<AdminGroupContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const [proAccounts, setProAccounts] = useState<ProAccountStub[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountFullName, setAccountFullName] = useState("Pro Creator Test");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountBio, setAccountBio] = useState("");
  const [accountAvatarFile, setAccountAvatarFile] = useState<File | null>(null);
  const [accountAvatarPreview, setAccountAvatarPreview] = useState<string | null>(null);

  const loadHubs = useCallback(async (search: string) => {
    setHubsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/seeded-hubs?${params.toString()}`);
      const payload = await readApiJson<{ hubs?: SeededHubListItem[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load seeded hubs");
      setHubs(payload.hubs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load seeded hubs");
    } finally {
      setHubsLoading(false);
    }
  }, []);

  const loadProAccounts = useCallback(async () => {
    try {
      const accounts = await listProAccounts();
      setProAccounts(accounts);
      setSelectedAccountId((current) => current || accounts[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prop accounts");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHubs("");
      loadProAccounts();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadHubs, loadProAccounts]);

  async function openHub(hub: SeededHubListItem) {
    setSelectedHub(hub);
    setSelectedGroup(null);
    setView("groups");
    setGroupsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups?hubId=${encodeURIComponent(hub.id)}&pageSize=100`);
      const payload = await readApiJson<{ groups?: AdminGroupListItem[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load groups");
      setGroups(payload.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setGroupsLoading(false);
    }
  }

  async function openGroup(group: AdminGroupListItem) {
    setSelectedGroup(group);
    setView("group");
    setContentLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(group.id)}/content`);
      const payload = await readApiJson<{ items?: AdminGroupContentItem[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load group content");
      setContent((payload.items ?? []).map(normalizeContentItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group content");
    } finally {
      setContentLoading(false);
    }
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setAccountAvatarFile(file);
    setAccountAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function resetAccountForm() {
    setAccountFullName("Pro Creator Test");
    setAccountUsername("");
    setAccountBio("");
    setAccountAvatarFile(null);
    setAccountAvatarPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function openCreateAccount() {
    setFormMode("create");
    setEditingAccountId(null);
    resetAccountForm();
    setShowAccountForm(true);
  }

  function openEditAccount(account: ProAccountStub) {
    setFormMode("edit");
    setEditingAccountId(account.id);
    setAccountFullName(account.fullName ?? "");
    setAccountUsername(account.username ?? "");
    setAccountBio(account.bio ?? "");
    setAccountAvatarFile(null);
    setAccountAvatarPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return account.avatarUrl;
    });
    setShowAccountForm(true);
  }

  function closeAccountForm() {
    setShowAccountForm(false);
    setFormMode("create");
    setEditingAccountId(null);
    resetAccountForm();
  }

  async function handleSaveAccount() {
    setCreatingAccount(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("full_name", accountFullName);
      formData.set("username", accountUsername);
      formData.set("bio", accountBio);
      formData.set("account_role", "creator");
      if (accountAvatarFile) formData.set("avatar", accountAvatarFile);

      if (formMode === "edit" && editingAccountId) {
        const result = await updateProAccount(editingAccountId, formData);
        setProAccounts((prev) => prev.map((a) => (a.id === result.id ? result : a)));
      } else {
        const result = await generateProAccount(formData);
        const stub: ProAccountStub = {
          id: result.userId,
          username: result.username,
          fullName: result.fullName,
          email: result.email,
          avatarUrl: result.avatarUrl,
          bio: result.bio,
        };
        setProAccounts((prev) => [stub, ...prev]);
        setSelectedAccountId(stub.id);
      }
      closeAccountForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the prop account");
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handlePublish() {
    if (!selectedGroup) return;
    if (!selectedAccountId) {
      setError("Choose (or create) a prop account to post as.");
      return;
    }
    const body = postBody.trim();
    if (!body) {
      setError("Write a post body first.");
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(selectedGroup.id)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId, body }),
      });
      const payload = await readApiJson<{ item?: AdminGroupContentItem; error?: string }>(res);
      if (!res.ok || !payload.item) throw new Error(payload.error ?? "Failed to publish content");
      setContent((prev) => [normalizeContentItem(payload.item as AdminGroupContentItem), ...prev]);
      setPostBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish content");
    } finally {
      setPosting(false);
    }
  }

  function removeContentItem(items: AdminGroupContentItem[], targetId: string): AdminGroupContentItem[] {
    return items
      .filter((item) => item.id !== targetId)
      .map((item) =>
        (item.replies ?? []).length > 0 ? { ...item, replies: removeContentItem(item.replies, targetId) } : item
      );
  }

  async function handleDelete(commentId: string): Promise<boolean> {
    if (!selectedGroup) return false;
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/${encodeURIComponent(selectedGroup.id)}/content/${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      const payload = await readApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete post");
      setContent((prev) => removeContentItem(prev, commentId));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete post");
      return false;
    }
  }

  function insertReply(
    items: AdminGroupContentItem[],
    parentId: string,
    reply: AdminGroupContentItem
  ): AdminGroupContentItem[] {
    return items.map((item) => {
      if (item.id === parentId) {
        return { ...item, replies: [...(item.replies ?? []), reply] };
      }
      if ((item.replies ?? []).length > 0) {
        return { ...item, replies: insertReply(item.replies, parentId, reply) };
      }
      return item;
    });
  }

  async function handleReply(parentId: string, body: string): Promise<boolean> {
    if (!selectedGroup) return false;
    if (!selectedAccountId) {
      setError("Choose (or create) a prop account to post as.");
      return false;
    }
    const text = body.trim();
    if (!text) return false;

    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(selectedGroup.id)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId, body: text, parentId }),
      });
      const payload = await readApiJson<{ item?: AdminGroupContentItem; error?: string }>(res);
      if (!res.ok || !payload.item) throw new Error(payload.error ?? "Failed to publish reply");
      // The RPC flattens reply-to-a-reply onto the top-level comment (matching
      // the app), so the returned item's parent_id may differ from the parentId
      // we clicked "Reply" on — insert at the server-resolved location.
      const created = normalizeContentItem(payload.item as AdminGroupContentItem);
      setContent((prev) => insertReply(prev, created.parent_id ?? parentId, created));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish reply");
      return false;
    }
  }

  const sortedHubs = useMemo(() => {
    const list = [...hubs];
    if (hubSort === "popularity") {
      list.sort((a, b) => b.group_count - a.group_count || a.title.localeCompare(b.title));
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [hubs, hubSort]);

  const selectedAccountLabel = proAccounts.find((a) => a.id === selectedAccountId)?.username ?? null;

  return (
    <div className="grid gap-4">
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-semibold text-zinc-50">Seeding content</CardTitle>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Browse seeded hubs and groups, then publish content into a group from a prop account.
              </p>
            </div>
            <Badge variant="outline" className="border-blue-500/40 text-blue-300">
              Testing
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <button
              type="button"
              onClick={() => setView("hubs")}
              className={view === "hubs" ? "text-blue-300" : "hover:text-zinc-200"}
            >
              Hubs
            </button>
            {selectedHub && (
              <>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => setView("groups")}
                  className={view === "groups" ? "text-blue-300" : "hover:text-zinc-200"}
                >
                  {selectedHub.title}
                </button>
              </>
            )}
            {selectedGroup && (
              <>
                <span>/</span>
                <span className={view === "group" ? "text-blue-300" : ""}>{selectedGroup.title}</span>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {view === "hubs" && (
            <div className="space-y-3">
              <input
                value={hubSearch}
                onChange={(e) => setHubSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadHubs(hubSearch);
                }}
                placeholder="Search seeded hubs by name or location..."
                className={inputCls}
              />
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <span>Sort by</span>
                <button
                  type="button"
                  onClick={() => setHubSort("popularity")}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    hubSort === "popularity"
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  Most groups
                </button>
                <button
                  type="button"
                  onClick={() => setHubSort("name")}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    hubSort === "name"
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  Name (A–Z)
                </button>
              </div>
              {hubsLoading ? (
                <div className="p-6 text-center text-sm text-zinc-500">Loading hubs...</div>
              ) : hubs.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-500">No seeded hubs found.</div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {sortedHubs.map((hub) => (
                    <button
                      key={hub.id}
                      type="button"
                      onClick={() => openHub(hub)}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-blue-500/40 hover:bg-zinc-900/70"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-100">{hub.title}</div>
                        <div className="truncate text-xs text-zinc-500">{hub.location_hint ?? "No location"}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-zinc-700 text-zinc-300">
                        {hub.group_count} group{hub.group_count === 1 ? "" : "s"}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "groups" && selectedHub && (
            <div className="space-y-3">
              {groupsLoading ? (
                <div className="p-6 text-center text-sm text-zinc-500">Loading groups...</div>
              ) : groups.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-500">This hub has no groups yet.</div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => openGroup(group)}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-blue-500/40 hover:bg-zinc-900/70"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-100">{group.title}</div>
                        <div className="truncate text-xs text-zinc-500">
                          {groupCategoryLabel(group.category)} · {group.member_count} member
                          {group.member_count === 1 ? "" : "s"}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-zinc-700 text-zinc-300">
                        {group.post_count} post{group.post_count === 1 ? "" : "s"}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "group" && selectedGroup && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-200">Publish as a prop account</div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-zinc-700 text-zinc-100"
                    onClick={() => (showAccountForm ? closeAccountForm() : openCreateAccount())}
                  >
                    {showAccountForm ? "Cancel" : "+ New prop account"}
                  </Button>
                </div>

                {proAccounts.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {proAccounts.map((account) => (
                      <div
                        key={account.id}
                        className={`flex items-center gap-1.5 rounded-xl border py-1 pl-1.5 pr-2 transition ${
                          selectedAccountId === account.id
                            ? "border-blue-500/50 bg-blue-500/10"
                            : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedAccountId(account.id)}
                          className="flex items-center gap-2"
                          title={account.fullName ?? undefined}
                        >
                          {account.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={account.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                          ) : (
                            <Avatar id={account.id} person={{ full_name: account.fullName, username: account.username }} size="sm" />
                          )}
                          <span className="text-xs font-medium text-zinc-200">
                            @{account.username ?? account.id.slice(0, 8)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditAccount(account)}
                          className="text-zinc-500 hover:text-blue-300"
                          title="Edit account"
                          aria-label="Edit account"
                        >
                          ✎
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showAccountForm && (
                  <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-[80px_1fr]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900">
                        {accountAvatarPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={accountAvatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-600">
                            No avatar
                          </div>
                        )}
                      </div>
                      <label className="cursor-pointer text-[11px] font-semibold text-blue-300 hover:text-blue-200">
                        {accountAvatarFile ? "Change" : "Upload"}
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
                      </label>
                    </div>
                    <div className="grid gap-2">
                      <input
                        value={accountFullName}
                        onChange={(e) => setAccountFullName(e.target.value)}
                        placeholder="Full name"
                        className={inputCls}
                      />
                      <input
                        value={accountUsername}
                        onChange={(e) => setAccountUsername(e.target.value)}
                        placeholder="Username (leave empty to auto-generate)"
                        className={inputCls}
                      />
                      <textarea
                        value={accountBio}
                        onChange={(e) => setAccountBio(e.target.value)}
                        placeholder="Bio"
                        className={`${inputCls} min-h-[60px] resize-y`}
                      />
                      <Button
                        className="bg-blue-500 text-zinc-950 hover:bg-blue-400"
                        onClick={handleSaveAccount}
                        disabled={creatingAccount}
                      >
                        {creatingAccount
                          ? formMode === "edit"
                            ? "Saving..."
                            : "Creating..."
                          : formMode === "edit"
                            ? "Save changes"
                            : "Create prop account"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid gap-3">
                  <div className="flex gap-2">
                    <textarea
                      value={postBody}
                      onChange={(e) => setPostBody(e.target.value)}
                      placeholder="Write a group post..."
                      className={`${inputCls} min-h-[42px] flex-1 resize-y`}
                    />
                    <Button
                      className="bg-blue-500 text-zinc-950 hover:bg-blue-400"
                      onClick={handlePublish}
                      disabled={posting || !selectedAccountId}
                    >
                      {posting ? "Publishing..." : "Publish"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {contentLoading ? (
                  <div className="p-6 text-center text-sm text-zinc-500">Loading content...</div>
                ) : content.length === 0 ? (
                  <div className="p-6 text-center text-sm text-zinc-500">No content in this group yet.</div>
                ) : (
                  content.map((item) => (
                    <ContentPost
                      key={item.id}
                      item={item}
                      ctx={{
                        replyAsLabel: selectedAccountLabel ? `@${selectedAccountLabel}` : null,
                        onReply: handleReply,
                        onDelete: handleDelete,
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
