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
  // Transitional legacy note field. Canonical notes now live in customer_notes at account scope.
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
  phoneType: text("phone_type"),
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
  // Transitional legacy note field. Canonical notes now live in customer_notes at location scope.
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
  accountId: varchar("account_id").references(() => accounts.id),
  // Transitional legacy ownership field kept only for migration safety.
  customerId: varchar("customer_id").references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  scope: text("scope").notNull().default("ACCOUNT"),
  pinned: boolean("pinned").default(false),
  body: text("body").notNull(),
  // Legacy/freeform label snapshot retained for historical attribution compatibility.
  createdBy: text("created_by"),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedByUserId: varchar("updated_by_user_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const noteRevisions = pgTable("note_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => customerNotes.id),
  revisionNumber: integer("revision_number").notNull(),
  scope: text("scope").notNull(),
  accountId: varchar("account_id").references(() => accounts.id),
  locationId: varchar("location_id").references(() => locations.id),
  body: text("body").notNull(),
  changeType: text("change_type").notNull(),
  actorUserId: varchar("actor_user_id"),
  actorLabel: text("actor_label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceTypes = pgTable("service_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  defaultPrice: decimal("default_price", { precision: 10, scale: 2 }),
  estimatedDuration: integer("estimated_duration"),
  category: text("category"),
  opportunityLeadDays: integer("opportunity_lead_days"),
  opportunityLabel: text("opportunity_label"),
});

export const technicians = pgTable("technicians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull(),
  licenseId: text("license_id").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  email: text("email"),
  phone: text("phone"),
  color: text("color"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  agreementId: varchar("agreement_id"),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  dueDate: date("due_date"),
  timeWindow: text("time_window"),
  expectedDurationMinutes: integer("expected_duration_minutes"),
  price: decimal("price", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("PENDING_SCHEDULING"),
  assignedTechnicianId: varchar("assigned_technician_id").references(() => technicians.id),
  source: text("source").notNull().default("MANUAL"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  serviceId: varchar("service_id"),
  agreementId: varchar("agreement_id"),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  assignedTechnicianId: varchar("assigned_technician_id").references(() => technicians.id),
  source: text("source").notNull().default("MANUAL"),
  generatedForDate: date("generated_for_date"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledEndDate: timestamp("scheduled_end_date"),
  status: text("status").notNull().default("scheduled"),
  lockTime: boolean("lock_time").notNull().default(false),
  lockTechnician: boolean("lock_technician").notNull().default(false),
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agreements = pgTable("agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  agreementTemplateId: varchar("agreement_template_id"),
  initialAppointmentId: varchar("initial_appointment_id").references(() => appointments.id),
  startDateSource: text("start_date_source").notNull().default("MANUAL"),
  agreementName: text("agreement_name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  agreementType: text("agreement_type"),
  startDate: date("start_date").notNull(),
  termUnit: text("term_unit").notNull().default("YEAR"),
  termInterval: integer("term_interval").notNull().default(1),
  renewalDate: date("renewal_date"),
  nextServiceDate: date("next_service_date").notNull(),
  billingFrequency: text("billing_frequency"),
  price: decimal("price", { precision: 10, scale: 2 }),
  recurrenceUnit: text("recurrence_unit").notNull().default("MONTH"),
  recurrenceInterval: integer("recurrence_interval").notNull().default(1),
  generationLeadDays: integer("generation_lead_days").notNull().default(14),
  serviceWindowDays: integer("service_window_days"),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  serviceTemplateName: text("service_template_name"),
  defaultDurationMinutes: integer("default_duration_minutes"),
  serviceInstructions: text("service_instructions"),
  contractUrl: text("contract_url"),
  contractUploadedAt: timestamp("contract_uploaded_at"),
  contractSignedAt: timestamp("contract_signed_at"),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id"),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agreementTemplates = pgTable("agreement_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  defaultAgreementType: text("default_agreement_type"),
  defaultBillingFrequency: text("default_billing_frequency"),
  defaultTermUnit: text("default_term_unit").notNull().default("YEAR"),
  defaultTermInterval: integer("default_term_interval").notNull().default(1),
  defaultRecurrenceUnit: text("default_recurrence_unit").notNull().default("MONTH"),
  defaultRecurrenceInterval: integer("default_recurrence_interval").notNull().default(1),
  defaultGenerationLeadDays: integer("default_generation_lead_days").notNull().default(14),
  defaultServiceWindowDays: integer("default_service_window_days"),
  defaultServiceTypeId: varchar("default_service_type_id").references(() => serviceTypes.id),
  defaultServiceTemplateName: text("default_service_template_name"),
  defaultDurationMinutes: integer("default_duration_minutes"),
  defaultPrice: decimal("default_price", { precision: 10, scale: 2 }),
  defaultInstructions: text("default_instructions"),
  sortOrder: integer("sort_order"),
  internalCode: text("internal_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const serviceRecords = pgTable("service_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id"),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  serviceDate: timestamp("service_date").notNull(),
  technicianId: varchar("technician_id").references(() => technicians.id),
  technicianName: text("technician_name"),
  technicianLicenseNumber: text("technician_license_number"),
  notes: text("notes"),
  targetPests: text("target_pests").array(),
  areasServiced: text("areas_serviced"),
  conditionsFound: text("conditions_found"),
  recommendations: text("recommendations"),
  customerSignature: boolean("customer_signature").default(false),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  sourceServiceId: varchar("source_service_id").references(() => services.id),
  sourceServiceRecordId: varchar("source_service_record_id").references(() => serviceRecords.id),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  opportunityType: text("opportunity_type"),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("OPEN"),
  notes: text("notes"),
  convertedServiceId: varchar("converted_service_id").references(() => services.id),
  contactedAt: timestamp("contacted_at"),
  dismissedAt: timestamp("dismissed_at"),
  dismissedReason: text("dismissed_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  userId: varchar("user_id"),
  actorLabel: text("actor_label"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertBillingProfileSchema = createInsertSchema(billingProfiles).omit({ id: true });
export const insertCustomerNoteSchema = createInsertSchema(customerNotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNoteRevisionSchema = createInsertSchema(noteRevisions).omit({ id: true, createdAt: true });
export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({ id: true });
export const insertTechnicianSchema = createInsertSchema(technicians).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export const insertAgreementSchema = createInsertSchema(agreements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAgreementTemplateSchema = createInsertSchema(agreementTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({ id: true, createdAt: true });
export const insertOpportunitySchema = createInsertSchema(opportunities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductApplicationSchema = createInsertSchema(productApplications).omit({ id: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

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
export type NoteRevision = typeof noteRevisions.$inferSelect;
export type InsertNoteRevision = z.infer<typeof insertNoteRevisionSchema>;
export type ServiceType = typeof serviceTypes.$inferSelect;
export type InsertServiceType = z.infer<typeof insertServiceTypeSchema>;
export type Technician = typeof technicians.$inferSelect;
export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Agreement = typeof agreements.$inferSelect;
export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type AgreementTemplate = typeof agreementTemplates.$inferSelect;
export type InsertAgreementTemplate = z.infer<typeof insertAgreementTemplateSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type ProductApplication = typeof productApplications.$inferSelect;
export type InsertProductApplication = z.infer<typeof insertProductApplicationSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
