import { and, eq, inArray, sql } from "drizzle-orm";
import { accounts, customerNotes, customers, locations, noteRevisions, type CustomerNote } from "@shared/schema";
import { db } from "./db";
import { PLACEHOLDER_LOCATION_NAME, PLACEHOLDER_LOCATION_NOTE } from "./account-bootstrap";
import { getHeritageOrgId } from "./org-bootstrap";

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
  await db.execute(sql`ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS created_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS updated_by_user_id varchar`);
  await db.execute(sql`ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`);
  await db.execute(sql`UPDATE customer_notes SET updated_at = created_at WHERE updated_at IS NULL`);
}

async function ensureNoteRevisionTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS note_revisions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id varchar NOT NULL REFERENCES customer_notes(id) ON DELETE CASCADE,
      revision_number integer NOT NULL,
      scope text NOT NULL,
      account_id varchar,
      location_id varchar,
      body text NOT NULL,
      change_type text NOT NULL,
      actor_user_id varchar,
      actor_label text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS note_revisions_note_revision_number_idx
    ON note_revisions (note_id, revision_number)
  `);
}

async function upsertCanonicalScopeNote(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  {
    orgId,
    scope,
    accountId,
    locationId,
    legacyBodies,
    scopedRows,
    noteIdsWithRevisions,
  }: {
    orgId: string;
    scope: "ACCOUNT" | "LOCATION";
    accountId: string;
    locationId: string | null;
    legacyBodies: string[];
    scopedRows: CustomerNote[];
    noteIdsWithRevisions: Set<string>;
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
  const redundantUnreferencedRows = redundantRows.filter((row) => !noteIdsWithRevisions.has(row.id));

  if (!mergedBody) {
    if (redundantUnreferencedRows.length > 0) {
      await tx.delete(customerNotes).where(and(eq(customerNotes.orgId, orgId), inArray(customerNotes.id, redundantUnreferencedRows.map((row) => row.id))));
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
      .where(and(eq(customerNotes.orgId, orgId), eq(customerNotes.id, primaryRow.id)));

    if (redundantUnreferencedRows.length > 0) {
      await tx.delete(customerNotes).where(and(eq(customerNotes.orgId, orgId), inArray(customerNotes.id, redundantUnreferencedRows.map((row) => row.id))));
    }
    return;
  }

  await tx.insert(customerNotes).values({
    orgId,
    accountId,
    customerId: null,
    locationId,
    scope,
    body: mergedBody,
    createdBy: "System Migration",
    createdByUserId: null,
    updatedByUserId: null,
    updatedAt: new Date(),
  });
}

async function backfillInitialNoteRevisions(orgId: string) {
  const [notes, existingRevisions] = await Promise.all([
    db.select().from(customerNotes).where(eq(customerNotes.orgId, orgId)),
    db.select().from(noteRevisions).where(eq(noteRevisions.orgId, orgId)),
  ]);

  const noteIdsWithRevisions = new Set(existingRevisions.map((revision) => revision.noteId));
  const baselineRows = notes
    .filter((note) => !noteIdsWithRevisions.has(note.id))
    .map((note) => ({
      orgId,
      noteId: note.id,
      revisionNumber: 1,
      scope: note.scope,
      accountId: note.accountId,
      locationId: note.locationId,
      body: note.body,
      changeType: "BASELINE",
      actorUserId: note.createdByUserId ?? null,
      actorLabel: note.createdBy ?? null,
      createdAt: note.createdAt,
    }));

  if (baselineRows.length > 0) {
    await db.insert(noteRevisions).values(baselineRows);
  }
}

// Structural setup only (raw SQL, no query-builder use) so it can run before
// the tenancy bootstrap adds org_id - which the query-builder-based migration
// below depends on already existing on every table it touches.
export async function bootstrapCanonicalNoteTables(): Promise<void> {
  await ensureCanonicalNoteColumns();
  await ensureNoteRevisionTable();
}

export async function bootstrapCanonicalNotes(): Promise<void> {
  const orgId = await getHeritageOrgId();
  const [allAccounts, allCustomers, allLocations, allNotes, allRevisions] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.orgId, orgId)),
    db.select().from(customers).where(eq(customers.orgId, orgId)),
    db.select().from(locations).where(eq(locations.orgId, orgId)),
    db.select().from(customerNotes).where(eq(customerNotes.orgId, orgId)),
    db.select().from(noteRevisions).where(eq(noteRevisions.orgId, orgId)),
  ]);
  const noteIdsWithRevisions = new Set(allRevisions.map((revision) => revision.noteId));

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
  const blankUnreferencedNoteIds = allNotes
    .filter((note) => !normalizeNoteBody(note.body) && !noteIdsWithRevisions.has(note.id))
    .map((note) => note.id);

  await db.transaction(async (tx) => {
    for (const [accountId, group] of Array.from(accountGroups.entries())) {
      await upsertCanonicalScopeNote(tx, {
        orgId,
        scope: "ACCOUNT",
        accountId,
        locationId: null,
        legacyBodies: group.legacyBodies,
        scopedRows: group.scopedRows,
        noteIdsWithRevisions,
      });
    }

    for (const [locationId, group] of Array.from(locationGroups.entries())) {
      await upsertCanonicalScopeNote(tx, {
        orgId,
        scope: "LOCATION",
        accountId: group.accountId,
        locationId,
        legacyBodies: group.legacyBodies,
        scopedRows: group.scopedRows,
        noteIdsWithRevisions,
      });
    }

    if (blankUnreferencedNoteIds.length > 0) {
      await tx.delete(customerNotes).where(and(eq(customerNotes.orgId, orgId), inArray(customerNotes.id, blankUnreferencedNoteIds)));
    }

    if (legacyCustomerIdsToClear.length > 0) {
      await tx
        .update(customers)
        .set({ notes: null })
        .where(and(eq(customers.orgId, orgId), inArray(customers.id, legacyCustomerIdsToClear)));
    }

    if (legacyLocationIdsToClear.length > 0) {
      await tx
        .update(locations)
        .set({ notes: null })
        .where(and(eq(locations.orgId, orgId), inArray(locations.id, legacyLocationIdsToClear)));
    }
  });

  await db.execute(
    sql`UPDATE customer_notes SET scope = 'ACCOUNT', customer_id = NULL, updated_at = COALESCE(updated_at, created_at, now()) WHERE account_id IS NOT NULL AND location_id IS NULL AND org_id = ${orgId}`,
  );
  await db.execute(sql`
    DELETE FROM customer_notes
    WHERE (body IS NULL OR BTRIM(body) = '')
      AND org_id = ${orgId}
      AND NOT EXISTS (
        SELECT 1
        FROM note_revisions
        WHERE note_revisions.note_id = customer_notes.id
      )
  `);
  await backfillInitialNoteRevisions(orgId);
}
