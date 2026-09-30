-- The director: an AI planner that decides who in a group posts, replies, or
-- likes, when, and about what. Plans are saved for review before they run
-- unless director_mode is 'auto'. Safe to re-run.
alter table public.prop_conversation_settings
  add column if not exists director_mode text not null default 'review',
  add column if not exists director_every_hours integer not null default 6;

alter table public.prop_conversation_settings
  drop constraint if exists prop_conversation_settings_director_mode_check;

alter table public.prop_conversation_settings
  add constraint prop_conversation_settings_director_mode_check
  check (director_mode in ('off', 'review', 'auto'));

alter table public.prop_conversation_settings
  drop constraint if exists prop_conversation_settings_director_every_hours_check;

alter table public.prop_conversation_settings
  add constraint prop_conversation_settings_director_every_hours_check
  check (director_every_hours between 1 and 48);

alter table public.prop_conversation_groups
  add column if not exists planner text not null default 'random';

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_planner_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_planner_check
  check (planner in ('random', 'director'));

create table if not exists public.prop_director_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.discussion_groups (id) on delete cascade,
  hub_id uuid references public.area_discussions (id) on delete cascade,
  kind text not null default 'group' check (kind in ('group', 'new_group')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'applied', 'failed')),
  model text not null default '',
  reasoning text not null default '',
  actions jsonb not null default '[]'::jsonb,
  dropped jsonb not null default '[]'::jsonb,
  error text,
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  applied_at timestamptz
);

create index if not exists prop_director_plans_group_idx
  on public.prop_director_plans (group_id, created_at desc);

create index if not exists prop_director_plans_status_idx
  on public.prop_director_plans (status, created_at desc);

create table if not exists public.prop_group_journal (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.discussion_groups (id) on delete cascade,
  note text not null check (char_length(note) between 3 and 400),
  created_at timestamptz not null default now()
);

create index if not exists prop_group_journal_group_idx
  on public.prop_group_journal (group_id, created_at desc);

alter table public.prop_engagement_jobs
  add column if not exists director_plan_id uuid references public.prop_director_plans (id) on delete set null,
  add column if not exists brief text;

alter table public.prop_director_plans enable row level security;
alter table public.prop_group_journal enable row level security;

-- Every 30 minutes the director cron plans the groups that are due.
-- Same vault secret as the conversation tick.
select cron.schedule(
  'prop-director-tick',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://admin.sterlingtheapp.com/api/cron/prop-director',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'prop_conversations_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
