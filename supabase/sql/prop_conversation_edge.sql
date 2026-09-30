-- How rough a conversation run may get. Safe to re-run.
alter table public.prop_conversation_groups
  add column if not exists swear_strength text not null default 'mild',
  add column if not exists attitude text not null default 'normal';

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_swear_strength_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_swear_strength_check
  check (swear_strength in ('mild', 'strong', 'unfiltered'));

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_attitude_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_attitude_check
  check (attitude in ('normal', 'blunt', 'savage'));
