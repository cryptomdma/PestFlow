import { sql } from "drizzle-orm";
import { db } from "./db";

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`,
  );
  return result.rows.length > 0;
}

export async function bootstrapDocuments(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS documents (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      kind text NOT NULL,
      invoice_id varchar REFERENCES invoices(id),
      content_hash text NOT NULL,
      content_base64 text NOT NULL,
      mime_type text NOT NULL DEFAULT 'application/pdf',
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS documents_org_id_idx ON documents (org_id)`);
  // One INVOICE document per invoice - getOrCreateInvoiceDocument in
  // storage.ts relies on this to stay idempotent instead of re-rendering
  // (and re-storing a byte-identical copy of) the same invoice.
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS documents_invoice_id_uidx ON documents (invoice_id) WHERE invoice_id IS NOT NULL AND kind = 'INVOICE'`);

  // Pass 15 (PLAN_ROADMAP_V2.md C2.5): a STATEMENT document's identity. The
  // STATEMENT kind has been reserved since Pass 10 with no writer and no
  // identity column of its own - invoice_id is the INVOICE kind's - so the
  // statement's identity lives in a small nullable column set beside it
  // rather than in a second table: the same org_id / content_hash /
  // content_base64 / created_at columns serve both kinds, the list reads are
  // one query, and the columns are null on an INVOICE row exactly as
  // invoice_id is null on a STATEMENT row. No unique index: one row per
  // generation, on request only, never re-rendered in place. Guarded on the
  // first column so the effect prints once; every ALTER is IF NOT EXISTS,
  // so a second boot is a no-op that prints nothing.
  const hadStatementColumns = await columnExists("documents", "statement_variant");
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS statement_variant text`);
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS customer_id varchar REFERENCES customers(id)`);
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS location_id varchar REFERENCES locations(id)`);
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS period_from date`);
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS period_to date`);
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS generated_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS generated_by_label text`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON documents (customer_id) WHERE customer_id IS NOT NULL`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS documents_location_id_idx ON documents (location_id) WHERE location_id IS NOT NULL`);
  if (!hadStatementColumns) {
    const counts = await db.execute(sql`SELECT kind, count(*)::int AS count FROM documents GROUP BY kind ORDER BY kind`);
    const existing = (counts.rows as Array<{ kind: string; count: number }>).map((row) => `${row.count} ${row.kind}`).join(", ") || "0";
    console.log(
      `[document-bootstrap] Pass 15: documents gained the statement identity columns (statement_variant, customer_id, location_id, period_from, period_to, generated_by_user_id, generated_by_label) and partial indexes on customer_id and location_id. Existing rows: ${existing} document(s), all untouched - an INVOICE document keeps invoice_id as its identity and no STATEMENT row existed before this pass, so nothing was backfilled.`,
    );
  }
}
