// Invoice status is DERIVED FROM AMOUNTS, never hand-set (PLAN_BILLING_V1_1.md
// D5, and the "status fields derive from amounts" constraint in
// CURRENT_FOCUS.md). This file is the one place that derivation lives.
//
// Call deriveInvoiceStatus() at every point that changes what an invoice is
// owed - creation, payment application, release, credit application, void
// reversal - and never assign a status literal at a call site. A hand-placed
// "PAID" is exactly the drift the rule exists to prevent, and a second
// derivation somewhere else is a second brain that has to agree with this one
// forever.

export type InvoiceStatus = "DRAFT" | "OPEN" | "PARTIALLY_PAID" | "PAID" | "VOID";

export interface InvoiceAmountState {
  totalAmountCents: number;
  /** Sum of unreleased payment + credit applications. 0 before Pass 6 builds the ledger. */
  amountPaidCents?: number;
  /**
   * Lifecycle status the invoice already carries, if any. DRAFT and VOID are
   * lifecycle states rather than amount-derived ones: a DRAFT is not "paid"
   * because it is $0, and a VOID invoice stays void no matter what its ledger
   * says. Passing them through here keeps that true without a caller having to
   * remember it.
   */
  currentStatus?: string | null;
}

export function deriveInvoiceStatus(state: InvoiceAmountState): InvoiceStatus {
  if (state.currentStatus === "DRAFT" || state.currentStatus === "VOID") {
    return state.currentStatus;
  }

  const amountPaidCents = state.amountPaidCents ?? 0;
  const balanceDueCents = state.totalAmountCents - amountPaidCents;

  // A $0 invoice has nothing owed, so it derives to PAID on the same rule that
  // marks a fully-paid one - no special case for agreement-covered visits. What
  // the CUSTOMER is told about such an invoice is a render-layer concern; see
  // isFullyAgreementCovered below.
  if (balanceDueCents <= 0) {
    return "PAID";
  }

  return amountPaidCents > 0 ? "PARTIALLY_PAID" : "OPEN";
}

/**
 * A visit where the service agreement covered everything and no money moved.
 *
 * Customer-facing documents render these as "No Charge - Covered by Service
 * Agreement" rather than "PAID": the derived status is correct bookkeeping, but
 * "PAID" tells the customer they settled a bill, when the true story is that
 * their agreement absorbed the visit. Same row, same derived status, honest
 * document - and no fifth status value for state to drift into.
 *
 * Deliberately requires BOTH conditions. A $0 invoice with a chargeable line
 * (a full discount, say) is not agreement coverage and must not claim to be.
 */
export function isFullyAgreementCovered(invoice: {
  totalAmountCents: number;
  lines: Array<{ lineType: string }>;
}): boolean {
  return (
    invoice.totalAmountCents === 0 &&
    invoice.lines.length > 0 &&
    invoice.lines.every((line) => line.lineType === "AGREEMENT_COVERED")
  );
}

export const NO_CHARGE_LABEL = "No Charge - Covered by Service Agreement";
