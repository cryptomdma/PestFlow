import { sql } from "drizzle-orm";
import { db } from "./db";

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`,
  );
  return result.rows.length > 0;
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

  // Migrate the pre-existing reverse pointer (locations.billing_profile_id ->
  // billing_profiles.id) onto the new forward pointer this bootstrap
  // introduces (billing_profiles.location_id -> locations.id), so a location
  // override created before this migration still resolves as one after it.
  await db.execute(sql`
    UPDATE billing_profiles bp
    SET location_id = l.id
    FROM locations l
    WHERE bp.location_id IS NULL AND l.billing_profile_id = bp.id
  `);

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
}
