// The vocabulary for `audit_logs`, promoted by PLAN_BILLING_V1_1.md D7 from a
// single legacy write path to the system-wide immutable history.
//
// `entity_type` and `action` are plain text columns, so nothing in the database
// stops them drifting the way `appointments.status` did before D1a. These
// unions are the guard: the writer (server/storage.ts recordAuditLogTx) accepts
// only these values, so a typo or a near-miss synonym is a compile error rather
// than a row that never matches a later query. Passes 3-8 added members here as
// they wrote new financial mutations, Pass 32 the non-financial ones - that
// edit is the point, not a nuisance.

/** Entities that carry an audit trail. Seeded with the two the legacy call site
 *  already writes plus the financial entities named in D7's Phase 1 scope.
 *  `service` joined in Pass 8: a field price override mutates the Service's
 *  own `priceCents` (the ticket only reads it), so that is the row the
 *  before/after snapshot has to be of. `agreement` joined in Pass 12 for
 *  sale-credit changes (`soldByUserId`, an `update`); the rest of an
 *  agreement's mutations joined in Pass 32 (C5.1a).
 *  `opportunity` joined in Pass 25 (C4.1) for the assignee, category and
 *  work-type changes the PATCH makes - an `update` naming the users before
 *  and after; dispositions and conversion keep their own activity trail.
 *  `appointment` joined in Pass 27 (C4.2) for the cancel / reschedule
 *  disposition: one row per disposition with the appointment and its
 *  services before and after and what was done about follow-up.
 *  `contact`, `billing_profile`, `billing_profile_template` and
 *  `agreement_template` joined in Pass 32 (C5.1a, D7's non-financial
 *  follow-up), when every create / update / status change of a customer,
 *  location, contact, billing profile (the instance and the org template),
 *  agreement, agreement template, appointment and service started writing a
 *  row. There is no `account` member (decided): canon has no account
 *  history; what the account carries moves with the location invariant
 *  (primaryLocationId is the primary flag on the locations, logged there)
 *  or sits on the customer (Pass 30's account-scoped preferences).
 *  `agreement_type` joined in Pass 35 (C5.3): the settings-managed list an
 *  agreement's type is chosen from - a type created, edited, retired or
 *  merged into another writes its own row (the first reference list with a
 *  trail; opportunity categories, zones and service types still have none).
 *  Org-wide, no location: read by entityType + entityId like the templates';
 *  never revertable (REVERTABLE_AUDIT_ENTITY_TYPES leaves it out - a merge
 *  is undone by hand, a rename by renaming).
 *  `role_profile` and `user` joined in Pass 37 (C5.6): a role profile
 *  created (a clone's row names its source under `clonedFrom`), edited or
 *  made inactive writes `created` / `update` with the permission list in
 *  both snapshots (declaration order, so the diff names what moved); a
 *  user's profile assignment writes `update` on the user with `role` before
 *  and after - the first `user` rows; the snapshot never carries the
 *  password hash. Org-wide like the types; neither is revertable - a
 *  permission change is undone by hand on the Roles card.
 *  `app_setting` joined in Pass 39 (C5.8): every `app_settings` write (the
 *  nine storage setters behind PATCH /api/settings/*) records `update` on
 *  the setting's KEY as the entityId, the snapshots { key, value } with the
 *  stored text before and after (null when the row did not exist, or when
 *  the write deleted it - a cleared billing default), and nothing when the
 *  value did not move. Org-wide, no location; read by entityType alone
 *  (GET /api/audit-logs?entityType=app_setting) for the Settings page's
 *  "Recent settings changes" list; never revertable - a setting is put back
 *  by setting it (shared/app-settings.ts labels the keys).
 *  `payment_method` and `payment_provider_account` joined in Pass 40 (C6.1):
 *  a card on file stored (`created`), made the default or demoted
 *  (`update` on isDefault) or removed (`status_changed`), and the org's
 *  provider account connected (`created`), re-keyed or re-moded (`update`)
 *  or disconnected (`status_changed`). The snapshots are DISPLAY fields -
 *  brand, last four, expiry, default, status, test flag for a card;
 *  provider, mode, publishable key, connected account, status and a short
 *  fingerprint of each secret for the account - never a provider id, never
 *  a key (shared/payment-methods.ts). A card's rows sit with its account on
 *  the customer-level History (and on the location it was noted against);
 *  the provider account's rows are org-wide, read by entityType alone for
 *  the Settings Payments card. Neither is revertable: a card is removed and
 *  re-added through the provider, a provider is reconnected by hand. */
