-- Run this in the Supabase SQL editor (or via CLI migration).
-- Backs dashboard account deletion (app/dashboard/users/actions.ts):
--   admin_delete_user(p_user_id) — drop rows/FKs that block auth.users, then
--   DELETE FROM auth.users so GoTrue identities/sessions cascade away.
--
-- Called from the Next.js service-role client, which has no JWT user, so this
-- function must NOT gate on auth.uid() (that would no-op and look like a
-- successful delete). Authorization happens in getCurrentAdmin() before the RPC.
-- EXECUTE is granted only to service_role.
--
-- Also repairs known FKs that were created without ON DELETE CASCADE/SET NULL,
-- which is why Auth Admin deleteUser() was failing after hubs / invite-points
-- landed.

-- ---------------------------------------------------------------------------
-- FK repairs (safe to re-run)
-- ---------------------------------------------------------------------------

create or replace function _sterling_recreate_fk(
  p_schema text,
  p_table text,
  p_column text,
  p_ref_schema text,
  p_ref_table text,
  p_on_delete text,
  p_new_name text
) returns void
language plpgsql
as $$
declare
  r record;
begin
  if not exists (
    select 1
    from pg_class rel
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = p_schema
      and rel.relname = p_table
      and rel.relkind in ('r', 'p')
  ) then
    return;
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  ) then
    return;
  end if;

  -- Drop every single-column FK on this column, even if it currently
  -- points at profiles rather than auth.users (same uuid, different name).
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and nsp.nspname = p_schema
      and rel.relname = p_table
      and att.attname = p_column
      and array_length(con.conkey, 1) = 1
  loop
    execute format('alter table %I.%I drop constraint %I', p_schema, p_table, r.conname);
  end loop;

  execute format(
    'alter table %I.%I add constraint %I foreign key (%I) references %I.%I(id) on delete %s',
    p_schema,
    p_table,
    p_new_name,
    p_column,
    p_ref_schema,
    p_ref_table,
    p_on_delete
  );
end;
$$;

select _sterling_recreate_fk('public', 'area_discussions', 'creator_id', 'auth', 'users', 'cascade', 'area_discussions_creator_id_fkey');
select _sterling_recreate_fk('public', 'area_discussion_comments', 'author_id', 'auth', 'users', 'cascade', 'area_discussion_comments_author_id_fkey');
select _sterling_recreate_fk('public', 'area_rates', 'user_id', 'auth', 'users', 'cascade', 'area_rates_user_id_fkey');
select _sterling_recreate_fk('public', 'area_discussion_participants', 'user_id', 'auth', 'users', 'cascade', 'area_discussion_participants_user_id_fkey');
select _sterling_recreate_fk('public', 'area_discussion_moderators', 'user_id', 'auth', 'users', 'cascade', 'area_discussion_moderators_user_id_fkey');
select _sterling_recreate_fk('public', 'discussion_live_chat_messages', 'author_id', 'auth', 'users', 'cascade', 'discussion_live_chat_messages_author_id_fkey');
select _sterling_recreate_fk('public', 'discussion_stewardship_claims', 'user_id', 'auth', 'users', 'cascade', 'discussion_stewardship_claims_user_id_fkey');

select _sterling_recreate_fk('public', 'area_discussion_comments', 'parent_id', 'public', 'area_discussion_comments', 'set null', 'area_discussion_comments_parent_id_fkey');
select _sterling_recreate_fk('public', 'reports', 'discussion_id', 'public', 'area_discussions', 'set null', 'reports_discussion_id_fkey');
select _sterling_recreate_fk('public', 'market_news_overrides', 'created_by', 'public', 'profiles', 'set null', 'market_news_overrides_created_by_fkey');
select _sterling_recreate_fk('public', 'suspicious_account_dismissals', 'dismissed_by', 'public', 'profiles', 'set null', 'suspicious_account_dismissals_dismissed_by_fkey');
select _sterling_recreate_fk('public', 'admin_invite_point_adjustments', 'target_user_id', 'public', 'profiles', 'cascade', 'admin_invite_point_adjustments_target_user_id_fkey');
select _sterling_recreate_fk('public', 'admin_invite_point_adjustments', 'created_by_admin_id', 'public', 'profiles', 'cascade', 'admin_invite_point_adjustments_created_by_admin_id_fkey');

