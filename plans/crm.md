# Personal network CRM: plan

Started Nov 24, 2026. Working name: **Network** (pick a real name before it ships).

## Why

It's my internship-search CRM. I'm applying to internships (~55 so far), talking to Jonathan at Tempo, and
meeting more people every week. I lose track of who I talked to, who
introduced me to who, and when to follow up. Jonathan's notes from our call
said "map a network of people using CRMs". This is that, built for me.

**Signature feature:** the network map. Every person is a dot, lines show
who introduced you to who, you're in the middle, and you can watch it grow.

## Who uses it

Me, on my phone and laptop. Same quality bar as Bitewise and Hold: live on
Vercel, demo login, installable, tested, reviewed.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase
(Postgres, auth, RLS) · Vercel · Vitest + PGlite · Playwright + axe.
Same Supabase project as Bitewise and Hold:
own tables prefixed `crm_`, never touch the others' tables, same shared
neutral login email, same shared demo account (demo markers `crm_*`).

## Data model (draft: logic-checker reviews this first)

- `crm_contacts`: id, user_id, name, company, role, how_met (text),
  introduced_by (nullable, references crm_contacts, same user only),
  stage, next_follow_up (calendar `date`, nullable), notes, created_at,
  updated_at.
- `crm_interactions`: id, user_id, contact_id, day (calendar `date`),
  kind (message, email, call, meeting, applied, other), note, created_at.
- `crm_applications`: id, user_id, company, role, link (url, nullable),
  location, applied_on (calendar `date`), status, deadline (`date`,
  nullable), contact_id (nullable: the person tied to it, e.g. a
  recruiter or whoever referred me), notes, created_at, updated_at.
  Application statuses: `saved`, `applied`, `online_assessment`,
  `interviewing`, `offer`, `rejected`, `withdrawn`.
- Stages (people): `new`, `reached_out`, `talking`, `interviewing`, `offer`, `parked`.
- RLS: own rows only, privileges written revoke-then-grant. An
  introduced_by must point at one of your own contacts, and never at the
  contact itself (no loops of one).
- "You" is not a row: a contact with no introducer hangs off you.
- Dates are calendar days in the user's timezone (reuse Hold's `tz` cookie
  rules), never timestamps.

## Features (each one: plan → logic-checker → build + tests → code-reviewer + design-critic → commit → log under Reviews)

1. **Foundation:** project, schema + RLS migration, email-code login,
   Try the demo, design tokens, demo seed (`reseed_demo_crm()` as the demo
   user, ~20 believable contacts across 2-3 introduction chains).
2. **Contacts:** list (search, filter by stage), add/edit/delete, contact
   page with notes and timeline.
3. **Internship applications:** a list of every application (company,
   role, date applied, status, link), filter by status, quick status
   change, counts at the top (applied / interviewing / offers). An
   application can link to a contact, and a contact's page shows their
   applications. Import: paste rows from a spreadsheet or CSV (I have ~55
   already). Demo seed includes ~15 believable applications.
4. **Interactions + follow-ups:** log an interaction in two taps; after
   logging, offer "follow up in 7 days" (editable). **Today** screen:
   overdue, due today, next 7 days. Logging clears or moves the follow-up.
5. **Network map:** SVG with a force layout (d3-force) computed in the
   browser; you in the centre; edges = introduced_by; dot size = number of
   interactions; stage shown by fill AND a label/shape (not colour alone).
   Tap a dot → contact sheet. Pan/zoom on touch. Reduce Motion: no
   simulation animation, just the settled layout. Screen readers get the
   same network as a list grouped by who introduced who.
6. **Install + polish:** PWA, icons, every state (empty, loading, error,
   first use), motion pass, accessibility pass.

Later: an MCP server so Claude can answer "who haven't I followed up with
in 2 weeks?" and draft messages (read-only first).

## Design direction (to confirm in Feature 1)

Its own look, different from Bitewise (matcha on white) and Hold
(persimmon on near-black): light-first, paper-white and graphite with one
cobalt accent, Instrument Sans, the map as the hero screen. Tokens in one
file, contrast checked (4.5:1 text, 3:1 marks), 44 px targets.

## Reviews

(Each feature's findings from logic-checker, code-reviewer and
design-critic go here, with what was done about each.)
