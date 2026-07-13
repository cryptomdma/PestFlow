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
}

export async function getHeritageOrgId(): Promise<string> {
  const result = await db.execute(sql`SELECT id FROM organizations WHERE slug = ${HERITAGE_ORG_SLUG} LIMIT 1`);
  const row = result.rows[0] as { id: string } | undefined;
  if (!row) {
    throw new Error("Heritage organization is missing; bootstrapOrganizations() must run before getHeritageOrgId()");
  }

  return row.id;
}
