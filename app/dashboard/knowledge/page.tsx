import { OPERATOR_ROLES, requireAdminPage } from "@/app/dashboard/lib/dal";
import { loadKnowledgeDashboard } from "@/lib/knowledge/db";
import { KnowledgeClient } from "./KnowledgeClient";

// "Pull now" waits on an X search, which can take most of a minute.
export const maxDuration = 60;

export default async function KnowledgePage() {
  await requireAdminPage(OPERATOR_ROLES);
  const dashboard = await loadKnowledgeDashboard();
  return <KnowledgeClient initial={dashboard} />;
}
