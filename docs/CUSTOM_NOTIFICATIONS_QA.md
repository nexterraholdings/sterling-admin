# Custom notifications v1 — manual QA

Apply migration `Sterling/supabase/migrations/20260727210000_custom_notification_definitions.sql` before testing.

## Admin

1. Create type `custom_test_map` with tap destination **Map tab**, title with `**bold**`.
2. Send **Custom type** broadcast (inbox + push) to all users (use a dev project with few users).
3. Confirm type appears in **Custom notification types** list; edit copy and re-preview.

## Mobile

1. Open inbox — row shows custom title with bold rendering.
2. Tap notification — opens **Map** tab.
3. Repeat with destinations: `post` (+ valid post UUID), `discussion_hub` (+ discussion UUID), `leaderboard_standing`.
4. Cold-start: kill app, tap push — same destination (requires push payload `routeContext`).

## Regression

1. Tap `new_like` on a post — still opens post detail.
2. Tap `area_discussion_lifecycle` — still uses discussion routing.
3. System broadcast (`system` type) — tap still lands in inbox.