export type AuditEntityType =
  | "customer"
  | "location"
  | "contact"
  | "billing_profile"
  | "billing_profile_template"
  | "invoice"
  | "invoice_line_item"
  | "service"
  | "service_record"
  | "payment"
  | "credit_memo"
  | "agreement"
  | "agreement_template"
  | "agreement_type"
  | "opportunity"
  | "appointment"
  | "role_profile"
  | "user"
  | "app_setting"
  | "payment_method"
  | "payment_provider_account";

/** One member per mutation in D7's Phase 1 scope list, plus the pre-existing
 *  `update` written by `updateLocationProfile()` (and, since Pass 8, by
 *  `updateInvoice()` for an invoice's notes / due date). Past tense,
 *  snake_case: an audit row records something that already happened.
 *  `invoice_line_edited` has no writer: nothing edits an invoice line in
 *  place - lines are written once at draft / issue and re-priced from the
 *  tickets on issue - so it stays reserved for the day a line editor exists.
 *  `ticket_edited` (Pass 16, D9): a posted ticket changed after posting - the
 *  office's PATCH, or a re-post over an existing record (a technician's on a
 *  REOPENED ticket, the office's on one in review). The snapshots are the
 *  ticket row plus its product applications, so the materials diff too.
 *  `appointment_cancelled` / `appointment_rescheduled` (Pass 27, C4.2): the
 *  two modes of the one disposition path - the same CANCELED row shape, the
 *  flag telling them apart, the services requeued or cancelled and the
 *  opportunity choice in the after snapshot's `disposition`.
 *  `surcharge_recorded` (Pass 23, C3.6): the field surcharge line on a ticket
 *  was recorded, changed or removed by a post or an office edit - a money
 *  mutation of its own beside the content's `ticket_edited`. The snapshots
 *  are the two surcharge fields only ({ surchargeCents, surchargeLabel }),
 *  both null before a first post, so the diff shows exactly what moved.
 *  `work_kind_changed` (Pass 24, C3.7): a Service's work kind or its callback
 *  link changed after creation (PATCH /api/services/:id) - it decides whether
 *  the visit's line is $0 and what the ledger credits, so it is a money
 *  mutation (D7). The snapshots are { workKind, answersServiceId } before and
 *  after; a creation writes nothing (the row is its own record).
 *  `opportunity_auto_assigned` (Pass 26, C4.1b): an assignment rule stamped a
 *  new opportunity's assignee at creation (server/storage.ts
 *  insertOpportunityTx). Written under the system actor (canon §17: a null
 *  actor is a system-driven write), with the same snapshot shape as the
 *  manual `update` - the assignee (id and name), when, the rule (id and its
 *  description) and the two axes - so the History tab tells a rule's
 *  assignment from a person's, and a later manual reassignment reads as a
 *  person overriding a rule (assignedByRuleId going to null).
 *  `service_cancelled` (Pass 28, C4.3a): ONE service cancelled outright
 *  through POST /api/services/:id/cancel - placed or pending - with the
 *  disposition's semantics: a reason from the settings list, a one-time
 *  service CANCELLED and taken off its visit, an agreement service recycled
 *  with its window reset, the opportunity choice. The snapshots are the
 *  service row before and after, the after carrying `cancel` (reason, notes,
 *  effect, the visit it came off, the opportunities created or re-dated).
 *  `appointment_composition_changed` (Pass 28, C4.3a): a service was added
 *  to a visit, returned to the queue, re-typed or re-timed, or the visit's
 *  instructions (appointments.notes) changed - one row per request, the
 *  appointment and its services before and after (appointmentAuditSnapshot,
 *  which since this pass carries notes, scheduledEndDate and each service's
 *  type, duration and kind), the after carrying `composition` (the action,
 *  the service, what moved, how far the planned end grew). Since Pass 29
 *  (C4.3b) an ADD's `composition` also carries `origin` (OFFICE | FIELD),
 *  `flagged` (a FIELD add is flagged for office review) and `nextStop` (the
 *  technician's next stop the add was measured against, when there was one).
 *  `field_service_reviewed` (Pass 29, C4.3b): the office marked a service a
 *  technician added from the field as reviewed (POST /api/services/:id/
 *  field-review, FINALIZE_TICKET). The snapshots are the four field columns
 *  ({ addedInFieldByUserId, fieldReviewedAt, fieldReviewedByUserId,
 *  fieldReviewedByLabel }) before and after; the add itself is recorded by
 *  the visit's appointment_composition_changed row.
 *  `technician_preference_set` / `technician_preference_cleared` (Pass 30,
 *  C4.4): a customer's PREFERRED / EXCLUDED technician was set (created or
 *  changed) or cleared. A LOCATION row is recorded on the `location`, an
 *  ACCOUNT row ("all locations") on the account's `customer` (every location's
 *  History tab carries its customer). The snapshots are the preference row
 *  with the technician's name; a set's before is the row it replaced, if any.
 *  `placement_exclusion_overridden` (Pass 30): a manager placed, re-assigned
 *  or crewed a visit with a technician the customer EXCLUDED
 *  (OVERRIDE_TECHNICIAN_EXCLUSION). On the `appointment`; the after carries
 *  the technician, the reason, `via` (CREATE | UPDATE | CREW_ADD) and the
 *  preference row that excluded them.
 *  `appointment_crew_changed` (Pass 30): a SUPPORT technician was added to or
 *  removed from a visit's crew (appointment_technicians). On the
 *  `appointment`; the crew before and after, the after carrying `change`
 *  (ADD | REMOVE, the technician, the role). The LEAD follows the visit's
 *  technician silently; the technician change itself is the appointment's
 *  `update` row since Pass 32.
 *  `placement_preference_bypassed` (Pass 30b, owner 2026-10-03): a visit was
 *  placed or re-assigned to someone other than the customer's PREFERRED
 *  technician after the user confirmed the prompt (`acknowledgePreference`).
 *  On the `appointment`; the after carries the technician chosen, `via`
 *  (CREATE | UPDATE) and the preferred technicians passed over. A crew ADD
 *  confirmed over a schedule conflict records `conflictsAcknowledged` in its
 *  appointment_crew_changed row.
 *  `created` / `status_changed` / `deleted` (Pass 32, C5.1a): the three
 *  generic rows every non-financial entity writes, the entity type carrying
 *  the noun. A create has no before; a delete (deleteService's hard delete,
 *  and the visit it takes with its last service) has no after. A change
 *  writes `status_changed` when the row's `status` moved and the existing
 *  `update` otherwise (one member for "updated", not a second spelling of
 *  it), and nothing at all when the diff below would be empty - a form that
 *  sends the row back unchanged leaves no trace (auditChangeAction). The
 *  snapshots are the whole row for the simple entities (customer, location,
 *  contact, the billing profiles, the templates, the agreement with its
 *  sold-by user named) and the curated serviceAuditSnapshot /
 *  appointmentAuditSnapshot for the two scheduling entities. A write the
 *  server derives from an agreement's own schedule - the generated service,
 *  the recurrence advancing nextServiceDate, the billing run's
 *  nextBillingDate - is signed by the system actor ("System"); everything a
 *  request causes is signed by that request's user.
 *  `reverted` (Pass 33, C5.1b; PLAN_BILLING_V1_1.md D7, B21): a manager put
 *  the fields an earlier row changed back to that row's `before` values -
 *  a NEW forward change through the entity's own write path (updateCustomer,
 *  updateLocation, updateContact, the billing profile and template writers,
 *  updateAgreement), never a rollback of the log. The entity's write path
 *  writes this row INSTEAD of its generic `update` / `status_changed` (one
 *  row per revert), with the same whole-row snapshots, the after carrying
 *  `reverted` = { auditLogId, action, createdAt, actorLabel } naming the
 *  source row (extractAuditRevertedRef; the key is on the diff's ignore list
 *  so it never reads as a field change). Which rows may be reverted is
 *  describeAuditRevertability below; who may is REVERT_HISTORY
 *  (shared/permissions.ts - the built-in manager and admin profiles hold it;
 *  since Pass 37 any profile the office gives it to does).
 *  `agreement_type_merged` (Pass 35, C5.3): one agreement type was merged
 *  into another from Settings (POST /api/agreement-types/:id/merge) - the
 *  source type's own row, before = the source as it was, after = the source
 *  retired plus `merge` { intoId, intoKey, intoLabel, agreementsMoved,
 *  templatesMoved }. Each agreement and template that moved gets its own
 *  `update` row in the same transaction (the type key as a field change),
 *  so a location's History shows the move on the agreement itself. */
