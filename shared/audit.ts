// The vocabulary for `audit_logs`, promoted by PLAN_BILLING_V1_1.md D7 from a
// single legacy write path to the system-wide immutable history.
//
// `entity_type` and `action` are plain text columns, so nothing in the database
// stops them drifting the way `appointments.status` did before D1a. These
// unions are the guard: `recordAuditLog()` accepts only these values, so a
// typo or a near-miss synonym is a compile error rather than a row that never
// matches a later query. Passes 3-8 add members here as they write new
// financial mutations - that edit is the point, not a nuisance.

/** Entities that carry an audit trail. Seeded with the two the legacy call site
 *  already writes plus the financial entities named in D7's Phase 1 scope. */
export type AuditEntityType =
  | "customer"
  | "location"
  | "invoice"
  | "invoice_line_item"
  | "service_record"
  | "payment"
  | "credit_memo";

/** One member per mutation in D7's Phase 1 scope list, plus the pre-existing
 *  `update` written by `updateLocationProfile()`. Past tense, snake_case:
 *  an audit row records something that already happened. */
export type AuditAction =
  | "update"
  | "invoice_drafted"
  | "invoice_issued"
  | "invoice_voided"
  | "invoice_line_edited"
  | "credit_memo_issued"
  | "credit_memo_applied"
  | "payment_recorded"
  | "payment_confirmed"
  | "payment_applied"
  | "payment_released"
  | "payment_refunded"
  | "price_overridden"
  | "ticket_reopened"
  | "prefinalization_issue_override";

const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  customer: "Customer",
  location: "Location",
  invoice: "Invoice",
  invoice_line_item: "Invoice line",
  service_record: "Service ticket",
  payment: "Payment",
  credit_memo: "Credit memo",
};

const ACTION_LABELS: Record<AuditAction, string> = {
  update: "Updated",
  invoice_drafted: "Draft invoice created",
  invoice_issued: "Invoice issued",
  invoice_voided: "Invoice voided",
  invoice_line_edited: "Line edited",
  credit_memo_issued: "Credit memo issued",
  credit_memo_applied: "Credit memo applied",
  payment_recorded: "Payment recorded",
  payment_confirmed: "Payment confirmed",
  payment_applied: "Payment applied",
  payment_released: "Payment released",
  payment_refunded: "Payment refunded",
  price_overridden: "Price overridden",
  ticket_reopened: "Ticket reopened",
  prefinalization_issue_override: "Issued before finalization",
};

// Both take plain strings, not the unions: they render rows already in the
// table, which predate these unions and may hold anything.
export function describeAuditEntityType(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType as AuditEntityType] ?? humanize(entityType);
}

export function describeAuditAction(action: string): string {
  return ACTION_LABELS[action as AuditAction] ?? humanize(action);
}

function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value;
}

export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

// Fields excluded from the rendered diff: `id`/`org_id` never change on an
// update, and `updated_at` changes on every one - it would be the only entry on
// a no-op edit and pure noise on a real one, given the row already carries its
// own timestamp.
const DIFF_IGNORED_FIELDS = new Set(["id", "orgId", "org_id", "updatedAt", "updated_at"]);

/**
 * Field-level diff of an audit row's before/after snapshots. `beforeJson` and
 * `afterJson` hold whole rows, so rendering them raw buries the one field that
 * actually changed; this returns just the changed fields, in the order they
 * appear on the record. Returns an empty array when either side isn't a plain
 * object (a create, a delete, or a non-row payload) - the caller falls back to
 * showing the snapshots.
 */
export function diffAuditSnapshots(before: unknown, after: unknown): AuditFieldChange[] {
  if (!isPlainRecord(before) || !isPlainRecord(after)) {
    return [];
  }

  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return fields
    .filter((field) => !DIFF_IGNORED_FIELDS.has(field))
    .filter((field) => !valuesEqual(before[field], after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// JSON round-trips through jsonb, so a structural compare is the honest test -
// two snapshots of the same nested object are different references but equal
// values.
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  return JSON.stringify(a) === JSON.stringify(b);
}
