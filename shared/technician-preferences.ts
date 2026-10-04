// Pass 30 (PLAN_ROADMAP_V2.md C4.4; B14; PLAN_BILLING_V1_1.md D8 "Preferred
// technician"): a customer's standing word about who services them.
//
// One org-scoped table, `technician_preferences`, in the account | location
// scope shape canon §6 / §7 give Flags and Holds (prose there; this is the
// first table built in it): a row is either ACCOUNT-scoped (accountId set -
// "all locations", written by the "Apply to all locations" checkbox on the
// primary location's editor) or LOCATION-scoped (locationId set - the
// per-location editor). One technician has at most one row per scope row
// (partial unique indexes), so a row's kind is the answer for that scope.
//
//   PREFERRED - a soft hint: "Prefers <tech>" on the dispatch queue row and
//               the sheet, a weight for Smart Schedule (Phase 9). Never
//               blocks anything.
//   EXCLUDED  - a hard block on placement (B14's EXCLUDE_TECH: the customer
//               asked that this technician never be sent). Placing or
//               re-assigning the visit to them, or adding them to its crew,
//               is refused 409 TECHNICIAN_EXCLUDED unless a manager overrides
//               with a reason (OVERRIDE_TECHNICIAN_EXCLUSION), which writes
//               one placement_exclusion_overridden audit row.
//
// The resolve rule: for each technician, the LOCATION row wins over the
// ACCOUNT row; without a location row the account row applies (inherited).
// So an EXCLUDED anywhere in scope blocks unless the location's own row
// says PREFERRED - a location may lift an account-wide exclusion, never the
// reverse silently. Smart Schedule (Phase 9) reads the same table and the
// same rule: PREFERRED as a weight, EXCLUDED as a constraint.

export const TECHNICIAN_PREFERENCE_KINDS = ["PREFERRED", "EXCLUDED"] as const;
export type TechnicianPreferenceKind = (typeof TECHNICIAN_PREFERENCE_KINDS)[number];

export const TECHNICIAN_PREFERENCE_SCOPES = ["ACCOUNT", "LOCATION"] as const;
export type TechnicianPreferenceScope = (typeof TECHNICIAN_PREFERENCE_SCOPES)[number];

export const MAX_TECHNICIAN_PREFERENCE_NOTE_LENGTH = 500;
export const MAX_EXCLUSION_OVERRIDE_REASON_LENGTH = 500;

/** The columns the resolve rule reads - a table row satisfies it. */
export interface TechnicianPreferenceFields {
  id: string;
  scopeType: string;
  accountId: string | null;
  locationId: string | null;
  technicianId: string;
  kind: string;
  note: string | null;
}

/** A row as the reads return it: the technician's name beside it. */
export interface TechnicianPreferenceView extends TechnicianPreferenceFields {
  technicianName: string;
  createdByUserId: string | null;
  createdAt: string | Date;
}

/** What applies to one technician at one location after the resolve rule. */
export interface EffectiveTechnicianPreference {
  technicianId: string;
  technicianName: string;
  kind: TechnicianPreferenceKind;
  note: string | null;
  /** The row that decided it. */
  preferenceId: string;
  scopeType: TechnicianPreferenceScope;
  /** True when the row is the account's ("all locations") and the location has none of its own for this technician. */
  inherited: boolean;
}

/** GET /api/locations/:id/technician-preferences. */
export interface LocationTechnicianPreferences {
  locationId: string;
  /** Null when the location is not linked to an account (locations.accountId is nullable) - only location rows then. */
  accountId: string | null;
  /** The primary location carries the "Apply to all locations" checkbox (the account-scoped write). */
  isPrimaryLocation: boolean;
  /** The location's own rows. */
  locationRows: TechnicianPreferenceView[];
  /** The account's rows - "all locations". */
  accountRows: TechnicianPreferenceView[];
  /** The resolve rule applied, one entry per technician, PREFERRED and EXCLUDED alike. */
  effective: EffectiveTechnicianPreference[];
}

