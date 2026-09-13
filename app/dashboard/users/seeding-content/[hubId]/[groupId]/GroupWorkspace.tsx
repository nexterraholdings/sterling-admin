"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminGroupListItem } from "@/lib/groups/types";
import type { SeededHubListItem } from "@/lib/seeded-hubs/types";
import { MembersPanel } from "@/app/dashboard/groups/[groupId]/MembersPanel";
import { GroupContentWorkspace } from "../../GroupContentWorkspace";
import { readApiJson, SeedingBreadcrumb } from "../../shared";

export function GroupWorkspace({ hubId, groupId }: { hubId: string; groupId: string }) {
  const [hub, setHub] = useState<SeededHubListItem | null>(null);
  const [group, setGroup] = useState<AdminGroupListItem | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);

  const loadHub = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${encodeURIComponent(hubId)}`);
      const payload = await readApiJson<{ hub?: SeededHubListItem; error?: string }>(res);
      if (res.ok) setHub(payload.hub ?? null);
    } catch {
      // Breadcrumb-only data; ignore failures here.
    }
  }, [hubId]);

  const loadGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}`);
      const payload = await readApiJson<{ group?: AdminGroupListItem; error?: string }>(res);
      if (res.ok) setGroup(payload.group ?? null);
    } finally {
      setGroupLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadHub();
    loadGroup();
  }, [loadHub, loadGroup]);

  return (
    <div className="space-y-4">
      <SeedingBreadcrumb
        hub={hub ? { id: hub.id, title: hub.title } : { id: hubId, title: "..." }}
        group={{ title: groupLoading ? "..." : group?.title ?? "Group" }}
      />
      <MembersPanel groupId={groupId} />
      <GroupContentWorkspace groupId={groupId} />
    </div>
  );
}
