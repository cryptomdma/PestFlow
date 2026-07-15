import { sql } from "drizzle-orm";
import { db } from "./db";
import { getHeritageOrgId } from "./org-bootstrap";

// Every domain/settings table except `organizations` itself gets an org_id
// column. The DB enforces NOT NULL with a literal default of the Heritage
// org id, so existing insert call sites (not yet updated to pass orgId
// explicitly - that's Phase 0 unit 3) keep working unchanged. The Drizzle
// schema deliberately leaves orgId nullable for the same reason; unit 3
// tightens it to `.notNull()` once every write path threads it through.
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

  for (const table of TABLES_REQUIRING_ORG_ID) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS org_id varchar`));
    await db.execute(sql`UPDATE ${sql.raw(table)} SET org_id = ${heritageOrgId} WHERE org_id IS NULL`);
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN org_id SET DEFAULT '${heritageOrgId}'`));
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN org_id SET NOT NULL`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${table}_org_id_idx ON ${table} (org_id)`));
  }

  // app_settings.key alone used to be the primary key; with multiple orgs it
  // must become a composite (org_id, key) key so two orgs can each have their
  // own value for the same setting name. Dropping and re-adding the same
  // constraint name every boot is idempotent.
  await db.execute(sql.raw(`ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey`));
  await db.execute(sql.raw(`ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (org_id, key)`));
}
