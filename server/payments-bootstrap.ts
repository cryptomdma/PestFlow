import { sql } from "drizzle-orm";
import { db } from "./db";

async function columnIsNullable(table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT is_nullable FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`,
  );
  const row = result.rows[0] as { is_nullable?: string } | undefined;
  return row?.is_nullable === "YES";
}

// PLAN_BILLING_V1_1.md D5 - the payments ledger (Pass 6). Idempotent, run on
// every boot after bootstrapInvoices (the tables reference invoices) and
// bootstrapAgreements (payments designate an agreement). org_id is NOT NULL
// from the first CREATE, the same as invoice_line_items - these tables are
// only ever written by the org-scoped DatabaseStorage.
export async function bootstrapPayments(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      customer_id varchar NOT NULL REFERENCES customers(id),
      location_id varchar NOT NULL REFERENCES locations(id),
      method text NOT NULL,
      amount_cents integer NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
      designated_agreement_id varchar REFERENCES agreements(id),
      check_number text,
      reference_number text,
      memo text,
      received_at timestamp NOT NULL,
      collected_by_user_id varchar,
      collected_by_label text,
      confirmed_by_user_id varchar,
      confirmed_by_label text,
      confirmed_at timestamp,
      voided_by_user_id varchar,
      voided_by_label text,
      voided_at timestamp,
      void_reason text,
      refunded_by_user_id varchar,
      refunded_by_label text,
      refunded_at timestamp,
      refund_reason text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payments_org_id_idx ON payments (org_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payments_location_id_idx ON payments (location_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON payments (customer_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_applications (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      payment_id varchar NOT NULL REFERENCES payments(id),
      invoice_id varchar NOT NULL REFERENCES invoices(id),
      amount_cents integer NOT NULL,
      applied_by_user_id varchar,
      applied_by_label text,
      applied_at timestamp NOT NULL DEFAULT now(),
      released boolean NOT NULL DEFAULT false,
      released_by_user_id varchar,
      released_by_label text,
      released_at timestamp,
      release_reason text
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_applications_payment_id_idx ON payment_applications (payment_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payment_applications_invoice_id_idx ON payment_applications (invoice_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS credit_memos (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      customer_id varchar NOT NULL REFERENCES customers(id),
      location_id varchar NOT NULL REFERENCES locations(id),
      invoice_id varchar REFERENCES invoices(id),
      reason_code text NOT NULL,
      reason text NOT NULL,
      amount_cents integer NOT NULL,
      status text NOT NULL DEFAULT 'ISSUED',
      issued_by_user_id varchar,
      issued_by_label text,
      issued_at timestamp NOT NULL DEFAULT now(),
      voided_by_user_id varchar,
      voided_by_label text,
      voided_at timestamp,
      void_reason text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS credit_memos_org_id_idx ON credit_memos (org_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS credit_memos_location_id_idx ON credit_memos (location_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS credit_applications (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id varchar NOT NULL,
      credit_memo_id varchar NOT NULL REFERENCES credit_memos(id),
      invoice_id varchar NOT NULL REFERENCES invoices(id),
      amount_cents integer NOT NULL,
      applied_by_user_id varchar,
      applied_by_label text,
      applied_at timestamp NOT NULL DEFAULT now(),
      released boolean NOT NULL DEFAULT false,
      released_by_user_id varchar,
      released_by_label text,
      released_at timestamp,
      release_reason text
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS credit_applications_credit_memo_id_idx ON credit_applications (credit_memo_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS credit_applications_invoice_id_idx ON credit_applications (invoice_id)`);

  // The computed-and-stored rollups on invoices. Added nullable, backfilled
  // once, then constrained - the WHERE ... IS NULL guards make the backfill a
  // one-shot: after the first boot no row is NULL, so nothing here runs twice.
  //
  // Backfill rule: an invoice that was hand-marked PAID before the ledger
  // existed ("Mark Paid", the label with no backing amount D5 ends) keeps its
  // word - amount paid = its total, balance 0 - because status is derived from
  // these amounts from now on and recomputing it would flip every settled
  // invoice back to OPEN. No payments row is invented for them: the ledger
  // records money it saw, and it did not see this. Every other issued invoice
  // starts with nothing paid and its whole total due; DRAFT and VOID owe 0.
  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid_cents integer`);
  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance_due_cents integer`);
  await db.execute(sql`
    UPDATE invoices
    SET amount_paid_cents = CASE WHEN status = 'PAID' THEN total_amount_cents ELSE 0 END
    WHERE amount_paid_cents IS NULL
  `);
  await db.execute(sql`
    UPDATE invoices
    SET balance_due_cents = CASE
      WHEN status IN ('DRAFT', 'VOID') THEN 0
      ELSE GREATEST(total_amount_cents - amount_paid_cents, 0)
    END
    WHERE balance_due_cents IS NULL
  `);
  await db.execute(sql`ALTER TABLE invoices ALTER COLUMN amount_paid_cents SET DEFAULT 0`);
  await db.execute(sql`ALTER TABLE invoices ALTER COLUMN balance_due_cents SET DEFAULT 0`);
  await db.execute(sql`ALTER TABLE invoices ALTER COLUMN amount_paid_cents SET NOT NULL`);
  await db.execute(sql`ALTER TABLE invoices ALTER COLUMN balance_due_cents SET NOT NULL`);

  // Pass 7.6 (owner review of Pass 7.5, recorded under D5). Two nullable
  // columns and one one-shot backfill.
  //
  // payments.appointment_id - the visit the money was collected at. Intent
  // like designated_agreement_id: set once by the field's collect dialog,
  // never changed. Nullable for good: office-recorded money has no visit, and
  // nothing before this pass recorded one, so there is nothing to backfill -
  // guessing a visit from location, date and technician is exactly the
  // misattribution the column exists to end.
  await db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS appointment_id varchar REFERENCES appointments(id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payments_appointment_id_idx ON payments (appointment_id)`);

  // invoices.pending_applied_cents - the third rollup: unreleased applications
  // from PENDING payments, which show on the invoice but do not count yet.
  // Same pattern as the two above: add nullable, backfill WHERE ... IS NULL
  // from the ledger (the same sum recomputeInvoiceRollupTx stores from now
  // on), then default and constrain. The information_schema guard skips the
  // table-wide UPDATE on every boot after the first - once the column is NOT
  // NULL there is nothing left to backfill.
  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pending_applied_cents integer`);
  if (await columnIsNullable("invoices", "pending_applied_cents")) {
    await db.execute(sql`
      UPDATE invoices i
      SET pending_applied_cents = CASE
        WHEN i.status IN ('DRAFT', 'VOID') THEN 0
        ELSE COALESCE((
          SELECT SUM(pa.amount_cents)::int
          FROM payment_applications pa
          JOIN payments p ON p.id = pa.payment_id
          WHERE pa.invoice_id = i.id AND pa.released = false AND p.status = 'PENDING'
        ), 0)
      END
      WHERE i.pending_applied_cents IS NULL
    `);
    await db.execute(sql`ALTER TABLE invoices ALTER COLUMN pending_applied_cents SET DEFAULT 0`);
    await db.execute(sql`ALTER TABLE invoices ALTER COLUMN pending_applied_cents SET NOT NULL`);
  }

  // Pass 10 - the Phase 1 verification defect. voidInvoiceTx zeroed
  // amount_paid_cents / balance_due_cents by hand and never touched
  // pending_applied_cents, so an invoice voided while a PENDING payment was
  // applied to it kept that amount as "pending confirmation" after the
  // application was released. The code now zeroes it with the other two;
  // this squares any row voided before the fix. A VOID invoice holds nothing
  // (computeInvoiceRollup), so 0 is the only right value and the WHERE makes
  // it a no-op on every boot after the first - nothing to guard.
  const squared = await db.execute(sql`
    UPDATE invoices SET pending_applied_cents = 0
    WHERE status = 'VOID' AND pending_applied_cents <> 0
  `);
  if (squared.rowCount) {
    console.log(`[payments-bootstrap] zeroed pending_applied_cents on ${squared.rowCount} VOID invoice(s) voided before the Pass 10 fix`);
  }
}
