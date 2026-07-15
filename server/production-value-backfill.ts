import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { agreements } from "@shared/schema";
import { computeExpectedServiceCount } from "./storage";

// One-time backfill for agreements created before expectedServiceCount
// existed. Uses the exact same computeExpectedServiceCount as new agreement
// creation, so a pre-existing agreement's snapshot matches what it would
// have gotten had it been created after this migration. Idempotent: only
// touches rows where expected_service_count is still null, so once backfilled
// a row is never recomputed here again - consistent with the field being a
// creation-time snapshot, not a live value.
export async function backfillExpectedServiceCounts(): Promise<void> {
  const rows = await db.select().from(agreements).where(isNull(agreements.expectedServiceCount));

  for (const agreement of rows) {
    const expectedServiceCount = computeExpectedServiceCount(
      agreement.startDate,
      agreement.termUnit,
      agreement.termInterval,
      agreement.recurrenceUnit,
      agreement.recurrenceInterval,
    );

    await db
      .update(agreements)
      .set({ expectedServiceCount })
      .where(and(eq(agreements.orgId, agreement.orgId), eq(agreements.id, agreement.id)));
  }
}
