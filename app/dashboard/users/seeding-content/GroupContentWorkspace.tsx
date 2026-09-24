"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Folder, ImagePlus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/app/dashboard/discussions/discussionUi";
import { generateProAccount, listProAccounts, updateProAccount, type ProAccountStub } from "../actions";
import type { AdminPropFolder } from "@/lib/groups/propFolders";
import type { AdminGroupContentItem } from "@/lib/groups/types";
import { ContentPost, inputCls, normalizeContentItem, readApiJson } from "./shared";

/**
 * Prop-account posting + content feed for a single group. Shared between the
 * hub-first seeding flow (/dashboard/users/seeding-content/[hubId]/[groupId])
 * and the groups-first flow (/dashboard/groups/[groupId]). Member seeding sits
 * above this component in both places.
 */
export function GroupContentWorkspace({ groupId }: { groupId: string }) {
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState<AdminGroupContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(true);

  const [proAccounts, setProAccounts] = useState<ProAccountStub[]>([]);
  const [folders, setFolders] = useState<AdminPropFolder[]>([]);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountFullName, setAccountFullName] = useState("Pro Creator Test");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountBio, setAccountBio] = useState("");
  const [accountAvatarFile, setAccountAvatarFile] = useState<File | null>(null);
  const [accountAvatarPreview, setAccountAvatarPreview] = useState<string | null>(null);

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/content`);
      const payload = await readApiJson<{ items?: AdminGroupContentItem[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load group content");
      setContent((payload.items ?? []).map(normalizeContentItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group content");
    } finally {
      setContentLoading(false);
    }
  }, [groupId]);

  const loadProAccounts = useCallback(async () => {
    try {
      const accounts = await listProAccounts();
      setProAccounts(accounts);
      setSelectedAccountId((current) => current || accounts[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prop accounts");
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/folders`);
      const payload = await readApiJson<{ folders?: AdminPropFolder[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load folders");
      setFolders(payload.folders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load folders");
    }
  }, [groupId]);

  useEffect(() => {
    loadContent();
    loadProAccounts();
    loadFolders();
  }, [loadContent, loadProAccounts, loadFolders]);

  useEffect(() => {
    if (openFolderId && !folders.some((folder) => folder.id === openFolderId)) {
      setOpenFolderId(null);
    }
  }, [folders, openFolderId]);

  useEffect(() => {
    return () => {
      if (postImagePreview?.startsWith("blob:")) URL.revokeObjectURL(postImagePreview);
    };
  }, [postImagePreview]);

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

  function handlePostImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    setPostImageFile(file);
    setPostImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function clearPostImage() {
    setPostImageFile(null);
    setPostImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function handlePublish() {
    if (!selectedAccountId) {
      setError("Choose (or create) a prop account to post as.");
      return;
    }
    const body = postBody.trim();
    if (!body && !postImageFile) {
      setError("Write a post or attach a photo.");
      return;
    }

    setPosting(true);
    setError(null);
    try {
      let res: Response;
      if (postImageFile) {
        const formData = new FormData();
        formData.set("accountId", selectedAccountId);
        formData.set("body", body);
        formData.set("image", postImageFile);
        res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/content`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: selectedAccountId, body }),
        });
      }
      const payload = await readApiJson<{ item?: AdminGroupContentItem; error?: string }>(res);
      if (!res.ok || !payload.item) throw new Error(payload.error ?? "Failed to publish content");
      setContent((prev) => [normalizeContentItem(payload.item as AdminGroupContentItem), ...prev]);
      setPostBody("");
      clearPostImage();
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
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/${encodeURIComponent(groupId)}/content/${encodeURIComponent(commentId)}`,
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
    if (!selectedAccountId) {
      setError("Choose (or create) a prop account to post as.");
      return false;
    }
    const text = body.trim();
    if (!text) return false;

    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId, body: text, parentId }),
      });
      const payload = await readApiJson<{ item?: AdminGroupContentItem; error?: string }>(res);
      if (!res.ok || !payload.item) throw new Error(payload.error ?? "Failed to publish reply");
      // A reply to a reply is stored on the comment, matching the app, so the
      // returned parent_id can differ from the row we clicked. Insert there.
      const created = normalizeContentItem(payload.item as AdminGroupContentItem);
      setContent((prev) => insertReply(prev, created.parent_id ?? parentId, created));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish reply");
      return false;
    }
  }

  const selectedAccountLabel = proAccounts.find((a) => a.id === selectedAccountId)?.username ?? null;
  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
  const visibleAccounts = useMemo(() => {
    if (openFolder) {
      const inside = new Set(openFolder.userIds);
      return proAccounts.filter((account) => inside.has(account.id));
    }
    const filed = new Set(folders.flatMap((folder) => folder.userIds));
    return proAccounts.filter((account) => !filed.has(account.id));
  }, [proAccounts, folders, openFolder]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {(folders.length > 0 || proAccounts.length > 0) && (
        <div className="space-y-2">
          {openFolder ? (
            <button
              type="button"
              onClick={() => setOpenFolderId(null)}
              className="flex items-center gap-1 text-sm font-semibold text-zinc-200"
            >
              <ChevronLeft className="h-4 w-4 text-blue-300" />
              <span className="text-blue-300">Folders</span>
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
              <span className="truncate">{openFolder.name}</span>
            </button>
          ) : folders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {folders.map((folder) => {
                const count = folder.userIds.filter((id) => proAccounts.some((account) => account.id === id)).length;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setOpenFolderId(folder.id)}
                    className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left transition hover:border-zinc-600"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-blue-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-zinc-100">{folder.name}</span>
                      <span className="text-[10px] text-zinc-500">
                        {count} account{count === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {visibleAccounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleAccounts.map((account) => (
                <div
                  key={account.id}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1.5 transition ${
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
                    className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-blue-300"
                    title="Edit account"
                    aria-label={`Edit @${account.username ?? "account"}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : openFolder ? (
            <p className="text-xs text-zinc-500">Nothing in this folder yet.</p>
          ) : null}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">New post</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Publishes into this group as the account you pick.</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="border-zinc-700 text-zinc-100"
            onClick={() => (showAccountForm ? closeAccountForm() : openCreateAccount())}
          >
            {showAccountForm ? "Cancel" : "New prop account"}
          </Button>
        </div>

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
              placeholder="Write a group post, or attach a photo..."
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-blue-200">
              <ImagePlus className="h-3.5 w-3.5" />
              {postImageFile ? "Change photo" : "Attach photo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePostImageChange} />
            </label>
            {postImageFile && (
              <span className="truncate text-[11px] text-zinc-500">{postImageFile.name}</span>
            )}
          </div>
          {postImagePreview && (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={postImagePreview}
                alt="Attachment preview"
                className="max-h-48 rounded-xl border border-zinc-800 object-cover"
              />
              <button
                type="button"
                onClick={clearPostImage}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 hover:bg-zinc-900"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-50">Posts</h2>
          <p className="text-[11px] text-zinc-500">
            {contentLoading ? "Loading..." : `${content.length} post${content.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {contentLoading ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">Loading posts...</div>
        ) : content.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">No posts in this group yet.</div>
        ) : (
          <div className="space-y-3 p-3">
            {content.map((item) => (
              <ContentPost
                key={item.id}
                item={item}
                ctx={{
                  replyAsLabel: selectedAccountLabel ? `@${selectedAccountLabel}` : null,
                  onReply: handleReply,
                  onDelete: handleDelete,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
