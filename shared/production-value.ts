// Production value = contract price / expected scheduled service count, per
// PLAN_BILLING_V1.md §1.1. Computed at read time, never stored, so an
// agreement price edit is reflected immediately on every pending
// agreement-generated service without touching any service row.
export function computeProductionValueCents(
  contractPriceCents: number | null | undefined,
  expectedServiceCount: number | null | undefined,
): number | null {
  if (contractPriceCents == null || !expectedServiceCount || expectedServiceCount <= 0) {
    return null;
  }

  return Math.round(contractPriceCents / expectedServiceCount);
}
