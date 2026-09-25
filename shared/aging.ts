// Accounts-receivable aging - PLAN_ROADMAP_V2.md C2.4 (Pass 14), B20 with the
// owner's answer of 2026-09-19: aging is DERIVED, never stored. An invoice is
// aged by its INVOICE DATE - `issuedAt`, the moment it became a receivable
// (D3) - counted in whole UTC calendar days, the clock every other date-only
// value in the repo keeps (the billing run's "today", the collections report's
// day key, the batch window). Buckets: Current (0-30) / 31-60 / 61-90 /
// Over 90 "days since invoiced". This is deliberately NOT days past due: the
// Invoices screen's Overdue tile keeps its due-date meaning (isInvoiceOverdue,
// client/src/components/invoice-status-badge.tsx), and a later Settings toggle
// may switch aging to due dates for Net-terms commercial accounts. Say "days
// since invoiced" wherever a bucket is shown.
//
// What ages: issued invoices (never a DRAFT or a VOID - isInvoiceIssued, the
// receivable test) with a balance still due, read from the ledger's stored
// rollups (D5: balanceDueCents / pendingAppliedCents, recomputed under a row
// lock with every application). Money on account (confirmed payments and
// issued credit memos with value left to apply, at the LOCATION - D4, canon
// rule 1) is shown BESIDE the aged balance and never netted against it, and
// so is pending money ("pending shows, confirmed counts"): applied-but-
// unconfirmed on the aged invoices, and recorded-but-unapplied at the
// location. The customer-wide figure is a rollup of its locations; the
// balance still lives at the location.
//
// Pure: the server fetches the rows and hands them here, so the same function
// serves the customer screen's read, the org-wide report, and a scratchpad
// script - the repo has no test runner.

import { isInvoiceIssued } from "./invoice-status";
import { paymentHoldsValue, utcDayKey } from "./payments";

export const AGING_BUCKETS = ["CURRENT", "DAYS_31_60", "DAYS_61_90", "OVER_90"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** The bucket's short label, as a column header or a row label. */
export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  CURRENT: "Current",
  DAYS_31_60: "31-60",
  DAYS_61_90: "61-90",
  OVER_90: "Over 90",
};

/** The bucket's range, spelled out. Always shown with AGING_BASIS_LABEL somewhere nearby. */
export const AGING_BUCKET_RANGES: Record<AgingBucket, string> = {
  CURRENT: "0-30 days",
  DAYS_31_60: "31-60 days",
  DAYS_61_90: "61-90 days",
  OVER_90: "over 90 days",
};

/** The basis every bucket is counted on. Never "past due" - see the header comment. */
export const AGING_BASIS_LABEL = "days since invoiced";

/**
 * Whole UTC calendar days from one instant's day to another's. An invoice
 * issued at 23:59 UTC yesterday is 1 day old at 00:01 UTC today - the same
 * arithmetic the collections report's day key uses. Negative when `from` is
 * after `asOf` (a clock ahead of the server's); the bucket function reads
 * that as Current rather than inventing a fifth bucket.
 */
