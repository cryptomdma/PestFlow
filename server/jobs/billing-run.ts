import cron from "node-cron";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../db";
import { agreements, billingPlans } from "@shared/schema";
import { isScheduleBilledPlan, resolveBillingPlanCharge } from "@shared/billing-plan";
import { advanceAgreementDate, createOrgScopedStorage } from "../storage";

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface BillingRunResult {
  due: number;
  invoiced: number;
  skipped: number;
  errors: number;
}

// PLAN_BILLING_V1.md §1.6 path 2 - the primary path for agreement revenue.
// An agreement sells coverage; it's billed on the plan's schedule whether
// or not a technician showed up. Must be idempotent per (agreement x
// period) and safe to re-run after a failure - enforced by the permanent
// unique index on billing_events(agreementId, periodKey), not by anything
// in this function's own control flow, so a crash mid-run and a re-trigger
// both resolve correctly on the next pass.
export async function runBillingCycle(): Promise<BillingRunResult> {
  const today = todayDateOnly();
  const dueAgreements = await db
    .select()
    .from(agreements)
    .where(and(eq(agreements.status, "ACTIVE"), isNotNull(agreements.nextBillingDate), lte(agreements.nextBillingDate, today)));

  const result: BillingRunResult = { due: dueAgreements.length, invoiced: 0, skipped: 0, errors: 0 };

  for (const agreement of dueAgreements) {
    try {
      if (!agreement.billingPlanId || agreement.priceCents == null || !agreement.nextBillingDate) {
        result.skipped += 1;
        continue;
      }

      const [plan] = await db.select().from(billingPlans).where(and(eq(billingPlans.orgId, agreement.orgId), eq(billingPlans.id, agreement.billingPlanId)));

      // Skipped here means "the visit invoice charges for this instead" -
      // PER_SERVICE is inherently service-driven (path 1, handled by
      // generateInvoiceFromServiceRecord), ON_AGREEMENT_START charges once up
      // front, and INSTALLMENT needs its own remaining-balance tracking,
      // deferred rather than approximated here. Both sides read this one
      // predicate so a plan can never be skipped by both of them.
      if (!isScheduleBilledPlan(plan)) {
        result.skipped += 1;
        continue;
      }

      const periodKey = agreement.nextBillingDate;

      // The amount is resolveBillingPlanCharge's (shared/billing-plan.ts):
      // the contract price REMAINING after the initial charge (D4, owner
      // review: a down payment counts toward the price - $400 with $100 down
      // leaves $300 for the schedule), spread over the term's billing periods,
      // one fewer when the plan's up-front money buys period 1. Shared with
      // the agreement card's pill (D6) so what the office sees is what this
      // run bills. PER_VISIT cannot occur past the predicate above and a null
      // amount cannot occur past the price check; both are kept as skips
      // rather than assumed away.
      const charge = resolveBillingPlanCharge(plan, agreement);
      if (charge.kind === "PER_VISIT" || charge.amountCents == null) {
        result.skipped += 1;
        continue;
      }
      const amountCents = charge.amountCents;
      let nextBillingDate: string | null;

      if (charge.kind === "ONCE") {
        nextBillingDate = null;
      } else {
        const termEndDate = advanceAgreementDate(agreement.startDate, agreement.termUnit, agreement.termInterval);
        const candidateNext = advanceAgreementDate(periodKey, charge.intervalUnit, charge.intervalCount);
        nextBillingDate = candidateNext < termEndDate ? candidateNext : null;
      }

      const storage = createOrgScopedStorage(agreement.orgId);
      await storage.generateScheduleDrivenInvoice({
        agreementId: agreement.id,
        periodKey,
        amountCents,
        nextBillingDate,
      });
      result.invoiced += 1;
    } catch (err) {
      result.errors += 1;
      console.error(`Billing run error for agreement ${agreement.id}:`, err);
    }
  }

  return result;
}

export function scheduleBillingRun(): void {
  cron.schedule("0 2 * * *", () => {
    runBillingCycle()
      .then((result) => console.log(`Billing run complete: ${JSON.stringify(result)}`))
      .catch((err) => console.error("Billing run failed:", err));
  });
}
