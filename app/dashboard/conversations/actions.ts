"use server";

import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import { addGroupMembers } from "@/lib/groups/db";
import {
  clearConversationQueue,
  copyPersonalityToCast,
  loadConversationDashboard,
  pauseAllConversationGroups,
  previewGroupLine,
  queueConversationPost,
  removeSentConversationLine,
  updateSentConversationLine,
  retryFailedConversationJobs,
  saveConversationGroup,
  saveConversationSettings,
  savePersona,
  setGroupIncluded,
  setRegionGroups,
  clearFutureStartPosts,
  saveRunAbbrev,
  saveRunGrammar,
  saveRunRules,
  saveRunSwear,
  saveWeekSchedule,
  sendConversationJobNow,
  setConversationAutoContinue,
  skipConversationJob,
} from "@/lib/conversations/db";
import { addPostsForToday, fillWeekForGroup, runConversationTick } from "@/lib/conversations/tick";
import { saveRegionLocale, saveRegionObjective, setAccountExcluded, setRunPaused } from "@/lib/conversations/region-runs";
import { savePropHome } from "@/lib/conversations/prop-home";
import { saveRunEdge, type RunEdge } from "@/lib/conversations/edge";
import { deletePropMemory, listPropMemories, type PropMemory } from "@/lib/conversations/memory";
import { parseWeekDays } from "@/lib/conversations/week";
import type { SwearRate } from "@/lib/conversations/rules";
import type { PropVoice } from "@/lib/prop-voice";
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

export async function addAccountsToGroup(groupId: string, userIds: string[]): Promise<ConversationDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const result = await addGroupMembers(groupId, ids);
  await logAdminAction({
    category: "admin",
    action: "add_group_member",
    detail:
      result.added === 1
        ? `Added a prop account to group ${groupId} from Conversations`
        : `Added ${result.added} prop accounts to group ${groupId} from Conversations`,
    targetType: "discussion_group",
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

async function forIncludedGroups(groupIds: string[], work: (groupId: string) => Promise<void>): Promise<ConversationDashboard> {
  const ids = [...new Set(groupIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error("Include a group before changing the run settings.");
  for (const id of ids) await work(id);
  return loadConversationDashboard();
}

export async function addRegionPostsToday(groupIds: string[]): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  const ids = [...new Set(groupIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error("Include a group before adding a post.");
  let added = 0;
  let firstError: string | null = null;
  for (const id of ids) {
    try {
      added += await addPostsForToday(id, 1);
    } catch (error) {
      if (!firstError) firstError = error instanceof Error ? error.message : "Could not add a post for today.";
    }
  }
  if (added === 0) throw new Error(firstError ?? "Could not add a post for today.");
  return loadConversationDashboard();
}

export async function saveRegionObjectiveAction(hubId: string, objective: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveRegionObjective(hubId, objective);
  return loadConversationDashboard();
}

export async function saveRegionLocaleAction(
  hubId: string,
  input: { timeZone: string; language: string },
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveRegionLocale(hubId, input);
  return loadConversationDashboard();
}

export async function setRegionRunPaused(hubId: string, paused: boolean): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await setRunPaused(hubId, paused);
  return loadConversationDashboard();
}

export async function setRegionGroupIncluded(groupId: string, included: boolean): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await setGroupIncluded(groupId, included);
  return loadConversationDashboard();
}

export async function setRegionAccountIncluded(hubId: string, userId: string, included: boolean): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await setAccountExcluded(hubId, userId, !included);
  return loadConversationDashboard();
}

export async function saveRegionWeek(
  groupIds: string[],
  input: { days: number; startHour: number; endHour: number; everyMinutes: number; callsPerDay: number },
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return forIncludedGroups(groupIds, async (groupId) => {
    await saveWeekSchedule(groupId, input);
    if (parseWeekDays(input.days) > 0) await fillWeekForGroup(groupId, { replaceFuture: true });
    else await clearFutureStartPosts(groupId);
  });
}

export async function saveRegionAbbrev(groupIds: string[], abbrev: number): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return forIncludedGroups(groupIds, (groupId) => saveRunAbbrev(groupId, abbrev));
}

export async function saveRegionGrammar(groupIds: string[], grammar: number): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return forIncludedGroups(groupIds, (groupId) => saveRunGrammar(groupId, grammar));
}

