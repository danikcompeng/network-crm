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

## Feature plans

Each plan is written here before any code, reviewed by `logic-checker`,
and corrected; the corrections are marked _(logic-checker #n)_ so the
Reviews log and the plan can be read side by side.

### Feature 1: Foundation

**Goal:** a deployed-quality shell with nothing on it yet but the right
bones: the whole schema (all three tables, so later features need no
migration for the basics), login, Try the demo with a believable network,
Reset demo, tokens and the design direction confirmed.

**Project.** `create-next-app` (Next 16.4.6, React 19.3, Tailwind 4.3),
then Hold's patterns adapted: `proxy.ts` refreshes the session and guards
pages; `lib/supabase/server.ts` (one server client per request, no
browser client); `lib/server-helpers.ts` (`requireUser`, `userTimeZone`,
`userToday`, `guarded`); `components/timezone-sync.tsx` + the `tz`
cookie; `lib/dates.ts` (calendar-day maths on `YYYY-MM-DD` strings).
`cacheComponents` and `partialPrefetching` stay on (the scaffold's
default), so anything reading cookies sits in `<Suspense>` and the clock
is read after `await io()`. Dev server on **port 3200** (`next dev -p
3200`), so Playwright's `reuseExistingServer` can never test Hold or
Bitewise by mistake when one of them is running on 3000.

**Auth cookie** named `network-auth` (Hold uses `hold-auth`): the three
apps share one Supabase project, and cookies ignore the port, so on
localhost the default name would log you out of the others.

**Migration** `supabase/migrations/20261124120000_crm_schema.sql`, one
transaction (`begin … commit`), pasted once into the SQL editor. Creates
only `crm_` objects.

`crm_contacts`
| column | type | rule |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| user_id | uuid not null | `default auth.uid()`, → `auth.users` on delete cascade |
| name | text not null | 1–80 characters, no space at either end |
| company, role | text null | ≤ 80, trimmed; empty is stored as null |
| how_met | text null | ≤ 280 |
| met_on | date null | when you met (not when you typed them in), so the map can "watch it grow" truthfully; the seed back-dates it _(logic-checker #5)_ |
| introduced_by | uuid null | see the graph rules below |
| stage | text not null | default `new`; one of `new, reached_out, talking, interviewing, offer, parked` |
| next_follow_up | date null | a calendar day |
| notes | text null | ≤ 4,000 _(logic-checker #3)_ |
| created_at, updated_at | timestamptz | `now()`; `updated_at` set by a trigger on every update |

Every `date` column in every table is checked to lie in 2000-01-01 …
2100-12-31, so a mis-parsed import (Excel serial 45620, year 0026) is
refused by the database, not stored _(logic-checker #7)_.

`crm_interactions`: id, user_id, contact_id (not null), day (`date`,
and **not after tomorrow in UTC**, which covers today everywhere, checked
in the insert/update policy), kind (`message, email, call, meeting,
applied, other`), note (≤ 1,000), **cleared_follow_up** (`date`, null:
the follow-up this log resolved, so undoing the log can put it back),
created_at. Deleting a contact deletes their interactions. The `applied`
kind stays a hand-logged note ("told Riya I applied"); it isn't linked to
an application row.

`crm_applications`: id, user_id, company (1–80), role (1–120), link
(null, or ≤ 2,000 characters starting `http://` or `https://`, so a
`javascript:` link can't be stored), location (≤ 80), applied_on (`date`,
**nullable**: a `saved` application hasn't been applied to yet, and an
imported row may have no date; the database doesn't tie status to date,
the app defaults applied_on to today when a status leaves `saved`),
status (default `applied`; `saved, applied, online_assessment,
interviewing, offer, rejected, withdrawn`), deadline (`date`, null),
contact_id (null), notes (≤ 2,000), created_at, updated_at. Deleting the
linked contact keeps the application and clears its contact. No unique
index on company + role: applying to the same role again next season is
real, so duplicates are caught in the import preview (Feature 3), not
refused.

**Indexes** _(logic-checker #8)_: `contacts (user_id, introduced_by)`,
`contacts (user_id, next_follow_up)`, `interactions (user_id,
contact_id, day)`, `interactions (user_id, day)`, `applications
(user_id, contact_id)`, `applications (user_id, status)`. The first,
third and fifth also make the delete actions (set null / cascade) cheap.

**Logging, atomically (for Feature 4, decided now so Feature 4 needs no
migration)** _(logic-checker #4)_:
- `crm_log_interaction(p_contact_id, p_day, p_kind, p_note)`: one
  transaction. Locks the contact row, inserts the interaction, and **if
  the contact's follow-up is on or before `p_day`** (due or overdue: you
  did what it reminded you to), clears it and stores it in
  `cleared_follow_up`. A follow-up later than the interaction stays. A
  call back-dated to before the follow-up doesn't resolve it. Returns the
  new id and what was cleared.
- `crm_undo_interaction(p_id)`: deletes the interaction, and puts its
  `cleared_follow_up` back **only if the contact still has no
  follow-up** (one set since, by the "follow up in 7 days" offer or by
  hand, is newer and wins) **and no interaction still logged is on or
  after that follow-up's day** (it would have resolved it too)
  _(code-reviewer #1)_.
- Setting the offered follow-up is a plain update; Feature 4 decides
  how it guards against a stale screen.

**Counts without fetching rows** _(logic-checker #2)_: Supabase's API
returns at most 1,000 rows per request. `crm_contact_stats()` returns one
row per contact (interaction count, last interaction day), so the map's
dot sizes and "last talked" never need every interaction. With the
contact limit at 1,000, every contact list fits in one request.

**Keeping references inside one account.** Every table has `unique (id,
user_id)` on contacts and composite foreign keys `(introduced_by,
user_id)`, `(contact_id, user_id)` → `crm_contacts (id, user_id)`, so a
row can only point at a contact with the **same owner**, even with a
guessed id. The two nullable ones use `on delete set null (introduced_by)`
/ `set null (contact_id)` (Postgres 15+ column list: plain `set null`
would also null `user_id`).

**The introduction graph.**
- `introduced_by <> id` (check constraint): no loop of one.
- No longer loops either: a `before insert or update of introduced_by`
  trigger walks up the chain from the new introducer and refuses
  (`CR001`) if it reaches the contact itself. **Inserts too**: a client
  can choose ids, and one bulk insert of A→B and B→A passes the foreign
  keys (checked at the end of the statement); a BEFORE ROW trigger sees
  the earlier rows of the same statement, so the second row is refused
  _(logic-checker #1)_. The trigger returns at once when the new
  introducer is null (which is also what the delete's set-null action
  sends), takes a per-user advisory lock otherwise (two tabs saving "A
  introduced B" and "B introduced A" at once take turns and the second is
  refused), and walks inline in plpgsql under READ COMMITTED so it reads
  what was committed before the lock. The walk itself is loop-safe
  (`union`, which stops at the first repeat, so it ends after at most
  one step per contact), and so is every walk in `lib/network.ts` (a visited set): a
  loop that somehow exists can't hang anything _(logic-checker #9)_.
- Deleting a contact who introduced others **detaches** them (they hang
  off you). Re-linking them to the deleted person's introducer would
  invent an introduction that never happened. The delete confirmation
  (Feature 2) says how many people this affects.
- Changing someone's introducer moves them **with** the people they
  introduced (their own links don't change).
- The app's introducer picker leaves out the contact and everyone below
  them (`lib/network.ts`, pure, tested), so the trigger is only a
  backstop.

**Limits** (a `before insert` trigger each, like Hold's: a policy count
can't see the other rows of the same bulk insert): **1,000 contacts**
(so a full list is one API request), **5,000 interactions**, **1,000
applications** per account _(logic-checker #2, #3)_. The project's
storage is shared with two live apps and anyone can sign up, so the
worst case is written down: at the limits, with every text full of
4-byte characters, one account is about 18 MB of contacts + 20 MB of
interactions + 17 MB of applications ≈ **55 MB**. Accepted: it needs an
email-verified account per 55 MB, and the counts are far above real use
(~55 applications, a few hundred people).

**RLS and privileges.** RLS on all three tables; select / insert /
update / delete policies, each `(select auth.uid()) = user_id`, with
`with check` on insert and update. Privileges revoke-then-grant
(Supabase grants ALL, including TRUNCATE, by default): `select, insert,
delete` on each table, and `update` only on the editable columns (never
`id`, `user_id`, `created_at`, `updated_at`, `cleared_follow_up`). So
the app uses insert and update, never supabase-js `.upsert()` (which
would need update on `id`). Every function has `set search_path = ''`,
is `security invoker`, and has EXECUTE revoked from **PUBLIC, anon and
authenticated** (Supabase's defaults grant all three), then granted back
to `authenticated` only for the RPCs the app calls: `reseed_demo_crm`,
`crm_log_interaction`, `crm_undo_interaction`, `crm_contact_stats`
_(logic-checker #11)_.

**Demo seed.** `reseed_demo_crm(p_seed jsonb)`: replaces the caller's
contacts, interactions and applications with the payload in one
transaction, under a per-user advisory lock (two demo sign-ins at once
take turns). Security invoker, so RLS, the limits and every check still
apply: anyone calling it only ever replaces their own data. The payload
never contains real ids _(logic-checker #6)_:

```
{ "contacts":     [{ "key", "name", "company", "role", "how_met", "met_on",
                     "introduced_by" (another contact's key, or null),
                     "stage", "next_follow_up", "notes", "created_at" }],
  "interactions": [{ "contact" (a contact key), "day", "kind", "note", "created_at" }],
  "applications": [{ "company", "role", "link", "location", "applied_on", "status",
                     "deadline", "contact" (a contact key, or null), "notes", "created_at" }] }
```

The function maps keys to the new ids. Introducers must come before the
people they introduced; an unknown key, a **duplicate key**, or a
missing list fails the whole seed (`22023`).

`lib/demo-seed.ts` (pure, tested) builds the payload relative to the
visitor's today: **20 contacts in total: three introduction chains**
(a chain is a contact with no introducer who introduced at least one
person) **and five people met directly** _(logic-checker #13)_,
**fictional people at fictional companies**
(the demo is public; no real names, so not Jonathan or Tempo),
interactions over the last ~60 days, and follow-ups spread across
overdue, today, the next 7 days, later and none, so Today and the map
have something true to show from the first visit. Applications are added
to the seed in Feature 3 (the function already takes them).

When to reseed: Hold's rule, with Network's own markers in the shared
demo account's metadata (`crm_demo_seeded_at`, `crm_demo_seeded_day`):
never seeded, seeded over an hour ago, seeded for an earlier day than
the visitor's today, or seeded "in the future" (a hand-set clock).
`lib/demo.ts` refuses to seed anything but the demo email.

**Login** (Hold's, reworded): email → 6–10 digit code (the shared
neutral email template), "I already have a code", the email's button as a
backup through `/auth/confirm`, and **Try the demo** (server-side
password sign-in; the browser never sees the credentials). Logged-in
users are sent away from `/login`; logged-out users to it.

**Home (for now).** `/` shows the wordmark, who's logged in, a one-line
summary ("20 people, 3 introduction chains") read from the database, so
the seed is visibly working, and Log out / Reset demo. Feature 4
replaces it with Today, and Feature 2 adds the tab bar.

**Design direction (confirmed).** Light-first; dark follows the system.
- Light: paper `#F8F7F4` background, white surface, graphite ink
  `#1D2125`, muted `#575D66`, hairlines `#E3E2DD`, **cobalt `#1D4ED8`**
  (the one accent: primary actions, "you", focus, links), danger
  `#B3261E`.
- Dark: graphite `#131518`, surface `#1C1F23`, ink `#ECEEF0`, muted
  `#A0A7B0`, cobalt lightened to `#8AA8FF` so it doesn't glare.
- Instrument Sans (variable), one family. Wordmark 44 px semibold; page
  title 30; section 20; body 16 (inputs too, so iPhones don't zoom);
  meta 14; tabular figures for dates and counts.
- Flat and drawn: hairline borders instead of shadows, 12 px radius on
  fields and buttons, 16 px on cards; no "key" lips (that's Hold).
- Motion: 150 ms for feedback, 200 ms for state, 250 ms for sheets,
  ease-out; everything respects Reduce Motion.
- Tokens in `app/globals.css`, mirrored in `lib/palette.ts`;
  `lib/palette.test.ts` checks every text pair is 4.5:1, every mark 3:1,
  and that the two files agree, and refuses opacity-mixed colour classes
  (`border-edge/60`), which would escape the checks. 44 px targets.
- Edges _(design-critic #2, #4)_: `line` divides rows inside a card;
  `line-strong` edges a card or sheet on the page; `edge` (3:1) edges a
  control and draws the map's introduction lines. `surface-press` is a
  pressed row or ghost button and a chip's fill; `surface-sunk` is for
  skeletons only. Cobalt splits into `accent` (text, marks, focus) and
  `accent-fill` (large fills; a deeper `#3D63E0` in dark).
- Stages and statuses _(design-critic #5)_: the **shape and the word**
  carry the meaning (shapes in Feature 2); colour only adds emphasis:
  `ink-muted` for new / reached out / parked, `ink` for talking, `accent`
  for interviewing / offer. Application statuses use the same three
  levels (rejected and withdrawn muted, never red). Overdue follow-ups say
  "3 days overdue" in `danger`: it's the one state that asks for action
  today, and the words carry it without the colour.
- Type sizes: 44 / 30 / 20 / 18 (lead) / 16 / 14; 12 only for map labels.

**Tests.** PGlite (`tests/db/`, Hold's Supabase stand-in with the real
default privileges): RLS for each operation and each table as
`authenticated` and `anon`; cross-account references refused; self and
longer loops refused; deleting an introducer detaches; deleting a contact
cascades interactions and clears applications; limits; column grants;
`updated_at`; `javascript:` links refused; interaction days after
tomorrow refused; the reseed (all or nothing, never another account,
unknown key, anon can't run it). Unit: dates, demo seed (keys valid,
introducers first, 20 contacts, 3 chains, no loops), `needsReseed`, login
code, auth and demo actions with mocked Supabase, palette, proxy paths.
Playwright (once `.env.local` exists and the migration is applied): login
accessible in light and dark (axe), Try the demo reaches home showing the
seeded count, Log out.

**Supabase setup (by hand, once).** Paste the migration into the SQL
editor. Add `http://localhost:3200/auth/confirm` and the production
`/auth/confirm` address to Authentication → URL Configuration →
Redirect URLs as exact addresses (never a wildcard), or the email's
button falls back to the Site URL, which is another app
_(logic-checker #12)_. The typed code works either way.

**Known limits.** Supabase writes user metadata as a whole, so a Hold and
a Network demo seed finishing in the same instant can lose one marker
(the next sign-in reseeds; harmless). Removed people can't be restored
(no undo of a delete). A demo seeded by a visitor further east is up to
a day ahead for up to an hour: a follow-up "due today" for them shows as
tomorrow for a Toronto visitor until the next reseed. Every screen
treats days after the viewer's today the same way: upcoming, never
hidden _(logic-checker #10)_. The shared demo is a real session: a
visitor can lift its cookie and change the demo's password (breaking
the demo in all three apps until it's reset in Supabase), or write their
own contacts and notes through the API, which the next visitors see for
up to an hour. RLS keeps all of it inside the demo's own `crm_` rows
(inherited from Hold, accepted there too).

### Feature 2: Contacts

**Goal:** find anyone in two seconds, add someone in thirty, and see
everything about one person on one screen.

**Navigation.** A bottom tab bar on every signed-in screen (a route
group `app/(app)/` with its own layout; `/login` stays outside). Each
feature adds its own tab, so the bar never shows a screen that doesn't
exist yet: Feature 2 has **Home** and **People**; then Applications
(3), Today replaces Home (4), Map (5). Real links with
`aria-current="page"`, icon + text label, 56 px tall plus the home
indicator's safe area; pages pad their bottom by the same amount so
nothing hides behind it.

**`/people` (the list).**
- One request for every contact (at most 1,000: the limit fits the API's
  one-request answer) with `id, name, company, role, stage,
  introduced_by, next_follow_up`, plus `crm_contact_stats()` for "last
  talked". Search and filter run in the browser on that list, so they're
  instant and work offline once loaded.
- **Search** (`type="search"`, labelled): every word typed must appear
  in the name, company or role, ignoring case and accents ("jose"
  finds "José"), in any order ("kestrel sam" finds Sam Okafor at
  Kestrel).
- **Stage filter**: chips All / New / Reached out / Talking /
  Interviewing / Offer / Parked, each with its count (counts follow the
  search), one selected at a time (`aria-pressed`). Search and stage
  combine. The filter and search are kept in the address
  (`?stage=talking&q=sam`, replaced, not pushed), so Back from a contact
  returns to the same list.
- **Order**: by name (locale-aware, accent- and case-insensitive).
- **Row**: name; company · role (either may be missing, truncated with
  an ellipsis); the stage as a label with its shape (below); the
  follow-up if one is set ("3 days overdue", "Today", "Tomorrow", "In 5
  days", "Dec 9"). The whole row is one link to the contact.
- A polite live region says the result count when it changes ("12
  people"). States: empty account ("No one yet" + Add), no match
  ("No one matches 'xyz'" + Clear), loading skeleton, error page.
- **Add** button in the header → `/people/new`.

**Stage shapes** (`lib/stages.ts`, used here and by the map in Feature
5, so a stage looks the same everywhere and never relies on colour):
new ○ hollow circle, reached out ◔ quarter-filled, talking ● filled,
interviewing ◆ diamond, offer ★ star, parked – a short bar. Always next
to the stage's name in lists.

**`/people/[id]` (a contact).** Param inside `<Suspense>` (Cache
Components: params are request data); a malformed or unknown id is a
404 (`notFound()`). Shows, in order of use:
1. Name, company · role, stage.
2. **Next follow-up** (or "No follow-up set"), with the same wording as
   the list.
3. **How you know them**: introduced by X (a link to X), or "You met
   them yourself"; how met; met on. Then **Introduced you to** (links,
   by name), if anyone.
4. **Notes** (kept line breaks, no markup: plain text, so nothing in a
   note can run as HTML).
5. **Timeline**: interactions newest first (day, kind, note), at most
   the latest 100, with "Showing the latest 100 of 312" when there are
   more (the count from `crm_contact_stats`). Logging is Feature 4; the
   seeded history shows here from day one. Applications join in Feature
   3.
- **Edit** → `/people/[id]/edit`.

**Add / edit form** (one component, `lib/contact-input.ts` does all
checking, pure and tested; the server action runs it again, since an
action is a public endpoint):
- Name (required, 1–80), company, role (≤ 80), stage (a native
  `<select>` of the six, default New), **introduced by** (a native
  `<select>`: "Nobody, I met them myself", then `introducerChoices`
  sorted by name: never the person or anyone below them), how met (≤
  280), met on (date, default today in your timezone for a new contact),
  next follow-up (date, optional, with a "Clear" button), notes (≤
  4,000, a textarea).
- Tidying: texts trimmed, inner whitespace in single-line fields
  collapsed, Unicode spaces counted as spaces; empty becomes null;
  lengths counted in characters (code points), like the database.
- Dates come from `<input type="date">` as `YYYY-MM-DD` (a calendar day,
  no timezone), must be real days in 2000–2100 (the database's range);
  met on can't be after today.
- Errors appear next to their field (`aria-describedby`, announced) and
  the first one gets focus; nothing typed is lost.
- Database answers mapped to words: `CR001` (a loop, possible if the
  list changed in another tab) → "That would make a loop: X was
  introduced through this person"; `23503` (the introducer was deleted
  meanwhile) → "That person no longer exists"; `54000` → "You can have
  up to 1,000 people"; an update or delete that touches no row (deleted
  elsewhere, or the demo was reset) → back to the list with "That person
  was removed".
- After saving: to the contact's page (new or edited).
- Two tabs editing one person: last save wins, field by field it's the
  whole row (accepted: one user, rare; noted in Known limits).

**Delete** (on the edit page, at the bottom, `danger`): an inline
confirmation that says what happens, in numbers: "Delete Sam Okafor?
Their 3 interactions are deleted. 1 person they introduced (Riya Patel)
stays, with no introducer. 2 applications stay, unlinked." Confirm →
`/people` with a status message "Deleted Sam Okafor". No undo (Known
limits); the confirmation is the guard.

**Shared pure modules (tested):** `lib/people.ts` (search
normalisation, matching, stage counts, ordering), `lib/follow-up.ts`
(follow-up wording and buckets: overdue = before today, today, soon =
today + 1 … today + 7 inclusive, later = after that; Feature 4's Today
reuses exactly these), `lib/format.ts` (a calendar day shown as "Mon,
Nov 24" / "Nov 24" / "Nov 24, 2025": formatted in UTC from the
`YYYY-MM-DD` string, so no timezone can shift it), `lib/contact-input.ts`.

**Next 16 notes.** `cacheComponents` is on: every page reading
cookies or params sits inside `<Suspense>`. Hidden routes stay alive
(`<Activity>`), so the form resets its transient state (a pending
delete confirmation) in a `useLayoutEffect` cleanup, as Hold does.
Actions call `refresh()`; `redirect()` is called outside any try/catch.

**Tests.** Unit: search (accents, case, word order, empty query),
counts, ordering, follow-up wording and bucket edges (today − 1, today,
today + 1, today + 7, today + 8; across a month and year end), day
formatting, contact input (every rule above, including emoji lengths
and Unicode spaces), the delete summary wording (singular/plural).
Server actions with mocked Supabase (auth required, invalid id refused
before any query, each database error mapped, gone row). Playwright:
search and filter on the demo, add → appears in the list → edit
(change introducer, stage) → the contact page shows the chain → delete
with the confirmation → gone; the introducer list leaves out the
person's own introductees; axe in light and dark on the list, a
contact, and the form.

## Reviews

_One entry per feature. Every agent finding is logged with its severity
and what was done about it. The agents are read-only
(`.claude/agents/`); in the build session they ran as general-purpose
agents loading those files, because project agents are only registered
for sessions started in this folder._

### Feature 1: Foundation (2026-11-24)

#### logic-checker (plan review)
Verdict: **Ready after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | The loop check ran on update only, but a client can choose ids: one bulk insert of A→B and B→A passes the foreign keys (checked at statement end), and every walk downstream would then hang or drop people. | Fixed | Trigger is `before insert or update of introduced_by`; walks are loop-safe in SQL (`union`) and in `lib/network.ts` (visited set). PGlite tests: bulk insert with chosen ids, a multi-row swap, a pre-existing loop that mustn't hang. |
| 2 | High | Supabase's API answers at most 1,000 rows, below the planned 2,000-contact limit: lists and the map would silently miss people. Dot sizes can't be built from up to 20,000 interaction rows. | Fixed | Contact limit 1,000; `crm_contact_stats()` returns one row per contact (count, last day). |
| 3 | Medium | Limits ~1,000× Hold's could let throwaway accounts fill the shared database (~280 MB each). | Fixed | 1,000 contacts / 5,000 interactions / 1,000 applications, shorter notes; worst case (~55 MB/account) written down and accepted. |
| 4 | Medium | Feature 4's "logging clears or moves the follow-up" is two writes; partial failure, stale tabs, and no way to undo. | Fixed | `crm_log_interaction` (one transaction, clears a follow-up due on or before the day, remembers it in `cleared_follow_up`) and `crm_undo_interaction`, in this migration. |
| 5 | Medium | "Watch it grow" had only `created_at` (when typed in, not when met). | Fixed | `met_on date`, back-dated by the seed. |
| 6 | Medium | The reseed payload was only specified for contacts; duplicate keys would silently mislink. | Fixed | Full `p_seed` shape in the plan and the function; duplicate / missing / unknown keys fail with `22023` (tested). |
| 7 | Low | `applied_on` and `deadline` had no range; status not tied to date. | Fixed | Every date column checked to 2000–2100; status↔date left to the app (documented). |
| 8 | Low | No indexes, so foreign-key actions and limit counts would scan. | Fixed | Six indexes on the user/reference columns. |
| 9 | Low | Loop trigger details: return early on null (the delete's set-null arrives as an update), read fresh data after the lock. | Fixed | Early return, inline plpgsql walk under READ COMMITTED; tested delete-an-introducer. (Concurrency itself can't be exercised in single-connection PGlite.) |
| 10 | Low | A seed dated by a visitor further east shows "due today" as tomorrow for up to an hour. | Accepted | Known limit; every screen treats future days as upcoming. |
| 11 | Low | Revoking EXECUTE from PUBLIC and anon isn't enough: Supabase also grants `authenticated`. | Fixed | Revoke from all three, grant back four RPCs; `proacl` test. No `.upsert()` (column grants). |
| 12 | Low | Redirect URLs for port 3200 and production. | Fixed | Fallback origin is 3200; setup step in the plan and README. |
| 13 | Low | "3 chains" undefined. | Fixed | A chain starts with someone you met who introduced someone; 20 = 3 chains + 5 direct (tested). |

Open questions answered: logging is an atomic RPC that remembers the
follow-up it cleared; `met_on` added; the database doesn't tie status to
dates; import duplicates are caught in the preview (no unique index);
the `applied` kind stays a free note; contact cap 1,000; ~55 MB worst
case per account accepted.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. RLS, grants, function privileges, composite keys, loop trigger and reseed all checked fine.

| # | Severity | Finding (file) | Outcome | What changed |
|---|----------|----------------|---------|--------------|
| 1 | Medium | `crm_undo_interaction` restored a follow-up that a second interaction (same day) had also resolved. (migration) | Fixed (before the migration was applied) | Restores only if no remaining interaction is on or after that day; two PGlite cases. |
| 2 | Medium | The guard against seeding a real account had no test (Hold's `lib/demo.test.ts` not carried over). (lib/demo.ts) | Fixed | Ported, plus a payload-dating test and a `tz`-cookie test for `signInDemo` (UTC+14). |
| 3 | Low | The e2e seeded-count check depended on nobody touching the demo in the last hour. (e2e/login.e2e.ts) | Fixed | Reseeds first. |
| 4 | Low | `npm run screens` pointed at a missing file. | Fixed | `e2e/screens.e2e.ts` (login + home, light and dark). |
| 5 | Low | Shared-demo risks (password change, visitor-written content) missing from Known limits. | Fixed | Added. |
| 6 | Low | Limit counts could be overshot by two concurrent inserts. (migration) | Fixed | Per-user, per-table advisory lock before counting. |
| 7 | Low | Remounting the `role="status"` node (`key`) may stop "Demo reset" being announced. | Fixed | Stable node; the text still changes on every reset (it's empty while pending). |
| 8 | Low | README was the scaffold's (port 3000, no Environment section). | Fixed | Minimal README; the portfolio README is Feature 6. |
| — | Plan | Plan promised a depth cap the code doesn't need (`union` terminates). | Fixed | Plan text corrected. |

#### design-critic (login and home, light and dark)
Verdict: **Ship after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The refocused invalid email box showed a cobalt focus ring around a 1 px red border: it read "focused", not "wrong"; in dark the two vibrated. | Fixed | Invalid fields get a 2 px red edge (border + ring, no shift) and a red focus ring. Every later form inherits it. |
| 2 | Medium | "Try the demo"'s edge (`ink-muted/60`) was ~2.5:1 on paper and an opacity mix the palette test never saw; the input edge next to it was much heavier. | Fixed | One `edge` token (3.2–3.7:1) for every control; palette test bans opacity-mixed colour classes. |
| 3 | Medium | Footer label and actions looked the same. | Fixed | Label regular muted; actions ink, semibold, 44 px. Account actions stay at the bottom of Home (later Today), above the tab bar. |
| 4 | Medium | `line` too faint to edge cards; no token for map edges. | Fixed | `line-strong` for card/sheet edges; `edge` (3:1) for map lines, in `NON_TEXT_PAIRS`. |
| 5 | Medium | No stage/status colour scheme; overdue would borrow `danger` ad hoc. | Fixed | Decided in Design direction: shape + word first, three colour levels, overdue in `danger` with words. |
| 6 | Low | Dark primary button a pale periwinkle slab. | Fixed | `accent-fill` `#3D63E0` in dark with white text (5.2:1). |
| 7 | Low | An 18 px size not in the plan; 12 px offered everywhere. | Fixed | Lead 18 added to the plan; 12 px for map labels only. |
| 8 | Low | The Demo chip looked like a button. | Fixed | Borderless `surface-press` chip. |
| 9 | Low | Pressed states invisible (`surface-sunk` ~1.05:1, a "hole" in dark). | Fixed | `surface-press` token for pressed rows and ghost buttons. |
| 10 | Low | The code box gave no hint. | Fixed | Placeholder "123456". |

Unreviewed (carried to later features): loading and server-error states
of the login, the expired-link banner, skeletons, safe areas on a real
device, the installed app's status bar in dark, motion (none yet).
