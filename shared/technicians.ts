// Pass 38 (PLAN_ROADMAP_V2.md C5.7; Part E answer 2; canon §16): technicians
// are users. The `technicians` table is gone; a technician is a `users` row
// whose `technicianStatus` is set (ACTIVE | INACTIVE | TERMINATED - the field
// vocabulary the old table carried), with the technician block beside it:
// `licenseId`, `color` (the dispatch board's row dot), `technicianNotes`,
// and `phone`, which every user may have. NULL `technicianStatus` means
// "not a technician" - the column is the marker, there is no boolean.
//
// Two statuses, deliberately kept apart (decided, Pass 38):
//   - `users.status` (active | inactive) is the LOGIN flag: server/auth.ts
//     refuses a login that is not active. A technician who never signs in
//     (a user minted from a technician row by the migration, or created from
//     Settings -> Users without a password) is `inactive` here.
//   - `users.technicianStatus` is the FIELD-availability flag: the dispatch
//     board, the pickers and the Tech View list a technician while it is
//     ACTIVE, and the board keeps an INACTIVE / TERMINATED one visible only
//     while it still holds visits.
//   A person can be any combination: an office login that is also an ACTIVE
//   technician, a field-only technician with no login, a terminated
//   technician whose login was turned off.
//
// The ten client readers of GET /api/technicians and the shared helpers that
// take technician ids keep the shape the old row had: `TechnicianSummary`
// below is that projection (`displayName` derived as "First Last", `status`
// the technician status, `userId` the row's own id - the Pass 12 bridge
// answered by identity now), served by storage's `getTechnicians` facade.
// `shared/schema.ts` exports it under the old name `Technician`; the sweep of
// the client from `Technician` to `UserSummary` is a later hygiene pass.
import { userDisplayName } from "./users";

export const TECHNICIAN_STATUSES = ["ACTIVE", "INACTIVE", "TERMINATED"] as const;
export type TechnicianStatus = (typeof TECHNICIAN_STATUSES)[number];

export function isTechnicianStatus(value: unknown): value is TechnicianStatus {
  return typeof value === "string" && (TECHNICIAN_STATUSES as readonly string[]).includes(value);
}

export const TECHNICIAN_STATUS_LABELS: Record<TechnicianStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  TERMINATED: "Terminated",
};

/** "Not a technician" for a null status - the Users card's field-technician select and row badge. */
export const NOT_A_TECHNICIAN_LABEL = "Not a technician";

export function describeTechnicianStatus(status: string | null | undefined): string {
  if (!status) return NOT_A_TECHNICIAN_LABEL;
  return TECHNICIAN_STATUS_LABELS[status as TechnicianStatus] ?? status;
}

/** The board's row dot when a technician has no colour of their own (schedule.tsx read this literal before Pass 38). */
export const DEFAULT_TECHNICIAN_COLOR = "#2563eb";

/** The users columns a technician projection reads - any object with them will do (a `User`, a `UserSummary`, a raw row). */
export interface TechnicianUserFields {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  licenseId: string | null;
  color: string | null;
  technicianNotes: string | null;
  technicianStatus: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * The shape GET /api/technicians answers - the old `technicians` row,
 * projected from a users row. `displayName` is "First Last", `licenseId` is
 * "" when the user has none (the old column was NOT NULL and every reader
 * prints it), `status` is the technician status, `userId` is the user's own
 * id.
 */
export interface TechnicianSummary {
  id: string;
  orgId: string;
  displayName: string;
  licenseId: string;
  status: TechnicianStatus;
  email: string | null;
  phone: string | null;
  color: string | null;
  notes: string | null;
  userId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** A user is a technician when their technician status is set - whatever their login status or role. */
export function isTechnicianUser(user: Pick<TechnicianUserFields, "technicianStatus"> | null | undefined): boolean {
  return !!user && isTechnicianStatus(user.technicianStatus);
}

/** The projection of one user, or null for a user who is not a technician. */
export function technicianSummaryFromUser(user: TechnicianUserFields): TechnicianSummary | null {
  if (!isTechnicianStatus(user.technicianStatus)) return null;
  return {
    id: user.id,
    orgId: user.orgId,
    displayName: userDisplayName(user),
    licenseId: user.licenseId ?? "",
    status: user.technicianStatus,
    email: user.email || null,
    phone: user.phone ?? null,
    color: user.color ?? null,
    notes: user.technicianNotes ?? null,
    userId: user.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Every technician among some users, ACTIVE ones only unless asked for all,
 * by display name - the order the old table's readers sorted into.
 */
export function technicianSummariesFromUsers(list: ReadonlyArray<TechnicianUserFields>, includeInactive = false): TechnicianSummary[] {
  const summaries: TechnicianSummary[] = [];
  for (const user of list) {
    const summary = technicianSummaryFromUser(user);
    if (!summary) continue;
    if (!includeInactive && summary.status !== "ACTIVE") continue;
    summaries.push(summary);
  }
  return summaries.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
}

/** The codes a users write answers when the rules refuse it (server/storage.ts UserError), beside shared/role-profiles.ts ROLE_PROFILE_ERROR_CODES for the role. */
export const USER_ERROR_CODES = {
  /** 404: no user with that id in the org. */
  NOT_FOUND: "USER_NOT_FOUND",
  /** 400: a blank first or last name. */
  NAME_REQUIRED: "USER_NAME_REQUIRED",
  /** 400: a blank or malformed email. */
  EMAIL_INVALID: "USER_EMAIL_INVALID",
  /** 400: another user already has that email (case-insensitive). */
  EMAIL_TAKEN: "USER_EMAIL_TAKEN",
  /** 400: a login status outside active | inactive, or a technician status outside the list. */
  STATUS_INVALID: "USER_STATUS_INVALID",
  /** 409: the acting user cannot turn their own login off. */
  SELF_DEACTIVATE: "USER_SELF_DEACTIVATE",
  /** 409: a user with field history (visits, tickets, crew, preferences, production) stays a technician - mark them Terminated instead. */
  TECHNICIAN_HAS_HISTORY: "TECHNICIAN_HAS_HISTORY",
} as const;
export type UserErrorCode = (typeof USER_ERROR_CODES)[keyof typeof USER_ERROR_CODES];

/** "3 visits, 2 tickets" - the TECHNICIAN_HAS_HISTORY refusal names what keeps the status. */
export function describeTechnicianHistory(counts: { visits: number; services: number; tickets: number; crew: number; preferences: number; production: number }): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(counts.visits, "visit", "visits");
  add(counts.services, "service", "services");
  add(counts.tickets, "ticket", "tickets");
  add(counts.crew, "crew row", "crew rows");
  add(counts.preferences, "customer preference", "customer preferences");
  add(counts.production, "production entry", "production entries");
  return parts.length ? parts.join(", ") : "no history";
}
