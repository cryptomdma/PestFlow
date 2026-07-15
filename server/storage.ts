import {
  auditLogs,
  accounts,
  customers, contacts, locations, serviceTypes, appointments,
  technicians,
  services,
  opportunities,
  opportunityActivities,
  opportunityDispositions,
  agreements,
  agreementTemplates,
  agreementCancellationPolicies,
  billingPlans,
  appSettings,
  serviceRecords, productApplications, materialProducts, targetPests, invoices, communications,
  billingProfiles, billingProfileTemplates, customerNotes,
  noteRevisions,
  users,
  type User, type InsertUser,
  type Account,
  type Customer, type InsertCustomer,
  type Contact, type InsertContact,
  type Location, type InsertLocation,
  type ServiceType, type InsertServiceType,
  type Technician, type InsertTechnician,
  type Service, type InsertService,
  type Appointment, type InsertAppointment,
  type AgreementCancellationPolicy, type InsertAgreementCancellationPolicy,
  type BillingPlan, type InsertBillingPlan,
  type Agreement, type InsertAgreement,
  type AgreementTemplate, type InsertAgreementTemplate,
  type ServiceRecord, type InsertServiceRecord,
  type AppSetting,
  type Opportunity, type InsertOpportunity,
  type OpportunityActivity, type InsertOpportunityActivity,
  type OpportunityDisposition, type InsertOpportunityDisposition,
  type ProductApplication, type InsertProductApplication,
  type MaterialProduct, type InsertMaterialProduct,
  type TargetPest, type InsertTargetPest,
  type Invoice, type InsertInvoice,
  type Communication, type InsertCommunication,
  type BillingProfile, type InsertBillingProfile,
  type BillingProfileTemplate, type InsertBillingProfileTemplate,
  type CustomerNote,
  type NoteRevision,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql, gte, lte, asc, desc, ne, isNull } from "drizzle-orm";
import { PLACEHOLDER_LOCATION_NAME, PLACEHOLDER_LOCATION_NOTE } from "./account-bootstrap";
import { can, PERMISSIONS, type UserRole } from "@shared/permissions";

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
  openBalanceCents: number;
  totalInvoicedCents: number;
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

export interface GenerateAgreementServicesResult {
  createdServices: Service[];
}

export interface DispatchBoardWindow {
  dateFrom: string;
  dateTo: string;
}

export interface CreateAgreementFromTemplateInput {
  agreementTemplateId?: string | null;
  agreement: Partial<InsertAgreement> & Pick<InsertAgreement, "customerId" | "locationId" | "status" | "startDate" | "nextServiceDate">;
  actor?: AuditActor;
}

export interface LinkAgreementInitialAppointmentInput {
  agreementId: string;
  appointmentId: string;
  actor?: AuditActor;
}

export interface CancelAgreementInput {
  agreementId: string;
  reason: string;
  effectiveDate?: string | null;
  notes?: string | null;
  cancelPendingServices?: boolean;
  cancelScheduledAppointments?: boolean;
  closeOpenOpportunities?: boolean;
  createRetentionOpportunity?: boolean;
  overrideApplied?: boolean;
  overrideReason?: string | null;
  cancellationFeeAmountCents?: number | null;
  actor?: AuditActor;
}

export interface CompleteServiceInput {
  serviceId: string;
  actorRole: UserRole;
  appointmentId?: string | null;
  technicianId?: string | null;
  serviceDate: Date;
  serviceTypeId?: string | null;
  priceCents?: number | null;
  notes?: string | null;
  targetPests?: string[] | null;
  areasServiced?: string | null;
  conditionsFound?: string | null;
  recommendations?: string | null;
  followUpRequired?: boolean | null;
  followUpNotes?: string | null;
  customerSignature?: boolean | null;
  confirmed?: boolean | null;
  productApplications?: Array<Omit<InsertProductApplication, "serviceRecordId">>;
}

export interface CompleteServiceResult {
  service: Service;
  appointment?: Appointment | null;
  serviceRecord: ServiceRecord;
  productApplications: ProductApplication[];
}

export type ServiceTimeTrackingMode = "AUTO_TIMEOUT_ON_TICKET_POST" | "PROMPT_FOR_TIMEOUT" | "MANUAL_TIMEOUT";

export const DEFAULT_APPOINTMENT_CANCEL_REASONS = [
  "Weather",
  "Gates locked",
  "Schedule conflict",
  "Customer not home",
  "Canceled by company",
  "Customer requested reschedule",
  "Access issue",
  "Other",
];

export interface AppointmentCancelRescheduleInput {
  appointmentId: string;
  reason: string;
  notes?: string | null;
  rescheduleRequested?: boolean;
  actor?: AuditActor;
}

export interface TechnicianWorkService {
  service: Service;
  serviceRecord?: ServiceRecord | null;
}

export interface TechnicianWorkVisit {
  appointment: Appointment;
  customer?: Customer | null;
  location?: Location | null;
  services: TechnicianWorkService[];
}

export interface OpportunityFilters {
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  serviceTypeId?: string;
}

export interface ApplyOpportunityDispositionInput {
  opportunityId: string;
  dispositionId: string;
  nextActionDate?: string | null;
  notes?: string | null;
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

  getBillingProfileTemplates(includeInactive?: boolean): Promise<BillingProfileTemplate[]>;
  createBillingProfileTemplate(data: InsertBillingProfileTemplate): Promise<BillingProfileTemplate>;
  updateBillingProfileTemplate(id: string, data: Partial<InsertBillingProfileTemplate>): Promise<BillingProfileTemplate | undefined>;

  getBillingProfilesForAccount(accountId: string): Promise<BillingProfile[]>;
  createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile>;
  updateBillingProfile(id: string, data: Partial<InsertBillingProfile>): Promise<BillingProfile | undefined>;
  resolveBillingProfileForLocation(locationId: string): Promise<BillingProfile | undefined>;

  getNotesByLocation(locationId: string): Promise<CustomerNote[]>;
  getSharedNotes(customerId: string): Promise<CustomerNote[]>;
  saveScopedNote(data: SaveScopedNoteInput): Promise<CustomerNote | null>;
  getNoteRevisions(noteId: string): Promise<NoteRevision[]>;

  getServiceTypes(): Promise<ServiceType[]>;
  createServiceType(data: InsertServiceType): Promise<ServiceType>;

  getTechnicians(includeInactive?: boolean): Promise<Technician[]>;
  createTechnician(data: InsertTechnician): Promise<Technician>;
  updateTechnician(id: string, data: Partial<InsertTechnician>): Promise<Technician | undefined>;

  getServices(): Promise<Service[]>;
  getServicesByLocation(locationId: string): Promise<Service[]>;
  getPendingServices(window?: DispatchBoardWindow): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(data: InsertService): Promise<Service>;
  updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined>;
  updateServiceType(id: string, data: Partial<InsertServiceType>): Promise<ServiceType | undefined>;
  deleteService(id: string): Promise<boolean>;
  getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]>;
  getOpportunitiesByLocation(locationId: string): Promise<Opportunity[]>;
  createOpportunity(data: InsertOpportunity): Promise<Opportunity>;
  updateOpportunity(id: string, data: Partial<InsertOpportunity>): Promise<Opportunity | undefined>;
  convertOpportunityToService(id: string, actor?: AuditActor): Promise<{ opportunity: Opportunity; service: Service } | undefined>;
  getOpportunityDispositions(includeInactive?: boolean): Promise<OpportunityDisposition[]>;
  createOpportunityDisposition(data: InsertOpportunityDisposition): Promise<OpportunityDisposition>;
  updateOpportunityDisposition(id: string, data: Partial<InsertOpportunityDisposition>): Promise<OpportunityDisposition | undefined>;
  getOpportunityActivitiesByOpportunity(opportunityId: string): Promise<OpportunityActivity[]>;
  applyOpportunityDisposition(input: ApplyOpportunityDispositionInput): Promise<Opportunity | undefined>;

  getAgreementCancellationPolicies(includeInactive?: boolean): Promise<AgreementCancellationPolicy[]>;
  getAgreementCancellationPolicy(id: string): Promise<AgreementCancellationPolicy | undefined>;
  createAgreementCancellationPolicy(data: InsertAgreementCancellationPolicy): Promise<AgreementCancellationPolicy>;
  updateAgreementCancellationPolicy(id: string, data: Partial<InsertAgreementCancellationPolicy>): Promise<AgreementCancellationPolicy | undefined>;

  getBillingPlans(includeInactive?: boolean): Promise<BillingPlan[]>;
  getBillingPlan(id: string): Promise<BillingPlan | undefined>;
  createBillingPlan(data: InsertBillingPlan): Promise<BillingPlan>;
  updateBillingPlan(id: string, data: Partial<InsertBillingPlan>): Promise<BillingPlan | undefined>;
  resolveAgreementBillingPlanSnapshot(agreementId: string): Promise<Record<string, unknown> | null>;

  getAgreementTemplates(): Promise<AgreementTemplate[]>;
  getAgreementTemplate(id: string): Promise<AgreementTemplate | undefined>;
  createAgreementTemplate(data: InsertAgreementTemplate): Promise<AgreementTemplate>;
  updateAgreementTemplate(id: string, data: Partial<InsertAgreementTemplate>): Promise<AgreementTemplate | undefined>;

  getAgreementsByLocation(locationId: string): Promise<Agreement[]>;
  getAgreement(id: string): Promise<Agreement | undefined>;
  createAgreementFromTemplate(input: CreateAgreementFromTemplateInput): Promise<Agreement>;
  createAgreement(data: InsertAgreement, actor?: AuditActor): Promise<Agreement>;
  updateAgreement(id: string, data: Partial<InsertAgreement>, actor?: AuditActor): Promise<Agreement | undefined>;
  cancelAgreement(input: CancelAgreementInput): Promise<Agreement | undefined>;
  linkAgreementInitialAppointment(input: LinkAgreementInitialAppointmentInput): Promise<Agreement | undefined>;
  generateAgreementServicesForLocation(locationId: string): Promise<GenerateAgreementServicesResult>;

  getAppointments(): Promise<Appointment[]>;
  getAppointmentsByLocation(locationId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(data: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  requestAppointmentCancelOrReschedule(input: AppointmentCancelRescheduleInput): Promise<Appointment | undefined>;
  timeInAppointment(id: string): Promise<Appointment | undefined>;
  timeOutAppointment(id: string): Promise<Appointment | undefined>;
  getTechnicianWork(technicianId: string, date: string): Promise<TechnicianWorkVisit[]>;

  getServiceRecords(): Promise<ServiceRecord[]>;
  getServiceRecordsByLocation(locationId: string): Promise<ServiceRecord[]>;
  getServiceRecord(id: string): Promise<ServiceRecord | undefined>;
  createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord>;
  updateServiceRecord(id: string, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined>;
  completeService(input: CompleteServiceInput): Promise<CompleteServiceResult | undefined>;
  finalizeServiceRecord(id: string, actor?: AuditActor): Promise<ServiceRecord | undefined>;
  reopenServiceRecord(id: string, reason: string, actor?: AuditActor): Promise<ServiceRecord | undefined>;
  getServiceTimeTrackingMode(): Promise<ServiceTimeTrackingMode>;
  setServiceTimeTrackingMode(mode: ServiceTimeTrackingMode): Promise<AppSetting>;
  getAppointmentCancelReasons(): Promise<string[]>;
  setAppointmentCancelReasons(reasons: string[]): Promise<AppSetting>;

  getMaterialProducts(includeInactive?: boolean): Promise<MaterialProduct[]>;
  createMaterialProduct(data: InsertMaterialProduct): Promise<MaterialProduct>;
  updateMaterialProduct(id: string, data: Partial<InsertMaterialProduct>): Promise<MaterialProduct | undefined>;
  getTargetPests(includeInactive?: boolean): Promise<TargetPest[]>;
  createTargetPest(data: InsertTargetPest): Promise<TargetPest>;
  updateTargetPest(id: string, data: Partial<InsertTargetPest>): Promise<TargetPest | undefined>;
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

  getLocationScopedCounts(locationId: string): Promise<{ contacts: number; appointments: number; agreements: number; services: number; invoices: number; communications: number; opportunities: number }>;
}

function normalizeDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function calculateDurationMinutes(start: Date | string | null | undefined, end: Date | string | null | undefined): number | null {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.max(Math.round((endMs - startMs) / 60000), 0);
}

function normalizeServiceTimeTrackingMode(value: string | null | undefined): ServiceTimeTrackingMode {
  if (value === "PROMPT_FOR_TIMEOUT" || value === "MANUAL_TIMEOUT" || value === "AUTO_TIMEOUT_ON_TICKET_POST") {
    return value;
  }
  return "AUTO_TIMEOUT_ON_TICKET_POST";
}

function normalizeAppointmentCancelReasons(value: string | null | undefined): string[] {
  if (!value) return DEFAULT_APPOINTMENT_CANCEL_REASONS;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const reasons = parsed
        .map((reason) => String(reason || "").trim())
        .filter(Boolean);
      return reasons.length ? Array.from(new Set(reasons)) : DEFAULT_APPOINTMENT_CANCEL_REASONS;
    }
  } catch {
    const reasons = value
      .split(/\r?\n|,/)
      .map((reason) => reason.trim())
      .filter(Boolean);
    return reasons.length ? Array.from(new Set(reasons)) : DEFAULT_APPOINTMENT_CANCEL_REASONS;
  }

  return DEFAULT_APPOINTMENT_CANCEL_REASONS;
}

