"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, personLabel } from "@/app/dashboard/discussions/discussionUi";
import { generateProAccount, listProAccounts, type ProAccountStub } from "@/app/dashboard/users/actions";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import { SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";
import type { AdminPropFolder } from "@/lib/groups/propFolders";
import type { AdminGroupMember } from "@/lib/groups/types";

function PropPill() {
  return (
    <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200 ring-1 ring-blue-500/25">
      Prop
    </span>
  );
}

const fieldCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50";

const FAKE_FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery",
  "Quinn", "Sydney", "Reese", "Cameron", "Drew", "Skyler", "Rowan", "Emerson",
  "Hayden", "Parker", "Blake", "Dakota",
];
const FAKE_LAST_NAMES = [
  "Smith", "Johnson", "Lee", "Brown", "Garcia", "Martinez", "Davis", "Rodriguez",
  "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White", "Harris",
  "Clark", "Lewis", "Young", "Walker",
];

function randomFakeName(): string {
  const first = FAKE_FIRST_NAMES[Math.floor(Math.random() * FAKE_FIRST_NAMES.length)];
  const last = FAKE_LAST_NAMES[Math.floor(Math.random() * FAKE_LAST_NAMES.length)];
  return `${first} ${last}`;
}

function accountLabel(account: ProAccountStub): string {
  const handle = account.username ? `@${account.username}` : account.id.slice(0, 8);
  return account.fullName ? `${handle} — ${account.fullName}` : handle;
}

type PoolSort = "newest" | "oldest" | "name";
type PoolScope = "all" | "out" | "in";

const POOL_SORTS: { id: PoolSort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "name", label: "Name" },
];

const POOL_SCOPES: { id: PoolScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "out", label: "Not in group" },
  { id: "in", label: "In group" },
];

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/30"
          : "bg-zinc-950 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function cardName(member: AdminGroupMember): string {
  const fullName = member.profile?.full_name?.trim();
  if (fullName) return fullName;
  if (member.profile?.username) return `@${member.profile.username}`;
  return personLabel(member.profile);
}

export type GroupOpsSection = "members" | "props" | "organize";

