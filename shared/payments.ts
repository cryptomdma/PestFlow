// The vocabulary for the payments ledger - PLAN_BILLING_V1_1.md D5 (payments-
// lite) and D4 (unapplied balances live at the LOCATION). Shared because the
// server validates and transitions it, the routes enum-check it, and the
// client renders it; one file so a label and a state can never disagree.
//
// The ledger is append-only. A payment, an application, and a credit memo
// are events; a mistake is corrected by a new event (release, void, re-entry),
// never by editing the amount on the row that was wrong. The status columns
// below are lifecycle stamps (who/when/why), not edits of what was recorded.

/** CASH | CHECK | OTHER are the Phase 1 manual instruments. CARD and ACH are
 *  named so the column vocabulary is complete, but nothing records them until
 *  Stripe lands in Phase 2 - the route refuses them. */
export const PAYMENT_METHODS = ["CASH", "CHECK", "OTHER", "CARD", "ACH"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const MANUAL_PAYMENT_METHODS = ["CASH", "CHECK", "OTHER"] as const;

/**
 * PENDING: recorded, not yet counted toward the invoice (a cash or check
 *   payment posts here and shows on the invoice without marking it paid).
 * CONFIRMED: the office confirmed it cleared / was banked; it now counts.
 * VOIDED: recorded in error; carries no value and can hold no applications.
 * REFUNDED: money returned to the customer; likewise holds no applications.
 * AUTHORIZED / CAPTURED / FAILED are the card states for Phase 2 and are
 * listed only so the vocabulary is stable when they arrive.
 */
export const PAYMENT_STATUSES = ["PENDING", "CONFIRMED", "VOIDED", "REFUNDED", "AUTHORIZED", "CAPTURED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** A payment in one of these states has value: it can be applied, and (once
 *  CONFIRMED) it counts toward an invoice's amount paid. */
export function paymentHoldsValue(status: string): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

/** Whether applications of this payment count toward amountPaidCents (D5:
 *  PENDING shows on the invoice but does not mark it paid). */
export function paymentCountsAsPaid(status: string): boolean {
  return status === "CONFIRMED";
}

export const CREDIT_MEMO_STATUSES = ["ISSUED", "VOIDED"] as const;
export type CreditMemoStatus = (typeof CREDIT_MEMO_STATUSES)[number];

/** Why a credit memo was issued - the ledger's only correction mechanism
 *  (PLAN_BILLING_V1.md §1.4), so the reason is structured, not free text. */
export const CREDIT_MEMO_REASON_CODES = ["BILLING_ERROR", "SERVICE_ISSUE", "GOODWILL", "CANCELLATION", "OTHER"] as const;
export type CreditMemoReasonCode = (typeof CREDIT_MEMO_REASON_CODES)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isManualPaymentMethod(value: unknown): value is (typeof MANUAL_PAYMENT_METHODS)[number] {
  return typeof value === "string" && (MANUAL_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isCreditMemoReasonCode(value: unknown): value is CreditMemoReasonCode {
  return typeof value === "string" && (CREDIT_MEMO_REASON_CODES as readonly string[]).includes(value);
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CHECK: "Check",
  OTHER: "Other",
  CARD: "Card",
  ACH: "ACH",
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending confirmation",
  CONFIRMED: "Confirmed",
  VOIDED: "Voided",
  REFUNDED: "Refunded",
  AUTHORIZED: "Authorized",
  CAPTURED: "Captured",
  FAILED: "Failed",
};

const CREDIT_MEMO_REASON_LABELS: Record<CreditMemoReasonCode, string> = {
  BILLING_ERROR: "Billing error",
  SERVICE_ISSUE: "Service issue",
  GOODWILL: "Goodwill",
  CANCELLATION: "Cancellation",
  OTHER: "Other",
};

export function formatPaymentMethod(method: string): string {
  return METHOD_LABELS[method as PaymentMethod] ?? method;
}

export function formatPaymentStatus(status: string): string {
  return STATUS_LABELS[status as PaymentStatus] ?? status;
}

export function formatCreditMemoReason(reasonCode: string): string {
  return CREDIT_MEMO_REASON_LABELS[reasonCode as CreditMemoReasonCode] ?? reasonCode;
}

// ---------------------------------------------------------------------------
// Who may confirm (D5). One expression, read by the location ledger panel, the
// Service Ticket Review modal, the Payments screen's queue and the server's
// batch confirmation, so the four can never gate differently: CONFIRM_PAYMENT
// for a check or "other"; cash additionally CONFIRM_CASH_PAYMENT (manager+).
// ---------------------------------------------------------------------------

export interface ConfirmAuthority {
  /** can(role, CONFIRM_PAYMENT) */
  canConfirm: boolean;
  /** can(role, CONFIRM_CASH_PAYMENT) */
  canConfirmCash: boolean;
}

export function mayConfirmPayment(payment: { status: string; method: string }, authority: ConfirmAuthority): boolean {
  return payment.status === "PENDING" && authority.canConfirm && (payment.method !== "CASH" || authority.canConfirmCash);
}

/** A pending cash payment in front of a user who confirms checks but not cash - the row says who can. */
export function needsCashAuthority(payment: { status: string; method: string }, authority: ConfirmAuthority): boolean {
  return payment.status === "PENDING" && payment.method === "CASH" && authority.canConfirm && !authority.canConfirmCash;
}

/** The row's note for the case above. */
export const CASH_CONFIRM_NOTE = "Cash is confirmed by a manager or admin.";
/** The refusal - the single confirm route's 403 and a batch's per-payment skip reason. */
export const CASH_CONFIRM_AUTHORITY_MESSAGE = "Confirming a cash payment requires cash-handling authority (manager or admin)";

// ---------------------------------------------------------------------------
// The Payments screen (D5, owner review of Pass 7.5, item 4): an org-wide
// list with server-side filters, batch confirmation, and a collections
// report. Read-only and derived - nothing here is stored.
// ---------------------------------------------------------------------------

/** GET /api/payments query. Dates are YYYY-MM-DD, inclusive, UTC calendar days - the same clock every other date-only value in this repo keeps. */
export interface PaymentListFilters {
  status?: PaymentStatus[];
  method?: PaymentMethod[];
  receivedFrom?: string;
  receivedTo?: string;
  collectedByUserId?: string;
  /** Matches customer name / company, location name / address / city, check number, reference, memo. */
  search?: string;
  limit?: number;
}

export const PAYMENT_LIST_DEFAULT_LIMIT = 200;
export const PAYMENT_LIST_MAX_LIMIT = 1000;
export const PAYMENT_BATCH_CONFIRM_MAX = 200;

/** The query string for the filters (no leading "?"); empty when nothing is set. Key names ARE the filter names, so the server's schema and this stay one vocabulary. */
export function paymentListSearchParams(filters: PaymentListFilters): string {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.method?.length) params.set("method", filters.method.join(","));
  if (filters.receivedFrom) params.set("receivedFrom", filters.receivedFrom);
  if (filters.receivedTo) params.set("receivedTo", filters.receivedTo);
  if (filters.collectedByUserId) params.set("collectedByUserId", filters.collectedByUserId);
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}

/** One payment as the org-wide list shows it: the ledger row plus the labels the office reads it by. Dates are ISO strings. */
export interface PaymentListRow {
  id: string;
  customerId: string;
  locationId: string;
  appointmentId: string | null;
  designatedAgreementId: string | null;
  method: string;
  status: string;
  amountCents: number;
  /** Unreleased applications to invoices; amount - applied is what sits on the location balance. */
  appliedCents: number;
  checkNumber: string | null;
  referenceNumber: string | null;
  memo: string | null;
  receivedAt: string;
  createdAt: string;
  collectedByUserId: string | null;
  collectedByLabel: string | null;
  confirmedByLabel: string | null;
  confirmedAt: string | null;
  voidReason: string | null;
  refundReason: string | null;
  customerLabel: string;
  locationName: string;
  /** "street, city" */
  locationAddress: string;
  /** The visit's scheduled start when the payment named one (payments.appointmentId). */
  appointmentScheduledAt: string | null;
}

/** Over the whole filtered set (not just the returned page), with the STATUS filter ignored: the tiles say what is pending and what is confirmed for the range / collector / method / search in view, whichever status the list is showing. */
export interface PaymentListSummary {
  pendingCents: number;
  pendingCount: number;
  /** The part of pending that only a manager or admin can confirm. */
  pendingCashCents: number;
  pendingCashCount: number;
  confirmedCents: number;
  confirmedCount: number;
}

export interface PaymentCollectorOption {
  userId: string;
  label: string;
}

export interface PaymentListResult {
  payments: PaymentListRow[];
  /** Rows matching the filters, which may exceed payments.length when the limit cut the page. */
  total: number;
  limit: number;
  summary: PaymentListSummary;
  /** Everyone who has ever recorded a payment in the org, for the collector filter - independent of the filters. */
  collectors: PaymentCollectorOption[];
}

/** POST /api/payments/confirm-batch. Each payment is its own transaction and its own audit row; a refused one is reported, never fatal to the rest. */
export interface BatchConfirmResult {
  confirmed: Array<{ id: string; method: string; amountCents: number; status: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// The collections report - the deposit-slip view. Pure: the server fetches the
// range and hands the rows here; a scratchpad script can drive the same
// function, since the repo has no test runner.
// ---------------------------------------------------------------------------

export interface CollectionsInput {
  id: string;
  status: string;
  method: string;
  amountCents: number;
  /** ISO instant. */
  receivedAt: string;
  collectedByUserId: string | null;
  collectedByLabel: string | null;
}

export interface CollectionsBucket {
  /** The day (YYYY-MM-DD, UTC), the collector's user id ("" when none was recorded), or the method. */
  key: string;
  label: string;
  pendingCents: number;
  pendingCount: number;
  confirmedCents: number;
  confirmedCount: number;
  /** pending + confirmed */
  totalCents: number;
}

export interface CollectionsTotals {
  pendingCents: number;
  pendingCount: number;
  confirmedCents: number;
  confirmedCount: number;
  totalCents: number;
  /** Voided / refunded payments in the range: listed so the count is honest, never summed - they hold no value. */
  excludedCount: number;
  excludedCents: number;
}

export interface CollectionsReport {
  receivedFrom: string;
  receivedTo: string;
  totals: CollectionsTotals;
  /** Ascending by day. */
  byDay: CollectionsBucket[];
  /** Largest total first; money with no recorded collector last. */
  byCollector: CollectionsBucket[];
  /** In PAYMENT_METHODS order, only the methods present. */
  byMethod: CollectionsBucket[];
}

export const UNATTRIBUTED_COLLECTOR_LABEL = "No collector recorded";

/** The UTC calendar day an instant falls on - the report's day key and the day filter's unit. */
export function utcDayKey(instant: string | Date): string {
  return new Date(instant).toISOString().slice(0, 10);
}

/** [start, endExclusive) for an inclusive range of UTC calendar days. */
export function utcDayRange(receivedFrom: string, receivedTo: string): { start: Date; endExclusive: Date } {
  const start = new Date(`${receivedFrom}T00:00:00.000Z`);
  const endExclusive = new Date(`${receivedTo}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}

function emptyBucket(key: string, label: string): CollectionsBucket {
  return { key, label, pendingCents: 0, pendingCount: 0, confirmedCents: 0, confirmedCount: 0, totalCents: 0 };
}

function addToBucket(bucket: CollectionsBucket, row: CollectionsInput): void {
  if (row.status === "PENDING") {
    bucket.pendingCents += row.amountCents;
    bucket.pendingCount += 1;
  } else {
    bucket.confirmedCents += row.amountCents;
    bucket.confirmedCount += 1;
  }
  bucket.totalCents = bucket.pendingCents + bucket.confirmedCents;
}

/**
 * Group what was collected in a range by day, collector and method, pending
 * against confirmed. Only PENDING and CONFIRMED rows carry value; VOIDED and
 * REFUNDED ones are counted in `excluded` and nowhere else. The caller supplies
 * rows already limited to the range - this function does not re-filter, so the
 * range on the result is a label, not a fence.
 */
export function summarizeCollections(rows: CollectionsInput[], range: { receivedFrom: string; receivedTo: string }): CollectionsReport {
  const totals: CollectionsTotals = { pendingCents: 0, pendingCount: 0, confirmedCents: 0, confirmedCount: 0, totalCents: 0, excludedCount: 0, excludedCents: 0 };
  const byDay = new Map<string, CollectionsBucket>();
  const byCollector = new Map<string, CollectionsBucket>();
  const byMethod = new Map<string, CollectionsBucket>();

  for (const row of rows) {
    if (!paymentHoldsValue(row.status)) {
      totals.excludedCount += 1;
      totals.excludedCents += row.amountCents;
      continue;
    }
    if (row.status === "PENDING") {
      totals.pendingCents += row.amountCents;
      totals.pendingCount += 1;
    } else {
      totals.confirmedCents += row.amountCents;
      totals.confirmedCount += 1;
    }

    const day = utcDayKey(row.receivedAt);
    if (!byDay.has(day)) byDay.set(day, emptyBucket(day, day));
    addToBucket(byDay.get(day)!, row);

    const collectorKey = row.collectedByUserId ?? "";
    if (!byCollector.has(collectorKey)) {
      byCollector.set(collectorKey, emptyBucket(collectorKey, row.collectedByUserId ? row.collectedByLabel || row.collectedByUserId : UNATTRIBUTED_COLLECTOR_LABEL));
    }
    addToBucket(byCollector.get(collectorKey)!, row);

    if (!byMethod.has(row.method)) byMethod.set(row.method, emptyBucket(row.method, formatPaymentMethod(row.method)));
    addToBucket(byMethod.get(row.method)!, row);
  }
  totals.totalCents = totals.pendingCents + totals.confirmedCents;

  const methodOrder = (method: string) => {
    const index = (PAYMENT_METHODS as readonly string[]).indexOf(method);
    return index < 0 ? PAYMENT_METHODS.length : index;
  };

  return {
    receivedFrom: range.receivedFrom,
    receivedTo: range.receivedTo,
    totals,
    byDay: Array.from(byDay.values()).sort((a, b) => a.key.localeCompare(b.key)),
    byCollector: Array.from(byCollector.values()).sort((a, b) => {
      if (!a.key !== !b.key) return a.key ? -1 : 1;
      return b.totalCents - a.totalCents || a.label.localeCompare(b.label);
    }),
    byMethod: Array.from(byMethod.values()).sort((a, b) => methodOrder(a.key) - methodOrder(b.key)),
  };
}

/**
 * What the location's unapplied balance is made of, as the server reports it.
 * A source is one payment or one credit memo with value left to apply.
 * `designatedAgreementId` is intent recorded at collection ("this is for the
 * Quarterly agreement"); application is the fact, and the office decides.
 */
export interface UnappliedSource {
  kind: "payment" | "credit_memo";
  id: string;
  /** Payment status for a payment source; "ISSUED" for a credit memo. */
  status: string;
  /** Payment method for a payment source; the reason code for a credit memo. */
  label: string;
  amountCents: number;
  unappliedCents: number;
  designatedAgreementId: string | null;
  /** The visit a payment was collected at, when the field recorded it (D5 owner review). Null for office-recorded money and credit memos. */
  appointmentId: string | null;
  recordedAt: string;
}

export interface LocationLedgerSummary {
  locationId: string;
  /** Sum of balanceDueCents across the location's issued invoices. */
  openBalanceCents: number;
  /** Confirmed payments and issued credit memos with value left to apply. Counts toward AR. */
  unappliedConfirmedCents: number;
  /** Recorded but unconfirmed payments with value left to apply. Can be applied; does not mark an invoice paid. */
  unappliedPendingCents: number;
  sources: UnappliedSource[];
}

/**
 * The D4 prompt's numbers for one invoice: how much of the location's
 * unapplied balance could go on it right now. `suggestedCents` is what one
 * "Apply" would do - capped by what the invoice can still take, which counts
 * every unreleased application (pending included) so two pending payments
 * cannot jointly overpay it.
 */
export interface InvoiceLocationBalance {
  invoiceId: string;
  locationId: string | null;
  balanceDueCents: number;
  /** Unreleased applications from PENDING payments - shown on the invoice, not yet counted. */
  pendingAppliedCents: number;
  /** balanceDue less pending applications: the most the invoice can still take. */
  applicableCents: number;
  unappliedConfirmedCents: number;
  unappliedPendingCents: number;
  suggestedCents: number;
  /** Unapplied money designated to an agreement this invoice is NOT for. Never suggested here; listed so the office knows it exists. */
  designatedElsewhereCents: number;
  /** The sources one "Apply" would draw on, in the order it would draw on them. */
  sources: UnappliedSource[];
}
