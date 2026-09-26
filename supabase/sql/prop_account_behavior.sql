-- Per prop account voice. Null cuss words, grammar, and abbreviations
-- follow the conversation run. Behavior notes always apply to that account
-- and win over the run's rules when they conflict.
alter table public.prop_account_personas
  add column if not exists swear boolean,
  add column if not exists swear_rate text,
  add column if not exists grammar smallint,
  add column if not exists abbrev smallint,
  add column if not exists behavior text not null default '';

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_swear_rate_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_swear_rate_check
  check (swear_rate is null or swear_rate in ('rare', 'sometimes', 'often'));

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_grammar_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_grammar_check
  check (grammar is null or grammar between 0 and 100);

alter table public.prop_account_personas
  drop constraint if exists prop_account_personas_abbrev_check;

alter table public.prop_account_personas
  add constraint prop_account_personas_abbrev_check
  check (abbrev is null or abbrev between 0 and 100);
