// Statements - PLAN_ROADMAP_V2.md C2.5 (Pass 15), B5 with the owner's answer
// of 2026-09-19: a LOCATION statement (a period roll-up of one location's
// ledger), an ACCOUNT statement (the same across every location of the
// customer - the property-manager case: many locations, one payer) and a
// paid-in-full / ZERO_BALANCE_LETTER with agreement status (the home-sale
// case). Every figure here is derived from the ledger's own rows at read
// time, the way shared/aging.ts derives aging - nothing is stored except the
// rendered document itself (server/documents/statement-pdf.ts, stored in
// `documents` like an invoice's PDF).
//
// The arithmetic follows the ledger's model (PLAN_BILLING_V1_1.md D4 / D5,
// canon §13-14), not a customer-account model:
//   - the BALANCE is what is owed on issued invoices. It goes up when an
//     invoice is issued and down when money is APPLIED to one - a payment
//     application or a credit application - never when money is merely
//     received. Money received and not applied sits ON ACCOUNT at the
//     location, shown beside the balance and never netted against it (the
//     Pass 14 rule, canon §13 aging).
//   - "pending shows, confirmed counts": an application of a PENDING payment
//     is listed and marked, and does not move the balance; it counts once
//     the office confirms the payment.
//   - a DRAFT is not a receivable and a VOID owes nothing (its applications
//     were released when it was voided), so neither appears; a released
//     application is excluded wherever it would have counted, and a VOIDED
//     payment (recorded in error) is not listed. The statement reflects the
//     ledger as it stands at generation - statuses are as of now, dates
//     place the rows in the period.
//   - a period is two inclusive UTC calendar days, like every other date-only
//     value in this repo. The opening balance is the invoices issued before
//     the period less the counted applications made before it; the closing
//     balance is the opening plus the period's charges less its counted
//     applications; and for a period ending today the closing balance is
//     exactly the ledger summary's open balance, and the aging strip is
//     exactly GET /api/customers/:id/aging's entry for the location - the
//     smoke test's cross-check.
//
// Pure: the server fetches the rows (statementLedgerForCustomerTx in
// server/storage.ts) and hands them here, so a scratchpad script can drive
// the same functions - the repo has no test runner.

import {
  agingFiguresOf,
  emptyAgingFigures,
  rollupAging,
  summarizeAgingByLocation,
  type AgedInvoice,
  type AgingFigures,
  type AgingInvoiceInput,
  type AgingOnAccountInput,
} from "./aging";
import { isInvoiceIssued } from "./invoice-status";
import { formatCents } from "./money";
import { formatCreditMemoReason, formatPaymentMethod, paymentHoldsValue, utcDayKey, utcDayRange } from "./payments";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const STATEMENT_VARIANTS = ["LOCATION", "ACCOUNT", "ZERO_BALANCE_LETTER"] as const;
export type StatementVariant = (typeof STATEMENT_VARIANTS)[number];

export const STATEMENT_VARIANT_LABELS: Record<StatementVariant, string> = {
  LOCATION: "Location statement",
  ACCOUNT: "Account statement",
  ZERO_BALANCE_LETTER: "Paid-in-full letter",
};

export function isStatementVariant(value: unknown): value is StatementVariant {
  return typeof value === "string" && (STATEMENT_VARIANTS as readonly string[]).includes(value);
}

/** The refusal code for a paid-in-full letter asked of a location that still owes something. */
export const LOCATION_HAS_BALANCE = "LOCATION_HAS_BALANCE";

/** Two inclusive UTC calendar days, YYYY-MM-DD. */
export interface StatementPeriod {
  from: string;
  to: string;
}

