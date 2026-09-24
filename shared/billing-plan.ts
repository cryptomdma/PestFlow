// The one place that answers "does the nightly billing run bill this plan?"
//
// Two code paths depend on the answer and must never disagree: the nightly run
// (server/jobs/billing-run.ts) uses it to decide what to charge, and visit
// invoice generation (generateInvoiceFromServiceRecord) uses it to decide which
// service lines are $0 AGREEMENT_COVERED. If they drift apart, work is either
// billed twice or billed by nobody - and "billed by nobody" is silent, which is
// why this predicate lives in one shared function instead of being spelled out
// at both call sites.

import { computeExpectedServiceCount } from "./agreement-schedule";
import { initialChargeSkipsFirstPeriod, resolveRemainingContractPriceCents, type InitialChargeFields } from "./initial-charge";
import { computeProductionValueCents } from "./production-value";
import { formatCentsCompact } from "./money";

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
 * - no plan: unreachable for an Agreement since Pass 12 (`billingPlanId` is
 *   NOT NULL); kept for a plan row that fails to load and for a template
 *   with no default, and still answered as COD - charging per visit is the
 *   visible failure and $0 is the silent one.
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
    return "No billing plan chosen. Every agreement needs one: a COD plan bills each visit on its own invoice at contract price divided by expected visits, a recurring plan bills on its cadence, and a Prepaid Term plan bills the whole agreement up front.";
  }

  if (isScheduleBilledPlan(plan)) {
    if (plan.billingMode === "PREPAID_TERM") {
      return "Paid in full: the whole contract price is billed once, when the agreement starts, by the nightly billing run - whatever the term length. Every visit then appears on its invoice at $0.";
    }

    const count = plan.intervalCount ?? 1;
    const unit = (plan.intervalUnit ?? "MONTH").toLowerCase();
    return `Billed every ${count} ${unit}${count === 1 ? "" : "s"} by the nightly billing run. Visits appear on the visit invoice at $0.`;
  }

  if (plan.billingMode === "INSTALLMENT") {
    return "Installment billing is not built yet - until it is, each visit is billed on its own invoice (COD).";
  }

  if (plan.chargeTrigger === "ON_AGREEMENT_START") {
    return "Charge-at-agreement-start is not built yet - until it is, each visit is billed on its own invoice (COD).";
  }

  return "Each visit is billed on its own invoice (COD) - the service's own price, or the contract price divided by expected visits. To bill the whole agreement up front instead, choose a Prepaid Term plan.";
}

/** What resolveBillingPlanCharge reads from a plan: the predicate's fields, the cadence, and the first-period flag. A live BillingPlan row satisfies it. */
export interface BillingPlanChargeFields extends BillingPlanBehaviorFields {
  name: string;
  initialChargeCoversFirstPeriod: boolean;
}

/** What it reads from the agreement: the contract price, the initial charge that counts against it, and the term the periods fit in. An Agreement row satisfies it. */
export interface AgreementChargeFields extends InitialChargeFields {
  priceCents: number | null;
  startDate: string;
  termUnit: string;
  termInterval: number;
  expectedServiceCount: number | null;
}

export type BillingPlanCharge =
  | { kind: "PER_PERIOD"; amountCents: number | null; periods: number; intervalUnit: string; intervalCount: number }
  | { kind: "ONCE"; amountCents: number | null }
  | { kind: "PER_VISIT"; amountCents: number | null };

/**
 * How much this plan charges this agreement, and how often. This IS the
 * nightly run's arithmetic - server/jobs/billing-run.ts takes its amount from
 * here - shared so the agreement card's pill (PLAN_BILLING_V1_1.md D6,
 * "Monthly - $50") shows the number the run will actually bill, never a
 * client-side approximation of it.
 *
 * - PER_PERIOD (RECURRING_INTERVAL on schedule): the contract price REMAINING
 *   after the initial charge (D4: a down payment counts toward the price),
 *   spread over the term's billing periods - one fewer when the plan says the
 *   up-front money buys period 1 (initialChargeSkipsFirstPeriod).
 * - ONCE (PREPAID_TERM): the remaining price, billed once at start.
 * - PER_VISIT (every other plan, and no plan): the visit is the billing event,
 *   at remaining price / expected visits - resolveServiceLineBillingTx's own
 *   fallback when the service carries no price. A price stamped on a
 *   particular service overrides this on that visit; the pill shows the default.
 *
 * amountCents is null when there is no contract price to bill from.
 */
export function resolveBillingPlanCharge(
  plan: BillingPlanChargeFields | null | undefined,
  agreement: AgreementChargeFields,
): BillingPlanCharge {
  const remainingCents = resolveRemainingContractPriceCents(agreement, agreement.priceCents);

  if (!plan || !isScheduleBilledPlan(plan)) {
    return { kind: "PER_VISIT", amountCents: computeProductionValueCents(remainingCents, agreement.expectedServiceCount) };
  }

  if (plan.billingMode === "PREPAID_TERM") {
    return { kind: "ONCE", amountCents: remainingCents };
  }

  const intervalUnit = plan.intervalUnit ?? "MONTH";
  const intervalCount = plan.intervalCount ?? 1;
  const expectedBillingCount = computeExpectedServiceCount(agreement.startDate, agreement.termUnit, agreement.termInterval, intervalUnit, intervalCount);
  const periods = Math.max(expectedBillingCount - (initialChargeSkipsFirstPeriod(plan, agreement) ? 1 : 0), 1);
  return {
    kind: "PER_PERIOD",
    amountCents: remainingCents == null ? null : Math.round(remainingCents / periods),
    periods,
    intervalUnit,
    intervalCount,
  };
}

