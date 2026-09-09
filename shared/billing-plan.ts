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

export interface BillingPlanBehaviorFields extends ScheduleBilledPlanFields {
  intervalUnit?: string | null;
  intervalCount?: number | null;
}

/**
 * One sentence saying what actually happens to money under this plan, shown
 * under the Billing Plan selector on the agreement and agreement-template
 * forms so the office can tell a schedule-billed plan from a COD one without
 * opening Settings.
 *
 * Deliberately describes the code that exists rather than the plan's stated
 * intent: `ON_AGREEMENT_START` and `INSTALLMENT` have no charge-emitting path
 * anywhere yet, so an agreement carrying one is billed at the visit like any
 * other non-schedule-billed plan, and a selector that implied otherwise would
 * be exactly the misleading control dev behavior rule 6 forbids.
 */
export function describeBillingPlanBehavior(plan: BillingPlanBehaviorFields | null | undefined): string {
  if (!plan) {
    return "No billing plan - every visit is billed at contract price / expected visits (COD).";
  }

  if (isScheduleBilledPlan(plan)) {
    if (plan.billingMode === "PREPAID_TERM") {
      return "Billed once for the full contract term by the nightly billing run. Visits appear on the visit invoice at $0.";
    }

    const count = plan.intervalCount ?? 1;
    const unit = (plan.intervalUnit ?? "MONTH").toLowerCase();
    return `Billed every ${count} ${unit}${count === 1 ? "" : "s"} by the nightly billing run. Visits appear on the visit invoice at $0.`;
  }

  if (plan.billingMode === "INSTALLMENT") {
    return "Installment billing is not built yet - until it is, every visit is billed (COD).";
  }

  if (plan.chargeTrigger === "ON_AGREEMENT_START") {
    return "Charge-at-agreement-start is not built yet - until it is, every visit is billed (COD).";
  }

  return "Every visit is billed (COD) - the visit invoice carries the full amount.";
}
