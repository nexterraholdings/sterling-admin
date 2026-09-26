-- One decision inside the always-on run: an account jumped into a group
-- or stayed out, plus what they brought up and the pace they were on.
create table if not exists public.prop_run_moments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.discussion_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.prop_engagement_jobs (id) on delete set null,
  decision text not null check (decision in ('jumped_in', 'stayed_out')),
  subject text not null default '',
  pace text not null default '',
  at timestamptz not null default now()
);

create index if not exists prop_run_moments_group_at_idx
  on public.prop_run_moments (group_id, at desc);

create index if not exists prop_run_moments_job_idx
  on public.prop_run_moments (job_id)
  where job_id is not null;

alter table public.prop_run_moments enable row level security;
