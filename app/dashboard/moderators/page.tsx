"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMIN_ROLES, type AdminRole } from "@/app/dashboard/lib/admin-access";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchModerators,
  grantModerator,
  revokeModerator,
  updateModerator,
  type ModeratorRow,
} from "./actions";

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  operator: "Operator",
  marketing: "Marketing",
  analyst: "Analyst",
};

const ROLE_CLASS: Record<AdminRole, string> = {
  owner: "bg-violet-500/15 text-violet-300",
  operator: "bg-sky-500/15 text-sky-300",
  marketing: "bg-emerald-500/15 text-emerald-300",
  analyst: "bg-amber-500/15 text-amber-300",
};

const fieldCls = "space-y-1.5";

function displayName(row: ModeratorRow) {
  return row.fullName || row.username || row.email || "Unknown";
}

function initials(row: ModeratorRow) {
  const name = displayName(row).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function ModeratorsPage() {
  const [rows, setRows] = useState<ModeratorRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [actorId, setActorId] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("operator");
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pendingRemove, setPendingRemove] = useState<ModeratorRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await fetchModerators();
      setRows(data.rows);
      setCanManage(data.canManage);
      setActorId(data.actorId);
      setActorRole(data.actorRole);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load moderators");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  function resetAddForm() {
    setEmail("");
    setFullName("");
    setPassword("");
    setTitle("");
    setRole("operator");
    setFormError(null);
    setCreatedPassword(null);
    setCopied(false);
  }

  async function add() {
    setAdding(true);
    setFormError(null);
    try {
      const row = await grantModerator({
        email,
        role,
        title,
        fullName,
        password: password || undefined,
      });
      setRows((prev) => {
        const without = prev.filter((r) => r.userId !== row.userId);
        return [...without, row];
      });
      if (row.temporaryPassword) {
        setCreatedPassword(row.temporaryPassword);
      } else {
        setAddOpen(false);
        resetAddForm();
        setToast("Access granted");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add user");
    } finally {
      setAdding(false);
    }
  }

  async function patch(userId: string, next: { role?: AdminRole; disabled?: boolean }) {
    setSavingId(userId);
    try {
      const updated = await updateModerator({ userId, ...next });
      setRows((prev) => prev.map((row) => (row.userId === userId ? updated : row)));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    if (pendingRemove.userId === actorId) {
      setToast("You cannot remove your own access");
      setPendingRemove(null);
      return;
    }
    if (pendingRemove.role === "owner" && actorRole !== "owner") {
      setToast("Only an owner can remove an owner");
      setPendingRemove(null);
      return;
    }
    const userId = pendingRemove.userId;
    setSavingId(userId);
    try {
      await revokeModerator(userId);
      setRows((prev) => prev.filter((row) => row.userId !== userId));
      setPendingRemove(null);
      setToast("Access removed");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setSavingId(null);
    }
  }

  async function copyPassword() {
    if (!createdPassword) return;
    await navigator.clipboard.writeText(createdPassword);
    setCopied(true);
  }

  const activeCount = rows.filter((r) => !r.disabledAt).length;

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
          >
            Add moderator
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {loading ? "Loading" : `${activeCount} active · ${rows.length} total`}
          </p>
        </div>

        {listError ? (
          <div className="px-6 py-8 text-sm text-rose-300">{listError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-800 text-sm">
              <thead className="bg-zinc-800/60 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-6 py-3">Person</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Title</th>
                  <th className="px-6 py-3">Status</th>
                  {canManage && <th className="px-6 py-3 text-right"> </th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-4" colSpan={canManage ? 6 : 5}>
                          <div className="h-10 animate-pulse rounded-xl bg-zinc-800" />
                        </td>
                      </tr>
                    ))
                  : rows.length === 0
                    ? (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="px-6 py-16 text-center text-sm text-zinc-500">
                          No moderators yet
                        </td>
                      </tr>
                    )
                    : rows.map((row) => {
                        const disabled = Boolean(row.disabledAt);
                        const busy = savingId === row.userId;
                        const isSelf = row.userId === actorId;
                        const canEditRow =
                          canManage && !isSelf && (row.role !== "owner" || actorRole === "owner");
                        return (
                          <tr key={row.userId} className={disabled ? "opacity-50" : ""}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                                  {initials(row)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-zinc-50">{displayName(row)}</p>
                                  {row.username && (
                                    <p className="truncate text-xs text-zinc-500">@{row.username}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-zinc-400">{row.email ?? "—"}</td>
                            <td className="px-6 py-4">
                              {canEditRow ? (
                                <Select
                                  value={row.role}
                                  disabled={busy}
                                  onValueChange={(value) => void patch(row.userId, { role: value as AdminRole })}
                                >
                                  <SelectTrigger size="sm" className="min-w-[132px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ADMIN_ROLES.map((r) => (
                                      <SelectItem key={r} value={r}>
                                        {ROLE_LABEL[r]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_CLASS[row.role]}`}>
                                  {ROLE_LABEL[row.role]}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-zinc-400">{row.title || "—"}</td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                  disabled ? "bg-zinc-800 text-zinc-400" : "bg-emerald-500/15 text-emerald-300"
                                }`}
                              >
                                {disabled ? "Disabled" : "Active"}
                              </span>
                            </td>
                            {canManage && (
                              <td className="px-6 py-4">
                                {canEditRow ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void patch(row.userId, { disabled: !disabled })}
                                  >
                                    {disabled ? "Enable" : "Disable"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => setPendingRemove(row)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                                ) : null}
                              </td>
                            )}
                          </tr>
                        );
                      })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAddForm();
        }}
      >
        <DialogContent>
          {createdPassword ? (
            <>
              <DialogHeader>
                <DialogTitle>Moderator created</DialogTitle>
                <DialogDescription>
                  Share this password once. It will not be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-100">{createdPassword}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyPassword()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    resetAddForm();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
              className="grid gap-5"
            >
              <DialogHeader>
                <DialogTitle>Add moderator</DialogTitle>
                <DialogDescription>
                  Existing accounts get access immediately. New emails get an account created for them.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className={fieldCls}>
                  <Label htmlFor="mod-email">Email</Label>
                  <Input
                    id="mod-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@sterling.com"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={fieldCls}>
                    <Label htmlFor="mod-name">Full name</Label>
                    <Input
                      id="mod-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className={fieldCls}>
                    <Label htmlFor="mod-title">Title</Label>
                    <Input
                      id="mod-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={fieldCls}>
                    <Label>Role</Label>
                    <Select value={role} onValueChange={(value) => setRole(value as AdminRole)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ADMIN_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={fieldCls}>
                    <Label htmlFor="mod-password">Password</Label>
                    <Input
                      id="mod-password"
                      type="text"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank to generate"
                    />
                  </div>
                </div>
                {formError && <p className="text-sm text-rose-300">{formError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={adding}>
                  {adding ? "Adding…" : "Add moderator"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove access</DialogTitle>
            <DialogDescription>
              {pendingRemove
                ? `${displayName(pendingRemove)} will no longer be able to sign in to this console.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingRemove(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={savingId === pendingRemove?.userId}
              onClick={() => void confirmRemove()}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-zinc-800 px-4 py-3 text-sm text-zinc-100 shadow-lg ring-1 ring-zinc-700">
          {toast}
        </div>
      )}
    </div>
  );
}
