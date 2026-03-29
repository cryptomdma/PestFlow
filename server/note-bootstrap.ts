import { and, eq, inArray, sql } from "drizzle-orm";
import { accounts, customerNotes, customers, locations, type CustomerNote } from "@shared/schema";
import { db } from "./db";
import { PLACEHOLDER_LOCATION_NAME, PLACEHOLDER_LOCATION_NOTE } from "./account-bootstrap";

function normalizeNoteBody(body: string | null | undefined) {
  const trimmed = body?.trim();
  return trimmed ? trimmed : null;
}

function isPlaceholderLocation(location: { name: string; notes: string | null }) {
  return location.name === PLACEHOLDER_LOCATION_NAME && location.notes === PLACEHOLDER_LOCATION_NOTE;
}

function mergeNoteBodies(bodies: Array<string | null | undefined>) {
  const merged = Array.from(
    new Set(
      bodies
        .map((body) => normalizeNoteBody(body))
        .filter((body): body is string => !!body),
    ),
  );

  return merged.join("\n\n");
}

async function ensureCanonicalNoteColumns() {
  await db.execute(sql`ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS account_id varchar`);
  await db.execute(sql`ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await db.execute(sql`UPDATE customer_notes SET updated_at = created_at WHERE updated_at IS NULL`);
}

async function upsertCanonicalScopeNote(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  {
    scope,
    accountId,
    locationId,
    legacyBodies,
    scopedRows,
  }: {
    scope: "ACCOUNT" | "LOCATION";
    accountId: string;
    locationId: string | null;
    legacyBodies: string[];
    scopedRows: CustomerNote[];
  },
) {
  const mergedBody = mergeNoteBodies([
    ...legacyBodies,
    ...scopedRows
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((row) => row.body),
  ]);

  const sortedRows = [...scopedRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [primaryRow, ...redundantRows] = sortedRows;

  if (!mergedBody) {
    if (sortedRows.length > 0) {
      await tx.delete(customerNotes).where(inArray(customerNotes.id, sortedRows.map((row) => row.id)));
    }
    return;
  }

  if (primaryRow) {
    await tx
      .update(customerNotes)
      .set({
        accountId,
        customerId: null,
        locationId,
        scope,
        body: mergedBody,
        updatedAt: new Date(),
      })
      .where(eq(customerNotes.id, primaryRow.id));

    if (redundantRows.length > 0) {
      await tx.delete(customerNotes).where(inArray(customerNotes.id, redundantRows.map((row) => row.id)));
    }
    return;
  }

  await tx.insert(customerNotes).values({
    accountId,
    customerId: null,
    locationId,
    scope,
    body: mergedBody,
    createdBy: "System Migration",
    updatedAt: new Date(),
  });
}

export async function bootstrapCanonicalNotes(): Promise<void> {
  await ensureCanonicalNoteColumns();

  const [allAccounts, allCustomers, allLocations, allNotes] = await Promise.all([
    db.select().from(accounts),
    db.select().from(customers),
    db.select().from(locations),
    db.select().from(customerNotes),
  ]);

  const accountIdByLegacyCustomerId = new Map(
    allAccounts
      .filter((account) => !!account.legacyCustomerId)
      .map((account) => [account.legacyCustomerId as string, account.id]),
  );
  const locationById = new Map(allLocations.map((location) => [location.id, location]));

  const accountGroups = new Map<string, { legacyBodies: string[]; scopedRows: CustomerNote[] }>();
  const locationGroups = new Map<string, { accountId: string; legacyBodies: string[]; scopedRows: CustomerNote[] }>();

  for (const customer of allCustomers) {
    const body = normalizeNoteBody(customer.notes);
    const accountId = accountIdByLegacyCustomerId.get(customer.id);
    if (!body || !accountId) {
      continue;
    }

    const existing = accountGroups.get(accountId) ?? { legacyBodies: [], scopedRows: [] };
    existing.legacyBodies.push(body);
    accountGroups.set(accountId, existing);
  }

  for (const location of allLocations) {
    if (isPlaceholderLocation(location)) {
      continue;
    }

    const body = normalizeNoteBody(location.notes);
    if (!body || !location.accountId) {
      continue;
    }

    const existing = locationGroups.get(location.id) ?? { accountId: location.accountId, legacyBodies: [], scopedRows: [] };
    existing.legacyBodies.push(body);
    locationGroups.set(location.id, existing);
  }

  for (const note of allNotes) {
    const normalizedBody = normalizeNoteBody(note.body);

    if (note.locationId) {
      const location = locationById.get(note.locationId);
      if (!location?.accountId) {
        continue;
      }

      const existing = locationGroups.get(note.locationId) ?? { accountId: location.accountId, legacyBodies: [], scopedRows: [] };
      if (normalizedBody) {
        existing.scopedRows.push(note);
      }
      locationGroups.set(note.locationId, existing);
      continue;
    }

    const resolvedAccountId = note.accountId ?? (note.customerId ? accountIdByLegacyCustomerId.get(note.customerId) : null);
    if (!resolvedAccountId) {
      continue;
    }

    const existing = accountGroups.get(resolvedAccountId) ?? { legacyBodies: [], scopedRows: [] };
    if (normalizedBody) {
      existing.scopedRows.push(note);
    }
    accountGroups.set(resolvedAccountId, existing);
  }

  const legacyCustomerIdsToClear = allCustomers
    .filter((customer) => !!normalizeNoteBody(customer.notes))
    .map((customer) => customer.id);
  const legacyLocationIdsToClear = allLocations
    .filter((location) => !isPlaceholderLocation(location) && !!normalizeNoteBody(location.notes))
    .map((location) => location.id);
  const blankNoteIds = allNotes
    .filter((note) => !normalizeNoteBody(note.body))
    .map((note) => note.id);

  await db.transaction(async (tx) => {
    for (const [accountId, group] of Array.from(accountGroups.entries())) {
      await upsertCanonicalScopeNote(tx, {
        scope: "ACCOUNT",
        accountId,
        locationId: null,
        legacyBodies: group.legacyBodies,
        scopedRows: group.scopedRows,
      });
    }

    for (const [locationId, group] of Array.from(locationGroups.entries())) {
      await upsertCanonicalScopeNote(tx, {
        scope: "LOCATION",
        accountId: group.accountId,
        locationId,
        legacyBodies: group.legacyBodies,
        scopedRows: group.scopedRows,
      });
    }

    if (blankNoteIds.length > 0) {
      await tx.delete(customerNotes).where(inArray(customerNotes.id, blankNoteIds));
    }

    if (legacyCustomerIdsToClear.length > 0) {
      await tx
        .update(customers)
        .set({ notes: null })
        .where(inArray(customers.id, legacyCustomerIdsToClear));
    }

    if (legacyLocationIdsToClear.length > 0) {
      await tx
        .update(locations)
        .set({ notes: null })
        .where(inArray(locations.id, legacyLocationIdsToClear));
    }
  });

  await db.execute(
    sql`UPDATE customer_notes SET scope = 'ACCOUNT', customer_id = NULL, updated_at = COALESCE(updated_at, created_at, now()) WHERE account_id IS NOT NULL AND location_id IS NULL`,
  );
  await db.execute(sql`DELETE FROM customer_notes WHERE body IS NULL OR BTRIM(body) = ''`);
}
