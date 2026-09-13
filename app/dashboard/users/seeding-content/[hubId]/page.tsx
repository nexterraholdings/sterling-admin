import { GroupsBrowser } from "./GroupsBrowser";

export default async function SeedingContentGroupsPage({
  params,
}: {
  params: Promise<{ hubId: string }>;
}) {
  const { hubId } = await params;
  return <GroupsBrowser hubId={hubId} />;
}
