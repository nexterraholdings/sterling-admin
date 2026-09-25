import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isPropAccountEmail, PROP_ACCOUNT_EMAIL_PATTERN, SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";

export type AdminPropFolder = {
  id: string;
  name: string;
  userIds: string[];
};

export type PropDirectoryAccount = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string | null;
  folderIds: string[];
};

export type PropDirectoryFolder = {
  id: string;
  name: string;
  parentId: string | null;
  userIds: string[];
};

export type PropAccountDirectory = {
  accounts: PropDirectoryAccount[];
  folders: PropDirectoryFolder[];
};

const NAME_MAX = 40;

function throwDbError(error: { message?: string; code?: string } | null, fallback: string): never {
  const message = error?.message ?? fallback;
  if (error?.code === "23505" || message.toLowerCase().includes("duplicate")) {
    throw new Error("A folder with that name already exists in this group.");
  }
  throw new Error(message || fallback);
}

function cleanName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > NAME_MAX) {
    throw new Error(`Folder names need 1–${NAME_MAX} characters.`);
  }
  return name;
}

async function assertGroup(groupId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("discussion_groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throwDbError(error, "Failed to load group");
  if (!data) throw new Error("group_not_found");
}

export async function listPropFolders(groupId: string): Promise<AdminPropFolder[]> {
  const { data: folders, error } = await supabaseAdmin
    .from("admin_group_prop_folders")
    .select("id,name,created_at")
    .eq("group_id", groupId)
    .order("name", { ascending: true });
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throwDbError(error, "Failed to load folders");
  }

  const rows = (folders ?? []) as Array<{ id: string; name: string }>;
  const ids = rows.map((row) => row.id);
  const membersByFolder = new Map<string, string[]>();
  if (ids.length) {
    const { data: members, error: memberError } = await supabaseAdmin
      .from("admin_group_prop_folder_members")
      .select("folder_id,user_id")
      .eq("group_id", groupId)
      .in("folder_id", ids);
    if (memberError) throwDbError(memberError, "Failed to load folder members");
    for (const member of members ?? []) {
      const folderId = String(member.folder_id);
      const list = membersByFolder.get(folderId) ?? [];
      list.push(String(member.user_id));
      membersByFolder.set(folderId, list);
    }
  }

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    userIds: membersByFolder.get(String(row.id)) ?? [],
  }));
}

export async function createPropFolder(groupId: string, rawName: string): Promise<AdminPropFolder> {
  await assertGroup(groupId);
  const name = cleanName(rawName);
  const { data, error } = await supabaseAdmin
    .from("admin_group_prop_folders")
    .insert({ group_id: groupId, name })
    .select("id,name")
    .single();
  if (error) throwDbError(error, "Failed to create folder");
  return { id: String(data.id), name: data.name, userIds: [] };
}

export async function renamePropFolder(groupId: string, folderId: string, rawName: string): Promise<AdminPropFolder> {
  const name = cleanName(rawName);
  const { data, error } = await supabaseAdmin
    .from("admin_group_prop_folders")
    .update({ name })
    .eq("id", folderId)
    .eq("group_id", groupId)
    .select("id,name")
    .maybeSingle();
  if (error) throwDbError(error, "Failed to rename folder");
  if (!data) throw new Error("folder_not_found");

  const { data: members, error: memberError } = await supabaseAdmin
    .from("admin_group_prop_folder_members")
    .select("user_id")
    .eq("folder_id", folderId)
    .eq("group_id", groupId);
  if (memberError) throwDbError(memberError, "Failed to load folder members");

  return {
    id: String(data.id),
    name: data.name,
    userIds: ((members ?? []) as Array<{ user_id: string }>).map((row) => String(row.user_id)),
  };
}

export async function deletePropFolder(groupId: string, folderId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_group_prop_folders")
    .delete()
    .eq("id", folderId)
    .eq("group_id", groupId);
  if (error) throwDbError(error, "Failed to delete folder");
}

