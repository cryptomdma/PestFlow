import { sql } from "drizzle-orm";
import { db } from "./db";

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
}
