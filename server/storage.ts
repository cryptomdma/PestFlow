import {
  accounts,
  customers, contacts, locations, serviceTypes, appointments,
  serviceRecords, productApplications, invoices, communications,
  billingProfiles, customerNotes,
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
  type CustomerNote, type InsertCustomerNote,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
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

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  getCustomerDetailCompat(legacyCustomerId: string, selectedLocationId?: string): Promise<CustomerDetailCompatProjection | undefined>;
  getAccountInvariantSummary(): Promise<AccountInvariantSummary>;

  getContacts(customerId: string): Promise<Contact[]>;
  getContactsByLocation(locationId: string): Promise<Contact[]>;
  createContact(data: InsertContact): Promise<Contact>;

  getLocations(customerId: string): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(data: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  setPrimaryLocation(customerId: string, locationId: string): Promise<void>;

  getBillingProfiles(customerId: string): Promise<BillingProfile[]>;
  createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile>;

  getNotesByCustomer(customerId: string): Promise<CustomerNote[]>;
  getNotesByLocation(locationId: string): Promise<CustomerNote[]>;
  getSharedNotes(customerId: string): Promise<CustomerNote[]>;
  createNote(data: InsertCustomerNote): Promise<CustomerNote>;
  updateNoteScope(id: string, scope: string, customerId: string | null, locationId: string | null): Promise<CustomerNote | undefined>;

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
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
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

  async getNotesByCustomer(customerId: string): Promise<CustomerNote[]> {
    return db.select().from(customerNotes).where(eq(customerNotes.customerId, customerId));
  }

  async getNotesByLocation(locationId: string): Promise<CustomerNote[]> {
    return db.select().from(customerNotes).where(
      and(eq(customerNotes.locationId, locationId), eq(customerNotes.scope, "LOCATION"))
    );
  }

  async getSharedNotes(customerId: string): Promise<CustomerNote[]> {
    return db.select().from(customerNotes).where(
      and(eq(customerNotes.customerId, customerId), eq(customerNotes.scope, "CUSTOMER"))
    );
  }

  async createNote(data: InsertCustomerNote): Promise<CustomerNote> {
    const [note] = await db.insert(customerNotes).values(data).returning();
    return note;
  }

  async updateNoteScope(id: string, scope: string, customerId: string | null, locationId: string | null): Promise<CustomerNote | undefined> {
    const [note] = await db.update(customerNotes).set({ scope, customerId, locationId }).where(eq(customerNotes.id, id)).returning();
    return note;
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
