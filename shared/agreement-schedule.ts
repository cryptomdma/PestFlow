// Calendar arithmetic for an agreement's term, service recurrence and billing
// cadence. Moved here from server/storage.ts in Pass 7 (PLAN_BILLING_V1_1.md
// D6) so the client can show a billing plan's per-period amount with the
// exact arithmetic the nightly run charges by - a second implementation on
// the client is how a card would say "Monthly - $50" while the run bills $55.
// server/storage.ts re-exports both public functions for its existing callers.

/** Date-only string arithmetic in UTC, so a date never shifts by a timezone. */
export function addDays(dateOnly: string, days: number) {
  const next = new Date(`${dateOnly}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function addMonths(dateOnly: string, months: number) {
  const next = new Date(`${dateOnly}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString().slice(0, 10);
}

// Steps a date-only string by one recurrence, with the same calendar
// arithmetic for service generation, expectedServiceCount and the billing
// cadence, rather than a second, potentially-diverging implementation.
//
// One vocabulary feeds this since Pass 35 (PLAN_ROADMAP_V2.md C5.3): the
// agreement's term and service recurrence (agreements.termUnit /
// recurrenceUnit and the templates' defaults) and the billing cadence
// (billingPlans.intervalUnit) all offer DAY | WEEK | MONTH | QUARTER | YEAR
// (shared/agreement-types.ts AGREEMENT_UNITS). History: DAY and WEEK once
// had no case here and fell through to `default`, silently advancing by a
// MONTH - a daily plan on a one-year term billed 12 periods instead of 365,
// so computeExpectedServiceCount() divided the contract price by 12 and
// every charge was ~30x the correct amount; Pass 3.5 added the two cases.
// The agreement side then offered MONTH | QUARTER | YEAR | CUSTOM, with
// CUSTOM stepping by days here and nothing in the UI saying so; the Pass 35
// bootstrap rewrote every CUSTOM(N) row as DAY(N) and the routes refuse
// CUSTOM since, so there is no CUSTOM case: an unknown unit is a MONTH.
export function advanceAgreementDate(dateOnly: string, recurrenceUnit: string, recurrenceInterval: number) {
  const step = Math.max(recurrenceInterval || 1, 1);

  switch (recurrenceUnit) {
    case "DAY":
      return addDays(dateOnly, step);
    case "WEEK":
      return addDays(dateOnly, step * 7);
    case "QUARTER":
      return addMonths(dateOnly, step * 3);
    case "YEAR":
      return addMonths(dateOnly, step * 12);
    case "MONTH":
    default:
      return addMonths(dateOnly, step);
  }
}

// How many times generateServiceForAgreement would actually fire between
// startDate and the term end, at the given recurrence cadence. Reuses
// advanceAgreementDate for both so this count always matches the real
// generation cadence, including its MONTH/QUARTER/YEAR calendar-month
// arithmetic (not a fixed-days approximation). Also the number of billing
// periods in a term when called with the plan's interval instead of the
// service recurrence, and the one-time backfill for agreements created
// before expectedServiceCount existed - see server/production-value-backfill.ts.
export function computeExpectedServiceCount(
  startDate: string,
  termUnit: string,
  termInterval: number,
  recurrenceUnit: string,
  recurrenceInterval: number,
): number {
  const termEndDate = advanceAgreementDate(startDate, termUnit, Math.max(termInterval || 1, 1));

  let count = 0;
  let cursor = startDate;
  while (cursor < termEndDate) {
    count += 1;
    cursor = advanceAgreementDate(cursor, recurrenceUnit, recurrenceInterval);
  }

  return Math.max(count, 1);
}
