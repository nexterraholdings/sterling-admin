import { listPropAccountDirectory } from "@/lib/groups/propFolders";
import { PropAccountsView } from "./PropAccountsView";

export default async function PropAccountsPage() {
  const directory = await listPropAccountDirectory();
  return <PropAccountsView directory={directory} />;
}
