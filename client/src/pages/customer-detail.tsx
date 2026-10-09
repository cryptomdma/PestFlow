import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useSearch, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { invalidateAuditViews, invalidateBillingProfileViews } from "@/lib/invalidate-audit-views";
import {
  BILLING_TYPES,
  INVOICE_TERMS,
  describeBillingProfileTerms,
  describeBillingType,
  describeLocationBilling,
  type BillingDefaults,
  type BillingProfileSummary,
  type LocationBillingProjection,
} from "@shared/billing-profile-defaults";
import { describeInvoiceTerms } from "@shared/invoice-detail";
import { AGREEMENT_UNITS, AGREEMENT_UNIT_LABELS, SCHEDULING_MODES, SCHEDULING_MODE_LABELS, describeAgreementCadence, describeAgreementType, describeSchedulingModeLabel, type AgreementTypeUsage } from "@shared/agreement-types";
import { CONTACT_PRIMARY_LOCKED_NOTE } from "@shared/contacts";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { OpportunityDispositionDialog } from "@/components/opportunity-disposition-dialog";
import { OpportunityHistoryDialog } from "@/components/opportunity-history-dialog";
import { OpportunityConvertDialog } from "@/components/opportunity-convert-dialog";
import { OpportunityTaxonomyChips } from "@/components/opportunity-taxonomy-chips";
import { ServiceCompletionDialog } from "@/components/service-completion-dialog";
import { ServiceCancelDialog } from "@/components/service-cancel-dialog";
import { ServiceReportActions } from "@/components/service-report-actions";
import { DraftInvoiceVoidPrompt, getDraftInvoiceDecisionRequired, type DraftInvoiceRef } from "@/components/draft-invoice-void-prompt";
import { resolveServiceScheduleState, SERVICE_SCHEDULE_STATE_LABELS, type ServiceScheduleState } from "@shared/appointment-disposition";
import { BillingPlanPill, useBillingPlanById } from "@/components/billing-plan-pill";
import {
  InvoiceOnFinalizePrompt,
  describeFinalizeResult,
  getInvoiceOnFinalizePrompt,
  invalidateInvoiceViews,
  type FinalizeServiceRecordResponse,
  type InvoiceOnFinalizePromptState,
} from "@/components/invoice-on-finalize-prompt";
import { useAuth } from "@/hooks/use-auth";
import { can, describePermissionHolders, PERMISSIONS } from "@shared/permissions";
import { formatReopenReason } from "@shared/ticket-reopen";
import { formatApplicationAreas, formatTargetPests } from "@shared/material-lists";
import { selectableUsers, userDisplayName } from "@shared/users";
import type { UserSummary } from "@shared/schema";
import { formatPhoneDisplay } from "@shared/phone";
import { AuditLogEntryCard, useAuditLogRevert } from "@/components/audit-log-entry-card";
import { CustomerHistorySheet } from "@/components/customer-history-sheet";
import { dollarsToCents, centsToDollars, centsToDollarString, formatCents } from "@shared/money";
import { describeSurcharge } from "@shared/field-surcharge";
import { SERVICE_WORK_KINDS, canAnswerService, defaultWorkKindForService, describeAnswersLink, describeServiceWorkKind, formatServiceWorkKind, normalizeServiceWorkKind, workKindOverridePermission } from "@shared/service-kind";
import { ServiceWorkKindBadge, ServiceWorkKindListBadge } from "@/components/service-work-kind-badge";
import { FieldAddedBadge, MarkFieldReviewedButton } from "@/components/field-added-badge";
import {
  TechnicianPreferenceChips,
  TechnicianPreferenceDraftEditor,
  TechnicianPreferencesEditor,
  invalidateTechnicianPreferences,
  useLocationTechnicianPreferences,
  type TechnicianPreferenceDraft,
} from "@/components/technician-preferences";
import { describeBillingPlanBehavior } from "@shared/billing-plan";
import { describeInitialCharge, formatInitialChargeType, initialChargeFromTemplate, type AgreementInitialChargeStatus, type InitialChargeDue } from "@shared/initial-charge";
import { InitialChargeFormFields, initialChargeFieldsFrom, initialChargeFormStateFrom, validateInitialChargeFormState } from "@/components/initial-charge-fields";
import { InitialChargeDuePrompt, type WithInitialChargeDue } from "@/components/initial-charge-due-prompt";
import { InvoiceRowLedger, LocationLedgerPanel } from "@/components/location-ledger-panel";
import { InvoiceDetailDialog } from "@/components/invoice-detail-dialog";
import { StatementDialog } from "@/components/statement-dialog";
import { CustomerAgingChips, LocationAgingStrip, LocationAgingSummaryRow } from "@/components/aging-strip";
import type { CustomerAging } from "@shared/aging";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import {
  ArrowLeft, Mail, Phone, MapPin, Plus, Calendar, FileText, MessageSquare,
  ClipboardList, Building2, User, ChevronDown, ArrowUpRight, StickyNote,
  History,
  CreditCard, KeyRound, Ruler, ChevronUp, Check, Link2, Target,
} from "lucide-react";
import type { Account, AuditLog, Customer, Contact, Location, Appointment, Invoice, Service, ServiceRecord, ProductApplication, Communication, CustomerNote, BillingPlan, BillingProfile, BillingProfileTemplate, NoteRevision, Agreement, AgreementCancellationPolicy, AgreementTemplate, AgreementType, ServiceType, Technician, Opportunity, OpportunityCategory, OpportunityDisposition } from "@shared/schema";

interface CustomerDetailCompatResponse {
  legacyCustomer: Customer;
  account: Account;
  primaryLocation: Location;
  selectedLocation: Location;
  relatedLocations: Location[];
  /** Pass 34 (C5.2): the selected location's resolved billing, by the invoices' own resolver. */
  billing: LocationBillingProjection;
  /** The account's active default profile; null when the account has none. */
  accountDefault: BillingProfileSummary | null;
  /** The locations of the account with an active override (billing_profiles.location_id). */
  billingOverrideLocationIds: string[];
}

// Pass 34 (C5.2): the fields a screen types on a billing profile - the label,
// the type, the terms (when the type is invoice terms), the billing name and
// the Bill To address. The card / ACH tokens and the last four are Phase 6's
// capture (C6.1) and never appear here; the routes refuse them.
interface BillingProfileFormState {
  label: string;
  billingType: string;
  invoiceTerms: string;
  billingName: string;
  billingAddress: string;
}

const EMPTY_BILLING_PROFILE_FORM: BillingProfileFormState = { label: "", billingType: "invoice_terms", invoiceTerms: "", billingName: "", billingAddress: "" };

function billingProfileFormFrom(profile: BillingProfile | null | undefined): BillingProfileFormState {
  if (!profile) return EMPTY_BILLING_PROFILE_FORM;
  return {
    label: profile.label ?? "",
    billingType: profile.billingType ?? "invoice_terms",
    invoiceTerms: profile.invoiceTerms ?? "",
    billingName: profile.billingName ?? "",
    billingAddress: profile.billingAddress ?? "",
  };
}

/** A new account default starts from the org default template (Settings -> Billing defaults) when one is set. */
function billingProfileFormFromTemplate(template: BillingProfileTemplate | null | undefined): BillingProfileFormState {
  if (!template) return EMPTY_BILLING_PROFILE_FORM;
  return {
    label: template.name,
    billingType: template.billingType,
    invoiceTerms: template.billingType === "invoice_terms" ? template.defaultInvoiceTerms ?? "" : "",
    billingName: "",
    billingAddress: "",
  };
}

/** The fields POST / PATCH /api/billing-profiles take from the form. */
function billingProfilePayload(form: BillingProfileFormState) {
  return {
    label: form.label.trim(),
    billingType: form.billingType,
    invoiceTerms: form.billingType === "invoice_terms" && form.invoiceTerms ? form.invoiceTerms : null,
    billingName: form.billingName.trim() || null,
    billingAddress: form.billingAddress.trim() || null,
  };
}

function billingProfileFormChanged(form: BillingProfileFormState, profile: BillingProfile): boolean {
  const next = billingProfilePayload(form);
  return next.label !== profile.label
    || next.billingType !== profile.billingType
    || (next.invoiceTerms ?? null) !== (profile.invoiceTerms ?? null)
    || (next.billingName ?? null) !== (profile.billingName ?? null)
    || (next.billingAddress ?? null) !== (profile.billingAddress ?? null);
}

/** The account's active default among its profiles: isDefault first, else the first account-level row (the resolver's order). */
function pickAccountDefaultProfile(profiles: BillingProfile[] | undefined): BillingProfile | null {
  const accountLevel = (profiles ?? []).filter((profile) => !profile.locationId && profile.status === "active");
  return accountLevel.find((profile) => profile.isDefault) ?? accountLevel[0] ?? null;
}

function pickLocationOverrideProfile(profiles: BillingProfile[] | undefined, locationId: string): BillingProfile | null {
  return (profiles ?? []).find((profile) => profile.locationId === locationId && profile.status === "active") ?? null;
}

function BillingProfileFields({ form, onChange, idPrefix }: { form: BillingProfileFormState; onChange: (next: BillingProfileFormState) => void; idPrefix: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-label`}>Label *</Label>
          <Input id={`${idPrefix}-label`} data-testid={`input-${idPrefix}-label`} placeholder="e.g. Net 30 invoice, Corporate card" value={form.label} onChange={(e) => onChange({ ...form, label: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-type`}>Billing Type</Label>
          <Select value={form.billingType} onValueChange={(value) => onChange({ ...form, billingType: value, invoiceTerms: value === "invoice_terms" ? form.invoiceTerms : "" })}>
            <SelectTrigger id={`${idPrefix}-type`} data-testid={`select-${idPrefix}-type`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {BILLING_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{describeBillingType(type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.billingType === "invoice_terms" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-terms`}>Invoice Terms</Label>
          <Select value={form.invoiceTerms || "NONE"} onValueChange={(value) => onChange({ ...form, invoiceTerms: value === "NONE" ? "" : value })}>
            <SelectTrigger id={`${idPrefix}-terms`} data-testid={`select-${idPrefix}-terms`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Unset - invoices get no due date</SelectItem>
              {INVOICE_TERMS.map((terms) => (
                <SelectItem key={terms} value={terms}>{describeInvoiceTerms(terms)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-billing-name`}>Billing Name</Label>
        <Input id={`${idPrefix}-billing-name`} data-testid={`input-${idPrefix}-billing-name`} placeholder="Who invoices are addressed to; blank uses the customer's name" value={form.billingName} onChange={(e) => onChange({ ...form, billingName: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-billing-address`}>Billing Address</Label>
        <Textarea id={`${idPrefix}-billing-address`} data-testid={`input-${idPrefix}-billing-address`} rows={2} placeholder="The Bill To address; blank uses the primary location's (an override's own location for an override)" value={form.billingAddress} onChange={(e) => onChange({ ...form, billingAddress: e.target.value })} />
      </div>
      {(form.billingType === "card" || form.billingType === "ach") && (
        <p className="text-xs text-muted-foreground" data-testid={`text-${idPrefix}-capture-note`}>
          Card and bank details are not captured yet: this records the arrangement only. Capturing a card or account on file is a later phase.
        </p>
      )}
    </div>
  );
}

type LocationBillingMode = "INHERIT" | "OVERRIDE";

// The selector both location dialogs show: inherit the account default (the
// row's label and terms shown, or that there is none yet) or override for
// this location, with the override's own fields.
function LocationBillingSelector({
  mode,
  onModeChange,
  form,
  onFormChange,
  accountDefault,
  idPrefix,
  isPrimary,
}: {
  mode: LocationBillingMode;
  onModeChange: (mode: LocationBillingMode) => void;
  form: BillingProfileFormState;
  onFormChange: (next: BillingProfileFormState) => void;
  accountDefault: { label: string; billingType: string; invoiceTerms: string | null } | null;
  idPrefix: string;
  isPrimary: boolean;
}) {
  const accountDefaultTerms = accountDefault ? describeBillingProfileTerms(accountDefault, describeInvoiceTerms) : null;
  return (
    <div className="space-y-3">
      <RadioGroup value={mode} onValueChange={(value) => onModeChange(value as LocationBillingMode)} className="gap-3">
        <div className="flex items-start gap-2">
          <RadioGroupItem value="INHERIT" id={`${idPrefix}-inherit`} data-testid={`radio-${idPrefix}-inherit`} className="mt-0.5" />
          <Label htmlFor={`${idPrefix}-inherit`} className="space-y-0.5 font-normal">
            <span className="block font-medium text-foreground">Use the account default</span>
            <span className="block text-muted-foreground" data-testid={`text-${idPrefix}-account-default`}>
              {accountDefault
                ? `${accountDefault.label}${accountDefaultTerms ? ` · ${accountDefaultTerms}` : ""}`
                : isPrimary
                  ? "No account default yet - the account default above creates one."
                  : "No account default yet - this location has no billing profile until one is set on the primary location."}
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="OVERRIDE" id={`${idPrefix}-override`} data-testid={`radio-${idPrefix}-override`} className="mt-0.5" />
          <Label htmlFor={`${idPrefix}-override`} className="space-y-0.5 font-normal">
            <span className="block font-medium text-foreground">Override for this location</span>
            <span className="block text-muted-foreground">Its own label, type, terms and Bill To; invoices for this location use it instead of the account default.</span>
          </Label>
        </div>
      </RadioGroup>
      {mode === "OVERRIDE" && (
        <div className="rounded-md border bg-muted/20 p-3">
          <BillingProfileFields form={form} onChange={onFormChange} idPrefix={`${idPrefix}-override`} />
        </div>
      )}
    </div>
  );
}

interface UpdateLocationProfileResponse {
  customer?: Customer;
  location: Location;
}

interface LocationBalanceSummary {
  locationId: string;
  openBalanceCents: number;
  totalInvoicedCents: number;
  invoiceCount: number;
  /** D5: confirmed payments and credit memos not yet applied to any invoice. */
  unappliedBalanceCents: number;
}

// D4 as corrected on 2026-09-21 (Pass 11d): where the agreement's initial
// charge stands. A down payment rides the first visit's invoice by itself;
// the button is the explicit up-front path - a deposit invoice before the
// visit - and the only path for the other charge types. Once billed: which
// invoice, a visit's or the standalone. Settled outside the ledger: the rows
// the Pass 11d migration marked, whose deposit no invoice ever carries.
function AgreementInitialChargeStatus({ agreement }: { agreement: Agreement }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canIssue = can(user?.role ?? "", PERMISSIONS.GENERATE_INVOICE);
  const { data: status, isLoading } = useQuery<AgreementInitialChargeStatus>({
    queryKey: ["/api/agreements", agreement.id, "initial-charge-status"],
    enabled: !!agreement.initialChargeType,
  });
  const issueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/agreements/${agreement.id}/issue-initial-charge`, {});
      return (await response.json()) as Invoice;
    },
    onSuccess: (issued) => {
      invalidateInvoiceViews();
      toast({ title: `Initial charge issued up front as ${issued.invoiceNumber}`, description: `${formatCents(issued.totalAmountCents)} due.` });
    },
    onError: (error: Error) => toast({ title: "Unable to issue the initial charge", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (!agreement.initialChargeType || isLoading || !status || status.kind === "NONE") return null;
  if (status.kind === "SETTLED_OUTSIDE_LEDGER") {
    return (
      <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-agreement-initial-charge-settled-${agreement.id}`}>
        {formatInitialChargeType(agreement.initialChargeType)}{status.amountCents != null ? ` of ${formatCents(status.amountCents)}` : ""} settled outside the ledger; no invoice carries it.
      </p>
    );
  }
  if (status.kind === "ISSUED" && status.invoice) {
    const invoice = status.invoice;
    return (
      <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-agreement-initial-charge-invoice-${agreement.id}`}>
        Invoiced as {invoice.invoiceNumber} ({invoice.appointmentId ? "first visit" : "up front"}): {formatCents(invoice.totalAmountCents)}, {invoice.balanceDueCents > 0 ? `${formatCents(invoice.balanceDueCents)} due` : "paid"}.
      </p>
    );
  }
  const voided = status.invoice?.status === "VOID" ? `${status.invoice.invoiceNumber} was voided. ` : "";
  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground" data-testid={`text-agreement-initial-charge-uninvoiced-${agreement.id}`}>
      <span>
        {voided}
        {status.message ? `Not yet invoiced: ${status.message}.` : status.ridesFirstVisit ? "Billed on the first visit's invoice." : "Not yet invoiced."}
      </span>
      {canIssue && agreement.status !== "CANCELLED" && !status.message ? (
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending} data-testid={`button-issue-initial-charge-${agreement.id}`}>
          {issueMutation.isPending ? "Issuing..." : status.ridesFirstVisit ? "Issue up front instead" : "Issue initial charge invoice"}
        </Button>
      ) : null}
    </div>
  );
}

const BASE_LOCATION_TYPE_OPTIONS = ["residential", "commercial"] as const;
const BASE_SOURCE_OPTIONS = ["Google", "Youtube", "Referal", "Facebook"] as const;
const CONTACT_PHONE_TYPE_OPTIONS = ["mobile", "home", "work", "fax"] as const;
const DEFAULT_TIME_WINDOW_OPTIONS = [
  "8:00am-9:00am",
  "9:00am-11:00am",
  "11:00am-1:00pm",
  "1:00pm-3:00pm",
  "3:00pm-5:00pm",
] as const;

function buildOptions(currentValue: string | null | undefined, baseOptions: readonly string[]) {
  if (!currentValue || baseOptions.includes(currentValue)) {
    return [...baseOptions];
  }

  return [currentValue, ...baseOptions];
}

function formatOptionLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeValue(value: string | Date | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "Not tracked";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function getServiceDisplayDate(service: Service, appointment?: Appointment | null, serviceRecord?: ServiceRecord | null) {
  if (serviceRecord?.serviceDate) {
    return {
      label: formatDateTimeValue(serviceRecord.serviceDate),
      source: "completed",
    };
  }

  if (appointment?.scheduledDate) {
    return {
      label: formatDateTimeValue(appointment.scheduledDate),
      source: "scheduled",
    };
  }

  return {
    label: formatDateOnly(service.dueDate),
    source: "due",
  };
}

// Pass 27 (C4.2): the Services tab's Status badge for a service with no
// ticket yet, by its schedule state (shared/appointment-disposition.ts).
function scheduleStateBadgeVariant(state: ServiceScheduleState): "default" | "secondary" | "outline" {
  if (state === "COMPLETED") return "default";
  if (state === "SCHEDULED") return "secondary";
  return "outline";
}

function scheduleStateBadgeClass(state: ServiceScheduleState): string {
  if (state === "RESCHEDULING") return "border-amber-400 bg-amber-50 text-amber-900";
  if (state === "CANCELLED") return "border-red-300 bg-red-50 text-red-900";
  return "";
}

// Pass 35 (C5.3): the unit labels live in shared/agreement-types.ts with the
// unit list (DAY | WEEK | MONTH | QUARTER | YEAR - CUSTOM retired), the same
// labeler the Settings template row uses.
function formatAgreementRecurrence(agreement: Agreement) {
  return describeAgreementCadence(agreement.recurrenceUnit, agreement.recurrenceInterval);
}

/** A row of GET /api/agreement-types: the type plus how many agreements and templates carry it. */
type AgreementTypeRow = AgreementType & AgreementTypeUsage;

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date());
}

function addAgreementInterval(dateOnly: string, unit: string | null | undefined, interval: number | null | undefined) {
  if (!dateOnly) {
    return "";
  }

  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }

  const nextDate = new Date(year, month - 1, day);
  const step = Math.max(interval || 1, 1);

  // Pass 35 (C5.3): DAY and WEEK are explicit (the server's advanceAgreementDate
  // has had both since Pass 3.5); before, both fell to the default and WEEK(1)
  // would have previewed as one day. The default still steps by days, for a
  // stored unit from before the vocabulary.
  switch (unit) {
    case "DAY":
      nextDate.setDate(nextDate.getDate() + step);
      break;
    case "WEEK":
      nextDate.setDate(nextDate.getDate() + step * 7);
      break;
    case "MONTH":
      nextDate.setMonth(nextDate.getMonth() + step);
      break;
    case "QUARTER":
      nextDate.setMonth(nextDate.getMonth() + step * 3);
      break;
    case "YEAR":
      nextDate.setFullYear(nextDate.getFullYear() + step);
      break;
    default:
      nextDate.setDate(nextDate.getDate() + step);
      break;
  }

  return formatDateInputValue(nextDate);
}

function agreementStatusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-primary/10 text-primary";
    case "PAUSED":
      return "bg-chart-3/10 text-chart-3";
    case "CANCELLED":
      return "bg-destructive/10 text-destructive";
    default:
      return "";
  }
}