export async function saveRegionSwear(
  groupIds: string[],
  swear: boolean,
  swearRate: SwearRate,
  edge?: RunEdge,
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return forIncludedGroups(groupIds, async (groupId) => {
    await saveRunSwear(groupId, swear, swearRate);
    if (edge) await saveRunEdge(groupId, edge);
  });
}

export async function saveRegionRules(groupIds: string[], rules: string[]): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return forIncludedGroups(groupIds, (groupId) => saveRunRules(groupId, rules));
}

export async function setRegionAutomatic(
  groupIds: string[],
  automatic: boolean,
  postsPerDay: number,
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return forIncludedGroups(groupIds, (groupId) => setConversationAutoContinue(groupId, automatic, postsPerDay));
}

export async function saveConversationWeek(
  groupId: string,
  input: { days: number; startHour: number; endHour: number; everyMinutes: number; callsPerDay: number },
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveWeekSchedule(groupId, input);
  if (parseWeekDays(input.days) > 0) await fillWeekForGroup(groupId, { replaceFuture: true });
  else await clearFutureStartPosts(groupId);
  return loadConversationDashboard();
}

export async function saveConversationAbbrev(groupId: string, abbrev: number): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveRunAbbrev(groupId, abbrev);
  return loadConversationDashboard();
}

export async function saveConversationGrammar(groupId: string, grammar: number): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveRunGrammar(groupId, grammar);
  return loadConversationDashboard();
}

export async function saveConversationSwear(
  groupId: string,
  swear: boolean,
  swearRate: SwearRate,
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveRunSwear(groupId, swear, swearRate);
  return loadConversationDashboard();
}

export async function saveConversationRules(groupId: string, rules: string[]): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await saveRunRules(groupId, rules);
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

export async function savePropHomeAction(
  userId: string,
  input: { hubId: string | null; languages: string[] },
): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await savePropHome(userId, input);
  return loadConversationDashboard();
}

export async function savePropVoice(userId: string, voice: PropVoice): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await savePersona(userId, voice);
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

export async function updateSentLine(jobId: string, body: string): Promise<ConversationDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  await updateSentConversationLine(jobId, body);
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

export async function startRegionRun(input: { hubId: string; objective: string; groupIds: string[] }): Promise<ConversationDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const hubId = input.hubId.trim();
  const objective = input.objective.trim();
  const groupIds = [...new Set(input.groupIds.map((id) => id.trim()).filter(Boolean))];
  if (!hubId) throw new Error("Pick a region.");
  if (objective.length < 8) throw new Error("Write the objective for this run.");
  if (groupIds.length === 0) throw new Error("Include at least one group.");

  await saveRegionObjective(hubId, objective);
  await setRegionGroups(hubId, groupIds);

  await logAdminAction({
    category: "admin",
    action: "prop_region_run_started",
    detail: `Started a run in ${hubId} with ${groupIds.length} ${groupIds.length === 1 ? "group" : "groups"}`,
    targetType: "area_discussion",
    targetId: hubId,
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadConversationDashboard();
}

export async function runConversationsOnce(
  input: ManualRunRequest,
): Promise<{ dashboard: ConversationDashboard; tick: ConversationTickResult }> {
  await requireAdmin(OPERATOR_ROLES);
  const tick = await runConversationTick({ manual: true, run: input });
  const dashboard = await loadConversationDashboard();
  return { dashboard, tick };
}

export async function loadPropMemoriesAction(userId: string): Promise<PropMemory[]> {
  await requireAdmin(OPERATOR_ROLES);
  return listPropMemories(userId);
}

export async function deletePropMemoryAction(id: string, userId: string): Promise<PropMemory[]> {
  await requireAdmin(OPERATOR_ROLES);
  await deletePropMemory(id);
  return listPropMemories(userId);
}
