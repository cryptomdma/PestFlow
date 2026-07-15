import { sql } from "drizzle-orm";
import { db } from "./db";

export async function bootstrapInvoices(): Promise<void> {
  // invoices/communications predate the bootstrap-script convention (created
  // via an early db:push, not a CREATE TABLE here) - this CREATE TABLE only
  // matters for a genuinely fresh install; on this and every other existing
  // DB it's a no-op and the ALTER statements below do the real work.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id varchar NOT NULL REFERENCES customers(id),
      location_id varchar REFERENCES locations(id),
      service_record_id varchar REFERENCES service_records(id),
      invoice_number text NOT NULL,
      public_id varchar NOT NULL DEFAULT gen_random_uuid(),
      billing_profile_snapshot jsonb,
      amount_cents integer NOT NULL,
      tax_cents integer DEFAULT 0,
      total_amount_cents integer NOT NULL,
      status text NOT NULL DEFAULT 'OPEN',
      due_date timestamp,
      sent_at timestamp,
      paid_date timestamp,
      notes text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_id varchar DEFAULT gen_random_uuid()`);
  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_profile_snapshot jsonb`);
  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at timestamp`);
  await db.execute(sql`UPDATE invoices SET public_id = gen_random_uuid() WHERE public_id IS NULL`);
  await db.execute(sql`ALTER TABLE invoices ALTER COLUMN public_id SET NOT NULL`);

  // Old enum was lowercase pending|paid|overdue with "overdue" stored as a
  // status. New enum is DRAFT|OPEN|PARTIALLY_PAID|PAID|VOID; "overdue" is
  // derived client-side from dueDate on an OPEN invoice, never stored -
  // matches the "aging is derived, never stored" rule for the AR ledger.
  await db.execute(sql`UPDATE invoices SET status = 'OPEN' WHERE status IN ('pending', 'overdue')`);
  await db.execute(sql`UPDATE invoices SET status = 'PAID' WHERE status = 'paid'`);
  await db.execute(sql`ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'OPEN'`);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_id_uidx ON invoices (public_id)`);
  // Partial unique index: a service record can have at most one non-void
  // invoice. Voiding frees it for a corrected one; double-clicking generate
  // hits this constraint instead of creating a duplicate.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_service_record_id_non_void_uidx
    ON invoices (service_record_id)
    WHERE status != 'VOID' AND service_record_id IS NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      invoice_id varchar NOT NULL REFERENCES invoices(id),
      service_id varchar REFERENCES services(id),
      service_record_id varchar REFERENCES service_records(id),
      line_type text NOT NULL DEFAULT 'ADJUSTMENT',
      description text NOT NULL,
      quantity integer NOT NULL DEFAULT 1,
      unit_price_cents integer NOT NULL,
      amount_cents integer NOT NULL,
      taxable boolean NOT NULL DEFAULT false,
      tax_cents integer NOT NULL DEFAULT 0,
      sort_order integer
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_id_idx ON invoice_line_items (invoice_id)`);

  // No seed row here deliberately: getNextInvoiceNumber's insert-or-increment
  // upsert relies on the first call for an org hitting the plain insert path
  // (nextNumber = 1); pre-seeding a row would make that first call take the
  // ON CONFLICT increment path instead and skip number 1.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invoice_counters (
      org_id varchar PRIMARY KEY,
      next_number integer NOT NULL DEFAULT 1
    )
  `);
}
