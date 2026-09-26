-- Optional mild swearing for a conversation run, plus how often it shows up.
alter table public.prop_conversation_groups
  add column if not exists swear boolean not null default false,
  add column if not exists swear_rate text not null default 'sometimes';

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_swear_rate_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_swear_rate_check
  check (swear_rate in ('rare', 'sometimes', 'often'));
