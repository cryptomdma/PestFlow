import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  customerType: text("customer_type").notNull().default("residential"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  tags: text("tags").array(),
  defaultBillingProfileId: varchar("default_billing_profile_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Transitional canonical grouping table for Phase 1 bootstrap.
// TODO(Phase2): remove legacyCustomerId after all reads/writes migrate off legacy customers.
export const accounts = pgTable("accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  primaryLocationId: varchar("primary_location_id"),
  status: text("status").notNull().default("active"),
  // Transitional legacy mapping for compatibility reads.
  legacyCustomerId: varchar("legacy_customer_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  isPrimary: boolean("is_primary").default(false),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Transitional nullable field for additive rollout. Bootstrap + write paths backfill/populate this.
  // TODO(Phase2): make accountId non-null once data and writes are fully canonicalized.
  accountId: varchar("account_id").references(() => accounts.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  isPrimary: boolean("is_primary").default(false),
  propertyType: text("property_type").default("residential"),
  squareFootage: integer("square_footage"),
  lotSize: text("lot_size"),
  gateCode: text("gate_code"),
  notes: text("notes"),
  billingProfileId: varchar("billing_profile_id"),
  source: text("source"),
});

export const billingProfiles = pgTable("billing_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  label: text("label").notNull(),
  methodType: text("method_type").notNull().default("invoice"),
  lastFour: text("last_four"),
  isDefault: boolean("is_default").default(false),
});

export const customerNotes = pgTable("customer_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  scope: text("scope").notNull().default("CUSTOMER"),
  pinned: boolean("pinned").default(false),
  body: text("body").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceTypes = pgTable("service_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  defaultPrice: decimal("default_price", { precision: 10, scale: 2 }),
  estimatedDuration: integer("estimated_duration"),
  category: text("category"),
});

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledEndDate: timestamp("scheduled_end_date"),
  status: text("status").notNull().default("scheduled"),
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceRecords = pgTable("service_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  serviceDate: timestamp("service_date").notNull(),
  technicianName: text("technician_name"),
  targetPests: text("target_pests").array(),
  areasServiced: text("areas_serviced"),
  conditionsFound: text("conditions_found"),
  recommendations: text("recommendations"),
  customerSignature: boolean("customer_signature").default(false),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productApplications = pgTable("product_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceRecordId: varchar("service_record_id").notNull().references(() => serviceRecords.id),
  productName: text("product_name").notNull(),
  epaRegNumber: text("epa_reg_number"),
  dilutionRate: text("dilution_rate"),
  amountApplied: text("amount_applied"),
  applicationMethod: text("application_method"),
  device: text("device"),
  applicationLocation: text("application_location"),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  serviceRecordId: varchar("service_record_id").references(() => serviceRecords.id),
  invoiceNumber: text("invoice_number").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const communications = pgTable("communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  subject: text("subject"),
  body: text("body"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  status: text("status").default("sent"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertBillingProfileSchema = createInsertSchema(billingProfiles).omit({ id: true });
export const insertCustomerNoteSchema = createInsertSchema(customerNotes).omit({ id: true, createdAt: true });
export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({ id: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({ id: true, createdAt: true });
export const insertProductApplicationSchema = createInsertSchema(productApplications).omit({ id: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true });

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type BillingProfile = typeof billingProfiles.$inferSelect;
export type InsertBillingProfile = z.infer<typeof insertBillingProfileSchema>;
export type CustomerNote = typeof customerNotes.$inferSelect;
export type InsertCustomerNote = z.infer<typeof insertCustomerNoteSchema>;
export type ServiceType = typeof serviceTypes.$inferSelect;
export type InsertServiceType = z.infer<typeof insertServiceTypeSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;
export type ProductApplication = typeof productApplications.$inferSelect;
export type InsertProductApplication = z.infer<typeof insertProductApplicationSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
