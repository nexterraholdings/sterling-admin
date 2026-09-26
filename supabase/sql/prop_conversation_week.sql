-- Per-run weekly schedule. week_days 0 means off. Bits 0–6 are Sun–Sat.
alter table public.prop_conversation_groups
  add column if not exists week_days smallint not null default 0,
  add column if not exists week_start_hour smallint not null default 9,
  add column if not exists week_end_hour smallint not null default 21,
  add column if not exists week_every_minutes smallint not null default 120,
  add column if not exists calls_per_day smallint not null default 8;

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_week_days_check,
  drop constraint if exists prop_conversation_groups_week_start_hour_check,
  drop constraint if exists prop_conversation_groups_week_end_hour_check,
  drop constraint if exists prop_conversation_groups_week_every_minutes_check,
  drop constraint if exists prop_conversation_groups_calls_per_day_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_week_days_check check (week_days between 0 and 127),
  add constraint prop_conversation_groups_week_start_hour_check check (week_start_hour between 0 and 23),
  add constraint prop_conversation_groups_week_end_hour_check check (week_end_hour between 1 and 24),
  add constraint prop_conversation_groups_week_every_minutes_check check (week_every_minutes between 30 and 360),
  add constraint prop_conversation_groups_calls_per_day_check check (calls_per_day between 1 and 40);
