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
