import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapServiceSchedulingFoundation(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS technicians (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL,
      license_id text NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      email text,
      phone text,
      color text,
      notes text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS technicians_status_idx ON technicians (status)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS services (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id varchar NOT NULL REFERENCES customers(id),
      location_id varchar NOT NULL REFERENCES locations(id),
      agreement_id varchar,
      service_type_id varchar REFERENCES service_types(id),
      due_date date,
      expected_duration_minutes integer,
      price numeric(10, 2),
      status text NOT NULL DEFAULT 'PENDING_SCHEDULING',
      assigned_technician_id varchar REFERENCES technicians(id),
      source text NOT NULL DEFAULT 'MANUAL',
      notes text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS services_location_id_idx ON services (location_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS services_status_idx ON services (status)`);

  await db.execute(sql`ALTER TABLE service_types ADD COLUMN IF NOT EXISTS opportunity_lead_days integer`);
  await db.execute(sql`ALTER TABLE service_types ADD COLUMN IF NOT EXISTS opportunity_label text`);

  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS appointment_id varchar`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_id varchar`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assigned_technician_id varchar`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS lock_time boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS lock_technician boolean NOT NULL DEFAULT false`);

  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS service_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS technician_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS technician_license_number text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS notes text`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS opportunities (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id varchar NOT NULL REFERENCES locations(id),
      source_service_id varchar REFERENCES services(id),
      source_service_record_id varchar REFERENCES service_records(id),
      service_type_id varchar REFERENCES service_types(id),
      opportunity_type text,
      due_date date NOT NULL,
      status text NOT NULL DEFAULT 'OPEN',
      notes text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunities_location_id_idx ON opportunities (location_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunities_status_idx ON opportunities (status)`);
}
