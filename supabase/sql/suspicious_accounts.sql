-- Run this in the Supabase SQL editor (or via CLI migration).
-- Backs the "Suspicious Accounts" dashboard page
-- (app/dashboard/suspicious-accounts/actions.ts), which scores profiles
-- against a set of rule-based bot/multi-accounting signals.
--
-- admin_get_shared_devices — every device_id used by more than one distinct
-- account, with the list of user_ids that share it. Needed because the
-- Supabase JS client can't express GROUP BY / HAVING directly.
--
-- suspicious_account_dismissals — lets an admin clear a flagged account so
-- it stops reappearing on future visits to the page. No auto-ban happens
-- anywhere in this feature; a human always makes the final call.
--
-- Assumes the existing device_identifiers(id, user_id, device_id, ...) table
-- from device_management_rpcs.sql.

create or replace function admin_get_shared_devices()
returns table (
  device_id text,
  user_ids uuid[],
  account_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    di.device_id,
    array_agg(distinct di.user_id) as user_ids,
    count(distinct di.user_id) as account_count
  from device_identifiers di
  group by di.device_id
  having count(distinct di.user_id) > 1;
$$;

create table if not exists suspicious_account_dismissals (
  user_id uuid primary key references profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid references profiles(id) on delete set null
);

alter table suspicious_account_dismissals enable row level security;
-- No policies are added: all reads/writes go through the service-role
-- client (supabaseAdmin), which bypasses RLS. This denies anon/authenticated
-- key access by default.
