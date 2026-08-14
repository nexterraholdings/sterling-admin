-- Documents the area-discussions feature backing the Discussions admin tab
-- (app/dashboard/discussions/, app/api/admin/discussions/). These tables and the
-- mobile-facing RPCs (get_area_discussions_in_viewport, check_area_discussion_collision,
-- create_area_discussion) already exist in Supabase; the create/index statements
-- below are idempotent (if not exists) and only here so the schema is tracked in
-- the repo like the other tables under supabase/sql/.
--
-- There are no admin RPCs for discussions and RLS only grants authenticated users
-- read + own-row write access (see create_area_discussion / own comments+ratings).
-- All admin moderation (list/detail/delete discussion/delete comment) therefore
-- runs server-side through the service-role client, bypassing RLS entirely.

create table if not exists area_discussions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_miles numeric not null,
  location_hint text,
  avg_rate numeric,
  rate_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint area_discussions_title_length check (char_length(title) between 1 and 60),
  constraint area_discussions_radius_miles check (radius_miles in (0.25, 0.5, 1.0))
);

create index if not exists area_discussions_creator_id_idx on area_discussions (creator_id);
create index if not exists area_discussions_created_at_idx on area_discussions (created_at desc);

create table if not exists area_discussion_comments (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references area_discussions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  parent_id uuid references area_discussion_comments(id) on delete set null,
  likes_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists area_discussion_comments_discussion_id_idx on area_discussion_comments (discussion_id);
create index if not exists area_discussion_comments_author_id_idx on area_discussion_comments (author_id);

create table if not exists area_rates (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references area_discussions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint area_rates_value_range check (value between 1 and 5),
  constraint area_rates_unique_per_user unique (discussion_id, user_id)
);

-- The moderation queue's `reports` table predates this feature and isn't tracked
-- in supabase/sql/ (no reports.sql exists in this repo). This column links a
-- report to the discussion it was filed against; report_type = 'area_discussion'
-- identifies those rows. If report_type is constrained by a check/enum in the
-- live schema, that constraint needs to be widened separately — this migration
-- only adds the column.
alter table reports add column if not exists discussion_id uuid references area_discussions(id) on delete set null;

alter table area_discussions enable row level security;
alter table area_discussion_comments enable row level security;
alter table area_rates enable row level security;
-- RLS policies for authenticated mobile users (read all; create/delete own rows)
-- are assumed to already exist per the brief and are intentionally not redefined
-- here. Admin routes use the service-role client, which bypasses RLS regardless.
