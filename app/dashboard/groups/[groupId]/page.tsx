import { GroupSeedPanel } from "./GroupSeedPanel";

export default async function GroupSeedPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupSeedPanel groupId={groupId} />;
}
