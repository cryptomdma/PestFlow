import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  insertCustomerSchema, insertContactSchema, insertLocationSchema,
  insertServiceTypeSchema, insertAppointmentSchema, insertServiceRecordSchema,
  insertTechnicianSchema, insertServiceSchema,
  insertProductApplicationSchema, insertMaterialProductSchema, insertInvoiceSchema, insertCommunicationSchema,
  insertBillingProfileSchema,
  insertBillingProfileTemplateSchema,
  insertAgreementSchema,
  insertAgreementTemplateSchema,
  insertAgreementCancellationPolicySchema,
  insertBillingPlanSchema,
  insertTaxRateSchema,
  insertTaxRuleSchema,
  insertTaxExemptionCertificateSchema,
  insertOpportunitySchema,
  insertOpportunityDispositionSchema,
  insertTargetPestSchema,
} from "@shared/schema";
import { normalizePhone } from "@shared/phone";
import { ZodError, z } from "zod";
import type { Request } from "express";
import { requirePermission } from "./auth";
import { PERMISSIONS, type UserRole } from "@shared/permissions";
import { runBillingCycle } from "./jobs/billing-run";

function handleZodError(res: any, error: ZodError) {
  const messages = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
  return res.status(400).json({ message: `Validation error: ${messages}` });
}

