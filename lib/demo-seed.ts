// The demo account's sample network, and when to put it back
// (plans/crm.md, Feature 1). Pure: no database, so it's tested.
// lib/demo.ts does the writing, through the reseed_demo_crm function.
//
// Fictional people at fictional companies: the demo is public, so no real
// names. Everything is relative to the visitor's today, so it reads the
// same whichever day you visit: three introduction chains, a few people
// met directly, follow-ups overdue / today / this week / later / none.

import { addDays, instantOnDay } from "./dates";
import type { ApplicationStatus, InteractionKind, Stage } from "./crm";

type SampleInteraction = { daysAgo: number; kind: InteractionKind; note?: string };

export type SamplePerson = {
  /** Local to the seed: how introducers are named. Never stored. */
  key: string;
  name: string;
  company?: string;
  role?: string;
  howMet?: string;
  /** The key of whoever introduced you (listed earlier). None: you met them yourself. */
  introducedBy?: string;
  stage: Stage;
  /** Days from today: negative is overdue, 0 is today. None: no follow-up set. */
  followUpIn?: number;
  /** When you met (and added) them, in days ago. Interactions are never older. */
  addedDaysAgo: number;
  notes?: string;
  interactions: SampleInteraction[];
};

export const DEMO_PEOPLE: readonly SamplePerson[] = [
  // Chain 1: a professor, then her former student, then his team.
  {
    key: "elena",
    name: "Elena Marsh",
    company: "Lakeshore University",
    role: "Professor, Embedded Systems",
    howMet: "Took her embedded systems course",
    stage: "talking",
    followUpIn: 10,
    addedDaysAgo: 58,
    notes: "Happy to make intros. Prefers email over LinkedIn.",
    interactions: [
      { daysAgo: 55, kind: "meeting", note: "Office hours: asked how she got into industry research" },
      { daysAgo: 40, kind: "email", note: "Sent my resume for feedback" },
      { daysAgo: 12, kind: "meeting", note: "Coffee after class. Offered to introduce me to two alumni" },
    ],
  },
  {
    key: "sam",
    name: "Sam Okafor",
    company: "Kestrel Systems",
    role: "Firmware Engineer",
    howMet: "Elena's former student",
    introducedBy: "elena",
    stage: "talking",
    followUpIn: -2,
    addedDaysAgo: 38,
    interactions: [
      { daysAgo: 37, kind: "email", note: "Intro email from Elena" },
      { daysAgo: 33, kind: "call", note: "30 minutes on what the firmware team works on" },
      { daysAgo: 20, kind: "message", note: "Thanked him and shared my motor-controller project" },
    ],
  },
  {
    key: "riya",
    name: "Riya Patel",
    company: "Kestrel Systems",
    role: "Engineering Manager",
    introducedBy: "sam",
    stage: "interviewing",
    followUpIn: 0,
    addedDaysAgo: 19,
    notes: "Send a thank-you and ask about the timeline.",
    interactions: [
      { daysAgo: 18, kind: "email", note: "Sam forwarded my resume" },
      { daysAgo: 11, kind: "call", note: "Phone screen" },
      { daysAgo: 4, kind: "meeting", note: "Technical interview on site" },
    ],
  },
  {
    key: "tom",
    name: "Tom Becker",
    company: "Kestrel Systems",
    role: "University Recruiter",
    introducedBy: "riya",
    stage: "reached_out",
    followUpIn: 3,
    addedDaysAgo: 10,
    interactions: [{ daysAgo: 9, kind: "email", note: "Riya copied him in on scheduling" }],
  },
  {
    key: "grace",
    name: "Grace Liu",
    company: "Halcyon Labs",
    role: "Hardware Engineering Intern",
    howMet: "Elena's student last year",
    introducedBy: "elena",
    stage: "talking",
    followUpIn: 5,
    addedDaysAgo: 12,
    interactions: [
      { daysAgo: 12, kind: "message", note: "Elena connected us on LinkedIn" },
      { daysAgo: 6, kind: "call", note: "What her internship is really like" },
    ],
  },
  {
    key: "victor",
    name: "Victor Alvarez",
    company: "Halcyon Labs",
    role: "Senior Hardware Engineer",
    introducedBy: "grace",
    stage: "new",
    followUpIn: 1,
    addedDaysAgo: 5,
    notes: "Grace's mentor. Ask about the board bring-up team.",
    interactions: [],
  },

  // Chain 2: a recruiter from the career fair.
  {
    key: "marcus",
    name: "Marcus Reid",
    company: "Northwind Robotics",
    role: "Campus Recruiter",
    howMet: "Fall career fair booth",
    stage: "talking",
    followUpIn: -5,
    addedDaysAgo: 50,
    interactions: [
      { daysAgo: 50, kind: "meeting", note: "Career fair: five minutes at the booth, took my resume" },
      { daysAgo: 45, kind: "email", note: "Follow-up with my resume and portfolio" },
      { daysAgo: 30, kind: "call", note: "Recruiter screen" },
    ],
  },
  {
    key: "ana",
    name: "Ana Torres",
    company: "Northwind Robotics",
    role: "Controls Engineer",
    introducedBy: "marcus",
    stage: "talking",
    followUpIn: 7,
    addedDaysAgo: 28,
    interactions: [
      { daysAgo: 27, kind: "email", note: "Intro from Marcus" },
      { daysAgo: 22, kind: "call", note: "The controls internship and what they look for" },
      { daysAgo: 8, kind: "message", note: "Asked how they test ROS nodes" },
    ],
  },
  {
    key: "devon",
    name: "Devon Clarke",
    company: "Northwind Robotics",
    role: "Hardware Lead",
    introducedBy: "ana",
    stage: "reached_out",
    followUpIn: 2,
    addedDaysAgo: 7,
    interactions: [{ daysAgo: 6, kind: "email", note: "Asked for 15 minutes" }],
  },
  {
    key: "jasmine",
    name: "Jasmine Wu",
    company: "Tidewater Analytics",
    role: "Technical Recruiter",
    howMet: "Worked with Marcus before",
    introducedBy: "marcus",
    stage: "interviewing",
    followUpIn: 4,
    addedDaysAgo: 24,
    interactions: [
      { daysAgo: 23, kind: "email", note: "Marcus introduced us" },
      { daysAgo: 16, kind: "call", note: "Screen" },
      { daysAgo: 9, kind: "meeting", note: "Panel interview over video" },
      { daysAgo: 2, kind: "email", note: "Asked about next steps" },
    ],
  },
  {
    key: "kofi",
    name: "Kofi Mensah",
    company: "Tidewater Analytics",
    role: "Data Engineer",
    introducedBy: "jasmine",
    stage: "new",
    followUpIn: 14,
    addedDaysAgo: 9,
    interactions: [{ daysAgo: 9, kind: "message", note: "Jasmine said to ask him about the team" }],
  },

  // Chain 3: a hackathon teammate.
  {
    key: "leo",
    name: "Leo Park",
    role: "Hackathon teammate",
    howMet: "Built a parking-sensor app together at a weekend hackathon",
    stage: "talking",
    addedDaysAgo: 60,
    interactions: [
      { daysAgo: 60, kind: "meeting", note: "Hackathon weekend" },
      { daysAgo: 35, kind: "message", note: "Mentioned his sister works at Brightline" },
      { daysAgo: 15, kind: "message", note: "Caught up, swapped internship leads" },
    ],
  },
  {
    key: "hana",
    name: "Hana Kim",
    company: "Brightline Energy",
    role: "Software Engineer",
    introducedBy: "leo",
    stage: "talking",
    followUpIn: -1,
    addedDaysAgo: 34,
    interactions: [
      { daysAgo: 33, kind: "message", note: "Leo introduced us on LinkedIn" },
      { daysAgo: 29, kind: "call", note: "Grid software and how she got her internship" },
      { daysAgo: 14, kind: "email", note: "She read my cover letter and sent edits" },
    ],
  },
  {
    key: "omar",
    name: "Omar Haddad",
    company: "Brightline Energy",
    role: "Grid Software Lead",
    introducedBy: "hana",
    stage: "offer",
    followUpIn: 6,
    addedDaysAgo: 26,
    notes: "Offer deadline in two weeks. Ask about the start date.",
    interactions: [
      { daysAgo: 25, kind: "email", note: "Hana passed on my resume" },
      { daysAgo: 18, kind: "call", note: "Phone screen" },
      { daysAgo: 10, kind: "meeting", note: "Final interview" },
      { daysAgo: 1, kind: "call", note: "Offer call" },
    ],
  },
  {
    key: "chloe",
    name: "Chloe Martin",
    company: "Orchard Pay",
    role: "Product Designer",
    introducedBy: "hana",
    stage: "new",
    followUpIn: 9,
    addedDaysAgo: 3,
    interactions: [],
  },

  // Met directly.
  {
    key: "noah",
    name: "Noah Fischer",
    company: "Lakeshore University",
    role: "Career Advisor",
    howMet: "Career centre resume clinic",
    stage: "talking",
    followUpIn: 14,
    addedDaysAgo: 45,
    interactions: [
      { daysAgo: 45, kind: "meeting", note: "Resume review" },
      { daysAgo: 21, kind: "meeting", note: "Mock interview" },
    ],
  },
  {
    key: "isabel",
    name: "Isabel Cruz",
    company: "Maple Circuit",
    role: "Embedded Engineer",
    howMet: "Cold message after her conference talk",
    stage: "reached_out",
    followUpIn: -9,
    addedDaysAgo: 16,
    interactions: [{ daysAgo: 16, kind: "message", note: "Messaged about her talk on low-power sensors" }],
  },
  {
    key: "ben",
    name: "Ben Foster",
    company: "Larkspur Health",
    role: "Biomedical Engineer",
    howMet: "Friend of my cousin",
    stage: "new",
    followUpIn: 0,
    addedDaysAgo: 6,
    interactions: [],
  },
  {
    key: "mei",
    name: "Mei Chen",
    company: "Kestrel Systems",
    role: "Former intern",
    howMet: "Classmate in digital logic",
    stage: "talking",
    addedDaysAgo: 40,
    interactions: [
      { daysAgo: 40, kind: "message", note: "Asked about her internship" },
      { daysAgo: 26, kind: "meeting", note: "Lunch. Told me what Kestrel's interviews are like" },
    ],
  },
  {
    key: "ethan",
    name: "Ethan Brooks",
    company: "Quarry Games",
    role: "Gameplay Programmer",
    howMet: "Game dev meetup",
    stage: "parked",
    followUpIn: 45,
    addedDaysAgo: 44,
    notes: "No interns this cycle. Check back in the spring.",
    interactions: [
      { daysAgo: 44, kind: "meeting", note: "Meetup: talked about engine tooling" },
      { daysAgo: 30, kind: "email", note: "Said they aren't taking interns this year" },
    ],
  },
];