export function MembersPanel({
  groupId,
  section = "members",
}: {
  groupId: string;
  section?: GroupOpsSection;
}) {
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminGroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [proAccounts, setProAccounts] = useState<ProAccountStub[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [poolSort, setPoolSort] = useState<PoolSort>("newest");
  const [poolScope, setPoolScope] = useState<PoolScope>("all");
  const [poolExpanded, setPoolExpanded] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [fakeCount, setFakeCount] = useState(5);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState<{ done: number; total: number } | null>(null);
  const [folders, setFolders] = useState<AdminPropFolder[]>([]);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [destinationFolderId, setDestinationFolderId] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [folderBusyId, setFolderBusyId] = useState<string | null>(null);
  const [movingUserId, setMovingUserId] = useState<string | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`);
      const payload = await readApiJson<{ members?: AdminGroupMember[]; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load members");
      setMembers(payload.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, [groupId]);

  const loadProAccounts = useCallback(async () => {
    try {
      const accounts = await listProAccounts();
      setProAccounts(accounts);
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
    loadMembers();
    loadProAccounts();
    loadFolders();
  }, [loadMembers, loadProAccounts, loadFolders]);

  useEffect(() => {
    if (openFolderId && !folders.some((folder) => folder.id === openFolderId)) {
      setOpenFolderId(null);
    }
  }, [folders, openFolderId]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

  const propPool = useMemo(
    () => proAccounts.filter((account) => account.email?.toLowerCase() !== SYSTEM_GROUP_OWNER_EMAIL),
    [proAccounts],
  );

  const availableToAdd = useMemo(
    () => propPool.filter((account) => !memberIds.has(account.id)),
    [propPool, memberIds],
  );

  const filteredPool = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    let list = propPool;
    if (poolScope === "out") list = list.filter((account) => !memberIds.has(account.id));
    if (poolScope === "in") list = list.filter((account) => memberIds.has(account.id));
    if (term) {
      list = list.filter((account) => {
        const haystack = `${account.username ?? ""} ${account.fullName ?? ""} ${account.email ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
    }
    return [...list].sort((a, b) => {
      if (poolSort === "name") {
        const an = (a.fullName || a.username || a.email || "").toLowerCase();
        const bn = (b.fullName || b.username || b.email || "").toLowerCase();
        return an.localeCompare(bn);
      }
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return poolSort === "oldest" ? at - bt : bt - at;
    });
  }, [propPool, memberSearch, memberIds, poolScope, poolSort]);

  useEffect(() => {
    const allowed = new Set(availableToAdd.map((a) => a.id));
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [availableToAdd]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function toggleSelectVisible() {
    const visibleIds = filteredPool.filter((account) => !memberIds.has(account.id)).map((a) => a.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      const hide = new Set(visibleIds);
      setSelectedIds((prev) => prev.filter((id) => !hide.has(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
  }

  async function assignToFolder(userIds: string[], folderId: string | null) {
    const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/folders/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds, folderId }),
    });
    const payload = await readApiJson<{ ok?: boolean; error?: string }>(res);
    if (!res.ok) throw new Error(payload.error ?? "Failed to move accounts");
    await loadFolders();
  }

  async function handleCreateFolder() {
    const name = folderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await readApiJson<{ folder?: AdminPropFolder; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to create folder");
      setFolderName("");
      await loadFolders();
      if (payload.folder) setDestinationFolderId(payload.folder.id);
      toast.success(`Created folder "${payload.folder?.name ?? name}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleRenameFolder(folderId: string) {
    const name = renameValue.trim();
    if (!name) return;
    setFolderBusyId(folderId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/${encodeURIComponent(groupId)}/folders/${encodeURIComponent(folderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to rename folder");
      setRenamingId(null);
      await loadFolders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename folder");
    } finally {
      setFolderBusyId(null);
    }
  }

  async function handleDeleteFolder(folderId: string) {
    setFolderBusyId(folderId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/${encodeURIComponent(groupId)}/folders/${encodeURIComponent(folderId)}`,
        { method: "DELETE" },
      );
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete folder");
      if (destinationFolderId === folderId) setDestinationFolderId("");
      setOpenFolderId((current) => (current === folderId ? null : current));
      await loadFolders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete folder");
    } finally {
      setFolderBusyId(null);
    }
  }

  async function handleMoveMember(userId: string, folderId: string) {
    setMovingUserId(userId);
    setError(null);
    const nextFolder = folderId || null;
    setFolders((prev) =>
      prev.map((folder) => {
        const without = folder.userIds.filter((id) => id !== userId);
        if (nextFolder && folder.id === nextFolder) return { ...folder, userIds: [...without, userId] };
        return { ...folder, userIds: without };
      }),
    );
    try {
      await assignToFolder([userId], nextFolder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move account");
      await loadFolders();
    } finally {
      setMovingUserId(null);
    }
  }

  async function handleAddSelected() {
    if (selectedIds.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      const payload = await readApiJson<{ ok?: boolean; added?: number; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to add members");
      const added = payload.added ?? selectedIds.length;
      const placedIds = [...selectedIds];
      if (destinationFolderId) {
        await assignToFolder(placedIds, destinationFolderId);
      }
      setSelectedIds([]);
      await loadMembers();
      toast.success(`Added ${added} prop account${added === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add members");
    } finally {
      setAdding(false);
    }
  }

  async function handleSeedFakeMembers() {
    const count = Math.min(50, Math.max(1, Math.round(fakeCount) || 1));
    setSeeding(true);
    setError(null);
    setSeedProgress({ done: 0, total: count });
    let added = 0;
    const addedIds: string[] = [];
    const failures: string[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const formData = new FormData();
        formData.set("full_name", randomFakeName());
        formData.set("bio", "Seeded member for testing.");
        formData.set("account_role", "creator");
        const account = await generateProAccount(formData);

        const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: account.userId }),
        });
        const payload = await readApiJson<{ ok?: boolean; error?: string }>(res);
        if (!res.ok) throw new Error(payload.error ?? "Failed to add member");
        added += 1;
        addedIds.push(account.userId);
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "Failed to seed a member");
      }
      setSeedProgress({ done: i + 1, total: count });
    }
    if (destinationFolderId && addedIds.length) {
      await assignToFolder(addedIds, destinationFolderId);
    }
    await Promise.all([loadMembers(), loadProAccounts()]);
    setSeeding(false);
    setSeedProgress(null);
    if (added) toast.success(`Generated and added ${added} prop account${added === 1 ? "" : "s"}`);
    if (failures.length) toast.error(`${failures.length} failed: ${failures[0]}`);
  }

  async function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      const payload = await readApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  const selectableVisible = filteredPool.filter((account) => !memberIds.has(account.id));
  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((account) => selectedIds.includes(account.id));

  const propMembers = members.filter((member) => member.is_prop_account);
  const folderByUser = new Map<string, string>();
  for (const folder of folders) {
    for (const userId of folder.userIds) folderByUser.set(userId, folder.id);
  }
  const unfiledProps = propMembers.filter((member) => !folderByUser.has(member.user_id));

  function folderSelect(member: AdminGroupMember) {
    return (
      <select
        value={folderByUser.get(member.user_id) ?? ""}
        disabled={movingUserId === member.user_id}
        onChange={(e) => void handleMoveMember(member.user_id, e.target.value)}
        className="max-w-[10rem] rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500/50"
        aria-label={`Folder for ${personLabel(member.profile)}`}
      >
        <option value="">Unfiled</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    );
  }

  function memberRow(member: AdminGroupMember, opts?: { folder?: boolean; remove?: boolean }) {
    const showFolder = opts?.folder ?? false;
    const showRemove = opts?.remove ?? true;
    const folderName = folders.find((folder) => folder.id === folderByUser.get(member.user_id))?.name;
    return (
      <div
        key={member.user_id}
        className="flex items-center justify-between gap-3 px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar id={member.user_id} person={member.profile} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-zinc-100">{personLabel(member.profile)}</span>
              {member.is_prop_account && <PropPill />}
            </div>
            <span className="text-[11px] capitalize text-zinc-500">
              {member.role}
              {folderName ? ` Â· ${folderName}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showFolder && member.is_prop_account ? folderSelect(member) : null}
          {showRemove ? (
            <button
              type="button"
              onClick={() => handleRemoveMember(member.user_id)}
              disabled={removingId === member.user_id}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              {removingId === member.user_id ? "Removing..." : "Remove"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const rosterTerm = rosterSearch.trim().toLowerCase();
  const roster = rosterTerm
    ? members.filter((member) => personLabel(member.profile).toLowerCase().includes(rosterTerm))
    : members;

  function destinationSelect() {
    if (folders.length === 0) return null;
    return (
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] font-medium text-zinc-400">
        Folder
        <select
          value={destinationFolderId}
          onChange={(e) => setDestinationFolderId(e.target.value)}
          disabled={seeding}
          className={fieldCls}
        >
          <option value="">Leave unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const errorBanner = error ? (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
      {error}
    </div>
  ) : null;

  if (section === "props") {
    return (
      <div className="space-y-4">
        {errorBanner}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${poolExpanded ? "lg:col-span-2" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-50">From the pool</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Every prop account. Ones already in this group stay listed.
                </p>
              </div>
              <button
                type="button"
                onClick={loadProAccounts}
                className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
              >
                Refresh
              </button>
            </div>
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search username or name"
              className={`${fieldCls} mt-3`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {POOL_SORTS.map((option) => (
                <FilterChip
                  key={option.id}
                  active={poolSort === option.id}
                  onClick={() => setPoolSort(option.id)}
                >
                  {option.label}
                </FilterChip>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-zinc-800 sm:block" aria-hidden />
              {POOL_SCOPES.map((option) => (
                <FilterChip
                  key={option.id}
                  active={poolScope === option.id}
                  onClick={() => setPoolScope(option.id)}
                >
                  {option.label}
                </FilterChip>
              ))}
            </div>
            {propPool.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No prop accounts yet.</p>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleSelectVisible}
                      disabled={selectableVisible.length === 0}
                      className="text-[11px] font-semibold text-blue-300 hover:text-blue-200 disabled:opacity-40"
                    >
                      {allVisibleSelected ? "Clear visible" : "Select visible"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPoolExpanded((open) => !open)}
                      className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
                    >
                      {poolExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {selectedIds.length} selected · {filteredPool.length} shown
                  </span>
                </div>
                <div
                  className={`mt-2 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 ${
                    poolExpanded ? "" : "max-h-72"
                  }`}
                >
                  {filteredPool.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-zinc-500">No matches.</div>
                  ) : (
                    filteredPool.map((account) => {
                      const inGroup = memberIds.has(account.id);
                      const checked = selectedIds.includes(account.id);
                      return (
                        <label
                          key={account.id}
                          className={`flex items-center gap-2.5 px-3 py-2 ${
                            inGroup ? "cursor-default opacity-70" : checked ? "cursor-pointer bg-blue-500/10" : "cursor-pointer hover:bg-zinc-900"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={inGroup || checked}
                            disabled={inGroup}
                            onChange={() => toggleSelected(account.id)}
                            className="accent-blue-500"
                          />
                          {account.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={account.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <Avatar
                              id={account.id}
                              person={{ full_name: account.fullName, username: account.username }}
                              size="sm"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{accountLabel(account)}</span>
                          {inGroup ? (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              In group
                            </span>
                          ) : null}
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {destinationSelect()}
                  <Button
                    size="sm"
                    className="bg-blue-500 text-zinc-950 hover:bg-blue-400"
                    onClick={() => void handleAddSelected()}
                    disabled={adding || selectedIds.length === 0}
                  >
                    {adding ? "Adding..." : `Add${selectedIds.length ? ` ${selectedIds.length}` : ""}`}
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-zinc-50">Generate new</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Creates accounts with random names and joins them to this group.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex w-24 flex-col gap-1 text-[11px] font-medium text-zinc-400">
                Count
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={fakeCount}
                  onChange={(e) => setFakeCount(Number(e.target.value))}
                  disabled={seeding}
                  className={fieldCls}
                />
              </label>
              {destinationSelect()}
              <Button
                size="sm"
                variant="secondary"
                className="border-zinc-700 text-zinc-100"
                onClick={() => void handleSeedFakeMembers()}
                disabled={seeding}
              >
                {seeding ? "Generating..." : "Generate & add"}
              </Button>
            </div>
            {seedProgress && (
              <p className="mt-3 text-xs text-zinc-400">
                {seedProgress.done} of {seedProgress.total}
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (section === "organize") {
    const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
    const listedAccounts = (openFolder
      ? propMembers.filter((member) => openFolder.userIds.includes(member.user_id))
      : unfiledProps
    ).slice().sort((a, b) => cardName(a).localeCompare(cardName(b), undefined, { sensitivity: "base" }));

    function allowDrop(event: DragEvent<HTMLElement>, target: string) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget((current) => (current === target ? current : target));
    }

    function leaveDrop(event: DragEvent<HTMLElement>, target: string) {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setDropTarget((current) => (current === target ? null : current));
    }

    function dropOn(event: DragEvent<HTMLElement>, folderId: string | null) {
      event.preventDefault();
      event.stopPropagation();
      const userId = event.dataTransfer.getData("text/plain") || dragUserId;
      setDropTarget(null);
      setDragUserId(null);
      if (!userId) return;
      const current = folderByUser.get(userId) ?? null;
      if (current === folderId) return;
      void handleMoveMember(userId, folderId ?? "");
    }

    function accountCard(member: AdminGroupMember) {
      const dragging = dragUserId === member.user_id;
      const name = cardName(member);
      return (
        <div
          key={member.user_id}
          draggable
          title={name}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", member.user_id);
            event.dataTransfer.effectAllowed = "move";
            setDragUserId(member.user_id);
          }}
          onDragEnd={() => {
            setDragUserId(null);
            setDropTarget(null);
          }}
          className={`flex max-w-[9.5rem] items-center gap-2 rounded-xl border px-2.5 py-2 ${
            dragging
              ? "border-zinc-700 bg-zinc-950 opacity-40"
              : "cursor-grab border-zinc-800 bg-zinc-950 active:cursor-grabbing hover:border-zinc-600"
          }`}
        >
          <Avatar id={member.user_id} person={member.profile} size="sm" />
          <span className="min-w-0 truncate text-xs font-semibold text-zinc-100">{name}</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {errorBanner}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-50">Folders</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Drag a prop account onto a folder. Open a folder to see who is inside.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              maxLength={40}
              placeholder="Folder name"
              className={`${fieldCls} min-w-[12rem] flex-1`}
            />
            <Button
              size="sm"
              variant="secondary"
              className="border-zinc-700 text-zinc-100"
              onClick={() => void handleCreateFolder()}
              disabled={creatingFolder || !folderName.trim()}
            >
              {creatingFolder ? "Adding..." : "Add folder"}
            </Button>
          </div>
          {folders.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No folders yet.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {folders.map((folder) => {
                const count = propMembers.filter((member) => folder.userIds.includes(member.user_id)).length;
                const isOpen = openFolder?.id === folder.id;
                const isDrop = dropTarget === folder.id;
                const renaming = renamingId === folder.id;
                return (
                  <div
                    key={folder.id}
                    onDragOver={(event) => allowDrop(event, folder.id)}
                    onDragLeave={(event) => leaveDrop(event, folder.id)}
                    onDrop={(event) => dropOn(event, folder.id)}
                    className={`flex items-center gap-2 rounded-2xl border px-3 py-3 transition ${
                      isDrop
                        ? "border-blue-400 bg-blue-500/15"
                        : isOpen
                          ? "border-blue-500/40 bg-blue-500/10"
                          : dragUserId
                            ? "border-dashed border-blue-500/40 bg-zinc-950"
                            : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    } ${renaming ? "col-span-2 sm:col-span-2" : ""}`}
                  >
                    {renaming ? (
                      <form
                        className="flex min-w-0 flex-1 items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleRenameFolder(folder.id);
                        }}
                      >
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          maxLength={40}
                          className={fieldCls}
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={folderBusyId === folder.id}
                          className="text-xs font-semibold text-blue-300 hover:text-blue-200 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="text-xs font-semibold text-zinc-500 hover:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setOpenFolderId(folder.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-blue-300">
                            {isOpen ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-zinc-50">{folder.name}</span>
                            <span className="text-[11px] text-zinc-500">
                              {count} account{count === 1 ? "" : "s"}
                            </span>
                          </span>
                        </button>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(folder.id);
                              setRenameValue(folder.name);
                            }}
                            className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteFolder(folder.id)}
                            disabled={folderBusyId === folder.id}
                            className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
              dropTarget === "unfiled" ? "border-blue-400 bg-blue-500/10" : "border-zinc-800"
            }`}
            onDragOver={(event) => allowDrop(event, "unfiled")}
            onDragLeave={(event) => leaveDrop(event, "unfiled")}
            onDrop={(event) => dropOn(event, null)}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setOpenFolderId(null)}
                  className={`truncate font-semibold ${
                    openFolder ? "text-blue-300 hover:text-blue-200" : "text-zinc-50"
                  }`}
                >
                  Prop accounts
                </button>
                {openFolder ? (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate font-semibold text-zinc-50">{openFolder.name}</span>
                  </>
                ) : null}
              </div>
              <p className="text-[11px] text-zinc-500">
                {openFolder
                  ? "Drag onto another folder, or onto Prop accounts to take them out."
                  : "Names sit side by side. Drag a card onto a folder above."}{" "}
                {listedAccounts.length} account{listedAccounts.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {propMembers.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500">Add prop accounts first, then sort them into folders.</p>
          ) : listedAccounts.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500">
              {openFolder ? "Nothing in this folder yet. Drag a prop account onto it." : "Every prop account is in a folder."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 p-3">
              {listedAccounts.map((member) => accountCard(member))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-50">In this group</h2>
          <p className="text-[11px] text-zinc-500">
            {members.length} member{members.length === 1 ? "" : "s"}
            {propMembers.length > 0 ? ` Â· ${propMembers.length} prop` : ""}
          </p>
        </div>
        <input
          value={rosterSearch}
          onChange={(e) => setRosterSearch(e.target.value)}
          placeholder="Search members"
          className={`${fieldCls} w-full sm:w-56`}
        />
      </div>
      {errorBanner ? <div className="border-b border-zinc-800 px-4 py-3">{errorBanner}</div> : null}
      {membersLoading ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-500">Loading members...</div>
      ) : roster.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-500">
          {members.length === 0 ? "No members yet." : "No members match that search."}
        </div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {roster.map((member) => memberRow(member))}
        </div>
      )}
    </section>
  );
}
