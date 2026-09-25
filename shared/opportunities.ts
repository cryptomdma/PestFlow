// The opportunity taxonomy (PLAN_BILLING_V1_1.md D8 "Opportunity taxonomy";
// PLAN_ROADMAP_V2.md B7 / C4.1, Pass 25): two axes, not one.
//
// - `categoryKey` is the REASON the opportunity exists. It is a key of the
//   settings-managed `opportunity_categories` list, seeded with the five keys
//   below and no others (owner, second review of 2026-09-19): Settings edits
//   labels, order and the active flag; nothing creates or deletes a key.
// - `workType` says what the work would be if it converts: AGREEMENT or
//   ONE_TIME.
//
// Both are stamped at creation from the row's `source` by taxonomyForSource(),
// which every runtime writer in server/storage.ts and the Pass 25 backfill in
// server/service-scheduling-bootstrap.ts share, so a migrated row and a new
// row of the same source cannot disagree. `opportunityType` (free text) stays
// what it always was - the display label - and is transitional, not an axis.
//
// The assignee (`assignedUserId` / `assignedAt`) is manual in this pass:
// assign, reassign, unassign, and a "My opportunities" view. Auto-assignment
// rules and zones are C4.1b (Pass 26).

export const OPPORTUNITY_WORK_TYPES = ["AGREEMENT", "ONE_TIME"] as const;
export type OpportunityWorkType = (typeof OPPORTUNITY_WORK_TYPES)[number];

export const OPPORTUNITY_WORK_TYPE_LABELS: Record<OpportunityWorkType, string> = {
  AGREEMENT: "Agreement",
  ONE_TIME: "One-time",
};

export function describeOpportunityWorkType(workType: string | null | undefined): string {
  if (!workType) return "";
  return OPPORTUNITY_WORK_TYPE_LABELS[workType as OpportunityWorkType] ?? workType;
}

/** The five category keys, in seed order. The Settings card can rename and reorder them, never add or delete. */
export const OPPORTUNITY_CATEGORY_KEYS = ["NEW_SALE", "SERVICE_DUE", "RESCHEDULE", "WINBACK", "RETENTION"] as const;
export type OpportunityCategoryKey = (typeof OPPORTUNITY_CATEGORY_KEYS)[number];

export const OPPORTUNITY_CATEGORY_SEED: ReadonlyArray<{ key: OpportunityCategoryKey; label: string; sortOrder: number }> = [
  { key: "NEW_SALE", label: "New sale", sortOrder: 10 },
  { key: "SERVICE_DUE", label: "Service due", sortOrder: 20 },
  { key: "RESCHEDULE", label: "Reschedule", sortOrder: 30 },
  { key: "WINBACK", label: "Win-back", sortOrder: 40 },
  { key: "RETENTION", label: "Retention", sortOrder: 50 },
];

export function isOpportunityCategoryKey(value: string): value is OpportunityCategoryKey {
  return (OPPORTUNITY_CATEGORY_KEYS as ReadonlyArray<string>).includes(value);
}

/** The label the org gave a key, else the seed label, else the key itself (a row from before a rename, or an unknown key). */
export function describeOpportunityCategory(
  key: string | null | undefined,
  categories?: ReadonlyArray<{ key: string; label: string }> | null,
): string {
  if (!key) return "";
  const configured = categories?.find((category) => category.key === key);
  if (configured) return configured.label;
  return OPPORTUNITY_CATEGORY_SEED.find((seed) => seed.key === key)?.label ?? key;
}

// The sources storage writes. AGREEMENT_INITIAL is in the list because the
// decision record (D8, C4.1) counts it among the six; note that today it is
// stamped only on appointments.source / services.source - no writer puts it
// on an opportunity - so the mapping below is for completeness, not for any
// row that exists. APPOINTMENT_CANCELLATION_WINBACK (Pass 27, C4.2) is the
// seventh: the office cancelled an appointment and a one-time service with
// it, so the work is lost unless the customer is won back - distinct from
// APPOINTMENT_CANCELLATION_REVIEW, where the service went back to the queue.
export const OPPORTUNITY_SOURCES = [
  "AGREEMENT_CONTACT_REQUIRED",
  "AGREEMENT_INITIAL",
  "AGREEMENT_CANCELLATION_RETENTION",
  "APPOINTMENT_RESCHEDULE_REQUIRED",
  "APPOINTMENT_CANCELLATION_REVIEW",
  "APPOINTMENT_CANCELLATION_WINBACK",
  "NON_CONTRACT_FOLLOW_UP",
] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_SOURCE_LABELS: Record<OpportunitySource, string> = {
  AGREEMENT_CONTACT_REQUIRED: "Agreement contact required",
  AGREEMENT_INITIAL: "Agreement initial service",
  AGREEMENT_CANCELLATION_RETENTION: "Agreement cancellation",
  APPOINTMENT_RESCHEDULE_REQUIRED: "Reschedule requested",
  APPOINTMENT_CANCELLATION_REVIEW: "Canceled appointment review",
  APPOINTMENT_CANCELLATION_WINBACK: "Cancelled service win-back",
  NON_CONTRACT_FOLLOW_UP: "Service follow-up",
};

