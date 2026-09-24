"use client";

import { useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronRight, Folder } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/admin/ui";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { PropAccountDirectory, PropDirectoryAccount, PropDirectoryFolder } from "@/lib/groups/propFolders";

type Marquee = { left: number; top: number; width: number; height: number };

function accountName(account: PropDirectoryAccount): string {
  return account.fullName?.trim() || (account.username ? `@${account.username}` : account.id.slice(0, 8));
}

function rectsOverlap(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function PropAccountsView({ directory }: { directory: PropAccountDirectory }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [accounts, setAccounts] = useState(directory.accounts);
  const [folders, setFolders] = useState(directory.folders);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [movingIds, setMovingIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const term = search.trim().toLowerCase();

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;

  const visibleFolders = useMemo(() => {
    if (openFolder) return [];
    if (!term) return folders;
    return folders.filter((folder) => `${folder.name} ${folder.groupTitle}`.toLowerCase().includes(term));
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
            ? "This folder is empty."
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

  function allowDrop(event: DragEvent<HTMLButtonElement>, folderId: string) {
    if (dragIds.length === 0 || movingIds.length > 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropFolderId((current) => (current === folderId ? current : folderId));
  }

  async function dropOnFolder(event: DragEvent<HTMLButtonElement>, folder: PropDirectoryFolder) {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("application/x-prop-accounts");
    let ids = dragIds;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) ids = parsed.map((id) => String(id));
      } catch {
        ids = dragIds;
      }
    }
    setDropFolderId(null);
    setDragIds([]);
    const userIds = [...new Set(ids)].filter((id) => {
      const account = accounts.find((item) => item.id === id);
      return account && !account.folderIds.includes(folder.id);
    });
    if (userIds.length === 0 || movingIds.length > 0) return;

    const moving = new Set(userIds);
    const sameGroupIds = new Set(folders.filter((item) => item.groupId === folder.groupId).map((item) => item.id));
    const previousAccounts = accounts;
    const previousFolders = folders;
    setMovingIds(userIds);
    setAccounts((current) =>
      current.map((item) =>
        moving.has(item.id)
          ? { ...item, folderIds: [...item.folderIds.filter((id) => !sameGroupIds.has(id)), folder.id] }
          : item,
      ),
    );
    setFolders((current) =>
      current.map((item) => {
        if (item.id === folder.id) {
          const merged = new Set(item.userIds);
          for (const id of userIds) merged.add(id);
          return { ...item, userIds: [...merged] };
        }
        if (sameGroupIds.has(item.id)) {
          return { ...item, userIds: item.userIds.filter((id) => !moving.has(id)) };
        }
        return item;
      }),
    );
    setSelectedIds([]);

    try {
      const memberRes = await fetch(`/api/admin/groups/${encodeURIComponent(folder.groupId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
      const memberPayload = await readApiJson<{ error?: string }>(memberRes);
      if (!memberRes.ok) throw new Error(memberPayload.error ?? "Failed to add the accounts to the group");

      const res = await fetch(`/api/admin/groups/${encodeURIComponent(folder.groupId)}/folders/assign`, {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 text-sm font-semibold text-zinc-200">
          {openFolder ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpenFolderId(null);
                  setSelectedIds([]);
                }}
                className="truncate text-violet-300 hover:text-violet-200"
              >
                Folders
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search folders and accounts"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 sm:max-w-xs"
        />
      </div>

      {empty ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-500">
          {empty}
        </div>
      ) : (
        <div
          ref={boardRef}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={onBoardPointerUp}
          className={`relative grid min-h-72 grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] content-start gap-3 ${
            marquee ? "select-none" : ""
          }`}
        >
          {visibleFolders.map((folder) => {
            const dropping = dropFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                data-folder-id={folder.id}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  setSelectedIds([]);
                  setOpenFolderId(folder.id);
                }}
                onDragOver={(event) => allowDrop(event, folder.id)}
                onDragLeave={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
                  setDropFolderId((current) => (current === folder.id ? null : current));
                }}
                onDrop={(event) => void dropOnFolder(event, folder)}
                className={`flex flex-col gap-3 rounded-2xl border bg-zinc-900 p-4 text-left transition ${
                  dropping
                    ? "border-amber-300 bg-amber-300/10"
                    : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/70"
                }`}
              >
                <Folder className={`h-10 w-10 ${dropping ? "text-amber-200" : "text-amber-300"}`} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-50">{folder.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">
                    {folder.groupTitle} · {folder.userIds.length}
                  </span>
                </span>
              </button>
            );
          })}
          {visibleAccounts.map((account) => {
            const selected = selectedSet.has(account.id);
            const dragging = dragIds.includes(account.id);
            const moving = movingSet.has(account.id);
            return (
              <div
                key={account.id}
                data-account-id={account.id}
                draggable={!moving}
                onDragStart={(event) => {
                  const ids = selectedSet.has(account.id) ? activeSelection : [account.id];
                  event.dataTransfer.setData("application/x-prop-accounts", JSON.stringify(ids));
                  event.dataTransfer.setData("text/plain", ids.join(","));
                  event.dataTransfer.effectAllowed = "move";
                  setDragIds(ids);
                }}
                onDragEnd={() => {
                  setDragIds([]);
                  setDropFolderId(null);
                }}
                className={`flex cursor-grab flex-col gap-3 rounded-2xl border bg-zinc-950 p-4 active:cursor-grabbing ${
                  selected ? "border-violet-400 bg-violet-500/10 ring-2 ring-violet-400/70" : "border-zinc-800"
                } ${dragging ? "opacity-40" : ""} ${moving ? "cursor-wait opacity-60" : ""}`}
              >
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatarUrl} alt="" className="pointer-events-none h-10 w-10 rounded-full object-cover" />
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
        </div>
      )}
    </div>
  );
}
