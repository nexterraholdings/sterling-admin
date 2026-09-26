"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Folder, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/admin/ui";
import { deleteUserAccount, generateProAccount, savePropAccountVoice, updateProAccount } from "@/app/dashboard/users/actions";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { PropAccountDirectory, PropDirectoryAccount, PropDirectoryFolder } from "@/lib/groups/propFolders";
import { randomPropBio, randomPropName } from "@/lib/prop-accounts";
import { EMPTY_PROP_VOICE, sanitizePropVoice, type PropVoice } from "@/lib/prop-voice";
import { PropVoiceFields } from "@/app/dashboard/users/prop-accounts/PropVoiceFields";

type Marquee = { left: number; top: number; width: number; height: number };

function accountName(account: PropDirectoryAccount): string {
  return account.fullName?.trim() || (account.username ? `@${account.username}` : account.id.slice(0, 8));
}

function rectsOverlap(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function PropAccountsView({ directory }: { directory: PropAccountDirectory }) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragIdsRef = useRef<string[]>([]);
  const dragFolderRef = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const [accounts, setAccounts] = useState(directory.accounts);
  const [folders, setFolders] = useState(directory.folders);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [movingIds, setMovingIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    folderId: string | null;
    mode: "create" | "name" | "actions" | "rename" | "move" | "delete";
  } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creator, setCreator] = useState<null | "single" | "bulk">(null);
  const [createProgress, setCreateProgress] = useState<{ done: number; total: number } | null>(null);
  const [accountMenu, setAccountMenu] = useState<{
    x: number;
    y: number;
    accountId: string;
    mode: "actions" | "edit" | "move" | "delete";
  } | null>(null);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [groupChoices, setGroupChoices] = useState<Array<{ id: string; title: string; hubTitle: string | null }>>([]);
  const [groupTarget, setGroupTarget] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [addIds, setAddIds] = useState<string[]>([]);
  const [accountMoveTarget, setAccountMoveTarget] = useState("");
  const [editorAccountId, setEditorAccountId] = useState<string | null>(null);
  const term = search.trim().toLowerCase();

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;

  useEffect(() => {
    if (!menu && !accountMenu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu(null);
      setAccountMenu(null);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-folder-menu]")) return;
      setMenu(null);
      setAccountMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menu, accountMenu]);

  const visibleFolders = useMemo(() => {
    const parentId = openFolder?.id ?? null;
    const level = folders.filter((folder) => folder.parentId === parentId);
    if (!term) return level;
    return level.filter((folder) => folder.name.toLowerCase().includes(term));
  }, [folders, openFolder, term]);

  const visibleAccounts = useMemo(() => {
    return accounts.filter((account) => {
      if (openFolder) {
        if (!account.folderIds.includes(openFolder.id)) return false;
      } else if (account.folderIds.length > 0) {
        return false;
      }
      if (!term) return true;
      const haystack = `${account.username ?? ""} ${account.fullName ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [accounts, openFolder, term]);

  const visibleIdSet = useMemo(() => new Set(visibleAccounts.map((account) => account.id)), [visibleAccounts]);
  const activeSelection = selectedIds.filter((id) => visibleIdSet.has(id));
  const selectedSet = useMemo(() => new Set(activeSelection), [activeSelection]);
  const movingSet = useMemo(() => new Set(movingIds), [movingIds]);

  const empty =
    accounts.length === 0 && folders.length === 0
      ? "No prop accounts yet."
      : visibleFolders.length === 0 && visibleAccounts.length === 0
        ? term
          ? "Nothing matches this search."
          : openFolder
            ? null
            : "Nothing matches this search."
        : null;

  function selectInsideMarquee(box: Marquee) {
    const board = boardRef.current;
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    const screen = {
      left: bounds.left + box.left,
      top: bounds.top + box.top,
      right: bounds.left + box.left + box.width,
      bottom: bounds.top + box.top + box.height,
    };
    const next: string[] = [];
    board.querySelectorAll<HTMLElement>("[data-account-id]").forEach((element) => {
      const id = element.dataset.accountId;
      if (id && rectsOverlap(element.getBoundingClientRect(), screen)) next.push(id);
    });
    setSelectedIds(next);
  }

  function leaveFolder() {
    suppressClick.current = false;
    setDropFolderId(null);
    setSelectedIds([]);
    setOpenFolderId(null);
  }

  function onMainPointerDown(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function onMainClick(event: ReactPointerEvent<HTMLElement> | { preventDefault?: () => void; stopPropagation?: () => void }) {
    event.stopPropagation?.();
    if (dragIdsRef.current.length > 0) return;
    leaveFolder();
  }

  function onBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || movingIds.length > 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-account-id], [data-folder-id]")) return;
    const board = boardRef.current;
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    const origin = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    marqueeOrigin.current = origin;
    const next = { left: origin.x, top: origin.y, width: 0, height: 0 };
    setMarquee(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = marqueeOrigin.current;
    const board = boardRef.current;
    if (!origin || !board) return;
    const bounds = board.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const next = {
      left: Math.min(origin.x, x),
      top: Math.min(origin.y, y),
      width: Math.abs(x - origin.x),
      height: Math.abs(y - origin.y),
    };
    setMarquee(next);
    selectInsideMarquee(next);
  }

  function onBoardPointerUp() {
    const drawn = marquee;
    marqueeOrigin.current = null;
    setMarquee(null);
    if (drawn && drawn.width < 4 && drawn.height < 4) {
      setSelectedIds([]);
      return;
    }
    if (drawn && (drawn.width >= 4 || drawn.height >= 4)) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }

  function readDragIds(event: DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData("application/x-prop-accounts");
    let ids = dragIdsRef.current.length > 0 ? dragIdsRef.current : dragIds;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) ids = parsed.map((id) => String(id));
      } catch {
        ids = dragIdsRef.current.length > 0 ? dragIdsRef.current : dragIds;
      }
    }
    dragIdsRef.current = [];
    setDragIds([]);
    setDropFolderId(null);
    return [...new Set(ids)];
  }

  function allowDrop(event: DragEvent<HTMLElement>, folderId: string) {
    const sourceFolderId = dragFolderRef.current;
    const draggingAccounts = dragIdsRef.current.length > 0;
    if ((!sourceFolderId && !draggingAccounts) || movingIds.length > 0 || creatingFolder) return;
    if (sourceFolderId) {
      if (folderId === "trash") return;
      if (folderId !== "main" && blockedFolderIds(folders, sourceFolderId).has(folderId)) return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropFolderId((current) => (current === folderId ? current : folderId));
  }

  function takeDraggedFolder(event: DragEvent<HTMLElement>): string | null {
    const id = event.dataTransfer.getData("application/x-prop-folder") || dragFolderRef.current || "";
    if (!id) return null;
    dragFolderRef.current = null;
    setDraggingFolderId(null);
    setDropFolderId(null);
    return id;
  }

  async function relocateFolder(folderId: string, parentId: string | null) {
    if (creatingFolder) return;
    if (parentId && blockedFolderIds(folders, folderId).has(parentId)) return;
    const currentParent = folders.find((folder) => folder.id === folderId)?.parentId ?? null;
    if ((parentId || null) === currentParent) return;
    setCreatingFolder(true);
    const previous = folders;
    setFolders((current) => current.map((folder) => (folder.id === folderId ? { ...folder, parentId } : folder)));
    setMenu(null);
    try {
      const res = await fetch(`/api/admin/prop-folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to move folder");
      toast.success(parentId ? "Moved folder." : "Moved folder to the main directory.");
    } catch (error) {
      setFolders(previous);
      toast.error(error instanceof Error ? error.message : "Failed to move folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function dropOnFolder(event: DragEvent<HTMLElement>, folder: PropDirectoryFolder) {
    event.preventDefault();
    event.stopPropagation();
    const draggedFolderId = takeDraggedFolder(event);
    if (draggedFolderId) {
      await relocateFolder(draggedFolderId, folder.id);
      return;
    }
    const ids = readDragIds(event);
    const userIds = ids.filter((id) => {
      const account = accounts.find((item) => item.id === id);
      return account && !account.folderIds.includes(folder.id);
    });
    if (userIds.length === 0 || movingIds.length > 0) return;

    const moving = new Set(userIds);
    const previousAccounts = accounts;
    const previousFolders = folders;
    setMovingIds(userIds);
    setAccounts((current) =>
      current.map((item) => (moving.has(item.id) ? { ...item, folderIds: [folder.id] } : item)),
    );
    setFolders((current) =>
      current.map((item) => {
        const without = item.userIds.filter((id) => !moving.has(id));
        if (item.id !== folder.id) return { ...item, userIds: without };
        return { ...item, userIds: [...new Set([...without, ...userIds])] };
      }),
    );
    setSelectedIds([]);

    try {
      const res = await fetch("/api/admin/prop-folders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, folderId: folder.id }),
      });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to move the accounts");
    } catch (error) {
      setAccounts(previousAccounts);
      setFolders(previousFolders);
      toast.error(error instanceof Error ? error.message : "Failed to move the accounts");
    } finally {
      setMovingIds([]);
    }
  }

  async function dropOnMain(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedFolderId = takeDraggedFolder(event);
    if (draggedFolderId) {
      await relocateFolder(draggedFolderId, null);
      return;
    }
    if (!openFolder) return;
    const ids = readDragIds(event);
    const userIds = ids.filter((id) => {
      const account = accounts.find((item) => item.id === id);
      return account && account.folderIds.length > 0;
    });
    if (userIds.length === 0 || movingIds.length > 0) return;

    const moving = new Set(userIds);
    const previousAccounts = accounts;
    const previousFolders = folders;
    setMovingIds(userIds);
    setAccounts((current) => current.map((item) => (moving.has(item.id) ? { ...item, folderIds: [] } : item)));
    setFolders((current) =>
      current.map((item) => ({ ...item, userIds: item.userIds.filter((id) => !moving.has(id)) })),
    );
    setSelectedIds([]);

    try {
      const res = await fetch("/api/admin/prop-folders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, folderId: null }),
      });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to move the accounts");
    } catch (error) {
      setAccounts(previousAccounts);
      setFolders(previousFolders);
      toast.error(error instanceof Error ? error.message : "Failed to move the accounts");
    } finally {
      setMovingIds([]);
    }
  }

  function dropOnTrash(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const ids = readDragIds(event);
    if (ids.length === 0 || movingIds.length > 0 || creatingFolder) return;
    setPendingDeleteIds(ids);
  }

  async function confirmTrashDelete() {
    if (pendingDeleteIds.length === 0 || creatingFolder) return;
    const ids = pendingDeleteIds;
    const idSet = new Set(ids);
    const previousAccounts = accounts;
    const previousFolders = folders;
    setCreatingFolder(true);
    setAccounts((current) => current.filter((account) => !idSet.has(account.id)));
    setFolders((current) =>
      current.map((folder) => ({ ...folder, userIds: folder.userIds.filter((id) => !idSet.has(id)) })),
    );
    setSelectedIds((current) => current.filter((id) => !idSet.has(id)));
    setPendingDeleteIds([]);
    const failed = new Set<string>();
    for (const id of ids) {
      try {
        await deleteUserAccount(id);
      } catch (error) {
        failed.add(id);
        toast.error(error instanceof Error ? error.message : "Could not delete a prop account");
      }
    }
    if (failed.size > 0) {
      setAccounts((current) => {
        const back = previousAccounts.filter((account) => failed.has(account.id));
        const have = new Set(current.map((account) => account.id));
        return [...back.filter((account) => !have.has(account.id)), ...current];
      });
      setFolders((current) =>
        current.map((folder) => {
          const previous = previousFolders.find((item) => item.id === folder.id);
          const restore = (previous?.userIds ?? []).filter((id) => failed.has(id));
          return { ...folder, userIds: [...new Set([...folder.userIds, ...restore])] };
        }),
      );
    }
    const removed = ids.length - failed.size;
    if (removed > 0) {
      toast.success(removed === 1 ? "Deleted 1 prop account." : `Deleted ${removed} prop accounts.`);
    }
    setCreatingFolder(false);
  }

  function openContextMenu(event: ReactMouseEvent, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const folder = folderId ? folders.find((item) => item.id === folderId) : null;
    setAccountMenu(null);
    setFolderName(folder?.name ?? "");
    setMoveTarget(folder?.parentId ?? "");
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 248)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 220)),
      folderId,
      mode: folderId ? "actions" : "create",
    });
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name || creatingFolder) return;
    const parentId = openFolder?.id ?? null;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/admin/prop-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      const payload = await readApiJson<{ folder?: { id: string; name: string; parentId: string | null }; error?: string }>(res);
      if (!res.ok || !payload.folder) throw new Error(payload.error ?? "Failed to create folder");
      setFolders((current) =>
        [
          ...current,
          {
            id: payload.folder!.id,
            name: payload.folder!.name,
            parentId: payload.folder!.parentId ?? parentId,
            userIds: [],
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      toast.success(`Created folder "${payload.folder.name}".`);
      setMenu(null);
      setFolderName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function renameFolder() {
    if (!menu?.folderId || creatingFolder) return;
    const name = folderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    const folderId = menu.folderId;
    const previous = folders;
    setFolders((current) => current.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)));
    try {
      const res = await fetch(`/api/admin/prop-folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to rename folder");
      toast.success(`Renamed folder to "${name}".`);
      setMenu(null);
    } catch (error) {
      setFolders(previous);
      toast.error(error instanceof Error ? error.message : "Failed to rename folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function deleteFolder() {
    if (!menu?.folderId || creatingFolder) return;
    const folderId = menu.folderId;
    const removed = folders.find((folder) => folder.id === folderId);
    if (!removed) return;
    setCreatingFolder(true);
    const previousFolders = folders;
    const previousAccounts = accounts;
    setFolders((current) =>
      current
        .filter((folder) => folder.id !== folderId)
        .map((folder) => (folder.parentId === folderId ? { ...folder, parentId: removed.parentId } : folder)),
    );
    setAccounts((current) =>
      current.map((account) =>
        account.folderIds.includes(folderId) ? { ...account, folderIds: [] } : account,
      ),
    );
    if (openFolderId === folderId) setOpenFolderId(null);
    setMenu(null);
    try {
      const res = await fetch(`/api/admin/prop-folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete folder");
      toast.success(`Deleted folder "${removed.name}".`);
    } catch (error) {
      setFolders(previousFolders);
      setAccounts(previousAccounts);
      toast.error(error instanceof Error ? error.message : "Failed to delete folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function moveFolder() {
    if (!menu?.folderId || creatingFolder) return;
    const folderId = menu.folderId;
    const parentId = moveTarget || null;
    setMenu(null);
    await relocateFolder(folderId, parentId);
  }

  async function loadGroupChoices() {
    if (groupChoices.length > 0) return;
    const all: Array<{ id: string; title: string; hubTitle: string | null }> = [];
    for (let page = 1; page <= 20; page += 1) {
      const res = await fetch(`/api/admin/groups?page=${page}&pageSize=100&sort=title`);
      const payload = await readApiJson<{
        groups?: Array<{ id: string; title: string; hub?: { title?: string | null } | null }>;
        total?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to load groups");
      all.push(
        ...(payload.groups ?? []).map((group) => ({
          id: group.id,
          title: group.title || "Untitled group",
          hubTitle: group.hub?.title?.trim() || null,
        })),
      );
      if (all.length >= (payload.total ?? all.length)) break;
    }
    all.sort((a, b) => a.title.localeCompare(b.title));
    setGroupChoices(all);
  }

  function beginAddToGroup() {
    if (!accountMenu) return;
    const clicked = accountMenu.accountId;
    const ids = selectedSet.has(clicked) && activeSelection.length > 1 ? activeSelection : [clicked];
    setAddIds(ids);
    setGroupSearch("");
    setGroupTarget("");
    setAccountMenu(null);
    setAddingToGroup(true);
    void loadGroupChoices().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load groups");
    });
  }

  async function addAccountsToGroup() {
    if (!groupTarget || addIds.length === 0 || creatingFolder) return;
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupTarget)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: addIds }),
      });
      const payload = await readApiJson<{ error?: string; added?: number }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to add the accounts");
      const groupName = groupChoices.find((group) => group.id === groupTarget)?.title ?? "the group";
      toast.success(
        addIds.length === 1 ? `Added the account to ${groupName}.` : `Added ${payload.added ?? addIds.length} accounts to ${groupName}.`,
      );
      setAddingToGroup(false);
      setAddIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add the accounts");
    } finally {
      setCreatingFolder(false);
    }
  }

  function openAccountMenu(event: ReactMouseEvent, accountId: string) {
    event.preventDefault();
    event.stopPropagation();
    const account = accounts.find((item) => item.id === accountId);
    setMenu(null);
    setAccountMoveTarget(account?.folderIds[0] ?? "");
    setAccountMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 280)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 280)),
      accountId,
      mode: "actions",
    });
  }

  async function createAccounts(input: {
    count: number;
    includeBio: boolean;
    fullName: string;
    username: string;
    bio: string;
    connectionMin: number | null;
    connectionMax: number | null;
  }) {
    if (creatingFolder) return;
    const folderId = openFolder?.id ?? null;
    const place = openFolder?.name ?? "the main directory";
    const total = Math.min(50, Math.max(1, Math.round(input.count) || 1));
    setCreatingFolder(true);
    setCreateProgress({ done: 0, total });
    const created: PropDirectoryAccount[] = [];
    const failures: string[] = [];
    try {
      for (let index = 0; index < total; index += 1) {
        try {
          const formData = new FormData();
          const name = total === 1 ? input.fullName.trim() || randomPropName() : randomPropName();
          formData.set("full_name", name);
          if (total === 1 && input.username.trim()) formData.set("username", input.username.trim());
          formData.set("include_bio", input.includeBio ? "1" : "0");
          formData.set("bio", input.includeBio ? (total === 1 ? input.bio.trim() || randomPropBio() : randomPropBio()) : "");
          formData.set("account_role", "creator");
          if (input.connectionMin != null && input.connectionMax != null) {
            const low = Math.min(input.connectionMin, input.connectionMax);
            const high = Math.max(input.connectionMin, input.connectionMax);
            const fakeConnections = low + Math.floor(Math.random() * (high - low + 1));
            formData.set("fake_connections", String(fakeConnections));
          }
          const result = await generateProAccount(formData);
          created.push({
            id: result.userId,
            username: result.username,
            fullName: result.fullName,
            avatarUrl: result.avatarUrl,
            bio: result.bio || null,
            createdAt: new Date().toISOString(),
            folderIds: folderId ? [folderId] : [],
            voice: { ...EMPTY_PROP_VOICE },
          });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "Could not create a prop account");
        }
        setCreateProgress({ done: index + 1, total });
      }

      if (created.length > 0) {
        if (folderId) {
          const res = await fetch("/api/admin/prop-folders/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds: created.map((account) => account.id), folderId }),
          });
          const payload = await readApiJson<{ error?: string }>(res);
          if (!res.ok) throw new Error(payload.error ?? "Created the accounts, but could not file them");
          setFolders((current) =>
            current.map((folder) =>
              folder.id === folderId
                ? { ...folder, userIds: [...folder.userIds, ...created.map((account) => account.id)] }
                : folder,
            ),
          );
        }
        setAccounts((current) => [...created, ...current]);
        toast.success(
          created.length === 1
            ? `Added ${accountName(created[0]!)} to ${place}.`
            : `Added ${created.length} prop accounts to ${place}.`,
        );
      }
      if (failures.length > 0) {
        toast.error(failures.length === 1 ? failures[0]! : `${failures.length} accounts could not be created. ${failures[0]}`);
      }
      if (created.length > 0 && failures.length === 0) setCreator(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the prop accounts");
      if (created.length > 0) router.refresh();
    } finally {
      setCreatingFolder(false);
      setCreateProgress(null);
    }
  }

  async function saveAccount(next: { fullName: string; username: string; bio: string; avatar: File | null; voice: PropVoice }) {
    if (!editorAccountId || creatingFolder) return;
    const accountId = editorAccountId;
    const voice = sanitizePropVoice(next.voice);
    setCreatingFolder(true);
    try {
      const formData = new FormData();
      formData.set("full_name", next.fullName);
      formData.set("username", next.username);
      formData.set("bio", next.bio);
      if (next.avatar) formData.set("avatar", next.avatar);
      const saved = await updateProAccount(accountId, formData);
      await savePropAccountVoice(accountId, voice);
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId
            ? {
                ...account,
                fullName: saved.fullName,
                username: saved.username,
                bio: saved.bio,
                avatarUrl: saved.avatarUrl,
                voice,
              }
            : account,
        ),
      );
      toast.success("Saved the prop account.");
      setEditorAccountId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the prop account");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function deleteAccount() {
    if (!accountMenu || creatingFolder) return;
    const accountId = accountMenu.accountId;
    const removed = accounts.find((account) => account.id === accountId);
    setCreatingFolder(true);
    const previousAccounts = accounts;
    const previousFolders = folders;
    setAccounts((current) => current.filter((account) => account.id !== accountId));
    setFolders((current) =>
      current.map((folder) => ({ ...folder, userIds: folder.userIds.filter((id) => id !== accountId) })),
    );
    setSelectedIds((current) => current.filter((id) => id !== accountId));
    setAccountMenu(null);
    try {
      await deleteUserAccount(accountId);
      toast.success(`Deleted ${removed ? accountName(removed) : "the prop account"}.`);
    } catch (error) {
      setAccounts(previousAccounts);
      setFolders(previousFolders);
      toast.error(error instanceof Error ? error.message : "Could not delete the prop account");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function moveAccount() {
    if (!accountMenu || creatingFolder) return;
    const accountId = accountMenu.accountId;
    const folderId = accountMoveTarget || null;
    const account = accounts.find((item) => item.id === accountId);
    const currentFolder = account?.folderIds[0] ?? null;
    if (folderId === currentFolder) {
      setAccountMenu(null);
      return;
    }
    setCreatingFolder(true);
    const previousAccounts = accounts;
    const previousFolders = folders;
    const moving = new Set([accountId]);
    setAccounts((current) =>
      current.map((item) => (item.id === accountId ? { ...item, folderIds: folderId ? [folderId] : [] } : item)),
    );
    setFolders((current) =>
      current.map((folder) => {
        const without = folder.userIds.filter((id) => !moving.has(id));
        if (folder.id !== folderId) return { ...folder, userIds: without };
        return { ...folder, userIds: [...without, accountId] };
      }),
    );
    setAccountMenu(null);
    try {
      const res = await fetch("/api/admin/prop-folders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [accountId], folderId }),
      });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to move the account");
      toast.success(folderId ? "Moved the prop account." : "Moved the prop account to the main directory.");
    } catch (error) {
      setAccounts(previousAccounts);
      setFolders(previousFolders);
      toast.error(error instanceof Error ? error.message : "Failed to move the account");
    } finally {
      setCreatingFolder(false);
    }
  }

  return (
    <div
      className="space-y-4"
      onContextMenu={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          openContextMenu(event, null);
          return;
        }
        if (target.closest("[data-account-id]")) return;
        const folder = target.closest("[data-folder-id]");
        if (folder instanceof HTMLElement && folder.dataset.folderId && folder.dataset.folderId !== "main") return;
        openContextMenu(event, null);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 text-sm font-semibold text-zinc-200">
          {openFolder ? (
            <>
              <button
                type="button"
                onPointerDown={onMainPointerDown}
                onClick={onMainClick}
                onDragOver={(event) => allowDrop(event, "main")}
                onDragLeave={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
                  setDropFolderId((current) => (current === "main" ? null : current));
                }}
                onDrop={(event) => void dropOnMain(event)}
                className={`truncate rounded-lg px-1.5 py-0.5 ${
                  dropFolderId === "main" ? "bg-violet-400/20 text-violet-100" : "text-violet-300 hover:text-violet-200"
                }`}
              >
                Main
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="truncate">{openFolder.name}</span>
            </>
          ) : (
            <span className="text-zinc-400">
              {activeSelection.length > 0
                ? `${activeSelection.length} selected. Drag them onto a folder.`
                : "Drag across profiles to select them, then drop the selection on a folder."}
            </span>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => setCreator("bulk")}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:border-zinc-500"
          >
            Bulk prop accounts
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search folders and accounts"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 sm:max-w-xs"
          />
        </div>
      </div>

      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
        className={`relative grid min-h-[70vh] grid-cols-[repeat(auto-fill,minmax(min(100%,11.5rem),1fr))] content-start gap-3 ${
          marquee ? "select-none" : ""
        }`}
      >
        <div
          data-folder-id="trash"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragOver={(event) => allowDrop(event, "trash")}
          onDragLeave={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            setDropFolderId((current) => (current === "trash" ? null : current));
          }}
          onDrop={(event) => dropOnTrash(event)}
          className={`flex flex-col gap-3 rounded-2xl border bg-zinc-900 p-4 ${
            dropFolderId === "trash" ? "border-rose-300 bg-rose-400/10" : "border-zinc-800"
          }`}
        >
          <Trash2 className={`pointer-events-none h-10 w-10 ${dropFolderId === "trash" ? "text-rose-200" : "text-rose-300"}`} />
          <span className="pointer-events-none min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-50">Trash</span>
            <span className="mt-0.5 block truncate text-xs text-zinc-500">Drop accounts to delete</span>
          </span>
        </div>
        {empty ? (
          <p className="col-span-full px-1 py-6 text-center text-sm text-zinc-500">{empty}</p>
        ) : (
          <>
          {openFolder ? (
            <div
              role="button"
              tabIndex={0}
              data-folder-id="main"
              onPointerDown={onMainPointerDown}
              onClick={onMainClick}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                leaveFolder();
              }}
              onDragOver={(event) => allowDrop(event, "main")}
              onDragLeave={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next)) return;
                setDropFolderId((current) => (current === "main" ? null : current));
              }}
              onDrop={(event) => void dropOnMain(event)}
              className={`flex cursor-pointer flex-col justify-center gap-2 rounded-2xl border border-dashed p-4 text-left ${
                dropFolderId === "main"
                  ? "border-violet-300 bg-violet-400/15"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
              }`}
            >
              <span className="pointer-events-none text-sm font-semibold text-zinc-50">Main directory</span>
              <span className="pointer-events-none text-xs text-zinc-500">Drop a profile here to take it out of this folder.</span>
            </div>
          ) : null}
          {visibleFolders.map((folder) => {
            const dropping = dropFolderId === folder.id;
            return (
              <div
                key={folder.id}
                role="button"
                tabIndex={0}
                data-folder-id={folder.id}
                draggable={!creatingFolder}
                onContextMenu={(event) => openContextMenu(event, folder.id)}
                onClick={() => {
                  if (suppressClick.current) return;
                  setSelectedIds([]);
                  setOpenFolderId(folder.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedIds([]);
                  setOpenFolderId(folder.id);
                }}
                onDragStart={(event) => {
                  suppressClick.current = true;
                  dragIdsRef.current = [];
                  dragFolderRef.current = folder.id;
                  event.dataTransfer.setData("application/x-prop-folder", folder.id);
                  event.dataTransfer.setData("text/plain", folder.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingFolderId(folder.id);
                  setDragIds([]);
                }}
                onDragEnd={() => {
                  dragFolderRef.current = null;
                  setDraggingFolderId(null);
                  setDropFolderId(null);
                  window.setTimeout(() => {
                    suppressClick.current = false;
                  }, 80);
                }}
                onDragOver={(event) => allowDrop(event, folder.id)}
                onDragLeave={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
                  setDropFolderId((current) => (current === folder.id ? null : current));
                }}
                onDrop={(event) => void dropOnFolder(event, folder)}
                className={`flex cursor-grab flex-col gap-3 rounded-2xl border bg-zinc-900 p-4 text-left transition active:cursor-grabbing ${
                  dropping
                    ? "border-amber-300 bg-amber-300/10"
                    : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/70"
                } ${draggingFolderId === folder.id ? "opacity-40" : ""}`}
              >
                <Folder className={`pointer-events-none h-10 w-10 ${dropping ? "text-amber-200" : "text-amber-300"}`} />
                <span className="pointer-events-none min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-50">{folder.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">
                    {folder.userIds.length} {folder.userIds.length === 1 ? "account" : "accounts"}
                  </span>
                </span>
              </div>
            );
          })}
          {openFolder && visibleFolders.length === 0 && visibleAccounts.length === 0 && !term ? (
            <p className="col-span-full px-1 py-6 text-sm text-zinc-500">
              This folder is empty. Right-click to add a prop account.
            </p>
          ) : null}
          {visibleAccounts.map((account) => {
            const selected = selectedSet.has(account.id);
            const dragging = dragIds.includes(account.id);
            const moving = movingSet.has(account.id);
            return (
              <div
                key={account.id}
                data-account-id={account.id}
                draggable={!moving}
                onContextMenu={(event) => openAccountMenu(event, account.id)}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  if (suppressClick.current || moving) return;
                  if (event.metaKey || event.ctrlKey) {
                    setSelectedIds((current) =>
                      current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id],
                    );
                    return;
                  }
                  setSelectedIds([account.id]);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  if (suppressClick.current || moving) return;
                  setSelectedIds([account.id]);
                  setEditorAccountId(account.id);
                }}
                onDragStart={(event) => {
                  const ids = selectedSet.has(account.id) ? activeSelection : [account.id];
                  suppressClick.current = true;
                  dragIdsRef.current = ids;
                  event.dataTransfer.setData("application/x-prop-accounts", JSON.stringify(ids));
                  event.dataTransfer.setData("text/plain", ids.join(","));
                  event.dataTransfer.effectAllowed = "move";
                  setDragIds(ids);
                }}
                onDragEnd={() => {
                  dragIdsRef.current = [];
                  setDragIds([]);
                  setDropFolderId(null);
                  window.setTimeout(() => {
                    suppressClick.current = false;
                  }, 80);
                }}
                className={`flex cursor-grab select-none flex-col gap-3 rounded-2xl border bg-zinc-950 p-4 active:cursor-grabbing ${
                  selected ? "border-violet-400 bg-violet-500/10 ring-2 ring-violet-400/70" : "border-zinc-800"
                } ${dragging ? "opacity-40" : ""} ${moving ? "cursor-wait opacity-60" : ""}`}
              >
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatarUrl} alt="" draggable={false} className="pointer-events-none h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="pointer-events-none">
                    <Avatar
                      id={account.id}
                      person={{ full_name: account.fullName, username: account.username }}
                    />
                  </span>
                )}
                <span className="pointer-events-none min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-50">{accountName(account)}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-400">
                    {account.username ? `@${account.username}` : "No username"}
                  </span>
                  {openFolder ? (
                    <span className="mt-1 block truncate text-xs text-zinc-500">{openFolder.name}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {marquee && (marquee.width > 2 || marquee.height > 2) ? (
            <div
              className="pointer-events-none absolute z-10 border border-violet-300 bg-violet-400/20"
              style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
            />
          ) : null}
          </>
        )}
      </div>
      {menu ? (
        <FolderMenu
          menu={menu}
          folders={folders}
          folderName={folderName}
          moveTarget={moveTarget}
          busy={creatingFolder}
          onFolderName={setFolderName}
          onMoveTarget={setMoveTarget}
          onMode={(mode) => setMenu((current) => (current ? { ...current, mode } : current))}
          onCreate={() => void createFolder()}
          onNewAccount={() => {
            setMenu(null);
            setCreator("single");
          }}
          onBulkAccounts={() => {
            setMenu(null);
            setCreator("bulk");
          }}
          onRename={() => void renameFolder()}
          onDelete={() => void deleteFolder()}
          onMove={() => void moveFolder()}
        />
      ) : null}
      {accountMenu ? (
        <AccountMenu
          menu={accountMenu}
          account={accounts.find((account) => account.id === accountMenu.accountId) ?? null}
          folders={folders}
          moveTarget={accountMoveTarget}
          busy={creatingFolder}
          onMoveTarget={setAccountMoveTarget}
          onMode={(mode) => setAccountMenu((current) => (current ? { ...current, mode } : current))}
          onAddToGroup={beginAddToGroup}
          onEdit={() => {
            const accountId = accountMenu.accountId;
            setAccountMenu(null);
            setEditorAccountId(accountId);
          }}
          onDelete={() => void deleteAccount()}
          onMove={() => void moveAccount()}
          onOpenProfile={() => {
            const accountId = accountMenu.accountId;
            setAccountMenu(null);
            router.push(`/dashboard/users?user=${encodeURIComponent(accountId)}`);
          }}
        />
      ) : null}
      {addingToGroup ? (
        <AddToGroupDialog
          accounts={accounts.filter((account) => addIds.includes(account.id))}
          groups={groupChoices}
          query={groupSearch}
          selectedId={groupTarget}
          busy={creatingFolder}
          onQuery={setGroupSearch}
          onSelect={setGroupTarget}
          onClose={() => {
            if (creatingFolder) return;
            setAddingToGroup(false);
            setAddIds([]);
          }}
          onConfirm={() => void addAccountsToGroup()}
        />
      ) : null}
      {pendingDeleteIds.length > 0 ? (
        <TrashConfirmDialog
          accounts={accounts.filter((account) => pendingDeleteIds.includes(account.id))}
          busy={creatingFolder}
          onClose={() => {
            if (creatingFolder) return;
            setPendingDeleteIds([]);
          }}
          onConfirm={() => void confirmTrashDelete()}
        />
      ) : null}
      {creator ? (
        <CreatePropAccountDialog
          mode={creator}
          folderName={openFolder?.name ?? "Main directory"}
          busy={creatingFolder}
          progress={createProgress}
          onClose={() => {
            if (creatingFolder) return;
            setCreator(null);
          }}
          onCreate={(input) => void createAccounts(input)}
        />
      ) : null}
      {editorAccountId ? (
        <EditAccountDialog
          account={accounts.find((account) => account.id === editorAccountId) ?? null}
          busy={creatingFolder}
          onClose={() => setEditorAccountId(null)}
          onSave={(next) => void saveAccount(next)}
        />
      ) : null}
    </div>
  );
}