export function describeOpportunitySource(source: string | null | undefined): string {
  if (!source) return "";
  return OPPORTUNITY_SOURCE_LABELS[source as OpportunitySource] ?? source.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export interface OpportunityTaxonomy {
  categoryKey: OpportunityCategoryKey;
  workType: OpportunityWorkType;
  /** False when the source is none of the six: the row got the fallback (SERVICE_DUE, work type by agreement) and the migration says so. */
  mapped: boolean;
}

/**
 * The category and work type a source implies, decided once here for the
 * runtime writers and the backfill alike (C4.1's mapping):
 *
 *   AGREEMENT_CONTACT_REQUIRED       -> SERVICE_DUE / AGREEMENT
 *   AGREEMENT_INITIAL                -> NEW_SALE    / AGREEMENT
 *   AGREEMENT_CANCELLATION_RETENTION -> RETENTION   / AGREEMENT
 *   APPOINTMENT_RESCHEDULE_REQUIRED  -> RESCHEDULE  / by the source service's agreement
 *   APPOINTMENT_CANCELLATION_REVIEW  -> RESCHEDULE  / by the source service's agreement
 *   APPOINTMENT_CANCELLATION_WINBACK -> WINBACK     / by the source service's agreement (ONE_TIME in practice:
 *                                                     the disposition never cancels an agreement service)
 *   NON_CONTRACT_FOLLOW_UP           -> SERVICE_DUE / ONE_TIME
 *
 * WINBACK's one automatic source is the cancel flow (Pass 27, C4.2): the
 * office cancelling a one-time service off an appointment. `hasAgreement` is
 * whether the opportunity (or its source service) carries an agreement id; it
 * decides the work type only where the source does not.
 */
export function taxonomyForSource(source: string | null | undefined, hasAgreement: boolean): OpportunityTaxonomy {
  switch (source) {
    case "AGREEMENT_CONTACT_REQUIRED":
      return { categoryKey: "SERVICE_DUE", workType: "AGREEMENT", mapped: true };
    case "AGREEMENT_INITIAL":
      return { categoryKey: "NEW_SALE", workType: "AGREEMENT", mapped: true };
    case "AGREEMENT_CANCELLATION_RETENTION":
      return { categoryKey: "RETENTION", workType: "AGREEMENT", mapped: true };
    case "APPOINTMENT_RESCHEDULE_REQUIRED":
    case "APPOINTMENT_CANCELLATION_REVIEW":
      return { categoryKey: "RESCHEDULE", workType: hasAgreement ? "AGREEMENT" : "ONE_TIME", mapped: true };
    case "APPOINTMENT_CANCELLATION_WINBACK":
      return { categoryKey: "WINBACK", workType: hasAgreement ? "AGREEMENT" : "ONE_TIME", mapped: true };
    case "NON_CONTRACT_FOLLOW_UP":
      return { categoryKey: "SERVICE_DUE", workType: "ONE_TIME", mapped: true };
    default:
      return { categoryKey: "SERVICE_DUE", workType: hasAgreement ? "AGREEMENT" : "ONE_TIME", mapped: false };
  }
}

export const OPPORTUNITY_STATUSES = ["OPEN", "CONTACTED", "CONVERTED", "DISMISSED"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

// The assignee filter's two reserved values on GET /api/opportunities. The
// route resolves "me" to the session user before storage sees it; storage
// takes a user id or null (unassigned).
export const OPPORTUNITY_ASSIGNEE_ME = "me";
export const OPPORTUNITY_ASSIGNEE_UNASSIGNED = "unassigned";
