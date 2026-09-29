-- A run is one region (a hub). The objective is the goal for every group in it.
-- Exclusions keep a prop account in its groups while leaving it out of the run.
create table if not exists public.prop_region_runs (
  hub_id uuid primary key references public.area_discussions (id) on delete cascade,
  objective text not null default '',
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.prop_region_runs
  add column if not exists paused boolean not null default false;

-- Null follows the nearest listed city (lib/seeded-hubs/worldCities.ts).
alter table public.prop_region_runs
  add column if not exists timezone text,
  add column if not exists language text;

create table if not exists public.prop_run_exclusions (
  hub_id uuid not null references public.area_discussions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (hub_id, user_id)
);

alter table public.prop_region_runs enable row level security;
alter table public.prop_run_exclusions enable row level security;
