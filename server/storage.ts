import {
  auditLogs,
  accounts,
  customers, contacts, locations, serviceTypes, appointments,
  serviceRecords, productApplications, invoices, communications,
  billingProfiles, customerNotes,
  noteRevisions,
  type Account,
  type Customer, type InsertCustomer,
  type Contact, type InsertContact,
  type Location, type InsertLocation,
  type ServiceType, type InsertServiceType,
  type Appointment, type InsertAppointment,
  type ServiceRecord, type InsertServiceRecord,
  type ProductApplication, type InsertProductApplication,
  type Invoice, type InsertInvoice,
  type Communication, type InsertCommunication,
  type BillingProfile, type InsertBillingProfile,
  type CustomerNote,
  type NoteRevision,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { PLACEHOLDER_LOCATION_NAME, PLACEHOLDER_LOCATION_NOTE } from "./account-bootstrap";

export interface CustomerDetailCompatProjection {
  legacyCustomer: Customer;
  account: Account;
  primaryLocation: Location;
  selectedLocation: Location;
  relatedLocations: Location[];
  hasBillingOverride: boolean;
}

export interface AccountInvariantSummary {
  orphanedLocations: number;
  accountsWithMultiplePrimaries: number;
  accountsMissingPrimary: number;
  accountPrimaryLocationMismatch: number;
}

export interface LocationBalanceSummary {
  locationId: string;
  openBalance: number;
  totalInvoiced: number;
  invoiceCount: number;
}

export interface AuditActor {
  userId?: string | null;
  actorLabel?: string | null;
}

export interface CreateCustomerWithPrimaryLocationInput {
  customer: InsertCustomer;
  location: Omit<InsertLocation, "customerId" | "accountId" | "isPrimary">;
  initialContact?: Omit<InsertContact, "customerId" | "locationId">;
}

export interface CreateLocationWithPrimaryContactInput {
  location: InsertLocation;
  initialContact?: Omit<InsertContact, "customerId" | "locationId">;
}

export interface UpdateLocationProfileInput {
  customerId: string;
  locationId: string;
  location: Partial<Omit<InsertLocation, "customerId" | "accountId" | "isPrimary">>;
  customer?: Partial<InsertCustomer>;
  actor?: AuditActor;
}

export interface SaveScopedNoteInput {
  scope: "ACCOUNT" | "LOCATION";
  accountId?: string | null;
  customerId?: string | null;
  locationId?: string | null;
  body: string;
  actor?: AuditActor;
}

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  getCustomerDetailCompat(legacyCustomerId: string, selectedLocationId?: string): Promise<CustomerDetailCompatProjection | undefined>;
  getAccountInvariantSummary(): Promise<AccountInvariantSummary>;
  createCustomerWithPrimaryLocation(input: CreateCustomerWithPrimaryLocationInput): Promise<Customer>;
  updateLocationProfile(input: UpdateLocationProfileInput): Promise<{ customer?: Customer; location: Location } | undefined>;

  getContacts(customerId: string): Promise<Contact[]>;
  getContactsByLocation(locationId: string): Promise<Contact[]>;
  createContact(data: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  setPrimaryContact(contactId: string): Promise<Contact | undefined>;

  getLocations(customerId: string): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(data: InsertLocation): Promise<Location>;
  createLocationWithPrimaryContact(input: CreateLocationWithPrimaryContactInput): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  setPrimaryLocation(customerId: string, locationId: string): Promise<void>;

  getBillingProfiles(customerId: string): Promise<BillingProfile[]>;
  createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile>;

  getNotesByLocation(locationId: string): Promise<CustomerNote[]>;
  getSharedNotes(customerId: string): Promise<CustomerNote[]>;
  saveScopedNote(data: SaveScopedNoteInput): Promise<CustomerNote | null>;
  getNoteRevisions(noteId: string): Promise<NoteRevision[]>;

  getServiceTypes(): Promise<ServiceType[]>;
  createServiceType(data: InsertServiceType): Promise<ServiceType>;

  getAppointments(): Promise<Appointment[]>;
  getAppointmentsByLocation(locationId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(data: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;

  getServiceRecords(): Promise<ServiceRecord[]>;
  getServiceRecordsByLocation(locationId: string): Promise<ServiceRecord[]>;
  getServiceRecord(id: string): Promise<ServiceRecord | undefined>;
  createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord>;
  updateServiceRecord(id: string, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined>;

  getProductApplications(): Promise<ProductApplication[]>;
  getProductApplicationsByServiceRecord(serviceRecordId: string): Promise<ProductApplication[]>;
  createProductApplication(data: InsertProductApplication): Promise<ProductApplication>;

  getInvoices(): Promise<Invoice[]>;
  getInvoicesByLocation(locationId: string): Promise<Invoice[]>;
  getLocationBalancesByCustomer(customerId: string): Promise<LocationBalanceSummary[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  getCommunications(customerId: string): Promise<Communication[]>;
  getCommunicationsByLocation(locationId: string): Promise<Communication[]>;
  getAllCommunications(): Promise<Communication[]>;
  createCommunication(data: InsertCommunication): Promise<Communication>;

  getLocationScopedCounts(locationId: string): Promise<{ contacts: number; appointments: number; services: number; invoices: number; communications: number }>;
}

export class DatabaseStorage implements IStorage {
  private isPlaceholderLocation(location: { name: string; notes: string | null }) {
    return location.name === PLACEHOLDER_LOCATION_NAME && location.notes === PLACEHOLDER_LOCATION_NOTE;
  }

  private async ensureAccountForLegacyCustomer(legacyCustomerId: string): Promise<Account> {
    const [existing] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.legacyCustomerId, legacyCustomerId));

    if (existing) {
      return existing;
    }

    const [customer] = await db.select().from(customers).where(eq(customers.id, legacyCustomerId));
    const [created] = await db
      .insert(accounts)
      .values({
        legacyCustomerId,
        status: customer?.status || "active",
      })
      .returning();
    return created;
  }

  private async resolveAccountIdForLegacyCustomer(legacyCustomerId: string): Promise<string> {
    const account = await this.ensureAccountForLegacyCustomer(legacyCustomerId);
    return account.id;
  }

  private async resolveAccountIdForLocation(locationId: string): Promise<string | null> {
    const [location] = await db.select({ accountId: locations.accountId }).from(locations).where(eq(locations.id, locationId));
    return location?.accountId ?? null;
  }

  private async getNextNoteRevisionNumber(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    noteId: string,
  ): Promise<number> {
    const existing = await tx.select({ revisionNumber: noteRevisions.revisionNumber }).from(noteRevisions).where(eq(noteRevisions.noteId, noteId));
    const currentMax = existing.reduce((max, revision) => Math.max(max, revision.revisionNumber), 0);
    return currentMax + 1;
  }

  private async ensurePrimaryLocationInvariant(accountId: string, preferredLocationId?: string): Promise<void> {
    const relatedLocations = await db.select().from(locations).where(eq(locations.accountId, accountId));
    if (relatedLocations.length === 0) {
      await db.update(accounts).set({ primaryLocationId: null, updatedAt: new Date() }).where(eq(accounts.id, accountId));
      return;
    }

    let primaryCandidate =
      (preferredLocationId && relatedLocations.find((location) => location.id === preferredLocationId)) ||
      relatedLocations.find((location) => location.isPrimary && !this.isPlaceholderLocation(location)) ||
      relatedLocations.find((location) => location.isPrimary) ||
      relatedLocations.find((location) => !this.isPlaceholderLocation(location)) ||
      relatedLocations[0];

    if (!primaryCandidate) {
      primaryCandidate = relatedLocations[0];
    }

    await db.update(locations).set({ isPrimary: false }).where(eq(locations.accountId, accountId));
    await db.update(locations).set({ isPrimary: true }).where(eq(locations.id, primaryCandidate.id));
    await db
      .update(accounts)
      .set({ primaryLocationId: primaryCandidate.id, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    await this.ensureAccountForLegacyCustomer(customer.id);
    return customer;
  }

  async updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return customer;
  }

  async createCustomerWithPrimaryLocation(input: CreateCustomerWithPrimaryLocationInput): Promise<Customer> {
    const createdCustomer = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values(input.customer).returning();

      const [account] = await tx
        .insert(accounts)
        .values({
          legacyCustomerId: customer.id,
          status: customer.status || "active",
        })
        .returning();

      const [location] = await tx
        .insert(locations)
        .values({
          ...input.location,
          customerId: customer.id,
          accountId: account.id,
          isPrimary: true,
        })
        .returning();

      await tx
        .update(accounts)
        .set({ primaryLocationId: location.id, updatedAt: new Date() })
        .where(eq(accounts.id, account.id));

      if (input.initialContact) {
        await tx.insert(contacts).values({
          ...input.initialContact,
          customerId: customer.id,
          locationId: location.id,
        });
      }

      return customer;
    });

    return createdCustomer;
  }

  async updateLocationProfile(input: UpdateLocationProfileInput): Promise<{ customer?: Customer; location: Location } | undefined> {
    const result = await db.transaction(async (tx) => {
      const [existingLocation] = await tx.select().from(locations).where(eq(locations.id, input.locationId));
      if (!existingLocation || existingLocation.customerId !== input.customerId) {
        return undefined;
      }

      const [existingCustomer] = await tx.select().from(customers).where(eq(customers.id, input.customerId));
      if (!existingCustomer) {
        return undefined;
      }

      const [updatedLocation] = await tx
        .update(locations)
        .set(input.location)
        .where(eq(locations.id, input.locationId))
        .returning();

      await tx.insert(auditLogs).values({
        entityType: "location",
        entityId: updatedLocation.id,
        action: "update",
        userId: input.actor?.userId || null,
        actorLabel: input.actor?.actorLabel || null,
        beforeJson: existingLocation,
        afterJson: updatedLocation,
      });

      let updatedCustomer: Customer | undefined;
      if (input.customer) {
        const [customer] = await tx
          .update(customers)
          .set(input.customer)
          .where(eq(customers.id, input.customerId))
          .returning();
        updatedCustomer = customer;

        await tx.insert(auditLogs).values({
          entityType: "customer",
          entityId: customer.id,
          action: "update",
          userId: input.actor?.userId || null,
          actorLabel: input.actor?.actorLabel || null,
          beforeJson: existingCustomer,
          afterJson: customer,
        });
      }

      return { customer: updatedCustomer, location: updatedLocation };
    });

    return result;
  }

  // Transitional compatibility read projection for current customer-detail UI.
  async getCustomerDetailCompat(legacyCustomerId: string, selectedLocationId?: string): Promise<CustomerDetailCompatProjection | undefined> {
    const [legacyCustomer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, legacyCustomerId));

    if (!legacyCustomer) {
      return undefined;
    }

    const accountId = await this.resolveAccountIdForLegacyCustomer(legacyCustomerId);
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) {
      return undefined;
    }

    const relatedLocations = await db.select().from(locations).where(eq(locations.accountId, account.id));
    if (relatedLocations.length === 0) {
      return undefined;
    }

    const primaryLocation =
      relatedLocations.find((location) => location.id === account.primaryLocationId) ||
      relatedLocations.find((location) => location.isPrimary) ||
      relatedLocations[0];

    const selectedLocation =
      (selectedLocationId && relatedLocations.find((location) => location.id === selectedLocationId)) ||
      primaryLocation;

    return {
      legacyCustomer,
      account,
      primaryLocation,
      selectedLocation,
      relatedLocations,
      hasBillingOverride: relatedLocations.some((location) => !!location.billingProfileId),
    };
  }

  async getAccountInvariantSummary(): Promise<AccountInvariantSummary> {
    const orphanedLocationsResult = await db.execute(sql`
      select count(*)::int as c
      from locations
      where account_id is null
    `);

    const multiplePrimariesResult = await db.execute(sql`
      select count(*)::int as c
      from (
        select account_id
        from locations
        where account_id is not null and is_primary = true
        group by account_id
        having count(*) > 1
      ) t
    `);

    const missingPrimaryResult = await db.execute(sql`
      select count(*)::int as c
      from accounts a
      left join locations l on l.account_id = a.id and l.is_primary = true
      group by a.id
      having count(l.id) = 0
    `);

    const accountPrimaryLocationMismatchResult = await db.execute(sql`
      select count(*)::int as c
      from accounts a
      left join locations l on l.id = a.primary_location_id
      where a.primary_location_id is null
        or l.id is null
        or l.account_id <> a.id
    `);

    return {
      orphanedLocations: Number(orphanedLocationsResult.rows[0]?.c || 0),
      accountsWithMultiplePrimaries: Number(multiplePrimariesResult.rows[0]?.c || 0),
      accountsMissingPrimary: missingPrimaryResult.rows.length,
      accountPrimaryLocationMismatch: Number(accountPrimaryLocationMismatchResult.rows[0]?.c || 0),
    };
  }

  async getContacts(customerId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.customerId, customerId));
  }

  async getContactsByLocation(locationId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.locationId, locationId));
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const createdContact = await db.transaction(async (tx) => {
      const existingLocationContacts = data.locationId
        ? await tx.select().from(contacts).where(eq(contacts.locationId, data.locationId))
        : [];

      const shouldBePrimary = !!data.isPrimary || existingLocationContacts.length === 0;

      if (data.locationId && shouldBePrimary) {
        await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.locationId, data.locationId));
      }

      const [contact] = await tx.insert(contacts).values({ ...data, isPrimary: shouldBePrimary }).returning();
      return contact;
    });

    return createdContact;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [existing] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!existing) {
      return undefined;
    }

    const nextLocationId = data.locationId ?? existing.locationId;
    const requestedPrimary = data.isPrimary ?? existing.isPrimary ?? false;

    return db.transaction(async (tx) => {
      if (nextLocationId && requestedPrimary) {
        await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.locationId, nextLocationId));
      }

      const [updatedContact] = await tx
        .update(contacts)
        .set({ ...data, isPrimary: requestedPrimary })
        .where(eq(contacts.id, id))
        .returning();

      return updatedContact;
    });
  }

  async setPrimaryContact(contactId: string): Promise<Contact | undefined> {
    const [existing] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    if (!existing?.locationId) {
      return existing;
    }

    const updatedContact = await db.transaction(async (tx) => {
      await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.locationId, existing.locationId!));
      const [contact] = await tx.update(contacts).set({ isPrimary: true }).where(eq(contacts.id, contactId)).returning();
      return contact;
    });

    return updatedContact;
  }

  async getLocations(customerId: string): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.customerId, customerId));
  }

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations);
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [loc] = await db.select().from(locations).where(eq(locations.id, id));
    return loc;
  }

  async createLocation(data: InsertLocation): Promise<Location> {
    const accountId = data.accountId || await this.resolveAccountIdForLegacyCustomer(data.customerId);
    const [location] = await db.insert(locations).values({ ...data, accountId }).returning();
    if (data.isPrimary) {
      await this.ensurePrimaryLocationInvariant(accountId, location.id);
    } else {
      await this.ensurePrimaryLocationInvariant(accountId);
    }
    return location;
  }

  async createLocationWithPrimaryContact(input: CreateLocationWithPrimaryContactInput): Promise<Location> {
    const accountId = input.location.accountId || await this.resolveAccountIdForLegacyCustomer(input.location.customerId);

    const createdLocation = await db.transaction(async (tx) => {
      const [location] = await tx
        .insert(locations)
        .values({
          ...input.location,
          accountId,
        })
        .returning();

      if (input.initialContact) {
        await tx.insert(contacts).values({
          ...input.initialContact,
          customerId: location.customerId,
          locationId: location.id,
          isPrimary: true,
        });
      }

      return location;
    });

    if (createdLocation.isPrimary) {
      await this.ensurePrimaryLocationInvariant(accountId, createdLocation.id);
    } else {
      await this.ensurePrimaryLocationInvariant(accountId);
    }

    return createdLocation;
  }

  async updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined> {
    const [existing] = await db.select().from(locations).where(eq(locations.id, id));
    if (!existing) {
      return undefined;
    }

    const customerId = data.customerId || existing.customerId;
    const accountId = data.accountId || await this.resolveAccountIdForLegacyCustomer(customerId);
    const payload: Partial<InsertLocation> = { ...data, accountId };

    const [loc] = await db.update(locations).set(payload).where(eq(locations.id, id)).returning();
    if (!loc?.accountId) {
      return loc;
    }

    await this.ensurePrimaryLocationInvariant(loc.accountId, loc.isPrimary ? loc.id : undefined);
    if (existing.accountId && existing.accountId !== loc.accountId) {
      await this.ensurePrimaryLocationInvariant(existing.accountId);
    }
    return loc;
  }

  async setPrimaryLocation(_customerId: string, locationId: string): Promise<void> {
    const [targetLocation] = await db.select().from(locations).where(eq(locations.id, locationId));
    if (!targetLocation?.accountId) {
      return;
    }

    await this.ensurePrimaryLocationInvariant(targetLocation.accountId, locationId);
  }

  async getBillingProfiles(customerId: string): Promise<BillingProfile[]> {
    return db.select().from(billingProfiles).where(eq(billingProfiles.customerId, customerId));
  }

  async createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile> {
    const [bp] = await db.insert(billingProfiles).values(data).returning();
    return bp;
  }

  async getNotesByLocation(locationId: string): Promise<CustomerNote[]> {
    return db.select().from(customerNotes).where(
      and(eq(customerNotes.locationId, locationId), eq(customerNotes.scope, "LOCATION"))
    );
  }

  async getSharedNotes(customerId: string): Promise<CustomerNote[]> {
    const accountId = await this.resolveAccountIdForLegacyCustomer(customerId);
    return db.select().from(customerNotes).where(
      and(eq(customerNotes.accountId, accountId), eq(customerNotes.scope, "ACCOUNT"))
    );
  }

  async getNoteRevisions(noteId: string): Promise<NoteRevision[]> {
    const revisions = await db.select().from(noteRevisions).where(eq(noteRevisions.noteId, noteId));
    return revisions.sort((a, b) => b.revisionNumber - a.revisionNumber);
  }

  async saveScopedNote(data: SaveScopedNoteInput): Promise<CustomerNote | null> {
    const accountId =
      data.scope === "ACCOUNT"
        ? data.accountId ?? (data.customerId ? await this.resolveAccountIdForLegacyCustomer(data.customerId) : null)
        : data.locationId
          ? await this.resolveAccountIdForLocation(data.locationId)
          : null;

    const locationId = data.scope === "LOCATION" ? data.locationId ?? null : null;

    if (!accountId) {
      return null;
    }

    const scopeFilter =
      data.scope === "ACCOUNT"
        ? and(eq(customerNotes.accountId, accountId), eq(customerNotes.scope, "ACCOUNT"))
        : and(eq(customerNotes.locationId, locationId ?? ""), eq(customerNotes.scope, "LOCATION"));

    return db.transaction(async (tx) => {
      const existingNotes = await tx.select().from(customerNotes).where(scopeFilter);
      const [primaryNote, ...legacyNotes] = [...existingNotes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const legacyNoteIds = legacyNotes.map((note) => note.id);
      const referencedLegacyNoteIds = legacyNoteIds.length > 0
        ? new Set(
            (await tx.select({ noteId: noteRevisions.noteId }).from(noteRevisions).where(inArray(noteRevisions.noteId, legacyNoteIds)))
              .map((revision) => revision.noteId),
          )
        : new Set<string>();
      const deletableLegacyNotes = legacyNotes.filter((note) => !referencedLegacyNoteIds.has(note.id));

      const nextBody = data.body.trim();
      const actorUserId = data.actor?.userId || null;
      const actorLabel = data.actor?.actorLabel || null;

      if (!nextBody && !primaryNote) {
        return null;
      }

      if (primaryNote) {
        const [updated] = await tx
          .update(customerNotes)
          .set({
            accountId,
            customerId: null,
            locationId,
            scope: data.scope,
            body: nextBody,
            updatedByUserId: actorUserId,
            updatedAt: new Date(),
          })
          .where(eq(customerNotes.id, primaryNote.id))
          .returning();

        if (deletableLegacyNotes.length > 0) {
          await tx.delete(customerNotes).where(inArray(customerNotes.id, deletableLegacyNotes.map((note) => note.id)));
        }

        if (primaryNote.body !== nextBody) {
          const revisionNumber = await this.getNextNoteRevisionNumber(tx, primaryNote.id);
          await tx.insert(noteRevisions).values({
            noteId: primaryNote.id,
            revisionNumber,
            scope: data.scope,
            accountId,
            locationId,
            body: nextBody,
            changeType: nextBody ? "UPDATED" : "CLEARED",
            actorUserId,
            actorLabel,
            createdAt: new Date(),
          });
        }

        return updated;
      }

      const [created] = await tx
        .insert(customerNotes)
        .values({
          scope: data.scope,
          accountId,
          customerId: null,
          locationId,
          body: nextBody,
          createdBy: actorLabel,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(noteRevisions).values({
        noteId: created.id,
        revisionNumber: 1,
        scope: data.scope,
        accountId,
        locationId,
        body: nextBody,
        changeType: "CREATED",
        actorUserId,
        actorLabel,
        createdAt: new Date(),
      });

      return created;
    });
  }

  async getServiceTypes(): Promise<ServiceType[]> {
    return db.select().from(serviceTypes);
  }

  async createServiceType(data: InsertServiceType): Promise<ServiceType> {
    const [st] = await db.insert(serviceTypes).values(data).returning();
    return st;
  }

  async getAppointments(): Promise<Appointment[]> {
    return db.select().from(appointments);
  }

  async getAppointmentsByLocation(locationId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.locationId, locationId));
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appt;
  }

  async createAppointment(data: InsertAppointment): Promise<Appointment> {
    const [appt] = await db.insert(appointments).values(data).returning();
    return appt;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [appt] = await db.update(appointments).set(data).where(eq(appointments.id, id)).returning();
    return appt;
  }

  async getServiceRecords(): Promise<ServiceRecord[]> {
    return db.select().from(serviceRecords);
  }

  async getServiceRecordsByLocation(locationId: string): Promise<ServiceRecord[]> {
    return db.select().from(serviceRecords).where(eq(serviceRecords.locationId, locationId));
  }

  async getServiceRecord(id: string): Promise<ServiceRecord | undefined> {
    const [sr] = await db.select().from(serviceRecords).where(eq(serviceRecords.id, id));
    return sr;
  }

  async createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord> {
    const [sr] = await db.insert(serviceRecords).values(data).returning();
    return sr;
  }

  async updateServiceRecord(id: string, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined> {
    const [sr] = await db.update(serviceRecords).set(data).where(eq(serviceRecords.id, id)).returning();
    return sr;
  }

  async getProductApplications(): Promise<ProductApplication[]> {
    return db.select().from(productApplications);
  }

  async getProductApplicationsByServiceRecord(serviceRecordId: string): Promise<ProductApplication[]> {
    return db.select().from(productApplications).where(eq(productApplications.serviceRecordId, serviceRecordId));
  }

  async createProductApplication(data: InsertProductApplication): Promise<ProductApplication> {
    const [pa] = await db.insert(productApplications).values(data).returning();
    return pa;
  }

  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices);
  }

  async getInvoicesByLocation(locationId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.locationId, locationId));
  }

  async getLocationBalancesByCustomer(customerId: string): Promise<LocationBalanceSummary[]> {
    const customerInvoices = await db.select().from(invoices).where(eq(invoices.customerId, customerId));
    const balances = new Map<string, LocationBalanceSummary>();

    for (const invoice of customerInvoices) {
      if (!invoice.locationId) {
        continue;
      }

      const current = balances.get(invoice.locationId) ?? {
        locationId: invoice.locationId,
        openBalance: 0,
        totalInvoiced: 0,
        invoiceCount: 0,
      };

      const invoiceTotal = parseFloat(invoice.totalAmount || "0");
      current.totalInvoiced += invoiceTotal;
      current.invoiceCount += 1;

      if (invoice.status !== "paid") {
        current.openBalance += invoiceTotal;
      }

      balances.set(invoice.locationId, current);
    }

    return Array.from(balances.values());
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    return inv;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [inv] = await db.insert(invoices).values(data).returning();
    return inv;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [inv] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return inv;
  }

  async getCommunications(customerId: string): Promise<Communication[]> {
    return db.select().from(communications).where(eq(communications.customerId, customerId));
  }

  async getCommunicationsByLocation(locationId: string): Promise<Communication[]> {
    return db.select().from(communications).where(eq(communications.locationId, locationId));
  }

  async getAllCommunications(): Promise<Communication[]> {
    return db.select().from(communications);
  }

  async createCommunication(data: InsertCommunication): Promise<Communication> {
    const [comm] = await db.insert(communications).values(data).returning();
    return comm;
  }

  async getLocationScopedCounts(locationId: string): Promise<{ contacts: number; appointments: number; services: number; invoices: number; communications: number }> {
    const [cts, appts, svcs, invs, comms] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.locationId, locationId)),
      db.select().from(appointments).where(eq(appointments.locationId, locationId)),
      db.select().from(serviceRecords).where(eq(serviceRecords.locationId, locationId)),
      db.select().from(invoices).where(eq(invoices.locationId, locationId)),
      db.select().from(communications).where(eq(communications.locationId, locationId)),
    ]);
    return { contacts: cts.length, appointments: appts.length, services: svcs.length, invoices: invs.length, communications: comms.length };
  }
}

export const storage = new DatabaseStorage();
