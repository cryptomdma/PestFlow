import { sql } from "drizzle-orm";
import { db } from "./db";

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`,
  );
  return result.rows.length > 0;
}

export async function bootstrapAgreements(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      charge_trigger text NOT NULL DEFAULT 'ON_SCHEDULE',
      billing_mode text NOT NULL DEFAULT 'RECURRING_INTERVAL',
      interval_unit text,
      interval_count integer,
      installment_count integer,
      anchor_mode text NOT NULL DEFAULT 'SIGNUP_DATE',
      anchor_day integer,
      proration_rule text NOT NULL DEFAULT 'NONE',
      initial_charge_covers_first_period boolean NOT NULL DEFAULT false,
      field_addable_surcharge boolean NOT NULL DEFAULT false,
      sort_order integer,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_plans_is_active_idx ON billing_plans (is_active)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agreement_cancellation_policies (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      cancellation_fee_type text NOT NULL DEFAULT 'NONE',
      cancellation_fee_amount_cents integer,
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
      billing_plan_id varchar REFERENCES billing_plans(id),
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
      default_price_cents integer,
      default_initial_charge_type text,
      default_initial_charge_amount_mode text,
      default_initial_charge_cents integer,
      default_initial_charge_percent_basis_points integer,
      default_initial_charge_collected_by text,
      default_initial_charge_in_addition_to_price boolean NOT NULL DEFAULT false,
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
      billing_plan_id varchar REFERENCES billing_plans(id),
      billing_plan_snapshot jsonb,
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
      price_cents integer,
      initial_charge_type text,
      initial_charge_amount_mode text,
      initial_charge_cents integer,
      initial_charge_percent_basis_points integer,
      initial_charge_collected_by text,
      initial_charge_in_addition_to_price boolean NOT NULL DEFAULT false,
      expected_service_count integer,
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
      cancellation_fee_amount_cents integer,
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
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS billing_plan_id varchar`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS billing_plan_snapshot jsonb`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS expected_service_count integer`);
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
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_applied boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_reason text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_by_label text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cancellation_override_at timestamp`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS cancellation_policy_id varchar`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS billing_plan_id varchar`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_term_unit text NOT NULL DEFAULT 'YEAR'`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_term_interval integer NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_scheduling_mode text NOT NULL DEFAULT 'MANUAL'`);
  await db.execute(sql`UPDATE agreement_templates SET default_scheduling_mode = 'AUTO_ELIGIBLE' WHERE internal_code IN ('CONTROL_PLUS', 'MOSQUITO_SEASONAL') AND default_scheduling_mode = 'MANUAL'`);
  await db.execute(sql`UPDATE agreement_templates SET default_scheduling_mode = 'CONTACT_REQUIRED' WHERE internal_code = 'SENTRICON_RENEWAL' AND default_scheduling_mode = 'MANUAL'`);

  // PLAN_BILLING_V1_1.md D4 (owner correction): the initial charge moves off
  // the shared Billing Plan onto the Agreement (the actual) and the Agreement
  // Template (the default). New columns first, always idempotent.
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_charge_type text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_charge_amount_mode text`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_charge_cents integer`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_charge_percent_basis_points integer`);
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_charge_collected_by text`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_initial_charge_type text`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_initial_charge_amount_mode text`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_initial_charge_cents integer`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_initial_charge_percent_basis_points integer`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_initial_charge_collected_by text`);
  // D4 owner review (Pass 6): a down payment counts toward the contract price
  // by default; this flag is the explicit "in addition to" exception. Every
  // existing agreement takes the default - the owner's rule, not a guess.
  await db.execute(sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS initial_charge_in_addition_to_price boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE agreement_templates ADD COLUMN IF NOT EXISTS default_initial_charge_in_addition_to_price boolean NOT NULL DEFAULT false`);

  // One-shot data migration, keyed on the legacy plan column still existing -
  // the same marker money-bootstrap.ts uses. Nothing here may run twice: an
  // agreement whose initial charge the office later clears must not have it
  // restored from the snapshot on the next boot, and once the legacy columns
  // are gone the guard can never match again.
  //
  // - Templates take their plan's LIVE initial charge (a template has no
  //   snapshot; what its plan says today is what its next agreement would
  //   have been sold under).
  // - Agreements take the initial charge frozen in their own
  //   billingPlanSnapshot - the terms they were actually sold under, which
  //   may differ from the live plan (the Daily Rodent Trapping agreements
  //   carry a DOWN_PAYMENT their plan no longer has). The snapshot JSON is
  //   deliberately left untouched: it is frozen history, and
  //   createSurchargeEntryIfConfigured() no longer reads it.
  // - Only charges with a positive flat amount are carried; a type with no
  //   amount never fired anything and would fail validateInitialCharge().
  // - The legacy plan columns are then dropped, exactly as money-bootstrap.ts
  //   drops its decimal columns once every read/write path has cut over.
  if (await columnExists("billing_plans", "initial_charge_type")) {
    await db.execute(sql`
      UPDATE agreement_templates t
      SET default_initial_charge_type = p.initial_charge_type,
          default_initial_charge_amount_mode = 'FLAT',
          default_initial_charge_cents = p.initial_charge_cents,
          default_initial_charge_percent_basis_points = NULL,
          default_initial_charge_collected_by = p.initial_charge_collected_by
      FROM billing_plans p
      WHERE t.billing_plan_id = p.id
        AND t.default_initial_charge_type IS NULL
        AND p.initial_charge_type IN ('DOWN_PAYMENT', 'CLEANOUT_SURCHARGE', 'PREPAY_FULL')
        AND p.initial_charge_cents IS NOT NULL
        AND p.initial_charge_cents > 0
    `);
    await db.execute(sql`
      UPDATE agreements
      SET initial_charge_type = billing_plan_snapshot->>'initialChargeType',
          initial_charge_amount_mode = 'FLAT',
          initial_charge_cents = (billing_plan_snapshot->>'initialChargeCents')::integer,
          initial_charge_percent_basis_points = NULL,
          initial_charge_collected_by = CASE
            WHEN billing_plan_snapshot->>'initialChargeCollectedBy' IN ('OFFICE_AT_SIGNING', 'TECH_AT_FIRST_SERVICE')
              THEN billing_plan_snapshot->>'initialChargeCollectedBy'
            ELSE NULL
          END
      WHERE initial_charge_type IS NULL
        AND jsonb_typeof(billing_plan_snapshot) = 'object'
        AND billing_plan_snapshot->>'initialChargeType' IN ('DOWN_PAYMENT', 'CLEANOUT_SURCHARGE', 'PREPAY_FULL')
        AND jsonb_typeof(billing_plan_snapshot->'initialChargeCents') = 'number'
        AND (billing_plan_snapshot->>'initialChargeCents')::integer > 0
    `);
    await db.execute(sql`ALTER TABLE billing_plans DROP COLUMN IF EXISTS initial_charge_type`);
    await db.execute(sql`ALTER TABLE billing_plans DROP COLUMN IF EXISTS initial_charge_cents`);
    await db.execute(sql`ALTER TABLE billing_plans DROP COLUMN IF EXISTS initial_charge_collected_by`);
  }

  await db.execute(sql`
    INSERT INTO agreement_cancellation_policies (
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount_cents, notice_days,
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
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount_cents, notice_days,
      effective_date_mode, cancel_pending_services_default, cancel_scheduled_appointments_default,
      close_open_opportunities_default, create_retention_opportunity_default, default_retention_follow_up_days,
      allow_manager_override, requires_override_reason, terms_summary
    )
    SELECT 'Annual Agreement Cancellation', 'Standard annual recurring service cancellation terms.', true, 'FLAT', 9900, 30,
      'CUSTOM', true, true, true, true, 7, true, true,
      'Annual agreements require notice. Cancellation may include a flat fee and review of pending generated services and scheduled appointments.'
    WHERE NOT EXISTS (SELECT 1 FROM agreement_cancellation_policies WHERE name = 'Annual Agreement Cancellation')
  `);
  await db.execute(sql`
    INSERT INTO agreement_cancellation_policies (
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount_cents, notice_days,
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
      name, description, is_active, cancellation_fee_type, cancellation_fee_amount_cents, notice_days,
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

  await db.execute(sql`
    INSERT INTO billing_plans (name, description, charge_trigger, billing_mode, interval_unit, interval_count, anchor_mode, proration_rule)
    SELECT 'Quarterly Recurring', 'Bills once per quarter on a recurring schedule, anchored to signup date.', 'ON_SCHEDULE', 'RECURRING_INTERVAL', 'QUARTER', 1, 'SIGNUP_DATE', 'NONE'
    WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Quarterly Recurring')
  `);
  await db.execute(sql`
    INSERT INTO billing_plans (name, description, charge_trigger, billing_mode, interval_unit, interval_count, anchor_mode, proration_rule)
    SELECT 'Monthly Recurring', 'Bills once per month on a recurring schedule, anchored to signup date.', 'ON_SCHEDULE', 'RECURRING_INTERVAL', 'MONTH', 1, 'SIGNUP_DATE', 'NONE'
    WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Monthly Recurring')
  `);
  await db.execute(sql`
    INSERT INTO billing_plans (name, description, charge_trigger, billing_mode, interval_unit, interval_count, anchor_mode, proration_rule)
    SELECT 'Annual Prepaid', 'Bills the full term up front at agreement start.', 'ON_SCHEDULE', 'PREPAID_TERM', 'YEAR', 1, 'SIGNUP_DATE', 'NONE'
    WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Annual Prepaid')
  `);
  // PREPAID_TERM belongs on the ON_SCHEDULE path (a single-installment
  // schedule that fires once, at start) - ON_AGREEMENT_START is a distinct
  // mechanic (the down-payment/cleanout "initial charge", driven by
  // initialChargeType, not billingMode). This plan was seeded with the
  // wrong trigger before the billing run (Phase 1 unit 12) clarified the
  // distinction; correct it in place for any DB that already has the old
  // value, without disturbing anything else about the row.
  await db.execute(sql`UPDATE billing_plans SET charge_trigger = 'ON_SCHEDULE' WHERE name = 'Annual Prepaid' AND billing_mode = 'PREPAID_TERM' AND charge_trigger = 'ON_AGREEMENT_START'`);
  await db.execute(sql`
    INSERT INTO billing_plans (name, description, charge_trigger, billing_mode)
    SELECT 'COD (Per Service)', 'Non-agreement / one-time work, billed on completion of each service.', 'ON_SERVICE_COMPLETION', 'PER_SERVICE'
    WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'COD (Per Service)')
  `);
  await db.execute(sql`UPDATE agreement_templates SET billing_plan_id = (SELECT id FROM billing_plans WHERE name = 'Quarterly Recurring' LIMIT 1) WHERE internal_code = 'CONTROL_PLUS' AND billing_plan_id IS NULL`);
  await db.execute(sql`UPDATE agreement_templates SET billing_plan_id = (SELECT id FROM billing_plans WHERE name = 'Monthly Recurring' LIMIT 1) WHERE internal_code = 'MOSQUITO_SEASONAL' AND billing_plan_id IS NULL`);
  await db.execute(sql`UPDATE agreement_templates SET billing_plan_id = (SELECT id FROM billing_plans WHERE name = 'Annual Prepaid' LIMIT 1) WHERE internal_code = 'SENTRICON_RENEWAL' AND billing_plan_id IS NULL`);

  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS agreement_id varchar`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text DEFAULT 'MANUAL'`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS generated_for_date date`);
  await db.execute(sql`UPDATE appointments SET source = 'MANUAL' WHERE source IS NULL`);
}
