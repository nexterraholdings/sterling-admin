-- A manual run can queue more than one opening post and remember who may reply.
alter table public.prop_engagement_jobs
  add column if not exists cast_ids uuid[],
  add column if not exists spread_minutes integer;

drop index if exists prop_engagement_jobs_one_open_start;
