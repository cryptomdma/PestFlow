// The service ticket's lifecycle vocabulary and the lockdown rules that read
// it (PLAN_BILLING_V1_1.md D9, built server-side in Pass 16 / C3.1).
//
// One module, read by the server (completeService, updateServiceRecord) and
// the client (the technician view's ticket button), so the field's UI can
// never offer what the route refuses. The rules:
//
//   posted (OFFICE_REVIEW_PENDING | FLAGGED_FOR_REVIEW)
//     locked from the technician. The office may edit it (EDIT_TICKET,
//     support+, every accepted edit logged as `ticket_edited`) or reopen it.
//   REOPENED
//     the office handed it back; the technician re-posts it.
//   FINALIZED
//     immutable. Corrections go through reopen-with-reason (workflow) or a
//     credit memo (money) - never an edit, never a re-post.
//
// `confirmed` / `readyForBilling` are the finalized signals the rest of the
// code already reads (the finalize rollup, the by-appointment read, the
// invoice-flag guard); finalize sets all three and reopen clears all three,
// so any one of them means "reopen first". That also covers the rows
// confirmed by the pre-Phase-1 Service History button, which carry
// `confirmed = true` under an OFFICE_REVIEW_PENDING status.

export const TICKET_STATUSES = ["OFFICE_REVIEW_PENDING", "FLAGGED_FOR_REVIEW", "FINALIZED", "REOPENED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** The columns the lockdown rules read. Satisfied by a ServiceRecord row. */
export interface TicketLockdownFields {
  ticketStatus: string | null;
  confirmed: boolean | null;
  readyForBilling: boolean | null;
}

/** Finalized by the office (D9: immutable until reopened). */
export function isTicketFinalized(record: TicketLockdownFields): boolean {
  return record.ticketStatus === "FINALIZED" || record.confirmed === true || record.readyForBilling === true;
}

/** Posted and awaiting the office (pending or flagged), not yet finalized, not handed back. */
export function isTicketInOfficeReview(record: TicketLockdownFields): boolean {
  if (isTicketFinalized(record)) return false;
  return record.ticketStatus === "OFFICE_REVIEW_PENDING" || record.ticketStatus === "FLAGGED_FOR_REVIEW";
}

/** Handed back by the office: the one posted state a technician may re-post. */
export function isTicketReopened(record: TicketLockdownFields): boolean {
  return !isTicketFinalized(record) && record.ticketStatus === "REOPENED";
}

/**
 * May a technician (POST_SERVICE_TICKET without EDIT_TICKET) post a ticket for
 * this service? No record yet, or a REOPENED one. A ticket in office review
 * belongs to the office until it reopens it; a FINALIZED one to nobody.
 */
export function technicianMayPostTicket(record: TicketLockdownFields | null | undefined): boolean {
  return !record || isTicketReopened(record);
}

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OFFICE_REVIEW_PENDING: "Pending review",
  FLAGGED_FOR_REVIEW: "Flagged for review",
  FINALIZED: "Finalized",
  REOPENED: "Reopened",
};

/** The label for a ticket as it stands, reading the finalized signals first (a legacy confirmed row reads "Finalized"). */
export function describeTicketLifecycle(record: TicketLockdownFields): string {
  if (isTicketFinalized(record)) return TICKET_STATUS_LABELS.FINALIZED;
  return TICKET_STATUS_LABELS[record.ticketStatus as TicketStatus] ?? TICKET_STATUS_LABELS.OFFICE_REVIEW_PENDING;
}
