// The words Network is built from: people's stages, kinds of interaction,
// application statuses, and how long each text can be (plans/crm.md, Data
// model). The migration has the same lists as check constraints;
// lib/crm.test.ts reads the SQL and fails if the two disagree.

export const STAGES = ["new", "reached_out", "talking", "interviewing", "offer", "parked"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  reached_out: "Reached out",
  talking: "Talking",
  interviewing: "Interviewing",
  offer: "Offer",
  parked: "Parked",
};

export const INTERACTION_KINDS = ["message", "email", "call", "meeting", "applied", "other"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const INTERACTION_LABELS: Record<InteractionKind, string> = {
  message: "Message",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  applied: "Applied",
  other: "Other",
};

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "online_assessment",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  online_assessment: "Online assessment",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Longest each text may be, in characters (code points). Same numbers as the migration's checks. */
export const LIMITS = {
  contactName: 80,
  company: 80,
  role: 80,
  howMet: 280,
  contactNotes: 4_000,
  interactionNote: 1_000,
  applicationCompany: 80,
  applicationRole: 120,
  link: 2_000,
  location: 80,
  applicationNotes: 2_000,
} as const;

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}
export function isInteractionKind(value: unknown): value is InteractionKind {
  return typeof value === "string" && (INTERACTION_KINDS as readonly string[]).includes(value);
}
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (APPLICATION_STATUSES as readonly string[]).includes(value);
}
