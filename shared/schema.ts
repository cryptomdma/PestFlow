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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  isPrimary: boolean("is_primary").default(false),
  propertyType: text("property_type").default("residential"),
  squareFootage: integer("square_footage"),
  lotSize: text("lot_size"),
  notes: text("notes"),
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
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  subject: text("subject"),
  body: text("body"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  status: text("status").default("sent"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({ id: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({ id: true, createdAt: true });
export const insertProductApplicationSchema = createInsertSchema(productApplications).omit({ id: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true });

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
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
