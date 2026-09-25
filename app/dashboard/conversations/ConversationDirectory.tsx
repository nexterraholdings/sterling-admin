"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Folder } from "lucide-react";
import { toast } from "sonner";
import { deleteUserAccount, updateProAccount } from "@/app/dashboard/users/actions";
import { AccountMenu, EditAccountDialog, FolderMenu } from "@/app/dashboard/users/prop-accounts/PropAccountsView";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { PropDirectoryAccount, PropDirectoryFolder } from "@/lib/groups/propFolders";
import type { ConversationFolder, ConversationPersona } from "@/lib/conversations/types";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50";

type Marquee = { left: number; top: number; width: number; height: number };

function rectsOverlap(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join("") || "?";
}

function isSelfOrDescendant(folders: ConversationFolder[], folderId: string, targetId: string) {
  if (folderId === targetId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let parent = byId.get(targetId)?.parentId ?? null;
  const seen = new Set<string>();
  while (parent) {
    if (parent === folderId) return true;
    if (seen.has(parent)) return false;
    seen.add(parent);
    parent = byId.get(parent)?.parentId ?? null;
  }
  return false;
}

function asDirectoryAccount(persona: ConversationPersona): PropDirectoryAccount {
  return {
    id: persona.userId,
    username: persona.username,
    fullName: persona.name,
    avatarUrl: persona.avatarUrl,
    bio: persona.bio,
    createdAt: null,
    folderIds: persona.folderId ? [persona.folderId] : [],
  };
}

export function ConversationDirectory({
  personas,
  folders,
  selectedAccountId,
  onSelectAccount,
  onPersonas,
  onFolders,
}: {
  personas: ConversationPersona[];
  folders: ConversationFolder[];
  selectedAccountId: string | null;
  onSelectAccount: (userId: string) => void;
  onPersonas: (next: ConversationPersona[]) => void;
  onFolders: (next: ConversationFolder[]) => void;
}) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragAccountRef = useRef<string[]>([]);
  const dragFolderRef = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const [query, setQuery] = useState("");
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [accountMoveTarget, setAccountMoveTarget] = useState("");
  const [editorAccountId, setEditorAccountId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    folderId: string | null;
    mode: "create" | "name" | "actions" | "rename" | "move" | "delete";
  } | null>(null);
  const [accountMenu, setAccountMenu] = useState<{
    x: number;
    y: number;
    accountId: string;
    mode: "actions" | "edit" | "move" | "delete";
  } | null>(null);

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
  const menuFolders: PropDirectoryFolder[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    userIds: personas.filter((persona) => persona.folderId === folder.id).map((persona) => persona.userId),
  }));

  useEffect(() => {
    if (openFolderId && !folders.some((folder) => folder.id === openFolderId)) setOpenFolderId(null);
  }, [openFolderId, folders]);

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
    const q = query.trim().toLowerCase();
    return folders
      .filter((folder) => folder.parentId === parentId)
      .filter((folder) => !q || folder.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, openFolder, query]);

  const visibleAccounts = useMemo(() => {
    const parentId = openFolder?.id ?? null;
    const q = query.trim().toLowerCase();
    return personas.filter((persona) => {
      const inDirectory = parentId ? persona.folderId === parentId : !persona.folderId;
      if (!inDirectory) return false;
      return !q || `${persona.name} ${persona.username ?? ""}`.toLowerCase().includes(q);
    });
  }, [personas, openFolder, query]);

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

  function onBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || organizing) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-account-id], [data-folder-id]")) return;
    const board = boardRef.current;
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    const origin = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    marqueeOrigin.current = origin;
    setMarquee({ left: origin.x, top: origin.y, width: 0, height: 0 });
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

  function leaveFolder() {
    suppressClick.current = false;
    setDropTarget(null);
    setSelectedIds([]);
    setOpenFolderId(null);
  }

  function onMainPointerDown(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function onMainClick() {
    if (dragAccountRef.current.length > 0 || dragFolderRef.current) return;
    leaveFolder();
  }

  function clearDrag() {
    dragAccountRef.current = [];
    dragFolderRef.current = null;
    setDraggingIds([]);
    setDraggingFolderId(null);
    setDropTarget(null);
  }

  function allowDrop(event: DragEvent<HTMLElement>, targetId: string) {
    const folderDrag = dragFolderRef.current;
    const accountDrag = dragAccountRef.current;
    if ((!folderDrag && accountDrag.length === 0) || organizing) return;
    if (folderDrag && targetId !== "main" && isSelfOrDescendant(folders, folderDrag, targetId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget((current) => (current === targetId ? current : targetId));
  }

  function takeDrag(event: DragEvent<HTMLElement>) {
    const rawFolder = event.dataTransfer.getData("application/x-prop-folder");
    const rawAccounts = event.dataTransfer.getData("application/x-prop-accounts");
    let folderId = dragFolderRef.current;
    let accountIds = dragAccountRef.current;
    if (rawFolder) folderId = rawFolder;
    if (rawAccounts) {
      try {
        const parsed = JSON.parse(rawAccounts) as unknown;
        if (Array.isArray(parsed)) accountIds = parsed.map((id) => String(id));
      } catch {
        accountIds = dragAccountRef.current;
      }
    }
    clearDrag();
    return { folderId, accountIds };
  }

  async function moveFolderTo(folderId: string, parentId: string | null) {
    const current = folders.find((folder) => folder.id === folderId);
    if (!current || current.parentId === parentId) return;
    if (parentId && isSelfOrDescendant(folders, folderId, parentId)) {
      toast.error("A folder cannot move into itself.");
      return;
    }
    const previous = folders;
    onFolders(folders.map((folder) => (folder.id === folderId ? { ...folder, parentId } : folder)));
    setOrganizing(true);
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
      onFolders(previous);
      toast.error(error instanceof Error ? error.message : "Failed to move folder");
    } finally {
      setOrganizing(false);
    }
  }

  async function assignAccounts(userIds: string[], folderId: string | null) {
    const moving = userIds.filter((id) => {
      const persona = personas.find((item) => item.userId === id);
      return persona && persona.folderId !== folderId;
    });
    if (moving.length === 0) return;
    const movingSet = new Set(moving);
    const previous = personas;
    setSelectedIds([]);
    onPersonas(personas.map((persona) => (movingSet.has(persona.userId) ? { ...persona, folderId } : persona)));
    setOrganizing(true);
    try {
      const res = await fetch("/api/admin/prop-folders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: moving, folderId }),
      });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to move the accounts");
    } catch (error) {
      onPersonas(previous);
      toast.error(error instanceof Error ? error.message : "Failed to move the accounts");
    } finally {
      setOrganizing(false);
    }
  }

  async function dropOnTarget(event: DragEvent<HTMLElement>, targetId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const drag = takeDrag(event);
    if (drag.folderId) {
      if (targetId && isSelfOrDescendant(folders, drag.folderId, targetId)) return;
      await moveFolderTo(drag.folderId, targetId);
      return;
    }
    if (drag.accountIds.length === 0) return;
    await assignAccounts(drag.accountIds, targetId);
  }

  function openFolderMenu(event: ReactMouseEvent, folderId: string | null) {
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

  function openAccountMenu(event: ReactMouseEvent, accountId: string) {
    event.preventDefault();
    event.stopPropagation();
    const persona = personas.find((item) => item.userId === accountId);
    setMenu(null);
    setAccountMoveTarget(persona?.folderId ?? "");
    setAccountMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 280)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 280)),
      accountId,
      mode: "actions",
    });
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name || organizing) return;
    const parentId = openFolder?.id ?? null;
    setOrganizing(true);
    try {
      const res = await fetch("/api/admin/prop-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      const payload = await readApiJson<{ folder?: { id: string; name: string; parentId: string | null }; error?: string }>(res);
      if (!res.ok || !payload.folder) throw new Error(payload.error ?? "Failed to create folder");
      onFolders(
        [
          ...folders,
          {
            id: payload.folder.id,
            name: payload.folder.name,
            parentId: payload.folder.parentId ?? parentId,
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      toast.success(`Created folder "${payload.folder.name}".`);
      setMenu(null);
      setFolderName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    } finally {
      setOrganizing(false);
    }
  }

  async function renameFolder() {
    if (!menu?.folderId || organizing) return;
    const name = folderName.trim();
    if (!name) return;
    const folderId = menu.folderId;
    const previous = folders;
    onFolders(folders.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)));
    setOrganizing(true);
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
      onFolders(previous);
      toast.error(error instanceof Error ? error.message : "Failed to rename folder");
    } finally {
      setOrganizing(false);
    }
  }

  async function deleteFolder() {
    if (!menu?.folderId || organizing) return;
    const folderId = menu.folderId;
    const removed = folders.find((folder) => folder.id === folderId);
    if (!removed) return;
    const previousFolders = folders;
    const previousPersonas = personas;
    onFolders(
      folders
        .filter((folder) => folder.id !== folderId)
        .map((folder) => (folder.parentId === folderId ? { ...folder, parentId: removed.parentId } : folder)),
    );
    onPersonas(personas.map((persona) => (persona.folderId === folderId ? { ...persona, folderId: null } : persona)));
    if (openFolderId === folderId) setOpenFolderId(removed.parentId);
    setMenu(null);
    setOrganizing(true);
    try {
      const res = await fetch(`/api/admin/prop-folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
      const payload = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete folder");
      toast.success(`Deleted folder "${removed.name}".`);
    } catch (error) {
      onFolders(previousFolders);
      onPersonas(previousPersonas);
      toast.error(error instanceof Error ? error.message : "Failed to delete folder");
    } finally {
      setOrganizing(false);
    }
  }

  async function moveFolderFromMenu() {
    if (!menu?.folderId || organizing) return;
    const folderId = menu.folderId;
    setMenu(null);
    await moveFolderTo(folderId, moveTarget || null);
  }

  async function moveAccountFromMenu() {
    if (!accountMenu || organizing) return;
    const accountId = accountMenu.accountId;
    const folderId = accountMoveTarget || null;
    setAccountMenu(null);
    await assignAccounts([accountId], folderId);
  }

  async function saveAccount(next: { fullName: string; username: string; bio: string; avatar: File | null }) {
    if (!editorAccountId || organizing) return;
    const accountId = editorAccountId;
    setOrganizing(true);
    try {
      const formData = new FormData();
      formData.set("full_name", next.fullName);
      formData.set("username", next.username);
      formData.set("bio", next.bio);
      if (next.avatar) formData.set("avatar", next.avatar);
      const saved = await updateProAccount(accountId, formData);
      onPersonas(
        personas.map((persona) =>
          persona.userId === accountId
            ? {
                ...persona,
                name: saved.fullName?.trim() || persona.name,
                username: saved.username,
                bio: saved.bio ?? "",
                avatarUrl: saved.avatarUrl,
              }
            : persona,
        ),
      );
      toast.success("Saved the prop account.");
      setEditorAccountId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the prop account");
    } finally {
      setOrganizing(false);
    }
  }

  async function deleteAccount() {
    if (!accountMenu || organizing) return;
    const accountId = accountMenu.accountId;
    const removed = personas.find((persona) => persona.userId === accountId);
    const previous = personas;
    onPersonas(personas.filter((persona) => persona.userId !== accountId));
    setAccountMenu(null);
    setOrganizing(true);
    try {
      await deleteUserAccount(accountId);
      toast.success(`Deleted ${removed?.name || "the prop account"}.`);
    } catch (error) {
      onPersonas(previous);
      toast.error(error instanceof Error ? error.message : "Could not delete the prop account");
    } finally {
      setOrganizing(false);
    }
  }

  const editorPersona = editorAccountId ? personas.find((persona) => persona.userId === editorAccountId) ?? null : null;
  const menuAccount = accountMenu ? personas.find((persona) => persona.userId === accountMenu.accountId) ?? null : null;

  return (
    <section
      className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4"
      onContextMenu={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          openFolderMenu(event, null);
          return;
        }
        if (target.closest("[data-account-id]")) return;
        const folder = target.closest("[data-folder-id]");
        if (folder instanceof HTMLElement && folder.dataset.folderId && folder.dataset.folderId !== "main") return;
        openFolderMenu(event, null);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-300/70">
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
                  setDropTarget((current) => (current === "main" ? null : current));
                }}
                onDrop={(event) => void dropOnTarget(event, null)}
                className={`truncate rounded-lg px-1.5 py-0.5 ${
                  dropTarget === "main" ? "bg-cyan-400/20 text-cyan-100" : "text-cyan-200 hover:text-cyan-100"
                }`}
              >
                Main
              </button>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-zinc-200">{openFolder.name}</span>
            </>
          ) : (
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : `Prop accounts · ${visibleAccounts.length}`}
            </span>
          )}
        </div>
        <div className="w-full max-w-xs">
          <input
            className={inputCls}
            placeholder="Search folders and accounts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
        className={`relative mt-3 grid min-h-72 grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] content-start gap-3 ${marquee ? "select-none" : ""}`}
      >
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
              setDropTarget((current) => (current === "main" ? null : current));
            }}
            onDrop={(event) => void dropOnTarget(event, null)}
            className={`flex cursor-pointer flex-col justify-center gap-1 rounded-2xl border border-dashed px-3 py-3 text-left ${
              dropTarget === "main" ? "border-cyan-300 bg-cyan-400/15" : "border-zinc-700 bg-zinc-950/40 hover:border-zinc-500"
            }`}
          >
            <span className="pointer-events-none text-sm font-medium text-zinc-100">Main directory</span>
            <span className="pointer-events-none text-xs text-zinc-500">Drop a folder or account here to move it out.</span>
          </div>
        ) : null}
        {visibleFolders.map((folder) => {
          const accountCount = personas.filter((persona) => persona.folderId === folder.id).length;
          const childCount = folders.filter((item) => item.parentId === folder.id).length;
          const dropping = dropTarget === folder.id;
          const dragging = draggingFolderId === folder.id;
          return (
            <div
              key={folder.id}
              role="button"
              tabIndex={0}
              draggable={!organizing}
              data-folder-id={folder.id}
              onContextMenu={(event) => openFolderMenu(event, folder.id)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (suppressClick.current) return;
                setSelectedIds([]);
                setOpenFolderId(folder.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setOpenFolderId(folder.id);
              }}
              onDragStart={(event) => {
                suppressClick.current = true;
                dragFolderRef.current = folder.id;
                dragAccountRef.current = [];
                event.dataTransfer.setData("application/x-prop-folder", folder.id);
                event.dataTransfer.setData("text/plain", folder.name);
                event.dataTransfer.effectAllowed = "move";
                setDraggingFolderId(folder.id);
              }}
              onDragEnd={() => {
                clearDrag();
                window.setTimeout(() => {
                  suppressClick.current = false;
                }, 80);
              }}
              onDragOver={(event) => allowDrop(event, folder.id)}
              onDragLeave={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next)) return;
                setDropTarget((current) => (current === folder.id ? null : current));
              }}
              onDrop={(event) => void dropOnTarget(event, folder.id)}
              className={`flex w-full cursor-grab items-center gap-3 rounded-2xl border px-3 py-3 text-left active:cursor-grabbing ${
                dropping ? "border-amber-300 bg-amber-300/10" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
              } ${dragging ? "opacity-40" : ""}`}
            >
              <Folder className={`pointer-events-none h-8 w-8 shrink-0 ${dropping ? "text-amber-200" : "text-amber-300"}`} />
              <span className="pointer-events-none min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">{folder.name}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {accountCount} {accountCount === 1 ? "account" : "accounts"}
                  {childCount > 0 ? ` · ${childCount} ${childCount === 1 ? "folder" : "folders"}` : ""}
                </span>
              </span>
            </div>
          );
        })}
        {visibleAccounts.map((persona) => {
          const picked = selectedIds.includes(persona.userId);
          const selected = picked || (selectedIds.length === 0 && selectedAccountId === persona.userId);
          const dragging = draggingIds.includes(persona.userId);
          return (
            <button
              key={persona.userId}
              type="button"
              draggable={!organizing}
              data-account-id={persona.userId}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => openAccountMenu(event, persona.userId)}
              onClick={(event) => {
                if (suppressClick.current) return;
                if (event.metaKey || event.ctrlKey) {
                  setSelectedIds((current) =>
                    current.includes(persona.userId) ? current.filter((id) => id !== persona.userId) : [...current, persona.userId],
                  );
                  return;
                }
                setSelectedIds([persona.userId]);
                onSelectAccount(persona.userId);
              }}
              onDragStart={(event) => {
                const ids = selectedIds.includes(persona.userId) ? selectedIds : [persona.userId];
                suppressClick.current = true;
                dragAccountRef.current = ids;
                dragFolderRef.current = null;
                event.dataTransfer.setData("application/x-prop-accounts", JSON.stringify(ids));
                event.dataTransfer.setData("text/plain", ids.join(","));
                event.dataTransfer.effectAllowed = "move";
                setDraggingIds(ids);
              }}
              onDragEnd={() => {
                clearDrag();
                window.setTimeout(() => {
                  suppressClick.current = false;
                }, 80);
              }}
              className={`flex w-full cursor-grab items-center gap-3 rounded-2xl border px-3 py-3 text-left active:cursor-grabbing ${
                selected ? "border-cyan-400/40 bg-cyan-400/10" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
              } ${dragging ? "opacity-40" : ""}`}
            >
              {persona.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={persona.avatarUrl} alt="" draggable={false} className="pointer-events-none h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-cyan-100">
                  {initials(persona.name)}
                </span>
              )}
              <span className="pointer-events-none min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">{persona.name}</span>
                <span className="block truncate text-xs text-zinc-500">{persona.username ? `@${persona.username}` : "No username"}</span>
              </span>
            </button>
          );
        })}
        {visibleFolders.length === 0 && visibleAccounts.length === 0 ? (
          <p className="px-1 py-3 text-sm text-zinc-500">
            {query.trim() ? "Nothing matches." : openFolder ? "This folder is empty." : "No prop accounts yet."}
          </p>
        ) : null}
        {marquee && (marquee.width > 2 || marquee.height > 2) ? (
          <div
            className="pointer-events-none absolute z-10 border border-cyan-300 bg-cyan-400/20"
            style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
          />
        ) : null}
      </div>
      {menu ? (
        <FolderMenu
          menu={menu}
          folders={menuFolders}
          folderName={folderName}
          moveTarget={moveTarget}
          busy={organizing}
          onFolderName={setFolderName}
          onMoveTarget={setMoveTarget}
          onMode={(mode) => setMenu((current) => (current ? { ...current, mode } : current))}
          onCreate={() => void createFolder()}
          onRename={() => void renameFolder()}
          onDelete={() => void deleteFolder()}
          onMove={() => void moveFolderFromMenu()}
        />
      ) : null}
      {accountMenu ? (
        <AccountMenu
          menu={accountMenu}
          account={menuAccount ? asDirectoryAccount(menuAccount) : null}
          folders={menuFolders}
          moveTarget={accountMoveTarget}
          busy={organizing}
          onMoveTarget={setAccountMoveTarget}
          onMode={(mode) => setAccountMenu((current) => (current ? { ...current, mode } : current))}
          onEdit={() => {
            const accountId = accountMenu.accountId;
            setAccountMenu(null);
            setEditorAccountId(accountId);
          }}
          onDelete={() => void deleteAccount()}
          onMove={() => void moveAccountFromMenu()}
          onOpenProfile={() => {
            const accountId = accountMenu.accountId;
            setAccountMenu(null);
            router.push(`/dashboard/users?user=${encodeURIComponent(accountId)}`);
          }}
        />
      ) : null}
      {editorPersona ? (
        <EditAccountDialog
          account={asDirectoryAccount(editorPersona)}
          busy={organizing}
          onClose={() => setEditorAccountId(null)}
          onSave={(next) => void saveAccount(next)}
        />
      ) : null}
    </section>
  );
}
