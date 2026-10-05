import { sql } from "drizzle-orm";
import { db } from "./db";

// Pass 32 (PLAN_ROADMAP_V2.md C5.1a; PLAN_BILLING_V1_1.md D7): the one index
// the audit reads need. `audit_logs` itself comes from db:push (shared/schema.ts)
// and its org_id index from the tenancy bootstrap; both History reads filter on
// (org_id, entity_type, entity_id IN ...), which until this pass walked the
// org's whole table. Additive and idempotent, so it is safe to run under a
// server still on the previous code.
export async function bootstrapAudit(): Promise<void> {
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (org_id, entity_type, entity_id)`);
}
