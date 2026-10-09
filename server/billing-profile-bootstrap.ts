import { sql } from "drizzle-orm";
import { db } from "./db";

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`,
  );
  return result.rows.length > 0;
}

// Pass 39 (C5.8): "any foreign key on this column", whatever its name - a
// fresh `db:push` database already has the three billing_profiles keys under
// drizzle's names, an established one had none, so the guard looks at the
// catalog's column list rather than a constraint name (the Pass 38 precedent).
async function foreignKeyExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.conrelid = ${table}::regclass AND a.attname = ${column}
  `);
  return result.rows.length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}`);
  return result.rows.length > 0;
}

// Adds the foreign key shared/schema.ts declares, under the name db:push
// would give it, once - and never over orphans: a row naming a referenced id
// that does not exist is printed and the key skipped (the data is the owner's
// to fix; a silent DELETE here would be a data loss the boot log never shows).
async function addForeignKeyIfMissing(column: string, refTable: string, name: string): Promise<void> {
  if (await foreignKeyExists("billing_profiles", column)) return;
  const orphans = await db.execute(sql.raw(`
    SELECT count(*)::int AS n
    FROM billing_profiles bp
    WHERE bp.${column} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${refTable} r WHERE r.id = bp.${column})
  `));
  const n = Number((orphans.rows[0] as { n: number } | undefined)?.n ?? 0);
  if (n > 0) {
    console.warn(`[billing-profile-bootstrap] NOT adding ${name}: ${n} billing_profiles row(s) name a ${refTable} row that does not exist - fix them by hand and restart`);
    return;
  }
  await db.execute(sql.raw(`ALTER TABLE billing_profiles ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${refTable} (id)`));
  console.log(`[billing-profile-bootstrap] added foreign key ${name} (billing_profiles.${column} -> ${refTable}.id)`);
}

// Must run after bootstrapCanonicalAccounts() - the account_id backfill below
// joins through accounts.legacy_customer_id, which only exists once that
// bootstrap has populated it for every customer.
export async function bootstrapBillingProfiles(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_profile_templates (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      name text NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      billing_type text NOT NULL DEFAULT 'invoice_terms',
      default_invoice_terms text,
      sort_order integer,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_profile_templates_is_active_idx ON billing_profile_templates (is_active)`);

  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS account_id varchar`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS location_id varchar`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS template_id varchar`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS billing_type text`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS billing_name text`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS billing_address text`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS card_on_file_token text`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS ach_token text`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS invoice_terms text`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now()`);
  await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()`);
  await db.execute(sql`ALTER TABLE billing_profiles ALTER COLUMN is_default SET NOT NULL`);
  await db.execute(sql`ALTER TABLE billing_profiles ALTER COLUMN is_default SET DEFAULT false`);

  if (await columnExists("billing_profiles", "customer_id")) {
    await db.execute(sql`
      UPDATE billing_profiles bp
      SET account_id = a.id
      FROM accounts a
      WHERE bp.account_id IS NULL AND a.legacy_customer_id = bp.customer_id
    `);
  }

  // Pass 39 (C5.8): the two legacy pointers go. locations.billing_profile_id
  // was the pre-Pass-34 reverse pointer (location -> profile), mirrored by the
  // profile write path and read by nothing but the backfill that used to sit
  // here, which carried it onto the forward pointer (billing_profiles.
  // location_id, the one the resolver reads) on every boot. That carry runs
  // ONE last time, inside the guard, and then the column is dropped - so an
  // override created before Pass 34 on a database that never booted since
  // still resolves. customers.default_billing_profile_id was read by nothing
  // and written only from a request body; dropped outright. Both print once;
  // the guards make the second boot silent.
  if (await columnExists("locations", "billing_profile_id")) {
    const carried = await db.execute(sql`
      UPDATE billing_profiles bp
      SET location_id = l.id
      FROM locations l
      WHERE bp.location_id IS NULL AND l.billing_profile_id = bp.id
    `);
    await db.execute(sql`ALTER TABLE locations DROP COLUMN billing_profile_id`);
    console.log(`[billing-profile-bootstrap] dropped locations.billing_profile_id (${carried.rowCount ?? 0} reverse pointer(s) carried onto billing_profiles.location_id first)`);
  }
  if (await columnExists("customers", "default_billing_profile_id")) {
    await db.execute(sql`ALTER TABLE customers DROP COLUMN default_billing_profile_id`);
    console.log("[billing-profile-bootstrap] dropped customers.default_billing_profile_id (read by nothing)");
  }

  if (await columnExists("billing_profiles", "method_type")) {
    await db.execute(sql`
      UPDATE billing_profiles
      SET billing_type = CASE method_type WHEN 'invoice' THEN 'invoice_terms' ELSE method_type END
      WHERE billing_type IS NULL AND method_type IS NOT NULL
    `);
  }
  await db.execute(sql`UPDATE billing_profiles SET billing_type = 'invoice_terms' WHERE billing_type IS NULL`);

  await db.execute(sql`ALTER TABLE billing_profiles ALTER COLUMN billing_type SET NOT NULL`);
  await db.execute(sql`ALTER TABLE billing_profiles ALTER COLUMN billing_type SET DEFAULT 'invoice_terms'`);

  // Any billing_profiles row still missing an account_id at this point has no
  // resolvable account (orphaned legacy data) - drop it rather than leave a
  // row that can never satisfy the NOT NULL constraint below.
  await db.execute(sql`DELETE FROM billing_profiles WHERE account_id IS NULL`);
  await db.execute(sql`ALTER TABLE billing_profiles ALTER COLUMN account_id SET NOT NULL`);

  await db.execute(sql`ALTER TABLE billing_profiles DROP COLUMN IF EXISTS customer_id`);
  await db.execute(sql`ALTER TABLE billing_profiles DROP COLUMN IF EXISTS method_type`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_profiles_account_id_idx ON billing_profiles (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_profiles_location_id_idx ON billing_profiles (location_id)`);
  // Pass 39 (C5.8): the index the template pointer never had (printed once),
  // then the three foreign keys shared/schema.ts has declared since the
  // columns were added and this bootstrap never created (0 orphans on the
  // dev DB; the names are what db:push gives them, so a fresh database and a
  // migrated one agree). The route refuses an unknown templateId as 400
  // BILLING_PROFILE_TEMPLATE_UNKNOWN before the key can refuse it as a 500.
  if (!(await indexExists("billing_profiles_template_id_idx"))) {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_profiles_template_id_idx ON billing_profiles (template_id)`);
    console.log("[billing-profile-bootstrap] created index billing_profiles_template_id_idx");
  }
  await addForeignKeyIfMissing("account_id", "accounts", "billing_profiles_account_id_accounts_id_fk");
  await addForeignKeyIfMissing("location_id", "locations", "billing_profiles_location_id_locations_id_fk");
  await addForeignKeyIfMissing("template_id", "billing_profile_templates", "billing_profiles_template_id_billing_profile_templates_id_fk");
}
