-- Prop conversation autopilot. Sidecar tables only: profiles and
-- discussion_groups are left unchanged. Service role bypasses RLS.

create table if not exists public.prop_conversation_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  daily_call_budget integer not null default 40 check (daily_call_budget >= 0 and daily_call_budget <= 1000),
  active_start_hour integer not null default 8 check (active_start_hour >= 0 and active_start_hour <= 23),
  active_end_hour integer not null default 22 check (active_end_hour >= 1 and active_end_hour <= 24),
  updated_at timestamptz not null default now()
);

insert into public.prop_conversation_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.prop_conversation_groups (
  group_id uuid primary key references public.discussion_groups (id) on delete cascade,
  enabled boolean not null default false,
  topic text not null default '',
  posts_per_day integer not null default 2 check (posts_per_day >= 0 and posts_per_day <= 20),
  replies_per_post integer not null default 2 check (replies_per_post >= 0 and replies_per_post <= 6),
  updated_at timestamptz not null default now()
);

create table if not exists public.prop_account_personas (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  personality text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.prop_engagement_jobs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.discussion_groups (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('start_post', 'reply')),
  parent_comment_id uuid references public.area_discussion_comments (id) on delete set null,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'skipped', 'failed')),
  body text,
  comment_id uuid references public.area_discussion_comments (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists prop_engagement_jobs_due_idx
  on public.prop_engagement_jobs (run_at)
  where status = 'pending';

create index if not exists prop_engagement_jobs_group_created_idx
  on public.prop_engagement_jobs (group_id, created_at desc);

create unique index if not exists prop_engagement_jobs_author_parent
  on public.prop_engagement_jobs (parent_comment_id, author_id)
  where parent_comment_id is not null and status in ('pending', 'running', 'done');

create table if not exists public.prop_groq_calls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.prop_engagement_jobs (id) on delete set null,
  model text not null,
  ok boolean not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists prop_groq_calls_created_idx
  on public.prop_groq_calls (created_at desc);

alter table public.prop_conversation_settings enable row level security;
alter table public.prop_conversation_groups enable row level security;
alter table public.prop_account_personas enable row level security;
alter table public.prop_engagement_jobs enable row level security;
alter table public.prop_groq_calls enable row level security;

-- The 10-minute worker is the pg_cron job prop-conversations-tick.
-- It POSTs to https://admin.sterlingtheapp.com/api/cron/prop-conversations
-- with a bearer token stored in vault as prop_conversations_cron_secret.
-- That same value is CRON_SECRET on the Vercel projects.