type SampleApplication = {
  company: string;
  role: string;
  status: ApplicationStatus;
  /** Days ago it was sent (none for a saved one). */
  appliedDaysAgo?: number;
  /** Days from today (negative: passed). */
  deadlineIn?: number;
  /** The key of the person tied to it. */
  contact?: string;
  location?: string;
  link?: string;
  notes?: string;
};

/**
 * 15 applications that agree with the people's stories (Riya's interview,
 * Jasmine's panel, Omar's offer, Marcus's screen), every status, two saved
 * ones with deadlines (one passed) and one without. Fictional companies,
 * .example links.
 */
export const DEMO_APPLICATIONS: readonly SampleApplication[] = [
  { company: "Kestrel Systems", role: "Firmware Engineering Intern", status: "interviewing", appliedDaysAgo: 20, contact: "riya", location: "Toronto, ON", link: "https://jobs.kestrel.example/firmware-intern" },
  { company: "Northwind Robotics", role: "Controls Software Intern", status: "interviewing", appliedDaysAgo: 48, contact: "marcus", location: "Waterloo, ON", link: "https://careers.northwind.example/controls" },
  { company: "Northwind Robotics", role: "Hardware Test Intern", status: "withdrawn", appliedDaysAgo: 49, location: "Waterloo, ON", notes: "Withdrew to focus on the controls role." },
  { company: "Tidewater Analytics", role: "Data Engineering Intern", status: "interviewing", appliedDaysAgo: 24, contact: "jasmine", location: "Orlando, FL" },
  { company: "Brightline Energy", role: "Grid Software Intern", status: "offer", appliedDaysAgo: 26, contact: "omar", location: "Toronto, ON", notes: "Offer deadline in two weeks." },
  { company: "Halcyon Labs", role: "Hardware Engineering Intern", status: "applied", appliedDaysAgo: 10, contact: "grace", location: "Toronto, ON" },
  { company: "Maple Circuit", role: "Embedded Systems Intern", status: "online_assessment", appliedDaysAgo: 15, contact: "isabel", location: "Ottawa, ON", notes: "Coding test due by the end of the week." },
  { company: "Silverline Semiconductors", role: "Design Verification Intern", status: "online_assessment", appliedDaysAgo: 12, location: "Ottawa, ON" },
  { company: "Lakeshore University", role: "Undergraduate Research Assistant", status: "applied", appliedDaysAgo: 35, contact: "elena", location: "Toronto, ON" },
  { company: "Harborview Medical Devices", role: "Firmware Intern", status: "applied", appliedDaysAgo: 7, location: "Orlando, FL", link: "https://harborview.example/careers/fw-intern" },
  { company: "Quarry Games", role: "Engine Tools Intern", status: "rejected", appliedDaysAgo: 46, contact: "ethan", location: "Montreal, QC" },
  { company: "Pinecrest Aerospace", role: "Avionics Software Intern", status: "rejected", appliedDaysAgo: 40, location: "Montreal, QC" },
  { company: "Larkspur Health", role: "Biomedical Devices Intern", status: "saved", deadlineIn: 9, contact: "ben", location: "Toronto, ON" },
  { company: "Orchard Pay", role: "Platform Engineering Intern", status: "saved", deadlineIn: -3, contact: "chloe", location: "Toronto, ON" },
  { company: "Bluewater Transit", role: "Software Engineering Intern", status: "saved", location: "Orlando, FL" },
];

