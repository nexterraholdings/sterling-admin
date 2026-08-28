-- Run this in the Supabase SQL editor (or via CLI migration).
-- Backs the Sterling Star applicants tab in Admin Console
-- (app/dashboard/sterling-star) and the public ingest route
-- (app/api/public/sterling-star).
--
-- All reads/writes go through the service-role client. RLS is on
-- with no policies so anon/authenticated keys cannot access rows.

create table if not exists sterling_star_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  socials text not null,
  age integer not null check (age >= 18 and age <= 120),
  city text not null,
  state text not null,
  country text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'accepted', 'declined')),
  notes text,
  source text not null default 'sterling-landing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sterling_star_applications_created_at_idx
  on sterling_star_applications (created_at desc);

create index if not exists sterling_star_applications_email_idx
  on sterling_star_applications (lower(email));

create index if not exists sterling_star_applications_status_idx
  on sterling_star_applications (status);

alter table sterling_star_applications enable row level security;
