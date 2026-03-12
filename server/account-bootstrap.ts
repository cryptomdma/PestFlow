import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { accounts, customers, locations } from "@shared/schema";

const PLACEHOLDER_LOCATION_NAME = "Legacy Imported Location";

// Transitional bootstrap for canonical account/location grouping in Phase 1.
export async function bootstrapCanonicalAccounts(): Promise<void> {
  const allCustomers = await db.select().from(customers);

  for (const customer of allCustomers) {
    let [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.legacyCustomerId, customer.id));

    if (!account) {
      [account] = await db
        .insert(accounts)
        .values({
          legacyCustomerId: customer.id,
          status: customer.status || "active",
        })
        .returning();
    }

    let accountLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.customerId, customer.id));

    if (accountLocations.length === 0) {
      const [placeholder] = await db
        .insert(locations)
        .values({
          customerId: customer.id,
          accountId: account.id,
          name: PLACEHOLDER_LOCATION_NAME,
          address: "Unknown Address",
          city: "Unknown",
          state: "NA",
          zip: "00000",
          isPrimary: true,
          propertyType: customer.customerType || "residential",
          notes: "Auto-created placeholder during Phase 1 canonical account bootstrap.",
        })
        .returning();
      accountLocations = [placeholder];
    }

    for (const location of accountLocations) {
      if (location.accountId !== account.id) {
        await db
          .update(locations)
          .set({ accountId: account.id })
          .where(eq(locations.id, location.id));
      }
    }

    const refreshedLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.accountId, account.id));

    const explicitPrimary =
      refreshedLocations.find((location) => location.isPrimary) || refreshedLocations[0];

    if (!explicitPrimary) {
      continue;
    }

    await db
      .update(locations)
      .set({ isPrimary: false })
      .where(
        and(
          eq(locations.accountId, account.id),
          eq(locations.isPrimary, true),
        ),
      );

    await db
      .update(locations)
      .set({ isPrimary: true })
      .where(eq(locations.id, explicitPrimary.id));

    await db
      .update(accounts)
      .set({
        primaryLocationId: explicitPrimary.id,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
  }

  const ungroupedLocations = await db
    .select()
    .from(locations)
    .where(isNull(locations.accountId));

  for (const location of ungroupedLocations) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.legacyCustomerId, location.customerId));

    if (!account) {
      continue;
    }

    await db
      .update(locations)
      .set({ accountId: account.id })
      .where(eq(locations.id, location.id));
  }
}
