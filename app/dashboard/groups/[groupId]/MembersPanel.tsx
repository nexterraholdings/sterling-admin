"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, personLabel } from "@/app/dashboard/discussions/discussionUi";
import { listProAccounts, type ProAccountStub } from "@/app/dashboard/users/actions";
import { readApiJson } from "@/app/dashboard/users/seeding-content/shared";
import type { AdminGroupMember } from "@/lib/groups/types";

function PropPill() {
  return (
    <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200 ring-1 ring-blue-500/25">
      Prop
    </span>
  );
}

export function MembersPanel({ groupId }: { groupId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminGroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [proAccounts, setProAccounts] = useState<ProAccountStub[]>([]);
  const [selectedNewMemberId, setSelectedNewMemberId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
    return proAccounts.filter((a) => !memberIds.has(a.id));
  }, [proAccounts, members]);

  useEffect(() => {
    if (selectedNewMemberId && !availableToAdd.some((a) => a.id === selectedNewMemberId)) {
      setSelectedNewMemberId("");
    }
  }, [availableToAdd, selectedNewMemberId]);

  async function handleAddMember() {
    if (!selectedNewMemberId) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedNewMemberId }),
      });
      const payload = await readApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Failed to add member");
      setSelectedNewMemberId("");
      await loadMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE" }
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={selectedNewMemberId}
          onChange={(e) => setSelectedNewMemberId(e.target.value)}
          className="w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15"
        >
          <option value="">
            {availableToAdd.length === 0 ? "No prop accounts available" : "Choose a prop account..."}
          </option>
          {availableToAdd.map((account) => (
            <option key={account.id} value={account.id}>
              @{account.username ?? account.id.slice(0, 8)}
              {account.fullName ? ` — ${account.fullName}` : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="bg-blue-500 text-zinc-950 hover:bg-blue-400"
          onClick={handleAddMember}
          disabled={adding || !selectedNewMemberId}
        >
          {adding ? "Adding..." : "Add prop member"}
        </Button>
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">
        Need a new prop account? Create one in the content panel below, then hit "Refresh prop accounts" here.
      </p>

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
