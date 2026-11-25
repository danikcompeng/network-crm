-- Network (personal CRM): contacts, interactions, applications
-- (plans/crm.md, Feature 1).
--
-- How to apply: Supabase dashboard -> SQL Editor -> New query, paste this
-- whole file, Run. Once. It only creates new things, all named crm_*; it
-- doesn't touch Hold's or Bitewise's tables, which share this project.
-- It's one transaction: if anything fails, nothing is kept, so it can
-- simply be run again after fixing the problem.
--
-- tests/db/*.db.test.ts run this exact file against real Postgres
-- (PGlite) with Supabase's roles and default privileges, and check every
-- rule below.

begin;

-- ===========================================================================
-- crm_contacts: one row per person. "You" is not a row: someone with no
-- introducer hangs off you.
-- ===========================================================================
create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  -- Whose contact. Filled from the login token, never from the app.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  company text,
  role text,
  how_met text,
  -- When you met (not when you typed them in): the map grows by this.
  met_on date,
  introduced_by uuid,
  stage text not null default 'new',
  -- A calendar day in YOUR timezone (worked out by the app), never a
  -- timestamp, so "due today" can't drift into tomorrow in UTC.
  next_follow_up date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lets other rows point at "this contact AND this owner" (below).
  constraint crm_contacts_id_user_id_key unique (id, user_id),

  -- Texts: the app tidies them before saving (empty becomes null); these
  -- are the backstop. char_length counts characters, so an emoji is 1.
  constraint crm_contacts_name_check check (char_length(name) between 1 and 80 and name !~ '^\s' and name !~ '\s$'),
  constraint crm_contacts_company_check check (char_length(company) between 1 and 80 and company !~ '^\s' and company !~ '\s$'),
  constraint crm_contacts_role_check check (char_length(role) between 1 and 80 and role !~ '^\s' and role !~ '\s$'),
  constraint crm_contacts_how_met_check check (char_length(how_met) between 1 and 280 and how_met !~ '^\s' and how_met !~ '\s$'),
  constraint crm_contacts_notes_check check (char_length(notes) between 1 and 4000),
  constraint crm_contacts_stage_check check (stage in ('new', 'reached_out', 'talking', 'interviewing', 'offer', 'parked')),
  -- Every date in Network is a plausible calendar day, so a mis-read
  -- import (an Excel serial number, the year 0026) is refused, not stored.
  constraint crm_contacts_met_on_check check (met_on between date '2000-01-01' and date '2100-12-31'),
  constraint crm_contacts_follow_up_check check (next_follow_up between date '2000-01-01' and date '2100-12-31'),

  -- Nobody introduced themselves. (Longer loops: the trigger below.)
  constraint crm_contacts_not_self check (introduced_by <> id),
  -- The introducer must exist AND be yours, even with a guessed id.
  -- Deleting them detaches the people they introduced (they hang off you):
  -- "set null (introduced_by)" clears only that column; a plain set null
  -- would also clear user_id. (Postgres 15+.)
  constraint crm_contacts_introduced_by_fkey foreign key (introduced_by, user_id)
    references public.crm_contacts (id, user_id) on delete set null (introduced_by)
);

create index crm_contacts_user_introduced_by_idx on public.crm_contacts (user_id, introduced_by);
create index crm_contacts_user_follow_up_idx on public.crm_contacts (user_id, next_follow_up);

-- ===========================================================================
-- crm_interactions: "I talked to this person on this day". The day is a
-- calendar date in your timezone.
-- ===========================================================================
create table public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  day date not null,
  kind text not null,
  note text,
  -- The follow-up this interaction resolved (crm_log_interaction), so
  -- undoing it can put the follow-up back. Not editable.
  cleared_follow_up date,
  created_at timestamptz not null default now(),

  -- The contact must exist AND be yours. Deleting them deletes this.
  constraint crm_interactions_contact_fkey foreign key (contact_id, user_id)
    references public.crm_contacts (id, user_id) on delete cascade,
  constraint crm_interactions_kind_check check (kind in ('message', 'email', 'call', 'meeting', 'applied', 'other')),
  constraint crm_interactions_note_check check (char_length(note) between 1 and 1000),
  constraint crm_interactions_day_check check (day between date '2000-01-01' and date '2100-12-31'),
  constraint crm_interactions_cleared_check check (cleared_follow_up between date '2000-01-01' and date '2100-12-31')
);

-- A contact's timeline (newest first), and "everything on these days".
create index crm_interactions_user_contact_day_idx on public.crm_interactions (user_id, contact_id, day);
create index crm_interactions_user_day_idx on public.crm_interactions (user_id, day);

-- ===========================================================================
-- crm_applications: one row per internship application.
-- ===========================================================================
create table public.crm_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null,
  role text not null,
  link text,
  location text,
  -- Null for a "saved" application, or an imported one with no date.
  applied_on date,
  status text not null default 'applied',
  deadline date,
  -- The person tied to it (a recruiter, whoever referred you), if any.
  contact_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_applications_company_check check (char_length(company) between 1 and 80 and company !~ '^\s' and company !~ '\s$'),
  constraint crm_applications_role_check check (char_length(role) between 1 and 120 and role !~ '^\s' and role !~ '\s$'),
  -- Only web links: a javascript: or data: link would run when tapped.
  constraint crm_applications_link_check check (char_length(link) <= 2000 and link ~* '^https?://[^\s]+$'),
  constraint crm_applications_location_check check (char_length(location) between 1 and 80 and location !~ '^\s' and location !~ '\s$'),
  constraint crm_applications_notes_check check (char_length(notes) between 1 and 2000),
  constraint crm_applications_status_check check (
    status in ('saved', 'applied', 'online_assessment', 'interviewing', 'offer', 'rejected', 'withdrawn')
  ),
  constraint crm_applications_applied_on_check check (applied_on between date '2000-01-01' and date '2100-12-31'),
  constraint crm_applications_deadline_check check (deadline between date '2000-01-01' and date '2100-12-31'),
  -- The contact must be yours. Deleting them keeps the application.
  constraint crm_applications_contact_fkey foreign key (contact_id, user_id)
    references public.crm_contacts (id, user_id) on delete set null (contact_id)
);

create index crm_applications_user_contact_idx on public.crm_applications (user_id, contact_id);
create index crm_applications_user_status_idx on public.crm_applications (user_id, status);

-- ===========================================================================
-- Triggers.
-- security invoker: they run as YOU, so Row Level Security still applies.
-- search_path = '': every name is written in full (public.crm_contacts),
-- so nobody can swap in a lookalike table.
-- ===========================================================================

-- updated_at: the moment of the last change, on every update.
create function public.crm_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_contacts_touch before update on public.crm_contacts
  for each row execute function public.crm_touch_updated_at();
create trigger crm_applications_touch before update on public.crm_applications
  for each row execute function public.crm_touch_updated_at();

-- Limits per account. Anyone logged in (the shared demo account too) can
-- call Supabase directly and skip the app, and this project's storage is
-- shared with two live apps, so the limits live here. A trigger, not a
-- policy: a count inside a policy can't see the other rows of the same
-- bulk insert. 1,000 contacts also keeps every contact list inside the
-- API's 1,000-row answer. The per-user, per-table lock makes two inserts
-- at the same moment (two tabs importing) count one after the other, so
-- together they can't pass the limit.
create function public.crm_enforce_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  most integer := tg_argv[0]::integer;
  have integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('crm.limit:' || tg_table_name || ':' || new.user_id::text, 0)
  );
  if tg_table_name = 'crm_contacts' then
    select count(*) into have from public.crm_contacts as t where t.user_id = new.user_id;
  elsif tg_table_name = 'crm_interactions' then
    select count(*) into have from public.crm_interactions as t where t.user_id = new.user_id;
  else
    select count(*) into have from public.crm_applications as t where t.user_id = new.user_id;
  end if;
  if have >= most then
    raise exception '%: limit of % reached', tg_table_name, most using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger crm_contacts_limit before insert on public.crm_contacts
  for each row execute function public.crm_enforce_limit('1000');
create trigger crm_interactions_limit before insert on public.crm_interactions
  for each row execute function public.crm_enforce_limit('5000');
create trigger crm_applications_limit before insert on public.crm_applications
  for each row execute function public.crm_enforce_limit('1000');

-- No introduction loops (A introduced B, B introduced A, or longer).
-- Walks up the chain from the new introducer; reaching this contact means
-- a loop. On insert too: a client can choose ids, and one bulk insert of
-- A->B and B->A passes the foreign keys (checked at the end of the
-- statement), but this trigger sees the earlier rows of the same
-- statement, so the second row is refused.
--
-- The per-user lock makes two saves at the same moment (two tabs) take
-- turns, and each query here reads what was committed before it got the
-- lock. "union" (not "union all") stops on a repeat, so even a loop that
-- somehow exists can't make the walk run forever.
create function public.crm_contacts_no_loops()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Nobody, or unchanged: nothing to check. (Deleting an introducer
  -- arrives here as an update to null.)
  if new.introduced_by is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.introduced_by is not distinct from old.introduced_by then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm.introductions:' || new.user_id::text, 0));

  if exists (
    with recursive up (id) as (
      select new.introduced_by
      union
      select c.introduced_by
        from public.crm_contacts as c
        join up on c.id = up.id
       where c.user_id = new.user_id
         and c.introduced_by is not null
    )
    select 1 from up where up.id = new.id
  ) then
    raise exception 'crm_contacts: that introducer would make a loop' using errcode = 'CR001';
  end if;
  return new;
end;
$$;

create trigger crm_contacts_no_loops before insert or update of introduced_by on public.crm_contacts
  for each row execute function public.crm_contacts_no_loops();

-- ===========================================================================
-- Row Level Security: you can only see and change your own rows.
-- (select auth.uid()) in brackets is Supabase's advice: worked out once
-- per query instead of once per row.
-- ===========================================================================
alter table public.crm_contacts enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_applications enable row level security;

create policy crm_contacts_select_own on public.crm_contacts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy crm_contacts_insert_own on public.crm_contacts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy crm_contacts_update_own on public.crm_contacts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy crm_contacts_delete_own on public.crm_contacts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- An interaction can't be dated after tomorrow in UTC (which covers today
-- everywhere on Earth, up to UTC+14). The app is stricter (no later than
-- your today); this stops anyone calling Supabase directly. Rows already
-- saved are never affected.
create policy crm_interactions_select_own on public.crm_interactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy crm_interactions_insert_own on public.crm_interactions
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and day <= (now() at time zone 'utc')::date + 1
  );
create policy crm_interactions_update_own on public.crm_interactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and day <= (now() at time zone 'utc')::date + 1
  );
create policy crm_interactions_delete_own on public.crm_interactions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy crm_applications_select_own on public.crm_applications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy crm_applications_insert_own on public.crm_applications
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy crm_applications_update_own on public.crm_applications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy crm_applications_delete_own on public.crm_applications
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ===========================================================================
-- Privileges: take everything away, then give back only what the app uses.
-- Supabase gives anon and authenticated ALL on every new table (including
-- TRUNCATE, which Row Level Security doesn't cover), and Postgres lets
-- PUBLIC run every new function.
-- ===========================================================================
revoke all on table public.crm_contacts, public.crm_interactions, public.crm_applications from anon, authenticated;

grant select, insert, delete on table public.crm_contacts, public.crm_interactions, public.crm_applications to authenticated;
-- Only what you can edit. Never the id, the owner or the dates the
-- database keeps (so the app uses insert and update, never upsert).
grant update (name, company, role, how_met, met_on, introduced_by, stage, next_follow_up, notes)
  on table public.crm_contacts to authenticated;
grant update (day, kind, note) on table public.crm_interactions to authenticated;
grant update (company, role, link, location, applied_on, status, deadline, contact_id, notes)
  on table public.crm_applications to authenticated;

-- ===========================================================================
-- crm_contact_stats: per contact, how many interactions and the last day.
-- One row per contact (at most 1,000), so the map's dot sizes and "last
-- talked" never need every interaction (the API answers 1,000 rows at most).
-- ===========================================================================
create function public.crm_contact_stats()
returns table (contact_id uuid, interactions integer, last_day date)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.contact_id, count(*)::integer, max(i.day)
    from public.crm_interactions as i
   where i.user_id = (select auth.uid())
   group by i.contact_id
$$;

-- ===========================================================================
-- crm_log_interaction: logs an interaction and, in the same transaction,
-- resolves the contact's follow-up if it was due on or before that day
-- (you did what it reminded you to). A follow-up later than the
-- interaction stays; a call back-dated to before the follow-up doesn't
-- resolve it. Returns {"id", "cleared_follow_up"}.
-- ===========================================================================
create function public.crm_log_interaction(p_contact_id uuid, p_day date, p_kind text, p_note text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  due date;
  new_id uuid;
begin
  if me is null then
    raise exception 'crm_log_interaction: not logged in' using errcode = '42501';
  end if;

  -- Lock the contact, so two logs at once can't both clear one follow-up.
  select c.next_follow_up into due
    from public.crm_contacts as c
   where c.id = p_contact_id and c.user_id = me
   for update;
  if not found then
    raise exception 'crm_log_interaction: no such contact' using errcode = 'P0002';
  end if;

  if due is not null and p_day is not null and due <= p_day then
    update public.crm_contacts as c set next_follow_up = null where c.id = p_contact_id and c.user_id = me;
  else
    due := null;
  end if;

  insert into public.crm_interactions (contact_id, day, kind, note, cleared_follow_up)
  values (p_contact_id, p_day, p_kind, p_note, due)
  returning id into new_id;

  return pg_catalog.jsonb_build_object('id', new_id, 'cleared_follow_up', due);
end;
$$;

-- ===========================================================================
-- crm_undo_interaction: deletes an interaction and puts back the follow-up
-- it resolved, but only if the contact still has none (one set since is
-- newer and wins). Returns {"deleted", "restored_follow_up"}.
-- ===========================================================================
create function public.crm_undo_interaction(p_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  gone_contact uuid;
  gone_cleared date;
  restored date;
begin
  if me is null then
    raise exception 'crm_undo_interaction: not logged in' using errcode = '42501';
  end if;

  delete from public.crm_interactions as i
   where i.id = p_id and i.user_id = me
  returning i.contact_id, i.cleared_follow_up into gone_contact, gone_cleared;
  if not found then
    return pg_catalog.jsonb_build_object('deleted', false, 'restored_follow_up', null);
  end if;

  -- Not if another interaction that's still logged, on or after that
  -- follow-up's day, would have resolved it anyway (two logs the same
  -- day, then undo the first: the follow-up stays resolved).
  if gone_cleared is not null then
    update public.crm_contacts as c
       set next_follow_up = gone_cleared
     where c.id = gone_contact and c.user_id = me and c.next_follow_up is null
       and not exists (
         select 1 from public.crm_interactions as i
          where i.contact_id = gone_contact and i.user_id = me and i.day >= gone_cleared
       )
    returning c.next_follow_up into restored;
  end if;

  return pg_catalog.jsonb_build_object('deleted', true, 'restored_follow_up', restored);
end;
$$;

-- ===========================================================================
-- reseed_demo_crm: replaces the CALLER's contacts, interactions and
-- applications with the payload, all at once. "Try the demo" uses it to
-- put the sample network back (plans/crm.md, Feature 1); the app only
-- calls it for the demo account.
--
-- One transaction: a failure keeps the old data instead of half a seed.
-- The lock makes two demo sign-ins at the same moment take turns instead
-- of leaving two copies. security invoker: RLS, the limits and every check
-- still apply, so anyone else calling it only ever replaces their own data.
--
-- p_seed (no real ids: contacts are named by a local "key"):
-- { "contacts":     [{ "key", "name", "company", "role", "how_met", "met_on",
--                      "introduced_by" (an EARLIER contact's key, or null),
--                      "stage", "next_follow_up", "notes", "created_at" }],
--   "interactions": [{ "contact" (a key), "day", "kind", "note", "created_at" }],
--   "applications": [{ "company", "role", "link", "location", "applied_on",
--                      "status", "deadline", "contact" (a key, or null),
--                      "notes", "created_at" }] }
-- A missing list, a missing or repeated key, or a key that names nobody
-- fails the whole seed (22023). Returns how many contacts were added.
-- ===========================================================================
create function public.reseed_demo_crm(p_seed jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ids jsonb := '{}'::jsonb;
  item jsonb;
  item_key text;
  ref text;
  intro uuid;
  new_id uuid;
  added integer := 0;
begin
  if me is null then
    raise exception 'reseed_demo_crm: not logged in' using errcode = '42501';
  end if;
  if p_seed is null
     or pg_catalog.jsonb_typeof(p_seed) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_seed -> 'contacts') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_seed -> 'interactions') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_seed -> 'applications') is distinct from 'array' then
    raise exception 'reseed_demo_crm: expected contacts, interactions and applications lists' using errcode = '22023';
  end if;

  -- One seed per user at a time; released when this transaction ends.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm.reseed_demo_crm:' || me::text, 0));

  delete from public.crm_applications as a where a.user_id = me;
  -- Deleting the contacts deletes their interactions too.
  delete from public.crm_contacts as c where c.user_id = me;

  for item in select value from pg_catalog.jsonb_array_elements(p_seed -> 'contacts') loop
    item_key := item ->> 'key';
    if item_key is null or ids ? item_key then
      raise exception 'reseed_demo_crm: every contact needs its own key' using errcode = '22023';
    end if;
    ref := item ->> 'introduced_by';
    intro := null;
    if ref is not null then
      if not (ids ? ref) then
        raise exception 'reseed_demo_crm: introducer "%" is not an earlier contact', ref using errcode = '22023';
      end if;
      intro := (ids ->> ref)::uuid;
    end if;

    insert into public.crm_contacts (name, company, role, how_met, met_on, introduced_by, stage, next_follow_up, notes, created_at)
    values (
      item ->> 'name',
      item ->> 'company',
      item ->> 'role',
      item ->> 'how_met',
      (item ->> 'met_on')::date,
      intro,
      coalesce(item ->> 'stage', 'new'),
      (item ->> 'next_follow_up')::date,
      item ->> 'notes',
      coalesce((item ->> 'created_at')::timestamptz, now())
    )
    returning id into new_id;

    ids := ids || pg_catalog.jsonb_build_object(item_key, new_id);
    added := added + 1;
  end loop;

  for item in select value from pg_catalog.jsonb_array_elements(p_seed -> 'interactions') loop
    ref := item ->> 'contact';
    if ref is null or not (ids ? ref) then
      raise exception 'reseed_demo_crm: interaction for unknown contact "%"', ref using errcode = '22023';
    end if;
    insert into public.crm_interactions (contact_id, day, kind, note, created_at)
    values (
      (ids ->> ref)::uuid,
      (item ->> 'day')::date,
      item ->> 'kind',
      item ->> 'note',
      coalesce((item ->> 'created_at')::timestamptz, now())
    );
  end loop;

  for item in select value from pg_catalog.jsonb_array_elements(p_seed -> 'applications') loop
    ref := item ->> 'contact';
    if ref is not null and not (ids ? ref) then
      raise exception 'reseed_demo_crm: application for unknown contact "%"', ref using errcode = '22023';
    end if;
    insert into public.crm_applications (company, role, link, location, applied_on, status, deadline, contact_id, notes, created_at)
    values (
      item ->> 'company',
      item ->> 'role',
      item ->> 'link',
      item ->> 'location',
      (item ->> 'applied_on')::date,
      coalesce(item ->> 'status', 'applied'),
      (item ->> 'deadline')::date,
      case when ref is null then null else (ids ->> ref)::uuid end,
      item ->> 'notes',
      coalesce((item ->> 'created_at')::timestamptz, now())
    );
  end loop;

  return added;
end;
$$;

-- ===========================================================================
-- Function privileges: nobody runs anything by default (Supabase's defaults
-- grant PUBLIC, anon and authenticated), then logged-in users get exactly
-- the four the app calls. Trigger functions are never called directly.
-- ===========================================================================
revoke all on function public.crm_touch_updated_at() from public, anon, authenticated;
revoke all on function public.crm_enforce_limit() from public, anon, authenticated;
revoke all on function public.crm_contacts_no_loops() from public, anon, authenticated;
revoke all on function public.crm_contact_stats() from public, anon, authenticated;
revoke all on function public.crm_log_interaction(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.crm_undo_interaction(uuid) from public, anon, authenticated;
revoke all on function public.reseed_demo_crm(jsonb) from public, anon, authenticated;

grant execute on function public.crm_contact_stats() to authenticated;
grant execute on function public.crm_log_interaction(uuid, date, text, text) to authenticated;
grant execute on function public.crm_undo_interaction(uuid) to authenticated;
grant execute on function public.reseed_demo_crm(jsonb) to authenticated;

commit;