function blockedFolderIds(folders: PropDirectoryFolder[], folderId: string) {
  const blocked = new Set<string>([folderId]);
  const walk = (id: string) => {
    for (const folder of folders) {
      if (folder.parentId === id && !blocked.has(folder.id)) {
        blocked.add(folder.id);
        walk(folder.id);
      }
    }
  };
  walk(folderId);
  return blocked;
}

export function FolderMenu({
  menu,
  folders,
  folderName,
  moveTarget,
  busy,
  onFolderName,
  onMoveTarget,
  onMode,
  onCreate,
  onNewAccount,
  onBulkAccounts,
  onRename,
  onDelete,
  onMove,
}: {
  menu: {
    x: number;
    y: number;
    folderId: string | null;
    mode: "create" | "name" | "actions" | "rename" | "move" | "delete";
  };
  folders: PropDirectoryFolder[];
  folderName: string;
  moveTarget: string;
  busy: boolean;
  onFolderName: (value: string) => void;
  onMoveTarget: (value: string) => void;
  onMode: (mode: "create" | "name" | "actions" | "rename" | "move" | "delete") => void;
  onCreate: () => void;
  onNewAccount?: () => void;
  onBulkAccounts?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const subject = menu.folderId ? folders.find((folder) => folder.id === menu.folderId) ?? null : null;
  const blocked = menu.folderId ? blockedFolderIds(folders, menu.folderId) : new Set<string>();
  const destinations = folders.filter((folder) => !blocked.has(folder.id));
  const itemCls = "flex w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800";
  const fieldCls =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-50 outline-none focus:border-violet-400";

  return (
    <div
      data-folder-menu
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="fixed z-50 w-60 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.mode === "create" ? (
        <>
          <button type="button" onClick={() => onMode("name")} className={itemCls}>
            New folder
          </button>
          {onNewAccount ? (
            <button type="button" onClick={onNewAccount} className={itemCls}>
              New prop account
            </button>
          ) : null}
          {onBulkAccounts ? (
            <button type="button" onClick={onBulkAccounts} className={itemCls}>
              Bulk prop accounts
            </button>
          ) : null}
        </>
      ) : null}
      {menu.mode === "name" || menu.mode === "rename" ? (
        <form
          className="flex flex-col gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (menu.mode === "rename") onRename();
            else onCreate();
          }}
        >
          <p className="text-xs font-semibold text-zinc-200">{menu.mode === "rename" ? "Rename folder" : "New folder"}</p>
          <input
            autoFocus
            value={folderName}
            onChange={(event) => onFolderName(event.target.value)}
            placeholder="Folder name"
            maxLength={40}
            className={fieldCls}
          />
          <button
            type="submit"
            disabled={busy || !folderName.trim()}
            className="rounded-lg bg-violet-400 px-2 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Saving…" : menu.mode === "rename" ? "Rename" : "Create"}
          </button>
        </form>
      ) : null}
      {menu.mode === "actions" && subject ? (
        <>
          <button type="button" onClick={() => onMode("rename")} className={itemCls}>
            Rename
          </button>
          <button type="button" onClick={() => onMode("move")} className={itemCls}>
            Move
          </button>
          <button type="button" onClick={() => onMode("delete")} className={`${itemCls} text-rose-200`}>
            Delete
          </button>
        </>
      ) : null}
      {menu.mode === "move" && subject ? (
        <form
          className="flex flex-col gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            onMove();
          }}
        >
          <p className="text-xs font-semibold text-zinc-200">Move {subject.name}</p>
          <select value={moveTarget} onChange={(event) => onMoveTarget(event.target.value)} className={fieldCls}>
            <option value="">Main directory</option>
            {destinations.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-violet-400 px-2 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </form>
      ) : null}
      {menu.mode === "delete" && subject ? (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-xs text-zinc-300">
            Delete {subject.name}? Profiles in it go back to the main directory.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-lg border border-rose-400/40 px-2 py-1.5 text-sm text-rose-100 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete folder"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AccountMenu({
  menu,
  account,
  folders,
  moveTarget,
  busy,
  onMoveTarget,
  onMode,
  onEdit,
  onDelete,
  onMove,
  onOpenProfile,
  onAddToGroup,
}: {
  menu: { x: number; y: number; accountId: string; mode: "actions" | "edit" | "move" | "delete" };
  account: PropDirectoryAccount | null;
  folders: PropDirectoryFolder[];
  moveTarget: string;
  busy: boolean;
  onMoveTarget: (value: string) => void;
  onMode: (mode: "actions" | "edit" | "move" | "delete") => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onOpenProfile: () => void;
  onAddToGroup?: () => void;
}) {
  const itemCls = "flex w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800";
  const fieldCls =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-50 outline-none focus:border-violet-400";
  const label = account ? accountName(account) : "Prop account";

  if (!account) return null;

  return (
    <div
      data-folder-menu
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="fixed z-50 w-64 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.mode === "actions" ? (
        <>
          <button type="button" onClick={onEdit} className={itemCls}>
            Edit
          </button>
          <button type="button" onClick={onOpenProfile} className={itemCls}>
            Open profile
          </button>
          {onAddToGroup ? (
            <button type="button" onClick={onAddToGroup} className={itemCls}>
              Add to group
            </button>
          ) : null}
          <button type="button" onClick={() => onMode("move")} className={itemCls}>
            Move
          </button>
          <button type="button" onClick={() => onMode("delete")} className={`${itemCls} text-rose-200`}>
            Delete
          </button>
        </>
      ) : null}
      {menu.mode === "move" ? (
        <form
          className="flex flex-col gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            onMove();
          }}
        >
          <p className="text-xs font-semibold text-zinc-200">Move {label}</p>
          <select value={moveTarget} onChange={(event) => onMoveTarget(event.target.value)} className={fieldCls}>
            <option value="">Main directory</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-violet-400 px-2 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </form>
      ) : null}
      {menu.mode === "delete" ? (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-xs text-zinc-300">Delete {label}? This removes the account.</p>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-lg border border-rose-400/40 px-2 py-1.5 text-sm text-rose-100 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AddToGroupDialog({
  accounts,
  groups,
  query,
  selectedId,
  busy,
  onQuery,
  onSelect,
  onClose,
  onConfirm,
}: {
  accounts: PropDirectoryAccount[];
  groups: Array<{ id: string; title: string; hubTitle: string | null }>;
  query: string;
  selectedId: string;
  busy: boolean;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const q = query.trim().toLowerCase();
  const visible = groups.filter((group) => !q || `${group.title} ${group.hubTitle ?? ""}`.toLowerCase().includes(q));
  const selected = groups.find((group) => group.id === selectedId) ?? null;
  const names = accounts.map(accountName);
  const who =
    names.length === 0
      ? "these accounts"
      : names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names[0]} and ${names.length - 1} others`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        data-folder-menu
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-violet-300/80">Prop accounts</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-50">Add to a group</h2>
            <p className="mt-1 text-sm text-zinc-400">{who}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100">
            Close
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search groups"
          className="mt-5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-violet-400"
        />
        <div className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-2xl border border-zinc-800 p-2">
          {groups.length === 0 ? <p className="px-2 py-6 text-center text-sm text-zinc-500">Loading groups…</p> : null}
          {groups.length > 0 && visible.length === 0 ? <p className="px-2 py-6 text-center text-sm text-zinc-500">No groups match.</p> : null}
          {visible.map((group) => {
            const picked = group.id === selectedId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelect(group.id)}
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left ${
                  picked ? "bg-violet-400/15 ring-1 ring-violet-300" : "hover:bg-zinc-800"
                }`}
              >
                <span className="truncate text-sm font-medium text-zinc-100">{group.title}</span>
                <span className="truncate text-xs text-zinc-500">{group.hubTitle ?? "No hub"}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-zinc-400">{selected ? selected.title : "Choose a group"}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !selectedId}
              className="rounded-xl bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function EditAccountDialog({
  account,
  busy,
  onClose,
  onSave,
}: {
  account: PropDirectoryAccount | null;
  busy: boolean;
  onClose: () => void;
  onSave: (next: { fullName: string; username: string; bio: string; avatar: File | null; voice: PropVoice }) => void;
}) {
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [bio, setBio] = useState(account?.bio ?? "");
  const [voice, setVoice] = useState<PropVoice>(account?.voice ?? { ...EMPTY_PROP_VOICE });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(account?.avatarUrl ?? null);
  const fieldCls =
    "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-violet-400";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  if (!account) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        data-folder-menu
        className="flex max-h-[min(92vh,56rem)] w-full max-w-xl flex-col rounded-3xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ fullName, username, bio, avatar: avatarFile, voice });
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-violet-300/80">Prop account</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-50">Edit profile</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100">
            Close
          </button>
        </div>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-zinc-700 bg-zinc-950">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-violet-100">
                {accountName(account).slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <label className="cursor-pointer rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500">
            Change avatar
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <label className="mt-5 block text-xs text-zinc-400">
          Name
          <input className={`${fieldCls} mt-1`} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          Username
          <input className={`${fieldCls} mt-1`} value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          Bio
          <textarea
            className={`${fieldCls} mt-1 min-h-24 resize-y`}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
        </label>
        <div className="mt-6 border-t border-zinc-800 pt-5">
          <p className="text-sm font-medium text-zinc-100">Behavior</p>
          <p className="mt-1 text-xs text-zinc-500">
            Age, interests, and temperament change what this account talks about and how they phrase it. Cuss words, grammar, and abbreviations can follow the conversation. Behavior notes always control this account.
          </p>
          <div className="mt-4">
            <PropVoiceFields voice={voice} disabled={busy} fieldClassName={fieldCls} onChange={setVoice} />
          </div>
        </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !fullName.trim()}
            className="rounded-xl bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TrashConfirmDialog({
  accounts: queued,
  busy,
  onClose,
  onConfirm,
}: {
  accounts: PropDirectoryAccount[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const preview = queued.slice(0, 6);
  const extra = queued.length - preview.length;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        data-folder-menu
        className="w-full max-w-md rounded-3xl border border-rose-400/30 bg-zinc-900 p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-rose-300/80">Delete</p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-50">
          Delete {queued.length === 1 ? "this prop account" : `${queued.length} prop accounts`}?
        </h2>
        <ul className="mt-4 space-y-1 text-sm text-zinc-300">
          {preview.map((account) => (
            <li key={account.id} className="truncate">
              {accountName(account)}
            </li>
          ))}
          {extra > 0 ? <li className="text-zinc-500">and {extra} more</li> : null}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || queued.length === 0}
            className="rounded-xl bg-rose-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CREATE_PHASES = [
  "allocating identity",
  "resolving handle",
  "writing profile",
  "seeding connections",
  "filing account",
];

