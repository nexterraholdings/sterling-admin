import { GroupWorkspace } from "./GroupWorkspace";

export default async function SeedingContentGroupPage({
  params,
}: {
  params: Promise<{ hubId: string; groupId: string }>;
}) {
  const { hubId, groupId } = await params;
  return <GroupWorkspace hubId={hubId} groupId={groupId} />;
}
