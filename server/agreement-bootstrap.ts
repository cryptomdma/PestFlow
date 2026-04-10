import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapAgreements(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agreements (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id varchar NOT NULL REFERENCES customers(id),
      location_id varchar NOT NULL REFERENCES locations(id),
      agreement_name text NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      agreement_type text,
      start_date date NOT NULL,
      renewal_date date,
      next_service_date date NOT NULL,
      billing_frequency text,
      price numeric(10, 2),
      recurrence_unit text NOT NULL DEFAULT 'MONTH',
      recurrence_interval integer NOT NULL DEFAULT 1,
      generation_lead_days integer NOT NULL DEFAULT 14,
      service_window_days integer,
      service_type_id varchar REFERENCES service_types(id),
      service_template_name text,
      default_duration_minutes integer,
      service_instructions text,
      contract_url text,
      contract_uploaded_at timestamp,
      contract_signed_at timestamp,
      notes text,
      created_by_user_id varchar,
      updated_by_user_id varchar,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreements_location_id_idx ON agreements (location_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreements_status_idx ON agreements (status)`);

  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS agreement_id varchar`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text DEFAULT 'MANUAL'`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS generated_for_date date`);
  await db.execute(sql`UPDATE appointments SET source = 'MANUAL' WHERE source IS NULL`);
}
