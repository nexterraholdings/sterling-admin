-- Lets admins manually grant/deduct invite (referral) points, with a full audit
-- trail. Backs the Invite Points admin tab (app/dashboard/invite-points/).
--
-- profiles.referral_count is the field the rest of the app treats as a user's
-- invite point balance. Note: the weekly leaderboard is computed separately from
-- referral_signups, so an adjustment here does NOT change this week's rank —
-- it's for correcting/granting the persistent balance only (tiers/badges/etc).

create table if not exists admin_invite_point_adjustments (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references profiles(id) on delete cascade,
  points_delta integer not null check (points_delta <> 0),
  reason text not null check (char_length(btrim(reason)) > 0),
  created_by_admin_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists admin_invite_point_adjustments_target_user_id_idx
  on admin_invite_point_adjustments (target_user_id);
create index if not exists admin_invite_point_adjustments_created_at_idx
  on admin_invite_point_adjustments (created_at desc);

alter table admin_invite_point_adjustments enable row level security;

-- Only admins/owners can read adjustment history.
-- (Postgres has no `CREATE POLICY IF NOT EXISTS` — drop first so this script is
-- safe to re-run.)
drop policy if exists admin_invite_point_adjustments_select_admin on admin_invite_point_adjustments;
create policy admin_invite_point_adjustments_select_admin
  on admin_invite_point_adjustments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sterling_admins a
      where a.user_id = auth.uid()
        and a.disabled_at is null
    )
  );

-- Defense in depth only — in practice all inserts go through
-- admin_adjust_invite_points() below (SECURITY DEFINER, owned by a role that
-- bypasses RLS), called via this dashboard's service-role client. This policy
-- just ensures a direct authenticated-client insert can't slip through some
-- other path without the same admin check.
drop policy if exists admin_invite_point_adjustments_insert_admin on admin_invite_point_adjustments;
create policy admin_invite_point_adjustments_insert_admin
  on admin_invite_point_adjustments
  for insert
  to authenticated
        with check (
    exists (
      select 1 from public.sterling_admins a
      where a.user_id = auth.uid()
        and a.disabled_at is null
        and a.role in ('owner', 'operator')
    )
    and created_by_admin_id = auth.uid()
  );

-- No update/delete policies anywhere — this table is an immutable audit trail.

-- admin_id is taken as an explicit parameter rather than derived from auth.uid()
-- because this dashboard calls RPCs through the service-role client (see
-- lib/supabase/server.ts), which has no authenticated-user JWT context — auth.uid()
-- would be null there. The real "is this caller an admin" gate normally happens in
-- Next.js (getCurrentAdmin()) before this is ever called; the role check below is
-- defense in depth so the function is also safe if ever invoked with a user JWT.
create or replace function admin_adjust_invite_points(
  p_target_user_id uuid,
  p_points_delta int,
  p_reason text,
  p_admin_id uuid
)
returns table (
  id uuid,
  target_user_id uuid,
  points_delta int,
  reason text,
  created_by_admin_id uuid,
  created_at timestamptz,
  new_referral_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count int;
  v_adjustment admin_invite_point_adjustments;
begin
  if p_points_delta = 0 then
    raise exception 'points_delta must be nonzero';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason is required';
  end if;

  -- Table references below are aliased and columns qualified (p.id, not bare id)
  -- because RETURNS TABLE(id uuid, ...) implicitly declares an OUT variable named
  -- `id` in this function's scope — an unqualified `id` in a query would be
  -- ambiguous between that variable and profiles.id.
  if not exists (
    select 1 from public.sterling_admins a
    where a.user_id = p_admin_id
      and a.disabled_at is null
      and a.role in ('owner', 'operator')
  ) then
    raise exception 'Only admins can adjust invite points';
  end if;

  if not exists (select 1 from profiles p where p.id = p_target_user_id) then
    raise exception 'Target user not found';
  end if;

  -- Clamped at 0 — referral_count is displayed as a plain count elsewhere in the
  -- app and isn't expected to go negative. Remove the greatest() if a negative
  -- balance should be representable instead.
  update profiles p
  set referral_count = greatest(0, coalesce(p.referral_count, 0) + p_points_delta)
  where p.id = p_target_user_id
  returning p.referral_count into v_new_count;

  insert into admin_invite_point_adjustments (target_user_id, points_delta, reason, created_by_admin_id)
  values (p_target_user_id, p_points_delta, btrim(p_reason), p_admin_id)
  returning * into v_adjustment;

  return query select
    v_adjustment.id,
    v_adjustment.target_user_id,
    v_adjustment.points_delta,
    v_adjustment.reason,
    v_adjustment.created_by_admin_id,
    v_adjustment.created_at,
    v_new_count;
end;
$$;

revoke all on function admin_adjust_invite_points(uuid, int, text, uuid) from public;
grant execute on function admin_adjust_invite_points(uuid, int, text, uuid) to authenticated;
