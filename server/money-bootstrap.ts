import { sql } from "drizzle-orm";
import { db } from "./db";

// Each entry: [table, old decimal column, new integer cents column, NOT NULL, default cents value]
const MONEY_COLUMNS: Array<{
  table: string;
  oldColumn: string;
  newColumn: string;
  notNull: boolean;
  defaultCents?: number;
}> = [
  { table: "service_types", oldColumn: "default_price", newColumn: "default_price_cents", notNull: false },
  { table: "services", oldColumn: "price", newColumn: "price_cents", notNull: false },
  { table: "agreement_cancellation_policies", oldColumn: "cancellation_fee_amount", newColumn: "cancellation_fee_amount_cents", notNull: false },
  { table: "agreements", oldColumn: "price", newColumn: "price_cents", notNull: false },
  { table: "agreements", oldColumn: "cancellation_fee_amount", newColumn: "cancellation_fee_amount_cents", notNull: false },
  { table: "agreement_templates", oldColumn: "default_price", newColumn: "default_price_cents", notNull: false },
  { table: "invoices", oldColumn: "amount", newColumn: "amount_cents", notNull: true },
  { table: "invoices", oldColumn: "tax", newColumn: "tax_cents", notNull: false, defaultCents: 0 },
  { table: "invoices", oldColumn: "total_amount", newColumn: "total_amount_cents", notNull: true },
];

export async function bootstrapMoney(): Promise<void> {
  for (const { table, oldColumn, newColumn, notNull, defaultCents } of MONEY_COLUMNS) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${newColumn} integer`));
    await db.execute(
      sql.raw(
        `UPDATE ${table} SET ${newColumn} = ROUND(${oldColumn}::numeric * 100) WHERE ${newColumn} IS NULL AND ${oldColumn} IS NOT NULL`,
      ),
    );
    if (defaultCents !== undefined) {
      await db.execute(sql.raw(`UPDATE ${table} SET ${newColumn} = ${defaultCents} WHERE ${newColumn} IS NULL`));
      await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN ${newColumn} SET DEFAULT ${defaultCents}`));
    }
    if (notNull) {
      await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN ${newColumn} SET NOT NULL`));
    }
  }

  // Old decimal columns are dropped once every read/write path has cut over
  // to the *_cents columns above (server/storage.ts, routes.ts, and all
  // client money displays) - see the same PR that introduced this file.
  for (const { table, oldColumn } of MONEY_COLUMNS) {
    await db.execute(sql.raw(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${oldColumn}`));
  }
}