/** PUT /api/locations/:id/technician-preferences. */
export interface TechnicianPreferenceSetRequest {
  technicianId: string;
  kind: TechnicianPreferenceKind;
  note?: string | null;
  /** ACCOUNT only from the primary location ("Apply to all locations"). Default LOCATION. */
  scope?: TechnicianPreferenceScope;
}

/** The manager's override of an exclusion, on the placement's body. */
export interface ExclusionOverrideRequest {
  reason: string;
}

export function isTechnicianPreferenceKind(value: unknown): value is TechnicianPreferenceKind {
  return typeof value === "string" && (TECHNICIAN_PREFERENCE_KINDS as readonly string[]).includes(value);
}

/**
 * The resolve rule. `rows` are the location's and its account's rows (any
 * other row is ignored); `names` resolves a technician's display name.
 * One entry per technician: the location's row when it has one, else the
 * account's. Sorted EXCLUDED first, then by name, so a chip row reads the
 * block before the hints.
 */
export function resolveEffectivePreferences(
  rows: TechnicianPreferenceFields[],
  scope: { locationId: string; accountId: string | null },
  names: (technicianId: string) => string,
): EffectiveTechnicianPreference[] {
  const byTechnician = new Map<string, EffectiveTechnicianPreference>();
  const accountRows = rows.filter((row) => row.scopeType === "ACCOUNT" && !!scope.accountId && row.accountId === scope.accountId);
  const locationRows = rows.filter((row) => row.scopeType === "LOCATION" && row.locationId === scope.locationId);
  const apply = (row: TechnicianPreferenceFields, inherited: boolean) => {
    if (!isTechnicianPreferenceKind(row.kind)) return;
    byTechnician.set(row.technicianId, {
      technicianId: row.technicianId,
      technicianName: names(row.technicianId),
      kind: row.kind,
      note: row.note ?? null,
      preferenceId: row.id,
      scopeType: inherited ? "ACCOUNT" : "LOCATION",
      inherited,
    });
  };
  for (const row of accountRows) apply(row, true);
  for (const row of locationRows) apply(row, false);
  return Array.from(byTechnician.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "EXCLUDED" ? -1 : 1;
    return a.technicianName.localeCompare(b.technicianName);
  });
}

/** The exclusion that blocks placing `technicianId`, or null. */
export function findExclusion(effective: EffectiveTechnicianPreference[], technicianId: string | null | undefined): EffectiveTechnicianPreference | null {
  if (!technicianId) return null;
  return effective.find((entry) => entry.technicianId === technicianId && entry.kind === "EXCLUDED") ?? null;
}

export function preferredTechnicians(effective: EffectiveTechnicianPreference[]): EffectiveTechnicianPreference[] {
  return effective.filter((entry) => entry.kind === "PREFERRED");
}

/** The chip's text: "Prefers Austin Lowe" / "Never John Doe". */
export function describePreferenceChip(kind: string, technicianName: string): string {
  return kind === "EXCLUDED" ? `Never ${technicianName}` : `Prefers ${technicianName}`;
}

/** Where a row applies, in words: "all locations" for the account's, "this location" for the location's. */
export function describePreferenceScope(scopeType: string): string {
  return scopeType === "ACCOUNT" ? "all locations" : "this location";
}

/** The chip's title: the note, and where the row comes from. */
export function describePreferenceTitle(entry: { kind: string; technicianName: string; scopeType: string; note: string | null; inherited?: boolean }): string {
  const origin = entry.scopeType === "ACCOUNT"
    ? entry.inherited ? "Set for all locations on the primary location" : "Applies to all locations"
    : "Set for this location";
  return [describePreferenceChip(entry.kind, entry.technicianName), origin, entry.note ? `Note: ${entry.note}` : null].filter(Boolean).join(" - ");
}

/** "Prefers Austin Lowe, John Doe" for the queue row, or null with no PREFERRED entry. */
export function describePreferredHint(effective: EffectiveTechnicianPreference[]): string | null {
  const preferred = preferredTechnicians(effective);
  return preferred.length ? `Prefers ${preferred.map((entry) => entry.technicianName).join(", ")}` : null;
}