function buildAgreementFormState(agreement?: Agreement | null, template?: AgreementTemplate | null) {
  const startDate = agreement?.startDate ?? "";
  const termUnit = agreement?.termUnit ?? template?.defaultTermUnit ?? "YEAR";
  const termInterval = agreement?.termInterval ? String(agreement.termInterval) : template?.defaultTermInterval ? String(template.defaultTermInterval) : "1";
  const recurrenceUnit = agreement?.recurrenceUnit ?? template?.defaultRecurrenceUnit ?? "MONTH";
  const recurrenceInterval = agreement?.recurrenceInterval ? String(agreement.recurrenceInterval) : template?.defaultRecurrenceInterval ? String(template.defaultRecurrenceInterval) : "1";

  return {
    agreementTemplateId: agreement?.agreementTemplateId ?? template?.id ?? "",
    initialAppointmentId: agreement?.initialAppointmentId ?? "",
    startDateSource: agreement?.startDateSource ?? "MANUAL",
    agreementName: agreement?.agreementName ?? template?.name ?? "",
    status: agreement?.status ?? "ACTIVE",
    agreementType: agreement?.agreementType ?? template?.defaultAgreementType ?? "",
    startDate,
    termUnit,
    termInterval,
    renewalDate: agreement?.renewalDate ?? (startDate ? addAgreementInterval(startDate, termUnit, parseInt(termInterval, 10)) : ""),
    nextServiceDate: agreement?.nextServiceDate ?? (startDate ? addAgreementInterval(startDate, recurrenceUnit, parseInt(recurrenceInterval, 10)) : ""),
    billingPlanId: agreement?.billingPlanId ?? template?.billingPlanId ?? "",
    // Pass 12: sale credit. Never from the template; the form fills the
    // session user in on a new agreement (see AgreementForm).
    soldByUserId: agreement?.soldByUserId ?? "",
    price: agreement?.priceCents != null
      ? centsToDollarString(agreement.priceCents)
      : template?.defaultPriceCents != null
        ? centsToDollarString(template.defaultPriceCents)
        : "",
    // One block, propagated as one: the agreement's own charge when editing,
    // else the template's default - never a mix (see buildAgreementInsertFromTemplate).
    initialCharge: initialChargeFormStateFrom(agreement ?? initialChargeFromTemplate(template)),
    recurrenceUnit,
    recurrenceInterval,
    generationLeadDays: agreement?.generationLeadDays ? String(agreement.generationLeadDays) : template?.defaultGenerationLeadDays ? String(template.defaultGenerationLeadDays) : "14",
    serviceWindowDays: agreement?.serviceWindowDays ? String(agreement.serviceWindowDays) : template?.defaultServiceWindowDays ? String(template.defaultServiceWindowDays) : "",
    schedulingMode: agreement?.schedulingMode ?? template?.defaultSchedulingMode ?? "MANUAL",
    serviceTypeId: agreement?.serviceTypeId ?? template?.defaultServiceTypeId ?? "",
    serviceTemplateName: agreement?.serviceTemplateName ?? template?.defaultServiceTemplateName ?? "",
    defaultDurationMinutes: agreement?.defaultDurationMinutes ? String(agreement.defaultDurationMinutes) : template?.defaultDurationMinutes ? String(template.defaultDurationMinutes) : "",
    serviceInstructions: agreement?.serviceInstructions ?? template?.defaultInstructions ?? "",
    contractUrl: agreement?.contractUrl ?? "",
    contractSignedAt: agreement?.contractSignedAt ? new Date(agreement.contractSignedAt).toISOString().slice(0, 10) : "",
    notes: agreement?.notes ?? "",
  };
}

function isUsefulLocationNickname(name: string | null | undefined) {
  const trimmed = name?.trim();
  return !!trimmed && trimmed.toLowerCase() !== "primary location";
}

function buildContactFormState(contact?: Contact | null) {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    phoneType: contact?.phoneType ?? "mobile",
    role: contact?.role ?? "",
    isPrimary: contact?.isPrimary ?? false,
  };
}

