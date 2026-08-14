-- Documents the market_news_overrides table and get_market_news_override RPC
-- backing the News tab (app/dashboard/news/). Both already exist in Supabase;
-- this file only tracks the schema in the repo like the other tables under
-- supabase/sql/. The mobile app calls the RPC first and falls back to
-- auto-selected news when it returns no row for a given city/state/date.

create table if not exists market_news_overrides (
  id uuid primary key default gen_random_uuid(),
  date_utc date not null,
  city text not null,
  state text,
  article_id text,
  article_url text not null,
  title text not null,
  description text,
  content text,
  source text,
  image_url text,
  published_at timestamptz,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists market_news_overrides_key_idx
  on market_news_overrides (date_utc, city, coalesce(state, ''));

alter table market_news_overrides enable row level security;
-- No policies are added: all reads/writes go through the service-role client
-- (supabaseAdmin) or the get_market_news_override RPC, which run with elevated
-- privileges. This denies anon/authenticated key access by default.
