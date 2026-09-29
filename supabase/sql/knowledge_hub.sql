-- Knowledge hub. Watches say what to pull for a hub (news, weather, sports,
-- events, and optionally X); items are the facts that came back, each with
-- the URL it came from. Opening posts in a hub that has watches are written
-- only from approved items.
-- Service role bypasses RLS. Run after prop_conversations.sql. Safe to re-run.

create table if not exists public.knowledge_watches (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.area_discussions (id) on delete cascade,
  label text not null default '',
  feeds text[] not null default '{news,weather}',
  search_terms text not null default '',
  x_handles text[] not null default '{}',
  -- Team names looked up on TheSportsDB, e.g. {New York Knicks, Brooklyn Nets}.
  teams text[] not null default '{}',
  every_minutes integer not null default 360 check (every_minutes >= 30 and every_minutes <= 1440),
  -- review: the checks suggest, an admin decides. auto: the checks decide.
  approval text not null default 'review' check (approval in ('review', 'auto')),
  enabled boolean not null default true,
  last_pulled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_watches_due_idx
  on public.knowledge_watches (last_pulled_at nulls first)
  where enabled;

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references public.knowledge_watches (id) on delete set null,
  hub_id uuid not null references public.area_discussions (id) on delete cascade,
  source text not null,
  claim text not null,
  source_url text not null,
  author text not null default '',
  image_url text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  -- What the automatic checks would do. Kept in review mode so it can be compared with the admin's call.
  verdict text check (verdict in ('approve', 'reject')),
  reason text not null default '',
  decided_by text not null default '',
  decided_at timestamptz,
  used_count integer not null default 0,
  last_used_at timestamptz,
  unique (hub_id, source_url)
);

alter table public.knowledge_watches
  add column if not exists feeds text[] not null default '{news,weather}',
  add column if not exists teams text[] not null default '{}',
  alter column every_minutes set default 360;

alter table public.knowledge_items drop constraint if exists knowledge_items_source_check;
alter table public.knowledge_items
  add constraint knowledge_items_source_check check (source in ('x', 'web', 'news', 'weather', 'sports', 'events'));

create index if not exists knowledge_items_hub_status_idx
  on public.knowledge_items (hub_id, status, expires_at desc);

create index if not exists knowledge_items_fetched_idx
  on public.knowledge_items (fetched_at desc);

create table if not exists public.knowledge_pulls (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references public.knowledge_watches (id) on delete set null,
  hub_id uuid references public.area_discussions (id) on delete set null,
  ok boolean not null,
  model text not null default '',
  items_found integer not null default 0,
  items_kept integer not null default 0,
  x_posts_fetched integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  judge_tokens integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_pulls_created_idx
  on public.knowledge_pulls (created_at desc);

alter table public.prop_engagement_jobs
  add column if not exists knowledge_item_id uuid references public.knowledge_items (id) on delete set null;

alter table public.knowledge_watches enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.knowledge_pulls enable row level security;

-- Every 10 minutes, up to 6 due watches per run, with the same bearer token as prop-conversations-tick.
select cron.schedule(
  'knowledge-pull',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://admin.sterlingtheapp.com/api/cron/knowledge-pull',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'prop_conversations_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