export type AuditAction =
  | "update"
  | "created"
  | "status_changed"
  | "deleted"
  | "reverted"
  | "invoice_drafted"
  | "invoice_issued"
  | "invoice_voided"
  | "invoice_line_edited"
  | "credit_memo_issued"
  | "credit_memo_applied"
  | "credit_memo_released"
  | "credit_memo_voided"
  | "payment_recorded"
  | "payment_confirmed"
  | "payment_applied"
  | "payment_released"
  | "payment_refunded"
  | "payment_voided"
  | "price_overridden"
  | "ticket_reopened"
  | "ticket_edited"
  | "prefinalization_issue_override"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "surcharge_recorded"
  | "work_kind_changed"
  | "opportunity_auto_assigned"
  | "service_cancelled"
  | "appointment_composition_changed"
  | "field_service_reviewed"
  | "technician_preference_set"
  | "technician_preference_cleared"
  | "placement_exclusion_overridden"
  | "appointment_crew_changed"
  | "placement_preference_bypassed"
  | "agreement_type_merged";

const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  customer: "Customer",
  location: "Location",
  contact: "Contact",
  billing_profile: "Billing profile",
  billing_profile_template: "Billing profile template",
  invoice: "Invoice",
  invoice_line_item: "Invoice line",
  service: "Service",
  service_record: "Service ticket",
  payment: "Payment",
  credit_memo: "Credit memo",
  agreement: "Agreement",
  agreement_template: "Agreement template",
  agreement_type: "Agreement type",
  opportunity: "Opportunity",
  appointment: "Appointment",
  role_profile: "Role profile",
  user: "User",
  app_setting: "Setting",
  payment_method: "Card on file",
  payment_provider_account: "Payment provider",
};

