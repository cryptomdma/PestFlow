import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapTax(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tax_rates (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      name text NOT NULL,
      jurisdiction text,
      rate_basis_points integer NOT NULL,
      effective_from date NOT NULL,
      effective_to date,
      is_default boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tax_rates_org_id_idx ON tax_rates (org_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tax_rules (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      service_type_id varchar REFERENCES service_types(id),
      location_type text,
      taxable boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tax_rules_org_id_idx ON tax_rules (org_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tax_exemption_certificates (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      account_id varchar NOT NULL REFERENCES accounts(id),
      certificate_number text NOT NULL,
      expires_at date,
      document_url text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tax_exemption_certificates_account_id_idx ON tax_exemption_certificates (account_id)`);

  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_snapshot jsonb`);

  // Seed a single default rate so the engine is immediately usable -
  // matches Heritage's real jurisdiction. Org-configurable from Settings
  // afterward; this is a starting point, not a fixed assumption.
  await db.execute(sql`
    INSERT INTO tax_rates (org_id, name, jurisdiction, rate_basis_points, effective_from, is_default, is_active)
    SELECT organizations.id, 'Standard Rate', 'Texas', 825, '2020-01-01', true, true
    FROM organizations
    WHERE NOT EXISTS (SELECT 1 FROM tax_rates WHERE tax_rates.org_id = organizations.id)
  `);
}
