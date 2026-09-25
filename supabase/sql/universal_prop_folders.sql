-- Universal prop folders. A folder is not tied to a group.
-- Each prop account is in at most one folder.

create table if not exists public.admin_prop_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_prop_folders_name_lower_idx
  on public.admin_prop_folders (lower(name));

create table if not exists public.admin_prop_folder_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  folder_id uuid not null references public.admin_prop_folders (id) on delete cascade
);

create index if not exists admin_prop_folder_members_folder_idx
  on public.admin_prop_folder_members (folder_id);

alter table public.admin_prop_folders
  add column if not exists parent_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_prop_folders_parent_fkey'
  ) then
    alter table public.admin_prop_folders
      add constraint admin_prop_folders_parent_fkey
      foreign key (parent_id) references public.admin_prop_folders (id) on delete set null;
  end if;
end $$;

create index if not exists admin_prop_folders_parent_idx
  on public.admin_prop_folders (parent_id);

alter table public.admin_prop_folders enable row level security;
alter table public.admin_prop_folder_members enable row level security;

do $$
begin
  if to_regclass('public.admin_group_prop_folders') is null then
    return;
  end if;

  insert into public.admin_prop_folders (name)
  select name
  from (
    select distinct on (lower(btrim(name))) btrim(name) as name
    from public.admin_group_prop_folders
    where btrim(name) <> ''
    order by lower(btrim(name)), name
  ) named
  on conflict ((lower(name))) do nothing;

  if to_regclass('public.admin_group_prop_folder_members') is null then
    return;
  end if;

  insert into public.admin_prop_folder_members (user_id, folder_id)
  select distinct on (member.user_id) member.user_id, folder.id
  from public.admin_group_prop_folder_members member
  join public.admin_group_prop_folders old_folder on old_folder.id = member.folder_id
  join public.admin_prop_folders folder on lower(folder.name) = lower(btrim(old_folder.name))
  order by member.user_id, folder.name
  on conflict (user_id) do nothing;
end $$;
