import cron from "node-cron";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../db";
import { agreements, billingPlans } from "@shared/schema";
import { advanceAgreementDate, computeExpectedServiceCount, createOrgScopedStorage } from "../storage";

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
      if (!plan || plan.chargeTrigger !== "ON_SCHEDULE") {
        result.skipped += 1;
        continue;
      }

      // PER_SERVICE is inherently service-driven, never schedule-driven
      // (path 1, already covered by generateInvoiceFromServiceRecord).
      // INSTALLMENT needs its own count/remaining-balance tracking, deferred
      // to a future pass rather than approximated here.
      if (plan.billingMode !== "RECURRING_INTERVAL" && plan.billingMode !== "PREPAID_TERM") {
        result.skipped += 1;
        continue;
      }

      const periodKey = agreement.nextBillingDate;
      let amountCents: number;
      let nextBillingDate: string | null;

      if (plan.billingMode === "PREPAID_TERM") {
        amountCents = agreement.priceCents;
        nextBillingDate = null;
      } else {
        const intervalUnit = plan.intervalUnit ?? "MONTH";
        const intervalCount = plan.intervalCount ?? 1;
        const expectedBillingCount = computeExpectedServiceCount(
          agreement.startDate,
          agreement.termUnit,
          agreement.termInterval,
          intervalUnit,
          intervalCount,
        );
        amountCents = Math.round(agreement.priceCents / expectedBillingCount);

        const termEndDate = advanceAgreementDate(agreement.startDate, agreement.termUnit, agreement.termInterval);
        const candidateNext = advanceAgreementDate(periodKey, intervalUnit, intervalCount);
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
