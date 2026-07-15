import { sql } from "drizzle-orm";
import { db } from "./db";

// outbox_events is a brand-new table with no legacy rows, so org_id can be
// NOT NULL from creation - no nullable-then-backfill step needed here,
// unlike the tenancy rollout in tenancy-bootstrap.ts.
export async function bootstrapOutbox(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS outbox_events (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      port text NOT NULL,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      created_at timestamp NOT NULL DEFAULT now(),
      processed_at timestamp
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS outbox_events_status_idx ON outbox_events (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS outbox_events_org_id_idx ON outbox_events (org_id)`);
}
