import { sql } from "drizzle-orm";
import { db } from "./db";
import { OPPORTUNITY_CATEGORY_SEED, taxonomyForSource } from "@shared/opportunities";

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
      user_id varchar REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS technicians_status_idx ON technicians (status)`);
  // Pass 12 (PLAN_ROADMAP_V2.md C2.2): the bridge from a technician profile
  // to its login identity, nullable, at most one technician per user. The
  // owner's decision is one users table for everyone (C5.7, Pass 38, which
  // rewires every technician FK and uses this column as its key); until then
  // this is what lets a technician's production credit (technicianId) and
  // their sale credit (agreements.soldByUserId, a users FK) meet on one
  // person. users exists by now: auth-bootstrap runs before this one.
  await db.execute(sql`ALTER TABLE technicians ADD COLUMN IF NOT EXISTS user_id varchar REFERENCES users(id)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS technicians_user_id_uidx ON technicians (user_id) WHERE user_id IS NOT NULL`);

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
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_in_at timestamp`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_out_at timestamp`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes integer`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_in_lat numeric(10, 7)`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_in_lng numeric(10, 7)`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_out_lat numeric(10, 7)`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_out_lng numeric(10, 7)`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_reason text`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_notes text`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_requested_at timestamp`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_requested_by_label text`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reschedule_requested boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reschedule_requested_at timestamp`);

  // appointments.status had no server-side enum until D1a, so it accepted any
  // caller-supplied string and drifted to lowercase. Normalize the legacy
  // vocabulary onto SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED. Idempotent:
  // once a row is uppercased no WHERE clause matches it again. The orphan
  // 'pending' value was a dropdown option with no distinct meaning - an
  // appointment row only exists once dispatch places it on a real date, so
  // "not fully scheduled yet" is services.status = 'PENDING_SCHEDULING', not an
  // appointment state (PLAN_BILLING_V1_1_EXECUTION.md §5 Q4).
  await db.execute(sql`UPDATE appointments SET status = 'SCHEDULED' WHERE status = 'scheduled'`);
  await db.execute(sql`UPDATE appointments SET status = 'IN_PROGRESS' WHERE status = 'in_progress'`);
  await db.execute(sql`UPDATE appointments SET status = 'COMPLETED' WHERE status = 'completed'`);
  await db.execute(sql`UPDATE appointments SET status = 'CANCELED' WHERE status = 'canceled'`);
  await db.execute(sql`UPDATE appointments SET status = 'SCHEDULED' WHERE status = 'pending'`);
  await db.execute(sql`ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'SCHEDULED'`);

  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS service_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS technician_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS technician_license_number text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS notes text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS follow_up_required boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS follow_up_notes text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS ticket_status text NOT NULL DEFAULT 'OFFICE_REVIEW_PENDING'`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS posted_at timestamp`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS finalized_at timestamp`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS finalized_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS finalized_by_label text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS reopened_at timestamp`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS reopened_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS reopened_by_label text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS reopen_reason text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS ready_for_billing boolean NOT NULL DEFAULT false`);
  // D3 review flag (ticket_status FLAGGED_FOR_REVIEW) - who flagged it and why,
  // same shape as the reopen columns above. No backfill: nothing was flagged
  // before the flag existed.
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS flagged_at timestamp`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS flagged_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS flagged_by_label text`);
  await db.execute(sql`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS flag_reason text`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  // app_settings.key alone was the primary key when this table was first
  // created; the tenancy bootstrap later converts it to a composite
  // (org_id, key) key. An unqualified ON CONFLICT DO NOTHING works under
  // either shape, since it isn't tied to a specific constraint's columns.
  await db.execute(sql`
    INSERT INTO app_settings (key, value)
    VALUES ('service_time_tracking_mode', 'AUTO_TIMEOUT_ON_TICKET_POST')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO app_settings (key, value)
    VALUES (
      'appointment_cancel_reschedule_reasons',
      '["Weather","Gates locked","Schedule conflict","Customer not home","Canceled by company","Customer requested reschedule","Access issue","Other"]'
    )
    ON CONFLICT DO NOTHING
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS material_products (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      epa_reg_number text,
      manufacturer text,
      formulation_type text,
      active_ingredient_percent numeric(10, 4),
      restricted_use boolean NOT NULL DEFAULT false,
      dilution_options jsonb,
      allowed_application_methods text[],
      allowed_equipment text[],
      allowed_application_areas text[],
      default_dilution_label text,
      default_application_method text,
      default_equipment text,
      default_unit text,
      default_application_area text,
      allow_technician_override boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      notes text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS material_products_active_idx ON material_products (is_active)`);
  await db.execute(sql`ALTER TABLE product_applications ADD COLUMN IF NOT EXISTS material_product_id varchar REFERENCES material_products(id)`);
  await db.execute(sql`ALTER TABLE product_applications ADD COLUMN IF NOT EXISTS dilution_label text`);
  await db.execute(sql`ALTER TABLE product_applications ADD COLUMN IF NOT EXISTS unit text`);
  await db.execute(sql`ALTER TABLE product_applications ADD COLUMN IF NOT EXISTS active_ingredient_amount text`);
  await db.execute(sql`ALTER TABLE product_applications ADD COLUMN IF NOT EXISTS notes text`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS target_pests (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      label text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      is_favorite boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      notes text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS target_pests_label_uidx ON target_pests (lower(label))`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS target_pests_active_idx ON target_pests (is_active)`);
  await db.execute(sql`
    INSERT INTO target_pests (label, is_active, is_favorite, sort_order)
    VALUES
      ('Ants', true, true, 10),
      ('Roaches', true, true, 20),
      ('Spiders', true, true, 30),
      ('Rodents', true, true, 40),
      ('Mosquitoes', true, false, 50),
      ('Fleas', true, false, 60),
      ('Ticks', true, false, 70),
      ('Wasps', true, false, 80),
      ('Termites', true, false, 90),
      ('Bed Bugs', true, false, 100),
      ('Silverfish', true, false, 110),
      ('Occasional Invaders', true, false, 120)
    ON CONFLICT DO NOTHING
  `);

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

  await bootstrapOpportunityTaxonomy();
  await bootstrapAppointmentDisposition();
}

interface UnmappedOpportunityRow {
  id: string;
  source: string;
  opportunity_type: string | null;
  status: string;
  category_key: string | null;
  work_type: string | null;
  has_agreement: boolean;
}

// Pass 25 (PLAN_ROADMAP_V2.md C4.1; PLAN_BILLING_V1_1.md D8 "Opportunity
// taxonomy"). Three guarded steps, each quiet once done, so the second boot
// prints nothing:
//   1. opportunity_categories - the settings-managed reason list, on the
//      dispositions pattern but org-scoped from the start (unique on
//      (org_id, key)), seeded per org with the five keys in
//      shared/opportunities.ts and no others (owner, 2026-09-19). The rows a
//      boot inserts are printed.
//   2. opportunities.category_key / work_type - added nullable; every row
//      without them is mapped from its source by the same taxonomyForSource()
//      the runtime writers use (the two appointment sources take their work
//      type from the source service's agreement), the per-row effect printed
//      before the row is written, then SET NOT NULL once no row is left.
//      opportunity_type is kept as the display label (transitional).
//   3. assigned_user_id becomes a real users FK (added 2026-04-26 with no
//      reader and no constraint; every row is null today), plus an index on
//      it and on category_key for the queue's filters.
async function bootstrapOpportunityTaxonomy(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS opportunity_categories (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      key text NOT NULL,
      label text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS opportunity_categories_org_key_uidx ON opportunity_categories (org_id, key)`);

  const orgRows = await db.execute(sql`SELECT id, name FROM organizations ORDER BY created_at, id`);
  for (const org of orgRows.rows as Array<{ id: string; name: string }>) {
    const inserted: string[] = [];
    for (const seed of OPPORTUNITY_CATEGORY_SEED) {
      const result = await db.execute(sql`
        INSERT INTO opportunity_categories (org_id, key, label, sort_order)
        VALUES (${org.id}, ${seed.key}, ${seed.label}, ${seed.sortOrder})
        ON CONFLICT (org_id, key) DO NOTHING
        RETURNING key
      `);
      if (result.rows.length) inserted.push(`${seed.key} "${seed.label}"`);
    }
    if (inserted.length) {
      console.log(
        `[service-scheduling-bootstrap] Pass 25: opportunity_categories seeded for org "${org.name}" (${org.id}) - ${inserted.length} row(s): ` +
          `${inserted.join(", ")}. The five keys are the list; Settings edits labels, order and the active flag.`,
      );
    }
  }

  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS category_key text`);
  await db.execute(sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS work_type text`);

  const unmapped = await db.execute(sql`
    SELECT o.id, o.source, o.opportunity_type, o.status, o.category_key, o.work_type,
           (o.agreement_id IS NOT NULL OR s.agreement_id IS NOT NULL) AS has_agreement
    FROM opportunities o
    LEFT JOIN services s ON s.id = o.source_service_id
    WHERE o.category_key IS NULL OR o.work_type IS NULL
    ORDER BY o.source, o.created_at, o.id
  `);
  const rows = unmapped.rows as unknown as UnmappedOpportunityRow[];
  if (rows.length) {
    console.log(
      `[service-scheduling-bootstrap] Pass 25 pre-migration report: ${rows.length} opportunit${rows.length === 1 ? "y has" : "ies have"} no category / work type. ` +
        `Each is mapped from its source by shared/opportunities.ts taxonomyForSource() - the per-row effect below is printed before the row is written; ` +
        `opportunity_type is kept as the display label.`,
    );
    const perSource = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const taxonomy = taxonomyForSource(row.source, row.has_agreement === true);
      const categoryKey = row.category_key ?? taxonomy.categoryKey;
      const workType = row.work_type ?? taxonomy.workType;
      console.log(
        `[service-scheduling-bootstrap]   ${row.id}  ${row.source}  "${row.opportunity_type ?? ""}"  ${row.status}  ` +
          `${row.has_agreement ? "agreement" : "no agreement"}  -> ${categoryKey} / ${workType}${taxonomy.mapped ? "" : "  (source not in the mapping - SERVICE_DUE fallback)"}`,
      );
      await db.execute(sql`UPDATE opportunities SET category_key = ${categoryKey}, work_type = ${workType} WHERE id = ${row.id}`);
      const effects = perSource.get(row.source) ?? new Map<string, number>();
      const effect = `${categoryKey} / ${workType}`;
      effects.set(effect, (effects.get(effect) ?? 0) + 1);
      perSource.set(row.source, effects);
    }
    for (const [source, effects] of Array.from(perSource.entries())) {
      const total = Array.from(effects.values()).reduce((sum: number, n: number) => sum + n, 0);
      const detail = Array.from(effects.entries()).map(([effect, n]: [string, number]) => `${n} -> ${effect}`).join(", ");
      console.log(`[service-scheduling-bootstrap]   ${source}: ${total} row(s) mapped (${detail})`);
    }
  }

  const remaining = await db.execute(sql`SELECT count(*)::int AS n FROM opportunities WHERE category_key IS NULL OR work_type IS NULL`);
  const remainingCount = Number((remaining.rows[0] as { n: number } | undefined)?.n ?? 0);
  const columns = await db.execute(sql`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name IN ('category_key', 'work_type')
  `);
  const nullable = (columns.rows as Array<{ column_name: string; is_nullable: string }>)
    .filter((column) => column.is_nullable === "YES")
    .map((column) => column.column_name);
  if (remainingCount === 0 && nullable.length) {
    for (const column of nullable) {
      await db.execute(sql.raw(`ALTER TABLE opportunities ALTER COLUMN ${column} SET NOT NULL`));
    }
    console.log(`[service-scheduling-bootstrap] Pass 25: ${rows.length} row(s) mapped this boot; opportunities.category_key and opportunities.work_type are now NOT NULL.`);
  } else if (remainingCount > 0) {
    console.log(`[service-scheduling-bootstrap] Pass 25: ${remainingCount} opportunit(ies) still have no category / work type; the NOT NULL constraint waits.`);
  }

  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunities_category_key_idx ON opportunities (category_key)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS opportunities_assigned_user_id_idx ON opportunities (assigned_user_id)`);
  // Any FK on assigned_user_id counts, whatever its name: db:push names
  // drizzle's, this bootstrap names its own.
  const assigneeFk = await db.execute(sql`
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'opportunities'::regclass AND c.contype = 'f' AND a.attname = 'assigned_user_id'
  `);
  if (!assigneeFk.rows.length) {
    await db.execute(sql`ALTER TABLE opportunities ADD CONSTRAINT opportunities_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES users(id)`);
    console.log("[service-scheduling-bootstrap] Pass 25: opportunities.assigned_user_id now references users(id).");
  }
}

interface RequeuedServiceRow {
  service_id: string;
  service_status: string;
  appointment_id: string;
  appointment_status: string;
  reschedule_requested: boolean;
  cancel_reason: string | null;
  scheduled_date: string;
}

// Pass 27 (PLAN_ROADMAP_V2.md C4.2): services.last_appointment_id - the
// placement a service was last taken off by a cancel / reschedule
// disposition. Guarded and quiet once done:
//   1. the column, its index and its appointments(id) FK (any FK on the
//      column counts, whatever its name - db:push names drizzle's, this
//      bootstrap names its own).
//   2. a one-shot backfill for the rows the disposition never saw: a pending,
//      unlinked service whose latest CANCELED appointment named it as its
//      representative (appointments.service_id) gets that appointment, so
//      the Services tab can already say Rescheduling for it. Siblings on a
//      multi-service visit from before this pass have no link to recover
//      and stay Pending scheduling; every service the disposition touches
//      from now on carries it. The per-row effect is printed before the row
//      is written; a row with the column set is never touched again.
async function bootstrapAppointmentDisposition(): Promise<void> {
  await db.execute(sql`ALTER TABLE services ADD COLUMN IF NOT EXISTS last_appointment_id varchar`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS services_last_appointment_id_idx ON services (last_appointment_id)`);
  const lastAppointmentFk = await db.execute(sql`
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'services'::regclass AND c.contype = 'f' AND a.attname = 'last_appointment_id'
  `);
  if (!lastAppointmentFk.rows.length) {
    await db.execute(sql`ALTER TABLE services ADD CONSTRAINT services_last_appointment_id_fkey FOREIGN KEY (last_appointment_id) REFERENCES appointments(id)`);
    console.log("[service-scheduling-bootstrap] Pass 27: services.last_appointment_id added, indexed, and referencing appointments(id).");
  }

  const requeued = await db.execute(sql`
    SELECT s.id AS service_id, s.status AS service_status,
           a.id AS appointment_id, a.status AS appointment_status, a.reschedule_requested, a.cancel_reason, a.scheduled_date
    FROM services s
    JOIN LATERAL (
      SELECT a.id, a.status, a.reschedule_requested, a.cancel_reason, a.scheduled_date
      FROM appointments a
      WHERE a.org_id = s.org_id AND a.service_id = s.id AND a.status = 'CANCELED'
      ORDER BY a.scheduled_date DESC, a.created_at DESC
      LIMIT 1
    ) a ON true
    WHERE s.last_appointment_id IS NULL AND s.appointment_id IS NULL AND s.status = 'PENDING_SCHEDULING'
    ORDER BY s.created_at, s.id
  `);
  const rows = requeued.rows as unknown as RequeuedServiceRow[];
  if (!rows.length) {
    return;
  }
  console.log(
    `[service-scheduling-bootstrap] Pass 27 pre-migration report: ${rows.length} pending, unlinked service(s) were taken off a CANCELED appointment before the disposition existed. ` +
      `Each gets that appointment as last_appointment_id (the Services tab reads it for Rescheduling vs Pending scheduling); the per-row effect is printed before the row is written.`,
  );
  for (const row of rows) {
    console.log(
      `[service-scheduling-bootstrap]   service ${row.service_id}  ${row.service_status}  <- appointment ${row.appointment_id}  ` +
        `${String(row.scheduled_date).slice(0, 10)}  ${row.appointment_status}  reschedule requested: ${row.reschedule_requested ? "yes" : "no"}  ` +
        `reason: ${row.cancel_reason ?? "(none)"}  -> ${row.reschedule_requested ? "Rescheduling" : "Pending scheduling"}`,
    );
    await db.execute(sql`UPDATE services SET last_appointment_id = ${row.appointment_id} WHERE id = ${row.service_id} AND last_appointment_id IS NULL`);
  }
  console.log(`[service-scheduling-bootstrap] Pass 27: ${rows.length} service(s) given their last appointment this boot.`);
}