/** One contact in the payload for reseed_demo_crm. */
export type SeedContact = {
  key: string;
  name: string;
  company: string | null;
  role: string | null;
  how_met: string | null;
  met_on: string;
  introduced_by: string | null;
  stage: Stage;
  next_follow_up: string | null;
  notes: string | null;
  created_at: string;
};
export type SeedInteraction = { contact: string; day: string; kind: InteractionKind; note: string | null; created_at: string };
export type SeedApplication = {
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_on: string | null;
  deadline: string | null;
  contact: string | null;
  location: string | null;
  link: string | null;
  notes: string | null;
  created_at: string;
};
export type SeedPayload = { contacts: SeedContact[]; interactions: SeedInteraction[]; applications: SeedApplication[] };

/** The payload for reseed_demo_crm, dated from `today` in `timeZone`. */
export function demoSeedPayload(today: string, timeZone: string | undefined): SeedPayload {
  const contacts = DEMO_PEOPLE.map((p) => ({
    key: p.key,
    name: p.name,
    company: p.company ?? null,
    role: p.role ?? null,
    how_met: p.howMet ?? null,
    met_on: addDays(today, -p.addedDaysAgo),
    introduced_by: p.introducedBy ?? null,
    stage: p.stage,
    next_follow_up: p.followUpIn === undefined ? null : addDays(today, p.followUpIn),
    notes: p.notes ?? null,
    created_at: instantOnDay(addDays(today, -p.addedDaysAgo), timeZone).toISOString(),
  }));
  const interactions = DEMO_PEOPLE.flatMap((p) =>
    p.interactions.map((i) => {
      const day = addDays(today, -i.daysAgo);
      return { contact: p.key, day, kind: i.kind, note: i.note ?? null, created_at: instantOnDay(day, timeZone).toISOString() };
    }),
  );
  const applications = DEMO_APPLICATIONS.map((a) => {
    const appliedOn = a.appliedDaysAgo === undefined ? null : addDays(today, -a.appliedDaysAgo);
    return {
      company: a.company,
      role: a.role,
      status: a.status,
      applied_on: appliedOn,
      deadline: a.deadlineIn === undefined ? null : addDays(today, a.deadlineIn),
      contact: a.contact ?? null,
      location: a.location ?? null,
      link: a.link ?? null,
      notes: a.notes ?? null,
      created_at: instantOnDay(appliedOn ?? addDays(today, -5), timeZone).toISOString(),
    };
  });
  return { contacts, interactions, applications };
}

