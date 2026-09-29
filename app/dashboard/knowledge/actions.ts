"use server";

import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { createWatch, decideItem, deleteWatch, loadKnowledgeDashboard, updateWatch } from "@/lib/knowledge/db";
import { pullWatchById } from "@/lib/knowledge/pull";
import type { KnowledgeDashboard, KnowledgePullOutcome, KnowledgeStatus, KnowledgeWatchInput } from "@/lib/knowledge/types";

export async function refreshKnowledge(): Promise<KnowledgeDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return loadKnowledgeDashboard();
}

export async function saveWatchAction(id: string | null, input: KnowledgeWatchInput): Promise<KnowledgeDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const watchId = id ? (await updateWatch(id, input), id) : await createWatch(input);
  await logAdminAction({
    category: "admin",
    action: id ? "knowledge_watch_updated" : "knowledge_watch_created",
    detail: `${id ? "Updated" : "Created"} a knowledge watch (${input.approval === "auto" ? "automatic approval" : "review"}, every ${Math.trunc(input.everyMinutes)} minutes)`,
    targetType: "knowledge_watch",
    targetId: watchId,
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadKnowledgeDashboard();
}

export async function deleteWatchAction(id: string): Promise<KnowledgeDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await deleteWatch(id);
  await logAdminAction({
    category: "admin",
    action: "knowledge_watch_deleted",
    detail: "Deleted a knowledge watch",
    targetType: "knowledge_watch",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadKnowledgeDashboard();
}

export async function decideItemAction(id: string, status: KnowledgeStatus): Promise<KnowledgeDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await decideItem(id, status, admin.email ?? admin.fullName ?? admin.id);
  return loadKnowledgeDashboard();
}

export async function pullNowAction(id: string): Promise<{ dashboard: KnowledgeDashboard; outcome: KnowledgePullOutcome }> {
  await requireAdmin(OPERATOR_ROLES);
  const outcome = await pullWatchById(id);
  return { dashboard: await loadKnowledgeDashboard(), outcome };
}