async function assertPropMembers(groupId: string, userIds: string[]): Promise<void> {
  const { data: memberships, error } = await supabaseAdmin
    .from("discussion_group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .in("user_id", userIds);
  if (error) throwDbError(error, "Failed to check group members");
  const memberIds = new Set(
    ((memberships ?? []) as Array<{ user_id: string }>).map((row) => String(row.user_id)),
  );
  if (userIds.some((id) => !memberIds.has(id))) {
    throw new Error("That account is not in this group.");
  }

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,email")
    .in("id", userIds);
  if (profileError) throwDbError(profileError, "Failed to check prop accounts");
  const propIds = new Set(
    ((profiles ?? []) as Array<{ id: string; email: string | null }>)
      .filter((row) => isPropAccountEmail(row.email))
      .map((row) => String(row.id)),
  );
  if (userIds.some((id) => !propIds.has(id))) {
    throw new Error("Folders are only for prop accounts.");
  }
}

export async function assignPropAccountsToFolder(
  groupId: string,
  userIds: string[],
  folderId: string | null,
): Promise<void> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new Error("Choose a prop account.");
  await assertPropMembers(groupId, unique);

  if (!folderId) {
    const { error } = await supabaseAdmin
      .from("admin_group_prop_folder_members")
      .delete()
      .eq("group_id", groupId)
      .in("user_id", unique);
    if (error) throwDbError(error, "Failed to remove accounts from the folder");
    return;
  }

  const { data: folder, error: folderError } = await supabaseAdmin
    .from("admin_group_prop_folders")
    .select("id")
    .eq("id", folderId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (folderError) throwDbError(folderError, "Failed to load folder");
  if (!folder) throw new Error("folder_not_found");

  const { error } = await supabaseAdmin.from("admin_group_prop_folder_members").upsert(
    unique.map((userId) => ({ group_id: groupId, user_id: userId, folder_id: folderId })),
    { onConflict: "group_id,user_id" },
  );
  if (error) throwDbError(error, "Failed to move accounts into the folder");
}

export async function listPropAccountDirectory(): Promise<PropAccountDirectory> {
  type ProfileRow = {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    created_at: string | null;
  };

  const pageSize = 1000;
  const profiles: ProfileRow[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,username,full_name,avatar_url,bio,created_at")
      .ilike("email", PROP_ACCOUNT_EMAIL_PATTERN)
      .neq("email", SYSTEM_GROUP_OWNER_EMAIL)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throwDbError(error, "Failed to load prop accounts");
    const batch = (data ?? []) as ProfileRow[];
    profiles.push(...batch);
    if (batch.length < pageSize) break;
  }

  const folderRows: Array<{ id: string; name: string; parent_id: string | null }> = [];
  const memberRows: Array<{ folder_id: string; user_id: string }> = [];
  const { data: folders, error: folderError } = await supabaseAdmin
    .from("admin_prop_folders")
    .select("id,name,parent_id")
    .order("name", { ascending: true })
    .limit(1000);
  if (folderError) {
    if (!isMissingSchemaError(folderError)) throwDbError(folderError, "Failed to load folders");
  } else {
    folderRows.push(...((folders ?? []) as Array<{ id: string; name: string; parent_id: string | null }>));
  }

  if (folderRows.length) {
    const { data: members, error: memberError } = await supabaseAdmin
      .from("admin_prop_folder_members")
      .select("folder_id,user_id")
      .limit(5000);
    if (memberError) throwDbError(memberError, "Failed to load folder members");
    memberRows.push(...((members ?? []) as Array<{ folder_id: string; user_id: string }>));
  }

  const userIdsByFolder = new Map<string, string[]>();
  const folderIdsByUser = new Map<string, string[]>();
  for (const member of memberRows) {
    const folderId = String(member.folder_id);
    const userId = String(member.user_id);
    const inFolder = userIdsByFolder.get(folderId) ?? [];
    inFolder.push(userId);
    userIdsByFolder.set(folderId, inFolder);
    const onUser = folderIdsByUser.get(userId) ?? [];
    onUser.push(folderId);
    folderIdsByUser.set(userId, onUser);
  }

  return {
    accounts: profiles.map((row) => ({
      id: String(row.id),
      username: row.username ?? null,
      fullName: row.full_name ?? null,
      avatarUrl: row.avatar_url ?? null,
      bio: row.bio ?? null,
      createdAt: row.created_at ?? null,
      folderIds: folderIdsByUser.get(String(row.id)) ?? [],
    })),
    folders: folderRows.map((row) => ({
      id: String(row.id),
      name: row.name,
      parentId: row.parent_id ? String(row.parent_id) : null,
      userIds: userIdsByFolder.get(String(row.id)) ?? [],
    })),
  };
}

function duplicateFolderName(error: { message?: string; code?: string } | null): boolean {
  return error?.code === "23505" || (error?.message ?? "").toLowerCase().includes("duplicate");
}

export async function createUniversalPropFolder(rawName: string, parentId?: string | null): Promise<PropDirectoryFolder> {
  const name = cleanName(rawName);
  const parent = parentId || null;
  if (parent) {
    const { data: parentFolder, error: parentError } = await supabaseAdmin
      .from("admin_prop_folders")
      .select("id")
      .eq("id", parent)
      .maybeSingle();
    if (parentError) throwDbError(parentError, "Failed to load folder");
    if (!parentFolder) throw new Error("folder_not_found");
  }
  const { data, error } = await supabaseAdmin
    .from("admin_prop_folders")
    .insert({ name, parent_id: parent })
    .select("id,name,parent_id")
    .single();
  if (error) {
    if (duplicateFolderName(error)) throw new Error("A folder with that name already exists.");
    throwDbError(error, "Failed to create folder");
  }
  return { id: String(data.id), name: data.name, parentId: data.parent_id ? String(data.parent_id) : null, userIds: [] };
}

export async function renameUniversalPropFolder(folderId: string, rawName: string): Promise<PropDirectoryFolder> {
  const name = cleanName(rawName);
  const { data, error } = await supabaseAdmin
    .from("admin_prop_folders")
    .update({ name })
    .eq("id", folderId)
    .select("id,name,parent_id")
    .maybeSingle();
  if (error) {
    if (duplicateFolderName(error)) throw new Error("A folder with that name already exists.");
    throwDbError(error, "Failed to rename folder");
  }
  if (!data) throw new Error("folder_not_found");
  return { id: String(data.id), name: data.name, parentId: data.parent_id ? String(data.parent_id) : null, userIds: [] };
}

export async function deleteUniversalPropFolder(folderId: string): Promise<void> {
  const { data: folder, error: folderError } = await supabaseAdmin
    .from("admin_prop_folders")
    .select("id,parent_id")
    .eq("id", folderId)
    .maybeSingle();
  if (folderError) throwDbError(folderError, "Failed to load folder");
  if (!folder) throw new Error("folder_not_found");

  const { error: childError } = await supabaseAdmin
    .from("admin_prop_folders")
    .update({ parent_id: folder.parent_id })
    .eq("parent_id", folderId);
  if (childError) throwDbError(childError, "Failed to move folders out");

  const { error } = await supabaseAdmin.from("admin_prop_folders").delete().eq("id", folderId);
  if (error) throwDbError(error, "Failed to delete folder");
}

export async function moveUniversalPropFolder(folderId: string, parentId: string | null): Promise<void> {
  const parent = parentId || null;
  if (parent === folderId) throw new Error("A folder cannot be moved into itself.");

  const { data: rows, error: listError } = await supabaseAdmin.from("admin_prop_folders").select("id,parent_id").limit(1000);
  if (listError) throwDbError(listError, "Failed to load folders");
  const parentById = new Map(
    ((rows ?? []) as Array<{ id: string; parent_id: string | null }>).map((row) => [String(row.id), row.parent_id ? String(row.parent_id) : null]),
  );
  if (!parentById.has(folderId)) throw new Error("folder_not_found");
  if (parent && !parentById.has(parent)) throw new Error("folder_not_found");

  let cursor = parent;
  while (cursor) {
    if (cursor === folderId) throw new Error("A folder cannot be moved into one of its own folders.");
    cursor = parentById.get(cursor) ?? null;
  }

  const { error } = await supabaseAdmin.from("admin_prop_folders").update({ parent_id: parent }).eq("id", folderId);
  if (error) throwDbError(error, "Failed to move folder");
}

export async function assignUniversalPropFolder(userIds: string[], folderId: string | null): Promise<void> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new Error("Choose a prop account.");

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,email")
    .in("id", unique);
  if (profileError) throwDbError(profileError, "Failed to check prop accounts");
  const propIds = new Set(
    ((profiles ?? []) as Array<{ id: string; email: string | null }>)
      .filter((row) => isPropAccountEmail(row.email) && row.email !== SYSTEM_GROUP_OWNER_EMAIL)
      .map((row) => String(row.id)),
  );
  if (unique.some((id) => !propIds.has(id))) {
    throw new Error("Folders are only for prop accounts.");
  }

  if (!folderId) {
    const { error } = await supabaseAdmin.from("admin_prop_folder_members").delete().in("user_id", unique);
    if (error) throwDbError(error, "Failed to remove accounts from the folder");
    return;
  }

  const { data: folder, error: folderError } = await supabaseAdmin
    .from("admin_prop_folders")
    .select("id")
    .eq("id", folderId)
    .maybeSingle();
  if (folderError) throwDbError(folderError, "Failed to load folder");
  if (!folder) throw new Error("folder_not_found");

  const { error } = await supabaseAdmin.from("admin_prop_folder_members").upsert(
    unique.map((userId) => ({ user_id: userId, folder_id: folderId })),
    { onConflict: "user_id" },
  );
  if (error) throwDbError(error, "Failed to move accounts into the folder");
}

export async function clearPropFolderAssignment(groupId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_group_prop_folder_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error && !isMissingSchemaError(error)) {
    throwDbError(error, "Failed to clear folder assignment");
  }
}