drop function _sterling_recreate_fk(text, text, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_pass int;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Owned communities: notifications.community_id can block the community delete.
  if to_regclass('public.communities') is not null then
    if to_regclass('public.notifications') is not null then
      update notifications n
      set community_id = null
      where n.community_id in (
        select c.id from communities c where c.owner_id = p_user_id
      );
    end if;
    delete from communities where owner_id = p_user_id;
  end if;

  if to_regclass('public.feed_recommendations') is not null then
    delete from feed_recommendations where user_id = p_user_id;
  end if;

  -- Hubs the user created, plus their comments/ratings on other hubs.
  -- parent_id has no ON DELETE CASCADE, so unlink replies first.
  if to_regclass('public.area_discussion_comments') is not null then
    update area_discussion_comments
    set parent_id = null
    where parent_id in (
      select id from area_discussion_comments where author_id = p_user_id
    );
    delete from area_discussion_comments where author_id = p_user_id;
  end if;

  if to_regclass('public.area_rates') is not null then
    delete from area_rates where user_id = p_user_id;
  end if;

  if to_regclass('public.area_discussions') is not null then
    if to_regclass('public.reports') is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reports' and column_name = 'discussion_id'
       )
    then
      update reports
      set discussion_id = null
      where discussion_id in (
        select id from area_discussions where creator_id = p_user_id
      );
    end if;
    delete from area_discussions where creator_id = p_user_id;
  end if;

  if to_regclass('public.area_discussion_participants') is not null then
    delete from area_discussion_participants where user_id = p_user_id;
  end if;
  if to_regclass('public.area_discussion_moderators') is not null then
    delete from area_discussion_moderators where user_id = p_user_id;
  end if;
  if to_regclass('public.discussion_live_chat_messages') is not null then
    delete from discussion_live_chat_messages where author_id = p_user_id;
  end if;
  if to_regclass('public.discussion_stewardship_claims') is not null then
    delete from discussion_stewardship_claims where user_id = p_user_id;
  end if;

  if to_regclass('public.admin_invite_point_adjustments') is not null then
    delete from admin_invite_point_adjustments
    where target_user_id = p_user_id
       or created_by_admin_id = p_user_id;
  end if;

  if to_regclass('public.market_news_overrides') is not null then
    update market_news_overrides set created_by = null where created_by = p_user_id;
  end if;

  if to_regclass('public.suspicious_account_dismissals') is not null then
    update suspicious_account_dismissals set dismissed_by = null where dismissed_by = p_user_id;
  end if;

  -- Remaining NO ACTION / RESTRICT FKs to auth.users. Repeat a few times so
  -- parent rows can disappear after their dependents are cleared.
  for v_pass in 1..4 loop
    for r in
      select
        nsp.nspname as schema_name,
        rel.relname as table_name,
        att.attname as column_name,
        att.attnotnull as not_null
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = rel.oid and att.attnum = con.conkey[1]
      join pg_class frel on frel.oid = con.confrelid
      join pg_namespace fnsp on fnsp.oid = frel.relnamespace
      where con.contype = 'f'
        and fnsp.nspname = 'auth'
        and frel.relname = 'users'
        and con.confdeltype in ('a', 'r') -- NO ACTION / RESTRICT
        and array_length(con.conkey, 1) = 1
        and nsp.nspname not in ('pg_catalog', 'information_schema')
    loop
      begin
        if r.not_null then
          execute format(
            'delete from %I.%I where %I = $1',
            r.schema_name, r.table_name, r.column_name
          ) using p_user_id;
        else
          execute format(
            'update %I.%I set %I = null where %I = $1',
            r.schema_name, r.table_name, r.column_name, r.column_name
          ) using p_user_id;
        end if;
      exception
        when foreign_key_violation then
          null;
        when undefined_table then
          null;
        when undefined_column then
          null;
      end;
    end loop;
  end loop;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid) to service_role;