/** The 409's message: the technician and the scope, in the office's words. */
export function describeExclusionRefusal(technicianName: string, scopeType: string): string {
  const where = scopeType === "ACCOUNT" ? "at all of this customer's locations" : "at this location";
  return `The customer asked that ${technicianName} never be scheduled ${where}. A manager may override with a reason.`;
}

// Error codes the routes answer with, beside the message.
/** 409: the technician is EXCLUDED at the visit's location (the body names technicianId, preferenceId and scopeType). */
export const TECHNICIAN_EXCLUDED = "TECHNICIAN_EXCLUDED";
/** 403: an override was sent by a role without OVERRIDE_TECHNICIAN_EXCLUSION. */
export const EXCLUSION_OVERRIDE_FORBIDDEN = "EXCLUSION_OVERRIDE_FORBIDDEN";
/** 400: an override was sent without a reason. */
export const EXCLUSION_OVERRIDE_REASON_REQUIRED = "EXCLUSION_OVERRIDE_REASON_REQUIRED";
/** 409: an account-wide row is written ("Apply to all locations") or cleared from the primary location only. */
export const ACCOUNT_SCOPE_PRIMARY_ONLY = "ACCOUNT_SCOPE_PRIMARY_ONLY";
/** 409: the location is not linked to an account, so there is no "all locations" to apply to. */
export const LOCATION_HAS_NO_ACCOUNT = "LOCATION_HAS_NO_ACCOUNT";
/** 404: the technician or the preference row is not this org's / this location's. */
export const TECHNICIAN_NOT_FOUND = "TECHNICIAN_NOT_FOUND";
export const PREFERENCE_NOT_FOUND = "PREFERENCE_NOT_FOUND";

export function describeTechnicianPreferenceRefusal(code: string | null | undefined): string | null {
  switch (code) {
    case EXCLUSION_OVERRIDE_FORBIDDEN:
      return "Only a manager or an admin may schedule a technician the customer excluded.";
    case EXCLUSION_OVERRIDE_REASON_REQUIRED:
      return "Say why the exclusion is being overridden.";
    case ACCOUNT_SCOPE_PRIMARY_ONLY:
      return "A preference for all locations is set and cleared on the primary location.";
    case LOCATION_HAS_NO_ACCOUNT:
      return "This location is not linked to an account, so its preferences apply here only.";
    case TECHNICIAN_NOT_FOUND:
      return "That technician was not found.";
    case PREFERENCE_NOT_FOUND:
      return "That preference was not found at this location.";
    default:
      return null;
  }
}

/**
 * Pass 30b (owner, 2026-10-03): placing or re-assigning a visit to anyone but
 * the customer's PREFERRED technician needs the user's confirmation - 409
 * PREFERENCE_NOT_HONORED until the request carries `acknowledgePreference:
 * true` (any role), recorded as placement_preference_bypassed. A manager's
 * exclusion override covers it (one prompt, the override row names the
 * preference passed over). The crew's SUPPORT technicians are not held to it:
 * a preference names who services the visit, the lead.
 */
export const PREFERENCE_NOT_HONORED = "PREFERENCE_NOT_HONORED";

export function describePreferenceBypass(preferredNames: string[], chosenName: string): string {
  const names = preferredNames.join(" or ");
  return `The customer prefers ${names}. Confirm to schedule ${chosenName} instead.`;
}

/** The 409 body of PREFERENCE_NOT_HONORED. */
export interface PreferenceNotHonoredRefusal {
  code: typeof PREFERENCE_NOT_HONORED;
  message: string;
  technicianId: string;
  technicianName: string;
  preferred: Array<{ technicianId: string; technicianName: string; scopeType: string; note: string | null }>;
}

/** The 409 body a client reads to prompt for an override. */
export interface TechnicianExcludedRefusal {
  code: typeof TECHNICIAN_EXCLUDED;
  message: string;
  technicianId: string;
  technicianName: string;
  preferenceId: string;
  scopeType: TechnicianPreferenceScope;
  note: string | null;
  /** Pass 30b: the preferred technicians the placement passes over, if any - the override covers them too. */
  preferred?: Array<{ technicianId: string; technicianName: string; scopeType: string; note: string | null }>;
}
