import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { accounts, customers, locations } from "@shared/schema";
import { getHeritageOrgId } from "./org-bootstrap";

export const PLACEHOLDER_LOCATION_NAME = "Legacy Imported Location";
export const PLACEHOLDER_LOCATION_NOTE = "Auto-created placeholder during Phase 1 canonical account bootstrap.";

function isPlaceholderLocation(location: { name: string; notes: string | null }) {
  return location.name === PLACEHOLDER_LOCATION_NAME && location.notes === PLACEHOLDER_LOCATION_NOTE;
}

async function ensureAccountPrimaryInvariant(orgId: string, accountId: string): Promise<void> {
  const relatedLocations = await db.select().from(locations).where(and(eq(locations.orgId, orgId), eq(locations.accountId, accountId)));
  if (relatedLocations.length === 0) {
    await db.update(accounts).set({ primaryLocationId: null, updatedAt: new Date() }).where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)));
    return;
  }

  const preferredPrimary =
    relatedLocations.find((location) => location.isPrimary && !isPlaceholderLocation(location)) ||
    relatedLocations.find((location) => location.isPrimary) ||
    relatedLocations.find((location) => !isPlaceholderLocation(location)) ||
    relatedLocations[0];

  await db
    .update(locations)
    .set({ isPrimary: false })
    .where(and(eq(locations.orgId, orgId), eq(locations.accountId, accountId), eq(locations.isPrimary, true)));

  await db
    .update(locations)
    .set({ isPrimary: true })
    .where(and(eq(locations.orgId, orgId), eq(locations.id, preferredPrimary.id)));

  await db
    .update(accounts)
    .set({
      primaryLocationId: preferredPrimary.id,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)));
}

// Transitional bootstrap for canonical account/location grouping in Phase 1.
export async function bootstrapCanonicalAccounts(): Promise<void> {
  const orgId = await getHeritageOrgId();
  const allCustomers = await db.select().from(customers).where(eq(customers.orgId, orgId));

  for (const customer of allCustomers) {
    let [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.legacyCustomerId, customer.id)));

    if (!account) {
      [account] = await db
        .insert(accounts)
        .values({
          orgId,
          legacyCustomerId: customer.id,
          status: customer.status || "active",
        })
        .returning();
    }

    let customerLocations = await db
      .select()
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.customerId, customer.id)));

    if (customerLocations.length === 0) {
      const existingAccountLocations = await db
        .select()
        .from(locations)
        .where(and(eq(locations.orgId, orgId), eq(locations.accountId, account.id)));

      if (existingAccountLocations.length === 0) {
        const [placeholder] = await db
          .insert(locations)
          .values({
            orgId,
            customerId: customer.id,
            accountId: account.id,
            name: PLACEHOLDER_LOCATION_NAME,
            address: "Unknown Address",
            city: "Unknown",
            state: "NA",
            zip: "00000",
            isPrimary: true,
            propertyType: customer.customerType || "residential",
            notes: PLACEHOLDER_LOCATION_NOTE,
          })
          .returning();
        customerLocations = [placeholder];
      } else {
        customerLocations = existingAccountLocations;
      }
    }

    for (const location of customerLocations) {
      if (location.accountId !== account.id) {
        await db
          .update(locations)
          .set({ accountId: account.id })
          .where(and(eq(locations.orgId, orgId), eq(locations.id, location.id)));
      }
    }

    await ensureAccountPrimaryInvariant(orgId, account.id);
  }

  // Ensure every location has an account mapping, even if missed in customer loop.
  const ungroupedLocations = await db
    .select()
    .from(locations)
    .where(and(eq(locations.orgId, orgId), isNull(locations.accountId)));

  for (const location of ungroupedLocations) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.legacyCustomerId, location.customerId)));

    let resolvedAccountId = account?.id;
    if (!resolvedAccountId) {
      const [createdAccount] = await db
        .insert(accounts)
        .values({
          orgId,
          legacyCustomerId: location.customerId,
          status: "active",
        })
        .returning();
      resolvedAccountId = createdAccount.id;
    }

    await db
      .update(locations)
      .set({ accountId: resolvedAccountId })
      .where(and(eq(locations.orgId, orgId), eq(locations.id, location.id)));

    await ensureAccountPrimaryInvariant(orgId, resolvedAccountId);
  }

  // Final invariant sweep across all accounts.
  const allAccounts = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  for (const account of allAccounts) {
    await ensureAccountPrimaryInvariant(orgId, account.id);
  }
}
