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
import { DraftInvoiceDecisionRequiredError, PrefinalizationIssueError, TicketLockedError } from "./storage";
import { can, PERMISSIONS, type UserRole } from "@shared/permissions";
import { INVOICE_ON_FINALIZE_MODES, normalizeInvoiceOnFinalizeMode } from "@shared/invoice-on-finalize";
import {
  INITIAL_CHARGE_AMOUNT_MODES,
  INITIAL_CHARGE_COLLECTORS,
  INITIAL_CHARGE_TYPES,
  initialChargeFromTemplate,
  normalizeInitialCharge,
  validateInitialCharge,
} from "@shared/initial-charge";
import {
  CASH_CONFIRM_AUTHORITY_MESSAGE,
  CREDIT_MEMO_REASON_CODES,
  MANUAL_PAYMENT_METHODS,
  PAYMENT_BATCH_CONFIRM_MAX,
  PAYMENT_LIST_MAX_LIMIT,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@shared/payments";
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
  // Two ways to ask, one route: `locationId` for the location screen's rollup,
  // `entityType`+`entityId` for one record's own trail (what passes 3-8 need
  // for an invoice or a payment). entityType stays a free string rather than
  // the AuditEntityType union - it filters rows that predate the union and may
  // hold anything.
  const auditLogQuerySchema = z
    .object({
      locationId: z.string().min(1).optional(),
      entityType: z.string().min(1).optional(),
      entityId: z.string().min(1).optional(),
      limit: z.coerce.number().int().positive().optional(),
    })
    .superRefine((value, ctx) => {
      const byEntity = !!value.entityType && !!value.entityId;
      if (!value.locationId && !byEntity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["locationId"],
          message: "Provide either locationId, or both entityType and entityId",
        });
      }

      if (value.locationId && (value.entityType || value.entityId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["locationId"],
          message: "locationId cannot be combined with entityType/entityId",
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
  // Single-L CANCELED is intentional and distinct from serviceStatusSchema's
  // CANCELLED - appointments and services keep separate vocabularies.
  const appointmentStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"]);
  const serviceSourceSchema = z.enum(["MANUAL", "AGREEMENT_GENERATED", "AGREEMENT_INITIAL"]);
  const agreementSchedulingModeSchema = z.enum(["AUTO_ELIGIBLE", "CONTACT_REQUIRED", "MANUAL"]);
  // Pass 12: userId is the technician -> user bridge (C2.2); an empty string
  // is refused rather than stored, null clears the link.
  const technicianSchema = insertTechnicianSchema.extend({
    status: technicianStatusSchema,
    userId: z.string().min(1).nullable().optional(),
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
    userId: z.string().min(1).nullable().optional(),
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
    // Optional, not required: the column has a SCHEDULED default and internal
    // creators omit it. Present-but-invalid still fails validation.
    status: appointmentStatusSchema.optional(),
  });
  // voidDraftInvoices is the Q3 answer, not an appointment column: stripped
  // off before the row update and passed as an option (see the PATCH route).
  const updateAppointmentSchema = appointmentSchema.partial().extend({
    voidDraftInvoices: z.boolean().optional(),
  });
  const serviceRecordSchema = insertServiceRecordSchema.omit({ serviceDate: true }).extend({
    serviceDate: z.coerce.date(),
  }).superRefine((value, ctx) => {
    if (!value.serviceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceId"], message: "serviceId is required" });
    }
  });
  // D9 (Pass 16): the office's edit of a posted ticket - its content only.
  // Strict, so a lifecycle column (`confirmed`, `ticketStatus`, the stamps,
  // `readyForBilling`) or an identity column (service, appointment, customer,
  // location) is refused, not silently written: `{ confirmed: true }` was the
  // pre-Phase-1 Service History "Confirm", which completed a Service without
  // finalization. Finalize and reopen are their own routes. Materials are
  // replace-all when sent (the post's shape), untouched when omitted.
  const updateServiceRecordSchema = z.object({
    serviceDate: z.coerce.date().optional(),
    technicianId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    targetPests: z.array(z.string()).nullable().optional(),
    areasServiced: z.string().nullable().optional(),
    conditionsFound: z.string().nullable().optional(),
    recommendations: z.string().nullable().optional(),
    followUpRequired: z.boolean().optional(),
    followUpNotes: z.string().nullable().optional(),
    customerSignature: z.boolean().nullable().optional(),
    productApplications: z.array(insertProductApplicationSchema.omit({ serviceRecordId: true })).optional(),
  }).strict();
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
  const invoiceOnFinalizeModeSchema = z.object({
    mode: z.enum(INVOICE_ON_FINALIZE_MODES),
  });
  const appointmentCancelRescheduleSchema = z.object({
    reason: z.string().trim().min(1, "Reason is required"),
    notes: z.string().nullable().optional(),
    rescheduleRequested: z.boolean().optional(),
    voidDraftInvoices: z.boolean().optional(),
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
    voidDraftInvoices: z.boolean().optional(),
  });
  // Q3: an appointment-cancel path found DRAFT invoices and the caller has not
  // said what to do with them. 409 with the drafts listed; the client prompts
  // and resubmits with voidDraftInvoices true or false.
  const respondDraftInvoiceDecisionRequired = (res: any, err: DraftInvoiceDecisionRequiredError) =>
    res.status(409).json({ message: err.message, code: err.code, draftInvoices: err.draftInvoices });
  // D9 (Pass 16): a ticket edit or re-post its state forbids - 409
  // TICKET_FINALIZED ("reopen first"), 403 TICKET_IN_REVIEW (a technician's
  // re-post on a ticket the office holds).
  const respondTicketLocked = (res: any, err: TicketLockedError) =>
    res.status(err.status).json({ message: err.message, code: err.code });
  // D4: the initial charge block on agreements (actual) and templates
  // (default). The enums are the shared vocabulary; the cross-field rule - a
  // typed charge must carry a usable amount - is validateInitialCharge(), run
  // on the normalized block so the check sees exactly what will be stored.
  // Because the type decides what the other four fields mean, a request that
  // touches any of them must name the type; an amount-only patch is refused
  // rather than guessed at.
  const initialChargeTypeSchema = z.enum(INITIAL_CHARGE_TYPES).nullable().optional();
  const initialChargeAmountModeSchema = z.enum(INITIAL_CHARGE_AMOUNT_MODES).nullable().optional();
  const initialChargeCollectorSchema = z.enum(INITIAL_CHARGE_COLLECTORS).nullable().optional();
  const initialChargeIntSchema = z.number().int().nullable().optional();
  const initialChargeFlagSchema = z.boolean().optional();
  const AGREEMENT_INITIAL_CHARGE_KEYS = ["initialChargeType", "initialChargeAmountMode", "initialChargeCents", "initialChargePercentBasisPoints", "initialChargeCollectedBy", "initialChargeInAdditionToPrice"] as const;
  const TEMPLATE_INITIAL_CHARGE_KEYS = ["defaultInitialChargeType", "defaultInitialChargeAmountMode", "defaultInitialChargeCents", "defaultInitialChargePercentBasisPoints", "defaultInitialChargeCollectedBy", "defaultInitialChargeInAdditionToPrice"] as const;
  const refineAgreementInitialCharge = (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const touched = AGREEMENT_INITIAL_CHARGE_KEYS.some((key) => value[key] !== undefined);
    if (!touched) return;
    if (value.initialChargeType === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["initialChargeType"], message: "initialChargeType is required when changing the initial charge" });
      return;
    }
    const message = validateInitialCharge(normalizeInitialCharge(value));
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["initialChargeCents"], message });
    }
  };
  const refineTemplateInitialCharge = (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const touched = TEMPLATE_INITIAL_CHARGE_KEYS.some((key) => value[key] !== undefined);
    if (!touched) return;
    if (value.defaultInitialChargeType === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultInitialChargeType"], message: "defaultInitialChargeType is required when changing the initial charge" });
      return;
    }
    const message = validateInitialCharge(initialChargeFromTemplate(value));
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultInitialChargeCents"], message });
    }
  };
  const agreementTemplateBaseSchema = insertAgreementTemplateSchema.extend({
    defaultInitialChargeType: initialChargeTypeSchema,
    defaultInitialChargeAmountMode: initialChargeAmountModeSchema,
    defaultInitialChargeCents: initialChargeIntSchema,
    defaultInitialChargePercentBasisPoints: initialChargeIntSchema,
    defaultInitialChargeCollectedBy: initialChargeCollectorSchema,
    defaultInitialChargeInAdditionToPrice: initialChargeFlagSchema,
  });
  const agreementTemplateSchema = agreementTemplateBaseSchema.extend({
    defaultTermUnit: recurrenceUnitSchema,
    defaultRecurrenceUnit: recurrenceUnitSchema,
    defaultSchedulingMode: agreementSchedulingModeSchema,
  }).superRefine((value, ctx) => {
    refineTemplateInitialCharge(value, ctx);
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
  const updateAgreementTemplateSchema = agreementTemplateBaseSchema.extend({
    defaultTermUnit: recurrenceUnitSchema.optional(),
    defaultRecurrenceUnit: recurrenceUnitSchema.optional(),
    defaultSchedulingMode: agreementSchedulingModeSchema.optional(),
  }).partial().superRefine(refineTemplateInitialCharge);
  const agreementBaseSchema = insertAgreementSchema.extend({
    status: agreementStatusSchema,
    termUnit: recurrenceUnitSchema,
    recurrenceUnit: recurrenceUnitSchema,
    schedulingMode: agreementSchedulingModeSchema,
    // Pass 12 (PLAN_ROADMAP_V2.md C2.2): every agreement carries a Billing
    // Plan. The column is NOT NULL, so null is refused by the base schema;
    // this refuses the empty string too. On creation the key may be absent
    // (the template's plan propagates) - buildAgreementInsertFromTemplate
    // refuses when neither names one. Sale credit is a users FK; null means
    // "not recorded" and only a manager+ may set it to anything but themselves.
    billingPlanId: z.string().min(1, "a Billing Plan is required"),
    soldByUserId: z.string().min(1).nullable().optional(),
    initialChargeType: initialChargeTypeSchema,
    initialChargeAmountMode: initialChargeAmountModeSchema,
    initialChargeCents: initialChargeIntSchema,
    initialChargePercentBasisPoints: initialChargeIntSchema,
    initialChargeCollectedBy: initialChargeCollectorSchema,
    initialChargeInAdditionToPrice: initialChargeFlagSchema,
  });
  const agreementSchema = agreementBaseSchema.superRefine((value, ctx) => {
    refineAgreementInitialCharge(value, ctx);
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
    refineAgreementInitialCharge(value, ctx);
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
      refineAgreementInitialCharge(value, ctx);
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

  // Pass 14 (PLAN_ROADMAP_V2.md C2.4, B20): the customer's aging - per
  // location plus the rollup, Current (0-30) / 31-60 / 61-90 / Over 90 UTC
  // days since invoiced, derived from the ledger's stored rollups at read
  // time (shared/aging.ts), nothing stored. Open read like every other read
  // in this file, and specifically like /api/location-balances/:customerId
  // and /api/locations/:id/ledger-summary, which already hand any
  // authenticated role the same open and on-account figures this rearranges:
  // a gate here would 403 the header card while the location switcher one
  // inch below still says "Open $X". Who may read money at all is C5.6's
  // role profiles, not a per-route call. 404 outside the org.
  app.get("/api/customers/:id/aging", async (req, res) => {
    const data = await req.storage.getCustomerAging(req.params.id);
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

  // Audit history (D7). This is the whole API surface for audit_logs and it is
  // read-only on purpose: the table is append-only, so no POST/PATCH/DELETE
  // counterpart may be added here. Rows are written only by storage-layer
  // recordAuditLog() calls, from the session actor, never from a request body.
  //
  // Not permission-gated, matching every other read route in this file (only
  // mutations carry requirePermission). Who may read financial history is a
  // domain decision the decision record hasn't made - see the follow-ups in
  // the Pass 2 summary.
  app.get("/api/audit-logs", async (req, res) => {
    try {
      const query = auditLogQuerySchema.parse(req.query);
      const data = query.locationId
        ? await req.storage.getAuditLogsForLocation(query.locationId, query.limit)
        : await req.storage.getAuditLogsForEntity(query.entityType!, query.entityId!, query.limit);
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

  // Users (Pass 12): the org's people, for the sold-by selector on the
  // agreement form and the technician -> user bridge in Settings. Names,
  // roles and status only - the password hash never leaves the storage.
  app.get("/api/users", async (req, res) => {
    res.json(await req.storage.getUsers());
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
        // After the spread: the actor is the session's, never the body's (D7).
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Service not found" });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      if (e instanceof TicketLockedError) return respondTicketLocked(res, e);
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
      // Pass 12: sale credit defaults to the session user (the storage fills
      // it in); naming anyone else - or nobody - at creation is an
      // assignment, and needs ASSIGN_SALE_CREDIT like a later change does.
      const requestedSoldBy = validated.agreement.soldByUserId;
      if (requestedSoldBy !== undefined && requestedSoldBy !== req.user!.id && !can(req.user!.role, PERMISSIONS.ASSIGN_SALE_CREDIT)) {
        return res.status(403).json({ message: "Only a manager or admin can credit a sale to someone else" });
      }
      const data = await req.storage.createAgreementFromTemplate({
        agreementTemplateId: validated.agreementTemplateId ?? null,
        agreement: validated.agreement,
        actor: getAuditActor(req),
      });
      // Pass 11d: the office's prompt at signing - "Collect the $X down
      // payment now?" - when the sale carries one the office may collect.
      const initialChargeDue = (await req.storage.getInitialChargeDueForAgreement(data.id)) ?? null;
      res.status(201).json({ ...data, initialChargeDue });
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/agreements/:id", async (req, res) => {
    try {
      const validated = updateAgreementSchema.parse(req.body);
      // Pass 12: the form sends the whole row, so an unchanged sold-by is
      // not an assignment; a changed one is, and needs ASSIGN_SALE_CREDIT.
      // The storage writes the audit row when the value actually moves.
      if (validated.soldByUserId !== undefined) {
        const existing = await req.storage.getAgreement(req.params.id);
        if (!existing) return res.status(404).json({ message: "Agreement not found" });
        if ((validated.soldByUserId ?? null) !== (existing.soldByUserId ?? null) && !can(req.user!.role, PERMISSIONS.ASSIGN_SALE_CREDIT)) {
          return res.status(403).json({ message: "Only a manager or admin can change who gets credit for this sale" });
        }
      }
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
      // The override path (overrideApplied + a caller-supplied
      // cancellationFeeAmountCents) is what actually waives or changes the
      // policy's cancellation fee - previously reachable by any
      // authenticated user with no role check at all, despite the RBAC
      // matrix marking "Waive cancellation fee" manager/admin only. A plain
      // cancellation (no override) stays open to any office role.
      if (validated.overrideApplied && !can(req.user!.role, PERMISSIONS.WAIVE_CANCELLATION_FEE)) {
        return res.status(403).json({ message: "You don't have permission to override the cancellation fee" });
      }
      const data = await req.storage.cancelAgreement({
        agreementId: req.params.id,
        ...validated,
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Agreement not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      if (e instanceof DraftInvoiceDecisionRequiredError) return respondDraftInvoiceDecisionRequired(res, e);
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

  // The agreement's initial charge (D4, corrected 2026-09-21 - Pass 11d). The
  // GET answers where it stands: PENDING (a down payment rides the next visit
  // invoice; any other type waits for the button), ISSUED as which invoice -
  // a visit's or the standalone - or SETTLED_OUTSIDE_LEDGER. The POST is the
  // explicit up-front path: a standalone invoice now, refused once the charge
  // is live anywhere. Same permission as generating any invoice - it IS one.
  app.get("/api/agreements/:id/initial-charge-status", async (req, res) => {
    const data = await req.storage.getAgreementInitialChargeStatus(req.params.id);
    if (!data) return res.status(404).json({ message: "Agreement not found" });
    res.json(data);
  });

  app.post("/api/agreements/:id/issue-initial-charge", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const data = await req.storage.issueInitialChargeInvoice(req.params.id, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Agreement not found" });
      res.status(201).json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Appointments
  app.get("/api/appointments", async (req, res) => {
    const data = await req.storage.getAppointments();
    res.json(data);
  });

  // D6: Price / COA applied / Due today for one visit, per service and summed,
  // with each service's BILLABLE vs PRODUCTION designation - resolved server-
  // side through the same code that prices the visit invoice. A read like
  // every other read; the technician's ticket and the dispatch board both use it.
  app.get("/api/appointments/:id/billing-summary", async (req, res) => {
    const data = await req.storage.getVisitBillingSummary(req.params.id);
    if (!data) return res.status(404).json({ message: "Appointment not found" });
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
      // Pass 11d: the office's prompt at scheduling (D4 step 1) - a down
      // payment behind this visit's services that the office may collect,
      // still owed and not covered by money designated to the agreement.
      const initialChargeDue = (await req.storage.getInitialChargeDueForAppointment(data.id)) ?? null;
      res.status(201).json({ ...data, initialChargeDue });
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const { voidDraftInvoices, ...validated } = updateAppointmentSchema.parse(req.body);
      const data = await req.storage.updateAppointment(req.params.id, {
        ...validated,
        scheduledDate: validated.scheduledDate,
        scheduledEndDate: validated.scheduledEndDate,
        generatedForDate: validated.generatedForDate === undefined ? undefined : toDateOnlyStringOrNull(validated.generatedForDate),
      }, { voidDraftInvoices, actor: getAuditActor(req) });
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      if (e instanceof DraftInvoiceDecisionRequiredError) return respondDraftInvoiceDecisionRequired(res, e);
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
        voidDraftInvoices: validated.voidDraftInvoices,
        actor: getAuditActor(req),
      });
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      if (e instanceof DraftInvoiceDecisionRequiredError) return respondDraftInvoiceDecisionRequired(res, e);
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

  // D9 (Pass 16): the office edit. EDIT_TICKET (support+); a FINALIZED
  // ticket answers 409 TICKET_FINALIZED; an edit that changes nothing writes
  // nothing; one that does writes `ticket_edited`. The actor is the session's.
  app.patch("/api/service-records/:id", requirePermission(PERMISSIONS.EDIT_TICKET), async (req, res) => {
    try {
      const validated = updateServiceRecordSchema.parse(req.body);
      const data = await req.storage.updateServiceRecord(req.params.id, { ...validated, actor: getAuditActor(req) });
      if (!data) return res.status(404).json({ message: "Service record not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      if (e instanceof TicketLockedError) return respondTicketLocked(res, e);
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

  // D2: invoiceOnFinalize = PROMPT | AUTO_DRAFT | OFF. Readable by anyone
  // (the Settings page shows it); changing it decides how the office bills
  // every visit, so it is MANAGE_SETTINGS like tax rates and the billing run.
  app.get("/api/settings/invoice-on-finalize", async (req, res) => {
    const mode = await req.storage.getInvoiceOnFinalizeMode();
    res.json({ mode });
  });

  app.patch("/api/settings/invoice-on-finalize", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
    try {
      const validated = invoiceOnFinalizeModeSchema.parse(req.body);
      const data = await req.storage.setInvoiceOnFinalizeMode(validated.mode);
      res.json({ mode: normalizeInvoiceOnFinalizeMode(data.value) });
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

  // Organization branding (feeds the invoice/statement document renderer)
  const organizationBrandingSchema = z.object({
    logoUrl: z.string().nullable().optional(),
    primaryColorHex: z.string().nullable().optional(),
    remitToName: z.string().nullable().optional(),
    remitToAddress: z.string().nullable().optional(),
    remitToEmail: z.string().nullable().optional(),
    remitToPhone: z.string().nullable().optional(),
  });

  app.get("/api/organization", async (req, res) => {
    const data = await req.storage.getOrganization();
    if (!data) return res.status(404).json({ message: "Organization not found" });
    res.json(data);
  });

  app.patch("/api/organization/branding", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
    try {
      const validated = organizationBrandingSchema.parse(req.body);
      const data = await req.storage.updateOrganizationBranding(validated);
      if (!data) return res.status(404).json({ message: "Organization not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Production Value Ledger (PLAN_BILLING_V1.md §1.6.2) - append-only,
  // read-only from the API; entries are only ever created internally by
  // finalizeServiceRecord.
  app.get("/api/agreements/:agreementId/production-value-entries", requirePermission(PERMISSIONS.VIEW_PRODUCTION_VALUE), async (req, res) => {
    const data = await req.storage.getProductionValueEntriesByAgreement(req.params.agreementId);
    res.json(data);
  });

  app.get("/api/technicians/:technicianId/production-value-entries", requirePermission(PERMISSIONS.VIEW_PRODUCTION_VALUE), async (req, res) => {
    const data = await req.storage.getProductionValueEntriesByTechnician(req.params.technicianId);
    res.json(data);
  });

  // Invoices
  // The manual invoice - one ADJUSTMENT line, no service behind it. Since
  // Pass 13 (PLAN_ROADMAP_V2.md B6 / C2.3) its only client is "Add fee /
  // adjustment" on the location ledger panel, where the location is already
  // known; the Invoices screen's New Invoice is gone, and a charge for work
  // performed is a visit invoice (Draft invoice for a visit, or generation).
  const manualInvoiceSchema = z.object({
    customerId: z.string(),
    // Required (Pass 10): a manual invoice is billed to one of the
    // customer's locations, or refused. Storage checks it belongs to them.
    locationId: z.string().min(1),
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

  // Pass 11b (PLAN_ROADMAP_V2.md C2.1b): where one visit stands with
  // invoicing - the Service Ticket Review modal's invoice badge, and its
  // Generate for a finalized, un-invoiced visit (the finalize prompt's
  // "Later"). Open read like every invoice read here; 404 outside the org.
  // A fixed path, kept with the other fixed paths above the bare :id reads.
  app.get("/api/invoices/by-appointment/:appointmentId", async (req, res) => {
    const data = await req.storage.getAppointmentInvoiceStatus(req.params.appointmentId);
    if (!data) return res.status(404).json({ message: "Appointment not found" });
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
        actor: getAuditActor(req),
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/generate-from-service-record/:serviceRecordId", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const data = await req.storage.generateInvoiceFromServiceRecord(req.params.serviceRecordId, getAuditActor(req));
      res.status(201).json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // D3: a DRAFT against an appointment whose tickets may not be finalized yet.
  // Same permission as generation - it is office prep, not an override.
  app.post("/api/invoices/draft-for-appointment/:appointmentId", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const data = await req.storage.createDraftInvoiceForAppointment(req.params.appointmentId, getAuditActor(req));
      res.status(201).json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // D3: DRAFT -> issued. The override needs BOTH the role
  // (ISSUE_INVOICE_PREFINALIZATION, manager+) and an explicit confirmation in
  // the body, so the flow is: issue -> 409 listing the unfinalized tickets ->
  // the client asks -> issue again with confirmPrefinalization. A role that
  // cannot override gets 403 with the same list, so the office knows who to
  // ask. Either way the storage layer is what refuses; the route only decides
  // which mode to request.
  const issueInvoiceSchema = z.object({
    confirmPrefinalization: z.boolean().optional(),
  });

  app.post("/api/invoices/:id/issue", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const validated = issueInvoiceSchema.parse(req.body ?? {});
      const mayOverride = can(req.user!.role, PERMISSIONS.ISSUE_INVOICE_PREFINALIZATION);
      const data = await req.storage.issueInvoice(req.params.id, {
        actor: getAuditActor(req),
        prefinalization: mayOverride && validated.confirmPrefinalization ? "OVERRIDE" : "REFUSE",
      });
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      if (e instanceof PrefinalizationIssueError) {
        const mayOverride = can(req.user!.role, PERMISSIONS.ISSUE_INVOICE_PREFINALIZATION);
        return res.status(mayOverride ? 409 : 403).json({
          message: mayOverride ? e.message : `${e.message}. You don't have permission to issue before finalization.`,
          code: mayOverride ? e.code : "PREFINALIZATION_ISSUE_FORBIDDEN",
          unfinalizedTickets: e.unfinalizedTickets,
        });
      }
      res.status(400).json({ message: e.message });
    }
  });

  // Batch Invoicing - PLAN_BILLING_V1.md §1.6.1, on the Invoices screen
  // since Pass 13 (PLAN_ROADMAP_V2.md C2.3; it is an invoicing action, not a
  // review-queue one): finalized, billing-ready tickets POSTED inside the
  // window - the server filters postedAt falling back to serviceDate, so the
  // dialog says "posted between" - optionally one technician's, -> preview
  // (grouped by technician then service date on the client) -> generate ->
  // optionally bulk-send. Preview and generate parse the same filters
  // (shared/batch-invoice.ts BatchInvoiceFilters): a query string on the GET,
  // a body on the POST. No technician means every technician.
  const batchInvoiceFiltersSchema = z.object({
    dateFrom: z.string().min(1),
    dateTo: z.string().min(1),
    technicianId: z.string().min(1).optional(),
  });

  app.get("/api/invoices/batch-preview", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const filters = batchInvoiceFiltersSchema.parse(req.query);
      const data = await req.storage.getBatchInvoicePreviewForDateRange(filters);
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/batch-generate", requirePermission(PERMISSIONS.GENERATE_INVOICE), async (req, res) => {
    try {
      const filters = batchInvoiceFiltersSchema.parse(req.body);
      const data = await req.storage.batchGenerateInvoicesForDateRange(filters, getAuditActor(req));
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

  // Deliberately narrow: this used to accept insertInvoiceSchema.partial(),
  // which let any authenticated user rewrite amountCents/taxCents/
  // totalAmountCents/customerId/serviceRecordId/billingProfileSnapshot/
  // taxSnapshot on an already-issued invoice with no permission check at
  // all, and set status: "VOID" directly - completely bypassing
  // VOID_INVOICE and the immutable-snapshot guarantee unit 11's tax engine
  // and unit 10's invoice model are built on. Since Pass 6 (D5) status and
  // paidDate are derived from the ledger and are not accepted here either -
  // "Mark Paid" is gone; recording a payment is what marks an invoice paid.
  // Voiding still requires the dedicated, VOID_INVOICE-gated /void route.
  const updateInvoiceSchema = z.object({
    dueDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).strict();

  app.patch("/api/invoices/:id", requirePermission(PERMISSIONS.SEND_INVOICE), async (req, res) => {
    try {
      const validated = updateInvoiceSchema.parse(req.body);
      const data = await req.storage.updateInvoice(req.params.id, {
        notes: validated.notes,
        dueDate: validated.dueDate === undefined ? undefined : validated.dueDate ? new Date(validated.dueDate) : null,
      }, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/invoices/:id/void", requirePermission(PERMISSIONS.VOID_INVOICE), async (req, res) => {
    try {
      const data = await req.storage.voidInvoice(req.params.id, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Pass 11b (PLAN_ROADMAP_V2.md C2.1b): put a location on an invoice that
  // has none - the repair for the rows created before a manual invoice
  // required one (INV-000001, INV-000072). Manager+ through
  // ASSIGN_INVOICE_LOCATION; storage refuses a VOID invoice, one that already
  // has a location (this is not a transfer) and another customer's location,
  // and records an `update` on the invoice. The actor is the session's.
  const assignInvoiceLocationSchema = z.object({
    locationId: z.string().min(1),
  }).strict();

  app.post("/api/invoices/:id/assign-location", requirePermission(PERMISSIONS.ASSIGN_INVOICE_LOCATION), async (req, res) => {
    try {
      const { locationId } = assignInvoiceLocationSchema.parse(req.body ?? {});
      const data = await req.storage.assignInvoiceLocation(req.params.id, locationId, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Payments ledger (PLAN_BILLING_V1_1.md D5) and D4's location balance.
  // Reads are open like every other read here; every mutation is gated by the
  // permission named in shared/permissions.ts. The actor is always the
  // session's, never the body's.
  // ---------------------------------------------------------------------------

  const centsSchema = z.number().int().positive();
  const ledgerReasonSchema = z.object({ reason: z.string().trim().min(1, "reason is required") });
  const applySchema = z.object({
    invoiceId: z.string().min(1),
    amountCents: centsSchema.nullable().optional(),
  });
  const releaseSchema = z.object({
    applicationId: z.string().min(1),
    reason: z.string().trim().min(1, "reason is required"),
  });
  const recordPaymentSchema = z.object({
    locationId: z.string().min(1),
    method: z.enum(MANUAL_PAYMENT_METHODS),
    amountCents: centsSchema,
    receivedAt: z.string().nullable().optional(),
    checkNumber: z.string().nullable().optional(),
    referenceNumber: z.string().nullable().optional(),
    memo: z.string().nullable().optional(),
    designatedAgreementId: z.string().nullable().optional(),
    // The visit the money was collected at - the field's collect dialog sets
    // it; the office's Record Payment dialog never does. Validated in storage.
    appointmentId: z.string().nullable().optional(),
    applyToInvoiceId: z.string().nullable().optional(),
  });
  const issueCreditMemoSchema = z.object({
    locationId: z.string().min(1),
    invoiceId: z.string().nullable().optional(),
    reasonCode: z.enum(CREDIT_MEMO_REASON_CODES),
    reason: z.string().trim().min(1, "reason is required"),
    amountCents: centsSchema,
    applyToInvoiceId: z.string().nullable().optional(),
  });

  // The invoice modal's read (PLAN_ROADMAP_V2.md Part D, Pass 11a): the row,
  // its lines, and the customer / location / visit, in one response. Kept
  // BELOW the fixed-path GETs under /api/invoices (ready-for-billing,
  // batch-preview): Express matches in registration order, and a bare :id
  // registered above them would swallow both. Open read like every other
  // invoice read here; an id outside the org is a 404, like the ledger.
  app.get("/api/invoices/:id", async (req, res) => {
    const data = await req.storage.getInvoiceDetail(req.params.id);
    if (!data) return res.status(404).json({ message: "Invoice not found" });
    res.json(data);
  });

  app.get("/api/invoices/:id/ledger", async (req, res) => {
    const data = await req.storage.getInvoiceLedger(req.params.id);
    if (!data) return res.status(404).json({ message: "Invoice not found" });
    res.json(data);
  });

  // D4's "Apply $X location balance to this invoice?" - the numbers, then the act.
  app.get("/api/invoices/:id/location-balance", async (req, res) => {
    const data = await req.storage.getInvoiceLocationBalance(req.params.id);
    if (!data) return res.status(404).json({ message: "Invoice not found" });
    res.json(data);
  });

  app.post("/api/invoices/:id/apply-location-balance", requirePermission(PERMISSIONS.APPLY_PAYMENT), async (req, res) => {
    try {
      const data = await req.storage.applyLocationBalanceToInvoice(req.params.id, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/payments/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getPaymentsByLocation(req.params.locationId);
    res.json(data);
  });

  // What the field collected at one visit - the Service Ticket Review modal's
  // "Collected in the field" list. Reads payments.appointmentId, never the
  // billing summary: once the visit is invoiced the summary reads
  // applications only, so an unapplied field collection would vanish from it.
  app.get("/api/payments/by-appointment/:appointmentId", async (req, res) => {
    const data = await req.storage.getPaymentsByAppointment(req.params.appointmentId);
    res.json(data);
  });

  // The Payments screen (D5 owner review of Pass 7.5, item 4). Reads are open
  // like every other read in this file. The query keys are the
  // PaymentListFilters names (shared/payments.ts); dates are YYYY-MM-DD UTC
  // calendar days, inclusive, validated here and applied in SQL in storage.
  const dateOnlySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "not a calendar date");
  const csvListSchema = z.string().transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean));
  const paymentListQuerySchema = z
    .object({
      status: csvListSchema.pipe(z.array(z.enum(PAYMENT_STATUSES)).min(1)).optional(),
      method: csvListSchema.pipe(z.array(z.enum(PAYMENT_METHODS)).min(1)).optional(),
      receivedFrom: dateOnlySchema.optional(),
      receivedTo: dateOnlySchema.optional(),
      collectedByUserId: z.string().min(1).optional(),
      search: z.string().trim().max(200).optional(),
      limit: z.coerce.number().int().positive().max(PAYMENT_LIST_MAX_LIMIT).optional(),
    })
    .refine((value) => !value.receivedFrom || !value.receivedTo || value.receivedFrom <= value.receivedTo, {
      message: "receivedFrom is after receivedTo",
      path: ["receivedTo"],
    });
  const collectionsRangeSchema = z
    .object({ receivedFrom: dateOnlySchema, receivedTo: dateOnlySchema })
    .refine((value) => value.receivedFrom <= value.receivedTo, { message: "receivedFrom is after receivedTo", path: ["receivedTo"] });
  const confirmBatchSchema = z.object({
    paymentIds: z.array(z.string().min(1)).min(1, "paymentIds is required").max(PAYMENT_BATCH_CONFIRM_MAX),
  });

  app.get("/api/payments", async (req, res) => {
    try {
      const filters = paymentListQuerySchema.parse(req.query);
      const data = await req.storage.listPayments(filters);
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // The deposit-slip view: collections in a range by day / collector /
  // method, pending against confirmed. Derived, nothing stored.
  app.get("/api/payments/collections", async (req, res) => {
    try {
      const range = collectionsRangeSchema.parse(req.query);
      const data = await req.storage.getCollectionsReport(range);
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Pass 14 (PLAN_ROADMAP_V2.md C2.4): the org-wide aging report - per
  // customer and per location, the same buckets and figures as
  // GET /api/customers/:id/aging summed, so the two can never disagree.
  // Derived, nothing stored. The first /api/reports route, and open like the
  // collections report above and every other read here: GET /api/invoices
  // already lists every balance in the org to any authenticated role, the
  // RBAC matrix (PLAN_BILLING_V1.md 0.3) gates cost / margin / LTV and not
  // receivables, and a real read gate is C5.6's role profiles.
  app.get("/api/reports/aging", async (req, res) => {
    const data = await req.storage.getAgingReport();
    res.json(data);
  });

  app.get("/api/credit-memos/by-location/:locationId", async (req, res) => {
    const data = await req.storage.getCreditMemosByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/locations/:locationId/ledger-summary", async (req, res) => {
    const data = await req.storage.getLocationLedgerSummary(req.params.locationId);
    res.json(data);
  });

  // Record: TAKE_PAYMENT_FIELD (technician, support, manager, admin). Posts
  // PENDING; optionally applies to one invoice in the same transaction, which
  // additionally needs APPLY_PAYMENT - a technician records the collection
  // and the office applies it.
  app.post("/api/payments", requirePermission(PERMISSIONS.TAKE_PAYMENT_FIELD), async (req, res) => {
    try {
      const validated = recordPaymentSchema.parse(req.body);
      if (validated.applyToInvoiceId && !can(req.user!.role, PERMISSIONS.APPLY_PAYMENT)) {
        return res.status(403).json({ message: "You don't have permission to apply payments to invoices; record it unapplied and the office will apply it" });
      }
      const data = await req.storage.recordPayment({
        ...validated,
        receivedAt: validated.receivedAt ? new Date(validated.receivedAt) : null,
        actor: getAuditActor(req),
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Confirm: a check or "other" needs CONFIRM_PAYMENT (support+); cash needs
  // CONFIRM_CASH_PAYMENT (manager+) - D5's cash-handling authority.
  app.post("/api/payments/:id/confirm", requirePermission(PERMISSIONS.CONFIRM_PAYMENT), async (req, res) => {
    try {
      const payment = await req.storage.getPayment(req.params.id);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.method === "CASH" && !can(req.user!.role, PERMISSIONS.CONFIRM_CASH_PAYMENT)) {
        return res.status(403).json({ message: CASH_CONFIRM_AUTHORITY_MESSAGE });
      }
      const data = await req.storage.confirmPayment(req.params.id, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Payment not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Batch confirmation from the Payments screen's queue. The route gate is
  // CONFIRM_PAYMENT (a technician gets the 403); cash authority is decided
  // here once and applied PER PAYMENT in storage, so a support user's cash is
  // skipped and reported while their checks confirm. One transaction and one
  // payment_confirmed audit row per confirmed payment - confirmPayment's body.
  app.post("/api/payments/confirm-batch", requirePermission(PERMISSIONS.CONFIRM_PAYMENT), async (req, res) => {
    try {
      const { paymentIds } = confirmBatchSchema.parse(req.body ?? {});
      const data = await req.storage.confirmPayments(paymentIds, {
        actor: getAuditActor(req),
        allowCash: can(req.user!.role, PERMISSIONS.CONFIRM_CASH_PAYMENT),
      });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/payments/:id/void", requirePermission(PERMISSIONS.VOID_PAYMENT), async (req, res) => {
    try {
      const { reason } = ledgerReasonSchema.parse(req.body ?? {});
      const data = await req.storage.voidPayment(req.params.id, reason, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Payment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/payments/:id/refund", requirePermission(PERMISSIONS.REFUND_PAYMENT), async (req, res) => {
    try {
      const { reason } = ledgerReasonSchema.parse(req.body ?? {});
      const data = await req.storage.refundPayment(req.params.id, reason, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Payment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/payments/:id/apply", requirePermission(PERMISSIONS.APPLY_PAYMENT), async (req, res) => {
    try {
      const validated = applySchema.parse(req.body);
      const data = await req.storage.applyPayment(req.params.id, { ...validated, actor: getAuditActor(req) });
      if (!data) return res.status(404).json({ message: "Payment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/payment-applications/release", requirePermission(PERMISSIONS.APPLY_PAYMENT), async (req, res) => {
    try {
      const validated = releaseSchema.parse(req.body);
      const data = await req.storage.releasePaymentApplication({ ...validated, actor: getAuditActor(req) });
      if (!data) return res.status(404).json({ message: "Payment application not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/credit-memos", requirePermission(PERMISSIONS.ISSUE_CREDIT_MEMO), async (req, res) => {
    try {
      const validated = issueCreditMemoSchema.parse(req.body);
      const data = await req.storage.issueCreditMemo({ ...validated, actor: getAuditActor(req) });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/credit-memos/:id/void", requirePermission(PERMISSIONS.ISSUE_CREDIT_MEMO), async (req, res) => {
    try {
      const { reason } = ledgerReasonSchema.parse(req.body ?? {});
      const data = await req.storage.voidCreditMemo(req.params.id, reason, getAuditActor(req));
      if (!data) return res.status(404).json({ message: "Credit memo not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/credit-memos/:id/apply", requirePermission(PERMISSIONS.APPLY_PAYMENT), async (req, res) => {
    try {
      const validated = applySchema.parse(req.body);
      const data = await req.storage.applyCreditMemo(req.params.id, { ...validated, actor: getAuditActor(req) });
      if (!data) return res.status(404).json({ message: "Credit memo not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/credit-applications/release", requirePermission(PERMISSIONS.APPLY_PAYMENT), async (req, res) => {
    try {
      const validated = releaseSchema.parse(req.body);
      const data = await req.storage.releaseCreditApplication({ ...validated, actor: getAuditActor(req) });
      if (!data) return res.status(404).json({ message: "Credit application not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Document rendering (PLAN_BILLING_V1.md §1.7) - generates the PDF on
  // first request and stores it; every request after that returns the
  // same stored artifact rather than re-rendering. Inline by default (the
  // browser shows it in a tab); ?download=1 asks for an attachment so the
  // Invoices screens' Download button saves it. A read, so no permission
  // gate beyond the session, like every other invoice read here.
  app.get("/api/invoices/:id/document", async (req, res) => {
    try {
      const document = await req.storage.getOrCreateInvoiceDocument(req.params.id);
      if (!document) return res.status(404).json({ message: "Invoice not found" });
      const invoice = await req.storage.getInvoice(req.params.id);
      const disposition = req.query.download === "1" ? "attachment" : "inline";
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Disposition", `${disposition}; filename="invoice-${invoice?.invoiceNumber ?? document.id}.pdf"`);
      res.send(Buffer.from(document.contentBase64, "base64"));
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/invoices/:id/document-info", async (req, res) => {
    const document = await req.storage.getOrCreateInvoiceDocument(req.params.id);
    if (!document) return res.status(404).json({ message: "Invoice not found" });
    const { contentBase64, ...info } = document;
    res.json(info);
  });

  // Tax Rates
  app.get("/api/tax-rates", async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await req.storage.getTaxRates(includeInactive);
    res.json(data);
  });

  app.post("/api/tax-rates", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
    try {
      const validated = insertTaxRateSchema.parse(req.body);
      const data = await req.storage.createTaxRate(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/tax-rates/:id", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
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

  app.post("/api/tax-rules", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
    try {
      const validated = insertTaxRuleSchema.parse(req.body);
      const data = await req.storage.createTaxRule(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/tax-rules/:id", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
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

  app.post("/api/tax-exemption-certificates", requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res) => {
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
