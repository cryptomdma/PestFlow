import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapAgreements(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agreement_cancellation_policies (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      cancellation_fee_type text NOT NULL DEFAULT 'NONE',
      cancellation_fee_amount numeric(10, 2),
      notice_days integer NOT NULL DEFAULT 0,
      effective_date_mode text NOT NULL DEFAULT 'IMMEDIATE',
      cancel_pending_services_default boolean NOT NULL DEFAULT true,
      cancel_scheduled_appointments_default boolean NOT NULL DEFAULT false,
      close_open_opportunities_default boolean NOT NULL DEFAULT false,
      create_retention_opportunity_default boolean NOT NULL DEFAULT false,
      default_retention_follow_up_days integer,
      allow_manager_override boolean NOT NULL DEFAULT false,
      requires_override_reason boolean NOT NULL DEFAULT false,
      terms_summary text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreement_cancellation_policies_is_active_idx ON agreement_cancellation_policies (is_active)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agreement_templates (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      cancellation_policy_id varchar REFERENCES agreement_cancellation_policies(id),
      default_agreement_type text,
      default_billing_frequency text,
      default_term_unit text NOT NULL DEFAULT 'YEAR',
      default_term_interval integer NOT NULL DEFAULT 1,
      default_recurrence_unit text NOT NULL DEFAULT 'MONTH',
      default_recurrence_interval integer NOT NULL DEFAULT 1,
      default_generation_lead_days integer NOT NULL DEFAULT 14,
      default_service_window_days integer,
      default_scheduling_mode text NOT NULL DEFAULT 'MANUAL',
      default_service_type_id varchar REFERENCES service_types(id),
      default_service_template_name text,
      default_duration_minutes integer,
      default_price numeric(10, 2),
      default_instructions text,
      sort_order integer,
      internal_code text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreement_templates_is_active_idx ON agreement_templates (is_active)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreement_templates_sort_order_idx ON agreement_templates (sort_order)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agreements (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id varchar NOT NULL REFERENCES customers(id),
      location_id varchar NOT NULL REFERENCES locations(id),
      agreement_template_id varchar,
      cancellation_policy_id varchar REFERENCES agreement_cancellation_policies(id),
      cancellation_policy_snapshot jsonb,
      initial_appointment_id varchar REFERENCES appointments(id),
      start_date_source text NOT NULL DEFAULT 'MANUAL',
      agreement_name text NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      agreement_type text,
      start_date date NOT NULL,
      term_unit text NOT NULL DEFAULT 'YEAR',
      term_interval integer NOT NULL DEFAULT 1,
      renewal_date date,
      next_service_date date NOT NULL,
      billing_frequency text,
      price numeric(10, 2),
      recurrence_unit text NOT NULL DEFAULT 'MONTH',
      recurrence_interval integer NOT NULL DEFAULT 1,
      generation_lead_days integer NOT NULL DEFAULT 14,
      service_window_days integer,
      scheduling_mode text NOT NULL DEFAULT 'MANUAL',
      service_type_id varchar REFERENCES service_types(id),
      service_template_name text,
      default_duration_minutes integer,
      service_instructions text,
      contract_url text,
      contract_uploaded_at timestamp,
      contract_signed_at timestamp,
      notes text,
      cancelled_at timestamp,
      cancellation_reason text,
      cancellation_notes text,
      cancellation_effective_date date,
      cancellation_fee_type text,
      cancellation_fee_amount numeric(10, 2),
      cancellation_override_applied boolean NOT NULL DEFAULT false,
      cancellation_override_reason text,
      cancellation_override_by_user_id varchar,
      cancellation_override_by_label text,
      cancellation_override_at timestamp,
      created_by_user_id varchar,
      updated_by_user_id varchar,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreements_location_id_idx ON agreements (location_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agreements_status_idx ON agreements (status)`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS agreement_template_id varchar`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_policy_id varchar`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot jsonb`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_appointment_id varchar`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS start_date_source text NOT NULL DEFAULT 'MANUAL'`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS term_unit text NOT NULL DEFAULT 'YEAR'`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS term_interval integer NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS scheduling_mode text NOT NULL DEFAULT 'MANUAL'`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancelled_at timestamp`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_reason text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_notes text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_effective_date date`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_fee_type text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_fee_amount numeric(10, 2)`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_applied boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_reason text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_by_label text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_at timestamp`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS cancellation_policy_id varchar`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_term_unit text NOT NULL DEFAULT 'YEAR'`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_term_interval integer NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_scheduling_mode text NOT NULL DEFAULT 'MANUAL'`);
  await db.execute(sql`UPDATE agreement_templates SET default_scheduling_mode = 'AUTO_ELIGIBLE' WHERE internal_code IN ('CONTROL_PLUS', 'MOSQUITO_SEASONAL') AND default_scheduling_mode = 'MANUAL'`);
  await db.execute(sql`UPDATE agreement_templates SET default_scheduling_mode = 'CONTACT_REQUIRED' WHERE internal_code = 'SENTRICON_RENEWAL' AND default_scheduling_mode = 'MANUAL'`);

  await db.execute(sql`
    INSERT INTO agreement_cancellation_policies (
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount, notice_days,
      effective_date_mode, cancel_pending_services_default, cancel_scheduled_appointments_default,
      close_open_opportunities_default, create_retention_opportunity_default, default_retention_follow_up_days,
      allow_manager_override, requires_override_reason, terms_summary
    )
    SELECT 'No Fee Cancellation', 'No cancellation fee. Used for custom or goodwill cancellation handling.', true, 'NONE', null, 0,
      'IMMEDIATE', true, false, false, false, null, true, true,
      'No fee is charged. Review pending services, scheduled appointments, and opportunities before confirming cancellation.'
    WHERE NOT EXISTS (SELECT 1 FROM agreement_cancellation_policies WHERE name = 'No Fee Cancellation')
  `);
  await db.execute(sql`
    INSERT INTO agreement_cancellation_policies (
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount, notice_days,
      effective_date_mode, cancel_pending_services_default, cancel_scheduled_appointments_default,
      close_open_opportunities_default, create_retention_opportunity_default, default_retention_follow_up_days,
      allow_manager_override, requires_override_reason, terms_summary
    )
    SELECT 'Annual Agreement Cancellation', 'Standard annual recurring service cancellation terms.', true, 'FLAT', 99.00, 30,
      'CUSTOM', true, true, true, true, 7, true, true,
      'Annual agreements require notice. Cancellation may include a flat fee and review of pending generated services and scheduled appointments.'
    WHERE NOT EXISTS (SELECT 1 FROM agreement_cancellation_policies WHERE name = 'Annual Agreement Cancellation')
  `);
  await db.execute(sql`
    INSERT INTO agreement_cancellation_policies (
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount, notice_days,
      effective_date_mode, cancel_pending_services_default, cancel_scheduled_appointments_default,
      close_open_opportunities_default, create_retention_opportunity_default, default_retention_follow_up_days,
      allow_manager_override, requires_override_reason, terms_summary
    )
    SELECT 'Seasonal Service Cancellation', 'Seasonal agreement cancellation terms.', true, 'NONE', null, 0,
      'IMMEDIATE', true, true, true, false, null, true, true,
      'Seasonal service can be cancelled immediately. Pending generated services and scheduled appointments should generally be cancelled.'
    WHERE NOT EXISTS (SELECT 1 FROM agreement_cancellation_policies WHERE name = 'Seasonal Service Cancellation')
  `);
  await db.execute(sql`
    INSERT INTO agreement_cancellation_policies (
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount, notice_days,
      effective_date_mode, cancel_pending_services_default, cancel_scheduled_appointments_default,
      close_open_opportunities_default, create_retention_opportunity_default, default_retention_follow_up_days,
      allow_manager_override, requires_override_reason, terms_summary
    )
    SELECT 'Termite Agreement Cancellation', 'Termite monitoring and renewal cancellation terms.', true, 'MANUAL', null, 30,
      'CUSTOM', true, false, true, true, 14, true, true,
      'Termite cancellations require review because monitoring, renewal status, and customer retention risk may vary by property.'
    WHERE NOT EXISTS (SELECT 1 FROM agreement_cancellation_policies WHERE name = 'Termite Agreement Cancellation')
  `);
  await db.execute(sql`UPDATE agreement_templates SET cancellation_policy_id = (SELECT id FROM agreement_cancellation_policies WHERE name = 'Annual Agreement Cancellation' LIMIT 1) WHERE internal_code = 'CONTROL_PLUS' AND cancellation_policy_id IS NULL`);
  await db.execute(sql`UPDATE agreement_templates SET cancellation_policy_id = (SELECT id FROM agreement_cancellation_policies WHERE name = 'Seasonal Service Cancellation' LIMIT 1) WHERE internal_code = 'MOSQUITO_SEASONAL' AND cancellation_policy_id IS NULL`);
  await db.execute(sql`UPDATE agreement_templates SET cancellation_policy_id = (SELECT id FROM agreement_cancellation_policies WHERE name = 'Termite Agreement Cancellation' LIMIT 1) WHERE internal_code = 'SENTRICON_RENEWAL' AND cancellation_policy_id IS NULL`);

  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS agreement_id varchar`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text DEFAULT 'MANUAL'`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS generated_for_date date`);
  await db.execute(sql`UPDATE appointments SET source = 'MANUAL' WHERE source IS NULL`);
}
