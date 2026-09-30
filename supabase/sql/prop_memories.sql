-- What each prop account has said about itself and noticed about others, so it
-- stays consistent from one post to the next. Filled after lines post, read by
-- the writer. Safe to re-run.
create table if not exists public.prop_memories (
  id uuid primary key default gen_random_uuid(),
  prop_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.discussion_groups (id) on delete set null,
  about_id uuid references public.profiles (id) on delete set null,
  fact text not null check (char_length(fact) between 3 and 240),
  importance smallint not null default 2 check (importance between 1 and 5),
  source_job_id uuid references public.prop_engagement_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists prop_memories_prop_idx
  on public.prop_memories (prop_id, importance desc, created_at desc);

alter table public.prop_memories enable row level security;

alter table public.prop_engagement_jobs
  add column if not exists remembered_at timestamptz;

create index if not exists prop_engagement_jobs_unremembered_idx
  on public.prop_engagement_jobs (group_id, finished_at)
  where status = 'done' and remembered_at is null;