const UTC_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A real YYYY-MM-DD day (2026-02-30 is not one). */
export function isUtcDay(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Month to date, in UTC days: the first of the current month through today - the dialog's default. */
export function defaultStatementPeriod(now: Date = new Date()): StatementPeriod {
  const today = utcDayKey(now);
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** The earliest day a ledger could hold - the letter's "everything to date". */
export const STATEMENT_EPOCH = "1970-01-01";

// ---------------------------------------------------------------------------
// Inputs - what the summarizer needs from the ledger's rows. Dates are ISO
// strings or Dates; the server maps its rows here, a script builds them.
// ---------------------------------------------------------------------------

export interface StatementInvoiceInput {
  id: string;
  invoiceNumber: string;
  customerId: string;
  locationId: string | null;
  status: string;
  issuedAt: string | Date | null;
  totalAmountCents: number;
  /** What the invoice was for - its first line's description, "+N more" when it has several; null for a row with no lines. */
  summary: string | null;
}

export interface StatementPaymentInput {
  id: string;
  customerId: string;
  locationId: string;
  status: string;
  method: string;
  checkNumber: string | null;
  referenceNumber: string | null;
  amountCents: number;
  receivedAt: string | Date;
  refundedAt: string | Date | null;
}

export interface StatementCreditMemoInput {
  id: string;
  customerId: string;
  locationId: string;
  status: string;
  reasonCode: string;
  amountCents: number;
  issuedAt: string | Date;
}

/** One payment_applications or credit_applications row. */
export interface StatementApplicationInput {
  id: string;
  sourceKind: "payment" | "credit_memo";
  sourceId: string;
  invoiceId: string;
  amountCents: number;
  appliedAt: string | Date;
  released: boolean;
}

/** The customer's whole ledger; each summarizer scopes it to one location. */
export interface StatementLedgerInput {
  invoices: StatementInvoiceInput[];
  payments: StatementPaymentInput[];
  creditMemos: StatementCreditMemoInput[];
  applications: StatementApplicationInput[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * INVOICE            an invoice issued in the period: a charge.
 * PAYMENT_APPLIED    a payment applied to an invoice in the period: counted when the payment is CONFIRMED,
 *                    shown and marked when PENDING.
 * CREDIT_APPLIED     a credit memo applied to an invoice in the period: counted.
 * PAYMENT_ON_ACCOUNT a payment received in the period with money still unapplied at the period's end: no
 *                    balance change, the amount rides in the on-account figure.
 * CREDIT_ON_ACCOUNT  a credit memo issued in the period with value still unapplied at the period's end: the same.
 * PAYMENT_REFUNDED   a payment refunded in the period: informational (only unapplied money is ever refunded).
 */
export type StatementLineKind = "INVOICE" | "PAYMENT_APPLIED" | "CREDIT_APPLIED" | "PAYMENT_ON_ACCOUNT" | "CREDIT_ON_ACCOUNT" | "PAYMENT_REFUNDED";

export interface StatementLine {
  kind: StatementLineKind;
  /** The UTC day the line is dated by (YYYY-MM-DD). */
  date: string;
  /** The ISO instant that day came from - the sort key. */
  at: string;
  description: string;
  /** What the customer can quote back: the invoice number, the check number, the reference. */
  reference: string | null;
  /** The invoice the line is, or was applied to. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** The invoice's total, on an INVOICE line. */
  chargeCents: number;
  /** A counted application - what came off the balance. */
  creditCents: number;
  /** An application of a PENDING payment - shown, not counted. */
  pendingCents: number;
  /** The running balance after this line. */
  balanceCents: number;
}

export interface StatementFigures {
  /** Issued before the period, less the counted applications made before it. */
  openingBalanceCents: number;
  /** The period's invoice totals. */
  chargesCents: number;
  /** The period's counted applications - confirmed payments and issued credit memos. */
  creditsCents: number;
  /** The period's applications of PENDING payments - shown, never counted. */
  pendingAppliedCents: number;
  /** opening + charges - credits. For a period ending today, the ledger summary's open balance. */
  closingBalanceCents: number;
  /** Unapplied confirmed payments and issued credit memos at the period's end. Beside the balance, never netted. */
  onAccountCents: number;
  /** Unapplied PENDING payments at the period's end. Beside the balance, never netted. */
  pendingUnappliedCents: number;
  /** Invoices issued in the period. */
  invoiceCount: number;
}

export interface LocationStatement extends StatementFigures {
  /** Null for the section that carries a customer's invoices with no location (the legacy manual rows). */
  locationId: string | null;
  periodFrom: string;
  periodTo: string;
  /** The period's activity in date order. */
  lines: StatementLine[];
  /** The open invoices as of the period's end, aged from their invoice date to that day (B20). */
  aging: AgingFigures;
  openInvoices: AgedInvoice[];
}

export interface AccountStatementSection extends LocationStatement {
  locationName: string | null;
  locationAddress: string | null;
  isPrimary: boolean;
}

export interface AccountStatement extends StatementFigures {
  customerId: string;
  periodFrom: string;
  periodTo: string;
  /** One section per location of the customer, primary first; a trailing section for invoices with no location when any exist. */
  sections: AccountStatementSection[];
  /** rollupAging over the sections. */
  aging: AgingFigures;
}

export interface ZeroBalanceLetterAgreement {
  id: string;
  agreementName: string;
  /** ACTIVE | CANCELLED (the data today); canon §9 also names PAUSED and EXPIRED. */
  status: string;
  serviceTypeName: string | null;
  startDate: string;
  renewalDate: string | null;
  nextServiceDate: string | null;
  cancelledAt: string | null;
  cancellationEffectiveDate: string | null;
}

export interface ZeroBalanceLetter {
  locationId: string;
  /** The UTC day the letter speaks as of. */
  asOf: string;
  /** 0 on an issued letter; the refusal names it otherwise. */
  openBalanceCents: number;
  onAccountCents: number;
  pendingUnappliedCents: number;
  /** Invoices issued to date. */
  invoiceCount: number;
  lastInvoice: { invoiceNumber: string; issuedOn: string; totalAmountCents: number } | null;
  agreements: ZeroBalanceLetterAgreement[];
}

/** A stored statement as the list reads and the generate routes return it - the `documents` row without its bytes. */
export interface StatementInfo {
  id: string;
  variant: StatementVariant;
  customerId: string;
  /** Null for an ACCOUNT statement. */
  locationId: string | null;
  /** Null for a letter, which speaks as of one day. */
  periodFrom: string | null;
  /** The period's last day, or the letter's as-of day. */
  periodTo: string;
  /** ISO instant. */
  generatedAt: string;
  generatedByLabel: string | null;
  contentHash: string;
  mimeType: string;
}

/** What a generate route answers: the stored row and the figures it printed, so the caller need not parse the PDF. */
export interface StatementGenerateResult<T> {
  statement: StatementInfo;
  data: T;
}

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

function instant(value: string | Date): number {
  return new Date(value).getTime();
}

/** The UTC day of an instant already reduced to milliseconds. */
function dayOf(ms: number): string {
  return utcDayKey(new Date(ms));
}

const LINE_KIND_RANK: Record<StatementLineKind, number> = {
  INVOICE: 0,
  CREDIT_APPLIED: 1,
  PAYMENT_APPLIED: 1,
  PAYMENT_ON_ACCOUNT: 2,
  CREDIT_ON_ACCOUNT: 2,
  PAYMENT_REFUNDED: 3,
};

/** Date, then an invoice before what was applied to it, then the reference - so a same-day charge and its payment read in order. */
export function compareStatementLines(a: StatementLine, b: StatementLine): number {
  return (
    a.at.localeCompare(b.at)
    || LINE_KIND_RANK[a.kind] - LINE_KIND_RANK[b.kind]
    || (a.reference ?? "").localeCompare(b.reference ?? "")
    || a.description.localeCompare(b.description)
  );
}

function describePaymentSource(payment: StatementPaymentInput): string {
  const method = formatPaymentMethod(payment.method);
  if (payment.checkNumber) return `${method} #${payment.checkNumber}`;
  if (payment.referenceNumber) return `${method} (${payment.referenceNumber})`;
  return method;
}

/** Whether a payment still held value at `cutoff`: PENDING and CONFIRMED do; a REFUNDED one did until it was refunded; VOIDED never did. */
function paymentHeldValueAt(payment: StatementPaymentInput, cutoff: number): boolean {
  if (paymentHoldsValue(payment.status)) return true;
  if (payment.status === "REFUNDED" && payment.refundedAt) return instant(payment.refundedAt) >= cutoff;
  return false;
}

interface PlacedApplication {
  application: StatementApplicationInput;
  at: number;
  counted: boolean;
  pending: boolean;
  invoice: StatementInvoiceInput;
  payment: StatementPaymentInput | null;
  creditMemo: StatementCreditMemoInput | null;
}

/**
 * One location's statement for a period. `locationId` null selects the
 * customer's invoices that carry no location (only invoices can - every
 * payment and credit memo has one, D4). The ledger is the customer's; the
 * function scopes it, and applications are fenced to their invoice's
 * location by the ledger itself (a source and an invoice at different
 * locations refuse to apply), so an application belongs to exactly one
 * section.
 */
export function summarizeLocationStatement(ledger: StatementLedgerInput, locationId: string | null, period: StatementPeriod): LocationStatement {
  const fromStart = Date.parse(`${period.from}T00:00:00.000Z`);
  const toEnd = utcDayRange(period.from, period.to).endExclusive.getTime();
  const atLocation = (id: string | null | undefined) => (id ?? null) === locationId;

  // What can owe: issued invoices at the location with an issue date. A
  // DRAFT is not a receivable, a VOID owes nothing, and an issued row with
  // no issuedAt (none exists) cannot be placed, so it is left out rather
  // than dated from a guess - the aging module's rule.
  const invoices = ledger.invoices.filter(
    (invoice) => atLocation(invoice.locationId) && isInvoiceIssued(invoice.status) && !!invoice.issuedAt && !Number.isNaN(instant(invoice.issuedAt)),
  );
  const invoiceById = new Map<string, StatementInvoiceInput>();
  for (const invoice of invoices) invoiceById.set(invoice.id, invoice);
  const paymentById = new Map<string, StatementPaymentInput>();
  for (const payment of ledger.payments) paymentById.set(payment.id, payment);
  const creditById = new Map<string, StatementCreditMemoInput>();
  for (const memo of ledger.creditMemos) creditById.set(memo.id, memo);

  // What moved the balance, or shows on it: unreleased applications to these
  // invoices from a source that holds value. Confirmed money and issued
  // credit memos count; a pending payment's application shows.
  const placed: PlacedApplication[] = [];
  for (const application of ledger.applications) {
    if (application.released) continue;
    const invoice = invoiceById.get(application.invoiceId);
    if (!invoice) continue;
    const at = instant(application.appliedAt);
    if (Number.isNaN(at)) continue;
    if (application.sourceKind === "payment") {
      const payment = paymentById.get(application.sourceId);
      if (!payment || !paymentHoldsValue(payment.status)) continue;
      placed.push({ application, at, counted: payment.status === "CONFIRMED", pending: payment.status === "PENDING", invoice, payment, creditMemo: null });
    } else {
      const memo = creditById.get(application.sourceId);
      if (!memo || memo.status !== "ISSUED") continue;
      placed.push({ application, at, counted: true, pending: false, invoice, payment: null, creditMemo: memo });
    }
  }

  // Unapplied value of one source as of the period's end: its amount less
  // every unreleased application made before then, wherever it went.
  const unappliedAsOfEnd = (sourceKind: "payment" | "credit_memo", sourceId: string, amountCents: number): number => {
    let applied = 0;
    for (const application of ledger.applications) {
      if (application.released || application.sourceKind !== sourceKind || application.sourceId !== sourceId) continue;
      if (instant(application.appliedAt) < toEnd) applied += application.amountCents;
    }
    return Math.max(amountCents - applied, 0);
  };

  let openingBalanceCents = 0;
  for (const invoice of invoices) {
    if (instant(invoice.issuedAt!) < fromStart) openingBalanceCents += invoice.totalAmountCents;
  }
  for (const entry of placed) {
    if (entry.counted && entry.at < fromStart) openingBalanceCents -= entry.application.amountCents;
  }

  const lines: StatementLine[] = [];
  const inPeriod = (at: number) => at >= fromStart && at < toEnd;

  for (const invoice of invoices) {
    const at = instant(invoice.issuedAt!);
    if (!inPeriod(at)) continue;
    lines.push({
      kind: "INVOICE",
      date: dayOf(at),
      at: new Date(at).toISOString(),
      description: `Invoice ${invoice.invoiceNumber}${invoice.summary ? ` - ${invoice.summary}` : ""}`,
      reference: invoice.invoiceNumber,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      chargeCents: invoice.totalAmountCents,
      creditCents: 0,
      pendingCents: 0,
      balanceCents: 0,
    });
  }

  for (const entry of placed) {
    if (!inPeriod(entry.at)) continue;
    const appliedDay = dayOf(entry.at);
    if (entry.payment) {
      const receivedDay = utcDayKey(entry.payment.receivedAt);
      const received = receivedDay !== appliedDay ? ` received ${receivedDay}` : "";
      lines.push({
        kind: "PAYMENT_APPLIED",
        date: appliedDay,
        at: new Date(entry.at).toISOString(),
        description: `Payment - ${describePaymentSource(entry.payment)}${received} - applied to ${entry.invoice.invoiceNumber}${entry.pending ? " - pending confirmation" : ""}`,
        reference: entry.payment.checkNumber ?? entry.payment.referenceNumber ?? null,
        invoiceId: entry.invoice.id,
        invoiceNumber: entry.invoice.invoiceNumber,
        chargeCents: 0,
        creditCents: entry.counted ? entry.application.amountCents : 0,
        pendingCents: entry.pending ? entry.application.amountCents : 0,
        balanceCents: 0,
      });
    } else if (entry.creditMemo) {
      lines.push({
        kind: "CREDIT_APPLIED",
        date: appliedDay,
        at: new Date(entry.at).toISOString(),
        description: `Credit memo - ${formatCreditMemoReason(entry.creditMemo.reasonCode)} - applied to ${entry.invoice.invoiceNumber}`,
        reference: null,
        invoiceId: entry.invoice.id,
        invoiceNumber: entry.invoice.invoiceNumber,
        chargeCents: 0,
        creditCents: entry.application.amountCents,
        pendingCents: 0,
        balanceCents: 0,
      });
    }
  }

  for (const payment of ledger.payments) {
    if (!atLocation(payment.locationId)) continue;
    const receivedAt = instant(payment.receivedAt);
    if (inPeriod(receivedAt) && paymentHeldValueAt(payment, toEnd)) {
      const unapplied = unappliedAsOfEnd("payment", payment.id, payment.amountCents);
      if (unapplied > 0) {
        lines.push({
          kind: "PAYMENT_ON_ACCOUNT",
          date: dayOf(receivedAt),
          at: new Date(receivedAt).toISOString(),
          description: `Payment received - ${describePaymentSource(payment)} ${formatCents(payment.amountCents)} - ${formatCents(unapplied)} on account, not applied to an invoice${payment.status === "PENDING" ? " - pending confirmation" : ""}`,
          reference: payment.checkNumber ?? payment.referenceNumber ?? null,
          invoiceId: null,
          invoiceNumber: null,
          chargeCents: 0,
          creditCents: 0,
          pendingCents: 0,
          balanceCents: 0,
        });
      }
    }
    if (payment.status === "REFUNDED" && payment.refundedAt) {
      const refundedAt = instant(payment.refundedAt);
      if (inPeriod(refundedAt)) {
        lines.push({
          kind: "PAYMENT_REFUNDED",
          date: dayOf(refundedAt),
          at: new Date(refundedAt).toISOString(),
          description: `Payment refunded - ${describePaymentSource(payment)} ${formatCents(payment.amountCents)} received ${dayOf(receivedAt)}`,
          reference: payment.checkNumber ?? payment.referenceNumber ?? null,
          invoiceId: null,
          invoiceNumber: null,
          chargeCents: 0,
          creditCents: 0,
          pendingCents: 0,
          balanceCents: 0,
        });
      }
    }
  }

  for (const memo of ledger.creditMemos) {
    if (!atLocation(memo.locationId) || memo.status !== "ISSUED") continue;
    const issuedAt = instant(memo.issuedAt);
    if (!inPeriod(issuedAt)) continue;
    const unapplied = unappliedAsOfEnd("credit_memo", memo.id, memo.amountCents);
    if (unapplied <= 0) continue;
    lines.push({
      kind: "CREDIT_ON_ACCOUNT",
      date: dayOf(issuedAt),
      at: new Date(issuedAt).toISOString(),
      description: `Credit memo issued - ${formatCreditMemoReason(memo.reasonCode)} ${formatCents(memo.amountCents)} - ${formatCents(unapplied)} on account, not applied to an invoice`,
      reference: null,
      invoiceId: null,
      invoiceNumber: null,
      chargeCents: 0,
      creditCents: 0,
      pendingCents: 0,
      balanceCents: 0,
    });
  }

  lines.sort(compareStatementLines);

  let balance = openingBalanceCents;
  let chargesCents = 0;
  let creditsCents = 0;
  let pendingAppliedCents = 0;
  let invoiceCount = 0;
  for (const line of lines) {
    balance += line.chargeCents - line.creditCents;
    line.balanceCents = balance;
    chargesCents += line.chargeCents;
    creditsCents += line.creditCents;
    pendingAppliedCents += line.pendingCents;
    if (line.kind === "INVOICE") invoiceCount += 1;
  }

  // As of the period's end: what each invoice still owed and what money sat
  // unapplied - the aging strip's inputs, derived the way the ledger's stored
  // rollups are (unreleased applications; confirmed counts, pending shows)
  // but cut off at the period's end, so a past period ages as it stood then
  // and a period ending today ages exactly as the customer read does.
  const agingInvoices: AgingInvoiceInput[] = [];
  for (const invoice of invoices) {
    if (instant(invoice.issuedAt!) >= toEnd) continue;
    let paid = 0;
    let pending = 0;
    for (const entry of placed) {
      if (entry.invoice.id !== invoice.id || entry.at >= toEnd) continue;
      if (entry.counted) paid += entry.application.amountCents;
      else if (entry.pending) pending += entry.application.amountCents;
    }
    agingInvoices.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      locationId: invoice.locationId ?? null,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      totalAmountCents: invoice.totalAmountCents,
      balanceDueCents: Math.max(invoice.totalAmountCents - paid, 0),
      pendingAppliedCents: pending,
    });
  }
  const sources: AgingOnAccountInput[] = [];
  for (const payment of ledger.payments) {
    if (!atLocation(payment.locationId) || instant(payment.receivedAt) >= toEnd || !paymentHeldValueAt(payment, toEnd)) continue;
    const unapplied = unappliedAsOfEnd("payment", payment.id, payment.amountCents);
    if (unapplied <= 0) continue;
    // A payment refunded after the period's end was confirmed money on account at that end.
    sources.push({ customerId: payment.customerId, locationId: payment.locationId, status: paymentHoldsValue(payment.status) ? payment.status : "CONFIRMED", unappliedCents: unapplied });
  }
  for (const memo of ledger.creditMemos) {
    if (!atLocation(memo.locationId) || memo.status !== "ISSUED" || instant(memo.issuedAt) >= toEnd) continue;
    const unapplied = unappliedAsOfEnd("credit_memo", memo.id, memo.amountCents);
    if (unapplied <= 0) continue;
    sources.push({ customerId: memo.customerId, locationId: memo.locationId, status: "ISSUED", unappliedCents: unapplied });
  }
  const agedEntry = summarizeAgingByLocation(agingInvoices, sources, period.to).find((entry) => (entry.locationId ?? null) === locationId);
  const aging = agedEntry ? agingFiguresOf(agedEntry) : emptyAgingFigures();

  return {
    locationId,
    periodFrom: period.from,
    periodTo: period.to,
    openingBalanceCents,
    chargesCents,
    creditsCents,
    pendingAppliedCents,
    closingBalanceCents: openingBalanceCents + chargesCents - creditsCents,
    onAccountCents: aging.onAccountCents,
    pendingUnappliedCents: aging.pendingUnappliedCents,
    invoiceCount,
    lines,
    aging,
    openInvoices: agedEntry?.invoices ?? [],
  };
}

export interface AccountStatementLocationInput {
  id: string;
  name: string | null;
  address: string | null;
  isPrimary: boolean;
}

function sumFigures(parts: StatementFigures[]): StatementFigures {
  const total: StatementFigures = {
    openingBalanceCents: 0,
    chargesCents: 0,
    creditsCents: 0,
    pendingAppliedCents: 0,
    closingBalanceCents: 0,
    onAccountCents: 0,
    pendingUnappliedCents: 0,
    invoiceCount: 0,
  };
  for (const part of parts) {
    total.openingBalanceCents += part.openingBalanceCents;
    total.chargesCents += part.chargesCents;
    total.creditsCents += part.creditsCents;
    total.pendingAppliedCents += part.pendingAppliedCents;
    total.closingBalanceCents += part.closingBalanceCents;
    total.onAccountCents += part.onAccountCents;
    total.pendingUnappliedCents += part.pendingUnappliedCents;
    total.invoiceCount += part.invoiceCount;
  }
  return total;
}

/**
 * The customer-wide statement: one section per location (primary first,
 * then as given), each summarizeLocationStatement's answer, and a trailing
 * "no location" section only when an issued invoice carries none, so the
 * customer-wide figure is complete (the Pass 14 rule). The rollup sums the
 * sections; the aging strip is rollupAging over theirs.
 */
export function summarizeAccountStatement(
  ledger: StatementLedgerInput,
  customerId: string,
  locationsIn: AccountStatementLocationInput[],
  period: StatementPeriod,
): AccountStatement {
  const ordered = locationsIn.slice().sort((a, b) => (a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : 0));
  const sections: AccountStatementSection[] = ordered.map((location) => ({
    ...summarizeLocationStatement(ledger, location.id, period),
    locationName: location.name,
    locationAddress: location.address,
    isPrimary: location.isPrimary,
  }));
  if (ledger.invoices.some((invoice) => !invoice.locationId && invoice.customerId === customerId && isInvoiceIssued(invoice.status))) {
    sections.push({ ...summarizeLocationStatement(ledger, null, period), locationName: null, locationAddress: null, isPrimary: false });
  }
  return {
    customerId,
    periodFrom: period.from,
    periodTo: period.to,
    ...sumFigures(sections),
    sections,
    aging: rollupAging(sections.map((section) => section.aging)),
  };
}

/**
 * The paid-in-full letter's figures: everything to date at the location,
 * as of one day. The caller decides whether to issue it -
 * zeroBalanceLetterRefusal says when not to.
 */
export function buildZeroBalanceLetter(
  ledger: StatementLedgerInput,
  locationId: string,
  asOf: string,
  agreements: ZeroBalanceLetterAgreement[],
): ZeroBalanceLetter {
  const toDate = summarizeLocationStatement(ledger, locationId, { from: STATEMENT_EPOCH, to: asOf });
  const invoiceLines = toDate.lines.filter((line) => line.kind === "INVOICE");
  const last = invoiceLines.length ? invoiceLines[invoiceLines.length - 1] : null;
  return {
    locationId,
    asOf,
    openBalanceCents: toDate.closingBalanceCents,
    onAccountCents: toDate.onAccountCents,
    pendingUnappliedCents: toDate.pendingUnappliedCents,
    invoiceCount: invoiceLines.length,
    lastInvoice: last ? { invoiceNumber: last.invoiceNumber ?? last.reference ?? "", issuedOn: last.date, totalAmountCents: last.chargeCents } : null,
    agreements: agreements.slice().sort(compareLetterAgreements),
  };
}

/** Active agreements first, then by start date, newest first. */
export function compareLetterAgreements(a: ZeroBalanceLetterAgreement, b: ZeroBalanceLetterAgreement): number {
  const aActive = a.status === "ACTIVE" ? 0 : 1;
  const bActive = b.status === "ACTIVE" ? 0 : 1;
  return aActive - bActive || b.startDate.localeCompare(a.startDate) || a.agreementName.localeCompare(b.agreementName);
}

/**
 * A paid-in-full letter is REFUSED, not reworded, when the location still
 * owes something: a letter saying "you owe $X" is a balance-due statement,
 * and the office generates a location statement for that. Pending money
 * applied to an open invoice does not clear it (pending shows, confirmed
 * counts), so a location with a check awaiting confirmation is refused too.
 * Money on account does not block the letter; it is stated.
 */
export function zeroBalanceLetterRefusal(letter: Pick<ZeroBalanceLetter, "openBalanceCents">): string | null {
  if (letter.openBalanceCents <= 0) return null;
  return `This location still owes ${formatCents(letter.openBalanceCents)} on issued invoices, so a paid-in-full letter cannot be issued for it. Generate a location statement instead; the letter is available once the balance is settled and confirmed.`;
}

const AGREEMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  CANCELLED: "Cancelled",
  CANCELED: "Cancelled",
  PAUSED: "Paused",
  EXPIRED: "Expired",
};

export function describeAgreementStatus(status: string): string {
  return AGREEMENT_STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Labels shared by the document, the dialog and the list
// ---------------------------------------------------------------------------

/** "2026-09-01 to 2026-09-25", or "As of 2026-09-25" for a letter. */
export function describeStatementPeriod(info: Pick<StatementInfo, "variant" | "periodFrom" | "periodTo">): string {
  if (info.variant === "ZERO_BALANCE_LETTER" || !info.periodFrom) return `As of ${info.periodTo}`;
  return `${info.periodFrom} to ${info.periodTo}`;
}

/** The download's file name. */
export function statementFileName(info: Pick<StatementInfo, "variant" | "periodTo">): string {
  const stem = info.variant === "ZERO_BALANCE_LETTER" ? "paid-in-full-letter" : info.variant === "ACCOUNT" ? "account-statement" : "statement";
  return `${stem}-${info.periodTo}.pdf`;
}
