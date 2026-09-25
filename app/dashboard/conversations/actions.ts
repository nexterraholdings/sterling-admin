"use server";

import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import {
  clearConversationQueue,
  copyPersonalityToCast,
  loadConversationDashboard,
  pauseAllConversationGroups,
  previewGroupLine,
  queueConversationPost,
  removeSentConversationLine,
  retryFailedConversationJobs,
  saveConversationGroup,
  saveConversationSettings,
  savePersona,
  sendConversationJobNow,
  setConversationAutoContinue,
  skipConversationJob,
} from "@/lib/conversations/db";
import { runConversationTick } from "@/lib/conversations/tick";
import type { ConversationDashboard, ConversationTickResult, ManualRunRequest } from "@/lib/conversations/types";

export async function setGroupAutomatic(
  groupId: string,
  automatic: boolean,
  postsPerDay: number,
): Promise<ConversationDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await setConversationAutoContinue(groupId, automatic, postsPerDay);
  await logAdminAction({
    category: "admin",
    action: automatic ? "prop_conversations_auto_on" : "prop_conversations_auto_off",
    detail: automatic
      ? `Made a group conversation automatic at ${Math.trunc(postsPerDay)} posts a day`
      : "Set a group conversation to stop after its queued lines",
    targetType: "prop_conversation_groups",
    targetId: groupId,
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadConversationDashboard();
}

export async function refreshConversations(): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return loadConversationDashboard();
}

export async function setConversationEnabled(enabled: boolean): Promise<ConversationDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await saveConversationSettings({ enabled });
  await logAdminAction({
    category: "admin",
    action: enabled ? "prop_conversations_enabled" : "prop_conversations_disabled",
    detail: enabled ? "Turned automatic conversations on" : "Turned automatic conversations off",
    targetType: "prop_conversation_settings",
    targetId: "1",
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadConversationDashboard();
}

export async function setDailyCallBudget(dailyCallBudget: number): Promise<ConversationDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await saveConversationSettings({ dailyCallBudget });
  await logAdminAction({
    category: "admin",
    action: "prop_conversations_budget",
    detail: `Set the daily Groq call cap to ${Math.trunc(dailyCallBudget)}`,
    targetType: "prop_conversation_settings",
    targetId: "1",
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadConversationDashboard();
}

export async function setActiveHours(activeStartHour: number, activeEndHour: number): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveConversationSettings({ activeStartHour, activeEndHour });
  return loadConversationDashboard();
}

export async function saveGroupConversation(input: {
  groupId: string;
  enabled: boolean;
  topic: string;
  postsPerDay: number;
  repliesPerPost: number;
}): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveConversationGroup(input);
  return loadConversationDashboard();
}

export async function savePropPersonality(userId: string, personality: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await savePersona(userId, personality);
  return loadConversationDashboard();
}

export async function pauseAllGroups(): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await pauseAllConversationGroups();
  return loadConversationDashboard();
}

export async function retryFailedLines(): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await retryFailedConversationJobs();
  return loadConversationDashboard();
}

export async function sendQueuedLineNow(jobId: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await sendConversationJobNow(jobId);
  const tick = await runConversationTick({ manual: true, jobId });
  if (tick.published === 0) {
    const reason = tick.skipped === "budget" ? "Daily call cap reached." : tick.notes[0];
    throw new Error(reason ? `Not sent: ${reason}` : "Not sent. The line may already be sending or finished.");
  }
  return loadConversationDashboard();
}

export async function queueGroupPost(groupId: string, userId: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await queueConversationPost(groupId, userId);
  return loadConversationDashboard();
}

export async function removeSentLine(jobId: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await removeSentConversationLine(jobId);
  return loadConversationDashboard();
}

export async function copyPersonality(userId: string): Promise<{ dashboard: ConversationDashboard; copied: number }> {
  await requireAdmin(OPERATOR_ROLES);
  const copied = await copyPersonalityToCast(userId);
  return { dashboard: await loadConversationDashboard(), copied };
}

export async function skipQueuedLine(jobId: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await skipConversationJob(jobId);
  return loadConversationDashboard();
}

export async function clearQueuedLines(): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await clearConversationQueue();
  return loadConversationDashboard();
}

export async function previewConversationLine(
  groupId: string,
  userId: string,
): Promise<{ dashboard: ConversationDashboard; text: string | null; error: string | null }> {
  await requireAdmin(OPERATOR_ROLES);
  try {
    const text = await previewGroupLine(groupId, userId);
    return { dashboard: await loadConversationDashboard(), text, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed";
    if (message === "Daily call cap reached." || message === "That account is not in this group.") throw error;
    return { dashboard: await loadConversationDashboard(), text: null, error: message };
  }
}

export async function runConversationsOnce(
  input: ManualRunRequest,
): Promise<{ dashboard: ConversationDashboard; tick: ConversationTickResult }> {
  await requireAdmin(OPERATOR_ROLES);
  const tick = await runConversationTick({ manual: true, run: input });
  const dashboard = await loadConversationDashboard();
  return { dashboard, tick };
}
