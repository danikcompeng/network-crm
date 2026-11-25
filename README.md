# Network

A personal CRM for an internship search: the people you meet, who
introduced you to whom, what you talked about, when to follow up, and
every application, with a map of your network at the centre.

Mobile-first. Next.js 16 · React 19 · Tailwind 4 · Supabase · Vitest +
PGlite · Playwright + axe. The plan, every decision and the review log
are in [`plans/crm.md`](plans/crm.md).

## Run it

```bash
npm install
npm run dev          # http://localhost:3200 (not 3000: Hold and Bitewise live there)
npm test             # unit tests and real-Postgres (PGlite) database tests
npm run test:e2e     # Playwright on the shared demo account
npm run screens      # screenshots for the design review (docs/screenshots/)
```

## Environment

`.env.local` (and the Vercel project) needs four values, shared with
Hold and Bitewise:

| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key; RLS limits what it can do |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | the shared demo account behind "Try the demo" (server-only) |

No service-role key is used anywhere.

## Supabase setup

1. Paste each file in `supabase/migrations/` into the SQL editor, in name
   order, once. Never edit one that's applied; add a new file.
2. Authentication → URL Configuration → Redirect URLs: add
   `http://localhost:3200/auth/confirm` and the deployed
   `https://<domain>/auth/confirm` (exact addresses, no wildcards).
