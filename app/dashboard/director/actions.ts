"use server";

import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { OPERATOR_ROLES, requireAdmin } from "@/app/dashboard/lib/dal";
import {
  applyPlan,
  loadDirectorDashboard,
  loadDirectorSettings,
  planGroup,
  rejectPlan,
  saveDirectorSettings,
  setGroupPlanner,
  type DirectorDashboard,
  type DirectorMode,
} from "@/lib/conversations/director";

export async function refreshDirector(): Promise<DirectorDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  return loadDirectorDashboard();
}

export async function saveDirectorSettingsAction(patch: { mode?: DirectorMode; everyHours?: number }): Promise<DirectorDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await saveDirectorSettings(patch);
  await logAdminAction({
    category: "admin",
    action: "prop_director_settings",
    detail: [patch.mode ? `Director mode ${patch.mode}` : "", patch.everyHours ? `plans every ${patch.everyHours}h` : ""].filter(Boolean).join(", "),
    targetType: "prop_director",
    targetId: "settings",
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadDirectorDashboard();
}

export async function setGroupPlannerAction(groupId: string, planner: "random" | "director"): Promise<DirectorDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  await setGroupPlanner(groupId, planner);
  await logAdminAction({
    category: "admin",
    action: "prop_director_group",
    detail: planner === "director" ? "Handed a group to the director" : "Moved a group back to the random scheduler",
    targetType: "discussion_group",
    targetId: groupId,
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadDirectorDashboard();
}

export async function planGroupNowAction(groupId: string): Promise<DirectorDashboard> {
  await requireAdmin(OPERATOR_ROLES);
  const settings = await loadDirectorSettings();
  await planGroup(groupId, { apply: settings.mode === "auto" });
  return loadDirectorDashboard();
}

export async function decidePlanAction(planId: string, approve: boolean): Promise<DirectorDashboard> {
  const admin = await requireAdmin(OPERATOR_ROLES);
  const by = admin.email ?? admin.fullName ?? admin.id;
  if (approve) await applyPlan(planId, by);
  else await rejectPlan(planId, by);
  await logAdminAction({
    category: "admin",
    action: approve ? "prop_director_plan_approved" : "prop_director_plan_rejected",
    detail: approve ? "Approved a director plan" : "Rejected a director plan",
    targetType: "prop_director_plan",
    targetId: planId,
    actorId: admin.id,
    actorLabel: admin.email ?? admin.fullName,
  });
  return loadDirectorDashboard();
}
