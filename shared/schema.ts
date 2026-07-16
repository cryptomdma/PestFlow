import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb, date, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
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
  orgId: varchar("org_id").notNull(),
  primaryLocationId: varchar("primary_location_id"),
  status: text("status").notNull().default("active"),
  // Transitional legacy mapping for compatibility reads.
  legacyCustomerId: varchar("legacy_customer_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
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
  orgId: varchar("org_id").notNull(),
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

// Org-level reusable presets, Settings-configurable (same shape as
// ServiceType/TargetPest). A billing_profiles instance may optionally be
// created from one of these; the template itself never bills anything.
export const billingProfileTemplates = pgTable("billing_profile_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  billingType: text("billing_type").notNull().default("invoice_terms"), // card | ach | invoice_terms | cash | check
  defaultInvoiceTerms: text("default_invoice_terms"),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Billing information used by a Location, or inherited from the Account
// context when locationId is null. Per CANONICAL_DOMAIN_RULES_V1.md §4: the
// account (or its primary location) provides the default billing behavior,
// child locations inherit it, and a location may override with its own row
// here when needed - see resolveBillingProfileForLocation in storage.ts.
export const billingProfiles = pgTable("billing_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  accountId: varchar("account_id").notNull().references(() => accounts.id),
  locationId: varchar("location_id").references(() => locations.id),
  templateId: varchar("template_id").references(() => billingProfileTemplates.id),
  label: text("label").notNull(),
  billingType: text("billing_type").notNull().default("invoice_terms"), // card | ach | invoice_terms | cash | check
  billingName: text("billing_name"),
  billingAddress: text("billing_address"),
  cardOnFileToken: text("card_on_file_token"),
  achToken: text("ach_token"),
  invoiceTerms: text("invoice_terms"),
  lastFour: text("last_four"),
  isDefault: boolean("is_default").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customerNotes = pgTable("customer_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
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
  orgId: varchar("org_id").notNull(),
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
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  defaultPriceCents: integer("default_price_cents"),
  estimatedDuration: integer("estimated_duration"),
  category: text("category"),
  opportunityLeadDays: integer("opportunity_lead_days"),
  opportunityLabel: text("opportunity_label"),
});

export const technicians = pgTable("technicians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
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
  orgId: varchar("org_id").notNull(),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  agreementId: varchar("agreement_id"),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  dueDate: date("due_date"),
  generatedForDate: date("generated_for_date"),
  serviceWindowStart: date("service_window_start"),
  serviceWindowEnd: date("service_window_end"),
  timeWindow: text("time_window"),
  expectedDurationMinutes: integer("expected_duration_minutes"),
  priceCents: integer("price_cents"),
  status: text("status").notNull().default("PENDING_SCHEDULING"),
  assignedTechnicianId: varchar("assigned_technician_id").references(() => technicians.id),
  source: text("source").notNull().default("MANUAL"),
  schedulingMode: text("scheduling_mode"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
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
  timeInAt: timestamp("time_in_at"),
  timeOutAt: timestamp("time_out_at"),
  durationMinutes: integer("duration_minutes"),
  timeInLat: decimal("time_in_lat", { precision: 10, scale: 7 }),
  timeInLng: decimal("time_in_lng", { precision: 10, scale: 7 }),
  timeOutLat: decimal("time_out_lat", { precision: 10, scale: 7 }),
  timeOutLng: decimal("time_out_lng", { precision: 10, scale: 7 }),
  status: text("status").notNull().default("scheduled"),
  cancelReason: text("cancel_reason"),
  cancelNotes: text("cancel_notes"),
  cancelRequestedAt: timestamp("cancel_requested_at"),
  cancelRequestedByLabel: text("cancel_requested_by_label"),
  rescheduleRequested: boolean("reschedule_requested").notNull().default(false),
  rescheduleRequestedAt: timestamp("reschedule_requested_at"),
  lockTime: boolean("lock_time").notNull().default(false),
  lockTechnician: boolean("lock_technician").notNull().default(false),
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Org-level reusable charge-schedule presets, Settings-configurable - same
// shape as agreementCancellationPolicies: this table IS the referenced/
// snapshotted entity, there is no separate "instance" table. Per
// PLAN_BILLING_V1.md §1.2: Billing Plan = when/how much/what's due up
// front, attached to the thing being sold (Agreement / Service Type) - not
// to be confused with Billing Profile (who pays, how - attached to the
// payer/Account). The actual charge-emitting engine that reads this is
// Phase 1 unit 12 (nightly billing run); this table + the snapshot on
// agreements is only the foundation.
export const billingPlans = pgTable("billing_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),

  chargeTrigger: text("charge_trigger").notNull().default("ON_SCHEDULE"), // ON_SERVICE_COMPLETION | ON_SCHEDULE | ON_AGREEMENT_START
  billingMode: text("billing_mode").notNull().default("RECURRING_INTERVAL"), // PER_SERVICE | RECURRING_INTERVAL | PREPAID_TERM | INSTALLMENT
  intervalUnit: text("interval_unit"), // DAY | WEEK | MONTH | QUARTER | YEAR
  intervalCount: integer("interval_count"),
  installmentCount: integer("installment_count"),

  anchorMode: text("anchor_mode").notNull().default("SIGNUP_DATE"), // SIGNUP_DATE | CALENDAR_DAY | CUSTOM
  anchorDay: integer("anchor_day"),
  prorationRule: text("proration_rule").notNull().default("NONE"), // NONE | DAILY | FIRST_PERIOD_FULL

  initialChargeType: text("initial_charge_type"), // NONE | DOWN_PAYMENT | CLEANOUT_SURCHARGE | PREPAY_FULL
  initialChargeCents: integer("initial_charge_cents"),
  initialChargeCoversFirstPeriod: boolean("initial_charge_covers_first_period").notNull().default(false),
  initialChargeCollectedBy: text("initial_charge_collected_by"), // OFFICE_AT_SIGNING | TECH_AT_FIRST_SERVICE
  fieldAddableSurcharge: boolean("field_addable_surcharge").notNull().default(false),

  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agreementCancellationPolicies = pgTable("agreement_cancellation_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  cancellationFeeType: text("cancellation_fee_type").notNull().default("NONE"),
  cancellationFeeAmountCents: integer("cancellation_fee_amount_cents"),
  noticeDays: integer("notice_days").notNull().default(0),
  effectiveDateMode: text("effective_date_mode").notNull().default("IMMEDIATE"),
  cancelPendingServicesDefault: boolean("cancel_pending_services_default").notNull().default(true),
  cancelScheduledAppointmentsDefault: boolean("cancel_scheduled_appointments_default").notNull().default(false),
  closeOpenOpportunitiesDefault: boolean("close_open_opportunities_default").notNull().default(false),
  createRetentionOpportunityDefault: boolean("create_retention_opportunity_default").notNull().default(false),
  defaultRetentionFollowUpDays: integer("default_retention_follow_up_days"),
  allowManagerOverride: boolean("allow_manager_override").notNull().default(false),
  requiresOverrideReason: boolean("requires_override_reason").notNull().default(false),
  termsSummary: text("terms_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agreements = pgTable("agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  agreementTemplateId: varchar("agreement_template_id"),
  cancellationPolicyId: varchar("cancellation_policy_id").references(() => agreementCancellationPolicies.id),
  cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot"),
  billingPlanId: varchar("billing_plan_id").references(() => billingPlans.id),
  billingPlanSnapshot: jsonb("billing_plan_snapshot"),
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
  priceCents: integer("price_cents"),
  // Snapshotted once at creation from term x recurrence (see
  // computeExpectedServiceCount in storage.ts) and never recomputed on
  // update, so a later term/frequency edit can't retroactively change the
  // production value of services already performed. Production value is
  // computed at read time as priceCents / expectedServiceCount - see
  // shared/production-value.ts.
  expectedServiceCount: integer("expected_service_count"),
  // When the agreement's Billing Plan (chargeTrigger = ON_SCHEDULE) next owes
  // a charge - independent of nextServiceDate, since billing cadence and
  // service cadence are different concepts (PLAN_BILLING_V1.md §1.2: "a
  // quarterly pest agreement is billed monthly"). Null for agreements with
  // no billing plan, or one that isn't schedule-driven. Advanced by the
  // nightly billing run (server/jobs/billing-run.ts) after each charge; set
  // to null once the term is exhausted or a one-time PREPAID_TERM charge
  // has fired.
  nextBillingDate: date("next_billing_date"),
  recurrenceUnit: text("recurrence_unit").notNull().default("MONTH"),
  recurrenceInterval: integer("recurrence_interval").notNull().default(1),
  generationLeadDays: integer("generation_lead_days").notNull().default(14),
  serviceWindowDays: integer("service_window_days"),
  schedulingMode: text("scheduling_mode").notNull().default("MANUAL"),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  serviceTemplateName: text("service_template_name"),
  defaultDurationMinutes: integer("default_duration_minutes"),
  serviceInstructions: text("service_instructions"),
  contractUrl: text("contract_url"),
  contractUploadedAt: timestamp("contract_uploaded_at"),
  contractSignedAt: timestamp("contract_signed_at"),
  notes: text("notes"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  cancellationNotes: text("cancellation_notes"),
  cancellationEffectiveDate: date("cancellation_effective_date"),
  cancellationFeeType: text("cancellation_fee_type"),
  cancellationFeeAmountCents: integer("cancellation_fee_amount_cents"),
  cancellationOverrideApplied: boolean("cancellation_override_applied").notNull().default(false),
  cancellationOverrideReason: text("cancellation_override_reason"),
  cancellationOverrideByUserId: varchar("cancellation_override_by_user_id"),
  cancellationOverrideByLabel: text("cancellation_override_by_label"),
  cancellationOverrideAt: timestamp("cancellation_override_at"),
  createdByUserId: varchar("created_by_user_id"),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agreementTemplates = pgTable("agreement_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  cancellationPolicyId: varchar("cancellation_policy_id").references(() => agreementCancellationPolicies.id),
  billingPlanId: varchar("billing_plan_id").references(() => billingPlans.id),
  defaultAgreementType: text("default_agreement_type"),
  defaultBillingFrequency: text("default_billing_frequency"),
  defaultTermUnit: text("default_term_unit").notNull().default("YEAR"),
  defaultTermInterval: integer("default_term_interval").notNull().default(1),
  defaultRecurrenceUnit: text("default_recurrence_unit").notNull().default("MONTH"),
  defaultRecurrenceInterval: integer("default_recurrence_interval").notNull().default(1),
  defaultGenerationLeadDays: integer("default_generation_lead_days").notNull().default(14),
  defaultServiceWindowDays: integer("default_service_window_days"),
  defaultSchedulingMode: text("default_scheduling_mode").notNull().default("MANUAL"),
  defaultServiceTypeId: varchar("default_service_type_id").references(() => serviceTypes.id),
  defaultServiceTemplateName: text("default_service_template_name"),
  defaultDurationMinutes: integer("default_duration_minutes"),
  defaultPriceCents: integer("default_price_cents"),
  defaultInstructions: text("default_instructions"),
  sortOrder: integer("sort_order"),
  internalCode: text("internal_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const serviceRecords = pgTable("service_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
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
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  followUpNotes: text("follow_up_notes"),
  customerSignature: boolean("customer_signature").default(false),
  confirmed: boolean("confirmed").default(false),
  ticketStatus: text("ticket_status").notNull().default("OFFICE_REVIEW_PENDING"),
  postedAt: timestamp("posted_at"),
  finalizedAt: timestamp("finalized_at"),
  finalizedByUserId: varchar("finalized_by_user_id"),
  finalizedByLabel: text("finalized_by_label"),
  reopenedAt: timestamp("reopened_at"),
  reopenedByUserId: varchar("reopened_by_user_id"),
  reopenedByLabel: text("reopened_by_label"),
  reopenReason: text("reopen_reason"),
  readyForBilling: boolean("ready_for_billing").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  orgId: varchar("org_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.orgId, table.key] }),
}));

export const opportunities = pgTable("opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  agreementId: varchar("agreement_id").references(() => agreements.id),
  sourceServiceId: varchar("source_service_id").references(() => services.id),
  sourceServiceRecordId: varchar("source_service_record_id").references(() => serviceRecords.id),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  source: text("source").notNull().default("NON_CONTRACT_FOLLOW_UP"),
  opportunityType: text("opportunity_type"),
  dueDate: date("due_date").notNull(),
  nextActionDate: date("next_action_date"),
  status: text("status").notNull().default("OPEN"),
  notes: text("notes"),
  lastDispositionKey: text("last_disposition_key"),
  lastDispositionLabel: text("last_disposition_label"),
  lastDispositionAt: timestamp("last_disposition_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  convertedServiceId: varchar("converted_service_id").references(() => services.id),
  contactedAt: timestamp("contacted_at"),
  dismissedAt: timestamp("dismissed_at"),
  dismissedReason: text("dismissed_reason"),
  assignedUserId: varchar("assigned_user_id"),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const opportunityDispositions = pgTable("opportunity_dispositions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  defaultCallbackDays: integer("default_callback_days"),
  resultingStatus: text("resulting_status").notNull().default("OPEN"),
  isTerminal: boolean("is_terminal").notNull().default(false),
  isDoNotContact: boolean("is_do_not_contact").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const opportunityActivities = pgTable("opportunity_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id),
  dispositionKey: text("disposition_key"),
  dispositionLabel: text("disposition_label"),
  notes: text("notes"),
  nextActionDate: date("next_action_date"),
  createdByUserId: varchar("created_by_user_id"),
  createdByLabel: text("created_by_label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productApplications = pgTable("product_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  serviceRecordId: varchar("service_record_id").notNull().references(() => serviceRecords.id),
  materialProductId: varchar("material_product_id"),
  productName: text("product_name").notNull(),
  epaRegNumber: text("epa_reg_number"),
  dilutionLabel: text("dilution_label"),
  dilutionRate: text("dilution_rate"),
  amountApplied: text("amount_applied"),
  unit: text("unit"),
  activeIngredientAmount: text("active_ingredient_amount"),
  applicationMethod: text("application_method"),
  device: text("device"),
  applicationLocation: text("application_location"),
  notes: text("notes"),
});

export const materialProducts = pgTable("material_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  epaRegNumber: text("epa_reg_number"),
  manufacturer: text("manufacturer"),
  formulationType: text("formulation_type"),
  activeIngredientPercent: decimal("active_ingredient_percent", { precision: 10, scale: 4 }),
  restrictedUse: boolean("restricted_use").notNull().default(false),
  dilutionOptions: jsonb("dilution_options"),
  allowedApplicationMethods: text("allowed_application_methods").array(),
  allowedEquipment: text("allowed_equipment").array(),
  allowedApplicationAreas: text("allowed_application_areas").array(),
  defaultDilutionLabel: text("default_dilution_label"),
  defaultApplicationMethod: text("default_application_method"),
  defaultEquipment: text("default_equipment"),
  defaultUnit: text("default_unit"),
  defaultApplicationArea: text("default_application_area"),
  allowTechnicianOverride: boolean("allow_technician_override").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const targetPests = pgTable("target_pests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isFavorite: boolean("is_favorite").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-org atomic invoice numbering. Incremented inside the creating
// transaction with a SELECT ... FOR UPDATE row lock (see
// getNextInvoiceNumber in storage.ts) rather than a global Postgres
// sequence, per PLAN_BILLING_V1.md §1.3.
export const invoiceCounters = pgTable("invoice_counters", {
  orgId: varchar("org_id").primaryKey(),
  nextNumber: integer("next_number").notNull().default(1),
});

// Org-scoped, Settings-configurable. Rate stored as basis points (1/100th
// of a percent - 825 = 8.25%) to keep tax math in integers, same reasoning
// as money-as-cents (shared/money.ts).
export const taxRates = pgTable("tax_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  jurisdiction: text("jurisdiction"),
  rateBasisPoints: integer("rate_basis_points").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Taxability decision matrix. Both serviceTypeId and locationType are
// optional match keys; resolveTaxDecision in storage.ts picks the most
// specific matching rule (both keys > serviceTypeId only > locationType
// only > org-wide default rule with neither key set).
export const taxRules = pgTable("tax_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  serviceTypeId: varchar("service_type_id").references(() => serviceTypes.id),
  locationType: text("location_type"), // matches locations.propertyType - residential | commercial | ...
  taxable: boolean("taxable").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// documentUrl mirrors agreements.contractUrl - a link to an externally
// stored file, not a built-in upload/document feature.
export const taxExemptionCertificates = pgTable("tax_exemption_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  accountId: varchar("account_id").notNull().references(() => accounts.id),
  certificateNumber: text("certificate_number").notNull(),
  expiresAt: date("expires_at"),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  // One non-void invoice per service record, enforced by a partial unique
  // index (see invoice-bootstrap.ts) rather than a plain unique constraint,
  // so a voided invoice frees the service record for a corrected one.
  serviceRecordId: varchar("service_record_id").references(() => serviceRecords.id),
  invoiceNumber: text("invoice_number").notNull(),
  publicId: varchar("public_id").notNull().default(sql`gen_random_uuid()`),
  // jsonb snapshot (terms, delivery method, remit-to) resolved from
  // resolveBillingProfileForLocation at issue time - not a live join, so a
  // later billing profile edit never changes an already-created invoice.
  billingProfileSnapshot: jsonb("billing_profile_snapshot"),
  // jsonb snapshot of the resolveTaxDecision result (rate, jurisdiction,
  // taxability, which rule/exemption applied) at invoice creation. Tax is
  // calculated and frozen at issue, per PLAN_BILLING_V1.md §1.5 - never
  // recomputed, so a later tax rate edit never changes an issued invoice.
  taxSnapshot: jsonb("tax_snapshot"),
  amountCents: integer("amount_cents").notNull(),
  taxCents: integer("tax_cents").default(0),
  totalAmountCents: integer("total_amount_cents").notNull(),
  // DRAFT | OPEN | PARTIALLY_PAID | PAID | VOID. "Sent" is deliberately not
  // a status - see sentAt below.
  status: text("status").notNull().default("OPEN"),
  dueDate: timestamp("due_date"),
  sentAt: timestamp("sent_at"),
  paidDate: timestamp("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One line per invoice for now (SERVICE for a generated invoice, ADJUSTMENT
// for the manual/ad-hoc path) - description/price are a snapshot taken at
// creation, never a live join to the service or price book.
export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id),
  serviceId: varchar("service_id").references(() => services.id),
  serviceRecordId: varchar("service_record_id").references(() => serviceRecords.id),
  lineType: text("line_type").notNull().default("ADJUSTMENT"), // SERVICE | ADDON | SURCHARGE | FEE | DISCOUNT | ADJUSTMENT
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  amountCents: integer("amount_cents").notNull(),
  taxable: boolean("taxable").notNull().default(false),
  taxCents: integer("tax_cents").notNull().default(0),
  sortOrder: integer("sort_order"),
});

// A charge that is due: source records why (SCHEDULE_DRIVEN from the
// nightly billing run; SERVICE_DRIVEN and INITIAL_CHARGE are the other two
// sources from PLAN_BILLING_V1.md §1.6, not built yet - unit 10's
// generateInvoiceFromServiceRecord covers path 1 already without going
// through this table). periodKey identifies the billing cycle within the
// agreement (its scheduled charge date) - the unique index on
// (agreementId, periodKey) is what makes the nightly run idempotent: a
// double-run or a manual re-trigger can never bill the same period twice.
export const billingEvents = pgTable("billing_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  agreementId: varchar("agreement_id").notNull().references(() => agreements.id),
  source: text("source").notNull(), // SCHEDULE_DRIVEN | SERVICE_DRIVEN | INITIAL_CHARGE
  periodKey: text("period_key").notNull(),
  amountCents: integer("amount_cents").notNull(),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const communications = pgTable("communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  locationId: varchar("location_id").references(() => locations.id),
  opportunityId: varchar("opportunity_id").references(() => opportunities.id),
  opportunityActivityId: varchar("opportunity_activity_id").unique().references(() => opportunityActivities.id),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  subject: text("subject"),
  body: text("body"),
  nextActionDate: date("next_action_date"),
  actorLabel: text("actor_label"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  status: text("status").default("sent"),
});

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  userId: varchar("user_id"),
  actorLabel: text("actor_label"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Transactional outbox for the four integration ports (server/integrations/**).
// A domain change and its outbox_events row are written in the same DB
// transaction; a worker (not built yet - see PLAN_BILLING_V1.md §0.4) drains
// PENDING rows with retries. This is what makes "invoice synced to
// QuickBooks" reliable instead of best-effort.
export const outboxEvents = pgTable("outbox_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  port: text("port").notNull(), // 'payments' | 'accounting' | 'crm' | 'inventory'
  eventType: text("event_type").notNull(), // e.g. 'push_invoice', 'emit_consumption'
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | PROCESSING | SENT | FAILED
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ orgId: true, id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ orgId: true, id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ orgId: true, id: true });
export const insertBillingProfileTemplateSchema = createInsertSchema(billingProfileTemplates).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertBillingProfileSchema = createInsertSchema(billingProfiles).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertCustomerNoteSchema = createInsertSchema(customerNotes).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertNoteRevisionSchema = createInsertSchema(noteRevisions).omit({ orgId: true, id: true, createdAt: true });
export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({ orgId: true, id: true });
export const insertTechnicianSchema = createInsertSchema(technicians).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertServiceSchema = createInsertSchema(services).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ orgId: true, id: true, createdAt: true });
export const insertBillingPlanSchema = createInsertSchema(billingPlans).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertAgreementCancellationPolicySchema = createInsertSchema(agreementCancellationPolicies).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertAgreementSchema = createInsertSchema(agreements).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertAgreementTemplateSchema = createInsertSchema(agreementTemplates).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({ orgId: true, id: true, createdAt: true });
export const insertAppSettingSchema = createInsertSchema(appSettings).omit({ orgId: true, updatedAt: true });
export const insertOpportunitySchema = createInsertSchema(opportunities).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertOpportunityDispositionSchema = createInsertSchema(opportunityDispositions).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertOpportunityActivitySchema = createInsertSchema(opportunityActivities).omit({ orgId: true, id: true, createdAt: true });
export const insertProductApplicationSchema = createInsertSchema(productApplications).omit({ orgId: true, id: true });
export const insertMaterialProductSchema = createInsertSchema(materialProducts).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertTargetPestSchema = createInsertSchema(targetPests).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ orgId: true, id: true, createdAt: true, publicId: true, invoiceNumber: true });
export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({ orgId: true, id: true, invoiceId: true });
export const insertBillingEventSchema = createInsertSchema(billingEvents).omit({ orgId: true, id: true, createdAt: true });
export const insertTaxRateSchema = createInsertSchema(taxRates).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertTaxRuleSchema = createInsertSchema(taxRules).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertTaxExemptionCertificateSchema = createInsertSchema(taxExemptionCertificates).omit({ orgId: true, id: true, createdAt: true });
export const insertCommunicationSchema = createInsertSchema(communications).omit({ orgId: true, id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ orgId: true, id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ orgId: true, id: true, createdAt: true, updatedAt: true });
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOutboxEventSchema = createInsertSchema(outboxEvents).omit({ orgId: true, id: true, createdAt: true, processedAt: true, status: true, attempts: true, lastError: true });

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type BillingProfileTemplate = typeof billingProfileTemplates.$inferSelect;
export type InsertBillingProfileTemplate = z.infer<typeof insertBillingProfileTemplateSchema>;
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
export type BillingPlan = typeof billingPlans.$inferSelect;
export type InsertBillingPlan = z.infer<typeof insertBillingPlanSchema>;
export type AgreementCancellationPolicy = typeof agreementCancellationPolicies.$inferSelect;
export type InsertAgreementCancellationPolicy = z.infer<typeof insertAgreementCancellationPolicySchema>;
export type Agreement = typeof agreements.$inferSelect;
export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type AgreementTemplate = typeof agreementTemplates.$inferSelect;
export type InsertAgreementTemplate = z.infer<typeof insertAgreementTemplateSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type OpportunityDisposition = typeof opportunityDispositions.$inferSelect;
export type InsertOpportunityDisposition = z.infer<typeof insertOpportunityDispositionSchema>;
export type OpportunityActivity = typeof opportunityActivities.$inferSelect;
export type InsertOpportunityActivity = z.infer<typeof insertOpportunityActivitySchema>;
export type ProductApplication = typeof productApplications.$inferSelect;
export type InsertProductApplication = z.infer<typeof insertProductApplicationSchema>;
export type MaterialProduct = typeof materialProducts.$inferSelect;
export type InsertMaterialProduct = z.infer<typeof insertMaterialProductSchema>;
export type TargetPest = typeof targetPests.$inferSelect;
export type InsertTargetPest = z.infer<typeof insertTargetPestSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type InsertBillingEvent = z.infer<typeof insertBillingEventSchema>;
export type TaxRate = typeof taxRates.$inferSelect;
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRule = typeof taxRules.$inferSelect;
export type InsertTaxRule = z.infer<typeof insertTaxRuleSchema>;
export type TaxExemptionCertificate = typeof taxExemptionCertificates.$inferSelect;
export type InsertTaxExemptionCertificate = z.infer<typeof insertTaxExemptionCertificateSchema>;
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type InsertOutboxEvent = z.infer<typeof insertOutboxEventSchema>;
