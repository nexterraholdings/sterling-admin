import { OPERATOR_ROLES, requireAdminPage } from "@/app/dashboard/lib/dal";
import { loadConversationDashboard } from "@/lib/conversations/db";
import { ConversationsClient } from "./ConversationsClient";

export default async function ConversationsPage() {
  await requireAdminPage(OPERATOR_ROLES);
  const dashboard = await loadConversationDashboard();
  return <ConversationsClient initial={dashboard} />;
}
