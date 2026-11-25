# Orbit (personal CRM)

A personal CRM for my internship search and network: applications, contacts, interactions,
follow-ups, and a map of who introduced me to who. Mobile-first,
installable. The plan, every decision and the review log live in
`plans/crm.md`. Read it before changing behaviour.

## Working rules

- Every feature goes through the reviewers: plan (in `plans/crm.md`) →
  `logic-checker` → build with tests → `code-reviewer` and
  `design-critic` in parallel (design-critic only when a screen changed;
  Playwright screenshots at 390×844 @3x, light and dark) → fix what's real
  → commit → log every finding and what was done under "Reviews".
- Data logic lives in `lib/` as pure functions with tests; components stay
  thin.
- Never commit secrets. `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD`.
- The Supabase project, login email template and demo account are shared
  with Bitewise (`~/Documents/meal-cost-tracker`) and Hold
  (`~/Documents/habit-tracker`). Only touch `crm_` tables and functions.
  Migrations are pasted into the Supabase SQL editor in name order; never
  edit an applied one, add a new file.
- No service-role key anywhere.

## Reuse

Hold (`~/Documents/habit-tracker`) already solved login, Try the demo,
the `tz` cookie / calendar-day rules, PGlite database tests, Playwright +
axe setup, PWA icons and the three reviewer agents. Read it and reuse the
patterns (adapted, not copied blindly).

## Running it

- `npm run dev` serves on 3200. If 3200 is taken (another app's server),
  run `npx next dev -p 3201` and point Playwright at it with
  `BASE_URL=http://localhost:3201`; `signInDemo` checks the login heading
  is this app's, so a stranger on the port fails fast.
- Screenshots for design-critic come from a production build:
  `npx next build`, `npx next start -p 3300`, then
  `BASE_URL=http://localhost:3300 npx playwright test e2e/screens.e2e.ts --project=setup --project=signed-in -g "<name>"`.
- Every check before a commit: `npx tsc --noEmit && npx eslint`, `npx vitest run`,
  and the e2e suite (`npx playwright test --grep-invert screens`).