export function daysBetweenUtcDays(from: string | Date, asOf: string | Date): number {
  const start = Date.parse(`${utcDayKey(from)}T00:00:00.000Z`);
  const end = Date.parse(`${utcDayKey(asOf)}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Current = 0-30 (B20: "Current" means 0-30 days); then 31-60, 61-90, over 90. */
export function agingBucketForDays(days: number): AgingBucket {
  if (days <= 30) return "CURRENT";
  if (days <= 60) return "DAYS_31_60";
  if (days <= 90) return "DAYS_61_90";
  return "OVER_90";
}

/** The older of two buckets, by position in AGING_BUCKETS. */
export function olderAgingBucket(a: AgingBucket | null, b: AgingBucket | null): AgingBucket | null {
  if (!a) return b;
  if (!b) return a;
  return AGING_BUCKETS.indexOf(a) >= AGING_BUCKETS.indexOf(b) ? a : b;
}

/** What the aging needs from an invoice row - a subset of the schema's Invoice, dates as ISO strings or Dates. */
export interface AgingInvoiceInput {
  id: string;
  invoiceNumber: string;
  customerId: string;
  locationId: string | null;
  status: string;
  issuedAt: string | Date | null;
  totalAmountCents: number;
  balanceDueCents: number;
  pendingAppliedCents: number;
}

/** One unapplied source (a payment or a credit memo with value left to apply), placed at its location. */
export interface AgingOnAccountInput {
  customerId: string;
  locationId: string;
  /** Payment status, or "ISSUED" for a credit memo. */
  status: string;
  unappliedCents: number;
}

/** An issued invoice with a balance, placed in its bucket. */
export interface AgedInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  locationId: string | null;
  /** ISO instant - the invoice date the row is aged from. */
  issuedAt: string;
  totalAmountCents: number;
  balanceDueCents: number;
  /** Applied from PENDING payments, awaiting confirmation: shown, not counted (D5). */
  pendingAppliedCents: number;
  daysSinceInvoiced: number;
  bucket: AgingBucket;
}

export type AgingBucketCents = Record<AgingBucket, number>;

/** The figures for one location, or a rollup of several. Every amount is integer cents. */
export interface AgingFigures {
  /** Sum of balanceDueCents over the aged invoices - equal to the buckets' sum. */
  openBalanceCents: number;
  buckets: AgingBucketCents;
  /** Aged invoices behind the buckets. */
  invoiceCount: number;
  /** The oldest non-empty bucket; null when nothing is owed. */
  oldestBucket: AgingBucket | null;
  /** Applied to the aged invoices from PENDING payments, awaiting confirmation - part of the open balance until confirmed. */
  pendingAppliedCents: number;
  /** Confirmed payments and issued credit memos with value left to apply, at the location(s). Beside the balance, never netted. */
  onAccountCents: number;
  /** Recorded, unconfirmed, unapplied money at the location(s). Beside the balance, never netted. */
  pendingUnappliedCents: number;
}

/** One location's aging with the invoices behind its buckets, oldest first. `locationId` is null for the legacy invoices that carry no location. */
export interface LocationAging extends AgingFigures {
  customerId: string;
  locationId: string | null;
  invoices: AgedInvoice[];
}

/** GET /api/customers/:id/aging - the customer's locations that carry anything, and their rollup. */
export interface CustomerAging {
  customerId: string;
  /** The UTC calendar day the ages were counted to (YYYY-MM-DD). */
  asOf: string;
  rollup: AgingFigures;
  /** Only locations with an aged balance or money on account; a location absent here has neither. Largest open balance first. */
  locations: LocationAging[];
}

export interface AgingReportLocation extends LocationAging {
  name: string | null;
  address: string | null;
  isPrimary: boolean;
}

export interface AgingReportCustomer extends AgingFigures {
  customerId: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  /** Primary first, then largest open balance; a location-less row last. */
  locations: AgingReportLocation[];
}

/** GET /api/reports/aging - the whole org, per customer and per location. */
export interface AgingReport {
  asOf: string;
  totals: AgingFigures;
  /** Only customers with an aged balance or money on account. Largest open balance first, then by name. */
  customers: AgingReportCustomer[];
}

export function emptyAgingBuckets(): AgingBucketCents {
  return { CURRENT: 0, DAYS_31_60: 0, DAYS_61_90: 0, OVER_90: 0 };
}

export function emptyAgingFigures(): AgingFigures {
  return {
    openBalanceCents: 0,
    buckets: emptyAgingBuckets(),
    invoiceCount: 0,
    oldestBucket: null,
    pendingAppliedCents: 0,
    onAccountCents: 0,
    pendingUnappliedCents: 0,
  };
}

/**
 * Place one invoice, or say it does not age: a DRAFT or VOID is not a
 * receivable, an issued invoice with nothing due has nothing to age, and an
 * issued row with no issue date (none exists - every issuing path stamps it,
 * and a DRAFT is the only null) cannot be dated, so it is left out rather
 * than aged from a guess.
 */
export function ageInvoice(invoice: AgingInvoiceInput, asOf: string | Date): AgedInvoice | null {
  if (!isInvoiceIssued(invoice.status) || invoice.balanceDueCents <= 0 || !invoice.issuedAt) {
    return null;
  }
  const issuedAt = new Date(invoice.issuedAt);
  if (Number.isNaN(issuedAt.getTime())) {
    return null;
  }
  const daysSinceInvoiced = daysBetweenUtcDays(issuedAt, asOf);
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    locationId: invoice.locationId ?? null,
    issuedAt: issuedAt.toISOString(),
    totalAmountCents: invoice.totalAmountCents,
    balanceDueCents: invoice.balanceDueCents,
    pendingAppliedCents: invoice.pendingAppliedCents,
    daysSinceInvoiced,
    bucket: agingBucketForDays(daysSinceInvoiced),
  };
}

function addAgedInvoice(figures: AgingFigures, aged: AgedInvoice): void {
  figures.openBalanceCents += aged.balanceDueCents;
  figures.buckets[aged.bucket] += aged.balanceDueCents;
  figures.invoiceCount += 1;
  figures.pendingAppliedCents += aged.pendingAppliedCents;
  figures.oldestBucket = olderAgingBucket(figures.oldestBucket, aged.bucket);
}

/** Confirmed money and issued credit memos are on account; pending money is listed apart; anything else holds no value. */
function addOnAccount(figures: AgingFigures, source: AgingOnAccountInput): void {
  if (source.unappliedCents <= 0) return;
  if (source.status === "PENDING") {
    figures.pendingUnappliedCents += source.unappliedCents;
  } else if (source.status === "CONFIRMED" || source.status === "ISSUED") {
    figures.onAccountCents += source.unappliedCents;
  } else if (paymentHoldsValue(source.status)) {
    figures.onAccountCents += source.unappliedCents;
  }
}

/** Sum figures into a rollup. The oldest bucket is the older of the two; nothing is netted. */
export function mergeAgingFigures(into: AgingFigures, part: AgingFigures): AgingFigures {
  into.openBalanceCents += part.openBalanceCents;
  for (const bucket of AGING_BUCKETS) into.buckets[bucket] += part.buckets[bucket];
  into.invoiceCount += part.invoiceCount;
  into.oldestBucket = olderAgingBucket(into.oldestBucket, part.oldestBucket);
  into.pendingAppliedCents += part.pendingAppliedCents;
  into.onAccountCents += part.onAccountCents;
  into.pendingUnappliedCents += part.pendingUnappliedCents;
  return into;
}

export function rollupAging(parts: AgingFigures[]): AgingFigures {
  return parts.reduce((into, part) => mergeAgingFigures(into, part), emptyAgingFigures());
}

/** The rollup's figures alone - a LocationAging without its invoice list. */
export function agingFiguresOf(figures: AgingFigures): AgingFigures {
  return {
    openBalanceCents: figures.openBalanceCents,
    buckets: { ...figures.buckets },
    invoiceCount: figures.invoiceCount,
    oldestBucket: figures.oldestBucket,
    pendingAppliedCents: figures.pendingAppliedCents,
    onAccountCents: figures.onAccountCents,
    pendingUnappliedCents: figures.pendingUnappliedCents,
  };
}

function locationKey(customerId: string, locationId: string | null): string {
  return `${customerId}\u0000${locationId ?? ""}`;
}

/** Aged invoices: oldest first, then by number, so the first row of a strip is the one to chase. */
export function compareAgedInvoices(a: AgedInvoice, b: AgedInvoice): number {
  return b.daysSinceInvoiced - a.daysSinceInvoiced || a.invoiceNumber.localeCompare(b.invoiceNumber);
}

/** Locations: largest open balance first, then most on account; a location-less row (legacy) last. */
export function compareLocationAging(a: LocationAging, b: LocationAging): number {
  if (!a.locationId !== !b.locationId) return a.locationId ? -1 : 1;
  return b.openBalanceCents - a.openBalanceCents || b.onAccountCents - a.onAccountCents || (a.locationId ?? "").localeCompare(b.locationId ?? "");
}

/**
 * Group what ages and what is on account by (customer, location). Only a
 * location with an aged invoice or unapplied money appears; the caller
 * supplies rows already scoped (to one customer, or to the org) and this
 * function does not re-scope them. An invoice with no location - the legacy
 * manual rows - lands under its customer with `locationId` null so the money
 * is never hidden; every payment and credit memo has a location (D4).
 */
export function summarizeAgingByLocation(
  invoices: AgingInvoiceInput[],
  sources: AgingOnAccountInput[],
  asOf: string | Date,
): LocationAging[] {
  const byLocation = new Map<string, LocationAging>();
  const entryFor = (customerId: string, locationId: string | null): LocationAging => {
    const key = locationKey(customerId, locationId);
    let entry = byLocation.get(key);
    if (!entry) {
      entry = { ...emptyAgingFigures(), customerId, locationId, invoices: [] };
      byLocation.set(key, entry);
    }
    return entry;
  };

  for (const invoice of invoices) {
    const aged = ageInvoice(invoice, asOf);
    if (!aged) continue;
    const entry = entryFor(aged.customerId, aged.locationId);
    entry.invoices.push(aged);
    addAgedInvoice(entry, aged);
  }
  for (const source of sources) {
    if (source.unappliedCents <= 0) continue;
    if (source.status !== "PENDING" && source.status !== "CONFIRMED" && source.status !== "ISSUED") continue;
    addOnAccount(entryFor(source.customerId, source.locationId), source);
  }

  const entries = Array.from(byLocation.values());
  for (const entry of entries) entry.invoices.sort(compareAgedInvoices);
  return entries.sort(compareLocationAging);
}

/** The UTC calendar day a read counts ages to. */
export function agingAsOf(now: Date = new Date()): string {
  return utcDayKey(now);
}
