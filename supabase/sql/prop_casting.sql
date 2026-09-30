-- Casting: props join groups that fit their home, interests, and age on
-- their own, a few a day at spread-out times. Run after prop_director.sql.
-- Off until casting_enabled is switched on in the Director tab. Safe to re-run.
alter table public.prop_conversation_settings
  add column if not exists casting_enabled boolean not null default false,
  add column if not exists max_joins_per_day integer not null default 3,
  add column if not exists max_prop_share numeric not null default 0.4,
  add column if not exists max_groups_per_prop integer not null default 6;

alter table public.prop_conversation_settings
  drop constraint if exists prop_conversation_settings_casting_check;

alter table public.prop_conversation_settings
  add constraint prop_conversation_settings_casting_check
  check (
    max_joins_per_day between 0 and 50
    and max_prop_share > 0 and max_prop_share <= 1
    and max_groups_per_prop between 1 and 50
  );

create table if not exists public.prop_join_queue (
  id uuid primary key default gen_random_uuid(),
  prop_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.discussion_groups (id) on delete cascade,
  hub_id uuid references public.area_discussions (id) on delete cascade,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'cancelled')),
  fit integer not null default 2 check (fit between 1 and 3),
  reason text not null default '',
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create unique index if not exists prop_join_queue_open_idx
  on public.prop_join_queue (prop_id, group_id)
  where status in ('pending', 'done');

create index if not exists prop_join_queue_due_idx
  on public.prop_join_queue (status, run_at);

-- When each home hub was last cast, so each hub is scored about once a day.
create table if not exists public.prop_casting_runs (
  hub_id uuid primary key references public.area_discussions (id) on delete cascade,
  ran_at timestamptz not null default now(),
  queued integer not null default 0,
  note text
);

alter table public.prop_join_queue enable row level security;
alter table public.prop_casting_runs enable row level security;
