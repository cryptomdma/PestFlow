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
