import {
  auditLogs,
  accounts,
  customers, contacts, locations, serviceTypes, appointments,
  technicians,
  services,
  opportunities,
  opportunityActivities,
  opportunityDispositions,
  opportunityCategories,
  zones,
  opportunityAssignmentRules,
  technicianPreferences,
  appointmentTechnicians,
  agreements,
  agreementTemplates,
  agreementCancellationPolicies,
  billingPlans,
  appSettings,
  serviceRecords, productApplications, materialProducts, targetPests, invoices, invoiceLineItems, invoiceCounters, communications,
  payments, paymentApplications, creditMemos, creditApplications,
  billingProfiles, billingProfileTemplates, customerNotes,
  taxRates, taxRules, taxExemptionCertificates,
  billingEvents,
  documents, organizations,
  productionValueEntries,
  noteRevisions,
  users,
  type User, type InsertUser, type UserSummary,
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
  type OpportunityCategory, type InsertOpportunityCategory,
  type Zone, type InsertZone,
  type OpportunityAssignmentRule, type InsertOpportunityAssignmentRule,
  type TechnicianPreference,
  type ProductApplication, type InsertProductApplication,
  type MaterialProduct, type InsertMaterialProduct,
  type TargetPest, type InsertTargetPest,
  type Invoice, type InsertInvoice,
  type InvoiceLineItem,
  type Payment, type PaymentApplication, type CreditMemo, type CreditApplication,
  type Communication, type InsertCommunication,
  type BillingProfile, type InsertBillingProfile,
  type BillingProfileTemplate, type InsertBillingProfileTemplate,
  type TaxRate, type InsertTaxRate,
  type TaxRule, type InsertTaxRule,
  type TaxExemptionCertificate, type InsertTaxExemptionCertificate,
  type BillingEvent,
  type Document,
  type Organization, type InsertOrganization,
  type ProductionValueEntry,
  type CustomerNote,
  type NoteRevision,
  type AuditLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, inArray, notInArray, sql, gt, gte, lte, lt, asc, desc, ne, isNull, isNotNull, ilike, like, count, sum, max, type SQL } from "drizzle-orm";
import { auditChangeAction, type AuditAction, type AuditEntityType } from "@shared/audit";
import { PLACEHOLDER_LOCATION_NAME, PLACEHOLDER_LOCATION_NOTE } from "./account-bootstrap";
import { createHash } from "crypto";
import type { InvoiceDocumentBranding, InvoiceDocumentContext, ServiceReportDocumentContext, ServiceReportMaterialLine, StatementDocumentContext, StatementDocumentParty } from "./documents/types";
import { renderInvoicePdf } from "./documents/invoice-pdf";
import { renderStatementPdf } from "./documents/statement-pdf";
import { renderServiceReportPdf } from "./documents/service-report-pdf";
import {
  buildZeroBalanceLetter,
  LOCATION_HAS_BALANCE,
  summarizeAccountStatement,
  summarizeLocationStatement,
  zeroBalanceLetterRefusal,
  type AccountStatement,
  type LocationStatement,
  type StatementGenerateResult,
  type StatementInfo,
  type StatementLedgerInput,
  type StatementPeriod,
  type StatementVariant,
  type ZeroBalanceLetter,
  type ZeroBalanceLetterAgreement,
} from "@shared/statements";
import { can, PERMISSIONS, rolesWithPermission, type UserRole } from "@shared/permissions";
import {
  ACCOUNT_SCOPE_PRIMARY_ONLY,
  EXCLUSION_OVERRIDE_FORBIDDEN,
  EXCLUSION_OVERRIDE_REASON_REQUIRED,
  LOCATION_HAS_NO_ACCOUNT,
  PREFERENCE_NOT_FOUND,
  PREFERENCE_NOT_HONORED,
  TECHNICIAN_EXCLUDED,
  TECHNICIAN_NOT_FOUND,
  describeExclusionRefusal,
  describePreferenceBypass,
  findExclusion,
  preferredTechnicians,
  resolveEffectivePreferences,
  type EffectiveTechnicianPreference,
  type ExclusionOverrideRequest,
  type LocationTechnicianPreferences,
  type TechnicianPreferenceKind,
  type TechnicianPreferenceScope,
  type TechnicianPreferenceView,
} from "@shared/technician-preferences";
import {
  CREW_LEAD_NOT_REMOVABLE,
  CREW_LEAD_REQUIRED,
  CREW_MEMBER_EXISTS,
  CREW_MEMBER_NOT_FOUND,
  CREW_NOT_EDITABLE,
  CREW_SCHEDULE_CONFLICT,
  describeCrewConflicts,
  plannedWindow,
  windowsOverlap,
  type AppointmentCrew,
  type AppointmentCrewMember,
  type AppointmentCrewRole,
  type CrewScheduleConflict,
  type SupportAssignment,
} from "@shared/appointment-crew";
import { isTicketFinalized, isTicketInOfficeReview } from "@shared/ticket-status";
import {
  REOPEN_OTHER_FORBIDDEN,
  REOPEN_REASON_NOT_ON_LIST,
  REOPEN_REASON_OTHER,
  REOPEN_REASON_TEXT_REQUIRED,
  TICKET_REOPEN_REASONS_SETTING_KEY,
  isOtherReopenReason,
  normalizeTicketReopenReasons,
  sanitizeTicketReopenReasons,
} from "@shared/ticket-reopen";
import {
  APPLICATION_AREAS_SETTING_KEY,
  MATERIAL_UNITS_SETTING_KEY,
  applicationAreasOf,
  deriveAreasServiced,
  deriveTicketTargetPests,
  targetPestsOf,
  type MaterialRowPests,
  normalizeApplicationAreas,
  normalizeMaterialUnits,
  sanitizeMaterialList,
  toListSpelling,
  toListSpellings,
} from "@shared/material-lists";
import { computeProductionValueCents } from "@shared/production-value";
import {
  defaultWorkKindForService,
  isCallbackKind,
  normalizeServiceWorkKind,
  productionBasisForService,
  resolveCallbackLinkShape,
  resolveCallbackLinkTarget,
  resolveWorkKindOverrideGate,
  type ServiceWorkKind,
} from "@shared/service-kind";
import { formatCents } from "@shared/money";
import { buildBillingPlanSnapshot as buildSharedBillingPlanSnapshot, isScheduleBilledPlan } from "@shared/billing-plan";
import { sortUsersByName, userDisplayName } from "@shared/users";
import { taxonomyForSource, type OpportunityWorkType } from "@shared/opportunities";
import { describeAssignmentRule, resolveAssignmentRule, sortAssignmentRules } from "@shared/opportunity-assignment";
import { normalizeZipCodes } from "@shared/zones";
import {
  APPOINTMENT_NOT_DISPOSITIONABLE,
  CANCEL_DISPOSITION_REQUIRED,
  DISPOSITION_REASON_NOT_ON_LIST,
  DISPOSITION_REASON_REQUIRED,
  opportunitySourceForDisposition,
  type AppointmentDispositionMode,
  type AppointmentDispositionOrigin,
  type AppointmentDispositionOutcome,
  type DispositionOpportunityChoice,
  type DispositionOpportunityOutcome,
  type DispositionServiceEffect,
  type DispositionServiceOutcome,
} from "@shared/appointment-disposition";
import {
  ADD_SERVICE_TARGET_REQUIRED,
  APPOINTMENT_NOT_COMPOSABLE,
  LAST_SERVICE_ON_APPOINTMENT,
  SERVICE_CANCEL_REQUIRED,
  SERVICE_HAS_TICKET,
  SERVICE_LOCATION_MISMATCH,
  SERVICE_NOT_ON_APPOINTMENT,
  SERVICE_NOT_PENDING,
  SERVICE_REMOVE_REQUIRED,
  SERVICE_SETTLED,
  SERVICE_TYPE_LOCKED,
  SERVICE_TYPE_UNKNOWN,
  VISIT_INVOICED,
  FIELD_ACTOR_REQUIRED,
  FIELD_ADD_NEW_ONLY,
  NEXT_STOP_OVERLAP,
  SERVICE_FIELD_REVIEWED,
  SERVICE_INSTRUCTIONS_LOCKED,
  SERVICE_NOT_FIELD_ADDED,
  describeNextStopOverlap,
  extendPlannedEnd,
  isActiveOnVisit,
  overlapsNextStop,
  pickRepresentative,
  type AppointmentCompositionResult,
  type CompositionOrigin,
  type NewPlacedServiceRequest,
  type NextStopRef,
  type ServiceCancelEffect,
  type ServiceCancelResult,
} from "@shared/appointment-composition";
import { addDays, advanceAgreementDate, computeExpectedServiceCount } from "@shared/agreement-schedule";
// Transitional re-export (Pass 7): the calendar arithmetic moved to
// shared/agreement-schedule.ts so the client's billing-plan pill and the
// nightly run compute a per-period amount the same way. server/jobs/billing-run.ts
// and server/production-value-backfill.ts still import it from here.
export { advanceAgreementDate, computeExpectedServiceCount };
import type { VisitBillingDraft, VisitBillingSummary, VisitChargeBilling, VisitServiceBilling } from "@shared/visit-billing";
import type { AppointmentInvoiceStatus, InvoiceBillToSnapshot, InvoiceDetail, InvoiceServiceLocationSnapshot } from "@shared/invoice-detail";
import type { BatchGenerateResult, BatchInvoiceFilters, BatchInvoicePreview, BatchInvoicePreviewCharge, BatchInvoicePreviewTicket } from "@shared/batch-invoice";
import {
  formatInitialChargeType,
  initialChargeFromTemplate,
  initialChargeSkipsFirstPeriod,
  initialChargeToTemplate,
  normalizeInitialCharge,
  resolveInitialChargeCents,
  resolveRemainingContractPriceCents,
  initialChargeRidesFirstVisit,
  officeMayCollectInitialCharge,
  type AgreementInitialChargeStatus,
  type InitialChargeDue,
  type InitialChargeFields,
  type InitialChargeInvoiceRef,
} from "@shared/initial-charge";
import { computeInvoiceRollup, deriveInvoiceStatus, isFullyAgreementCovered, isInvoiceIssued } from "@shared/invoice-status";
import {
  DEFAULT_SURCHARGE_LABEL,
  SURCHARGE_CREDIT_RULE,
  normalizeSurcharge,
  resolveFieldSurchargeGate,
  surchargeChanged,
  surchargeLineDescription,
  surchargeOf,
  type FieldSurchargeRefusal,
} from "@shared/field-surcharge";
import {
  CASH_CONFIRM_AUTHORITY_MESSAGE,
  isCreditMemoReasonCode,
  isManualPaymentMethod,
  PAYMENT_LIST_DEFAULT_LIMIT,
  PAYMENT_LIST_MAX_LIMIT,
  paymentCountsAsPaid,
  paymentHoldsValue,
  summarizeCollections,
  utcDayRange,
  type BatchConfirmResult,
  type CollectionsReport,
  type InvoiceLocationBalance,
  type LocationLedgerSummary,
  type PaymentCollectorOption,
  type PaymentListFilters,
  type PaymentListResult,
  type PaymentListRow,
  type PaymentListSummary,
  type UnappliedSource,
} from "@shared/payments";
import {
  INVOICE_ON_FINALIZE_SETTING_KEY,
  normalizeInvoiceOnFinalizeMode,
  type FinalizationInvoicingOutcome,
  type InvoiceOnFinalizeMode,
} from "@shared/invoice-on-finalize";
import {
  ATTACH_SERVICE_REPORT_SETTING_KEY,
  normalizeAttachServiceReport,
  serializeAttachServiceReport,
  serviceReportDay,
  serviceReportFileName,
} from "@shared/service-report";
import {
  DISPATCH_BOARD_SETTINGS_INVALID,
  DISPATCH_BOARD_SETTING_FIELDS,
  DISPATCH_BOARD_SETTING_KEYS,
  DISPATCH_BOARD_SETTING_KEY_LIST,
  describeDispatchBoardProblem,
  normalizeDispatchBoardSettings,
  serializeDispatchBoardSetting,
  type DispatchBoardSettings,
} from "@shared/dispatch-board";
import {
  agingAsOf,
  agingFiguresOf,
  compareLocationAging,
  rollupAging,
  summarizeAgingByLocation,
  type AgingOnAccountInput,
  type AgingReport,
  type AgingReportCustomer,
  type AgingReportLocation,
  type CustomerAging,
} from "@shared/aging";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// A helper that only reads can run inside a transaction or straight off the
// pool (the document render, which is outside any transaction).
type DbReader = DbTransaction | typeof db;

// One line, the way every customer-facing document prints a location:
// "1100 W Pipeline Rd, Hurst, TX, 76053". Null when the row has no address
// text at all rather than an empty string, so renderers can skip the line.
function formatLocationAddress(location: Pick<Location, "address" | "city" | "state" | "zip">): string | null {
  const line = [location.address, location.city, location.state, location.zip]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return line || null;
}

// The Service Location party as a document prints it: the location's name
// and its one-line address, both trimmed (one dev-DB row carries trailing
// spaces in its name and city, and a frozen snapshot should not).
function describeServiceLocation(location: Pick<Location, "name" | "address" | "city" | "state" | "zip">): InvoiceServiceLocationSnapshot {
  return { name: location.name.trim(), address: formatLocationAddress(location) };
}

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
  /** Sum of balanceDueCents across the location's issued invoices (D5: from the ledger, DRAFT excluded). */
  openBalanceCents: number;
  totalInvoicedCents: number;
  invoiceCount: number;
  /** Confirmed payments and issued credit memos with value not yet applied to any invoice (D4: at the location). */
  unappliedBalanceCents: number;
}

export interface AuditActor {
  userId?: string | null;
  actorLabel?: string | null;
}

// Canon §17: the explicit form of a system-driven write - no user, the label
// "System" the History tab prints. Pass 26 (C4.1b): the assignment rules stamp
// an opportunity's assignee under this actor - a rule is the office's standing
// instruction, not a person's act or permission. Pass 32 (C5.1a, the same
// reasoning): an agreement's own schedule executing - the service it
// generates, the recurrence advancing nextServiceDate, the billing run's
// nextBillingDate - signs as System, whichever request happened to run it;
// everything else a request causes, derived writes included (the primary
// flag the location invariant flips, the agreement dates a placement
// re-derives), is signed by that request's user.
export const SYSTEM_AUDIT_ACTOR: AuditActor = { userId: null, actorLabel: "System" };

// One audit row. `before`/`after` are whole-row snapshots (or the relevant
// subset of one) written straight to jsonb; the client diffs them at read time
// via diffAuditSnapshots(), so callers should not pre-flatten them into prose.
export interface AuditLogEntry {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actor?: AuditActor | null;
  /** State before the mutation. Omit for a create. */
  before?: unknown;
  /** State after the mutation. Omit for a delete. */
  after?: unknown;
}

// Structural minimum recordAuditLogTx() needs from its caller: satisfied by both
// `db` and a transaction handle, so a caller already inside db.transaction()
// passes its `tx` and gets the audit row committed atomically with the
// mutation it describes.
type AuditLogWriter = Pick<typeof db, "insert">;

// Callers may ask for more, but a history panel that renders thousands of rows
// helps nobody and the table only grows from here.
const AUDIT_LOG_DEFAULT_LIMIT = 100;
const AUDIT_LOG_MAX_LIMIT = 500;

export interface CreateCustomerWithPrimaryLocationInput {
  customer: InsertCustomer;
  location: Omit<InsertLocation, "customerId" | "accountId" | "isPrimary">;
  initialContact?: Omit<InsertContact, "customerId" | "locationId">;
  actor?: AuditActor | null;
}

export interface CreateLocationWithPrimaryContactInput {
  location: InsertLocation;
  initialContact?: Omit<InsertContact, "customerId" | "locationId">;
  actor?: AuditActor | null;
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
  // Q3 (PLAN_BILLING_V1_1_EXECUTION.md §5): what to do with DRAFT invoices on
  // the appointments this cancellation cancels. Undefined means the caller has
  // not decided yet - the cancel refuses with DraftInvoiceDecisionRequiredError
  // so the UI can ask, rather than auto-voiding or silently orphaning them.
  voidDraftInvoices?: boolean;
  actor?: AuditActor;
}

// D9 (Pass 16): a ticket edit or re-post that the ticket's state forbids.
// Routes send `status` straight through: 409 when the ticket is FINALIZED
// (anyone - "reopen first"), 403 when a technician re-posts a ticket the
// office holds in review (EDIT_TICKET would let the office do it).
export class TicketLockedError extends Error {
  constructor(
    readonly code: "TICKET_FINALIZED" | "TICKET_IN_REVIEW",
    readonly status: 403 | 409,
    message: string,
  ) {
    super(message);
    this.name = "TicketLockedError";
  }
}

// Pass 17 (PLAN_ROADMAP_V2.md C3.2): a reopen the reason forbids - 400
// REOPEN_REASON_NOT_ON_LIST / REOPEN_REASON_TEXT_REQUIRED, 403
// REOPEN_OTHER_FORBIDDEN (shared/ticket-reopen.ts). Routes answer `status`
// with { code, message } so the pop-up can tell the refusals apart.
export class TicketReopenError extends Error {
  constructor(readonly status: 400 | 403, readonly code: string, message: string) {
    super(message);
    this.name = "TicketReopenError";
  }
}

// Pass 18 (PLAN_ROADMAP_V2.md C3.1b): an office edit the actor may not make -
// 403 PRICE_ADJUSTMENT_FORBIDDEN when the body carries a price or type for an
// agreement-generated service without ADJUST_PRICE_AGREEMENT (told who may,
// the Pass 17 pattern), 400 SERVICE_NOT_FOUND when the ticket has no service
// to price. Routes answer `status` with { code, message }.
export class TicketEditError extends Error {
  constructor(readonly status: 400 | 403, readonly code: string, message: string) {
    super(message);
    this.name = "TicketEditError";
  }
}

// Pass 19 (PLAN_ROADMAP_V2.md C3.3): the billing-summary read was asked to
// price a draft for a service that is not on the visit - 400
// DRAFT_SERVICE_NOT_ON_VISIT (a stale ticket, never a silent no-op). Routes
// answer `status` with { code, message }.
export class VisitBillingDraftError extends Error {
  constructor(readonly status: 400, readonly code: string, message: string) {
    super(message);
    this.name = "VisitBillingDraftError";
  }
}

// Pass 24 (PLAN_ROADMAP_V2.md C3.7): a Service's work kind or its callback
// link refused - 400 for the link's shape or target (shared/service-kind.ts
// CallbackLinkRefusalCode), 403 WORK_KIND_FORBIDDEN for a role that may not
// set the kind away from the type's default or change it later (the price's
// permission), 409 SERVICE_KIND_LOCKED once the ticket is finalized or the
// visit invoiced. The routes answer { code, message }.
export class ServiceKindError extends Error {
  constructor(readonly status: 400 | 403 | 409, readonly code: string, message: string) {
    super(message);
    this.name = "ServiceKindError";
  }
}

// Pass 24: who is writing a Service - the session's role decides whether a
// kind override is allowed, the actor signs the `work_kind_changed` audit
// row. Absent on a server-driven write (generation, the seed).
export interface ServiceWriteContext {
  actorRole?: UserRole | null;
  actor?: AuditActor | null;
}

// Pass 19 (C3.3): the price typed on the technician's ticket but not yet
// posted, priced on the read and written nowhere. Pass 23 (C3.6): the
// surcharge typed on the ticket rides the same read, alone or beside the
// price (0 previews its removal), under the post's gate.
export interface VisitBillingDraftInput {
  serviceId: string;
  priceCents?: number;
  surchargeCents?: number;
  /** The session's role: the post's rule (ADJUST_PRICE_AGREEMENT) decides whether an agreement-generated service is re-priced; ADD_FIELD_SURCHARGE and the template's toggle whether the surcharge is priced. */
  actorRole: UserRole | string;
}

export interface ReopenServiceRecordInput {
  id: string;
  /** A reason on the settings list, as written there, or OTHER. */
  reasonCode: string;
  /** Required for OTHER; optional detail beside a listed reason. */
  reason?: string | null;
  /** The session user's role (routes.ts) - OTHER needs REOPEN_TICKET_OTHER. */
  actorRole: UserRole;
  actor?: AuditActor | null;
}

// The office's edit of a posted ticket (PATCH /api/service-records/:id,
// EDIT_TICKET). Content only: the lifecycle columns (confirmed, ticketStatus,
// the posted / finalized / reopened / flagged stamps, readyForBilling) belong
// to post / finalize / reopen, and the identity columns (service, appointment,
// customer, location) never move. Materials are replace-all when sent,
// untouched when omitted. Since Pass 18 (C3.1b) the Service's price and type
// ride along: applied to the Service under the post's rule (a manual service,
// or ADJUST_PRICE_AGREEMENT on an agreement-generated one - 403 for anyone
// else), the ticket's serviceTypeId following the Service's as a post copies
// it, and a price that moved logged `price_overridden` on the Service exactly
// as a post's is - in the one transaction with the ticket edit.
export interface UpdateServiceRecordInput {
  serviceDate?: Date;
  technicianId?: string | null;
  notes?: string | null;
  targetPests?: string[] | null;
  areasServiced?: string | null;
  conditionsFound?: string | null;
  recommendations?: string | null;
  followUpRequired?: boolean;
  followUpNotes?: string | null;
  customerSignature?: boolean | null;
  productApplications?: Array<Omit<InsertProductApplication, "serviceRecordId">>;
  /** The Service's type; null keeps the current one (the post's rule). */
  serviceTypeId?: string | null;
  /** The Service's stamped price; null clears the stamp (an agreement service back to its derived amount). */
  priceCents?: number | null;
  /**
   * Pass 23 (C3.6): the ticket's field surcharge. Omitted, it stays as
   * stored; null or 0 removes it; a positive amount records or changes it
   * (the label defaulting to "Cleanout surcharge"). A change is gated by
   * ADD_FIELD_SURCHARGE and, for an agreement service, the template's toggle
   * (403 SURCHARGE_FORBIDDEN / SURCHARGE_NOT_ALLOWED before anything is
   * written) and logged `surcharge_recorded`.
   */
  surchargeCents?: number | null;
  surchargeLabel?: string | null;
  /** The session user's role (routes.ts) - a price or type on an agreement-generated service needs ADJUST_PRICE_AGREEMENT. */
  actorRole?: UserRole;
  actor?: AuditActor | null;
}

// The org's material vocabularies (Pass 20, C3.4a; shared/material-lists.ts):
// the two app_settings lists, the defaults when the org has not saved one,
// and (Pass 21, C3.4b) the target-pest list - the target_pests table's
// active rows, in the order GET /api/target-pests offers them.
export interface MaterialVocabulary {
  units: string[];
  areas: string[];
  pests: string[];
}

// What a post and an edit both do to the materials they were sent: trim the
// name, drop nameless rows, trim the notes to null, and put the row's
// vocabulary in the org's spelling (Pass 20) - the unit, each application
// area and (Pass 21, C3.4b) each target pest rewritten to the list's entry
// where they match one apart from casing or whitespace, kept as written
// otherwise (never refused; see shared/material-lists.ts for why).
// applicationAreas and targetPests are each deduped, order kept, null when
// there are none. The single applicationLocation the rows carried before
// Pass 20 is gone (Pass 21 dropped the column); a body naming it is not read.
function normalizeProductApplicationInputs(
  list: Array<Omit<InsertProductApplication, "serviceRecordId">> | null | undefined,
  vocabulary: MaterialVocabulary,
): Array<Omit<InsertProductApplication, "serviceRecordId">> {
  return (list ?? [])
    .map((application) => {
      const areas = toListSpellings(vocabulary.areas, applicationAreasOf(application));
      const pests = toListSpellings(vocabulary.pests, targetPestsOf(application));
      return {
        ...application,
        productName: application.productName?.trim() ?? "",
        unit: toListSpelling(vocabulary.units, application.unit),
        applicationAreas: areas.length ? areas : null,
        targetPests: pests.length ? pests : null,
        notes: application.notes?.trim() || null,
      };
    })
    .filter((application) => application.productName);
}

// The ticket-level target pests as stored (Pass 21, C3.4b): the ticket's own
// picks - the body's, or the stored set when the body omits them - plus every
// material row's pests, in the list's spelling (shared/material-lists.ts
// deriveTicketTargetPests). The rows are the ones the ticket ends up with:
// the body's when materials are sent, the existing rows otherwise, so the
// set never names fewer pests than the rows do. An empty union keeps the
// picks' own shape (null stays null, [] stays []), so a re-save changes nothing.
function deriveStoredTargetPests(
  list: readonly string[],
  selected: readonly string[] | null | undefined,
  rows: readonly MaterialRowPests[],
): string[] | null {
  const union = deriveTicketTargetPests(list, selected, rows);
  if (union.length) return union;
  return selected == null ? null : [];
}

// The `ticket_edited` snapshot (D9, Pass 16): the ticket row plus its
// materials as content, without the per-row ids - a post deletes and
// reinserts the materials, so with ids two identical lists would never
// compare equal and every re-post would show its materials as changed.
const PRODUCT_APPLICATION_SNAPSHOT_FIELDS = [
  "materialProductId",
  "productName",
  "epaRegNumber",
  "dilutionLabel",
  "dilutionRate",
  "amountApplied",
  "unit",
  "activeIngredientAmount",
  "applicationMethod",
  "device",
  "applicationAreas",
  "targetPests",
  "notes",
] as const;
type ProductApplicationSnapshot = Record<(typeof PRODUCT_APPLICATION_SNAPSHOT_FIELDS)[number], string | string[] | null>;

function snapshotProductApplication(row: Partial<Omit<InsertProductApplication, "serviceRecordId">>): ProductApplicationSnapshot {
  const snapshot = {} as ProductApplicationSnapshot;
  for (const field of PRODUCT_APPLICATION_SNAPSHOT_FIELDS) {
    snapshot[field] = row[field] ?? null;
  }
  return snapshot;
}

function snapshotTicketForAudit(record: ServiceRecord, applications: Array<Partial<Omit<InsertProductApplication, "serviceRecordId">>>) {
  return { ...record, productApplications: applications.map(snapshotProductApplication) };
}

// Structural equality for a ticket field: Dates, arrays and nulls compare by
// value, the way diffAuditSnapshots() compares the stored snapshots.
function ticketFieldsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export interface CompleteServiceInput {
  serviceId: string;
  actorRole: UserRole;
  /** Session actor (routes.ts getAuditActor) for the D7 price-override row. */
  actor?: AuditActor | null;
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
  /**
   * Pass 23 (C3.6): the field surcharge line. A post writes the ticket
   * whole, so an omitted or zero amount means none (a re-post without it
   * removes one the ticket carried). Gated as the office edit's is when it
   * records, changes or removes one; logged `surcharge_recorded`.
   */
  surchargeCents?: number | null;
  surchargeLabel?: string | null;
}

export interface CompleteServiceResult {
  service: Service;
  appointment?: Appointment | null;
  serviceRecord: ServiceRecord;
  productApplications: ProductApplication[];
  // service.priceCents if a real override was stamped (manual service, or a
  // manager/admin override on an agreement-generated one); otherwise the
  // live-computed value from the related agreement. See
  // shared/production-value.ts.
  productionValueCents: number | null;
}

// The service report (PLAN_ROADMAP_V2.md C3.5, Pass 22): a stored report is
// its `documents` row plus the file name the document route sends
// (service-report-<service day>-<location>.pdf, shared/service-report.ts).
export interface ServiceReportDocumentResult {
  document: Document;
  fileName: string;
}

// The collect step's preview of an UNPOSTED ticket: the post's content shape
// (completeServiceSchema in routes.ts) plus the service it belongs to. The
// report is rendered from this exactly as a post would store it - the same
// vocabulary rule for the materials, the same target-pest union, the same
// technician snapshot resolution - and nothing is written.
export interface ServiceReportPreviewInput {
  serviceId: string;
  appointmentId?: string | null;
  technicianId?: string | null;
  serviceDate: Date;
  serviceTypeId?: string | null;
  notes?: string | null;
  targetPests?: string[] | null;
  areasServiced?: string | null;
  conditionsFound?: string | null;
  recommendations?: string | null;
  followUpRequired?: boolean | null;
  followUpNotes?: string | null;
  customerSignature?: boolean | null;
  productApplications?: Array<Omit<InsertProductApplication, "serviceRecordId">>;
  /** Pass 23 (C3.6): the surcharge as typed, printed as the post would store it; nothing is gated here because nothing is written. */
  surchargeCents?: number | null;
  surchargeLabel?: string | null;
}

export interface ServiceReportPreviewResult {
  pdf: Buffer;
  fileName: string;
}

export type ServiceTimeTrackingMode = "AUTO_TIMEOUT_ON_TICKET_POST" | "PROMPT_FOR_TIMEOUT" | "MANUAL_TIMEOUT";

// D2: finalization's answer. `invoicing` is null unless THIS finalization
// completed the visit (every active service on the appointment now finalized)
// - only then is there an invoicing decision to report. Appointment-less
// tickets never carry one: they bill through the ready-for-billing list.
export interface FinalizeServiceRecordResult {
  record: ServiceRecord;
  invoicing: FinalizationInvoicingOutcome<Invoice> | null;
}

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

// Pass 27 (PLAN_ROADMAP_V2.md C4.2): the one cancel / reschedule path. The
// vocabulary is shared/appointment-disposition.ts.
export interface AppointmentDispositionInput {
  appointmentId: string;
  mode: AppointmentDispositionMode;
  // OFFICE is the board's route; FIELD is the technician alias - a handoff,
  // not disposal (canon §9): every service returns to the queue whatever the
  // mode, none is cancelled.
  origin: AppointmentDispositionOrigin;
  // Required for CANCEL, optional for RESCHEDULE (the technician's request
  // carries one, the office's board reschedule does not); when given it must
  // be on the settings list.
  reasonCode?: string | null;
  notes?: string | null;
  opportunity: DispositionOpportunityChoice;
  // See CancelAgreementInput.voidDraftInvoices - same Q3 prompt, same
  // three-way meaning (undefined = ask, true = void, false = keep).
  voidDraftInvoices?: boolean;
  actor?: AuditActor | null;
}

export interface AppointmentDispositionResult extends AppointmentDispositionOutcome {
  appointment: Appointment;
}

// A disposition the input or the appointment's state forbids, and the status
// PATCH's attempt to cancel. Routes answer `status` with { code, message } so
// the client can tell the reasons apart.
export class AppointmentDispositionError extends Error {
  constructor(readonly status: 400 | 409, readonly code: string, message: string) {
    super(message);
    this.name = "AppointmentDispositionError";
  }
}

// Pass 28 (PLAN_ROADMAP_V2.md C4.3a): the composition of a visit - a service
// added, returned to the queue, re-typed or re-timed - and ONE service
// cancelled outright. The vocabulary is shared/appointment-composition.ts;
// the routes answer `status` with { code, message }.
export class ServiceCompositionError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, readonly code: string, message: string) {
    super(message);
    this.name = "ServiceCompositionError";
  }
}

export interface AddServiceToAppointmentInput {
  appointmentId: string;
  /** A PENDING_SCHEDULING service at the visit's location. Refused with origin FIELD. */
  serviceId?: string | null;
  /** Or a new one-time service, created placed. */
  service?: NewPlacedServiceRequest | null;
  /** Pass 29 (C4.3b): OFFICE (default) or FIELD - the technician's Appointment Details. */
  origin?: CompositionOrigin | null;
  actorRole?: UserRole | null;
  actor?: AuditActor | null;
}

export interface RemoveServiceFromAppointmentInput {
  appointmentId: string;
  serviceId: string;
  actor?: AuditActor | null;
}

export interface UpdateAppointmentServiceInput {
  appointmentId: string;
  serviceId: string;
  serviceTypeId?: string;
  expectedDurationMinutes?: number | null;
  actorRole?: UserRole | null;
  actor?: AuditActor | null;
}

export interface CancelServiceInput {
  serviceId: string;
  /** Required, from the settings list. */
  reasonCode: string;
  notes?: string | null;
  opportunity: DispositionOpportunityChoice;
  actorRole?: UserRole | null;
  actor?: AuditActor | null;
}

/** Pass 29 (C4.3b): the office marks a field-added service reviewed. */
export interface FieldReviewServiceInput {
  serviceId: string;
  actor?: AuditActor | null;
}

// Pass 30 (PLAN_ROADMAP_V2.md C4.4; B14): a placement of a technician the
// customer EXCLUDED - 409 TECHNICIAN_EXCLUDED (the body names the technician,
// the preference row and its scope, so the client can prompt a manager for
// the override), 403 EXCLUSION_OVERRIDE_FORBIDDEN, 400
// EXCLUSION_OVERRIDE_REASON_REQUIRED. Nothing is written before it is thrown.
export class PlacementRefusedError extends Error {
  constructor(
    readonly status: 400 | 403 | 409,
    readonly code: string,
    message: string,
    readonly exclusion: EffectiveTechnicianPreference | null = null,
    // Pass 30b: the PREFERRED technicians the placement passes over (PREFERENCE_NOT_HONORED, and named on TECHNICIAN_EXCLUDED).
    readonly preferred: EffectiveTechnicianPreference[] = [],
    readonly technician: { id: string; name: string } | null = null,
  ) {
    super(message);
    this.name = "PlacementRefusedError";
  }
}

// Pass 30: a preference write the location forbids (an account-wide row off
// the primary location, a location with no account) or names nothing.
export class TechnicianPreferenceError extends Error {
  constructor(readonly status: 404 | 409, readonly code: string, message: string) {
    super(message);
    this.name = "TechnicianPreferenceError";
  }
}

// Pass 31 (C4.5): a dispatch board setting the shared rules refuse - start
// not before end, a snap coarser than the view interval, an hour off the
// board (shared/dispatch-board.ts). The route answers 400 with the code.
export class DispatchBoardSettingsError extends Error {
  readonly code = DISPATCH_BOARD_SETTINGS_INVALID;
  constructor(message: string) {
    super(message);
    this.name = "DispatchBoardSettingsError";
  }
}

// Pass 30: a crew change the visit forbids (shared/appointment-crew.ts codes).
export class AppointmentCrewError extends Error {
  constructor(readonly status: 404 | 409, readonly code: string, message: string, readonly conflicts: CrewScheduleConflict[] = []) {
    super(message);
    this.name = "AppointmentCrewError";
  }
}

/** Pass 30: what a placement carries for the exclusion check - the manager's override and who asks. */
export interface PlacementOptions {
  overrideExclusion?: ExclusionOverrideRequest | null;
  /** Pass 30b: the user confirmed placing someone other than the customer's preferred technician. */
  acknowledgePreference?: boolean;
  actorRole?: UserRole | null;
  actor?: AuditActor | null;
}

/** Pass 30: set (create or change) one technician's preference at a location or, from the primary location, for all locations. */
export interface TechnicianPreferenceSetInput {
  locationId: string;
  technicianId: string;
  kind: TechnicianPreferenceKind;
  note?: string | null;
  scope: TechnicianPreferenceScope;
  actor?: AuditActor | null;
}

export interface TechnicianPreferenceClearInput {
  locationId: string;
  preferenceId: string;
  actor?: AuditActor | null;
}

export interface AppointmentCrewAddInput extends PlacementOptions {
  appointmentId: string;
  technicianId: string;
  /** Pass 30b: the user confirmed adding a technician who is already booked during the visit. */
  confirmConflicts?: boolean;
}

export interface AppointmentCrewRemoveInput {
  appointmentId: string;
  technicianId: string;
  actor?: AuditActor | null;
}

interface ExclusionOverrideApplied {
  exclusion: EffectiveTechnicianPreference;
  reason: string;
  /** Pass 30b: the preferred technicians the override also passed over. */
  preferredBypassed: EffectiveTechnicianPreference[];
}

/** Pass 30b: what the placement checks let through, to be recorded once the write is done. */
interface PlacementChecksApplied {
  override: ExclusionOverrideApplied | null;
  preferenceBypassed: EffectiveTechnicianPreference[] | null;
}

function preferenceAuditList(entries: EffectiveTechnicianPreference[]) {
  return entries.map((entry) => ({ technicianId: entry.technicianId, technicianName: entry.technicianName, scopeType: entry.scopeType, note: entry.note }));
}


function technicianPreferenceAuditSnapshot(row: TechnicianPreference, technicianName: string) {
  return {
    id: row.id,
    scopeType: row.scopeType,
    accountId: row.accountId,
    locationId: row.locationId,
    technicianId: row.technicianId,
    technicianName,
    kind: row.kind,
    note: row.note,
  };
}

function crewAuditSnapshot(members: AppointmentCrewMember[]) {
  return members.map((member) => ({ technicianId: member.technicianId, technicianName: member.technicianName, role: member.role }));
}

// Pass 15 (PLAN_ROADMAP_V2.md C2.5): a paid-in-full letter asked of a
// location that still owes something. The route answers 409 with the code
// and the balance; the office generates a location statement instead.
export class StatementRefusedError extends Error {
  constructor(readonly code: string, message: string, readonly balanceDueCents: number) {
    super(message);
    this.name = "StatementRefusedError";
  }
}

export interface DraftInvoiceRef {
  id: string;
  invoiceNumber: string;
  appointmentId: string | null;
  totalAmountCents: number;
}

// Q3: an appointment being cancelled carries a DRAFT invoice and the caller
// has not said whether to void it. Routes map this to 409 with the drafts
// listed, so the client can show "Void the draft invoice on this appointment?"
// and resubmit with voidDraftInvoices set either way.
export class DraftInvoiceDecisionRequiredError extends Error {
  readonly code = "DRAFT_INVOICE_DECISION_REQUIRED" as const;

  constructor(readonly draftInvoices: DraftInvoiceRef[]) {
    super(
      draftInvoices.length === 1
        ? `Appointment has draft invoice ${draftInvoices[0].invoiceNumber}; decide whether to void it before cancelling`
        : `Appointments have ${draftInvoices.length} draft invoices; decide whether to void them before cancelling`,
    );
    this.name = "DraftInvoiceDecisionRequiredError";
  }
}

export interface UnfinalizedTicketRef {
  serviceId: string;
  serviceRecordId: string | null;
  ticketStatus: string | null;
  description: string;
}

// D3: a DRAFT cannot be issued while any ticket on its visit is unfinalized,
// unless the caller holds ISSUE_INVOICE_PREFINALIZATION and explicitly asks
// for the override. Routes map this to 403 (no permission) or 409 (permission,
// no confirmation yet) with the tickets listed.
export class PrefinalizationIssueError extends Error {
  readonly code = "PREFINALIZATION_ISSUE_REQUIRED" as const;

  constructor(readonly unfinalizedTickets: UnfinalizedTicketRef[]) {
    super(
      `${unfinalizedTickets.length} of the services on this visit ${unfinalizedTickets.length === 1 ? "is" : "are"} not finalized; issuing before finalization requires a manager override and flags those tickets for review`,
    );
    this.name = "PrefinalizationIssueError";
  }
}

export interface IssueInvoiceInput {
  actor?: AuditActor | null;
  // REFUSE: throw PrefinalizationIssueError if anything on the visit is
  // unfinalized. OVERRIDE: issue anyway and flag those tickets. The route
  // decides which from the caller's role AND an explicit confirmation - a
  // manager never overrides by accident.
  prefinalization: "REFUSE" | "OVERRIDE";
}

// One line's worth of a visit invoice: a Service paired with its Service
// Record when one exists. Generation only ever passes finalized records with
// their services; the DRAFT path passes every active service on the
// appointment with whatever record it has, possibly none.
interface VisitBillingUnit {
  service: Service | undefined;
  record: ServiceRecord | undefined;
  serviceDate: Date;
}

interface VisitInvoiceLine {
  serviceId: string | null;
  serviceRecordId: string | null;
  lineType: "SERVICE" | "AGREEMENT_COVERED" | "INITIAL_CHARGE" | "SURCHARGE";
  description: string;
  unitPriceCents: number;
  amountCents: number;
  taxable: boolean;
  taxCents: number;
}

interface PricedVisitInvoice {
  lines: VisitInvoiceLine[];
  amountCents: number;
  taxCents: number;
  taxSnapshot: Record<string, unknown>;
  /** The agreements whose down payment rides this invoice (Pass 11d): the INITIAL_CHARGE events the issuing paths attach. */
  initialCharges: Array<{ agreementId: string; amountCents: number }>;
}

/** A down payment with no live INITIAL_CHARGE event yet, priced as the next visit invoice will carry it (Pass 11d). */
interface PendingInitialCharge {
  agreement: Agreement;
  description: string;
  amountCents: number;
  taxDecision: { taxable: boolean; taxCents: number; snapshot: Record<string, unknown> };
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
  /** Pass 30 (C4.4): LEAD when the visit is this technician's (assignedTechnicianId); SUPPORT when they are on its crew - listed read-only, the ticket stays the lead's. */
  crewRole: AppointmentCrewRole;
  /** Pass 30: the visit's crew, the lead first. */
  crew: AppointmentCrewMember[];
}

export interface OpportunityFilters {
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  serviceTypeId?: string;
  // Pass 25 (C4.1): the taxonomy and search filters, applied in SQL.
  categoryKey?: string;
  workType?: string;
  /** A user id, or null for "unassigned"; undefined leaves the assignee out. The route resolves "me". */
  assignedUserId?: string | null;
  source?: string;
  /** A prefix on the opportunity's location zip: "760" matches 76053 and 76102. */
  zip?: string;
  /** Free text over the location's name / address / city and its customer's name. */
  location?: string;
}

// Pass 25: what the PATCH may change. Content (notes, the two dates), the
// taxonomy, and the assignee; everything else on the row is identity or
// lifecycle and has its own path (dispositions, Convert) or none.
export interface OpportunityUpdateInput {
  notes?: string | null;
  dueDate?: string | null;
  nextActionDate?: string | null;
  categoryKey?: string;
  workType?: OpportunityWorkType;
  /** A user id to assign, null to unassign; undefined leaves the assignee alone. */
  assignedUserId?: string | null;
}

export interface OpportunityCategoryUpdateInput {
  label?: string;
  isActive?: boolean;
  sortOrder?: number;
}

// Pass 26 (C4.1b): zones and assignment rules - Settings reference data on
// the target_pests / opportunity_categories pattern, validated here and
// gated MANAGE_SETTINGS at the route.
export interface ZoneInput {
  name: string;
  /** As typed; normalized to unique five-digit ZIPs (shared/zones.ts), an invalid entry refused by name. */
  zipCodes: string[];
  isActive?: boolean;
  sortOrder?: number;
  notes?: string | null;
}
export type ZoneUpdateInput = Partial<ZoneInput>;

export interface OpportunityAssignmentRuleInput {
  /** A key of the org's category list, or null for any. */
  categoryKey?: string | null;
  workType?: OpportunityWorkType | null;
  /** One of the org's zones, or null for any. */
  zoneId?: string | null;
  /** One of OPPORTUNITY_SOURCES (checked by the route), or null for any. */
  source?: string | null;
  /** An active user of the org - required. */
  assignedUserId: string;
  isActive?: boolean;
  /** Appended after the last rule when omitted. */
  sortOrder?: number;
}
export type OpportunityAssignmentRuleUpdateInput = Partial<OpportunityAssignmentRuleInput>;

export class OpportunityAssignmentError extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly code: string, message: string) {
    super(message);
    this.name = "OpportunityAssignmentError";
  }
}

// What the assignment rules need at an opportunity's creation, loaded once
// per transaction (insertOpportunityTx): the active rules in order, every
// zone (an inactive one makes its rules skip), every user (an inactive one
// makes its rules skip) and the category labels for the audit row's text.
interface OpportunityAssignmentContext {
  rules: OpportunityAssignmentRule[];
  zones: Zone[];
  users: Array<{ id: string; firstName: string; lastName: string; status: string }>;
  categories: Array<{ key: string; label: string }>;
}

export interface ApplyOpportunityDispositionInput {
  opportunityId: string;
  dispositionId: string;
  nextActionDate?: string | null;
  notes?: string | null;
  actor?: AuditActor;
}

export interface CreateManualInvoiceInput {
  customerId: string;
  // Required since Pass 10 (canon rule 1: the location is the customer
  // record). A manual invoice without one showed on the global Invoices list
  // but on no location Invoices tab and in no location balance - an
  // invisible receivable. Validated in createManualInvoice: it must exist
  // in the org and belong to customerId.
  locationId: string;
  description?: string | null;
  amountCents: number;
  taxCents?: number | null;
  dueDate?: Date | null;
  notes?: string | null;
  actor?: AuditActor | null;
}

export interface GenerateScheduleDrivenInvoiceInput {
  agreementId: string;
  periodKey: string;
  amountCents: number;
  // Set on the agreement in the same transaction as the invoice, so the
  // charge and the schedule advance atomically - never out of sync even
  // across a crash between the two.
  nextBillingDate: string | null;
}

// PLAN_BILLING_V1_1.md D5 - the payments ledger's write surface. Every
// mutation is a new row or a lifecycle stamp; nothing edits a recorded amount.
// `actor` always comes from the session (routes.ts getAuditActor).

export interface RecordPaymentInput {
  locationId: string;
  method: string;
  amountCents: number;
  /** When the money changed hands. Defaults to now. */
  receivedAt?: Date | null;
  checkNumber?: string | null;
  referenceNumber?: string | null;
  memo?: string | null;
  /** Intent: the agreement this money is meant for. Application is the fact. */
  designatedAgreementId?: string | null;
  /**
   * Intent of the same kind: the visit the money was collected at, set by the
   * field's collect dialog and never by the office (D5 owner review of Pass
   * 7.5). Must be an appointment at the payment's location.
   */
  appointmentId?: string | null;
  /**
   * Apply to this invoice in the same transaction - the "collect against this
   * bill" path. Capped by what the invoice can still take; any remainder
   * stays unapplied at the location.
   */
  applyToInvoiceId?: string | null;
  actor?: AuditActor | null;
}

export interface RecordPaymentResult {
  payment: Payment;
  application: PaymentApplication | null;
  invoice: Invoice | null;
}

export interface ApplyLedgerSourceInput {
  invoiceId: string;
  /** Null / omitted = as much as the source has and the invoice can take. */
  amountCents?: number | null;
  actor?: AuditActor | null;
}

export interface ReleaseApplicationInput {
  applicationId: string;
  /** Required (D5): a release is a correction and the reason is part of the record. */
  reason: string;
  actor?: AuditActor | null;
}

export interface IssueCreditMemoInput {
  locationId: string;
  /** The invoice the memo corrects, when there is one. Informational. */
  invoiceId?: string | null;
  reasonCode: string;
  reason: string;
  amountCents: number;
  /** Apply to this invoice in the same transaction (usually the one it corrects). */
  applyToInvoiceId?: string | null;
  actor?: AuditActor | null;
}

export interface IssueCreditMemoResult {
  creditMemo: CreditMemo;
  application: CreditApplication | null;
  invoice: Invoice | null;
}

/** Everything applied to one invoice, with the source each application came from. */
export interface InvoiceLedger {
  invoice: Invoice;
  paymentApplications: Array<{ application: PaymentApplication; payment: Payment }>;
  creditApplications: Array<{ application: CreditApplication; creditMemo: CreditMemo }>;
}

export interface ApplyLocationBalanceResult {
  invoice: Invoice;
  applied: Array<{ kind: "payment" | "credit_memo"; sourceId: string; amountCents: number }>;
  appliedCents: number;
}

/** billing_events.periodKey for the one INITIAL_CHARGE event an agreement can carry (D4). */
export const INITIAL_CHARGE_PERIOD_KEY = "INITIAL_CHARGE";

/** What happened to an agreement's initial-charge receivable at creation (D4). */
export interface InitialChargeReceivableOutcome {
  action: "ISSUED" | "ALREADY_ISSUED" | "NO_CHARGE" | "REFUSED";
  invoice: Invoice | null;
  message?: string;
}

// The batch's shapes (Pass 13, PLAN_ROADMAP_V2.md C2.3) live in
// shared/batch-invoice.ts so the Invoices screen reads exactly what the
// server writes: the filters (a POSTING window plus an optional technician),
// the preview (each eligible ticket with what it will actually bill, resolved
// here through the same code generation uses, plus the down payments the
// visit invoices will carry) and the generate result. The result is reported
// per visit, not per ticket (PLAN_BILLING_V1_1_EXECUTION.md §2.3): two
// finalized tickets on one appointment are one invoice, so `totalEligible`
// counts tickets and `totalVisits` is how many invoices the run can produce.
export type BatchInvoicePreviewRow = BatchInvoicePreviewTicket;
export type { BatchGenerateResult, BatchInvoiceFilters, BatchInvoicePreview, BatchInvoicePreviewCharge };

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
  // Pass 32 (C5.1a): every create / update / status change below writes
  // audit_logs inside its transaction, signed by the actor the route passes
  // (routes.ts getAuditActor); the methods that took no actor gained one.
  createCustomer(data: InsertCustomer, actor?: AuditActor | null): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>, actor?: AuditActor | null): Promise<Customer | undefined>;
  getCustomerDetailCompat(legacyCustomerId: string, selectedLocationId?: string): Promise<CustomerDetailCompatProjection | undefined>;
  getAccountInvariantSummary(): Promise<AccountInvariantSummary>;
  createCustomerWithPrimaryLocation(input: CreateCustomerWithPrimaryLocationInput): Promise<Customer>;
  updateLocationProfile(input: UpdateLocationProfileInput): Promise<{ customer?: Customer; location: Location } | undefined>;

  getContacts(customerId: string): Promise<Contact[]>;
  getContactsByLocation(locationId: string): Promise<Contact[]>;
  createContact(data: InsertContact, actor?: AuditActor | null): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>, actor?: AuditActor | null): Promise<Contact | undefined>;
  setPrimaryContact(contactId: string, actor?: AuditActor | null): Promise<Contact | undefined>;

  getLocations(customerId: string): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(data: InsertLocation, actor?: AuditActor | null): Promise<Location>;
  createLocationWithPrimaryContact(input: CreateLocationWithPrimaryContactInput): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>, actor?: AuditActor | null): Promise<Location | undefined>;
  setPrimaryLocation(customerId: string, locationId: string, actor?: AuditActor | null): Promise<void>;

  getBillingProfileTemplates(includeInactive?: boolean): Promise<BillingProfileTemplate[]>;
  createBillingProfileTemplate(data: InsertBillingProfileTemplate, actor?: AuditActor | null): Promise<BillingProfileTemplate>;
  updateBillingProfileTemplate(id: string, data: Partial<InsertBillingProfileTemplate>, actor?: AuditActor | null): Promise<BillingProfileTemplate | undefined>;

  getBillingProfilesForAccount(accountId: string): Promise<BillingProfile[]>;
  createBillingProfile(data: InsertBillingProfile, actor?: AuditActor | null): Promise<BillingProfile>;
  updateBillingProfile(id: string, data: Partial<InsertBillingProfile>, actor?: AuditActor | null): Promise<BillingProfile | undefined>;
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
  // Pass 12: the org's users, sanitized - for the sold-by selector and the
  // technician -> user bridge. Never the password hash.
  getUsers(): Promise<UserSummary[]>;

  getServices(): Promise<Service[]>;
  getServicesByLocation(locationId: string): Promise<Service[]>;
  getPendingServices(window?: DispatchBoardWindow): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(data: InsertService, context?: ServiceWriteContext): Promise<Service>;
  updateService(id: string, data: Partial<InsertService>, context?: ServiceWriteContext): Promise<Service | undefined>;
  updateServiceType(id: string, data: Partial<InsertServiceType>): Promise<ServiceType | undefined>;
  deleteService(id: string, actor?: AuditActor | null): Promise<boolean>;
  getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | undefined>;
  getOpportunitiesByLocation(locationId: string): Promise<Opportunity[]>;

  updateOpportunity(id: string, data: OpportunityUpdateInput, actor?: AuditActor): Promise<Opportunity | undefined>;
  convertOpportunityToService(id: string, actor?: AuditActor): Promise<{ opportunity: Opportunity; service: Service } | undefined>;
  getOpportunityDispositions(includeInactive?: boolean): Promise<OpportunityDisposition[]>;
  createOpportunityDisposition(data: InsertOpportunityDisposition): Promise<OpportunityDisposition>;
  updateOpportunityDisposition(id: string, data: Partial<InsertOpportunityDisposition>): Promise<OpportunityDisposition | undefined>;
  getOpportunityActivitiesByOpportunity(opportunityId: string): Promise<OpportunityActivity[]>;
  applyOpportunityDisposition(input: ApplyOpportunityDispositionInput): Promise<Opportunity | undefined>;
  getOpportunityCategories(includeInactive?: boolean): Promise<OpportunityCategory[]>;
  updateOpportunityCategory(id: string, data: OpportunityCategoryUpdateInput): Promise<OpportunityCategory | undefined>;
  getZones(includeInactive?: boolean): Promise<Zone[]>;
  createZone(data: ZoneInput): Promise<Zone>;
  updateZone(id: string, data: ZoneUpdateInput): Promise<Zone | undefined>;
  deleteZone(id: string): Promise<boolean>;
  getOpportunityAssignmentRules(includeInactive?: boolean): Promise<OpportunityAssignmentRule[]>;
  createOpportunityAssignmentRule(data: OpportunityAssignmentRuleInput): Promise<OpportunityAssignmentRule>;
  updateOpportunityAssignmentRule(id: string, data: OpportunityAssignmentRuleUpdateInput): Promise<OpportunityAssignmentRule | undefined>;
  deleteOpportunityAssignmentRule(id: string): Promise<boolean>;
  reorderOpportunityAssignmentRules(ids: string[]): Promise<OpportunityAssignmentRule[]>;

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
  createAgreementTemplate(data: InsertAgreementTemplate, actor?: AuditActor | null): Promise<AgreementTemplate>;
  updateAgreementTemplate(id: string, data: Partial<InsertAgreementTemplate>, actor?: AuditActor | null): Promise<AgreementTemplate | undefined>;

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
  // Pass 30 (C4.4): `options` carries the exclusion override and who asks;
  // an EXCLUDED technician is refused (PlacementRefusedError) without it.
  createAppointment(data: InsertAppointment, options?: PlacementOptions): Promise<Appointment>;
  // Pass 28: the actor signs the appointment_composition_changed row a
  // change of the visit's instructions (notes) writes. Pass 30: a change of
  // technician runs the exclusion check and moves the crew's LEAD.
  updateAppointment(id: string, data: Partial<InsertAppointment>, actor?: AuditActor | null, options?: PlacementOptions): Promise<Appointment | undefined>;
  // Pass 27 (C4.2): the one cancel / reschedule path; a status PATCH to
  // CANCELED is refused by updateAppointment.
  dispositionAppointment(input: AppointmentDispositionInput): Promise<AppointmentDispositionResult | undefined>;
  // Pass 28 (C4.3a): the composition of a visit, each one transaction through
  // getLinkedServicesForAppointmentTx and one audit row; the LAST active
  // service is refused (LAST_SERVICE_ON_APPOINTMENT) - the disposition owns
  // taking a visit off the board.
  addServiceToAppointment(input: AddServiceToAppointmentInput): Promise<AppointmentCompositionResult>;
  removeServiceFromAppointment(input: RemoveServiceFromAppointmentInput): Promise<AppointmentCompositionResult>;
  updateAppointmentService(input: UpdateAppointmentServiceInput): Promise<AppointmentCompositionResult>;
  // Pass 28: ONE service cancelled outright, placed or pending, with the
  // disposition's CANCEL semantics for that service.
  cancelService(input: CancelServiceInput): Promise<ServiceCancelResult | undefined>;
  // Pass 29 (C4.3b): the office's review of a service a technician added
  // from the field - the review stamp, one field_service_reviewed row.
  markServiceFieldReviewed(input: FieldReviewServiceInput): Promise<Service | undefined>;
  timeInAppointment(id: string, actor?: AuditActor | null): Promise<Appointment | undefined>;
  timeOutAppointment(id: string, actor?: AuditActor | null): Promise<Appointment | undefined>;
  getTechnicianWork(technicianId: string, date: string): Promise<TechnicianWorkVisit[]>;
  // Pass 30 (C4.4; B14): technician preferences - the location's and its
  // account's rows and the resolve rule; the effective map for the dispatch
  // board; set / clear, one audit row each.
  getLocationTechnicianPreferences(locationId: string): Promise<LocationTechnicianPreferences | undefined>;
  getEffectiveTechnicianPreferences(locationIds: string[]): Promise<Record<string, EffectiveTechnicianPreference[]>>;
  setTechnicianPreference(input: TechnicianPreferenceSetInput): Promise<LocationTechnicianPreferences | undefined>;
  clearTechnicianPreference(input: TechnicianPreferenceClearInput): Promise<LocationTechnicianPreferences | undefined>;
  // Pass 30: the visit's crew (appointment_technicians) - read, add / remove a SUPPORT technician.
  getAppointmentCrew(appointmentId: string): Promise<AppointmentCrew | undefined>;
  // Pass 30b: the board's support cards for a time range.
  getSupportAssignments(from: Date, to: Date): Promise<SupportAssignment[]>;
  addAppointmentCrewMember(input: AppointmentCrewAddInput): Promise<AppointmentCrew | undefined>;
  removeAppointmentCrewMember(input: AppointmentCrewRemoveInput): Promise<AppointmentCrew | undefined>;
  // D6: Price / COA applied / Due today for one visit, per service and summed.
  // Pass 19: with a draft, that service is priced at the draft price (nothing written).
  getVisitBillingSummary(appointmentId: string, draft?: VisitBillingDraftInput | null): Promise<VisitBillingSummary | undefined>;

  getServiceRecords(): Promise<ServiceRecord[]>;
  getServiceRecordsByLocation(locationId: string): Promise<ServiceRecord[]>;
  getServiceRecord(id: string): Promise<ServiceRecord | undefined>;
  createServiceRecord(data: InsertServiceRecord, actor?: AuditActor | null): Promise<ServiceRecord>;
  updateServiceRecord(id: string, input: UpdateServiceRecordInput): Promise<ServiceRecord | undefined>;
  completeService(input: CompleteServiceInput): Promise<CompleteServiceResult | undefined>;
  finalizeServiceRecord(id: string, actor?: AuditActor): Promise<FinalizeServiceRecordResult | undefined>;
  reopenServiceRecord(input: ReopenServiceRecordInput): Promise<ServiceRecord | undefined>;
  getServiceTimeTrackingMode(): Promise<ServiceTimeTrackingMode>;
  setServiceTimeTrackingMode(mode: ServiceTimeTrackingMode): Promise<AppSetting>;
  getAppointmentCancelReasons(): Promise<string[]>;
  setAppointmentCancelReasons(reasons: string[]): Promise<AppSetting>;
  getTicketReopenReasons(): Promise<string[]>;
  setTicketReopenReasons(reasons: string[]): Promise<AppSetting>;
  getMaterialUnits(): Promise<string[]>;
  setMaterialUnits(units: string[]): Promise<AppSetting>;
  getApplicationAreas(): Promise<string[]>;
  setApplicationAreas(areas: string[]): Promise<AppSetting>;
  getInvoiceOnFinalizeMode(): Promise<InvoiceOnFinalizeMode>;
  setInvoiceOnFinalizeMode(mode: InvoiceOnFinalizeMode): Promise<AppSetting>;
  // Pass 22 (C3.5; B11): "Attach service report to visit invoices" - one
  // boolean app_settings row (shared/service-report.ts), default off, read
  // by getInvoiceDocumentContext when an invoice PDF is first rendered.
  getAttachServiceReportToInvoices(): Promise<boolean>;
  setAttachServiceReportToInvoices(enabled: boolean): Promise<AppSetting>;
  // Pass 31 (C4.5): Settings -> Dispatch Board - the view interval, the snap
  // interval and the default visible hours (shared/dispatch-board.ts), one
  // app_settings row per value and no seed row: a missing or unrecognised
  // row reads as its default. The write takes a partial, validates the four
  // together and upserts only the values given.
  getDispatchBoardSettings(): Promise<DispatchBoardSettings>;
  setDispatchBoardSettings(patch: Partial<DispatchBoardSettings>): Promise<DispatchBoardSettings>;

  getMaterialProducts(includeInactive?: boolean): Promise<MaterialProduct[]>;
  createMaterialProduct(data: InsertMaterialProduct): Promise<MaterialProduct>;
  updateMaterialProduct(id: string, data: Partial<InsertMaterialProduct>): Promise<MaterialProduct | undefined>;
  getTargetPests(includeInactive?: boolean): Promise<TargetPest[]>;
  createTargetPest(data: InsertTargetPest): Promise<TargetPest>;
  updateTargetPest(id: string, data: Partial<InsertTargetPest>): Promise<TargetPest | undefined>;
  getProductApplications(): Promise<ProductApplication[]>;
  getProductApplicationsByServiceRecord(serviceRecordId: string): Promise<ProductApplication[]>;
  createProductApplication(data: InsertProductApplication): Promise<ProductApplication>;

  getOrganization(): Promise<Organization | undefined>;
  updateOrganizationBranding(data: Partial<InsertOrganization>): Promise<Organization | undefined>;

  getProductionValueEntriesByAgreement(agreementId: string): Promise<ProductionValueEntry[]>;
  getProductionValueEntriesByTechnician(technicianId: string): Promise<ProductionValueEntry[]>;

  getInvoices(): Promise<Invoice[]>;
  getInvoicesByLocation(locationId: string): Promise<Invoice[]>;
  getLocationBalancesByCustomer(customerId: string): Promise<LocationBalanceSummary[]>;
  /** Pass 14 (C2.4): the customer's aging - per location plus the rollup, derived at read time; undefined outside the org. */
  getCustomerAging(customerId: string): Promise<CustomerAging | undefined>;
  /** Pass 14 (C2.4): the org-wide aging report - per customer and per location, the customer read's figures summed. */
  getAgingReport(): Promise<AgingReport>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]>;
  /** The invoice modal's read (Pass 11a): row + lines + customer / location / visit. Undefined outside the org. */
  getInvoiceDetail(id: string): Promise<InvoiceDetail | undefined>;
  /** Where one visit stands with invoicing (Pass 11b): its non-void invoice through either anchor, and whether every ticket is finalized. Undefined outside the org. */
  getAppointmentInvoiceStatus(appointmentId: string): Promise<AppointmentInvoiceStatus | undefined>;
  getServiceRecordsReadyForBilling(): Promise<ServiceRecord[]>;
  getServiceRecordsReadyForBillingInRange(filters: BatchInvoiceFilters): Promise<ServiceRecord[]>;
  getBatchInvoicePreviewForDateRange(filters: BatchInvoiceFilters): Promise<BatchInvoicePreview>;
  createManualInvoice(input: CreateManualInvoiceInput): Promise<Invoice>;
  generateInvoiceFromServiceRecord(serviceRecordId: string, actor?: AuditActor | null): Promise<Invoice>;
  createDraftInvoiceForAppointment(appointmentId: string, actor?: AuditActor | null): Promise<Invoice>;
  issueInvoice(id: string, input: IssueInvoiceInput): Promise<Invoice | undefined>;
  generateScheduleDrivenInvoice(input: GenerateScheduleDrivenInvoiceInput): Promise<Invoice>;
  batchGenerateInvoicesForDateRange(filters: BatchInvoiceFilters, actor?: AuditActor | null): Promise<BatchGenerateResult>;
  batchSendInvoices(invoiceIds: string[]): Promise<Invoice[]>;
  updateInvoice(id: string, data: Partial<InsertInvoice>, actor?: AuditActor | null): Promise<Invoice | undefined>;
  /** Pass 11b: put a location on an invoice that has none. Refuses a VOID invoice, one that already has a location, and another customer's location. Audit `update`. */
  assignInvoiceLocation(id: string, locationId: string, actor?: AuditActor | null): Promise<Invoice | undefined>;
  voidInvoice(id: string, actor?: AuditActor | null): Promise<Invoice | undefined>;

  // D5 payments ledger. Append-only: payments, applications and credit memos
  // have creates and lifecycle transitions (confirm / void / refund / release,
  // each stamped and audit-logged), never an update or delete of what was
  // recorded. Invoice rollups (amountPaidCents / balanceDueCents / status) are
  // recomputed from the ledger inside every one of these transactions.
  getPaymentsByLocation(locationId: string): Promise<Payment[]>;
  /** What the field collected at one visit (payments.appointmentId) - the review modal's "Collected in the field" list. */
  getPaymentsByAppointment(appointmentId: string): Promise<Payment[]>;
  /** The Payments screen's org-wide list: filters applied in SQL, a capped page with the total, tiles over the whole filtered set, the collector options. */
  listPayments(filters: PaymentListFilters): Promise<PaymentListResult>;
  /** Collections by day / collector / method for an inclusive range of UTC days, pending against confirmed. Derived, nothing stored. */
  getCollectionsReport(range: { receivedFrom: string; receivedTo: string }): Promise<CollectionsReport>;
  getPayment(id: string): Promise<Payment | undefined>;
  recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult>;
  confirmPayment(id: string, actor?: AuditActor | null): Promise<Payment | undefined>;
  /** Confirm several, each in its own transaction; a refusal is reported per payment, never fatal to the batch. `allowCash` is the route's CONFIRM_CASH_PAYMENT decision. */
  confirmPayments(paymentIds: string[], input: { actor?: AuditActor | null; allowCash: boolean }): Promise<BatchConfirmResult>;
  voidPayment(id: string, reason: string, actor?: AuditActor | null): Promise<Payment | undefined>;
  refundPayment(id: string, reason: string, actor?: AuditActor | null): Promise<Payment | undefined>;
  applyPayment(paymentId: string, input: ApplyLedgerSourceInput): Promise<{ application: PaymentApplication; invoice: Invoice } | undefined>;
  releasePaymentApplication(input: ReleaseApplicationInput): Promise<{ application: PaymentApplication; invoice: Invoice } | undefined>;
  getCreditMemosByLocation(locationId: string): Promise<CreditMemo[]>;
  getCreditMemo(id: string): Promise<CreditMemo | undefined>;
  issueCreditMemo(input: IssueCreditMemoInput): Promise<IssueCreditMemoResult>;
  voidCreditMemo(id: string, reason: string, actor?: AuditActor | null): Promise<CreditMemo | undefined>;
  applyCreditMemo(creditMemoId: string, input: ApplyLedgerSourceInput): Promise<{ application: CreditApplication; invoice: Invoice } | undefined>;
  releaseCreditApplication(input: ReleaseApplicationInput): Promise<{ application: CreditApplication; invoice: Invoice } | undefined>;
  getInvoiceLedger(invoiceId: string): Promise<InvoiceLedger | undefined>;
  getLocationLedgerSummary(locationId: string): Promise<LocationLedgerSummary>;
  // D4's "Apply $X location balance to this invoice?" - the numbers, then the act.
  getInvoiceLocationBalance(invoiceId: string): Promise<InvoiceLocationBalance | undefined>;
  applyLocationBalanceToInvoice(invoiceId: string, actor?: AuditActor | null): Promise<ApplyLocationBalanceResult | undefined>;
  // D4: the agreement's initial charge as a real issued receivable. Fires at
  // creation when the amount resolves; this is the explicit path for an
  // agreement created before Pass 6 or one whose price was set later.
  issueInitialChargeInvoice(agreementId: string, actor?: AuditActor | null): Promise<Invoice | undefined>;
  getAgreementInitialChargeStatus(agreementId: string): Promise<AgreementInitialChargeStatus | undefined>;
  getInitialChargeDueForAgreement(agreementId: string): Promise<InitialChargeDue | null | undefined>;
  getInitialChargeDueForAppointment(appointmentId: string): Promise<InitialChargeDue | null | undefined>;

  getInvoiceDocumentContext(invoiceId: string): Promise<InvoiceDocumentContext | undefined>;
  getOrCreateInvoiceDocument(invoiceId: string): Promise<Document | undefined>;
  getDocument(id: string): Promise<Document | undefined>;

  // Service report (PLAN_ROADMAP_V2.md C3.5, Pass 22; canon §12). The invoice
  // document's shape: the context from the ticket as it stands, one stored
  // `documents` row of kind SERVICE_REPORT per ticket rendered on the first
  // request and retired when the ticket's content is written again, and a
  // render-only preview of an unposted ticket. Undefined outside the org.
  getServiceReportDocumentContext(serviceRecordId: string): Promise<ServiceReportDocumentContext | undefined>;
  getOrCreateServiceReportDocument(serviceRecordId: string): Promise<ServiceReportDocumentResult | undefined>;
  renderServiceReportPreview(input: ServiceReportPreviewInput): Promise<ServiceReportPreviewResult | undefined>;

  // Statements (PLAN_ROADMAP_V2.md C2.5, Pass 15). Each generate renders the
  // document and stores one `documents` row of kind STATEMENT - on request
  // only, one row per generation, never re-rendered in place - and answers
  // the row's info plus the figures it printed. Undefined outside the org.
  /** A location's period roll-up: opening balance, the period's lines, closing balance, the aging strip as of the period's end. */
  generateLocationStatement(locationId: string, period: StatementPeriod, actor?: AuditActor | null): Promise<StatementGenerateResult<LocationStatement> | undefined>;
  /** The same across every location of the customer (the property-manager case), one section per location and a rollup. */
  generateAccountStatement(customerId: string, period: StatementPeriod, actor?: AuditActor | null): Promise<StatementGenerateResult<AccountStatement> | undefined>;
  /** The paid-in-full / zero-balance letter with the location's agreements. Throws StatementRefusedError when the location still owes something. */
  generateZeroBalanceLetter(locationId: string, actor?: AuditActor | null): Promise<StatementGenerateResult<ZeroBalanceLetter> | undefined>;
  /** The location's own statements and letters, newest first. */
  listStatementsByLocation(locationId: string): Promise<StatementInfo[]>;
  /** Every statement for the customer - account-wide and per location - newest first. */
  listStatementsByCustomer(customerId: string): Promise<StatementInfo[]>;
  getStatement(id: string): Promise<StatementInfo | undefined>;
  /** The stored row with its bytes; undefined for an id that is not a STATEMENT document of the org. */
  getStatementDocument(id: string): Promise<Document | undefined>;

  getTaxRates(includeInactive?: boolean): Promise<TaxRate[]>;
  createTaxRate(data: InsertTaxRate): Promise<TaxRate>;
  updateTaxRate(id: string, data: Partial<InsertTaxRate>): Promise<TaxRate | undefined>;
  getTaxRules(includeInactive?: boolean): Promise<TaxRule[]>;
  createTaxRule(data: InsertTaxRule): Promise<TaxRule>;
  updateTaxRule(id: string, data: Partial<InsertTaxRule>): Promise<TaxRule | undefined>;
  getTaxExemptionCertificates(accountId: string): Promise<TaxExemptionCertificate[]>;
  createTaxExemptionCertificate(data: InsertTaxExemptionCertificate): Promise<TaxExemptionCertificate>;

  getCommunications(customerId: string): Promise<Communication[]>;
  getCommunicationsByLocation(locationId: string): Promise<Communication[]>;
  getAllCommunications(): Promise<Communication[]>;
  createCommunication(data: InsertCommunication): Promise<Communication>;

  getLocationScopedCounts(locationId: string): Promise<{ contacts: number; appointments: number; agreements: number; services: number; invoices: number; communications: number; opportunities: number }>;

  // Append-only by decision (D7): two reads and no write on this interface -
  // every row is written inside a storage method's transaction by the
  // private recordAuditLogTx (canon §17); deliberately no update or delete
  // counterpart here or on any route. (The public recordAuditLog that sat
  // here had no caller and left in Pass 32.)
  getAuditLogsForEntity(entityType: string, entityId: string, limit?: number): Promise<AuditLog[]>;
  getAuditLogsForLocation(locationId: string, limit?: number): Promise<AuditLog[]>;
}

function clampAuditLogLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return AUDIT_LOG_DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), AUDIT_LOG_MAX_LIMIT);
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

// addDays / advanceAgreementDate / computeExpectedServiceCount moved to
// shared/agreement-schedule.ts in Pass 7 (imported and re-exported at the
// top of this file) so the client's billing-plan pill and the nightly run
// share one calendar arithmetic.

function computeDueDateFromInvoiceTerms(invoiceTerms: string | null): Date | null {
  const days: Record<string, number> = {
    DUE_ON_RECEIPT: 0,
    NET_15: 15,
    NET_30: 30,
    NET_60: 60,
  };
  if (!invoiceTerms || !(invoiceTerms in days)) {
    return null;
  }

  return addDaysToDate(new Date(), days[invoiceTerms]);
}

function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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

// Pass 12 (PLAN_ROADMAP_V2.md C2.2): every agreement carries a Billing Plan.
// The column is NOT NULL and the route's zod refuses null and "", so this is
// the last line of defence for any other caller - a refusal with a reason
// rather than a constraint violation.
function requireBillingPlanId(value: string | null | undefined): string {
  if (!value) {
    throw new Error("A Billing Plan is required on every agreement");
  }
  return value;
}

// Pass 25: the two taxonomy columns every opportunity insert carries, decided
// from its source in one place (shared/opportunities.ts) for the runtime
// writers and the backfill alike.
function opportunityTaxonomyColumns(source: string, hasAgreement: boolean): { categoryKey: string; workType: OpportunityWorkType } {
  const taxonomy = taxonomyForSource(source, hasAgreement);
  return { categoryKey: taxonomy.categoryKey, workType: taxonomy.workType };
}

// Pass 28: what an audit row records of one service - the fields a
// disposition, a composition change or a cancel can move, never the whole
// row. Read by appointmentAuditSnapshot below and by service_cancelled.
// Pass 32 (C5.1a): and by the service's own created / update / status_changed
// / deleted rows, so it grew the fields those can move - where the service
// is, where it came from, the agreement cycle it was generated for, its
// scheduling mode and time window, the callback link.
function serviceAuditSnapshot(service: Service) {
  return {
    id: service.id,
    status: service.status,
    customerId: service.customerId,
    locationId: service.locationId,
    appointmentId: service.appointmentId,
    lastAppointmentId: service.lastAppointmentId,
    assignedTechnicianId: service.assignedTechnicianId,
    agreementId: service.agreementId,
    serviceTypeId: service.serviceTypeId,
    source: service.source,
    workKind: service.workKind,
    answersServiceId: service.answersServiceId,
    expectedDurationMinutes: service.expectedDurationMinutes,
    priceCents: service.priceCents,
    dueDate: service.dueDate,
    generatedForDate: service.generatedForDate,
    serviceWindowStart: service.serviceWindowStart,
    serviceWindowEnd: service.serviceWindowEnd,
    timeWindow: service.timeWindow,
    schedulingMode: service.schedulingMode,
    notes: service.notes,
    // Pass 29: the field-add stamp and the office's review, so an ADD from
    // the field and a later review both diff.
    addedInFieldByUserId: service.addedInFieldByUserId,
    fieldReviewedAt: service.fieldReviewedAt,
    fieldReviewedByUserId: service.fieldReviewedByUserId,
    fieldReviewedByLabel: service.fieldReviewedByLabel,
  };
}

// Pass 32: the two kind fields work_kind_changed records on its own, taken
// out of a service `update` written in the same request so they are not
// diffed twice.
function serviceAuditSnapshotWithoutKind(service: Service): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...serviceAuditSnapshot(service) };
  delete snapshot.workKind;
  delete snapshot.answersServiceId;
  return snapshot;
}

// Pass 29: what field_service_reviewed records - the four field columns.
function fieldReviewSnapshot(service: Service) {
  return {
    addedInFieldByUserId: service.addedInFieldByUserId,
    fieldReviewedAt: service.fieldReviewedAt,
    fieldReviewedByUserId: service.fieldReviewedByUserId,
    fieldReviewedByLabel: service.fieldReviewedByLabel,
  };
}

// Pass 27: what a disposition's audit row records of the appointment and its
// services - the fields the disposition can change rather than the whole
// rows, so the History tab's diff reads as status / reason / flag / services.
// Pass 28 (decision 4): plus the visit's instructions (notes), its planned
// end (scheduledEndDate) and each service's type, duration and kind, so a
// composition change (appointment_composition_changed) diffs too.
// Pass 32 (C5.1a): the row part on its own, for the status rows a time-in,
// a post, a finalization or a reopen write without re-reading the services -
// and grown by what the generic rows can move: where the visit is and came
// from, its technician's time stamps, the locks.
function appointmentRowAuditSnapshot(appointment: Appointment) {
  return {
    status: appointment.status,
    customerId: appointment.customerId,
    locationId: appointment.locationId,
    agreementId: appointment.agreementId,
    source: appointment.source,
    assignedTechnicianId: appointment.assignedTechnicianId,
    serviceId: appointment.serviceId,
    serviceTypeId: appointment.serviceTypeId,
    generatedForDate: appointment.generatedForDate,
    scheduledDate: appointment.scheduledDate,
    scheduledEndDate: appointment.scheduledEndDate,
    timeInAt: appointment.timeInAt,
    timeOutAt: appointment.timeOutAt,
    durationMinutes: appointment.durationMinutes,
    lockTime: appointment.lockTime,
    lockTechnician: appointment.lockTechnician,
    assignedTo: appointment.assignedTo,
    notes: appointment.notes,
    cancelReason: appointment.cancelReason,
    cancelNotes: appointment.cancelNotes,
    cancelRequestedAt: appointment.cancelRequestedAt,
    cancelRequestedByLabel: appointment.cancelRequestedByLabel,
    rescheduleRequested: appointment.rescheduleRequested,
    rescheduleRequestedAt: appointment.rescheduleRequestedAt,
  };
}

// Services are sorted by id so the before and after lists line up.
function appointmentAuditSnapshot(appointment: Appointment, linkedServices: Service[]) {
  return {
    ...appointmentRowAuditSnapshot(appointment),
    services: [...linkedServices]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(serviceAuditSnapshot),
  };
}

// A user-typed term as a LIKE / ILIKE fragment: the wildcards and the escape
// character are literal (Postgres's default escape is the backslash).
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class DatabaseStorage implements IStorage {
  constructor(private readonly orgId: string) {}

  // The one write path into audit_logs (D7, canon §17). Call this from inside
  // the same db.transaction() as the mutation being recorded, passing that
  // `tx`: an audit row that outlived a rolled-back payment would be worse
  // than no row, and a mutation that committed without its row is the gap D7
  // exists to close. Every mutation here is transactional, so there is no
  // public, out-of-transaction form (the unused one left in Pass 32).
  //
  // `actor` comes from the session (routes.ts getAuditActor), never from the
  // request body - no route trusts a client-supplied actor. A system-driven
  // write passes SYSTEM_AUDIT_ACTOR explicitly (userId null, "System");
  // don't invent a placeholder user for it. A null label renders as "System"
  // on the History tab either way.
  private async recordAuditLogTx(tx: AuditLogWriter, entry: AuditLogEntry): Promise<void> {
    await tx.insert(auditLogs).values({
      orgId: this.orgId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      userId: entry.actor?.userId || null,
      actorLabel: entry.actor?.actorLabel || null,
      beforeJson: entry.before ?? null,
      afterJson: entry.after ?? null,
    });
  }

  // Pass 32 (C5.1a): the three generic rows every entity in D7's follow-up
  // list writes. A create records the row it made (no before); a change
  // records the row before and after, and only when something the History
  // tab's diff would show moved (shared/audit.ts auditChangeAction - the
  // diff's own ignore list, so a save that changed nothing writes nothing
  // and an edit's row never reads "no field-level differences"), as
  // `status_changed` when `status` moved and `update` otherwise; a delete
  // records the row it removed (no after). Snapshots are whole rows for the
  // simple entities and the curated serviceAuditSnapshot /
  // appointmentAuditSnapshot for the two scheduling entities.
  private async auditCreatedTx(tx: AuditLogWriter, entityType: AuditEntityType, entityId: string, after: unknown, actor: AuditActor | null | undefined): Promise<void> {
    await this.recordAuditLogTx(tx, { entityType, entityId, action: "created", actor: actor ?? null, after });
  }

  private async auditChangeTx(tx: AuditLogWriter, entityType: AuditEntityType, entityId: string, before: unknown, after: unknown, actor: AuditActor | null | undefined): Promise<boolean> {
    const action = auditChangeAction(before, after);
    if (!action) return false;
    await this.recordAuditLogTx(tx, { entityType, entityId, action, actor: actor ?? null, before, after });
    return true;
  }

  private async auditDeletedTx(tx: AuditLogWriter, entityType: AuditEntityType, entityId: string, before: unknown, actor: AuditActor | null | undefined): Promise<void> {
    await this.recordAuditLogTx(tx, { entityType, entityId, action: "deleted", actor: actor ?? null, before });
  }

  // Pass 32: an agreement's row for the log - the whole row plus the sold-by
  // user's name, so the History tab reads a sale-credit change as people
  // (Pass 12's { soldByUserId, soldBy } shape, now inside the one row an
  // agreement write produces).
  private async agreementAuditSnapshotTx(reader: Pick<typeof db, "select">, agreement: Agreement) {
    return { ...agreement, soldBy: await this.describeUserTx(reader, agreement.soldByUserId) };
  }

  // Every audit row for one entity, newest first. `createdAt` defaults to
  // now(), which in Postgres is transaction-start time - two rows written in
  // one transaction share a timestamp exactly - so id is the tiebreaker that
  // keeps paging and rendering order stable.
  async getAuditLogsForEntity(entityType: string, entityId: string, limit?: number): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, this.orgId), eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(clampAuditLogLimit(limit));
  }

  // What the location screen's History panel renders: the location row plus the
  // legacy customer record that owns it (one profile edit writes both, and
  // Pass 30's account-scoped preferences sit on the customer), plus every
  // record anchored to this location - invoices (D1), tickets, services,
  // the ledger (D5), agreements, opportunities, appointments and, since Pass
  // 32 (C5.1a), its contacts and the billing profiles that apply to it (its
  // own override and the account's default). The org-wide templates
  // (agreement_template, billing_profile_template) have no location and are
  // read by entityType + entityId only. Extend this list rather than adding a
  // second rollup query; the per-customer rollup is C5.1b's.
  async getAuditLogsForLocation(locationId: string, limit?: number): Promise<AuditLog[]> {
    const [location] = await db
      .select({ customerId: locations.customerId, accountId: locations.accountId })
      .from(locations)
      .where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));

    if (!location) {
      return [];
    }

    // Pass 32: the location's contacts, and the billing profiles that apply
    // here - the location's own override and the account's default.
    const locationContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, locationId)));
    const locationBillingProfiles = await db
      .select({ id: billingProfiles.id })
      .from(billingProfiles)
      .where(and(
        eq(billingProfiles.orgId, this.orgId),
        location.accountId
          ? or(eq(billingProfiles.locationId, locationId), eq(billingProfiles.accountId, location.accountId))
          : eq(billingProfiles.locationId, locationId),
      ));

    // Invoices anchored to this location (D1). Collected as ids rather than
    // joined, because audit_logs.entity_id is plain text with no FK - the
    // entity type is what gives it meaning.
    const locationInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.locationId, locationId)));
    // Service tickets, for the D3 review flag (prefinalization_issue_override)
    // and, since Pass 8, ticket_reopened.
    const locationTickets = await db
      .select({ id: serviceRecords.id })
      .from(serviceRecords)
      .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.locationId, locationId)));
    // Services, for the field price override (price_overridden) - the price
    // lives on the Service, not the ticket.
    const locationServices = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.orgId, this.orgId), eq(services.locationId, locationId)));
    // The ledger (D5): payments and credit memos live at the location.
    const locationPayments = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orgId, this.orgId), eq(payments.locationId, locationId)));
    const locationCredits = await db
      .select({ id: creditMemos.id })
      .from(creditMemos)
      .where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.locationId, locationId)));
    // Agreements, for sale-credit changes (Pass 12's `update` on soldByUserId).
    const locationAgreements = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(and(eq(agreements.orgId, this.orgId), eq(agreements.locationId, locationId)));
    // Opportunities, for the assignee / category / work-type changes (Pass 25's `update`).
    const locationOpportunities = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.locationId, locationId)));
    // Appointments, for the cancel / reschedule dispositions (Pass 27).
    const locationAppointments = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.orgId, this.orgId), eq(appointments.locationId, locationId)));

    const allRefs: Array<{ entityType: AuditEntityType; entityIds: string[] }> = [
      { entityType: "location", entityIds: [locationId] },
      { entityType: "customer", entityIds: [location.customerId] },
      { entityType: "contact", entityIds: locationContacts.map((contact) => contact.id) },
      { entityType: "billing_profile", entityIds: locationBillingProfiles.map((profile) => profile.id) },
      { entityType: "invoice", entityIds: locationInvoices.map((invoice) => invoice.id) },
      { entityType: "service_record", entityIds: locationTickets.map((ticket) => ticket.id) },
      { entityType: "service", entityIds: locationServices.map((service) => service.id) },
      { entityType: "payment", entityIds: locationPayments.map((payment) => payment.id) },
      { entityType: "credit_memo", entityIds: locationCredits.map((memo) => memo.id) },
      { entityType: "agreement", entityIds: locationAgreements.map((agreement) => agreement.id) },
      { entityType: "opportunity", entityIds: locationOpportunities.map((opportunity) => opportunity.id) },
      { entityType: "appointment", entityIds: locationAppointments.map((appointment) => appointment.id) },
    ];
    const refs = allRefs.filter((ref) => ref.entityIds.length > 0);

    return db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.orgId, this.orgId),
          or(...refs.map((ref) => and(eq(auditLogs.entityType, ref.entityType), inArray(auditLogs.entityId, ref.entityIds)))),
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(clampAuditLogLimit(limit));
  }

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

  // Pass 32 (C5.1a): runs inside the caller's transaction (it used to write
  // through `db` after the caller's commit) and records each location whose
  // primary flag it flipped as that location's `update` row - the whole row
  // before and after - signed by the request that caused it, or by System
  // when the invariant repaired itself with no request behind it. The
  // account's primaryLocationId and status move with it and are not logged
  // on their own: canon has no account history, and the location rows say
  // the same thing.
  private async ensurePrimaryLocationInvariant(tx: DbTransaction, accountId: string, preferredLocationId?: string, actor?: AuditActor | null): Promise<void> {
    const relatedLocations = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.accountId, accountId)));
    if (relatedLocations.length === 0) {
      await tx.update(accounts).set({ primaryLocationId: null, updatedAt: new Date() }).where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, accountId)));
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

    await tx.update(locations).set({ isPrimary: false }).where(and(eq(locations.orgId, this.orgId), eq(locations.accountId, accountId)));
    await tx.update(locations).set({ isPrimary: true }).where(and(eq(locations.orgId, this.orgId), eq(locations.id, primaryCandidate.id)));
    await tx
      .update(accounts)
      .set({ primaryLocationId: primaryCandidate.id, updatedAt: new Date() })
      .where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, accountId)));

    for (const location of relatedLocations) {
      const isPrimary = location.id === primaryCandidate.id;
      if ((location.isPrimary ?? false) === isPrimary) continue;
      await this.auditChangeTx(tx, "location", location.id, location, { ...location, isPrimary }, actor ?? SYSTEM_AUDIT_ACTOR);
    }
  }

  private normalizeAgreementInsert(data: InsertAgreement, actor?: AuditActor): InsertAgreement {
    const contractUrl = data.contractUrl?.trim() || null;

    return {
      ...data,
      agreementTemplateId: data.agreementTemplateId || null,
      cancellationPolicyId: data.cancellationPolicyId || null,
      cancellationPolicySnapshot: data.cancellationPolicySnapshot ?? null,
      billingPlanId: requireBillingPlanId(data.billingPlanId),
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
      priceCents: data.priceCents ?? null,
      ...normalizeInitialCharge(data),
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
      soldByUserId: data.soldByUserId || null,
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
    // Pass 12: an agreement cannot be made plan-less. The route's zod refuses
    // null and ""; this refuses any caller that gets past it.
    if (data.billingPlanId !== undefined) payload.billingPlanId = requireBillingPlanId(data.billingPlanId);
    if (data.billingPlanSnapshot !== undefined) payload.billingPlanSnapshot = data.billingPlanSnapshot ?? null;
    if (data.soldByUserId !== undefined) payload.soldByUserId = data.soldByUserId || null;
    if (data.initialAppointmentId !== undefined) payload.initialAppointmentId = data.initialAppointmentId || null;
    if (data.startDateSource !== undefined) payload.startDateSource = data.startDateSource || "MANUAL";
    if (data.agreementType !== undefined) payload.agreementType = data.agreementType?.trim() || null;
    if (data.startDate !== undefined) payload.startDate = normalizeDateOnly(data.startDate as any) as any;
    if (data.termUnit !== undefined) payload.termUnit = data.termUnit || "YEAR";
    if (data.termInterval !== undefined) payload.termInterval = Math.max(data.termInterval || 1, 1);
    if (data.renewalDate !== undefined) payload.renewalDate = normalizeDateOnly(data.renewalDate as any) as any;
    if (data.nextServiceDate !== undefined) payload.nextServiceDate = normalizeDateOnly(data.nextServiceDate as any) as any;
    if (data.recurrenceUnit !== undefined) payload.recurrenceUnit = data.recurrenceUnit || "MONTH";
    if (data.recurrenceInterval !== undefined) payload.recurrenceInterval = Math.max(data.recurrenceInterval || 1, 1);
    if (data.generationLeadDays !== undefined) payload.generationLeadDays = Math.max(data.generationLeadDays || 0, 0);
    if (data.serviceWindowDays !== undefined) payload.serviceWindowDays = data.serviceWindowDays ?? null;
    if (data.schedulingMode !== undefined) payload.schedulingMode = data.schedulingMode || "MANUAL";
    if (data.serviceTypeId !== undefined) payload.serviceTypeId = data.serviceTypeId || null;
    if (data.defaultDurationMinutes !== undefined) payload.defaultDurationMinutes = data.defaultDurationMinutes ?? null;
    if (data.priceCents !== undefined) payload.priceCents = data.priceCents ?? null;
    // The initial charge is one block: its type decides which other fields
    // mean anything, so an update that names the type rewrites all five
    // (the route refuses an amount-only change). Absent type, absent block.
    if (data.initialChargeType !== undefined) Object.assign(payload, normalizeInitialCharge(data));
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
      ...initialChargeToTemplate(initialChargeFromTemplate(data)),
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
    // Same one-block rule as normalizeAgreementUpdate.
    if (data.defaultInitialChargeType !== undefined) Object.assign(payload, initialChargeToTemplate(initialChargeFromTemplate(data)));
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

  // The terms the customer was sold, frozen at attachment. One builder for
  // every writer - creation, the plan-change path below, and the Pass 12
  // migration in agreement-bootstrap.ts - lives in shared/billing-plan.ts.
  private buildBillingPlanSnapshot(plan?: BillingPlan | null) {
    return buildSharedBillingPlanSnapshot(plan);
  }

  // The nightly run only ever looks at agreements with a nextBillingDate
  // (`isNotNull(agreements.nextBillingDate)` in server/jobs/billing-run.ts),
  // so this arithmetic is the single thing deciding whether a schedule-billed
  // agreement is billed at all. Only schedule-billed plans get a date -
  // everything else, and no plan, bills at the visit instead, via the same
  // isScheduleBilledPlan() predicate invoice generation reads.
  //
  // `initialCharge` is the agreement's charge block, passed only when billing
  // starts on the agreement's own start date (null otherwise). A plan with
  // initialChargeCoversFirstPeriod skips period 1 because the up-front money
  // paid for it - but since D4 moved the charge onto the agreement, the plan
  // flag alone cannot know whether there is one, or whether it even counts
  // toward the price: applying the skip to a charge-less agreement, or to a
  // charge owed on top of the price, would skip a period nobody paid for,
  // silently. initialChargeSkipsFirstPeriod() answers both, and the nightly
  // run reads the same predicate to spread the remaining price over one fewer
  // period, so creation and billing agree on how many periods a term has. A
  // plan attached mid-term never gets the skip (the caller passes null).
  private computeNextBillingDateForPlan(
    plan: BillingPlan | null | undefined,
    anchorDate: string,
    initialCharge: Pick<InitialChargeFields, "initialChargeType" | "initialChargeInAdditionToPrice"> | null,
  ): string | null {
    if (!isScheduleBilledPlan(plan)) {
      return null;
    }

    if (plan!.billingMode === "PREPAID_TERM") {
      return anchorDate;
    }

    return initialCharge && initialChargeSkipsFirstPeriod(plan, initialCharge)
      ? advanceAgreementDate(anchorDate, plan!.intervalUnit ?? "MONTH", plan!.intervalCount ?? 1)
      : anchorDate;
  }

  // Attaching or switching an agreement's Billing Plan has to move
  // nextBillingDate and billingPlanSnapshot with it (clearing one is refused
  // since Pass 12 - every agreement carries a plan). Without this, an
  // agreement edited to add a plan looks correctly configured everywhere in
  // the UI and is never billed by anyone: only the creation path
  // (buildAgreementInsertFromTemplate) ever set nextBillingDate, and the
  // nightly run filters on it. Silently billing nothing is the failure mode
  // isScheduleBilledPlan() exists to prevent, so the update path now resolves
  // the same three fields the creation path does.
  private async resolveBillingPlanChangeTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    existing: Agreement,
    payload: Partial<InsertAgreement>,
  ): Promise<void> {
    const planChanged = payload.billingPlanId !== undefined
      && (payload.billingPlanId || null) !== (existing.billingPlanId ?? null);

    // Agreements already sitting in the state this pass exists to end - a plan
    // attached (through the API, before any selector existed) but no
    // nextBillingDate - are repaired by any edit that reaches here. Without
    // this they are unfixable through the UI: re-picking the plan already on
    // the agreement is not a change, so the branch above would skip it, and
    // the only workaround would be to clear the plan, save, and re-attach it.
    const needsScheduleRepair = !planChanged && !!existing.billingPlanId && !existing.nextBillingDate;
    if (!planChanged && !needsScheduleRepair) {
      return;
    }

    const nextPlanId = planChanged ? (payload.billingPlanId || null) : (existing.billingPlanId ?? null);
    const [plan] = nextPlanId
      ? await tx.select().from(billingPlans).where(and(eq(billingPlans.orgId, this.orgId), eq(billingPlans.id, nextPlanId)))
      : [undefined];
    if (nextPlanId && !plan) {
      throw new Error("Billing plan not found");
    }

    // The snapshot is the terms the customer was SOLD, frozen at attachment -
    // an unrelated edit must never rewrite it, which is the same guarantee
    // resolveAgreementBillingPlanSnapshot() and createSurchargeEntryIfConfigured
    // depend on. So it moves only when the plan itself moves. An explicitly
    // supplied snapshot or date still wins, matching
    // buildAgreementInsertFromTemplate's override-wins/derive-otherwise shape.
    if (planChanged && payload.billingPlanSnapshot === undefined) {
      payload.billingPlanSnapshot = this.buildBillingPlanSnapshot(plan);
    }
    if (payload.nextBillingDate === undefined) {
      payload.nextBillingDate = await this.resolveNextBillingDateForPlanChangeTx(tx, existing, payload, plan);
    }
  }

  // What nextBillingDate becomes when a plan is attached to, or swapped on, an
  // agreement that already exists. Four rules, in order:
  //
  // 1. Not schedule-billed (COD, installment, charge-at-start, or cleared) -
  //    null. The visit is the billing event; a leftover date would bill the
  //    same work a second time from the nightly run.
  // 2. Already on a schedule - keep the existing date. Switching cadence
  //    mid-term re-anchors from the charge already owed, so the new plan's
  //    interval steps forward from there: no period skipped, none billed twice.
  // 3. Never billed on a schedule - anchor on the LATER of the agreement's
  //    start date and today. Anchoring on an elapsed start date would make the
  //    nightly run back-bill one period per night for every period since
  //    signup - a surprise charge nobody authorized. Periods that elapsed
  //    plan-less were billed at the visit (or not at all) and stay that way;
  //    billing history back is a deliberate act, done with a manual invoice.
  // 4. Refuse in the two cases where starting a schedule would bill work twice
  //    or outside the contract: the agreement already carries billing_events
  //    (a schedule that already ran - re-anchoring a PREPAID_TERM plan here
  //    would charge the whole contract price a second time under a new period
  //    key), or the anchor already sits past the term end. Both leave
  //    nextBillingDate null, which the agreement form shows as "not on a
  //    billing schedule" rather than hiding.
  private async resolveNextBillingDateForPlanChangeTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    existing: Agreement,
    payload: Partial<InsertAgreement>,
    plan: BillingPlan | undefined,
  ): Promise<string | null> {
    if (!isScheduleBilledPlan(plan)) {
      return null;
    }
    if (existing.nextBillingDate) {
      return existing.nextBillingDate;
    }

    const startDate = (payload.startDate as string | undefined) || existing.startDate;
    const termUnit = payload.termUnit ?? existing.termUnit;
    const termInterval = payload.termInterval ?? existing.termInterval;
    const today = new Date().toISOString().slice(0, 10);
    const anchorDate = startDate > today ? startDate : today;

    if (anchorDate >= advanceAgreementDate(startDate, termUnit, termInterval)) {
      return null;
    }

    // Schedule events only: the INITIAL_CHARGE event (D4's receivable) is not
    // a schedule that ran, so it must not refuse the schedule from starting.
    const [priorBillingEvent] = await tx
      .select()
      .from(billingEvents)
      .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.agreementId, existing.id), ne(billingEvents.source, "INITIAL_CHARGE")))
      .limit(1);
    if (priorBillingEvent) {
      return null;
    }

    const initialCharge = payload.initialChargeType !== undefined ? normalizeInitialCharge(payload) : existing;
    return this.computeNextBillingDateForPlan(plan, anchorDate, anchorDate === startDate ? initialCharge : null);
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
      userId: data.userId || null,
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
    if (data.userId !== undefined) payload.userId = data.userId || null;
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

  // Pass 24 (PLAN_ROADMAP_V2.md C3.7; canon §10): the one place a Service's
  // work kind and its callback link are decided, for every writer -
  // createService (the customer screen's form, the dispatch board's prefill,
  // the API), updateService (the edit form) and convertOpportunityToService;
  // generateServiceForAgreement takes the same default through
  // defaultWorkKindForService. The kind defaults from the type (an
  // agreement's own visit never defaults to CALLBACK - nothing to answer);
  // setting it away from that default at creation, or changing it or the
  // link later, is the price's permission (resolveWorkKindOverrideGate) and,
  // on a change, is refused once the ticket is finalized (its production
  // entry was written from the kind) or the visit is invoiced (its line is
  // frozen) - 409 SERVICE_KIND_LOCKED; a posted, unfinalized ticket is the
  // review moment and may still be re-designated. The link's rule is one
  // shape check and one target check, both shared with the picker. A kind
  // moving off CALLBACK takes its link with it unless the body names one.
  private async resolveServiceWorkKindTx(
    tx: DbTransaction,
    input: {
      /** The Service being changed, or null while it is being created. */
      serviceId: string | null;
      locationId: string;
      agreementId: string | null;
      source: string;
      serviceTypeId: string | null;
      /** undefined = the body said nothing about the kind. */
      requestedWorkKind: string | null | undefined;
      /** undefined = the body said nothing about the link. */
      requestedAnswersServiceId: string | null | undefined;
      /** The row as stored, on an update; null on a create. */
      current: { workKind: string; answersServiceId: string | null } | null;
      actorRole: UserRole | null | undefined;
    },
  ): Promise<{ workKind: ServiceWorkKind; answersServiceId: string | null; changed: boolean }> {
    const [serviceType] = input.serviceTypeId
      ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, input.serviceTypeId)))
      : [undefined];
    const defaultKind = defaultWorkKindForService({ typeKind: serviceType?.workKind, source: input.source, hasAgreement: !!input.agreementId });
    const isAgreementService = !!input.agreementId;

    let workKind: ServiceWorkKind;
    let answersServiceId: string | null;
    let changed = false;
    if (!input.current) {
      workKind = input.requestedWorkKind != null ? normalizeServiceWorkKind(input.requestedWorkKind) : defaultKind;
      answersServiceId = input.requestedAnswersServiceId || null;
      if (input.requestedWorkKind != null && workKind !== defaultKind) {
        const refusal = resolveWorkKindOverrideGate({ actorRole: input.actorRole, isAgreementService });
        if (refusal) throw new ServiceKindError(403, refusal.code, refusal.message);
      }
    } else {
      const currentKind = normalizeServiceWorkKind(input.current.workKind);
      const currentAnswers = input.current.answersServiceId ?? null;
      workKind = input.requestedWorkKind != null ? normalizeServiceWorkKind(input.requestedWorkKind) : currentKind;
      answersServiceId = input.requestedAnswersServiceId !== undefined
        ? input.requestedAnswersServiceId || null
        : workKind === "CALLBACK" ? currentAnswers : null;
      changed = workKind !== currentKind || answersServiceId !== currentAnswers;
      if (changed) {
        const refusal = resolveWorkKindOverrideGate({ actorRole: input.actorRole, isAgreementService });
        if (refusal) throw new ServiceKindError(403, refusal.code, refusal.message);
        await this.assertServiceKindUnlockedTx(tx, input.serviceId!);
      }
    }

    const shape = resolveCallbackLinkShape(workKind, answersServiceId);
    if (shape) throw new ServiceKindError(400, shape.code, shape.message);
    if (answersServiceId) {
      const [answered] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, answersServiceId)));
      const target = resolveCallbackLinkTarget({ serviceId: input.serviceId, locationId: input.locationId, answered });
      if (target) throw new ServiceKindError(400, target.code, target.message);
    }
    return { workKind, answersServiceId, changed };
  }

  // The lock behind a kind change: a finalized ticket wrote the production
  // entry from the kind; an issued invoice froze the line. Either way the
  // kind is history - a correction is a credit memo (money) or Phase 7's
  // adjustment entry (credit), never a re-designation. A DRAFT is re-priced
  // at issue and does not lock.
  private async assertServiceKindUnlockedTx(tx: DbTransaction, serviceId: string): Promise<void> {
    const records = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.serviceId, serviceId)));
    if (records.some((record) => isTicketFinalized(record))) {
      throw new ServiceKindError(
        409,
        "SERVICE_KIND_LOCKED",
        "This service's ticket is finalized: its production credit and its invoice line were written from the kind it had. The kind is frozen - a correction is a credit memo, not a re-designation.",
      );
    }
    const [service] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, serviceId)));
    const invoice = await this.findInvoiceForVisitTx(tx, service?.appointmentId ?? null, records.map((record) => record.id));
    if (invoice && isInvoiceIssued(invoice.status)) {
      throw new ServiceKindError(409, "SERVICE_KIND_LOCKED", `This visit is invoiced (${invoice.invoiceNumber}): the kind is frozen - a difference is a correction on the invoice.`);
    }
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
    // Pass 27 (C4.2): a CANCELED appointment's services were settled by the
    // disposition (requeued or cancelled) and a COMPLETED one's by
    // finalization - a later edit of its notes or time must not touch them.
    // Before this pass the generic update cascaded CANCELLED from here (the
    // board's reason-less cancel) and set every linked service SCHEDULED for
    // any other status, a completed visit's finalized services included.
    if (appointment.status === "CANCELED" || appointment.status === "COMPLETED") {
      return;
    }

    const linkedServices = (await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId))
      // A settled service keeps its status; a legacy representative that has
      // since been placed on another appointment belongs to that visit.
      .filter((service) => service.status !== "COMPLETED" && service.status !== "CANCELLED")
      .filter((service) => !service.appointmentId || service.appointmentId === appointment.id);
    if (!linkedServices.length) {
      return;
    }

    await tx
      .update(services)
      .set({
        status: "SCHEDULED",
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

    await this.insertOpportunityTx(tx, {
      locationId: serviceRecord.locationId || linkedService.locationId,
      sourceServiceId: linkedService.id,
      sourceServiceRecordId: serviceRecord.id,
      serviceTypeId: linkedService.serviceTypeId || null,
      source: "NON_CONTRACT_FOLLOW_UP",
      // Pass 25: SERVICE_DUE / ONE_TIME - this path returns early for agreement work.
      ...opportunityTaxonomyColumns("NON_CONTRACT_FOLLOW_UP", false),
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
    // `undefined` means the caller said nothing about a plan, so the template's
    // plan propagates (template propagation is untouched by Pass 12); a named
    // plan wins. Pass 12: every agreement carries a plan, so neither naming
    // one is a refusal, reported as such rather than inserted as the
    // COD-by-absence canon §13 used to allow. An id that resolves to no plan
    // in this org is refused too, instead of surfacing as a foreign-key error.
    const billingPlanId = input.agreement.billingPlanId !== undefined
      ? input.agreement.billingPlanId
      : template?.billingPlanId ?? null;
    if (!billingPlanId) {
      throw new Error("A Billing Plan is required: choose one on the agreement, or use a template that carries one");
    }
    const billingPlan = await this.getBillingPlan(billingPlanId);
    if (!billingPlan) {
      throw new Error("Billing plan not found");
    }
    const agreementData = input.agreement;

    const startDate = agreementData.startDate;
    const termUnit = agreementData.termUnit ?? template?.defaultTermUnit ?? "YEAR";
    const termInterval = agreementData.termInterval ?? template?.defaultTermInterval ?? 1;
    const recurrenceUnit = agreementData.recurrenceUnit ?? template?.defaultRecurrenceUnit ?? "MONTH";
    const recurrenceInterval = agreementData.recurrenceInterval ?? template?.defaultRecurrenceInterval ?? 1;

    // The initial charge is one block and propagates as one: the caller
    // naming a type (including an explicit null - "no initial charge") wins
    // outright, otherwise the template's default block applies. Mixing an
    // agreement's type with a template's amount would describe a sale nobody
    // made, which is why this is not five independent `??` lines like the
    // fields around it.
    const initialCharge: InitialChargeFields = agreementData.initialChargeType !== undefined
      ? normalizeInitialCharge(agreementData)
      : initialChargeFromTemplate(template);

    // Only schedule-driven plans get a nextBillingDate at all - PER_SERVICE /
    // INSTALLMENT / charge-at-start agreements bill some other way and are
    // never picked up by the nightly run. RECURRING_INTERVAL bills immediately
    // at signup for period 1 unless the agreement's initial charge already
    // covers that period under this plan, in which case billing starts one
    // interval out (PLAN_BILLING_V1.md §1.2); PREPAID_TERM bills the full
    // contract price once, at signup. Creation anchors on the agreement's own
    // start date, so the skip applies here when there is a charge to cover it
    // - see computeNextBillingDateForPlan for the update path.
    const nextBillingDate = this.computeNextBillingDateForPlan(billingPlan, startDate, initialCharge);

    return {
      customerId: agreementData.customerId,
      locationId: agreementData.locationId,
      agreementTemplateId: template?.id ?? agreementData.agreementTemplateId ?? null,
      cancellationPolicyId: policy?.id ?? policyId ?? null,
      cancellationPolicySnapshot: agreementData.cancellationPolicySnapshot ?? this.buildCancellationPolicySnapshot(policy),
      billingPlanId: billingPlan.id,
      billingPlanSnapshot: agreementData.billingPlanSnapshot ?? this.buildBillingPlanSnapshot(billingPlan),
      initialAppointmentId: agreementData.initialAppointmentId ?? null,
      startDateSource: agreementData.startDateSource ?? "MANUAL",
      agreementName: agreementData.agreementName ?? template?.name ?? "Agreement",
      status: agreementData.status,
      agreementType: agreementData.agreementType ?? template?.defaultAgreementType ?? null,
      startDate,
      termUnit,
      termInterval,
      renewalDate: agreementData.renewalDate ?? null,
      nextServiceDate: agreementData.nextServiceDate,
      priceCents: agreementData.priceCents ?? template?.defaultPriceCents ?? null,
      ...initialCharge,
      expectedServiceCount: agreementData.expectedServiceCount ?? computeExpectedServiceCount(startDate, termUnit, termInterval, recurrenceUnit, recurrenceInterval),
      nextBillingDate: agreementData.nextBillingDate ?? nextBillingDate,
      recurrenceUnit,
      recurrenceInterval,
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
      // Pass 12: sale credit defaults to whoever is creating the agreement;
      // a caller naming someone else (or null, "not recorded") has already
      // passed the route's ASSIGN_SALE_CREDIT gate. Never from the template.
      soldByUserId: agreementData.soldByUserId !== undefined ? agreementData.soldByUserId || null : input.actor?.userId || null,
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

  // Pass 32 (C5.1a): a placement, a move or a ticket on the agreement's
  // initial appointment re-derives its dates - recorded as the agreement's
  // `update` under the actor of the request that caused it (System when
  // there is none). The agreement writers (create / update / link) pass
  // `audit: false` and record the final row themselves, so one request is
  // one row.
  private async syncAgreementInitialAppointmentDates(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    agreementId: string,
    actor?: AuditActor | null,
    options: { audit?: boolean } = {},
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

    if (options.audit !== false && updatedAgreement) {
      await this.auditChangeTx(
        tx,
        "agreement",
        agreement.id,
        await this.agreementAuditSnapshotTx(tx, agreement),
        await this.agreementAuditSnapshotTx(tx, updatedAgreement),
        actor ?? SYSTEM_AUDIT_ACTOR,
      );
    }

    return updatedAgreement;
  }

  // Pass 32: the initial appointment taking the agreement (agreementId,
  // source AGREEMENT_INITIAL) - the appointment's `update` row when it moved.
  private async attachInitialAppointmentTx(tx: DbTransaction, appointmentId: string, agreementId: string, actor?: AuditActor | null): Promise<void> {
    const [before] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
    if (!before) {
      return;
    }
    const [after] = await tx
      .update(appointments)
      .set({ agreementId, source: "AGREEMENT_INITIAL" })
      .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)))
      .returning();
    if (after) {
      await this.auditChangeTx(tx, "appointment", appointmentId, appointmentRowAuditSnapshot(before), appointmentRowAuditSnapshot(after), actor);
    }
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

    await this.insertOpportunityTx(tx, {
      locationId: agreement.locationId,
      agreementId: agreement.id,
      sourceServiceId: service.id,
      serviceTypeId: agreement.serviceTypeId || null,
      source: "AGREEMENT_CONTACT_REQUIRED",
      // Pass 25: SERVICE_DUE / AGREEMENT.
      ...opportunityTaxonomyColumns("AGREEMENT_CONTACT_REQUIRED", true),
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
      const cycleBefore = serviceForCycle;
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
      // Pass 32: the cycle's backfill is a write too - a System `update`
      // only when it filled something in (on most reads it changes nothing
      // and writes no row).
      if (updatedServiceForCycle) {
        await this.auditChangeTx(tx, "service", cycleBefore.id, serviceAuditSnapshot(cycleBefore), serviceAuditSnapshot(updatedServiceForCycle), SYSTEM_AUDIT_ACTOR);
      }
      await this.ensureAgreementContactRequiredOpportunityTx(tx, agreement, serviceForCycle, nextServiceDate);
      return null;
    }

    // Pass 24: the agreement's visit takes its type's kind - PRODUCTION when
    // the type is a CALLBACK type, since a scheduled visit answers nothing
    // (shared/service-kind.ts defaultWorkKindForService).
    const [agreementServiceType] = agreement.serviceTypeId
      ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, agreement.serviceTypeId)))
      : [undefined];
    const [createdService] = await tx.insert(services).values({
      orgId: this.orgId,
      customerId: agreement.customerId,
      locationId: agreement.locationId,
      agreementId: agreement.id,
      serviceTypeId: agreement.serviceTypeId,
      workKind: defaultWorkKindForService({ typeKind: agreementServiceType?.workKind, source: "AGREEMENT_GENERATED", hasAgreement: true }),
      answersServiceId: null,
      dueDate: nextServiceDate as any,
      generatedForDate: nextServiceDate as any,
      serviceWindowStart: serviceWindowStart as any,
      serviceWindowEnd: serviceWindowEnd as any,
      expectedDurationMinutes: agreement.defaultDurationMinutes ?? null,
      // Deliberately not stamped: agreement-generated services have no
      // durable price of their own. Production value is computed at read
      // time from agreement.priceCents / agreement.expectedServiceCount
      // (see shared/production-value.ts) so an agreement price edit is
      // reflected immediately instead of leaving already-generated services
      // holding a stale copy. A manager/admin field override still writes
      // directly to this column via completeService() and wins over the
      // computed value once set.
      priceCents: null,
      status: "PENDING_SCHEDULING",
      assignedTechnicianId: null,
      source: "AGREEMENT_GENERATED",
      schedulingMode: agreement.schedulingMode || "MANUAL",
      notes: [agreement.serviceTemplateName, agreement.serviceInstructions, agreement.notes].filter((value): value is string => !!value?.trim()).join("\n\n") || null,
    }).returning();

    await this.ensureAgreementContactRequiredOpportunityTx(tx, agreement, createdService, nextServiceDate);
    // Pass 32 (C5.1a, decided): the agreement's standing instruction made
    // this service - logged `created` under System (Pass 26's rule-vs-person
    // reasoning), whichever request ran the generation: an agreement write,
    // a finalization's advance, or one of the three GET routes that generate
    // on read (/api/location-counts/:id, /api/appointments/by-location/:id,
    // /api/agreements/location/:id). It IS a creation, once per cycle, so a
    // page load that generates nothing writes nothing.
    await this.auditCreatedTx(tx, "service", createdService.id, serviceAuditSnapshot(createdService), SYSTEM_AUDIT_ACTOR);
    return createdService;
  }

  // Pass 32: the recurrence moving nextServiceDate after a completed visit is
  // the agreement's own rule executing - the agreement's `update`, System.
  private async auditAgreementAdvanceTx(tx: DbTransaction, before: Agreement, after: Agreement): Promise<void> {
    await this.auditChangeTx(tx, "agreement", before.id, await this.agreementAuditSnapshotTx(tx, before), await this.agreementAuditSnapshotTx(tx, after), SYSTEM_AUDIT_ACTOR);
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
      await this.auditAgreementAdvanceTx(tx, agreement, updatedAgreement);
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
      await this.auditAgreementAdvanceTx(tx, agreement, updatedAgreement);
      await this.generateServiceForAgreement(tx, updatedAgreement);
    }
  }

  // PLAN_BILLING_V1.md §1.6.2: append-only comp basis, frozen at office
  // finalization, never edited. Called once per first-time finalization
  // (the caller already guards on !existingRecord.confirmed); the select
  // here is a second, independent idempotency guard against a reopen ->
  // refinalize cycle, which resets confirmed to false and would otherwise
  // double-count through that same call site.
  //
  // Basis (Pass 24, PLAN_ROADMAP_V2.md C3.7; canon §10): read from the
  // Service's WORK KIND and its agreement link, never from a slot counter
  // (shared/service-kind.ts productionBasisForService). A CALLBACK is basis
  // CALLBACK at $0, priced or not - a callback earns no production. An
  // agreement's PRODUCTION or SERVICE visit is SCHEDULED_AGREEMENT_SERVICE
  // at contractPrice / expectedServiceCount (shared/production-value.ts)
  // whatever its position in the count: the counter that used to classify
  // the visit past expectedServiceCount as CALLBACK $0 is gone, so an extra
  // scheduled visit credits the per-visit value like any other and the
  // ledger's per-agreement total is no longer capped at the contract price -
  // the office's designation is the control, and a wrongly credited visit
  // shows in the ledger rather than a real visit vanishing from it. A
  // service with no agreement is a one-time job at its own price. The three
  // CALLBACK rows the counter wrote before this pass stand as history.
  private async createProductionValueEntriesForFinalizedRecord(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    record: ServiceRecord,
    service: Service,
    finalizedAt: Date,
  ): Promise<void> {
    // Both entries a ticket can carry are checked independently: the main
    // allocation once per ticket (the partial unique index backs this), and
    // the SURCHARGE credit once per ticket by this check alone (the index
    // excludes SURCHARGE). A reopen that adds a surcharge and re-finalizes
    // still earns the credit; one that changes an already-credited amount
    // does not re-credit - the ledger is append-only and carries no
    // adjustment entry until Phase 7.
    const existingEntries = await tx
      .select()
      .from(productionValueEntries)
      .where(and(eq(productionValueEntries.orgId, this.orgId), eq(productionValueEntries.serviceRecordId, record.id)));
    const hasMainEntry = existingEntries.some((entry) => entry.basis !== "SURCHARGE");
    const hasSurchargeEntry = existingEntries.some((entry) => entry.basis === "SURCHARGE");
    const surchargeCents = surchargeOf(record).surchargeCents;
    const wantsSurchargeEntry = !hasSurchargeEntry && surchargeCents != null;
    if (hasMainEntry && !wantsSurchargeEntry) {
      return;
    }

    let agreement: Agreement | undefined;
    if (service.agreementId) {
      [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, service.agreementId)));
    }

    if (!hasMainEntry) {
      const basis = productionBasisForService({ workKind: service.workKind, hasAgreement: !!agreement });
      const productionValueCents = basis === "CALLBACK"
        ? 0
        : basis === "SCHEDULED_AGREEMENT_SERVICE" && agreement
          ? computeProductionValueCents(agreement.priceCents, agreement.expectedServiceCount) ?? 0
          : service.priceCents ?? 0;

      await tx.insert(productionValueEntries).values({
        orgId: this.orgId,
        serviceRecordId: record.id,
        technicianId: record.technicianId,
        technicianName: record.technicianName,
        agreementId: agreement?.id ?? null,
        serviceTypeId: record.serviceTypeId,
        basis,
        productionValueCents,
        contractPriceCentsSnapshot: agreement?.priceCents ?? null,
        expectedServiceCountSnapshot: agreement?.expectedServiceCount ?? null,
        finalizedAt,
      });
    }

    // TRANSITIONAL (development rule 4) - shared/field-surcharge.ts
    // SURCHARGE_CREDIT_RULE: a surcharge line recorded on the ticket ALWAYS
    // credits the posting technician with its amount as a separate, additive
    // basis SURCHARGE entry, until Phase 7's comp engine carries the per-plan
    // selector "earns production on surcharge lines: yes / no" (owner,
    // 2026-09-13) and reads it here instead. This replaced Pass 5.5's
    // createSurchargeEntryIfConfigured(), which inferred the credit from the
    // agreement's initial-charge collector permission - a configuration,
    // never a recorded line. The credit keys off what was RECORDED to have
    // happened (the ticket's own surcharge, canon §12) and never off who
    // collected the money (D4 item 3): production is earned by doing the
    // work. The technician is the ticket's snapshot, as the main entry's is.
    if (wantsSurchargeEntry && surchargeCents != null) {
      void SURCHARGE_CREDIT_RULE;
      await tx.insert(productionValueEntries).values({
        orgId: this.orgId,
        serviceRecordId: record.id,
        technicianId: record.technicianId,
        technicianName: record.technicianName,
        agreementId: agreement?.id ?? null,
        serviceTypeId: record.serviceTypeId,
        basis: "SURCHARGE",
        productionValueCents: surchargeCents,
        contractPriceCentsSnapshot: agreement?.priceCents ?? null,
        expectedServiceCountSnapshot: null,
        finalizedAt,
      });
    }
  }

  // Pass 23 (C3.6): whether this actor may record this surcharge on this
  // service - the post's, the office edit's and the billing read's one gate,
  // decided before anything is written (shared/field-surcharge.ts). The
  // agreement's template is read here so the server's refusal and the ticket
  // dialog's disabled input answer from the same rows.
  private async resolveFieldSurchargeGateTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    input: { actorRole: string; service: Service; adding: boolean },
  ): Promise<FieldSurchargeRefusal | null> {
    const isAgreementService = !!input.service.agreementId || input.service.source === "AGREEMENT_GENERATED";
    let template: AgreementTemplate | undefined;
    if (input.adding && isAgreementService && input.service.agreementId) {
      const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, input.service.agreementId)));
      if (agreement?.agreementTemplateId) {
        [template] = await tx
          .select()
          .from(agreementTemplates)
          .where(and(eq(agreementTemplates.orgId, this.orgId), eq(agreementTemplates.id, agreement.agreementTemplateId)));
      }
    }
    return resolveFieldSurchargeGate({ actorRole: input.actorRole, isAgreementService, template: template ?? null, adding: input.adding });
  }

  async getProductionValueEntriesByAgreement(agreementId: string): Promise<ProductionValueEntry[]> {
    return db
      .select()
      .from(productionValueEntries)
      .where(and(eq(productionValueEntries.orgId, this.orgId), eq(productionValueEntries.agreementId, agreementId)))
      .orderBy(asc(productionValueEntries.finalizedAt));
  }

  async getProductionValueEntriesByTechnician(technicianId: string): Promise<ProductionValueEntry[]> {
    return db
      .select()
      .from(productionValueEntries)
      .where(and(eq(productionValueEntries.orgId, this.orgId), eq(productionValueEntries.technicianId, technicianId)))
      .orderBy(asc(productionValueEntries.finalizedAt));
  }

  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).where(eq(customers.orgId, this.orgId));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, id)));
    return customer;
  }

  // Pass 32 (C5.1a): the customer, location and contact writers below each
  // record their row inside their transaction - `created` with the row made,
  // `update` / `status_changed` with the whole row before and after when
  // something moved, nothing when nothing did.
  async createCustomer(data: InsertCustomer, actor?: AuditActor | null): Promise<Customer> {
    const customer = await db.transaction(async (tx) => {
      const [created] = await tx.insert(customers).values({ ...data, orgId: this.orgId }).returning();
      await this.auditCreatedTx(tx, "customer", created.id, created, actor);
      return created;
    });
    await this.ensureAccountForLegacyCustomer(customer.id);
    return customer;
  }

  async updateCustomer(id: string, data: Partial<InsertCustomer>, actor?: AuditActor | null): Promise<Customer | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, id)));
      if (!existing) {
        return undefined;
      }
      const [customer] = await tx.update(customers).set(data).where(and(eq(customers.orgId, this.orgId), eq(customers.id, id))).returning();
      if (customer) {
        await this.auditChangeTx(tx, "customer", customer.id, existing, customer, actor);
      }
      return customer;
    });
  }

  async createCustomerWithPrimaryLocation(input: CreateCustomerWithPrimaryLocationInput): Promise<Customer> {
    const createdCustomer = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({ ...input.customer, orgId: this.orgId }).returning();
      await this.auditCreatedTx(tx, "customer", customer.id, customer, input.actor);

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
      await this.auditCreatedTx(tx, "location", location.id, location, input.actor);

      if (input.initialContact) {
        const [contact] = await tx.insert(contacts).values({
          ...input.initialContact,
          orgId: this.orgId,
          customerId: customer.id,
          locationId: location.id,
        }).returning();
        await this.auditCreatedTx(tx, "contact", contact.id, contact, input.actor);
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

      // Pass 32: only when something moved (this used to write a row on
      // every save, changed or not - the one always-write in the file).
      await this.auditChangeTx(tx, "location", updatedLocation.id, existingLocation, updatedLocation, input.actor);

      let updatedCustomer: Customer | undefined;
      if (input.customer) {
        const [customer] = await tx
          .update(customers)
          .set(input.customer)
          .where(and(eq(customers.orgId, this.orgId), eq(customers.id, input.customerId)))
          .returning();
        updatedCustomer = customer;

        await this.auditChangeTx(tx, "customer", customer.id, existingCustomer, customer, input.actor);
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

  async createContact(data: InsertContact, actor?: AuditActor | null): Promise<Contact> {
    const createdContact = await db.transaction(async (tx) => {
      const existingLocationContacts = data.locationId
        ? await tx.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, data.locationId)))
        : [];

      const shouldBePrimary = !!data.isPrimary || existingLocationContacts.length === 0;

      if (data.locationId && shouldBePrimary) {
        await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, data.locationId)));
        await this.auditDemotedContactsTx(tx, existingLocationContacts, actor);
      }

      const [contact] = await tx.insert(contacts).values({ ...data, orgId: this.orgId, isPrimary: shouldBePrimary }).returning();
      await this.auditCreatedTx(tx, "contact", contact.id, contact, actor);
      return contact;
    });

    return createdContact;
  }

  // Pass 32: a primary change demotes the location's other contacts in one
  // statement - one `update` row for each that was primary, since each is a
  // row that moved (the contact promoted gets its own row from the caller).
  private async auditDemotedContactsTx(tx: DbTransaction, siblings: Contact[], actor: AuditActor | null | undefined, keepId?: string): Promise<void> {
    for (const sibling of siblings) {
      if (sibling.id === keepId || !sibling.isPrimary) continue;
      await this.auditChangeTx(tx, "contact", sibling.id, sibling, { ...sibling, isPrimary: false }, actor);
    }
  }

  async updateContact(id: string, data: Partial<InsertContact>, actor?: AuditActor | null): Promise<Contact | undefined> {
    return db.transaction(async (tx) => {
      // Pass 32: the existing row is read inside the transaction (it was read
      // outside it) so the before snapshot is the row the update replaced.
      const [existing] = await tx.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, id)));
      if (!existing) {
        return undefined;
      }

      const nextLocationId = data.locationId ?? existing.locationId;
      const requestedPrimary = data.isPrimary ?? existing.isPrimary ?? false;

      if (nextLocationId && requestedPrimary) {
        const siblings = await tx.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, nextLocationId)));
        await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, nextLocationId)));
        await this.auditDemotedContactsTx(tx, siblings, actor, id);
      }

      const [updatedContact] = await tx
        .update(contacts)
        .set({ ...data, isPrimary: requestedPrimary })
        .where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, id)))
        .returning();

      if (updatedContact) {
        await this.auditChangeTx(tx, "contact", updatedContact.id, existing, updatedContact, actor);
      }
      return updatedContact;
    });
  }

  async setPrimaryContact(contactId: string, actor?: AuditActor | null): Promise<Contact | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, contactId)));
      if (!existing?.locationId) {
        return existing;
      }

      const siblings = await tx.select().from(contacts).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, existing.locationId)));
      await tx.update(contacts).set({ isPrimary: false }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.locationId, existing.locationId)));
      const [contact] = await tx.update(contacts).set({ isPrimary: true }).where(and(eq(contacts.orgId, this.orgId), eq(contacts.id, contactId))).returning();
      await this.auditDemotedContactsTx(tx, siblings, actor, contactId);
      if (contact) {
        await this.auditChangeTx(tx, "contact", contact.id, existing, contact, actor);
      }
      return contact;
    });
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

  // Pass 32: each location writer runs in one transaction with the primary
  // invariant inside it (the invariant used to run through `db` after the
  // insert or update had committed), so the `created` / `update` row and the
  // invariant's own rows commit or roll back with the write.
  async createLocation(data: InsertLocation, actor?: AuditActor | null): Promise<Location> {
    const accountId = data.accountId || await this.resolveAccountIdForLegacyCustomer(data.customerId);
    return db.transaction(async (tx) => {
      const [location] = await tx.insert(locations).values({ ...data, orgId: this.orgId, accountId }).returning();
      await this.auditCreatedTx(tx, "location", location.id, location, actor);
      await this.ensurePrimaryLocationInvariant(tx, accountId, data.isPrimary ? location.id : undefined, actor);
      return location;
    });
  }

  async createLocationWithPrimaryContact(input: CreateLocationWithPrimaryContactInput): Promise<Location> {
    const accountId = input.location.accountId || await this.resolveAccountIdForLegacyCustomer(input.location.customerId);

    return db.transaction(async (tx) => {
      const [location] = await tx
        .insert(locations)
        .values({
          ...input.location,
          orgId: this.orgId,
          accountId,
        })
        .returning();
      await this.auditCreatedTx(tx, "location", location.id, location, input.actor);

      if (input.initialContact) {
        const [contact] = await tx.insert(contacts).values({
          ...input.initialContact,
          orgId: this.orgId,
          customerId: location.customerId,
          locationId: location.id,
          isPrimary: true,
        }).returning();
        await this.auditCreatedTx(tx, "contact", contact.id, contact, input.actor);
      }

      await this.ensurePrimaryLocationInvariant(tx, accountId, location.isPrimary ? location.id : undefined, input.actor);
      return location;
    });
  }

  async updateLocation(id: string, data: Partial<InsertLocation>, actor?: AuditActor | null): Promise<Location | undefined> {
    const [existing] = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, id)));
    if (!existing) {
      return undefined;
    }

    const customerId = data.customerId || existing.customerId;
    const accountId = data.accountId || await this.resolveAccountIdForLegacyCustomer(customerId);
    const payload: Partial<InsertLocation> = { ...data, accountId };

    return db.transaction(async (tx) => {
      const [loc] = await tx.update(locations).set(payload).where(and(eq(locations.orgId, this.orgId), eq(locations.id, id))).returning();
      if (!loc) {
        return undefined;
      }
      await this.auditChangeTx(tx, "location", loc.id, existing, loc, actor);
      if (!loc.accountId) {
        return loc;
      }

      await this.ensurePrimaryLocationInvariant(tx, loc.accountId, loc.isPrimary ? loc.id : undefined, actor);
      if (existing.accountId && existing.accountId !== loc.accountId) {
        await this.ensurePrimaryLocationInvariant(tx, existing.accountId, undefined, actor);
      }
      return loc;
    });
  }

  async setPrimaryLocation(_customerId: string, locationId: string, actor?: AuditActor | null): Promise<void> {
    const [targetLocation] = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    const accountId = targetLocation?.accountId;
    if (!accountId) {
      return;
    }

    await db.transaction(async (tx) => {
      await this.ensurePrimaryLocationInvariant(tx, accountId, locationId, actor);
    });
  }

  async getBillingProfileTemplates(includeInactive = false): Promise<BillingProfileTemplate[]> {
    if (includeInactive) {
      return db.select().from(billingProfileTemplates).where(eq(billingProfileTemplates.orgId, this.orgId)).orderBy(asc(billingProfileTemplates.sortOrder), asc(billingProfileTemplates.name));
    }
    return db.select().from(billingProfileTemplates).where(and(eq(billingProfileTemplates.orgId, this.orgId), eq(billingProfileTemplates.isActive, true))).orderBy(asc(billingProfileTemplates.sortOrder), asc(billingProfileTemplates.name));
  }

  // Pass 32 (C5.1a, decided): the org template joins the log beside the
  // instance - the row says "billing profile", and the template is the org
  // default C5.2 will read at customer creation. Org-wide, no location: its
  // rows are read by GET /api/audit-logs?entityType=billing_profile_template
  // &entityId= (a Settings surface later), never on a location's History tab.
  async createBillingProfileTemplate(data: InsertBillingProfileTemplate, actor?: AuditActor | null): Promise<BillingProfileTemplate> {
    return db.transaction(async (tx) => {
      const [template] = await tx.insert(billingProfileTemplates).values({ ...data, orgId: this.orgId }).returning();
      await this.auditCreatedTx(tx, "billing_profile_template", template.id, template, actor);
      return template;
    });
  }

  async updateBillingProfileTemplate(id: string, data: Partial<InsertBillingProfileTemplate>, actor?: AuditActor | null): Promise<BillingProfileTemplate | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(billingProfileTemplates).where(and(eq(billingProfileTemplates.orgId, this.orgId), eq(billingProfileTemplates.id, id)));
      if (!existing) {
        return undefined;
      }
      const [template] = await tx
        .update(billingProfileTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(billingProfileTemplates.orgId, this.orgId), eq(billingProfileTemplates.id, id)))
        .returning();
      if (template) {
        await this.auditChangeTx(tx, "billing_profile_template", template.id, existing, template, actor);
      }
      return template;
    });
  }

  async getBillingProfilesForAccount(accountId: string): Promise<BillingProfile[]> {
    return db.select().from(billingProfiles).where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.accountId, accountId)));
  }

  async createBillingProfile(data: InsertBillingProfile, actor?: AuditActor | null): Promise<BillingProfile> {
    return db.transaction(async (tx) => {
      const [bp] = await tx.insert(billingProfiles).values({ ...data, orgId: this.orgId }).returning();
      await this.auditCreatedTx(tx, "billing_profile", bp.id, bp, actor);
      return bp;
    });
  }

  async updateBillingProfile(id: string, data: Partial<InsertBillingProfile>, actor?: AuditActor | null): Promise<BillingProfile | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(billingProfiles).where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.id, id)));
      if (!existing) {
        return undefined;
      }
      const [bp] = await tx
        .update(billingProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(billingProfiles.orgId, this.orgId), eq(billingProfiles.id, id)))
        .returning();
      if (bp) {
        await this.auditChangeTx(tx, "billing_profile", bp.id, existing, bp, actor);
      }
      return bp;
    });
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
    await this.assertTechnicianUserLink(payload.userId, undefined);
    const [technician] = await db.insert(technicians).values({ ...payload, orgId: this.orgId }).returning();
    return technician;
  }

  async updateTechnician(id: string, data: Partial<InsertTechnician>): Promise<Technician | undefined> {
    const payload = this.normalizeTechnicianUpdate(data);
    if (payload.userId !== undefined) {
      await this.assertTechnicianUserLink(payload.userId, id);
    }
    const [technician] = await db.update(technicians).set({ ...payload, updatedAt: new Date() }).where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, id))).returning();
    return technician;
  }

  // Pass 12: the technician -> user bridge. The user must be one of this
  // org's and linked to no OTHER technician (the partial unique index would
  // refuse that anyway; this says why). Null clears the link.
  private async assertTechnicianUserLink(userId: string | null | undefined, technicianId: string | undefined): Promise<void> {
    if (!userId) return;
    await this.assertOrgUserTx(db, userId, "Linked user");
    const [taken] = await db
      .select({ id: technicians.id, displayName: technicians.displayName })
      .from(technicians)
      .where(and(eq(technicians.orgId, this.orgId), eq(technicians.userId, userId), technicianId ? ne(technicians.id, technicianId) : sql`true`));
    if (taken) {
      throw new Error(`That user is already linked to technician ${taken.displayName}`);
    }
  }

  // Pass 12: the org's users, sanitized at the query - the hash column is
  // never selected - in the order every user selector lists them.
  async getUsers(): Promise<UserSummary[]> {
    const rows = await db
      .select({
        id: users.id,
        orgId: users.orgId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.orgId, this.orgId));
    return sortUsersByName(rows);
  }

  // A users row in THIS org, or a clear refusal naming the field. Null
  // passes: every column that points at a user is nullable.
  private async assertOrgUserTx(reader: Pick<typeof db, "select">, userId: string | null | undefined, label: string): Promise<void> {
    if (!userId) return;
    const [user] = await reader.select({ id: users.id }).from(users).where(and(eq(users.orgId, this.orgId), eq(users.id, userId)));
    if (!user) {
      throw new Error(`${label} not found`);
    }
  }

  // "First Last" for an audit snapshot, null for no user or an unknown id.
  private async describeUserTx(reader: Pick<typeof db, "select">, userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const [user] = await reader
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.orgId, this.orgId), eq(users.id, userId)));
    return user ? userDisplayName(user) : null;
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

  async createService(data: InsertService, context?: ServiceWriteContext): Promise<Service> {
    return db.transaction(async (tx) => {
      const payload = this.normalizeServiceInsert(data);
      // Pass 24: the kind and the callback link, decided once - the type's
      // default unless the body says otherwise, under the price's rule.
      const kind = await this.resolveServiceWorkKindTx(tx, {
        serviceId: null,
        locationId: payload.locationId,
        agreementId: payload.agreementId ?? null,
        source: payload.source ?? "MANUAL",
        serviceTypeId: payload.serviceTypeId ?? null,
        requestedWorkKind: data.workKind,
        requestedAnswersServiceId: data.answersServiceId,
        current: null,
        actorRole: context?.actorRole ?? null,
      });
      const [service] = await tx.insert(services).values({ ...payload, workKind: kind.workKind, answersServiceId: kind.answersServiceId, orgId: this.orgId }).returning();

      let createdService: Service = service;
      if (service.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        if (appointment) {
          await tx
            .update(services)
            .set({
              status: appointment.status === "COMPLETED" ? "COMPLETED" : appointment.status === "CANCELED" ? "CANCELLED" : "SCHEDULED",
              assignedTechnicianId: appointment.assignedTechnicianId || null,
              updatedAt: new Date(),
            })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));

          if (!appointment.serviceId) {
            await this.setAppointmentRepresentativeTx(tx, appointment, service.id, context?.actor);
          }

          const [updatedService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));
          createdService = updatedService || service;
        }
      }

      // Pass 32 (C5.1a): the service's `created` row, as the creation left it
      // (SCHEDULED with the visit's technician when it was born onto a visit).
      await this.auditCreatedTx(tx, "service", createdService.id, serviceAuditSnapshot(createdService), context?.actor);
      return createdService;
    });
  }

  // Pass 32: a visit with no representative service takes the one being
  // written (the legacy appointments.serviceId column) - the visit's `update`.
  private async setAppointmentRepresentativeTx(tx: DbTransaction, appointment: Appointment, serviceId: string, actor?: AuditActor | null): Promise<void> {
    const [updatedAppointment] = await tx
      .update(appointments)
      .set({ serviceId })
      .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
      .returning();
    if (updatedAppointment) {
      await this.auditChangeTx(tx, "appointment", appointment.id, appointmentRowAuditSnapshot(appointment), appointmentRowAuditSnapshot(updatedAppointment), actor);
    }
  }

  async updateService(id: string, data: Partial<InsertService>, context?: ServiceWriteContext): Promise<Service | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
      if (!existing) {
        return undefined;
      }
      const payload = this.normalizeServiceUpdate(data);
      // Pass 28 (C4.3a): the lifecycle moves the composition routes own are
      // refused here - the Pass 27 precedent (CANCELED on the appointment
      // PATCH). Before this pass any client could PATCH status CANCELLED,
      // PENDING_SCHEDULING or appointmentId null with no reason, no audit row
      // and no opportunity, and the siblings, the technician and the
      // representative were left as they were. An unchanged status echoed
      // back by the customer Edit form is not a move and passes.
      if (payload.status === "CANCELLED" && existing.status !== "CANCELLED") {
        throw new ServiceCompositionError(409, SERVICE_CANCEL_REQUIRED, "Cancel a service through POST /api/services/:id/cancel - with a reason from the settings list and the opportunity choice - not a status change");
      }
      if (existing.appointmentId && (payload.appointmentId === null || (payload.status === "PENDING_SCHEDULING" && existing.status === "SCHEDULED"))) {
        throw new ServiceCompositionError(409, SERVICE_REMOVE_REQUIRED, "Return a placed service to the queue through its visit (POST /api/appointments/:id/services/:serviceId/remove), not a status change");
      }
      // Pass 28 (decision 7): an agreement service's type is the price's
      // rule - ADJUST_PRICE_AGREEMENT - here as on the composition route.
      if (payload.serviceTypeId !== undefined && (payload.serviceTypeId ?? null) !== (existing.serviceTypeId ?? null)) {
        this.assertServiceTypeUnlocked(existing, context?.actorRole);
      }
      // Pass 29 (C4.3b; B13 "instructions are editable only on services the
      // technician added"): a technician changes a service's instructions
      // (notes) only when the SESSION USER is the one stamped by the field
      // add (addedInFieldByUserId) - never the technician picker. The
      // office's roles are not held to it; a server write with no role may.
      if (
        context?.actorRole === "technician" &&
        payload.notes !== undefined &&
        (payload.notes ?? null) !== (existing.notes ?? null) &&
        (!existing.addedInFieldByUserId || existing.addedInFieldByUserId !== (context.actor?.userId ?? null))
      ) {
        throw new ServiceCompositionError(403, SERVICE_INSTRUCTIONS_LOCKED, "A technician changes the instructions only on a service they added in the field; ask the office to change these");
      }
      // Pass 24: the kind and the link are resolved only when the body names
      // one of them. A type change alone leaves the kind as it is (an
      // instance's kind is its own once set), and the board's placement
      // PATCH never touches either. A change is gated, locked and audited.
      delete payload.workKind;
      delete payload.answersServiceId;
      let kindChange: { before: { workKind: string; answersServiceId: string | null }; after: { workKind: string; answersServiceId: string | null } } | null = null;
      if (data.workKind !== undefined || data.answersServiceId !== undefined) {
        const kind = await this.resolveServiceWorkKindTx(tx, {
          serviceId: id,
          locationId: payload.locationId ?? existing.locationId,
          agreementId: payload.agreementId !== undefined ? payload.agreementId ?? null : existing.agreementId,
          source: payload.source ?? existing.source,
          serviceTypeId: payload.serviceTypeId !== undefined ? payload.serviceTypeId ?? null : existing.serviceTypeId,
          requestedWorkKind: data.workKind,
          requestedAnswersServiceId: data.answersServiceId,
          current: { workKind: existing.workKind, answersServiceId: existing.answersServiceId },
          actorRole: context?.actorRole ?? null,
        });
        payload.workKind = kind.workKind;
        payload.answersServiceId = kind.answersServiceId;
        if (kind.changed) {
          kindChange = {
            before: { workKind: existing.workKind, answersServiceId: existing.answersServiceId },
            after: { workKind: kind.workKind, answersServiceId: kind.answersServiceId },
          };
        }
      }
      const [service] = await tx.update(services).set({ ...payload, updatedAt: new Date() }).where(and(eq(services.orgId, this.orgId), eq(services.id, id))).returning();
      if (!service) {
        return undefined;
      }
      if (kindChange) {
        // D7: the kind decides whether the visit's line is $0 and what the
        // ledger credits - a money mutation, logged with the two fields.
        await this.recordAuditLogTx(tx, {
          entityType: "service",
          entityId: service.id,
          action: "work_kind_changed",
          actor: context?.actor ?? null,
          before: kindChange.before,
          after: kindChange.after,
        });
      }

      if (payload.appointmentId !== undefined && service.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        if (appointment) {
          await tx
            .update(services)
            .set({
              status: appointment.status === "COMPLETED" ? "COMPLETED" : appointment.status === "CANCELED" ? "CANCELLED" : "SCHEDULED",
              assignedTechnicianId: appointment.assignedTechnicianId || null,
              updatedAt: new Date(),
            })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));

          if (!appointment.serviceId) {
            await this.setAppointmentRepresentativeTx(tx, appointment, service.id, context?.actor);
          }
        }
      }

      const [updatedService] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
      // Pass 32 (C5.1a): the generic row for whatever else the PATCH moved
      // (type, price, duration, dates, notes, the visit it was placed on and
      // the status / technician that placement set). When the kind moved,
      // work_kind_changed above has those two fields - they are taken out
      // of this diff so one save writes one row per fact, not two.
      if (updatedService) {
        if (kindChange) {
          await this.auditChangeTx(tx, "service", id, serviceAuditSnapshotWithoutKind(existing), serviceAuditSnapshotWithoutKind(updatedService), context?.actor);
        } else {
          await this.auditChangeTx(tx, "service", id, serviceAuditSnapshot(existing), serviceAuditSnapshot(updatedService), context?.actor);
        }
      }
      return updatedService;
    });
  }

  // Pass 32 (C5.1a): the hard delete is recorded with the before snapshot -
  // `deleted` on the service and, when it was the visit's last service, on
  // the visit that went with it; a visit that lost one of several gets an
  // `update` (its representative and its services list).
  async deleteService(id: string, actor?: AuditActor | null): Promise<boolean> {
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
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        const siblingServices = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.appointmentId, service.appointmentId)));
        const remainingSiblings = siblingServices.filter((sibling) => sibling.id !== id);
        await tx.delete(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
        await this.auditDeletedTx(tx, "service", service.id, serviceAuditSnapshot(service), actor);

        if (remainingSiblings.length === 0) {
          // Pass 32: the visit's crew rows (appointment_technicians, Pass 30)
          // reference the visit, so they go first - since Pass 30 this delete
          // had failed on that foreign key (400) whenever the visit had a
          // technician, which is every placed visit.
          await tx.delete(appointmentTechnicians).where(and(eq(appointmentTechnicians.orgId, this.orgId), eq(appointmentTechnicians.appointmentId, service.appointmentId)));
          await tx.delete(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
          if (appointment) {
            await this.auditDeletedTx(tx, "appointment", appointment.id, appointmentAuditSnapshot(appointment, siblingServices), actor);
          }
        } else {
          const [representative] = remainingSiblings;
          const [updatedAppointment] = await tx
            .update(appointments)
            .set({ serviceId: representative.id })
            .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)))
            .returning();
          if (appointment && updatedAppointment) {
            await this.auditChangeTx(tx, "appointment", appointment.id, appointmentAuditSnapshot(appointment, siblingServices), appointmentAuditSnapshot(updatedAppointment, remainingSiblings), actor);
          }
        }

        return true;
      }

      await tx.delete(services).where(and(eq(services.orgId, this.orgId), eq(services.id, id)));
      await this.auditDeletedTx(tx, "service", service.id, serviceAuditSnapshot(service), actor);
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

  // Pass 25 (C4.1): the queue's search, every filter applied in SQL like
  // listPayments. The location and zip filters are subqueries on `locations`
  // rather than a join so the select stays the plain row every caller
  // renders; the customer-name half of the location search goes one level
  // deeper the same way. Ordering is unchanged: next action (else due)
  // ascending, then created.
  async getOpportunities(filters: OpportunityFilters = {}): Promise<Opportunity[]> {
    const conditions: SQL[] = [eq(opportunities.orgId, this.orgId)];
    if (filters.status) conditions.push(eq(opportunities.status, filters.status));
    if (filters.dueFrom) conditions.push(sql`coalesce(${opportunities.nextActionDate}, ${opportunities.dueDate}) >= ${filters.dueFrom}`);
    if (filters.dueTo) conditions.push(sql`coalesce(${opportunities.nextActionDate}, ${opportunities.dueDate}) <= ${filters.dueTo}`);
    if (filters.serviceTypeId) conditions.push(eq(opportunities.serviceTypeId, filters.serviceTypeId));
    if (filters.categoryKey) conditions.push(eq(opportunities.categoryKey, filters.categoryKey));
    if (filters.workType) conditions.push(eq(opportunities.workType, filters.workType));
    if (filters.source) conditions.push(eq(opportunities.source, filters.source));
    if (filters.assignedUserId === null) conditions.push(isNull(opportunities.assignedUserId));
    else if (filters.assignedUserId) conditions.push(eq(opportunities.assignedUserId, filters.assignedUserId));
    const zipPrefix = filters.zip?.trim();
    if (zipPrefix) {
      conditions.push(
        inArray(
          opportunities.locationId,
          db
            .select({ id: locations.id })
            .from(locations)
            .where(and(eq(locations.orgId, this.orgId), like(locations.zip, `${escapeLikePattern(zipPrefix)}%`))),
        ),
      );
    }
    const term = filters.location?.trim();
    if (term) {
      const pattern = `%${escapeLikePattern(term)}%`;
      conditions.push(
        inArray(
          opportunities.locationId,
          db
            .select({ id: locations.id })
            .from(locations)
            .where(and(
              eq(locations.orgId, this.orgId),
              or(
                ilike(locations.name, pattern),
                ilike(locations.address, pattern),
                ilike(locations.city, pattern),
                inArray(
                  locations.customerId,
                  db
                    .select({ id: customers.id })
                    .from(customers)
                    .where(and(eq(customers.orgId, this.orgId), or(ilike(sql`${customers.firstName} || ' ' || ${customers.lastName}`, pattern), ilike(customers.companyName, pattern)))),
                ),
              ),
            )),
        ),
      );
    }

    return db
      .select()
      .from(opportunities)
      .where(and(...conditions))
      .orderBy(sql`coalesce(${opportunities.nextActionDate}, ${opportunities.dueDate}) asc`, asc(opportunities.createdAt));
  }

  async getOpportunity(id: string): Promise<Opportunity | undefined> {
    const [opportunity] = await db.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, id)));
    return opportunity;
  }

  async getOpportunitiesByLocation(locationId: string): Promise<Opportunity[]> {
    return db.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.locationId, locationId))).orderBy(asc(opportunities.dueDate));
  }

  // Pass 26 (C4.1b): the ONE insert path for an opportunity, called by the
  // four runtime writers (the service-record follow-up, the agreement
  // contact-required cycle, the agreement cancellation's retention row and
  // the appointment disposition's choice). It resolves the org's assignment
  // rules against the row's two axes, its source and its location's zip
  // (shared/opportunity-assignment.ts resolveAssignmentRule: the first
  // active, sound match in sort order wins; none leaves the row unassigned
  // exactly as before this pass), stamps assignedUserId / assignedAt /
  // assignedByRuleId on the insert itself, and writes one
  // `opportunity_auto_assigned` audit row under the SYSTEM actor naming the
  // rule and the user - a rule is the office's standing instruction, not a
  // person's permission (canon §17). The rules, zones, users and categories
  // are loaded once per transaction, so a disposition inserting one row per
  // service reads them once. The dead `createOpportunity` (no route, no
  // caller) was removed in this pass so nothing can insert around the rules.
  private assignmentContexts = new WeakMap<object, Promise<OpportunityAssignmentContext>>();

  private loadOpportunityAssignmentContextTx(tx: DbTransaction): Promise<OpportunityAssignmentContext> {
    let pending = this.assignmentContexts.get(tx);
    if (!pending) {
      pending = (async () => {
        const rules = await tx
          .select()
          .from(opportunityAssignmentRules)
          .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.isActive, true)));
        const zoneRows = await tx.select().from(zones).where(eq(zones.orgId, this.orgId));
        const userRows = await tx
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, status: users.status })
          .from(users)
          .where(eq(users.orgId, this.orgId));
        const categories = await tx
          .select({ key: opportunityCategories.key, label: opportunityCategories.label })
          .from(opportunityCategories)
          .where(eq(opportunityCategories.orgId, this.orgId));
        return { rules: sortAssignmentRules(rules), zones: zoneRows, users: userRows, categories };
      })();
      this.assignmentContexts.set(tx, pending);
    }
    return pending;
  }

  private async insertOpportunityTx(tx: DbTransaction, values: InsertOpportunity): Promise<Opportunity> {
    const context = await this.loadOpportunityAssignmentContextTx(tx);
    let matched: OpportunityAssignmentRule | null = null;
    if (context.rules.length) {
      const [location] = await tx.select({ zip: locations.zip }).from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, values.locationId)));
      matched = resolveAssignmentRule(context.rules, context.zones, context.users, {
        categoryKey: values.categoryKey,
        workType: values.workType,
        source: values.source ?? "NON_CONTRACT_FOLLOW_UP",
        zip: location?.zip ?? null,
      }).rule;
    }
    const [created] = await tx.insert(opportunities).values({
      ...values,
      orgId: this.orgId,
      assignedUserId: matched?.assignedUserId ?? null,
      assignedAt: matched ? new Date() : null,
      assignedByRuleId: matched?.id ?? null,
    }).returning();
    if (matched) {
      const rule = matched;
      const assignedTo = context.users.find((user) => user.id === rule.assignedUserId) ?? null;
      await this.recordAuditLogTx(tx, {
        entityType: "opportunity",
        entityId: created.id,
        action: "opportunity_auto_assigned",
        actor: SYSTEM_AUDIT_ACTOR,
        before: {
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          assignedByRuleId: null,
          assignedByRule: null,
          categoryKey: created.categoryKey,
          workType: created.workType,
        },
        after: {
          assignedUserId: created.assignedUserId,
          assignedTo: assignedTo ? userDisplayName(assignedTo) : null,
          assignedAt: created.assignedAt ? new Date(created.assignedAt).toISOString() : null,
          assignedByRuleId: rule.id,
          assignedByRule: describeAssignmentRule(rule, context),
          categoryKey: created.categoryKey,
          workType: created.workType,
        },
      });
    }
    return created;
  }

  // Pass 25: the PATCH. Content (notes, the two dates), the taxonomy (a
  // category must be an active key of this org's list; the work type is the
  // enum, checked by the route) and the assignee (an active user of this org,
  // or null to unassign; assignedAt stamped on every change; the route holds
  // the ASSIGN_OPPORTUNITY gate). One audit `update` on the opportunity when
  // the assignee, category or work type actually moved, the users named
  // before and after so the History tab reads as people rather than ids - an
  // unchanged field, or a notes-only edit, writes nothing.
  async updateOpportunity(id: string, data: OpportunityUpdateInput, actor?: AuditActor): Promise<Opportunity | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(opportunities).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, id)));
      if (!existing) return undefined;

      const payload: Record<string, unknown> = { updatedAt: new Date() };
      if (data.notes !== undefined) payload.notes = data.notes;
      if (data.nextActionDate !== undefined) {
        payload.nextActionDate = normalizeDateOnly(data.nextActionDate as any);
      }
      if (data.dueDate !== undefined) {
        const normalizedDueDate = normalizeDateOnly(data.dueDate as any);
        if (normalizedDueDate !== null) {
          payload.dueDate = normalizedDueDate;
        }
      }
      if (data.workType !== undefined) payload.workType = data.workType;
      if (data.categoryKey !== undefined && data.categoryKey !== existing.categoryKey) {
        await this.assertActiveOpportunityCategoryTx(tx, data.categoryKey);
        payload.categoryKey = data.categoryKey;
      }
      if (data.assignedUserId !== undefined) {
        const nextAssignee = data.assignedUserId || null;
        if (nextAssignee !== (existing.assignedUserId ?? null)) {
          await this.assertActiveOrgUserTx(tx, nextAssignee, "Assignee");
          payload.assignedUserId = nextAssignee;
          payload.assignedAt = nextAssignee ? new Date() : null;
          // Pass 26: a person's reassignment overrides a rule's. The row no
          // longer reads as auto-assigned, and the audit `update` below shows
          // the rule going to null beside the users before and after.
          payload.assignedByRuleId = null;
        }
      }

      const [updated] = await tx.update(opportunities).set(payload).where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, id))).returning();
      if (!updated) return undefined;

      const before = await this.opportunityAuditSnapshotTx(tx, existing);
      const after = await this.opportunityAuditSnapshotTx(tx, updated);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await this.recordAuditLogTx(tx, {
          entityType: "opportunity",
          entityId: updated.id,
          action: "update",
          actor,
          before,
          after,
        });
      }
      return updated;
    });
  }

  // The slice of an opportunity an audit row snapshots: the assignee (id and
  // name), when it was assigned, and the two taxonomy axes.
  private async opportunityAuditSnapshotTx(reader: Pick<typeof db, "select">, row: Opportunity) {
    return {
      assignedUserId: row.assignedUserId ?? null,
      assignedTo: await this.describeUserTx(reader, row.assignedUserId),
      assignedAt: row.assignedAt ? new Date(row.assignedAt).toISOString() : null,
      // Pass 26: the rule that auto-assigned the row, if one did - so a
      // manual reassignment of an auto-assigned row reads as a person
      // overriding a rule.
      assignedByRuleId: row.assignedByRuleId ?? null,
      assignedByRule: await this.describeAssignmentRuleTx(reader, row.assignedByRuleId),
      categoryKey: row.categoryKey,
      workType: row.workType,
    };
  }

  // "Service due · Any work type · Zone North · Any source -> Heritage
  // Support" for an audit snapshot; null when the row was not rule-assigned
  // or the rule is gone.
  private async describeAssignmentRuleTx(reader: Pick<typeof db, "select">, ruleId: string | null | undefined): Promise<string | null> {
    if (!ruleId) return null;
    const [rule] = await reader
      .select()
      .from(opportunityAssignmentRules)
      .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.id, ruleId)));
    if (!rule) return null;
    const zoneRows = rule.zoneId
      ? await reader.select({ id: zones.id, name: zones.name }).from(zones).where(and(eq(zones.orgId, this.orgId), eq(zones.id, rule.zoneId)))
      : [];
    const categories = await reader
      .select({ key: opportunityCategories.key, label: opportunityCategories.label })
      .from(opportunityCategories)
      .where(eq(opportunityCategories.orgId, this.orgId));
    const userRows = await reader
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.orgId, this.orgId), eq(users.id, rule.assignedUserId)));
    return describeAssignmentRule(rule, { zones: zoneRows, categories, users: userRows });
  }

  // An assignee must be a user of THIS org who can still log in. Null passes:
  // it is how an opportunity is unassigned.
  private async assertActiveOrgUserTx(reader: Pick<typeof db, "select">, userId: string | null | undefined, label: string): Promise<void> {
    if (!userId) return;
    const [user] = await reader.select({ id: users.id, status: users.status }).from(users).where(and(eq(users.orgId, this.orgId), eq(users.id, userId)));
    if (!user) {
      throw new Error(`${label} not found`);
    }
    if (user.status !== "active") {
      throw new Error(`${label} must be an active user`);
    }
  }

  // A hand-picked category must be one of this org's and active; a row that
  // already carries a since-deactivated key keeps it (the check runs only on
  // a change).
  private async assertActiveOpportunityCategoryTx(reader: Pick<typeof db, "select">, key: string): Promise<void> {
    const [category] = await reader
      .select({ id: opportunityCategories.id, isActive: opportunityCategories.isActive })
      .from(opportunityCategories)
      .where(and(eq(opportunityCategories.orgId, this.orgId), eq(opportunityCategories.key, key)));
    if (!category) {
      throw new Error("Opportunity category not found");
    }
    if (!category.isActive) {
      throw new Error("That opportunity category is inactive");
    }
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

  // Pass 25: the settings-managed category list, in sort order. The
  // active-only read is what the queue's hand-pick offers; the full read is
  // what Settings and the filters show, since a row may carry a key the
  // office has since deactivated and the filter must still find it.
  async getOpportunityCategories(includeInactive = false): Promise<OpportunityCategory[]> {
    const items = await db
      .select()
      .from(opportunityCategories)
      .where(eq(opportunityCategories.orgId, this.orgId))
      .orderBy(asc(opportunityCategories.sortOrder), asc(opportunityCategories.label));
    return includeInactive ? items : items.filter((item) => item.isActive);
  }

  // Label, order and the active flag only: the key is fixed (the five seeded
  // keys, owner 2026-09-19) and nothing creates or deletes a row.
  async updateOpportunityCategory(id: string, data: OpportunityCategoryUpdateInput): Promise<OpportunityCategory | undefined> {
    const payload: Partial<InsertOpportunityCategory> & { updatedAt: Date } = { updatedAt: new Date() };
    if (data.label !== undefined) payload.label = data.label.trim();
    if (data.isActive !== undefined) payload.isActive = data.isActive;
    if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
    const [item] = await db
      .update(opportunityCategories)
      .set(payload)
      .where(and(eq(opportunityCategories.orgId, this.orgId), eq(opportunityCategories.id, id)))
      .returning();
    return item;
  }

  // Pass 26 (C4.1b): zones - named zip-code lists (shared/zones.ts). The
  // list is normalized to unique five-digit ZIPs; an entry that is not a ZIP
  // or a ZIP+4 is refused by name, never dropped. A zone named by a rule
  // cannot be deleted (409 ZONE_IN_USE): deactivate it, and every rule on it
  // is skipped and says so on the Settings card.
  async getZones(includeInactive = false): Promise<Zone[]> {
    const rows = await db.select().from(zones).where(eq(zones.orgId, this.orgId)).orderBy(asc(zones.sortOrder), asc(zones.name));
    return includeInactive ? rows : rows.filter((zone) => zone.isActive);
  }

  private normalizeZoneZipCodes(values: string[]): string[] {
    const { zipCodes, invalid } = normalizeZipCodes(values);
    if (invalid.length) {
      throw new OpportunityAssignmentError(
        400,
        "ZIP_CODES_INVALID",
        `Not a five-digit ZIP code: ${invalid.join(", ")}. Enter five digits per entry (a ZIP+4 is kept as its first five).`,
      );
    }
    if (!zipCodes.length) {
      throw new OpportunityAssignmentError(400, "ZIP_CODES_REQUIRED", "A zone needs at least one ZIP code");
    }
    return zipCodes;
  }

  async createZone(data: ZoneInput): Promise<Zone> {
    const name = data.name.trim();
    if (!name) throw new OpportunityAssignmentError(400, "ZONE_NAME_REQUIRED", "A zone needs a name");
    const zipCodes = this.normalizeZoneZipCodes(data.zipCodes);
    try {
      const [zone] = await db
        .insert(zones)
        .values({
          orgId: this.orgId,
          name,
          zipCodes,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
          notes: data.notes?.trim() || null,
        })
        .returning();
      return zone;
    } catch (err: any) {
      if (err?.code === "23505") throw new OpportunityAssignmentError(409, "ZONE_NAME_TAKEN", `A zone named "${name}" already exists`);
      throw err;
    }
  }

  async updateZone(id: string, data: ZoneUpdateInput): Promise<Zone | undefined> {
    const payload: Partial<InsertZone> & { updatedAt: Date } = { updatedAt: new Date() };
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new OpportunityAssignmentError(400, "ZONE_NAME_REQUIRED", "A zone needs a name");
      payload.name = name;
    }
    if (data.zipCodes !== undefined) payload.zipCodes = this.normalizeZoneZipCodes(data.zipCodes);
    if (data.isActive !== undefined) payload.isActive = data.isActive;
    if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
    if (data.notes !== undefined) payload.notes = data.notes?.trim() || null;
    try {
      const [zone] = await db.update(zones).set(payload).where(and(eq(zones.orgId, this.orgId), eq(zones.id, id))).returning();
      return zone;
    } catch (err: any) {
      if (err?.code === "23505") throw new OpportunityAssignmentError(409, "ZONE_NAME_TAKEN", `A zone named "${payload.name}" already exists`);
      throw err;
    }
  }

  async deleteZone(id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [zone] = await tx.select().from(zones).where(and(eq(zones.orgId, this.orgId), eq(zones.id, id)));
      if (!zone) return false;
      const [usage] = await tx
        .select({ rules: count() })
        .from(opportunityAssignmentRules)
        .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.zoneId, id)));
      const inUse = Number(usage?.rules ?? 0);
      if (inUse > 0) {
        throw new OpportunityAssignmentError(
          409,
          "ZONE_IN_USE",
          `${inUse} assignment rule(s) name zone "${zone.name}" - change or delete those rules first, or deactivate the zone instead`,
        );
      }
      await tx.delete(zones).where(and(eq(zones.orgId, this.orgId), eq(zones.id, id)));
      return true;
    });
  }

  // Pass 26 (C4.1b): the assignment rules, evaluated in sort order at every
  // opportunity's creation (insertOpportunityTx). A rule must name an ACTIVE
  // user of this org when its user is set or changed (a rule whose user
  // later goes inactive is skipped by the resolver and reported on the card,
  // never re-pointed); its category must be one of this org's keys and its
  // zone one of this org's zones. A rule that has assigned rows cannot be
  // deleted (409 RULE_IN_USE) - those rows carry assigned_by_rule_id as
  // their history - deactivate it instead. A reorder names every rule of
  // the org exactly once.
  async getOpportunityAssignmentRules(includeInactive = false): Promise<OpportunityAssignmentRule[]> {
    const rows = await db.select().from(opportunityAssignmentRules).where(eq(opportunityAssignmentRules.orgId, this.orgId));
    const sorted = sortAssignmentRules(rows);
    return includeInactive ? sorted : sorted.filter((rule) => rule.isActive);
  }

  private async assertAssignmentRuleMatchersTx(reader: Pick<typeof db, "select">, data: { categoryKey?: string | null; zoneId?: string | null }): Promise<void> {
    if (data.categoryKey) {
      const [category] = await reader
        .select({ id: opportunityCategories.id })
        .from(opportunityCategories)
        .where(and(eq(opportunityCategories.orgId, this.orgId), eq(opportunityCategories.key, data.categoryKey)));
      if (!category) {
        throw new OpportunityAssignmentError(400, "RULE_CATEGORY_UNKNOWN", `"${data.categoryKey}" is not one of this organization's opportunity categories`);
      }
    }
    if (data.zoneId) {
      const [zone] = await reader.select({ id: zones.id }).from(zones).where(and(eq(zones.orgId, this.orgId), eq(zones.id, data.zoneId)));
      if (!zone) throw new OpportunityAssignmentError(400, "RULE_ZONE_UNKNOWN", "Zone not found");
    }
  }

  private async assertAssignmentRuleUserTx(reader: Pick<typeof db, "select">, userId: string): Promise<void> {
    try {
      await this.assertActiveOrgUserTx(reader, userId, "Assignee");
    } catch (err) {
      throw new OpportunityAssignmentError(400, "RULE_ASSIGNEE_INVALID", err instanceof Error ? err.message : String(err));
    }
  }

  async createOpportunityAssignmentRule(data: OpportunityAssignmentRuleInput): Promise<OpportunityAssignmentRule> {
    return db.transaction(async (tx) => {
      await this.assertAssignmentRuleMatchersTx(tx, data);
      await this.assertAssignmentRuleUserTx(tx, data.assignedUserId);
      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const [last] = await tx
          .select({ last: max(opportunityAssignmentRules.sortOrder) })
          .from(opportunityAssignmentRules)
          .where(eq(opportunityAssignmentRules.orgId, this.orgId));
        sortOrder = Number(last?.last ?? 0) + 10;
      }
      const [rule] = await tx
        .insert(opportunityAssignmentRules)
        .values({
          orgId: this.orgId,
          sortOrder,
          categoryKey: data.categoryKey || null,
          workType: data.workType || null,
          zoneId: data.zoneId || null,
          source: data.source || null,
          assignedUserId: data.assignedUserId,
          isActive: data.isActive ?? true,
        })
        .returning();
      return rule;
    });
  }

  async updateOpportunityAssignmentRule(id: string, data: OpportunityAssignmentRuleUpdateInput): Promise<OpportunityAssignmentRule | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(opportunityAssignmentRules)
        .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.id, id)));
      if (!existing) return undefined;
      await this.assertAssignmentRuleMatchersTx(tx, data);
      if (data.assignedUserId !== undefined && data.assignedUserId !== existing.assignedUserId) {
        await this.assertAssignmentRuleUserTx(tx, data.assignedUserId);
      }
      const payload: Partial<InsertOpportunityAssignmentRule> & { updatedAt: Date } = { updatedAt: new Date() };
      if (data.categoryKey !== undefined) payload.categoryKey = data.categoryKey || null;
      if (data.workType !== undefined) payload.workType = data.workType || null;
      if (data.zoneId !== undefined) payload.zoneId = data.zoneId || null;
      if (data.source !== undefined) payload.source = data.source || null;
      if (data.assignedUserId !== undefined) payload.assignedUserId = data.assignedUserId;
      if (data.isActive !== undefined) payload.isActive = data.isActive;
      if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
      const [rule] = await tx
        .update(opportunityAssignmentRules)
        .set(payload)
        .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.id, id)))
        .returning();
      return rule;
    });
  }

  async deleteOpportunityAssignmentRule(id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [rule] = await tx
        .select()
        .from(opportunityAssignmentRules)
        .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.id, id)));
      if (!rule) return false;
      const [usage] = await tx
        .select({ assigned: count() })
        .from(opportunities)
        .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.assignedByRuleId, id)));
      const assigned = Number(usage?.assigned ?? 0);
      if (assigned > 0) {
        throw new OpportunityAssignmentError(
          409,
          "RULE_IN_USE",
          `${assigned} opportunit${assigned === 1 ? "y was" : "ies were"} assigned by this rule and carry it as history - deactivate the rule instead of deleting it`,
        );
      }
      await tx.delete(opportunityAssignmentRules).where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.id, id)));
      return true;
    });
  }

  async reorderOpportunityAssignmentRules(ids: string[]): Promise<OpportunityAssignmentRule[]> {
    return db.transaction(async (tx) => {
      const rows = await tx.select().from(opportunityAssignmentRules).where(eq(opportunityAssignmentRules.orgId, this.orgId));
      const known = new Set(rows.map((rule) => rule.id));
      const seen = new Set<string>();
      const invalid = () => new OpportunityAssignmentError(400, "RULE_ORDER_INVALID", "The order must name every assignment rule of this organization exactly once");
      for (const id of ids) {
        if (!known.has(id) || seen.has(id)) throw invalid();
        seen.add(id);
      }
      if (seen.size !== known.size) throw invalid();
      const now = new Date();
      for (let index = 0; index < ids.length; index++) {
        await tx
          .update(opportunityAssignmentRules)
          .set({ sortOrder: (index + 1) * 10, updatedAt: now })
          .where(and(eq(opportunityAssignmentRules.orgId, this.orgId), eq(opportunityAssignmentRules.id, ids[index])));
      }
      const updated = await tx.select().from(opportunityAssignmentRules).where(eq(opportunityAssignmentRules.orgId, this.orgId));
      return sortAssignmentRules(updated);
    });
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

      // Pass 24 (C3.7): the converted service takes its type's kind. A
      // CALLBACK type answers the opportunity's SOURCE service - the visit
      // this follow-up came from - when that service qualifies (completed,
      // same location, not itself a callback). With no source at all the
      // conversion is refused rather than silently re-kinded: the office
      // creates the callback from the location's Services tab and picks the
      // service it answers.
      const convertedKind = linkedGeneratedService?.source === "AGREEMENT_GENERATED"
        ? null
        : await (async () => {
            const typeKind = defaultWorkKindForService({ typeKind: serviceType?.workKind, source: "MANUAL", hasAgreement: false });
            if (typeKind === "CALLBACK" && !opportunity.sourceServiceId) {
              throw new ServiceKindError(
                400,
                "CALLBACK_LINK_REQUIRED",
                `"${serviceType?.name ?? "This service type"}" is a callback type and this opportunity has no source service to answer. Create the callback from the location's Services tab and pick the service it answers.`,
              );
            }
            return this.resolveServiceWorkKindTx(tx, {
              serviceId: null,
              locationId: location.id,
              agreementId: null,
              source: "MANUAL",
              serviceTypeId: opportunity.serviceTypeId || null,
              requestedWorkKind: undefined,
              requestedAnswersServiceId: typeKind === "CALLBACK" ? opportunity.sourceServiceId ?? null : undefined,
              current: null,
              actorRole: null,
            });
          })();

      const service = linkedGeneratedService?.source === "AGREEMENT_GENERATED"
        ? linkedGeneratedService
        : (await tx.insert(services).values({
            orgId: this.orgId,
            customerId: location.customerId,
            locationId: location.id,
            serviceTypeId: opportunity.serviceTypeId || null,
            workKind: convertedKind!.workKind,
            answersServiceId: convertedKind!.answersServiceId,
            dueDate: opportunity.dueDate,
            expectedDurationMinutes: serviceType?.estimatedDuration ?? null,
            priceCents: serviceType?.defaultPriceCents ?? null,
            status: "PENDING_SCHEDULING",
            source: "MANUAL",
            notes: opportunity.notes || `Converted from opportunity: ${opportunity.opportunityType || serviceType?.name || "Opportunity"}`,
          }).returning())[0];

      // Pass 32 (C5.1a): a conversion that made a new service records it; one
      // that reused the agreement's generated service made nothing.
      if (linkedGeneratedService?.source !== "AGREEMENT_GENERATED") {
        await this.auditCreatedTx(tx, "service", service.id, serviceAuditSnapshot(service), actor);
      }

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

  // Pass 32 (C5.1a): org-wide, no location - the template's rows are read by
  // GET /api/audit-logs?entityType=agreement_template&entityId= (a Settings
  // surface later), never on a location's History tab.
  async createAgreementTemplate(data: InsertAgreementTemplate, actor?: AuditActor | null): Promise<AgreementTemplate> {
    const payload = this.normalizeAgreementTemplateInsert(data);
    return db.transaction(async (tx) => {
      const [template] = await tx.insert(agreementTemplates).values({ ...payload, orgId: this.orgId }).returning();
      await this.auditCreatedTx(tx, "agreement_template", template.id, template, actor);
      return template;
    });
  }

  async updateAgreementTemplate(id: string, data: Partial<InsertAgreementTemplate>, actor?: AuditActor | null): Promise<AgreementTemplate | undefined> {
    const payload = this.normalizeAgreementTemplateUpdate(data);
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(agreementTemplates).where(and(eq(agreementTemplates.orgId, this.orgId), eq(agreementTemplates.id, id)));
      if (!existing) {
        return undefined;
      }
      const [template] = await tx.update(agreementTemplates).set({ ...payload, updatedAt: new Date() }).where(and(eq(agreementTemplates.orgId, this.orgId), eq(agreementTemplates.id, id))).returning();
      if (template) {
        await this.auditChangeTx(tx, "agreement_template", template.id, existing, template, actor);
      }
      return template;
    });
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
      await this.assertOrgUserTx(tx, payload.soldByUserId, "Sold-by user");
      const [createdAgreement] = await tx.insert(agreements).values({ ...payload, orgId: this.orgId }).returning();

      let finalAgreement = createdAgreement;
      if (createdAgreement.initialAppointmentId && createdAgreement.startDateSource === "INITIAL_APPOINTMENT") {
        await this.attachInitialAppointmentTx(tx, createdAgreement.initialAppointmentId, createdAgreement.id, actor);
        finalAgreement = (await this.syncAgreementInitialAppointmentDates(tx, createdAgreement.id, actor, { audit: false })) || createdAgreement;
      }

      // Pass 11d (owner review 2026-09-21, D4 item 2a): nothing is invoiced
      // here any more. A down payment is a charge of the initial service and
      // rides the first visit's invoice (buildVisitInvoiceLinesTx); the
      // explicit up-front path (issueInitialChargeInvoice) stays for a
      // deposit invoice the customer pays before the visit and for the other
      // charge types. What the office is prompted to collect at signing is
      // getInitialChargeDueForAgreement, read by the route after this returns.

      // Pass 32 (C5.1a): the agreement's `created` row, as the creation left
      // it (the dates synced from the initial appointment when there is one).
      await this.auditCreatedTx(tx, "agreement", finalAgreement.id, await this.agreementAuditSnapshotTx(tx, finalAgreement), actor);
      return finalAgreement;
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
      await this.resolveBillingPlanChangeTx(tx, existingAgreement, payload);
      if (payload.soldByUserId !== undefined) {
        await this.assertOrgUserTx(tx, payload.soldByUserId, "Sold-by user");
      }
      const [updatedAgreement] = await tx.update(agreements).set({ ...payload, updatedAt: new Date() }).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, id))).returning();
      if (!updatedAgreement) {
        return undefined;
      }

      let finalAgreement = updatedAgreement;
      if (updatedAgreement.initialAppointmentId && updatedAgreement.startDateSource === "INITIAL_APPOINTMENT") {
        await this.attachInitialAppointmentTx(tx, updatedAgreement.initialAppointmentId, updatedAgreement.id, actor);
        finalAgreement = (await this.syncAgreementInitialAppointmentDates(tx, updatedAgreement.id, actor, { audit: false })) || updatedAgreement;
      }

      // Pass 12 recorded only the sale-credit change here ({ soldByUserId,
      // soldBy } before and after, the users named). Pass 32 (C5.1a) widened
      // it to the whole row with the sold-by user still named on both sides:
      // one `update` (or `status_changed`) when anything moved, nothing when
      // the form sent the row back unchanged (the Pass 12 guard, generalized).
      await this.auditChangeTx(
        tx,
        "agreement",
        finalAgreement.id,
        await this.agreementAuditSnapshotTx(tx, existingAgreement),
        await this.agreementAuditSnapshotTx(tx, finalAgreement),
        actor,
      );

      return finalAgreement;
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

      // Pass 32 (C5.1a): the agreement's CANCELLED was unaudited (Pass 30's
      // leftover) - one status_changed with the whole row before and after,
      // the reason, the policy snapshot and the override stamps in the diff.
      await this.auditChangeTx(
        tx,
        "agreement",
        agreement.id,
        await this.agreementAuditSnapshotTx(tx, agreement),
        await this.agreementAuditSnapshotTx(tx, updatedAgreement),
        input.actor,
      );

      const agreementServices = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.agreementId, agreement.id)));

      if (cancelPendingServices) {
        // The same set the old one-statement update took (this agreement's
        // AGREEMENT_GENERATED services still PENDING_SCHEDULING), written one
        // by one so each gets its status_changed row.
        for (const service of agreementServices) {
          if (service.source !== "AGREEMENT_GENERATED" || service.status !== "PENDING_SCHEDULING") continue;
          const [cancelledService] = await tx
            .update(services)
            .set({ status: "CANCELLED", updatedAt: cancelledAt })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
            .returning();
          if (cancelledService) {
            await this.auditChangeTx(tx, "service", service.id, serviceAuditSnapshot(service), serviceAuditSnapshot(cancelledService), input.actor);
          }
        }
      }

      if (cancelScheduledAppointments) {
        const scheduledAppointments = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.agreementId, agreement.id)));

        // Q3: every appointment the two loops below will cancel, checked for
        // DRAFT invoices BEFORE any of them is touched. Throwing here rolls the
        // whole cancellation back, so the office sees the prompt and nothing
        // has half-happened.
        const cancellingAppointmentIds = new Set<string>();
        for (const appointment of scheduledAppointments) {
          if (appointment.status === "COMPLETED" || appointment.status === "CANCELED") continue;
          cancellingAppointmentIds.add(appointment.id);
        }
        for (const service of agreementServices) {
          if (!service.appointmentId || service.status === "COMPLETED" || service.status === "CANCELLED") continue;
          cancellingAppointmentIds.add(service.appointmentId);
        }
        await this.resolveDraftInvoicesOnCancelTx(tx, Array.from(cancellingAppointmentIds), input.voidDraftInvoices, input.actor ?? null);

        // Pass 32 (C5.1a, decided): the visits this cancellation takes down
        // used to be set CANCELED directly - no reason, no row (Pass 30's
        // leftover). Each now carries the disposition's cancel fields (the
        // agreement's reason, a note naming the agreement, when and by whom)
        // and writes one status_changed with its services, so the Services
        // tab and the History tab read it like any other cancelled visit.
        // Not routed through dispositionAppointment: that path recycles an
        // agreement's services back to the queue with a reset window, the
        // opposite of what a cancellation asks. A visit already CANCELED or
        // COMPLETED is left as it is; each id is written once (the two old
        // loops could hit the same visit twice).
        const appointmentsById = new Map(scheduledAppointments.map((appointment) => [appointment.id, appointment] as const));
        for (const appointmentId of Array.from(cancellingAppointmentIds)) {
          let appointmentBefore = appointmentsById.get(appointmentId);
          if (!appointmentBefore) {
            [appointmentBefore] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
          }
          if (!appointmentBefore || appointmentBefore.status === "COMPLETED" || appointmentBefore.status === "CANCELED") continue;
          const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, appointmentBefore.id, appointmentBefore.serviceId);
          const [appointmentAfter] = await tx
            .update(appointments)
            .set({
              status: "CANCELED",
              cancelReason: input.reason.trim(),
              cancelNotes: `Agreement cancelled: ${agreement.agreementName}`,
              cancelRequestedAt: cancelledAt,
              cancelRequestedByLabel: input.actor?.actorLabel || null,
            })
            .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentBefore.id)))
            .returning();
          if (appointmentAfter) {
            await this.auditChangeTx(tx, "appointment", appointmentAfter.id, appointmentAuditSnapshot(appointmentBefore, linkedServices), appointmentAuditSnapshot(appointmentAfter, linkedServices), input.actor);
          }
        }

        for (const service of agreementServices) {
          if (!service.appointmentId || service.status === "COMPLETED" || service.status === "CANCELLED") continue;
          const [cancelledService] = await tx
            .update(services)
            .set({ status: "CANCELLED", updatedAt: cancelledAt })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
            .returning();
          if (cancelledService) {
            await this.auditChangeTx(tx, "service", service.id, serviceAuditSnapshot(service), serviceAuditSnapshot(cancelledService), input.actor);
          }
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
          const retentionOpportunity = await this.insertOpportunityTx(tx, {
            locationId: agreement.locationId,
            agreementId: agreement.id,
            serviceTypeId: agreement.serviceTypeId || null,
            source: "AGREEMENT_CANCELLATION_RETENTION",
            // Pass 25: RETENTION / AGREEMENT.
            ...opportunityTaxonomyColumns("AGREEMENT_CANCELLATION_RETENTION", true),
            opportunityType: "Agreement Cancellation Retention",
            dueDate: nextActionDate as any,
            nextActionDate: nextActionDate as any,
            status: "OPEN",
            notes: `Retention follow-up for cancelled agreement: ${agreement.agreementName}`,
          });

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

      await this.attachInitialAppointmentTx(tx, appointment.id, existingAgreement.id, input.actor);

      await tx
        .update(agreements)
        .set({
          initialAppointmentId: appointment.id,
          startDateSource: "INITIAL_APPOINTMENT",
          updatedAt: new Date(),
          updatedByUserId: input.actor?.userId || existingAgreement.updatedByUserId || null,
        })
        .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, existingAgreement.id)));

      const linkedAgreement = (await this.syncAgreementInitialAppointmentDates(tx, existingAgreement.id, input.actor, { audit: false })) ?? existingAgreement;
      // Pass 32 (C5.1a): one `update` for the link - the initial appointment
      // taken and the dates derived from it.
      await this.auditChangeTx(
        tx,
        "agreement",
        existingAgreement.id,
        await this.agreementAuditSnapshotTx(tx, existingAgreement),
        await this.agreementAuditSnapshotTx(tx, linkedAgreement),
        input.actor,
      );
      return linkedAgreement;
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

  async createAppointment(data: InsertAppointment, options: PlacementOptions = {}): Promise<Appointment> {
    const appointment = await db.transaction(async (tx) => {
      // Pass 30 (C4.4; B14): a technician the customer EXCLUDED at this
      // location is refused before anything is written, unless a manager
      // overrides with a reason.
      // Pass 30b: and anyone but the customer's preferred technician needs the
      // user's confirmation (acknowledgePreference).
      const checks = await this.assertPlacementAllowedTx(tx, {
        locationId: data.locationId ?? null,
        technicianId: data.assignedTechnicianId || null,
        options,
        checkPreference: true,
      });
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

      // Pass 30: the crew's LEAD mirrors the visit's technician.
      await this.syncCrewLeadTx(tx, appt.id, appt.assignedTechnicianId);
      await this.syncServicesForAppointmentTx(tx, appt);

      if (appt.serviceId) {
        await this.convertPlacementOpportunitiesTx(tx, appt.serviceId, appt.id);
      }

      if (appt.agreementId && appt.source === "AGREEMENT_INITIAL") {
        const [agreementBefore] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, appt.agreementId)));
        await tx
          .update(agreements)
          .set({
            initialAppointmentId: appt.id,
            startDateSource: "INITIAL_APPOINTMENT",
            updatedAt: new Date(),
          })
          .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, appt.agreementId)));

        // Pass 32: the agreement taking this visit as its initial one and the
        // dates derived from it - one `update`, signed by the placer.
        const agreementAfter = await this.syncAgreementInitialAppointmentDates(tx, appt.agreementId, options.actor, { audit: false });
        if (agreementBefore && agreementAfter) {
          await this.auditChangeTx(tx, "agreement", agreementBefore.id, await this.agreementAuditSnapshotTx(tx, agreementBefore), await this.agreementAuditSnapshotTx(tx, agreementAfter), options.actor);
        }
      }

      await this.recordPlacementChecksTx(tx, { appointment: appt, checks, via: "CREATE", previousTechnicianId: null, actor: options.actor });

      // Pass 32 (C5.1a): the visit's `created` row with its services as the
      // placement left them (SCHEDULED, the technician). The services' own
      // status move rides here - the way a disposition's or a composition
      // change's does - rather than as a row per service.
      const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, appt.id, appt.serviceId);
      await this.auditCreatedTx(tx, "appointment", appt.id, appointmentAuditSnapshot(appt, linkedServices), options.actor);

      return appt;
    });
    return appointment;
  }

  // The placement's conversion (since before Pass 27): the OPEN reschedule /
  // cancel-review opportunities on a service that lands on a visit are
  // CONVERTED, with an activity and a communication row each. Pass 28
  // (decision 8): one helper for every landing - the representative at
  // creation and every service added to a visit later - so a requeued
  // service re-placed as an extra no longer keeps its OPEN handoff row.
  private async convertPlacementOpportunitiesTx(tx: DbTransaction, serviceId: string, appointmentId: string): Promise<number> {
    const resolvedAt = new Date();
    const resolvedOpportunities = await tx
      .update(opportunities)
      .set({
        status: "CONVERTED",
        convertedServiceId: serviceId,
        nextActionDate: null,
        lastDispositionKey: "RESCHEDULED",
        lastDispositionLabel: "Rescheduled",
        lastDispositionAt: resolvedAt,
        updatedAt: resolvedAt,
      })
      .where(and(
        eq(opportunities.orgId, this.orgId),
        eq(opportunities.sourceServiceId, serviceId),
        eq(opportunities.status, "OPEN"),
        inArray(opportunities.source, ["APPOINTMENT_RESCHEDULE_REQUIRED", "APPOINTMENT_CANCELLATION_REVIEW"]),
      ))
      .returning();

    for (const opportunity of resolvedOpportunities) {
      const activity = await this.createOpportunityActivityTx(tx, {
        opportunityId: opportunity.id,
        dispositionKey: "RESCHEDULED",
        dispositionLabel: "Rescheduled",
        notes: `Service scheduled on appointment ${appointmentId}`,
        nextActionDate: null,
        createdByUserId: null,
        createdByLabel: "System",
      });

      await this.createOpportunityCommunicationTx(tx, {
        opportunity,
        activity,
        subject: "Opportunity Call - Rescheduled",
        body: `Disposition: Rescheduled\nService scheduled on appointment ${appointmentId}`,
        nextActionDate: null,
        actorLabel: "System",
      });
    }
    return resolvedOpportunities.length;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>, actor?: AuditActor | null, options: PlacementOptions = {}): Promise<Appointment | undefined> {
    // Pass 27 (C4.2): CANCELED is written by dispositionAppointment() only -
    // the reason, the requeue, the opportunity choice and the audit row live
    // there. The board's old status PATCH cascaded every service to
    // CANCELLED with none of them.
    if (data.status === "CANCELED") {
      throw new AppointmentDispositionError(409, CANCEL_DISPOSITION_REQUIRED, "Cancel or reschedule an appointment through its disposition, not a status change");
    }

    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)));
      if (!existingAppointment) {
        return undefined;
      }

      // Pass 28 (C4.3a; B13): the visit's instructions to the technician -
      // appointments.notes, "Scheduling Notes" on the sheet - are edited
      // through this PATCH, and a change writes appointment_composition_changed
      // with the visit and its services before and after. Pass 32 (C5.1a):
      // every other change - technician, time, status, locks - writes the
      // visit's `update` / `status_changed` below with the same snapshot, so
      // the services are read before and after either way.
      const notesChanged = data.notes !== undefined && (data.notes ?? null) !== (existingAppointment.notes ?? null);
      const linkedBefore = await this.getLinkedServicesForAppointmentTx(tx, existingAppointment.id, existingAppointment.serviceId);

      // Pass 30 (C4.4; B14): a change of technician to one the customer
      // EXCLUDED at the visit's location is refused before anything is
      // written, unless a manager overrides with a reason. An unchanged
      // technician is never re-checked, so a sheet save on a visit placed
      // before the exclusion was recorded still saves. The crew's LEAD
      // follows the new technician.
      const nextTechnicianId = data.assignedTechnicianId === undefined ? undefined : (data.assignedTechnicianId || null);
      const technicianChanged = nextTechnicianId !== undefined && nextTechnicianId !== (existingAppointment.assignedTechnicianId ?? null);
      const checks = technicianChanged
        ? await this.assertPlacementAllowedTx(tx, {
            locationId: data.locationId ?? existingAppointment.locationId ?? null,
            technicianId: nextTechnicianId ?? null,
            options: { ...options, actor: options.actor ?? actor },
            checkPreference: true,
          })
        : null;

      const [updatedAppointment] = await tx
        .update(appointments)
        .set(data)
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)))
        .returning();

      if (technicianChanged) {
        await this.syncCrewLeadTx(tx, updatedAppointment.id, updatedAppointment.assignedTechnicianId);
      }
      await this.syncServicesForAppointmentTx(tx, updatedAppointment);

      const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, updatedAppointment.id)));
      if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
        await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id, actor);
      }

      const linkedAfter = await this.getLinkedServicesForAppointmentTx(tx, updatedAppointment.id, updatedAppointment.serviceId);
      if (notesChanged) {
        await this.recordCompositionChangeTx(tx, {
          actor,
          appointmentBefore: existingAppointment,
          servicesBefore: linkedBefore,
          appointmentAfter: updatedAppointment,
          servicesAfter: linkedAfter,
          composition: { action: "NOTES" },
        });
      } else {
        // Pass 32 (C5.1a): the scheduling fields and anything else the PATCH
        // moved, the services as the placement left them; one row, and none
        // when the sheet saved the row back unchanged. A notes change keeps
        // its composition row above, whose snapshot carries the same fields.
        await this.auditChangeTx(tx, "appointment", updatedAppointment.id, appointmentAuditSnapshot(existingAppointment, linkedBefore), appointmentAuditSnapshot(updatedAppointment, linkedAfter), actor);
      }

      if (checks) {
        await this.recordPlacementChecksTx(tx, {
          appointment: updatedAppointment,
          checks,
          via: "UPDATE",
          previousTechnicianId: existingAppointment.assignedTechnicianId,
          actor: options.actor ?? actor,
        });
      }

      return updatedAppointment;
    });
  }

  // ---------------------------------------------------------------------
  // Pass 30 (PLAN_ROADMAP_V2.md C4.4; B14; D8): technician preferences and
  // the visit's crew. The vocabulary and the resolve rule are
  // shared/technician-preferences.ts and shared/appointment-crew.ts.
  // ---------------------------------------------------------------------

  private async technicianNameMapTx(tx: DbReader): Promise<Map<string, string>> {
    const rows = await tx
      .select({ id: technicians.id, displayName: technicians.displayName })
      .from(technicians)
      .where(eq(technicians.orgId, this.orgId));
    return new Map(rows.map((row) => [row.id, row.displayName]));
  }

  // The rows the resolve rule reads for some locations and their accounts.
  private async preferenceRowsForScopesTx(tx: DbReader, locationIds: string[], accountIds: string[]): Promise<TechnicianPreference[]> {
    const scopes: SQL[] = [];
    if (locationIds.length) {
      scopes.push(and(eq(technicianPreferences.scopeType, "LOCATION"), inArray(technicianPreferences.locationId, locationIds))!);
    }
    if (accountIds.length) {
      scopes.push(and(eq(technicianPreferences.scopeType, "ACCOUNT"), inArray(technicianPreferences.accountId, accountIds))!);
    }
    if (!scopes.length) {
      return [];
    }
    return tx
      .select()
      .from(technicianPreferences)
      .where(and(eq(technicianPreferences.orgId, this.orgId), or(...scopes)))
      .orderBy(asc(technicianPreferences.createdAt), asc(technicianPreferences.id));
  }

  // The resolve rule at one location: null when the location is not the org's.
  private async resolveEffectivePreferencesTx(tx: DbReader, locationId: string): Promise<EffectiveTechnicianPreference[] | null> {
    const [location] = await tx
      .select({ id: locations.id, accountId: locations.accountId })
      .from(locations)
      .where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    if (!location) {
      return null;
    }
    const rows = await this.preferenceRowsForScopesTx(tx, [location.id], location.accountId ? [location.accountId] : []);
    if (!rows.length) {
      return [];
    }
    const names = await this.technicianNameMapTx(tx);
    return resolveEffectivePreferences(rows, { locationId: location.id, accountId: location.accountId }, (id) => names.get(id) ?? "Unknown technician");
  }

  // The hard block (B14): placing `technicianId` at `locationId` when the
  // customer EXCLUDED them there. Refused 409 without an override; with one,
  // the role must hold OVERRIDE_TECHNICIAN_EXCLUSION (403) and the reason must
  // be typed (400). Returns the override to record once the write is done, or
  // null when nothing was excluded (an override sent for a technician who is
  // not excluded is ignored - nothing to record).
  //
  // Pass 30b (owner, 2026-10-03): with `checkPreference` (a placement or a
  // re-assignment of the lead - not a crew SUPPORT add), a technician who is
  // not among the customer's PREFERRED ones is refused 409
  // PREFERENCE_NOT_HONORED until the user confirms (acknowledgePreference, any
  // role). An exclusion override covers the preference too - one prompt, and
  // the override row names the preference passed over.
  private async assertPlacementAllowedTx(
    tx: DbTransaction,
    input: { locationId: string | null; technicianId: string | null; options: PlacementOptions; checkPreference?: boolean },
  ): Promise<PlacementChecksApplied> {
    const none: PlacementChecksApplied = { override: null, preferenceBypassed: null };
    if (!input.locationId || !input.technicianId) {
      return none;
    }
    const effective = (await this.resolveEffectivePreferencesTx(tx, input.locationId)) ?? [];
    const preferred = input.checkPreference ? preferredTechnicians(effective) : [];
    const passedOver = preferred.length > 0 && !preferred.some((entry) => entry.technicianId === input.technicianId) ? preferred : [];
    const exclusion = findExclusion(effective, input.technicianId);
    if (exclusion) {
      const override = input.options.overrideExclusion;
      if (!override) {
        throw new PlacementRefusedError(409, TECHNICIAN_EXCLUDED, describeExclusionRefusal(exclusion.technicianName, exclusion.scopeType), exclusion, passedOver);
      }
      if (!can(input.options.actorRole ?? "", PERMISSIONS.OVERRIDE_TECHNICIAN_EXCLUSION)) {
        const who = rolesWithPermission(PERMISSIONS.OVERRIDE_TECHNICIAN_EXCLUSION).join(" or ");
        throw new PlacementRefusedError(403, EXCLUSION_OVERRIDE_FORBIDDEN, `Only a ${who} may schedule ${exclusion.technicianName}, whom the customer excluded`, exclusion, passedOver);
      }
      const reason = override.reason?.trim() ?? "";
      if (!reason) {
        throw new PlacementRefusedError(400, EXCLUSION_OVERRIDE_REASON_REQUIRED, `Say why ${exclusion.technicianName} is being scheduled despite the customer's exclusion`, exclusion, passedOver);
      }
      return { override: { exclusion, reason, preferredBypassed: passedOver }, preferenceBypassed: null };
    }
    if (!passedOver.length) {
      return none;
    }
    if (!input.options.acknowledgePreference) {
      const chosenName = (await this.technicianNameMapTx(tx)).get(input.technicianId) ?? "this technician";
      throw new PlacementRefusedError(
        409,
        PREFERENCE_NOT_HONORED,
        describePreferenceBypass(passedOver.map((entry) => entry.technicianName), chosenName),
        null,
        passedOver,
        { id: input.technicianId, name: chosenName },
      );
    }
    return { override: null, preferenceBypassed: passedOver };
  }

  // Pass 30b: one row per check the placement passed with a confirmation -
  // the exclusion override, or the preference passed over.
  private async recordPlacementChecksTx(
    tx: DbTransaction,
    input: {
      appointment: Appointment;
      checks: PlacementChecksApplied;
      via: "CREATE" | "UPDATE";
      previousTechnicianId: string | null;
      actor?: AuditActor | null;
    },
  ): Promise<void> {
    if (input.checks.override) {
      await this.recordExclusionOverrideTx(tx, {
        appointment: input.appointment,
        override: input.checks.override,
        via: input.via,
        previousTechnicianId: input.previousTechnicianId,
        actor: input.actor,
      });
    }
    const passedOver = input.checks.preferenceBypassed;
    if (passedOver && passedOver.length && input.appointment.assignedTechnicianId) {
      const names = await this.technicianNameMapTx(tx);
      await this.recordAuditLogTx(tx, {
        entityType: "appointment",
        entityId: input.appointment.id,
        action: "placement_preference_bypassed",
        actor: input.actor,
        before: input.via === "UPDATE" ? { assignedTechnicianId: input.previousTechnicianId ?? null } : undefined,
        after: {
          via: input.via,
          technicianId: input.appointment.assignedTechnicianId,
          technicianName: names.get(input.appointment.assignedTechnicianId) ?? "Unknown technician",
          preferred: preferenceAuditList(passedOver),
        },
      });
    }
  }

  private async recordExclusionOverrideTx(
    tx: DbTransaction,
    input: {
      appointment: Appointment;
      override: ExclusionOverrideApplied;
      via: "CREATE" | "UPDATE" | "CREW_ADD";
      previousTechnicianId?: string | null;
      actor?: AuditActor | null;
    },
  ): Promise<void> {
    const { exclusion, reason } = input.override;
    await this.recordAuditLogTx(tx, {
      entityType: "appointment",
      entityId: input.appointment.id,
      action: "placement_exclusion_overridden",
      actor: input.actor,
      before: input.via === "UPDATE" ? { assignedTechnicianId: input.previousTechnicianId ?? null } : undefined,
      after: {
        via: input.via,
        technicianId: exclusion.technicianId,
        technicianName: exclusion.technicianName,
        reason,
        preference: {
          id: exclusion.preferenceId,
          scopeType: exclusion.scopeType,
          kind: exclusion.kind,
          note: exclusion.note,
        },
        // Pass 30b: the customer's preferred technicians this placement also passed over.
        preferredBypassed: preferenceAuditList(input.override.preferredBypassed),
      },
    });
  }

  // Pass 30b: each visit's planned window - the stored end, else the
  // representative's expected duration, else DEFAULT_VISIT_MINUTES.
  private async plannedWindowsTx(tx: DbReader, list: Appointment[]): Promise<Map<string, { start: Date; end: Date }>> {
    const serviceIds = Array.from(new Set(list.filter((appointment) => !appointment.scheduledEndDate && appointment.serviceId).map((appointment) => appointment.serviceId!)));
    const durations = new Map<string, number | null>();
    if (serviceIds.length) {
      const rows = await tx
        .select({ id: services.id, minutes: services.expectedDurationMinutes })
        .from(services)
        .where(and(eq(services.orgId, this.orgId), inArray(services.id, serviceIds)));
      for (const row of rows) durations.set(row.id, row.minutes);
    }
    return new Map(list.map((appointment) => [
      appointment.id,
      plannedWindow(appointment.scheduledDate, appointment.scheduledEndDate, durations.get(appointment.serviceId ?? "") ?? null),
    ]));
  }

  // Pass 30b (owner, 2026-10-03): the technician's other visits - as lead or
  // as support, not CANCELED - whose planned windows overlap this visit's.
  private async findTechnicianConflictsTx(tx: DbTransaction, appointment: Appointment, technicianId: string): Promise<CrewScheduleConflict[]> {
    const own = (await this.plannedWindowsTx(tx, [appointment])).get(appointment.id)!;
    const supported = tx
      .select({ appointmentId: appointmentTechnicians.appointmentId })
      .from(appointmentTechnicians)
      .where(and(
        eq(appointmentTechnicians.orgId, this.orgId),
        eq(appointmentTechnicians.technicianId, technicianId),
        eq(appointmentTechnicians.role, "SUPPORT"),
      ));
    const candidates = await tx
      .select({ appointment: appointments, firstName: customers.firstName, lastName: customers.lastName, companyName: customers.companyName })
      .from(appointments)
      .leftJoin(customers, eq(customers.id, appointments.customerId))
      .where(and(
        eq(appointments.orgId, this.orgId),
        ne(appointments.id, appointment.id),
        ne(appointments.status, "CANCELED"),
        or(eq(appointments.assignedTechnicianId, technicianId), inArray(appointments.id, supported)),
        lt(appointments.scheduledDate, own.end),
        gt(appointments.scheduledDate, new Date(own.start.getTime() - 24 * 60 * 60 * 1000)),
      ));
    const windows = await this.plannedWindowsTx(tx, candidates.map((candidate) => candidate.appointment));
    return candidates
      .filter((candidate) => windowsOverlap(own, windows.get(candidate.appointment.id)!))
      .map((candidate) => ({
        appointmentId: candidate.appointment.id,
        role: (candidate.appointment.assignedTechnicianId === technicianId ? "LEAD" : "SUPPORT") as AppointmentCrewRole,
        scheduledDate: candidate.appointment.scheduledDate,
        plannedEnd: windows.get(candidate.appointment.id)!.end,
        customerName: candidate.companyName?.trim() || `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim(),
      }))
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }

  // Pass 30b: the board's support cards - every SUPPORT row on a live visit
  // that starts inside [from, to).
  async getSupportAssignments(from: Date, to: Date): Promise<SupportAssignment[]> {
    return db
      .select({ appointmentId: appointmentTechnicians.appointmentId, technicianId: appointmentTechnicians.technicianId })
      .from(appointmentTechnicians)
      .innerJoin(appointments, eq(appointments.id, appointmentTechnicians.appointmentId))
      .where(and(
        eq(appointmentTechnicians.orgId, this.orgId),
        eq(appointmentTechnicians.role, "SUPPORT"),
        ne(appointments.status, "CANCELED"),
        gte(appointments.scheduledDate, from),
        lt(appointments.scheduledDate, to),
      ));
  }

  private async locationTechnicianPreferencesTx(tx: DbReader, locationId: string): Promise<LocationTechnicianPreferences | undefined> {
    const [location] = await tx
      .select({ id: locations.id, accountId: locations.accountId, isPrimary: locations.isPrimary })
      .from(locations)
      .where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    if (!location) {
      return undefined;
    }
    const rows = await this.preferenceRowsForScopesTx(tx, [location.id], location.accountId ? [location.accountId] : []);
    const names = rows.length ? await this.technicianNameMapTx(tx) : new Map<string, string>();
    const nameOf = (id: string) => names.get(id) ?? "Unknown technician";
    const view = (row: TechnicianPreference): TechnicianPreferenceView => ({
      id: row.id,
      scopeType: row.scopeType,
      accountId: row.accountId,
      locationId: row.locationId,
      technicianId: row.technicianId,
      kind: row.kind,
      note: row.note,
      technicianName: nameOf(row.technicianId),
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    });
    return {
      locationId: location.id,
      accountId: location.accountId,
      isPrimaryLocation: !!location.isPrimary,
      locationRows: rows.filter((row) => row.scopeType === "LOCATION").map(view),
      accountRows: rows.filter((row) => row.scopeType === "ACCOUNT").map(view),
      effective: resolveEffectivePreferences(rows, { locationId: location.id, accountId: location.accountId }, nameOf),
    };
  }

  async getLocationTechnicianPreferences(locationId: string): Promise<LocationTechnicianPreferences | undefined> {
    return this.locationTechnicianPreferencesTx(db, locationId);
  }

  // The dispatch board's read: the resolve rule at each location asked for,
  // keyed by location id; a location with nothing in effect is left out.
  async getEffectiveTechnicianPreferences(locationIds: string[]): Promise<Record<string, EffectiveTechnicianPreference[]>> {
    const ids = Array.from(new Set(locationIds.filter(Boolean)));
    if (!ids.length) {
      return {};
    }
    const scoped = await db
      .select({ id: locations.id, accountId: locations.accountId })
      .from(locations)
      .where(and(eq(locations.orgId, this.orgId), inArray(locations.id, ids)));
    const accountIds = Array.from(new Set(scoped.map((location) => location.accountId).filter((id): id is string => !!id)));
    const rows = await this.preferenceRowsForScopesTx(db, scoped.map((location) => location.id), accountIds);
    if (!rows.length) {
      return {};
    }
    const names = await this.technicianNameMapTx(db);
    const result: Record<string, EffectiveTechnicianPreference[]> = {};
    for (const location of scoped) {
      const effective = resolveEffectivePreferences(rows, { locationId: location.id, accountId: location.accountId }, (id) => names.get(id) ?? "Unknown technician");
      if (effective.length) {
        result[location.id] = effective;
      }
    }
    return result;
  }

  // Set one technician's preference: the location's row, or - from the
  // primary location ("Apply to all locations") - the account's. One row per
  // technician per scope, so a set over an existing row changes its kind and
  // note. An unchanged set writes nothing. A LOCATION row is audited on the
  // location, an ACCOUNT row on the account's customer (every location's
  // History carries it).
  async setTechnicianPreference(input: TechnicianPreferenceSetInput): Promise<LocationTechnicianPreferences | undefined> {
    return db.transaction(async (tx) => {
      const [location] = await tx
        .select({ id: locations.id, accountId: locations.accountId, isPrimary: locations.isPrimary, customerId: locations.customerId })
        .from(locations)
        .where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      if (!location) {
        return undefined;
      }
      const scope = input.scope;
      if (scope === "ACCOUNT") {
        if (!location.accountId) {
          throw new TechnicianPreferenceError(409, LOCATION_HAS_NO_ACCOUNT, "This location is not linked to an account, so there is no \"all locations\" to apply the preference to");
        }
        if (!location.isPrimary) {
          throw new TechnicianPreferenceError(409, ACCOUNT_SCOPE_PRIMARY_ONLY, "A preference for all locations is set on the primary location");
        }
      }
      const [technician] = await tx
        .select({ id: technicians.id, displayName: technicians.displayName })
        .from(technicians)
        .where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, input.technicianId)));
      if (!technician) {
        throw new TechnicianPreferenceError(404, TECHNICIAN_NOT_FOUND, "Technician not found");
      }
      const note = input.note?.trim() || null;
      const scopeCondition = scope === "ACCOUNT"
        ? eq(technicianPreferences.accountId, location.accountId!)
        : eq(technicianPreferences.locationId, location.id);
      const [existing] = await tx
        .select()
        .from(technicianPreferences)
        .where(and(
          eq(technicianPreferences.orgId, this.orgId),
          eq(technicianPreferences.scopeType, scope),
          scopeCondition,
          eq(technicianPreferences.technicianId, technician.id),
        ));
      if (existing && existing.kind === input.kind && (existing.note ?? null) === note) {
        return this.locationTechnicianPreferencesTx(tx, location.id);
      }

      const [row] = existing
        ? await tx
            .update(technicianPreferences)
            .set({ kind: input.kind, note, updatedAt: new Date() })
            .where(and(eq(technicianPreferences.orgId, this.orgId), eq(technicianPreferences.id, existing.id)))
            .returning()
        : await tx
            .insert(technicianPreferences)
            .values({
              orgId: this.orgId,
              scopeType: scope,
              accountId: scope === "ACCOUNT" ? location.accountId : null,
              locationId: scope === "LOCATION" ? location.id : null,
              technicianId: technician.id,
              kind: input.kind,
              note,
              createdByUserId: input.actor?.userId || null,
            })
            .returning();

      await this.recordAuditLogTx(tx, {
        entityType: scope === "ACCOUNT" ? "customer" : "location",
        entityId: scope === "ACCOUNT" ? location.customerId : location.id,
        action: "technician_preference_set",
        actor: input.actor,
        before: existing ? technicianPreferenceAuditSnapshot(existing, technician.displayName) : undefined,
        after: technicianPreferenceAuditSnapshot(row, technician.displayName),
      });
      return this.locationTechnicianPreferencesTx(tx, location.id);
    });
  }

  // Clear one row, named from a location it applies to: the location's own,
  // or the account's from the primary location.
  async clearTechnicianPreference(input: TechnicianPreferenceClearInput): Promise<LocationTechnicianPreferences | undefined> {
    return db.transaction(async (tx) => {
      const [location] = await tx
        .select({ id: locations.id, accountId: locations.accountId, isPrimary: locations.isPrimary, customerId: locations.customerId })
        .from(locations)
        .where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      if (!location) {
        return undefined;
      }
      const [row] = await tx
        .select()
        .from(technicianPreferences)
        .where(and(eq(technicianPreferences.orgId, this.orgId), eq(technicianPreferences.id, input.preferenceId)));
      const applies = !!row && (
        (row.scopeType === "LOCATION" && row.locationId === location.id) ||
        (row.scopeType === "ACCOUNT" && !!location.accountId && row.accountId === location.accountId)
      );
      if (!row || !applies) {
        throw new TechnicianPreferenceError(404, PREFERENCE_NOT_FOUND, "That preference was not found at this location");
      }
      if (row.scopeType === "ACCOUNT" && !location.isPrimary) {
        throw new TechnicianPreferenceError(409, ACCOUNT_SCOPE_PRIMARY_ONLY, "A preference for all locations is cleared on the primary location");
      }
      const names = await this.technicianNameMapTx(tx);
      await tx
        .delete(technicianPreferences)
        .where(and(eq(technicianPreferences.orgId, this.orgId), eq(technicianPreferences.id, row.id)));
      await this.recordAuditLogTx(tx, {
        entityType: row.scopeType === "ACCOUNT" ? "customer" : "location",
        entityId: row.scopeType === "ACCOUNT" ? location.customerId : location.id,
        action: "technician_preference_cleared",
        actor: input.actor,
        before: technicianPreferenceAuditSnapshot(row, names.get(row.technicianId) ?? "Unknown technician"),
      });
      return this.locationTechnicianPreferencesTx(tx, location.id);
    });
  }

  // The visit's crew, the lead first then support by name.
  private async crewMembersTx(tx: DbReader, appointmentId: string): Promise<AppointmentCrewMember[]> {
    const rows = await tx
      .select({
        technicianId: appointmentTechnicians.technicianId,
        role: appointmentTechnicians.role,
        createdAt: appointmentTechnicians.createdAt,
        technicianName: technicians.displayName,
      })
      .from(appointmentTechnicians)
      .leftJoin(technicians, eq(technicians.id, appointmentTechnicians.technicianId))
      .where(and(eq(appointmentTechnicians.orgId, this.orgId), eq(appointmentTechnicians.appointmentId, appointmentId)));
    const members: AppointmentCrewMember[] = rows.map((row) => ({
      technicianId: row.technicianId,
      technicianName: row.technicianName ?? "Unknown technician",
      role: row.role === "LEAD" ? "LEAD" : "SUPPORT",
      createdAt: row.createdAt,
    }));
    return members.sort((a, b) => (a.role !== b.role ? (a.role === "LEAD" ? -1 : 1) : a.technicianName.localeCompare(b.technicianName)));
  }

  // The LEAD row mirrors appointments.assignedTechnicianId: called by the two
  // writers of that column. A support technician promoted to lead loses the
  // support row; a visit with no technician has no lead (its support rows
  // stay, and a new support technician waits for a lead).
  private async syncCrewLeadTx(tx: DbTransaction, appointmentId: string, leadTechnicianId: string | null): Promise<void> {
    await tx.delete(appointmentTechnicians).where(and(
      eq(appointmentTechnicians.orgId, this.orgId),
      eq(appointmentTechnicians.appointmentId, appointmentId),
      eq(appointmentTechnicians.role, "LEAD"),
      leadTechnicianId ? ne(appointmentTechnicians.technicianId, leadTechnicianId) : undefined,
    ));
    if (!leadTechnicianId) {
      return;
    }
    await tx.delete(appointmentTechnicians).where(and(
      eq(appointmentTechnicians.orgId, this.orgId),
      eq(appointmentTechnicians.appointmentId, appointmentId),
      eq(appointmentTechnicians.technicianId, leadTechnicianId),
      eq(appointmentTechnicians.role, "SUPPORT"),
    ));
    await tx
      .insert(appointmentTechnicians)
      .values({ orgId: this.orgId, appointmentId, technicianId: leadTechnicianId, role: "LEAD" })
      .onConflictDoNothing();
  }

  async getAppointmentCrew(appointmentId: string): Promise<AppointmentCrew | undefined> {
    const [appointment] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
    if (!appointment) {
      return undefined;
    }
    return { appointmentId: appointment.id, members: await this.crewMembersTx(db, appointment.id) };
  }

  private async loadCrewEditableAppointmentTx(tx: DbTransaction, appointmentId: string): Promise<Appointment | undefined> {
    const [appointment] = await tx
      .select()
      .from(appointments)
      .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
    if (!appointment) {
      return undefined;
    }
    if (appointment.status === "CANCELED" || appointment.status === "COMPLETED") {
      throw new AppointmentCrewError(409, CREW_NOT_EDITABLE, "This visit is cancelled or completed - its crew is history");
    }
    return appointment;
  }

  // Add a SUPPORT technician. The visit needs a lead, the technician must not
  // be on the crew already, and a technician the customer EXCLUDED is refused
  // like a placement (the same override). One appointment_crew_changed row.
  async addAppointmentCrewMember(input: AppointmentCrewAddInput): Promise<AppointmentCrew | undefined> {
    return db.transaction(async (tx) => {
      const appointment = await this.loadCrewEditableAppointmentTx(tx, input.appointmentId);
      if (!appointment) {
        return undefined;
      }
      if (!appointment.assignedTechnicianId) {
        throw new AppointmentCrewError(409, CREW_LEAD_REQUIRED, "Assign the visit's technician first - a support technician joins a lead");
      }
      const [technician] = await tx
        .select({ id: technicians.id, displayName: technicians.displayName })
        .from(technicians)
        .where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, input.technicianId)));
      if (!technician) {
        throw new AppointmentCrewError(404, TECHNICIAN_NOT_FOUND, "Technician not found");
      }
      // Self-heal: the lead row exists before anything is compared to it.
      await this.syncCrewLeadTx(tx, appointment.id, appointment.assignedTechnicianId);
      const before = await this.crewMembersTx(tx, appointment.id);
      if (before.some((member) => member.technicianId === technician.id)) {
        throw new AppointmentCrewError(409, CREW_MEMBER_EXISTS, `${technician.displayName} is already on this visit's crew`);
      }
      const { override } = await this.assertPlacementAllowedTx(tx, {
        locationId: appointment.locationId,
        technicianId: technician.id,
        options: input,
      });
      // Pass 30b (owner, 2026-10-03): the support technician's copy of the
      // visit must not double-book them - a clash with another of their
      // visits is refused until the user confirms.
      const conflicts = await this.findTechnicianConflictsTx(tx, appointment, technician.id);
      if (conflicts.length && !input.confirmConflicts) {
        throw new AppointmentCrewError(409, CREW_SCHEDULE_CONFLICT, describeCrewConflicts(technician.displayName, conflicts), conflicts);
      }
      await tx.insert(appointmentTechnicians).values({
        orgId: this.orgId,
        appointmentId: appointment.id,
        technicianId: technician.id,
        role: "SUPPORT",
        createdByUserId: input.actor?.userId || null,
      });
      const after = await this.crewMembersTx(tx, appointment.id);
      await this.recordAuditLogTx(tx, {
        entityType: "appointment",
        entityId: appointment.id,
        action: "appointment_crew_changed",
        actor: input.actor,
        before: { crew: crewAuditSnapshot(before) },
        after: {
          crew: crewAuditSnapshot(after),
          change: {
            action: "ADD",
            technicianId: technician.id,
            technicianName: technician.displayName,
            role: "SUPPORT",
            ...(conflicts.length ? { conflictsAcknowledged: conflicts } : {}),
          },
        },
      });
      if (override) {
        await this.recordExclusionOverrideTx(tx, { appointment, override, via: "CREW_ADD", actor: input.actor });
      }
      return { appointmentId: appointment.id, members: after };
    });
  }

  // Remove a SUPPORT technician. The lead leaves only by changing the visit's
  // technician. One appointment_crew_changed row.
  async removeAppointmentCrewMember(input: AppointmentCrewRemoveInput): Promise<AppointmentCrew | undefined> {
    return db.transaction(async (tx) => {
      const appointment = await this.loadCrewEditableAppointmentTx(tx, input.appointmentId);
      if (!appointment) {
        return undefined;
      }
      const before = await this.crewMembersTx(tx, appointment.id);
      const member = before.find((candidate) => candidate.technicianId === input.technicianId);
      if (!member) {
        throw new AppointmentCrewError(404, CREW_MEMBER_NOT_FOUND, "That technician is not on this visit's crew");
      }
      if (member.role === "LEAD") {
        throw new AppointmentCrewError(409, CREW_LEAD_NOT_REMOVABLE, "The lead is the visit's technician - change the technician instead");
      }
      await tx.delete(appointmentTechnicians).where(and(
        eq(appointmentTechnicians.orgId, this.orgId),
        eq(appointmentTechnicians.appointmentId, appointment.id),
        eq(appointmentTechnicians.technicianId, member.technicianId),
        eq(appointmentTechnicians.role, "SUPPORT"),
      ));
      const after = await this.crewMembersTx(tx, appointment.id);
      await this.recordAuditLogTx(tx, {
        entityType: "appointment",
        entityId: appointment.id,
        action: "appointment_crew_changed",
        actor: input.actor,
        before: { crew: crewAuditSnapshot(before) },
        after: {
          crew: crewAuditSnapshot(after),
          change: { action: "REMOVE", technicianId: member.technicianId, technicianName: member.technicianName, role: "SUPPORT" },
        },
      });
      return { appointmentId: appointment.id, members: after };
    });
  }

  // Pass 27 (PLAN_ROADMAP_V2.md C4.2 / B2): the one path off the board,
  // grown from the technician's requestAppointmentCancelOrReschedule.
  // RESCHEDULE requeues every service as it stands - dates kept, the visit
  // is still due when it was due, only its placement is gone - with no
  // reason required and, from the office, no opportunity. CANCEL requires a
  // reason from the settings list, recycles agreement services to the queue
  // with due date and window reset from the cancel date, cancels one-time
  // services (the office path only: the field's cancel is a handoff and
  // requeues them) and runs the opportunity choice. Both share the Q3
  // draft-invoice prompt, the appointment shape (Q4 / D1a: CANCELED plus the
  // flag, no fifth status) and one audit row carrying the appointment and
  // its services before and after.
  async dispositionAppointment(input: AppointmentDispositionInput): Promise<AppointmentDispositionResult | undefined> {
    const reasonCode = input.reasonCode?.trim() || null;
    if (input.mode === "CANCEL" && !reasonCode) {
      throw new AppointmentDispositionError(400, DISPOSITION_REASON_REQUIRED, "A cancel reason from the settings list is required");
    }
    if (reasonCode) {
      const reasons = await this.getAppointmentCancelReasons();
      if (!reasons.includes(reasonCode)) {
        throw new AppointmentDispositionError(400, DISPOSITION_REASON_NOT_ON_LIST, `"${reasonCode}" is not on the appointment cancel / reschedule reasons list`);
      }
    }

    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, input.appointmentId)));
      if (!existingAppointment) return undefined;
      if (existingAppointment.status === "CANCELED" || existingAppointment.status === "COMPLETED") {
        const state = existingAppointment.status === "COMPLETED"
          ? "completed"
          : existingAppointment.rescheduleRequested ? "rescheduled and back in the queue" : "canceled";
        throw new AppointmentDispositionError(
          409,
          APPOINTMENT_NOT_DISPOSITIONABLE,
          `Appointment is already ${state} and cannot be ${input.mode === "CANCEL" ? "cancelled" : "rescheduled"}`,
        );
      }

      const linkedBefore = await this.getLinkedServicesForAppointmentTx(tx, existingAppointment.id, existingAppointment.serviceId);

      // Q3: both modes set the appointment CANCELED, so a DRAFT invoice on it
      // needs a decision either way - asked before anything is written.
      const draftInvoicesVoided = await this.resolveDraftInvoicesOnCancelTx(tx, [existingAppointment.id], input.voidDraftInvoices, input.actor ?? null);

      const now = new Date();
      const today = normalizeDateOnly(now)!;
      const notes = input.notes?.trim() || null;
      const rescheduleRequested = input.mode === "RESCHEDULE";

      const [updatedAppointment] = await tx
        .update(appointments)
        .set({
          status: "CANCELED",
          cancelReason: reasonCode,
          cancelNotes: notes,
          cancelRequestedAt: now,
          cancelRequestedByLabel: input.actor?.actorLabel || null,
          rescheduleRequested,
          rescheduleRequestedAt: rescheduleRequested ? now : null,
        })
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, existingAppointment.id)))
        .returning();

      const serviceOutcomes: DispositionServiceOutcome[] = [];
      const opportunityOutcomes: DispositionOpportunityOutcome[] = [];
      const actionLabel = input.mode === "RESCHEDULE" ? "Reschedule requested" : "Appointment canceled";

      for (const service of linkedBefore) {
        // A settled service stays settled; a legacy representative since
        // placed on another appointment belongs to that visit, not this one.
        if (service.status === "COMPLETED" || service.status === "CANCELLED" || (service.appointmentId && service.appointmentId !== existingAppointment.id)) {
          serviceOutcomes.push({ serviceId: service.id, agreementId: service.agreementId || null, effect: "SKIPPED", windowReset: false });
          continue;
        }

        const disposed = input.mode === "CANCEL" && input.origin === "OFFICE" && !service.agreementId;
        let outcome: DispositionServiceOutcome;
        if (disposed) {
          // A one-time service the office cancels is done: CANCELLED, still
          // linked to the visit it was cancelled from (its history); the
          // win-back opportunity below is what keeps the customer visible.
          await tx
            .update(services)
            .set({ status: "CANCELLED", lastAppointmentId: existingAppointment.id, updatedAt: now })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));
          outcome = { serviceId: service.id, agreementId: null, effect: "CANCELLED", windowReset: false };
        } else {
          const resetWindow = input.mode === "CANCEL" && !!service.agreementId;
          const window = resetWindow
            ? await this.resolveAgreementWindowResetTx(tx, service.agreementId!, today)
            : { dueDate: service.dueDate ?? today, serviceWindowStart: service.serviceWindowStart, serviceWindowEnd: service.serviceWindowEnd };
          await tx
            .update(services)
            .set({
              status: "PENDING_SCHEDULING",
              appointmentId: null,
              assignedTechnicianId: null,
              lastAppointmentId: existingAppointment.id,
              dueDate: window.dueDate,
              serviceWindowStart: window.serviceWindowStart,
              serviceWindowEnd: window.serviceWindowEnd,
              updatedAt: now,
            })
            .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)));
          outcome = { serviceId: service.id, agreementId: service.agreementId || null, effect: "REQUEUED", windowReset: resetWindow };
        }
        serviceOutcomes.push(outcome);

        opportunityOutcomes.push(...await this.applyServiceOpportunityChoiceTx(tx, {
          service,
          choice: input.opportunity,
          mode: input.mode,
          effect: outcome.effect,
          windowReset: outcome.windowReset,
          reasonCode,
          notes,
          actionLabel,
          today,
          now,
        }));
      }

      const linkedAfter = linkedBefore.length
        ? await tx.select().from(services).where(and(eq(services.orgId, this.orgId), inArray(services.id, linkedBefore.map((service) => service.id))))
        : [];

      await this.recordAuditLogTx(tx, {
        entityType: "appointment",
        entityId: existingAppointment.id,
        action: input.mode === "CANCEL" ? "appointment_cancelled" : "appointment_rescheduled",
        actor: input.actor ?? null,
        before: appointmentAuditSnapshot(existingAppointment, linkedBefore),
        after: {
          ...appointmentAuditSnapshot(updatedAppointment, linkedAfter),
          disposition: {
            mode: input.mode,
            origin: input.origin,
            reasonCode,
            notes,
            opportunity: input.opportunity,
            services: serviceOutcomes,
            opportunities: opportunityOutcomes,
            draftInvoicesVoided,
          },
        },
      });

      return { appointment: updatedAppointment, mode: input.mode, services: serviceOutcomes, opportunities: opportunityOutcomes, draftInvoicesVoided };
    });
  }

  // B2's refinement (Pass 27): a cancelled agreement visit is recycled with
  // its due date and window reset from today by the agreement's
  // serviceWindowDays, so it is not silently missed. Read by the disposition's
  // CANCEL and, since Pass 28, by cancelService for an agreement service.
  private async resolveAgreementWindowResetTx(
    tx: DbTransaction,
    agreementId: string,
    today: string,
  ): Promise<{ dueDate: string; serviceWindowStart: string; serviceWindowEnd: string }> {
    const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreementId)));
    const windowDays = agreement?.serviceWindowDays && agreement.serviceWindowDays > 0 ? agreement.serviceWindowDays : null;
    return { dueDate: today, serviceWindowStart: today, serviceWindowEnd: windowDays ? addDays(today, windowDays) : today };
  }

  // Pass 27's opportunity choice for one service a disposition touched -
  // since Pass 28 also for one service cancelled on its own (cancelService).
  // UPDATE_EXISTING re-dates every OPEN opportunity on the service, whatever
  // its source, and creates one when none is open (the choice never leaves
  // the work invisible); CREATE inserts; NONE writes nothing. The source is
  // opportunitySourceForDisposition(mode, effect) - RESCHEDULE for a requeued
  // service, WINBACK for a cancelled one-time service - so the category is
  // "by path" in Pass 25's one mapping.
  private async applyServiceOpportunityChoiceTx(
    tx: DbTransaction,
    input: {
      service: Service;
      choice: DispositionOpportunityChoice;
      mode: AppointmentDispositionMode;
      effect: DispositionServiceEffect;
      windowReset: boolean;
      reasonCode: string | null;
      notes: string | null;
      actionLabel: string;
      today: string;
      now: Date;
    },
  ): Promise<DispositionOpportunityOutcome[]> {
    if (input.choice === "NONE") return [];
    const { service, today, now } = input;

    const [serviceType] = service.serviceTypeId
      ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, service.serviceTypeId)))
      : [undefined];
    const noteLine = [
      `${input.actionLabel}: ${serviceType?.name || "Service"}`,
      input.reasonCode ? `Reason: ${input.reasonCode}` : null,
      input.notes ? `Notes: ${input.notes}` : null,
      input.effect === "CANCELLED"
        ? "One-time service cancelled - follow up to win the work back."
        : service.agreementId
          ? `Agreement service requeued for office scheduling${input.windowReset ? " with its service window reset from today" : ""}.`
          : "Service returned to pending scheduling.",
    ].filter(Boolean).join("\n");

    if (input.choice === "UPDATE_EXISTING") {
      // Re-date every open opportunity on the service, whatever its
      // source: the office chose to keep following up on what it has.
      const openOpportunities = await tx
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.sourceServiceId, service.id), eq(opportunities.status, "OPEN")));
      if (openOpportunities.length) {
        const updated: DispositionOpportunityOutcome[] = [];
        for (const openOpportunity of openOpportunities) {
          await tx
            .update(opportunities)
            .set({
              dueDate: today,
              nextActionDate: today,
              notes: [openOpportunity.notes, noteLine].filter(Boolean).join("\n\n"),
              updatedAt: now,
            })
            .where(and(eq(opportunities.orgId, this.orgId), eq(opportunities.id, openOpportunity.id)));
          updated.push({ serviceId: service.id, opportunityId: openOpportunity.id, action: "UPDATED", categoryKey: openOpportunity.categoryKey });
        }
        return updated;
      }
      // Nothing open to update: create one, so the choice never leaves
      // the work invisible.
    }

    const source = opportunitySourceForDisposition(input.mode, input.effect);
    // Pass 25's one mapping, by the source this pass picked for the
    // effect: RESCHEDULE for a requeued service, WINBACK for a cancelled
    // one-time service; the work type from the service's agreement.
    const taxonomy = opportunityTaxonomyColumns(source, !!service.agreementId);
    const created = await this.insertOpportunityTx(tx, {
      locationId: service.locationId,
      agreementId: service.agreementId || null,
      sourceServiceId: service.id,
      serviceTypeId: service.serviceTypeId || null,
      opportunityType: input.effect === "CANCELLED" ? "Win-back" : input.mode === "RESCHEDULE" ? "Appointment Reschedule" : "Canceled Appointment Review",
      source,
      ...taxonomy,
      dueDate: today,
      nextActionDate: today,
      status: "OPEN",
      notes: noteLine,
    });
    return [{ serviceId: service.id, opportunityId: created.id, action: "CREATED", categoryKey: taxonomy.categoryKey }];
  }

  // ---- Pass 28 (PLAN_ROADMAP_V2.md C4.3a; B13): appointment composition ----
  //
  // Which services are on a visit, edited from the dispatch sheet: add one
  // (from the queue, or created placed), return ONE to the queue, change
  // one's type or duration, cancel ONE outright. Every path is one
  // transaction over getLinkedServicesForAppointmentTx (canon rule 10) and
  // writes one audit row. The decisions the pass recorded:
  //   (1) the representative (appointments.serviceId) follows the first
  //       remaining sibling when the current one leaves, as deleteService
  //       does, and appointments.serviceTypeId follows it - never null while
  //       a service remains, since the resolver, the generic PATCH's sync and
  //       completeService all still read it;
  //   (2) a service cancelled off a live visit is DETACHED (appointmentId
  //       null, lastAppointmentId stamped) - a CANCELLED row left linked would
  //       hold the visit open in finalizeServiceRecord's rollup, which now
  //       also skips CANCELLED like the billing group;
  //   (3) adding a service, or lengthening one, extends the planned end
  //       (scheduledEndDate) by that duration; nothing here ever shrinks it;
  //   (6) add / remove / duration / notes are ungated like the disposition;
  //       an agreement service's type is ADJUST_PRICE_AGREEMENT; the cancel
  //       is ungated with the reason required;
  //   (7) the type lock holds on the generic PATCH too (updateService);
  //   (8) a service added to a visit has its open reschedule / cancel-review
  //       opportunities converted exactly as a placement does.
  // The LAST active service is refused everywhere (LAST_SERVICE_ON_APPOINTMENT):
  // an appointment leaves the board only through its disposition (canon §11).
  // A service with a posted ticket is refused (SERVICE_HAS_TICKET): the work
  // happened, and the ticket flow owns it. An issued invoice on the visit
  // freezes its composition (VISIT_INVOICED); a DRAFT is re-priced at issue
  // and does not.

  private async loadComposableAppointmentTx(tx: DbTransaction, appointmentId: string): Promise<{ appointment: Appointment; linked: Service[] }> {
    const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
    if (!appointment) {
      throw new ServiceCompositionError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found");
    }
    if (appointment.status === "CANCELED" || appointment.status === "COMPLETED") {
      const state = appointment.status === "COMPLETED" ? "completed" : appointment.rescheduleRequested ? "rescheduled and back in the queue" : "canceled";
      throw new ServiceCompositionError(409, APPOINTMENT_NOT_COMPOSABLE, `Appointment is ${state}: its services are history and cannot be changed here`);
    }
    const linked = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId);
    return { appointment, linked };
  }

  // The services that still count on the visit: linked to it (a legacy
  // representative since placed elsewhere belongs to that visit) and not
  // settled.
  private activeVisitServices(appointment: Appointment, linked: Service[]): Service[] {
    return linked.filter((service) => service.appointmentId === appointment.id && isActiveOnVisit(service));
  }

  private async assertVisitNotInvoicedTx(tx: DbTransaction, appointment: Appointment, linked: Service[]): Promise<void> {
    const serviceIds = linked.map((service) => service.id);
    const records = serviceIds.length
      ? await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), inArray(serviceRecords.serviceId, serviceIds)))
      : [];
    const invoice = await this.findInvoiceForVisitTx(tx, appointment.id, records.map((record) => record.id));
    if (invoice && isInvoiceIssued(invoice.status)) {
      throw new ServiceCompositionError(409, VISIT_INVOICED, `This visit is invoiced (${invoice.invoiceNumber}): its lines are frozen. A correction is a credit memo.`);
    }
  }

  private assertServiceUnsettled(service: Service, verb: string): void {
    if (!isActiveOnVisit(service)) {
      throw new ServiceCompositionError(409, SERVICE_SETTLED, `This service is already ${service.status === "COMPLETED" ? "completed" : "cancelled"} and cannot be ${verb}`);
    }
  }

  private async assertNoTicketTx(tx: DbTransaction, serviceId: string, verb: string): Promise<void> {
    const [record] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.serviceId, serviceId)));
    if (record) {
      const state = isTicketFinalized(record) ? "finalized" : "posted";
      throw new ServiceCompositionError(409, SERVICE_HAS_TICKET, `A ticket is ${state} on this service - the work happened, so it cannot be ${verb}. Reopen or edit the ticket instead.`);
    }
  }

  // Decision (7): nothing locked an agreement service's type before this
  // pass - the customer Edit form offered it to every role and updateService
  // wrote it. The price's rule (canon §10; Pass 24's precedent for the
  // kind): ADJUST_PRICE_AGREEMENT, else 403 SERVICE_TYPE_LOCKED. A
  // server-driven write (no role) always may.
  private assertServiceTypeUnlocked(service: Pick<Service, "agreementId" | "source">, actorRole: UserRole | string | null | undefined): void {
    const isAgreementService = !!service.agreementId || service.source === "AGREEMENT_GENERATED";
    if (!isAgreementService || actorRole == null || can(actorRole, PERMISSIONS.ADJUST_PRICE_AGREEMENT)) {
      return;
    }
    throw new ServiceCompositionError(
      403,
      SERVICE_TYPE_LOCKED,
      `An agreement service's type is locked - ${rolesWithPermission(PERMISSIONS.ADJUST_PRICE_AGREEMENT).join(" or ")} may change it.`,
    );
  }

  // Decision (1): the representative and its type follow the first remaining
  // active sibling by creation (shared pickRepresentative).
  private async reassignRepresentativeTx(tx: DbTransaction, appointment: Appointment, remaining: Service[]): Promise<Appointment> {
    const next = pickRepresentative(remaining);
    if (!next) {
      return appointment;
    }
    const nextService = remaining.find((service) => service.id === next.id)!;
    const [updated] = await tx
      .update(appointments)
      .set({ serviceId: nextService.id, serviceTypeId: nextService.serviceTypeId ?? appointment.serviceTypeId })
      .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
      .returning();
    return updated ?? appointment;
  }

  // Decisions (1), (3) and (8) for a service landing on a visit: SCHEDULED
  // with the visit's technician; the representative when the visit has none
  // that is its own (a dangling appointments.serviceId is healed here); the
  // planned end extended by its expected duration; its open reschedule /
  // cancel-review opportunities converted as a placement converts them.
  private async attachServiceToAppointmentTx(
    tx: DbTransaction,
    appointment: Appointment,
    service: Service,
    linked: Service[],
  ): Promise<{ appointment: Appointment; service: Service; extendedMinutes: number; opportunitiesConverted: number }> {
    const [attached] = await tx
      .update(services)
      .set({ status: "SCHEDULED", appointmentId: appointment.id, assignedTechnicianId: appointment.assignedTechnicianId || null, updatedAt: new Date() })
      .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
      .returning();

    const representative = linked.find((linkedService) => linkedService.id === appointment.serviceId && linkedService.appointmentId === appointment.id) ?? null;
    const end = extendPlannedEnd(appointment, representative?.expectedDurationMinutes ?? null, attached.expectedDurationMinutes ?? 0);
    const patch: Partial<typeof appointments.$inferInsert> = {};
    if (!representative) {
      patch.serviceId = attached.id;
      patch.serviceTypeId = attached.serviceTypeId ?? appointment.serviceTypeId;
    }
    if (end.extendedMinutes > 0 && end.scheduledEndDate) {
      patch.scheduledEndDate = end.scheduledEndDate;
    }
    let updatedAppointment = appointment;
    if (Object.keys(patch).length) {
      [updatedAppointment] = await tx
        .update(appointments)
        .set(patch)
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
        .returning();
    }
    const opportunitiesConverted = await this.convertPlacementOpportunitiesTx(tx, attached.id, appointment.id);
    return { appointment: updatedAppointment, service: attached, extendedMinutes: end.extendedMinutes, opportunitiesConverted };
  }

  // The rows of every service a change touched, before and after in one
  // list, so the audit diff shows a service leaving the visit as well as one
  // arriving.
  private async snapshotServicesTx(tx: DbTransaction, ids: string[]): Promise<Service[]> {
    const unique = Array.from(new Set(ids));
    return unique.length
      ? tx.select().from(services).where(and(eq(services.orgId, this.orgId), inArray(services.id, unique)))
      : [];
  }

  private async recordCompositionChangeTx(
    tx: DbTransaction,
    input: {
      actor?: AuditActor | null;
      appointmentBefore: Appointment;
      servicesBefore: Service[];
      appointmentAfter: Appointment;
      servicesAfter: Service[];
      composition: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.recordAuditLogTx(tx, {
      entityType: "appointment",
      entityId: input.appointmentBefore.id,
      action: "appointment_composition_changed",
      actor: input.actor ?? null,
      before: appointmentAuditSnapshot(input.appointmentBefore, input.servicesBefore),
      after: { ...appointmentAuditSnapshot(input.appointmentAfter, input.servicesAfter), composition: input.composition },
    });
  }

  // Pass 29 (C4.3b; B13 "adding a service ... must not overlap the next
  // stop"): the technician's next stop after this visit - the next board
  // placement (isBoardPlacement's rule: not CANCELED) assigned to the same
  // technician on the visit's day, the day read as getTechnicianWork reads
  // it (local midnight to midnight; the day's list IS the next-stop source).
  // Null without a technician or when the visit is the day's last; a stop
  // on another day is never consulted.
  private async nextStopTx(tx: DbTransaction, appointment: Appointment): Promise<Appointment | null> {
    if (!appointment.assignedTechnicianId) {
      return null;
    }
    const start = new Date(appointment.scheduledDate);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);
    const [next] = await tx
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.orgId, this.orgId),
        eq(appointments.assignedTechnicianId, appointment.assignedTechnicianId),
        ne(appointments.id, appointment.id),
        ne(appointments.status, "CANCELED"),
        gt(appointments.scheduledDate, start),
        lte(appointments.scheduledDate, dayEnd),
      ))
      .orderBy(asc(appointments.scheduledDate))
      .limit(1);
    return next ?? null;
  }

  // The next stop measured against the end an add of `deltaMinutes` would
  // give the visit (the shared extendPlannedEnd - the same arithmetic
  // attachServiceToAppointmentTx then writes). Null when there is no next
  // stop to measure against.
  private async resolveNextStopTx(
    tx: DbTransaction,
    appointment: Appointment,
    representative: Service | null,
    deltaMinutes: number,
  ): Promise<NextStopRef | null> {
    const next = await this.nextStopTx(tx, appointment);
    if (!next) {
      return null;
    }
    const end = extendPlannedEnd(appointment, representative?.expectedDurationMinutes ?? null, deltaMinutes);
    return {
      appointmentId: next.id,
      scheduledDate: next.scheduledDate,
      plannedEnd: end.scheduledEndDate,
      overlapped: overlapsNextStop(end.scheduledEndDate, next.scheduledDate, end.extendedMinutes),
    };
  }

  async addServiceToAppointment(input: AddServiceToAppointmentInput): Promise<AppointmentCompositionResult> {
    // Pass 29 (C4.3b): the add's origin decides three things - the field
    // adds one-time work only, is attributed to the session user and flagged
    // for office review, and is refused when the visit would run into the
    // technician's next stop. The office's add (the default) keeps Pass 28's
    // behavior and is told about the next stop, never refused for it.
    const origin: CompositionOrigin = input.origin === "FIELD" ? "FIELD" : "OFFICE";
    return db.transaction(async (tx) => {
      const { appointment, linked } = await this.loadComposableAppointmentTx(tx, input.appointmentId);
      await this.assertVisitNotInvoicedTx(tx, appointment, linked);
      if (!appointment.locationId) {
        throw new ServiceCompositionError(409, SERVICE_LOCATION_MISMATCH, "This visit has no location, so no service can be added to it");
      }
      if (origin === "FIELD" && input.serviceId) {
        throw new ServiceCompositionError(400, FIELD_ADD_NEW_ONLY, "From the field a new one-time service is added to the visit; a queued service is placed by the office");
      }
      if (origin === "FIELD" && !input.actor?.userId) {
        throw new ServiceCompositionError(400, FIELD_ACTOR_REQUIRED, "A service added from the field is attributed to the signed-in user, and this request has none");
      }
      const representative = linked.find((linkedService) => linkedService.id === appointment.serviceId && linkedService.appointmentId === appointment.id) ?? null;

      let service: Service;
      let nextStop: NextStopRef | null = null;
      if (input.serviceId) {
        const [queued] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, input.serviceId)));
        if (!queued) {
          throw new ServiceCompositionError(404, "SERVICE_NOT_FOUND", "Service not found");
        }
        if (queued.locationId !== appointment.locationId) {
          throw new ServiceCompositionError(409, SERVICE_LOCATION_MISMATCH, "Only a service at the visit's location can be added to it");
        }
        if (queued.appointmentId === appointment.id) {
          throw new ServiceCompositionError(409, SERVICE_NOT_PENDING, "This service is already on the visit");
        }
        if (queued.status !== "PENDING_SCHEDULING") {
          const state = queued.status === "COMPLETED"
            ? "completed"
            : queued.status === "CANCELLED"
              ? "cancelled"
              : queued.appointmentId
                ? "placed on another visit - return it to the queue from there first"
                : queued.status.toLowerCase().replace(/_/g, " ");
          throw new ServiceCompositionError(409, SERVICE_NOT_PENDING, `This service is ${state}, not pending scheduling`);
        }
        service = queued;
      } else if (input.service) {
        const [serviceType] = await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, input.service.serviceTypeId)));
        if (!serviceType) {
          throw new ServiceCompositionError(400, SERVICE_TYPE_UNKNOWN, "The service type is not one of this organization's");
        }
        // A new service on a visit is one-time MANUAL work (an agreement's
        // visits are generated by the agreement, never typed onto a card);
        // the type's duration and price are its defaults, as on the
        // customer form; it is due the day of the visit.
        const expectedDurationMinutes = input.service.expectedDurationMinutes !== undefined ? input.service.expectedDurationMinutes : serviceType.estimatedDuration ?? null;
        // Pass 29: B13's constraint, checked before the insert so a refusal
        // writes nothing - the would-be end (the shared rule) against the
        // technician's next stop. The office is told, never refused.
        nextStop = await this.resolveNextStopTx(tx, appointment, representative, expectedDurationMinutes ?? 0);
        if (origin === "FIELD" && nextStop?.overlapped && nextStop.plannedEnd) {
          throw new ServiceCompositionError(409, NEXT_STOP_OVERLAP, describeNextStopOverlap(nextStop.scheduledDate, nextStop.plannedEnd));
        }
        const payload = this.normalizeServiceInsert({
          customerId: appointment.customerId,
          locationId: appointment.locationId,
          appointmentId: null,
          agreementId: null,
          serviceTypeId: serviceType.id,
          dueDate: normalizeDateOnly(appointment.scheduledDate),
          expectedDurationMinutes,
          priceCents: input.service.priceCents !== undefined ? input.service.priceCents : serviceType.defaultPriceCents ?? null,
          timeWindow: input.service.timeWindow ?? null,
          status: "PENDING_SCHEDULING",
          assignedTechnicianId: null,
          source: "MANUAL",
          notes: input.service.notes ?? null,
        } as InsertService);
        const kind = await this.resolveServiceWorkKindTx(tx, {
          serviceId: null,
          locationId: payload.locationId,
          agreementId: null,
          source: "MANUAL",
          serviceTypeId: serviceType.id,
          requestedWorkKind: input.service.workKind,
          requestedAnswersServiceId: input.service.answersServiceId,
          current: null,
          actorRole: input.actorRole ?? null,
        });
        // Pass 29: a FIELD add is stamped with the session user - the flag
        // for office review, and who may edit its instructions in the field.
        const [created] = await tx
          .insert(services)
          .values({
            ...payload,
            workKind: kind.workKind,
            answersServiceId: kind.answersServiceId,
            orgId: this.orgId,
            addedInFieldByUserId: origin === "FIELD" ? input.actor?.userId ?? null : null,
          })
          .returning();
        service = created;
      } else {
        throw new ServiceCompositionError(400, ADD_SERVICE_TARGET_REQUIRED, "Name a pending service to add, or a new service to create on the visit");
      }
      if (input.serviceId) {
        // The office's add from the queue: measured and reported, never refused.
        nextStop = await this.resolveNextStopTx(tx, appointment, representative, service.expectedDurationMinutes ?? 0);
      }

      const attached = await this.attachServiceToAppointmentTx(tx, appointment, service, linked);
      const servicesAfter = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, attached.appointment.serviceId);
      const flagged = origin === "FIELD";
      await this.recordCompositionChangeTx(tx, {
        actor: input.actor,
        appointmentBefore: appointment,
        servicesBefore: linked,
        appointmentAfter: attached.appointment,
        servicesAfter,
        composition: {
          action: "ADD",
          serviceId: service.id,
          from: input.serviceId ? "QUEUE" : "NEW",
          origin,
          flagged,
          scheduledEndDateExtendedMinutes: attached.extendedMinutes,
          opportunitiesConverted: attached.opportunitiesConverted,
          nextStop,
        },
      });
      return {
        appointment: attached.appointment,
        service: attached.service,
        services: servicesAfter,
        scheduledEndDateExtendedMinutes: attached.extendedMinutes,
        opportunitiesConverted: attached.opportunitiesConverted,
        flagged,
        nextStop,
      };
    });
  }

  // The RESCHEDULE semantics for one service: back to PENDING_SCHEDULING
  // with its dates kept (it is still due when it was due), off the
  // technician, lastAppointmentId stamped; the visit stays on the board with
  // the rest. Its planned end is left as it is (decision 3).
  async removeServiceFromAppointment(input: RemoveServiceFromAppointmentInput): Promise<AppointmentCompositionResult> {
    return db.transaction(async (tx) => {
      const { appointment, linked } = await this.loadComposableAppointmentTx(tx, input.appointmentId);
      const service = linked.find((linkedService) => linkedService.id === input.serviceId && linkedService.appointmentId === appointment.id);
      if (!service) {
        throw new ServiceCompositionError(404, SERVICE_NOT_ON_APPOINTMENT, "This service is not on the visit");
      }
      this.assertServiceUnsettled(service, "returned to the queue");
      await this.assertNoTicketTx(tx, service.id, "returned to the queue");
      await this.assertVisitNotInvoicedTx(tx, appointment, linked);
      const active = this.activeVisitServices(appointment, linked);
      if (active.length <= 1) {
        throw new ServiceCompositionError(409, LAST_SERVICE_ON_APPOINTMENT, "This is the only active service on the visit - reschedule or cancel the appointment instead; a visit leaves the board only through its disposition");
      }

      const [requeued] = await tx
        .update(services)
        .set({ status: "PENDING_SCHEDULING", appointmentId: null, assignedTechnicianId: null, lastAppointmentId: appointment.id, updatedAt: new Date() })
        .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
        .returning();
      let updatedAppointment = appointment;
      const representativeReassigned = appointment.serviceId === service.id;
      if (representativeReassigned) {
        updatedAppointment = await this.reassignRepresentativeTx(tx, appointment, active.filter((activeService) => activeService.id !== service.id));
      }

      const servicesAfter = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, updatedAppointment.serviceId);
      const touched = await this.snapshotServicesTx(tx, [...linked.map((linkedService) => linkedService.id), service.id]);
      await this.recordCompositionChangeTx(tx, {
        actor: input.actor,
        appointmentBefore: appointment,
        servicesBefore: linked,
        appointmentAfter: updatedAppointment,
        servicesAfter: touched,
        composition: { action: "REMOVE", serviceId: service.id, representativeReassigned, scheduledEndDateExtendedMinutes: 0 },
      });
      return { appointment: updatedAppointment, service: requeued, services: servicesAfter, scheduledEndDateExtendedMinutes: 0, opportunitiesConverted: 0, flagged: false, nextStop: null };
    });
  }

  // The service's type (locked on agreement work; the ticket flow owns it
  // once a ticket exists) and its expected duration (a longer one extends the
  // planned end, decision 3). Nothing changed writes nothing.
  async updateAppointmentService(input: UpdateAppointmentServiceInput): Promise<AppointmentCompositionResult> {
    return db.transaction(async (tx) => {
      const { appointment, linked } = await this.loadComposableAppointmentTx(tx, input.appointmentId);
      const service = linked.find((linkedService) => linkedService.id === input.serviceId && linkedService.appointmentId === appointment.id);
      if (!service) {
        throw new ServiceCompositionError(404, SERVICE_NOT_ON_APPOINTMENT, "This service is not on the visit");
      }
      this.assertServiceUnsettled(service, "changed");

      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const servicePatch: Partial<InsertService> = {};
      const appointmentPatch: Partial<typeof appointments.$inferInsert> = {};
      let extendedMinutes = 0;

      if (input.serviceTypeId !== undefined && input.serviceTypeId !== service.serviceTypeId) {
        await this.assertNoTicketTx(tx, service.id, "re-typed here");
        await this.assertVisitNotInvoicedTx(tx, appointment, linked);
        this.assertServiceTypeUnlocked(service, input.actorRole);
        const [serviceType] = await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, input.serviceTypeId)));
        if (!serviceType) {
          throw new ServiceCompositionError(400, SERVICE_TYPE_UNKNOWN, "The service type is not one of this organization's");
        }
        servicePatch.serviceTypeId = serviceType.id;
        changes.serviceTypeId = { before: service.serviceTypeId, after: serviceType.id };
        if (appointment.serviceId === service.id) {
          appointmentPatch.serviceTypeId = serviceType.id;
        }
      }

      if (input.expectedDurationMinutes !== undefined && (input.expectedDurationMinutes ?? null) !== (service.expectedDurationMinutes ?? null)) {
        const before = service.expectedDurationMinutes ?? 0;
        const after = input.expectedDurationMinutes ?? 0;
        servicePatch.expectedDurationMinutes = input.expectedDurationMinutes ?? null;
        changes.expectedDurationMinutes = { before: service.expectedDurationMinutes ?? null, after: input.expectedDurationMinutes ?? null };
        const representative = linked.find((linkedService) => linkedService.id === appointment.serviceId && linkedService.appointmentId === appointment.id) ?? null;
        const end = extendPlannedEnd(appointment, representative?.expectedDurationMinutes ?? null, after - before);
        if (end.extendedMinutes > 0 && end.scheduledEndDate) {
          appointmentPatch.scheduledEndDate = end.scheduledEndDate;
          extendedMinutes = end.extendedMinutes;
        }
      }

      if (!Object.keys(changes).length) {
        return { appointment, service, services: linked, scheduledEndDateExtendedMinutes: 0, opportunitiesConverted: 0, flagged: false, nextStop: null };
      }

      const [updatedService] = await tx
        .update(services)
        .set({ ...servicePatch, updatedAt: new Date() })
        .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
        .returning();
      let updatedAppointment = appointment;
      if (Object.keys(appointmentPatch).length) {
        [updatedAppointment] = await tx
          .update(appointments)
          .set(appointmentPatch)
          .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
          .returning();
      }
      const servicesAfter = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, updatedAppointment.serviceId);
      await this.recordCompositionChangeTx(tx, {
        actor: input.actor,
        appointmentBefore: appointment,
        servicesBefore: linked,
        appointmentAfter: updatedAppointment,
        servicesAfter,
        composition: { action: "UPDATE", serviceId: service.id, changes, scheduledEndDateExtendedMinutes: extendedMinutes },
      });
      return { appointment: updatedAppointment, service: updatedService, services: servicesAfter, scheduledEndDateExtendedMinutes: extendedMinutes, opportunitiesConverted: 0, flagged: false, nextStop: null };
    });
  }

  // ONE service cancelled outright - from the pending queue, the location's
  // Services tab or a live visit's sheet - with the disposition's CANCEL
  // semantics for that service: a reason from the settings list, a one-time
  // service CANCELLED, an agreement service recycled (PENDING_SCHEDULING with
  // its due date and window reset from today - ending the plan is the
  // agreement workflow), the opportunity choice (WINBACK for the cancelled
  // one-time service, RESCHEDULE for the recycled agreement one), one
  // service_cancelled audit row. Off a live visit the service is detached
  // (decision 2) and the representative reassigned (decision 1); the LAST
  // active service is refused. Before this pass the only way to cancel a
  // pending service was to place it and cancel the placement (the owner's
  // review of 2026-09-25, finding 5).
  async cancelService(input: CancelServiceInput): Promise<ServiceCancelResult | undefined> {
    const reasonCode = input.reasonCode?.trim() || null;
    if (!reasonCode) {
      throw new ServiceCompositionError(400, DISPOSITION_REASON_REQUIRED, "A cancel reason from the settings list is required");
    }
    const reasons = await this.getAppointmentCancelReasons();
    if (!reasons.includes(reasonCode)) {
      throw new ServiceCompositionError(400, DISPOSITION_REASON_NOT_ON_LIST, `"${reasonCode}" is not on the appointment cancel / reschedule reasons list`);
    }

    return db.transaction(async (tx) => {
      const [service] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, input.serviceId)));
      if (!service) return undefined;
      this.assertServiceUnsettled(service, "cancelled");
      await this.assertNoTicketTx(tx, service.id, "cancelled");

      let appointment: Appointment | null = null;
      let linked: Service[] = [];
      if (service.appointmentId) {
        const [placement] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, service.appointmentId)));
        if (placement && placement.status !== "CANCELED" && placement.status !== "COMPLETED") {
          appointment = placement;
          linked = await this.getLinkedServicesForAppointmentTx(tx, placement.id, placement.serviceId);
          await this.assertVisitNotInvoicedTx(tx, placement, linked);
          if (this.activeVisitServices(placement, linked).length <= 1) {
            throw new ServiceCompositionError(409, LAST_SERVICE_ON_APPOINTMENT, "This is the only active service on its visit - cancel or reschedule the appointment instead; a visit leaves the board only through its disposition");
          }
        }
      }

      const now = new Date();
      const today = normalizeDateOnly(now)!;
      const notes = input.notes?.trim() || null;
      // A stale link to a settled placement is cleared with the live one.
      const lastAppointmentId = service.appointmentId ?? service.lastAppointmentId ?? null;
      let effect: ServiceCancelEffect;
      let windowReset = false;
      let updated: Service;
      if (service.agreementId) {
        const window = await this.resolveAgreementWindowResetTx(tx, service.agreementId, today);
        [updated] = await tx
          .update(services)
          .set({
            status: "PENDING_SCHEDULING",
            appointmentId: null,
            assignedTechnicianId: null,
            lastAppointmentId,
            dueDate: window.dueDate,
            serviceWindowStart: window.serviceWindowStart,
            serviceWindowEnd: window.serviceWindowEnd,
            updatedAt: now,
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
          .returning();
        effect = "REQUEUED";
        windowReset = true;
      } else {
        [updated] = await tx
          .update(services)
          .set({ status: "CANCELLED", appointmentId: null, assignedTechnicianId: null, lastAppointmentId, updatedAt: now })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
          .returning();
        effect = "CANCELLED";
      }

      let updatedAppointment = appointment;
      const representativeReassigned = !!appointment && appointment.serviceId === service.id;
      if (appointment && representativeReassigned) {
        updatedAppointment = await this.reassignRepresentativeTx(
          tx,
          appointment,
          this.activeVisitServices(appointment, linked).filter((activeService) => activeService.id !== service.id),
        );
      }

      const opportunities = await this.applyServiceOpportunityChoiceTx(tx, {
        service,
        choice: input.opportunity,
        mode: "CANCEL",
        effect,
        windowReset,
        reasonCode,
        notes,
        actionLabel: "Service canceled",
        today,
        now,
      });

      await this.recordAuditLogTx(tx, {
        entityType: "service",
        entityId: service.id,
        action: "service_cancelled",
        actor: input.actor ?? null,
        before: serviceAuditSnapshot(service),
        after: {
          ...serviceAuditSnapshot(updated),
          cancel: {
            reasonCode,
            notes,
            opportunity: input.opportunity,
            effect,
            windowReset,
            appointmentId: appointment?.id ?? null,
            detached: !!appointment,
            representativeReassigned,
            opportunities,
          },
        },
      });

      return { service: updated, appointment: updatedAppointment, effect, windowReset, detached: !!appointment, opportunities };
    });
  }

  // Pass 29 (C4.3b; Part E answer 7 "flagged for review"): the office's
  // review of a service a technician added from the field. The stamp
  // (fieldReviewedAt / fieldReviewedByUserId / fieldReviewedByLabel) is set
  // once from the session actor; a service not added in the field, or one
  // already reviewed, is refused with its code. The add itself stays on the
  // visit's appointment_composition_changed row; this writes one
  // field_service_reviewed row on the service. Gated FINALIZE_TICKET at the
  // route - the office's review permission - so a technician cannot clear
  // their own flag.
  async markServiceFieldReviewed(input: FieldReviewServiceInput): Promise<Service | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, input.serviceId)));
      if (!existing) {
        return undefined;
      }
      if (!existing.addedInFieldByUserId) {
        throw new ServiceCompositionError(409, SERVICE_NOT_FIELD_ADDED, "This service was not added in the field - there is nothing to review");
      }
      if (existing.fieldReviewedAt) {
        throw new ServiceCompositionError(409, SERVICE_FIELD_REVIEWED, `This field-added service was already reviewed${existing.fieldReviewedByLabel ? ` by ${existing.fieldReviewedByLabel}` : ""}`);
      }
      const [updated] = await tx
        .update(services)
        .set({
          fieldReviewedAt: new Date(),
          fieldReviewedByUserId: input.actor?.userId ?? null,
          fieldReviewedByLabel: input.actor?.actorLabel ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(services.orgId, this.orgId), eq(services.id, existing.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "service",
        entityId: existing.id,
        action: "field_service_reviewed",
        actor: input.actor ?? null,
        before: fieldReviewSnapshot(existing),
        after: fieldReviewSnapshot(updated),
      });
      return updated;
    });
  }

  // Pass 32 (C5.1a): the technician's time-in is the visit's SCHEDULED ->
  // IN_PROGRESS (status_changed); the time-out moves the stamps (update). A
  // second press of either changes nothing and writes nothing.
  async timeInAppointment(id: string, actor?: AuditActor | null): Promise<Appointment | undefined> {
    return db.transaction(async (tx) => {
      const [existingAppointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)));
      if (!existingAppointment) return undefined;

      const [appointment] = await tx
        .update(appointments)
        .set({
          timeInAt: existingAppointment.timeInAt ?? new Date(),
          status: existingAppointment.status === "COMPLETED" ? existingAppointment.status : "IN_PROGRESS",
        })
        .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, id)))
        .returning();
      if (appointment) {
        await this.auditChangeTx(tx, "appointment", id, appointmentRowAuditSnapshot(existingAppointment), appointmentRowAuditSnapshot(appointment), actor);
      }
      return appointment;
    });
  }

  async timeOutAppointment(id: string, actor?: AuditActor | null): Promise<Appointment | undefined> {
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
      if (appointment) {
        await this.auditChangeTx(tx, "appointment", id, appointmentRowAuditSnapshot(existingAppointment), appointmentRowAuditSnapshot(appointment), actor);
      }
      return appointment;
    });
  }

  async getTechnicianWork(technicianId: string, date: string): Promise<TechnicianWorkVisit[]> {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    // Pass 30 (C4.4): the visits this technician supports (a SUPPORT row in
    // appointment_technicians) are listed beside the ones they lead - a crew
    // member must see the stop - marked crewRole SUPPORT; the page shows them
    // read-only and the ticket stays the lead's.
    const supportedAppointmentIds = db
      .select({ appointmentId: appointmentTechnicians.appointmentId })
      .from(appointmentTechnicians)
      .where(and(
        eq(appointmentTechnicians.orgId, this.orgId),
        eq(appointmentTechnicians.technicianId, technicianId),
        eq(appointmentTechnicians.role, "SUPPORT"),
      ));
    const technicianAppointments = await db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.orgId, this.orgId),
        or(eq(appointments.assignedTechnicianId, technicianId), inArray(appointments.id, supportedAppointmentIds)),
        gte(appointments.scheduledDate, dayStart),
        lte(appointments.scheduledDate, dayEnd),
        ne(appointments.status, "CANCELED"),
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
        crewRole: appointment.assignedTechnicianId === technicianId ? "LEAD" : "SUPPORT",
        crew: await this.crewMembersTx(db, appointment.id),
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

  // Pass 32 (C5.1a): the ticket itself is service_records' (D9, excluded from
  // this row); the Service's status / technician write it makes is recorded
  // when it moved something, signed by the poster.
  async createServiceRecord(data: InsertServiceRecord, actor?: AuditActor | null): Promise<ServiceRecord> {
    return db.transaction(async (tx) => {
      const technicianSnapshot = await this.resolveServiceRecordTechnicianSnapshot(tx, data);
      const [insertedRecord] = await tx.insert(serviceRecords).values({
        ...data,
        orgId: this.orgId,
        technicianId: technicianSnapshot.technicianId,
        technicianName: technicianSnapshot.technicianName,
        technicianLicenseNumber: technicianSnapshot.technicianLicenseNumber,
        notes: technicianSnapshot.notes,
      }).returning();
      const sr = await this.flagTicketIfVisitAlreadyInvoicedTx(tx, insertedRecord);

      if (sr.serviceId) {
        const [serviceBefore] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, sr.serviceId)));
        const [serviceAfter] = await tx
          .update(services)
          .set({
            status: "SCHEDULED",
            assignedTechnicianId: sr.technicianId || null,
            updatedAt: new Date(),
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, sr.serviceId)))
          .returning();
        if (serviceBefore && serviceAfter) {
          await this.auditChangeTx(tx, "service", sr.serviceId, serviceAuditSnapshot(serviceBefore), serviceAuditSnapshot(serviceAfter), actor);
        }
      }

      if (sr.appointmentId) {
        const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, sr.appointmentId)));
        if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
          await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id, actor);
        }
      }

      return sr;
    });
  }

  // D9 (Pass 16): the office's edit of a posted ticket. EDIT_TICKET is checked
  // at the route; here the ticket's state decides - a FINALIZED ticket refuses
  // ("reopen first"), anything else is editable, a technician's ticket
  // included (it is locked from the technician, not from the office). Only
  // the content moves (see UpdateServiceRecordInput); the Service's lifecycle
  // is untouched - this used to flip it to COMPLETED on `confirmed`, which
  // completed a Service without finalization. An edit that changes nothing
  // writes nothing (Pass 8's audit-only-on-change rule); one that does writes
  // `ticket_edited` with the ticket and its materials before and after, in
  // the same transaction. Pass 18 (C3.1b): the Service's price and type come
  // through here too, so the office's one save is one transaction - the
  // Service written and `price_overridden` logged as a post does it, then
  // the ticket.
  async updateServiceRecord(id: string, input: UpdateServiceRecordInput): Promise<ServiceRecord | undefined> {
    return db.transaction(async (tx) => {
      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)));
      if (!existingRecord) {
        return undefined;
      }
      if (isTicketFinalized(existingRecord)) {
        throw new TicketLockedError("TICKET_FINALIZED", 409, "This ticket is finalized. Reopen it before editing it.");
      }

      // The Service's price and type (Pass 18), under the post's
      // allowFieldServiceOverride rule and checked before anything is
      // written: a body carrying either for an agreement-generated service
      // without ADJUST_PRICE_AGREEMENT is refused whole, whatever the values,
      // and told who may - support edits everything else on the ticket.
      const wantsServiceOverride = input.serviceTypeId !== undefined || input.priceCents !== undefined;
      let service: Service | undefined;
      let nextServiceTypeId = existingRecord.serviceTypeId;
      if (wantsServiceOverride) {
        [service] = existingRecord.serviceId
          ? await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, existingRecord.serviceId)))
          : [undefined];
        if (!service) {
          throw new TicketEditError(400, "SERVICE_NOT_FOUND", "This ticket is not linked to a service, so it has no price or type to change.");
        }
        const isAgreementGeneratedService = !!service.agreementId || service.source === "AGREEMENT_GENERATED";
        if (isAgreementGeneratedService && !can(input.actorRole ?? "", PERMISSIONS.ADJUST_PRICE_AGREEMENT)) {
          throw new TicketEditError(
            403,
            "PRICE_ADJUSTMENT_FORBIDDEN",
            `This service's price and type are set by its agreement. Changing them needs a ${rolesWithPermission(PERMISSIONS.ADJUST_PRICE_AGREEMENT).join(" or ")}; everything else on the ticket can be edited.`,
          );
        }
        nextServiceTypeId = input.serviceTypeId ?? service.serviceTypeId ?? null;
      }
      const nextPriceCents = service ? (input.priceCents === undefined ? service.priceCents : input.priceCents ?? null) : null;
      const serviceChanged = !!service && (nextServiceTypeId !== service.serviceTypeId || nextPriceCents !== service.priceCents);

      // Pass 23 (C3.6): the surcharge line. Omitted, it stays; sent, it is
      // normalized (no amount clears the label too) and, when that records,
      // changes or removes one, gated before anything is written - the same
      // gate as the post's, so the office edits under the technician's rule.
      const previousSurcharge = surchargeOf(existingRecord);
      const nextSurcharge = input.surchargeCents === undefined && input.surchargeLabel === undefined
        ? previousSurcharge
        : normalizeSurcharge({
          surchargeCents: input.surchargeCents === undefined ? existingRecord.surchargeCents : input.surchargeCents,
          surchargeLabel: input.surchargeLabel === undefined ? existingRecord.surchargeLabel : input.surchargeLabel,
        });
      const surchargeMoved = surchargeChanged(previousSurcharge, nextSurcharge);
      if (surchargeMoved) {
        const [surchargeService] = service
          ? [service]
          : existingRecord.serviceId
            ? await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, existingRecord.serviceId)))
            : [undefined];
        if (!surchargeService) {
          throw new TicketEditError(400, "SERVICE_NOT_FOUND", "This ticket is not linked to a service, so no surcharge line can sit beside its service line.");
        }
        const refusal = await this.resolveFieldSurchargeGateTx(tx, { actorRole: input.actorRole ?? "", service: surchargeService, adding: nextSurcharge.surchargeCents != null });
        if (refusal) {
          throw new TicketEditError(403, refusal.code, refusal.message);
        }
      }

      const previousApplications = await tx
        .select()
        .from(productApplications)
        .where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, existingRecord.id)));

      // The compliance snapshot (canon §12) follows the technician: naming a
      // different one re-copies the display name and license from that
      // profile, exactly as a post does.
      const technicianId = input.technicianId === undefined ? existingRecord.technicianId : input.technicianId || null;
      let technicianName = existingRecord.technicianName;
      let technicianLicenseNumber = existingRecord.technicianLicenseNumber;
      if (technicianId !== existingRecord.technicianId) {
        const [technician] = technicianId
          ? await tx.select().from(technicians).where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, technicianId)))
          : [undefined];
        if (technicianId && !technician) {
          throw new Error("Technician not found");
        }
        technicianName = technician?.displayName ?? null;
        technicianLicenseNumber = technician?.licenseId ?? null;
      }

      const followUpRequired = input.followUpRequired ?? existingRecord.followUpRequired;
      // Pass 20 (C3.4a): the materials in the org's vocabulary, and areas
      // serviced derived from them (canon §12) whenever they are sent - the
      // union of every row's areas in row order, else the body's own text,
      // else nothing. Without materials in the body the field is the content
      // edit it always was.
      const vocabulary = await this.readMaterialVocabularyTx(tx);
      const nextApplications = input.productApplications === undefined
        ? null
        : normalizeProductApplicationInputs(input.productApplications, vocabulary);
      const nextAreasServiced = nextApplications !== null
        ? deriveAreasServiced(nextApplications) ?? (input.areasServiced?.trim() || null)
        : input.areasServiced === undefined ? existingRecord.areasServiced : input.areasServiced?.trim() || null;
      // Pass 21 (C3.4b): the ticket's picks (the body's, else the stored set)
      // plus the pests of the rows the ticket ends up with.
      const nextTargetPests = deriveStoredTargetPests(
        vocabulary.pests,
        input.targetPests === undefined ? existingRecord.targetPests : input.targetPests,
        nextApplications ?? previousApplications,
      );
      const nextFields = {
        serviceDate: input.serviceDate ?? existingRecord.serviceDate,
        technicianId,
        technicianName,
        technicianLicenseNumber,
        notes: input.notes === undefined ? existingRecord.notes : input.notes?.trim() || null,
        targetPests: nextTargetPests,
        areasServiced: nextAreasServiced,
        conditionsFound: input.conditionsFound === undefined ? existingRecord.conditionsFound : input.conditionsFound?.trim() || null,
        recommendations: input.recommendations === undefined ? existingRecord.recommendations : input.recommendations?.trim() || null,
        followUpRequired,
        followUpNotes: !followUpRequired ? null : input.followUpNotes === undefined ? existingRecord.followUpNotes : input.followUpNotes?.trim() || null,
        customerSignature: input.customerSignature === undefined ? existingRecord.customerSignature : input.customerSignature ?? false,
        surchargeCents: nextSurcharge.surchargeCents,
        surchargeLabel: nextSurcharge.surchargeLabel,
        // The ticket's type is the Service's, copied at post; a type change
        // on the Service follows onto the ticket the same way.
        serviceTypeId: nextServiceTypeId,
      };

      const recordChanged = (Object.keys(nextFields) as Array<keyof typeof nextFields>).some((key) => !ticketFieldsEqual(nextFields[key], existingRecord[key]));
      const applicationsChanged = nextApplications !== null
        && !ticketFieldsEqual(nextApplications.map(snapshotProductApplication), previousApplications.map(snapshotProductApplication));
      if (!recordChanged && !applicationsChanged && !serviceChanged) {
        return existingRecord;
      }

      if (service && serviceChanged) {
        const [updatedService] = await tx
          .update(services)
          .set({ serviceTypeId: nextServiceTypeId, priceCents: nextPriceCents, updatedAt: new Date() })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, service.id)))
          .returning();
        // D7: the price is a financial mutation, logged as the post logs it -
        // only when it moved, the Service row before and after so a type
        // change made in the same save shows in the diff. A type-only change
        // is the ticket's own `ticket_edited` diff (its serviceTypeId follows).
        if (updatedService && updatedService.priceCents !== service.priceCents) {
          await this.recordAuditLogTx(tx, {
            entityType: "service",
            entityId: service.id,
            action: "price_overridden",
            actor: input.actor,
            before: service,
            after: updatedService,
          });
        }
      }

      const [record] = recordChanged
        ? await tx.update(serviceRecords).set(nextFields).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id))).returning()
        : [existingRecord];

      let applications: Array<Partial<Omit<InsertProductApplication, "serviceRecordId">>> = previousApplications;
      if (applicationsChanged && nextApplications) {
        await tx.delete(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, record.id)));
        applications = nextApplications.length
          ? await tx
            .insert(productApplications)
            .values(nextApplications.map((application) => ({ ...application, orgId: this.orgId, serviceRecordId: record.id })))
            .returning()
          : [];
      }

      // A price-only save writes the Service and `price_overridden` above and
      // nothing here: the ticket did not change.
      if (recordChanged || applicationsChanged) {
        await this.recordAuditLogTx(tx, {
          entityType: "service_record",
          entityId: record.id,
          action: "ticket_edited",
          actor: input.actor,
          before: snapshotTicketForAudit(existingRecord, previousApplications),
          after: snapshotTicketForAudit(record, applications),
        });
        // Pass 22 (C3.5): the stored service report is the ticket as it
        // stood; an edit that changed it retires the report, and the next
        // request renders the ticket as it now stands.
        await this.invalidateServiceReportTx(tx, record.id);
      }

      // D7 (Pass 23): a surcharge recorded, changed or removed is a money
      // mutation of its own beside the content's `ticket_edited` - one row,
      // the two surcharge fields before and after, so the diff shows exactly
      // what moved.
      if (surchargeMoved) {
        await this.recordAuditLogTx(tx, {
          entityType: "service_record",
          entityId: record.id,
          action: "surcharge_recorded",
          actor: input.actor,
          before: previousSurcharge,
          after: nextSurcharge,
        });
      }

      if (record.serviceId && record.technicianId !== existingRecord.technicianId) {
        await tx
          .update(services)
          .set({ assignedTechnicianId: record.technicianId || null, updatedAt: new Date() })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)));
      }

      // An agreement whose start date follows this visit (INITIAL_APPOINTMENT)
      // reads the ticket's service date, so a date edit re-syncs it as before.
      if (record.appointmentId && !ticketFieldsEqual(record.serviceDate, existingRecord.serviceDate)) {
        const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, record.appointmentId)));
        if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
          await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id, input.actor ?? undefined);
        }
      }

      return record;
    });
  }

  async completeService(input: CompleteServiceInput): Promise<CompleteServiceResult | undefined> {
    return db.transaction(async (tx) => {
      const [service] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, input.serviceId)));
      if (!service) {
        return undefined;
      }

      // D9 (Pass 16): the ticket's state decides who may post over it. A
      // FINALIZED ticket refuses everyone ("reopen first"); a ticket in office
      // review belongs to the office, so a re-post there needs EDIT_TICKET -
      // the technician waits for the office to reopen it and re-posts the
      // REOPENED ticket. Checked before anything is written, so a refused
      // post touches neither the Service's price nor its type.
      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.serviceId, service.id)));
      if (existingRecord && isTicketFinalized(existingRecord)) {
        throw new TicketLockedError("TICKET_FINALIZED", 409, "This ticket is finalized. Reopen it before posting it again.");
      }
      if (existingRecord && isTicketInOfficeReview(existingRecord) && !can(input.actorRole, PERMISSIONS.EDIT_TICKET)) {
        throw new TicketLockedError("TICKET_IN_REVIEW", 403, "This ticket is already in office review. The office reopens it before it can be posted again.");
      }
      const previousApplications = existingRecord
        ? await tx.select().from(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, existingRecord.id)))
        : [];

      // Pass 23 (C3.6): the surcharge line as the body sends it - a post
      // writes the ticket whole, so an omitted amount means none and a
      // re-post without it removes one - gated before anything is written
      // whenever it records, changes or removes one (ADD_FIELD_SURCHARGE;
      // the agreement template's toggle when adding to an agreement service).
      const previousSurcharge = surchargeOf(existingRecord);
      const nextSurcharge = normalizeSurcharge(input);
      const surchargeMoved = surchargeChanged(previousSurcharge, nextSurcharge);
      if (surchargeMoved) {
        const refusal = await this.resolveFieldSurchargeGateTx(tx, { actorRole: input.actorRole, service, adding: nextSurcharge.surchargeCents != null });
        if (refusal) {
          throw new TicketEditError(403, refusal.code, refusal.message);
        }
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
      // Pass 24: a type change here never re-derives the Service's work kind -
      // the kind is the instance's own once set, and a callback's link is
      // chosen at scheduling, not on the ticket.
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

        // D7: a price override is a financial mutation. Logged only when the
        // price actually moved - the ticket dialog sends the current price on
        // every post of a manual service, and a row per unchanged post would
        // bury the one override that matters. The snapshot is the Service
        // row, so a service-type change made in the same post shows in the
        // diff; a type-only change writes nothing (not a price override).
        if (updatedService && updatedService.priceCents !== service.priceCents) {
          await this.recordAuditLogTx(tx, {
            entityType: "service",
            entityId: service.id,
            action: "price_overridden",
            actor: input.actor,
            before: service,
            after: updatedService,
          });
        }
      }

      // Pass 20 (C3.4a): the materials in the org's vocabulary, and areas
      // serviced derived from them (canon §12) - the union of every row's
      // areas in row order; the body's own text only when no row names an
      // area (a post with no materials).
      const vocabulary = await this.readMaterialVocabularyTx(tx);
      const normalizedApplications = normalizeProductApplicationInputs(input.productApplications, vocabulary);
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
        // Pass 21 (C3.4b): the technician's picks plus every row's pests.
        targetPests: deriveStoredTargetPests(vocabulary.pests, input.targetPests, normalizedApplications),
        areasServiced: deriveAreasServiced(normalizedApplications) ?? (input.areasServiced?.trim() || null),
        conditionsFound: input.conditionsFound?.trim() || null,
        recommendations: input.recommendations?.trim() || null,
        followUpRequired: input.followUpRequired ?? false,
        followUpNotes: input.followUpRequired ? input.followUpNotes?.trim() || null : null,
        customerSignature: input.customerSignature ?? false,
        surchargeCents: nextSurcharge.surchargeCents,
        surchargeLabel: nextSurcharge.surchargeLabel,
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
        reopenReasonCode: null,
        readyForBilling: false,
      };
      const technicianSnapshot = await this.resolveServiceRecordTechnicianSnapshot(tx, recordPayload, existingRecord);

      const [postedRecord] = existingRecord
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

      // D3: a ticket entering office review on a visit whose invoice is
      // already issued (a manager's pre-finalization override, or a reopened
      // ticket re-posted after normal invoicing) enters flagged, so the
      // reviewer finalizes it knowing the customer already has a bill.
      const serviceRecord = await this.flagTicketIfVisitAlreadyInvoicedTx(tx, postedRecord);

      await tx.delete(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, serviceRecord.id)));
      const validApplications = normalizedApplications
        .map((application) => ({ ...application, orgId: this.orgId, serviceRecordId: serviceRecord.id }));
      const savedApplications = validApplications.length
        ? await tx.insert(productApplications).values(validApplications).returning()
        : [];

      // D9 (Pass 16): a post over an existing record is an edit of a posted
      // ticket - a technician's re-post of a REOPENED one, the office's over
      // one in review - and is recorded as such, ticket and materials before
      // and after. `after` is the record as posted; the D3 flag step above
      // writes its own row when it applies.
      if (existingRecord) {
        await this.recordAuditLogTx(tx, {
          entityType: "service_record",
          entityId: postedRecord.id,
          action: "ticket_edited",
          actor: input.actor,
          before: snapshotTicketForAudit(existingRecord, previousApplications),
          after: snapshotTicketForAudit(postedRecord, savedApplications),
        });
        // Pass 22 (C3.5): a re-post rewrites the ticket, so its stored
        // service report is retired with it.
        await this.invalidateServiceReportTx(tx, serviceRecord.id);
      }

      // D7 (Pass 23): the surcharge recorded on a first post, or changed or
      // removed by a re-post - one row, the two fields before and after.
      if (surchargeMoved) {
        await this.recordAuditLogTx(tx, {
          entityType: "service_record",
          entityId: serviceRecord.id,
          action: "surcharge_recorded",
          actor: input.actor,
          before: previousSurcharge,
          after: nextSurcharge,
        });
      }

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
      // Pass 32 (C5.1a): the post's write to the Service (status, the visit,
      // the technician) - usually a no-op, recorded when it moved something;
      // the price is price_overridden's above (effectiveService is the row
      // after that override, so a priced post does not diff the price twice).
      if (postedService) {
        await this.auditChangeTx(tx, "service", service.id, serviceAuditSnapshot(effectiveService), serviceAuditSnapshot(postedService), input.actor ?? null);
      }

      let updatedAppointment: Appointment | undefined | null = appointment ?? null;
      if (appointment) {
        const trackingMode = await this.getServiceTimeTrackingMode();
        const timeOutAt = trackingMode === "AUTO_TIMEOUT_ON_TICKET_POST" && !appointment.timeOutAt ? new Date() : appointment.timeOutAt ?? null;
        const durationMinutes = timeOutAt ? calculateDurationMinutes(appointment.timeInAt, timeOutAt) : appointment.durationMinutes ?? null;
        const nextAppointmentStatus = appointment.status === "SCHEDULED" ? "IN_PROGRESS" : appointment.status;

        [updatedAppointment] = await tx
          .update(appointments)
          .set({
            status: nextAppointmentStatus,
            timeOutAt,
            durationMinutes,
          })
          .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
          .returning();
        // Pass 32: the post's write to the visit (IN_PROGRESS, the auto
        // time-out) - status_changed or update when it moved something.
        if (updatedAppointment) {
          await this.auditChangeTx(tx, "appointment", appointment.id, appointmentRowAuditSnapshot(appointment), appointmentRowAuditSnapshot(updatedAppointment), input.actor ?? null);
        }

        const [linkedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.initialAppointmentId, appointment.id)));
        if (linkedAgreement?.startDateSource === "INITIAL_APPOINTMENT") {
          await this.syncAgreementInitialAppointmentDates(tx, linkedAgreement.id, input.actor ?? null);
        }
      }

      const finalService = postedService ?? effectiveService;
      let productionValueCents = finalService.priceCents;
      if (productionValueCents == null && finalService.agreementId) {
        const [relatedAgreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, finalService.agreementId)));
        productionValueCents = computeProductionValueCents(relatedAgreement?.priceCents, relatedAgreement?.expectedServiceCount);
      }

      return {
        service: finalService,
        appointment: updatedAppointment ?? null,
        serviceRecord,
        productApplications: savedApplications,
        productionValueCents,
      };
    });
  }

  async getProductApplications(): Promise<ProductApplication[]> {
    return db.select().from(productApplications).where(eq(productApplications.orgId, this.orgId));
  }

  async finalizeServiceRecord(id: string, actor?: AuditActor): Promise<FinalizeServiceRecordResult | undefined> {
    return db.transaction(async (tx) => {
      const [existingRecord] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)));
      if (!existingRecord) return undefined;

      let invoicing: FinalizationInvoicingOutcome<Invoice> | null = null;

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
        const [serviceBefore] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)));
        [completedService] = await tx
          .update(services)
          .set({
            status: "COMPLETED",
            assignedTechnicianId: record.technicianId || null,
            updatedAt: now,
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)))
          .returning();
        // Pass 32 (C5.1a): the Service's COMPLETED (status_changed), signed by
        // the finalizer; the ticket's own finalization stamps stay on the
        // ticket (service_records is D9's, excluded here).
        if (serviceBefore && completedService) {
          await this.auditChangeTx(tx, "service", record.serviceId, serviceAuditSnapshot(serviceBefore), serviceAuditSnapshot(completedService), actor);
        }

        if (completedService && !existingRecord.confirmed) {
          await this.advanceAgreementForCompletedService(tx, completedService);
          await this.createProductionValueEntriesForFinalizedRecord(tx, record, completedService, now);
        }
      }

      if (!existingRecord.confirmed) {
        await this.ensureOpportunityForServiceRecordTx(tx, record);
      }

      if (record.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, record.appointmentId)));
        if (appointment) {
          // Pass 28 (decision 2): a CANCELLED service still linked to the
          // visit - the disposition's convention for a one-time service on a
          // visit it cancels, or a legacy row - does not hold the visit open;
          // the billing group (getAppointmentBillingGroupTx) excludes it too,
          // so the two rollups agree on what the visit is.
          const linkedServices = (await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId))
            .filter((service) => service.status !== "CANCELLED");
          const serviceIds = linkedServices.map((service) => service.id);
          const linkedRecords = serviceIds.length
            ? await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), inArray(serviceRecords.serviceId, serviceIds)))
            : [];
          const finalizedServiceIds = new Set(linkedRecords.filter((serviceRecord) => serviceRecord.confirmed).map((serviceRecord) => serviceRecord.serviceId));
          const allFinalized = serviceIds.length > 0 && serviceIds.every((serviceId) => finalizedServiceIds.has(serviceId));
          if (allFinalized) {
            const timeOutAt = appointment.timeOutAt ?? now;
            const [completedAppointment] = await tx.update(appointments).set({
              status: "COMPLETED",
              timeOutAt,
              durationMinutes: calculateDurationMinutes(appointment.timeInAt, timeOutAt) ?? appointment.durationMinutes ?? null,
            }).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id))).returning();
            // Pass 32 (C5.1a): the visit's COMPLETED (status_changed).
            if (completedAppointment) {
              await this.auditChangeTx(tx, "appointment", appointment.id, appointmentRowAuditSnapshot(appointment), appointmentRowAuditSnapshot(completedAppointment), actor);
            }

            // D2: the finalization that completes the visit is the invoicing
            // moment. Same transaction, so an AUTO_DRAFT lands with the
            // finalization or not at all - but a refused draft never rolls
            // the finalization back (see resolveInvoiceOnFinalizeTx).
            invoicing = await this.resolveInvoiceOnFinalizeTx(tx, {
              appointment,
              serviceRecordIds: Array.from(new Set([record.id, ...linkedRecords.map((linkedRecord) => linkedRecord.id)])),
              actor,
            });
          }
        }
      }

      return { record, invoicing };
    });
  }

  // D2 (PLAN_BILLING_V1_1.md): generate-or-adopt, gated by the org's
  // invoiceOnFinalize setting. Called only once every active service on the
  // visit is finalized, from inside finalizeServiceRecord's transaction.
  //
  //   PROMPT      report the visit's DRAFT (if any) and let the reviewer choose
  //               Generate / Generate & Send / Later. Generate is the existing
  //               generateInvoiceFromServiceRecord(), which adopts a DRAFT.
  //   AUTO_DRAFT  create the DRAFT here if the visit has none. An existing
  //               DRAFT is kept as-is: issue re-prices it from the finalized
  //               tickets, so refreshing its preview here would be a second
  //               pricing pass with no reader.
  //   OFF         nothing. The visit stays on the ready-for-billing list.
  //
  // An already-ISSUED invoice on the visit (manager override, pre-D1 row) is
  // reported as ALREADY_INVOICED in every mode - there is nothing to generate,
  // and the tickets were flagged at posting time so the reviewer already knows.
  private async resolveInvoiceOnFinalizeTx(
    tx: DbTransaction,
    input: { appointment: Appointment; serviceRecordIds: string[]; actor?: AuditActor | null },
  ): Promise<FinalizationInvoicingOutcome<Invoice>> {
    const mode = await this.readInvoiceOnFinalizeModeTx(tx);
    const appointmentId = input.appointment.id;
    const existing = await this.findInvoiceForVisitTx(tx, appointmentId, input.serviceRecordIds);

    if (existing && isInvoiceIssued(existing.status)) {
      return { mode, action: "ALREADY_INVOICED", appointmentId, invoice: existing };
    }
    if (mode === "OFF") {
      return { mode, action: "OFF", appointmentId, invoice: existing ?? null };
    }
    if (mode === "PROMPT") {
      return { mode, action: "PROMPT", appointmentId, invoice: existing ?? null };
    }

    // AUTO_DRAFT
    if (existing) {
      return { mode, action: "DRAFTED", appointmentId, invoice: existing, created: false };
    }

    // Savepoint (a nested drizzle transaction), not a bare try/catch: a failed
    // statement aborts a Postgres transaction outright, and the finalization
    // above must survive whatever drafting does. Rolling back to the savepoint
    // leaves the outer transaction usable, so a refusal - an agreement with no
    // plan and no price, or a race lost on the appointment's unique index - is
    // reported on the response rather than undoing the finalization.
    try {
      const draft = await tx.transaction((savepoint) => this.createDraftInvoiceForAppointmentTx(savepoint, appointmentId, input.actor));
      return { mode, action: "DRAFTED", appointmentId, invoice: draft, created: true };
    } catch (err: any) {
      // Lost a race to a concurrent "Draft invoice" click: the unique index
      // made us wait for the winner to commit, so it is visible now.
      const raceWinner = err?.code === "23505" ? await this.findInvoiceForVisitTx(tx, appointmentId, input.serviceRecordIds) : undefined;
      if (raceWinner) {
        return { mode, action: "DRAFTED", appointmentId, invoice: raceWinner, created: false };
      }
      return {
        mode,
        action: "DRAFT_FAILED",
        appointmentId,
        invoice: null,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Pass 17 (C3.2): the reason is a settings-list entry or OTHER with the
  // reason typed (shared/ticket-reopen.ts). Checked before the transaction,
  // the permission first - a support user is told who may reopen with Other
  // whatever they typed - then the text, then the list; each a coded 4xx.
  // The stored code is the list entry as written, or OTHER; the text is
  // required for OTHER and kept as optional detail beside a listed reason.
  async reopenServiceRecord(input: ReopenServiceRecordInput): Promise<ServiceRecord | undefined> {
    const { id, actor } = input;
    const reasonCode = input.reasonCode.trim();
    const reason = input.reason?.trim() || null;
    const isOther = isOtherReopenReason(reasonCode);
    if (isOther) {
      if (!can(input.actorRole, PERMISSIONS.REOPEN_TICKET_OTHER)) {
        const who = rolesWithPermission(PERMISSIONS.REOPEN_TICKET_OTHER).join(" or ");
        throw new TicketReopenError(403, REOPEN_OTHER_FORBIDDEN, `Reopening with "Other" needs a ${who}. Pick a reason from the list, or ask one of them to reopen it.`);
      }
      if (!reason) {
        throw new TicketReopenError(400, REOPEN_REASON_TEXT_REQUIRED, '"Other" needs the reason typed out');
      }
    } else {
      const reasons = await this.getTicketReopenReasons();
      if (!reasons.includes(reasonCode)) {
        throw new TicketReopenError(400, REOPEN_REASON_NOT_ON_LIST, `"${reasonCode}" is not on the ticket reopen reasons list`);
      }
    }

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
          reopenReason: reason,
          reopenReasonCode: isOther ? REOPEN_REASON_OTHER : reasonCode,
          readyForBilling: false,
        })
        .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, id)))
        .returning();

      // D7: reopening unlocks a ticket that finalization made immutable and
      // pulls it off the ready-for-billing list, so it is recorded with the
      // reason. The reopened* stamps on the row stay for display; this row is
      // the history (D7: "single last-actor stamps remain for display; the
      // log is the truth").
      await this.recordAuditLogTx(tx, {
        entityType: "service_record",
        entityId: record.id,
        action: "ticket_reopened",
        actor,
        before: existingRecord,
        after: record,
      });

      // Pass 32 (C5.1a): the reopen's resets of the Service (COMPLETED ->
      // SCHEDULED) and of the visit (COMPLETED -> IN_PROGRESS / SCHEDULED) are
      // status_changed rows beside the ticket's ticket_reopened above.
      if (record.serviceId) {
        const [serviceBefore] = await tx.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)));
        const [reopenedService] = await tx
          .update(services)
          .set({
            status: "SCHEDULED",
            updatedAt: new Date(),
          })
          .where(and(eq(services.orgId, this.orgId), eq(services.id, record.serviceId)))
          .returning();
        if (serviceBefore && reopenedService) {
          await this.auditChangeTx(tx, "service", record.serviceId, serviceAuditSnapshot(serviceBefore), serviceAuditSnapshot(reopenedService), actor);
        }
      }

      if (record.appointmentId) {
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, record.appointmentId)));
        if (appointment?.status === "COMPLETED") {
          const [reopenedAppointment] = await tx
            .update(appointments)
            .set({ status: appointment.timeInAt ? "IN_PROGRESS" : "SCHEDULED" })
            .where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointment.id)))
            .returning();
          if (reopenedAppointment) {
            await this.auditChangeTx(tx, "appointment", appointment.id, appointmentRowAuditSnapshot(appointment), appointmentRowAuditSnapshot(reopenedAppointment), actor);
          }
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

  // Pass 20 (C3.4a): a product's default unit, allowed areas and default
  // area are written in the org's lists' spelling where they match an entry
  // (casing and whitespace aside) and kept as typed otherwise - never
  // refused; the form shows an off-list value marked (shared/material-lists.ts).
  private async normalizeMaterialProductInput<T extends Partial<InsertMaterialProduct>>(data: T): Promise<T> {
    const vocabulary = await this.readMaterialVocabularyTx(db as any);
    const next: Partial<InsertMaterialProduct> = { ...data };
    if (data.defaultUnit !== undefined) next.defaultUnit = toListSpelling(vocabulary.units, data.defaultUnit);
    if (data.allowedApplicationAreas !== undefined) {
      next.allowedApplicationAreas = data.allowedApplicationAreas === null ? null : toListSpellings(vocabulary.areas, data.allowedApplicationAreas);
    }
    if (data.defaultApplicationArea !== undefined) next.defaultApplicationArea = toListSpelling(vocabulary.areas, data.defaultApplicationArea);
    return next as T;
  }

  async createMaterialProduct(data: InsertMaterialProduct): Promise<MaterialProduct> {
    const normalized = await this.normalizeMaterialProductInput(data);
    const [product] = await db.insert(materialProducts).values({ ...normalized, orgId: this.orgId }).returning();
    return product;
  }

  async updateMaterialProduct(id: string, data: Partial<InsertMaterialProduct>): Promise<MaterialProduct | undefined> {
    const normalized = await this.normalizeMaterialProductInput(data);
    const [product] = await db
      .update(materialProducts)
      .set({ ...normalized, updatedAt: new Date() })
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

  // Pass 17 (C3.2): the ticket reopen reasons list - one app_settings row in
  // the cancel list's shape. No row reads as the defaults, and "Other" is
  // never stored: the pop-up offers it itself, last (shared/ticket-reopen.ts).
  async getTicketReopenReasons(): Promise<string[]> {
    const [setting] = await db.select().from(appSettings).where(and(eq(appSettings.orgId, this.orgId), eq(appSettings.key, TICKET_REOPEN_REASONS_SETTING_KEY)));
    return normalizeTicketReopenReasons(setting?.value);
  }

  async setTicketReopenReasons(reasons: string[]): Promise<AppSetting> {
    const normalized = sanitizeTicketReopenReasons(reasons);
    if (!normalized.length) {
      throw new Error("At least one ticket reopen reason besides Other is required");
    }
    const value = JSON.stringify(normalized);
    const [setting] = await db
      .insert(appSettings)
      .values({ orgId: this.orgId, key: TICKET_REOPEN_REASONS_SETTING_KEY, value })
      .onConflictDoUpdate({
        target: [appSettings.orgId, appSettings.key],
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // Pass 20 (C3.4a): the material unit list and the application-area list -
  // one app_settings row each, the reopen list's shape; no row reads as the
  // defaults (shared/material-lists.ts). Read inside a transaction by the
  // post and the office edit to put a row's vocabulary in the org's spelling.
  private async readMaterialVocabularyTx(tx: DbTransaction): Promise<MaterialVocabulary> {
    const rows = await tx
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.orgId, this.orgId), inArray(appSettings.key, [MATERIAL_UNITS_SETTING_KEY, APPLICATION_AREAS_SETTING_KEY])));
    // Pass 21 (C3.4b): the pest list is a table, not a settings row - its
    // active rows, in the order GET /api/target-pests offers them, read in
    // the same transaction as the materials they spell.
    const pests = await tx
      .select({ label: targetPests.label })
      .from(targetPests)
      .where(and(eq(targetPests.orgId, this.orgId), eq(targetPests.isActive, true)))
      .orderBy(asc(targetPests.sortOrder), asc(targetPests.label));
    return {
      units: normalizeMaterialUnits(rows.find((row) => row.key === MATERIAL_UNITS_SETTING_KEY)?.value),
      areas: normalizeApplicationAreas(rows.find((row) => row.key === APPLICATION_AREAS_SETTING_KEY)?.value),
      pests: pests.map((row) => row.label),
    };
  }

  async getMaterialUnits(): Promise<string[]> {
    return (await this.readMaterialVocabularyTx(db as any)).units;
  }

  async setMaterialUnits(units: string[]): Promise<AppSetting> {
    return this.writeMaterialList(MATERIAL_UNITS_SETTING_KEY, units, "At least one material unit is required");
  }

  async getApplicationAreas(): Promise<string[]> {
    return (await this.readMaterialVocabularyTx(db as any)).areas;
  }

  async setApplicationAreas(areas: string[]): Promise<AppSetting> {
    return this.writeMaterialList(APPLICATION_AREAS_SETTING_KEY, areas, "At least one application area is required");
  }

  private async writeMaterialList(key: string, values: string[], emptyMessage: string): Promise<AppSetting> {
    const normalized = sanitizeMaterialList(values);
    if (!normalized.length) {
      throw new Error(emptyMessage);
    }
    const value = JSON.stringify(normalized);
    const [setting] = await db
      .insert(appSettings)
      .values({ orgId: this.orgId, key, value })
      .onConflictDoUpdate({
        target: [appSettings.orgId, appSettings.key],
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // D2: PROMPT | AUTO_DRAFT | OFF, default PROMPT. A missing or unrecognised
  // row reads as the default rather than failing finalization.
  async getInvoiceOnFinalizeMode(): Promise<InvoiceOnFinalizeMode> {
    return this.readInvoiceOnFinalizeModeTx(db as any);
  }

  private async readInvoiceOnFinalizeModeTx(tx: DbTransaction): Promise<InvoiceOnFinalizeMode> {
    const [setting] = await tx.select().from(appSettings).where(and(eq(appSettings.orgId, this.orgId), eq(appSettings.key, INVOICE_ON_FINALIZE_SETTING_KEY)));
    return normalizeInvoiceOnFinalizeMode(setting?.value);
  }

  async setInvoiceOnFinalizeMode(mode: InvoiceOnFinalizeMode): Promise<AppSetting> {
    const [setting] = await db
      .insert(appSettings)
      .values({ orgId: this.orgId, key: INVOICE_ON_FINALIZE_SETTING_KEY, value: mode })
      .onConflictDoUpdate({
        target: [appSettings.orgId, appSettings.key],
        set: { value: mode, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // Pass 22 (C3.5; B11): "Attach service report to visit invoices", the
  // invoice-on-finalize shape - one app_settings row, default off, a missing
  // or unrecognised value reading as off rather than failing a render.
  async getAttachServiceReportToInvoices(): Promise<boolean> {
    return this.readAttachServiceReportTx(db);
  }

  private async readAttachServiceReportTx(reader: DbReader): Promise<boolean> {
    const [setting] = await reader.select().from(appSettings).where(and(eq(appSettings.orgId, this.orgId), eq(appSettings.key, ATTACH_SERVICE_REPORT_SETTING_KEY)));
    return normalizeAttachServiceReport(setting?.value);
  }

  async setAttachServiceReportToInvoices(enabled: boolean): Promise<AppSetting> {
    const value = serializeAttachServiceReport(enabled);
    const [setting] = await db
      .insert(appSettings)
      .values({ orgId: this.orgId, key: ATTACH_SERVICE_REPORT_SETTING_KEY, value })
      .onConflictDoUpdate({
        target: [appSettings.orgId, appSettings.key],
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // Pass 31 (C4.5): the dispatch board's four settings, read in one query
  // and normalized together (shared/dispatch-board.ts: an unrecognised value
  // reads as its default, a start / end pair out of order as the default
  // pair, a snap coarser than the view as the view). No seed row.
  async getDispatchBoardSettings(): Promise<DispatchBoardSettings> {
    return this.readDispatchBoardSettingsTx(db);
  }

  private async readDispatchBoardSettingsTx(reader: DbReader): Promise<DispatchBoardSettings> {
    const rows = await reader
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.orgId, this.orgId), inArray(appSettings.key, DISPATCH_BOARD_SETTING_KEY_LIST)));
    const byKey = new Map(rows.map((row) => [row.key, row.value] as const));
    return normalizeDispatchBoardSettings({
      viewIntervalMinutes: byKey.get(DISPATCH_BOARD_SETTING_KEYS.viewIntervalMinutes),
      snapMinutes: byKey.get(DISPATCH_BOARD_SETTING_KEYS.snapMinutes),
      defaultStartHour: byKey.get(DISPATCH_BOARD_SETTING_KEYS.defaultStartHour),
      defaultEndHour: byKey.get(DISPATCH_BOARD_SETTING_KEYS.defaultEndHour),
    });
  }

  // The body is partial: the values given are laid over what is stored, the
  // four are checked together, and only the values given are upserted - one
  // transaction, so a refused change writes nothing.
  async setDispatchBoardSettings(patch: Partial<DispatchBoardSettings>): Promise<DispatchBoardSettings> {
    return db.transaction(async (tx) => {
      const current = await this.readDispatchBoardSettingsTx(tx);
      const next: DispatchBoardSettings = {
        viewIntervalMinutes: patch.viewIntervalMinutes ?? current.viewIntervalMinutes,
        snapMinutes: patch.snapMinutes ?? current.snapMinutes,
        defaultStartHour: patch.defaultStartHour ?? current.defaultStartHour,
        defaultEndHour: patch.defaultEndHour ?? current.defaultEndHour,
      };
      const changed = DISPATCH_BOARD_SETTING_FIELDS.filter((field) => patch[field] !== undefined);
      const problem = describeDispatchBoardProblem(next);
      if (problem) throw new DispatchBoardSettingsError(problem);
      for (const field of changed) {
        const value = serializeDispatchBoardSetting(next[field]);
        await tx
          .insert(appSettings)
          .values({ orgId: this.orgId, key: DISPATCH_BOARD_SETTING_KEYS[field], value })
          .onConflictDoUpdate({
            target: [appSettings.orgId, appSettings.key],
            set: { value, updatedAt: new Date() },
          });
      }
      return next;
    });
  }

  async getProductApplicationsByServiceRecord(serviceRecordId: string): Promise<ProductApplication[]> {
    return db.select().from(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, serviceRecordId)));
  }

  async createProductApplication(data: InsertProductApplication): Promise<ProductApplication> {
    return db.transaction(async (tx) => {
      // The same vocabulary rule as a post's materials (Pass 20), so a row
      // written by this legacy route carries applicationAreas and (Pass 21)
      // targetPests in the lists' spelling too.
      const vocabulary = await this.readMaterialVocabularyTx(tx);
      const [normalized] = normalizeProductApplicationInputs([data], vocabulary);
      if (!normalized) {
        throw new Error("Product name is required");
      }
      const [pa] = await tx.insert(productApplications).values({ ...normalized, serviceRecordId: data.serviceRecordId, orgId: this.orgId }).returning();
      // Pass 22 (C3.5): a material row added is ticket content written -
      // the stored service report, if any, is retired.
      await this.invalidateServiceReportTx(tx, pa.serviceRecordId);
      // Pass 21 (C3.4b): the ticket's set names every row's pests, this
      // route's row included - the ticket keeps its own picks and gains the
      // row's. Not audited: this pre-Phase-1 route never was.
      if (targetPestsOf(pa).length) {
        const [record] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, pa.serviceRecordId)));
        if (record) {
          const nextTargetPests = deriveStoredTargetPests(vocabulary.pests, record.targetPests, [pa]);
          if (!ticketFieldsEqual(nextTargetPests, record.targetPests)) {
            await tx.update(serviceRecords).set({ targetPests: nextTargetPests }).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, record.id)));
          }
        }
      }
      return pa;
    });
  }

  async getOrganization(): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, this.orgId));
    return org;
  }

  async updateOrganizationBranding(data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [org] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, this.orgId))
      .returning();
    return org;
  }

  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.orgId, this.orgId));
  }

  async getInvoicesByLocation(locationId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.locationId, locationId)));
  }

  // D5: balances come from the ledger's stored rollups, not from a status
  // label. Issued invoices only - a DRAFT is not a receivable and a VOID owes
  // nothing - and the location's unapplied balance (confirmed payments and
  // issued credit memos with value left to apply) rides along so the location
  // switcher can say "Open $120 / $50 on account" rather than only one side.
  async getLocationBalancesByCustomer(customerId: string): Promise<LocationBalanceSummary[]> {
    const customerInvoices = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.customerId, customerId)));
    const balances = new Map<string, LocationBalanceSummary>();
    const summaryFor = (locationId: string) => {
      const current = balances.get(locationId) ?? {
        locationId,
        openBalanceCents: 0,
        totalInvoicedCents: 0,
        invoiceCount: 0,
        unappliedBalanceCents: 0,
      };
      balances.set(locationId, current);
      return current;
    };

    for (const invoice of customerInvoices) {
      if (!invoice.locationId || !isInvoiceIssued(invoice.status)) {
        continue;
      }

      const current = summaryFor(invoice.locationId);
      current.totalInvoicedCents += invoice.totalAmountCents;
      current.invoiceCount += 1;
      current.openBalanceCents += invoice.balanceDueCents;
    }

    const customerPayments = await db.select().from(payments).where(and(eq(payments.orgId, this.orgId), eq(payments.customerId, customerId)));
    const customerCredits = await db.select().from(creditMemos).where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.customerId, customerId)));
    const sources = await this.collectUnappliedSourcesTx(db, customerPayments, customerCredits);
    for (const source of sources) {
      if (source.status !== "CONFIRMED" && source.status !== "ISSUED") {
        continue;
      }
      summaryFor(source.locationId).unappliedBalanceCents += source.unappliedCents;
    }

    return Array.from(balances.values());
  }

  // Aging (PLAN_ROADMAP_V2.md C2.4, Pass 14; B20): derived from the ledger's
  // stored rollups at read time, never stored. The rows are the issued
  // invoices still carrying a balance - the balanceDueCents filter already
  // leaves a DRAFT or VOID out (a non-receivable holds 0, D5) and
  // shared/aging.ts checks the status again - plus the unapplied pool the
  // location switcher and the ledger panel already read
  // (collectUnappliedSourcesTx), placed at each source's location. The
  // bucketing (Current 0-30 / 31-60 / 61-90 / Over 90 UTC calendar days
  // since issuedAt), the rollup and the ordering live in shared/aging.ts so
  // the customer screen, the org-wide report and a scratchpad script agree.
  // Nothing is netted: money on account and pending money ride beside the
  // aged balance.
  private agingSourcesOf(
    sources: Array<UnappliedSource & { locationId: string }>,
    customerIdOf: (source: UnappliedSource) => string | undefined,
  ): AgingOnAccountInput[] {
    const inputs: AgingOnAccountInput[] = [];
    for (const source of sources) {
      const customerId = customerIdOf(source);
      if (!customerId) continue;
      inputs.push({ customerId, locationId: source.locationId, status: source.status, unappliedCents: source.unappliedCents });
    }
    return inputs;
  }

  async getCustomerAging(customerId: string): Promise<CustomerAging | undefined> {
    const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, customerId)));
    if (!customer) {
      return undefined;
    }
    const asOf = agingAsOf();
    const owed = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.customerId, customerId), gt(invoices.balanceDueCents, 0)));
    const customerPayments = await db.select().from(payments).where(and(eq(payments.orgId, this.orgId), eq(payments.customerId, customerId)));
    const customerCredits = await db.select().from(creditMemos).where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.customerId, customerId)));
    const sources = await this.collectUnappliedSourcesTx(db, customerPayments, customerCredits);
    const byLocation = summarizeAgingByLocation(owed, this.agingSourcesOf(sources, () => customerId), asOf);
    return { customerId, asOf, rollup: rollupAging(byLocation), locations: byLocation };
  }

  async getAgingReport(): Promise<AgingReport> {
    const asOf = agingAsOf();
    const owed = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), gt(invoices.balanceDueCents, 0)));
    const orgPayments = await db.select().from(payments).where(eq(payments.orgId, this.orgId));
    const orgCredits = await db.select().from(creditMemos).where(eq(creditMemos.orgId, this.orgId));
    const sources = await this.collectUnappliedSourcesTx(db, orgPayments, orgCredits);
    // A source's customer is the row it came from (a payment or credit memo
    // carries customerId beside locationId, D4) - the pool helper drops it.
    const customerByPaymentId = new Map(orgPayments.map((payment) => [payment.id, payment.customerId]));
    const customerByCreditId = new Map(orgCredits.map((memo) => [memo.id, memo.customerId]));
    const byLocation = summarizeAgingByLocation(
      owed,
      this.agingSourcesOf(sources, (source) => (source.kind === "payment" ? customerByPaymentId.get(source.id) : customerByCreditId.get(source.id))),
      asOf,
    );

    const locationIds = Array.from(new Set(byLocation.map((entry) => entry.locationId).filter((id): id is string => !!id)));
    const locationRows = locationIds.length
      ? await db
          .select({ id: locations.id, name: locations.name, address: locations.address, city: locations.city, state: locations.state, zip: locations.zip, isPrimary: locations.isPrimary })
          .from(locations)
          .where(and(eq(locations.orgId, this.orgId), inArray(locations.id, locationIds)))
      : [];
    const locationById = new Map(locationRows.map((row) => [row.id, row]));
    const customerIds = Array.from(new Set(byLocation.map((entry) => entry.customerId)));
    const customerRows = customerIds.length
      ? await db
          .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, companyName: customers.companyName })
          .from(customers)
          .where(and(eq(customers.orgId, this.orgId), inArray(customers.id, customerIds)))
      : [];
    const customerById = new Map(customerRows.map((row) => [row.id, row]));

    const grouped = new Map<string, AgingReportLocation[]>();
    for (const entry of byLocation) {
      const location = entry.locationId ? locationById.get(entry.locationId) : undefined;
      const row: AgingReportLocation = {
        ...entry,
        name: location?.name ?? null,
        address: location ? `${location.address}, ${location.city}, ${location.state} ${location.zip}` : null,
        isPrimary: location?.isPrimary ?? false,
      };
      const list = grouped.get(entry.customerId) ?? [];
      list.push(row);
      grouped.set(entry.customerId, list);
    }
    const customersOut: AgingReportCustomer[] = [];
    for (const [customerId, list] of Array.from(grouped.entries())) {
      const customer = customerById.get(customerId);
      list.sort((a, b) => (a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : compareLocationAging(a, b)));
      customersOut.push({
        ...agingFiguresOf(rollupAging(list)),
        customerId,
        firstName: customer?.firstName ?? "",
        lastName: customer?.lastName ?? "",
        companyName: customer?.companyName ?? null,
        locations: list,
      });
    }
    customersOut.sort(
      (a, b) =>
        b.openBalanceCents - a.openBalanceCents
        || b.onAccountCents - a.onAccountCents
        || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
    );
    return { asOf, totals: rollupAging(byLocation), customers: customersOut };
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
    return inv;
  }

  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    return db.select().from(invoiceLineItems).where(and(eq(invoiceLineItems.orgId, this.orgId), eq(invoiceLineItems.invoiceId, invoiceId))).orderBy(asc(invoiceLineItems.sortOrder));
  }

  // The invoice modal's one read (PLAN_ROADMAP_V2.md Part D, Pass 11a). The
  // row, its lines with what the ticket behind each one knows (service type,
  // service date, ticket status), and the customer, location and visit it
  // belongs to. Composed from the reads that already exist - getInvoice for
  // the org scope (an id outside the org is undefined, the route's 404),
  // getInvoiceLineItems, getAppointment - because there is no
  // single-appointment route and this is where the modal gets the visit.
  // Reads only; every act on an invoice keeps its own route.
  async getInvoiceDetail(id: string): Promise<InvoiceDetail | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) {
      return undefined;
    }

    const [lines, customer, location, appointment] = await Promise.all([
      this.getInvoiceLineItems(id),
      this.getCustomer(invoice.customerId),
      invoice.locationId ? this.getLocation(invoice.locationId) : Promise.resolve(undefined),
      invoice.appointmentId ? this.getAppointment(invoice.appointmentId) : Promise.resolve(undefined),
    ]);

    const recordIds = lines.map((line) => line.serviceRecordId).filter((value): value is string => !!value);
    const serviceIds = lines.map((line) => line.serviceId).filter((value): value is string => !!value);
    const records = recordIds.length
      ? await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), inArray(serviceRecords.id, recordIds)))
      : [];
    const lineServices = serviceIds.length
      ? await db.select().from(services).where(and(eq(services.orgId, this.orgId), inArray(services.id, serviceIds)))
      : [];
    const recordById = new Map(records.map((record) => [record.id, record]));
    const serviceById = new Map(lineServices.map((service) => [service.id, service]));

    // The ticket's service type when there is a ticket, else the service's:
    // a DRAFT line may have been priced from a service with no ticket yet.
    const serviceTypeIdForLine = (line: InvoiceLineItem): string | null => {
      const record = line.serviceRecordId ? recordById.get(line.serviceRecordId) : undefined;
      const service = line.serviceId ? serviceById.get(line.serviceId) : undefined;
      return record?.serviceTypeId ?? service?.serviceTypeId ?? null;
    };
    const serviceTypeIds = Array.from(new Set(lines.map(serviceTypeIdForLine).filter((value): value is string => !!value)));
    const lineServiceTypes = serviceTypeIds.length
      ? await db.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), inArray(serviceTypes.id, serviceTypeIds)))
      : [];
    const serviceTypeNameById = new Map(lineServiceTypes.map((serviceType) => [serviceType.id, serviceType.name]));

    // Who ran the visit: the appointment's technician, falling back to the
    // name a ticket recorded (a technician row may have been deactivated).
    let technicianLabel: string | null = null;
    if (appointment?.assignedTechnicianId) {
      const [technician] = await db
        .select()
        .from(technicians)
        .where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, appointment.assignedTechnicianId)));
      technicianLabel = technician?.displayName ?? null;
    }
    if (!technicianLabel) {
      technicianLabel = records.find((record) => record.technicianName)?.technicianName ?? null;
    }

    const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : "";

    return {
      invoice,
      lines: lines.map((line) => {
        const record = line.serviceRecordId ? recordById.get(line.serviceRecordId) : undefined;
        const serviceTypeId = serviceTypeIdForLine(line);
        return {
          ...line,
          serviceTypeName: serviceTypeId ? serviceTypeNameById.get(serviceTypeId) ?? null : null,
          serviceDate: record?.serviceDate ?? null,
          ticketStatus: record?.ticketStatus ?? null,
        };
      }),
      customer: { id: invoice.customerId, label: customerName || customer?.companyName || "Customer" },
      location: location
        ? { id: location.id, name: location.name, address: location.address, city: location.city, state: location.state, zip: location.zip }
        : null,
      appointment: appointment
        ? { id: appointment.id, scheduledDate: appointment.scheduledDate, status: appointment.status, technicianLabel }
        : null,
    };
  }

  // Where one visit stands with invoicing (PLAN_ROADMAP_V2.md C2.1b, Pass
  // 11b): the Service Ticket Review modal's invoice badge, and its Generate
  // for the visit the finalize prompt's Later left un-invoiced. Composed from
  // the helpers generation and issue already read, so the badge can never
  // disagree with what Generate would do: getAppointmentBillingGroupTx for
  // the visit's active services and their tickets, findInvoiceForVisitTx for
  // the invoice through either anchor (a DRAFT counts - it holds the anchor
  // and Generate adopts it - a VOID one does not), and the issue path's own
  // finalized test (every active service has a billing-ready ticket).
  // Reads only; Generate keeps its route.
  async getAppointmentInvoiceStatus(appointmentId: string): Promise<AppointmentInvoiceStatus | undefined> {
    const group = await this.getAppointmentBillingGroupTx(db as any, appointmentId);
    if (!group) {
      return undefined;
    }

    const recordByServiceId = new Map(group.records.filter((record) => record.serviceId).map((record) => [record.serviceId!, record]));
    const unfinalizedServices = group.services.filter((service) => !recordByServiceId.get(service.id)?.readyForBilling);
    const [invoice, unfinalizedTickets] = await Promise.all([
      this.findInvoiceForVisitTx(db as any, appointmentId, group.records.map((record) => record.id)),
      this.describeUnfinalizedTicketsTx(db as any, unfinalizedServices, recordByServiceId),
    ]);

    return {
      appointmentId,
      invoice: invoice ?? null,
      finalized: unfinalizedServices.length === 0,
      unfinalizedTickets,
    };
  }

  // Eligibility is per visit as of D1, not per ticket: a record is ready when
  // its appointment has no non-void invoice yet AND every non-cancelled service
  // on that appointment is finalized. Partial finalization does not invoice
  // (D1, "generation timing"), so a half-finished visit is withheld here rather
  // than listed and then rejected by generation.
  //
  // Agreement-generated services are no longer excluded (they used to be, since
  // generation rejected them outright). They now ride along on the visit
  // invoice, at $0 when the nightly run bills their plan and at a real amount
  // when it does not - see resolveServiceLineBillingTx, which owns that
  // decision. Listing them here is what makes a COD agreement's visits billable
  // at all; excluding them was why that work was never invoiced.
  async getServiceRecordsReadyForBilling(): Promise<ServiceRecord[]> {
    const readyRecords = await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.readyForBilling, true)));
    // Issued invoices only. A DRAFT (D3) holds the visit's anchor so generation
    // adopts it, but the visit is still "ready to bill" - listing it is what
    // lets the office issue the draft from the same Generate action.
    const alreadyInvoiced = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), notInArray(invoices.status, ["VOID", "DRAFT"])));
    const invoicedServiceRecordIds = new Set(alreadyInvoiced.map((invoice) => invoice.serviceRecordId).filter((id): id is string => !!id));
    const invoicedAppointmentIds = new Set(alreadyInvoiced.map((invoice) => invoice.appointmentId).filter((id): id is string => !!id));

    // Pre-D1 invoices anchor on a service record even when that record sits on
    // an appointment. Such an invoice still covers the visit, so it blocks the
    // appointment too - otherwise the visit would look uninvoiced and generation
    // would issue a second invoice for the same work.
    for (const record of readyRecords) {
      if (record.appointmentId && invoicedServiceRecordIds.has(record.id)) {
        invoicedAppointmentIds.add(record.appointmentId);
      }
    }

    const uninvoiced = readyRecords.filter(
      (record) => !invoicedServiceRecordIds.has(record.id) && !(record.appointmentId && invoicedAppointmentIds.has(record.appointmentId)),
    );

    const appointmentIds = Array.from(new Set(uninvoiced.map((record) => record.appointmentId).filter((id): id is string => !!id)));
    if (!appointmentIds.length) {
      return uninvoiced;
    }

    const billingReadyServiceIds = new Set(readyRecords.map((record) => record.serviceId).filter((id): id is string => !!id));
    const appointmentRows = await db.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), inArray(appointments.id, appointmentIds)));

    const fullyFinalizedAppointmentIds = new Set<string>();
    for (const appointment of appointmentRows) {
      const linkedServices = await this.getLinkedServicesForAppointmentTx(db as any, appointment.id, appointment.serviceId);
      // No `length > 0` guard: an appointment with nothing active left on it is
      // orphaned, not half-finished. That happens when the visit is cancelled or
      // rescheduled after a ticket was finalized - dispositionAppointment (Pass 27)
      // detaches every active linked service (appointmentId: null) - and withholding
      // the finalized ticket would strand completed, billable work with no way
      // to invoice it from the UI. Generation treats the same case as billable
      // (its unfinalized check is vacuously satisfied), so eligibility has to
      // agree or the two disagree about the same record.
      const activeServices = linkedServices.filter((service) => service.status !== "CANCELLED");
      if (activeServices.every((service) => billingReadyServiceIds.has(service.id))) {
        fullyFinalizedAppointmentIds.add(appointment.id);
      }
    }

    return uninvoiced.filter((record) => !record.appointmentId || fullyFinalizedAppointmentIds.has(record.appointmentId));
  }

  // Same eligibility rule as getServiceRecordsReadyForBilling, narrowed to a
  // date range - the shared basis for both the batch-invoicing preview and
  // the actual generate step, so a record shown in preview is guaranteed to
  // still be eligible when generate runs moments later (unless someone
  // else invoiced it in between, which generateInvoiceFromServiceRecord's
  // own idempotency check still catches).
  // The batch's slice of the ready-to-bill list: tickets whose POSTING day -
  // postedAt, falling back to serviceDate, as a UTC calendar day - lands
  // inside the window (which is why the dialog says "posted between"), and,
  // when a technician is named (Pass 13), only that technician's tickets
  // (service_records.technicianId, the ticket's own stamp).
  async getServiceRecordsReadyForBillingInRange(filters: BatchInvoiceFilters): Promise<ServiceRecord[]> {
    const eligible = await this.getServiceRecordsReadyForBilling();
    return eligible.filter((record) => {
      if (filters.technicianId && record.technicianId !== filters.technicianId) return false;
      const dateOnly = new Date(record.postedAt ?? record.serviceDate).toISOString().slice(0, 10);
      return dateOnly >= filters.dateFrom && dateOnly <= filters.dateTo;
    });
  }

  // What the batch-invoicing dialog lists, with each ticket's billing resolved
  // SERVER-SIDE through the same resolveServiceLineBillingTx that generation
  // uses. The client must not re-derive coverage from `agreementId`: that is
  // the drift isScheduleBilledPlan exists to prevent, and a preview that says
  // "covered, $0" for a COD agreement ticket that then bills a real amount is
  // exactly the bug this pass fixed on the server.
  //
  // Since Pass 13 the preview also carries the down payments the visit
  // invoices will bill (Pass 11d's INITIAL_CHARGE line, which rides the
  // agreement's first invoiced visit): per visit, the agreements behind EVERY
  // finalized ticket on it - not only the tickets inside the window or the
  // technician filter, because generation bills the whole visit - are run
  // through resolvePendingInitialChargesTx, read-only (no lock). A deposit is
  // listed once, on the first visit in the batch that would carry it, since
  // generate attaches the event to that invoice and the next visit finds it
  // live. Before this the preview's per-ticket amounts were silent about a
  // deposit that generate then billed.
  async getBatchInvoicePreviewForDateRange(filters: BatchInvoiceFilters): Promise<BatchInvoicePreview> {
    const eligible = await this.getServiceRecordsReadyForBillingInRange(filters);
    if (!eligible.length) {
      return { tickets: [], charges: [] };
    }

    // The whole visit for every listed ticket, the way batchGenerate groups it.
    const allEligible = await this.getServiceRecordsReadyForBilling();
    const listedAppointmentIds = new Set(eligible.map((record) => record.appointmentId).filter((id): id is string => !!id));
    const visitRecords = allEligible.filter((record) => record.appointmentId && listedAppointmentIds.has(record.appointmentId));
    const recordsInPlay = new Map<string, ServiceRecord>();
    for (const record of [...eligible, ...visitRecords]) {
      recordsInPlay.set(record.id, record);
    }

    const serviceIds = Array.from(recordsInPlay.values(), (record) => record.serviceId).filter((id): id is string => !!id);
    const eligibleServices = serviceIds.length
      ? await db.select().from(services).where(and(eq(services.orgId, this.orgId), inArray(services.id, serviceIds)))
      : [];
    const serviceById = new Map(eligibleServices.map((service) => [service.id, service]));
    const agreementContextById = await this.resolveAgreementBillingContextTx(
      db as any,
      eligibleServices.map((service) => service.agreementId).filter((id): id is string => !!id),
    );

    const tickets: BatchInvoicePreviewTicket[] = [];
    for (const record of eligible) {
      const service = record.serviceId ? serviceById.get(record.serviceId) : undefined;
      try {
        const billing = await this.resolveServiceLineBillingTx({
          service,
          agreementContext: service?.agreementId ? agreementContextById.get(service.agreementId) : undefined,
        });
        tickets.push({ ...record, billingLineType: billing.lineType, billableAmountCents: billing.amountCents, billingNote: billing.coverageNote });
      } catch (err: any) {
        // Preview must show the ticket that will fail, not hide it - generate
        // would report the same reason as a skip.
        tickets.push({ ...record, billingLineType: null, billableAmountCents: null, billingNote: err?.message ?? "Cannot be billed" });
      }
    }

    // Visits in the listed tickets' order - generate's order - each with its
    // finalized tickets (the whole visit, as generate bills it) and the
    // agreements behind them.
    const visits = new Map<string, { appointmentId: string | null; serviceRecordId: string | null; locationId: string | null; members: ServiceRecord[]; agreementIds: Set<string> }>();
    for (const record of eligible) {
      const key = record.appointmentId ? `appointment:${record.appointmentId}` : `serviceRecord:${record.id}`;
      if (visits.has(key)) continue;
      const members = record.appointmentId ? Array.from(recordsInPlay.values()).filter((candidate) => candidate.appointmentId === record.appointmentId) : [record];
      const agreementIds = new Set<string>();
      for (const member of members) {
        const service = member.serviceId ? serviceById.get(member.serviceId) : undefined;
        if (service?.agreementId) agreementIds.add(service.agreementId);
      }
      visits.set(key, {
        appointmentId: record.appointmentId ?? null,
        serviceRecordId: record.appointmentId ? null : record.id,
        locationId: record.locationId ?? null,
        members,
        agreementIds,
      });
    }

    const locationIds = Array.from(new Set(Array.from(visits.values(), (visit) => visit.locationId).filter((id): id is string => !!id)));
    const locationRows = locationIds.length
      ? await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), inArray(locations.id, locationIds)))
      : [];
    const accountIdByLocationId = new Map(locationRows.map((location) => [location.id, location.accountId ?? null]));

    // Pass 23 (C3.6): the service type names the surcharge descriptions carry.
    const surchargeTypeIds = Array.from(new Set(
      Array.from(recordsInPlay.values())
        .filter((record) => surchargeOf(record).surchargeCents != null)
        .map((record) => record.serviceTypeId)
        .filter((id): id is string => !!id),
    ));
    const surchargeTypeRows = surchargeTypeIds.length
      ? await db.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), inArray(serviceTypes.id, surchargeTypeIds)))
      : [];
    const serviceTypeNameById = new Map(surchargeTypeRows.map((row) => [row.id, row.name]));

    const charges: BatchInvoicePreviewCharge[] = [];
    const chargedAgreementIds = new Set<string>();
    for (const visit of Array.from(visits.values())) {
      const accountId = visit.locationId ? accountIdByLocationId.get(visit.locationId) ?? null : null;

      // Pass 23 (C3.6): each finalized ticket's field surcharge - the
      // SURCHARGE line generate appends beside its service line, taxed the
      // same way - listed on its visit, in ticket order.
      for (const member of visit.members) {
        const surcharge = surchargeOf(member);
        if (surcharge.surchargeCents == null) continue;
        const taxDecision = await this.resolveTaxDecision(db as any, {
          accountId,
          locationId: member.locationId ?? null,
          serviceTypeId: member.serviceTypeId ?? null,
          amountCents: surcharge.surchargeCents,
        });
        charges.push({
          kind: "SURCHARGE",
          appointmentId: visit.appointmentId,
          serviceRecordId: visit.serviceRecordId,
          agreementId: null,
          agreementName: null,
          ticketServiceRecordId: member.id,
          description: surchargeLineDescription(
            surcharge.surchargeLabel ?? DEFAULT_SURCHARGE_LABEL,
            serviceTypeNameById.get(member.serviceTypeId ?? "") ?? "Service",
            new Date(member.serviceDate).toLocaleDateString(),
          ),
          amountCents: surcharge.surchargeCents,
          taxCents: taxDecision.taxCents,
        });
      }

      const candidates = Array.from(visit.agreementIds)
        .filter((agreementId) => !chargedAgreementIds.has(agreementId))
        .map((agreementId) => agreementContextById.get(agreementId)?.agreement)
        .filter((agreement): agreement is Agreement => !!agreement);
      if (!candidates.length) continue;
      const pending = await this.resolvePendingInitialChargesTx(db, { agreements: candidates, accountId });
      for (const charge of pending) {
        chargedAgreementIds.add(charge.agreement.id);
        charges.push({
          kind: "INITIAL_CHARGE",
          appointmentId: visit.appointmentId,
          serviceRecordId: visit.serviceRecordId,
          agreementId: charge.agreement.id,
          agreementName: charge.agreement.agreementName,
          ticketServiceRecordId: null,
          description: charge.description,
          amountCents: charge.amountCents,
          taxCents: charge.taxDecision.taxCents,
        });
      }
    }

    return { tickets, charges };
  }

  // PLAN_BILLING_V1_1.md D6 - what the field sees about money on a visit:
  // Price / COA applied / Due today per service, BILLABLE vs PRODUCTION, and
  // the sum of due-today amounts for appointment details. Read-only.
  //
  // Two sources, never mixed. Once the visit's invoice is ISSUED its lines
  // and applications are the facts, allotted to services in invoice order so
  // the per-service figures sum to the invoice's. Before that (no invoice, or
  // a DRAFT) every service is priced through resolveServiceLineBillingTx and
  // the tax engine - the same calls generation will make - and "COA" is what
  // the location's unapplied pool could cover at invoicing, in D4's order.
  // The client renders this and derives nothing from agreementId itself; a
  // client-side guess is how a ticket says "covered" for COD agreement work.
  //
  // COA is payment application. Nothing here touches a price: priceCents is
  // the line amount, and the COA figures only reduce what is left to collect.
  //
  // Pass 19 (C3.3): `draft` is the price typed on the technician's ticket
  // and not yet posted. It reaches resolveServiceLineBillingTx as the
  // Service's priceCents and nothing else changes - the same branches (COD,
  // a plan the nightly run does not bill, a covered plan that stays $0
  // whatever is stamped) and the same tax call price it, so there is no
  // second pricing path and nothing is written. It is subject to the post's
  // rule: an agreement-generated service is re-priced only for a role that
  // may stamp it (ADJUST_PRICE_AGREEMENT), and a draft the role may not apply
  // is IGNORED, not refused - the figures preview what Post will produce, and
  // completeService ignores that price too. An issued invoice's figures are
  // the invoice's and are never re-priced. `draft` on the result says which.
  async getVisitBillingSummary(appointmentId: string, draft?: VisitBillingDraftInput | null): Promise<VisitBillingSummary | undefined> {
    const group = await this.getAppointmentBillingGroupTx(db as any, appointmentId);
    if (!group) {
      return undefined;
    }
    const { appointment, services: visitServices, records } = group;
    const recordByServiceId = new Map(records.filter((record) => record.serviceId).map((record) => [record.serviceId!, record]));
    const serviceTypeIds = Array.from(new Set(visitServices.map((service) => service.serviceTypeId).filter((id): id is string => !!id)));
    const serviceTypeRows = serviceTypeIds.length
      ? await db.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), inArray(serviceTypes.id, serviceTypeIds)))
      : [];
    const serviceTypeNameById = new Map(serviceTypeRows.map((serviceType) => [serviceType.id, serviceType.name]));
    const locationId = appointment.locationId ?? null;

    const invoice = await this.findInvoiceForVisitTx(db as any, appointment.id, records.map((record) => record.id));
    const invoiced = !!invoice && isInvoiceIssued(invoice.status);

    let draftEcho: VisitBillingDraft | null = null;
    if (draft) {
      const draftService = visitServices.find((service) => service.id === draft.serviceId);
      if (!draftService) {
        throw new VisitBillingDraftError(400, "DRAFT_SERVICE_NOT_ON_VISIT", "That service is not on this visit's billing, so its draft price cannot be priced here.");
      }
      const isAgreementGeneratedService = !!draftService.agreementId || draftService.source === "AGREEMENT_GENERATED";
      const mayReprice = !isAgreementGeneratedService || can(draft.actorRole, PERMISSIONS.ADJUST_PRICE_AGREEMENT);
      const invoicedNote = invoice && invoiced
        ? `The visit is invoiced (${invoice.invoiceNumber}): the figures are the invoice's, and a price difference is a correction on the invoice.`
        : null;
      const lockedNote = `Agreement price is locked - ${rolesWithPermission(PERMISSIONS.ADJUST_PRICE_AGREEMENT).join(" or ")} may re-price it; the stored figures stand.`;
      // Pass 23 (C3.6): the surcharge half under the post's own gate, so the
      // figures preview exactly what Post will accept or refuse.
      const surchargeRefusal = draft.surchargeCents === undefined || invoicedNote
        ? null
        : await this.resolveFieldSurchargeGateTx(db as any, { actorRole: draft.actorRole, service: draftService, adding: draft.surchargeCents > 0 });
      draftEcho = {
        serviceId: draft.serviceId,
        priceCents: draft.priceCents ?? null,
        applied: draft.priceCents !== undefined && !invoicedNote && mayReprice,
        note: draft.priceCents === undefined ? null : invoicedNote ?? (mayReprice ? null : lockedNote),
        surchargeCents: draft.surchargeCents ?? null,
        surchargeApplied: draft.surchargeCents !== undefined && !invoicedNote && !surchargeRefusal,
        surchargeNote: draft.surchargeCents === undefined ? null : invoicedNote ?? surchargeRefusal?.message ?? null,
      };
    }

    const baseLine = (service: Service): Pick<VisitServiceBilling, "serviceId" | "serviceRecordId" | "serviceTypeName" | "agreementId"> => ({
      serviceId: service.id,
      serviceRecordId: recordByServiceId.get(service.id)?.id ?? null,
      serviceTypeName: serviceTypeNameById.get(service.serviceTypeId ?? "") ?? "Service",
      agreementId: service.agreementId ?? null,
    });
    const unresolved = (service: Service, note: string): VisitServiceBilling => ({
      ...baseLine(service),
      designation: "BILLABLE",
      priceCents: null,
      taxCents: 0,
      coaAppliedCents: 0,
      coaAvailableCents: 0,
      dueTodayCents: null,
      note,
    });

    const lines: VisitServiceBilling[] = [];
    const charges: VisitChargeBilling[] = [];
    let coaPendingCents = 0;

    if (invoice && invoiced) {
      const lineItems = await db
        .select()
        .from(invoiceLineItems)
        .where(and(eq(invoiceLineItems.orgId, this.orgId), eq(invoiceLineItems.invoiceId, invoice.id)))
        .orderBy(asc(invoiceLineItems.sortOrder));
      const sums = await this.sumInvoiceApplicationsTx(db as unknown as DbTransaction, invoice.id);
      coaPendingCents = sums.pendingCents;

      // Applications are against the invoice, not a line. Allot them in line
      // order across EVERY line (so the sum still equals the invoice's) and
      // then read each service's line; a pending payment counts here because
      // a check the office has not cleared is still not money to collect twice.
      let remainingAppliedCents = sums.allCents;
      const appliedByLineId = new Map<string, number>();
      for (const line of lineItems) {
        const grossCents = line.amountCents + line.taxCents;
        const take = Math.max(Math.min(grossCents, remainingAppliedCents), 0);
        appliedByLineId.set(line.id, take);
        remainingAppliedCents -= take;
      }

      for (const service of visitServices) {
        const record = recordByServiceId.get(service.id);
        // The service's own line - a SURCHARGE line carries the same ids and
        // is paired below.
        const line = lineItems.find((item) => item.lineType !== "SURCHARGE" && item.serviceId === service.id)
          ?? (record ? lineItems.find((item) => item.lineType !== "SURCHARGE" && item.serviceRecordId === record.id) : undefined);
        if (!line) {
          // A service that joined the visit after it was invoiced (its ticket
          // is FLAGGED_FOR_REVIEW, Pass 4). Its price is unknown here, not $0.
          lines.push(unresolved(service, `Not on invoice ${invoice.invoiceNumber} - flagged for office review`));
          continue;
        }
        const appliedCents = appliedByLineId.get(line.id) ?? 0;
        const noteMatch = /\(([^()]*)\)\s*$/.exec(line.description);
        lines.push({
          ...baseLine(service),
          designation: line.lineType === "AGREEMENT_COVERED" ? "PRODUCTION" : "BILLABLE",
          priceCents: line.amountCents,
          taxCents: line.taxCents,
          coaAppliedCents: appliedCents,
          coaAvailableCents: 0,
          dueTodayCents: Math.max(line.amountCents + line.taxCents - appliedCents, 0),
          note: noteMatch?.[1] ?? null,
        });
      }

      // Pass 23 (C3.6): each ticket's SURCHARGE line, paired with its service
      // by the ids the line carries, in line order.
      for (const line of lineItems.filter((item) => item.lineType === "SURCHARGE")) {
        const service = visitServices.find((candidate) => candidate.id === line.serviceId)
          ?? visitServices.find((candidate) => !!line.serviceRecordId && recordByServiceId.get(candidate.id)?.id === line.serviceRecordId);
        const record = line.serviceRecordId ? records.find((candidate) => candidate.id === line.serviceRecordId) : undefined;
        const appliedCents = appliedByLineId.get(line.id) ?? 0;
        charges.push({
          kind: "SURCHARGE",
          serviceId: service?.id ?? line.serviceId ?? "",
          serviceRecordId: line.serviceRecordId ?? null,
          serviceTypeName: service ? baseLine(service).serviceTypeName : "Service",
          label: surchargeOf(record).surchargeLabel ?? line.description.split(" - ")[0],
          description: line.description,
          collectedBy: null,
          priceCents: line.amountCents,
          taxCents: line.taxCents,
          coaAppliedCents: appliedCents,
          coaAvailableCents: 0,
          dueTodayCents: Math.max(line.amountCents + line.taxCents - appliedCents, 0),
        });
      }

      // The down payment that rode this invoice (Pass 11d): its INITIAL_CHARGE
      // line, paired with its agreement through the INITIAL_CHARGE event the
      // issuing path attached, so the field can say whose deposit it is and
      // who may collect it. Lines and events are both in insertion order.
      const chargeLines = lineItems.filter((line) => line.lineType === "INITIAL_CHARGE");
      if (chargeLines.length) {
        const chargeEvents = await db
          .select()
          .from(billingEvents)
          .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.invoiceId, invoice.id), eq(billingEvents.source, "INITIAL_CHARGE")))
          .orderBy(asc(billingEvents.createdAt));
        const chargeAgreementIds = chargeEvents.map((event) => event.agreementId);
        const chargeAgreements = chargeAgreementIds.length
          ? await db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), inArray(agreements.id, chargeAgreementIds)))
          : [];
        const chargeAgreementById = new Map(chargeAgreements.map((agreement) => [agreement.id, agreement]));
        chargeLines.forEach((line, index) => {
          const event = chargeEvents[index];
          const agreement = event ? chargeAgreementById.get(event.agreementId) : undefined;
          const appliedCents = appliedByLineId.get(line.id) ?? 0;
          charges.push({
            kind: "INITIAL_CHARGE",
            agreementId: agreement?.id ?? event?.agreementId ?? "",
            agreementName: agreement?.agreementName ?? line.description.replace(/^[^-]*-\s*/, ""),
            description: line.description,
            collectedBy: agreement?.initialChargeCollectedBy ?? null,
            priceCents: line.amountCents,
            taxCents: line.taxCents,
            coaAppliedCents: appliedCents,
            coaAvailableCents: 0,
            dueTodayCents: Math.max(line.amountCents + line.taxCents - appliedCents, 0),
          });
        });
      }
    } else {
      const agreementIds = visitServices.map((service) => service.agreementId).filter((id): id is string => !!id);
      const agreementContextById = await this.resolveAgreementBillingContextTx(db as any, agreementIds);
      const [location] = locationId
        ? await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)))
        : [undefined];
      const accountId = location?.accountId ?? null;

      for (const service of visitServices) {
        const record = recordByServiceId.get(service.id);
        // The draft price (Pass 19) is the Service's price for this pricing
        // and nothing more; the resolver decides what it means.
        const pricedService = draftEcho?.applied && service.id === draftEcho.serviceId
          ? { ...service, priceCents: draftEcho.priceCents }
          : service;
        try {
          const billing = await this.resolveServiceLineBillingTx({
            service: pricedService,
            agreementContext: service.agreementId ? agreementContextById.get(service.agreementId) : undefined,
          });
          const taxCents = billing.lineType === "AGREEMENT_COVERED"
            ? 0
            : (await this.resolveTaxDecision(db as any, {
              accountId,
              locationId: record?.locationId ?? service.locationId ?? locationId,
              serviceTypeId: record?.serviceTypeId ?? service.serviceTypeId ?? null,
              amountCents: billing.amountCents,
            })).taxCents;
          lines.push({
            ...baseLine(service),
            designation: billing.lineType === "AGREEMENT_COVERED" ? "PRODUCTION" : "BILLABLE",
            priceCents: billing.amountCents,
            taxCents,
            coaAppliedCents: 0,
            coaAvailableCents: 0,
            dueTodayCents: billing.amountCents + taxCents,
            note: billing.coverageNote,
          });
        } catch (err: any) {
          // Show the service that generation will refuse, with its reason,
          // rather than a $0 the technician would read as "nothing to collect".
          lines.push(unresolved(service, err?.message ?? "Cannot be billed"));
        }

        // Pass 23 (C3.6): the ticket's field surcharge - the dialog's unposted
        // one when the draft carries it and the gate allows (0 previews its
        // removal), else the record's - priced as the SURCHARGE line the
        // invoice will carry, taxed as the service line is, BILLABLE even when
        // the service itself is covered. Independent of the service line: a
        // service that cannot be priced can still carry one.
        const draftSurcharge = draftEcho?.surchargeApplied && service.id === draftEcho.serviceId ? draftEcho.surchargeCents : null;
        const storedSurcharge = surchargeOf(record);
        const surchargeCents = draftSurcharge ?? storedSurcharge.surchargeCents;
        if (surchargeCents != null && surchargeCents > 0) {
          const label = storedSurcharge.surchargeLabel ?? DEFAULT_SURCHARGE_LABEL;
          const serviceTypeName = baseLine(service).serviceTypeName;
          const serviceDate = record ? new Date(record.serviceDate) : new Date(appointment.scheduledDate);
          const surchargeTax = (await this.resolveTaxDecision(db as any, {
            accountId,
            locationId: record?.locationId ?? service.locationId ?? locationId,
            serviceTypeId: record?.serviceTypeId ?? service.serviceTypeId ?? null,
            amountCents: surchargeCents,
          })).taxCents;
          charges.push({
            kind: "SURCHARGE",
            serviceId: service.id,
            serviceRecordId: record?.id ?? null,
            serviceTypeName,
            label,
            description: surchargeLineDescription(label, serviceTypeName, serviceDate.toLocaleDateString()),
            collectedBy: null,
            priceCents: surchargeCents,
            taxCents: surchargeTax,
            coaAppliedCents: 0,
            coaAvailableCents: 0,
            dueTodayCents: surchargeCents + surchargeTax,
          });
        }
      }

      // A draft handed to the resolver on a covered visit stays $0 (the
      // resolver's rule, as at Post): say so rather than let "applied" read
      // as "billed".
      if (draftEcho?.applied) {
        const draftLine = lines.find((line) => line.serviceId === draftEcho?.serviceId);
        if (draftLine?.designation === "PRODUCTION") {
          draftEcho = { ...draftEcho, note: "Covered by agreement: the price is recorded at Post, but this visit bills $0 for the service." };
        }
      }

      // The down payment this visit's invoice will carry (Pass 11d): the same
      // resolver generation reads, so the figures here are what the invoice
      // will say. After the service lines, as the invoice orders them.
      for (const pending of await this.resolvePendingInitialChargesTx(db, {
        agreements: Array.from(agreementContextById.values(), (context) => context.agreement),
        accountId,
      })) {
        charges.push({
          kind: "INITIAL_CHARGE",
          agreementId: pending.agreement.id,
          agreementName: pending.agreement.agreementName,
          description: pending.description,
          collectedBy: pending.agreement.initialChargeCollectedBy ?? null,
          priceCents: pending.amountCents,
          taxCents: pending.taxDecision.taxCents,
          coaAppliedCents: 0,
          coaAvailableCents: 0,
          dueTodayCents: pending.amountCents + pending.taxDecision.taxCents,
        });
      }

      // What the location already holds that this visit could draw on when it
      // is invoiced - D4's order, D4's eligibility (money designated to another
      // agreement is never offered), capped at what the visit would owe. The
      // services draw first, then the down payment: invoice line order.
      if (locationId) {
        const { eligible } = await this.orderSourcesForAgreementsTx(db, locationId, new Set(agreementIds), appointment.id);
        let poolCents = eligible.reduce((sum, source) => sum + source.unappliedCents, 0);
        for (const line of [...lines, ...charges]) {
          if (line.priceCents == null || poolCents <= 0) continue;
          const grossCents = line.priceCents + line.taxCents;
          const take = Math.min(grossCents, poolCents);
          line.coaAvailableCents = take;
          line.dueTodayCents = grossCents - take;
          poolCents -= take;
        }
      }
    }

    const totals = [...lines, ...charges].reduce(
      (acc, line) => ({
        priceCents: acc.priceCents + (line.priceCents ?? 0),
        taxCents: acc.taxCents + line.taxCents,
        coaAppliedCents: acc.coaAppliedCents + line.coaAppliedCents,
        coaPendingCents,
        coaAvailableCents: acc.coaAvailableCents + line.coaAvailableCents,
        dueTodayCents: acc.dueTodayCents + (line.dueTodayCents ?? 0),
        unresolvedCount: acc.unresolvedCount + (line.priceCents == null ? 1 : 0),
      }),
      { priceCents: 0, taxCents: 0, coaAppliedCents: 0, coaPendingCents, coaAvailableCents: 0, dueTodayCents: 0, unresolvedCount: 0 },
    );

    return {
      appointmentId: appointment.id,
      locationId,
      invoice: invoice
        ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalAmountCents: invoice.totalAmountCents,
          amountPaidCents: invoice.amountPaidCents,
          balanceDueCents: invoice.balanceDueCents,
        }
        : null,
      invoiced,
      draft: draftEcho,
      services: lines,
      charges,
      totals,
    };
  }

  // Idempotent by construction (PLAN_BILLING_V1.md §1.6.1): reuses
  // generateInvoiceFromServiceRecord's own pre-check + unique-index catch
  // for every anchor, so running this twice over the same date range
  // produces zero duplicate invoices - the second run simply finds nothing
  // left in getServiceRecordsReadyForBillingInRange to generate. One
  // visit's failure doesn't abort the batch; it's collected in `skipped`
  // with the reason so the office can see exactly what needs attention.
  // The technician filter (Pass 13) picks which VISITS are in the batch -
  // those with a ticket of that technician's posted in the window; a visit,
  // once in, bills every finalized ticket on it, whoever posted them, exactly
  // as the range boundary below is handled.
  async batchGenerateInvoicesForDateRange(filters: BatchInvoiceFilters, actor?: AuditActor | null): Promise<BatchGenerateResult> {
    const eligible = await this.getServiceRecordsReadyForBillingInRange(filters);

    // Group by billing anchor before looping (§2.3). Idempotency would stop the
    // second call for a shared appointment from duplicating anything, but it
    // would still be a wasted round-trip reported as a skip, and "1 invoiced,
    // 1 skipped" reads like a failure for what is one clean visit invoice.
    // Grouped from the FULL eligible set, not just the in-range slice: a visit
    // straddling the range boundary (two tickets posted either side of
    // midnight) is still one appointment, and generation bills every finalized
    // ticket on it regardless of the range. Grouping only the in-range records
    // would promise the office one ticket and hand them an invoice covering
    // two.
    const allEligible = await this.getServiceRecordsReadyForBilling();
    const eligibleByAppointmentId = new Map<string, ServiceRecord[]>();
    for (const record of allEligible) {
      if (!record.appointmentId) continue;
      const siblings = eligibleByAppointmentId.get(record.appointmentId) ?? [];
      siblings.push(record);
      eligibleByAppointmentId.set(record.appointmentId, siblings);
    }

    const groups = new Map<string, { appointmentId: string | null; records: ServiceRecord[] }>();
    for (const record of eligible) {
      const key = record.appointmentId ? `appointment:${record.appointmentId}` : `serviceRecord:${record.id}`;
      if (groups.has(key)) continue;
      groups.set(key, {
        appointmentId: record.appointmentId ?? null,
        records: record.appointmentId ? eligibleByAppointmentId.get(record.appointmentId) ?? [record] : [record],
      });
    }

    // Counted from the groups, so it matches what actually gets invoiced when a
    // visit reaches past the range boundary rather than under-reporting it.
    const totalEligible = Array.from(groups.values()).reduce((sum, group) => sum + group.records.length, 0);
    const result: BatchGenerateResult = { totalEligible, totalVisits: groups.size, invoiced: [], skipped: [], totalAmountCents: 0 };

    for (const group of Array.from(groups.values())) {
      const serviceRecordIds = group.records.map((record) => record.id);
      try {
        const invoice = await this.generateInvoiceFromServiceRecord(group.records[0].id, actor);
        result.invoiced.push({
          appointmentId: group.appointmentId,
          serviceRecordIds,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmountCents: invoice.totalAmountCents,
        });
        result.totalAmountCents += invoice.totalAmountCents;
      } catch (err: any) {
        result.skipped.push({ appointmentId: group.appointmentId, serviceRecordIds, reason: err?.message ?? "Unknown error" });
      }
    }

    return result;
  }

  // "Send" stamps sentAt - there is no delivery mechanism yet (the office
  // opens or downloads the PDF and delivers it itself). What it does do,
  // since Pass 10, is pin the document: the stored PDF is created here if
  // no request has rendered it yet, so "what you sent is what you can always
  // re-produce" (PLAN_BILLING_V1.md §1.7) holds from the moment the invoice
  // is marked sent rather than from whenever someone first opens it. Already
  // sent (sentAt set) stays as it was; the stamp is never moved.
  async batchSendInvoices(invoiceIds: string[]): Promise<Invoice[]> {
    const sent: Invoice[] = [];
    for (const id of invoiceIds) {
      const [invoice] = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
      // A DRAFT is not a bill yet (D3); sending one would tell the customer
      // they owe a number that issue may still change.
      if (!invoice || !isInvoiceIssued(invoice.status)) {
        continue;
      }

      // Before the stamp, so a render failure leaves the invoice unsent
      // rather than sent with nothing to reproduce.
      await this.getOrCreateInvoiceDocument(invoice.id);

      const [updated] = await db
        .update(invoices)
        .set({ sentAt: invoice.sentAt ?? new Date() })
        .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)))
        .returning();
      if (updated) {
        sent.push(updated);
      }
    }

    return sent;
  }

  // Atomic per-org counter: the first call for an org takes the plain
  // insert path (nextNumber = 1); every call after that hits the conflict
  // and increments in the same statement. No separate SELECT ... FOR UPDATE
  // needed - the upsert itself is the lock.
  private async getNextInvoiceNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
    const [counter] = await tx
      .insert(invoiceCounters)
      .values({ orgId: this.orgId, nextNumber: 1 })
      .onConflictDoUpdate({
        target: invoiceCounters.orgId,
        set: { nextNumber: sql`${invoiceCounters.nextNumber} + 1` },
      })
      .returning();

    return `INV-${String(counter.nextNumber).padStart(6, "0")}`;
  }

  // Preserves the existing manual/ad-hoc invoice path (not tied to a
  // Service Record) as an ADJUSTMENT line item, per PLAN_BILLING_V1.md
  // §1.3's line-type taxonomy. Issued directly (no DRAFT), so it is an
  // "invoice issue" in D7's sense and writes invoice_issued like the other
  // issuing paths - it was the one that did not until Pass 10.
  async createManualInvoice(input: CreateManualInvoiceInput): Promise<Invoice> {
    if (!input.locationId) {
      throw new Error("A manual invoice must be billed to a location");
    }

    return db.transaction(async (tx) => {
      // The location is the customer record (canon rule 1), so the invoice
      // must land on one of this customer's locations - never on another
      // customer's, and never on none.
      const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      if (!location) {
        throw new Error("Location not found");
      }
      if (location.customerId !== input.customerId) {
        throw new Error("The location belongs to a different customer");
      }

      const taxCents = input.taxCents ?? 0;
      const totalAmountCents = input.amountCents + taxCents;
      const invoiceNumber = await this.getNextInvoiceNumber(tx);
      // The parties and profile terms are frozen here like on every other
      // issuing path (Pass 11c). The office may type its own due date; left
      // blank, the location's billing terms decide it (Pass 13, the default
      // Pass 11c left for C2.3), and no resolved terms means no due date.
      // The tax entry stays the office's own, below.
      const terms = await this.resolveInvoiceTermsForLocationTx(tx, location.id);

      const [invoice] = await tx
        .insert(invoices)
        .values({
          orgId: this.orgId,
          customerId: input.customerId,
          locationId: location.id,
          serviceRecordId: null,
          invoiceNumber,
          billingProfileSnapshot: terms.billingProfileSnapshot,
          // The manual/ad-hoc path keeps its direct tax entry rather than
          // running the tax engine: it has a location now, but no service
          // type for a tax rule to key off, and the office types the tax it
          // means to charge. Snapshotted as "manual" so it's still visible
          // in the invoice's tax history, just not engine-derived.
          taxSnapshot: { taxable: taxCents > 0, reason: "MANUAL", taxCents, snapshottedAt: new Date().toISOString() },
          amountCents: input.amountCents,
          taxCents,
          totalAmountCents,
          status: deriveInvoiceStatus({ totalAmountCents }),
          balanceDueCents: totalAmountCents,
          issuedAt: new Date(),
          dueDate: input.dueDate ?? terms.dueDate ?? null,
          notes: input.notes?.trim() || null,
        })
        .returning();

      await tx.insert(invoiceLineItems).values({
        orgId: this.orgId,
        invoiceId: invoice.id,
        lineType: "ADJUSTMENT",
        description: input.description?.trim() || "Manual adjustment",
        quantity: 1,
        unitPriceCents: input.amountCents,
        amountCents: input.amountCents,
        taxable: taxCents > 0,
        taxCents,
        sortOrder: 0,
      });

      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: invoice.id,
        action: "invoice_issued",
        actor: input.actor,
        before: null,
        after: invoice,
      });

      return invoice;
    });
  }

  // Decision order per PLAN_BILLING_V1.md §1.5: exemption certificate ->
  // tax rule (service type x location type, most specific wins) -> tax
  // rate -> snapshot everything onto the invoice. Never recomputed once
  // snapshotted (see the tax_snapshot column comment in shared/schema.ts).
  // No rule match defaults to taxable=true (safer against under-collecting
  // than silently exempting); no active rate on a taxable line snapshots
  // taxable=true with $0 tax rather than guessing a rate, so a missing
  // Settings configuration is visible instead of silently wrong.
  private async resolveTaxDecision(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    input: { accountId: string | null; locationId: string | null; serviceTypeId: string | null; amountCents: number },
  ): Promise<{ taxable: boolean; taxCents: number; snapshot: Record<string, unknown> }> {
    const today = new Date().toISOString().slice(0, 10);

    if (input.accountId) {
      const certificates = await tx.select().from(taxExemptionCertificates).where(and(eq(taxExemptionCertificates.orgId, this.orgId), eq(taxExemptionCertificates.accountId, input.accountId)));
      const activeCertificate = certificates.find((cert) => !cert.expiresAt || cert.expiresAt >= today);
      if (activeCertificate) {
        return {
          taxable: false,
          taxCents: 0,
          snapshot: {
            taxable: false,
            reason: "EXEMPTION_CERTIFICATE",
            certificateId: activeCertificate.id,
            certificateNumber: activeCertificate.certificateNumber,
            snapshottedAt: new Date().toISOString(),
          },
        };
      }
    }

    let locationType: string | null = null;
    if (input.locationId) {
      const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      locationType = location?.propertyType ?? null;
    }

    const rules = await tx.select().from(taxRules).where(and(eq(taxRules.orgId, this.orgId), eq(taxRules.isActive, true)));
    const matchedRule =
      rules.find((r) => r.serviceTypeId && r.serviceTypeId === input.serviceTypeId && r.locationType && r.locationType === locationType) ??
      rules.find((r) => r.serviceTypeId && r.serviceTypeId === input.serviceTypeId && !r.locationType) ??
      rules.find((r) => !r.serviceTypeId && r.locationType && r.locationType === locationType) ??
      rules.find((r) => !r.serviceTypeId && !r.locationType);

    const taxable = matchedRule ? matchedRule.taxable : true;
    if (!taxable) {
      return {
        taxable: false,
        taxCents: 0,
        snapshot: {
          taxable: false,
          reason: "TAX_RULE",
          ruleId: matchedRule!.id,
          snapshottedAt: new Date().toISOString(),
        },
      };
    }

    const rates = await tx.select().from(taxRates).where(and(eq(taxRates.orgId, this.orgId), eq(taxRates.isActive, true)));
    const activeRates = rates.filter((r) => r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today));
    const applicableRate = activeRates.find((r) => r.isDefault) ?? activeRates[0];

    if (!applicableRate) {
      return {
        taxable: true,
        taxCents: 0,
        snapshot: { taxable: true, reason: "NO_ACTIVE_RATE", ruleId: matchedRule?.id ?? null, snapshottedAt: new Date().toISOString() },
      };
    }

    const taxCents = Math.round((input.amountCents * applicableRate.rateBasisPoints) / 10000);
    return {
      taxable: true,
      taxCents,
      snapshot: {
        taxable: true,
        reason: matchedRule ? "TAX_RULE" : "DEFAULT",
        ruleId: matchedRule?.id ?? null,
        rateId: applicableRate.id,
        rateName: applicableRate.name,
        jurisdiction: applicableRate.jurisdiction,
        rateBasisPoints: applicableRate.rateBasisPoints,
        snapshottedAt: new Date().toISOString(),
      },
    };
  }

  async getTaxRates(includeInactive = false): Promise<TaxRate[]> {
    if (includeInactive) {
      return db.select().from(taxRates).where(eq(taxRates.orgId, this.orgId)).orderBy(asc(taxRates.name));
    }
    return db.select().from(taxRates).where(and(eq(taxRates.orgId, this.orgId), eq(taxRates.isActive, true))).orderBy(asc(taxRates.name));
  }

  async createTaxRate(data: InsertTaxRate): Promise<TaxRate> {
    const [rate] = await db.insert(taxRates).values({ ...data, orgId: this.orgId }).returning();
    return rate;
  }

  async updateTaxRate(id: string, data: Partial<InsertTaxRate>): Promise<TaxRate | undefined> {
    const [rate] = await db
      .update(taxRates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(taxRates.orgId, this.orgId), eq(taxRates.id, id)))
      .returning();
    return rate;
  }

  async getTaxRules(includeInactive = false): Promise<TaxRule[]> {
    if (includeInactive) {
      return db.select().from(taxRules).where(eq(taxRules.orgId, this.orgId));
    }
    return db.select().from(taxRules).where(and(eq(taxRules.orgId, this.orgId), eq(taxRules.isActive, true)));
  }

  async createTaxRule(data: InsertTaxRule): Promise<TaxRule> {
    const [rule] = await db.insert(taxRules).values({ ...data, orgId: this.orgId }).returning();
    return rule;
  }

  async updateTaxRule(id: string, data: Partial<InsertTaxRule>): Promise<TaxRule | undefined> {
    const [rule] = await db
      .update(taxRules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(taxRules.orgId, this.orgId), eq(taxRules.id, id)))
      .returning();
    return rule;
  }

  async getTaxExemptionCertificates(accountId: string): Promise<TaxExemptionCertificate[]> {
    return db.select().from(taxExemptionCertificates).where(and(eq(taxExemptionCertificates.orgId, this.orgId), eq(taxExemptionCertificates.accountId, accountId)));
  }

  async createTaxExemptionCertificate(data: InsertTaxExemptionCertificate): Promise<TaxExemptionCertificate> {
    const [certificate] = await db.insert(taxExemptionCertificates).values({ ...data, orgId: this.orgId }).returning();
    return certificate;
  }

  // Every non-cancelled Service on the appointment, paired with its finalized
  // Service Record. The appointment->services half reuses
  // getLinkedServicesForAppointmentTx (canon rule 10: one resolver, no parallel
  // join) so the visit rollup here agrees exactly with the one
  // finalizeServiceRecord uses to decide an appointment is complete.
  private async getAppointmentBillingGroupTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    appointmentId: string,
  ): Promise<{ appointment: Appointment; services: Service[]; records: ServiceRecord[] } | null> {
    const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)));
    if (!appointment) {
      return null;
    }

    const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId);
    const activeServices = linkedServices.filter((service) => service.status !== "CANCELLED");
    const serviceIds = activeServices.map((service) => service.id);
    const records = serviceIds.length
      ? await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), inArray(serviceRecords.serviceId, serviceIds)))
      : [];

    return { appointment, services: activeServices, records };
  }

  // Each agreement behind a visit's services, paired with its live Billing
  // Plan. Deliberately the LIVE plan row rather than agreement.billingPlanSnapshot:
  // the nightly run reads the live plan too (server/jobs/billing-run.ts), and if
  // these two read different sources, editing a plan in Settings would silently
  // desync what the run charges from what the visit invoice zeroes out.
  private async resolveAgreementBillingContextTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    agreementIds: string[],
  ): Promise<Map<string, { agreement: Agreement; plan: BillingPlan | undefined }>> {
    const uniqueIds = Array.from(new Set(agreementIds));
    if (!uniqueIds.length) {
      return new Map();
    }

    const agreementRows = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), inArray(agreements.id, uniqueIds)));
    const planIds = agreementRows.map((agreement) => agreement.billingPlanId).filter((id): id is string => !!id);
    const planRows = planIds.length
      ? await tx.select().from(billingPlans).where(and(eq(billingPlans.orgId, this.orgId), inArray(billingPlans.id, Array.from(new Set(planIds)))))
      : [];
    const planById = new Map(planRows.map((plan) => [plan.id, plan]));

    return new Map(
      agreementRows.map((agreement) => [
        agreement.id,
        { agreement, plan: agreement.billingPlanId ? planById.get(agreement.billingPlanId) : undefined },
      ]),
    );
  }

  // What one finalized Service Record contributes to its visit invoice.
  //
  // The rule is a single question: does the nightly run bill this agreement's
  // plan (isScheduleBilledPlan)? If yes, the customer already pays on the plan's
  // cadence and the visit line is $0. If no - COD, per-service, charge-at-start,
  // installment, or no plan at all - the VISIT is the billing event and the line
  // must carry a real amount. Getting this wrong in the permissive direction is
  // how work gets silently performed for free, so the fallbacks below only ever
  // reach $0 by an explicit decision, never by absence of data.
  //
  // Callbacks (Pass 24, PLAN_ROADMAP_V2.md C3.7; canon §10): a CALLBACK is
  // what the Service's work kind SAYS it is, read here before any plan is
  // consulted - the same kind the production ledger credits from, so billable
  // and production always agree on what a callback is while staying free to
  // diverge on amounts (D6: production is technician credit, billable is what
  // the customer owes). No price means warranty work at no charge - an
  // AGREEMENT_COVERED "warranty callback - no charge" line on every plan,
  // schedule-billed or not, agreement or not (a warranty return on a
  // one-time job is a callback too): the more specific truth than "covered
  // by agreement", and what the batch preview's CALLBACK kind and the
  // ticket's note read. A price means the office decided to charge for this
  // callback (non-compliance), and that bills as a SERVICE "callback" line on
  // every plan - it is not one of the plan's paid visits. Reading the kind
  // rather than a production entry is also what lets a DRAFT (D3) price a
  // callback $0 before its ticket exists; before this pass the DRAFT showed
  // the contracted amount and only issue corrected it.
  private async resolveServiceLineBillingTx(
    input: {
      service: Service | undefined;
      agreementContext: { agreement: Agreement; plan: BillingPlan | undefined } | undefined;
    },
  ): Promise<{ lineType: "SERVICE" | "AGREEMENT_COVERED"; amountCents: number; coverageNote: string | null }> {
    const { service, agreementContext } = input;

    if (isCallbackKind(service?.workKind)) {
      const callbackPriceCents = service?.priceCents ?? null;
      return callbackPriceCents != null && callbackPriceCents > 0
        ? { lineType: "SERVICE", amountCents: callbackPriceCents, coverageNote: "callback" }
        : { lineType: "AGREEMENT_COVERED", amountCents: 0, coverageNote: "warranty callback - no charge" };
    }

    if (!agreementContext) {
      // Non-agreement / COD work: the service's own price is the only source.
      const priceCents = service?.priceCents ?? null;
      if (priceCents == null) {
        throw new Error("Service has no price set; cannot generate an invoice");
      }
      return { lineType: "SERVICE", amountCents: priceCents, coverageNote: null };
    }

    if (isScheduleBilledPlan(agreementContext.plan)) {
      // Visible as work performed, never chargeable, never a billing_events row.
      // A price stamped on the service is deliberately ignored here rather than
      // charged - the customer is already paying for this visit on the plan's
      // schedule, so honoring it would bill them twice. Extra work on a covered
      // visit belongs on an ADDON line, which Phase 1 does not build.
      return { lineType: "AGREEMENT_COVERED", amountCents: 0, coverageNote: "covered by agreement" };
    }

    const priceCents = service?.priceCents ?? null;

    // A contracted visit on a plan the nightly run does not bill. The per-visit
    // price is the contract price spread across the agreement's snapshotted
    // expected service count - the same arithmetic production value uses, but
    // resolved here as a BILLABLE amount in its own right so the two can be
    // changed independently later. "Contract price" here is what REMAINS
    // after the initial charge (D4 owner review: a down payment counts toward
    // the price, so $400 with $100 down bills $300 across the visits).
    // Production value is untouched by this - it still derives from the full
    // price, because the technician's work is the same whatever was collected.
    const billableCents = priceCents ?? computeProductionValueCents(
      resolveRemainingContractPriceCents(agreementContext.agreement, agreementContext.agreement.priceCents),
      agreementContext.agreement.expectedServiceCount,
    );
    if (billableCents == null) {
      // Name the actual missing piece. A plan-less agreement and an agreement on
      // a plan the nightly run skips (INSTALLMENT, ON_AGREEMENT_START) both land
      // here, and telling an operator "no billing plan" when one is plainly set
      // sends them to the wrong screen.
      throw new Error(
        agreementContext.plan
          ? `Agreement is on the "${agreementContext.plan.name}" billing plan, which is not billed by the nightly run, and has no price to bill per visit; set the agreement's price or the service's price before invoicing`
          : "Agreement has no billing plan and no price to bill per visit; set the agreement's billing plan or price before invoicing",
      );
    }

    return { lineType: "SERVICE", amountCents: billableCents, coverageNote: null };
  }

  // D1: the customer experienced one visit, so the invoice anchors on the
  // APPOINTMENT and carries one line per finalized Service Record on it. Work
  // with no appointment (direct one-offs) keeps the old per-service-record
  // anchor as a fallback; an invoice sets exactly one of the two, never both.
  //
  // Agreement-generated services are no longer rejected outright. Whether one
  // is chargeable is decided per line by resolveServiceLineBillingTx, keyed on
  // the single question of whether the nightly run bills that agreement's plan.
  // Schedule-billed work becomes a $0, non-taxable AGREEMENT_COVERED line -
  // visible to the customer as work performed, structurally incapable of being
  // charged, and never written to billing_events, so the nightly run
  // (server/jobs/billing-run.ts) stays the one and only source of agreement
  // revenue (§2.1). Everything else - COD, per-service, no plan - is billed
  // here, because for those plans the visit IS the billing event.
  //
  // Idempotent: a double-click or re-run against any ticket on the visit
  // returns the existing invoice instead of erroring or duplicating, via a
  // pre-check on both anchors plus a catch on the partial unique index in case
  // of a genuine race.
  async generateInvoiceFromServiceRecord(serviceRecordId: string, actor?: AuditActor | null): Promise<Invoice> {
    try {
      return await this.generateInvoiceFromServiceRecordTx(serviceRecordId, actor);
    } catch (err: any) {
      // Race recovery, deliberately OUT here rather than inside the
      // transaction: a unique-index violation aborts the whole transaction in
      // Postgres, so any statement after it fails 25P02 and a recovery lookup
      // in that block could never return the winner. By this point the failed
      // transaction has rolled back, so a fresh read succeeds.
      if (err?.code === "23505") {
        const raceWinner = await this.findExistingInvoiceForVisit(serviceRecordId);
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  // Whichever anchor already carries a non-void invoice for this ticket's
  // visit - the same two-anchor lookup generation does as its pre-check, run on
  // a fresh connection so it is usable after a rolled-back attempt.
  private async findExistingInvoiceForVisit(serviceRecordId: string): Promise<Invoice | undefined> {
    const [record] = await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, serviceRecordId)));
    if (!record) {
      return undefined;
    }

    const group = record.appointmentId ? await this.getAppointmentBillingGroupTx(db as any, record.appointmentId) : null;
    const recordIds = Array.from(new Set([record.id, ...(group?.records ?? []).map((linkedRecord) => linkedRecord.id)]));
    return this.findInvoiceForVisitTx(db as any, record.appointmentId ?? null, recordIds);
  }

  // Whichever anchor already carries a non-void invoice for a visit: the
  // appointment first, then any of the visit's tickets (the pre-D1 shape, whose
  // rows were never re-anchored - see the index comment in invoice-bootstrap.ts).
  // A DRAFT counts: it holds the anchor so that generation adopts it rather
  // than issuing a second invoice beside it (D2/D3). Callers that mean "is this
  // visit billed" must additionally check isInvoiceIssued().
  private async findInvoiceForVisitTx(tx: DbTransaction, appointmentId: string | null, serviceRecordIds: string[]): Promise<Invoice | undefined> {
    if (appointmentId) {
      const [byAppointment] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.orgId, this.orgId), eq(invoices.appointmentId, appointmentId), ne(invoices.status, "VOID")));
      if (byAppointment) {
        return byAppointment;
      }
    }

    if (!serviceRecordIds.length) {
      return undefined;
    }

    const [byServiceRecord] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, this.orgId), inArray(invoices.serviceRecordId, serviceRecordIds), ne(invoices.status, "VOID")));
    return byServiceRecord;
  }

  // The customer identity for a location (canon rule 3: the primary location
  // is the customer identity), the way the customer-detail compat read finds
  // it: the account's primaryLocationId, else the account's isPrimary row,
  // else - for a location still without an account (transitional nullable
  // accountId) - the customer's isPrimary row. Falls back to the location
  // itself when no primary exists, so a caller always has a party to bill;
  // ensurePrimaryLocationInvariant keeps that fallback from being reached
  // for any account that has locations.
  private async getPrimaryLocationTx(reader: DbReader, location: Location): Promise<Location> {
    if (location.accountId) {
      const [account] = await reader.select().from(accounts).where(and(eq(accounts.orgId, this.orgId), eq(accounts.id, location.accountId)));
      const accountLocations = await reader.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.accountId, location.accountId)));
      const primary =
        (account?.primaryLocationId && accountLocations.find((candidate) => candidate.id === account.primaryLocationId)) ||
        accountLocations.find((candidate) => candidate.isPrimary);
      if (primary) {
        return primary;
      }
    }
    const customerLocations = await reader.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.customerId, location.customerId)));
    return customerLocations.find((candidate) => candidate.isPrimary) ?? location;
  }

  // The invoice's parties at issue (Pass 11c, owner review 2026-09-21 item 1).
  // Bill To: the profile's own billingAddress when it has one; else, for a
  // location-level override profile, that location's own address (the
  // override says "bill this location"); else the customer's primary
  // location's address (canon §4 / §5: billing defaults come from the
  // primary location / account context). The name is the profile's
  // billingName, else the customer's name, else their company - the order
  // the document always used. Service Location is the invoice's location as
  // it stands now. Both are frozen into the snapshot so a later move or
  // profile edit never changes an issued invoice.
  private async resolveInvoicePartiesTx(
    reader: DbReader,
    location: Location,
    profile: BillingProfile | null,
  ): Promise<{ billTo: InvoiceBillToSnapshot; serviceLocation: InvoiceServiceLocationSnapshot }> {
    const [customer] = await reader.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, location.customerId)));
    const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : "";
    const name = profile?.billingName?.trim() || customerName || customer?.companyName?.trim() || "Customer";

    let billTo: InvoiceBillToSnapshot;
    if (profile?.billingAddress?.trim()) {
      billTo = { name, address: profile.billingAddress.trim(), source: "PROFILE" };
    } else if (profile && profile.locationId === location.id) {
      billTo = { name, address: formatLocationAddress(location), source: "LOCATION_OVERRIDE" };
    } else {
      const primary = await this.getPrimaryLocationTx(reader, location);
      billTo = { name, address: formatLocationAddress(primary), source: "PRIMARY_LOCATION" };
    }

    return { billTo, serviceLocation: describeServiceLocation(location) };
  }

  // Billing terms for an invoice at the moment it is created or issued: the
  // location's account (tax resolution keys off it), the resolved billing
  // profile frozen as a snapshot together with the invoice's parties (Bill To
  // and Service Location - resolveInvoicePartiesTx), and the due date those
  // terms imply. A DRAFT resolves these for its preview and again at issue,
  // because terms run from the issue date, not the drafting date. Since Pass
  // 11c the snapshot is written whenever there is a location, profile or
  // not: `profileId` and the profile keys are null when none resolved, and
  // the parties are always there. Null only when the invoice has no
  // location, which no current path allows (Pass 10) - it survives for the
  // pre-Pass-10 rows the render fallback covers.
  private async resolveInvoiceTermsForLocationTx(
    tx: DbTransaction,
    locationId: string | null | undefined,
  ): Promise<{ accountId: string | null; billingProfileSnapshot: Record<string, unknown> | null; dueDate: Date | null }> {
    if (!locationId) {
      return { accountId: null, billingProfileSnapshot: null, dueDate: null };
    }

    const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
    if (!location) {
      return { accountId: null, billingProfileSnapshot: null, dueDate: null };
    }
    const resolvedProfile = (await this.resolveBillingProfileForLocation(locationId)) ?? null;
    const parties = await this.resolveInvoicePartiesTx(tx, location, resolvedProfile);

    return {
      accountId: location.accountId ?? null,
      billingProfileSnapshot: {
        profileId: resolvedProfile?.id ?? null,
        label: resolvedProfile?.label ?? null,
        billingType: resolvedProfile?.billingType ?? null,
        invoiceTerms: resolvedProfile?.invoiceTerms ?? null,
        billingName: resolvedProfile?.billingName ?? null,
        billingAddress: resolvedProfile?.billingAddress ?? null,
        billTo: parties.billTo,
        serviceLocation: parties.serviceLocation,
        snapshottedAt: new Date().toISOString(),
      },
      dueDate: resolvedProfile ? computeDueDateFromInvoiceTerms(resolvedProfile.invoiceTerms) : null,
    };
  }

  // Prices every unit of a visit through resolveServiceLineBillingTx and the
  // tax engine, and shapes the tax snapshot. Shared by generation, DRAFT
  // creation and issue, so a draft previews exactly what issue will charge
  // given the same facts, and there is one place a new line type gets added.
  private async buildVisitInvoiceLinesTx(
    tx: DbTransaction,
    input: { units: VisitBillingUnit[]; accountId: string | null; locationId: string | null },
  ): Promise<PricedVisitInvoice> {
    const serviceTypeIds = Array.from(
      new Set(
        input.units
          .flatMap((unit) => [unit.record?.serviceTypeId ?? null, unit.service?.serviceTypeId ?? null])
          .filter((id): id is string => !!id),
      ),
    );
    const serviceTypeRows = serviceTypeIds.length
      ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), inArray(serviceTypes.id, serviceTypeIds)))
      : [];
    const serviceTypeById = new Map(serviceTypeRows.map((serviceType) => [serviceType.id, serviceType]));

    const agreementContextById = await this.resolveAgreementBillingContextTx(
      tx,
      input.units.map((unit) => unit.service?.agreementId).filter((id): id is string => !!id),
    );

    const lines: VisitInvoiceLine[] = [];
    const taxSnapshots: Array<Record<string, unknown>> = [];

    for (const unit of input.units) {
      const { service, record } = unit;
      const serviceTypeId = record?.serviceTypeId ?? service?.serviceTypeId ?? null;
      const serviceType = serviceTypeId ? serviceTypeById.get(serviceTypeId) : undefined;
      const baseDescription = `${serviceType?.name ?? "Service"} - ${unit.serviceDate.toLocaleDateString()}`;
      const billing = await this.resolveServiceLineBillingTx({
        service,
        agreementContext: service?.agreementId ? agreementContextById.get(service.agreementId) : undefined,
      });
      const description = billing.coverageNote ? `${baseDescription} (${billing.coverageNote})` : baseDescription;

      if (billing.lineType === "AGREEMENT_COVERED") {
        lines.push({
          serviceId: service?.id ?? null,
          serviceRecordId: record?.id ?? null,
          lineType: "AGREEMENT_COVERED",
          description,
          unitPriceCents: 0,
          amountCents: 0,
          taxable: false,
          taxCents: 0,
        });
      } else {
        const taxDecision = await this.resolveTaxDecision(tx, {
          accountId: input.accountId,
          locationId: record?.locationId ?? service?.locationId ?? input.locationId,
          serviceTypeId,
          amountCents: billing.amountCents,
        });
        taxSnapshots.push({ serviceRecordId: record?.id ?? null, ...taxDecision.snapshot });

        lines.push({
          serviceId: service?.id ?? null,
          serviceRecordId: record?.id ?? null,
          lineType: "SERVICE",
          description,
          unitPriceCents: billing.amountCents,
          amountCents: billing.amountCents,
          taxable: taxDecision.taxable,
          taxCents: taxDecision.taxCents,
        });
      }

      // Pass 23 (C3.6): the ticket's field surcharge as its own SURCHARGE
      // line right after the service line - "<label> - <service type> -
      // <date>", carrying the same service and ticket ids, taxed as a
      // SERVICE line is (the same rule, the same service type), chargeable
      // even when the service is covered: it is owed in addition to the
      // contract price (D6) and never reduces it (it is not an initial
      // charge, so resolveRemainingContractPriceCents never sees it). Only
      // a ticket carries one - a DRAFT priced before the ticket exists has
      // no surcharge line, and issue re-prices from the finalized ticket.
      const surcharge = surchargeOf(record);
      if (surcharge.surchargeCents != null) {
        const surchargeTax = await this.resolveTaxDecision(tx, {
          accountId: input.accountId,
          locationId: record?.locationId ?? service?.locationId ?? input.locationId,
          serviceTypeId,
          amountCents: surcharge.surchargeCents,
        });
        taxSnapshots.push({ serviceRecordId: record?.id ?? null, lineType: "SURCHARGE", ...surchargeTax.snapshot });
        lines.push({
          serviceId: service?.id ?? null,
          serviceRecordId: record?.id ?? null,
          lineType: "SURCHARGE",
          description: surchargeLineDescription(surcharge.surchargeLabel ?? DEFAULT_SURCHARGE_LABEL, serviceType?.name ?? "Service", unit.serviceDate.toLocaleDateString()),
          unitPriceCents: surcharge.surchargeCents,
          amountCents: surcharge.surchargeCents,
          taxable: surchargeTax.taxable,
          taxCents: surchargeTax.taxCents,
        });
      }
    }

    // Pass 11d: the down payment of each agreement behind the visit rides
    // this invoice as its own line when it has no live INITIAL_CHARGE event -
    // after the service lines, taxed as the standalone path taxes it. The
    // agreement rows are locked for the transaction so two visits of one
    // agreement invoiced at once cannot both carry it; the event the issuing
    // path attaches (attachInitialChargeEventsTx) is what makes it fire once.
    const initialCharges: PricedVisitInvoice["initialCharges"] = [];
    for (const pending of await this.resolvePendingInitialChargesTx(tx, {
      agreements: Array.from(agreementContextById.values(), (context) => context.agreement),
      accountId: input.accountId,
      lock: true,
    })) {
      taxSnapshots.push({ agreementId: pending.agreement.id, lineType: "INITIAL_CHARGE", ...pending.taxDecision.snapshot });
      lines.push({
        serviceId: null,
        serviceRecordId: null,
        lineType: "INITIAL_CHARGE",
        description: pending.description,
        unitPriceCents: pending.amountCents,
        amountCents: pending.amountCents,
        taxable: pending.taxDecision.taxable,
        taxCents: pending.taxDecision.taxCents,
      });
      initialCharges.push({ agreementId: pending.agreement.id, amountCents: pending.amountCents });
    }

    const amountCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const taxCents = lines.reduce((sum, line) => sum + line.taxCents, 0);

    // A single chargeable line keeps the pre-D1 snapshot shape verbatim, so
    // nothing reading an existing invoice's tax history has to learn a second
    // format. Multi-line visits snapshot each line's decision; a fully
    // agreement-covered visit has no decision to make.
    const taxSnapshot =
      taxSnapshots.length === 1
        ? taxSnapshots[0]
        : taxSnapshots.length === 0
          ? { taxable: false, reason: "AGREEMENT_COVERED", taxCents: 0, snapshottedAt: new Date().toISOString() }
          : { taxable: taxCents > 0, reason: "PER_LINE", taxCents, lines: taxSnapshots, snapshottedAt: new Date().toISOString() };

    return { lines, amountCents, taxCents, taxSnapshot, initialCharges };
  }

  private async insertInvoiceLineItemsTx(tx: DbTransaction, invoiceId: string, lines: VisitInvoiceLine[]): Promise<void> {
    if (!lines.length) {
      return;
    }
    await tx.insert(invoiceLineItems).values(
      lines.map((line, index) => ({
        orgId: this.orgId,
        invoiceId,
        serviceId: line.serviceId,
        serviceRecordId: line.serviceRecordId,
        lineType: line.lineType,
        description: line.description,
        quantity: 1,
        unitPriceCents: line.unitPriceCents,
        amountCents: line.amountCents,
        taxable: line.taxable,
        taxCents: line.taxCents,
        sortOrder: index,
      })),
    );
  }

  private async generateInvoiceFromServiceRecordTx(serviceRecordId: string, actor?: AuditActor | null): Promise<Invoice> {
    return db.transaction(async (tx) => {
      const [record] = await tx.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, serviceRecordId)));
      if (!record) {
        throw new Error("Service record not found");
      }
      if (!record.readyForBilling) {
        throw new Error("Service record is not finalized/ready for billing");
      }

      const group = record.appointmentId ? await this.getAppointmentBillingGroupTx(tx, record.appointmentId) : null;

      // Anchor resolution. A record whose appointment row has vanished falls
      // back to the per-record anchor rather than failing the invoice.
      const anchorAppointmentId = group?.appointment.id ?? null;
      let billingRecords: ServiceRecord[] = [record];

      if (group) {
        const finalizedByServiceId = new Map(
          group.records.filter((linkedRecord) => linkedRecord.readyForBilling && linkedRecord.serviceId).map((linkedRecord) => [linkedRecord.serviceId!, linkedRecord]),
        );
        const unfinalized = group.services.filter((service) => !finalizedByServiceId.has(service.id));
        if (unfinalized.length) {
          // Partial finalization does not invoice (D1). Withholding here is
          // what makes "one visit, one invoice" true - invoicing the finalized
          // half would strand the rest of the visit with no anchor left.
          throw new Error(
            `Appointment has ${group.services.length - unfinalized.length} of ${group.services.length} services finalized; all must be finalized before the visit is invoiced`,
          );
        }

        billingRecords = group.services
          .map((service) => finalizedByServiceId.get(service.id)!)
          .sort((a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime() || a.id.localeCompare(b.id));

        // The triggering record can sit on the appointment without a linked
        // service (legacy data); bill it anyway rather than dropping it.
        if (!billingRecords.some((billingRecord) => billingRecord.id === record.id)) {
          billingRecords = [...billingRecords, record];
        }
      }

      const billingRecordIds = billingRecords.map((billingRecord) => billingRecord.id);

      // Both anchors, appointment first. An invoice anchored to any one ticket
      // on this visit (the pre-D1 shape) already bills that visit and is
      // returned instead of joined by a second one.
      const existing = await this.findInvoiceForVisitTx(tx, anchorAppointmentId, billingRecordIds);
      if (existing) {
        // D2/D3 adopt: a DRAFT prepared before finalization is the visit's
        // invoice - issue it (re-priced from the now-finalized records) rather
        // than returning an unissued draft to a caller that asked for a bill.
        // Every ticket is finalized at this point (checked above), so the
        // pre-finalization gate cannot fire.
        return existing.status === "DRAFT" ? this.issueInvoiceTx(tx, existing, { actor, prefinalization: "REFUSE" }) : existing;
      }

      const billingServiceIds = billingRecords.map((billingRecord) => billingRecord.serviceId).filter((id): id is string => !!id);
      const billingServices = billingServiceIds.length
        ? await tx.select().from(services).where(and(eq(services.orgId, this.orgId), inArray(services.id, billingServiceIds)))
        : [];
      const serviceById = new Map(billingServices.map((service) => [service.id, service]));

      const terms = await this.resolveInvoiceTermsForLocationTx(tx, record.locationId);
      const priced = await this.buildVisitInvoiceLinesTx(tx, {
        units: billingRecords.map((billingRecord) => ({
          record: billingRecord,
          service: billingRecord.serviceId ? serviceById.get(billingRecord.serviceId) : undefined,
          serviceDate: new Date(billingRecord.serviceDate),
        })),
        accountId: terms.accountId,
        locationId: record.locationId ?? null,
      });

      const insertInvoiceRow = async () => {
        const invoiceNumber = await this.getNextInvoiceNumber(tx);
        const [invoice] = await tx
          .insert(invoices)
          .values({
            orgId: this.orgId,
            customerId: record.customerId,
            locationId: record.locationId ?? null,
            appointmentId: anchorAppointmentId,
            serviceRecordId: anchorAppointmentId ? null : record.id,
            invoiceNumber,
            billingProfileSnapshot: terms.billingProfileSnapshot,
            taxSnapshot: priced.taxSnapshot,
            amountCents: priced.amountCents,
            taxCents: priced.taxCents,
            totalAmountCents: priced.amountCents + priced.taxCents,
            // Derived, never assigned (shared/invoice-status.ts). A fully
            // agreement-covered visit totals $0, so this yields PAID on exactly
            // the same rule that marks a settled invoice - no branch on
            // coverage anywhere. Customer-facing documents render such an
            // invoice as "No Charge - Covered by Service Agreement" rather than
            // "PAID"; that story belongs at the render layer, not this column.
            status: deriveInvoiceStatus({ totalAmountCents: priced.amountCents + priced.taxCents }),
            balanceDueCents: priced.amountCents + priced.taxCents,
            issuedAt: new Date(),
            dueDate: terms.dueDate,
            notes: null,
          })
          .returning();
        return invoice;
      };

      // No 23505 catch here on purpose. Postgres aborts the whole transaction
      // on a constraint violation - every later statement fails 25P02 ("current
      // transaction is aborted") - so a recovery SELECT inside this block can
      // never run. The losing side of a race is recovered by the caller below,
      // after the transaction has rolled back.
      const invoice = await insertInvoiceRow();

      await this.insertInvoiceLineItemsTx(tx, invoice.id, priced.lines);
      await this.attachInitialChargeEventsTx(tx, invoice, priced.initialCharges);

      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: invoice.id,
        action: "invoice_issued",
        actor,
        after: invoice,
      });

      return invoice;
    });
  }

  // D3: an invoice may be CREATED against an unfinalized appointment - office
  // prep or a preview for the customer - but only as a DRAFT. It prices every
  // active service on the visit as it stands today (a service with no ticket
  // yet is priced from its contract; a posted-but-unfinalized ticket the same
  // way, since finalization is what fixes the amount) and holds the visit's
  // anchor so generation adopts it. It is not a receivable: no issuedAt, no
  // due date, not sendable, not payable, not counted in balances.
  async createDraftInvoiceForAppointment(appointmentId: string, actor?: AuditActor | null): Promise<Invoice> {
    try {
      return await db.transaction((tx) => this.createDraftInvoiceForAppointmentTx(tx, appointmentId, actor));
    } catch (err: any) {
      // Same race shape as generation: the appointment's partial unique index
      // rejects the loser, whose transaction has rolled back by the time we
      // look the winner up here.
      if (err?.code === "23505") {
        const [raceWinner] = await db
          .select()
          .from(invoices)
          .where(and(eq(invoices.orgId, this.orgId), eq(invoices.appointmentId, appointmentId), ne(invoices.status, "VOID")));
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  // Runs inside the caller's transaction: the public route wraps it in its own,
  // and D2's finalization hook (resolveInvoiceOnFinalizeTx) calls it under a
  // savepoint of the finalize transaction.
  private async createDraftInvoiceForAppointmentTx(tx: DbTransaction, appointmentId: string, actor?: AuditActor | null): Promise<Invoice> {
    const group = await this.getAppointmentBillingGroupTx(tx, appointmentId);
    if (!group) {
      throw new Error("Appointment not found");
    }
    if (group.appointment.status === "CANCELED") {
      throw new Error("Cannot draft an invoice for a cancelled appointment");
    }
    if (!group.services.length) {
      throw new Error("Appointment has no active services to invoice");
    }

    const existing = await this.findInvoiceForVisitTx(tx, group.appointment.id, group.records.map((record) => record.id));
    if (existing) {
      if (existing.status === "DRAFT") {
        return existing;
      }
      throw new Error(`Appointment already has invoice ${existing.invoiceNumber}`);
    }

    const recordByServiceId = new Map(group.records.filter((record) => record.serviceId).map((record) => [record.serviceId!, record]));
    const terms = await this.resolveInvoiceTermsForLocationTx(tx, group.appointment.locationId);
    const priced = await this.buildVisitInvoiceLinesTx(tx, {
      units: group.services.map((service) => {
        const record = recordByServiceId.get(service.id);
        return { service, record, serviceDate: record ? new Date(record.serviceDate) : new Date(group.appointment.scheduledDate) };
      }),
      accountId: terms.accountId,
      locationId: group.appointment.locationId ?? null,
    });

    const invoiceNumber = await this.getNextInvoiceNumber(tx);
    const [draft] = await tx
      .insert(invoices)
      .values({
        orgId: this.orgId,
        customerId: group.appointment.customerId,
        locationId: group.appointment.locationId ?? null,
        appointmentId: group.appointment.id,
        serviceRecordId: null,
        invoiceNumber,
        billingProfileSnapshot: terms.billingProfileSnapshot,
        taxSnapshot: priced.taxSnapshot,
        amountCents: priced.amountCents,
        taxCents: priced.taxCents,
        totalAmountCents: priced.amountCents + priced.taxCents,
        // The one place DRAFT is written. It is a lifecycle state, not an
        // amount-derived one - deriveInvoiceStatus passes it through
        // untouched, and issueInvoiceTx is the only exit from it.
        status: "DRAFT",
        issuedAt: null,
        dueDate: null,
        notes: null,
      })
      .returning();

    await this.insertInvoiceLineItemsTx(tx, draft.id, priced.lines);

    await this.recordAuditLogTx(tx, {
      entityType: "invoice",
      entityId: draft.id,
      action: "invoice_drafted",
      actor,
      after: draft,
    });

    return draft;
  }

  // D3: the DRAFT -> issued transition. Refuses while any active service on
  // the visit lacks a finalized ticket unless the caller overrides, in which
  // case those tickets are flagged for review. Re-prices from the visit as it
  // stands NOW - lines, tax, billing terms and due date - because the draft's
  // numbers were a preview and the finalized records are the truth.
  async issueInvoice(id: string, input: IssueInvoiceInput): Promise<Invoice | undefined> {
    return db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
      if (!invoice) {
        return undefined;
      }
      return this.issueInvoiceTx(tx, invoice, input);
    });
  }

  private async issueInvoiceTx(tx: DbTransaction, draft: Invoice, input: IssueInvoiceInput): Promise<Invoice> {
    if (draft.status === "VOID") {
      throw new Error("A voided invoice cannot be issued");
    }
    if (draft.status !== "DRAFT") {
      // Already issued - a double-click, or generation adopting an invoice
      // that issue beat it to. Nothing to redo.
      return draft;
    }
    if (!draft.appointmentId) {
      throw new Error("Draft invoice is not anchored to an appointment");
    }

    const group = await this.getAppointmentBillingGroupTx(tx, draft.appointmentId);
    if (!group) {
      throw new Error("Appointment not found");
    }
    if (!group.services.length) {
      throw new Error("Appointment has no active services to invoice");
    }

    const recordByServiceId = new Map(group.records.filter((record) => record.serviceId).map((record) => [record.serviceId!, record]));
    const unfinalizedServices = group.services.filter((service) => !recordByServiceId.get(service.id)?.readyForBilling);
    if (unfinalizedServices.length) {
      if (input.prefinalization !== "OVERRIDE") {
        throw new PrefinalizationIssueError(await this.describeUnfinalizedTicketsTx(tx, unfinalizedServices, recordByServiceId));
      }
      await this.flagTicketsForPrefinalizationIssueTx(tx, {
        invoice: draft,
        records: unfinalizedServices.map((service) => recordByServiceId.get(service.id)).filter((record): record is ServiceRecord => !!record),
        actor: input.actor ?? null,
      });
    }

    const terms = await this.resolveInvoiceTermsForLocationTx(tx, draft.locationId);
    const priced = await this.buildVisitInvoiceLinesTx(tx, {
      units: group.services.map((service) => {
        const record = recordByServiceId.get(service.id);
        return { service, record, serviceDate: record ? new Date(record.serviceDate) : new Date(group.appointment.scheduledDate) };
      }),
      accountId: terms.accountId,
      locationId: draft.locationId ?? null,
    });

    // A draft's lines are a preview, not history: replace them wholesale.
    // Once issued the lines are frozen like any other invoice's.
    await tx.delete(invoiceLineItems).where(and(eq(invoiceLineItems.orgId, this.orgId), eq(invoiceLineItems.invoiceId, draft.id)));
    await this.insertInvoiceLineItemsTx(tx, draft.id, priced.lines);
    // Issue, not draft, is when the down payment's event is attached (Pass 11d).
    await this.attachInitialChargeEventsTx(tx, draft, priced.initialCharges);

    const totalAmountCents = priced.amountCents + priced.taxCents;
    // Leaving DRAFT: derive from the amounts with no currentStatus, so a $0
    // covered visit lands PAID on the same rule as generation. A draft holds
    // no applications (they are refused on a DRAFT), so nothing is paid yet
    // and the whole total is due from here.
    const rollup = computeInvoiceRollup({ totalAmountCents, amountPaidCents: 0 });
    const [issued] = await tx
      .update(invoices)
      .set({
        billingProfileSnapshot: terms.billingProfileSnapshot,
        taxSnapshot: priced.taxSnapshot,
        amountCents: priced.amountCents,
        taxCents: priced.taxCents,
        totalAmountCents,
        status: rollup.status,
        amountPaidCents: rollup.amountPaidCents,
        balanceDueCents: rollup.balanceDueCents,
        pendingAppliedCents: rollup.pendingAppliedCents,
        issuedAt: new Date(),
        dueDate: terms.dueDate,
      })
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, draft.id)))
      .returning();

    await this.recordAuditLogTx(tx, {
      entityType: "invoice",
      entityId: issued.id,
      action: "invoice_issued",
      actor: input.actor,
      before: draft,
      after: issued,
    });

    return issued;
  }

  private async describeUnfinalizedTicketsTx(
    tx: DbTransaction,
    unfinalizedServices: Service[],
    recordByServiceId: Map<string, ServiceRecord>,
  ): Promise<UnfinalizedTicketRef[]> {
    const serviceTypeIds = Array.from(new Set(unfinalizedServices.map((service) => service.serviceTypeId).filter((id): id is string => !!id)));
    const serviceTypeRows = serviceTypeIds.length
      ? await tx.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), inArray(serviceTypes.id, serviceTypeIds)))
      : [];
    const serviceTypeById = new Map(serviceTypeRows.map((serviceType) => [serviceType.id, serviceType]));

    return unfinalizedServices.map((service) => {
      const record = recordByServiceId.get(service.id);
      const name = (service.serviceTypeId ? serviceTypeById.get(service.serviceTypeId)?.name : null) ?? "Service";
      return {
        serviceId: service.id,
        serviceRecordId: record?.id ?? null,
        ticketStatus: record?.ticketStatus ?? null,
        description: record ? `${name} - ticket posted, awaiting office finalization` : `${name} - no ticket posted yet`,
      };
    });
  }

  // The D3 review flag. ticketStatus becomes FLAGGED_FOR_REVIEW for a ticket
  // awaiting review; a REOPENED ticket keeps REOPENED (the technician still
  // owes an edit, and REOPENED is what lets them make it) and carries only the
  // flag columns until it is re-posted, at which point
  // flagTicketIfVisitAlreadyInvoicedTx flags it properly. Already-flagged
  // tickets are left alone so the original who/when/why survives.
  private async flagTicketsForPrefinalizationIssueTx(
    tx: DbTransaction,
    input: { invoice: Invoice; records: ServiceRecord[]; actor: AuditActor | null },
  ): Promise<void> {
    const now = new Date();
    for (const record of input.records) {
      if (record.readyForBilling || record.flaggedAt) {
        continue;
      }
      const [flagged] = await tx
        .update(serviceRecords)
        .set({
          ticketStatus: record.ticketStatus === "REOPENED" ? "REOPENED" : "FLAGGED_FOR_REVIEW",
          flaggedAt: now,
          flaggedByUserId: input.actor?.userId ?? null,
          flaggedByLabel: input.actor?.actorLabel ?? null,
          flagReason: `Invoice ${input.invoice.invoiceNumber} was issued before this ticket was finalized`,
        })
        .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, record.id)))
        .returning();

      await this.recordAuditLogTx(tx, {
        entityType: "service_record",
        entityId: record.id,
        action: "prefinalization_issue_override",
        actor: input.actor,
        before: record,
        after: flagged,
      });
    }
  }

  // The posting-side half of the D3 flag: a ticket entering office review on
  // a visit whose invoice is already ISSUED (never a DRAFT - drafting a visit
  // and then posting its tickets is the normal order) is flagged on the way
  // in. Covers the service that had no ticket when a manager issued early, and
  // a reopened ticket re-posted after the visit was invoiced normally. System
  // actor: no person chose this, the rule did.
  private async flagTicketIfVisitAlreadyInvoicedTx(tx: DbTransaction, record: ServiceRecord): Promise<ServiceRecord> {
    if (!record.appointmentId || record.ticketStatus !== "OFFICE_REVIEW_PENDING" || record.readyForBilling) {
      return record;
    }

    const group = await this.getAppointmentBillingGroupTx(tx, record.appointmentId);
    const siblingRecordIds = Array.from(new Set([record.id, ...(group?.records ?? []).map((sibling) => sibling.id)]));
    const invoice = await this.findInvoiceForVisitTx(tx, record.appointmentId, siblingRecordIds);
    if (!invoice || !isInvoiceIssued(invoice.status)) {
      return record;
    }

    const [flagged] = await tx
      .update(serviceRecords)
      .set({
        ticketStatus: "FLAGGED_FOR_REVIEW",
        flaggedAt: new Date(),
        flaggedByUserId: null,
        flaggedByLabel: null,
        flagReason: `Invoice ${invoice.invoiceNumber} was issued before this ticket was finalized`,
      })
      .where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, record.id)))
      .returning();

    await this.recordAuditLogTx(tx, {
      entityType: "service_record",
      entityId: record.id,
      action: "prefinalization_issue_override",
      before: record,
      after: flagged,
    });

    return flagged;
  }

  // Q3, shared by the two appointment-cancel paths (the disposition, both
  // modes, and the agreement cancellation). Undefined decision with drafts
  // present throws so the caller can prompt; true voids them inside this
  // same transaction (audit-logged like any void); false leaves them as
  // DRAFTs on a cancelled visit - an explicit choice, visible on the invoice
  // list, voidable later, never a silent orphan. Returns how many were voided.
  private async resolveDraftInvoicesOnCancelTx(
    tx: DbTransaction,
    appointmentIds: string[],
    voidDraftInvoices: boolean | undefined,
    actor: AuditActor | null,
  ): Promise<number> {
    if (!appointmentIds.length) {
      return 0;
    }

    const drafts = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, this.orgId), inArray(invoices.appointmentId, appointmentIds), eq(invoices.status, "DRAFT")));
    if (!drafts.length) {
      return 0;
    }

    if (voidDraftInvoices === undefined) {
      throw new DraftInvoiceDecisionRequiredError(
        drafts.map((draft) => ({ id: draft.id, invoiceNumber: draft.invoiceNumber, appointmentId: draft.appointmentId, totalAmountCents: draft.totalAmountCents })),
      );
    }
    if (!voidDraftInvoices) {
      return 0;
    }

    for (const draft of drafts) {
      await this.voidInvoiceTx(tx, draft, actor);
    }
    return drafts.length;
  }

  // The one place VOID is written. Idempotent: voiding a void is a no-op with
  // no second audit row. Money applied to the invoice is released back to the
  // location's unapplied balance first (each release audit-logged with the
  // void as its reason) - a VOID invoice owes nothing and can hold nothing,
  // and stranding a payment on one would make it vanish from every balance.
  // All three stored rollups are zeroed here by hand (what computeInvoiceRollup
  // answers for VOID): pendingAppliedCents was missed when Pass 7.6 added it,
  // so an invoice voided while a PENDING payment was applied kept that amount
  // as "pending confirmation" after the release - the Phase 1 verification
  // defect, fixed in Pass 10 with a one-shot backfill in payments-bootstrap.ts.
  private async voidInvoiceTx(tx: DbTransaction, invoice: Invoice, actor: AuditActor | null | undefined): Promise<Invoice> {
    if (invoice.status === "VOID") {
      return invoice;
    }

    await this.releaseAllApplicationsForInvoiceTx(tx, invoice, `Invoice ${invoice.invoiceNumber} voided`, actor ?? null);

    const [voided] = await tx
      .update(invoices)
      .set({ status: "VOID", amountPaidCents: 0, balanceDueCents: 0, pendingAppliedCents: 0, paidDate: null })
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoice.id)))
      .returning();

    await this.recordAuditLogTx(tx, {
      entityType: "invoice",
      entityId: invoice.id,
      action: "invoice_voided",
      actor,
      before: invoice,
      after: voided,
    });

    return voided;
  }

  // Schedule-driven per PLAN_BILLING_V1.md §1.6 path 2 - the primary path
  // for agreement revenue. Called by the nightly billing run
  // (server/jobs/billing-run.ts) once per due period; idempotent via the
  // permanent unique index on billing_events (agreementId, periodKey), with
  // both a pre-check and a catch on a genuine race, same shape as
  // generateInvoiceFromServiceRecord.
  async generateScheduleDrivenInvoice(input: GenerateScheduleDrivenInvoiceInput): Promise<Invoice> {
    return db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, input.agreementId)));
      if (!agreement) {
        throw new Error("Agreement not found");
      }

      const [existingEvent] = await tx
        .select()
        .from(billingEvents)
        .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.agreementId, input.agreementId), eq(billingEvents.periodKey, input.periodKey)));
      if (existingEvent?.invoiceId) {
        const [existingInvoice] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, existingEvent.invoiceId)));
        if (existingInvoice) {
          // Still advance nextBillingDate even on this already-billed path -
          // it should be a no-op in normal operation (creating the event and
          // advancing the date are atomic in the same transaction below), but
          // if this period is ever revisited with a stale nextBillingDate
          // anyway (a manual re-trigger, a bug elsewhere), the agreement must
          // not get stuck re-attempting an already-billed period forever.
          if (agreement.nextBillingDate !== input.nextBillingDate) {
            const [advancedAgreement] = await tx
              .update(agreements)
              .set({ nextBillingDate: input.nextBillingDate as any, updatedAt: new Date() })
              .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)))
              .returning();
            if (advancedAgreement) {
              await this.auditAgreementAdvanceTx(tx, agreement, advancedAgreement);
            }
          }
          return existingInvoice;
        }
      }

      // The same resolver every other issuing path uses (Pass 11c replaced an
      // inline copy of the snapshot here, which would have missed the parties).
      const { accountId, billingProfileSnapshot, dueDate } = await this.resolveInvoiceTermsForLocationTx(tx, agreement.locationId);

      const taxDecision = await this.resolveTaxDecision(tx, {
        accountId,
        locationId: agreement.locationId,
        serviceTypeId: agreement.serviceTypeId,
        amountCents: input.amountCents,
      });

      const insertInvoiceRow = async () => {
        const invoiceNumber = await this.getNextInvoiceNumber(tx);
        const [invoice] = await tx
          .insert(invoices)
          .values({
            orgId: this.orgId,
            customerId: agreement.customerId,
            locationId: agreement.locationId ?? null,
            serviceRecordId: null,
            invoiceNumber,
            billingProfileSnapshot,
            taxSnapshot: taxDecision.snapshot,
            amountCents: input.amountCents,
            taxCents: taxDecision.taxCents,
            totalAmountCents: input.amountCents + taxDecision.taxCents,
            status: deriveInvoiceStatus({ totalAmountCents: input.amountCents + taxDecision.taxCents }),
            balanceDueCents: input.amountCents + taxDecision.taxCents,
            issuedAt: new Date(),
            dueDate,
            notes: null,
          })
          .returning();
        return invoice;
      };

      let invoice: Invoice;
      let billingEvent: BillingEvent;
      try {
        invoice = await insertInvoiceRow();
        [billingEvent] = await tx
          .insert(billingEvents)
          .values({
            orgId: this.orgId,
            agreementId: agreement.id,
            source: "SCHEDULE_DRIVEN",
            periodKey: input.periodKey,
            amountCents: input.amountCents,
            invoiceId: invoice.id,
          })
          .returning();
      } catch (err: any) {
        if (err?.code === "23505") {
          const [raceWinner] = await tx
            .select()
            .from(billingEvents)
            .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.agreementId, input.agreementId), eq(billingEvents.periodKey, input.periodKey)));
          if (raceWinner?.invoiceId) {
            const [raceInvoice] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, raceWinner.invoiceId)));
            if (raceInvoice) {
              return raceInvoice;
            }
          }
        }
        throw err;
      }
      void billingEvent;

      await tx.insert(invoiceLineItems).values({
        orgId: this.orgId,
        invoiceId: invoice.id,
        lineType: "SERVICE",
        description: `${agreement.agreementName} - scheduled charge (${input.periodKey})`,
        quantity: 1,
        unitPriceCents: input.amountCents,
        amountCents: input.amountCents,
        taxable: taxDecision.taxable,
        taxCents: taxDecision.taxCents,
        sortOrder: 0,
      });

      // Pass 32 (C5.1a): the billing run advancing nextBillingDate is the
      // agreement's schedule executing - its `update`, System (the invoice
      // row beside it is audited already).
      const [advancedAgreement] = await tx
        .update(agreements)
        .set({ nextBillingDate: input.nextBillingDate as any, updatedAt: new Date() })
        .where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id)))
        .returning();
      if (advancedAgreement) {
        await this.auditAgreementAdvanceTx(tx, agreement, advancedAgreement);
      }

      return invoice;
    });
  }

  // Notes and due date only. Status, amount paid and balance due are derived
  // from the ledger (D5) and cannot be set here - "Mark Paid" ended with
  // Pass 6; recording a payment is what marks an invoice paid now.
  //
  // D7 (Pass 8): the due date is a term of the receivable, so a change here
  // is recorded as an `update` on the invoice, in the same transaction. A
  // PATCH that changes nothing writes no row.
  async updateInvoice(id: string, data: Partial<InsertInvoice>, actor?: AuditActor | null): Promise<Invoice | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
      if (!existing) {
        return undefined;
      }
      if (existing.status === "VOID") {
        throw new Error("Voided invoices cannot be changed");
      }
      if (data.status !== undefined || data.amountPaidCents !== undefined || data.balanceDueCents !== undefined || data.paidDate !== undefined) {
        throw new Error("Invoice status and paid amounts are derived from recorded payments; record a payment instead");
      }

      const [inv] = await tx.update(invoices).set(data).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id))).returning();
      const dueDateChanged = (existing.dueDate?.getTime() ?? null) !== (inv.dueDate?.getTime() ?? null);
      if (dueDateChanged || (existing.notes ?? null) !== (inv.notes ?? null)) {
        await this.recordAuditLogTx(tx, {
          entityType: "invoice",
          entityId: inv.id,
          action: "update",
          actor,
          before: existing,
          after: inv,
        });
      }
      return inv;
    });
  }

  // Pass 11b (PLAN_ROADMAP_V2.md C2.1b): the repair for an invoice created
  // before a manual invoice required a location - INV-000001 and INV-000072
  // on the dev DB, each on a two-location customer, which is why Pass 10
  // reported them instead of guessing. The office picks the location, under
  // the rule createManualInvoice applies: one of THIS customer's locations
  // (canon rule 1), never another customer's, never none. Not a transfer: an
  // invoice that already has a location is refused, since moving one would
  // move it between two location balances and nothing here re-resolves the
  // terms it was issued under - the snapshots stay frozen. The rollups do not
  // depend on the location, so nothing is recomputed. Recorded as an
  // `update` on the invoice with the before / after rows, like the notes /
  // due-date PATCH (Pass 8).
  async assignInvoiceLocation(id: string, locationId: string, actor?: AuditActor | null): Promise<Invoice | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
      if (!existing) {
        return undefined;
      }
      if (existing.status === "VOID") {
        throw new Error("Voided invoices cannot be changed");
      }
      if (existing.locationId) {
        throw new Error(`Invoice ${existing.invoiceNumber} already has a location; assigning one is only for invoices that have none`);
      }

      const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, locationId)));
      if (!location) {
        throw new Error("Location not found");
      }
      if (location.customerId !== existing.customerId) {
        throw new Error("The location belongs to a different customer");
      }

      const [updated] = await tx
        .update(invoices)
        .set({ locationId: location.id })
        .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: updated.id,
        action: "update",
        actor,
        before: existing,
        after: updated,
      });
      return updated;
    });
  }

  async voidInvoice(id: string, actor?: AuditActor | null): Promise<Invoice | undefined> {
    return db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, id)));
      if (!invoice) {
        return undefined;
      }
      return this.voidInvoiceTx(tx, invoice, actor);
    });
  }

  // ---------------------------------------------------------------------------
  // Payments ledger - PLAN_BILLING_V1_1.md D5, with D4's location-level
  // unapplied balance and the initial-charge receivable.
  //
  // Discipline, in one place:
  // - Append-only. A payment / credit memo is recorded once; its lifecycle
  //   (confirm, void, refund) is a stamped transition, never an edit of the
  //   amount. An application is released, never deleted (§2.5).
  // - The invoice rollup is recomputed from the ledger inside the same
  //   transaction as every change that affects it, under a row lock on the
  //   invoice, so two concurrent applications cannot jointly overpay.
  // - PENDING payments can be applied (they show on the invoice) but do not
  //   count toward amountPaidCents until confirmed; confirmation is what flips
  //   the invoice, atomically, for every invoice the payment sits on.
  // - Every act is audit-logged: lifecycle on the payment / credit memo
  //   entity, application and release on the invoice entity (the invoice is
  //   what changed), carrying the application row so the reason is in the
  //   trail.
  // ---------------------------------------------------------------------------

  async getPaymentsByLocation(locationId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, this.orgId), eq(payments.locationId, locationId)))
      .orderBy(desc(payments.receivedAt), desc(payments.createdAt));
  }

  // Only payments that NAMED the visit at collection. Not a guess by location,
  // date and technician - that misleads on a day with two visits at one
  // location, which is why the column exists.
  async getPaymentsByAppointment(appointmentId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, this.orgId), eq(payments.appointmentId, appointmentId)))
      .orderBy(asc(payments.receivedAt), asc(payments.createdAt));
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(and(eq(payments.orgId, this.orgId), eq(payments.id, id)));
    return payment;
  }

  // The Payments screen's org-wide read (D5 owner review of Pass 7.5, item
  // 4). Filters are applied in SQL so the office can narrow a year of
  // payments without downloading it; the page is capped and `total` says
  // when the cap cut it. The summary deliberately ignores the STATUS filter:
  // the tiles report what is pending and what is confirmed for the range /
  // collector / method / search in view, whichever status the list shows.
  // Dates are UTC calendar days, the clock every date-only value here keeps.
  async listPayments(filters: PaymentListFilters): Promise<PaymentListResult> {
    const limit = Math.min(Math.max(Math.trunc(filters.limit ?? PAYMENT_LIST_DEFAULT_LIMIT), 1), PAYMENT_LIST_MAX_LIMIT);

    const scope: SQL[] = [eq(payments.orgId, this.orgId)];
    if (filters.method?.length) scope.push(inArray(payments.method, filters.method));
    if (filters.receivedFrom) scope.push(gte(payments.receivedAt, utcDayRange(filters.receivedFrom, filters.receivedFrom).start));
    if (filters.receivedTo) scope.push(lt(payments.receivedAt, utcDayRange(filters.receivedTo, filters.receivedTo).endExclusive));
    if (filters.collectedByUserId) scope.push(eq(payments.collectedByUserId, filters.collectedByUserId));
    const term = filters.search?.trim();
    if (term) {
      // The customer and location matches are subqueries rather than joins so
      // the count and the summary below can run on `payments` alone.
      const pattern = `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      scope.push(
        or(
          inArray(
            payments.customerId,
            db
              .select({ id: customers.id })
              .from(customers)
              .where(and(eq(customers.orgId, this.orgId), or(ilike(sql`${customers.firstName} || ' ' || ${customers.lastName}`, pattern), ilike(customers.companyName, pattern)))),
          ),
          inArray(
            payments.locationId,
            db
              .select({ id: locations.id })
              .from(locations)
              .where(and(eq(locations.orgId, this.orgId), or(ilike(locations.name, pattern), ilike(locations.address, pattern), ilike(locations.city, pattern)))),
          ),
          ilike(payments.checkNumber, pattern),
          ilike(payments.referenceNumber, pattern),
          ilike(payments.memo, pattern),
        )!,
      );
    }
    const listed: SQL[] = filters.status?.length ? [...scope, inArray(payments.status, filters.status)] : scope;

    const rows = await db
      .select({
        payment: payments,
        customer: { firstName: customers.firstName, lastName: customers.lastName, companyName: customers.companyName },
        location: { name: locations.name, address: locations.address, city: locations.city },
        appointmentScheduledDate: appointments.scheduledDate,
      })
      .from(payments)
      .innerJoin(customers, eq(payments.customerId, customers.id))
      .innerJoin(locations, eq(payments.locationId, locations.id))
      .leftJoin(appointments, eq(payments.appointmentId, appointments.id))
      .where(and(...listed))
      .orderBy(desc(payments.receivedAt), desc(payments.createdAt))
      .limit(limit);

    const [{ total }] = await db.select({ total: count() }).from(payments).where(and(...listed));

    const summaryRows = await db
      .select({ status: payments.status, method: payments.method, cents: sum(payments.amountCents), n: count() })
      .from(payments)
      .where(and(...scope))
      .groupBy(payments.status, payments.method);
    const summary: PaymentListSummary = { pendingCents: 0, pendingCount: 0, pendingCashCents: 0, pendingCashCount: 0, confirmedCents: 0, confirmedCount: 0 };
    for (const row of summaryRows) {
      const cents = Number(row.cents ?? 0);
      const n = Number(row.n);
      if (row.status === "PENDING") {
        summary.pendingCents += cents;
        summary.pendingCount += n;
        if (row.method === "CASH") {
          summary.pendingCashCents += cents;
          summary.pendingCashCount += n;
        }
      } else if (row.status === "CONFIRMED") {
        summary.confirmedCents += cents;
        summary.confirmedCount += n;
      }
    }

    // Everyone who has recorded a payment, newest label per user (a renamed
    // user keeps one entry), independent of the filters so the dropdown does
    // not shrink as the office narrows the list.
    const collectorRows = await db
      .select({ userId: payments.collectedByUserId, label: payments.collectedByLabel, latest: max(payments.createdAt) })
      .from(payments)
      .where(and(eq(payments.orgId, this.orgId), isNotNull(payments.collectedByUserId)))
      .groupBy(payments.collectedByUserId, payments.collectedByLabel)
      .orderBy(desc(max(payments.createdAt)));
    const collectorById = new Map<string, PaymentCollectorOption>();
    for (const row of collectorRows) {
      if (!row.userId || collectorById.has(row.userId)) continue;
      collectorById.set(row.userId, { userId: row.userId, label: row.label || row.userId });
    }
    const collectors = Array.from(collectorById.values()).sort((a, b) => a.label.localeCompare(b.label));

    const applied = await this.appliedCentsByPaymentTx(db, rows.map((row) => row.payment.id));
    const listRows: PaymentListRow[] = rows.map(({ payment, customer, location, appointmentScheduledDate }) => ({
      id: payment.id,
      customerId: payment.customerId,
      locationId: payment.locationId,
      appointmentId: payment.appointmentId ?? null,
      designatedAgreementId: payment.designatedAgreementId ?? null,
      method: payment.method,
      status: payment.status,
      amountCents: payment.amountCents,
      appliedCents: applied.get(payment.id) ?? 0,
      checkNumber: payment.checkNumber ?? null,
      referenceNumber: payment.referenceNumber ?? null,
      memo: payment.memo ?? null,
      receivedAt: payment.receivedAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      collectedByUserId: payment.collectedByUserId ?? null,
      collectedByLabel: payment.collectedByLabel ?? null,
      confirmedByLabel: payment.confirmedByLabel ?? null,
      confirmedAt: payment.confirmedAt ? payment.confirmedAt.toISOString() : null,
      voidReason: payment.voidReason ?? null,
      refundReason: payment.refundReason ?? null,
      customerLabel: `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || customer.companyName || location.name,
      locationName: location.name,
      locationAddress: [location.address, location.city].filter(Boolean).join(", "),
      appointmentScheduledAt: appointmentScheduledDate ? appointmentScheduledDate.toISOString() : null,
    }));

    return { payments: listRows, total: Number(total), limit, summary, collectors };
  }

  // The deposit-slip view: what was collected in a range, grouped in
  // summarizeCollections() (shared, pure) so a script can exercise the
  // grouping without a server. Nothing is stored.
  async getCollectionsReport(range: { receivedFrom: string; receivedTo: string }): Promise<CollectionsReport> {
    const { start, endExclusive } = utcDayRange(range.receivedFrom, range.receivedTo);
    const rows = await db
      .select({
        id: payments.id,
        status: payments.status,
        method: payments.method,
        amountCents: payments.amountCents,
        receivedAt: payments.receivedAt,
        collectedByUserId: payments.collectedByUserId,
        collectedByLabel: payments.collectedByLabel,
      })
      .from(payments)
      .where(and(eq(payments.orgId, this.orgId), gte(payments.receivedAt, start), lt(payments.receivedAt, endExclusive)));
    return summarizeCollections(
      rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() })),
      range,
    );
  }

  async getCreditMemosByLocation(locationId: string): Promise<CreditMemo[]> {
    return db
      .select()
      .from(creditMemos)
      .where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.locationId, locationId)))
      .orderBy(desc(creditMemos.issuedAt));
  }

  async getCreditMemo(id: string): Promise<CreditMemo | undefined> {
    const [memo] = await db.select().from(creditMemos).where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.id, id)));
    return memo;
  }

  // §2.5's row lock. Applications decrement a running balance by variable
  // amounts, which the unique-index-plus-23505 pattern used elsewhere cannot
  // protect; SELECT ... FOR UPDATE serializes them on the invoice row.
  private async lockInvoiceTx(tx: DbTransaction, invoiceId: string): Promise<Invoice | undefined> {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoiceId)))
      .for("update");
    return invoice;
  }

  private async lockPaymentTx(tx: DbTransaction, paymentId: string): Promise<Payment | undefined> {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, this.orgId), eq(payments.id, paymentId)))
      .for("update");
    return payment;
  }

  private async lockCreditMemoTx(tx: DbTransaction, creditMemoId: string): Promise<CreditMemo | undefined> {
    const [memo] = await tx
      .select()
      .from(creditMemos)
      .where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.id, creditMemoId)))
      .for("update");
    return memo;
  }

  // Unreleased applications on one invoice, split by whether they count yet.
  // CONFIRMED payments and ISSUED credit memos count toward amount paid;
  // PENDING payments are shown but not counted (D5). `allCents` caps further
  // applications - pending included, so two pending payments cannot jointly
  // overpay an invoice that will later confirm both.
  private async sumInvoiceApplicationsTx(
    tx: DbTransaction,
    invoiceId: string,
  ): Promise<{ paidCents: number; pendingCents: number; allCents: number }> {
    const paymentRows = await tx
      .select({ amountCents: paymentApplications.amountCents, status: payments.status })
      .from(paymentApplications)
      .innerJoin(payments, eq(paymentApplications.paymentId, payments.id))
      .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.invoiceId, invoiceId), eq(paymentApplications.released, false)));
    const creditRows = await tx
      .select({ amountCents: creditApplications.amountCents, status: creditMemos.status })
      .from(creditApplications)
      .innerJoin(creditMemos, eq(creditApplications.creditMemoId, creditMemos.id))
      .where(and(eq(creditApplications.orgId, this.orgId), eq(creditApplications.invoiceId, invoiceId), eq(creditApplications.released, false)));

    let paidCents = 0;
    let pendingCents = 0;
    for (const row of paymentRows) {
      if (paymentCountsAsPaid(row.status)) {
        paidCents += row.amountCents;
      } else if (paymentHoldsValue(row.status)) {
        pendingCents += row.amountCents;
      }
    }
    for (const row of creditRows) {
      if (row.status === "ISSUED") {
        paidCents += row.amountCents;
      }
    }
    return { paidCents, pendingCents, allCents: paidCents + pendingCents };
  }

  // §2.5: recompute the invoice's rollup from the ledger - fresh, never
  // incremented, so a missed update heals on the next one. The caller holds
  // the row lock. paidDate is stamped the first time the rollup lands on PAID
  // and cleared if a release reopens the balance; display only.
  private async recomputeInvoiceRollupTx(tx: DbTransaction, invoice: Invoice): Promise<Invoice> {
    const sums = await this.sumInvoiceApplicationsTx(tx, invoice.id);
    const rollup = computeInvoiceRollup({
      totalAmountCents: invoice.totalAmountCents,
      amountPaidCents: sums.paidCents,
      pendingAppliedCents: sums.pendingCents,
      currentStatus: invoice.status,
    });
    const [updated] = await tx
      .update(invoices)
      .set({
        amountPaidCents: rollup.amountPaidCents,
        balanceDueCents: rollup.balanceDueCents,
        pendingAppliedCents: rollup.pendingAppliedCents,
        status: rollup.status,
        paidDate: rollup.status === "PAID" ? invoice.paidDate ?? new Date() : null,
      })
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoice.id)))
      .returning();
    return updated;
  }

  // sum of unreleased applications per source, for "how much is left".
  private async appliedCentsByPaymentTx(reader: Pick<typeof db, "select">, paymentIds: string[]): Promise<Map<string, number>> {
    if (!paymentIds.length) {
      return new Map();
    }
    const rows = await reader
      .select({ paymentId: paymentApplications.paymentId, appliedCents: sql<number>`coalesce(sum(${paymentApplications.amountCents}), 0)::int` })
      .from(paymentApplications)
      .where(and(eq(paymentApplications.orgId, this.orgId), inArray(paymentApplications.paymentId, paymentIds), eq(paymentApplications.released, false)))
      .groupBy(paymentApplications.paymentId);
    return new Map(rows.map((row) => [row.paymentId, row.appliedCents]));
  }

  private async appliedCentsByCreditMemoTx(reader: Pick<typeof db, "select">, creditMemoIds: string[]): Promise<Map<string, number>> {
    if (!creditMemoIds.length) {
      return new Map();
    }
    const rows = await reader
      .select({ creditMemoId: creditApplications.creditMemoId, appliedCents: sql<number>`coalesce(sum(${creditApplications.amountCents}), 0)::int` })
      .from(creditApplications)
      .where(and(eq(creditApplications.orgId, this.orgId), inArray(creditApplications.creditMemoId, creditMemoIds), eq(creditApplications.released, false)))
      .groupBy(creditApplications.creditMemoId);
    return new Map(rows.map((row) => [row.creditMemoId, row.appliedCents]));
  }

  // The unapplied pool (§5 Q2: payments and credit memos are one pool).
  // Every payment that still holds value (PENDING or CONFIRMED) and every
  // ISSUED credit memo with money left on it, oldest first. Callers filter
  // by status: the location switcher counts only confirmed money, the D4
  // prompt offers pending too and says so.
  private async collectUnappliedSourcesTx(
    reader: Pick<typeof db, "select">,
    paymentRows: Payment[],
    creditRows: CreditMemo[],
  ): Promise<Array<UnappliedSource & { locationId: string }>> {
    const livePayments = paymentRows.filter((payment) => paymentHoldsValue(payment.status));
    const liveCredits = creditRows.filter((memo) => memo.status === "ISSUED");
    const appliedByPayment = await this.appliedCentsByPaymentTx(reader, livePayments.map((payment) => payment.id));
    const appliedByCredit = await this.appliedCentsByCreditMemoTx(reader, liveCredits.map((memo) => memo.id));

    const sources: Array<UnappliedSource & { locationId: string }> = [];
    for (const payment of livePayments) {
      const unappliedCents = payment.amountCents - (appliedByPayment.get(payment.id) ?? 0);
      if (unappliedCents <= 0) continue;
      sources.push({
        kind: "payment",
        id: payment.id,
        status: payment.status,
        label: payment.method,
        amountCents: payment.amountCents,
        unappliedCents,
        designatedAgreementId: payment.designatedAgreementId ?? null,
        appointmentId: payment.appointmentId ?? null,
        recordedAt: payment.receivedAt.toISOString(),
        locationId: payment.locationId,
      });
    }
    for (const memo of liveCredits) {
      const unappliedCents = memo.amountCents - (appliedByCredit.get(memo.id) ?? 0);
      if (unappliedCents <= 0) continue;
      sources.push({
        kind: "credit_memo",
        id: memo.id,
        status: memo.status,
        label: memo.reasonCode,
        amountCents: memo.amountCents,
        unappliedCents,
        designatedAgreementId: null,
        appointmentId: null,
        recordedAt: memo.issuedAt.toISOString(),
        locationId: memo.locationId,
      });
    }
    return sources.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }

  private async unappliedSourcesForLocationTx(reader: Pick<typeof db, "select">, locationId: string): Promise<Array<UnappliedSource & { locationId: string }>> {
    const locationPayments = await reader.select().from(payments).where(and(eq(payments.orgId, this.orgId), eq(payments.locationId, locationId)));
    const locationCredits = await reader.select().from(creditMemos).where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.locationId, locationId)));
    return this.collectUnappliedSourcesTx(reader, locationPayments, locationCredits);
  }

  async recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    if (!isManualPaymentMethod(input.method)) {
      throw new Error("Only cash, check and other payments can be recorded until card processing lands");
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    return db.transaction(async (tx) => {
      const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      if (!location) {
        throw new Error("Location not found");
      }
      if (input.designatedAgreementId) {
        const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, input.designatedAgreementId)));
        if (!agreement) {
          throw new Error("Designated agreement not found");
        }
        if (agreement.locationId !== location.id) {
          throw new Error("The designated agreement belongs to a different location");
        }
      }
      if (input.appointmentId) {
        // Validated the way the agreement designation is: the visit must exist
        // and sit at the location the money lands on. appointments.locationId
        // is nullable, so an appointment without one is placed by its
        // services (the same join every other visit rollup uses).
        const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, input.appointmentId)));
        if (!appointment) {
          throw new Error("Appointment not found");
        }
        const appointmentLocationIds = new Set<string>();
        if (appointment.locationId) {
          appointmentLocationIds.add(appointment.locationId);
        } else {
          const linkedServices = await this.getLinkedServicesForAppointmentTx(tx, appointment.id, appointment.serviceId);
          for (const service of linkedServices) appointmentLocationIds.add(service.locationId);
        }
        if (!appointmentLocationIds.has(location.id)) {
          throw new Error("The appointment is at a different location than the payment");
        }
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          orgId: this.orgId,
          customerId: location.customerId,
          locationId: location.id,
          method: input.method,
          amountCents: input.amountCents,
          // Cash and check post PENDING (D5); confirmation is a separate,
          // permission-gated act.
          status: "PENDING",
          designatedAgreementId: input.designatedAgreementId ?? null,
          appointmentId: input.appointmentId ?? null,
          checkNumber: input.checkNumber?.trim() || null,
          referenceNumber: input.referenceNumber?.trim() || null,
          memo: input.memo?.trim() || null,
          receivedAt: input.receivedAt ?? new Date(),
          collectedByUserId: input.actor?.userId ?? null,
          collectedByLabel: input.actor?.actorLabel ?? null,
        })
        .returning();

      await this.recordAuditLogTx(tx, {
        entityType: "payment",
        entityId: payment.id,
        action: "payment_recorded",
        actor: input.actor,
        after: payment,
      });

      if (!input.applyToInvoiceId) {
        return { payment, application: null, invoice: null };
      }

      const invoice = await this.lockInvoiceTx(tx, input.applyToInvoiceId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      const applied = await this.applyPaymentTx(tx, payment, invoice, null, input.actor ?? null);
      return { payment, application: applied.application, invoice: applied.invoice };
    });
  }

  // Refuses anything that would make the ledger lie: a source with no value,
  // an invoice that is not a receivable, a mismatch of customer / location,
  // more than the source has, more than the invoice can take. `amountCents`
  // null means "as much as possible", which is what the D4 prompt and the
  // record-and-apply path want.
  private async assertApplicableTx(
    tx: DbTransaction,
    source: { customerId: string; locationId: string; unappliedCents: number; describe: string },
    invoice: Invoice,
    amountCents: number | null,
  ): Promise<number> {
    if (!isInvoiceIssued(invoice.status)) {
      throw new Error(
        invoice.status === "DRAFT"
          ? "A draft invoice is not a receivable; issue it before applying money to it"
          : "A voided invoice cannot receive payments",
      );
    }
    if (invoice.customerId !== source.customerId) {
      throw new Error(`${source.describe} and invoice ${invoice.invoiceNumber} belong to different customers`);
    }
    if (invoice.locationId && invoice.locationId !== source.locationId) {
      throw new Error(`${source.describe} and invoice ${invoice.invoiceNumber} belong to different locations`);
    }

    const sums = await this.sumInvoiceApplicationsTx(tx, invoice.id);
    const capacityCents = Math.max(invoice.totalAmountCents - sums.allCents, 0);
    const requested = amountCents ?? Math.min(source.unappliedCents, capacityCents);
    if (!Number.isInteger(requested) || requested <= 0) {
      if (source.unappliedCents <= 0) {
        throw new Error(`${source.describe} has no unapplied balance left`);
      }
      if (capacityCents <= 0) {
        throw new Error(`Invoice ${invoice.invoiceNumber} has no balance left to apply against`);
      }
      throw new Error("Application amount must be greater than zero");
    }
    if (requested > source.unappliedCents) {
      throw new Error(`Only ${formatCents(source.unappliedCents)} of ${source.describe.toLowerCase()} is unapplied`);
    }
    if (requested > capacityCents) {
      throw new Error(`Invoice ${invoice.invoiceNumber} can take at most ${formatCents(capacityCents)} more (pending applications included)`);
    }
    return requested;
  }

  private async applyPaymentTx(
    tx: DbTransaction,
    payment: Payment,
    invoice: Invoice,
    amountCents: number | null,
    actor: AuditActor | null,
  ): Promise<{ application: PaymentApplication; invoice: Invoice }> {
    if (!paymentHoldsValue(payment.status)) {
      throw new Error(`A ${payment.status.toLowerCase()} payment cannot be applied`);
    }
    const appliedCents = (await this.appliedCentsByPaymentTx(tx, [payment.id])).get(payment.id) ?? 0;
    const requested = await this.assertApplicableTx(
      tx,
      { customerId: payment.customerId, locationId: payment.locationId, unappliedCents: payment.amountCents - appliedCents, describe: "This payment" },
      invoice,
      amountCents,
    );

    const [application] = await tx
      .insert(paymentApplications)
      .values({
        orgId: this.orgId,
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountCents: requested,
        appliedByUserId: actor?.userId ?? null,
        appliedByLabel: actor?.actorLabel ?? null,
      })
      .returning();
    const updated = await this.recomputeInvoiceRollupTx(tx, invoice);

    await this.recordAuditLogTx(tx, {
      entityType: "invoice",
      entityId: invoice.id,
      action: "payment_applied",
      actor,
      before: invoice,
      after: { ...updated, application },
    });

    return { application, invoice: updated };
  }

  private async applyCreditMemoTx(
    tx: DbTransaction,
    memo: CreditMemo,
    invoice: Invoice,
    amountCents: number | null,
    actor: AuditActor | null,
  ): Promise<{ application: CreditApplication; invoice: Invoice }> {
    if (memo.status !== "ISSUED") {
      throw new Error(`A ${memo.status.toLowerCase()} credit memo cannot be applied`);
    }
    const appliedCents = (await this.appliedCentsByCreditMemoTx(tx, [memo.id])).get(memo.id) ?? 0;
    const requested = await this.assertApplicableTx(
      tx,
      { customerId: memo.customerId, locationId: memo.locationId, unappliedCents: memo.amountCents - appliedCents, describe: "This credit memo" },
      invoice,
      amountCents,
    );

    const [application] = await tx
      .insert(creditApplications)
      .values({
        orgId: this.orgId,
        creditMemoId: memo.id,
        invoiceId: invoice.id,
        amountCents: requested,
        appliedByUserId: actor?.userId ?? null,
        appliedByLabel: actor?.actorLabel ?? null,
      })
      .returning();
    const updated = await this.recomputeInvoiceRollupTx(tx, invoice);

    await this.recordAuditLogTx(tx, {
      entityType: "invoice",
      entityId: invoice.id,
      action: "credit_memo_applied",
      actor,
      before: invoice,
      after: { ...updated, application },
    });

    return { application, invoice: updated };
  }

  async applyPayment(paymentId: string, input: ApplyLedgerSourceInput): Promise<{ application: PaymentApplication; invoice: Invoice } | undefined> {
    return db.transaction(async (tx) => {
      const payment = await this.lockPaymentTx(tx, paymentId);
      if (!payment) {
        return undefined;
      }
      const invoice = await this.lockInvoiceTx(tx, input.invoiceId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      return this.applyPaymentTx(tx, payment, invoice, input.amountCents ?? null, input.actor ?? null);
    });
  }

  async applyCreditMemo(creditMemoId: string, input: ApplyLedgerSourceInput): Promise<{ application: CreditApplication; invoice: Invoice } | undefined> {
    return db.transaction(async (tx) => {
      const memo = await this.lockCreditMemoTx(tx, creditMemoId);
      if (!memo) {
        return undefined;
      }
      const invoice = await this.lockInvoiceTx(tx, input.invoiceId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      return this.applyCreditMemoTx(tx, memo, invoice, input.amountCents ?? null, input.actor ?? null);
    });
  }

  // Release: the application row stays, flagged with who/when/why, and the
  // rollup stops counting it. Idempotent - releasing a released application
  // returns it as-is with no second audit row.
  async releasePaymentApplication(input: ReleaseApplicationInput): Promise<{ application: PaymentApplication; invoice: Invoice } | undefined> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error("A reason is required to release a payment application");
    }
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(paymentApplications)
        .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.id, input.applicationId)));
      if (!application) {
        return undefined;
      }
      const invoice = await this.lockInvoiceTx(tx, application.invoiceId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      if (application.released) {
        return { application, invoice };
      }

      const [released] = await tx
        .update(paymentApplications)
        .set({
          released: true,
          releasedByUserId: input.actor?.userId ?? null,
          releasedByLabel: input.actor?.actorLabel ?? null,
          releasedAt: new Date(),
          releaseReason: reason,
        })
        .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.id, application.id)))
        .returning();
      const updated = await this.recomputeInvoiceRollupTx(tx, invoice);

      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: invoice.id,
        action: "payment_released",
        actor: input.actor,
        before: invoice,
        after: { ...updated, application: released },
      });

      return { application: released, invoice: updated };
    });
  }

  async releaseCreditApplication(input: ReleaseApplicationInput): Promise<{ application: CreditApplication; invoice: Invoice } | undefined> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error("A reason is required to release a credit application");
    }
    return db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(creditApplications)
        .where(and(eq(creditApplications.orgId, this.orgId), eq(creditApplications.id, input.applicationId)));
      if (!application) {
        return undefined;
      }
      const invoice = await this.lockInvoiceTx(tx, application.invoiceId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      if (application.released) {
        return { application, invoice };
      }

      const [released] = await tx
        .update(creditApplications)
        .set({
          released: true,
          releasedByUserId: input.actor?.userId ?? null,
          releasedByLabel: input.actor?.actorLabel ?? null,
          releasedAt: new Date(),
          releaseReason: reason,
        })
        .where(and(eq(creditApplications.orgId, this.orgId), eq(creditApplications.id, application.id)))
        .returning();
      const updated = await this.recomputeInvoiceRollupTx(tx, invoice);

      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: invoice.id,
        action: "credit_memo_released",
        actor: input.actor,
        before: invoice,
        after: { ...updated, application: released },
      });

      return { application: released, invoice: updated };
    });
  }

  // Used by voidInvoiceTx: everything applied to the invoice goes back to the
  // location's unapplied pool. No rollup recompute here - the void that
  // follows zeroes the invoice's amounts itself.
  private async releaseAllApplicationsForInvoiceTx(tx: DbTransaction, invoice: Invoice, reason: string, actor: AuditActor | null): Promise<void> {
    const stamps = {
      released: true,
      releasedByUserId: actor?.userId ?? null,
      releasedByLabel: actor?.actorLabel ?? null,
      releasedAt: new Date(),
      releaseReason: reason,
    };
    const paymentRows = await tx
      .select()
      .from(paymentApplications)
      .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.invoiceId, invoice.id), eq(paymentApplications.released, false)));
    for (const application of paymentRows) {
      const [released] = await tx
        .update(paymentApplications)
        .set(stamps)
        .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.id, application.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: invoice.id,
        action: "payment_released",
        actor,
        before: invoice,
        after: { ...invoice, application: released },
      });
    }
    const creditRows = await tx
      .select()
      .from(creditApplications)
      .where(and(eq(creditApplications.orgId, this.orgId), eq(creditApplications.invoiceId, invoice.id), eq(creditApplications.released, false)));
    for (const application of creditRows) {
      const [released] = await tx
        .update(creditApplications)
        .set(stamps)
        .where(and(eq(creditApplications.orgId, this.orgId), eq(creditApplications.id, application.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "invoice",
        entityId: invoice.id,
        action: "credit_memo_released",
        actor,
        before: invoice,
        after: { ...invoice, application: released },
      });
    }
  }

  // PENDING -> CONFIRMED. This is the moment the money counts: every invoice
  // the payment is applied to is re-rolled in the same transaction and gets
  // its own audit row, so an invoice's trail shows why it flipped to PAID.
  // Who may confirm (cash vs. check) is the route's decision.
  async confirmPayment(id: string, actor?: AuditActor | null): Promise<Payment | undefined> {
    return db.transaction(async (tx) => {
      const payment = await this.lockPaymentTx(tx, id);
      if (!payment) {
        return undefined;
      }
      if (payment.status === "CONFIRMED") {
        return payment;
      }
      if (payment.status !== "PENDING") {
        throw new Error(`A ${payment.status.toLowerCase()} payment cannot be confirmed`);
      }

      const [confirmed] = await tx
        .update(payments)
        .set({
          status: "CONFIRMED",
          confirmedByUserId: actor?.userId ?? null,
          confirmedByLabel: actor?.actorLabel ?? null,
          confirmedAt: new Date(),
        })
        .where(and(eq(payments.orgId, this.orgId), eq(payments.id, payment.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "payment",
        entityId: payment.id,
        action: "payment_confirmed",
        actor,
        before: payment,
        after: confirmed,
      });

      const applications = await tx
        .select({ invoiceId: paymentApplications.invoiceId })
        .from(paymentApplications)
        .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.paymentId, payment.id), eq(paymentApplications.released, false)));
      for (const invoiceId of Array.from(new Set(applications.map((row) => row.invoiceId)))) {
        const invoice = await this.lockInvoiceTx(tx, invoiceId);
        if (!invoice) continue;
        const updated = await this.recomputeInvoiceRollupTx(tx, invoice);
        await this.recordAuditLogTx(tx, {
          entityType: "invoice",
          entityId: invoice.id,
          action: "payment_confirmed",
          actor,
          before: invoice,
          after: { ...updated, paymentId: payment.id },
        });
      }

      return confirmed;
    });
  }

  // Batch confirmation for the Payments screen's queue. Each payment goes
  // through confirmPayment() above - its own transaction, its own audit rows,
  // the invoices it sits on re-rolled - so one refusal never rolls back the
  // rest, and the result says which were skipped and why. `allowCash` is the
  // route's permission decision (CONFIRM_CASH_PAYMENT), applied here per row
  // because only this loop sees each payment's method: a support user's cash
  // is skipped and reported, not a 403 for the whole batch. A payment that
  // changes state between the read here and the lock in confirmPayment() is
  // handled by confirmPayment()'s own checks (an already-confirmed one is
  // returned as-is and writes no second audit row).
  async confirmPayments(paymentIds: string[], input: { actor?: AuditActor | null; allowCash: boolean }): Promise<BatchConfirmResult> {
    const result: BatchConfirmResult = { confirmed: [], skipped: [] };
    for (const id of Array.from(new Set(paymentIds))) {
      const payment = await this.getPayment(id);
      if (!payment) {
        result.skipped.push({ id, reason: "Payment not found" });
        continue;
      }
      if (payment.status === "CONFIRMED") {
        result.skipped.push({ id, reason: "Already confirmed" });
        continue;
      }
      if (payment.status !== "PENDING") {
        result.skipped.push({ id, reason: `A ${payment.status.toLowerCase()} payment cannot be confirmed` });
        continue;
      }
      if (payment.method === "CASH" && !input.allowCash) {
        result.skipped.push({ id, reason: CASH_CONFIRM_AUTHORITY_MESSAGE });
        continue;
      }
      try {
        const confirmed = await this.confirmPayment(id, input.actor);
        if (!confirmed) {
          result.skipped.push({ id, reason: "Payment not found" });
          continue;
        }
        result.confirmed.push({ id: confirmed.id, method: confirmed.method, amountCents: confirmed.amountCents, status: confirmed.status });
      } catch (error) {
        result.skipped.push({ id, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  }

  // A payment recorded in error. It must hold no applications - release them
  // first, explicitly, so where the money was sitting is on the record too.
  async voidPayment(id: string, reason: string, actor?: AuditActor | null): Promise<Payment | undefined> {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new Error("A reason is required to void a payment");
    }
    return db.transaction(async (tx) => {
      const payment = await this.lockPaymentTx(tx, id);
      if (!payment) {
        return undefined;
      }
      if (payment.status === "VOIDED") {
        return payment;
      }
      if (!paymentHoldsValue(payment.status)) {
        throw new Error(`A ${payment.status.toLowerCase()} payment cannot be voided`);
      }
      const appliedCents = (await this.appliedCentsByPaymentTx(tx, [payment.id])).get(payment.id) ?? 0;
      if (appliedCents > 0) {
        throw new Error(`Release the ${formatCents(appliedCents)} applied from this payment before voiding it`);
      }

      const [voided] = await tx
        .update(payments)
        .set({
          status: "VOIDED",
          voidedByUserId: actor?.userId ?? null,
          voidedByLabel: actor?.actorLabel ?? null,
          voidedAt: new Date(),
          voidReason: trimmed,
        })
        .where(and(eq(payments.orgId, this.orgId), eq(payments.id, payment.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "payment",
        entityId: payment.id,
        action: "payment_voided",
        actor,
        before: payment,
        after: voided,
      });
      return voided;
    });
  }

  // Money returned to the customer. Only a CONFIRMED payment can be refunded
  // (a pending one was never ours to return - void it), and only once nothing
  // is applied from it. Manual instruments only in Phase 1; the refund itself
  // happens outside the app and this records that it did.
  async refundPayment(id: string, reason: string, actor?: AuditActor | null): Promise<Payment | undefined> {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new Error("A reason is required to refund a payment");
    }
    return db.transaction(async (tx) => {
      const payment = await this.lockPaymentTx(tx, id);
      if (!payment) {
        return undefined;
      }
      if (payment.status === "REFUNDED") {
        return payment;
      }
      if (payment.status !== "CONFIRMED") {
        throw new Error(
          payment.status === "PENDING"
            ? "A pending payment has not been confirmed as received; void it instead of refunding it"
            : `A ${payment.status.toLowerCase()} payment cannot be refunded`,
        );
      }
      const appliedCents = (await this.appliedCentsByPaymentTx(tx, [payment.id])).get(payment.id) ?? 0;
      if (appliedCents > 0) {
        throw new Error(`Release the ${formatCents(appliedCents)} applied from this payment before refunding it`);
      }

      const [refunded] = await tx
        .update(payments)
        .set({
          status: "REFUNDED",
          refundedByUserId: actor?.userId ?? null,
          refundedByLabel: actor?.actorLabel ?? null,
          refundedAt: new Date(),
          refundReason: trimmed,
        })
        .where(and(eq(payments.orgId, this.orgId), eq(payments.id, payment.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "payment",
        entityId: payment.id,
        action: "payment_refunded",
        actor,
        before: payment,
        after: refunded,
      });
      return refunded;
    });
  }

  async issueCreditMemo(input: IssueCreditMemoInput): Promise<IssueCreditMemoResult> {
    if (!isCreditMemoReasonCode(input.reasonCode)) {
      throw new Error("Unknown credit memo reason");
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error("A reason is required to issue a credit memo");
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("Credit memo amount must be greater than zero");
    }

    return db.transaction(async (tx) => {
      const [location] = await tx.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)));
      if (!location) {
        throw new Error("Location not found");
      }
      if (input.invoiceId) {
        const [corrected] = await tx.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, input.invoiceId)));
        if (!corrected) {
          throw new Error("Invoice not found");
        }
        if (corrected.customerId !== location.customerId) {
          throw new Error("The invoice being corrected belongs to a different customer");
        }
      }

      const [memo] = await tx
        .insert(creditMemos)
        .values({
          orgId: this.orgId,
          customerId: location.customerId,
          locationId: location.id,
          invoiceId: input.invoiceId ?? null,
          reasonCode: input.reasonCode,
          reason,
          amountCents: input.amountCents,
          status: "ISSUED",
          issuedByUserId: input.actor?.userId ?? null,
          issuedByLabel: input.actor?.actorLabel ?? null,
        })
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "credit_memo",
        entityId: memo.id,
        action: "credit_memo_issued",
        actor: input.actor,
        after: memo,
      });

      if (!input.applyToInvoiceId) {
        return { creditMemo: memo, application: null, invoice: null };
      }
      const invoice = await this.lockInvoiceTx(tx, input.applyToInvoiceId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }
      const applied = await this.applyCreditMemoTx(tx, memo, invoice, null, input.actor ?? null);
      return { creditMemo: memo, application: applied.application, invoice: applied.invoice };
    });
  }

  async voidCreditMemo(id: string, reason: string, actor?: AuditActor | null): Promise<CreditMemo | undefined> {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new Error("A reason is required to void a credit memo");
    }
    return db.transaction(async (tx) => {
      const memo = await this.lockCreditMemoTx(tx, id);
      if (!memo) {
        return undefined;
      }
      if (memo.status === "VOIDED") {
        return memo;
      }
      const appliedCents = (await this.appliedCentsByCreditMemoTx(tx, [memo.id])).get(memo.id) ?? 0;
      if (appliedCents > 0) {
        throw new Error(`Release the ${formatCents(appliedCents)} applied from this credit memo before voiding it`);
      }

      const [voided] = await tx
        .update(creditMemos)
        .set({
          status: "VOIDED",
          voidedByUserId: actor?.userId ?? null,
          voidedByLabel: actor?.actorLabel ?? null,
          voidedAt: new Date(),
          voidReason: trimmed,
        })
        .where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.id, memo.id)))
        .returning();
      await this.recordAuditLogTx(tx, {
        entityType: "credit_memo",
        entityId: memo.id,
        action: "credit_memo_voided",
        actor,
        before: memo,
        after: voided,
      });
      return voided;
    });
  }

  // Everything ever applied to the invoice, released rows included (they are
  // history, rendered muted), each with the source it came from.
  async getInvoiceLedger(invoiceId: string): Promise<InvoiceLedger | undefined> {
    const [invoice] = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoiceId)));
    if (!invoice) {
      return undefined;
    }
    const paymentRows = await db
      .select({ application: paymentApplications, payment: payments })
      .from(paymentApplications)
      .innerJoin(payments, eq(paymentApplications.paymentId, payments.id))
      .where(and(eq(paymentApplications.orgId, this.orgId), eq(paymentApplications.invoiceId, invoiceId)))
      .orderBy(asc(paymentApplications.appliedAt));
    const creditRows = await db
      .select({ application: creditApplications, creditMemo: creditMemos })
      .from(creditApplications)
      .innerJoin(creditMemos, eq(creditApplications.creditMemoId, creditMemos.id))
      .where(and(eq(creditApplications.orgId, this.orgId), eq(creditApplications.invoiceId, invoiceId)))
      .orderBy(asc(creditApplications.appliedAt));
    return { invoice, paymentApplications: paymentRows, creditApplications: creditRows };
  }

  async getLocationLedgerSummary(locationId: string): Promise<LocationLedgerSummary> {
    const locationInvoices = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.locationId, locationId)));
    const sources = await this.unappliedSourcesForLocationTx(db, locationId);
    let unappliedConfirmedCents = 0;
    let unappliedPendingCents = 0;
    for (const source of sources) {
      if (source.status === "PENDING") {
        unappliedPendingCents += source.unappliedCents;
      } else {
        unappliedConfirmedCents += source.unappliedCents;
      }
    }
    return {
      locationId,
      openBalanceCents: locationInvoices.filter((invoice) => isInvoiceIssued(invoice.status)).reduce((sum, invoice) => sum + invoice.balanceDueCents, 0),
      unappliedConfirmedCents,
      unappliedPendingCents,
      sources: sources.map(({ locationId: _locationId, ...source }) => source),
    };
  }

  // The agreements an invoice is FOR, so money designated to one of them is
  // offered first and money designated to a different agreement is not
  // offered at all: through billing_events for schedule-driven and
  // initial-charge invoices, and through the line items' services for visit
  // invoices.
  private async invoiceAgreementIdsTx(reader: Pick<typeof db, "select">, invoiceId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const events = await reader
      .select({ agreementId: billingEvents.agreementId })
      .from(billingEvents)
      .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.invoiceId, invoiceId)));
    for (const event of events) ids.add(event.agreementId);
    const lines = await reader
      .select({ agreementId: services.agreementId })
      .from(invoiceLineItems)
      .innerJoin(services, eq(invoiceLineItems.serviceId, services.id))
      .where(and(eq(invoiceLineItems.orgId, this.orgId), eq(invoiceLineItems.invoiceId, invoiceId)));
    for (const line of lines) {
      if (line.agreementId) ids.add(line.agreementId);
    }
    return ids;
  }

  // Order the pool the way one "Apply" should draw on it: money collected at
  // this invoice's visit first, then money designated to this invoice's
  // agreement, then undesignated; confirmed before pending; oldest first.
  // Money designated to a different agreement is set aside, not drawn on.
  private async orderSourcesForInvoiceTx(
    reader: Pick<typeof db, "select">,
    invoice: Invoice,
  ): Promise<{ eligible: Array<UnappliedSource & { locationId: string }>; designatedElsewhereCents: number }> {
    if (!invoice.locationId) {
      return { eligible: [], designatedElsewhereCents: 0 };
    }
    const agreementIds = await this.invoiceAgreementIdsTx(reader, invoice.id);
    return this.orderSourcesForAgreementsTx(reader, invoice.locationId, agreementIds, invoice.appointmentId ?? null);
  }

  // The same ordering keyed on the agreements (and the visit) a
  // not-yet-invoiced visit is for, so the field's "COA available"
  // (getVisitBillingSummary, D6) draws the pool in exactly the order the D4
  // prompt will when the visit is invoiced - one rule, not a field
  // approximation of it.
  //
  // Money collected at a DIFFERENT visit at this location is not set aside
  // the way money designated to a different agreement is: the visit link is
  // a preference, not a fence, or a payment collected at a visit that was
  // already settled could never reach the customer's next invoice.
  private async orderSourcesForAgreementsTx(
    reader: Pick<typeof db, "select">,
    locationId: string,
    agreementIds: Set<string>,
    appointmentId: string | null = null,
  ): Promise<{ eligible: Array<UnappliedSource & { locationId: string }>; designatedElsewhereCents: number }> {
    const sources = await this.unappliedSourcesForLocationTx(reader, locationId);
    let designatedElsewhereCents = 0;
    const eligible = sources.filter((source) => {
      if (!source.designatedAgreementId || agreementIds.has(source.designatedAgreementId)) {
        return true;
      }
      designatedElsewhereCents += source.unappliedCents;
      return false;
    });
    const tier = (source: UnappliedSource) => {
      if (appointmentId && source.appointmentId === appointmentId) return 0;
      if (source.designatedAgreementId) return 2;
      return 4;
    };
    const rank = (source: UnappliedSource) => tier(source) + (source.status === "PENDING" ? 1 : 0);
    eligible.sort((a, b) => rank(a) - rank(b) || a.recordedAt.localeCompare(b.recordedAt));
    return { eligible, designatedElsewhereCents };
  }

  async getInvoiceLocationBalance(invoiceId: string): Promise<InvoiceLocationBalance | undefined> {
    const [invoice] = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoiceId)));
    if (!invoice) {
      return undefined;
    }
    const sums = await this.sumInvoiceApplicationsTx(db as unknown as DbTransaction, invoice.id);
    const applicableCents = isInvoiceIssued(invoice.status) ? Math.max(invoice.totalAmountCents - sums.allCents, 0) : 0;
    const { eligible, designatedElsewhereCents } = await this.orderSourcesForInvoiceTx(db, invoice);
    let unappliedConfirmedCents = 0;
    let unappliedPendingCents = 0;
    for (const source of eligible) {
      if (source.status === "PENDING") {
        unappliedPendingCents += source.unappliedCents;
      } else {
        unappliedConfirmedCents += source.unappliedCents;
      }
    }
    return {
      invoiceId: invoice.id,
      locationId: invoice.locationId ?? null,
      balanceDueCents: invoice.balanceDueCents,
      pendingAppliedCents: sums.pendingCents,
      applicableCents,
      unappliedConfirmedCents,
      unappliedPendingCents,
      suggestedCents: Math.min(applicableCents, unappliedConfirmedCents + unappliedPendingCents),
      designatedElsewhereCents,
      sources: eligible.map(({ locationId: _locationId, ...source }) => source),
    };
  }

  // D4's prompt, acted on: draw on the location's unapplied pool in the order
  // above until the invoice can take no more. One application row per source
  // touched, each audit-logged like a manual one.
  async applyLocationBalanceToInvoice(invoiceId: string, actor?: AuditActor | null): Promise<ApplyLocationBalanceResult | undefined> {
    return db.transaction(async (tx) => {
      let invoice = await this.lockInvoiceTx(tx, invoiceId);
      if (!invoice) {
        return undefined;
      }
      if (!isInvoiceIssued(invoice.status)) {
        throw new Error(invoice.status === "DRAFT" ? "A draft invoice is not a receivable; issue it first" : "A voided invoice cannot receive payments");
      }
      if (!invoice.locationId) {
        throw new Error(`Invoice ${invoice.invoiceNumber} has no location, so there is no location balance to apply`);
      }

      const { eligible } = await this.orderSourcesForInvoiceTx(tx, invoice);
      const applied: ApplyLocationBalanceResult["applied"] = [];
      let appliedCents = 0;
      for (const source of eligible) {
        const sums = await this.sumInvoiceApplicationsTx(tx, invoice.id);
        const capacityCents = Math.max(invoice.totalAmountCents - sums.allCents, 0);
        if (capacityCents <= 0) break;
        const amountCents = Math.min(source.unappliedCents, capacityCents);
        if (source.kind === "payment") {
          const payment = await this.lockPaymentTx(tx, source.id);
          if (!payment) continue;
          const result = await this.applyPaymentTx(tx, payment, invoice, amountCents, actor ?? null);
          invoice = result.invoice;
        } else {
          const memo = await this.lockCreditMemoTx(tx, source.id);
          if (!memo) continue;
          const result = await this.applyCreditMemoTx(tx, memo, invoice, amountCents, actor ?? null);
          invoice = result.invoice;
        }
        applied.push({ kind: source.kind, sourceId: source.id, amountCents });
        appliedCents += amountCents;
      }

      return { invoice, applied, appliedCents };
    });
  }

  // The explicit up-front path (D4 as corrected by the owner on 2026-09-21,
  // Pass 11d): a standalone invoice for the agreement's initial charge, on
  // request from the agreement card - a customer who wants a deposit invoice
  // to pay before the visit, or a charge type that never rides a visit.
  // Nothing calls this at agreement creation any more; a down payment
  // otherwise rides the first visit's invoice (buildVisitInvoiceLinesTx).
  // Amount = resolveInitialChargeCents(agreement, price); a percent of a
  // price that is not set resolves to nothing and is REFUSED, never issued
  // at $0. The INITIAL_CHARGE billing event (fixed periodKey) is what makes
  // the charge bill once per agreement, here or on a visit. Voiding the
  // invoice that carries it makes the event non-live, so the charge is owed
  // again - on the next visit, or here - and the event is re-pointed, never
  // duplicated.
  private async issueInitialChargeInvoiceTx(tx: DbTransaction, agreement: Agreement, actor: AuditActor | null | undefined): Promise<InitialChargeReceivableOutcome> {
    if (!agreement.initialChargeType) {
      return { action: "NO_CHARGE", invoice: null, message: "This agreement has no initial charge" };
    }

    // Under the agreement's row lock, like the visit path, so this button and
    // a visit being invoiced at the same moment cannot both bill the deposit.
    await tx.select({ id: agreements.id }).from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id))).for("update");
    const existing = await this.getInitialChargeEventTx(tx, agreement.id);
    if (existing?.live) {
      const existingInvoice = existing.invoice;
      return {
        action: "ALREADY_ISSUED",
        invoice: existingInvoice,
        message: existingInvoice
          ? `The initial charge was already ${existingInvoice.appointmentId ? "billed on visit invoice" : "issued as"} ${existingInvoice.invoiceNumber}`
          : "The initial charge was settled outside the ledger",
      };
    }

    const amountCents = resolveInitialChargeCents(agreement, agreement.priceCents);
    if (amountCents == null || amountCents <= 0) {
      return {
        action: "REFUSED",
        invoice: null,
        message: agreement.initialChargeAmountMode === "PERCENT_OF_PRICE" && agreement.priceCents == null
          ? "The initial charge is a percent of the contract price and no contract price is set; set the price to issue it"
          : "The initial charge has no amount to invoice",
      };
    }

    const terms = await this.resolveInvoiceTermsForLocationTx(tx, agreement.locationId);
    const taxDecision = await this.resolveTaxDecision(tx, {
      accountId: terms.accountId,
      locationId: agreement.locationId,
      serviceTypeId: agreement.serviceTypeId,
      amountCents,
    });
    const totalAmountCents = amountCents + taxDecision.taxCents;
    const invoiceNumber = await this.getNextInvoiceNumber(tx);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        orgId: this.orgId,
        customerId: agreement.customerId,
        locationId: agreement.locationId,
        appointmentId: null,
        serviceRecordId: null,
        invoiceNumber,
        billingProfileSnapshot: terms.billingProfileSnapshot,
        taxSnapshot: taxDecision.snapshot,
        amountCents,
        taxCents: taxDecision.taxCents,
        totalAmountCents,
        status: deriveInvoiceStatus({ totalAmountCents }),
        balanceDueCents: totalAmountCents,
        issuedAt: new Date(),
        dueDate: terms.dueDate,
        notes: null,
      })
      .returning();

    await this.attachInitialChargeEventsTx(tx, invoice, [{ agreementId: agreement.id, amountCents }]);

    await tx.insert(invoiceLineItems).values({
      orgId: this.orgId,
      invoiceId: invoice.id,
      lineType: "INITIAL_CHARGE",
      description: `${formatInitialChargeType(agreement.initialChargeType)} - ${agreement.agreementName}`,
      quantity: 1,
      unitPriceCents: amountCents,
      amountCents,
      taxable: taxDecision.taxable,
      taxCents: taxDecision.taxCents,
      sortOrder: 0,
    });

    await this.recordAuditLogTx(tx, {
      entityType: "invoice",
      entityId: invoice.id,
      action: "invoice_issued",
      actor,
      after: invoice,
    });

    return { action: "ISSUED", invoice };
  }

  async issueInitialChargeInvoice(agreementId: string, actor?: AuditActor | null): Promise<Invoice | undefined> {
    return db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreementId)));
      if (!agreement) {
        return undefined;
      }
      const outcome = await this.issueInitialChargeInvoiceTx(tx, agreement, actor);
      // Pass 11d: a press once the charge is live anywhere - a visit invoice,
      // an earlier up-front invoice, settled outside the ledger - is refused
      // with where it is, never answered with that invoice as if issued now.
      if (outcome.action !== "ISSUED" || !outcome.invoice) {
        throw new Error(outcome.message ?? "The initial charge could not be issued");
      }
      return outcome.invoice;
    });
  }

  // The one INITIAL_CHARGE event an agreement can carry, and whether it is
  // LIVE (Pass 11d): an event with no invoice (the charge was settled outside
  // the ledger) or with an invoice that is not VOID. A voided invoice makes
  // the event non-live, so the down payment rides the corrected visit invoice
  // - or a fresh up-front one - and the event is re-pointed at it rather than
  // duplicated (the unique index on agreementId + periodKey holds).
  private async getInitialChargeEventTx(
    reader: DbReader,
    agreementId: string,
  ): Promise<{ event: typeof billingEvents.$inferSelect; invoice: Invoice | null; live: boolean } | null> {
    const [event] = await reader
      .select()
      .from(billingEvents)
      .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.agreementId, agreementId), eq(billingEvents.periodKey, INITIAL_CHARGE_PERIOD_KEY)));
    if (!event) {
      return null;
    }
    const [invoice] = event.invoiceId
      ? await reader.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, event.invoiceId)))
      : [undefined];
    return { event, invoice: invoice ?? null, live: !event.invoiceId || invoice?.status !== "VOID" };
  }

  // Each agreement's down payment that the next visit invoice will carry
  // (Pass 11d): a DOWN_PAYMENT on a live agreement, resolvable to an amount
  // (a percent of a price that is not set resolves to nothing and is skipped,
  // never $0), with no live INITIAL_CHARGE event. Taxed exactly as the
  // standalone path taxes it. `lock` (the issuing paths) takes a row lock on
  // each candidate agreement and re-reads it, so the liveness check and the
  // event the caller attaches happen under one lock; the field's read-only
  // summary does not lock. Sorted by name so two agreements' deposits on one
  // visit always land in the same order.
  private async resolvePendingInitialChargesTx(
    reader: DbReader,
    input: { agreements: Agreement[]; accountId: string | null; lock?: boolean },
  ): Promise<PendingInitialCharge[]> {
    const candidates = new Map<string, Agreement>();
    for (const agreement of input.agreements) {
      if (agreement.status !== "CANCELLED" && initialChargeRidesFirstVisit(agreement)) {
        candidates.set(agreement.id, agreement);
      }
    }
    const ordered = Array.from(candidates.values()).sort((a, b) => a.agreementName.localeCompare(b.agreementName) || a.id.localeCompare(b.id));
    const pending: PendingInitialCharge[] = [];
    for (let agreement of ordered) {
      if (input.lock) {
        const [locked] = await reader.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreement.id))).for("update");
        if (!locked || locked.status === "CANCELLED" || !initialChargeRidesFirstVisit(locked)) {
          continue;
        }
        agreement = locked;
      }
      const amountCents = resolveInitialChargeCents(agreement, agreement.priceCents);
      if (amountCents == null || amountCents <= 0) {
        continue;
      }
      const existing = await this.getInitialChargeEventTx(reader, agreement.id);
      if (existing?.live) {
        continue;
      }
      const taxDecision = await this.resolveTaxDecision(reader as any, {
        accountId: input.accountId,
        locationId: agreement.locationId,
        serviceTypeId: agreement.serviceTypeId,
        amountCents,
      });
      pending.push({
        agreement,
        description: `${formatInitialChargeType(agreement.initialChargeType)} - ${agreement.agreementName}`,
        amountCents,
        taxDecision,
      });
    }
    return pending;
  }

  // The INITIAL_CHARGE events for the down payments an invoice carries
  // (Pass 11d), attached by the issuing paths only - generation, issue and
  // the explicit up-front path, never a draft. One event per agreement: a
  // non-live event (its earlier invoice voided) is re-pointed at this
  // invoice; a live one means another issue won under the lock, and this
  // transaction must not bill the deposit twice.
  private async attachInitialChargeEventsTx(tx: DbTransaction, invoice: Invoice, initialCharges: PricedVisitInvoice["initialCharges"]): Promise<void> {
    for (const charge of initialCharges) {
      const existing = await this.getInitialChargeEventTx(tx, charge.agreementId);
      if (existing?.live) {
        throw new Error(
          `The agreement's initial charge was ${existing.invoice ? `billed as ${existing.invoice.invoiceNumber}` : "settled outside the ledger"} while ${invoice.invoiceNumber} was being issued; retry`,
        );
      }
      if (existing) {
        await tx
          .update(billingEvents)
          .set({ invoiceId: invoice.id, amountCents: charge.amountCents })
          .where(and(eq(billingEvents.orgId, this.orgId), eq(billingEvents.id, existing.event.id)));
        continue;
      }
      await tx.insert(billingEvents).values({
        orgId: this.orgId,
        agreementId: charge.agreementId,
        source: "INITIAL_CHARGE",
        periodKey: INITIAL_CHARGE_PERIOD_KEY,
        amountCents: charge.amountCents,
        invoiceId: invoice.id,
      });
    }
  }

  // The office's prompt at signing and at scheduling (Pass 11d; D4 step 1,
  // "payment recorded at scheduling"): a down payment the office may collect,
  // still owed - no live event - and not already covered by money designated
  // to the agreement in the location's unapplied pool. Null means do not ask.
  private async describeInitialChargeDueTx(reader: DbReader, agreement: Agreement): Promise<InitialChargeDue | null> {
    if (agreement.status === "CANCELLED" || !initialChargeRidesFirstVisit(agreement) || !officeMayCollectInitialCharge(agreement)) {
      return null;
    }
    const amountCents = resolveInitialChargeCents(agreement, agreement.priceCents);
    if (amountCents == null || amountCents <= 0) {
      return null;
    }
    const existing = await this.getInitialChargeEventTx(reader, agreement.id);
    if (existing?.live) {
      return null;
    }
    const sources = await this.unappliedSourcesForLocationTx(reader, agreement.locationId);
    const designatedCents = sources
      .filter((source) => source.designatedAgreementId === agreement.id)
      .reduce((sum, source) => sum + source.unappliedCents, 0);
    if (designatedCents >= amountCents) {
      return null;
    }
    return {
      agreementId: agreement.id,
      agreementName: agreement.agreementName,
      locationId: agreement.locationId,
      amountCents,
      collectedBy: agreement.initialChargeCollectedBy ?? null,
    };
  }

  async getInitialChargeDueForAgreement(agreementId: string): Promise<InitialChargeDue | null | undefined> {
    const [agreement] = await db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreementId)));
    if (!agreement) {
      return undefined;
    }
    return this.describeInitialChargeDueTx(db, agreement);
  }

  // For a just-created appointment: the first still-owed down payment among
  // the agreements behind its services. One prompt - a visit carrying two
  // agreements' deposits is asked about the first by name; the other is
  // asked at its own next scheduling, and both are on the technician's figures.
  async getInitialChargeDueForAppointment(appointmentId: string): Promise<InitialChargeDue | null | undefined> {
    const group = await this.getAppointmentBillingGroupTx(db as any, appointmentId);
    if (!group) {
      return undefined;
    }
    const contexts = await this.resolveAgreementBillingContextTx(
      db as any,
      group.services.map((service) => service.agreementId).filter((id): id is string => !!id),
    );
    const candidates = Array.from(contexts.values(), (context) => context.agreement)
      .sort((a, b) => a.agreementName.localeCompare(b.agreementName) || a.id.localeCompare(b.id));
    for (const agreement of candidates) {
      const due = await this.describeInitialChargeDueTx(db, agreement);
      if (due) {
        return due;
      }
    }
    return null;
  }

  // Where an agreement's initial charge stands, for the agreement card
  // (Pass 11d): NONE, PENDING (a down payment rides the next visit invoice;
  // any other type waits for the explicit button), ISSUED as which invoice -
  // a visit's or the standalone - or SETTLED_OUTSIDE_LEDGER.
  async getAgreementInitialChargeStatus(agreementId: string): Promise<AgreementInitialChargeStatus | undefined> {
    const [agreement] = await db.select().from(agreements).where(and(eq(agreements.orgId, this.orgId), eq(agreements.id, agreementId)));
    if (!agreement) {
      return undefined;
    }
    if (!agreement.initialChargeType) {
      return { kind: "NONE", ridesFirstVisit: false, amountCents: null, invoice: null, message: null };
    }
    const toRef = (invoice: Invoice | null): InitialChargeInvoiceRef | null =>
      invoice
        ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalAmountCents: invoice.totalAmountCents,
          balanceDueCents: invoice.balanceDueCents,
          appointmentId: invoice.appointmentId ?? null,
        }
        : null;
    const existing = await this.getInitialChargeEventTx(db, agreement.id);
    if (existing?.live) {
      return {
        kind: existing.event.invoiceId ? "ISSUED" : "SETTLED_OUTSIDE_LEDGER",
        ridesFirstVisit: false,
        amountCents: existing.event.amountCents,
        invoice: toRef(existing.invoice),
        message: null,
      };
    }
    const amountCents = resolveInitialChargeCents(agreement, agreement.priceCents);
    return {
      kind: "PENDING",
      ridesFirstVisit: agreement.status !== "CANCELLED" && initialChargeRidesFirstVisit(agreement),
      amountCents,
      invoice: toRef(existing?.invoice ?? null),
      message: amountCents == null || amountCents <= 0
        ? (agreement.initialChargeAmountMode === "PERCENT_OF_PRICE" && agreement.priceCents == null
          ? "The initial charge is a percent of the contract price and no contract price is set; set the price to bill it"
          : "The initial charge has no amount to bill")
        : null,
    };
  }

  // Everything here is drawn from the invoice's own frozen data
  // (billingProfileSnapshot, line items, totals) or org branding - never a
  // live join back to the customer/location's current state, so the
  // rendered document matches what the invoice said at issue even if the
  // customer moved or the org's branding changed since. issueDate comes
  // from invoice.createdAt, not the current time, which is what makes
  // renderInvoicePdf's output reproducible byte-for-byte on a later call.
  //
  // The parties (Bill To, Service Location) are the snapshot's `billTo` /
  // `serviceLocation` keys, frozen at issue by resolveInvoicePartiesTx
  // (Pass 11c). TRANSITIONAL: a row from before that pass has no such keys -
  // 45 with no snapshot at all and 19 with the profile-only shape on the dev
  // DB - and for those, and only those, the parties are resolved at render
  // time by the same rule: the snapshotted profile address if there is one,
  // else the customer's primary location for Bill To (never the service
  // location's address, which is what printed before), and the invoice's
  // location for Service Location. A document is stored on first render, so
  // a legacy row rendered before this pass keeps the document it has.
  async getInvoiceDocumentContext(invoiceId: string): Promise<InvoiceDocumentContext | undefined> {
    const [invoice] = await db.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoiceId)));
    if (!invoice) {
      return undefined;
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, this.orgId));
    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, invoice.customerId)));
    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.orgId, this.orgId), eq(invoiceLineItems.invoiceId, invoiceId)))
      .orderBy(asc(invoiceLineItems.sortOrder));

    const snapshot = invoice.billingProfileSnapshot as {
      billingName?: string | null;
      billingAddress?: string | null;
      billTo?: InvoiceBillToSnapshot | null;
      serviceLocation?: InvoiceServiceLocationSnapshot | null;
    } | null;

    let billToName: string;
    let billToAddress: string | null;
    let serviceLocation: InvoiceServiceLocationSnapshot | null;
    if (snapshot?.billTo) {
      billToName = snapshot.billTo.name;
      billToAddress = snapshot.billTo.address ?? null;
      serviceLocation = snapshot.serviceLocation ?? null;
    } else {
      // TRANSITIONAL render-time fallback for pre-Pass-11c rows (see above).
      const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : "";
      billToName = snapshot?.billingName || customerName || customer?.companyName || "Customer";
      billToAddress = snapshot?.billingAddress || null;
      serviceLocation = null;
      const [location] = invoice.locationId
        ? await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, invoice.locationId)))
        : [];
      if (location) {
        serviceLocation = describeServiceLocation(location);
        if (!billToAddress) {
          billToAddress = formatLocationAddress(await this.getPrimaryLocationTx(db, location));
        }
      } else if (!billToAddress) {
        // The two pre-Pass-10 location-less rows: the customer's primary
        // location is still the party, found through their locations.
        const customerLocations = await db.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.customerId, invoice.customerId)));
        const primary = customerLocations.find((candidate) => candidate.isPrimary);
        billToAddress = primary ? formatLocationAddress(primary) : null;
      }
    }

    // Pass 22 (C3.5; B11): with "Attach service report to visit invoices"
    // on, a visit-anchored invoice's PDF ends with the report of every ticket
    // on it - the distinct service records of its lines, in line order,
    // rendered from the tickets as they stand now. An invoice with no visit
    // (schedule-driven, manual, the standalone initial charge) has nothing to
    // attach and appends nothing ("omit on null"). Read here, at render, and
    // frozen into the stored document with everything else: the toggle's
    // value at first render is what that PDF keeps, and a DRAFT preview
    // follows the same rule unstored.
    let attachedServiceReports: ServiceReportDocumentContext[] | undefined;
    if (invoice.appointmentId && (await this.readAttachServiceReportTx(db))) {
      attachedServiceReports = [];
      const seen = new Set<string>();
      for (const item of lineItems) {
        if (!item.serviceRecordId || seen.has(item.serviceRecordId)) continue;
        seen.add(item.serviceRecordId);
        const report = await this.getServiceReportDocumentContext(item.serviceRecordId);
        if (report) attachedServiceReports.push(report);
      }
    }

    return {
      invoiceNumber: invoice.invoiceNumber,
      publicId: invoice.publicId,
      // issuedAt is when it became a bill (D3); createdAt is the fallback
      // only for a DRAFT preview, which has no issue date yet.
      issueDate: (invoice.issuedAt ?? invoice.createdAt).toISOString().slice(0, 10),
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : null,
      status: invoice.status,
      billToName,
      billToAddress,
      serviceLocation,
      lineItems: lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        amountCents: item.amountCents,
        taxable: item.taxable,
      })),
      subtotalCents: invoice.amountCents,
      taxCents: invoice.taxCents ?? 0,
      totalCents: invoice.totalAmountCents,
      amountPaidCents: invoice.amountPaidCents,
      balanceDueCents: invoice.balanceDueCents,
      noChargeCoveredByAgreement: isFullyAgreementCovered({ totalAmountCents: invoice.totalAmountCents, lines: lineItems }),
      notes: invoice.notes,
      attachedServiceReports,
      branding: {
        orgName: org?.name ?? "PestFlow",
        logoUrl: org?.logoUrl ?? null,
        primaryColorHex: org?.primaryColorHex ?? null,
        remitToName: org?.remitToName ?? null,
        remitToAddress: org?.remitToAddress ?? null,
        remitToEmail: org?.remitToEmail ?? null,
        remitToPhone: org?.remitToPhone ?? null,
      },
    };
  }

  // Idempotent: one INVOICE document per invoice (enforced by the partial
  // unique index in document-bootstrap.ts), since renderInvoicePdf is
  // deterministic and re-rendering would only ever produce a byte-identical
  // copy - there's nothing gained by storing it twice, and the original is
  // what "what you sent is what you can reproduce" refers to.
  async getOrCreateInvoiceDocument(invoiceId: string): Promise<Document | undefined> {
    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, this.orgId), eq(documents.invoiceId, invoiceId), eq(documents.kind, "INVOICE")));
    if (existing) {
      return existing;
    }

    const context = await this.getInvoiceDocumentContext(invoiceId);
    if (!context) {
      return undefined;
    }

    const pdfBuffer = await renderInvoicePdf(context);
    const contentHash = createHash("sha256").update(pdfBuffer).digest("hex");
    const contentBase64 = pdfBuffer.toString("base64");

    // A DRAFT (D3) renders for preview - the document says "Status: DRAFT" -
    // but is never stored. The stored artifact is the byte-for-byte record of
    // what the customer was sent, and a draft's numbers are still subject to
    // change at issue; storing it would pin the wrong document to the invoice
    // forever, since the row above is looked up before rendering.
    if (context.status === "DRAFT") {
      return {
        id: `draft-preview-${invoiceId}`,
        orgId: this.orgId,
        kind: "INVOICE",
        invoiceId,
        serviceRecordId: null,
        statementVariant: null,
        customerId: null,
        locationId: null,
        periodFrom: null,
        periodTo: null,
        generatedByUserId: null,
        generatedByLabel: null,
        contentHash,
        contentBase64,
        mimeType: "application/pdf",
        createdAt: new Date(),
      };
    }

    try {
      const [document] = await db
        .insert(documents)
        .values({
          orgId: this.orgId,
          kind: "INVOICE",
          invoiceId,
          contentHash,
          contentBase64,
          mimeType: "application/pdf",
        })
        .returning();
      return document;
    } catch (err: any) {
      if (err?.code === "23505") {
        const [raceWinner] = await db
          .select()
          .from(documents)
          .where(and(eq(documents.orgId, this.orgId), eq(documents.invoiceId, invoiceId), eq(documents.kind, "INVOICE")));
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(and(eq(documents.orgId, this.orgId), eq(documents.id, id)));
    return doc;
  }

  // ---------------------------------------------------------------------------
  // Service report (PLAN_ROADMAP_V2.md C3.5, Pass 22; B11; canon §12). The
  // invoice document's pattern: storage assembles the context once from the
  // ticket as it stands - the compliance snapshot (technician name and
  // license copied at post), the stored target-pest union, the material rows
  // in the org's vocabulary, the customer and the service location, the
  // org's branding - and renderServiceReportPdf turns it into bytes stored
  // as one `documents` row of kind SERVICE_REPORT keyed by the ticket.
  // Rendered on the first request; every later request answers the stored
  // row. The one way a stored report goes stale is the ticket's content being
  // written again, so every such write (a re-post, an office edit that
  // changed something, a material row added by the legacy route) deletes the
  // row in its own transaction, and the next request renders the ticket as
  // it now stands. Finalize and reopen change no content and keep the report.
  // An invoice PDF that embedded a report keeps what it rendered: the invoice
  // document is never re-rendered (getOrCreateInvoiceDocument).
  // ---------------------------------------------------------------------------

  private async invalidateServiceReportTx(tx: DbTransaction, serviceRecordId: string): Promise<void> {
    await tx.delete(documents).where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "SERVICE_REPORT"), eq(documents.serviceRecordId, serviceRecordId)));
  }

  private serviceReportMaterialLine(row: Omit<InsertProductApplication, "serviceRecordId">): ServiceReportMaterialLine {
    return {
      productName: row.productName,
      epaRegNumber: row.epaRegNumber ?? null,
      amountApplied: row.amountApplied ?? null,
      unit: row.unit ?? null,
      dilutionLabel: row.dilutionLabel ?? null,
      dilutionRate: row.dilutionRate ?? null,
      applicationMethod: row.applicationMethod ?? null,
      device: row.device ?? null,
      applicationAreas: applicationAreasOf(row),
      targetPests: targetPestsOf(row),
    };
  }

  // The parts of the context every report shares, resolved once: the org's
  // branding, the customer's display name, the service location as documents
  // print it (and its name for the file name), the service type's name.
  private async serviceReportPartiesTx(reader: DbReader, input: { customerId: string; locationId: string | null; serviceTypeId: string | null }) {
    const [org] = await reader.select().from(organizations).where(eq(organizations.id, this.orgId));
    const [customer] = await reader.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, input.customerId)));
    const [location] = input.locationId
      ? await reader.select().from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, input.locationId)))
      : [undefined];
    const [serviceType] = input.serviceTypeId
      ? await reader.select().from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), eq(serviceTypes.id, input.serviceTypeId)))
      : [undefined];
    return {
      branding: this.documentBrandingOf(org),
      customerName: this.customerDisplayName(customer),
      serviceLocation: location ? describeServiceLocation(location) : null,
      locationName: location?.name.trim() || null,
      serviceTypeName: serviceType?.name ?? null,
    };
  }

  private async serviceReportFileNameTx(reader: DbReader, record: ServiceRecord): Promise<string> {
    const [location] = record.locationId
      ? await reader.select({ name: locations.name }).from(locations).where(and(eq(locations.orgId, this.orgId), eq(locations.id, record.locationId)))
      : [undefined];
    return serviceReportFileName({ serviceDate: record.serviceDate, locationName: location?.name.trim() || null });
  }

  private async serviceReportContextForRecordTx(reader: DbReader, record: ServiceRecord): Promise<{ context: ServiceReportDocumentContext; fileName: string }> {
    const parties = await this.serviceReportPartiesTx(reader, { customerId: record.customerId, locationId: record.locationId ?? null, serviceTypeId: record.serviceTypeId ?? null });
    const rows = await reader.select().from(productApplications).where(and(eq(productApplications.orgId, this.orgId), eq(productApplications.serviceRecordId, record.id)));
    // The compliance snapshot (canon §12): the name and license copied onto
    // the ticket at post. TRANSITIONAL: a row from before the snapshot
    // existed carries neither, and for it alone the live profile stands in,
    // as the review queue shows it.
    let technicianName = record.technicianName?.trim() || null;
    let technicianLicenseNumber = record.technicianLicenseNumber?.trim() || null;
    if (!technicianName && !technicianLicenseNumber && record.technicianId) {
      const [technician] = await reader.select().from(technicians).where(and(eq(technicians.orgId, this.orgId), eq(technicians.id, record.technicianId)));
      technicianName = technician?.displayName ?? null;
      technicianLicenseNumber = technician?.licenseId ?? null;
    }
    const context: ServiceReportDocumentContext = {
      serviceDate: serviceReportDay(record.serviceDate),
      preview: false,
      customerName: parties.customerName,
      serviceLocation: parties.serviceLocation,
      serviceTypeName: parties.serviceTypeName,
      technicianName,
      technicianLicenseNumber,
      targetPests: targetPestsOf(record),
      areasServiced: record.areasServiced?.trim() || null,
      materials: rows.map((row) => this.serviceReportMaterialLine(row)),
      notes: record.notes?.trim() || null,
      conditionsFound: record.conditionsFound?.trim() || null,
      recommendations: record.recommendations?.trim() || null,
      followUpRequired: !!record.followUpRequired,
      followUpNotes: record.followUpRequired ? record.followUpNotes?.trim() || null : null,
      customerSignature: !!record.customerSignature,
      // Pass 23 (C3.6): the field surcharge the ticket carries.
      surchargeCents: surchargeOf(record).surchargeCents,
      surchargeLabel: surchargeOf(record).surchargeLabel,
      branding: parties.branding,
    };
    return { context, fileName: serviceReportFileName({ serviceDate: record.serviceDate, locationName: parties.locationName }) };
  }

  async getServiceReportDocumentContext(serviceRecordId: string): Promise<ServiceReportDocumentContext | undefined> {
    const [record] = await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, serviceRecordId)));
    if (!record) {
      return undefined;
    }
    return (await this.serviceReportContextForRecordTx(db, record)).context;
  }

  // Idempotent: one SERVICE_REPORT document per ticket (the partial unique
  // index in document-bootstrap.ts). The stored row answers until a write to
  // the ticket's content retires it (invalidateServiceReportTx); a request
  // then finds no row and renders the ticket as it now stands.
  async getOrCreateServiceReportDocument(serviceRecordId: string): Promise<ServiceReportDocumentResult | undefined> {
    const [record] = await db.select().from(serviceRecords).where(and(eq(serviceRecords.orgId, this.orgId), eq(serviceRecords.id, serviceRecordId)));
    if (!record) {
      return undefined;
    }
    const [existing] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "SERVICE_REPORT"), eq(documents.serviceRecordId, serviceRecordId)));
    if (existing) {
      return { document: existing, fileName: await this.serviceReportFileNameTx(db, record) };
    }

    const { context, fileName } = await this.serviceReportContextForRecordTx(db, record);
    const pdfBuffer = await renderServiceReportPdf(context);
    const contentHash = createHash("sha256").update(pdfBuffer).digest("hex");
    const contentBase64 = pdfBuffer.toString("base64");
    try {
      const [document] = await db
        .insert(documents)
        .values({
          orgId: this.orgId,
          kind: "SERVICE_REPORT",
          invoiceId: null,
          serviceRecordId: record.id,
          customerId: record.customerId,
          locationId: record.locationId ?? null,
          contentHash,
          contentBase64,
          mimeType: "application/pdf",
        })
        .returning();
      return { document, fileName };
    } catch (err: any) {
      if (err?.code === "23505") {
        const [raceWinner] = await db
          .select()
          .from(documents)
          .where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "SERVICE_REPORT"), eq(documents.serviceRecordId, serviceRecordId)));
        if (raceWinner) {
          return { document: raceWinner, fileName };
        }
      }
      throw err;
    }
  }

  // The collect step's "Preview report": the report of an UNPOSTED ticket,
  // rendered from the dialog's content exactly as a post would store it -
  // the materials in the org's vocabulary, the target pests as the picks plus
  // every row's, the technician resolved as the post resolves them (the
  // body's, else the service's, else the appointment's, name and license from
  // the profile) - and never stored. The body's service type is printed as
  // sent: the post applies it only under its override rule, but the preview
  // writes nothing, so nothing is at stake in showing what was picked.
  async renderServiceReportPreview(input: ServiceReportPreviewInput): Promise<ServiceReportPreviewResult | undefined> {
    const [service] = await db.select().from(services).where(and(eq(services.orgId, this.orgId), eq(services.id, input.serviceId)));
    if (!service) {
      return undefined;
    }
    const appointmentId = input.appointmentId || service.appointmentId || null;
    const [appointment] = appointmentId
      ? await db.select().from(appointments).where(and(eq(appointments.orgId, this.orgId), eq(appointments.id, appointmentId)))
      : [undefined];
    const vocabulary = await this.readMaterialVocabularyTx(db as any);
    const rows = normalizeProductApplicationInputs(input.productApplications, vocabulary);
    const technicianSnapshot = await this.resolveServiceRecordTechnicianSnapshot(db as any, {
      serviceId: service.id,
      appointmentId: appointment?.id ?? null,
      technicianId: input.technicianId || service.assignedTechnicianId || appointment?.assignedTechnicianId || null,
      technicianName: null,
      technicianLicenseNumber: null,
    });
    const parties = await this.serviceReportPartiesTx(db, {
      customerId: service.customerId,
      locationId: service.locationId,
      serviceTypeId: input.serviceTypeId ?? service.serviceTypeId ?? null,
    });
    const followUpRequired = input.followUpRequired ?? false;
    const context: ServiceReportDocumentContext = {
      serviceDate: serviceReportDay(input.serviceDate),
      preview: true,
      customerName: parties.customerName,
      serviceLocation: parties.serviceLocation,
      serviceTypeName: parties.serviceTypeName,
      technicianName: technicianSnapshot.technicianName,
      technicianLicenseNumber: technicianSnapshot.technicianLicenseNumber,
      targetPests: deriveStoredTargetPests(vocabulary.pests, input.targetPests, rows) ?? [],
      areasServiced: deriveAreasServiced(rows) ?? (input.areasServiced?.trim() || null),
      materials: rows.map((row) => this.serviceReportMaterialLine(row)),
      notes: input.notes?.trim() || null,
      conditionsFound: input.conditionsFound?.trim() || null,
      recommendations: input.recommendations?.trim() || null,
      followUpRequired,
      followUpNotes: followUpRequired ? input.followUpNotes?.trim() || null : null,
      customerSignature: input.customerSignature ?? false,
      // Pass 23 (C3.6): the surcharge as typed, as the post would store it.
      surchargeCents: normalizeSurcharge(input).surchargeCents,
      surchargeLabel: normalizeSurcharge(input).surchargeLabel,
      branding: parties.branding,
    };
    const pdf = await renderServiceReportPdf(context);
    return { pdf, fileName: serviceReportFileName({ serviceDate: input.serviceDate, locationName: parties.locationName }) };
  }

  // ---------------------------------------------------------------------------
  // Statements (PLAN_ROADMAP_V2.md C2.5, Pass 15; B5). The invoice document's
  // pattern: storage assembles the context once - the customer's ledger rows
  // handed to the pure summarizers in shared/statements.ts, the parties
  // resolved by the invoice's own Bill To rule (Pass 11c), the org's
  // branding - and renderStatementPdf turns it into bytes that are stored
  // as one `documents` row of kind STATEMENT with the statement's identity
  // (variant, customer, location, period, who asked). On request only:
  // nothing here runs on a schedule, and a stored statement is never
  // re-rendered - a second request is a second row, byte-identical when the
  // ledger has not moved, so what the office sent can always be reproduced.
  // ---------------------------------------------------------------------------

  private statementInfoOf(row: Omit<Document, "contentBase64">): StatementInfo {
    return {
      id: row.id,
      variant: (row.statementVariant ?? "LOCATION") as StatementVariant,
      customerId: row.customerId ?? "",
      locationId: row.locationId ?? null,
      periodFrom: row.periodFrom ?? null,
      periodTo: row.periodTo ?? row.createdAt.toISOString().slice(0, 10),
      generatedAt: row.createdAt.toISOString(),
      generatedByLabel: row.generatedByLabel ?? null,
      contentHash: row.contentHash,
      mimeType: row.mimeType,
    };
  }

  private readonly statementInfoColumns = {
    id: documents.id,
    orgId: documents.orgId,
    kind: documents.kind,
    invoiceId: documents.invoiceId,
    serviceRecordId: documents.serviceRecordId,
    statementVariant: documents.statementVariant,
    customerId: documents.customerId,
    locationId: documents.locationId,
    periodFrom: documents.periodFrom,
    periodTo: documents.periodTo,
    generatedByUserId: documents.generatedByUserId,
    generatedByLabel: documents.generatedByLabel,
    contentHash: documents.contentHash,
    mimeType: documents.mimeType,
    createdAt: documents.createdAt,
  };

  private documentBrandingOf(org: Organization | undefined): InvoiceDocumentBranding {
    return {
      orgName: org?.name ?? "PestFlow",
      logoUrl: org?.logoUrl ?? null,
      primaryColorHex: org?.primaryColorHex ?? null,
      remitToName: org?.remitToName ?? null,
      remitToAddress: org?.remitToAddress ?? null,
      remitToEmail: org?.remitToEmail ?? null,
      remitToPhone: org?.remitToPhone ?? null,
    };
  }

  private customerDisplayName(customer: Customer | undefined): string {
    if (!customer) return "Customer";
    return customer.companyName?.trim() || `${customer.firstName} ${customer.lastName}`.trim() || "Customer";
  }

  // The customer's whole ledger as the summarizers want it: every invoice
  // (with its first line's description as the statement's summary of it),
  // every payment and credit memo, and every application to the customer's
  // invoices - an application is fenced to its invoice's location, so this
  // is also every application of the customer's payments and memos. The
  // summarizer scopes the rows to a location; it does not re-fetch.
  private async statementLedgerForCustomerTx(reader: DbReader, customerId: string): Promise<StatementLedgerInput> {
    const invoiceRows = await reader.select().from(invoices).where(and(eq(invoices.orgId, this.orgId), eq(invoices.customerId, customerId)));
    const invoiceIds = invoiceRows.map((invoice) => invoice.id);
    const lineRows = invoiceIds.length
      ? await reader
          .select({ invoiceId: invoiceLineItems.invoiceId, description: invoiceLineItems.description, sortOrder: invoiceLineItems.sortOrder })
          .from(invoiceLineItems)
          .where(and(eq(invoiceLineItems.orgId, this.orgId), inArray(invoiceLineItems.invoiceId, invoiceIds)))
          .orderBy(asc(invoiceLineItems.sortOrder))
      : [];
    const descriptionsByInvoice = new Map<string, string[]>();
    for (const line of lineRows) {
      const list = descriptionsByInvoice.get(line.invoiceId) ?? [];
      list.push(line.description);
      descriptionsByInvoice.set(line.invoiceId, list);
    }
    const paymentRows = await reader.select().from(payments).where(and(eq(payments.orgId, this.orgId), eq(payments.customerId, customerId)));
    const creditRows = await reader.select().from(creditMemos).where(and(eq(creditMemos.orgId, this.orgId), eq(creditMemos.customerId, customerId)));
    const paymentApplicationRows = invoiceIds.length
      ? await reader.select().from(paymentApplications).where(and(eq(paymentApplications.orgId, this.orgId), inArray(paymentApplications.invoiceId, invoiceIds)))
      : [];
    const creditApplicationRows = invoiceIds.length
      ? await reader.select().from(creditApplications).where(and(eq(creditApplications.orgId, this.orgId), inArray(creditApplications.invoiceId, invoiceIds)))
      : [];
    return {
      invoices: invoiceRows.map((invoice) => {
        const descriptions = descriptionsByInvoice.get(invoice.id) ?? [];
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          locationId: invoice.locationId ?? null,
          status: invoice.status,
          issuedAt: invoice.issuedAt ?? null,
          totalAmountCents: invoice.totalAmountCents,
          summary: descriptions.length ? `${descriptions[0]}${descriptions.length > 1 ? ` (+${descriptions.length - 1} more)` : ""}` : null,
        };
      }),
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        customerId: payment.customerId,
        locationId: payment.locationId,
        status: payment.status,
        method: payment.method,
        checkNumber: payment.checkNumber ?? null,
        referenceNumber: payment.referenceNumber ?? null,
        amountCents: payment.amountCents,
        receivedAt: payment.receivedAt,
        refundedAt: payment.refundedAt ?? null,
      })),
      creditMemos: creditRows.map((memo) => ({
        id: memo.id,
        customerId: memo.customerId,
        locationId: memo.locationId,
        status: memo.status,
        reasonCode: memo.reasonCode,
        amountCents: memo.amountCents,
        issuedAt: memo.issuedAt,
      })),
      applications: [
        ...paymentApplicationRows.map((row) => ({
          id: row.id,
          sourceKind: "payment" as const,
          sourceId: row.paymentId,
          invoiceId: row.invoiceId,
          amountCents: row.amountCents,
          appliedAt: row.appliedAt,
          released: row.released,
        })),
        ...creditApplicationRows.map((row) => ({
          id: row.id,
          sourceKind: "credit_memo" as const,
          sourceId: row.creditMemoId,
          invoiceId: row.invoiceId,
          amountCents: row.amountCents,
          appliedAt: row.appliedAt,
          released: row.released,
        })),
      ],
    };
  }

  // Who the statement is addressed to: the invoice's Bill To rule (Pass
  // 11c) - the billing profile's address, else a location override's own,
  // else the customer's primary location's - resolved now rather than
  // frozen earlier, since a statement is generated on request from the
  // ledger as it stands.
  private async statementBillToTx(reader: DbReader, location: Location): Promise<StatementDocumentParty> {
    const profile = (await this.resolveBillingProfileForLocation(location.id)) ?? null;
    const parties = await this.resolveInvoicePartiesTx(reader, location, profile);
    return { name: parties.billTo.name, address: parties.billTo.address };
  }

  private async storeStatementDocument(input: {
    variant: StatementVariant;
    customerId: string;
    locationId: string | null;
    periodFrom: string | null;
    periodTo: string;
    context: StatementDocumentContext;
    actor?: AuditActor | null;
  }): Promise<StatementInfo> {
    const pdfBuffer = await renderStatementPdf(input.context);
    const [row] = await db
      .insert(documents)
      .values({
        orgId: this.orgId,
        kind: "STATEMENT",
        invoiceId: null,
        statementVariant: input.variant,
        customerId: input.customerId,
        locationId: input.locationId,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        generatedByUserId: input.actor?.userId ?? null,
        generatedByLabel: input.actor?.actorLabel ?? null,
        contentHash: createHash("sha256").update(pdfBuffer).digest("hex"),
        contentBase64: pdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      })
      .returning();
    return this.statementInfoOf(row);
  }

  async generateLocationStatement(locationId: string, period: StatementPeriod, actor?: AuditActor | null): Promise<StatementGenerateResult<LocationStatement> | undefined> {
    const location = await this.getLocation(locationId);
    if (!location) {
      return undefined;
    }
    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, location.customerId)));
    const [org] = await db.select().from(organizations).where(eq(organizations.id, this.orgId));
    const ledger = await this.statementLedgerForCustomerTx(db, location.customerId);
    const data = summarizeLocationStatement(ledger, location.id, period);
    const context: StatementDocumentContext = {
      variant: "LOCATION",
      statementDate: agingAsOf(),
      customerName: this.customerDisplayName(customer),
      billTo: await this.statementBillToTx(db, location),
      location: describeServiceLocation(location),
      statement: data,
      branding: this.documentBrandingOf(org),
    };
    const statement = await this.storeStatementDocument({ variant: "LOCATION", customerId: location.customerId, locationId: location.id, periodFrom: period.from, periodTo: period.to, context, actor });
    return { statement, data };
  }

  // Keyed on the CUSTOMER, as the aging rollup is: the canonical Account
  // (accounts, one per customer today) has no screen and no read of its own,
  // and locations.accountId and locations.customerId select the same rows.
  // The customer header is the surface, so the customer is the key.
  async generateAccountStatement(customerId: string, period: StatementPeriod, actor?: AuditActor | null): Promise<StatementGenerateResult<AccountStatement> | undefined> {
    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, customerId)));
    if (!customer) {
      return undefined;
    }
    const [org] = await db.select().from(organizations).where(eq(organizations.id, this.orgId));
    const customerLocations = await this.getLocations(customerId);
    const ledger = await this.statementLedgerForCustomerTx(db, customerId);
    const data = summarizeAccountStatement(
      ledger,
      customerId,
      customerLocations.map((location) => ({ id: location.id, name: location.name.trim() || null, address: formatLocationAddress(location), isPrimary: !!location.isPrimary })),
      period,
    );
    const customerName = this.customerDisplayName(customer);
    const anchor = customerLocations.find((location) => location.isPrimary) ?? customerLocations[0];
    const primary = anchor ? await this.getPrimaryLocationTx(db, anchor) : undefined;
    const context: StatementDocumentContext = {
      variant: "ACCOUNT",
      statementDate: agingAsOf(),
      customerName,
      billTo: primary ? await this.statementBillToTx(db, primary) : { name: customerName, address: null },
      statement: data,
      branding: this.documentBrandingOf(org),
    };
    const statement = await this.storeStatementDocument({ variant: "ACCOUNT", customerId, locationId: null, periodFrom: period.from, periodTo: period.to, context, actor });
    return { statement, data };
  }

  // Refused, not reworded, when the location still owes something (see
  // zeroBalanceLetterRefusal): the office generates a location statement
  // for a balance due. The agreements are listed with their status as they
  // stand - ACTIVE and CANCELLED in the data today; canon §9 also names
  // PAUSED and EXPIRED, which the label helper already knows.
  async generateZeroBalanceLetter(locationId: string, actor?: AuditActor | null): Promise<StatementGenerateResult<ZeroBalanceLetter> | undefined> {
    const location = await this.getLocation(locationId);
    if (!location) {
      return undefined;
    }
    const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, this.orgId), eq(customers.id, location.customerId)));
    const [org] = await db.select().from(organizations).where(eq(organizations.id, this.orgId));
    const ledger = await this.statementLedgerForCustomerTx(db, location.customerId);
    const agreementRows = await this.getAgreementsByLocation(location.id);
    const serviceTypeIds = Array.from(new Set(agreementRows.map((agreement) => agreement.serviceTypeId).filter((id): id is string => !!id)));
    const serviceTypeRows = serviceTypeIds.length
      ? await db.select({ id: serviceTypes.id, name: serviceTypes.name }).from(serviceTypes).where(and(eq(serviceTypes.orgId, this.orgId), inArray(serviceTypes.id, serviceTypeIds)))
      : [];
    const serviceTypeNameById = new Map(serviceTypeRows.map((row) => [row.id, row.name]));
    const agreementsForLetter: ZeroBalanceLetterAgreement[] = agreementRows.map((agreement) => ({
      id: agreement.id,
      agreementName: agreement.agreementName,
      status: agreement.status,
      serviceTypeName: (agreement.serviceTypeId ? serviceTypeNameById.get(agreement.serviceTypeId) : undefined) ?? agreement.serviceTemplateName ?? null,
      startDate: String(agreement.startDate),
      renewalDate: agreement.renewalDate ? String(agreement.renewalDate) : null,
      nextServiceDate: agreement.nextServiceDate ? String(agreement.nextServiceDate) : null,
      cancelledAt: agreement.cancelledAt ? agreement.cancelledAt.toISOString() : null,
      cancellationEffectiveDate: agreement.cancellationEffectiveDate ? String(agreement.cancellationEffectiveDate) : null,
    }));
    const asOf = agingAsOf();
    const data = buildZeroBalanceLetter(ledger, location.id, asOf, agreementsForLetter);
    const refusal = zeroBalanceLetterRefusal(data);
    if (refusal) {
      throw new StatementRefusedError(LOCATION_HAS_BALANCE, refusal, data.openBalanceCents);
    }
    const context: StatementDocumentContext = {
      variant: "ZERO_BALANCE_LETTER",
      statementDate: asOf,
      customerName: this.customerDisplayName(customer),
      billTo: await this.statementBillToTx(db, location),
      location: describeServiceLocation(location),
      letter: data,
      branding: this.documentBrandingOf(org),
    };
    const statement = await this.storeStatementDocument({ variant: "ZERO_BALANCE_LETTER", customerId: location.customerId, locationId: location.id, periodFrom: null, periodTo: asOf, context, actor });
    return { statement, data };
  }

  async listStatementsByLocation(locationId: string): Promise<StatementInfo[]> {
    const rows = await db
      .select(this.statementInfoColumns)
      .from(documents)
      .where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "STATEMENT"), eq(documents.locationId, locationId)))
      .orderBy(desc(documents.createdAt));
    return rows.map((row) => this.statementInfoOf(row));
  }

  async listStatementsByCustomer(customerId: string): Promise<StatementInfo[]> {
    const rows = await db
      .select(this.statementInfoColumns)
      .from(documents)
      .where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "STATEMENT"), eq(documents.customerId, customerId)))
      .orderBy(desc(documents.createdAt));
    return rows.map((row) => this.statementInfoOf(row));
  }

  async getStatement(id: string): Promise<StatementInfo | undefined> {
    const [row] = await db
      .select(this.statementInfoColumns)
      .from(documents)
      .where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "STATEMENT"), eq(documents.id, id)));
    return row ? this.statementInfoOf(row) : undefined;
  }

  async getStatementDocument(id: string): Promise<Document | undefined> {
    const [row] = await db.select().from(documents).where(and(eq(documents.orgId, this.orgId), eq(documents.kind, "STATEMENT"), eq(documents.id, id)));
    return row;
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