function sortNotesByCreatedAt(notes: CustomerNote[]) {
  return [...notes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function buildSingleNoteState(notes: CustomerNote[] | undefined) {
  const sortedNotes = sortNotesByCreatedAt(notes ?? []);
  const currentNote = sortedNotes.length > 0 ? sortedNotes[sortedNotes.length - 1] : null;
  const body = currentNote?.body.trim() || "";

  return {
    body,
    currentNote,
  };
}

function formatRevisionTimestamp(value: string | Date) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRevisionActor(revision: NoteRevision) {
  return revision.actorLabel?.trim() || revision.actorUserId?.trim() || "Unknown user";
}

function formatRevisionChangeType(changeType: string) {
  switch (changeType) {
    case "CREATED":
      return "Created";
    case "UPDATED":
      return "Edited";
    case "CLEARED":
      return "Cleared";
    case "BASELINE":
      return "Baseline";
    default:
      return changeType;
  }
}

function NoteHistorySheet({
  open,
  onOpenChange,
  noteId,
  title,
  currentBody,
  testIdPrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId?: string;
  title: string;
  currentBody: string;
  testIdPrefix: string;
}) {
  const {
    data: revisions,
    isLoading,
    error,
  } = useQuery<NoteRevision[]>({
    queryKey: ["/api/notes", noteId ?? "", "revisions"],
    enabled: open && !!noteId,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="pr-8">
          <SheetTitle>{title} History</SheetTitle>
          <SheetDescription>
            {currentBody
              ? "Review prior saved note revisions."
              : "The current note is blank. Prior revisions remain available below when history exists."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          {!noteId ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid={`empty-${testIdPrefix}-history`}>
              No note history yet.
            </div>
          ) : isLoading ? (
            <div className="space-y-3" data-testid={`loading-${testIdPrefix}-history`}>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-destructive" data-testid={`error-${testIdPrefix}-history`}>
              Unable to load note history.
            </div>
          ) : !revisions || revisions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid={`empty-${testIdPrefix}-history`}>
              No revisions available.
            </div>
          ) : (
            <ScrollArea className="h-[70vh] pr-4">
              <div className="space-y-3">
                {revisions.map((revision, index) => (
                  <div
                    key={revision.id}
                    className="rounded-lg border bg-card p-3"
                    data-testid={`history-${testIdPrefix}-revision-${revision.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            Rev {revision.revisionNumber}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {formatRevisionChangeType(revision.changeType)}
                          </Badge>
                          {index === 0 && <Badge className="text-[10px]">Latest</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatRevisionActor(revision)} • {formatRevisionTimestamp(revision.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-md border bg-muted/20 p-3">
                      {revision.body.trim() ? (
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">
                          {revision.body}
                        </p>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">Note cleared</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// The location's slice of the system-wide audit history (PLAN_BILLING_V1_1 D7):
// the location and its customer, contacts, billing profiles, agreements,
// services, appointments, tickets, invoices, payments, credit memos and
// opportunities - since Pass 32 (C5.1a) every create / update / status change
// of the non-financial entities too, through the same route with no change on
// this side. audit_logs is append-only, so this panel never offers an edit or
// delete control; since Pass 33 (C5.1b) a revertable row offers Revert to a
// manager+ (REVERT_HISTORY) - a new forward change through the entity's own
// write path, recorded as `reverted`, never a rollback of the log. The
// per-customer rollup is the toolbar's History sheet (CustomerHistorySheet).
// Every mutation on this page that writes a row calls invalidateAuditViews(),
// or the tab keeps its first read (staleTime is Infinity).
function LocationHistoryTab({ locationId }: { locationId: string }) {
  const { user } = useAuth();
  const canRevert = can(user?.role ?? "", PERMISSIONS.REVERT_HISTORY);
  const revert = useAuditLogRevert();
  const { data: entries, isLoading, error } = useQuery<AuditLog[]>({
    queryKey: [`/api/audit-logs?locationId=${locationId}`],
    enabled: !!locationId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="loading-location-history">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="text-center py-8" data-testid="error-location-history">
          <History className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-destructive">Unable to load history for this location</p>
        </CardContent>
      </Card>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8" data-testid="empty-location-history">
          <History className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No recorded changes for this location yet</p>
        </CardContent>
      </Card>
    );
  }

  // One renderer per row, shared with the invoice modal's History section
  // (Pass 11a) so an audit row reads the same wherever it is shown.
  return (
    <>
      {entries.map((entry) => (
        <AuditLogEntryCard
          key={entry.id}
          entry={entry}
          canRevert={canRevert}
          onRevert={(row) => revert.mutate(row)}
          revertPending={revert.isPending && revert.variables?.id === entry.id}
        />
      ))}
    </>
  );
}

function buildCommunicationHref({
  customerId,
  locationId,
  type,
  value,
}: {
  customerId: string;
  locationId?: string;
  type: "email" | "phone";
  value: string;
}) {
  const params = new URLSearchParams({
    customerId,
    type,
    direction: "outbound",
    recipient: value,
  });

  if (locationId) {
    params.set("locationId", locationId);
  }

  return `/communications?${params.toString()}`;
}

function CommunicationActionLink({
  href,
  icon,
  text,
  testId,
}: {
  href: string;
  icon: ReactNode;
  text: string;
  testId?: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
      data-testid={testId}
    >
      {icon}
      <span>{text}</span>
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

function AddLocationDialog({
  customerId,
  customerType,
  accountDefault,
  onClose,
}: {
  customerId: string;
  customerType: string;
  /** Pass 34 (C5.2): the account's default profile the new location inherits, from the compat read. */
  accountDefault: BillingProfileSummary | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const locationTypeOptions = buildOptions(customerType, BASE_LOCATION_TYPE_OPTIONS);
  // Pass 34 (C5.2): inherit the account default (nothing is written - a
  // location with no row of its own resolves the account's) or create an
  // override row for the new location once it exists.
  const [billingMode, setBillingMode] = useState<LocationBillingMode>("INHERIT");
  const [billingForm, setBillingForm] = useState<BillingProfileFormState>(EMPTY_BILLING_PROFILE_FORM);
  const [form, setForm] = useState({
    nickname: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    source: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    propertyType: customerType,
    isPrimary: false,
    gateCode: "",
    squareFootage: "",
  });
  // Pass 30 (C4.4; B14): technician preferences for the new location - drafts
  // until it exists, then one PUT each (scope LOCATION).
  const [preferenceDrafts, setPreferenceDrafts] = useState<TechnicianPreferenceDraft[]>([]);
  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const trimmedAddress = data.address.trim();
      const trimmedNickname = data.nickname.trim();

      const response = await apiRequest("POST", "/api/locations", {
        location: {
          customerId,
          name: trimmedNickname || trimmedAddress,
          address: trimmedAddress,
          city: data.city.trim(),
          state: data.state.trim(),
          zip: data.zip.trim(),
          propertyType: data.propertyType,
          isPrimary: data.isPrimary,
          gateCode: data.gateCode.trim() || null,
          squareFootage: data.squareFootage.trim() ? parseInt(data.squareFootage, 10) : null,
          source: data.source.trim() || null,
          notes: null,
        },
        initialContact: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: data.email.trim(),
          phone: data.phone.trim(),
          role: "primary",
          isPrimary: true,
        },
      });
      const created = (await response.json()) as Location;
      let billingError: string | null = null;
      if (billingMode === "OVERRIDE") {
        try {
          if (!created.accountId) throw new Error("The new location has no account");
          await apiRequest("POST", "/api/billing-profiles", {
            accountId: created.accountId,
            locationId: created.id,
            ...billingProfilePayload(billingForm),
          });
        } catch (error) {
          billingError = getApiErrorMessage(error);
        }
      }
      let preferencesFailed = 0;
      for (const draft of preferenceDrafts) {
        try {
          await apiRequest("PUT", `/api/locations/${created.id}/technician-preferences`, {
            technicianId: draft.technicianId,
            kind: draft.kind,
            note: draft.note || null,
            scope: "LOCATION",
          });
        } catch {
          preferencesFailed += 1;
        }
      }
      return { created, preferencesFailed, billingError };
    },
    onSuccess: ({ preferencesFailed, billingError }) => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(`/api/customer-detail-compat/${customerId}`),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/by-location"] });
      invalidateAuditViews();
      invalidateBillingProfileViews();
      if (preferenceDrafts.length) {
        invalidateTechnicianPreferences();
      }
      if (billingError) {
        toast({ title: "Location added, but its billing override was not saved", description: `${billingError} Open Edit Location to set it.`, variant: "destructive" });
      } else if (preferencesFailed) {
        toast({ title: "Location added, but a technician preference was not saved", description: "Open Edit Location to add it again.", variant: "destructive" });
      } else {
        toast({ title: "Location added" });
      }
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error adding location", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim()
    ) {
      toast({ title: "First name, last name, email, and phone are required for the primary contact", variant: "destructive" });
      return;
    }

    if (!form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      toast({ title: "Address, city, state, and ZIP are required", variant: "destructive" });
      return;
    }

    if (billingMode === "OVERRIDE" && !billingForm.label.trim()) {
      toast({ title: "A billing override needs a label", variant: "destructive" });
      return;
    }

    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Primary contact</h3>
        <p className="text-sm text-muted-foreground">
          These details create the primary contact for the new location.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-first-name">First Name *</Label><Input id="add-location-contact-first-name" data-testid="input-add-location-contact-first-name" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-last-name">Last Name *</Label><Input id="add-location-contact-last-name" data-testid="input-add-location-contact-last-name" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-email">Email *</Label><Input id="add-location-contact-email" type="email" data-testid="input-add-location-contact-email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-phone">Phone *</Label><Input id="add-location-contact-phone" data-testid="input-add-location-contact-phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Location details</h3>
        <p className="text-sm text-muted-foreground">
          Add another service location under this account and create its primary contact in the same step.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="add-location-type">Location Type</Label>
          <Select value={form.propertyType} onValueChange={(v) => setForm((p) => ({ ...p, propertyType: v }))}>
            <SelectTrigger id="add-location-type" data-testid="select-add-location-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {locationTypeOptions.map((option) => (
                <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-location-source">Source</Label>
          <Select value={form.source} onValueChange={(v) => setForm((p) => ({ ...p, source: v }))}>
            <SelectTrigger id="add-location-source" data-testid="select-add-location-source">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {BASE_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-location-address">Address *</Label>
        <Input
          id="add-location-address"
          data-testid="input-loc-address"
          placeholder="Street address"
          autoComplete="street-address"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
        <div className="space-y-1.5"><Label htmlFor="add-location-city">City *</Label><Input id="add-location-city" data-testid="input-add-location-city" autoComplete="address-level2" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-state">State *</Label><Input id="add-location-state" data-testid="input-add-location-state" autoComplete="address-level1" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-zip">ZIP *</Label><Input id="add-location-zip" data-testid="input-add-location-zip" autoComplete="postal-code" value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="add-location-square-footage">Sq Ft</Label><Input id="add-location-square-footage" type="number" data-testid="input-add-location-square-footage" value={form.squareFootage} onChange={(e) => setForm((p) => ({ ...p, squareFootage: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-gate-code">Gate Code</Label><Input id="add-location-gate-code" data-testid="input-add-location-gate-code" value={form.gateCode} onChange={(e) => setForm((p) => ({ ...p, gateCode: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-location-nickname">Nickname</Label>
        <Input
          id="add-location-nickname"
          data-testid="input-add-location-nickname"
          placeholder="Optional, e.g. Lake House or Warehouse"
          value={form.nickname}
          onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
        />
      </div>
      <TechnicianPreferenceDraftEditor drafts={preferenceDrafts} onChange={setPreferenceDrafts} />
      {/* Pass 34 (C5.2): the billing selector - inherit the account default or override for this location. */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Billing</h3>
        <p className="text-sm text-muted-foreground">How invoices for this location are billed.</p>
      </div>
      <LocationBillingSelector
        mode={billingMode}
        onModeChange={setBillingMode}
        form={billingForm}
        onFormChange={setBillingForm}
        accountDefault={accountDefault}
        idPrefix="add-location-billing"
        isPrimary={false}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
        Set as primary location
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-location">
          {mutation.isPending ? "Saving..." : "Add Location"}
        </Button>
      </div>
    </form>
  );
}

function EditLocationDialog({
  customer,
  location,
  accountId,
  totalLocations,
  onClose,
}: {
  customer: Customer;
  location: Location;
  /** Pass 34 (C5.2): the account whose billing profiles the dialog reads and writes. */
  accountId: string;
  totalLocations: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isPrimaryLocation = !!location.isPrimary;
  const canPromoteToPrimary = !isPrimaryLocation;
  // Pass 34 (C5.2): the account's billing profiles - the active default
  // (editable here on the primary location, created when the account has
  // none) and this location's active override (the selector). The org
  // default template prefills a new account default, as customer creation
  // would have.
  const { data: accountProfiles } = useQuery<BillingProfile[]>({ queryKey: ["/api/accounts", accountId, "billing-profiles"], enabled: !!accountId });
  const accountDefaultProfile = useMemo(() => pickAccountDefaultProfile(accountProfiles), [accountProfiles]);
  const overrideProfile = useMemo(() => pickLocationOverrideProfile(accountProfiles, location.id), [accountProfiles, location.id]);
  const { data: billingDefaults } = useQuery<BillingDefaults>({ queryKey: ["/api/settings/billing-defaults"], enabled: isPrimaryLocation && !!accountProfiles && !accountDefaultProfile });
  const { data: billingTemplates } = useQuery<BillingProfileTemplate[]>({ queryKey: ["/api/billing-profile-templates"], enabled: isPrimaryLocation && !!billingDefaults?.defaultBillingProfileTemplateId });
  const defaultTemplate = useMemo(
    () => (billingTemplates ?? []).find((template) => template.id === billingDefaults?.defaultBillingProfileTemplateId && template.isActive) ?? null,
    [billingDefaults?.defaultBillingProfileTemplateId, billingTemplates],
  );
  const [billingMode, setBillingMode] = useState<LocationBillingMode>("INHERIT");
  const [overrideForm, setOverrideForm] = useState<BillingProfileFormState>(EMPTY_BILLING_PROFILE_FORM);
  const [accountDefaultForm, setAccountDefaultForm] = useState<BillingProfileFormState>(EMPTY_BILLING_PROFILE_FORM);
  useEffect(() => {
    setBillingMode(overrideProfile ? "OVERRIDE" : "INHERIT");
    setOverrideForm(billingProfileFormFrom(overrideProfile));
  }, [overrideProfile]);
  useEffect(() => {
    setAccountDefaultForm(accountDefaultProfile ? billingProfileFormFrom(accountDefaultProfile) : billingProfileFormFromTemplate(defaultTemplate));
  }, [accountDefaultProfile, defaultTemplate]);
  const [form, setForm] = useState({
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    companyName: customer.companyName || "",
    email: customer.email || "",
    phone: customer.phone || "",
    customerType: customer.customerType || "residential",
    name: location.name || "",
    address: location.address || "",
    city: location.city || "",
    state: location.state || "",
    zip: location.zip || "",
    propertyType: location.propertyType || "residential",
    source: location.source || "",
    squareFootage: location.squareFootage ? String(location.squareFootage) : "",
    gateCode: location.gateCode || "",
    setAsPrimary: !!location.isPrimary,
  });

  useEffect(() => {
    setForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      companyName: customer.companyName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      customerType: customer.customerType || "residential",
      name: location.name || "",
      address: location.address || "",
      city: location.city || "",
      state: location.state || "",
      zip: location.zip || "",
      propertyType: location.propertyType || "residential",
      source: location.source || "",
      squareFootage: location.squareFootage ? String(location.squareFootage) : "",
      gateCode: location.gateCode || "",
      setAsPrimary: !!location.isPrimary,
    });
  }, [customer, location]);

  const locationTypeOptions = buildOptions(form.propertyType, BASE_LOCATION_TYPE_OPTIONS);
  const customerTypeOptions = buildOptions(form.customerType, BASE_LOCATION_TYPE_OPTIONS);
  const sourceOptions = buildOptions(form.source, BASE_SOURCE_OPTIONS);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const locationPayload = {
        name: data.name.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        zip: data.zip.trim(),
        propertyType: isPrimaryLocation ? data.customerType : data.propertyType,
        source: data.source.trim() || null,
        squareFootage: data.squareFootage.trim() ? parseInt(data.squareFootage, 10) : null,
        gateCode: data.gateCode.trim() || null,
      };

      const customerPayload = isPrimaryLocation
        ? {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            companyName: data.customerType === "commercial" ? data.companyName.trim() || null : null,
            email: data.email.trim(),
            phone: data.phone.trim(),
            customerType: data.customerType,
          }
        : undefined;

      const res = await apiRequest("PATCH", `/api/customers/${customer.id}/locations/${location.id}/profile`, {
        location: locationPayload,
        customer: customerPayload,
      });

      if (data.setAsPrimary && !isPrimaryLocation) {
        await apiRequest("POST", `/api/locations/${location.id}/set-primary`, {});
      }

      // Pass 34 (C5.2): the billing profiles, through their own routes. The
      // account default (primary location only): created when the account
      // has none and a label was given, else updated when changed. The
      // override: created, updated when changed, or retired (status
      // inactive - never deleted: invoices carry its id) when the selector
      // went back to inherit. A refusal is reported, not swallowed; the
      // location's own save above already stands.
      let billingError: string | null = null;
      try {
        if (isPrimaryLocation && accountId) {
          if (accountDefaultProfile) {
            if (billingProfileFormChanged(accountDefaultForm, accountDefaultProfile)) {
              await apiRequest("PATCH", `/api/billing-profiles/${accountDefaultProfile.id}`, billingProfilePayload(accountDefaultForm));
            }
          } else if (accountDefaultForm.label.trim()) {
            await apiRequest("POST", "/api/billing-profiles", {
              accountId,
              locationId: null,
              templateId: defaultTemplate?.id ?? null,
              isDefault: true,
              ...billingProfilePayload(accountDefaultForm),
            });
          }
        }
        if (billingMode === "OVERRIDE") {
          if (overrideProfile) {
            if (billingProfileFormChanged(overrideForm, overrideProfile)) {
              await apiRequest("PATCH", `/api/billing-profiles/${overrideProfile.id}`, billingProfilePayload(overrideForm));
            }
          } else if (accountId) {
            await apiRequest("POST", "/api/billing-profiles", {
              accountId,
              locationId: location.id,
              ...billingProfilePayload(overrideForm),
            });
          }
        } else if (overrideProfile) {
          await apiRequest("PATCH", `/api/billing-profiles/${overrideProfile.id}`, { status: "inactive" });
        }
      } catch (error) {
        billingError = getApiErrorMessage(error);
      }

      const body = (await res.json()) as UpdateLocationProfileResponse;
      return { ...body, billingError };
    },
    onSuccess: ({ billingError }) => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(`/api/customer-detail-compat/${customer.id}`),
      });
      invalidateAuditViews();
      invalidateBillingProfileViews();
      if (billingError) {
        toast({ title: "Location updated, but the billing profile was not saved", description: billingError, variant: "destructive" });
      } else {
        toast({ title: "Location updated" });
      }
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error updating location", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      toast({ title: "Location name, address, city, state, and ZIP are required", variant: "destructive" });
      return;
    }

    if (isPrimaryLocation) {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim()) {
        toast({ title: "First name, last name, email, and phone are required for the primary location", variant: "destructive" });
        return;
      }

      if (form.customerType === "commercial" && !form.companyName.trim()) {
        toast({ title: "Company name is required for commercial customers", variant: "destructive" });
        return;
      }
    }

    if (billingMode === "OVERRIDE" && !overrideForm.label.trim()) {
      toast({ title: "A billing override needs a label", variant: "destructive" });
      return;
    }

    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {isPrimaryLocation ? (
        <>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Customer identity</h3>
            <p className="text-sm text-muted-foreground">
              These fields power the current primary-location identity shown at the top of this screen.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer Type</Label>
              <Select value={form.customerType} onValueChange={(value) => setForm((prev) => ({ ...prev, customerType: value, propertyType: value }))}>
                <SelectTrigger data-testid="select-edit-customer-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {customerTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(value) => setForm((prev) => ({ ...prev, source: value }))}>
                <SelectTrigger data-testid="select-edit-source"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.customerType === "commercial" && (
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input data-testid="input-edit-company-name" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>First Name</Label><Input data-testid="input-edit-first-name" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Last Name</Label><Input data-testid="input-edit-last-name" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" data-testid="input-edit-email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input data-testid="input-edit-phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} /></div>
          </div>
        </>
      ) : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Customer identity fields remain tied to the primary location in the current compatibility model. This edit updates the selected location record only.
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Location details</h3>
        <p className="text-sm text-muted-foreground">
          Update the operational details for this service location.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Location Name</Label>
        <Input data-testid="input-edit-location-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
      </div>
      {!isPrimaryLocation && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Location Type</Label>
            <Select value={form.propertyType} onValueChange={(value) => setForm((prev) => ({ ...prev, propertyType: value }))}>
              <SelectTrigger data-testid="select-edit-location-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {locationTypeOptions.map((option) => (
                  <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(value) => setForm((prev) => ({ ...prev, source: value }))}>
              <SelectTrigger data-testid="select-edit-secondary-source"><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {sourceOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="space-y-1.5"><Label>Address</Label><Input data-testid="input-edit-address" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>City</Label><Input data-testid="input-edit-city" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>State</Label><Input data-testid="input-edit-state" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>ZIP</Label><Input data-testid="input-edit-zip" value={form.zip} onChange={(e) => setForm((prev) => ({ ...prev, zip: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Sq Ft</Label><Input type="number" data-testid="input-edit-square-footage" value={form.squareFootage} onChange={(e) => setForm((prev) => ({ ...prev, squareFootage: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Gate Code</Label><Input data-testid="input-edit-gate-code" value={form.gateCode} onChange={(e) => setForm((prev) => ({ ...prev, gateCode: e.target.value }))} /></div>
      </div>
      {/* Pass 30 (C4.4; B14; D8): the location's technician preferences - a live editor, each add and
          remove its own request. On the primary location (the customer identity) "Apply to all
          locations" writes the account-scoped row; a location's own row wins over it. */}
      <TechnicianPreferencesEditor locationId={location.id} />
      {/* Pass 34 (C5.2): billing. On the primary location (the customer editor - there is no
          separate customer modal) the account default's own fields, created here when the account
          has none; on every location the selector: inherit that default or override. */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Billing</h3>
        <p className="text-sm text-muted-foreground">
          {isPrimaryLocation
            ? "The account default every location inherits, and how this location bills."
            : "How invoices for this location are billed."}
        </p>
      </div>
      {isPrimaryLocation && accountProfiles && (
        <div className="space-y-3 rounded-md border p-3" data-testid="block-account-billing-default">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Account default</p>
            <p className="text-xs text-muted-foreground">
              {accountDefaultProfile
                ? "Every location of this account bills this way unless it has an override."
                : defaultTemplate
                  ? `This account has no billing default yet. Saving with a label creates one - prefilled from the Settings default template "${defaultTemplate.name}".`
                  : "This account has no billing default yet. Saving with a label creates one; leave the label blank to keep none."}
            </p>
          </div>
          <BillingProfileFields form={accountDefaultForm} onChange={setAccountDefaultForm} idPrefix="edit-account-default" />
        </div>
      )}
      {accountProfiles ? (
        <LocationBillingSelector
          mode={billingMode}
          onModeChange={setBillingMode}
          form={overrideForm}
          onFormChange={setOverrideForm}
          accountDefault={accountDefaultProfile}
          idPrefix="edit-location-billing"
          isPrimary={isPrimaryLocation}
        />
      ) : (
        <Skeleton className="h-16" />
      )}
      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.setAsPrimary}
            disabled={!canPromoteToPrimary}
            onChange={(e) => setForm((prev) => ({ ...prev, setAsPrimary: e.target.checked }))}
            data-testid="checkbox-edit-location-primary"
          />
          <span className="space-y-1">
            <span className="block font-medium text-foreground">Set as Primary Location</span>
            <span className="block text-muted-foreground">
              {isPrimaryLocation
                ? totalLocations > 1
                  ? "This location is already primary. To switch the primary location, open a different location and save it as primary."
                  : "This account only has one location, so it remains the primary location."
                : "Saving will make this the primary location for the account and update the customer identity shown in the UI."}
            </span>
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-edited-location">
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function ContactDialogForm({
  customerId,
  locationId,
  contact,
  onClose,
}: {
  customerId: string;
  locationId: string;
  contact?: Contact | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditMode = !!contact;
  const [form, setForm] = useState(() => buildContactFormState(contact));

  useEffect(() => {
    setForm(buildContactFormState(contact));
  }, [contact]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEditMode
        ? apiRequest("PATCH", `/api/contacts/${contact.id}`, data).then((res) => res.json() as Promise<Contact>)
        : apiRequest("POST", "/api/contacts", { ...data, customerId, locationId }).then((res) => res.json() as Promise<Contact>),
    onSuccess: async (savedContact) => {
      queryClient.setQueryData<Contact[]>(["/api/contacts/by-location", locationId], (existing) => {
        if (!existing) {
          return [savedContact];
        }

        const existingIndex = existing.findIndex((item) => item.id === savedContact.id);
        if (existingIndex === -1) {
          return [...existing, savedContact];
        }

        return existing.map((item) => item.id === savedContact.id ? savedContact : item);
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/contacts/by-location", locationId] });
      // Pass 36 (C5.4): the account-wide read feeds the location switcher's contact label
      // (primaryContactNameByLocationId) - a primary change left it stale before this pass.
      await queryClient.invalidateQueries({ queryKey: ["/api/contacts", customerId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
      invalidateAuditViews();
      toast({ title: isEditMode ? "Contact updated" : "Contact added" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: isEditMode ? "Error updating contact" : "Error adding contact",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });
  // Pass 36 (C5.4): a location keeps one primary contact (shared/contacts.ts). Editing the
  // current primary cannot uncheck it - the server refuses the demotion too
  // (CONTACT_PRIMARY_REQUIRED); promoting another contact from its own dialog demotes this one.
  const primaryLocked = isEditMode && !!contact?.isPrimary;
  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>First Name</Label><Input data-testid="input-ct-first" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Last Name</Label><Input data-testid="input-ct-last" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone Type</Label>
          <Select value={form.phoneType} onValueChange={(value) => setForm((p) => ({ ...p, phoneType: value }))}>
            <SelectTrigger data-testid="select-contact-phone-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTACT_PHONE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Role</Label><Input placeholder="e.g., Property Manager" value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} /></div>
      </div>
      <div className="space-y-1">
        <label className={`flex items-center gap-2 text-sm ${primaryLocked ? "text-muted-foreground" : ""}`}>
          <input type="checkbox" checked={form.isPrimary} disabled={primaryLocked} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} data-testid="checkbox-contact-primary" />
          {primaryLocked ? "Primary contact" : "Make primary contact"}
        </label>
        {primaryLocked ? <p className="text-xs text-muted-foreground" data-testid="text-contact-primary-locked">{CONTACT_PRIMARY_LOCKED_NOTE}</p> : null}
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending} data-testid="button-save-contact">{mutation.isPending ? "Saving..." : isEditMode ? "Save Changes" : "Add Contact"}</Button></div>
    </form>
  );
}

function SingleNoteSection({
  title,
  scope,
  customerId,
  locationId,
  notes,
  emptyMessage,
  embedded = false,
  testIdPrefix,
  surfaceClassName,
  collapsedBodyClassName,
  expandedBodyClassName,
  footerReserveClassName,
}: {
  title: string;
  scope: "ACCOUNT" | "LOCATION";
  customerId: string;
  locationId?: string;
  notes?: CustomerNote[];
  emptyMessage: string;
  embedded?: boolean;
  testIdPrefix: string;
  surfaceClassName?: string;
  collapsedBodyClassName?: string;
  expandedBodyClassName?: string;
  footerReserveClassName?: string;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const singleNote = useMemo(() => buildSingleNoteState(notes), [notes]);
  const [draft, setDraft] = useState(singleNote.body);
  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const [hasCollapsedOverflow, setHasCollapsedOverflow] = useState(false);
  const canExpand = hasCollapsedOverflow;

  useEffect(() => {
    if (!isEditing) {
      setDraft(singleNote.body);
    }
  }, [isEditing, singleNote.body]);

  useEffect(() => {
    if (!hasCollapsedOverflow) {
      setIsExpanded(false);
    }
  }, [hasCollapsedOverflow]);

  useEffect(() => {
    if (isEditing) {
      setHasCollapsedOverflow(false);
      return;
    }

    const measureOverflow = () => {
      const element = previewBodyRef.current;
      if (!element) {
        setHasCollapsedOverflow(false);
        return;
      }

      const hasVerticalOverflow = element.scrollHeight - element.clientHeight > 1;
      const hasHorizontalOverflow = element.scrollWidth - element.clientWidth > 1;
      setHasCollapsedOverflow(hasVerticalOverflow || hasHorizontalOverflow);
    };

    measureOverflow();
    window.addEventListener("resize", measureOverflow);

    return () => {
      window.removeEventListener("resize", measureOverflow);
    };
  }, [isEditing, singleNote.body, collapsedBodyClassName]);

  const saveMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("PUT", "/api/notes/scoped", {
        scope,
        customerId: scope === "ACCOUNT" ? customerId : null,
        locationId: scope === "LOCATION" ? locationId ?? null : null,
        body,
      }),
    onSuccess: () => {
      if (scope === "ACCOUNT") {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/shared", customerId] });
      } else if (locationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/location", locationId] });
      }
      if (singleNote.currentNote?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/notes", singleNote.currentNote.id, "revisions"] });
      }

      setIsEditing(false);
      toast({ title: `${title} updated` });
    },
    onError: (error: Error) => {
      toast({ title: `Error updating ${title.toLowerCase()}`, description: error.message, variant: "destructive" });
    },
  });

  const openEditor = () => {
    setDraft(singleNote.body);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(singleNote.body);
    setIsEditing(false);
  };

  const renderBody = () => {
    if (!singleNote.body) {
      return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }

    if (isExpanded && canExpand) {
      return (
        <ScrollArea className={cn("pr-4", expandedBodyClassName ?? "h-56")}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{singleNote.body}</p>
        </ScrollArea>
      );
    }

    return (
      <div ref={previewBodyRef} className={cn("overflow-hidden", collapsedBodyClassName)}>
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">
          {singleNote.body}
        </p>
      </div>
    );
  };

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <StickyNote className="h-4 w-4" /> {title}
        </CardTitle>
      </div>
      <div className="flex items-center gap-2">
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setHistoryOpen(true)}
            disabled={!singleNote.currentNote?.id}
            data-testid={`button-history-${testIdPrefix}-notes`}
          >
            <History className="mr-1 h-3 w-3" /> History
          </Button>
        )}
        {!isEditing && hasCollapsedOverflow && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setIsExpanded((current) => !current)}
            data-testid={`button-toggle-${testIdPrefix}-notes`}
          >
            {isExpanded ? <><ChevronUp className="mr-1 h-3 w-3" /> Collapse</> : <><ChevronDown className="mr-1 h-3 w-3" /> Expand</>}
          </Button>
        )}
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={openEditor}
            data-testid={`button-edit-${testIdPrefix}-notes`}
          >
            Edit
          </Button>
        )}
      </div>
    </div>
  );

  const body = isEditing ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate(draft);
      }}
      className="space-y-3"
    >
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add notes..."
        className="min-h-[180px] resize-y"
        data-testid={`input-${testIdPrefix}-notes`}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancelEdit}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saveMutation.isPending || draft === singleNote.body}
          data-testid={`button-save-${testIdPrefix}-notes`}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  ) : (
    <div className="space-y-3">
      <div className={cn("rounded-lg border bg-muted/20 p-3", surfaceClassName)}>
        <div className="flex-1">{renderBody()}</div>
      </div>
      {footerReserveClassName && <div className={cn("shrink-0", footerReserveClassName)} aria-hidden="true" />}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <NoteHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          noteId={singleNote.currentNote?.id}
          title={title}
          currentBody={singleNote.body}
          testIdPrefix={testIdPrefix}
        />
        {header}
        {body}
      </div>
    );
  }

  return (
    <>
      <NoteHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        noteId={singleNote.currentNote?.id}
        title={title}
        currentBody={singleNote.body}
        testIdPrefix={testIdPrefix}
      />
      <CardHeader className="pb-2">{header}</CardHeader>
      <CardContent className="pt-0">{body}</CardContent>
    </>
  );
}

function CustomerNotesPanel({
  customerId,
  embedded = false,
}: {
  customerId: string;
  embedded?: boolean;
}) {
  const { data: sharedNotes } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/shared", customerId] });

  return (
    <SingleNoteSection
      title="Customer Notes"
      scope="ACCOUNT"
      customerId={customerId}
      notes={sharedNotes}
      emptyMessage="No customer notes yet."
      embedded={embedded}
      testIdPrefix="customer"
      surfaceClassName="min-h-[4.5rem]"
      collapsedBodyClassName="min-h-[4.5rem] max-h-[4.5rem]"
    />
  );
}

function LocationNotesPanel({
  customerId,
  locationId,
  footer,
}: {
  customerId: string;
  locationId: string;
  /** Below the notes, inside the box - the location's balance row (owner, 2026-09-25). */
  footer?: ReactNode;
}) {
  const { data: locationNotes } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/location", locationId] });

  return (
    <Card className="h-full flex flex-col">
      <SingleNoteSection
        title="Location Notes"
        scope="LOCATION"
        customerId={customerId}
        locationId={locationId}
        notes={locationNotes}
        emptyMessage="No location notes yet."
        testIdPrefix="location"
        surfaceClassName="h-[9rem] flex flex-col"
        collapsedBodyClassName="min-h-[7.5rem] max-h-[7.5rem]"
        expandedBodyClassName="h-[7.5rem]"
        footerReserveClassName="min-h-[3.5rem]"
      />
      {footer ? <div className="border-t px-4 py-2.5 mt-auto" data-testid="footer-location-notes">{footer}</div> : null}
    </Card>
  );
}

function AgreementForm({
  customerId,
  locationId,
  agreement,
  appointments,
  onClose,
  onCreated,
}: {
  customerId: string;
  locationId: string;
  agreement?: Agreement | null;
  appointments?: Appointment[];
  onClose: () => void;
  /** Pass 11d: after a creation, the office's prompt when the sale carries a down payment the office may collect. */
  onCreated?: (due: InitialChargeDue) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [draftAgreement, setDraftAgreement] = useState<Agreement | null>(agreement ?? null);
  const createdInitialChargeDueRef = useRef<InitialChargeDue | null>(null);
  const currentAgreement = draftAgreement ?? agreement ?? null;
  const isEditMode = !!currentAgreement;
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: agreementTemplates } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/agreement-templates"] });
  // Pass 35 (C5.3): the agreement types for the dropdown, inactive included so
  // an agreement carrying a since-retired key still names it.
  const { data: agreementTypes } = useQuery<AgreementTypeRow[]>({ queryKey: ["/api/agreement-types?includeInactive=true"] });
  // Inactive plans are fetched too, so an agreement already carrying a retired
  // plan still renders its own plan name instead of silently reading as
  // plan-less - the same reason activeTemplates keeps the current template.
  const { data: billingPlans } = useQuery<BillingPlan[]>({ queryKey: ["/api/billing-plans?includeInactive=true"] });
  // Pass 12: sale attribution. The session user is the default sold-by on a
  // new agreement; only ASSIGN_SALE_CREDIT (manager+) may name anyone else,
  // so the selector is read-only for everyone else.
  const { user: sessionUser } = useAuth();
  const canAssignSaleCredit = can(sessionUser?.role ?? "", PERMISSIONS.ASSIGN_SALE_CREDIT);
  const { data: users } = useQuery<UserSummary[]>({ queryKey: ["/api/users"] });
  const selectableBillingPlans = useMemo(
    () => (billingPlans ?? []).filter((plan) => plan.isActive || plan.id === currentAgreement?.billingPlanId),
    [billingPlans, currentAgreement?.billingPlanId],
  );
  const selectableAgreementTypes = useMemo(
    () => (agreementTypes ?? []).filter((type) => type.isActive || type.key === currentAgreement?.agreementType),
    [agreementTypes, currentAgreement?.agreementType],
  );
  const activeTemplates = useMemo(() => {
    return (agreementTemplates ?? [])
      .filter((template) => template.isActive || template.id === currentAgreement?.agreementTemplateId)
      .sort((a, b) => {
        const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) return sortA - sortB;
        return a.name.localeCompare(b.name);
      });
  }, [currentAgreement?.agreementTemplateId, agreementTemplates]);
  const templateById = useMemo(() => new Map(activeTemplates.map((template) => [template.id, template])), [activeTemplates]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(currentAgreement?.agreementTemplateId ?? "");
  const [form, setForm] = useState(() => {
    const initialTemplate = currentAgreement?.agreementTemplateId ? templateById.get(currentAgreement.agreementTemplateId) ?? null : null;
    const initialState = buildAgreementFormState(currentAgreement, initialTemplate);
    return currentAgreement ? initialState : { ...initialState, startDate: initialState.startDate || getTodayDateInputValue() };
  });
  const [renewalDateOverridden, setRenewalDateOverridden] = useState(false);
  const [nextServiceDateOverridden, setNextServiceDateOverridden] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const selectedBillingPlan = useMemo(
    () => (billingPlans ?? []).find((plan) => plan.id === form.billingPlanId) ?? null,
    [billingPlans, form.billingPlanId],
  );
  const billingPlanChanged = form.billingPlanId !== (currentAgreement?.billingPlanId ?? "");
  const soldByOptions = useMemo(
    () => selectableUsers(users ?? [], form.soldByUserId || currentAgreement?.soldByUserId),
    [users, form.soldByUserId, currentAgreement?.soldByUserId],
  );

  useEffect(() => {
    if (draftAgreement && !agreement) {
      return;
    }

    const agreementTemplate = agreement?.agreementTemplateId ? templateById.get(agreement.agreementTemplateId) ?? null : null;
    setDraftAgreement(agreement ?? null);
    setSelectedTemplateId(agreement?.agreementTemplateId ?? "");
    const nextState = buildAgreementFormState(agreement, agreementTemplate);
    setForm(agreement ? nextState : { ...nextState, startDate: nextState.startDate || getTodayDateInputValue() });
    setRenewalDateOverridden(false);
    setNextServiceDateOverridden(false);
  }, [agreement, templateById, draftAgreement]);

  // Pass 12: a new agreement is sold by whoever is creating it until a
  // manager+ says otherwise; an existing one keeps what it carries.
  useEffect(() => {
    if (!currentAgreement && sessionUser?.id) {
      setForm((prev) => (prev.soldByUserId ? prev : { ...prev, soldByUserId: sessionUser.id }));
    }
  }, [currentAgreement, sessionUser?.id]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templateById.get(templateId) ?? null;
    setForm((prev) => {
      const next = buildAgreementFormState(null, template);
      const startDate = prev.startDate || getTodayDateInputValue();
      return {
        ...next,
        agreementTemplateId: templateId,
        status: prev.status || next.status,
        startDate,
        renewalDate: renewalDateOverridden ? prev.renewalDate : addAgreementInterval(startDate, next.termUnit, parseInt(next.termInterval, 10)),
        nextServiceDate: nextServiceDateOverridden ? prev.nextServiceDate : addAgreementInterval(startDate, next.recurrenceUnit, parseInt(next.recurrenceInterval, 10)),
        contractUrl: prev.contractUrl,
        contractSignedAt: prev.contractSignedAt,
        notes: prev.notes,
        soldByUserId: prev.soldByUserId,
      };
    });
  };

  const syncDerivedDates = (
    startDate: string,
    options?: {
      startDateSource?: string;
      termUnit?: string;
      termInterval?: string;
      recurrenceUnit?: string;
      recurrenceInterval?: string;
    },
  ) => {
    setForm((prev) => {
      const nextTermUnit = options?.termUnit ?? prev.termUnit;
      const nextTermInterval = options?.termInterval ?? prev.termInterval;
      const nextRecurrenceUnit = options?.recurrenceUnit ?? prev.recurrenceUnit;
      const nextRecurrenceInterval = options?.recurrenceInterval ?? prev.recurrenceInterval;
      const nextStartDateSource = options?.startDateSource ?? prev.startDateSource;

      return {
        ...prev,
        startDate,
        startDateSource: nextStartDateSource,
        termUnit: nextTermUnit,
        termInterval: nextTermInterval,
        recurrenceUnit: nextRecurrenceUnit,
        recurrenceInterval: nextRecurrenceInterval,
        renewalDate: renewalDateOverridden ? prev.renewalDate : addAgreementInterval(startDate, nextTermUnit, parseInt(nextTermInterval, 10)),
        nextServiceDate: nextServiceDateOverridden ? prev.nextServiceDate : addAgreementInterval(startDate, nextRecurrenceUnit, parseInt(nextRecurrenceInterval, 10)),
      };
    });
  };

  const buildAgreementPayload = (data: typeof form) => ({
    customerId,
    locationId,
    agreementTemplateId: data.agreementTemplateId || null,
    initialAppointmentId: data.initialAppointmentId || null,
    startDateSource: data.startDateSource || "MANUAL",
    agreementName: data.agreementName.trim(),
    status: data.status,
    agreementType: data.agreementType.trim() || null,
    startDate: data.startDate,
    termUnit: data.termUnit,
    termInterval: parseInt(data.termInterval, 10),
    renewalDate: data.renewalDate || null,
    nextServiceDate: data.nextServiceDate,
    billingPlanId: data.billingPlanId,
    soldByUserId: data.soldByUserId || null,
    priceCents: dollarsToCents(data.price),
    ...initialChargeFieldsFrom(data.initialCharge),
    recurrenceUnit: data.recurrenceUnit,
    recurrenceInterval: parseInt(data.recurrenceInterval, 10),
    generationLeadDays: parseInt(data.generationLeadDays, 10),
    serviceWindowDays: data.serviceWindowDays.trim() ? parseInt(data.serviceWindowDays, 10) : null,
    schedulingMode: data.schedulingMode,
    serviceTypeId: data.serviceTypeId || null,
    serviceTemplateName: data.serviceTemplateName.trim() || null,
    defaultDurationMinutes: data.defaultDurationMinutes.trim() ? parseInt(data.defaultDurationMinutes, 10) : null,
    serviceInstructions: data.serviceInstructions.trim() || null,
    contractUrl: data.contractUrl.trim() || null,
    contractSignedAt: data.contractSignedAt ? new Date(`${data.contractSignedAt}T00:00:00.000Z`).toISOString() : null,
    notes: data.notes.trim() || null,
  });

  const invalidateAgreementQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/agreements/location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
    invalidateAuditViews();
  };

  const persistAgreement = async (data: typeof form) => {
    const payload = buildAgreementPayload(data);
    const response = currentAgreement
      ? await apiRequest("PATCH", `/api/agreements/${currentAgreement.id}`, payload)
      : await apiRequest("POST", "/api/agreements", {
          agreementTemplateId: data.agreementTemplateId || null,
          agreement: payload,
        });

    const { initialChargeDue, ...savedAgreement } = await response.json() as WithInitialChargeDue<Agreement>;
    setDraftAgreement(savedAgreement as Agreement);
    invalidateAgreementQueries();
    // Pass 11d: a creation answers whether a down payment the office may
    // collect is still owed; the prompt fires once the form has closed.
    if (!currentAgreement && initialChargeDue) {
      createdInitialChargeDueRef.current = initialChargeDue;
    }
    return savedAgreement as Agreement;
  };

  const validateBeforeSave = () => {
    if (!currentAgreement && !form.agreementTemplateId) {
      toast({ title: "Select an agreement template before creating a location agreement", variant: "destructive" });
      return false;
    }

    if (!form.agreementName.trim() || !form.startDate || !form.nextServiceDate || !form.serviceTypeId) {
      toast({ title: "Agreement name, start date, next service date, and service type are required", variant: "destructive" });
      return false;
    }

    if (!form.billingPlanId) {
      toast({ title: "A billing plan is required - every agreement carries one", variant: "destructive" });
      return false;
    }

    if (parseInt(form.termInterval, 10) < 1 || parseInt(form.recurrenceInterval, 10) < 1 || parseInt(form.generationLeadDays, 10) < 0) {
      toast({ title: "Term and recurrence intervals must be at least 1 and lead days cannot be negative", variant: "destructive" });
      return false;
    }

    const initialChargeError = validateInitialChargeFormState(form.initialCharge);
    if (initialChargeError) {
      toast({ title: initialChargeError, variant: "destructive" });
      return false;
    }

    return true;
  };

  const mutation = useMutation({
    mutationFn: persistAgreement,
    onSuccess: () => {
      toast({ title: isEditMode ? "Agreement updated" : "Agreement created" });
      const due = createdInitialChargeDueRef.current;
      createdInitialChargeDueRef.current = null;
      onClose();
      if (due) onCreated?.(due);
    },
    onError: (error: Error) => {
      toast({ title: isEditMode ? "Error updating agreement" : "Error creating agreement", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSave()) {
      return;
    }

    mutation.mutate(form);
  };

  const initialServiceCandidates = useMemo(() => {
    return (appointments ?? [])
      .filter((appointment) => appointment.source !== "AGREEMENT_GENERATED")
      .filter((appointment) => !appointment.agreementId || appointment.agreementId === currentAgreement?.id)
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  }, [appointments, currentAgreement?.id]);

  const linkedInitialAppointment = useMemo(() => {
    if (!form.initialAppointmentId) {
      return null;
    }
    return (appointments ?? []).find((appointment) => appointment.id === form.initialAppointmentId) ?? null;
  }, [appointments, form.initialAppointmentId]);

  const handleScheduleInitialService = async () => {
    if (!validateBeforeSave()) {
      return;
    }

    try {
      const savedAgreement = await persistAgreement(form);
      const scheduledDate = `${(form.startDate || getTodayDateInputValue())}T14:00`;
      const returnTo = `/customers/${customerId}?locationId=${locationId}`;
      const params = new URLSearchParams({
        agreementId: savedAgreement.id,
        customerId,
        locationId,
        serviceTypeId: form.serviceTypeId,
        agreementName: savedAgreement.agreementName,
        scheduledDate,
        returnTo,
      });
      if (form.defaultDurationMinutes.trim()) params.set("expectedDurationMinutes", form.defaultDurationMinutes.trim());
      if (form.price.trim()) params.set("price", form.price.trim());
      if (form.serviceTemplateName.trim()) params.set("serviceTemplateName", form.serviceTemplateName.trim());
      setLocation(`/schedule?${params.toString()}`);
    } catch (error) {
      toast({ title: "Unable to prepare initial service scheduling", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleOpenLinkExistingService = async () => {
    if (initialServiceCandidates.length === 0) {
      toast({ title: "No existing services available to link for this location", variant: "destructive" });
      return;
    }

    if (!validateBeforeSave()) {
      return;
    }

    try {
      await persistAgreement(form);
      setLinkDialogOpen(true);
    } catch (error) {
      toast({ title: "Unable to prepare agreement for initial service linking", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleLinkExistingService = async (appointmentId: string) => {
    if (!currentAgreement) {
      return;
    }

    try {
      const response = await apiRequest("POST", `/api/agreements/${currentAgreement.id}/link-initial-appointment`, { appointmentId });
      const updatedAgreement = await response.json() as Agreement;
      setDraftAgreement(updatedAgreement);
      setForm(buildAgreementFormState(updatedAgreement, updatedAgreement.agreementTemplateId ? templateById.get(updatedAgreement.agreementTemplateId) ?? null : null));
      setRenewalDateOverridden(false);
      setNextServiceDateOverridden(false);
      invalidateAgreementQueries();
      setLinkDialogOpen(false);
      toast({ title: "Initial service linked" });
    } catch (error) {
      toast({ title: "Unable to link initial service", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Agreement Template</h3>
        <p className="text-sm text-muted-foreground">
          {isEditMode
            ? "This agreement keeps its own snapshot of values. Template changes do not rewrite it automatically."
            : "Start with a company template, then customize only what this location needs."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Agreement Template</Label>
        {isEditMode ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
            {selectedTemplateId ? (
              templateById.get(selectedTemplateId)?.name || "Template linked"
            ) : (
              <span className="text-muted-foreground">Custom / legacy agreement</span>
            )}
          </div>
        ) : (
          <Select value={form.agreementTemplateId} onValueChange={(value) => {
            setForm((prev) => ({ ...prev, agreementTemplateId: value }));
            applyTemplate(value);
          }}>
            <SelectTrigger data-testid="select-agreement-template"><SelectValue placeholder="Select a template" /></SelectTrigger>
            <SelectContent>
              {activeTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {!isEditMode && selectedTemplateId && templateById.get(selectedTemplateId)?.description && (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          {templateById.get(selectedTemplateId)?.description}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Agreement Dates and Status</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Agreement Name</Label><Input data-testid="input-agreement-name" value={form.agreementName} onChange={(e) => setForm((prev) => ({ ...prev, agreementName: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
            <SelectTrigger data-testid="select-agreement-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              {currentAgreement?.status === "CANCELLED" && <SelectItem value="CANCELLED" disabled>Cancelled</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => syncDerivedDates(e.target.value, { startDateSource: "MANUAL" })}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline" onClick={handleScheduleInitialService}>
              Schedule initial service
            </Button>
            <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline" onClick={handleOpenLinkExistingService}>
              Link existing service
            </Button>
          </div>
          {linkedInitialAppointment && (
            <p className="text-xs text-muted-foreground">
              {form.startDateSource === "INITIAL_APPOINTMENT" ? "Start date derived from linked service." : "Linked initial service retained for reference."}{" "}
              {new Date(linkedInitialAppointment.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
              ({linkedInitialAppointment.status}).
            </p>
          )}
        </div>
        <div className="space-y-1.5"><Label>Renewal Date</Label><Input type="date" value={form.renewalDate} onChange={(e) => { setRenewalDateOverridden(true); setForm((prev) => ({ ...prev, renewalDate: e.target.value })); }} /></div>
        <div className="space-y-1.5"><Label>Next Service Date</Label><Input type="date" value={form.nextServiceDate} onChange={(e) => { setNextServiceDateOverridden(true); setForm((prev) => ({ ...prev, nextServiceDate: e.target.value })); }} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Billing</h3>
        <p className="text-sm text-muted-foreground">Every agreement carries a Billing Plan; it decides how this agreement is charged. Plans are configured in Settings.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Billing Plan</Label>
        <Select value={form.billingPlanId} onValueChange={(value) => setForm((prev) => ({ ...prev, billingPlanId: value }))}>
          <SelectTrigger data-testid="select-agreement-billing-plan"><SelectValue placeholder="Select a billing plan (required)" /></SelectTrigger>
          <SelectContent>
            {selectableBillingPlans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>{plan.name}{plan.isActive ? "" : " (inactive)"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{describeBillingPlanBehavior(selectedBillingPlan)}</p>
        {isEditMode && (
          billingPlanChanged ? (
            <p className="text-xs text-muted-foreground">
              Saving re-anchors this agreement's billing schedule. Scheduled billing starts on the later of the agreement start date and today - periods that already elapsed are never back-billed.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {currentAgreement?.nextBillingDate
                ? `Next scheduled billing: ${formatDateOnly(currentAgreement.nextBillingDate)}.`
                : "Not on a billing schedule - each visit is the billing event."}
            </p>
          )
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Sale</h3>
        <p className="text-sm text-muted-foreground">Who sold this agreement - the basis a sales commission pays from. Recorded per user, office staff and technicians alike.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Sold by</Label>
        <Select
          value={form.soldByUserId || "NONE"}
          onValueChange={(value) => setForm((prev) => ({ ...prev, soldByUserId: value === "NONE" ? "" : value }))}
          disabled={!canAssignSaleCredit}
        >
          <SelectTrigger data-testid="select-agreement-sold-by"><SelectValue placeholder="Not recorded" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">Not recorded</SelectItem>
            {soldByOptions.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {userDisplayName(user)}{user.id === sessionUser?.id ? " (you)" : ""}{user.status === "active" ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {canAssignSaleCredit
            ? "Defaults to whoever creates the agreement. Changing it assigns sale credit to that user and is recorded in the agreement's history."
            : `Defaults to you. Only ${describePermissionHolders(PERMISSIONS.ASSIGN_SALE_CREDIT)} can credit the sale to someone else.`}
        </p>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Contract / Document</h3>
        <p className="text-sm text-muted-foreground">This MVP stores a contract link because the app does not yet have a dedicated file upload pipeline.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Contract Link</Label><Input type="url" value={form.contractUrl} onChange={(e) => setForm((prev) => ({ ...prev, contractUrl: e.target.value }))} placeholder="https://..." /></div>
        <div className="space-y-1.5"><Label>Contract Signed Date</Label><Input type="date" value={form.contractSignedAt} onChange={(e) => setForm((prev) => ({ ...prev, contractSignedAt: e.target.value }))} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Internal Notes</h3>
      </div>
      <div className="space-y-1.5"><Label>Internal Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="resize-none" /></div>
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Link Existing Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {initialServiceCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No qualifying location services are available to link.</p>
            ) : (
              initialServiceCandidates.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => handleLinkExistingService(appointment.id)}
                  className="w-full rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(appointment.scheduledDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {appointment.status} {appointment.assignedTo ? `| ${appointment.assignedTo}` : ""} {appointment.agreementId && appointment.agreementId !== currentAgreement?.id ? "| already linked to another agreement" : ""}
                      </p>
                      {appointment.notes && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{appointment.notes}</p>}
                    </div>
                    <span className="text-xs font-medium text-primary">Link</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Accordion type="single" collapsible className="rounded-md border px-3">
        <AccordionItem value="advanced-overrides" className="border-b-0">
          <AccordionTrigger className="py-3 text-sm font-medium">Advanced Overrides</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Recurrence / Scheduling Overrides</h3>
              <p className="text-sm text-muted-foreground">Only change these when this location needs behavior that differs from the selected template.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Agreement Term Unit</Label>
                <Select value={form.termUnit} onValueChange={(value) => syncDerivedDates(form.startDate, { termUnit: value })}>
                  <SelectTrigger data-testid="select-agreement-term-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGREEMENT_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>{AGREEMENT_UNIT_LABELS[unit]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Agreement Term Interval</Label><Input type="number" min="1" value={form.termInterval} onChange={(e) => syncDerivedDates(form.startDate, { termInterval: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Recurrence Unit</Label>
                <Select value={form.recurrenceUnit} onValueChange={(value) => syncDerivedDates(form.startDate, { recurrenceUnit: value })}>
                  <SelectTrigger data-testid="select-agreement-recurrence-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGREEMENT_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>{AGREEMENT_UNIT_LABELS[unit]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Recurrence Interval</Label><Input type="number" min="1" value={form.recurrenceInterval} onChange={(e) => syncDerivedDates(form.startDate, { recurrenceInterval: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Generation Lead Days</Label><Input type="number" min="0" value={form.generationLeadDays} onChange={(e) => setForm((prev) => ({ ...prev, generationLeadDays: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Service Window Days</Label><Input type="number" min="0" value={form.serviceWindowDays} onChange={(e) => setForm((prev) => ({ ...prev, serviceWindowDays: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Scheduling Mode</Label>
              <Select value={form.schedulingMode} onValueChange={(value) => setForm((prev) => ({ ...prev, schedulingMode: value }))}>
                <SelectTrigger data-testid="select-agreement-scheduling-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULING_MODES.map((mode) => <SelectItem key={mode} value={mode}>{SCHEDULING_MODE_LABELS[mode]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Agreement Type</Label>
              <Select value={form.agreementType || "NONE"} onValueChange={(value) => setForm((prev) => ({ ...prev, agreementType: value === "NONE" ? "" : value }))}>
                <SelectTrigger data-testid="select-agreement-type"><SelectValue placeholder="Select an agreement type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {selectableAgreementTypes.map((type) => (
                    <SelectItem key={type.id} value={type.key}>{type.label}{type.isActive ? "" : " (inactive)"}</SelectItem>
                  ))}
                  {form.agreementType && !selectableAgreementTypes.some((type) => type.key === form.agreementType) ? (
                    <SelectItem value={form.agreementType}>{form.agreementType} (not on the Settings list)</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">What kind of program this is. Starts from the template's type; a change here applies to this agreement only. The list is kept under Agreement Types in Settings.</p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Service Details</h3>
              <p className="text-sm text-muted-foreground">Use these only when this location needs service behavior that differs from the template defaults.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Service Type</Label>
                <Select value={form.serviceTypeId} onValueChange={(value) => setForm((prev) => ({ ...prev, serviceTypeId: value }))}>
                  <SelectTrigger data-testid="select-agreement-service-type"><SelectValue placeholder="Select service type" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes?.map((serviceType) => (
                      <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Service Template Name</Label><Input value={form.serviceTemplateName} onChange={(e) => setForm((prev) => ({ ...prev, serviceTemplateName: e.target.value }))} placeholder="Optional override label" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Default Duration Minutes</Label><Input type="number" min="0" value={form.defaultDurationMinutes} onChange={(e) => setForm((prev) => ({ ...prev, defaultDurationMinutes: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Price</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="Optional" /></div>
            </div>
            <InitialChargeFormFields
              value={form.initialCharge}
              onChange={(next) => setForm((prev) => ({ ...prev, initialCharge: next }))}
              contractPriceCents={dollarsToCents(form.price)}
            />
            <div className="space-y-1.5"><Label>Service Instructions</Label><Textarea value={form.serviceInstructions} onChange={(e) => setForm((prev) => ({ ...prev, serviceInstructions: e.target.value }))} className="resize-none" /></div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-agreement">
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Agreement" : "Create Agreement"}
        </Button>
      </div>
    </form>
  );
}

function formatCancellationFeeDisplay(policy?: AgreementCancellationPolicy | null, agreement?: Agreement | null) {
  const feeType = policy?.cancellationFeeType || agreement?.cancellationFeeType || "NONE";
  const feeAmountCents = policy?.cancellationFeeAmountCents ?? agreement?.cancellationFeeAmountCents;
  if (feeType === "NONE") return "No cancellation fee";
  if (feeType === "FLAT") return `${formatCurrency(centsToDollars(feeAmountCents))} flat cancellation fee`;
  if (feeType === "PERCENT_CONTRACT") return `${centsToDollars(feeAmountCents).toFixed(2)}% of contract price`;
  if (feeType === "PERCENT_REMAINING") return `${centsToDollars(feeAmountCents).toFixed(2)}% of remaining balance`;
  return feeAmountCents ? `${formatCurrency(centsToDollars(feeAmountCents))} manual cancellation fee` : "Manual fee review";
}

function CancelAgreementDialog({
  agreement,
  locationId,
  open,
  onOpenChange,
}: {
  agreement: Agreement | null;
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: policies } = useQuery<AgreementCancellationPolicy[]>({ queryKey: ["/api/agreement-cancellation-policies?includeInactive=true"], enabled: open });
  const policy = useMemo(() => policies?.find((item) => item.id === agreement?.cancellationPolicyId) ?? null, [agreement?.cancellationPolicyId, policies]);
  const [form, setForm] = useState({
    reason: "",
    effectiveDate: getTodayDateInputValue(),
    notes: "",
    cancelPendingServices: false,
    cancelScheduledAppointments: false,
    closeOpenOpportunities: false,
    createRetentionOpportunity: false,
    overrideApplied: false,
    overrideReason: "",
    cancellationFeeAmount: "",
    confirmed: false,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      reason: "",
      effectiveDate: getTodayDateInputValue(),
      notes: "",
      cancelPendingServices: policy?.cancelPendingServicesDefault ?? false,
      cancelScheduledAppointments: policy?.cancelScheduledAppointmentsDefault ?? false,
      closeOpenOpportunities: policy?.closeOpenOpportunitiesDefault ?? false,
      createRetentionOpportunity: policy?.createRetentionOpportunityDefault ?? false,
      overrideApplied: false,
      overrideReason: "",
      cancellationFeeAmount: policy?.cancellationFeeAmountCents != null ? centsToDollarString(policy.cancellationFeeAmountCents) : "",
      confirmed: false,
    });
  }, [open, policy]);

  // Q3: undefined on the first attempt; if "Cancel scheduled appointments"
  // would cancel a visit carrying a DRAFT invoice the server answers 409, the
  // prompt asks, and the retry carries the decision.
  const [draftPrompt, setDraftPrompt] = useState<DraftInvoiceRef[] | null>(null);
  const mutation = useMutation({
    mutationFn: async (voidDraftInvoices?: boolean) => {
      if (!agreement) throw new Error("Agreement is required");
      const response = await apiRequest("POST", `/api/agreements/${agreement.id}/cancel`, {
        reason: form.reason,
        effectiveDate: form.effectiveDate || null,
        notes: form.notes || null,
        cancelPendingServices: form.cancelPendingServices,
        cancelScheduledAppointments: form.cancelScheduledAppointments,
        closeOpenOpportunities: form.closeOpenOpportunities,
        createRetentionOpportunity: form.createRetentionOpportunity,
        overrideApplied: form.overrideApplied,
        overrideReason: form.overrideReason || null,
        cancellationFeeAmountCents: dollarsToCents(form.cancellationFeeAmount),
        voidDraftInvoices,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agreements/location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      invalidateAuditViews();
      setDraftPrompt(null);
      toast({ title: "Agreement cancelled" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      const drafts = getDraftInvoiceDecisionRequired(err);
      if (drafts) {
        setDraftPrompt(drafts);
        return;
      }
      toast({ title: "Error cancelling agreement", description: err.message, variant: "destructive" });
    },
  });

  const updateFlag = (key: "cancelPendingServices" | "cancelScheduledAppointments" | "closeOpenOpportunities" | "createRetentionOpportunity" | "overrideApplied" | "confirmed", checked: boolean) => {
    setForm((prev) => ({ ...prev, [key]: checked }));
  };

  if (!agreement) return null;

  const overrideAllowed = policy?.allowManagerOverride ?? true;
  const overrideReasonRequired = form.overrideApplied && (policy?.requiresOverrideReason ?? false);
  const canSubmit = form.reason.trim() && form.effectiveDate && form.confirmed && (!overrideReasonRequired || form.overrideReason.trim());

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cancel Agreement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{policy?.name || "No cancellation policy assigned"}</p>
                <p className="text-xs text-muted-foreground mt-1">{policy ? `${formatCancellationFeeDisplay(policy, agreement)} - ${policy.noticeDays} day notice - ${policy.effectiveDateMode.replaceAll("_", " ").toLowerCase()}` : "Legacy/manual cancellation path. Review impacts before confirming."}</p>
              </div>
              <Badge variant={policy ? "secondary" : "outline"}>{policy ? "Policy" : "Fallback"}</Badge>
            </div>
            {policy?.termsSummary && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{policy.termsSummary}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Cancellation Reason</Label><Input value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Customer requested cancellation" /></div>
            <div className="space-y-1.5"><Label>Effective Date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))} /></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cancelPendingServices} onChange={(e) => updateFlag("cancelPendingServices", e.target.checked)} /> Cancel pending generated services</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cancelScheduledAppointments} onChange={(e) => updateFlag("cancelScheduledAppointments", e.target.checked)} /> Cancel scheduled appointments</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.closeOpenOpportunities} onChange={(e) => updateFlag("closeOpenOpportunities", e.target.checked)} /> Close open opportunities</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.createRetentionOpportunity} onChange={(e) => updateFlag("createRetentionOpportunity", e.target.checked)} /> Create retention opportunity</label>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="resize-none" /></div>
          <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.overrideApplied} onChange={(e) => updateFlag("overrideApplied", e.target.checked)} disabled={!overrideAllowed} />
              Manager/Admin override
            </label>
            {!overrideAllowed && <p className="text-xs text-muted-foreground">This policy does not allow manager override.</p>}
            {form.overrideApplied && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Fee Override</Label><Input type="number" step="0.01" value={form.cancellationFeeAmount} onChange={(e) => setForm((p) => ({ ...p, cancellationFeeAmount: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Override Reason{overrideReasonRequired ? " *" : ""}</Label><Input value={form.overrideReason} onChange={(e) => setForm((p) => ({ ...p, overrideReason: e.target.value }))} /></div>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.confirmed} onChange={(e) => updateFlag("confirmed", e.target.checked)} />
            <span>I understand this will cancel the agreement and apply the selected policy impact actions.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
            <Button type="button" variant="destructive" disabled={mutation.isPending || !canSubmit} onClick={() => mutation.mutate(undefined)}>
              {mutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <DraftInvoiceVoidPrompt
      drafts={draftPrompt}
      isPending={mutation.isPending}
      onDecide={(voidDraftInvoices) => mutation.mutate(voidDraftInvoices)}
      onBack={() => setDraftPrompt(null)}
    />
    </>
  );
}

function AgreementsTab({
  customerId,
  locationId,
  appointments,
}: {
  customerId: string;
  locationId: string;
  appointments?: Appointment[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(null);
  const [cancellingAgreement, setCancellingAgreement] = useState<Agreement | null>(null);
  // Pass 11d: the office's prompt after creating an agreement with a down payment it may collect.
  const [initialChargeDue, setInitialChargeDue] = useState<InitialChargeDue | null>(null);
  const { data: agreements } = useQuery<Agreement[]>({ queryKey: ["/api/agreements/location", locationId], enabled: !!locationId });
  const { data: services } = useQuery<Service[]>({ queryKey: ["/api/services/by-location", locationId], enabled: !!locationId });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: agreementTemplates } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/agreement-templates"] });
  // Pass 35 (C5.3): the card's one type line names the key's label; inactive
  // included so a retired key still reads as its label.
  const { data: agreementTypes } = useQuery<AgreementTypeRow[]>({ queryKey: ["/api/agreement-types?includeInactive=true"] });
  // D6: the billing-plan pill needs the plan's name and cadence; the agreement
  // row carries only billingPlanId. Inactive included so a retired plan still names itself.
  const { planById: billingPlanById, isLoading: billingPlansLoading } = useBillingPlanById();
  // Pass 12: the sold-by line needs a name; the row carries only soldByUserId.
  const { data: users } = useQuery<UserSummary[]>({ queryKey: ["/api/users"] });
  const userById = useMemo(() => new Map((users ?? []).map((user) => [user.id, user])), [users]);

  const agreementAppointments = useMemo(() => {
    return (appointments ?? []).filter((appointment) => appointment.source === "AGREEMENT_GENERATED" && !!appointment.agreementId);
  }, [appointments]);

  const serviceTypeNameById = useMemo(() => {
    return new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name]));
  }, [serviceTypes]);
  const templateNameById = useMemo(() => {
    return new Map((agreementTemplates ?? []).map((template) => [template.id, template.name]));
  }, [agreementTemplates]);

  const appointmentsByAgreementId = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    for (const appointment of agreementAppointments) {
      if (!appointment.agreementId) {
        continue;
      }
      const items = grouped.get(appointment.agreementId) ?? [];
      items.push(appointment);
      grouped.set(appointment.agreementId, items);
    }
    return grouped;
  }, [agreementAppointments]);
  const servicesByAgreementId = useMemo(() => {
    const grouped = new Map<string, Service[]>();
    for (const service of services ?? []) {
      if (!service.agreementId || service.source !== "AGREEMENT_GENERATED") {
        continue;
      }
      const items = grouped.get(service.agreementId) ?? [];
      items.push(service);
      grouped.set(service.agreementId, items);
    }
    return grouped;
  }, [services]);
  const appointmentById = useMemo(() => {
    return new Map((appointments ?? []).map((appointment) => [appointment.id, appointment]));
  }, [appointments]);

  const openCreate = () => {
    setEditingAgreement(null);
    setDialogOpen(true);
  };

  const openEdit = (agreement: Agreement) => {
    setEditingAgreement(agreement);
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingAgreement(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate} data-testid="button-add-agreement">
              <Plus className="h-3 w-3 mr-1" /> Create Agreement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAgreement ? "Edit Agreement" : "Create Agreement"}</DialogTitle>
            </DialogHeader>
            <AgreementForm customerId={customerId} locationId={locationId} agreement={editingAgreement} appointments={appointments} onClose={() => closeDialog(false)} onCreated={setInitialChargeDue} />
          </DialogContent>
        </Dialog>
        <CancelAgreementDialog
          agreement={cancellingAgreement}
          locationId={locationId}
          open={!!cancellingAgreement}
          onOpenChange={(open) => { if (!open) setCancellingAgreement(null); }}
        />
        <InitialChargeDuePrompt due={initialChargeDue} onClose={() => setInitialChargeDue(null)} />
      </div>
      {!agreements || agreements.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-semibold">No agreements yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create an agreement to manage recurring service scheduling and contract details.</p>
          </CardContent>
        </Card>
      ) : (
        agreements
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .map((agreement) => {
            const linkedAppointments = (appointmentsByAgreementId.get(agreement.id) ?? [])
              .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
            const nextGeneratedAppointment = linkedAppointments.find((appointment) => appointment.status !== "COMPLETED" && appointment.status !== "CANCELED");
            const linkedServices = (servicesByAgreementId.get(agreement.id) ?? [])
              .sort((a, b) => (a.generatedForDate || a.dueDate || "").localeCompare(b.generatedForDate || b.dueDate || ""));
            const nextGeneratedService = linkedServices.find((service) => service.status !== "COMPLETED" && service.status !== "CANCELLED");
            const serviceTypeLabel = serviceTypeNameById.get(agreement.serviceTypeId || "") || agreement.serviceTemplateName || "Service not set";
            const initialAppointment = agreement.initialAppointmentId ? appointmentById.get(agreement.initialAppointmentId) ?? null : null;

            return (
              <Card key={agreement.id} data-testid={`card-agreement-${agreement.id}`}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{agreement.agreementName}</p>
                        <Badge variant="secondary" className={`text-xs ${agreementStatusBadgeClass(agreement.status)}`}>{agreement.status}</Badge>
                        <Badge variant="outline" className="text-xs">
                          {agreement.agreementTemplateId ? `Template: ${templateNameById.get(agreement.agreementTemplateId) || "Template"}` : "Custom agreement"}
                        </Badge>
                        {agreement.contractUrl && <Badge variant="outline" className="text-xs"><Link2 className="h-3 w-3 mr-1" /> Contract</Badge>}
                        {!billingPlansLoading && agreement.status !== "CANCELLED" && (
                          <BillingPlanPill agreement={agreement} plan={agreement.billingPlanId ? billingPlanById.get(agreement.billingPlanId) : null} />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agreement.status === "CANCELLED"
                          ? `Cancelled ${agreement.cancelledAt ? new Date(agreement.cancelledAt).toLocaleDateString() : ""}${agreement.cancellationEffectiveDate ? ` - Effective ${formatDateOnly(agreement.cancellationEffectiveDate)}` : ""}`
                          : `${formatAgreementRecurrence(agreement)} - Next due ${formatDateOnly(agreement.nextServiceDate)}`}
                      </p>
                      {agreement.agreementType ? (
                        <p className="text-xs text-muted-foreground" data-testid={`text-agreement-type-${agreement.id}`}>
                          Type: {describeAgreementType(agreement.agreementType, agreementTypes)}
                        </p>
                      ) : null}
                      {agreement.status === "CANCELLED" && (
                        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">Cancellation details</p>
                          <p>Reason: {agreement.cancellationReason || "Not recorded"}</p>
                          {agreement.cancellationNotes ? <p>Notes: {agreement.cancellationNotes}</p> : null}
                          <p>Fee: {formatCancellationFeeDisplay(null, agreement)}</p>
                          {agreement.cancellationOverrideApplied ? <p>Override: {agreement.cancellationOverrideReason || "Applied"}</p> : null}
                        </div>
                      )}
                      {initialAppointment && (
                        <p className="text-xs text-muted-foreground">
                          Initial service linked for {new Date(initialAppointment.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {agreement.status !== "CANCELLED" && (
                        <Button variant="outline" size="sm" onClick={() => setCancellingAgreement(agreement)}>
                          Cancel Agreement
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openEdit(agreement)} data-testid={`button-edit-agreement-${agreement.id}`}>
                        Edit
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service Type</p>
                      <p className="mt-1">{serviceTypeLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Price</p>
                      <p className="mt-1">{agreement.priceCents != null ? formatCurrency(centsToDollars(agreement.priceCents)) : "Not set"}</p>
                      {agreement.initialChargeType && (
                        <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-agreement-initial-charge-${agreement.id}`}>
                          {describeInitialCharge(agreement, agreement.priceCents)}
                        </p>
                      )}
                      <AgreementInitialChargeStatus agreement={agreement} />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead Time</p>
                      <p className="mt-1">{agreement.generationLeadDays} day{agreement.generationLeadDays === 1 ? "" : "s"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scheduling Mode</p>
                      {/* Pass 36 (C5.4): the shared label ("Auto-eligible"), not the raw enum. */}
                      <p className="mt-1" data-testid={`text-agreement-scheduling-${agreement.id}`}>{describeSchedulingModeLabel(agreement.schedulingMode || "MANUAL")}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sold by</p>
                      <p className="mt-1" data-testid={`text-agreement-sold-by-${agreement.id}`}>
                        {agreement.soldByUserId
                          ? userDisplayName(userById.get(agreement.soldByUserId)) || "Unknown user"
                          : "Not recorded"}
                      </p>
                    </div>
                  </div>
                  {agreement.status === "CANCELLED" ? (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      Cancelled agreements do not generate new pending services.
                    </div>
                  ) : nextGeneratedService ? (
                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      <p className="font-medium">Pending generated service</p>
                      <p className="text-muted-foreground mt-1">
                        Due {formatDateOnly(nextGeneratedService.dueDate)} | {nextGeneratedService.status}
                        {nextGeneratedService.serviceWindowStart ? ` | Window ${formatDateOnly(nextGeneratedService.serviceWindowStart)}-${formatDateOnly(nextGeneratedService.serviceWindowEnd)}` : ""}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      No pending generated service yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
      )}
    </div>
  );
}

// Pass 24 (PLAN_ROADMAP_V2.md C3.7): the work kind of a service line and, for a
// callback, the completed service it answers - the same two controls on the
// New Service lines and the Edit form. The kind defaults from the type until
// the user touches it (shared/service-kind.ts defaultWorkKindForService); a
// CALLBACK line cannot be saved without its answer (the server refuses
// CALLBACK_LINK_REQUIRED too). Disabled with the reason, never hidden, when
// the role may not re-designate this service or its ticket is finalized.
function ServiceWorkKindFields({
  workKind,
  answersServiceId,
  candidates,
  disabled,
  disabledReason,
  onChange,
  testIdSuffix,
}: {
  workKind: string;
  answersServiceId: string;
  candidates: Array<{ id: string; label: string }>;
  disabled?: boolean;
  disabledReason?: string | null;
  onChange: (updates: { workKind?: string; workKindTouched?: boolean; answersServiceId?: string }) => void;
  testIdSuffix: string;
}) {
  const isCallback = normalizeServiceWorkKind(workKind) === "CALLBACK";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Work Kind</Label>
        <Select value={normalizeServiceWorkKind(workKind)} onValueChange={(value) => onChange({ workKind: normalizeServiceWorkKind(value), workKindTouched: true, answersServiceId: value === "CALLBACK" ? answersServiceId : "" })} disabled={disabled}>
          <SelectTrigger data-testid={`select-service-work-kind-${testIdSuffix}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {SERVICE_WORK_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{formatServiceWorkKind(kind)}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{disabledReason ?? describeServiceWorkKind(workKind)}</p>
      </div>
      {isCallback ? (
        <div className="space-y-1.5">
          <Label>Answers</Label>
          <Select value={answersServiceId || "NONE"} onValueChange={(value) => onChange({ answersServiceId: value === "NONE" ? "" : value })} disabled={disabled}>
            <SelectTrigger data-testid={`select-service-answers-${testIdSuffix}`}><SelectValue placeholder="Pick the service this callback answers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Pick the service this callback answers</SelectItem>
              {candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {candidates.length ? "Required - a callback answers one of this location's completed services." : "No completed service at this location to answer - a callback needs one."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ServiceForm({
  customerId,
  locationId,
  service,
  onClose,
  answerCandidates = [],
}: {
  customerId: string;
  locationId: string;
  service?: Service | null;
  onClose: () => void;
  /** Pass 24 (C3.7): the location's completed, non-callback services a callback may answer, most recent first. */
  answerCandidates?: Array<{ id: string; label: string }>;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isEditMode = !!service;
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const [submitMode, setSubmitMode] = useState<"pending" | "schedule">("pending");
  const [form, setForm] = useState({
    dueDate: service?.dueDate ?? getTodayDateInputValue(),
    timeWindow: service?.timeWindow ?? DEFAULT_TIME_WINDOW_OPTIONS[1],
    notes: service?.notes ?? "",
  });
  const [serviceLines, setServiceLines] = useState<Array<{
    key: string;
    serviceTypeId: string;
    expectedDurationMinutes: string;
    price: string;
    workKind: string;
    workKindTouched: boolean;
    answersServiceId: string;
  }>>([
    {
      key: service?.id ?? "line-1",
      serviceTypeId: service?.serviceTypeId ?? "",
      expectedDurationMinutes: service?.expectedDurationMinutes ? String(service.expectedDurationMinutes) : "",
      price: service?.priceCents != null ? centsToDollarString(service.priceCents) : "",
      workKind: normalizeServiceWorkKind(service?.workKind),
      workKindTouched: !!service,
      answersServiceId: service?.answersServiceId ?? "",
    },
  ]);
  // Pass 24: who may set the kind away from the type's default, or change it
  // later - the price's rule (every role on a one-time service, manager+ on
  // an agreement one); a completed service's kind is frozen with its ticket.
  const canChangeKind = can(user?.role ?? "", workKindOverridePermission(!!service?.agreementId));
  const kindFrozen = isEditMode && service?.status === "COMPLETED";
  // Pass 28 (C4.3a, decision 7): an agreement service's type is the price's
  // rule - ADJUST_PRICE_AGREEMENT - and the server refuses a change without it
  // (403 SERVICE_TYPE_LOCKED). Before this pass the Select was offered to
  // every role and the PATCH wrote it. Disabled with the reason, never hidden.
  const canChangeType = !isEditMode || !service?.agreementId || can(user?.role ?? "", PERMISSIONS.ADJUST_PRICE_AGREEMENT);
  const typeLockReason = canChangeType ? null : `An agreement service's type is locked - ${describePermissionHolders(PERMISSIONS.ADJUST_PRICE_AGREEMENT)} may change it.`;
  const kindDisabledReason = kindFrozen
    ? "Frozen - this service's ticket is finalized, so its kind is history."
    : !canChangeKind
      ? (service?.agreementId ? `An agreement service's kind is locked - ${describePermissionHolders(PERMISSIONS.ADJUST_PRICE_AGREEMENT)} may change it.` : "Your role may not change a service's kind.")
      : null;
  const hasUnansweredCallback = serviceLines.some((line) => line.serviceTypeId && normalizeServiceWorkKind(line.workKind) === "CALLBACK" && !line.answersServiceId);

  const updateServiceLine = (key: string, updates: Partial<(typeof serviceLines)[number]>) => {
    setServiceLines((current) => current.map((line) => line.key === key ? { ...line, ...updates } : line));
  };

  const addServiceLine = () => {
    setServiceLines((current) => [
      ...current,
      {
        key: `line-${Date.now()}-${current.length + 1}`,
        serviceTypeId: "",
        expectedDurationMinutes: "",
        price: "",
        workKind: "SERVICE",
        workKindTouched: false,
        answersServiceId: "",
      },
    ]);
  };

  const removeServiceLine = (key: string) => {
    setServiceLines((current) => current.length > 1 ? current.filter((line) => line.key !== key) : current);
  };

  useEffect(() => {
    if (!serviceTypes || isEditMode) return;
    setServiceLines((current) => current.map((line) => {
      if (!line.serviceTypeId) return line;
      const selectedServiceType = serviceTypes.find((serviceType) => serviceType.id === line.serviceTypeId);
      if (!selectedServiceType) return line;
      return {
        ...line,
        expectedDurationMinutes: line.expectedDurationMinutes || (selectedServiceType.estimatedDuration ? String(selectedServiceType.estimatedDuration) : ""),
        price: line.price || (selectedServiceType.defaultPriceCents != null ? centsToDollarString(selectedServiceType.defaultPriceCents) : ""),
        workKind: line.workKindTouched ? line.workKind : defaultWorkKindForService({ typeKind: selectedServiceType.workKind, source: "MANUAL", hasAgreement: false }),
      };
    }));
  }, [isEditMode, serviceLines.length, serviceTypes]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!service) return;
      await apiRequest("DELETE", `/api/services/${service.id}`);
    },
    onSuccess: async () => {
      setServiceLines([{
        key: "line-1",
        serviceTypeId: "",
        expectedDurationMinutes: "",
        price: "",
        workKind: "SERVICE",
        workKindTouched: false,
        answersServiceId: "",
      }]);
      await queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
      invalidateAuditViews();
      toast({ title: "Service deleted" });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Unable to delete service", description: error.message, variant: "destructive" }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditMode && service) {
        const line = serviceLines[0];
        const payload = {
          customerId,
          locationId,
          agreementId: service.agreementId ?? null,
          serviceTypeId: line.serviceTypeId,
          dueDate: form.dueDate || null,
          timeWindow: form.timeWindow || null,
          expectedDurationMinutes: line.expectedDurationMinutes ? parseInt(line.expectedDurationMinutes, 10) : null,
          priceCents: dollarsToCents(line.price),
          status: service.status,
          assignedTechnicianId: service.assignedTechnicianId ?? null,
          source: service.source ?? "MANUAL",
          notes: form.notes.trim() || null,
          // Pass 24: the kind and its answer ride the same PATCH; the server
          // gates, locks and audits a change and ignores an unchanged value.
          workKind: normalizeServiceWorkKind(line.workKind),
          answersServiceId: normalizeServiceWorkKind(line.workKind) === "CALLBACK" ? line.answersServiceId || null : null,
        };

        const response = await apiRequest("PATCH", `/api/services/${service.id}`, payload);
        return [await response.json() as Service];
      }

      const createdServices: Service[] = [];
      for (const line of serviceLines.filter((entry) => entry.serviceTypeId)) {
        const response = await apiRequest("POST", "/api/services", {
          customerId,
          locationId,
          agreementId: null,
          serviceTypeId: line.serviceTypeId,
          dueDate: form.dueDate || null,
          timeWindow: form.timeWindow || null,
          expectedDurationMinutes: line.expectedDurationMinutes ? parseInt(line.expectedDurationMinutes, 10) : null,
          priceCents: dollarsToCents(line.price),
          status: "PENDING_SCHEDULING",
          assignedTechnicianId: null,
          source: "MANUAL",
          notes: form.notes.trim() || null,
          workKind: normalizeServiceWorkKind(line.workKind),
          answersServiceId: normalizeServiceWorkKind(line.workKind) === "CALLBACK" ? line.answersServiceId || null : null,
        });
        createdServices.push(await response.json() as Service);
      }

      return createdServices;
    },
    onSuccess: (savedServices) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
      invalidateAuditViews();

      if (submitMode === "schedule") {
        const [primaryService, ...additionalServices] = savedServices;
        if (!primaryService) {
          toast({ title: "No services were created", variant: "destructive" });
          return;
        }
        const params = new URLSearchParams({
          serviceId: primaryService.id,
          serviceIds: savedServices.map((savedService) => savedService.id).join(","),
          returnTo: `/customers/${customerId}?locationId=${locationId}`,
        });
        if (primaryService.dueDate) {
          params.set("date", primaryService.dueDate);
        }
        if (primaryService.timeWindow) params.set("timeWindow", primaryService.timeWindow);
        setLocation(`/schedule?${params.toString()}`);
        return;
      }

      toast({ title: isEditMode ? "Service updated" : savedServices.length > 1 ? "Services saved" : "Service saved" });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Error saving service", description: error.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
      {!isEditMode && (
        <div className="space-y-3">
          {serviceLines.map((line, index) => (
            <div key={line.key} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">Add Service {index + 1}</Label>
                {serviceLines.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeServiceLine(line.key)}>Remove</Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>Service Type</Label>
                  <Select value={line.serviceTypeId} onValueChange={(value) => {
                    const serviceType = serviceTypes?.find((item) => item.id === value);
                    const nextKind = line.workKindTouched ? line.workKind : defaultWorkKindForService({ typeKind: serviceType?.workKind, source: "MANUAL", hasAgreement: false });
                    updateServiceLine(line.key, {
                      serviceTypeId: value,
                      expectedDurationMinutes: line.expectedDurationMinutes || (serviceType?.estimatedDuration ? String(serviceType.estimatedDuration) : ""),
                      price: line.price || (serviceType?.defaultPriceCents != null ? centsToDollarString(serviceType.defaultPriceCents) : ""),
                      workKind: nextKind,
                      answersServiceId: normalizeServiceWorkKind(nextKind) === "CALLBACK" ? line.answersServiceId : "",
                    });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
                    <SelectContent>
                      {serviceTypes?.map((serviceType) => (
                        <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Expected Duration</Label>
                  <Input type="number" min="0" value={line.expectedDurationMinutes} onChange={(e) => updateServiceLine(line.key, { expectedDurationMinutes: e.target.value })} placeholder="Minutes" />
                </div>
                <div className="space-y-1.5">
                  <Label>Service Cost</Label>
                  <Input type="number" min="0" step="0.01" value={line.price} onChange={(e) => updateServiceLine(line.key, { price: e.target.value })} />
                </div>
              </div>
              {line.serviceTypeId ? (
                <ServiceWorkKindFields
                  workKind={line.workKind}
                  answersServiceId={line.answersServiceId}
                  candidates={answerCandidates}
                  disabled={!canChangeKind}
                  disabledReason={kindDisabledReason}
                  onChange={(updates) => updateServiceLine(line.key, updates)}
                  testIdSuffix={String(index + 1)}
                />
              ) : null}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addServiceLine}>Add Service</Button>
        </div>
      )}

      {isEditMode && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Service Type</Label>
            <Select value={serviceLines[0]?.serviceTypeId || ""} onValueChange={(value) => updateServiceLine(serviceLines[0].key, { serviceTypeId: value })} disabled={!canChangeType}>
              <SelectTrigger data-testid="select-service-type-edit"><SelectValue placeholder="Select service type" /></SelectTrigger>
              <SelectContent>
                {serviceTypes?.map((serviceType) => (
                  <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeLockReason ? <p className="text-xs text-muted-foreground" data-testid="text-service-type-locked">{typeLockReason}</p> : null}
          </div>
          <div className="space-y-1.5"><Label>Expected Duration</Label><Input type="number" min="0" value={serviceLines[0]?.expectedDurationMinutes || ""} onChange={(e) => updateServiceLine(serviceLines[0].key, { expectedDurationMinutes: e.target.value })} placeholder="Minutes" /></div>
          <div className="space-y-1.5"><Label>Service Cost</Label><Input type="number" min="0" step="0.01" value={serviceLines[0]?.price || ""} onChange={(e) => updateServiceLine(serviceLines[0].key, { price: e.target.value })} /></div>
        </div>
      )}

      {isEditMode && serviceLines[0] ? (
        <ServiceWorkKindFields
          workKind={serviceLines[0].workKind}
          answersServiceId={serviceLines[0].answersServiceId}
          candidates={answerCandidates}
          disabled={!canChangeKind || kindFrozen}
          disabledReason={kindDisabledReason}
          onChange={(updates) => updateServiceLine(serviceLines[0].key, updates)}
          testIdSuffix="edit"
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Target Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Time Window</Label>
          <Select value={form.timeWindow} onValueChange={(value) => setForm((prev) => ({ ...prev, timeWindow: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEFAULT_TIME_WINDOW_OPTIONS.map((windowOption) => (
                <SelectItem key={windowOption} value={windowOption}>{windowOption}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Instructions</Label><Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="resize-none" /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        {isEditMode && (
          <Button type="button" variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting..." : "Delete Service"}
          </Button>
        )}
        {!isEditMode && (
          <Button type="submit" variant="outline" onClick={() => setSubmitMode("pending")} disabled={mutation.isPending || serviceLines.every((line) => !line.serviceTypeId) || hasUnansweredCallback}>
            {mutation.isPending && submitMode === "pending" ? "Saving..." : "Save as Pending"}
          </Button>
        )}
        <Button type="submit" onClick={() => setSubmitMode(isEditMode ? "pending" : "schedule")} disabled={mutation.isPending || serviceLines.every((line) => !line.serviceTypeId) || hasUnansweredCallback} title={hasUnansweredCallback ? "A callback must name the service it answers" : undefined}>
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Service" : "Schedule Now"}
        </Button>
      </div>
    </form>
  );
}

function ServiceDetailModal({
  service,
  serviceTypeName,
  technicianName,
  appointment,
  serviceRecord,
  productApplications,
  invoice,
  siblingServices,
  serviceTypeNameById,
  statusLabel,
  onCompleteService,
  onFinalizeTicket,
  onReopenTicket,
  onOpenInvoice,
  locationName = null,
  answersLabel = null,
}: {
  service: Service;
  serviceTypeName: string;
  technicianName: string;
  appointment?: Appointment | null;
  serviceRecord?: ServiceRecord | null;
  productApplications?: ProductApplication[];
  invoice?: Invoice | null;
  siblingServices?: Service[];
  serviceTypeNameById: Map<string, string>;
  /** Pass 24 (C3.7): "Answers <type> on <date>" when this service is a callback. */
  answersLabel?: string | null;
  /** Pass 27: the schedule state's label (Scheduled / Pending scheduling / Rescheduling / Cancelled) in place of the raw status. */
  statusLabel?: string;
  onCompleteService?: (service: Service) => void;
  onFinalizeTicket?: (serviceRecord: ServiceRecord) => void;
  onReopenTicket?: (serviceRecord: ServiceRecord) => void;
  /** Pass 11b: the invoice number opens the invoice modal. */
  onOpenInvoice?: (invoiceId: string) => void;
  /** Pass 22 (C3.5): names the service report's download file. */
  locationName?: string | null;
}) {
  const displayDate = getServiceDisplayDate(service, appointment, serviceRecord);
  const siblingCount = Math.max((siblingServices?.length ?? 1) - 1, 0);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Service Type</p><p className="mt-1 font-medium">{serviceTypeName}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1">{statusLabel ?? service.status}</p></div>
        {/* Pass 24 (C3.7): what the work IS. The Billable / Production badge on the ticket is the invoice line, not this. */}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Work Kind</p>
          <div className="mt-1"><ServiceWorkKindBadge workKind={service.workKind} /></div>
          {answersLabel ? <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-service-answers-${service.id}`}>{answersLabel}</p> : null}
        </div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Service Date</p><p className="mt-1">{displayDate.label}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p><p className="mt-1">{technicianName || "Unassigned"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Cost</p><p className="mt-1">{service.priceCents != null ? formatCurrency(centsToDollars(service.priceCents)) : "Not set"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p><p className="mt-1">{service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Not set"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Time Window</p><p className="mt-1">{service.timeWindow || "Not set"}</p></div>
      </div>
      {appointment && (
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked Appointment</p>
          <p className="mt-1 font-medium">{formatDateTimeValue(appointment.scheduledDate)}</p>
          {siblingCount > 0 ? <p className="mt-1 text-xs text-muted-foreground">This visit also includes {siblingCount} other service{siblingCount === 1 ? "" : "s"}.</p> : null}
        </div>
      )}
      {invoice && (
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</p>
          <p className="mt-1 flex items-center gap-2 font-medium">
            <button type="button" className="text-primary underline" onClick={() => onOpenInvoice?.(invoice.id)} data-testid={`button-service-invoice-${invoice.id}`}>
              {invoice.invoiceNumber}
            </button>
            <InvoiceStatusBadge invoice={invoice} />
          </p>
          {invoice.status === "DRAFT" ? <p className="mt-1 text-xs text-muted-foreground">Draft - not issued to the customer yet. It is re-priced from the finalized tickets when issued.</p> : null}
        </div>
      )}
      {service.notes && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{service.notes}</p>
        </div>
      )}
      {serviceRecord && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Service Ticket</p>
            <Badge variant={serviceRecord.confirmed ? "default" : "secondary"}>{serviceRecord.confirmed ? "Finalized" : serviceRecord.ticketStatus?.replaceAll("_", " ") || "Office Review Pending"}</Badge>
          </div>
          {serviceRecord.technicianName && <p><span className="font-medium">Technician:</span> {serviceRecord.technicianName}</p>}
          {serviceRecord.technicianLicenseNumber && <p><span className="font-medium">License #:</span> {serviceRecord.technicianLicenseNumber}</p>}
          {appointment && <p><span className="font-medium">Duration:</span> {formatDuration(appointment.durationMinutes)}</p>}
          {serviceRecord.finalizedAt && <p><span className="font-medium">Finalized:</span> {formatDateTimeValue(serviceRecord.finalizedAt)}{serviceRecord.finalizedByLabel ? ` by ${serviceRecord.finalizedByLabel}` : ""}</p>}
          {serviceRecord.reopenedAt && <p><span className="font-medium">Reopened:</span> {formatDateTimeValue(serviceRecord.reopenedAt)}{serviceRecord.reopenedByLabel ? ` by ${serviceRecord.reopenedByLabel}` : ""}</p>}
          {formatReopenReason(serviceRecord) && <p><span className="font-medium">Reopen Reason:</span> {formatReopenReason(serviceRecord)}</p>}
          {serviceRecord.flaggedAt && <p><span className="font-medium">Flagged for Review:</span> {serviceRecord.flagReason || "Visit invoiced before this ticket was finalized"} ({formatDateTimeValue(serviceRecord.flaggedAt)}{serviceRecord.flaggedByLabel ? ` by ${serviceRecord.flaggedByLabel}` : ""})</p>}
          <p><span className="font-medium">Billing Readiness:</span> {serviceRecord.readyForBilling ? "Ready for billing" : "Not billing-ready"}</p>
          {serviceRecord.notes && <p><span className="font-medium">Notes:</span> {serviceRecord.notes}</p>}
          {serviceRecord.areasServiced && <p><span className="font-medium">Derived Areas:</span> {serviceRecord.areasServiced}</p>}
          {serviceRecord.targetPests && serviceRecord.targetPests.length > 0 && <p><span className="font-medium">Target Pests:</span> {serviceRecord.targetPests.join(", ")}</p>}
          {/* Pass 23 (C3.6): the field surcharge the ticket carries - its own line on the visit invoice. */}
          {describeSurcharge(serviceRecord) && <p data-testid={`text-service-surcharge-${serviceRecord.id}`}><span className="font-medium">Surcharge:</span> {describeSurcharge(serviceRecord)} (in addition to the service)</p>}
          {serviceRecord.conditionsFound && <p><span className="font-medium">Conditions:</span> {serviceRecord.conditionsFound}</p>}
          {serviceRecord.recommendations && <p><span className="font-medium">Recommendations:</span> {serviceRecord.recommendations}</p>}
          {serviceRecord.followUpRequired && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-950">
              <p className="font-bold">Follow-up Required</p>
              <p className="mt-1 whitespace-pre-wrap font-semibold">{serviceRecord.followUpNotes || "No follow-up notes provided."}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Pass 22 (C3.5): the customer-facing report of this ticket - Open / Download. */}
            <ServiceReportActions record={serviceRecord} locationName={locationName} />
            {serviceRecord.confirmed ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onReopenTicket?.(serviceRecord)}>Reopen Ticket</Button>
            ) : (
              <Button type="button" size="sm" onClick={() => onFinalizeTicket?.(serviceRecord)}>Finalize Ticket</Button>
            )}
          </div>
        </div>
      )}
      {productApplications && productApplications.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Materials / Chemicals</p>
          <div className="space-y-1">
            {productApplications.map((application) => (
              <div key={application.id} className="rounded-md border bg-muted/20 px-3 py-2">
                <p className="font-medium">{application.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {[application.amountApplied && `${application.amountApplied} ${application.unit || ""}`.trim(), formatApplicationAreas(application), formatTargetPests(application) && `for ${formatTargetPests(application)}`, application.applicationMethod, application.epaRegNumber ? `EPA ${application.epaRegNumber}` : null].filter(Boolean).join(" - ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {!serviceRecord && service.status !== "CANCELLED" && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => onCompleteService?.(service)}>
            Create Service Ticket
          </Button>
        </div>
      )}
      {appointment && siblingServices && siblingServices.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Other Services In This Visit</p>
          <div className="space-y-1">
            {siblingServices
              .filter((sibling) => sibling.id !== service.id)
              .map((sibling) => (
                <div key={sibling.id} className="rounded-md border bg-muted/20 px-3 py-2">
                  {serviceTypeNameById.get(sibling.serviceTypeId || "") || "Service"}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServicesTab({
  customerId,
  locationId,
  appointments,
  serviceRecords,
  invoices,
  onOpenInvoice,
  locationName = null,
}: {
  customerId: string;
  locationId: string;
  appointments?: Appointment[];
  serviceRecords?: ServiceRecord[];
  invoices?: Invoice[];
  /** Pass 11b: the Invoice column and the Service Details dialog open the invoice modal, not the Invoices tab. */
  onOpenInvoice: (invoiceId: string) => void;
  /** Pass 22 (C3.5): the location's name, for the service report's file name. */
  locationName?: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [completionService, setCompletionService] = useState<Service | null>(null);
  // Pass 28 (C4.3a; the owner's review of 2026-09-25, finding 5): cancel ONE
  // service - pending or placed - from its row, with the reason and the
  // opportunity choice (POST /api/services/:id/cancel).
  const [cancelService, setCancelService] = useState<Service | null>(null);
  // D2: Generate / Generate & Send / Later, when finalizing a ticket here
  // completes its visit under the PROMPT setting.
  const [invoicePrompt, setInvoicePrompt] = useState<InvoiceOnFinalizePromptState | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const canDraftInvoice = can(user?.role ?? "", PERMISSIONS.GENERATE_INVOICE);
  const { data: services } = useQuery<Service[]>({ queryKey: ["/api/services/by-location", locationId], enabled: !!locationId });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: productApplications } = useQuery<ProductApplication[]>({ queryKey: ["/api/product-applications"] });
  const [, setLocation] = useLocation();

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const technicianNameById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician.displayName])), [technicians]);
  const appointmentsById = useMemo(() => new Map((appointments ?? []).map((appointment) => [appointment.id, appointment])), [appointments]);
  const appointmentByServiceId = useMemo(() => {
    const map = new Map<string, Appointment>();
    for (const service of services ?? []) {
      if (service.appointmentId && appointmentsById.has(service.appointmentId)) {
        map.set(service.id, appointmentsById.get(service.appointmentId)!);
      }
    }
    for (const appointment of appointments ?? []) {
      if (appointment.serviceId && !map.has(appointment.serviceId)) map.set(appointment.serviceId, appointment);
    }
    return map;
  }, [appointments, appointmentsById, services]);
  const serviceRecordByServiceId = useMemo(() => {
    const map = new Map<string, ServiceRecord>();
    for (const serviceRecord of serviceRecords ?? []) {
      if (serviceRecord.serviceId) map.set(serviceRecord.serviceId, serviceRecord);
    }
    return map;
  }, [serviceRecords]);
  const invoiceByAppointmentId = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const invoice of invoices ?? []) {
      if (invoice.appointmentId) map.set(invoice.appointmentId, invoice);
    }
    return map;
  }, [invoices]);
  // Pass 24 (C3.7): the callback link. "Answers <type> on <date>" for a
  // callback row and the Service Details, and the picker's candidates - this
  // location's completed, non-callback services (shared/service-kind.ts
  // canAnswerService), most recent first, labelled "<type> on <date>".
  const serviceById = useMemo(() => new Map((services ?? []).map((service) => [service.id, service])), [services]);
  const answeredServiceParts = (answered: Service) => {
    const record = serviceRecordByServiceId.get(answered.id) ?? null;
    const appointment = appointmentByServiceId.get(answered.id) ?? null;
    return {
      typeName: serviceTypeNameById.get(answered.serviceTypeId || "") || "Service",
      dateLabel: getServiceDisplayDate(answered, appointment, record).label,
      sortKey: String(record?.serviceDate ?? appointment?.scheduledDate ?? answered.dueDate ?? ""),
    };
  };
  const answersLabelFor = (service: Service): string | null => {
    if (!service.answersServiceId) return null;
    const answered = serviceById.get(service.answersServiceId);
    if (!answered) return "Answers a service that is no longer listed at this location";
    const parts = answeredServiceParts(answered);
    return describeAnswersLink(parts.typeName, parts.dateLabel);
  };
  const answerCandidates = useMemo(() => (services ?? [])
    .filter((candidate) => canAnswerService(candidate))
    .map((candidate) => {
      const parts = answeredServiceParts(candidate);
      return { id: candidate.id, label: `${parts.typeName} on ${parts.dateLabel}`, sortKey: parts.sortKey };
    })
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map(({ id, label }) => ({ id, label })), [services, serviceTypeNameById, appointmentByServiceId, serviceRecordByServiceId]);
  // Both anchors (D1): the per-service-record one for appointment-less work and
  // for invoices issued before the visit anchor existed, then the appointment
  // one, where a single invoice covers every service on the visit. The
  // appointment pass runs second so a visit invoice wins over a legacy
  // per-ticket row for the same service.
  const invoiceByServiceId = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const invoice of invoices ?? []) {
      const matchedServiceRecord = serviceRecords?.find((serviceRecord) => serviceRecord.id === invoice.serviceRecordId);
      if (matchedServiceRecord?.serviceId) {
        map.set(matchedServiceRecord.serviceId, invoice);
      }
    }
    for (const service of services ?? []) {
      if (!service.appointmentId) continue;
      const invoice = invoiceByAppointmentId.get(service.appointmentId);
      if (invoice) map.set(service.id, invoice);
    }
    return map;
  }, [invoiceByAppointmentId, invoices, serviceRecords, services]);
  const productApplicationsByServiceRecordId = useMemo(() => {
    const map = new Map<string, ProductApplication[]>();
    for (const application of productApplications ?? []) {
      const existing = map.get(application.serviceRecordId) ?? [];
      existing.push(application);
      map.set(application.serviceRecordId, existing);
    }
    return map;
  }, [productApplications]);
  const siblingServicesByAppointmentId = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of services ?? []) {
      const appointmentId = service.appointmentId;
      if (!appointmentId) continue;
      const existing = map.get(appointmentId) ?? [];
      existing.push(service);
      map.set(appointmentId, existing);
    }
    return map;
  }, [services]);

  // Pass 27 (C4.2, Q4's gap): what the Status column says for a service
  // with no ticket yet. A pending service's "last appointment" is the
  // placement it was taken off (services.lastAppointmentId, set by the
  // disposition) or, for rows from before that column, the canceled
  // appointment that named it as its representative. Scheduled / Pending
  // scheduling / Rescheduling (back in the queue by a reschedule) /
  // Cancelled are told apart, and the live visit - the one the date, the
  // Draft invoice button and Reschedule refer to - is only a placement that
  // still stands, never a cancelled one.
  const scheduleByServiceId = useMemo(() => {
    const map = new Map<string, { state: ServiceScheduleState; lastAppointment: Appointment | null; liveAppointment: Appointment | null }>();
    for (const service of services ?? []) {
      const linked = service.appointmentId ? appointmentsById.get(service.appointmentId) ?? null : null;
      const lastAppointment = linked
        ?? (service.lastAppointmentId ? appointmentsById.get(service.lastAppointmentId) ?? null : null)
        ?? appointmentByServiceId.get(service.id)
        ?? null;
      const state = resolveServiceScheduleState(service, lastAppointment);
      const liveAppointment = lastAppointment && lastAppointment.status !== "CANCELED" ? lastAppointment : null;
      map.set(service.id, { state, lastAppointment, liveAppointment });
    }
    return map;
  }, [appointmentByServiceId, appointmentsById, services]);

  const sortedServices = useMemo(() => {
    return [...(services ?? [])].sort((a, b) => {
      const appointmentA = appointmentByServiceId.get(a.id) ?? null;
      const appointmentB = appointmentByServiceId.get(b.id) ?? null;
      const serviceRecordA = serviceRecordByServiceId.get(a.id) ?? null;
      const serviceRecordB = serviceRecordByServiceId.get(b.id) ?? null;
      const dateA = serviceRecordA?.serviceDate
        ? new Date(serviceRecordA.serviceDate).toISOString()
        : appointmentA?.scheduledDate
          ? new Date(appointmentA.scheduledDate).toISOString()
          : `${a.dueDate ?? ""}T00:00:00.000Z`;
      const dateB = serviceRecordB?.serviceDate
        ? new Date(serviceRecordB.serviceDate).toISOString()
        : appointmentB?.scheduledDate
          ? new Date(appointmentB.scheduledDate).toISOString()
          : `${b.dueDate ?? ""}T00:00:00.000Z`;
      return dateB.localeCompare(dateA);
    });
  }, [appointmentByServiceId, serviceRecordByServiceId, services]);

  const openCreate = () => {
    setEditingService(null);
    setDialogOpen(true);
  };

  const scheduleService = (service: Service) => {
    const params = new URLSearchParams({
      serviceId: service.id,
      returnTo: `/customers/${customerId}?locationId=${locationId}`,
    });
    const linkedAppointment = scheduleByServiceId.get(service.id)?.liveAppointment ?? null;
    if (linkedAppointment) {
      params.set("appointmentId", linkedAppointment.id);
    }
    if (service.dueDate) params.set("date", service.dueDate);
    setLocation(`/schedule?${params.toString()}`);
  };

  const finalizeTicketMutation = useMutation({
    mutationFn: async (serviceRecord: ServiceRecord) => {
      const response = await apiRequest("POST", `/api/service-records/${serviceRecord.id}/finalize`, {});
      return response.json() as Promise<FinalizeServiceRecordResponse>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-records/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      invalidateAuditViews();
      // D2: the finalization that completes the visit reports its invoicing
      // outcome - a prompt under PROMPT, a toast otherwise.
      if (result.invoicing) invalidateInvoiceViews();
      const prompt = getInvoiceOnFinalizePrompt(result);
      if (prompt) {
        setInvoicePrompt(prompt);
        return;
      }
      toast(describeFinalizeResult(result));
    },
    onError: (error: Error) => toast({ title: "Unable to finalize ticket", description: error.message, variant: "destructive" }),
  });

  const reopenTicketMutation = useMutation({
    mutationFn: async (serviceRecord: ServiceRecord) => {
      const reason = window.prompt("Reopen reason is required");
      if (!reason?.trim()) throw new Error("Reopen reason is required");
      const response = await apiRequest("POST", `/api/service-records/${serviceRecord.id}/reopen`, { reason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-records/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      invalidateAuditViews();
      toast({ title: "Service ticket reopened" });
    },
    onError: (error: Error) => toast({ title: "Unable to reopen ticket", description: error.message, variant: "destructive" }),
  });

  // D3: a DRAFT against a visit whose tickets are not finalized yet - office
  // prep. Issued later from the Invoices screen (or adopted by Generate once
  // every ticket on the visit is finalized).
  const draftInvoiceMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("POST", `/api/invoices/draft-for-appointment/${appointmentId}`, {});
      return response.json() as Promise<Invoice>;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: `Draft invoice ${invoice.invoiceNumber} created`, description: "Issue it from the Invoices screen. It is re-priced from the finalized tickets when issued." });
    },
    onError: (error: Error) => toast({ title: "Unable to draft invoice", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Plus className="h-3 w-3 mr-1" /> New Service</Button></DialogTrigger>
          {/* Pass 36 (C5.4; FB-010): the Service Details dialog's width - the default max-w-lg squeezed
              the form. The one dialog serves New Service and Edit Service. */}
          <DialogContent className="max-w-2xl" data-testid="dialog-service-form">
            <DialogHeader><DialogTitle>{editingService ? "Edit Service" : "New Service"}</DialogTitle></DialogHeader>
            <ServiceForm customerId={customerId} locationId={locationId} service={editingService} onClose={() => setDialogOpen(false)} answerCandidates={answerCandidates.filter((candidate) => candidate.id !== editingService?.id)} />
          </DialogContent>
        </Dialog>
      </div>
      {!sortedServices.length ? (
        <Card><CardContent className="py-8 text-center"><ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No services for this location yet.</p></CardContent></Card>
      ) : (
        <div className="rounded-md border">
          <div className="grid grid-cols-[1fr_1.45fr_0.8fr_0.9fr_0.95fr_0.7fr_1fr] gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Service Date</span>
            <span>Service Type</span>
            <span>Status</span>
            <span>Service Cost</span>
            <span>Technician</span>
            <span>Invoice</span>
            <span className="text-right">Actions</span>
          </div>
          {sortedServices.map((service) => {
            const schedule = scheduleByServiceId.get(service.id);
            const appointment = schedule?.liveAppointment ?? null;
            const lastAppointment = schedule?.lastAppointment ?? null;
            const scheduleState = schedule?.state ?? resolveServiceScheduleState(service, null);
            const serviceRecord = serviceRecordByServiceId.get(service.id) ?? null;
            const invoice = invoiceByServiceId.get(service.id) ?? null;
            const displayDate = getServiceDisplayDate(service, appointment, serviceRecord);
            const siblingServices = service.appointmentId ? siblingServicesByAppointmentId.get(service.appointmentId) ?? [service] : [service];
            const siblingCount = Math.max(siblingServices.length - 1, 0);
            const hasSharedVisit = !!service.appointmentId && !!appointment && siblingCount > 0;
            const technicianName = technicianNameById.get(service.assignedTechnicianId || "") || serviceRecord?.technicianName || "Unassigned";
            const serviceStatusLabel = serviceRecord?.confirmed
              ? "Finalized"
              : serviceRecord?.ticketStatus === "REOPENED"
                ? "Reopened"
                : serviceRecord?.ticketStatus === "FLAGGED_FOR_REVIEW"
                  ? "Flagged for review"
                  : serviceRecord
                    ? "Posted"
                    : SERVICE_SCHEDULE_STATE_LABELS[scheduleState];
            const canDraftForVisit =
              canDraftInvoice && !invoice && !!appointment && appointment.status !== "CANCELED" && appointment.status !== "COMPLETED" && service.status !== "CANCELLED";
            // Pass 28: why Cancel cannot apply, else null - the same refusals
            // the route answers, decided here so the button is disabled with
            // the reason rather than failing (dev behavior rule 6).
            const activeSiblingCount = appointment
              ? siblingServices.filter((sibling) => sibling.status !== "COMPLETED" && sibling.status !== "CANCELLED").length
              : 0;
            const cancelDisabledReason = service.status === "COMPLETED"
              ? "Completed - the ticket owns it"
              : service.status === "CANCELLED"
                ? "Already cancelled"
                : serviceRecord
                  ? "A ticket is posted on this service - reopen or edit the ticket instead"
                  : appointment && activeSiblingCount <= 1
                    ? "The only service on its visit - cancel or reschedule the appointment from the dispatch board"
                    : null;
            return (
              <div
                key={service.id}
                onClick={() => setDetailService(service)}
                className="grid w-full cursor-pointer grid-cols-[1fr_1.45fr_0.8fr_0.9fr_0.95fr_0.7fr_1fr] gap-2 border-b px-3 py-2 text-left text-sm transition-colors hover:bg-muted/20 last:border-b-0"
              >
                <span>
                  <span className="block">{displayDate.label}</span>
                  {displayDate.source === "scheduled" ? <span className="text-xs text-muted-foreground">Scheduled visit date</span> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"}</span>
                  <ServiceWorkKindListBadge workKind={service.workKind} className="mt-1 h-5 px-1.5 text-[10px]" />
                  {hasSharedVisit ? (
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Shared visit</Badge>
                      {`With ${siblingCount} other service${siblingCount === 1 ? "" : "s"}`}
                    </span>
                  ) : null}
                </span>
                <span>
                  <Badge
                    variant={serviceRecord?.confirmed ? "default" : serviceRecord ? "secondary" : scheduleStateBadgeVariant(scheduleState)}
                    className={cn("text-[10px] uppercase tracking-wide", serviceRecord ? "" : scheduleStateBadgeClass(scheduleState))}
                  >
                    {serviceStatusLabel}
                  </Badge>
                  {!serviceRecord && scheduleState === "RESCHEDULING" && lastAppointment ? (
                    <span className="mt-1 block text-xs text-muted-foreground">Was {formatDateTimeValue(lastAppointment.scheduledDate)}</span>
                  ) : null}
                  {!serviceRecord && scheduleState === "CANCELLED" && lastAppointment?.cancelReason ? (
                    <span className="mt-1 block text-xs text-muted-foreground">{lastAppointment.cancelReason}</span>
                  ) : null}
                  {/* Pass 29 (C4.3b): added from the field - the office's review flag. */}
                  <FieldAddedBadge service={service} className="mt-1 h-5 px-1.5 text-[10px]" />
                </span>
                <span>{service.priceCents != null ? formatCurrency(centsToDollars(service.priceCents)) : "Not set"}</span>
                <span className="truncate">{technicianName}</span>
                <span>
                  {invoice ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenInvoice(invoice.id);
                        }}
                        data-testid={`button-service-row-invoice-${invoice.id}`}
                      >
                        {invoice.invoiceNumber}
                      </button>
                      {invoice.status === "DRAFT" ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Draft</Badge> : null}
                    </span>
                  ) : canDraftForVisit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(event) => { event.stopPropagation(); draftInvoiceMutation.mutate(appointment!.id); }}
                      disabled={draftInvoiceMutation.isPending}
                    >
                      Draft invoice
                    </Button>
                  ) : "—"}
                </span>
                <span className="flex justify-end gap-1">
                  <MarkFieldReviewedButton service={service} className="h-8 px-2" />
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={(event) => { event.stopPropagation(); setEditingService(service); setDialogOpen(true); }}>Edit</Button>
                  <Button type="button" size="sm" className="h-8 px-2" onClick={(event) => { event.stopPropagation(); scheduleService(service); }} disabled={service.status === "COMPLETED" || service.status === "CANCELLED"}>
                    {appointment ? "Reschedule" : "Schedule"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:text-destructive"
                    onClick={(event) => { event.stopPropagation(); setCancelService(service); }}
                    disabled={!!cancelDisabledReason}
                    title={cancelDisabledReason ?? (service.agreementId ? "Recycle this agreement visit with a reason" : "Cancel this service with a reason")}
                    data-testid={`button-service-row-cancel-${service.id}`}
                  >
                    Cancel
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!detailService} onOpenChange={(open) => !open && setDetailService(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Service Details</DialogTitle></DialogHeader>
          {detailService && (
            <ServiceDetailModal
              service={detailService}
              serviceTypeName={serviceTypeNameById.get(detailService.serviceTypeId || "") || "Service"}
              technicianName={technicianNameById.get(detailService.assignedTechnicianId || "") || serviceRecordByServiceId.get(detailService.id)?.technicianName || "Unassigned"}
              appointment={scheduleByServiceId.get(detailService.id)?.liveAppointment ?? null}
              statusLabel={serviceRecordByServiceId.get(detailService.id) ? undefined : SERVICE_SCHEDULE_STATE_LABELS[scheduleByServiceId.get(detailService.id)?.state ?? resolveServiceScheduleState(detailService, null)]}
              serviceRecord={serviceRecordByServiceId.get(detailService.id) ?? null}
              productApplications={(() => {
                const record = serviceRecordByServiceId.get(detailService.id);
                return record ? productApplicationsByServiceRecordId.get(record.id) ?? [] : [];
              })()}
              invoice={invoiceByServiceId.get(detailService.id) ?? null}
              siblingServices={(appointmentByServiceId.get(detailService.id) ? siblingServicesByAppointmentId.get(appointmentByServiceId.get(detailService.id)!.id) : undefined) ?? [detailService]}
              serviceTypeNameById={serviceTypeNameById}
              onCompleteService={(service) => setCompletionService(service)}
              onFinalizeTicket={(serviceRecord) => finalizeTicketMutation.mutate(serviceRecord)}
              onReopenTicket={(serviceRecord) => reopenTicketMutation.mutate(serviceRecord)}
              onOpenInvoice={onOpenInvoice}
              locationName={locationName}
              answersLabel={answersLabelFor(detailService)}
            />
          )}
        </DialogContent>
      </Dialog>
      <InvoiceOnFinalizePrompt prompt={invoicePrompt} onClose={() => setInvoicePrompt(null)} />
      <ServiceCancelDialog
        service={cancelService}
        serviceTypeName={cancelService ? serviceTypeNameById.get(cancelService.serviceTypeId || "") || "Service" : "Service"}
        open={!!cancelService}
        onOpenChange={(open) => { if (!open) setCancelService(null); }}
        onCancelled={() => {
          setCancelService(null);
          setDetailService(null);
        }}
      />
      <ServiceCompletionDialog
        open={!!completionService}
        onOpenChange={(open) => !open && setCompletionService(null)}
        service={completionService}
        appointment={completionService ? appointmentByServiceId.get(completionService.id) ?? null : null}
        technicians={technicians}
        serviceTypes={serviceTypes}
        defaultTechnicianId={completionService?.assignedTechnicianId ?? null}
        onCompleted={() => {
          setCompletionService(null);
          setDetailService(null);
        }}
      />
    </div>
  );
}

function OpportunitiesTab({
  locationId,
  customerId,
  customerLabel,
  locationLabel,
}: {
  locationId: string;
  customerId: string;
  customerLabel: string;
  locationLabel: string;
}) {
  const { data: opportunities } = useQuery<Opportunity[]>({ queryKey: ["/api/opportunities/by-location", locationId], enabled: !!locationId });
  const { data: dispositions } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  // Pass 25 (C4.1): the taxonomy chips name the category and the assignee.
  // Display only here; the Opportunities screen is where they change.
  const { data: opportunityCategories } = useQuery<OpportunityCategory[]>({ queryKey: ["/api/opportunity-categories?includeInactive=true"] });
  const { data: orgUsers } = useQuery<UserSummary[]>({ queryKey: ["/api/users"] });
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [selectedDispositionId, setSelectedDispositionId] = useState<string | null>(null);
  const [historyOpportunity, setHistoryOpportunity] = useState<Opportunity | null>(null);
  const [convertOpportunity, setConvertOpportunity] = useState<Opportunity | null>(null);

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const sortedOpportunities = useMemo(() => {
    return [...(opportunities ?? [])]
      .filter((opportunity) => opportunity.status !== "CONVERTED" && opportunity.status !== "DISMISSED")
      .sort((a, b) => (a.nextActionDate || a.dueDate).localeCompare(b.nextActionDate || b.dueDate));
  }, [opportunities]);
  const activeDispositions = (dispositions ?? []).filter((item) => item.isActive && item.key !== "CONVERTED_TO_SERVICE");
  const invalidateOpportunities = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
  };
  if (!sortedOpportunities.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No open opportunities for this location.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortedOpportunities.map((opportunity) => (
        <Card key={opportunity.id}>
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{opportunity.opportunityType || serviceTypeNameById.get(opportunity.serviceTypeId || "") || "Opportunity"}</p>
                <Badge variant="outline">{opportunity.status}</Badge>
              </div>
              <OpportunityTaxonomyChips className="mt-1.5" opportunity={opportunity} categories={opportunityCategories} users={orgUsers} />
              <p className="mt-1 text-sm text-muted-foreground">Next action {formatDateOnly(opportunity.nextActionDate || opportunity.dueDate)}</p>
              {opportunity.lastDispositionLabel ? <p className="mt-1 text-xs text-muted-foreground">Last disposition: {opportunity.lastDispositionLabel}</p> : null}
              {opportunity.notes ? <p className="mt-2 text-sm text-muted-foreground">{opportunity.notes}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={!activeDispositions.length}>
                    Disposition <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {activeDispositions.map((disposition) => (
                    <DropdownMenuItem
                      key={disposition.id}
                      onClick={() => {
                        setSelectedOpportunity(opportunity);
                        setSelectedDispositionId(disposition.id);
                      }}
                    >
                      {disposition.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpportunity(opportunity)}>
                View History
              </Button>
              <Button type="button" size="sm" disabled={opportunity.status === "CONVERTED" || opportunity.status === "DISMISSED"} onClick={() => setConvertOpportunity(opportunity)}>
                Convert to Service
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <OpportunityDispositionDialog
        open={!!selectedOpportunity && !!selectedDispositionId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOpportunity(null);
            setSelectedDispositionId(null);
          }
        }}
        opportunity={selectedOpportunity}
        dispositionId={selectedDispositionId}
        onApplied={invalidateOpportunities}
      />
      <OpportunityHistoryDialog
        open={!!historyOpportunity}
        onOpenChange={(open) => {
          if (!open) setHistoryOpportunity(null);
        }}
        opportunity={historyOpportunity}
      />
      <OpportunityConvertDialog
        open={!!convertOpportunity}
        onOpenChange={(open) => {
          if (!open) setConvertOpportunity(null);
        }}
        opportunity={convertOpportunity}
        customerLabel={customerLabel}
        locationLabel={locationLabel}
        opportunityTypeLabel={convertOpportunity ? (convertOpportunity.opportunityType || serviceTypeNameById.get(convertOpportunity.serviceTypeId || "") || "Opportunity") : "Opportunity"}
        sourceServiceLabel={convertOpportunity ? (serviceTypeNameById.get(convertOpportunity.serviceTypeId || "") || "Linked source service") : "Source service unavailable"}
        serviceTypeLabel={convertOpportunity ? (serviceTypeNameById.get(convertOpportunity.serviceTypeId || "") || "Service") : "Service"}
        returnTo={`/customers/${customerId}?locationId=${locationId}&tab=opportunities`}
        onConverted={invalidateOpportunities}
      />
    </div>
  );
}

export default function CustomerDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id || "";
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  const urlLocationId = searchParams.get("locationId");
  // Pass 11b: the open invoice is the URL, as on the Invoices screen -
  // /customers/:id?locationId=&tab=&invoiceId= deep-links into the modal.
  const openInvoiceId = searchParams.get("invoiceId");

  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [editLocDialogOpen, setEditLocDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  // Pass 15 (C2.5): the account statement across every location, from the
  // header - gated as the location's Statement button is (GENERATE_INVOICE).
  const [statementOpen, setStatementOpen] = useState(false);
  // Pass 33 (C5.1b): the customer-level History - every location plus the
  // account-level rows - from the same toolbar, open to every role (a read).
  const [historyOpen, setHistoryOpen] = useState(false);
  const { user: sessionUser } = useAuth();
  const canStatement = can(sessionUser?.role ?? "", PERMISSIONS.GENERATE_INVOICE);
  const [activeTab, setActiveTab] = useState("contacts");
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    // The Comms trigger's value is "comms"; links written as ?tab=communications
    // selected nothing before Pass 33 - both spellings land on the tab now.
    const tab = requestedTab === "communications" ? "comms" : requestedTab;
    if (tab && ["contacts", "agreements", "services", "invoices", "comms", "opportunities", "history"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [requestedTab]);

  const { data: compat, isLoading } = useQuery<CustomerDetailCompatResponse>({
    queryKey: [`/api/customer-detail-compat/${customerId}${urlLocationId ? `?locationId=${urlLocationId}` : ""}`],
  });

  const customer = compat?.legacyCustomer;
  const allLocations = compat?.relatedLocations;
  const primaryLocation = compat?.primaryLocation;
  const activeLocation = compat?.selectedLocation;
  const activeLocationId = activeLocation?.id || "";
  // Pass 34 (C5.2): the selected location's resolved billing (the chip, the
  // profile card) and the locations with an override (the switcher's badge),
  // from the compat read - the forward pointer, billing_profiles.location_id
  // (the legacy mirror on locations was dropped in Pass 39).
  const locationBilling = compat?.billing ?? null;
  const billingOverrideLocationIds = useMemo(() => new Set(compat?.billingOverrideLocationIds ?? []), [compat?.billingOverrideLocationIds]);
  const locationBillingTerms = describeBillingProfileTerms(locationBilling, describeInvoiceTerms);

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: accountContacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts", customerId], enabled: !!customerId });
  const { data: locationBalances } = useQuery<LocationBalanceSummary[]>({ queryKey: ["/api/location-balances", customerId], enabled: !!customerId });
  // Pass 30 (C4.4): the account's "all locations" preferences (header chips)
  // and what applies at the selected location (profile card chips).
  const { data: activeLocationPreferences } = useLocationTechnicianPreferences(activeLocationId || null);
  // Pass 14 (C2.4): the customer's aging, derived - the header card's chips
  // read the rollup, the location profile's strip reads the selected
  // location's entry. Refreshed by invalidateInvoiceViews with the ledger.
  const { data: customerAging, isLoading: customerAgingLoading } = useQuery<CustomerAging>({ queryKey: ["/api/customers", customerId, "aging"], enabled: !!customerId });

  const { data: locationCounts } = useQuery<{ contacts: number; appointments: number; agreements: number; services: number; invoices: number; communications: number; opportunities: number }>({
    queryKey: ["/api/location-counts", activeLocationId],
    enabled: !!activeLocationId,
  });

  const { data: locationAppts } = useQuery<Appointment[]>({ queryKey: ["/api/appointments/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationServices } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationInvoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationComms } = useQuery<Communication[]>({ queryKey: ["/api/communications/by-location", activeLocationId], enabled: !!activeLocationId });
  // D5: the location's agreements, for the Invoices tab's balance panel
  // (payment designation) and the agreement cards. The ledger summary the
  // tab's rows used to read for Apply location balance left with Pass 11b:
  // the invoice modal reads its own.
  const { data: locationAgreements } = useQuery<Agreement[]>({ queryKey: ["/api/agreements/location", activeLocationId], enabled: !!activeLocationId });
  // D6: the location screen shows each active agreement's billing-plan pill,
  // named per agreement - a location is never "monthly" or "COD" as a whole.
  const { planById: locationBillingPlanById, isLoading: locationBillingPlansLoading } = useBillingPlanById();
  const activeLocationAgreements = useMemo(
    () => (locationAgreements ?? []).filter((agreement) => agreement.status !== "CANCELLED"),
    [locationAgreements],
  );

  const sortedContacts = useMemo(() => {
    if (!contacts) return [];
    return [...contacts].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [contacts]);

  const primaryContact = useMemo(() => {
    const explicitPrimary = sortedContacts.find((contact) => contact.isPrimary);
    if (explicitPrimary) {
      return {
        contact: explicitPrimary,
        isFallback: false,
      };
    }

    if (sortedContacts.length > 0) {
      return {
        contact: sortedContacts[0],
        isFallback: true,
      };
    }

    if (activeLocation?.isPrimary && customer && (customer.firstName || customer.lastName || customer.email || customer.phone)) {
      return {
        contact: {
          id: "customer-fallback",
          customerId: customer.id,
          locationId: activeLocation.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          phoneType: null,
          role: "Primary location identity",
          isPrimary: true,
        } as Contact,
        isFallback: true,
      };
    }

    return null;
  }, [activeLocation, customer, sortedContacts]);

  const primaryContactNameByLocationId = useMemo(() => {
    const allScopedContacts = accountContacts ?? [];
    const grouped = new Map<string, Contact[]>();

    for (const contact of allScopedContacts) {
      if (!contact.locationId) {
        continue;
      }

      const locationContacts = grouped.get(contact.locationId) ?? [];
      locationContacts.push(contact);
      grouped.set(contact.locationId, locationContacts);
    }

    const labels = new Map<string, string>();
    for (const [locationId, locationContacts] of Array.from(grouped.entries())) {
      const [displayContact] = [...locationContacts].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });

      const fullName = `${displayContact?.firstName ?? ""} ${displayContact?.lastName ?? ""}`.trim();
      if (fullName) {
        labels.set(locationId, fullName);
      }
    }

    return labels;
  }, [accountContacts]);

  const locationBalanceByLocationId = useMemo(() => {
    return new Map((locationBalances ?? []).map((balance) => [balance.locationId, balance]));
  }, [locationBalances]);

  const activeLocationLabel = useMemo(() => {
    if (!activeLocation) {
      return "Select Location";
    }

    const nickname = isUsefulLocationNickname(activeLocation.name) ? activeLocation.name.trim() : "";
    const contactName = primaryContactNameByLocationId.get(activeLocation.id) ?? "";

    if (nickname && contactName) {
      return `${nickname} · ${contactName}`;
    }

    return nickname || contactName || activeLocation.name || "Select Location";
  }, [activeLocation, primaryContactNameByLocationId]);

  const customerDisplayName = useMemo(() => {
    if (!customer) return "Customer";
    return customer.companyName || `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Customer";
  }, [customer]);

  // Pass 36 (C5.4): the inline "Make Primary" button and its POST /api/contacts/:id/set-primary
  // mutation left this screen - the contact dialog's checkbox is the one way to promote a contact
  // here (the route stays for API callers; it writes the same audit rows as the dialog's PATCH).

  function selectLocation(locId: string) {
    setLocation(`/customers/${customerId}?locationId=${locId}`);
  }

  // Pass 11b: opening an invoice adds invoiceId to the URL as it stands and
  // pushes, so Back closes the modal; closing removes it and replaces. Every
  // other parameter is kept exactly - the compat read keys on locationId, so
  // adding or dropping it would reload the whole page around the modal.
  function openInvoice(invoiceId: string) {
    const next = new URLSearchParams(searchString);
    next.set("invoiceId", invoiceId);
    setLocation(`/customers/${customerId}?${next.toString()}`);
  }
  function closeInvoice() {
    const next = new URLSearchParams(searchString);
    next.delete("invoiceId");
    const query = next.toString();
    setLocation(`/customers/${customerId}${query ? `?${query}` : ""}`, { replace: true });
  }

  function openCreateContactDialog() {
    setEditingContact(null);
    setContactDialogOpen(true);
  }

  function openEditContactDialog(contact: Contact) {
    setEditingContact(contact);
    setContactDialogOpen(true);
  }

  function handleContactDialogChange(open: boolean) {
    setContactDialogOpen(open);
    if (!open) {
      setEditingContact(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-semibold">Customer not found</h2>
        <Link href="/customers"><Button variant="outline" className="mt-4">Back to Customers</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto relative">
      <Link href="/customers">
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-back"
          className="absolute left-0 top-0 -translate-x-full mr-3"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>
      <div>
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-5">
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold tracking-tight" data-testid="text-customer-name">
                      {customer.firstName} {customer.lastName}
                    </h1>
                    <Badge variant="secondary" className={customer.status === "active" ? "bg-primary/10 text-primary" : ""} data-testid="badge-customer-status">
                      {customer.status}
                    </Badge>
                  </div>
                  {customer.companyName && <p className="text-sm text-muted-foreground mt-1">{customer.companyName}</p>}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {customer.email ? (
                      <CommunicationActionLink
                        href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "email", value: customer.email })}
                        icon={<Mail className="h-3.5 w-3.5" />}
                        text={customer.email}
                        testId="link-customer-email"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> <span data-testid="text-customer-email">No email</span></div>
                    )}
                    {customer.phone ? (
                      <CommunicationActionLink
                        href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "phone", value: customer.phone })}
                        icon={<Phone className="h-3.5 w-3.5" />}
                        text={formatPhoneDisplay(customer.phone)}
                        testId="link-customer-phone"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> <span data-testid="text-customer-phone">No phone</span></div>
                    )}
                    <Badge variant="outline" className="text-xs capitalize" data-testid="badge-customer-type">{customer.customerType}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {primaryLocation && (
                      <Badge variant="secondary" className="text-xs" data-testid="chip-primary-location">
                        <MapPin className="h-3 w-3 mr-1" /> Primary: {primaryLocation.name}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs" data-testid="chip-billing" title={locationBillingTerms ?? "No billing profile resolves for the selected location"}>
                      <CreditCard className="h-3 w-3 mr-1" /> Billing: {describeLocationBilling(locationBilling)}
                    </Badge>
                    <CustomerAgingChips aging={customerAging} locationCount={allLocations?.length ?? 0} />
                    <TechnicianPreferenceChips entries={activeLocationPreferences?.accountRows ?? []} testIdPrefix="chip-account-technician-preference" />
                  </div>
                </div>

                <div className="border-t pt-5">
                  <CustomerNotesPanel customerId={customerId} embedded />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="button-location-selector">
                <MapPin className="h-4 w-4" />
                <span className="truncate max-w-[240px]">{activeLocationLabel}</span>
                <Badge variant="secondary" className="text-xs ml-1">{allLocations?.length || 0}</Badge>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              {allLocations?.map((loc) => {
                const nickname = isUsefulLocationNickname(loc.name) ? loc.name.trim() : "";
                const contactName = primaryContactNameByLocationId.get(loc.id) ?? "";
                const locationBalance = locationBalanceByLocationId.get(loc.id);
                const primaryText = nickname && contactName
                  ? `${nickname} · ${contactName}`
                  : nickname || contactName || loc.name;
                const secondaryText = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
                const onAccountText = locationBalance && locationBalance.unappliedBalanceCents > 0
                  ? ` - ${formatCurrency(centsToDollars(locationBalance.unappliedBalanceCents))} on account`
                  : "";
                const balanceText = (locationBalance && locationBalance.openBalanceCents > 0
                  ? `Open ${formatCurrency(centsToDollars(locationBalance.openBalanceCents))}`
                  : locationBalance?.invoiceCount
                    ? "Paid up"
                    : "No balance") + onAccountText;

                return (
                <DropdownMenuItem key={loc.id} onClick={() => selectLocation(loc.id)} className={`flex flex-col items-start gap-1 py-2 ${loc.id === activeLocationId ? "bg-accent" : ""}`} data-testid={`location-option-${loc.id}`}>
                  <div className="flex items-center gap-2 w-full">
                    {loc.id === activeLocationId ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
                    <span className="font-medium text-sm truncate">{primaryText}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      {loc.isPrimary && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Primary</Badge>}
                      {billingOverrideLocationIds.has(loc.id) && <Badge variant="outline" className="text-[10px] px-1.5 py-0" data-testid={`badge-location-option-billing-override-${loc.id}`}>Billing Override</Badge>}
                    </div>
                  </div>
                  <div className="pl-5 w-full space-y-0.5">
                    <p className="text-xs text-muted-foreground leading-4">{secondaryText}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">{balanceText}</p>
                  </div>
                </DropdownMenuItem>
              )})}
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" data-testid="button-add-location"><Plus className="h-3 w-3 mr-1" /> Add Location</Button></DialogTrigger>
            <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader><AddLocationDialog customerId={customerId} customerType={customer?.customerType ?? "residential"} accountDefault={compat?.accountDefault ?? null} onClose={() => setLocDialogOpen(false)} /></DialogContent>
          </Dialog>
          {canStatement ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatementOpen(true)}
              title="An account statement across every location of this customer - one section per location and a rollup"
              data-testid="button-account-statement"
            >
              <FileText className="h-3 w-3 mr-1" /> Statement
            </Button>
          ) : null}
          <StatementDialog
            open={statementOpen}
            onOpenChange={setStatementOpen}
            customerId={customerId}
            customerLabel={customerDisplayName}
            scope={{ kind: "account", locationCount: allLocations?.length ?? 0 }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            title="Every recorded change across this customer's locations and the account, newest first"
            data-testid="button-account-history"
          >
            <History className="h-3 w-3 mr-1" /> History
          </Button>
          <CustomerHistorySheet
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            customerId={customerId}
            customerLabel={customerDisplayName}
            locations={(allLocations ?? []).map((location) => ({ id: location.id, name: location.name }))}
          />
        </div>

        {/* Active Location Profile */}
        {activeLocation && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-location-profile">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Location Profile</CardTitle>
                <div className="flex items-center gap-1">
                  {activeLocation.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                  {locationBilling?.source === "LOCATION_OVERRIDE" && <Badge variant="outline" className="text-xs text-chart-3" data-testid="badge-billing-override">Billing Override</Badge>}
                  <Dialog open={editLocDialogOpen} onOpenChange={setEditLocDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-edit-location">
                        Edit Location
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Edit Location</DialogTitle>
                      </DialogHeader>
                      <EditLocationDialog customer={customer} location={activeLocation} accountId={activeLocation.accountId ?? compat?.account?.id ?? ""} totalLocations={allLocations?.length ?? 0} onClose={() => setEditLocDialogOpen(false)} />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary Contact</p>
                  {primaryContact ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="font-medium text-foreground" data-testid="text-location-primary-contact-name">
                          {primaryContact.contact.firstName} {primaryContact.contact.lastName}
                        </p>
                        {primaryContact.contact.role && (
                          <p className="text-xs text-muted-foreground">{primaryContact.contact.role}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {primaryContact.contact.phone ? (
                          <CommunicationActionLink
                            href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "phone", value: primaryContact.contact.phone })}
                            icon={<Phone className="h-3.5 w-3.5" />}
                            text={`${formatPhoneDisplay(primaryContact.contact.phone)}${primaryContact.contact.phoneType ? ` (${formatOptionLabel(primaryContact.contact.phoneType)})` : ""}`}
                            testId="link-location-primary-contact-phone"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No phone on file</p>
                        )}
                        {primaryContact.contact.email ? (
                          <CommunicationActionLink
                            href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "email", value: primaryContact.contact.email })}
                            icon={<Mail className="h-3.5 w-3.5" />}
                            text={primaryContact.contact.email}
                            testId="link-location-primary-contact-email"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No email on file</p>
                        )}
                      </div>
                      {primaryContact.isFallback && (
                        <p className="text-xs text-muted-foreground">
                          {sortedContacts.length > 0
                            ? "Using the first available contact until a primary contact is selected."
                            : "Using the primary location identity until a location-scoped primary contact is added."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No contact on file for this location yet.</p>
                  )}
                </div>
                <div className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" /><span>{activeLocation.address}, {activeLocation.city}, {activeLocation.state} {activeLocation.zip}</span></div>
                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <span className="capitalize flex items-center gap-1"><Building2 className="h-3 w-3" /> {activeLocation.propertyType}</span>
                  {/* Pass 34 (C5.2): the location's resolved billing profile - what its invoices will carry. */}
                  <span className="flex items-center gap-1" data-testid="text-location-billing"><CreditCard className="h-3 w-3" /> {describeLocationBilling(locationBilling)}{locationBillingTerms ? ` · ${locationBillingTerms}` : ""}</span>
                  {activeLocation.source && <span>Source: {activeLocation.source}</span>}
                  {activeLocation.squareFootage && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" /> {activeLocation.squareFootage.toLocaleString()} sq ft</span>}
                  {activeLocation.gateCode && <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> Gate: {activeLocation.gateCode}</span>}
                </div>
                {activeLocationPreferences?.effective.length ? (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="row-location-technician-preferences">
                    <TechnicianPreferenceChips entries={activeLocationPreferences.effective} testIdPrefix="chip-location-technician-preference" />
                  </div>
                ) : null}
                {activeLocationAgreements.length > 0 && !locationBillingPlansLoading && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" data-testid="row-location-agreement-plans">
                    <span className="text-muted-foreground">Agreements:</span>
                    {activeLocationAgreements.map((agreement) => (
                      <span key={agreement.id} className="inline-flex items-center gap-1.5">
                        <span className="font-medium">{agreement.agreementName}</span>
                        <BillingPlanPill agreement={agreement} plan={agreement.billingPlanId ? locationBillingPlanById.get(agreement.billingPlanId) : null} />
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* The location's balance by days since invoiced rides inside the notes box as one row
                (owner, 2026-09-25): Current always, the other buckets only when owed, no invoice
                links - the full strip with them is on the Invoices tab. */}
            <LocationNotesPanel
              customerId={customerId}
              locationId={activeLocationId}
              footer={
                <LocationAgingSummaryRow
                  aging={customerAging?.locations.find((entry) => entry.locationId === activeLocationId) ?? null}
                  asOf={customerAging?.asOf}
                  isLoading={customerAgingLoading}
                />
              }
            />
          </div>
        )}

        {/* D) Location-scoped tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="contacts" data-testid="tab-contacts"><User className="h-3 w-3 mr-1" /> Contacts ({locationCounts?.contacts ?? contacts?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="agreements" data-testid="tab-agreements"><Calendar className="h-3 w-3 mr-1" /> Agreements ({locationCounts?.agreements ?? 0})</TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services"><ClipboardList className="h-3 w-3 mr-1" /> Services ({locationCounts?.services ?? 0})</TabsTrigger>
            <TabsTrigger value="opportunities" data-testid="tab-opportunities"><Target className="h-3 w-3 mr-1" /> Opportunities ({locationCounts?.opportunities ?? 0})</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices"><FileText className="h-3 w-3 mr-1" /> Invoices ({locationCounts?.invoices ?? 0})</TabsTrigger>
            <TabsTrigger value="comms" data-testid="tab-comms"><MessageSquare className="h-3 w-3 mr-1" /> Comms ({locationCounts?.communications ?? 0})</TabsTrigger>
            {/* No count: audit rows aren't part of the location-counts rollup, and a
                "(0)" that never moves would read as broken rather than empty. */}
            <TabsTrigger value="history" data-testid="tab-history"><History className="h-3 w-3 mr-1" /> History</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Dialog open={contactDialogOpen} onOpenChange={handleContactDialogChange}>
                <DialogTrigger asChild><Button size="sm" data-testid="button-add-contact" onClick={openCreateContactDialog}><Plus className="h-3 w-3 mr-1" /> Add Contact</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
                  </DialogHeader>
                  <ContactDialogForm
                    customerId={customerId}
                    locationId={activeLocationId}
                    contact={editingContact}
                    onClose={() => handleContactDialogChange(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
            {sortedContacts.length === 0 ? (
              <Card><CardContent className="text-center py-8"><User className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No contacts added yet</p></CardContent></Card>
            ) : sortedContacts.map((ct) => (
              <Card key={ct.id} data-testid={`card-contact-${ct.id}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                    onClick={() => openEditContactDialog(ct)}
                    data-testid={`button-edit-contact-icon-${ct.id}`}
                    aria-label={`Edit ${ct.firstName} ${ct.lastName}`}
                  >
                    <User className="h-4 w-4 text-primary" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        className="font-semibold text-sm text-left transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm cursor-pointer"
                        onClick={() => openEditContactDialog(ct)}
                        data-testid={`button-edit-contact-name-${ct.id}`}
                      >
                        {ct.firstName} {ct.lastName}
                      </button>
                      {ct.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                      {ct.role && <span className="text-xs text-muted-foreground">{ct.role}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {ct.email && (
                        <CommunicationActionLink
                          href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "email", value: ct.email })}
                          icon={<Mail className="h-3 w-3" />}
                          text={ct.email}
                          testId={`link-contact-email-${ct.id}`}
                        />
                      )}
                      {ct.phone && (
                        <CommunicationActionLink
                          href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "phone", value: ct.phone })}
                          icon={<Phone className="h-3 w-3" />}
                          text={`${formatPhoneDisplay(ct.phone)}${ct.phoneType ? ` (${formatOptionLabel(ct.phoneType)})` : ""}`}
                          testId={`link-contact-phone-${ct.id}`}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="agreements" className="mt-4 space-y-3">
            <AgreementsTab customerId={customerId} locationId={activeLocationId} appointments={locationAppts} />
          </TabsContent>

          <TabsContent value="services" className="mt-4 space-y-3">
            <ServicesTab
              customerId={customerId}
              locationId={activeLocationId}
              locationName={activeLocation?.name ?? null}
              appointments={locationAppts}
              serviceRecords={locationServices}
              invoices={locationInvoices}
              onOpenInvoice={openInvoice}
            />
          </TabsContent>

          <TabsContent value="opportunities" className="mt-4 space-y-3">
            <OpportunitiesTab locationId={activeLocationId} customerId={customerId} customerLabel={customerDisplayName} locationLabel={activeLocationLabel} />
          </TabsContent>

          <TabsContent value="invoices" className="mt-4 space-y-3">
            <LocationLedgerPanel customerId={customerId} locationId={activeLocationId} locationLabel={activeLocationLabel} invoices={locationInvoices ?? []} agreements={locationAgreements} onOpenInvoice={openInvoice} />
            {/* Pass 14's strip with the invoices behind each bucket, here since the owner's note of 2026-09-25. */}
            <LocationAgingStrip
              title="Balance by days since invoiced"
              aging={customerAging?.locations.find((entry) => entry.locationId === activeLocationId) ?? null}
              asOf={customerAging?.asOf}
              isLoading={customerAgingLoading}
              onOpenInvoice={openInvoice}
            />
            {!locationInvoices || locationInvoices.length === 0 ? (
              <Card><CardContent className="text-center py-8"><FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No invoices for this location</p></CardContent></Card>
            ) : [...locationInvoices].sort((a, b) => new Date(b.issuedAt ?? b.createdAt).getTime() - new Date(a.issuedAt ?? a.createdAt).getTime()).map((inv) => (
              <InvoiceRowLedger key={inv.id} invoice={inv} onOpen={() => openInvoice(inv.id)} />
            ))}
          </TabsContent>

          <TabsContent value="comms" className="mt-4 space-y-3">
            {!locationComms || locationComms.length === 0 ? (
              <Card><CardContent className="text-center py-8"><MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No communications for this location</p></CardContent></Card>
            ) : locationComms.map((comm) => (
              <Card key={comm.id} data-testid={`card-comm-${comm.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap"><Badge variant="outline" className="text-xs capitalize">{comm.type}</Badge><Badge variant="secondary" className="text-xs capitalize">{comm.direction}</Badge><span className="text-xs text-muted-foreground">{new Date(comm.sentAt).toLocaleString()}</span></div>
                  {comm.subject && <p className="text-sm font-medium mt-2">{comm.subject}</p>}
                  {comm.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{comm.body}</p>}
                  {comm.nextActionDate ? <p className="text-xs text-muted-foreground mt-1">Next Action: {formatDateOnly(comm.nextActionDate)}</p> : null}
                  {comm.actorLabel ? <p className="text-xs text-muted-foreground mt-1">By: {comm.actorLabel}</p> : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            <LocationHistoryTab locationId={activeLocationId} />
          </TabsContent>
        </Tabs>

        <InvoiceDetailDialog
          invoiceId={openInvoiceId}
          open={!!openInvoiceId}
          onOpenChange={(next) => {
            if (!next) closeInvoice();
          }}
        />
      </div>
    </div>
  );
}