function getAuditActor(req: Request) {
  const user = req.user;
  if (!user) {
    return { userId: null, actorLabel: null };
  }

  return {
    userId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`.trim(),
  };
}

function toIsoStringOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toDateOnlyStringOrNull(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const createCustomerWithLocationSchema = z.object({
    customer: insertCustomerSchema,
    location: insertLocationSchema.omit({ customerId: true, accountId: true, isPrimary: true }),
    initialContact: insertContactSchema
      .omit({ customerId: true, locationId: true })
      .optional(),
  });
  const createLocationWithContactSchema = z.object({
    location: insertLocationSchema,
    initialContact: insertContactSchema
      .omit({ customerId: true, locationId: true })
      .optional(),
  });
  const updateLocationProfileSchema = z.object({
    location: insertLocationSchema
      .omit({ customerId: true, accountId: true, isPrimary: true })
      .partial(),
    customer: insertCustomerSchema
      .pick({
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        customerType: true,
      })
      .partial()
      .optional(),
  });
  const saveScopedNoteSchema = z.object({
    scope: z.enum(["ACCOUNT", "LOCATION"]),
    customerId: z.string().nullable().optional(),
    locationId: z.string().nullable().optional(),
    body: z.string(),
  }).superRefine((value, ctx) => {
    if (value.scope === "ACCOUNT" && !value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "customerId is required for account-scoped notes",
      });
    }

    if (value.scope === "LOCATION" && !value.locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationId"],
        message: "locationId is required for location-scoped notes",
      });
    }
  });
  const updateContactSchema = insertContactSchema
    .pick({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phoneType: true,
      role: true,
      isPrimary: true,
    })
    .partial();
  const nullableDateSchema = z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    return value;
  }, z.coerce.date().nullable());
  const technicianStatusSchema = z.enum(["ACTIVE", "INACTIVE", "TERMINATED"]);
  const serviceStatusSchema = z.enum(["DRAFT", "PENDING_SCHEDULING", "SCHEDULED", "COMPLETED", "CANCELLED"]);
  const serviceSourceSchema = z.enum(["MANUAL", "AGREEMENT_GENERATED", "AGREEMENT_INITIAL"]);
  const agreementSchedulingModeSchema = z.enum(["AUTO_ELIGIBLE", "CONTACT_REQUIRED", "MANUAL"]);
  const technicianSchema = insertTechnicianSchema.extend({
    status: technicianStatusSchema,
  }).superRefine((value, ctx) => {
    if (!value.displayName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["displayName"], message: "displayName is required" });
    }
    if (!value.licenseId?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["licenseId"], message: "licenseId is required" });
    }
  });
  const updateTechnicianSchema = insertTechnicianSchema.extend({
    status: technicianStatusSchema.optional(),
  }).partial();
  const serviceSchema = insertServiceSchema.extend({
    status: serviceStatusSchema,
    source: serviceSourceSchema,
    dueDate: z.string().nullable().optional(),
    generatedForDate: z.string().nullable().optional(),
    serviceWindowStart: z.string().nullable().optional(),
    serviceWindowEnd: z.string().nullable().optional(),
    schedulingMode: agreementSchedulingModeSchema.nullable().optional(),
  }).superRefine((value, ctx) => {
    if (!value.customerId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerId"], message: "customerId is required" });
    if (!value.locationId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["locationId"], message: "locationId is required" });
    if (!value.serviceTypeId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceTypeId"], message: "serviceTypeId is required" });
  });
  const updateServiceSchema = insertServiceSchema.extend({
    status: serviceStatusSchema.optional(),
    source: serviceSourceSchema.optional(),
    dueDate: z.string().nullable().optional(),
    generatedForDate: z.string().nullable().optional(),
    serviceWindowStart: z.string().nullable().optional(),
    serviceWindowEnd: z.string().nullable().optional(),
    schedulingMode: agreementSchedulingModeSchema.nullable().optional(),
  }).partial();
  const appointmentSchema = insertAppointmentSchema.extend({
    generatedForDate: nullableDateSchema.optional(),
    scheduledDate: z.coerce.date(),
    scheduledEndDate: nullableDateSchema.optional(),
    timeInAt: nullableDateSchema.optional(),
    timeOutAt: nullableDateSchema.optional(),
  });
  const updateAppointmentSchema = appointmentSchema.partial();
  const serviceRecordSchema = insertServiceRecordSchema.omit({ serviceDate: true }).extend({
    serviceDate: z.coerce.date(),
  }).superRefine((value, ctx) => {
    if (!value.serviceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceId"], message: "serviceId is required" });
    }
  });
  const updateServiceRecordSchema = insertServiceRecordSchema.omit({ serviceDate: true }).extend({
    serviceDate: z.coerce.date().optional(),
  }).partial();
  const completeServiceSchema = z.object({
    appointmentId: z.string().nullable().optional(),
    technicianId: z.string().nullable().optional(),
    serviceDate: z.coerce.date(),
    serviceTypeId: z.string().nullable().optional(),
    priceCents: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    targetPests: z.array(z.string()).nullable().optional(),
    areasServiced: z.string().nullable().optional(),
    conditionsFound: z.string().nullable().optional(),
    recommendations: z.string().nullable().optional(),
    followUpRequired: z.boolean().nullable().optional(),
    followUpNotes: z.string().nullable().optional(),
    customerSignature: z.boolean().nullable().optional(),
    confirmed: z.boolean().nullable().optional(),
    productApplications: z.array(insertProductApplicationSchema.omit({ serviceRecordId: true })).optional(),
  });
  const materialProductSchema = insertMaterialProductSchema.extend({
    activeIngredientPercent: z.union([z.string(), z.number()]).nullable().optional()
      .transform((value) => value === undefined || value === null || value === "" ? null : String(value)),
    dilutionOptions: z.any().nullable().optional(),
  });
  const updateMaterialProductSchema = materialProductSchema.partial();
  const targetPestSchema = insertTargetPestSchema.extend({
    label: z.string().min(1),
  });
  const updateTargetPestSchema = targetPestSchema.partial();
  const updateBillingProfileTemplateSchema = insertBillingProfileTemplateSchema.partial();
  const updateBillingProfileSchema = insertBillingProfileSchema.partial();
  const serviceTimeTrackingModeSchema = z.object({
    mode: z.enum(["AUTO_TIMEOUT_ON_TICKET_POST", "PROMPT_FOR_TIMEOUT", "MANUAL_TIMEOUT"]),
  });
  const appointmentCancelReasonsSchema = z.object({
    reasons: z.array(z.string().trim().min(1)).min(1),
  });
  const appointmentCancelRescheduleSchema = z.object({
    reason: z.string().trim().min(1, "Reason is required"),
    notes: z.string().nullable().optional(),
    rescheduleRequested: z.boolean().optional(),
  });
  const reopenServiceRecordSchema = z.object({
    reason: z.string().trim().min(1, "Reopen reason is required"),
  });
  const opportunityStatusSchema = z.enum(["OPEN", "CONTACTED", "CONVERTED", "DISMISSED"]);
  const opportunityUpdateSchema = insertOpportunitySchema.extend({
    status: opportunityStatusSchema.optional(),
    contactedAt: nullableDateSchema.optional(),
    dismissedAt: nullableDateSchema.optional(),
  }).partial();
  const opportunityDispositionSchema = insertOpportunityDispositionSchema.extend({
    resultingStatus: opportunityStatusSchema,
  }).superRefine((value, ctx) => {
    if (!value.key?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["key"], message: "key is required" });
    if (!value.label?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["label"], message: "label is required" });
  });
  const opportunityDispositionUpdateSchema = insertOpportunityDispositionSchema.extend({
    resultingStatus: opportunityStatusSchema.optional(),
  }).partial();
  const applyOpportunityDispositionSchema = z.object({
    dispositionId: z.string(),
    nextActionDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });
  const agreementStatusSchema = z.enum(["ACTIVE", "PAUSED", "CANCELLED"]);
  const recurrenceUnitSchema = z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]);
  const cancellationFeeTypeSchema = z.enum(["NONE", "FLAT", "PERCENT_CONTRACT", "PERCENT_REMAINING", "MANUAL"]);
  const cancellationEffectiveDateModeSchema = z.enum(["IMMEDIATE", "END_OF_TERM", "CUSTOM"]);
  const agreementCancellationPolicySchema = insertAgreementCancellationPolicySchema.omit({
    cancellationFeeType: true,
    effectiveDateMode: true,
  }).extend({
    cancellationFeeType: cancellationFeeTypeSchema,
    effectiveDateMode: cancellationEffectiveDateModeSchema,
  }).superRefine((value, ctx) => {
    if (!value.name?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "name is required" });
    }
    if ((value.noticeDays || 0) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["noticeDays"], message: "noticeDays cannot be negative" });
    }
    if ((value.defaultRetentionFollowUpDays ?? 0) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultRetentionFollowUpDays"], message: "defaultRetentionFollowUpDays cannot be negative" });
    }
  });
  const updateAgreementCancellationPolicySchema = insertAgreementCancellationPolicySchema.omit({
    cancellationFeeType: true,
    effectiveDateMode: true,
  }).extend({
    cancellationFeeType: cancellationFeeTypeSchema.optional(),
    effectiveDateMode: cancellationEffectiveDateModeSchema.optional(),
  }).partial();
  const billingPlanSchema = insertBillingPlanSchema.superRefine((value, ctx) => {
    if (!value.name?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "name is required" });
    }
  });
  const updateBillingPlanSchema = insertBillingPlanSchema.partial();
  const cancelAgreementSchema = z.object({
    reason: z.string().min(1),
    effectiveDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    cancelPendingServices: z.boolean().optional(),
    cancelScheduledAppointments: z.boolean().optional(),
    closeOpenOpportunities: z.boolean().optional(),
    createRetentionOpportunity: z.boolean().optional(),
    overrideApplied: z.boolean().optional(),
    overrideReason: z.string().nullable().optional(),
    cancellationFeeAmountCents: z.number().int().nullable().optional(),
  });
  const agreementTemplateSchema = insertAgreementTemplateSchema.extend({
    defaultTermUnit: recurrenceUnitSchema,
    defaultRecurrenceUnit: recurrenceUnitSchema,
    defaultSchedulingMode: agreementSchedulingModeSchema,
  }).superRefine((value, ctx) => {
    if (!value.name?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "name is required" });
    }
    if ((value.defaultRecurrenceInterval || 0) < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultRecurrenceInterval"], message: "defaultRecurrenceInterval must be at least 1" });
    }
    if ((value.defaultTermInterval || 0) < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultTermInterval"], message: "defaultTermInterval must be at least 1" });
    }
    if ((value.defaultGenerationLeadDays || 0) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultGenerationLeadDays"], message: "defaultGenerationLeadDays cannot be negative" });
    }
    if (!value.defaultServiceTypeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultServiceTypeId"], message: "defaultServiceTypeId is required" });
    }
  });
  const updateAgreementTemplateSchema = insertAgreementTemplateSchema.extend({
    defaultTermUnit: recurrenceUnitSchema.optional(),
    defaultRecurrenceUnit: recurrenceUnitSchema.optional(),
    defaultSchedulingMode: agreementSchedulingModeSchema.optional(),
  }).partial();
  const agreementBaseSchema = insertAgreementSchema.extend({
    status: agreementStatusSchema,
    termUnit: recurrenceUnitSchema,
    recurrenceUnit: recurrenceUnitSchema,
    schedulingMode: agreementSchedulingModeSchema,
  });
  const agreementSchema = agreementBaseSchema.superRefine((value, ctx) => {
    if (!value.locationId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["locationId"], message: "locationId is required" });
    }
    if (!value.customerId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerId"], message: "customerId is required" });
    }
    if (!value.agreementName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agreementName"], message: "agreementName is required" });
    }
    if (!value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "startDate is required" });
    }
    if (!value.nextServiceDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nextServiceDate"], message: "nextServiceDate is required" });
    }
    if (!value.serviceTypeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceTypeId"], message: "serviceTypeId is required" });
    }
    if ((value.recurrenceInterval || 0) < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceInterval"], message: "recurrenceInterval must be at least 1" });
    }
    if ((value.termInterval || 0) < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["termInterval"], message: "termInterval must be at least 1" });
    }
    if ((value.generationLeadDays || 0) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generationLeadDays"], message: "generationLeadDays cannot be negative" });
    }
    if (value.renewalDate && value.startDate && value.renewalDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["renewalDate"], message: "renewalDate cannot be before startDate" });
    }
  });
  const updateAgreementSchema = agreementBaseSchema.partial().superRefine((value, ctx) => {
    if (value.termInterval !== undefined && value.termInterval < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["termInterval"], message: "termInterval must be at least 1" });
    }
    if (value.recurrenceInterval !== undefined && value.recurrenceInterval < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceInterval"], message: "recurrenceInterval must be at least 1" });
    }
    if (value.generationLeadDays !== undefined && value.generationLeadDays < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generationLeadDays"], message: "generationLeadDays cannot be negative" });
    }
    if (value.renewalDate && value.startDate && value.renewalDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["renewalDate"], message: "renewalDate cannot be before startDate" });
    }
  });
  const createAgreementFromTemplateSchema = z.object({
    agreementTemplateId: z.string().nullable().optional(),
    agreement: agreementBaseSchema.partial().extend({
      customerId: z.string(),
      locationId: z.string(),
      status: agreementStatusSchema,
      startDate: z.string(),
      nextServiceDate: z.string(),
    }).superRefine((value, ctx) => {
      if (!value.agreementName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agreementName"], message: "agreementName is required" });
      }
      if (value.recurrenceInterval !== undefined && value.recurrenceInterval < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceInterval"], message: "recurrenceInterval must be at least 1" });
      }
      if (value.termInterval !== undefined && value.termInterval < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["termInterval"], message: "termInterval must be at least 1" });
      }
      if (value.generationLeadDays !== undefined && value.generationLeadDays < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generationLeadDays"], message: "generationLeadDays cannot be negative" });
      }
      if (value.renewalDate && value.startDate && value.renewalDate < value.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["renewalDate"], message: "renewalDate cannot be before startDate" });
      }
    }),
  });
  const linkAgreementInitialAppointmentSchema = z.object({
    appointmentId: z.string(),
  });

  // Transitional dev-only diagnostics for Phase 1 account/location hardening.
  // TODO(Phase2): gate behind auth/admin controls once user model exists.
  app.get("/api/dev/account-invariants", async (req, res) => {
    const data = await req.storage.getAccountInvariantSummary();
    res.json(data);
  });

  // Transitional compatibility endpoint for Phase 1 account/location bootstrap.
  app.get("/api/customer-detail-compat/:legacyCustomerId", async (req, res) => {
    const data = await req.storage.getCustomerDetailCompat(
      req.params.legacyCustomerId,
      typeof req.query.locationId === "string" ? req.query.locationId : undefined,
    );
    if (!data) return res.status(404).json({ message: "Customer detail not found" });
    res.json(data);
  });

  // Customers
  app.get("/api/customers", async (req, res) => {
    const data = await req.storage.getCustomers();
    res.json(data);
  });

  app.get("/api/customers/:id", async (req, res) => {
    const data = await req.storage.getCustomer(req.params.id);
    if (!data) return res.status(404).json({ message: "Customer not found" });
    res.json(data);
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const validated = insertCustomerSchema.parse(req.body);
      const customerNotesBody = validated.notes?.trim() || "";
      const data = await req.storage.createCustomer({
        ...validated,
        notes: null,
      });
      if (customerNotesBody) {
        await req.storage.saveScopedNote({
          scope: "ACCOUNT",
          customerId: data.id,
          body: customerNotesBody,
          actor: getAuditActor(req),
        });
      }
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/customers/create-with-primary-location", async (req, res) => {
    try {
      const validated = createCustomerWithLocationSchema.parse(req.body);
      const customerNotesBody = validated.customer.notes?.trim() || "";
      const locationNotesBody = validated.location.notes?.trim() || "";
      const isCommercial = validated.customer.customerType === "commercial";
      const isResidential = validated.customer.customerType === "residential";

      if (isCommercial && !validated.customer.companyName?.trim()) {
        return res.status(400).json({ message: "Commercial customers require companyName." });
      }

      if (isResidential && (!validated.customer.firstName?.trim() || !validated.customer.lastName?.trim())) {
        return res.status(400).json({ message: "Residential customers require firstName and lastName." });
      }

      const locationMissing =
        !validated.location.address?.trim() ||
        !validated.location.city?.trim() ||
        !validated.location.state?.trim() ||
        !validated.location.zip?.trim();

      const customerMissing =
        !validated.customer.firstName?.trim() ||
        !validated.customer.lastName?.trim() ||
        !validated.customer.email?.trim() ||
        !validated.customer.phone?.trim();

      if (locationMissing) {
        return res.status(400).json({ message: "Primary location address, city, state, and zip are required." });
      }

      if (customerMissing) {
        return res.status(400).json({ message: "First name, last name, email, and phone are required." });
      }

      if (!validated.location.source?.trim()) {
        return res.status(400).json({ message: "Primary location source is required." });
      }

      const contact = validated.initialContact;
      const hasAnyContactValue =
        !!contact?.firstName?.trim() &&
        !!contact?.lastName?.trim() &&
        !!contact?.email?.trim() &&
        !!contact?.phone?.trim();

      const initialContact = hasAnyContactValue
        ? {
            ...contact!,
            firstName: contact!.firstName.trim(),
            lastName: contact!.lastName.trim(),
            email: contact!.email!.trim(),
            phone: normalizePhone(contact!.phone) || null,
            isPrimary: true,
          }
        : undefined;

      const data = await req.storage.createCustomerWithPrimaryLocation({
        customer: {
          ...validated.customer,
          email: validated.customer.email?.trim() || null,
          phone: normalizePhone(validated.customer.phone) || null,
          notes: null,
        },
        location: {
          ...validated.location,
          notes: null,
        },
        initialContact,
      });

      if (customerNotesBody) {
        await req.storage.saveScopedNote({
          scope: "ACCOUNT",
          customerId: data.id,
          body: customerNotesBody,
          actor: getAuditActor(req),
        });
      }

      if (locationNotesBody) {
        const createdLocations = await req.storage.getLocations(data.id);
        const primaryLocation = createdLocations.find((location) => location.isPrimary) ?? createdLocations[0];
        if (primaryLocation) {
          await req.storage.saveScopedNote({
            scope: "LOCATION",
            locationId: primaryLocation.id,
            body: locationNotesBody,
            actor: getAuditActor(req),
          });
        }
      }

      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const validated = insertCustomerSchema.partial().parse(req.body);
      const customerNotesBody = validated.notes !== undefined ? (validated.notes?.trim() || "") : undefined;
      const data = await req.storage.updateCustomer(req.params.id, {
        ...validated,
        notes: validated.notes !== undefined ? null : validated.notes,
      });
      if (!data) return res.status(404).json({ message: "Customer not found" });
      if (customerNotesBody !== undefined) {
        await req.storage.saveScopedNote({
          scope: "ACCOUNT",
          customerId: req.params.id,
          body: customerNotesBody,
          actor: getAuditActor(req),
        });
      }
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Contacts
  app.get("/api/contacts/:customerId", async (req, res) => {
    const data = await req.storage.getContacts(req.params.customerId);
    res.json(data);
  });

  app.get("/api/contacts/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getContactsByLocation(req.params.locationId);
    res.json(data);
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const phoneType = validated.phoneType?.trim().toLowerCase();
      if (phoneType && !["mobile", "home", "work", "fax"].includes(phoneType)) {
        return res.status(400).json({ message: "Phone type must be mobile, home, work, or fax." });
      }

      const data = await req.storage.createContact({
        ...validated,
        email: validated.email?.trim() || null,
        phone: normalizePhone(validated.phone) || null,
        phoneType: phoneType || null,
        role: validated.role?.trim() || null,
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const validated = updateContactSchema.parse(req.body);
      const phoneType = validated.phoneType?.trim().toLowerCase();
      if (phoneType && !["mobile", "home", "work", "fax"].includes(phoneType)) {
        return res.status(400).json({ message: "Phone type must be mobile, home, work, or fax." });
      }

      const data = await req.storage.updateContact(req.params.id, {
        ...validated,
        email: validated.email === undefined ? undefined : validated.email?.trim() || null,
        phone: validated.phone === undefined ? undefined : normalizePhone(validated.phone) || null,
        phoneType: validated.phoneType === undefined ? undefined : phoneType || null,
        role: validated.role === undefined ? undefined : validated.role?.trim() || null,
      });
      if (!data) return res.status(404).json({ message: "Contact not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/contacts/:id/set-primary", async (req, res) => {
    try {
      const data = await req.storage.setPrimaryContact(req.params.id);
      if (!data) return res.status(404).json({ message: "Contact not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Locations
  app.get("/api/locations/:customerId", async (req, res) => {
    const data = await req.storage.getLocations(req.params.customerId);
    res.json(data);
  });

  app.get("/api/all-locations", async (req, res) => {
    const data = await req.storage.getAllLocations();
    res.json(data);
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const validated = createLocationWithContactSchema.safeParse(req.body);
      const locationPayload = validated.success ? validated.data.location : insertLocationSchema.parse(req.body);
      const rawInitialContact = validated.success ? validated.data.initialContact : undefined;
      const locationNotesBody = locationPayload.notes?.trim() || "";
      const initialContact =
        rawInitialContact && (
          rawInitialContact.firstName?.trim() ||
          rawInitialContact.lastName?.trim() ||
          rawInitialContact.email?.trim() ||
          rawInitialContact.phone?.trim()
        )
          ? {
              ...rawInitialContact,
              firstName: rawInitialContact.firstName.trim(),
              lastName: rawInitialContact.lastName.trim(),
              email: rawInitialContact.email?.trim() || null,
              phone: normalizePhone(rawInitialContact.phone) || null,
              role: rawInitialContact.role?.trim() || "primary",
              isPrimary: true,
            }
          : undefined;

      const data = initialContact
        ? await req.storage.createLocationWithPrimaryContact({
            location: {
              ...locationPayload,
              notes: null,
            },
            initialContact,
          })
        : await req.storage.createLocation({
            ...locationPayload,
            notes: null,
          });
      if (locationNotesBody) {
        await req.storage.saveScopedNote({
          scope: "LOCATION",
          locationId: data.id,
          body: locationNotesBody,
          actor: getAuditActor(req),
        });
      }
      if (locationPayload.isPrimary) {
        await req.storage.setPrimaryLocation(data.customerId, data.id);
      }
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/locations/:id", async (req, res) => {
    try {
      const validated = insertLocationSchema.partial().parse(req.body);
      const data = await req.storage.updateLocation(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Location not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/customers/:customerId/locations/:locationId/profile", async (req, res) => {
    try {
      const validated = updateLocationProfileSchema.parse(req.body);
      const existingLocation = await req.storage.getLocation(req.params.locationId);
      if (!existingLocation || existingLocation.customerId !== req.params.customerId) {
        return res.status(404).json({ message: "Location not found" });
      }

      if (validated.customer && !existingLocation.isPrimary) {
        return res.status(400).json({ message: "Customer identity fields can only be edited from the primary location." });
      }

      const nextCustomerType = validated.customer?.customerType;
      if (
        nextCustomerType &&
        nextCustomerType !== existingLocation.propertyType &&
        nextCustomerType !== "commercial" &&
        nextCustomerType !== "residential"
      ) {
        return res.status(400).json({ message: "Customer type must be residential or commercial." });
      }

      if (nextCustomerType === "commercial" && !validated.customer?.companyName?.trim()) {
        return res.status(400).json({ message: "Commercial customers require companyName." });
      }

      const nextLocationType = validated.location.propertyType;
      if (
        nextLocationType &&
        nextLocationType !== existingLocation.propertyType &&
        nextLocationType !== "commercial" &&
        nextLocationType !== "residential"
      ) {
        return res.status(400).json({ message: "Location type must be residential or commercial." });
      }

      if (existingLocation.isPrimary && validated.customer) {
        const customerMissing =
          !validated.customer.firstName?.trim() ||
          !validated.customer.lastName?.trim() ||
          !validated.customer.email?.trim() ||
          !validated.customer.phone?.trim();

        if (customerMissing) {
          return res.status(400).json({ message: "Primary location edits require first name, last name, email, and phone." });
        }
      }

      const result = await req.storage.updateLocationProfile({
        customerId: req.params.customerId,
        locationId: req.params.locationId,
        actor: getAuditActor(req),
        customer: validated.customer
          ? {
              ...validated.customer,
              firstName: validated.customer.firstName?.trim(),
              lastName: validated.customer.lastName?.trim(),
              companyName: validated.customer.companyName?.trim() || null,
              email: validated.customer.email?.trim() || null,
              phone: normalizePhone(validated.customer.phone) || null,
            }
          : undefined,
        location: {
          ...validated.location,
          name: validated.location.name?.trim(),
          address: validated.location.address?.trim(),
          city: validated.location.city?.trim(),
          state: validated.location.state?.trim(),
          zip: validated.location.zip?.trim(),
          propertyType: validated.location.propertyType,
          source: validated.location.source?.trim(),
          gateCode: validated.location.gateCode?.trim() || null,
          notes: null,
          lotSize: validated.location.lotSize?.trim() || null,
        },
      });

      if (!result) return res.status(404).json({ message: "Location not found" });
      if (validated.location.notes !== undefined) {
        await req.storage.saveScopedNote({
          scope: "LOCATION",
          locationId: req.params.locationId,
          body: validated.location.notes?.trim() || "",
          actor: getAuditActor(req),
        });
      }
      res.json(result);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/locations/:id/set-primary", async (req, res) => {
    try {
      const loc = await req.storage.getLocation(req.params.id);
      if (!loc) return res.status(404).json({ message: "Location not found" });
      await req.storage.setPrimaryLocation(loc.customerId, loc.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Billing Profile Templates
  app.get("/api/billing-profile-templates", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getBillingProfileTemplates(includeInactive);
    res.json(data);
  });

  app.post("/api/billing-profile-templates", async (req, res) => {
    try {
      const validated = insertBillingProfileTemplateSchema.parse(req.body);
      const data = await req.storage.createBillingProfileTemplate(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/billing-profile-templates/:id", async (req, res) => {
    try {
      const validated = updateBillingProfileTemplateSchema.parse(req.body);
      const data = await req.storage.updateBillingProfileTemplate(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Billing profile template not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Billing Profiles (instances - account-level default or a location-level override)
  app.get("/api/accounts/:accountId/billing-profiles", async (req, res) => {
    const data = await req.storage.getBillingProfilesForAccount(req.params.accountId);
    res.json(data);
  });

  app.get("/api/locations/:locationId/billing-profile", async (req, res) => {
    const data = await req.storage.resolveBillingProfileForLocation(req.params.locationId);
    if (!data) return res.status(404).json({ message: "No billing profile resolved for this location" });
    res.json(data);
  });

  app.post("/api/billing-profiles", async (req, res) => {
    try {
      const validated = insertBillingProfileSchema.parse(req.body);
      const data = await req.storage.createBillingProfile(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/billing-profiles/:id", async (req, res) => {
    try {
      const validated = updateBillingProfileSchema.parse(req.body);
      const data = await req.storage.updateBillingProfile(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Billing profile not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Canonical Notes
  app.get("/api/notes/shared/:customerId", async (req, res) => {
    const data = await req.storage.getSharedNotes(req.params.customerId);
    res.json(data);
  });

  app.get("/api/notes/location/:locationId", async (req, res) => {
    const data = await req.storage.getNotesByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/notes/:noteId/revisions", async (req, res) => {
    const data = await req.storage.getNoteRevisions(req.params.noteId);
    res.json(data);
  });

  app.put("/api/notes/scoped", async (req, res) => {
    try {
      const validated = saveScopedNoteSchema.parse(req.body);
      const data = await req.storage.saveScopedNote({
        ...validated,
        actor: getAuditActor(req),
      });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Location-scoped counts
  app.get("/api/location-counts/:locationId", async (req, res) => {
    await req.storage.generateAgreementServicesForLocation(req.params.locationId);
    const data = await req.storage.getLocationScopedCounts(req.params.locationId);
    res.json(data);
  });

  // Location-scoped data endpoints
  app.get("/api/appointments/by-location/:locationId", async (req, res) => {
    await req.storage.generateAgreementServicesForLocation(req.params.locationId);
    const data = await req.storage.getAppointmentsByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/service-records/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getServiceRecordsByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/invoices/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getInvoicesByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/location-balances/:customerId", async (req, res) => {
    const data = await req.storage.getLocationBalancesByCustomer(req.params.customerId);
    res.json(data);
  });

  app.get("/api/communications/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getCommunicationsByLocation(req.params.locationId);
    res.json(data);
  });

  // Service Types
  app.get("/api/service-types", async (req, res) => {
    const data = await req.storage.getServiceTypes();
    res.json(data);
  });

  app.post("/api/service-types", async (req, res) => {
    try {
      const validated = insertServiceTypeSchema.parse(req.body);
      const data = await req.storage.createServiceType(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/service-types/:id", async (req, res) => {
    try {
      const validated = insertServiceTypeSchema.partial().parse(req.body);
      const data = await req.storage.updateServiceType(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Service type not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Technicians
  app.get("/api/technicians", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getTechnicians(includeInactive);
    res.json(data);
  });

  app.post("/api/technicians", async (req, res) => {
    try {
      const validated = technicianSchema.parse(req.body);
      const data = await req.storage.createTechnician(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/technicians/:id", async (req, res) => {
    try {
      const validated = updateTechnicianSchema.parse(req.body);
      const data = await req.storage.updateTechnician(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Technician not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/technicians/:id/work", async (req, res) => {
    try {
      const date = typeof req.query.date === "string" && req.query.date
        ? req.query.date
        : new Date().toISOString().slice(0, 10);
      const data = await req.storage.getTechnicianWork(req.params.id, date);
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Services
  app.get("/api/services", async (req, res) => {
    const data = await req.storage.getServices();
    res.json(data);
  });

  app.get("/api/services/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getServicesByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/services/pending", async (req, res) => {
    const data = await req.storage.getPendingServices({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : "",
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : "",
    });
    res.json(data);
  });

  app.get("/api/services/:id", async (req, res) => {
    const data = await req.storage.getService(req.params.id);
    if (!data) return res.status(404).json({ message: "Service not found" });
    res.json(data);
  });

  app.get("/api/opportunities", async (req, res) => {
    const data = await req.storage.getOpportunities({
      status: typeof req.query.status === "string" && req.query.status !== "ALL" ? req.query.status : undefined,
      dueFrom: typeof req.query.dueFrom === "string" ? req.query.dueFrom : undefined,
      dueTo: typeof req.query.dueTo === "string" ? req.query.dueTo : undefined,
      serviceTypeId: typeof req.query.serviceTypeId === "string" && req.query.serviceTypeId !== "ALL" ? req.query.serviceTypeId : undefined,
    });
    res.json(data);
  });

  app.get("/api/opportunities/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getOpportunitiesByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/opportunity-dispositions", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getOpportunityDispositions(includeInactive);
    res.json(data);
  });

  app.post("/api/opportunity-dispositions", async (req, res) => {
    try {
      const validated = opportunityDispositionSchema.parse(req.body);
      const data = await req.storage.createOpportunityDisposition(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/opportunity-dispositions/:id", async (req, res) => {
    try {
      const validated = opportunityDispositionUpdateSchema.parse(req.body);
      const data = await req.storage.updateOpportunityDisposition(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Opportunity disposition not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/opportunities/:id/activities", async (req, res) => {
    const data = await req.storage.getOpportunityActivitiesByOpportunity(req.params.id);
    res.json(data);
  });

  app.patch("/api/opportunities/:id", async (req, res) => {
    try {
      const validated = opportunityUpdateSchema.parse(req.body);
      const data = await req.storage.updateOpportunity(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Opportunity not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/opportunities/:id/disposition", async (req, res) => {
    try {
      const validated = applyOpportunityDispositionSchema.parse(req.body);
      const data = await req.storage.applyOpportunityDisposition({
        opportunityId: req.params.id,
        dispositionId: validated.dispositionId,
        nextActionDate: validated.nextActionDate,
        notes: validated.notes,
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Opportunity not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/opportunities/:id/convert", async (req, res) => {
    try {
      const data = await req.storage.convertOpportunityToService(req.params.id, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Opportunity not found" });
      res.status(201).json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/services", async (req, res) => {
    try {
      const validated = serviceSchema.parse(req.body);
      const data = await req.storage.createService(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/services/:id", async (req, res) => {
    try {
      const validated = updateServiceSchema.parse(req.body);
      const data = await req.storage.updateService(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Service not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/services/:id", async (req, res) => {
    try {
      const deleted = await req.storage.deleteService(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Service not found" });
      res.status(204).send();
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/services/:id/complete", async (req, res) => {
    try {
      const validated = completeServiceSchema.parse(req.body);
      const data = await req.storage.completeService({
        serviceId: req.params.id,
        actorRole: req.user!.role as UserRole,
        ...validated,
      });
      if (!data) return res.status(404).json({ message: "Service not found" });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Agreement Cancellation Policies
  app.get("/api/agreement-cancellation-policies", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getAgreementCancellationPolicies(includeInactive);
    res.json(data);
  });

  app.post("/api/agreement-cancellation-policies", async (req, res) => {
    try {
      const validated = agreementCancellationPolicySchema.parse(req.body);
      const data = await req.storage.createAgreementCancellationPolicy(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/agreement-cancellation-policies/:id", async (req, res) => {
    try {
      const validated = updateAgreementCancellationPolicySchema.parse(req.body);
      const data = await req.storage.updateAgreementCancellationPolicy(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Cancellation policy not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Billing Plans
  app.get("/api/billing-plans", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getBillingPlans(includeInactive);
    res.json(data);
  });

  app.post("/api/billing-plans", async (req, res) => {
    try {
      const validated = billingPlanSchema.parse(req.body);
      const data = await req.storage.createBillingPlan(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/billing-plans/:id", async (req, res) => {
    try {
      const validated = updateBillingPlanSchema.parse(req.body);
      const data = await req.storage.updateBillingPlan(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Billing plan not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/agreements/:id/billing-plan-snapshot", async (req, res) => {
    const data = await req.storage.resolveAgreementBillingPlanSnapshot(req.params.id);
    if (data === null) return res.status(404).json({ message: "Agreement not found" });
    res.json(data);
  });

  // Agreement Templates
  app.get("/api/agreement-templates", async (req, res) => {
    const data = await req.storage.getAgreementTemplates();
    res.json(data);
  });

  app.post("/api/agreement-templates", async (req, res) => {
    try {
      const validated = agreementTemplateSchema.parse(req.body);
      const data = await req.storage.createAgreementTemplate(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/agreement-templates/:id", async (req, res) => {
    try {
      const validated = updateAgreementTemplateSchema.parse(req.body);
      const data = await req.storage.updateAgreementTemplate(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Agreement template not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Agreements
  app.get("/api/agreements/location/:locationId", async (req, res) => {
    await req.storage.generateAgreementServicesForLocation(req.params.locationId);
    const data = await req.storage.getAgreementsByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/agreements/:id", async (req, res) => {
    const data = await req.storage.getAgreement(req.params.id);
    if (!data) return res.status(404).json({ message: "Agreement not found" });
    res.json(data);
  });

  app.post("/api/agreements", async (req, res) => {
    try {
      const validated = createAgreementFromTemplateSchema.parse(req.body);
      const data = await req.storage.createAgreementFromTemplate({
        agreementTemplateId: validated.agreementTemplateId ?? null,
        agreement: validated.agreement,
        actor: getAuditActor(req),
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/agreements/:id", async (req, res) => {
    try {
      const validated = updateAgreementSchema.parse(req.body);
      const data = await req.storage.updateAgreement(req.params.id, validated, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Agreement not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/agreements/:id/cancel", async (req, res) => {
    try {
      const validated = cancelAgreementSchema.parse(req.body);
      const data = await req.storage.cancelAgreement({
        agreementId: req.params.id,
        ...validated,
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Agreement not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/agreements/:id/link-initial-appointment", async (req, res) => {
    try {
      const validated = linkAgreementInitialAppointmentSchema.parse(req.body);
      const data = await req.storage.linkAgreementInitialAppointment({
        agreementId: req.params.id,
        appointmentId: validated.appointmentId,
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Agreement not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Appointments
  app.get("/api/appointments", async (req, res) => {
    const data = await req.storage.getAppointments();
    res.json(data);
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const validated = appointmentSchema.parse(req.body);
      const data = await req.storage.createAppointment({
        ...validated,
        scheduledDate: validated.scheduledDate,
        scheduledEndDate: validated.scheduledEndDate,
        generatedForDate: toDateOnlyStringOrNull(validated.generatedForDate),
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const validated = updateAppointmentSchema.parse(req.body);
      const data = await req.storage.updateAppointment(req.params.id, {
        ...validated,
        scheduledDate: validated.scheduledDate,
        scheduledEndDate: validated.scheduledEndDate,
        generatedForDate: validated.generatedForDate === undefined ? undefined : toDateOnlyStringOrNull(validated.generatedForDate),
      });
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/appointments/:id/time-in", async (req, res) => {
    try {
      const data = await req.storage.timeInAppointment(req.params.id);
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/appointments/:id/time-out", async (req, res) => {
    try {
      const data = await req.storage.timeOutAppointment(req.params.id);
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/appointments/:id/cancel-reschedule", async (req, res) => {
    try {
      const validated = appointmentCancelRescheduleSchema.parse(req.body);
      const data = await req.storage.requestAppointmentCancelOrReschedule({
        appointmentId: req.params.id,
        reason: validated.reason,
        notes: validated.notes,
        rescheduleRequested: validated.rescheduleRequested,
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Service Records
  app.get("/api/service-records", async (req, res) => {
    const data = await req.storage.getServiceRecords();
    res.json(data);
  });

  app.get("/api/service-records/:id", async (req, res) => {
    const data = await req.storage.getServiceRecord(req.params.id);
    if (!data) return res.status(404).json({ message: "Service record not found" });
    res.json(data);
  });

  app.post("/api/service-records", async (req, res) => {
    try {
      const validated = serviceRecordSchema.parse(req.body);
      const data = await req.storage.createServiceRecord(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/service-records/:id", async (req, res) => {
    try {
      const validated = updateServiceRecordSchema.parse(req.body);
      const data = await req.storage.updateServiceRecord(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Service record not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/service-records/:id/finalize", requirePermission(PERMISSIONS.FINALIZE_TICKET), async (req, res) => {
    try {
      const data = await req.storage.finalizeServiceRecord(req.params.id, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Service record not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/service-records/:id/reopen", requirePermission(PERMISSIONS.REOPEN_TICKET), async (req, res) => {
    try {
      const validated = reopenServiceRecordSchema.parse(req.body);
      const data = await req.storage.reopenServiceRecord(req.params.id, validated.reason, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Service record not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/settings/service-time-tracking", async (req, res) => {
    const mode = await req.storage.getServiceTimeTrackingMode();
    res.json({ mode });
  });

  app.patch("/api/settings/service-time-tracking", async (req, res) => {
    try {
      const validated = serviceTimeTrackingModeSchema.parse(req.body);
      const data = await req.storage.setServiceTimeTrackingMode(validated.mode);
      res.json({ mode: data.value });
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/settings/appointment-cancel-reasons", async (req, res) => {
    const reasons = await req.storage.getAppointmentCancelReasons();
    res.json({ reasons });
  });

  app.patch("/api/settings/appointment-cancel-reasons", async (req, res) => {
    try {
      const validated = appointmentCancelReasonsSchema.parse(req.body);
      const data = await req.storage.setAppointmentCancelReasons(validated.reasons);
      res.json({ reasons: JSON.parse(data.value) });
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Material Products
  app.get("/api/material-products", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getMaterialProducts(includeInactive);
    res.json(data);
  });

  app.post("/api/material-products", async (req, res) => {
    try {
      const validated = materialProductSchema.parse(req.body);
      const data = await req.storage.createMaterialProduct(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/material-products/:id", async (req, res) => {
    try {
      const validated = updateMaterialProductSchema.parse(req.body);
      const data = await req.storage.updateMaterialProduct(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Material product not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Target Pests
  app.get("/api/target-pests", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getTargetPests(includeInactive);
    res.json(data);
  });

  app.post("/api/target-pests", async (req, res) => {
    try {
      const validated = targetPestSchema.parse(req.body);
      const data = await req.storage.createTargetPest(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/target-pests/:id", async (req, res) => {
    try {
      const validated = updateTargetPestSchema.parse(req.body);
      const data = await req.storage.updateTargetPest(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Target pest not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Product Applications
  app.get("/api/product-applications", async (req, res) => {
    const data = await req.storage.getProductApplications();
    res.json(data);
  });

  app.post("/api/product-applications", async (req, res) => {
    try {
      const validated = insertProductApplicationSchema.parse(req.body);
      const data = await req.storage.createProductApplication(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Invoices
  const manualInvoiceSchema = z.object({
    customerId: z.string(),
    locationId: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    amountCents: z.number().int().nonnegative(),
    taxCents: z.number().int().nonnegative().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });

  app.get("/api/invoices", async (req, res) => {
    const data = await req.storage.getInvoices();
    res.json(data);
  });

  app.get("/api/invoices/ready-for-billing", async (req, res) => {
    const data = await req.storage.getServiceRecordsReadyForBilling();
    res.json(data);
  });

  app.get("/api/invoices/:id/line-items", async (req, res) => {
    const data = await req.storage.getInvoiceLineItems(req.params.id);
    res.json(data);
  });

  app.post("/api/invoices", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const validated = manualInvoiceSchema.parse(req.body);
      const data = await req.storage.createManualInvoice({
        ...validated,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/generate-from-service-record/:serviceRecordId", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const data = await req.storage.generateInvoiceFromServiceRecord(req.params.serviceRecordId);
      res.status(201).json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Batch Invoicing - PLAN_BILLING_V1.md §1.6.1: from the Ticket Review
  // queue, filter finalized/billing-ready records over a date range ->
  // preview -> generate -> optionally bulk-send.
  const batchDateRangeSchema = z.object({
    dateFrom: z.string().min(1),
    dateTo: z.string().min(1),
  });

  app.get("/api/invoices/batch-preview", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const { dateFrom, dateTo } = batchDateRangeSchema.parse(req.query);
      const data = await req.storage.getServiceRecordsReadyForBillingInRange(dateFrom, dateTo);
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/batch-generate", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const { dateFrom, dateTo } = batchDateRangeSchema.parse(req.body);
      const data = await req.storage.batchGenerateInvoicesForDateRange(dateFrom, dateTo);
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/batch-send", requirePermission(PERMISSIONS.SEND_INVOICE), async (req, res) => {
    try {
      const invoiceIds = z.array(z.string()).min(1).parse(req.body.invoiceIds);
      const data = await req.storage.batchSendInvoices(invoiceIds);
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const validated = insertInvoiceSchema.partial().parse(req.body);
      const data = await req.storage.updateInvoice(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/:id/void", requirePermission(PERMISSIONS.VOID_INVOICE), async (req, res) => {
    const data = await req.storage.voidInvoice(req.params.id);
    if (!data) return res.status(404).json({ message: "Invoice not found" });
    res.json(data);
  });

  // Tax Rates
  app.get("/api/tax-rates", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getTaxRates(includeInactive);
    res.json(data);
  });

  app.post("/api/tax-rates", async (req, res) => {
    try {
      const validated = insertTaxRateSchema.parse(req.body);
      const data = await req.storage.createTaxRate(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/tax-rates/:id", async (req, res) => {
    try {
      const validated = insertTaxRateSchema.partial().parse(req.body);
      const data = await req.storage.updateTaxRate(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Tax rate not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Tax Rules
  app.get("/api/tax-rules", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getTaxRules(includeInactive);
    res.json(data);
  });

  app.post("/api/tax-rules", async (req, res) => {
    try {
      const validated = insertTaxRuleSchema.parse(req.body);
      const data = await req.storage.createTaxRule(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/tax-rules/:id", async (req, res) => {
    try {
      const validated = insertTaxRuleSchema.partial().parse(req.body);
      const data = await req.storage.updateTaxRule(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Tax rule not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Tax Exemption Certificates
  app.get("/api/accounts/:accountId/tax-exemption-certificates", async (req, res) => {
    const data = await req.storage.getTaxExemptionCertificates(req.params.accountId);
    res.json(data);
  });

  app.post("/api/tax-exemption-certificates", async (req, res) => {
    try {
      const validated = insertTaxExemptionCertificateSchema.parse(req.body);
      const data = await req.storage.createTaxExemptionCertificate(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Billing Run - manual trigger for ops/catch-up. The real trigger is the
  // nightly cron (server/jobs/billing-run.ts); this exists so an admin
  // isn't stuck waiting for 2am to force a run or verify one worked.
  app.post("/api/billing-run", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
    try {
      const result = await runBillingCycle();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Communications
  app.get("/api/communications/:customerId", async (req, res) => {
    const data = await req.storage.getCommunications(req.params.customerId);
    res.json(data);
  });

  app.get("/api/all-communications", async (req, res) => {
    const data = await req.storage.getAllCommunications();
    res.json(data);
  });

  app.post("/api/communications", async (req, res) => {
    try {
      const validated = insertCommunicationSchema.parse(req.body);
      const data = await req.storage.createCommunication(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  return httpServer;
}
