import { sql } from "drizzle-orm";
import { db } from "./db";

export const HERITAGE_ORG_SLUG = "heritage";

export async function bootstrapOrganizations(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      slug text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_uidx ON organizations (slug)`);

  await db.execute(sql`
    INSERT INTO organizations (name, slug, status)
    SELECT 'Heritage', ${HERITAGE_ORG_SLUG}, 'active'
    WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = ${HERITAGE_ORG_SLUG})
  `);

  // Feeds the invoice/statement document renderer (server/documents/**).
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color_hex text`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS remit_to_name text`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS remit_to_address text`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS remit_to_email text`);
  await db.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS remit_to_phone text`);
  // Sensible starting values, not a claim of real business data - editable
  // via PATCH /api/organizations/:id/branding, never overwritten once set.
  await db.execute(sql`
    UPDATE organizations
    SET remit_to_name = name, primary_color_hex = '#2563eb'
    WHERE slug = ${HERITAGE_ORG_SLUG} AND remit_to_name IS NULL
  `);
}

export async function getHeritageOrgId(): Promise<string> {
  const result = await db.execute(sql`SELECT id FROM organizations WHERE slug = ${HERITAGE_ORG_SLUG} LIMIT 1`);
  const row = result.rows[0] as { id: string } | undefined;
  if (!row) {
    throw new Error("Heritage organization is missing; bootstrapOrganizations() must run before getHeritageOrgId()");
  }

  return row.id;
}
