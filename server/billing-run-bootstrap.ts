import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapBillingRun(): Promise<void> {
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS next_billing_date date`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_events (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      agreement_id varchar NOT NULL REFERENCES agreements(id),
      source text NOT NULL,
      period_key text NOT NULL,
      amount_cents integer NOT NULL,
      invoice_id varchar REFERENCES invoices(id),
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_events_org_id_idx ON billing_events (org_id)`);
  // Idempotency guarantee for the nightly run: a double-run or manual
  // re-trigger can never bill the same agreement's period twice. Permanent
  // (not partial/voidable like the invoice index) - once a period is
  // billed, corrections happen at the invoice level, not by re-billing.
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS billing_events_agreement_period_uidx ON billing_events (agreement_id, period_key)`);
}
