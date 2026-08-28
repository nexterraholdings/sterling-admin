-- Console access for Sterling Admin. A row here (with disabled_at null) is the
-- only thing that grants dashboard login — not profiles.account_role.
--
-- Roles are permission roles, not job titles:
--   owner     — everything, including granting/revoking this table
--   operator  — users, moderation, hubs
--   marketing — notifications, Sterling Star
--   analyst   — overview, analytics, audit logs
--
-- Run in the SQL editor or: npx supabase db query --linked -f supabase/sql/sterling_admins.sql

create table if not exists public.sterling_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'marketing', 'analyst')),
  title text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  disabled_at timestamptz
);

create index if not exists sterling_admins_active_role_idx
  on public.sterling_admins (role)
  where disabled_at is null;

alter table public.sterling_admins enable row level security;

create or replace function public.is_active_sterling_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sterling_admins a
    where a.user_id = p_user_id
      and a.disabled_at is null
  );
$$;

revoke all on function public.is_active_sterling_admin(uuid) from public;
grant execute on function public.is_active_sterling_admin(uuid) to authenticated, service_role;

insert into public.sterling_admins (user_id, role)
select p.id,
  case
    when p.account_role = 'owner' then 'owner'
    else 'operator'
  end
from public.profiles p
join auth.users u on u.id = p.id
where p.account_role in ('owner', 'admin', 'moderator')
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