function addDays(dateOnly: string, days: number) {
  const next = new Date(`${dateOnly}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function addMonths(dateOnly: string, months: number) {
  const next = new Date(`${dateOnly}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString().slice(0, 10);
}

function advanceAgreementDate(dateOnly: string, recurrenceUnit: string, recurrenceInterval: number) {
  const step = Math.max(recurrenceInterval || 1, 1);

  switch (recurrenceUnit) {
    case "QUARTER":
      return addMonths(dateOnly, step * 3);
    case "YEAR":
      return addMonths(dateOnly, step * 12);
    case "CUSTOM":
      return addDays(dateOnly, step);
    case "MONTH":
    default:
      return addMonths(dateOnly, step);
  }
}

function resolveAgreementStartDateFromValues(
  dateOnly: string,
  termUnit: string,
  termInterval: number,
  recurrenceUnit: string,
  recurrenceInterval: number,
) {
  return {
    startDate: dateOnly,
    renewalDate: advanceAgreementDate(dateOnly, termUnit, termInterval),
    nextServiceDate: advanceAgreementDate(dateOnly, recurrenceUnit, recurrenceInterval),
  };
}

export class DatabaseStorage implements IStorage {
  constructor(private readonly orgId: string) {}

  private isPlaceholderLocation(location: { name: string; notes: string | null }) {
    return location.name === PLACEHOLDER_LOCATION_NAME && location.notes === PLACEHOLDER_LOCATION_NOTE;
  }

  private async ensureAccountForLegacyCustomer(legacyCustomerId: string): Promise<Account> {
    const [existing] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, this.orgId), eq(accounts.legacyCustomerId, legacyCustomerId)));

    if (existing) {
      return existing;
    }

    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, legacyCustomerId)));
    const [created] = await db
      .insert(accounts)
      .values({
        orgId: this.orgId,
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
    const [location] = await db.select({ accountId: locations.accountId }).from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    return location?.accountId ?? null;
  }

  private async getNextNoteRevisionNumber(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    noteId: string,
  ): Promise<number> {
    const existing = await tx.select({ revisionNumber: noteRevisions.revisionNumber }).from(noteRevisions).where(and(eq(noteRevisions.orgId, this.orgId), eq(noteRevisions.noteId, noteId)));
    const currentMax = existing.reduce((max, revision) => Math.max(max, revision.revisionNumber), 0);
    return currentMax + 1;
  }

  private async ensurePrimaryLocationInvariant(accountId: string, preferredLocationId?: string): Promise<void> {
    const relatedLocations = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.accountId, accountId)));
    if (relatedLocations.length === 0) {
      await db.update(accounts).set({ primaryLocationId: null, updatedAt: new Date() }).where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, accountId)));
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

    await db.update(locations).set({ isPrimary: false }).where(and(eq(locations.orgId, this.orgId), eq(locations.accountId, accountId)));
    await db.update(locations).set({ isPrimary: true }).where(and(eq(locations.orgId, this.orgId), eq(locations.id, primaryCandidate.id)));
    await db
      .update(accounts)
      .set({ primaryLocationId: primaryCandidate.id, updatedAt: new Date() })
      .where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, accountId)));
  }

  private normalizeAgreementInsert(data: InsertAgreement, actor?: AuditActor): InsertAgreement {
    const contractUrl = data.contractUrl?.trim() || null;

    return {
      ...data,
      agreementTemplateId: data.agreementTemplateId || null,
      cancellationPolicyId: data.cancellationPolicyId || null,
      cancellationPolicySnapshot: data.cancellationPolicySnapshot ?? null,
      billingPlanId: data.billingPlanId || null,
      billingPlanSnapshot: data.billingPlanSnapshot ?? null,
      initialAppointmentId: data.initialAppointmentId || null,
      startDateSource: data.startDateSource || "MANUAL",
      agreementName: data.agreementName.trim(),
      agreementType: data.agreementType?.trim() || null,
      startDate: normalizeDateOnly(data.startDate)!,
      termUnit: data.termUnit || "YEAR",
      termInterval: Math.max(data.termInterval || 1, 1),
      renewalDate: normalizeDateOnly(data.renewalDate),
      nextServiceDate: normalizeDateOnly(data.nextServiceDate)!,
      billingFrequency: data.billingFrequency?.trim() || null,
      priceCents: data.priceCents ?? null,
      recurrenceUnit: data.recurrenceUnit,
      recurrenceInterval: Math.max(data.recurrenceInterval || 1, 1),
      generationLeadDays: Math.max(data.generationLeadDays || 0, 0),
      serviceWindowDays: data.serviceWindowDays ?? null,
      schedulingMode: data.schedulingMode || "MANUAL",
      serviceTypeId: data.serviceTypeId || null,
      serviceTemplateName: data.serviceTemplateName?.trim() || null,
      defaultDurationMinutes: data.defaultDurationMinutes ?? null,
      serviceInstructions: data.serviceInstructions?.trim() || null,
      contractUrl,
      contractUploadedAt: contractUrl ? data.contractUploadedAt ?? new Date() : null,
      contractSignedAt: data.contractSignedAt ?? null,
      notes: data.notes?.trim() || null,
      cancelledAt: data.cancelledAt ?? null,
      cancellationReason: data.cancellationReason?.trim() || null,
      cancellationNotes: data.cancellationNotes?.trim() || null,
      cancellationEffectiveDate: normalizeDateOnly(data.cancellationEffectiveDate),
      cancellationFeeType: data.cancellationFeeType || null,
      cancellationFeeAmountCents: data.cancellationFeeAmountCents ?? null,
      cancellationOverrideApplied: data.cancellationOverrideApplied ?? false,
      cancellationOverrideReason: data.cancellationOverrideReason?.trim() || null,
      cancellationOverrideByUserId: data.cancellationOverrideByUserId || null,
      cancellationOverrideByLabel: data.cancellationOverrideByLabel?.trim() || null,
      cancellationOverrideAt: data.cancellationOverrideAt ?? null,
      createdByUserId: actor?.userId || data.createdByUserId || null,
      updatedByUserId: actor?.userId || data.updatedByUserId || null,
    };
  }

  private normalizeAgreementUpdate(data: Partial<InsertAgreement>, actor?: AuditActor): Partial<InsertAgreement> {
    const payload: Partial<InsertAgreement> = {
      ...data,
      updatedByUserId: actor?.userId || data.updatedByUserId || null,
    };

    if (data.agreementName !== undefined) payload.agreementName = data.agreementName.trim();
    if (data.agreementTemplateId !== undefined) payload.agreementTemplateId = data.agreementTemplateId || null;
    if (data.cancellationPolicyId !== undefined) payload.cancellationPolicyId = data.cancellationPolicyId || null;
    if (data.cancellationPolicySnapshot !== undefined) payload.cancellationPolicySnapshot = data.cancellationPolicySnapshot ?? null;
    if (data.billingPlanId !== undefined) payload.billingPlanId = data.billingPlanId || null;
    if (data.billingPlanSnapshot !== undefined) payload.billingPlanSnapshot = data.billingPlanSnapshot ?? null;
    if (data.initialAppointmentId !== undefined) payload.initialAppointmentId = data.initialAppointmentId || null;
    if (data.startDateSource !== undefined) payload.startDateSource = data.startDateSource || "MANUAL";
    if (data.agreementType !== undefined) payload.agreementType = data.agreementType?.trim() || null;
    if (data.startDate !== undefined) payload.startDate = normalizeDateOnly(data.startDate as any) as any;
    if (data.termUnit !== undefined) payload.termUnit = data.termUnit || "YEAR";
    if (data.termInterval !== undefined) payload.termInterval = Math.max(data.termInterval || 1, 1);
    if (data.renewalDate !== undefined) payload.renewalDate = normalizeDateOnly(data.renewalDate as any) as any;
    if (data.nextServiceDate !== undefined) payload.nextServiceDate = normalizeDateOnly(data.nextServiceDate as any) as any;
    if (data.billingFrequency !== undefined) payload.billingFrequency = data.billingFrequency?.trim() || null;
    if (data.recurrenceUnit !== undefined) payload.recurrenceUnit = data.recurrenceUnit || "MONTH";
    if (data.recurrenceInterval !== undefined) payload.recurrenceInterval = Math.max(data.recurrenceInterval || 1, 1);
    if (data.generationLeadDays !== undefined) payload.generationLeadDays = Math.max(data.generationLeadDays || 0, 0);
    if (data.serviceWindowDays !== undefined) payload.serviceWindowDays = data.serviceWindowDays ?? null;
    if (data.schedulingMode !== undefined) payload.schedulingMode = data.schedulingMode || "MANUAL";
    if (data.serviceTypeId !== undefined) payload.serviceTypeId = data.serviceTypeId || null;
    if (data.defaultDurationMinutes !== undefined) payload.defaultDurationMinutes = data.defaultDurationMinutes ?? null;
    if (data.priceCents !== undefined) payload.priceCents = data.priceCents ?? null;
    if (data.serviceTemplateName !== undefined) payload.serviceTemplateName = data.serviceTemplateName?.trim() || null;
    if (data.serviceInstructions !== undefined) payload.serviceInstructions = data.serviceInstructions?.trim() || null;
    if (data.notes !== undefined) payload.notes = data.notes?.trim() || null;
    if (data.cancelledAt !== undefined) payload.cancelledAt = data.cancelledAt ?? null;
    if (data.cancellationReason !== undefined) payload.cancellationReason = data.cancellationReason?.trim() || null;
    if (data.cancellationNotes !== undefined) payload.cancellationNotes = data.cancellationNotes?.trim() || null;
    if (data.cancellationEffectiveDate !== undefined) payload.cancellationEffectiveDate = normalizeDateOnly(data.cancellationEffectiveDate as any) as any;
    if (data.cancellationFeeType !== undefined) payload.cancellationFeeType = data.cancellationFeeType || null;
    if (data.cancellationFeeAmountCents !== undefined) payload.cancellationFeeAmountCents = data.cancellationFeeAmountCents ?? null;
    if (data.cancellationOverrideApplied !== undefined) payload.cancellationOverrideApplied = data.cancellationOverrideApplied ?? false;
    if (data.cancellationOverrideReason !== undefined) payload.cancellationOverrideReason = data.cancellationOverrideReason?.trim() || null;
    if (data.cancellationOverrideByUserId !== undefined) payload.cancellationOverrideByUserId = data.cancellationOverrideByUserId || null;
    if (data.cancellationOverrideByLabel !== undefined) payload.cancellationOverrideByLabel = data.cancellationOverrideByLabel?.trim() || null;
    if (data.cancellationOverrideAt !== undefined) payload.cancellationOverrideAt = data.cancellationOverrideAt ?? null;
    if (data.contractUrl !== undefined) {
      const contractUrl = data.contractUrl?.trim() || null;
      payload.contractUrl = contractUrl;
      payload.contractUploadedAt = contractUrl ? data.contractUploadedAt ?? new Date() : null;
    }

    return payload;
  }

  private normalizeAgreementTemplateInsert(data: InsertAgreementTemplate): InsertAgreementTemplate {
    return {
      ...data,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      cancellationPolicyId: data.cancellationPolicyId || null,
      defaultAgreementType: data.defaultAgreementType?.trim() || null,
      defaultBillingFrequency: data.defaultBillingFrequency?.trim() || null,
      defaultTermUnit: data.defaultTermUnit || "YEAR",
      defaultTermInterval: Math.max(data.defaultTermInterval || 1, 1),
      defaultRecurrenceUnit: data.defaultRecurrenceUnit,
      defaultRecurrenceInterval: Math.max(data.defaultRecurrenceInterval || 1, 1),
      defaultGenerationLeadDays: Math.max(data.defaultGenerationLeadDays || 0, 0),
      defaultServiceWindowDays: data.defaultServiceWindowDays ?? null,
      defaultSchedulingMode: data.defaultSchedulingMode || "MANUAL",
      defaultServiceTypeId: data.defaultServiceTypeId || null,
      defaultServiceTemplateName: data.defaultServiceTemplateName?.trim() || null,
      defaultDurationMinutes: data.defaultDurationMinutes ?? null,
      defaultPriceCents: data.defaultPriceCents ?? null,
      defaultInstructions: data.defaultInstructions?.trim() || null,
      sortOrder: data.sortOrder ?? null,
      internalCode: data.internalCode?.trim() || null,
      isActive: data.isActive ?? true,
    };
  }

  private normalizeAgreementTemplateUpdate(data: Partial<InsertAgreementTemplate>): Partial<InsertAgreementTemplate> {
    const payload: Partial<InsertAgreementTemplate> = { ...data };
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.description !== undefined) payload.description = data.description?.trim() || null;
    if (data.cancellationPolicyId !== undefined) payload.cancellationPolicyId = data.cancellationPolicyId || null;
    if (data.defaultAgreementType !== undefined) payload.defaultAgreementType = data.defaultAgreementType?.trim() || null;
    if (data.defaultBillingFrequency !== undefined) payload.defaultBillingFrequency = data.defaultBillingFrequency?.trim() || null;
    if (data.defaultTermUnit !== undefined) payload.defaultTermUnit = data.defaultTermUnit || "YEAR";
    if (data.defaultTermInterval !== undefined) payload.defaultTermInterval = Math.max(data.defaultTermInterval || 1, 1);
    if (data.defaultRecurrenceUnit !== undefined) payload.defaultRecurrenceUnit = data.defaultRecurrenceUnit || "MONTH";
    if (data.defaultRecurrenceInterval !== undefined) payload.defaultRecurrenceInterval = Math.max(data.defaultRecurrenceInterval || 1, 1);
    if (data.defaultGenerationLeadDays !== undefined) payload.defaultGenerationLeadDays = Math.max(data.defaultGenerationLeadDays || 0, 0);
    if (data.defaultServiceWindowDays !== undefined) payload.defaultServiceWindowDays = data.defaultServiceWindowDays ?? null;
    if (data.defaultSchedulingMode !== undefined) payload.defaultSchedulingMode = data.defaultSchedulingMode || "MANUAL";
    if (data.defaultServiceTypeId !== undefined) payload.defaultServiceTypeId = data.defaultServiceTypeId || null;
    if (data.defaultServiceTemplateName !== undefined) payload.defaultServiceTemplateName = data.defaultServiceTemplateName?.trim() || null;
    if (data.defaultDurationMinutes !== undefined) payload.defaultDurationMinutes = data.defaultDurationMinutes ?? null;
    if (data.defaultPriceCents !== undefined) payload.defaultPriceCents = data.defaultPriceCents ?? null;
    if (data.defaultInstructions !== undefined) payload.defaultInstructions = data.defaultInstructions?.trim() || null;
    if (data.internalCode !== undefined) payload.internalCode = data.internalCode?.trim() || null;
    return payload;
  }

  private normalizeAgreementCancellationPolicyInsert(data: InsertAgreementCancellationPolicy): InsertAgreementCancellationPolicy {
    return {
      ...data,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      isActive: data.isActive ?? true,
      cancellationFeeType: data.cancellationFeeType || "NONE",
      cancellationFeeAmountCents: data.cancellationFeeType === "NONE" ? null : data.cancellationFeeAmountCents ?? null,
      noticeDays: Math.max(data.noticeDays || 0, 0),
      effectiveDateMode: data.effectiveDateMode || "IMMEDIATE",
      cancelPendingServicesDefault: data.cancelPendingServicesDefault ?? true,
      cancelScheduledAppointmentsDefault: data.cancelScheduledAppointmentsDefault ?? false,
      closeOpenOpportunitiesDefault: data.closeOpenOpportunitiesDefault ?? false,
      createRetentionOpportunityDefault: data.createRetentionOpportunityDefault ?? false,
      defaultRetentionFollowUpDays: data.defaultRetentionFollowUpDays ?? null,
      allowManagerOverride: data.allowManagerOverride ?? false,
      requiresOverrideReason: data.requiresOverrideReason ?? false,
      termsSummary: data.termsSummary?.trim() || null,
    };
  }

  private normalizeAgreementCancellationPolicyUpdate(data: Partial<InsertAgreementCancellationPolicy>): Partial<InsertAgreementCancellationPolicy> {
    const payload: Partial<InsertAgreementCancellationPolicy> = { ...data };
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.description !== undefined) payload.description = data.description?.trim() || null;
    if (data.cancellationFeeType !== undefined) payload.cancellationFeeType = data.cancellationFeeType || "NONE";
    if (data.cancellationFeeAmountCents !== undefined) payload.cancellationFeeAmountCents = data.cancellationFeeAmountCents ?? null;
    if (data.cancellationFeeType === "NONE" && data.cancellationFeeAmountCents === undefined) payload.cancellationFeeAmountCents = null;
    if (data.noticeDays !== undefined) payload.noticeDays = Math.max(data.noticeDays || 0, 0);
    if (data.effectiveDateMode !== undefined) payload.effectiveDateMode = data.effectiveDateMode || "IMMEDIATE";
    if (data.defaultRetentionFollowUpDays !== undefined) payload.defaultRetentionFollowUpDays = data.defaultRetentionFollowUpDays ?? null;
    if (data.termsSummary !== undefined) payload.termsSummary = data.termsSummary?.trim() || null;
    return payload;
  }

  private buildCancellationPolicySnapshot(policy?: AgreementCancellationPolicy | null) {
    if (!policy) return null;
    return {
      policyId: policy.id,
      name: policy.name,
      cancellationFeeType: policy.cancellationFeeType,
      cancellationFeeAmountCents: policy.cancellationFeeAmountCents,
      noticeDays: policy.noticeDays,
      effectiveDateMode: policy.effectiveDateMode,
      cancelPendingServicesDefault: policy.cancelPendingServicesDefault,
      cancelScheduledAppointmentsDefault: policy.cancelScheduledAppointmentsDefault,
      closeOpenOpportunitiesDefault: policy.closeOpenOpportunitiesDefault,
      createRetentionOpportunityDefault: policy.createRetentionOpportunityDefault,
      defaultRetentionFollowUpDays: policy.defaultRetentionFollowUpDays,
      allowManagerOverride: policy.allowManagerOverride,
      requiresOverrideReason: policy.requiresOverrideReason,
      termsSummary: policy.termsSummary,
      snapshottedAt: new Date().toISOString(),
    };
  }

  private buildBillingPlanSnapshot(plan?: BillingPlan | null) {
    if (!plan) return null;
    return {
      planId: plan.id,
      name: plan.name,
      chargeTrigger: plan.chargeTrigger,
      billingMode: plan.billingMode,
      intervalUnit: plan.intervalUnit,
      intervalCount: plan.intervalCount,
      installmentCount: plan.installmentCount,
      anchorMode: plan.anchorMode,
      anchorDay: plan.anchorDay,
      prorationRule: plan.prorationRule,
      initialChargeType: plan.initialChargeType,
      initialChargeCents: plan.initialChargeCents,
      initialChargeCoversFirstPeriod: plan.initialChargeCoversFirstPeriod,
      initialChargeCollectedBy: plan.initialChargeCollectedBy,
      fieldAddableSurcharge: plan.fieldAddableSurcharge,
      snapshottedAt: new Date().toISOString(),
    };
  }

  private normalizeTechnicianInsert(data: InsertTechnician): InsertTechnician {
    return {
      ...data,
      displayName: data.displayName.trim(),
      licenseId: data.licenseId.trim(),
      status: data.status || "ACTIVE",
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      color: data.color?.trim() || null,
      notes: data.notes?.trim() || null,
    };
  }

  private normalizeTechnicianUpdate(data: Partial<InsertTechnician>): Partial<InsertTechnician> {
    const payload: Partial<InsertTechnician> = { ...data };
    if (data.displayName !== undefined) payload.displayName = data.displayName.trim();
    if (data.licenseId !== undefined) payload.licenseId = data.licenseId.trim();
    if (data.email !== undefined) payload.email = data.email?.trim() || null;
    if (data.phone !== undefined) payload.phone = data.phone?.trim() || null;
    if (data.color !== undefined) payload.color = data.color?.trim() || null;
    if (data.notes !== undefined) payload.notes = data.notes?.trim() || null;
    return payload;
  }

  private normalizeServiceInsert(data: InsertService): InsertService {
    return {
      ...data,
      appointmentId: data.appointmentId || null,
      agreementId: data.agreementId || null,
      serviceTypeId: data.serviceTypeId || null,
      dueDate: normalizeDateOnly(data.dueDate),
      generatedForDate: normalizeDateOnly(data.generatedForDate),
      serviceWindowStart: normalizeDateOnly(data.serviceWindowStart),
      serviceWindowEnd: normalizeDateOnly(data.serviceWindowEnd),
      timeWindow: data.timeWindow?.trim() || null,
      expectedDurationMinutes: data.expectedDurationMinutes ?? null,
      priceCents: data.priceCents ?? null,
      status: data.status || "PENDING_SCHEDULING",
      assignedTechnicianId: data.assignedTechnicianId || null,
      source: data.source || "MANUAL",
      schedulingMode: data.schedulingMode || null,
      notes: data.notes?.trim() || null,
    };
  }

  private normalizeServiceUpdate(data: Partial<InsertService>): Partial<InsertService> {
    const payload: Partial<InsertService> = { ...data };
    if (data.appointmentId !== undefined) payload.appointmentId = data.appointmentId || null;
    if (data.agreementId !== undefined) payload.agreementId = data.agreementId || null;
    if (data.serviceTypeId !== undefined) payload.serviceTypeId = data.serviceTypeId || null;
    if (data.dueDate !== undefined) payload.dueDate = normalizeDateOnly(data.dueDate as any) as any;
    if (data.generatedForDate !== undefined) payload.generatedForDate = normalizeDateOnly(data.generatedForDate as any) as any;
    if (data.serviceWindowStart !== undefined) payload.serviceWindowStart = normalizeDateOnly(data.serviceWindowStart as any) as any;
    if (data.serviceWindowEnd !== undefined) payload.serviceWindowEnd = normalizeDateOnly(data.serviceWindowEnd as any) as any;
    if (data.timeWindow !== undefined) payload.timeWindow = data.timeWindow?.trim() || null;
    if (data.expectedDurationMinutes !== undefined) payload.expectedDurationMinutes = data.expectedDurationMinutes ?? null;
    if (data.priceCents !== undefined) payload.priceCents = data.priceCents ?? null;
    if (data.assignedTechnicianId !== undefined) payload.assignedTechnicianId = data.assignedTechnicianId || null;
    if (data.schedulingMode !== undefined) payload.schedulingMode = data.schedulingMode || null;
    if (data.notes !== undefined) payload.notes = data.notes?.trim() || null;
    return payload;
  }

  private async getLinkedServicesForAppointmentTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    appointmentId: string,
    legacyRepresentativeServiceId?: string | null,
  ) {
    const linkedServices = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.appointmentId, appointmentId)));
    if (!legacyRepresentativeServiceId) {
      return linkedServices;
    }

    const hasRepresentative = linkedServices.some((service) => service.id === legacyRepresentativeServiceId);
    if (hasRepresentative) {
      return linkedServices;
    }

    const [legacyRepresentative] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, legacyRepresentativeServiceId)));
    return legacyRepresentative ? [...linkedServices, legacyRepresentative] : linkedServices;
  }

  private async syncServicesForAppointmentTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    appointment: Appointment,
  ) {
    const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId);
    if (!linkedServices.length) {
      return;
    }

    const nextStatus = appointment.status === "canceled"
        ? "CANCELLED"
        : "SCHEDULED";

    await tx
      .update(services)
      .set({
        status: nextStatus,
        assignedTechnicianId: appointment.assignedTechnicianId || null,
        appointmentId: appointment.id,
        updatedAt: new Date(),
      })
      .where(and(eq(services.orgId, this.orgId), inArray(services.id, linkedServices.map((service) => service.id))));
  }

  private async resolveServiceRecordTechnicianSnapshot(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    data: InsertServiceRecord | Partial<InsertServiceRecord>,
    existingRecord?: ServiceRecord,
  ) {
    let technicianId = data.technicianId ?? existingRecord?.technicianId ?? null;

    const serviceId = data.serviceId ?? existingRecord?.serviceId;
    const appointmentId = data.appointmentId ?? existingRecord?.appointmentId;

    if (!technicianId && serviceId) {
      const [linkedService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, serviceId)));
      technicianId = linkedService?.assignedTechnicianId || null;
    }

    if (!technicianId && appointmentId) {
      const [linkedAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
      technicianId = linkedAppointment?.assignedTechnicianId || null;
    }

    const technician = technicianId
      ? (await tx.select().from(technicians).where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, technicianId))))[0]
      : undefined;

    return {
      technicianId,
      technicianName: data.technicianName ?? existingRecord?.technicianName ?? technician?.displayName ?? null,
      technicianLicenseNumber: (data as InsertServiceRecord).technicianLicenseNumber ?? existingRecord?.technicianLicenseNumber ?? technician?.licenseId ?? null,
      notes: data.notes !== undefined ? data.notes?.trim() || null : existingRecord?.notes ?? null,
    };
  }

  private async ensureOpportunityForServiceRecordTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    serviceRecord: ServiceRecord,
  ) {
    if (!serviceRecord.serviceId) {
      return;
    }

    const [linkedService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, serviceRecord.serviceId)));
    if (!linkedService || linkedService.agreementId) {
      return;
    }

    const [serviceType] = linkedService.serviceTypeId
      ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, linkedService.serviceTypeId)))
      : [undefined];

    const leadDays = serviceType?.opportunityLeadDays ?? null;
    if (!leadDays || leadDays < 1) {
      return;
    }

    const [existingOpportunity] = await tx
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.sourceServiceRecordId, serviceRecord.id)));

    if (existingOpportunity) {
      return;
    }

    await tx.insert(opportunities).values({
      orgId: this.orgId,
      locationId: serviceRecord.locationId || linkedService.locationId,
      sourceServiceId: linkedService.id,
      sourceServiceRecordId: serviceRecord.id,
      serviceTypeId: linkedService.serviceTypeId || null,
      opportunityType: serviceType?.opportunityLabel || serviceType?.name || "Service Opportunity",
      dueDate: addDays(new Date(serviceRecord.serviceDate).toISOString().slice(0, 10), leadDays),
      status: "OPEN",
      notes: linkedService.notes || null,
    });
  }

  private async buildAgreementInsertFromTemplate(input: CreateAgreementFromTemplateInput): Promise<InsertAgreement> {
    const template = input.agreementTemplateId ? await this.getAgreementTemplate(input.agreementTemplateId) : undefined;
    const policyId = input.agreement.cancellationPolicyId ?? template?.cancellationPolicyId ?? null;
    const policy = policyId ? await this.getAgreementCancellationPolicy(policyId) : undefined;
    const billingPlanId = input.agreement.billingPlanId ?? template?.billingPlanId ?? null;
    const billingPlan = billingPlanId ? await this.getBillingPlan(billingPlanId) : undefined;
    const agreementData = input.agreement;

    return {
      customerId: agreementData.customerId,
      locationId: agreementData.locationId,
      agreementTemplateId: template?.id ?? agreementData.agreementTemplateId ?? null,
      cancellationPolicyId: policy?.id ?? policyId ?? null,
      cancellationPolicySnapshot: agreementData.cancellationPolicySnapshot ?? this.buildCancellationPolicySnapshot(policy),
      billingPlanId: billingPlan?.id ?? billingPlanId ?? null,
      billingPlanSnapshot: agreementData.billingPlanSnapshot ?? this.buildBillingPlanSnapshot(billingPlan),
      initialAppointmentId: agreementData.initialAppointmentId ?? null,
      startDateSource: agreementData.startDateSource ?? "MANUAL",
      agreementName: agreementData.agreementName ?? template?.name ?? "Agreement",
      status: agreementData.status,
      agreementType: agreementData.agreementType ?? template?.defaultAgreementType ?? null,
      startDate: agreementData.startDate,
      termUnit: agreementData.termUnit ?? template?.defaultTermUnit ?? "YEAR",
      termInterval: agreementData.termInterval ?? template?.defaultTermInterval ?? 1,
      renewalDate: agreementData.renewalDate ?? null,
      nextServiceDate: agreementData.nextServiceDate,
      billingFrequency: agreementData.billingFrequency ?? template?.defaultBillingFrequency ?? null,
      priceCents: agreementData.priceCents ?? template?.defaultPriceCents ?? null,
      recurrenceUnit: agreementData.recurrenceUnit ?? template?.defaultRecurrenceUnit ?? "MONTH",
      recurrenceInterval: agreementData.recurrenceInterval ?? template?.defaultRecurrenceInterval ?? 1,
      generationLeadDays: agreementData.generationLeadDays ?? template?.defaultGenerationLeadDays ?? 14,
      serviceWindowDays: agreementData.serviceWindowDays ?? template?.defaultServiceWindowDays ?? null,
      schedulingMode: agreementData.schedulingMode ?? template?.defaultSchedulingMode ?? "MANUAL",
      serviceTypeId: agreementData.serviceTypeId ?? template?.defaultServiceTypeId ?? null,
      serviceTemplateName: agreementData.serviceTemplateName ?? template?.defaultServiceTemplateName ?? null,
      defaultDurationMinutes: agreementData.defaultDurationMinutes ?? template?.defaultDurationMinutes ?? null,
      serviceInstructions: agreementData.serviceInstructions ?? template?.defaultInstructions ?? null,
      contractUrl: agreementData.contractUrl ?? null,
      contractUploadedAt: agreementData.contractUploadedAt ?? null,
      contractSignedAt: agreementData.contractSignedAt ?? null,
      notes: agreementData.notes ?? null,
      createdByUserId: input.actor?.userId || null,
      updatedByUserId: input.actor?.userId || null,
    };
  }

  private async getAgreementStartDateFromAppointment(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    appointmentId: string,
  ): Promise<string | null> {
    const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
    if (!appointment) {
      return null;
    }

    const [serviceRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.appointmentId, appointmentId)));
    return normalizeDateOnly(serviceRecord?.serviceDate) || normalizeDateOnly(appointment.scheduledDate);
  }

  private async syncAgreementInitialAppointmentDates(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    agreementId: string,
    actor?: AuditActor,
  ) {
    const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreementId)));
    if (!agreement?.initialAppointmentId) {
      return agreement;
    }

    const startDate = await this.getAgreementStartDateFromAppointment(tx, agreement.initialAppointmentId);
    if (!startDate) {
      return agreement;
    }

    const nextDates = resolveAgreementStartDateFromValues(
      startDate,
      agreement.termUnit,
      agreement.termInterval,
      agreement.recurrenceUnit,
      agreement.recurrenceInterval,
    );

    const [updatedAgreement] = await tx
      .update(agreements)
      .set({
        initialAppointmentId: agreement.initialAppointmentId,
        startDateSource: "INITIAL_APPOINTMENT",
        startDate: nextDates.startDate as any,
        renewalDate: nextDates.renewalDate as any,
        nextServiceDate: nextDates.nextServiceDate as any,
        updatedAt: new Date(),
        updatedByUserId: actor?.userId || agreement.updatedByUserId || null,
      })
      .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)))
      .returning();

    return updatedAgreement;
  }

  private async ensureAgreementContactRequiredOpportunityTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    agreement: Agreement,
    service: Service,
    cycleDate: string,
  ) {
    if (agreement.schedulingMode !== "CONTACT_REQUIRED") {
      return;
    }

    const [existingOpportunity] = await tx
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.orgId, this.orgId),
        eq(opportunities.sourceServiceId, service.id),
        eq(opportunities.source, "AGREEMENT_CONTACT_REQUIRED"),
      ));

    if (existingOpportunity) {
      return;
    }

    await tx.insert(opportunities).values({
      orgId: this.orgId,
      locationId: agreement.locationId,
      agreementId: agreement.id,
      sourceServiceId: service.id,
      serviceTypeId: agreement.serviceTypeId || null,
      source: "AGREEMENT_CONTACT_REQUIRED",
      opportunityType: agreement.serviceTemplateName || agreement.agreementName || "Agreement Service Contact",
      dueDate: cycleDate as any,
      nextActionDate: cycleDate as any,
      status: "OPEN",
      notes: [agreement.serviceInstructions, agreement.notes].filter((value): value is string => !!value?.trim()).join("\n\n") || null,
    });
  }

  private async generateServiceForAgreement(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    agreement: Agreement,
  ): Promise<Service | null> {
    if (agreement.status !== "ACTIVE") {
      return null;
    }

    const nextServiceDate = normalizeDateOnly(agreement.nextServiceDate);
    if (!nextServiceDate) {
      return null;
    }

    const generationThreshold = addDays(nextServiceDate, -Math.max(agreement.generationLeadDays || 0, 0));
    const today = new Date().toISOString().slice(0, 10);
    if (today < generationThreshold) {
      return null;
    }

    const existingServices = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.agreementId, agreement.id)));
    let serviceForCycle = existingServices.find((service) => {
      const generatedForDate = normalizeDateOnly(service.generatedForDate) || normalizeDateOnly(service.dueDate);
      return generatedForDate === nextServiceDate && service.status !== "CANCELLED";
    });
    const serviceWindowStart = nextServiceDate;
    const serviceWindowEnd = agreement.serviceWindowDays && agreement.serviceWindowDays > 0
      ? addDays(nextServiceDate, agreement.serviceWindowDays)
      : nextServiceDate;

    if (serviceForCycle) {
      const [updatedServiceForCycle] = await tx
        .update(services)
        .set({
          generatedForDate: (serviceForCycle.generatedForDate || nextServiceDate) as any,
          serviceWindowStart: (serviceForCycle.serviceWindowStart || serviceWindowStart) as any,
          serviceWindowEnd: (serviceForCycle.serviceWindowEnd || serviceWindowEnd) as any,
          schedulingMode: serviceForCycle.schedulingMode || agreement.schedulingMode || "MANUAL",
          updatedAt: new Date(),
        })
        .where(and(eq(services.orgId, this.orgId), eq(services.id, serviceForCycle.id)))
        .returning();
      serviceForCycle = updatedServiceForCycle ?? serviceForCycle;
      await this.ensureAgreementContactRequiredOpportunityTx(tx, agreement, serviceForCycle, nextServiceDate);
      return null;
    }

    const [createdService] = await tx.insert(services).values({
      orgId: this.orgId,
      customerId: agreement.customerId,
      locationId: agreement.locationId,
      agreementId: agreement.id,
      serviceTypeId: agreement.serviceTypeId,
      dueDate: nextServiceDate as any,
      generatedForDate: nextServiceDate as any,
      serviceWindowStart: serviceWindowStart as any,
      serviceWindowEnd: serviceWindowEnd as any,
      expectedDurationMinutes: agreement.defaultDurationMinutes ?? null,
      priceCents: agreement.priceCents ?? null,
      status: "PENDING_SCHEDULING",
      assignedTechnicianId: null,
      source: "AGREEMENT_GENERATED",
      schedulingMode: agreement.schedulingMode || "MANUAL",
      notes: [agreement.serviceTemplateName, agreement.serviceInstructions, agreement.notes].filter((value): value is string => !!value?.trim()).join("\n\n") || null,
    }).returning();

    await this.ensureAgreementContactRequiredOpportunityTx(tx, agreement, createdService, nextServiceDate);
    return createdService;
  }

  private async advanceAgreementForCompletedAppointment(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    appointment: Appointment,
  ) {
    if (!appointment.agreementId || appointment.source !== "AGREEMENT_GENERATED") {
      return;
    }

    const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, appointment.agreementId)));
    if (!agreement) {
      return;
    }

    const cycleDate = normalizeDateOnly(appointment.generatedForDate) || normalizeDateOnly(agreement.nextServiceDate);
    if (!cycleDate) {
      return;
    }

    const nextServiceDate = advanceAgreementDate(cycleDate, agreement.recurrenceUnit, agreement.recurrenceInterval);

    await tx.update(agreements).set({
      nextServiceDate: nextServiceDate as any,
      updatedAt: new Date(),
    }).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)));

    const [updatedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)));
    if (updatedAgreement) {
      await this.generateServiceForAgreement(tx, updatedAgreement);
    }
  }

  private async advanceAgreementForCompletedService(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    service: Service,
  ) {
    if (!service.agreementId || service.source !== "AGREEMENT_GENERATED") {
      return;
    }

    const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, service.agreementId)));
    if (!agreement) {
      return;
    }

    const cycleDate = normalizeDateOnly(service.generatedForDate) || normalizeDateOnly(service.dueDate) || normalizeDateOnly(agreement.nextServiceDate);
    if (!cycleDate || normalizeDateOnly(agreement.nextServiceDate) !== cycleDate) {
      return;
    }

    const nextServiceDate = advanceAgreementDate(cycleDate, agreement.recurrenceUnit, agreement.recurrenceInterval);

    await tx.update(agreements).set({
      nextServiceDate: nextServiceDate as any,
      updatedAt: new Date(),
    }).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)));

    const [updatedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)));
    if (updatedAgreement) {
      await this.generateServiceForAgreement(tx, updatedAgreement);
    }
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).where(eq(customers.orgId, this.orgId));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, id)));
    return customer;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values({ ...data, orgId: this.orgId }).returning();
    await this.ensureAccountForLegacyCustomer(customer.id);
    return customer;
  }

  async updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db.update(customers).set(data).where(and(eq(customers.orgId, this.orgId), eq(customers.id, id))).returning();
    return customer;
  }

  async createCustomerWithPrimaryLocation(input: CreateCustomerWithPrimaryLocationInput): Promise<Customer> {
    const createdCustomer = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({ ...input.customer, orgId: this.orgId }).returning();

      const [account] = await tx
        .insert(accounts)
        .values({
          orgId: this.orgId,
          legacyCustomerId: customer.id,
          status: customer.status || "active",
        })
        .returning();

      const [location] = await tx
        .insert(locations)
        .values({
          ...input.location,
          orgId: this.orgId,
          customerId: customer.id,
          accountId: account.id,
          isPrimary: true,
        })
        .returning();

      await tx
        .update(accounts)
        .set({ primaryLocationId: location.id, updatedAt: new Date() })
        .where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, account.id)));

      if (input.initialContact) {
        await tx.insert(contacts).values({
          ...input.initialContact,
          orgId: this.orgId,
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
      const [existingLocation] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      if (!existingLocation || existingLocation.customerId !== input.customerId) {
        return undefined;
      }

      const [existingCustomer] = await tx.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, input.customerId)));
      if (!existingCustomer) {
        return undefined;
      }

      const [updatedLocation] = await tx
        .update(locations)
        .set(input.location)
        .where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)))
        .returning();

      await tx.insert(auditLogs).values({
        orgId: this.orgId,
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
          .where(and(eq(customers.orgId, this.orgId), eq(customers.id, input.customerId)))
          .returning();
        updatedCustomer = customer;

        await tx.insert(auditLogs).values({
          orgId: this.orgId,
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
      .where(and(eq(customers.orgId, this.orgId), eq(customers.id, legacyCustomerId)));

    if (!legacyCustomer) {
      return undefined;
    }

    const accountId = await this.resolveAccountIdForLegacyCustomer(legacyCustomerId);
    const [account] = await db.select().from(accounts).where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, accountId)));
    if (!account) {
      return undefined;
    }

    const relatedLocations = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.accountId, account.id)));
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
      where account_id is null and org_id = ${this.orgId}
    `);

    const multiplePrimariesResult = await db.execute(sql`
      select count(*)::int as c
      from (
        select account_id
        from locations
        where account_id is not null and is_primary = true and org_id = ${this.orgId}
        group by account_id
        having count(*) > 1
      ) t
    `);

    const missingPrimaryResult = await db.execute(sql`
      select count(*)::int as c
      from accounts a
      left join locations l on l.account_id = a.id and l.is_primary = true and l.org_id = ${this.orgId}
      where a.org_id = ${this.orgId}
      group by a.id
      having count(l.id) = 0
    `);

    const accountPrimaryLocationMismatchResult = await db.execute(sql`
      select count(*)::int as c
      from accounts a
      left join locations l on l.id = a.primary_location_id
      where a.org_id = ${this.orgId}
        and (a.primary_location_id is null
        or l.id is null
        or l.account_id <> a.id)
    `);

    return {
      orphanedLocations: Number(orphanedLocationsResult.rows[0]?.c || 0),
      accountsWithMultiplePrimaries: Number(multiplePrimariesResult.rows[0]?.c || 0),
      accountsMissingPrimary: missingPrimaryResult.rows.length,
      accountPrimaryLocationMismatch: Number(accountPrimaryLocationMismatchResult.rows[0]?.c || 0),
    };
  }

  async getContacts(customerId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.customerId, customerId)));
  }

  async getContactsByLocation(locationId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, locationId)));
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const createdContact = await db.transaction(async (tx) => {
      const existingLocationContacts = data.locationId
        ? await tx.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, data.locationId)))
        : [];

      const shouldBePrimary = !!data.isPrimary || existingLocationContacts.length === 0;

      if (data.locationId && shouldBePrimary) {
        await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, data.locationId)));
      }

      const [contact] = await tx.insert(contacts).values({ ...data, orgId: this.orgId, isPrimary: shouldBePrimary }).returning();
      return contact;
    });

    return createdContact;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [existing] = await db.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, id)));
    if (!existing) {
      return undefined;
    }

    const nextLocationId = data.locationId ?? existing.locationId;
    const requestedPrimary = data.isPrimary ?? existing.isPrimary ?? false;

    return db.transaction(async (tx) => {
      if (nextLocationId && requestedPrimary) {
        await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, nextLocationId)));
      }

      const [updatedContact] = await tx
        .update(contacts)
        .set({ ...data, isPrimary: requestedPrimary })
        .where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, id)))
        .returning();

      return updatedContact;
    });
  }

  async setPrimaryContact(contactId: string): Promise<Contact | undefined> {
    const [existing] = await db.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, contactId)));
    if (!existing?.locationId) {
      return existing;
    }

    const updatedContact = await db.transaction(async (tx) => {
      await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, existing.locationId!)));
      const [contact] = await tx.update(contacts).set({ isPrimary: true }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, contactId))).returning();
      return contact;
    });

    return updatedContact;
  }

  async getLocations(customerId: string): Promise<Location[]> {
    return db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.customerId, customerId)));
  }

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.orgId, this.orgId));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [loc] = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, id)));
    return loc;
  }

  async createLocation(data: InsertLocation): Promise<Location> {
    const accountId = data.accountId || await this.resolveAccountIdForLegacyCustomer(data.customerId);
    const [location] = await db.insert(locations).values({ ...data, orgId: this.orgId, accountId }).returning();
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
          orgId: this.orgId,
          accountId,
        })
        .returning();

      if (input.initialContact) {
        await tx.insert(contacts).values({
          ...input.initialContact,
          orgId: this.orgId,
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
    const [existing] = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, id)));
    if (!existing) {
      return undefined;
    }

    const customerId = data.customerId || existing.customerId;
    const accountId = data.accountId || await this.resolveAccountIdForLegacyCustomer(customerId);
    const payload: Partial<InsertLocation> = { ...data, accountId };

    const [loc] = await db.update(locations).set(payload).where(and(eq(locations.orgId, this.orgId), eq(locations.id, id))).returning();
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
    const [targetLocation] = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    if (!targetLocation?.accountId) {
      return;
    }

    await this.ensurePrimaryLocationInvariant(targetLocation.accountId, locationId);
  }

  async getBillingProfileTemplates(includeInactive = false): Promise<BillingProfileTemplate[]> {
    if (includeInactive) {
      return db.select().from(billingProfileTemplates).where(eq(billingProfileTemplates.orgId, this.orgId)).orderBy(asc(billingProfileTemplates.sortOrder), asc(billingProfileTemplates.name));
    }
    return db.select().from(billingProfileTemplates).where(and(eq(billingProfileTemplates.orgId, this.orgId), eq(billingProfileTemplates.isActive, true))).orderBy(asc(billingProfileTemplates.sortOrder), asc(billingProfileTemplates.name));
  }

  async createBillingProfileTemplate(data: InsertBillingProfileTemplate): Promise<BillingProfileTemplate> {
    const [template] = await db.insert(billingProfileTemplates).values({ ...data, orgId: this.orgId }).returning();
    return template;
  }

  async updateBillingProfileTemplate(id: string, data: Partial<InsertBillingProfileTemplate>): Promise<BillingProfileTemplate | undefined> {
    const [template] = await db
      .update(billingProfileTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(billingProfileTemplates.orgId, this.orgId), eq(billingProfileTemplates.id, id)))
      .returning();
    return template;
  }

  async getBillingProfilesForAccount(accountId: string): Promise<BillingProfile[]> {
    return db.select().from(billingProfiles).where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.accountId, accountId)));
  }

  async createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile> {
    const [bp] = await db.insert(billingProfiles).values({ ...data, orgId: this.orgId }).returning();
    return bp;
  }

  async updateBillingProfile(id: string, data: Partial<InsertBillingProfile>): Promise<BillingProfile | undefined> {
    const [bp] = await db
      .update(billingProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.id, id)))
      .returning();
    return bp;
  }

  // Per CANONICAL_DOMAIN_RULES_V1.md §4: a location-level profile (locationId
  // = this location) wins if one exists; otherwise fall back to the
  // account-level default (locationId IS NULL) for that location's account.
  async resolveBillingProfileForLocation(locationId: string): Promise<BillingProfile | undefined> {
    const [location] = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    if (!location?.accountId) {
      return undefined;
    }

    const [locationOverride] = await db
      .select()
      .from(billingProfiles)
      .where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.locationId, locationId), eq(billingProfiles.status, "active")));
    if (locationOverride) {
      return locationOverride;
    }

    const accountProfiles = await db
      .select()
      .from(billingProfiles)
      .where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.accountId, location.accountId), isNull(billingProfiles.locationId), eq(billingProfiles.status, "active")));
    return accountProfiles.find((profile) => profile.isDefault) ?? accountProfiles[0];
  }

  async getNotesByLocation(locationId: string): Promise<CustomerNote[]> {
    return db.select().from(customerNotes).where(
      and(eq(customerNotes.orgId, this.orgId), eq(customerNotes.locationId, locationId), eq(customerNotes.scope, "LOCATION"))
    );
  }

  async getSharedNotes(customerId: string): Promise<CustomerNote[]> {
    const accountId = await this.resolveAccountIdForLegacyCustomer(customerId);
    return db.select().from(customerNotes).where(
      and(eq(customerNotes.orgId, this.orgId), eq(customerNotes.accountId, accountId), eq(customerNotes.scope, "ACCOUNT"))
    );
  }

  async getNoteRevisions(noteId: string): Promise<NoteRevision[]> {
    const revisions = await db.select().from(noteRevisions).where(and(eq(noteRevisions.orgId, this.orgId), eq(noteRevisions.noteId, noteId)));
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
        ? and(eq(customerNotes.orgId, this.orgId), eq(customerNotes.accountId, accountId), eq(customerNotes.scope, "ACCOUNT"))
        : and(eq(customerNotes.orgId, this.orgId), eq(customerNotes.locationId, locationId ?? ""), eq(customerNotes.scope, "LOCATION"));

    return db.transaction(async (tx) => {
      const existingNotes = await tx.select().from(customerNotes).where(scopeFilter);
      const [primaryNote, ...legacyNotes] = [...existingNotes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const legacyNoteIds = legacyNotes.map((note) => note.id);
      const referencedLegacyNoteIds = legacyNoteIds.length > 0
        ? new Set(
            (await tx.select({ noteId: noteRevisions.noteId }).from(noteRevisions).where(and(eq(noteRevisions.orgId, this.orgId), inArray(noteRevisions.noteId, legacyNoteIds))))
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
          .where(and(eq(customerNotes.orgId, this.orgId), eq(customerNotes.id, primaryNote.id)))
          .returning();

        if (deletableLegacyNotes.length > 0) {
          await tx.delete(customerNotes).where(and(eq(customerNotes.orgId, this.orgId), inArray(customerNotes.id, deletableLegacyNotes.map((note) => note.id))));
        }

        if (primaryNote.body !== nextBody) {
          const revisionNumber = await this.getNextNoteRevisionNumber(tx, primaryNote.id);
          await tx.insert(noteRevisions).values({
            orgId: this.orgId,
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
          orgId: this.orgId,
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
        orgId: this.orgId,
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
    return db.select().from(serviceTypes).where(eq(serviceTypes.orgId, this.orgId));
  }

  async createServiceType(data: InsertServiceType): Promise<ServiceType> {
    const [st] = await db.insert(serviceTypes).values({ ...data, orgId: this.orgId }).returning();
    return st;
  }

  async updateServiceType(id: string, data: Partial<InsertServiceType>): Promise<ServiceType | undefined> {
    const [serviceType] = await db.update(serviceTypes).set(data).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, id))).returning();
    return serviceType;
  }

  async getTechnicians(includeInactive = false): Promise<Technician[]> {
    const allTechnicians = await db.select().from(technicians).where(eq(technicians.orgId, this.orgId));
    if (includeInactive) {
      return allTechnicians;
    }
    return allTechnicians.filter((technician) => technician.status === "ACTIVE");
  }

  async createTechnician(data: InsertTechnician): Promise<Technician> {
    const payload = this.normalizeTechnicianInsert(data);
    const [technician] = await db.insert(technicians).values({ ...payload, orgId: this.orgId }).returning();
    return technician;
  }

  async updateTechnician(id: string, data: Partial<InsertTechnician>): Promise<Technician | undefined> {
    const payload = this.normalizeTechnicianUpdate(data);
    const [technician] = await db.update(technicians).set({ ...payload, updatedAt: new Date() }).where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, id))).returning();
    return technician;
  }

  async getServices(): Promise<Service[]> {
    return db.select().from(services).where(eq(services.orgId, this.orgId));
  }

  async getServicesByLocation(locationId: string): Promise<Service[]> {
    return db.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.locationId, locationId)));
  }

  async getPendingServices(window?: DispatchBoardWindow): Promise<Service[]> {
    const pendingServices = await db.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.status, "PENDING_SCHEDULING")));
    if (!window?.dateTo) {
      return pendingServices;
    }
    return pendingServices.filter((service) => !service.dueDate || service.dueDate <= window.dateTo);
  }

  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
    return service;
  }

  async createService(data: InsertService): Promise<Service> {
    return db.transaction(async (tx) => {
      const payload = this.normalizeServiceInsert(data);
      const [service] = await tx.insert(services).values({ ...payload, orgId: this.orgId }).returning();

      if (service.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        if (appointment) {
          await tx
            .update(services)
            .set({
              status: appointment.status === "completed" ? "COMPLETED" : appointment.status === "canceled" ? "CANCELLED" : "SCHEDULED",
              assignedTechnicianId: appointment.assignedTechnicianId || null,
              updatedAt: new Date(),
            })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));

          if (!appointment.serviceId) {
            await tx.update(appointments).set({ serviceId: service.id }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)));
          }

          const [updatedService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));
          return updatedService || service;
        }
      }

      return service;
    });
  }

  async updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined> {
    return db.transaction(async (tx) => {
      const payload = this.normalizeServiceUpdate(data);
      const [service] = await tx.update(services).set({ ...payload, updatedAt: new Date() }).where(and(eq(services.orgId, this.orgId), eq(services.id, id))).returning();
      if (!service) {
        return undefined;
      }

      if (payload.appointmentId !== undefined && service.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        if (appointment) {
          await tx
            .update(services)
            .set({
              status: appointment.status === "completed" ? "COMPLETED" : appointment.status === "canceled" ? "CANCELLED" : "SCHEDULED",
              assignedTechnicianId: appointment.assignedTechnicianId || null,
              updatedAt: new Date(),
            })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));

          if (!appointment.serviceId) {
            await tx.update(appointments).set({ serviceId: service.id }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)));
          }
        }
      }

      const [updatedService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
      return updatedService;
    });
  }

  async deleteService(id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [service] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
      if (!service) {
        return false;
      }

      const linkedServiceRecords = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.serviceId, id)));
      if (linkedServiceRecords.length) {
        throw new Error("Completed services with service records cannot be deleted");
      }

      const linkedOpportunities = await tx.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.sourceServiceId, id)));
      if (linkedOpportunities.length) {
        throw new Error("Services with linked opportunities cannot be deleted");
      }

      if (service.appointmentId) {
        const siblingServices = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.appointmentId, service.appointmentId)));
        const remainingSiblings = siblingServices.filter((sibling) => sibling.id !== id);
        await tx.delete(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));

        if (remainingSiblings.length === 0) {
          await tx.delete(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        } else {
          const [representative] = remainingSiblings;
          await tx.update(appointments).set({ serviceId: representative.id }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        }

        return true;
      }

      await tx.delete(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
      return true;
    });
  }

  private async createOpportunityActivityTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    data: Omit<InsertOpportunityActivity, "orgId">,
  ): Promise<OpportunityActivity> {
    const [activity] = await tx.insert(opportunityActivities).values({ ...data, orgId: this.orgId }).returning();
    return activity;
  }

  private async createOpportunityCommunicationTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    {
      opportunity,
      activity,
      subject,
      body,
      nextActionDate,
      actorLabel,
    }: {
      opportunity: Opportunity;
      activity: OpportunityActivity;
      subject: string;
      body: string;
      nextActionDate?: string | null;
      actorLabel?: string | null;
    },
  ): Promise<Communication> {
    const [linkedService] = opportunity.sourceServiceId
      ? await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, opportunity.sourceServiceId)))
      : [undefined];
    const [linkedLocation] = !linkedService
      ? await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, opportunity.locationId)))
      : [undefined];
    const customerId = linkedService?.customerId || linkedLocation?.customerId;

    if (!customerId) {
      throw new Error("Opportunity communication requires a linked customer");
    }

    const [existing] = await tx
      .select()
      .from(communications)
      .where(and(eq(communications.orgId, this.orgId), eq(communications.opportunityActivityId, activity.id)));

    if (existing) {
      return existing;
    }

    const [communication] = await tx.insert(communications).values({
      orgId: this.orgId,
      customerId,
      locationId: opportunity.locationId,
      opportunityId: opportunity.id,
      opportunityActivityId: activity.id,
      type: "OPPORTUNITY_CALL",
      direction: "outbound",
      subject,
      body,
      nextActionDate: nextActionDate || null,
      actorLabel: actorLabel || null,
      sentAt: activity.createdAt,
      status: "logged",
    }).returning();

    return communication;
  }

  async getOpportunities(filters: OpportunityFilters = {}): Promise<Opportunity[]> {
    const conditions = [eq(opportunities.orgId, this.orgId)];
    if (filters.status) conditions.push(eq(opportunities.status, filters.status));
    if (filters.dueFrom) conditions.push(sql`coalesce(${opportunities.nextActionDate}, ${opportunities.dueDate}) >= ${filters.dueFrom}`);
    if (filters.dueTo) conditions.push(sql`coalesce(${opportunities.nextActionDate}, ${opportunities.dueDate}) <= ${filters.dueTo}`);
    if (filters.serviceTypeId) conditions.push(eq(opportunities.serviceTypeId, filters.serviceTypeId));

    return db
      .select()
      .from(opportunities)
      .where(and(...conditions))
      .orderBy(sql`coalesce(${opportunities.nextActionDate}, ${opportunities.dueDate}) asc`, asc(opportunities.createdAt));
  }

  async getOpportunitiesByLocation(locationId: string): Promise<Opportunity[]> {
    return db.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.locationId, locationId))).orderBy(asc(opportunities.dueDate));
  }

  async createOpportunity(data: InsertOpportunity): Promise<Opportunity> {
    const [opportunity] = await db.insert(opportunities).values({
      ...data,
      orgId: this.orgId,
      nextActionDate: normalizeDateOnly(data.nextActionDate) ?? normalizeDateOnly(data.dueDate),
    }).returning();
    return opportunity;
  }

  async updateOpportunity(id: string, data: Partial<InsertOpportunity>): Promise<Opportunity | undefined> {
    const payload: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };
    if (data.nextActionDate !== undefined) {
      payload.nextActionDate = normalizeDateOnly(data.nextActionDate as any);
    }
    if (data.dueDate !== undefined) {
      const normalizedDueDate = normalizeDateOnly(data.dueDate as any);
      if (normalizedDueDate !== null) {
        payload.dueDate = normalizedDueDate;
      }
    }
    const [opportunity] = await db.update(opportunities).set(payload).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, id))).returning();
    return opportunity;
  }

  async getOpportunityDispositions(includeInactive = false): Promise<OpportunityDisposition[]> {
    const items = await db.select().from(opportunityDispositions).where(eq(opportunityDispositions.orgId, this.orgId)).orderBy(asc(opportunityDispositions.sortOrder), asc(opportunityDispositions.label));
    if (includeInactive) return items;
    return items.filter((item) => item.isActive);
  }

  async createOpportunityDisposition(data: InsertOpportunityDisposition): Promise<OpportunityDisposition> {
    const [item] = await db.insert(opportunityDispositions).values({ ...data, orgId: this.orgId }).returning();
    return item;
  }

  async updateOpportunityDisposition(id: string, data: Partial<InsertOpportunityDisposition>): Promise<OpportunityDisposition | undefined> {
    const [item] = await db
      .update(opportunityDispositions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(opportunityDispositions.orgId, this.orgId), eq(opportunityDispositions.id, id)))
      .returning();
    return item;
  }

  async getOpportunityActivitiesByOpportunity(opportunityId: string): Promise<OpportunityActivity[]> {
    return db
      .select()
      .from(opportunityActivities)
      .where(and(eq(opportunityActivities.orgId, this.orgId), eq(opportunityActivities.opportunityId, opportunityId)))
      .orderBy(desc(opportunityActivities.createdAt));
  }

  async applyOpportunityDisposition(input: ApplyOpportunityDispositionInput): Promise<Opportunity | undefined> {
    return db.transaction(async (tx) => {
      const [opportunity] = await tx.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, input.opportunityId)));
      if (!opportunity) return undefined;

      const [disposition] = await tx.select().from(opportunityDispositions).where(and(eq(opportunityDispositions.orgId, this.orgId), eq(opportunityDispositions.id, input.dispositionId)));
      if (!disposition) {
        throw new Error("Opportunity disposition not found");
      }

      const normalizedOverride = normalizeDateOnly(input.nextActionDate);
      const defaultNextActionDate = disposition.isTerminal
        ? null
        : disposition.defaultCallbackDays !== null && disposition.defaultCallbackDays !== undefined
          ? addDays(normalizeDateOnly(new Date())!, disposition.defaultCallbackDays)
          : normalizeDateOnly(opportunity.nextActionDate) || normalizeDateOnly(opportunity.dueDate);
      const nextActionDate = normalizedOverride !== null ? normalizedOverride : defaultNextActionDate;
      const touchedAt = new Date();
      const shouldTrackContact = disposition.key !== "REMOVE_FROM_QUEUE" && disposition.key !== "CONVERTED_TO_SERVICE";

      const [updatedOpportunity] = await tx
        .update(opportunities)
        .set({
          status: disposition.resultingStatus,
          nextActionDate,
          lastDispositionKey: disposition.key,
          lastDispositionLabel: disposition.label,
          lastDispositionAt: touchedAt,
          lastContactedAt: shouldTrackContact ? touchedAt : opportunity.lastContactedAt,
          contactedAt: shouldTrackContact && !opportunity.contactedAt ? touchedAt : opportunity.contactedAt,
          dismissedAt: disposition.resultingStatus === "DISMISSED" ? touchedAt : null,
          dismissedReason: disposition.resultingStatus === "DISMISSED" ? disposition.label : null,
          notes: input.notes !== undefined && input.notes !== null ? input.notes.trim() || null : opportunity.notes,
          updatedAt: touchedAt,
        })
        .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, input.opportunityId)))
        .returning();

      const activity = await this.createOpportunityActivityTx(tx, {
        opportunityId: opportunity.id,
        dispositionKey: disposition.key,
        dispositionLabel: disposition.label,
        notes: input.notes?.trim() || null,
        nextActionDate,
        createdByUserId: input.actor?.userId || null,
        createdByLabel: input.actor?.actorLabel || null,
      });

      const bodyParts = [
        `Disposition: ${disposition.label}`,
        input.notes?.trim() ? `Notes: ${input.notes.trim()}` : null,
        nextActionDate ? `Next Action: ${nextActionDate}` : null,
      ].filter(Boolean);

      await this.createOpportunityCommunicationTx(tx, {
        opportunity: updatedOpportunity,
        activity,
        subject: `Opportunity Call - ${disposition.label}`,
        body: bodyParts.join("\n"),
        nextActionDate,
        actorLabel: input.actor?.actorLabel || null,
      });

      return updatedOpportunity;
    });
  }

  async convertOpportunityToService(id: string, actor?: AuditActor): Promise<{ opportunity: Opportunity; service: Service } | undefined> {
    return db.transaction(async (tx) => {
      const [opportunity] = await tx.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, id)));
      if (!opportunity) return undefined;
      if (opportunity.status === "DISMISSED") {
        throw new Error("Dismissed opportunities cannot be converted");
      }

      if (opportunity.convertedServiceId) {
        const [existingService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, opportunity.convertedServiceId)));
        if (existingService) return { opportunity, service: existingService };
      }
      if (opportunity.status === "CONVERTED") {
        throw new Error("Converted opportunity is missing its linked service");
      }

      const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, opportunity.locationId)));
      if (!location) {
        throw new Error("Opportunity location not found");
      }

      const [serviceType] = opportunity.serviceTypeId
        ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, opportunity.serviceTypeId)))
        : [undefined];
      const [convertedDisposition] = await tx
        .select()
        .from(opportunityDispositions)
        .where(and(eq(opportunityDispositions.orgId, this.orgId), eq(opportunityDispositions.key, "CONVERTED_TO_SERVICE")));

      const [linkedGeneratedService] = opportunity.sourceServiceId
        ? await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, opportunity.sourceServiceId)))
        : [undefined];

      const service = linkedGeneratedService?.source === "AGREEMENT_GENERATED"
        ? linkedGeneratedService
        : (await tx.insert(services).values({
            orgId: this.orgId,
            customerId: location.customerId,
            locationId: location.id,
            serviceTypeId: opportunity.serviceTypeId || null,
            dueDate: opportunity.dueDate,
            expectedDurationMinutes: serviceType?.estimatedDuration ?? null,
            priceCents: serviceType?.defaultPriceCents ?? null,
            status: "PENDING_SCHEDULING",
            source: "MANUAL",
            notes: opportunity.notes || `Converted from opportunity: ${opportunity.opportunityType || serviceType?.name || "Opportunity"}`,
          }).returning())[0];

      const [updatedOpportunity] = await tx
        .update(opportunities)
        .set({
          status: convertedDisposition?.resultingStatus || "CONVERTED",
          convertedServiceId: service.id,
          nextActionDate: null,
          lastDispositionKey: convertedDisposition?.key || "CONVERTED_TO_SERVICE",
          lastDispositionLabel: convertedDisposition?.label || "Converted to Service",
          lastDispositionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, id)))
        .returning();

      const activity = await this.createOpportunityActivityTx(tx, {
        opportunityId: updatedOpportunity.id,
        dispositionKey: convertedDisposition?.key || "CONVERTED_TO_SERVICE",
        dispositionLabel: convertedDisposition?.label || "Converted to Service",
        notes: `Converted to pending service ${service.id}`,
        nextActionDate: null,
        createdByUserId: actor?.userId || null,
        createdByLabel: actor?.actorLabel || null,
      });

      await this.createOpportunityCommunicationTx(tx, {
        opportunity: updatedOpportunity,
        activity,
        subject: `Opportunity Call - ${convertedDisposition?.label || "Converted to Service"}`,
        body: `Disposition: ${convertedDisposition?.label || "Converted to Service"}\nConverted to pending service ${service.id}`,
        nextActionDate: null,
        actorLabel: actor?.actorLabel || null,
      });

      return { opportunity: updatedOpportunity, service };
    });
  }

  async getAgreementCancellationPolicies(includeInactive = false): Promise<AgreementCancellationPolicy[]> {
    const rows = includeInactive
      ? await db.select().from(agreementCancellationPolicies).where(eq(agreementCancellationPolicies.orgId, this.orgId))
      : await db.select().from(agreementCancellationPolicies).where(and(eq(agreementCancellationPolicies.orgId, this.orgId), eq(agreementCancellationPolicies.isActive, true)));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAgreementCancellationPolicy(id: string): Promise<AgreementCancellationPolicy | undefined> {
    const [policy] = await db.select().from(agreementCancellationPolicies).where(and(eq(agreementCancellationPolicies.orgId, this.orgId), eq(agreementCancellationPolicies.id, id)));
    return policy;
  }

  async createAgreementCancellationPolicy(data: InsertAgreementCancellationPolicy): Promise<AgreementCancellationPolicy> {
    const payload = this.normalizeAgreementCancellationPolicyInsert(data);
    const [policy] = await db.insert(agreementCancellationPolicies).values({ ...payload, orgId: this.orgId }).returning();
    return policy;
  }

  async updateAgreementCancellationPolicy(id: string, data: Partial<InsertAgreementCancellationPolicy>): Promise<AgreementCancellationPolicy | undefined> {
    const payload = this.normalizeAgreementCancellationPolicyUpdate(data);
    const [policy] = await db
      .update(agreementCancellationPolicies)
      .set({ ...payload, updatedAt: new Date() })
      .where(and(eq(agreementCancellationPolicies.orgId, this.orgId), eq(agreementCancellationPolicies.id, id)))
      .returning();
    return policy;
  }

  async getBillingPlans(includeInactive = false): Promise<BillingPlan[]> {
    const rows = includeInactive
      ? await db.select().from(billingPlans).where(eq(billingPlans.orgId, this.orgId))
      : await db.select().from(billingPlans).where(and(eq(billingPlans.orgId, this.orgId), eq(billingPlans.isActive, true)));
    return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  }

  async getBillingPlan(id: string): Promise<BillingPlan | undefined> {
    const [plan] = await db.select().from(billingPlans).where(and(eq(billingPlans.orgId, this.orgId), eq(billingPlans.id, id)));
    return plan;
  }

  async createBillingPlan(data: InsertBillingPlan): Promise<BillingPlan> {
    const [plan] = await db.insert(billingPlans).values({ ...data, orgId: this.orgId }).returning();
    return plan;
  }

  async updateBillingPlan(id: string, data: Partial<InsertBillingPlan>): Promise<BillingPlan | undefined> {
    const [plan] = await db
      .update(billingPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(billingPlans.orgId, this.orgId), eq(billingPlans.id, id)))
      .returning();
    return plan;
  }

  // Prefers the snapshot stored at agreement-creation time; rebuilds from the
  // live billing plan only as a fallback for agreements that predate this
  // snapshot mechanism - same override-wins/rebuild-on-missing shape as
  // cancelAgreement()'s cancellationPolicySnapshot handling.
  async resolveAgreementBillingPlanSnapshot(agreementId: string): Promise<Record<string, unknown> | null> {
    const [agreement] = await db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreementId)));
    if (!agreement) return null;
    if (agreement.billingPlanSnapshot) return agreement.billingPlanSnapshot as Record<string, unknown>;

    const plan = agreement.billingPlanId ? await this.getBillingPlan(agreement.billingPlanId) : undefined;
    return this.buildBillingPlanSnapshot(plan);
  }

  async getAgreementTemplates(): Promise<AgreementTemplate[]> {
    return db.select().from(agreementTemplates).where(eq(agreementTemplates.orgId, this.orgId));
  }

  async getAgreementTemplate(id: string): Promise<AgreementTemplate | undefined> {
    const [template] = await db.select().from(agreementTemplates).where(and(eq(agreementTemplates.orgId, this.orgId), eq(agreementTemplates.id, id)));
    return template;
  }

  async createAgreementTemplate(data: InsertAgreementTemplate): Promise<AgreementTemplate> {
    const payload = this.normalizeAgreementTemplateInsert(data);
    const [template] = await db.insert(agreementTemplates).values({ ...payload, orgId: this.orgId }).returning();
    return template;
  }

  async updateAgreementTemplate(id: string, data: Partial<InsertAgreementTemplate>): Promise<AgreementTemplate | undefined> {
    const payload = this.normalizeAgreementTemplateUpdate(data);
    const [template] = await db.update(agreementTemplates).set({ ...payload, updatedAt: new Date() }).where(and(eq(agreementTemplates.orgId, this.orgId), eq(agreementTemplates.id, id))).returning();
    return template;
  }

  async getAgreementsByLocation(locationId: string): Promise<Agreement[]> {
    return db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.locationId, locationId)));
  }

  async getAgreement(id: string): Promise<Agreement | undefined> {
    const [agreement] = await db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, id)));
    return agreement;
  }

  async createAgreementFromTemplate(input: CreateAgreementFromTemplateInput): Promise<Agreement> {
    const payload = await this.buildAgreementInsertFromTemplate(input);
    return this.createAgreement(payload, input.actor);
  }

  async createAgreement(data: InsertAgreement, actor?: AuditActor): Promise<Agreement> {
    const agreement = await db.transaction(async (tx) => {
      const payload = this.normalizeAgreementInsert(data, actor);
      const [createdAgreement] = await tx.insert(agreements).values({ ...payload, orgId: this.orgId }).returning();

      if (createdAgreement.initialAppointmentId && createdAgreement.startDateSource === "INITIAL_APPOINTMENT") {
        await tx
          .update(appointments)
          .set({
            agreementId: createdAgreement.id,
            source: "AGREEMENT_INITIAL",
          })
          .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, createdAgreement.initialAppointmentId)));

        return (await this.syncAgreementInitialAppointmentDates(tx, createdAgreement.id, actor)) || createdAgreement;
      }

      return createdAgreement;
    });

    await this.generateAgreementServicesForLocation(agreement.locationId);
    return agreement;
  }

  async updateAgreement(id: string, data: Partial<InsertAgreement>, actor?: AuditActor): Promise<Agreement | undefined> {
    const agreement = await db.transaction(async (tx) => {
      const [existingAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, id)));
      if (!existingAgreement) {
        return undefined;
      }
      if (data.status === "CANCELLED" && existingAgreement.status !== "CANCELLED") {
        throw new Error("Use the agreement cancellation workflow to cancel agreements");
      }
      const payload = this.normalizeAgreementUpdate(data, actor);
      const [updatedAgreement] = await tx.update(agreements).set({ ...payload, updatedAt: new Date() }).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, id))).returning();
      if (!updatedAgreement) {
        return undefined;
      }

      if (updatedAgreement.initialAppointmentId && updatedAgreement.startDateSource === "INITIAL_APPOINTMENT") {
        await tx
          .update(appointments)
          .set({
            agreementId: updatedAgreement.id,
            source: "AGREEMENT_INITIAL",
          })
          .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, updatedAgreement.initialAppointmentId)));

        return (await this.syncAgreementInitialAppointmentDates(tx, updatedAgreement.id, actor)) || updatedAgreement;
      }

      return updatedAgreement;
    });
    if (!agreement) {
      return undefined;
    }

    await this.generateAgreementServicesForLocation(agreement.locationId);
    return agreement;
  }

  async cancelAgreement(input: CancelAgreementInput): Promise<Agreement | undefined> {
    return db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, input.agreementId)));
      if (!agreement) return undefined;

      const policy = agreement.cancellationPolicyId
        ? (await tx.select().from(agreementCancellationPolicies).where(and(eq(agreementCancellationPolicies.orgId, this.orgId), eq(agreementCancellationPolicies.id, agreement.cancellationPolicyId))))[0]
        : undefined;
      const snapshot = agreement.cancellationPolicySnapshot ?? this.buildCancellationPolicySnapshot(policy);
      const effectiveDate = normalizeDateOnly(input.effectiveDate) || normalizeDateOnly(new Date())!;
      const cancelPendingServices = input.cancelPendingServices ?? policy?.cancelPendingServicesDefault ?? false;
      const cancelScheduledAppointments = input.cancelScheduledAppointments ?? policy?.cancelScheduledAppointmentsDefault ?? false;
      const closeOpenOpportunities = input.closeOpenOpportunities ?? policy?.closeOpenOpportunitiesDefault ?? false;
      const createRetentionOpportunity = input.createRetentionOpportunity ?? policy?.createRetentionOpportunityDefault ?? false;
      const overrideApplied = input.overrideApplied ?? false;
      const cancellationFeeAmountCents = input.cancellationFeeAmountCents !== undefined
        ? input.cancellationFeeAmountCents ?? null
        : policy?.cancellationFeeAmountCents ?? null;
      const cancelledAt = new Date();

      if (overrideApplied && policy?.requiresOverrideReason && !input.overrideReason?.trim()) {
        throw new Error("Override reason is required by this cancellation policy");
      }

      const [updatedAgreement] = await tx
        .update(agreements)
        .set({
          status: "CANCELLED",
          cancelledAt,
          cancellationReason: input.reason.trim(),
          cancellationNotes: input.notes?.trim() || null,
          cancellationEffectiveDate: effectiveDate as any,
          cancellationPolicyId: agreement.cancellationPolicyId || policy?.id || null,
          cancellationPolicySnapshot: snapshot,
          cancellationFeeType: policy?.cancellationFeeType || "NONE",
          cancellationFeeAmountCents,
          cancellationOverrideApplied: overrideApplied,
          cancellationOverrideReason: input.overrideReason?.trim() || null,
          cancellationOverrideByUserId: overrideApplied ? input.actor?.userId || null : null,
          cancellationOverrideByLabel: overrideApplied ? input.actor?.actorLabel || null : null,
          cancellationOverrideAt: overrideApplied ? cancelledAt : null,
          updatedAt: cancelledAt,
          updatedByUserId: input.actor?.userId || agreement.updatedByUserId || null,
        })
        .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)))
        .returning();

      const agreementServices = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.agreementId, agreement.id)));

      if (cancelPendingServices) {
        await tx
          .update(services)
          .set({ status: "CANCELLED", updatedAt: cancelledAt })
          .where(and(
            eq(services.orgId, this.orgId),
            eq(services.agreementId, agreement.id),
            eq(services.source, "AGREEMENT_GENERATED"),
            eq(services.status, "PENDING_SCHEDULING"),
          ));
      }

      if (cancelScheduledAppointments) {
        const scheduledAppointments = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.agreementId, agreement.id)));
        for (const appointment of scheduledAppointments) {
          if (appointment.status === "completed" || appointment.status === "canceled") continue;
          await tx.update(appointments).set({ status: "canceled" }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)));
        }

        for (const service of agreementServices) {
          if (!service.appointmentId || service.status === "COMPLETED" || service.status === "CANCELLED") continue;
          await tx.update(appointments).set({ status: "canceled" }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
          await tx.update(services).set({ status: "CANCELLED", updatedAt: cancelledAt }).where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));
        }
      }

      if (closeOpenOpportunities) {
        await tx
          .update(opportunities)
          .set({
            status: "DISMISSED",
            dismissedAt: cancelledAt,
            dismissedReason: "Agreement cancelled",
            lastDispositionKey: "AGREEMENT_CANCELLED",
            lastDispositionLabel: "Agreement Cancelled",
            lastDispositionAt: cancelledAt,
            nextActionDate: null,
            updatedAt: cancelledAt,
          })
          .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.agreementId, agreement.id), eq(opportunities.status, "OPEN")));
      }

      if (createRetentionOpportunity) {
        const followUpDays = policy?.defaultRetentionFollowUpDays ?? 7;
        const nextActionDate = addDays(effectiveDate, Math.max(followUpDays, 0));
        const [existingRetentionOpportunity] = await tx
          .select()
          .from(opportunities)
          .where(and(
            eq(opportunities.orgId, this.orgId),
            eq(opportunities.agreementId, agreement.id),
            eq(opportunities.source, "AGREEMENT_CANCELLATION_RETENTION"),
            eq(opportunities.status, "OPEN"),
          ));

        if (!existingRetentionOpportunity) {
          const [retentionOpportunity] = await tx.insert(opportunities).values({
            orgId: this.orgId,
            locationId: agreement.locationId,
            agreementId: agreement.id,
            serviceTypeId: agreement.serviceTypeId || null,
            source: "AGREEMENT_CANCELLATION_RETENTION",
            opportunityType: "Agreement Cancellation Retention",
            dueDate: nextActionDate as any,
            nextActionDate: nextActionDate as any,
            status: "OPEN",
            notes: `Retention follow-up for cancelled agreement: ${agreement.agreementName}`,
          }).returning();

          const activity = await this.createOpportunityActivityTx(tx, {
            opportunityId: retentionOpportunity.id,
            dispositionKey: "AGREEMENT_CANCELLATION_RETENTION",
            dispositionLabel: "Agreement Cancellation Retention",
            notes: input.notes?.trim() || input.reason.trim(),
            nextActionDate,
            createdByUserId: input.actor?.userId || null,
            createdByLabel: input.actor?.actorLabel || null,
          });

          await this.createOpportunityCommunicationTx(tx, {
            opportunity: retentionOpportunity,
            activity,
            subject: "Agreement Cancellation Retention",
            body: [
              `Agreement cancelled: ${agreement.agreementName}`,
              `Reason: ${input.reason.trim()}`,
              input.notes?.trim() ? `Notes: ${input.notes.trim()}` : null,
              `Next Action: ${nextActionDate}`,
            ].filter(Boolean).join("\n"),
            nextActionDate,
            actorLabel: input.actor?.actorLabel || null,
          });
        }
      }

      return updatedAgreement;
    });
  }

  async linkAgreementInitialAppointment(input: LinkAgreementInitialAppointmentInput): Promise<Agreement | undefined> {
    const agreement = await db.transaction(async (tx) => {
      const [existingAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, input.agreementId)));
      if (!existingAgreement) {
        return undefined;
      }

      const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, input.appointmentId)));
      if (!appointment || appointment.locationId !== existingAgreement.locationId || appointment.source === "AGREEMENT_GENERATED") {
        throw new Error("Selected appointment cannot be linked as the agreement's initial service");
      }

      await tx
        .update(appointments)
        .set({
          agreementId: existingAgreement.id,
          source: "AGREEMENT_INITIAL",
        })
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)));

      await tx
        .update(agreements)
        .set({
          initialAppointmentId: appointment.id,
          startDateSource: "INITIAL_APPOINTMENT",
          updatedAt: new Date(),
          updatedByUserId: input.actor?.userId || existingAgreement.updatedByUserId || null,
        })
        .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, existingAgreement.id)));

      return await this.syncAgreementInitialAppointmentDates(tx, existingAgreement.id, input.actor);
    });

    if (!agreement) {
      return undefined;
    }

    await this.generateAgreementServicesForLocation(agreement.locationId);
    return agreement;
  }

  async generateAgreementServicesForLocation(locationId: string): Promise<GenerateAgreementServicesResult> {
    return db.transaction(async (tx) => {
      const locationAgreements = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.locationId, locationId)));
      const createdServices: Service[] = [];

      for (const agreement of locationAgreements) {
        const createdService = await this.generateServiceForAgreement(tx, agreement);
        if (createdService) {
          createdServices.push(createdService);
        }
      }

      return { createdServices };
    });
  }

  async getAppointments(): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.orgId, this.orgId));
  }

  async getAppointmentsByLocation(locationId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.locationId, locationId)));
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appt] = await db.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)));
    return appt;
  }

  async createAppointment(data: InsertAppointment): Promise<Appointment> {
    const appointment = await db.transaction(async (tx) => {
      const [appt] = await tx.insert(appointments).values({
        ...data,
        orgId: this.orgId,
        serviceId: data.serviceId || null,
        source: data.source || "MANUAL",
        agreementId: data.agreementId || null,
        assignedTechnicianId: data.assignedTechnicianId || null,
        generatedForDate: data.generatedForDate || null,
      }).returning();

      if (appt.serviceId) {
        await tx.update(services).set({ appointmentId: appt.id, updatedAt: new Date() }).where(and(eq(services.orgId, this.orgId), eq(services.id, appt.serviceId)));
      }

      await this.syncServicesForAppointmentTx(tx, appt);

      if (appt.serviceId) {
        const resolvedAt = new Date();
        const resolvedOpportunities = await tx
          .update(opportunities)
          .set({
            status: "CONVERTED",
            convertedServiceId: appt.serviceId,
            nextActionDate: null,
            lastDispositionKey: "RESCHEDULED",
            lastDispositionLabel: "Rescheduled",
            lastDispositionAt: resolvedAt,
            updatedAt: resolvedAt,
          })
          .where(and(
            eq(opportunities.orgId, this.orgId),
            eq(opportunities.sourceServiceId, appt.serviceId),
            eq(opportunities.status, "OPEN"),
            inArray(opportunities.source, ["APPOINTMENT_RESCHEDULE_REQUIRED", "APPOINTMENT_CANCELLATION_REVIEW"]),
          ))
          .returning();

        for (const opportunity of resolvedOpportunities) {
          const activity = await this.createOpportunityActivityTx(tx, {
            opportunityId: opportunity.id,
            dispositionKey: "RESCHEDULED",
            dispositionLabel: "Rescheduled",
            notes: `Service scheduled on appointment ${appt.id}`,
            nextActionDate: null,
            createdByUserId: null,
            createdByLabel: "System",
          });

          await this.createOpportunityCommunicationTx(tx, {
            opportunity,
            activity,
            subject: "Opportunity Call - Rescheduled",
            body: `Disposition: Rescheduled\nService scheduled on appointment ${appt.id}`,
            nextActionDate: null,
            actorLabel: "System",
          });
        }
      }

      if (appt.agreementId && appt.source === "AGREEMENT_INITIAL") {
        await tx
          .update(agreements)
          .set({
            initialAppointmentId: appt.id,
            startDateSource: "INITIAL_APPOINTMENT",
            updatedAt: new Date(),
          })
          .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, appt.agreementId)));

        await this.syncAgreementInitialAppointmentDates(tx, appt.agreementId);
      }

      return appt;
    });
    return appointment;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)));
      if (!existingAppointment) {
        return undefined;
      }

      const [updatedAppointment] = await tx
        .update(appointments)
        .set(data)
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)))
        .returning();

      await this.syncServicesForAppointmentTx(tx, updatedAppointment);

      const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, updatedAppointment.id)));
      if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
        await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id);
      }

      return updatedAppointment;
    });
  }

  async requestAppointmentCancelOrReschedule(input: AppointmentCancelRescheduleInput): Promise<Appointment | undefined> {
    const reason = input.reason.trim();
    if (!reason) {
      throw new Error("Cancellation or reschedule reason is required");
    }

    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, input.appointmentId)));
      if (!existingAppointment) return undefined;

      const now = new Date();
      const today = normalizeDateOnly(now)!;
      const notes = input.notes?.trim() || null;
      const source = input.rescheduleRequested ? "APPOINTMENT_RESCHEDULE_REQUIRED" : "APPOINTMENT_CANCELLATION_REVIEW";
      const actionLabel = input.rescheduleRequested ? "Reschedule requested" : "Appointment canceled";

      const [updatedAppointment] = await tx
        .update(appointments)
        .set({
          status: "canceled",
          cancelReason: reason,
          cancelNotes: notes,
          cancelRequestedAt: now,
          cancelRequestedByLabel: input.actor?.actorLabel || null,
          rescheduleRequested: input.rescheduleRequested ?? false,
          rescheduleRequestedAt: input.rescheduleRequested ? now : null,
        })
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, existingAppointment.id)))
        .returning();

      const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, existingAppointment.id, existingAppointment.serviceId);

      for (const service of linkedServices) {
        let serviceWindowStart: string | null | undefined = undefined;
        let serviceWindowEnd: string | null | undefined = undefined;
        let dueDate: string | null | undefined = service.dueDate ?? today;

        if (service.agreementId) {
          const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, service.agreementId)));
          const windowDays = agreement?.serviceWindowDays && agreement.serviceWindowDays > 0 ? agreement.serviceWindowDays : null;
          dueDate = today;
          serviceWindowStart = today;
          serviceWindowEnd = windowDays ? addDays(today, windowDays) : today;
        }

        await tx
          .update(services)
          .set({
            status: "PENDING_SCHEDULING",
            appointmentId: null,
            assignedTechnicianId: null,
            dueDate: dueDate as any,
            serviceWindowStart: serviceWindowStart === undefined ? service.serviceWindowStart : serviceWindowStart as any,
            serviceWindowEnd: serviceWindowEnd === undefined ? service.serviceWindowEnd : serviceWindowEnd as any,
            updatedAt: now,
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));

        const [serviceType] = service.serviceTypeId
          ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, service.serviceTypeId)))
          : [undefined];
        const [existingOpenOpportunity] = await tx
          .select()
          .from(opportunities)
          .where(and(
            eq(opportunities.orgId, this.orgId),
            eq(opportunities.sourceServiceId, service.id),
            eq(opportunities.source, source),
            eq(opportunities.status, "OPEN"),
          ));

        if (!existingOpenOpportunity) {
          await tx.insert(opportunities).values({
            orgId: this.orgId,
            locationId: service.locationId,
            agreementId: service.agreementId || null,
            sourceServiceId: service.id,
            serviceTypeId: service.serviceTypeId || null,
            opportunityType: input.rescheduleRequested ? "Appointment Reschedule" : "Canceled Appointment Review",
            source,
            dueDate: today,
            nextActionDate: today,
            status: "OPEN",
            notes: [
              `${actionLabel}: ${serviceType?.name || "Service"}`,
              `Reason: ${reason}`,
              notes ? `Notes: ${notes}` : null,
              service.agreementId ? "Agreement service requeued for office scheduling." : "Service returned to pending scheduling.",
            ].filter(Boolean).join("\n"),
          });
        }
      }

      return updatedAppointment;
    });
  }

  async timeInAppointment(id: string): Promise<Appointment | undefined> {
    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)));
      if (!existingAppointment) return undefined;

      const [appointment] = await tx
        .update(appointments)
        .set({
          timeInAt: existingAppointment.timeInAt ?? new Date(),
          status: existingAppointment.status === "completed" ? existingAppointment.status : "in_progress",
        })
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)))
        .returning();
      return appointment;
    });
  }

  async timeOutAppointment(id: string): Promise<Appointment | undefined> {
    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)));
      if (!existingAppointment) return undefined;

      const timeOutAt = existingAppointment.timeOutAt ?? new Date();
      const durationMinutes = calculateDurationMinutes(existingAppointment.timeInAt, timeOutAt);
      const [appointment] = await tx
        .update(appointments)
        .set({
          timeOutAt,
          durationMinutes,
        })
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)))
        .returning();
      return appointment;
    });
  }

  async getTechnicianWork(technicianId: string, date: string): Promise<TechnicianWorkVisit[]> {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const technicianAppointments = await db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.orgId, this.orgId),
        eq(appointments.assignedTechnicianId, technicianId),
        gte(appointments.scheduledDate, dayStart),
        lte(appointments.scheduledDate, dayEnd),
        ne(appointments.status, "canceled"),
      ))
      .orderBy(asc(appointments.scheduledDate));

    const visits: TechnicianWorkVisit[] = [];

    for (const appointment of technicianAppointments) {
      const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, appointment.customerId)));
      const [location] = appointment.locationId
        ? await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, appointment.locationId)))
        : [undefined];
      const linkedServices = await this.getLinkedServicesForAppointmentTx(db as any, appointment.id, appointment.serviceId);
      const serviceIds = linkedServices.map((service) => service.id);
      const records = serviceIds.length
        ? await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), inArray(serviceRecords.serviceId, serviceIds)))
        : [];
      const recordByServiceId = new Map(records.filter((record) => record.serviceId).map((record) => [record.serviceId!, record]));

      visits.push({
        appointment,
        customer: customer ?? null,
        location: location ?? null,
        services: linkedServices.map((service) => ({
          service,
          serviceRecord: recordByServiceId.get(service.id) ?? null,
        })),
      });
    }

    return visits;
  }

  async getServiceRecords(): Promise<ServiceRecord[]> {
    return db.select().from(serviceRecords).where(eq(serviceRecords.orgId, this.orgId));
  }

  async getServiceRecordsByLocation(locationId: string): Promise<ServiceRecord[]> {
    return db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.locationId, locationId)));
  }

  async getServiceRecord(id: string): Promise<ServiceRecord | undefined> {
    const [sr] = await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)));
    return sr;
  }

  async createServiceRecord(data: InsertServiceRecord): Promise<ServiceRecord> {
    return db.transaction(async (tx) => {
      const technicianSnapshot = await this.resolveServiceRecordTechnicianSnapshot(tx, data);
      const [sr] = await tx.insert(serviceRecords).values({
        ...data,
        orgId: this.orgId,
        technicianId: technicianSnapshot.technicianId,
        technicianName: technicianSnapshot.technicianName,
        technicianLicenseNumber: technicianSnapshot.technicianLicenseNumber,
        notes: technicianSnapshot.notes,
      }).returning();

      if (sr.serviceId) {
        await tx
          .update(services)
          .set({
            status: "SCHEDULED",
            assignedTechnicianId: sr.technicianId || null,
            updatedAt: new Date(),
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, sr.serviceId)))
      }

      if (sr.appointmentId) {
        const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, sr.appointmentId)));
        if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
          await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id);
        }
      }

      return sr;
    });
  }

  async updateServiceRecord(id: string, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined> {
    return db.transaction(async (tx) => {
      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)));
      if (!existingRecord) {
        return undefined;
      }

      const technicianSnapshot = await this.resolveServiceRecordTechnicianSnapshot(tx, data, existingRecord);
      const [sr] = await tx.update(serviceRecords).set({
        ...data,
        technicianId: technicianSnapshot.technicianId,
        technicianName: technicianSnapshot.technicianName,
        technicianLicenseNumber: technicianSnapshot.technicianLicenseNumber,
        notes: technicianSnapshot.notes,
      }).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id))).returning();

      if (sr.serviceId) {
        await tx
          .update(services)
          .set({
            status: sr.confirmed ? "COMPLETED" : "SCHEDULED",
            assignedTechnicianId: sr.technicianId || null,
            updatedAt: new Date(),
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, sr.serviceId)))
      }

      if (sr.appointmentId) {
        const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, sr.appointmentId)));
        if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
          await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id);
        }
      }

      return sr;
    });
  }

  async completeService(input: CompleteServiceInput): Promise<CompleteServiceResult | undefined> {
    return db.transaction(async (tx) => {
      const [service] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, input.serviceId)));
      if (!service) {
        return undefined;
      }

      let appointment: Appointment | undefined;
      const appointmentId = input.appointmentId || service.appointmentId || null;
      if (appointmentId) {
        [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
      } else {
        [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.serviceId, service.id)));
      }

      let effectiveService = service;
      const isAgreementGeneratedService = !!service.agreementId || service.source === "AGREEMENT_GENERATED";
      const allowFieldServiceOverride = !isAgreementGeneratedService || can(input.actorRole, PERMISSIONS.ADJUST_PRICE_AGREEMENT);
      if (allowFieldServiceOverride && (input.serviceTypeId !== undefined || input.priceCents !== undefined)) {
        const [updatedService] = await tx
          .update(services)
          .set({
            serviceTypeId: input.serviceTypeId ?? service.serviceTypeId ?? null,
            priceCents: input.priceCents === undefined ? service.priceCents : input.priceCents ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
          .returning();
        effectiveService = updatedService ?? service;
      }

      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.serviceId, effectiveService.id)));
      const recordPayload: Omit<InsertServiceRecord, "orgId"> = {
        serviceId: effectiveService.id,
        appointmentId: appointment?.id ?? effectiveService.appointmentId ?? null,
        customerId: effectiveService.customerId,
        locationId: effectiveService.locationId,
        serviceTypeId: effectiveService.serviceTypeId ?? null,
        serviceDate: input.serviceDate,
        technicianId: input.technicianId || effectiveService.assignedTechnicianId || appointment?.assignedTechnicianId || null,
        technicianName: null,
        technicianLicenseNumber: null,
        notes: input.notes?.trim() || null,
        targetPests: input.targetPests?.filter((value) => value.trim()) ?? null,
        areasServiced: input.areasServiced?.trim() || null,
        conditionsFound: input.conditionsFound?.trim() || null,
        recommendations: input.recommendations?.trim() || null,
        followUpRequired: input.followUpRequired ?? false,
        followUpNotes: input.followUpRequired ? input.followUpNotes?.trim() || null : null,
        customerSignature: input.customerSignature ?? false,
        confirmed: false,
        ticketStatus: "OFFICE_REVIEW_PENDING",
        postedAt: new Date(),
        finalizedAt: null,
        finalizedByUserId: null,
        finalizedByLabel: null,
        reopenedAt: null,
        reopenedByUserId: null,
        reopenedByLabel: null,
        reopenReason: null,
        readyForBilling: false,
      };
      const technicianSnapshot = await this.resolveServiceRecordTechnicianSnapshot(tx, recordPayload, existingRecord);

      const [serviceRecord] = existingRecord
        ? await tx
          .update(serviceRecords)
          .set({
            ...recordPayload,
            technicianId: technicianSnapshot.technicianId,
            technicianName: technicianSnapshot.technicianName,
            technicianLicenseNumber: technicianSnapshot.technicianLicenseNumber,
            notes: technicianSnapshot.notes,
          })
          .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, existingRecord.id)))
          .returning()
        : await tx
          .insert(serviceRecords)
          .values({
            ...recordPayload,
            orgId: this.orgId,
            technicianId: technicianSnapshot.technicianId,
            technicianName: technicianSnapshot.technicianName,
            technicianLicenseNumber: technicianSnapshot.technicianLicenseNumber,
            notes: technicianSnapshot.notes,
          })
          .returning();

      await tx.delete(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, serviceRecord.id)));
      const validApplications = (input.productApplications ?? [])
        .map((application) => ({
          ...application,
          orgId: this.orgId,
          productName: application.productName?.trim() ?? "",
          notes: application.notes?.trim() || null,
          serviceRecordId: serviceRecord.id,
        }))
        .filter((application) => application.productName);
      const savedApplications = validApplications.length
        ? await tx.insert(productApplications).values(validApplications).returning()
        : [];

      const [postedService] = await tx
        .update(services)
        .set({
          status: service.status === "CANCELLED" ? "CANCELLED" : "SCHEDULED",
          appointmentId: appointment?.id ?? service.appointmentId ?? null,
          assignedTechnicianId: technicianSnapshot.technicianId || effectiveService.assignedTechnicianId || appointment?.assignedTechnicianId || null,
          updatedAt: new Date(),
        })
        .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
        .returning();

      let updatedAppointment: Appointment | undefined | null = appointment ?? null;
      if (appointment) {
        const trackingMode = await this.getServiceTimeTrackingMode();
        const timeOutAt = trackingMode === "AUTO_TIMEOUT_ON_TICKET_POST" && !appointment.timeOutAt ? new Date() : appointment.timeOutAt ?? null;
        const durationMinutes = timeOutAt ? calculateDurationMinutes(appointment.timeInAt, timeOutAt) : appointment.durationMinutes ?? null;
        const nextAppointmentStatus = appointment.status === "scheduled" ? "in_progress" : appointment.status;

        [updatedAppointment] = await tx
          .update(appointments)
          .set({
            status: nextAppointmentStatus,
            timeOutAt,
            durationMinutes,
          })
          .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
          .returning();

        const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, appointment.id)));
        if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
          await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id);
        }
      }

      return {
        service: postedService ?? effectiveService,
        appointment: updatedAppointment ?? null,
        serviceRecord,
        productApplications: savedApplications,
      };
    });
  }

  async getProductApplications(): Promise<ProductApplication[]> {
    return db.select().from(productApplications).where(eq(productApplications.orgId, this.orgId));
  }

  async finalizeServiceRecord(id: string, actor?: AuditActor): Promise<ServiceRecord | undefined> {
    return db.transaction(async (tx) => {
      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)));
      if (!existingRecord) return undefined;

      const now = new Date();
      const [record] = await tx
        .update(serviceRecords)
        .set({
          confirmed: true,
          ticketStatus: "FINALIZED",
          finalizedAt: now,
          finalizedByUserId: actor?.userId ?? null,
          finalizedByLabel: actor?.actorLabel ?? "Office",
          readyForBilling: true,
        })
        .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)))
        .returning();

      let completedService: Service | undefined;
      if (record.serviceId) {
        [completedService] = await tx
          .update(services)
          .set({
            status: "COMPLETED",
            assignedTechnicianId: record.technicianId || null,
            updatedAt: now,
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)))
          .returning();

        if (completedService && !existingRecord.confirmed) {
          await this.advanceAgreementForCompletedService(tx, completedService);
        }
      }

      if (!existingRecord.confirmed) {
        await this.ensureOpportunityForServiceRecordTx(tx, record);
      }

      if (record.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, record.appointmentId)));
        if (appointment) {
          const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId);
          const serviceIds = linkedServices.map((service) => service.id);
          const linkedRecords = serviceIds.length
            ? await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), inArray(serviceRecords.serviceId, serviceIds)))
            : [];
          const finalizedServiceIds = new Set(linkedRecords.filter((serviceRecord) => serviceRecord.confirmed).map((serviceRecord) => serviceRecord.serviceId));
          const allFinalized = serviceIds.length > 0 && serviceIds.every((serviceId) => finalizedServiceIds.has(serviceId));
          if (allFinalized) {
            const timeOutAt = appointment.timeOutAt ?? now;
            await tx.update(appointments).set({
              status: "completed",
              timeOutAt,
              durationMinutes: calculateDurationMinutes(appointment.timeInAt, timeOutAt) ?? appointment.durationMinutes ?? null,
            }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)));
          }
        }
      }

      return record;
    });
  }

  async reopenServiceRecord(id: string, reason: string, actor?: AuditActor): Promise<ServiceRecord | undefined> {
    return db.transaction(async (tx) => {
      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)));
      if (!existingRecord) return undefined;

      const [record] = await tx
        .update(serviceRecords)
        .set({
          confirmed: false,
          ticketStatus: "REOPENED",
          reopenedAt: new Date(),
          reopenedByUserId: actor?.userId ?? null,
          reopenedByLabel: actor?.actorLabel ?? "Office",
          reopenReason: reason.trim(),
          readyForBilling: false,
        })
        .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)))
        .returning();

      if (record.serviceId) {
        await tx
          .update(services)
          .set({
            status: "SCHEDULED",
            updatedAt: new Date(),
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)));
      }

      if (record.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, record.appointmentId)));
        if (appointment?.status === "completed") {
          await tx.update(appointments).set({ status: appointment.timeInAt ? "in_progress" : "scheduled" }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)));
        }
      }

      return record;
    });
  }

  async getMaterialProducts(includeInactive = false): Promise<MaterialProduct[]> {
    if (includeInactive) {
      return db.select().from(materialProducts).where(eq(materialProducts.orgId, this.orgId)).orderBy(asc(materialProducts.name));
    }
    return db.select().from(materialProducts).where(and(eq(materialProducts.orgId, this.orgId), eq(materialProducts.isActive, true))).orderBy(asc(materialProducts.name));
  }

  async createMaterialProduct(data: InsertMaterialProduct): Promise<MaterialProduct> {
    const [product] = await db.insert(materialProducts).values({ ...data, orgId: this.orgId }).returning();
    return product;
  }

  async updateMaterialProduct(id: string, data: Partial<InsertMaterialProduct>): Promise<MaterialProduct | undefined> {
    const [product] = await db
      .update(materialProducts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(materialProducts.orgId, this.orgId), eq(materialProducts.id, id)))
      .returning();
    return product;
  }

  async getTargetPests(includeInactive = false): Promise<TargetPest[]> {
    if (includeInactive) {
      return db.select().from(targetPests).where(eq(targetPests.orgId, this.orgId)).orderBy(asc(targetPests.sortOrder), asc(targetPests.label));
    }
    return db.select().from(targetPests).where(and(eq(targetPests.orgId, this.orgId), eq(targetPests.isActive, true))).orderBy(asc(targetPests.sortOrder), asc(targetPests.label));
  }

  async createTargetPest(data: InsertTargetPest): Promise<TargetPest> {
    const [pest] = await db.insert(targetPests).values({ ...data, orgId: this.orgId }).returning();
    return pest;
  }

  async updateTargetPest(id: string, data: Partial<InsertTargetPest>): Promise<TargetPest | undefined> {
    const [pest] = await db
      .update(targetPests)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(targetPests.orgId, this.orgId), eq(targetPests.id, id)))
      .returning();
    return pest;
  }

  async getServiceTimeTrackingMode(): Promise<ServiceTimeTrackingMode> {
    const [setting] = await db.select().from(appSettings).where(and(eq(appSettings.orgId, this.orgId), eq(appSettings.key, "service_time_tracking_mode")));
    return normalizeServiceTimeTrackingMode(setting?.value);
  }

  async setServiceTimeTrackingMode(mode: ServiceTimeTrackingMode): Promise<AppSetting> {
    const [setting] = await db
      .insert(appSettings)
      .values({ orgId: this.orgId, key: "service_time_tracking_mode", value: mode })
      .onConflictDoUpdate({
        target: [appSettings.orgId, appSettings.key],
        set: { value: mode, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  async getAppointmentCancelReasons(): Promise<string[]> {
    const [setting] = await db.select().from(appSettings).where(and(eq(appSettings.orgId, this.orgId), eq(appSettings.key, "appointment_cancel_reschedule_reasons")));
    return normalizeAppointmentCancelReasons(setting?.value);
  }

  async setAppointmentCancelReasons(reasons: string[]): Promise<AppSetting> {
    const normalized = Array.from(new Set(reasons.map((reason) => reason.trim()).filter(Boolean)));
    if (!normalized.length) {
      throw new Error("At least one appointment cancellation reason is required");
    }
    const value = JSON.stringify(normalized);
    const [setting] = await db
      .insert(appSettings)
      .values({ orgId: this.orgId, key: "appointment_cancel_reschedule_reasons", value })
      .onConflictDoUpdate({
        target: [appSettings.orgId, appSettings.key],
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  async getProductApplicationsByServiceRecord(serviceRecordId: string): Promise<ProductApplication[]> {
    return db.select().from(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, serviceRecordId)));
  }

  async createProductApplication(data: InsertProductApplication): Promise<ProductApplication> {
    const [pa] = await db.insert(productApplications).values({ ...data, orgId: this.orgId }).returning();
    return pa;
  }

  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.orgId, this.orgId));
  }

  async getInvoicesByLocation(locationId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.locationId, locationId)));
  }

  async getLocationBalancesByCustomer(customerId: string): Promise<LocationBalanceSummary[]> {
    const customerInvoices = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.customerId, customerId)));
    const balances = new Map<string, LocationBalanceSummary>();

    for (const invoice of customerInvoices) {
      if (!invoice.locationId) {
        continue;
      }

      const current = balances.get(invoice.locationId) ?? {
        locationId: invoice.locationId,
        openBalanceCents: 0,
        totalInvoicedCents: 0,
        invoiceCount: 0,
      };

      const invoiceTotalCents = invoice.totalAmountCents;
      current.totalInvoicedCents += invoiceTotalCents;
      current.invoiceCount += 1;

      if (invoice.status !== "paid") {
        current.openBalanceCents += invoiceTotalCents;
      }

      balances.set(invoice.locationId, current);
    }

    return Array.from(balances.values());
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
    return inv;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [inv] = await db.insert(invoices).values({ ...data, orgId: this.orgId }).returning();
    return inv;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [inv] = await db.update(invoices).set(data).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id))).returning();
    return inv;
  }

  async getCommunications(customerId: string): Promise<Communication[]> {
    return db.select().from(communications).where(and(eq(communications.orgId, this.orgId), eq(communications.customerId, customerId))).orderBy(desc(communications.sentAt));
  }

  async getCommunicationsByLocation(locationId: string): Promise<Communication[]> {
    return db.select().from(communications).where(and(eq(communications.orgId, this.orgId), eq(communications.locationId, locationId))).orderBy(desc(communications.sentAt));
  }

  async getAllCommunications(): Promise<Communication[]> {
    return db.select().from(communications).where(eq(communications.orgId, this.orgId)).orderBy(desc(communications.sentAt));
  }

  async createCommunication(data: InsertCommunication): Promise<Communication> {
    const [comm] = await db.insert(communications).values({ ...data, orgId: this.orgId }).returning();
    return comm;
  }

  async getLocationScopedCounts(locationId: string): Promise<{ contacts: number; appointments: number; agreements: number; services: number; invoices: number; communications: number; opportunities: number }> {
    const [cts, appts, agrs, svcs, invs, comms, opps] = await Promise.all([
      db.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, locationId))),
      db.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.locationId, locationId))),
      db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.locationId, locationId))),
      db.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.locationId, locationId))),
      db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.locationId, locationId))),
      db.select().from(communications).where(and(eq(communications.orgId, this.orgId), eq(communications.locationId, locationId))),
      db.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.locationId, locationId), eq(opportunities.status, "OPEN"))),
    ]);
    return { contacts: cts.length, appointments: appts.length, agreements: agrs.length, services: svcs.length, invoices: invs.length, communications: comms.length, opportunities: opps.length };
  }
}

export function createOrgScopedStorage(orgId: string): IStorage {
  return new DatabaseStorage(orgId);
}

export const userStorage = {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  },

  async createUser(data: InsertUser, orgId: string): Promise<User> {
    const [user] = await db.insert(users).values({ ...data, orgId }).returning();
    return user;
  },
};
