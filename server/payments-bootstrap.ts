import { sql } from "drizzle-orm";
import { db } from "./db";

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
}