const ACTION_LABELS: Record<AuditAction, string> = {
  update: "Updated",
  created: "Created",
  status_changed: "Status changed",
  deleted: "Deleted",
  reverted: "Reverted",
  invoice_drafted: "Draft invoice created",
  invoice_issued: "Invoice issued",
  invoice_voided: "Invoice voided",
  invoice_line_edited: "Line edited",
  credit_memo_issued: "Credit memo issued",
  credit_memo_applied: "Credit memo applied",
  credit_memo_released: "Credit memo released",
  credit_memo_voided: "Credit memo voided",
  payment_recorded: "Payment recorded",
  payment_confirmed: "Payment confirmed",
  payment_applied: "Payment applied",
  payment_released: "Payment released",
  payment_refunded: "Payment refunded",
  payment_voided: "Payment voided",
  price_overridden: "Price overridden",
  ticket_reopened: "Ticket reopened",
  ticket_edited: "Ticket edited",
  prefinalization_issue_override: "Issued before finalization",
  appointment_cancelled: "Appointment cancelled",
  appointment_rescheduled: "Appointment rescheduled",
  surcharge_recorded: "Surcharge recorded",
  work_kind_changed: "Work kind changed",
  opportunity_auto_assigned: "Auto-assigned by rule",
  service_cancelled: "Service cancelled",
  appointment_composition_changed: "Visit services changed",
  field_service_reviewed: "Field-added service reviewed",
  technician_preference_set: "Technician preference set",
  technician_preference_cleared: "Technician preference cleared",
  placement_exclusion_overridden: "Excluded technician scheduled (override)",
  appointment_crew_changed: "Crew changed",
  placement_preference_bypassed: "Preferred technician passed over (confirmed)",
  agreement_type_merged: "Agreement type merged",
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
// own timestamp. Pass 32: `updatedByUserId` likewise - the agreement writers
// stamp it with the session user on every save (D7: "single last-actor stamps
// remain for display; the log is the truth"), so it would turn a no-op save by
// a different user into a row of its own. Pass 33: `reverted` is the marker a
// `reverted` row's after snapshot carries (the source row it put back) - not
// a column, rendered by the card as its own line above the diff, never as a
// field change; and the server's stale check skips it the same way.
/** The key on a `reverted` row's after snapshot that names the source row. */
export const AUDIT_REVERTED_MARKER = "reverted";

// The read's clamp (server/storage.ts clampAuditLogLimit): a caller may ask
// for up to this many rows per read. Pass 33: the customer-level History asks
// for the maximum and says so when it got exactly that many - paging is a
// later pass.
export const AUDIT_LOG_DEFAULT_LIMIT = 100;
export const AUDIT_LOG_MAX_LIMIT = 500;
const DIFF_IGNORED_FIELDS = new Set(["id", "orgId", "org_id", "updatedAt", "updated_at", "updatedByUserId", "updated_by_user_id", AUDIT_REVERTED_MARKER]);

/**
 * Field-level diff of an audit row's before/after snapshots. `beforeJson` and
 * `afterJson` hold whole rows, so rendering them raw buries the one field that
 * actually changed; this returns just the changed fields, in the order they
 * appear on the record. Returns an empty array when either side isn't a plain
 * object (a create, a delete, or a non-row payload); the card then prints
 * "Recorded with no field-level differences" - rendering a one-sided row's
 * snapshot is C5.1b's, with the rest of the History surface.
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

/**
 * Pass 32 (C5.1a): what a generic change row's action is - `status_changed`
 * when the row's `status` moved, `update` when anything else the diff shows
 * did, null when nothing did (the writer then writes no row at all). The
 * diff's own ignore list applies, so a save that only re-stamped updatedAt or
 * updatedByUserId is nothing. Shared with the server so the writer and the
 * History tab agree on what counts as a change.
 */
export function auditChangeAction(before: unknown, after: unknown): "update" | "status_changed" | null {
  const changes = diffAuditSnapshots(before, after);
  if (!changes.length) return null;
  return changes.some((change) => change.field === "status") ? "status_changed" : "update";
}

export function auditSnapshotsDiffer(before: unknown, after: unknown): boolean {
  return diffAuditSnapshots(before, after).length > 0;
}

/**
 * Pass 33 (C5.1b): the fields of `expected` (a snapshot, or the slice of one)
 * whose value on `current` (the entity's row now) differs - the ignore list
 * applies. The server's stale check: a revert puts back the fields its source
 * row changed, so those fields must still hold the values that row left them
 * with; any that moved since are named in the 409 HISTORY_STALE so the user
 * reverts the newer change first (a revert is a forward change from the state
 * the user saw). Also what the client would need to tell staleness, had it the
 * current row.
 */
export function auditSnapshotDrift(expected: unknown, current: unknown): string[] {
  if (!isPlainRecord(expected) || !isPlainRecord(current)) {
    return [];
  }
  return Object.keys(expected)
    .filter((field) => !DIFF_IGNORED_FIELDS.has(field))
    .filter((field) => !valuesEqual(expected[field], current[field]));
}

/** The source row a `reverted` row names, read off its after snapshot. */
export interface AuditRevertedRef {
  auditLogId: string;
  action: string;
  createdAt: string;
  actorLabel: string | null;
}

export function extractAuditRevertedRef(after: unknown): AuditRevertedRef | null {
  if (!isPlainRecord(after)) return null;
  const marker = after[AUDIT_REVERTED_MARKER];
  if (!isPlainRecord(marker) || typeof marker.auditLogId !== "string" || typeof marker.action !== "string") return null;
  return {
    auditLogId: marker.auditLogId,
    action: marker.action,
    createdAt: typeof marker.createdAt === "string" ? marker.createdAt : "",
    actorLabel: typeof marker.actorLabel === "string" ? marker.actorLabel : null,
  };
}

// Pass 33 (C5.1b): which rows Revert may act on, decided here once so the
// History surfaces show the button exactly where the server would accept
// the request (the server re-runs this and adds the checks that need the
// database: the entity still exists, the fields are not stale, the write
// path's own refusals). Revertable: a generic change row - `update`,
// `status_changed`, or an earlier `reverted` (a revert is a forward change,
// so reverting it is another) - of an entity whose whole row goes through a
// plain update: customer, location, contact, billing profile, the two org
// templates, agreement. Not revertable, each with its code:
//   - `created` (the inverse is a delete) and `deleted` (the inverse is a
//     re-create with the old id) - out of scope, decided;
//   - the financial entities (invoice, line, payment, credit memo, ticket) -
//     D7: a money correction is a void and a re-entry, never a revert;
//   - service, appointment and opportunity rows - their snapshots are
//     curated subsets and their lifecycle moves are refused by the PATCHes
//     (a cancel needs the disposition, a type change is locked...);
//   - every special action (the preference set / clear, the placement
//     overrides, the crew change...) - their write paths are their own;
//   - an agreement's cancellation (the `status_changed` whose after is
//     CANCELLED): the cancel is a workflow that cancelled visits and services
//     with it; the agreement comes back as a new agreement, not a revert;
//   - a location made non-primary (before.isPrimary false): the account's
//     invariant would re-promote something at once - revert the other
//     location's row instead, the one that was primary before.
export const REVERTABLE_AUDIT_ENTITY_TYPES = [
  "customer",
  "location",
  "contact",
  "billing_profile",
  "billing_profile_template",
  "agreement_template",
  "agreement",
] as const satisfies readonly AuditEntityType[];
export type RevertableAuditEntityType = (typeof REVERTABLE_AUDIT_ENTITY_TYPES)[number];

export const REVERTABLE_AUDIT_ACTIONS = ["update", "status_changed", "reverted"] as const satisfies readonly AuditAction[];

export const FINANCIAL_AUDIT_ENTITY_TYPES = ["invoice", "invoice_line_item", "payment", "credit_memo", "service_record"] as const satisfies readonly AuditEntityType[];

export const HISTORY_REVERT_CODES = {
  ROW_NOT_FOUND: "HISTORY_ROW_NOT_FOUND",
  CREATED_NOT_REVERTABLE: "HISTORY_CREATED_NOT_REVERTABLE",
  DELETED_NOT_REVERTABLE: "HISTORY_DELETED_NOT_REVERTABLE",
  FINANCIAL_NOT_REVERTABLE: "HISTORY_FINANCIAL_NOT_REVERTABLE",
  ENTITY_NOT_REVERTABLE: "HISTORY_ENTITY_NOT_REVERTABLE",
  ACTION_NOT_REVERTABLE: "HISTORY_ACTION_NOT_REVERTABLE",
  CANCELLATION_NOT_REVERTABLE: "HISTORY_CANCELLATION_NOT_REVERTABLE",
  PRIMARY_NOT_REVERTABLE: "HISTORY_PRIMARY_NOT_REVERTABLE",
  SNAPSHOT_NOT_REVERTABLE: "HISTORY_SNAPSHOT_NOT_REVERTABLE",
  ENTITY_GONE: "HISTORY_ENTITY_GONE",
  NOTHING_TO_REVERT: "HISTORY_NOTHING_TO_REVERT",
  STALE: "HISTORY_STALE",
} as const;
export type HistoryRevertCode = (typeof HISTORY_REVERT_CODES)[keyof typeof HISTORY_REVERT_CODES];

export type AuditRevertability =
  | { revertable: true; entityType: RevertableAuditEntityType; fields: string[] }
  | { revertable: false; code: HistoryRevertCode; reason: string };

export function isRevertableAuditEntityType(entityType: string): entityType is RevertableAuditEntityType {
  return (REVERTABLE_AUDIT_ENTITY_TYPES as readonly string[]).includes(entityType);
}

/** The pure half of "may this row be reverted" - the row alone, no database. */
export function describeAuditRevertability(row: { entityType: string; action: string; beforeJson: unknown; afterJson: unknown }): AuditRevertability {
  if (row.action === "created") {
    return { revertable: false, code: HISTORY_REVERT_CODES.CREATED_NOT_REVERTABLE, reason: "A creation is not reverted; the inverse would be a delete." };
  }
  if (row.action === "deleted") {
    return { revertable: false, code: HISTORY_REVERT_CODES.DELETED_NOT_REVERTABLE, reason: "A deletion is not reverted; the inverse would re-create the record." };
  }
  if ((FINANCIAL_AUDIT_ENTITY_TYPES as readonly string[]).includes(row.entityType)) {
    return { revertable: false, code: HISTORY_REVERT_CODES.FINANCIAL_NOT_REVERTABLE, reason: "Financial records are corrected by a void and a re-entry, never a revert." };
  }
  if (!isRevertableAuditEntityType(row.entityType)) {
    return { revertable: false, code: HISTORY_REVERT_CODES.ENTITY_NOT_REVERTABLE, reason: `A ${describeAuditEntityType(row.entityType).toLowerCase()} change is reverted through its own workflow, not from History.` };
  }
  if (!(REVERTABLE_AUDIT_ACTIONS as readonly string[]).includes(row.action)) {
    return { revertable: false, code: HISTORY_REVERT_CODES.ACTION_NOT_REVERTABLE, reason: `"${describeAuditAction(row.action)}" is reverted through its own workflow, not from History.` };
  }
  if (!isPlainRecord(row.beforeJson) || !isPlainRecord(row.afterJson)) {
    return { revertable: false, code: HISTORY_REVERT_CODES.SNAPSHOT_NOT_REVERTABLE, reason: "This row has no before and after to put back." };
  }
  if (row.entityType === "agreement" && row.afterJson.status === "CANCELLED" && row.beforeJson.status !== "CANCELLED") {
    return { revertable: false, code: HISTORY_REVERT_CODES.CANCELLATION_NOT_REVERTABLE, reason: "An agreement cancellation is not reverted; its visits and services were cancelled with it. Create a new agreement instead." };
  }
  const fields = diffAuditSnapshots(row.beforeJson, row.afterJson).map((change) => change.field);
  if (row.entityType === "location" && fields.includes("isPrimary") && row.beforeJson.isPrimary === false) {
    return { revertable: false, code: HISTORY_REVERT_CODES.PRIMARY_NOT_REVERTABLE, reason: "A location is not made non-primary by a revert; revert the row of the location that was primary before." };
  }
  if (!fields.length) {
    return { revertable: false, code: HISTORY_REVERT_CODES.NOTHING_TO_REVERT, reason: "This row changed nothing the diff shows." };
  }
  return { revertable: true, entityType: row.entityType, fields };
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
