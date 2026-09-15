// PLAN_BILLING_V1_1.md D6: what the field sees about money on a visit.
//
// Price / COA applied / Due today, per service and summed for the visit, with
// each service's billing designation. Resolved on the SERVER
// (getVisitBillingSummary in server/storage.ts) through the same
// resolveServiceLineBillingTx that prices the visit invoice, so the tech
// ticket, the appointment details and the invoice can never disagree about
// what a visit costs or whether the agreement covers it. The client renders
// this shape and derives nothing from agreementId or the plan on its own.
//
// COA (cash on account) is PAYMENT APPLICATION. Nothing here changes a price:
// priceCents is the line amount the invoice carries (or will carry), and the
// COA figures only reduce what is left to collect.

/**
 * BILLABLE: the visit is the billing event - collect today (COD, a per-visit
 *   plan, a chargeable callback, or no plan at all).
 * PRODUCTION: agreement-covered - the customer pays on the plan's schedule
 *   (or the callback is warranty work), the line is $0 and nothing is due
 *   today. The technician still earns production value for the work; that
 *   ledger is untouched by this display.
 */
export type ServiceBillingDesignation = "BILLABLE" | "PRODUCTION";

export interface VisitServiceBilling {
  serviceId: string;
  serviceRecordId: string | null;
  serviceTypeName: string;
  agreementId: string | null;
  designation: ServiceBillingDesignation;
  /**
   * The line amount before tax: the invoice line if the visit is invoiced,
   * otherwise what generation would price right now. 0 for PRODUCTION. Null
   * when it cannot be resolved (a price-less service, a plan-less price-less
   * agreement) - `note` says why, exactly as generation would refuse.
   */
  priceCents: number | null;
  /** Tax on the line: frozen on the invoice, or the tax engine's current answer before one exists. */
  taxCents: number;
  /**
   * COA counted against this line. Once the visit is invoiced this is the
   * invoice's unreleased applications (confirmed AND pending confirmation -
   * a check the office has not cleared yet is still not money to collect
   * twice), allotted to lines in invoice order. Before an invoice exists it
   * is 0: nothing has been applied to anything.
   */
  coaAppliedCents: number;
  /**
   * Before the visit is invoiced: the location's unapplied balance this line
   * could draw on at invoicing, in D4's order (money designated to this
   * visit's agreement first, then undesignated; money designated to another
   * agreement never). Intent, not fact - the office applies it when the visit
   * is invoiced. 0 once an invoice exists, because then the applications are
   * the fact.
   */
  coaAvailableCents: number;
  /** price + tax - coaApplied - coaAvailable, never negative; null when price is null. */
  dueTodayCents: number | null;
  /** "covered by agreement", "callback", "warranty callback - no charge", or the refusal reason when price is null. */
  note: string | null;
}

export interface VisitBillingInvoiceRef {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
}

export interface VisitBillingSummary {
  appointmentId: string;
  locationId: string | null;
  /** The non-void invoice anchored on this visit (a DRAFT included), if any. */
  invoice: VisitBillingInvoiceRef | null;
  /**
   * True when `invoice` is issued (OPEN / PARTIALLY_PAID / PAID): the figures
   * are frozen invoice lines and applications of record. False for a DRAFT
   * or no invoice: the figures are what generation would produce now.
   */
  invoiced: boolean;
  services: VisitServiceBilling[];
  totals: {
    priceCents: number;
    taxCents: number;
    coaAppliedCents: number;
    /** The part of coaAppliedCents that is still PENDING confirmation. */
    coaPendingCents: number;
    coaAvailableCents: number;
    /** The sum of due-today amounts - the one number appointment details shows (D6). */
    dueTodayCents: number;
    /** Services whose price could not be resolved; their due-today is unknown, not $0. */
    unresolvedCount: number;
  };
}

export function formatServiceDesignation(designation: ServiceBillingDesignation): string {
  return designation === "PRODUCTION" ? "Production" : "Billable";
}

/** The one-line meaning under the designation, for the field. */
export function describeServiceDesignation(designation: ServiceBillingDesignation): string {
  return designation === "PRODUCTION" ? "Covered by agreement - nothing due today" : "Collect today";
}
