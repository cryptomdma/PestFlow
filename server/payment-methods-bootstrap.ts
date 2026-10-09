import { sql } from "drizzle-orm";
import { db } from "./db";
import { PAYMENT_CREDENTIALS_KEY_ENV, describeCredentialsKeyProblem } from "./integrations/payments/credentials";

async function tableExists(table: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}`);
  return result.rows.length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`);
  return result.rows.length > 0;
}

// Pass 39's guard: "any foreign key on this column", by the catalog's column
// list rather than a constraint name, so a fresh db:push database (which has
// the key under the name shared/schema.ts declares) and a migrated one agree.
async function foreignKeyExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.conrelid = ${table}::regclass AND a.attname = ${column}
  `);
  return result.rows.length > 0;
}

// Pass 40 (PLAN_ROADMAP_V2.md C6.1): the payment provider account, the
// provider customer mapping and the cards on file - PLAN_BILLING_V1.md §0.4
// (org-level credentials) and §1.2 (`payment_methods`, display fields plus
// tokens, never a card number). Idempotent, run on every boot AFTER
// bootstrapBillingProfiles (the pointer below lands on billing_profiles,
// whose shape that bootstrap owns) - the tables reference accounts and
// locations, which exist from db:push. org_id is NOT NULL from the first
// CREATE, the payments-bootstrap precedent, so none of the three joins
// TABLES_REQUIRING_ORG_ID; the foreign keys and indexes carry the names
// db:push gives them. Each CREATE / ADD prints once and is silent after.
//
// The secret key and the webhook signing secret are stored encrypted
// (server/integrations/payments/credentials.ts, env PAYMENT_CREDENTIALS_KEY);
// a boot without that variable warns every time, since the Settings card
// cannot save a provider until it is set - a configuration gap, not a
// migration, so the second boot's quiet is unaffected on a configured box.
export async function bootstrapPaymentMethods(): Promise<void> {
  if (!(await tableExists("payment_provider_accounts"))) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_provider_accounts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        provider text NOT NULL DEFAULT 'stripe',
        mode text NOT NULL DEFAULT 'test',
        publishable_key text,
        secret_key_encrypted text,
        secret_key_fingerprint text,
        webhook_secret_encrypted text,
        webhook_secret_fingerprint text,
        connected_account_id text,
        status text NOT NULL DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("[payment-methods-bootstrap] created table payment_provider_accounts");
  }
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_accounts_org_provider_uidx ON payment_provider_accounts (org_id, provider)`);

  if (!(await tableExists("payment_provider_customers"))) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_provider_customers (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        account_id varchar NOT NULL CONSTRAINT payment_provider_customers_account_id_accounts_id_fk REFERENCES accounts(id),
        provider text NOT NULL,
        mode text NOT NULL,
        provider_customer_id text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("[payment-methods-bootstrap] created table payment_provider_customers");
  }
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_customers_account_provider_mode_uidx ON payment_provider_customers (org_id, account_id, provider, mode)`);

  if (!(await tableExists("payment_methods"))) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        account_id varchar NOT NULL CONSTRAINT payment_methods_account_id_accounts_id_fk REFERENCES accounts(id),
        location_id varchar CONSTRAINT payment_methods_location_id_locations_id_fk REFERENCES locations(id),
        provider text NOT NULL,
        provider_customer_id text NOT NULL,
        provider_payment_method_id text NOT NULL,
        type text NOT NULL DEFAULT 'card',
        brand text,
        last4 text NOT NULL,
        exp_month integer,
        exp_year integer,
        is_default boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'active',
        livemode boolean NOT NULL DEFAULT false,
        added_by_user_id varchar,
        added_by_label text,
        removed_at timestamp,
        removed_by_user_id varchar,
        removed_by_label text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("[payment-methods-bootstrap] created table payment_methods");
  }
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_provider_method_uidx ON payment_methods (org_id, provider_payment_method_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_methods_account_id_idx ON payment_methods (account_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_methods_location_id_idx ON payment_methods (location_id)`);

  // The profile's pointer at one of its account's cards (V1 §1.2
  // defaultPaymentMethodId): null = the account's default card. The key is
  // named explicitly (shared/schema.ts foreignKey()) because db:push's
  // derived name would exceed Postgres's 63-character limit.
  if (!(await columnExists("billing_profiles", "default_payment_method_id"))) {
    await db.execute(sql`ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS default_payment_method_id varchar`);
    console.log("[payment-methods-bootstrap] added column billing_profiles.default_payment_method_id");
  }
  if (!(await foreignKeyExists("billing_profiles", "default_payment_method_id"))) {
    const orphans = await db.execute(sql`
      SELECT count(*)::int AS n FROM billing_profiles bp
      WHERE bp.default_payment_method_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_methods pm WHERE pm.id = bp.default_payment_method_id)
    `);
    const n = Number((orphans.rows[0] as { n: number } | undefined)?.n ?? 0);
    if (n > 0) {
      console.warn(`[payment-methods-bootstrap] NOT adding billing_profiles_default_payment_method_fk: ${n} billing_profiles row(s) name a payment_methods row that does not exist - fix them by hand and restart`);
    } else {
      await db.execute(sql`ALTER TABLE billing_profiles ADD CONSTRAINT billing_profiles_default_payment_method_fk FOREIGN KEY (default_payment_method_id) REFERENCES payment_methods (id)`);
      console.log("[payment-methods-bootstrap] added foreign key billing_profiles_default_payment_method_fk (billing_profiles.default_payment_method_id -> payment_methods.id)");
    }
  }
  await db.execute(sql`CREATE INDEX IF NOT EXISTS billing_profiles_default_payment_method_id_idx ON billing_profiles (default_payment_method_id)`);

  const keyProblem = describeCredentialsKeyProblem();
  if (keyProblem) {
    console.warn(`[payment-methods-bootstrap] ${PAYMENT_CREDENTIALS_KEY_ENV} is ${keyProblem}: Settings -> Payments cannot store a provider key until it is set in .env (PROJECT_MAP.md) and the server restarted`);
  }
}
