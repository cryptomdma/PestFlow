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
      generated_for_date date,
      service_window_start date,
      service_window_end date,
      expected_duration_minutes integer,
      price numeric(10, 2),
      status text NOT NULL DEFAULT 'PENDING_SCHEDULING',
      assigned_technician_id varchar REFERENCES technicians(id),
      source text NOT NULL DEFAULT 'MANUAL',
      scheduling_mode text,
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
  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS time_window text`);
  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS generated_for_date date`);
  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS service_window_start date`);
  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS service_window_end date`);
  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS scheduling_mode text`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS services_agreement_generated_for_date_idx ON services (agreement_id, generated_for_date) WHERE agreement_id IS NOT NULL AND generated_for_date IS NOT NULL`);
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
      agreement_id varchar REFERENCES agreements(id),
      source_service_id varchar REFERENCES services(id),
      source_service_record_id varchar REFERENCES service_records(id),
      service_type_id varchar REFERENCES service_types(id),
      source text NOT NULL DEFAULT 'NON_CONTRACT_FOLLOW_UP',
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
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS agreement_id varchar REFERENCES agreements(id)`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'NON_CONTRACT_FOLLOW_UP'`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunities_agreement_source_service_idx ON opportunities (agreement_id, source_service_id) WHERE agreement_id IS NOT NULL AND source_service_id IS NOT NULL`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS next_action_date date`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_disposition_key text`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_disposition_label text`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_disposition_at timestamp`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_contacted_at timestamp`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS converted_service_id varchar REFERENCES services(id)`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contacted_at timestamp`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS dismissed_at timestamp`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS dismissed_reason text`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assigned_user_id varchar`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assigned_at timestamp`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS opportunity_dispositions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL UNIQUE,
      label text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      default_callback_days integer,
      resulting_status text NOT NULL DEFAULT 'OPEN',
      is_terminal boolean NOT NULL DEFAULT false,
      is_do_not_contact boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunity_dispositions_active_idx ON opportunity_dispositions (is_active)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS opportunity_activities (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id varchar NOT NULL REFERENCES opportunities(id),
      disposition_key text,
      disposition_label text,
      notes text,
      next_action_date date,
      created_by_user_id varchar,
      created_by_label text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunity_activities_opportunity_id_idx ON opportunity_activities (opportunity_id)`);
  await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS opportunity_id varchar REFERENCES opportunities(id)`);
  await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS opportunity_activity_id varchar REFERENCES opportunity_activities(id)`);
  await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS next_action_date date`);
  await db.execute(sql`ALTER TABLE communications ADD COLUMN IF NOT EXISTS actor_label text`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS communications_opportunity_activity_id_uidx ON communications (opportunity_activity_id) WHERE opportunity_activity_id IS NOT NULL`);

  await db.execute(sql`
    INSERT INTO opportunity_dispositions (key, label, is_active, default_callback_days, resulting_status, is_terminal, is_do_not_contact, sort_order)
    VALUES
      ('INTERESTED', 'Interested', true, 3, 'OPEN', false, false, 10),
      ('CALL_BACK', 'Call Back', true, 7, 'OPEN', false, false, 20),
      ('NOT_INTERESTED_AT_THIS_TIME', 'Not Interested At This Time', true, 90, 'OPEN', false, false, 30),
      ('LEFT_VOICEMAIL', 'Left Voicemail', true, 7, 'OPEN', false, false, 40),
      ('NO_ANSWER', 'No Answer', true, 2, 'OPEN', false, false, 50),
      ('BAD_NUMBER', 'Bad Number', true, null, 'DISMISSED', true, false, 60),
      ('MOVED', 'Moved', true, null, 'DISMISSED', true, false, 70),
      ('DO_NOT_CONTACT', 'Do Not Contact', true, null, 'DISMISSED', true, true, 80),
      ('SWITCHED_TO_COMPETITOR', 'Switched to Competitor', true, 90, 'OPEN', false, false, 90),
      ('CONVERTED_TO_SERVICE', 'Converted to Service', true, null, 'CONVERTED', true, false, 100),
      ('REMOVE_FROM_QUEUE', 'Remove From Queue', true, null, 'DISMISSED', true, false, 110)
    ON CONFLICT (key) DO NOTHING
  `);

  await db.execute(sql`UPDATE opportunities SET next_action_date = COALESCE(next_action_date, due_date) WHERE next_action_date IS NULL`);
}