const CADENCE_ABBREVIATIONS: Record<string, string> = {
  DAY: "day",
  WEEK: "wk",
  MONTH: "mo",
  QUARTER: "qtr",
  YEAR: "yr",
};

function cadenceSuffix(intervalUnit: string, intervalCount: number): string {
  const unit = CADENCE_ABBREVIATIONS[intervalUnit] ?? intervalUnit.toLowerCase();
  return intervalCount === 1 ? `/${unit}` : `/${intervalCount} ${unit}`;
}

export interface BillingPlanPill {
  /** "Monthly - $50/mo", "Prepaid Term - $400 once", "COD - $75/visit", "No billing plan - $75/visit". */
  label: string;
  /** The full behavior sentence, for a tooltip. */
  title: string;
}

/**
 * D6's billing-plan pill: plan name + periodic amount, on the agreement card
 * and the location screen. Plans attach to AGREEMENTS - a customer or a
 * location is never "monthly" or "COD" as a whole, which is why this takes an
 * agreement and not a location. Every agreement carries a plan since Pass 12;
 * the null branch is for a plan row the caller could not load, and stays honest.
 */
export function describeBillingPlanPill(
  plan: BillingPlanChargeFields | null | undefined,
  agreement: AgreementChargeFields,
): BillingPlanPill {
  const charge = resolveBillingPlanCharge(plan, agreement);
  const name = plan?.name ?? "No billing plan";
  const title = describeBillingPlanBehavior(plan);
  if (charge.amountCents == null) {
    return { label: `${name} · price not set`, title };
  }
  const amount = formatCentsCompact(charge.amountCents);
  switch (charge.kind) {
    case "PER_PERIOD":
      return {
        label: `${name} · ${amount}${cadenceSuffix(charge.intervalUnit, charge.intervalCount)}`,
        title: `${title} ${charge.periods} billing period${charge.periods === 1 ? "" : "s"} in the term.`,
      };
    case "ONCE":
      return { label: `${name} · ${amount} once`, title };
    case "PER_VISIT":
    default:
      return { label: `${name} · ${amount}/visit`, title };
  }
}

/** What an Agreement freezes about its plan when the plan is attached - the live row's terms, read by buildBillingPlanSnapshot. */
export interface BillingPlanSnapshotFields extends BillingPlanChargeFields {
  id: string;
  installmentCount: number | null;
  anchorMode: string;
  anchorDay: number | null;
  prorationRule: string;
  fieldAddableSurcharge: boolean;
}

// A type alias rather than an interface so it stays assignable to the loose
// Record<string, unknown> the snapshot column and its resolver are typed as.
export type BillingPlanSnapshot = {
  planId: string;
  name: string;
  chargeTrigger: string;
  billingMode: string;
  intervalUnit: string | null;
  intervalCount: number | null;
  installmentCount: number | null;
  anchorMode: string;
  anchorDay: number | null;
  prorationRule: string;
  initialChargeCoversFirstPeriod: boolean;
  fieldAddableSurcharge: boolean;
  snapshottedAt: string;
};

/**
 * The terms an agreement was sold under, frozen at plan attachment and never
 * rewritten by an unrelated edit (agreements.billingPlanSnapshot). One builder
 * for every writer: agreement creation and the plan-change path in
 * server/storage.ts, and the Pass 12 migration in agreement-bootstrap.ts that
 * attached the required plan to the rows created before it was required.
 *
 * The initial charge (type / amount / collector) is not a plan fact and is not
 * carried here - it lives on the agreement's own columns (PLAN_BILLING_V1_1.md
 * D4). Snapshots written before Pass 5.5 still hold the old keys as frozen
 * history; nothing reads them.
 */
export function buildBillingPlanSnapshot(plan: BillingPlanSnapshotFields | null | undefined, snapshottedAt: Date = new Date()): BillingPlanSnapshot | null {
  if (!plan) return null;
  return {
    planId: plan.id,
    name: plan.name,
    chargeTrigger: plan.chargeTrigger,
    billingMode: plan.billingMode,
    intervalUnit: plan.intervalUnit ?? null,
    intervalCount: plan.intervalCount ?? null,
    installmentCount: plan.installmentCount,
    anchorMode: plan.anchorMode,
    anchorDay: plan.anchorDay,
    prorationRule: plan.prorationRule,
    initialChargeCoversFirstPeriod: plan.initialChargeCoversFirstPeriod,
    fieldAddableSurcharge: plan.fieldAddableSurcharge,
    snapshottedAt: snapshottedAt.toISOString(),
  };
}
