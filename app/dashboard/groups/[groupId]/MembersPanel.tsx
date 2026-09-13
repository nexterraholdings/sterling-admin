"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, personLabel } from "@/app/dashboard/discussions/discussionUi";
import { generateProAccount, listProAccounts, type ProAccountStub } from "@/app/dashboard/users/actions";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import { SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";
import type { AdminGroupMember } from "@/lib/groups/types";

function PropPill() {
  return (
    <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200 ring-1 ring-blue-500/25">
      Prop
    </span>
  );
}

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

export function MembersPanel({ groupId }: { groupId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminGroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [proAccounts, setProAccounts] = useState<ProAccountStub[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [fakeCount, setFakeCount] = useState(5);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState<{ done: number; total: number } | null>(null);

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

  useEffect(() => {
    loadMembers();
    loadProAccounts();
  }, [loadMembers, loadProAccounts]);

  const availableToAdd = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    return proAccounts.filter(
      (a) => !memberIds.has(a.id) && a.email?.toLowerCase() !== SYSTEM_GROUP_OWNER_EMAIL,
    );
  }, [proAccounts, members]);

  const filteredAvailable = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return availableToAdd;
    return availableToAdd.filter((account) => {
      const haystack = `${account.username ?? ""} ${account.fullName ?? ""} ${account.email ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [availableToAdd, memberSearch]);

  useEffect(() => {
    const allowed = new Set(availableToAdd.map((a) => a.id));
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [availableToAdd]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function toggleSelectVisible() {
    const visibleIds = filteredAvailable.map((a) => a.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      const hide = new Set(visibleIds);
      setSelectedIds((prev) => prev.filter((id) => !hide.has(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
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
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "Failed to seed a member");
      }
      setSeedProgress({ done: i + 1, total: count });
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

  const allVisibleSelected =
    filteredAvailable.length > 0 && filteredAvailable.every((account) => selectedIds.includes(account.id));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-200">Members</div>
        <button
          type="button"
          onClick={loadProAccounts}
          className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
        >
          Refresh prop accounts
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      <div className="mb-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 p-3">
        <div className="text-xs font-semibold text-zinc-200">Add existing prop accounts</div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Pick accounts already in the pool and join them to this group in one pass.
        </p>
        <input
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          placeholder="Search username or name"
          className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15"
        />
        {availableToAdd.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-500">Every existing prop account is already in this group.</p>
        ) : (
          <>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleSelectVisible}
                className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
              >
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </button>
              <span className="text-[11px] text-zinc-500">
                {selectedIds.length} selected · {filteredAvailable.length} shown
              </span>
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
              {filteredAvailable.length === 0 ? (
                <div className="px-2 py-3 text-center text-[11px] text-zinc-500">No matches.</div>
              ) : (
                filteredAvailable.map((account) => {
                  const checked = selectedIds.includes(account.id);
                  return (
                    <label
                      key={account.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${
                        checked ? "bg-blue-500/10" : "hover:bg-zinc-900"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(account.id)}
                        className="accent-blue-500"
                      />
                      {account.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={account.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <Avatar
                          id={account.id}
                          person={{ full_name: account.fullName, username: account.username }}
                          size="sm"
                        />
                      )}
                      <span className="min-w-0 truncate text-xs text-zinc-200">{accountLabel(account)}</span>
                    </label>
                  );
                })
              )}
            </div>
            <Button
              size="sm"
              className="mt-2 bg-blue-500 text-zinc-950 hover:bg-blue-400"
              onClick={() => void handleAddSelected()}
              disabled={adding || selectedIds.length === 0}
            >
              {adding
                ? "Adding..."
                : `Add selected${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Button>
          </>
        )}
      </div>

      <div className="mb-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 p-3">
        <div className="text-xs font-semibold text-zinc-200">Generate new prop accounts</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={50}
            value={fakeCount}
            onChange={(e) => setFakeCount(Number(e.target.value))}
            disabled={seeding}
            className="w-16 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-50 outline-none transition focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50"
          />
          <span className="text-xs font-medium text-zinc-400">new accounts</span>
          <Button
            size="sm"
            variant="secondary"
            className="border-zinc-700 text-zinc-100"
            onClick={() => void handleSeedFakeMembers()}
            disabled={seeding}
          >
            {seeding ? "Generating..." : "Generate & add"}
          </Button>
          {seedProgress && (
            <span className="text-[11px] text-zinc-500">
              {seedProgress.done} of {seedProgress.total}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          Creates brand-new prop accounts with random names and joins them to this group.
        </p>
      </div>

      {membersLoading ? (
        <div className="p-4 text-center text-sm text-zinc-500">Loading members...</div>
      ) : members.length === 0 ? (
        <div className="p-4 text-center text-sm text-zinc-500">No members yet.</div>
      ) : (
        <div className="space-y-1.5">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar id={member.user_id} person={member.profile} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-zinc-200">{personLabel(member.profile)}</span>
                    {member.is_prop_account && <PropPill />}
                  </div>
                  <span className="text-[11px] text-zinc-500 capitalize">{member.role}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveMember(member.user_id)}
                disabled={removingId === member.user_id}
                className="shrink-0 text-[11px] font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-50"
              >
                {removingId === member.user_id ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
