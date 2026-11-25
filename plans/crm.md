# Personal network CRM: plan

Started Nov 24, 2026. The app is **Orbit** (renamed from the working name "Network" on Nov 25, 2026; the repo stays `network-crm`).

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

When to reseed: Hold's rule, with Orbit's own markers in the shared
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
- Chips and badges _(design-critic F2 #12)_: something you can tap to
  filter is a **round pill** (surface, `line-strong` edge; selected:
  `accent-tint` with a cobalt edge). Something that only says what a
  thing is (a stage, a status, "Demo") is a **badge**: 6 px corners,
  `surface-press` fill, no edge. The current tab gets an `accent-tint`
  pill behind its icon and a semibold label, never colour alone.
- Danger has two tokens like cobalt: `danger` for words and edges,
  `danger-fill` (a deeper `#C2372D` in dark) for the Delete button.
- Field hints sit under their field, muted (the login's "We sent a code
  to …" above the box is an intro sentence, not a hint). Curly
  apostrophes and quotes in all copy.

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
an Orbit demo seed finishing in the same instant can lose one marker
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

**Decided after the logic check** (these replace the bullets above
where they disagree):
- **Add and Edit are dialogs, not routes** _(logic-checker #1, #2, #8)_.
  Next keeps hidden routes alive under `<Activity>`, so a `/people/new`
  or `/edit` route would come back holding the last person's values (a
  duplicate one tap away) or values older than the database (a stale
  save writing a resolved follow-up back), and `redirect()` pushes
  history, so Back would land on a dead form. Instead: **Add** opens a
  full-screen `<dialog>` on the People list (focus trapped, Esc closes),
  fresh every time it opens; saving goes to the new person with
  `router.replace`-free history (list → person; Back returns to the
  list). **Edit** opens the same dialog on the contact's page, filled
  from the page's current data each time it opens; saving refreshes the
  page in place (no navigation). Delete lives in the edit dialog;
  confirming replaces the history entry with the list (`redirect(...,
  "replace")`), so Back never reaches a deleted person.
- **Stale saves are refused** _(logic-checker #1)_: the edit sends the
  `updated_at` it was opened with, and the update only matches that
  version (`.eq("updated_at", …)`). No match: if the person still
  exists, "They were changed somewhere else. Close to see the latest";
  if not, "That person was removed". The payload is built from exactly
  the nine editable columns (tested), never `id` or `updated_at`.
- **The tab bar's current tab sits in its own `<Suspense>`**
  _(logic-checker #3)_: `usePathname` suspends below a dynamic segment
  with Cache Components; the fallback is the same bar with no current
  tab, so nothing shifts.
- **Search and filter never navigate** _(logic-checker #4)_: the
  address is updated with `window.history.replaceState` (Next keeps
  `useSearchParams` in sync), filtering stays in the browser.
- **One `today`** _(logic-checker #5)_: the server's `userToday()` is
  passed down as a prop and used for every label on the screen. A
  `DayWatcher` (Hold's, without the hold) refreshes the page when the app
  returns to the foreground or the device's date changes, so "Today"
  can't go stale overnight. "Met on" in the Add dialog defaults to that
  `today` when the dialog opens, and follows it until touched.
- **Notes count after line ends are normalised** (`\r\n` → `\n`, before
  trimming and counting), and U+0085 counts as whitespace too
  _(logic-checker #6, #12)_.
- **The demo heals itself** _(logic-checker #7)_: a demo sign-in also
  reseeds when the sample data was changed since the last seed (any
  contact, interaction or application created or updated after the seed
  marker, or a count that differs from the seed's). So a visitor who
  deletes five people leaves the next visitor a whole network, without
  reseeding on every sign-in. Reset demo stays visible on Home.
- **Not found** _(logic-checker #9)_: `app/(app)/people/[id]/not-found.tsx`
  says "This person isn't in your network (maybe they were deleted)"
  with a way back, inside the tab bar. Tests check the text (a 404 inside
  a stream keeps status 200).
- **Folding** covers letters that don't decompose (ł ø ß æ œ đ ð þ ı)
  _(logic-checker #11)_; the collator and date formats are pinned to
  English, and sorting happens only in the browser.
- **Introducer options** read "Name · Company" when there's a company,
  so two Alexes can't be confused _(logic-checker #12)_.
- **Error words**: `23514` → "Something in the form isn't allowed";
  `CR001` → "They're already above this person in the chain, so that
  would make a loop" (no name: the database doesn't say who)
  _(logic-checker #13)_.
- **Rows** show the follow-up if one is set (parked people too: "check
  back in the spring" is a follow-up), otherwise "Talked 3 days ago" from
  `crm_contact_stats` (or nothing, never talked). The contact page shows
  the **whole chain** above the person ("Elena Marsh → Sam Okafor →
  Riya Patel"), from a loop-safe `chainAbove` in `lib/network.ts`. The
  timeline is ordered by day, then the time it was logged, newest first
  _(logic-checker #14)_.
- **Met on earlier than the introducer's** is allowed (people do meet in
  odd orders); the map (Feature 5) draws a link once both ends exist
  _(logic-checker #15)_.
- **"Deleted Sam Okafor"** arrives as `?deleted=` and the list removes
  it from the address as soon as it's shown, so a reload doesn't repeat
  it.

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

### Feature 3: Internship applications

**Goal:** every application in one list, where each stands at a glance,
status changed in one tap, and the ~55 already in a spreadsheet brought in
by pasting.

**Tab** "Applications" (between People and Map). **`/applications`**:
- **Counts at the top**, as three tiles: **Applied** (every application
  that isn't `saved`: everything you've sent, whatever happened since),
  **Interviewing** (`online_assessment` + `interviewing`: in process),
  **Offers** (`offer`). Tapping a tile filters to it.
- **Status filter** chips (All, Saved, Applied, Online assessment,
  Interviewing, Offer, Rejected, Withdrawn) with counts, one at a time,
  kept in the address with `history.replaceState` (as People). A search
  box (company or role, folded like People's).
- **Order**: saved first, by deadline (soonest first, no deadline last);
  then everything else by applied_on, newest first (no date last), ties
  by company.
- **Row**: company (bold) and role; status as a word with the same three
  colour levels as stages (saved / rejected / withdrawn muted, applied /
  OA ink, interviewing / offer cobalt; never red); "Applied Nov 3" or,
  for saved, "Deadline Dec 1" (overdue deadlines in `danger` with words:
  "Deadline passed"); the linked person's name if any; a link button
  (opens the posting in a new tab, `rel="noopener noreferrer"`, only
  `http(s)` links ever reach the page: the database refuses others).
- **Quick status change**: each row has a native `<select>` showing the
  status (the phone's own picker). Changing it saves at once, guarded by
  the status the row showed (`.eq("status", shown)`): if it changed
  elsewhere, nothing is written and the list reloads with "It was
  changed somewhere else". Leaving `saved` for any other status sets
  applied_on to today if it was empty (one rule, `lib/applications.ts`).
  The row says "Saved" / the error in a polite live region.
- Tapping the row opens the **application sheet** (same `Sheet` as
  people): company (required, ≤ 80), role (required, ≤ 120), status,
  applied on, deadline, link (`www.x.com` gets `https://` put in front;
  anything not http(s) is refused with words), location (≤ 80), person
  (a native select of your people, "Name · Company", or nobody), notes (≤
  2,000). Delete inside, with a plain confirmation. Saves are guarded by
  `updated_at`, like contacts. **Add** opens it empty (status Applied,
  applied on today).
- **On a contact's page**, a card "Applications" lists theirs (company,
  role, status) and each opens the same sheet there. The delete summary
  already counts them.

**Import** (a sheet from an "Import" button on `/applications`):
1. A big text box: "Paste rows from a spreadsheet or a CSV file". Tabs
   (a spreadsheet copy) or commas (CSV), detected from the first line;
   quotes, doubled quotes, commas and line breaks inside quotes, CRLF, a
   BOM and blank lines all handled (`lib/import.ts`, pure, RFC 4180 plus
   tabs).
2. **Columns**: if the first row looks like headers (company, role /
   position / title, status / stage, applied / date / applied on, link /
   url, location, deadline, notes / comments: case and spacing ignored),
   columns are matched by name; otherwise the order is company, role,
   applied on, status, link, location. The preview says which.
3. **Values**: status read generously (submitted → applied; OA,
   assessment, HackerRank, coding test → online assessment; interview,
   phone screen, onsite → interviewing; offer → offer; rejected, declined,
   no → rejected; withdrawn, withdrew → withdrawn; to apply, wishlist,
   saved → saved; empty → applied; anything else → applied, flagged).
   Dates: `2026-11-24`, `11/24/2026`, `24/11/2026`, `Nov 24, 2026`, `24
   Nov 2026`, two-digit years (20xx), and Excel serial numbers. For
   slashes, **one order for the whole column**: day-first if any row's
   first number is over 12, month-first if any second number is, else
   month-first (North American spreadsheets), and the preview says
   "Dates read as month/day". A column with both kinds is an error on the
   rows that don't fit. Dates outside 2000–2100 are errors.
4. **Preview** before anything is saved: "52 to import · 2 already in
   your list · 1 with a problem", every row with its read values, the
   problem in words on bad rows. Duplicates (same company + role, folded,
   already saved or earlier in the paste) and bad rows are skipped and
   listed. Up to 500 rows per import.
5. **Import N applications**: the server action checks every row again
   (it's a public endpoint) and inserts them in **one request** (one
   statement: all or nothing). Then the list, with "Imported 52
   applications".

**Demo seed:** 15 applications at the seed's fictional companies, spread
over every status, some linked to the people there (Kestrel → Riya,
Northwind → Marcus, Tidewater → Jasmine, Brightline → Omar's offer), a
couple saved with deadlines (one passed). The reseed function already
takes applications; the self-healing check counts them.

**Decided after the logic check** (these replace the bullets above
where they disagree; no migration is needed):
- **Tiles are "Sent", "In process" and "Offers"** (not "Applied" /
  "Interviewing", which are also chip names meaning one status). Each has
  its own filter value (`?status=sent|in_process|offers`); they count the
  current status of what matches the search _(logic-checker #11)_.
- **Import duplicates are checked again on the server** against the
  account's applications at that moment, so a retried or repeated import
  adds nothing twice ("52 were already in your list")
  _(logic-checker #1)_. A duplicate is the same company + role + applied
  date (folded; no date counts as the same), so applying to one role in
  two seasons isn't one. Each duplicate row in the preview has an
  "Import anyway" box _(logic-checker #3)_.
- **Status words**: folded, whole words, in a fixed order: "not / no
  + interview / offer / selected" and rejections first, "no response /
  pending / waiting" → applied, "declined the offer / turned down" →
  withdrawn, then offer, interviewing, assessment, applied, saved. A word
  it can't read becomes Applied **and is copied into the notes** ("Status
  in the sheet: maybe?"), so nothing is lost _(logic-checker #2)_.
- **Headers** match by the words a cell contains ("Company Name", "Date
  Applied", "Job Link"), checked link → deadline → date → status →
  location → notes → role → company; a row is headers when it names both
  a company and a role column. The preview has a **picker on every
  column** (including "Ignore"), and lists ignored columns
  _(logic-checker #4)_.
- **Quick status change** is guarded by the row's `updated_at` (read and
  updated in one guarded step on the server, which also applies the
  leaving-saved rule from the row as it is then), returns the new stamp,
  and runs one save per row at a time, keeping only the latest choice, a
  moment after the last change (so arrowing through a keyboard-focused
  select saves once) _(logic-checker #5)_.
- **Rows**: the opener is its own button (company + role); the status
  select and the link sit beside it, never inside it
  _(logic-checker #6)_. Sheets take their ids from `useId()`
  _(logic-checker #7, also fixed in Feature 2)_.
- **Room and error words**: the preview knows how many more fit (1,000
  minus what you have) and refuses an import that doesn't; the actions
  map `54000`, `23503`, `23514` to words; every inserted row is built
  from one fixed column list with explicit nulls, and the app's checks
  are stricter than the database's (links normalised through `URL`, no
  whitespace) _(logic-checker #8, #13, #14)_.
- **Tab-separated quotes**: a quote opens a quoted cell only if a
  closing quote is followed by a tab, a line end or the end; otherwise
  it's text (`"Rockstar" Intern`) _(logic-checker #9)_.
- **Day/month**: decided once for the whole paste by the slash dates'
  evidence (the majority); rows that contradict it are problems; when
  nothing decides, the preview offers a Month/day · Day/month switch
  _(logic-checker #10)_. "Nov 24" with no year is the latest such day not
  after today for an applied date, the next one from today for a
  deadline; "Monday, November 24, 2026" is read; an applied date after
  today is a problem.
- **Size**: at most 500 rows and about 900 KB per import (the server
  action body limit is 1 MB), refused with words _(logic-checker #12)_.
- **Sheet details**: changing a saved application's status in the sheet
  fills applied on with today (same rule); applied on follows today until
  touched; a contact's page has "Add application" with the person filled
  in; saved rows order upcoming deadlines first (soonest), then none, then
  passed ones; "Deadline today"; one shared live region for row saves
  _(logic-checker #15)_.
- **Demo seed**: 15 applications consistent with the people's stories
  (applied before the first related interaction, never after today, an
  explicit status on every row) _(logic-checker #16)_.

**Pure modules (tested):** `lib/applications.ts` (counts, order, filter,
search, the leaving-saved rule, status tones), `lib/application-input.ts`
(the sheet's checks, link tidying), `lib/import.ts` (parsing, columns,
statuses, dates, duplicates, the preview summary).

**Tests:** unit for all of the above, including CSV edge cases (quoted
commas, quoted line breaks, doubled quotes, CRLF, BOM, trailing empty
lines, a ragged row), each date format and the day/month decision,
Excel serials, status words, `javascript:` links refused, duplicates
within the paste and against existing rows; server actions with mocked
Supabase (invalid rows refused before any insert, the status guard, the
updated_at guard); Playwright: counts and filters on the demo, a quick
status change, add / edit / delete, the contact page's card, and a
paste-import of a small spreadsheet copy (then the demo is put back);
axe in light and dark.

### Feature 4: Interactions, follow-ups and Today

**Goal:** open the app, see who to follow up with, log it in two taps,
and set the next follow-up without thinking. Reference: the Today and
person-sheet mocks in `design/tempo/` (kept out of the repo: they show
someone else's tool).

**Today replaces Home at `/`**; the tab bar becomes Today · People ·
Applications (Map joins in Feature 5). Who's logged in, Reset demo and
Log out move to a quiet footer at the end of Today.

**The screen, top to bottom:**
1. The date ("Tuesday, November 24", from the server's `today`) and the
   title **Today**.
2. Three tiles from the applications (Sent / In process / Offers, the
   same definitions as Feature 3), each a link to that filter.
3. **Follow up**: everyone whose follow-up is **today or overdue**, most
   overdue first, then by name; the count on the right ("4 due"). Each a
   card: initials (decorative), name, company · role, how you met, a
   badge "Overdue · 9 days" (danger, words) or "Today", "Last contact 23
   days ago" (from `crm_contact_stats`; "No contact yet"), and a **Log**
   button. Parked people with a follow-up appear too: the follow-up is
   their explicit ask.
4. **Coming up**: follow-ups in the next 7 days (`lib/follow-up.ts`'s
   `soon` bucket: today + 1 … today + 7), soonest first, one compact row
   each with its day ("Tomorrow", "Thu, Nov 27").
5. Empty states: nothing due ("Nothing to follow up today" and, if any,
   "Next: Kofi Mensah, Dec 8"); no follow-ups set at all (a sentence on
   what follow-ups are, and a link to People); no people yet (to People).
- Tapping a card (not Log) opens the **person sheet**: name, role ·
  company, how met, notes, the latest 5 interactions, "Open their page",
  and **Log interaction**.

**Logging, in two taps** (`components/log-sheet.tsx`, from a card's
Log, the person sheet, or a person's page):
- The sheet shows six kind buttons (Message, Email, Call, Meeting,
  Applied, Other). **Tapping one logs it at once**, dated today, with no
  note: Log + kind = two taps. Before choosing, "Add a note or another
  day" opens a note (≤ 1,000) and a day (≤ today) that the kind button
  then uses.
- The server action `logInteraction(contactId, kind, note?, day?)`
  checks everything and calls `crm_log_interaction` (one transaction:
  inserts the interaction, and clears the follow-up if it was due on or
  before that day, remembering it for undo). **The day is the server's
  `userToday()` at the moment of the tap** unless a day was chosen; a
  chosen day after today is refused. So a screen drawn at 23:55 and
  tapped at 00:05 logs the new day (the call happened then).
- After logging, the sheet says "Logged a call with Riya Patel" and
  offers, in one step:
  - **Undo** (`crm_undo_interaction`: deletes it and puts the cleared
    follow-up back unless something newer replaced it).
  - **The next follow-up**: a date prefilled to the logged day + 7
    (editable, today or later), **Set follow-up** / **Not now**. If they
    still have a follow-up after the log (it was later than the log), the
    offer says "Move it from Dec 9 to Dec 1?" and Not now keeps Dec 9.
  - Setting it is guarded: `setFollowUp(contactId, day, expected)`
    updates only if the follow-up is still what the sheet saw (`expected`
    = the value after the log, often none): a change from another tab is
    refused with words, never overwritten.
- Logging refreshes the page: the card leaves "Follow up" (its follow-up
  was cleared) and, if a new one is set within 7 days, appears under
  "Coming up".

**On a person's page**: a **Log interaction** button under their name,
and each timeline entry can be deleted (the same undo function, with a
confirmation: "Delete this call from Nov 13?"), which puts back a
follow-up it had resolved, by the database's rule.

**Decided after the logic check** (these replace the bullets above
where they disagree; no migration is needed):
- **Undo undoes everything the sheet did** _(logic-checker #1)_: if
  "Set follow-up" was pressed after logging, Undo first puts the
  follow-up back to what it was right after the log (guarded: only if
  it's still the day the sheet set), then deletes the interaction through
  `crm_undo_interaction` (which brings back the follow-up the log had
  cleared). If the second step fails, you're left "logged, nothing set",
  and Undo can be pressed again.
- **The sheets belong to the Today screen, not to a card**
  _(logic-checker #2)_: logging clears the follow-up, so the card leaves
  "Follow up" at once; the sheet (and its result: Undo, the offer) must
  outlive it. The person sheet loads its own data when it opens (a server
  action: notes, the current follow-up, the latest 5 interactions), so it
  works for anyone, including someone who just left Today's lists.
  Coming-up rows open it too.
- **`setFollowUp` guard**: `is null` when nothing was set, `eq` otherwise,
  `.select("id")` to tell a refusal from success, changed vs gone in words
  _(logic-checker #3)_.
- **The offer works only from the server's answer**: `logInteraction`
  returns the day it used, the server's today, and a fresh read of the
  follow-up after the log; the offer is built from those
  _(logic-checker #4)_. A day is sent only if you **changed** it in "Add
  a note or another day"; otherwise the server's today at the tap
  _(logic-checker #5)_.
- **A back-dated log** suggests its day + 7, or today + 7 if that would
  be in the past (tested) _(logic-checker #6)_.
- **Clear or move a follow-up from the person sheet** without logging
  anything (the same guarded `setFollowUp`, null allowed), so a parked
  person's old follow-up isn't stuck as overdue forever; parked cards show
  their stage word _(logic-checker #7)_.
- **One log per tap**: all six kind buttons are disabled from the first
  tap until the answer _(logic-checker #8)_.
- **Applications follows its address**: a tile link from Today
  (`/applications?status=offers`) changes the filter of an Applications
  page kept alive in the background _(logic-checker #9)_.
- **Deleting a timeline entry** says when it would bring back a follow-up
  it had resolved ("This puts back the Nov 12 follow-up")
  _(logic-checker #11)_.
- **One set of words**: the due badge uses `followUpLabel` ("9 days
  overdue", "Today"), as People does; "Last contact" treats a day after
  today as today _(logic-checker #12)_. Errors for P0002, 54000, 23514
  in words _(logic-checker #13)_. The sheets reset when they open
  _(logic-checker #14)_. The "Next: …" hint shows only when Follow up and
  Coming up are both empty.

**Pure modules (tested):** `lib/today.ts` (who's in Follow up and Coming
up, their order, "Overdue · 9 days", "Last contact 23 days ago", the
"Next:" hint, initials from any name: "José Álvarez" → "JÁ", "Leo" → "L",
an emoji-led name → its first two letters), `lib/log-offer.ts` (the
follow-up offer after a log: suggested day, whether it moves an existing
one, the words), `lib/interaction-input.ts` (kind, note, day checks).

**Tests:** unit for all of the above, including bucket edges (today − 1,
today, today + 7, today + 8), a log dated before a follow-up not clearing
it, the offer when a later follow-up remains, and initials; server
actions with mocked Supabase (unknown kind, a day after today, a missing
contact, the `setFollowUp` guard, undo); PGlite already covers the two
functions. Playwright: log a call for Riya in two taps → she leaves
Follow up → set the follow-up (+7) → she's under Coming up → Undo brings
her back as due today; the person sheet; logging from a person's page
and deleting a timeline entry; a stale follow-up set refused; axe in
light and dark.

### Feature 5: The network map

**Goal:** the signature screen. Every person is a dot, lines show who
introduced you to whom, you're in the middle, and you can watch it grow.

**Tab** "Map" (the fourth tab). **`/map`**:
- **One request** for everyone (`id, name, company, stage, introduced_by,
  met_on, created_at`; at most 1,000) plus `crm_contact_stats()` for
  interaction counts.
- **The graph** (`lib/map-graph.ts`, pure, tested): a "You" node; an
  edge from each introducer to the people they introduced; an edge from
  You to everyone with no introducer (or an introducer that isn't in the
  list). Loop-safe (a loop the database should never allow can't hang or
  drop anyone: every walk keeps a visited set).
- **Layout** with d3-force, computed **in the browser only** (never during
  server render: no hydration mismatch): links (short), many-body
  repulsion, collision by radius, You pinned at the centre. **Same layout
  every visit** for the same data: starting positions come from the tree
  (each person placed around their introducer by a fixed order), and the
  simulation's random source is seeded. The layout is computed by running
  the simulation to rest off-screen (300 ticks); with motion allowed, the
  dots then ease from their starting spots to the settled ones in 600 ms;
  **with Reduce Motion, the settled layout appears at once**.
- **Dots**: size from interaction count on a square-root scale, 8 to 22
  px radius, capped at 30 interactions so one heavy contact can't dwarf
  the rest. **Stage by shape and colour** (the same shapes as the lists:
  new ○, reached out ◔, talking ●, interviewing ◆, offer ★, parked –;
  colour levels muted / ink / cobalt). "You" is a larger cobalt dot
  labelled "You". Edges in `edge` (3:1 against the page).
- **Labels**: first names under each dot (12 px, the one place 12 px is
  used), with a halo in the page colour so lines don't cross the text;
  shown for everyone up to 40 people, beyond that only when zoomed in
  (scale ≥ 1.6) or for the dot you tapped.
- **Tap a dot** → the same person sheet as Today (follow-up, notes, latest
  5, Their page, Log interaction).
- **Pan and zoom**: one finger drags, two fingers pinch, a mouse wheel
  zooms at the pointer; buttons Zoom in, Zoom out and Fit (44 px). Zoom is
  limited to 0.4×–4×; the maths is pure (`lib/map-view.ts`, tested).
  A drag never counts as a tap on a dot.
- **Watch it grow**: a slider "Your network on: [date]" from the first
  meeting to today (people appear by `met_on`, or the day they were added
  if it's missing; a line appears once both ends are there), and a
  **Play** button that sweeps it over 4 seconds. With Reduce Motion, Play
  is replaced by the slider alone (it moves in steps you choose). The
  slider is a native range input with the date as its value text.
- **The same network as a list**, under the map, for screen readers and
  anyone who prefers it: "You met directly" and, nested under each
  person, who they introduced (links to their pages), with each person's
  stage word. The map's SVG is `role="img"` with a summary ("Network map:
  20 people in 3 introduction chains. The same network is listed below.");
  its dots aren't tab stops (300 of them would be a trap), the list is the
  keyboard way in.
- **Empty**: nobody yet → "Your map starts with you" and a link to People;
  only people met directly → the map still draws (a star around You).
- **Performance**: 300 people must lay out in under a second on a
  mid-range phone; above 400, the simulation runs in chunks between frames
  so the page never freezes.

**Decided after the logic check** (these replace the bullets above
where they disagree; no migration is needed):
- **Layout: a radial tree, settled by d3-force** _(logic-checker "simpler
  approach", #1, #3, #12)_. Starting positions are rings by depth from
  You, each person's sector sized by how many people hang below them,
  children ordered by the day you met them, then name. Then a short,
  fixed d3-force run (stopped at creation, driven only by `tick(120)`,
  fresh node objects every time): links, weak repulsion, collision at a
  **constant** radius, and a radial pull to each ring. Input is sorted by
  id, so the same data always gives the same picture **on one device**;
  interaction counts never move anyone; adding someone mostly moves their
  own branch. Lines run outward, so who introduced whom reads from the
  picture.
- **Computed once per shape of the network** _(#2)_: the positions are
  cached by a key of the sorted ids and introducers (a module cache, so
  `<Activity>` and refreshes don't recompute), the 600 ms ease plays only
  the first time a layout is seen, pan and zoom survive coming back.
- **Everyone is on the map and in the list, exactly once** _(#5)_: after
  walking out from You, anyone not reached (only possible through a loop
  the database refuses) is hung off You, the loop cut at its lowest id
  (tested).
- **Phone**: the map is a fixed frame (about 60% of the screen), the page
  still scrolls around it; `touch-action: none` only inside it; the wheel
  listener is attached natively and non-passive _(#4)_. The smallest zoom
  is whatever fits everyone (at most 0.4×) _(#6)_.
- **Dots and labels keep their size on screen** while positions zoom;
  a tap picks the nearest dot within 22 px of the finger _(#7)_.
- **Dots** are equal round plates in the surface colour, edged, sized by
  interaction count, with the stage glyph inside in its colour, so the
  size reads as "how much you've talked" and a parked bar never vanishes
  _(#15)_.
- **Labels**: placed greedily in priority (the tapped dot, then by
  interactions, then name), skipping any that would overlap one already
  placed; at most 14 characters; a title ("Dr.") falls back to the next
  word _(#14)_.
- **Growth**: each person's day is their met-on day, or the day they were
  added **in your timezone**; nobody appears before their introducer
  (they appear on the later of the two days); days are clamped into first
  meeting … today; the slider's far right means everyone; the slider hides
  when everyone shares one day _(#8, #9)_.
- **The list is equivalent** _(#10)_: each person with company, stage
  word and interaction count; the list and the map's summary follow the
  slider ("On Nov 3: 5 people, 1 introduction chain"); deep chains stop
  indenting after 4 levels (the nesting stays in the markup).
- **Motion and speed** _(#11, #17)_: the ease is one CSS transition per
  dot (no per-frame React work); Play steps the slider 40 times over 4 s;
  the frame has a fixed height and shows "Laying out…" while computing;
  the motion preference is read after hydration; the list is
  server-rendered.
- Closing a dot's sheet returns focus to the map's heading _(#16)_.

**Pure modules (tested):** `lib/map-graph.ts` (nodes, edges, radius,
label rule, growth by date, the grouped list, deterministic starting
positions), `lib/map-view.ts` (pan, zoom about a point, clamping, fit to
bounds, tap vs drag), and a seeded random source.

**Tests:** unit for all of the above (including a loop, a missing
introducer, 0 / 1 / 200 interactions, the growth date edges, zoom
clamping and fit); a layout determinism test (same data → same positions);
Playwright: the map draws 21 dots (20 + You) and the list shows the three
chains; tapping a dot opens the person sheet; the slider at an early date
shows fewer dots; with Reduce Motion the layout is final at once; axe in
light and dark.

### Feature 6: Install and polish

**Goal:** it installs like an app on an iPhone and an Android phone, every
screen has all its states, motion is one consistent system, and an
accessibility sweep covers every screen and sheet.

**Install** (Hold's pattern, adapted):
- `lib/app-identity.ts` gains the icon: the **network mark** already used
  for the tab icon (`app/icon.svg`: three ringed contacts joined to a solid
  centre, white on cobalt) as data in a 0 0 100 100 box (`NETWORK_MARK`),
  `markGeometry(shape)` for the three shapes (rounded for browsers and
  Android "any", full-bleed for iPhone, maskable with the mark scaled to
  stay inside Android's 40% safe circle), `APP_ICONS` (192, 512,
  maskable 512, apple-touch 180), `ICON_VERSION = 1` pinned next to the
  geometry by a test, `iconUrl`, and `appManifest()`: `id: "/"`, name and
  short name, `start_url: "/"` (Today, or Log in), `scope: "/"`,
  `display: "standalone"`, background and theme colours from the palette,
  **no orientation lock** (WCAG 1.3.4).
- `components/app-icon.tsx` draws it for `next/og` (inline styles, no
  fonts); `app/icons/[file]/route.tsx` serves the four PNGs (drawn at
  build time, any other name a 404); `app/manifest.ts`; the layout links
  `icon-192.png` and `apple-touch-icon.png` (versioned) and the old
  `app/icon.svg` goes, so there's one icon everywhere.
- `proxy.ts` lets `/icons/` and `/manifest.webmanifest` through without a
  login (phones fetch them without the cookie).
- **No service worker, no offline mode**: everything lives in Supabase and
  a stale offline copy of your follow-ups would mislead; Chrome and Safari
  install without one. Losing the connection already shows each screen's
  error state.

**Every state** (a table per screen in the review: loading, empty, first
use, error, long content):
- An unknown address gets `app/not-found.tsx` ("Nothing here" and a way to
  Today), not Next's default page.
- An error inside the app keeps the tab bar: `app/(app)/error.tsx`, the
  same calm message and Try again.
- Loading: each page already streams behind a skeleton; the review checks
  each one has the loaded page's shape (no jump when content arrives).
- First use: the four empty states (Today, People, Applications, Map)
  are captured together on an empty account and read as one voice.
- Long content: a stress seed (a 60-character name, a long company and
  role, 200 interactions, a long note, 6 levels of introductions) is
  captured on every screen and sheet: everything truncates or wraps, no
  overflow sideways at 390 or 320 px.

**Motion pass:** one system, the tokens already in `globals.css`
(`--motion-fast` 150 ms for colour, `--motion-base` 200 ms for small
changes, `--motion-sheet` 250 ms, `--ease-out`):
- **Sheets** get an entrance and an exit: the bottom sheet slides up, the
  full sheet fades and rises 8 px, the scrim fades; CSS only
  (`@starting-style`, `transition-behavior: allow-discrete` on `display`
  and `overlay`), so nothing waits on JavaScript and closing is never
  delayed for a screen reader.
- The toast fades and rises in.
- **Reduce Motion**: nothing moves; changes are instant or a plain fade.
  A test lists every `transition-*`/`animate-*` class in the components and
  checks motion other than colour and opacity sits behind `motion-safe:`
  or a reduce-motion rule.

**Accessibility pass** (`e2e/a11y.e2e.ts`):
- axe on every route **and every sheet** (add and edit person, the log
  sheet, the person sheet, an application, import, delete confirmations),
  light and dark.
- Reflow: every screen at 320 px wide with no sideways scroll.
- Targets: every button, link, select and input on each screen is at
  least 44 × 44 px (inline links in running text excepted), measured.
- Keyboard: a **Skip to content** link first; Tab from the top reaches the
  tab bar and each screen's main controls in order, with focus visible;
  every sheet traps focus and returns it.
- One `h1` per page and a unique `<title>` per route (tested).

**Docs:** README: what it is, screenshots, installing on iPhone and
Android, running it, the reviewers. CLAUDE.md: e2e on port 3201 and
screenshots from a production build on 3300 (3200 is Hold's).

**Name:** _(superseded by "Renamed to Orbit")_ the working name "Network" stays until the user picks one;
renaming is `APP_NAME` plus an `ICON_VERSION` bump only if the mark
changes.

**Decided after the logic check** (these replace the bullets above
where they disagree; no migration is needed):
- **Sheets close instantly; only the entrance moves** _(logic-checker #1)_.
  An exit transition on `<dialog>` loses the modal position the moment
  `close()` runs, Safari and Firefox drop the scrim at once (no `overlay`
  transition), and a closing sheet still takes taps (a double log). The
  existing entrance stays (the sheet rises 24 px and fades in, behind
  `motion-safe:`); the scrim fades in with it. Closing is instant in every
  browser, with or without Reduce Motion.
- **Skip to content** targets the one `(app)` wrapper (`id="content"`,
  `tabIndex={-1}`), not a page's `<main>` (hidden `<Activity>` pages keep
  theirs in the DOM). The sheet's focus fallback picks the **visible**
  page's h1 (`checkVisibility()`), and every page's h1 takes
  `tabIndex={-1}` so it can be focused _(#2)_.
- **Targets: the effective target is measured**: the element or its
  `<label>`, whichever is bigger; anything that isn't visible
  (`checkVisibility()`: a hidden page, a closed dialog) is skipped; the
  skip link is measured while focused; inline links inside running text
  (a sentence with a link in it) are the one exception _(#3)_.
- **The motion rule, exactly** _(#4)_: motion means a transition or
  animation of `transform`, `translate`, `scale`, `rotate`, top/left or
  size, or bare `transition` / `transition-all` (which include them). Every
  such class in `app/` and `components/`, and every such rule in
  `globals.css`, sits behind `motion-safe:` or `prefers-reduced-motion`,
  except a named allowlist for motion guarded in JavaScript (the map's
  first ease, gated by `useReducedMotion`). Colour and opacity transitions
  are fine. The regexes are regex literals; the palette test's
  "no mixed colours" regex, which could never fail (`\b` in a template
  string), is fixed the same way.
- **Ports stay as they are** _(#5)_: 3200 is Orbit's port (package.json,
  the e2e default, the login link fallback, Supabase's redirect list).
  CLAUDE.md says how to point e2e and screenshots elsewhere with
  `BASE_URL` when 3200 is taken.
- **Offline, honestly** _(#6)_: no service worker; data already on screen
  stays; a save says it couldn't save; going to a screen that isn't loaded
  yet shows the browser's offline page. Documented in the README, not
  tested.
- **The in-app error boundary is checked by review, not e2e** _(#7)_: the
  data is fetched on the server, so Playwright can't make it fail, and no
  test-only throw goes into production code.
- The maskable safe zone is measured to the rings' outer edge (centre +
  radius + half the stroke), scale 0.8 _(#8)_.
- **The stress seed uses the database's limits** _(#9)_: an 80-character
  name, an 80-character role, a 120-character application role, a
  1,000-character interaction note, a 4,000-character contact note, a
  2,000-character link, and one unbroken token (an email address with no
  spaces) in a name and a note; the samples are restored in `finally`.
- **Test details** _(#10)_: count only visible h1s; check `document.title`;
  in a sheet, Tab never lands on the page behind it (not "wraps"); the
  expected order is skip link, then the screen, then the tab bar (DOM
  order); the delete confirmation's heading id comes from `useId`.
- The manifest's background colour is the light paper (it can't follow
  dark mode); accepted.

**Tests:** unit for the icon geometry (every point of the maskable mark
inside the safe circle; the version pinned to the geometry), the manifest,
and the motion rule; e2e for install (manifest and icons served without a
login, the right link tags), the accessibility sweep, not-found and the
in-app error boundary.

### Renamed to Orbit (2026-11-25)

The user named the app **Orbit**. The repo stays `network-crm`, the
Vercel project is `orbit-crm` (live at https://orbit-dk.vercel.app), and
the Map tab stays "Map".

- **Production checks** (`e2e/smoke.e2e.ts`, written now: the config
  named it but it didn't exist): with `BASE_URL=https://orbit-dk.vercel.app`
  only it and `install.e2e.ts` run; local runs leave it out. One demo
  sign-in, like a visitor's (it reseeds a stale demo, as theirs do):
  logged out goes to login; the login link's landing address redirects to this
  site's login; the login cookie is httpOnly and Secure; every tab loads
  and the map draws; a log is saved (the server's answer, not the screen)
  and Undo takes it back (the sheet closes, and they're due again after a
  reload); if that fails, Reset demo, so no stray log is left for
  visitors.

- `APP_NAME = "Orbit"`: the manifest's name and short name, every page
  title ("Today · Orbit"), the iPhone home-screen title and the login
  heading all come from it. README, CLAUDE.md, the plan's header and the
  three reviewer agents say Orbit; comments that named the app too.
- **Not renamed:** the login cookie stays `network-auth` (renaming it
  would log everyone out, and nobody sees it); the applied migration's
  header comment (applied migrations are never edited); the map's
  accessible name ("Network map", it's a map of your network); the
  repo and package name. Earlier review logs keep the name they were
  written under.
- **The icon** didn't fit the name (a hub with spokes to three rings), so
  it's replaced by the **orbit mark**: a solid centre dot (you) and a
  tilted, flattened orbit round it, as a planet's orbit looks seen at an
  angle. The far half passes behind the dot and the near half in front of
  it, across its middle (the dot shows above and below), each with a
  2.5 gap where they meet; a small dot (a person) rides the near half like
  a bead, with orbit running on past it. White on the app's cobalt, no
  letters (core 16; orbit rx 37, ry 8, turned 22 degrees so its right end
  rises; stroke 6; small dot 6.5 at 135 degrees round the orbit; in a 100
  box, centred by its bounding box). One drawing
  (`components/orbit-mark.tsx`, geometry in `ORBIT_MARK`) serves the icon
  PNGs and the login screen (cropped to its bounds there, 28 px tall).
  The gaps are SVG masks, so it works on any background; the orbit's mask
  sits on a group, since a mask on the rotated ellipse turns with it.
- **How it got here** (ICON_VERSION 2 → 3): a circle with a small dot on
  it is the Ionic framework's logo, whatever the details (design-critic,
  twice); the user asked for a tilted oval instead; a dot inside a tilted
  oval read as an eye (design-critic); the orbit crossing the dot, behind
  and in front, is the cue an eye never has.
- The maskable icon draws the mark at 0.85 (inside 90% of the 40 safe
  circle).
- **Tests:** the drawing (constants and computed geometry) pinned to the
  version; the orbit tilted and flattened, crossing the dot behind and in
  front, the dot showing below the near half, the small dot on the near
  half (in the orbit's own frame), clear of the centre dot and short of
  the orbit's end; centred by its bounding box; the maskable reach; the
  paths' ends; pixels of the real PNGs computed from the same geometry
  (centre dot, the orbit in front of it at three points, the cuts above
  and below it, the far half stopping short, the raised end, the small
  dot, the maskable scale); the login heading and title say Orbit. Screenshots of the login
  and an icon sheet (home screen, launcher masks, tab sizes) in
  `docs/screenshots/orbit/`.

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

### Feature 2: Contacts (2026-11-24)

#### logic-checker (plan review)
Verdict: **Ready after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | Next keeps hidden routes alive (`<Activity>`), so an edit route would come back with old values and a save would write them over newer data (e.g. bring back a follow-up a log had resolved). | Fixed | Edit is a sheet over the contact page, filled from current data each time it opens; the update only matches the `updated_at` it was opened with, else "changed somewhere else" (e2e test changes the row behind an open sheet). |
| 2 | High | A preserved `/people/new` would hold the last person's values: one tap from a duplicate. | Fixed | Add is a sheet on the list, fresh each time it opens (e2e checks it's empty after adding). |
| 3 | Medium | `usePathname` in the layout's tab bar suspends below `/people/[id]` with Cache Components and breaks the build. | Fixed | The marked bar sits in its own Suspense; the fallback is the same bar unmarked. |
| 4 | Medium | Keeping `?q=` in the address with the router would re-render on the server at every keystroke. | Fixed | `history.replaceState`; filtering stays in the browser. |
| 5 | Medium | Whose "today" the labels use, and a screen left open overnight; a first visit's UTC "met on" default. | Fixed | One server `today` per render passed down; `DayWatcher` refreshes on foreground and date change; "met on" follows `today` until touched. |
| 6 | Medium | Browsers may send a textarea's line breaks as CRLF, pushing a note over 4,000. | Fixed | Line ends normalised before counting (tested at the boundary). |
| 7 | Medium | Any demo visitor can now delete people with one tap; the next visitor (within the hour) sees a broken network. | Fixed | Demo sign-in also reseeds when the data changed since the seed (counts differ, or anything newer than the database's own seed time, kept in the markers). |
| 8 | Medium | `redirect()` in an action pushes history: Back would reach the edit form, or a deleted person. | Fixed | No edit route; add uses `router.push` from the list; delete redirects with `replace`. |
| 9 | Low | `notFound()` inside a stream keeps status 200, and there was no not-found page. | Fixed | `people/[id]/not-found.tsx` inside the tab bar; tests check the words. |
| 10 | Low | Locale-dependent sorting/formatting could differ between server and browser. | Fixed | Collator and formats pinned to English; sorting only in the browser. |
| 11 | Low | NFD folding misses ł ø ß æ œ… | Fixed | A small table; tested ("lodz" finds "Łódź"). |
| 12 | Low | Two people with the same name are indistinguishable in the introducer picker. | Fixed | Options read "Name · Company". |
| 13 | Low | Error mapping gaps (23514; update naming ungranted columns; a CR001 message naming someone the database doesn't name). | Fixed | 23514 mapped; payload built from the nine granted columns (tested); loop message names no one. U+0085 treated as whitespace. |
| 14 | Low | Plan inconsistencies: "last talked" fetched but unused; chain vs direct introducer; timeline tie order. | Fixed | Rows show "Talked …" when no follow-up; the page shows the whole chain (`chainAbove`, loop-safe); timeline by day then time logged. |
| 15 | Low | "Met on" earlier than the introducer's. | Accepted | Allowed; the map links people once both exist. |

Open questions answered: the whole chain is shown; rows show the
follow-up, else when you last talked; parked people keep their
follow-ups; the demo heals itself when changed; "Deleted …" travels in
the address and is removed once shown.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. Auth on every action, the nine-column payloads, error mapping, RLS and the loop-safe walks all checked fine.

| # | Severity | Finding (file) | Outcome | What changed |
|---|----------|----------------|---------|--------------|
| 1 | High | The stale-save guard sent the page's *current* `updated_at`: a refresh while the sheet was open (coming back to the app, or the refusal itself) swapped in the newest stamp, so a second Save wrote old values over new ones. (contact-dialog.tsx) | Fixed | The stamp is captured when the sheet opens and kept in state. The e2e test now presses Save twice after the row changed elsewhere, and both are refused; a PGlite test proves the stamp, read back as the API sends it, matches once and never after another change. |
| 2 | Medium | Fixed ids (`contact-form`, `contact-<field>`, `sheet-title`) repeat across pages `<Activity>` keeps in the DOM: Save could submit a hidden page's form. (contact-dialog.tsx, sheet.tsx) | Fixed | All ids from `useId()`; the first error is focused through the form's own ref. |
| 3 | Medium | A successful delete didn't `refresh()`: pages kept in history still showed the deleted person (and the introductions the database had just cleared). (contact-actions.ts) | Fixed | `refresh()` before the replace-redirect (tested, with the redirect type). |
| 4 | Low | "Deleted …" stayed on the preserved list forever, and its status node mounted already full. | Fixed | Always-mounted status, filled after; cleared in a `useLayoutEffect` cleanup when the list is hidden. |
| 5 | Low | Sorting runs in client components that also render on the server; Node's and a browser's ICU could order a rare name differently (hydration warning). | Accepted | Collator pinned to `en`, base sensitivity; the plan's "sorting only in the browser" was wrong and is corrected here: the risk is a re-render on a rare name, not wrong data. |
| 6 | Low | A failed delete said "Couldn't save." | Fixed | Delete has its own words, also for an unexpected failure (tested). |
| 7 | Low | `?deleted=<anything>` makes the list announce any text. | Fixed | Shown only if nobody by that name is still listed. (Rendered as text, so never markup.) |
| 8 | Low | Focus was lost after Keep. | Fixed | Focus returns to "Delete …"; opening the confirmation focuses its question, never Delete. |
| — | Tests | Second stale save, logged-out update/delete, an unreadable stamp, delete's redirect type, 81/281-character fields, odd types, every folded letter, microsecond markers, an added application. | Fixed | All added (379 unit + database tests). |

#### design-critic (people list, person, sheets, not found, empty; light and dark)
Verdict: **Ship after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | The current tab was shown by colour alone (cobalt vs muted ~1.2:1 to each other). | Fixed | `accent-tint` pill behind the icon and a semibold label. |
| 2 | Medium | Dark Delete was a salmon block with dark text, unlike the cobalt Save. | Fixed | `danger-fill` token (`#C2372D` in dark, white text 5.4:1), contrast-tested. |
| 3 | Medium | During the delete confirmation two button pairs competed, and Delete had autofocus. | Fixed | The sheet footer hides while confirming; focus goes to the question. |
| 4 | Medium | Rows showed role before company, so truncation cut the company. | Fixed | "Company · Role" on rows and the person page. |
| 5 | Medium | Follow-up dates in rows weren't labelled; "Today" looked like any date. | Fixed | A bell before follow-ups; overdue red bold, today ink bold, others muted. |
| 6 | Medium | The chain was small wrapping inline links and stopped before the person. | Fixed | A vertical list of 44 px links joined by a line, ending with the person in ink. |
| 7 | Low | A scrolled chip sat flush with the screen edge. | Fixed | `scroll-px-5` on the chip row. |
| 8 | Low | The empty state had two identical primary buttons. | Fixed | The header Add hides while the list is empty. |
| 9 | Low | Native select padding and arrow didn't line up with text boxes. | Fixed | `appearance-none` and our own chevron at the same inset. |
| 10 | Low | Textarea resize grip; empty date looked filled. | Fixed | `resize-none`; an empty date box is muted. |
| 11 | Low | Not-found page centred, full-width button, no back link. | Fixed | Laid out like a person's page, with "‹ People". |
| 12 | Low | The stage pill looked like a tappable filter chip. | Fixed | Badges have 6 px corners (stage, "Demo"); round pills are only filters. Written into Design direction. |
| 13 | Low | Straight apostrophes; hint placement differs between fields. | Fixed | Curly quotes; field hints under the field, muted (rule in Design direction). |

Unreviewed (carried): skeletons (still `surface-sunk`), the person page with no follow-up / no notes, "Showing the latest 100", the sheet's server error, pressed states, the wide-screen sheet, iOS native pickers.

### Feature 3: Internship applications (2026-11-24)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. No database change needed: every column the feature writes is already granted, a bulk insert is one statement, the limit trigger sees the earlier rows of the same insert.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | A retried import (lost response, two tabs, a preserved page) inserts the whole batch again: duplicates were only checked in the preview. | Fixed | The server action re-reads what's saved and drops duplicates (unless "Import anyway"); a repeat imports nothing (unit + e2e). |
| 2 | High | Status matching undefined; substring matching turns "No offer" into an offer. | Fixed | Folded whole words in a fixed order, negatives first; 22 tricky phrases tested; an unreadable status is kept in the notes. |
| 3 | Medium | company + role is too coarse within one paste (same role, two seasons). | Fixed | Duplicate = company + role + applied date (unknown matches any); "Import anyway" per row. |
| 4 | Medium | Exact header names only ("Company Name", "Date Applied" missed); no way to fix a wrong mapping. | Fixed | Headers matched by contained words in a fixed order; a picker on every column; headers need both company and role. |
| 5 | Medium | Quick status change: what "shown" means, applied_on overwrites (PostgREST can't coalesce), arrow keys saving every step. | Fixed | Guarded by the row's `updated_at`, the rule applied from the row read in the same guarded step, per-row sequencing with the latest stamp, saved 600 ms after the last change. |
| 6 | Medium | A tappable row can't contain the select and the link (nested interactive). | Fixed | The opener is its own button; select and link are siblings. |
| 7 | Medium | Two sheets on one page shared `id="sheet-title"`. | Fixed | `useId()` in `Sheet` (also fixes Feature 2 latent issue). |
| 8 | Medium | No room check (a 500-row import into 600 applications fails whole); 54000/23503/23514 unmapped. | Fixed | Preview and action check the room; errors mapped; "Nothing was saved." |
| 9 | Medium | A leading quote in a tab-separated cell (`"Rockstar" Intern`) would swallow the rest of the paste. | Fixed | In tab mode a quote opens a cell only if it closes before a tab/line end (tested). |
| 10 | Medium | Day/month per column, conflicts undefined, no way to flip. | Fixed | One order per paste by majority evidence; the minority are problems; a Month/day · Day/month switch when nothing decides. |
| 11 | Medium | Tiles named like chips meant different things. | Fixed | Tiles are Sent / In process / Offers with their own filter values; they follow the search and count current status. |
| 12 | Low | 500 long rows can exceed the 1 MB server-action body. | Fixed | ~900 KB cap with words. |
| 13 | Low | Bulk insert fills missing keys with null. | Fixed | Rows built from one fixed column list with explicit nulls (tested). |
| 14 | Low | Undecided formats (no year, weekday prefix, "Sept"), link edge cases. | Fixed | Read and tested; no-year leans past for applied, future for deadlines; links normalised through `URL`. |
| 15 | Low | Sheet details: saved→applied in the sheet, applied-on following today, add from a person's page, passed deadlines sorting on top forever, "Deadline today", one live region. | Fixed | All as listed in "Decided after the logic check". |
| 16 | Low | Demo applications must match the people's stories. | Fixed | 15 seeded, every status, tested against the people. |

Open questions answered: duplicate = company + role + date with an override; tiles count current status and follow the search; separate tile filters; applied dates can't be in the future; deadlines show only for saved rows; "declined" alone is a rejection, "declined the offer" a withdrawal; add from a person's page: yes; 501 rows: refused.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. Auth, the nine-column payloads, the guarded status change, the single-statement import with a server-side duplicate check, and links (http/https only, `noopener`) all checked fine; none of Feature 2's mistakes repeated.

| # | Severity | Finding (file) | Outcome | What changed |
|---|----------|----------------|---------|--------------|
| 1 | High | A quick status change whose call itself fails (offline, a dropped connection) left the row "running" forever, showing a status that was never saved. (applications-screen.tsx) | Fixed | The queue moved to `lib/quick-status.ts` with try/finally: a failed call rolls the row back and says so, and the row keeps working; an old timer can't start a newer save. Six fake-timer tests, including the offline case. |
| 2 | Medium | Status words: "Not applied" → Applied, "Not accepted" → Offer, "Did not get an interview" → Interviewing, "Failed OA" → OA. | Fixed | An early "not applied" rule, a wider negation (up to two words between), failed/rescinded as rejections; ten more phrases tested. |
| 3 | Medium | A quick change re-filtered/re-sorted at once, unmounting the focused select (keyboard focus to the page). | Fixed | The list keeps its order after a quick change until the filter, search or visit changes (design-critic #2 too). |
| 4 | Medium | The per-row save logic was untestable inside a component. | Fixed | See #1. |
| 5 | Low | An "Import anyway" row could be inserted twice on a retry. | Fixed | An exact copy of a saved row (every imported field) is always skipped (tested). |
| 6 | Low | The row's refusal said "Close it…", but no sheet is open. | Fixed | Its own words: "…The list now shows the latest." |
| 7 | Low | The edit sheet opened with the server row, not the row as shown after a quick change. | Fixed | Opens with the row as shown (its saved status and stamp). |
| 8 | Low | A data row with a company named "Business Development Bank…" was taken for headers. | Fixed | Only short (≤ 3 words), digit-free cells look like headers (tested). |
| 9 | Low | The Month/day switch showed no keyboard focus. | Fixed | Ring on the label when its radio has focus-visible. |
| 10 | Low | Focus went to the page when what opened a sheet was gone (deleted row, filled empty state). | Fixed | Falls back to the page's heading. |
| 11 | Low | Row numbers drifted after blank rows; in-paste duplicates said "Already in your list". | Fixed | Rows keep the physical line they start on; "Also on row 4." (tested). |
| 12 | Low | The 900 KB cap counted characters, not the JSON bytes sent; a failed call replaced the whole screen. | Fixed | Bytes measured with `TextEncoder`; every sheet catches a failed call and keeps what you typed (people sheets too). |
| — | Found while testing | Changing a status before the page hydrated moved the native select but never saved. | Fixed | Row selects are disabled until hydrated. |
| — | Found while testing | A literal BOM and other invisible characters had crept into source and tests. | Fixed | Written as escapes; a scan found no others. |

#### design-critic (applications, sheets, import, person card, empty; light and dark)
Verdict: **Ship after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | The row select, column pickers and paste box were 14 px: iPhones zoom in on them. | Fixed | All 16 px. |
| 2 | High | A one-tap change could move or remove the row under your finger. | Fixed | Order frozen after a quick change; a row that left the filter says "Moved out of this filter". |
| 3 | Medium | The select took half the row and truncated company and person. | Fixed | Controls moved to their own line under a full-width opener; the select sizes to its word. |
| 4 | Medium | The select looked like a read-only badge. | Fixed | Drawn as a field (`edge` border, 12 px corners); the badge stays for the read-only card. |
| 5 | Medium | The right column had no fixed position. | Fixed | Same control line in every row; Posting right-aligned with an external-link icon. |
| 6 | Medium | Save feedback appeared off-screen and pushed the list. | Fixed | A toast above the tab bar (4 s), plus an always-mounted screen-reader status. |
| 7 | Medium | Import looked ready with nothing to import. | Fixed | Secondary until ready; tapping it says why. |
| 8 | Medium | Skipped preview rows looked like imported ones. | Fixed | Muted with a "Skipped" badge; "Row 2" in the meta line, no number gutter. |
| 9 | Medium | Month/day switch: no focus ring; forced state at 60% opacity. | Fixed | Focus ring; forced is one plain sentence. |
| 10 | Low | Native chevrons on the column pickers. | Fixed | The app's chevron. |
| 11 | Low | Pasted rows wrapped. | Fixed | `wrap="off"`, a shorter placeholder. |
| 12 | Low | "Deadline passed" turned the person's name red; "Deadline today" red. | Fixed | Only the date words take the tone; today is ink bold, passed danger. |
| 13 | Low | The unchecked checkbox looked disabled in dark. | Fixed | A drawn checkbox (`edge` border, cobalt when checked). |
| 14 | Low | The person card had an extra divider under its title. | Fixed | Removed. |
| 15 | Low | Empty-state copy vs button order; two Northwind sheets titled alike; header overflow at 320 px. | Fixed | Copy reordered; sheets titled by role; header wraps. |

### Feature 4: Interactions, follow-ups and Today (2026-11-24)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. No migration needed: every write is already granted and both functions exist and are tested.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | Undo after "Set follow-up" wouldn't bring the old follow-up back (the database restores only when none is set), so Undo didn't undo the sheet. | Fixed | Undo first puts the follow-up back to its value right after the log (guarded on it still being what the sheet set), then deletes the log; e2e: set, Undo → due today again. |
| 2 | High | A sheet inside a card disappears when logging clears the follow-up and the card leaves "Follow up". | Fixed | Both sheets belong to the Today screen; the person sheet loads its own data; e2e checks the offer survives Riya leaving the list. |
| 3 | High | `setFollowUp` with expected = null needs `is null`, and a refused update must be detected. | Fixed | `is`/`eq` by case, `.select("id")` length, changed vs gone in words (tested). |
| 4 | Medium | The sheet can't know "the value after the log" or the logged day from the screen. | Fixed | `logInteraction` returns the day used, the server's today and a fresh read of the follow-up; the offer uses only those. |
| 5 | Medium | "Add a note or another day" would send the screen's (yesterday's) day at midnight. | Fixed | A day is sent only if changed; otherwise the server's today at the tap. |
| 6 | Medium | A back-dated log's suggestion could fall before today. | Fixed | Its day + 7, or today + 7 if that's past (tested). |
| 7 | Medium | No way to clear or move a follow-up without a fake log. | Fixed | Change / Clear it in the person sheet (guarded); parked cards show their stage. |
| 8 | Medium | A double tap logs twice. | Fixed | All kind buttons wait while one is saving. |
| 9 | Medium | A tile link might not change a kept-alive Applications page's filter. | Fixed | Applications follows its `status` param; e2e covers it. |
| 10 | Low | How the person sheet gets its data. | Fixed | Per person on open, latest 5 by day then time logged; Coming-up rows open it too. |
| 11 | Low | Deleting an old timeline entry can silently bring back a follow-up. | Fixed | The confirmation says so when it may. |
| 12 | Low | Words that duplicate helpers ("Overdue · 9 days" vs "9 days overdue"). | Fixed | One set of words (`followUpLabel`); a future last-contact day reads as today. |
| 13 | Low | Error mapping and note checks. | Fixed | P0002, 54000, 23514 in words; notes tidied and counted after line ends are normalised. |
| 14 | Low | Kept-alive pages keep the sheet's result. | Fixed | The sheets reset whenever they open for someone. |

Open questions answered: Undo reverts both the log and the follow-up it set; a back-dated log suggests a week after it, never in the past; Clear/Change in the person sheet; parked cards show "Parked"; Coming-up rows open the person sheet; "Next: …" only when nothing is due or coming up.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. The `setFollowUp` guard, the day the server uses, the sheets owned by the screen, per-person loading with cancellation, and the RPC privileges all checked fine.

| # | Severity | Finding (file) | Outcome | What changed |
|---|----------|----------------|---------|--------------|
| 1 | High | Clearing the offer's date box and pressing Set / Move it cleared the follow-up (`""` read as null), then crashed rendering an invalid date. (log-sheet.tsx) | Fixed | Only an explicit `null` clears ("Clear it"); `""` is refused by the action ("Pick a day") and by the sheet before sending (tested). |
| 2 | Medium | Two-step Undo: step 1 committed, step 2 failed → no refresh, and the sheet still said "Next follow-up: Dec 1". | Fixed | `refresh()` once the revert matched; the failure carries `reverted`, and the sheet drops back to the offer (tested). |
| 3 | Medium | The "Logged …" status mounted full; the tapped button vanished and focus dropped. | Fixed | One always-mounted status filled after; focus moves to "Logged …". |
| 4 | Medium | Timeline delete repeated Feature 2's lost focus. | Fixed | Keep → back to Delete; after a delete → the Timeline heading. |
| 5 | Medium | Applications took `status` from a tile link but kept a stale search. | Fixed | A new status from the address brings its search with it. |
| 6 | Low | After a refusal the person sheet kept its stale follow-up, so every retry was refused. | Fixed | On "changed", it reloads. |
| 7 | Low | Save with an emptied date cleared the follow-up. | Fixed | Refused: "Pick a day, or use Clear it." |
| 8 | Low | "Dec 9 · Dec 9" for a later follow-up. | Fixed | The date is added only when the label isn't already it. |
| 9 | Low | A failed load left "Loading…" with no retry. | Fixed | "Couldn’t load" with Try again. |
| 10 | Low | A hidden note or day still rode along. | Fixed | Hiding them clears them. |
| 11 | Low | When the remaining follow-up equals the suggested day, the offer said "Move it" to the same day. | Fixed | No move offered then (tested). |
| 12 | Low | "It was already deleted." could never be seen. | Fixed | Dropped (the refresh shows it). |
| 13 | Low | `initials` cut flags and joined emoji. | Fixed | `Intl.Segmenter` graphemes (tested with 🇨🇦 and 👩‍💻). |
| 14 | Low | The person page didn't reset its log sheet when hidden. | Fixed | Same cleanup as Today. |
| — | Tests | Revert edge cases, null-clears, gone person, error words, a chosen day and tidied note reaching the RPC, the offer's edges. | Fixed | Added (503 unit + database tests). |
| — | Plan | `lib/log-offer.ts` was planned; the offer lives in `lib/interaction-input.ts`. | Noted | As built. |

#### design-critic (Today, sheets, after-log, empty; light and dark; against the Tempo mock)
Verdict: **Ship after fixes**. Matches the mock's structure; overdue as danger words on a neutral badge and 12 px button corners kept on purpose.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | After a log, two cobalt buttons competed and Done skipped the offer unnoticed. | Fixed | Done is secondary while the offer is open; Set follow-up is the one fill. |
| 2 | Medium | The sheets were full-screen (the mock has a bottom sheet over Today); the kinds sat far from the thumb. | Fixed | `Sheet compact`: content-sized, from the bottom, over the dimmed page, for the log and person sheets. |
| 3 | Medium | A stray "·" led its own line in the person sheet. | Fixed | How you met on its own line. |
| 4 | Medium | Cards said Role · Company (against Feature 2's rule). | Fixed | Company · Role. |
| 5 | Medium | The tiles were as loud as the title. | Fixed | One quiet strip, 20 px numbers, muted when all zero. |
| 6 | Medium | A tapped kind gave no sign until the server answered. | Fixed | It turns "Logging…" (a new `selected` variant). |
| 7 | Medium | A cobalt Delete under every timeline entry. | Fixed | Ghost (muted); the confirmation keeps the red fill. |
| 8 | Medium | Note and day sat below the kinds ("tap what it was, above"). | Fixed | They come first; the lead says the chosen day. |
| 9 | Low | The Today badge was cobalt. | Fixed | Ink bold on the quiet fill. |
| 10 | Low | The offer was labelled twice; the date read as 12/01/2026. | Fixed | The question is the field's label, with "Tue, Dec 1 · in a week" under it; the sheet is titled with the person's name. |
| 11 | Low | Uneven padding in the follow-up card; no kind icons. | Fixed / Deferred | Padding fixed; icons deferred to the polish pass. |
| 12 | Low | The footer could touch the last card. | Fixed | A spacer keeps at least 48 px. |
| 13 | Low | Coming-up rows gave no cue they open something. | Fixed | A chevron. |

Unreviewed (carried): the "Move it" offer, the person sheet with notes and its editor, a parked card, the person page's Log and Delete, error text in sheets, skeletons, long names in sheet titles, iOS date pickers, exit motion.

### Feature 5: The network map (2026-11-25)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. No migration needed: the map only reads (`met_on`, `created_at` and `crm_contact_stats()` already exist and are granted). Its "simpler approach" (a radial tree) was taken, settled by a short d3-force run.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | "Same data" didn't mean the same input: row order and interaction counts (collision by radius) moved people. | Fixed | Input sorted by id; collision at a constant radius; tested with reversed input and busier contacts. |
| 2 | High | The layout and its fly-in would rerun on every return to the tab and every refresh. | Fixed | Module cache by the network's shape; the ease plays only the first time a layout is shown; pan and zoom survive coming back. |
| 3 | High | d3's simulation starts its own timer as soon as it's created. | Fixed | `.stop()` at creation, driven only by `tick(n)`. |
| 4 | High | On a phone, panning the map would trap page scrolling; a passive wheel can't stop the page. | Fixed | A fixed-height frame with `touch-action: none` only inside it; a native non-passive wheel listener. |
| 5 | Medium | A loop wouldn't hang, but would drop people. | Fixed | Anyone unreached is hung off You, the loop cut at its lowest id (tested: everyone once, on the map and in the list). |
| 6 | Medium | A 0.4× minimum zoom can't fit 300 to 1,000 people. | Fixed | The minimum is whatever fits everyone (at most 0.4×). |
| 7 | Medium | Dot and label sizes had no units; taps on small dots would miss. | Fixed | Sizes in screen px, constant while positions zoom; a tap takes the nearest dot within 22 px of its edge. |
| 8 | Medium | Slider dates could hide people at the default position. | Fixed | The far right means everyone; days clamped to first meeting … today. |
| 9 | Medium | Someone met before their introducer would show as an unlinked dot. | Fixed | They appear on the later of the two days (tested). |
| 10 | Medium | The list wasn't equivalent to the picture. | Fixed | Company, stage and interaction count per person; the list and summary follow the slider; nesting kept in the markup at every depth. |
| 11 | Medium | Animations would re-render thousands of SVG nodes every frame. | Fixed | One CSS transition per dot, no per-frame React work; gestures write the transform directly and commit when they end. |
| 12 | Medium | Adding one person would reshuffle the whole map. | Fixed | The radial start (sectors by subtree) keeps changes mostly to that branch. |
| 13 | Low | The layout probably differs between phone and laptop. | Accepted | Same on one device, as decided. |
| 14 | Low | Labels overlap; first names are ambiguous. | Fixed | Greedy placement in priority order; titles skipped; 14 characters at most; the full name is in the sheet and the list. |
| 15 | Low | Stage shapes distort the size encoding. | Fixed | Equal round plates sized by interactions, the stage glyph inside. |
| 16 | Low | Focus and hosting the sheets on the map. | Fixed | Both sheets hosted by the map screen; closing a dot's sheet focuses the heading (built after code review #3). |
| 17 | Low | Server render and first paint. | Fixed | Laid out only after hydration; the motion preference read after hydration; the list server-rendered. |
| 18 | Low | Line direction isn't visible; some helpers already exist. | Fixed | Rings by depth make lines run outward; `summaryText` reused. |

#### code-reviewer
Verdict: **Ship after fixes**.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | Lifting the last, still finger of a pinch (or a two-finger tap) counted as a tap and opened a sheet; a right-click did too. | Fixed | `Gestures` in `lib/map-view.ts`: no tap once a second pointer joined, until every pointer is up (unit tests); primary button only (e2e: right-click opens nothing). |
| 2 | Medium | The 600 ms ease never played: `motion-safe:transition-opacity` replaced the transform transition. | Fixed | Position on an outer group, scaling and fading on an inner one; the transition is dropped once played, so zooms never lag; e2e checks it plays and ends where Reduce Motion puts the dots. |
| 3 | Medium | Closing a dot's sheet didn't return focus to the heading (the opener was `body`). | Fixed | The map focuses its heading after a dot's sheet closes (e2e). |
| 4 | Low | The slider didn't hide when everyone shares one day before today. | Fixed | `growthRange` is null when the first and last days are the same (tested). |
| 5 | Low | The layout cache key ignored the sibling order (days met, names). | Fixed | The key is the drawing order itself (tested: a changed met-on changes it, interaction counts don't). |
| 6 | Low | `pointercancel` didn't commit the view. | Fixed | It commits; every pointer-up commits. |
| 7 | Low | The tap reach used the radius before zoom shrinks the dot. | Fixed | It uses the drawn radius. |
| 8 | Low | The layout ran during render with a side effect, and wasn't chunked above 400. | Fixed / Changed | `first` is used up only after the screen shows it (`markShown`, tested). Instead of chunking, the settling run is halved above 400 people (measured on a laptop before halving: 300 people 0.13 s, 1,000 people 0.47 s). Chunking dropped from the plan. |
| 9 | Low | Play restarted from the start after the page was hidden and shown. | Fixed | Its progress is kept in a ref. |
| 10 | Low | The SVG's label didn't say which day the slider is on. | Fixed | It reads the same dated sentence as the summary. |
| — | Tests | Pinch/tap edge cases, the ease, focus return, one-day range, cache key and `first`, the day each person appears (timezone, future met-on), self-introduction, label edge cases. | Fixed | Added (`mapDay` pulled out of `loadMap` to test it); 527 unit tests, 29 e2e. |

#### design-critic (map, growing, zoomed, sheet, list, empty, playing; light and dark)
Verdict: **Ship after fixes**.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | A quarter of the people had no name at the fitted zoom (Jasmine, an interviewing contact, among them). | Fixed | Each label tries eight spots (below, right, left, above, then the diagonals) before it's dropped; 19 of 20 show at the fitted zoom, the last on zoom or tap. |
| 2 | Medium | Labels touched dots and lines. | Fixed | 3 px between labels, 1.5 px from other dots, a 6 px halo. |
| 3 | Medium | The cobalt slider was the loudest thing on screen. | Fixed | Own styling: `line-strong` track, `edge` fill, a surface thumb with an edge rim; cobalt only while focused or held. |
| 4 | Medium | The zoom buttons covered part of the network. | Fixed | Fit and zoom centre on the part left of the buttons; 8 px between them. |
| 5 | Medium | Text glyphs (+ − ⤢) for the controls; ⤢ reads as full screen. | Fixed | Line icons (plus, minus, four corner brackets) in the app's icon style. |
| 6 | Medium | Small dots became unreadable when zoomed out. | Fixed | A dot never draws below 9 px radius (tested). |
| 7 | Medium | The empty state's bare link failed 44 px and wasn't the app's pattern. | Fixed | A You dot, the copy, and a primary "Add a person" that opens the add sheet right there. |
| 8 | Medium | The list didn't match People's rows. | Fixed | Two lines: semibold name; stage glyph and word · company · count; a chevron. |
| 9 | Low | The page jumped when Play appeared after hydration. | Fixed | The row keeps 44 px either way. |
| 10 | Low | The slider's square focus ring stuck out. | Fixed | Uses the field radius. |
| 11 | Low | "today, everyone" read awkwardly; no sign where the range starts. | Fixed | "Today · all 20"; the first day and "Today" under the track. |
| 12 | Low | The hint ran to two lines and said "scroll" on a phone. | Fixed | "Drag to move · pinch to zoom · tap a person". |
| 13 | Low | The person sheet hides the tapped dot. | Deferred | The shared compact sheet sizes to its content; revisit in the polish pass. |

Also fixed while testing: Next's development badge sat over the Today tab once there were four tabs (`devIndicators: false`; development only).

Unreviewed (carried): "Laying out…", "No one on this day yet.", more than 40 people, the skeleton, the ease on a real phone.

### Feature 6: Install and polish (2026-11-25)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. No migration needed: the stress and empty seeds load through `reseed_demo_crm` within its limits.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | A CSS exit on `<dialog>` loses its modal position when `close()` runs, Safari and Firefox drop the scrim at once, and a closing sheet still takes taps (a double log). | Fixed (changed plan) | Sheets close instantly everywhere; only the entrance moves (the sheet rises, the scrim fades in, behind Reduce Motion). |
| 2 | Medium | The skip link and the sheet's focus fallback would hit a hidden `<Activity>` page's `<main>`/h1; most h1s couldn't take focus. | Fixed | The skip link targets the one `(app)` wrapper; the fallback picks the visible h1; every h1 has `tabIndex={-1}`. |
| 3 | Medium | The 44 px target test needed rules (sr-only radios, a checkbox in a big label, hidden pages, the skip link). | Fixed | Effective target = element or its label; invisible things skipped; the skip link measured focused; links in a sentence excepted. A planted 20 px button proves it can fail. |
| 4 | Medium | The motion test was undefined, and the palette test's regex could never fail (`\b` in a template string). | Fixed | The rule is exact (which properties count; globals.css too; a named allowlist), with self-checks; the palette regex uses `String.raw`, with a self-check. |
| 5 | Medium | Moving ports contradicted Feature 1 (3200 is in package.json, the e2e default, the login link fallback, Supabase's redirect list). | Fixed (changed plan) | 3200 stays; CLAUDE.md and the README say how to use `BASE_URL` when it's taken. |
| 6 | Medium | "Losing the connection shows each screen's error state" isn't true for navigation. | Fixed (changed plan) | The README says what happens offline (the browser's offline page for a screen not loaded yet). |
| 7 | Low | The in-app error boundary can't be triggered from Playwright. | Accepted | Checked by code review; no test-only throw in production code. |
| 8 | Low | The maskable safe zone must be measured to the rings' outer edge. | Fixed | `markReach` adds radius and half the stroke; scale 0.8 (reach 38.4 of 40), tested. |
| 9 | Low | The stress seed missed the real limits and an unbroken token. | Fixed | Every limit at its maximum, an email-address name with nothing to break at, also in a note; samples restored in `finally`. |
| 10 | Low | Test details: visible h1s only, `document.title`, focus never on the page behind (not "wraps"), DOM order, a fixed `delete-heading` id. | Fixed | All as listed; the delete heading's id comes from `useId`. |

#### code-reviewer
Verdict: **Ship after fixes**.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The sheet's focus fallback never ran for an opener on a page `<Activity>` hid (it's still connected). | Fixed | It also checks the opener is visible. Testing it showed more: React doesn't deliver the close event to a hidden page, and the next page may still be loading; the sheet's hide cleanup now waits (up to ~2 s) for a visible heading and focuses it unless something else has focus. e2e: delete a person from their page → People's heading is focused. |
| 2 | Medium | The motion rule missed variants with digits, brackets or slashes (`2xl:`, `data-[open]:`, `group-hover/row:`). | Fixed | Any variant up to a colon; those three are in the self-check. |
| 3 | Medium | The CSS check skipped a block's last declaration without `;`. | Fixed | Checked at `}`; in the self-check. |
| 4 | Medium | The sheet sweep missed the edit-application sheet and its delete confirmation. | Fixed | Both swept (axe in both themes, 44 px). |
| 5 | Medium | The keyboard test didn't check focus return or that the tab bar follows the screen; the trap loop couldn't fail. | Fixed | Cancel returns focus to Add; Tab from the screen's last control lands in the tab bar; the fallback test above. |
| 6 | Low | The person page's title could be read before the client navigation updated it. | Fixed | Waits for `Person · …`; also counts visible h1s there. |
| 7 | Low | The stress note was ~3,949 characters, and the unbroken token wasn't in a note. | Fixed | Exactly 4,000, with the token in it. |
| 8 | Low | A stale comment labelled the scrim keyframes as the sheet's. | Fixed | Moved. |
| — | Tests | Palette regex self-check, sideways overflow on long content at 320 and 390, skip link width. | Fixed | Added. The overflow test found four real overflows (below). |

Found by the new long-content test (fixed): a 629 px-wide page at 320 px from the "Delete {name}" button (buttons couldn't wrap: now they wrap long labels, centred), a link to a person named with one unbroken token, the "None linked to {name}." line, and the "Introduced by" select sizing to its longest option. Long words now wrap app-wide (`overflow-wrap: break-word` on the body, `anywhere` where flex or grid sizing needs it).

#### design-critic (first use, stress content, skip link; light and dark)
Verdict: **Ship after fixes**.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | Long titles crushed the sheet header (up to 5 lines) and touched its edge. | Fixed | Header padding; the title stops at two lines (the dialog's accessible name stays whole). Titles keep the person's name. |
| 2 | Medium | The person sheet printed everything. | Fixed | Company · role and how-met at 2 lines, notes at 4, entries at 2; the whole text is on their page. |
| 3 | Medium | A 6-line headline on the person page. | Fixed | Names over 40 characters step down to the section size, balanced. |
| 4 | Medium | The timeline didn't fold long notes. | Fixed | Notes over 320 characters fold to 6 lines with Show all / Show less. |
| 5 | Medium | Today's first use was weaker than People's and Map's. | Fixed | Same copy size and a primary "Add a person" that opens the add sheet on Today. |
| 6 | Medium | Map labels were cut by the frame's edge or hidden under the Fit button. | Fixed | The frame's edges and the zoom buttons block labels like dots do, so labels move to a clear spot. |
| 7 | Medium | The skip link half-covered the title. | Fixed | A full-width bar over the whole header, its focus ring inside. |
| 8 | Low | Names that could still push sideways (Today card, chain). | Fixed | They wrap anywhere and clamp at two lines on the card; the seed's token has no hyphens now. |
| 9 | Low | Applications' two first-step buttons wrapped at different widths. | Fixed | Stacked, full width. |
| 10 | Low | A wrapped line could start with "·". | Fixed | A no-break space before the dot. |
| 11 | Low | The in-app error page didn't match the tab screens. | Fixed | Laid out like them, the button sized to its label. |
| 12 | Low | The maskable mark reaches 38.4 of the 40 safe radius; the full icon's mark is large. | Accepted | Inside Android's safe zone by spec (the circle mask has 10 more to the edge); the mark is the old tab icon's size. |

Unreviewed (carried): the log sheet with a long name, the 120-character role row in the Applications list, levels 5–6 of a deep chain, the rendered error and not-found pages, skeletons, the sheet entrance on a real phone, the icons on a real home screen.

### Renamed to Orbit (2026-11-25)

No logic-checker pass: the user asked for code-reviewer and design-critic
on the changed screens and icon.

#### code-reviewer
Verdict: **Ship**. No bug users would hit; the findings were about tests.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The version-pin test covered the constants, not the computed drawing (formulas, line caps). | Fixed | The test also pins `markGeometry("full")` and `("maskable")` output next to `ICON_VERSION`. |
| 2 | Low | Two assertions couldn't fail (a path rebuilt with the code's own template; maskable/40 = full/50 by construction). | Fixed | Both gone with the cut ring; the maskable test now asks for 10% room inside the safe circle. |
| 3 | Low | The half-gap formula only held for small gaps. | No longer applies | The ring isn't cut any more (design-critic #1). |
| 4 | Low | `OrbitMark` wasn't hidden from screen readers by default. | Fixed | `aria-hidden` and `focusable="false"` unless a caller passes `aria-label`. |
| 5 | Low | Pixel checks skipped icon-192 and one side of the gap. | Fixed | icon-192 is checked like the others; the gap is gone; new pixels check the ring is unbroken and the small dot shows past it. |
| — | Note | The Feature 6 "Name:" bullet still said "Network" stays. | Fixed | Marked superseded. |

#### design-critic (two passes: login and icon sheet, light and dark)
Verdict: **Ship after fixes**, then the one open point left to the user.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | A ring cut open around a small dot at the upper right, white on blue, is the Ionic framework's logo. | Fixed, partly; flagged to the user | The ring is unbroken with the small dot on it like a bead (r 9, wider than the 7 stroke), moved to the lower left (150°). The second pass still finds the overall idea close to Ionic's: a centre dot, one ring and one small dot is the brief itself, so changing that (two dots on the ring, or an elliptical orbit) is the user's call. |
| 2 | Medium | At 16 px on a 1x screen the stroke and gap went below a pixel. | Fixed, partly | Stroke 6 → 7 (1.1 px at 16) and no gap. Accepted: no separate heavier favicon drawing; tabs at 2x and phones are fine, and a 1x desktop tab shows a ring with a bump. |
| 3 | Medium | The login mark was about 25 px and sat about 7 px inside the text column. | Fixed | Cropped to the drawing's exact bounds (`markBounds`) at 32 px tall: flush with the 20 px column, the heading's cap height. |
| 4 | Medium | Android's maskable mark looked about 20% smaller than the others (0.8). | Fixed | 0.95: reach 35.2 of the 40 safe circle. |
| 5 | Low | Proportions: the ring was the lightest part. | Fixed | Stroke 7. |
| 6 | Low | Optical centring and the mark's size in the square. | Accepted | The lower-left dot balances differently; the size (37 of 50) is in the usual range. |

Unreviewed (carried): a real 1x desktop tab, a real Android launcher's
crop, iOS dark and tinted home-screen icons, the Android splash in dark
mode.

#### Second round: the tilted orbit, the live address, the smoke test (2026-11-25)

The user picked the icon direction (a tilted oval like a planet's orbit
seen at an angle, to be clear of Ionic), gave the live address
(https://orbit-dk.vercel.app) and asked for the production checks.

**design-critic** (three passes on the icon)

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | A dot inside a tilted oval (rx 33, ry 19) reads as an eye at every size, worst at 16 px and beside "Who you met". | Fixed | The orbit crosses the dot: the far half behind it, the near half in front, with gaps (masks): a ringed planet. No eye glyph has that overlap. |
| 2 | High | The small dot sat on the orbit's tip: a knob or a comet head, not a person on the orbit. | Fixed | Moved in to 135 degrees on the near half, r 6.5; orbit runs on past it (tested). |
| 3 | Medium | The orbit was too flat to read as an orbit (ry/rx 0.19). | Fixed, partly | rx 37, ry 8 (0.22). Opening it further (ry 10 to 11) puts the near half across the dot's bottom edge, which reads as a dome or a hat; the dot showing below the near half is kept (tested). |
| 4 | Medium | Weaker at tab size than the circle (stroke 5, gap 2). | Fixed, partly | Stroke 6, gap 2.5. Still no separate small favicon drawing (accepted, as before). |
| 5 | Low | The login mark had shrunk to 24 px tall. | Fixed | 28 px tall (about 50 wide), on the text column. |
| 6 | Low | Resemblance to a stock Saturn emoji. | Accepted | Not a trademark; the small dot on the orbit makes it "you and your people". |
| — | Ionic | | Resolved | No longer resembles it at any size. |

**code-reviewer** (two passes)

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The smoke test (new) ran in local runs too and failed there: the cookie is only Secure in production. | Fixed | Left out of local runs; the Secure check follows https. |
| 2 | Medium | No cleanup if the smoke test failed between the save and the Undo; then, the cleanup could hide the real error, or not run on a timeout. | Fixed | The save, the Undo and the check sit in one try; on failure after the save (and before a confirmed Undo) it presses Reset demo in its own try, reports a failed reset, and rethrows the original error; 120 s budget. |
| 3 | Medium | The new pixel checks couldn't catch the V bug (they sampled where the V left white). | Fixed | The whole near half is checked every 2 degrees on every icon; with the bug put back it fails (at 64 degrees), checked. |
| 4 | Low | The "server's answer" checks test HTTP status, which is 200 even when an action fails. | Fixed | The status line, the sheet closing after Undo and the reload are the proof; the comment says so. |
| 5 | Low | Docs said the smoke test never reseeds; its sign-in reseeds a stale demo like any visitor's. | Fixed | README, CLAUDE.md, the plan and the test's header say so; a stale comment in login.e2e.ts too. |
| 6 | Low | Reset demo could run after a successful Undo (if the reload check failed). | Fixed | A confirmed Undo means no reset. |
| 7 | Low | `PRODUCTION_URL` exported but unused. | Fixed | Removed; the address is in the comments and docs. |
| — | Found while drawing | A mask on the rotated `<ellipse>` turns with it, cutting a V out of the ring; a half-ellipse arc between exactly opposite points is ambiguous. | Fixed | The mask sits on a group; each half is two quarter arcs. |

**Production checks** against https://orbit-dk.vercel.app, after the
deploy of 201c840: all 11 pass (the manifest and four icons without a
login, the orbit mark's pixels, the login link's landing address, the
demo, every tab and the map, a log saved and undone).

Unreviewed (carried): a real 1x desktop tab, a real Android launcher's
crop, iOS dark and tinted home-screen icons.
