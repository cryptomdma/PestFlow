import {
  customers, contacts, locations, serviceTypes, appointments,
  serviceRecords, productApplications, invoices, communications,
  type Customer, type InsertCustomer,
  type Contact, type InsertContact,
  type Location, type InsertLocation,
  type ServiceType, type InsertServiceType,
  type Appointment, type InsertAppointment,
  type ServiceRecord, type InsertServiceRecord,
  type ProductApplication, type InsertProductApplication,
  type Invoice, type InsertInvoice,
  type Communication, type InsertCommunication,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;

  getContacts(customerId: string): Promise<Contact[]>;
  createContact(data: InsertContact): Promise<Contact>;

  getLocations(customerId: string): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  createLocation(data: InsertLocation): Promise<Location>;

  getServiceTypes(): Promise<ServiceType[]>;
  createServiceType(data: InsertServiceType): Promise<ServiceType>;

  getAppointments(): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(data: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;

  getServiceRecords(): Promise<ServiceRecord[]>;
  getServiceRecord(id: string): Promise<ServiceRecord | undefined>;
  createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord>;
  updateServiceRecord(id: string, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined>;

  getProductApplications(): Promise<ProductApplication[]>;
  getProductApplicationsByServiceRecord(serviceRecordId: string): Promise<ProductApplication[]>;
  createProductApplication(data: InsertProductApplication): Promise<ProductApplication>;

  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  getCommunications(customerId: string): Promise<Communication[]>;
  getAllCommunications(): Promise<Communication[]>;
  createCommunication(data: InsertCommunication): Promise<Communication>;
}

export class DatabaseStorage implements IStorage {
  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }

  async updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return customer;
  }

  async getContacts(customerId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.customerId, customerId));
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

  async createLocation(data: InsertLocation): Promise<Location> {
    const [location] = await db.insert(locations).values(data).returning();
    return location;
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

  async getAllCommunications(): Promise<Communication[]> {
    return db.select().from(communications);
  }

  async createCommunication(data: InsertCommunication): Promise<Communication> {
    const [comm] = await db.insert(communications).values(data).returning();
    return comm;
  }
}

export const storage = new DatabaseStorage();
