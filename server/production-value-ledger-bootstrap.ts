import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapProductionValueLedger(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS production_value_entries (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      service_record_id varchar NOT NULL REFERENCES service_records(id),
      technician_id varchar,
      technician_name text,
      agreement_id varchar REFERENCES agreements(id),
      service_type_id varchar REFERENCES service_types(id),
      basis text NOT NULL,
      production_value_cents integer NOT NULL,
      contract_price_cents_snapshot integer,
      expected_service_count_snapshot integer,
      finalized_at timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS production_value_entries_org_id_idx ON production_value_entries (org_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS production_value_entries_agreement_id_idx ON production_value_entries (agreement_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS production_value_entries_technician_id_idx ON production_value_entries (technician_id)`);
  // One primary allocation entry per finalized Service Record - a
  // reopen-then-refinalize cycle must never double-count it. SURCHARGE is
  // excluded: it's a separate, additive credit that can coexist with the
  // record's main allocation entry.
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS production_value_entries_record_uidx ON production_value_entries (service_record_id) WHERE basis != 'SURCHARGE'`);
}
