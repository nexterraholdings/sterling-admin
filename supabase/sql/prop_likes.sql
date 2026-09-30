-- Prop likes: a 'like' job kind that needs no model call. Run after
-- prop_director.sql. Likes on real members' posts stay off until
-- like_real_users is on and the prop is disclosed as AI. Safe to re-run.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.prop_engagement_jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.prop_engagement_jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.prop_engagement_jobs
  add constraint prop_engagement_jobs_kind_check
  check (kind in ('start_post', 'reply', 'like'));

-- A prop can both reply to and like the same comment, but only once each.
drop index if exists public.prop_engagement_jobs_author_parent;
create unique index if not exists prop_engagement_jobs_author_parent_kind
  on public.prop_engagement_jobs (parent_comment_id, author_id, kind)
  where parent_comment_id is not null and status in ('pending', 'running', 'done');

alter table public.prop_conversation_settings
  add column if not exists like_real_users boolean not null default false;
