import { UserManagementView } from "./UsersView";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const params = await searchParams;
  return <UserManagementView openUserId={params.user ?? null} />;
}