function CreateSequence({ progress }: { progress: { done: number; total: number } | null }) {
  const total = Math.max(1, progress?.total ?? 1);
  const done = progress?.done ?? 0;
  const ratio = Math.min(1, done / total);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((current) => current + 1), 160);
    return () => window.clearInterval(id);
  }, []);

  const phase = CREATE_PHASES[tick % CREATE_PHASES.length] ?? CREATE_PHASES[0];
  const signal = Array.from({ length: 6 }, (_, index) => ((tick * 19 + index * 37) % 256).toString(16).padStart(2, "0")).join(" ");
  const log = Array.from({ length: 4 }, (_, index) => {
    const phaseIndex = (tick + index) % CREATE_PHASES.length;
    return CREATE_PHASES[phaseIndex] ?? CREATE_PHASES[0];
  });

  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-cyan-400/30 bg-zinc-950 p-4 shadow-[inset_0_0_40px_rgba(34,211,238,0.06)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-cyan-300/25 to-transparent"
        style={{ animation: "prop-scan 2.4s linear infinite" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.08) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="relative flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <div
            className="absolute inset-0 rounded-full border border-cyan-300/50"
            style={{ animation: "prop-spin 2.8s linear infinite" }}
          />
          <div
            className="absolute inset-1.5 rounded-full border border-dashed border-violet-300/70"
            style={{ animation: "prop-spin-reverse 4.5s linear infinite" }}
          />
          <div
            className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_16px_#67e8f9]"
            style={{ animation: "prop-core 1.15s ease-in-out infinite" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">Sequence live</p>
          <p className="mt-1 font-mono text-sm text-zinc-50">
            {phase}
            <span
              className="ml-1 inline-block h-3.5 w-1.5 translate-y-0.5 bg-cyan-300"
              style={{ animation: "prop-blink 1s steps(1) infinite" }}
            />
          </p>
          <p className="mt-1 truncate font-mono text-[10px] tracking-widest text-zinc-500">{signal}</p>
        </div>
        <p className="font-mono text-sm tabular-nums text-cyan-100">
          {String(done).padStart(2, "0")}
          <span className="text-zinc-600">/{String(total).padStart(2, "0")}</span>
        </p>
      </div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-[width] duration-500"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
        <div
          className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          style={{ animation: "prop-shimmer 1.35s linear infinite" }}
        />
      </div>
      <div className="relative mt-3 space-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {log.map((line, index) => (
          <p key={`${line}-${index}`} className={index === log.length - 1 ? "text-cyan-200/90" : ""}>
            <span className="text-zinc-600">{String(index + 1).padStart(2, "0")}</span> {line}
          </p>
        ))}
      </div>
      {total > 1 ? (
        <div className="relative mt-3 grid grid-cols-10 gap-1">
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-sm transition-colors ${
                index < done ? "bg-cyan-300 shadow-[0_0_8px_#67e8f9]" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreatePropAccountDialog({
  mode,
  folderName,
  busy,
  progress,
  onClose,
  onCreate,
}: {
  mode: "single" | "bulk";
  folderName: string;
  busy: boolean;
  progress: { done: number; total: number } | null;
  onClose: () => void;
  onCreate: (input: {
    count: number;
    includeBio: boolean;
    fullName: string;
    username: string;
    bio: string;
    connectionMin: number | null;
    connectionMax: number | null;
  }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [count, setCount] = useState(5);
  const [includeBio, setIncludeBio] = useState(false);
  const [bio, setBio] = useState("");
  const [connectionMin, setConnectionMin] = useState(5);
  const [connectionMax, setConnectionMax] = useState(40);
  const fieldCls =
    "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-violet-400";
  const bulk = mode === "bulk";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function chooseBio(next: boolean) {
    setIncludeBio(next);
    if (next && !bio.trim()) setBio(randomPropBio());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        data-folder-menu
        className={`w-full max-w-md rounded-3xl border bg-zinc-900 p-5 shadow-2xl ${
          busy ? "border-cyan-400/40 shadow-[0_0_48px_rgba(34,211,238,0.14)]" : "border-zinc-700"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({
            count: bulk ? count : 1,
            includeBio,
            fullName,
            username,
            bio,
            connectionMin: bulk ? Math.min(500, Math.max(0, Math.round(connectionMin) || 0)) : null,
            connectionMax: bulk ? Math.min(500, Math.max(0, Math.round(connectionMax) || 0)) : null,
          });
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-violet-300/80">{folderName}</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-50">{bulk ? "Bulk prop accounts" : "New prop account"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100">
            Close
          </button>
        </div>
        {busy ? (
          <CreateSequence progress={progress} />
        ) : (
          <>
        <p className="mt-2 text-sm text-zinc-400">
          {bulk
            ? `Creates accounts with random names and adds them to ${folderName === "Main directory" ? "the main directory" : folderName}.`
            : `Adds one account to ${folderName === "Main directory" ? "the main directory" : folderName}. Leave the name blank to generate one.`}
        </p>
        {bulk ? (
          <label className="mt-5 block text-xs text-zinc-400">
            How many
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              disabled={busy}
              onChange={(event) => setCount(Number(event.target.value))}
              className={`${fieldCls} mt-1`}
            />
          </label>
        ) : (
          <>
            <label className="mt-5 block text-xs text-zinc-400">
              Name
              <input
                autoFocus
                value={fullName}
                disabled={busy}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Random name if empty"
                className={`${fieldCls} mt-1`}
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-400">
              Username
              <input
                value={username}
                disabled={busy}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Leave empty to auto-generate"
                className={`${fieldCls} mt-1`}
              />
            </label>
          </>
        )}
        <div className="mt-4">
          <p className="text-xs text-zinc-400">Bio</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => chooseBio(false)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                includeBio ? "border-zinc-700 text-zinc-300 hover:border-zinc-500" : "border-violet-300 bg-violet-400/15 text-violet-100"
              }`}
            >
              No bio
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => chooseBio(true)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                includeBio ? "border-violet-300 bg-violet-400/15 text-violet-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              Have bio
            </button>
          </div>
        </div>
        {!bulk && includeBio ? (
          <label className="mt-3 block text-xs text-zinc-400">
            Bio text
            <textarea
              value={bio}
              disabled={busy}
              onChange={(event) => setBio(event.target.value)}
              className={`${fieldCls} mt-1 min-h-24 resize-y`}
            />
          </label>
        ) : null}
        {bulk && includeBio ? (
          <p className="mt-2 text-xs text-zinc-500">Each account gets its own bio.</p>
        ) : null}
        {bulk ? (
          <div className="mt-4">
            <p className="text-xs text-zinc-400">Fake connections</p>
            <p className="mt-1 text-xs text-zinc-500">Each account gets a random count in this range.</p>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="text-xs text-zinc-400">
                Min
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={connectionMin}
                  disabled={busy}
                  onChange={(event) => setConnectionMin(Number(event.target.value))}
                  className={`${fieldCls} mt-1`}
                />
              </label>
              <span className="pt-4 text-xs text-zinc-500">to</span>
              <label className="text-xs text-zinc-400">
                Max
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={connectionMax}
                  disabled={busy}
                  onChange={(event) => setConnectionMax(Number(event.target.value))}
                  className={`${fieldCls} mt-1`}
                />
              </label>
            </div>
          </div>
        ) : null}
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (bulk && (!Number.isFinite(count) || count < 1))}
            className={`rounded-xl bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950 ${
              busy ? "animate-pulse shadow-[0_0_18px_rgba(167,139,250,0.55)] disabled:opacity-100" : "disabled:opacity-50"
            }`}
          >
            {busy ? "Transmitting" : bulk ? "Create accounts" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}
