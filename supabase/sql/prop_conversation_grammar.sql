-- How grammatically correct a conversation run should sound. 0 is messy, 100 is correct.
alter table public.prop_conversation_groups
  add column if not exists grammar smallint not null default 30;

alter table public.prop_conversation_groups
  drop constraint if exists prop_conversation_groups_grammar_check;

alter table public.prop_conversation_groups
  add constraint prop_conversation_groups_grammar_check
  check (grammar between 0 and 100);