/** How long the sample data lasts before the next demo sign-in puts it back. */
export const RESEED_AFTER_MS = 60 * 60 * 1000;
/** Clocks on different servers can disagree a little; more than this is a hand-set date. */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

/**
 * The markers live in the shared demo account's user metadata, namespaced
 * "crm_" because Hold ("hold_*") and Bitewise keep their own there.
 */
export const SEEDED_AT_KEY = "crm_demo_seeded_at";
export const SEEDED_DAY_KEY = "crm_demo_seeded_day";

type Metadata = Record<string, unknown> | null | undefined;

/** When the last seed finished, or null if never (or unreadable). */
export function seededAt(metadata: Metadata): Date | null {
  const value = metadata?.[SEEDED_AT_KEY];
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Put the sample data back on this sign-in? Yes if it was never seeded,
 * seeded over an hour ago, seeded for an EARLIER day than the visitor's
 * today (its "due today" would be yesterday's), or seeded "in the future"
 * (a clock set by hand, which would otherwise stop it ever being reset).
 *
 * Not for a LATER day (a visitor further west than the last one): their
 * follow-ups are a day off until the hour is up. Reseeding then would let
 * visitors in Tokyo and Toronto wipe the demo on every sign-in.
 */
export function needsReseed(metadata: Metadata, now: Date, today: string): boolean {
  const at = seededAt(metadata);
  if (!at) return true;
  const day = metadata?.[SEEDED_DAY_KEY];
  if (typeof day !== "string" || day < today) return true;
  const age = now.getTime() - at.getTime();
  return age > RESEED_AFTER_MS || age < -CLOCK_SLACK_MS;
}

/**
 * The database's own clock at the seed (the seeded contacts' updated_at),
 * so "changed since the seed" compares the database's times with each
 * other and never with this server's clock.
 */
export const SEED_DB_AT_KEY = "crm_demo_seed_db_at";

/** The metadata to write once a seed has finished: its finish time, day, and the database's time of the seed. */
export function seededMarkers(finishedAt: Date, today: string, seedDbAt?: string | null): Record<string, string> {
  const markers: Record<string, string> = { [SEEDED_AT_KEY]: finishedAt.toISOString(), [SEEDED_DAY_KEY]: today };
  if (seedDbAt) markers[SEED_DB_AT_KEY] = seedDbAt;
  return markers;
}

/** How many rows a table has, and its newest change (updated_at, or created_at for interactions). */
export type TableState = { count: number; latest: string | null };
export type DemoState = { contacts: TableState; interactions: TableState; applications: TableState };

export function seedCounts(payload: SeedPayload): Record<keyof DemoState, number> {
  return { contacts: payload.contacts.length, interactions: payload.interactions.length, applications: payload.applications.length };
}

/**
 * Has a visitor changed the demo since it was seeded? Yes if any table has
 * a different number of rows than the seed made, or a row created or
 * edited after the seed (by the database's clock). Then the next demo
 * sign-in reseeds, so one visitor's deletions don't greet the next.
 * (Editing an interaction's note keeps its created_at, so that alone isn't
 * noticed; adding or deleting one is.)
 */
export function seedLooksChanged(metadata: Metadata, state: DemoState, expected: Record<keyof DemoState, number>): boolean {
  const mark = metadata?.[SEED_DB_AT_KEY];
  const markTime = typeof mark === "string" ? Date.parse(mark) : Number.NaN;
  if (Number.isNaN(markTime)) return true;
  return (Object.keys(expected) as (keyof DemoState)[]).some((table) => {
    const { count, latest } = state[table];
    return count !== expected[table] || (latest !== null && Date.parse(latest) > markTime);
  });
}
