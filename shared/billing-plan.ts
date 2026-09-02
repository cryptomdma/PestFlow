// The one place that answers "does the nightly billing run bill this plan?"
//
// Two code paths depend on the answer and must never disagree: the nightly run
// (server/jobs/billing-run.ts) uses it to decide what to charge, and visit
// invoice generation (generateInvoiceFromServiceRecord) uses it to decide which
// service lines are $0 AGREEMENT_COVERED. If they drift apart, work is either
// billed twice or billed by nobody - and "billed by nobody" is silent, which is
// why this predicate lives in one shared function instead of being spelled out
// at both call sites.

export interface ScheduleBilledPlanFields {
  chargeTrigger: string;
  billingMode: string;
}

/**
 * True when the agreement's Billing Plan is billed on a schedule by the nightly
 * run, which makes its services $0 on the visit invoice (coverage is already
 * paid for on the plan's own cadence).
 *
 * False for every other plan - and for no plan at all - which makes the visit
 * itself the billing event:
 * - `ON_SERVICE_COMPLETION` / `PER_SERVICE`: COD, charged per visit
 * - `ON_AGREEMENT_START`: charged once up front, not per period
 * - `INSTALLMENT`: needs its own remaining-balance tracking, not built yet
 * - no plan: transitional, treated as COD. Every agreement is meant to carry a
 *   plan; until `billingPlanId` is required, charging per visit is the visible
 *   failure and $0 is the silent one.
 */
export function isScheduleBilledPlan(plan: ScheduleBilledPlanFields | null | undefined): boolean {
  if (!plan) {
    return false;
  }

  return plan.chargeTrigger === "ON_SCHEDULE" && (plan.billingMode === "RECURRING_INTERVAL" || plan.billingMode === "PREPAID_TERM");
}
