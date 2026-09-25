import { sql } from "drizzle-orm";
import { db } from "./db";
import { getHeritageOrgId } from "./org-bootstrap";

// Every domain/settings table except `organizations` itself gets an org_id
// column. The DB enforces NOT NULL with a literal default of the Heritage
// org id, so existing insert call sites (not yet updated to pass orgId
// explicitly - that's Phase 0 unit 3) keep working unchanged. The Drizzle
// schema deliberately leaves orgId nullable for the same reason; unit 3
// tightens it to `.notNull()` once every write path threads it through.
//
// This runs twice per boot (see server/index.ts). A database created by
// `npm run db:push` already has every table with `org_id NOT NULL` and no
// default, so the org-unaware seed inserts in the auth / agreement / settings
// bootstraps fail unless the default is in place first; the early call sets
// it on every table that exists, the late call covers tables the older
// CREATE TABLE bootstraps add. Both are no-ops on a database that has it.
const TABLES_REQUIRING_ORG_ID = [
  "customers",
  "accounts",
  "contacts",
  "locations",
  "billing_profiles",
  "customer_notes",
  "note_revisions",
  "service_types",
  "technicians",
  "services",
  "appointments",
  "agreement_cancellation_policies",
  "agreements",
  "agreement_templates",
  "billing_plans",
  "service_records",
  "app_settings",
  "opportunities",
  "opportunity_dispositions",
  "opportunity_categories",
  "opportunity_activities",
  "product_applications",
  "material_products",
  "target_pests",
  "invoices",
  "communications",
  "users",
  "audit_logs",
] as const;

export async function bootstrapTenancy(): Promise<void> {
  const heritageOrgId = await getHeritageOrgId();

  const existing = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const existingTables = new Set((existing.rows as { table_name: string }[]).map((r) => r.table_name));

  for (const table of TABLES_REQUIRING_ORG_ID) {
    if (!existingTables.has(table)) continue;
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS org_id varchar`));
    await db.execute(sql`UPDATE ${sql.raw(table)} SET org_id = ${heritageOrgId} WHERE org_id IS NULL`);
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN org_id SET DEFAULT '${heritageOrgId}'`));
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN org_id SET NOT NULL`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${table}_org_id_idx ON ${table} (org_id)`));
  }

  // app_settings.key alone used to be the primary key; with multiple orgs it
  // must become a composite (org_id, key) key so two orgs can each have their
  // own value for the same setting name. `db:push` names the composite key
  // `app_settings_org_id_key_pk`, so look at the key's columns rather than
  // its name: replace it only when it is not already (org_id, key).
  if (!existingTables.has("app_settings")) return;
  const pk = await db.execute(sql`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'app_settings'::regclass AND contype = 'p'
  `);
  const current = pk.rows[0] as { conname: string; definition: string } | undefined;
  if (current?.definition === "PRIMARY KEY (org_id, key)") return;
  if (current) {
    await db.execute(sql.raw(`ALTER TABLE app_settings DROP CONSTRAINT ${current.conname}`));
  }
  await db.execute(sql.raw(`ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (org_id, key)`));
}
