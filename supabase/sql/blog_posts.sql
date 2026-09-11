-- Run this in the Supabase SQL editor (or via CLI migration).
-- Backs the company blog editor in Admin Console (app/dashboard/blog)
-- and the public /blog, /blog/[slug] pages on Sterling Landing.
--
-- All reads/writes go through the service-role client (Admin for
-- authoring, Landing for published reads). RLS is on with no policies
-- so anon/authenticated keys cannot access rows.

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body_markdown text not null default '',
  cover_image_url text,
  author_name text not null default 'Sterling Team',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_published_at_idx
  on blog_posts (status, published_at desc);

alter table blog_posts enable row level security;

notify pgrst, 'reload schema';
