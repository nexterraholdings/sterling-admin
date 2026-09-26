-- Per-run instructions the model follows when it writes a line.
-- Null means the run has never set rules, so the app uses its starters.
alter table public.prop_conversation_groups
  add column if not exists rules text;
