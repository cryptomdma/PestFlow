import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  InvoiceOnFinalizePrompt,
  describeFinalizeResult,
  getInvoiceOnFinalizePrompt,
  invalidateInvoiceViews,
  type FinalizeServiceRecordResponse,
  type InvoiceOnFinalizePromptState,
} from "@/components/invoice-on-finalize-prompt";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { VisitBillingTable, useVisitBillingSummary } from "@/components/visit-billing-summary";
import { InvoiceDetailDialog } from "@/components/invoice-detail-dialog";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { ApplyLocationBalancePrompt } from "@/components/apply-location-balance-prompt";
import { resolveReviewNav, type ReviewNavStep } from "@/lib/review-queue-nav";
import { formatCents } from "@shared/money";
import { can, PERMISSIONS } from "@shared/permissions";
import { CASH_CONFIRM_NOTE, formatPaymentMethod, formatPaymentStatus, mayConfirmPayment, needsCashAuthority, paymentHoldsValue, type LocationLedgerSummary } from "@shared/payments";
import type { AppointmentInvoiceStatus } from "@shared/invoice-detail";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileStack, FileText, MapPin, RotateCcw, Send } from "lucide-react";
import type { Appointment, Customer, Invoice, Location, Payment, ProductApplication, Service, ServiceRecord, ServiceType, Technician } from "@shared/schema";

interface BatchInvoicePreviewRow extends ServiceRecord {
  billingLineType: "SERVICE" | "AGREEMENT_COVERED" | null;
  billableAmountCents: number | null;
  billingNote: string | null;
}

interface BatchGenerateResult {
  totalEligible: number;
  totalVisits: number;
  invoiced: Array<{ appointmentId: string | null; serviceRecordIds: string[]; invoiceId: string; invoiceNumber: string; totalAmountCents: number }>;
  skipped: Array<{ appointmentId: string | null; serviceRecordIds: string[]; reason: string }>;
  totalAmountCents: number;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCustomerLabel(customer?: Customer, location?: Location) {
  const fullName = `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim();
  return fullName || customer?.companyName || location?.name || "Location";
}

function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "Not tracked";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function statusLabel(record: ServiceRecord) {
  if (record.confirmed || record.ticketStatus === "FINALIZED") return "Finalized";
  if (record.ticketStatus === "REOPENED") return "Reopened";
  if (record.ticketStatus === "FLAGGED_FOR_REVIEW") return "Flagged for Review";
  return "Pending Review";
}

function statusBadgeVariant(record: ServiceRecord): "default" | "secondary" | "destructive" {
  if (record.confirmed || record.ticketStatus === "FINALIZED") return "default";
  if (record.ticketStatus === "FLAGGED_FOR_REVIEW") return "destructive";
  return "secondary";
}

function paymentStatusClass(status: string) {
  switch (status) {
    case "CONFIRMED": return "bg-primary/10 text-primary";
    case "PENDING": return "bg-chart-3/10 text-chart-3";
    default: return "bg-muted text-muted-foreground";
  }
}

// What the technician collected at THIS visit (payments.appointmentId - the
// D5 owner review's visit link), with Confirm gated exactly as the location
// ledger panel gates it: CONFIRM_PAYMENT, and cash additionally
// CONFIRM_CASH_PAYMENT. Reads payments by appointment rather than the billing
// summary: once the visit is invoiced the summary reads applications only,
// and an unapplied field collection would vanish from it. The last line is
// the location's OTHER unapplied money, so the reviewer knows the D4 prompt
// may offer more than this visit's collections.
function VisitCollectionsBlock({ appointmentId, locationId }: { appointmentId: string | null; locationId: string | null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const authority = { canConfirm: can(role, PERMISSIONS.CONFIRM_PAYMENT), canConfirmCash: can(role, PERMISSIONS.CONFIRM_CASH_PAYMENT) };

  const { data: visitPayments, isLoading, isError } = useQuery<Payment[]>({
    queryKey: ["/api/payments/by-appointment", appointmentId ?? ""],
    enabled: !!appointmentId,
  });
  const { data: ledger } = useQuery<LocationLedgerSummary>({
    queryKey: ["/api/locations", locationId ?? "", "ledger-summary"],
    enabled: !!locationId,
  });

  const unappliedById = useMemo(() => new Map((ledger?.sources ?? []).map((source) => [source.id, source.unappliedCents])), [ledger]);
  const otherSources = useMemo(() => (ledger?.sources ?? []).filter((source) => !appointmentId || source.appointmentId !== appointmentId), [ledger, appointmentId]);
  const otherCents = otherSources.reduce((sum, source) => sum + source.unappliedCents, 0);
  const otherPendingCents = otherSources.filter((source) => source.status === "PENDING").reduce((sum, source) => sum + source.unappliedCents, 0);

  const confirmMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest("POST", `/api/payments/${paymentId}/confirm`, {});
      return (await response.json()) as Payment;
    },
    onSuccess: (payment) => {
      invalidateInvoiceViews();
      toast({ title: `${formatPaymentMethod(payment.method)} payment of ${formatCents(payment.amountCents)} confirmed`, description: "It now counts toward every invoice it is applied to." });
    },
    onError: (error: Error) => toast({ title: "Unable to confirm the payment", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const live = (visitPayments ?? []).filter((payment) => paymentHoldsValue(payment.status));
  const collectedCents = live.reduce((sum, payment) => sum + payment.amountCents, 0);
  const pendingCents = live.filter((payment) => payment.status === "PENDING").reduce((sum, payment) => sum + payment.amountCents, 0);

  const describeApplication = (payment: Payment) => {
    if (!ledger || !paymentHoldsValue(payment.status)) return "";
    const unapplied = unappliedById.get(payment.id) ?? 0;
    if (unapplied >= payment.amountCents) return " - on the location balance, not yet applied";
    if (unapplied <= 0) return " - applied to the invoice";
    return ` - ${formatCents(payment.amountCents - unapplied)} applied, ${formatCents(unapplied)} on the location balance`;
  };

  // Full width, one line per payment. A failed read is reported as a failed
  // read: "nothing collected" is a statement about the ledger, and the office
  // must not finalize on it when the list simply did not load.
  return (
    <div className="rounded-md border p-3" data-testid="block-visit-collections">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Collected in the field</p>
        {appointmentId && visitPayments?.length ? (
          <p className="text-sm" data-testid="text-visit-collected-total">
            Collected <span className="font-semibold">{formatCents(collectedCents)}</span>{pendingCents > 0 ? ` - ${formatCents(pendingCents)} pending confirmation` : ""}
          </p>
        ) : null}
      </div>
      {!appointmentId ? (
        <p className="mt-1 text-sm text-muted-foreground">Not on an appointment - no collection can be tied to this ticket.</p>
      ) : isLoading ? (
        <p className="mt-1 text-xs text-muted-foreground">Loading collections...</p>
      ) : isError ? (
        <p className="mt-1 text-sm text-destructive" data-testid="text-visit-collections-error">Collections could not be loaded for this visit. Do not finalize on this alone - check the location's Invoices tab.</p>
      ) : !visitPayments?.length ? (
        <p className="mt-1 text-sm text-muted-foreground">Nothing collected in the field for this visit.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {visitPayments.map((payment) => {
            const mayConfirm = mayConfirmPayment(payment, authority);
            return (
              <div key={payment.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-3 py-2" data-testid={`row-visit-payment-${payment.id}`}>
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                    <span className="font-medium">{formatPaymentMethod(payment.method)}{payment.checkNumber ? ` #${payment.checkNumber}` : ""}{payment.referenceNumber ? ` (${payment.referenceNumber})` : ""}</span>
                    <span className="font-semibold">{formatCents(payment.amountCents)}</span>
                    <Badge variant="secondary" className={`text-xs ${paymentStatusClass(payment.status)}`}>{formatPaymentStatus(payment.status)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(payment.receivedAt).toLocaleString()}{payment.collectedByLabel ? ` by ${payment.collectedByLabel}` : ""}
                      {describeApplication(payment)}
                      {payment.status === "VOIDED" && payment.voidReason ? ` - voided: ${payment.voidReason}` : ""}
                      {payment.memo ? ` - ${payment.memo}` : ""}
                    </span>
                  </div>
                  {needsCashAuthority(payment, authority) ? (
                    <p className="text-xs text-muted-foreground">{CASH_CONFIRM_NOTE}</p>
                  ) : null}
                </div>
                {mayConfirm ? (
                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => confirmMutation.mutate(payment.id)} disabled={confirmMutation.isPending} data-testid={`button-confirm-visit-payment-${payment.id}`}>Confirm</Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {locationId && ledger ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="text-location-other-balance">
          {otherCents > 0
            ? `This location also has ${formatCents(otherCents)} on account not linked to this visit${otherPendingCents > 0 ? ` (${formatCents(otherPendingCents)} of it pending confirmation)` : ""}.`
            : "No other balance on account at this location."}
        </p>
      ) : null}
    </div>
  );
}

// Pass 11b (PLAN_ROADMAP_V2.md C2.1b): where the visit under review stands
// with invoicing, from GET /api/invoices/by-appointment/:id - composed on the
// server from the helpers Generate itself reads, so the badge and the button
// never disagree. An invoice (a DRAFT included) is a badge that opens the
// invoice modal. A finalized visit with none is the finalize prompt's "Later"
// case, so Generate is offered here through the same generate route the
// prompt uses (it adopts a DRAFT rather than issuing a second invoice),
// followed by D4's "apply the location balance?" exactly as the prompt asks
// it. Anything else says why there is no invoice yet.
function VisitInvoiceBlock({ appointmentId, serviceRecordId, onOpenInvoice }: { appointmentId: string | null; serviceRecordId: string; onOpenInvoice: (invoiceId: string) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canGenerate = can(user?.role ?? "", PERMISSIONS.GENERATE_INVOICE);
  const { data: status, isLoading, isError } = useQuery<AppointmentInvoiceStatus>({
    queryKey: ["/api/invoices/by-appointment", appointmentId ?? ""],
    enabled: !!appointmentId,
  });
  const [balanceInvoice, setBalanceInvoice] = useState<Invoice | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invoices/generate-from-service-record/${serviceRecordId}`, {});
      return (await response.json()) as Invoice;
    },
    onSuccess: (invoice) => {
      invalidateInvoiceViews();
      toast({ title: `Invoice ${invoice.invoiceNumber} issued`, description: `${formatCents(invoice.totalAmountCents)} for the whole visit.` });
      if (invoice.locationId && invoice.balanceDueCents > 0) {
        setBalanceInvoice(invoice);
      }
    },
    onError: (error: Error) => toast({ title: "Unable to generate the invoice", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (!appointmentId) return null;
  const invoice = status?.invoice ?? null;
  const offerGenerate = !!status && status.finalized && canGenerate && (!invoice || invoice.status === "DRAFT");

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end" data-testid="block-visit-invoice">
      {isLoading ? (
        <span className="text-xs text-muted-foreground">Checking the visit's invoice...</span>
      ) : isError || !status ? (
        <span className="text-xs text-destructive" data-testid="text-visit-invoice-error">The visit's invoice status could not be loaded.</span>
      ) : invoice ? (
        <button
          type="button"
          onClick={() => onOpenInvoice(invoice.id)}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted/40"
          title="Open the invoice"
          data-testid="button-visit-invoice"
        >
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{invoice.invoiceNumber}</span>
          <InvoiceStatusBadge invoice={invoice} />
        </button>
      ) : status.finalized ? (
        <span className="text-xs text-muted-foreground" data-testid="text-visit-uninvoiced">Not invoiced - the visit is ready to bill.</span>
      ) : (
        <span
          className="text-xs text-muted-foreground"
          title={status.unfinalizedTickets.map((ticket) => ticket.description).join("; ")}
          data-testid="text-visit-not-ready"
        >
          Not invoiced - the visit is invoiced once every ticket on it is finalized.
        </span>
      )}
      {offerGenerate ? (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-visit-generate-invoice">
          {generateMutation.isPending ? "Generating..." : invoice ? "Issue draft" : "Generate invoice"}
        </Button>
      ) : null}
      <ApplyLocationBalancePrompt invoice={balanceInvoice} onClose={() => setBalanceInvoice(null)} />
    </div>
  );
}

export default function ServiceTicketReview() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  // Pass 11b: /service-ticket-review?recordId=<id> opens that ticket - where
  // the invoice modal's per-line "Open ticket" lands.
  const requestedRecordId = useMemo(() => new URLSearchParams(searchString).get("recordId"), [searchString]);
  const handledRecordIdRef = useRef<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("PENDING_REVIEW");
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  // The review run: the queue as it stood when a ticket was opened from it.
  // Held so Next / Back survive a ticket leaving the live filter.
  const [navRecordIds, setNavRecordIds] = useState<string[]>([]);
  const [reopenReason, setReopenReason] = useState("");
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchGenerateResult | null>(null);
  // D2: the Generate / Generate & Send / Later prompt, opened when a
  // finalization completes its visit under the PROMPT setting.
  const [invoicePrompt, setInvoicePrompt] = useState<InvoiceOnFinalizePromptState | null>(null);
  const canBatchInvoice = can(user?.role ?? "", PERMISSIONS.GENERATE_INVOICE);
  const canSendInvoice = can(user?.role ?? "", PERMISSIONS.SEND_INVOICE);

  const { data: serviceRecords } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: services } = useQuery<Service[]>({ queryKey: ["/api/services"] });
  const { data: appointments } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });
  const { data: productApplications } = useQuery<ProductApplication[]>({ queryKey: ["/api/product-applications"] });

  const serviceById = useMemo(() => new Map((services ?? []).map((service) => [service.id, service])), [services]);
  const appointmentById = useMemo(() => new Map((appointments ?? []).map((appointment) => [appointment.id, appointment])), [appointments]);
  const serviceTypeById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType])), [serviceTypes]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const applicationsByRecordId = useMemo(() => {
    const map = new Map<string, ProductApplication[]>();
    for (const application of productApplications ?? []) {
      const existing = map.get(application.serviceRecordId) ?? [];
      existing.push(application);
      map.set(application.serviceRecordId, existing);
    }
    return map;
  }, [productApplications]);

  const selectedRecord = useMemo(() => serviceRecords?.find((record) => record.id === selectedRecordId) ?? null, [selectedRecordId, serviceRecords]);
  const selectedService = selectedRecord?.serviceId ? serviceById.get(selectedRecord.serviceId) ?? null : null;
  const selectedAppointment = selectedRecord?.appointmentId ? appointmentById.get(selectedRecord.appointmentId) ?? null : null;
  const selectedLocation = selectedRecord?.locationId ? locationById.get(selectedRecord.locationId) ?? null : null;
  const selectedCustomer = selectedRecord ? customerById.get(selectedRecord.customerId) ?? null : null;
  const selectedMaterials = selectedRecord ? applicationsByRecordId.get(selectedRecord.id) ?? [] : [];
  // D6's figures for the visit under review - the same read the ticket, the
  // appointment details and the collect dialog show, so the reviewer
  // finalizes against what the technician and the customer saw.
  const { data: visitBilling, isLoading: visitBillingLoading, isError: visitBillingError } = useVisitBillingSummary(selectedAppointment?.id ?? null);

  const filteredRecords = useMemo(() => {
    return (serviceRecords ?? []).filter((record) => {
      const service = record.serviceId ? serviceById.get(record.serviceId) : undefined;
      if (statusFilter === "PENDING_REVIEW" && (record.confirmed || record.ticketStatus === "FINALIZED")) return false;
      if (statusFilter === "FINALIZED" && !(record.confirmed || record.ticketStatus === "FINALIZED")) return false;
      if (statusFilter === "REOPENED" && record.ticketStatus !== "REOPENED") return false;
      if (statusFilter === "FLAGGED_FOR_REVIEW" && record.ticketStatus !== "FLAGGED_FOR_REVIEW") return false;
      if (technicianFilter !== "ALL" && record.technicianId !== technicianFilter) return false;
      if (serviceTypeFilter !== "ALL" && (record.serviceTypeId || service?.serviceTypeId) !== serviceTypeFilter) return false;
      const postedDate = (record.postedAt || record.serviceDate) ? new Date(record.postedAt || record.serviceDate).toISOString().slice(0, 10) : "";
      if (dateFrom && postedDate < dateFrom) return false;
      if (dateTo && postedDate > dateTo) return false;
      return true;
    }).sort((a, b) => new Date(b.postedAt || b.serviceDate).getTime() - new Date(a.postedAt || a.serviceDate).getTime());
  }, [dateFrom, dateTo, serviceById, serviceRecords, serviceTypeFilter, statusFilter, technicianFilter]);

  // Next / Back walk a SNAPSHOT of the queue, taken when a ticket is opened
  // from it - not the live filtered list. Finalizing a ticket under the
  // "Pending Review" filter drops it out of that list, and navigating over
  // the live one would leave the open ticket at index -1 and hide the
  // controls at exactly the moment the reviewer wants Next. The snapshot
  // keeps the run intact until the modal is closed.
  const openRecordFromQueue = (recordId: string) => {
    setNavRecordIds(filteredRecords.map((record) => record.id));
    setReopenReason("");
    setSelectedRecordId(recordId);
  };
  const closeReviewModal = () => {
    setSelectedRecordId(null);
    setNavRecordIds([]);
    setReopenReason("");
    // A deep-linked ticket leaves the URL with it, so a reload does not
    // reopen a ticket the reviewer just closed.
    if (requestedRecordId) {
      handledRecordIdRef.current = null;
      setLocation("/service-ticket-review", { replace: true });
    }
  };

  // The deep link, handled once per id: the records list refetches on every
  // finalize, and re-running would re-snapshot the run out from under Next /
  // Back. The queue's filters are left alone - a finalized ticket opened
  // from an invoice is not in the default Pending Review list, so the run
  // does not contain it and Next / Back stay hidden, as for any ticket not
  // opened from the queue. An id that does not resolve says so and clears.
  useEffect(() => {
    if (!requestedRecordId) {
      handledRecordIdRef.current = null;
      return;
    }
    if (!serviceRecords || handledRecordIdRef.current === requestedRecordId) return;
    handledRecordIdRef.current = requestedRecordId;
    setOpenInvoiceId(null);
    if (serviceRecords.some((record) => record.id === requestedRecordId)) {
      openRecordFromQueue(requestedRecordId);
    } else {
      toast({ title: "Service ticket not found", description: "The link points at a ticket that does not exist here.", variant: "destructive" });
      setLocation("/service-ticket-review", { replace: true });
    }
  }, [requestedRecordId, serviceRecords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stepping rules live in lib/review-queue-nav.ts (pure, so they can be
  // exercised without rendering this modal). "Live" is every record that
  // still exists, NOT the filtered queue - that is what keeps a finalized
  // ticket in its place in the run.
  const liveRecordIds = useMemo(() => new Set((serviceRecords ?? []).map((record) => record.id)), [serviceRecords]);
  const { index: selectedIndex, total: navTotal, previous: previousStep, next: nextStep } = resolveReviewNav(navRecordIds, selectedRecordId, liveRecordIds);
  const goToRecord = (step: ReviewNavStep | null) => {
    if (!step) return;
    setReopenReason("");
    setSelectedRecordId(step.id);
  };

  const invalidateReviewData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
    // The visit's finalized / invoiced state moves with every finalize and
    // reopen, whether or not the finalize completed the visit.
    queryClient.invalidateQueries({ queryKey: ["/api/invoices/by-appointment"] });
  };

  const finalizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/service-records/${id}/finalize`, {});
      return response.json() as Promise<FinalizeServiceRecordResponse>;
    },
    onSuccess: (result) => {
      invalidateReviewData();
      // The finalization that completes a visit reports what it did about the
      // invoice (D2): under PROMPT we ask; under AUTO_DRAFT / OFF / an
      // already-issued invoice we tell.
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

  const reopenMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/service-records/${id}/reopen`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Service ticket reopened", description: "Technician edits are available again." });
      setReopenReason("");
      invalidateReviewData();
    },
    onError: (error: Error) => toast({ title: "Unable to reopen ticket", description: error.message, variant: "destructive" }),
  });

  const { data: batchPreview, isLoading: batchPreviewLoading } = useQuery<BatchInvoicePreviewRow[]>({
    queryKey: [`/api/invoices/batch-preview?dateFrom=${dateFrom}&dateTo=${dateTo}`],
    enabled: batchDialogOpen && !!dateFrom && !!dateTo,
  });

  const batchGenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices/batch-generate", { dateFrom, dateTo });
      return response.json() as Promise<BatchGenerateResult>;
    },
    onSuccess: (result) => {
      setBatchResult(result);
      toast({ title: "Batch invoicing complete", description: `${result.invoiced.length} invoice(s) generated, ${result.skipped.length} skipped.` });
      invalidateReviewData();
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: Error) => toast({ title: "Batch invoicing failed", description: error.message, variant: "destructive" }),
  });

  const batchSendMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const response = await apiRequest("POST", "/api/invoices/batch-send", { invoiceIds });
      return response.json();
    },
    onSuccess: (sent: unknown[]) => {
      toast({ title: "Invoices sent", description: `${sent.length} invoice(s) marked as sent.` });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: Error) => toast({ title: "Unable to send invoices", description: error.message, variant: "destructive" }),
  });

  const closeBatchDialog = (open: boolean) => {
    setBatchDialogOpen(open);
    if (!open) setBatchResult(null);
  };

  // Whether a ticket is covered and what it bills are resolved by the SERVER
  // (getBatchInvoicePreviewForDateRange), through the same code generation uses.
  // Deliberately not re-derived here from agreementId: coverage depends on the
  // agreement's billing plan, and a client-side guess is how the preview ends up
  // promising "$0, covered" for COD agreement work that then bills a real amount.
  const batchPreviewTotalCents = useMemo(() => {
    return (batchPreview ?? []).reduce((sum, record) => sum + (record.billableAmountCents ?? 0), 0);
  }, [batchPreview]);

  // One invoice per visit, not per ticket (D1): two finalized tickets on one
  // appointment produce a single invoice, so the count the office is promised
  // has to be the number of anchors.
  const batchPreviewVisitCount = useMemo(() => {
    const anchors = new Set(
      (batchPreview ?? []).map((record) => (record.appointmentId ? `appointment:${record.appointmentId}` : `serviceRecord:${record.id}`)),
    );
    return anchors.size;
  }, [batchPreview]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Office review and finalization</p>
          <h1 className="text-2xl font-semibold tracking-tight">Service Ticket Review</h1>
        </div>
        {canBatchInvoice && (
          <Button
            type="button"
            variant="outline"
            disabled={!dateFrom || !dateTo}
            onClick={() => { setBatchResult(null); setBatchDialogOpen(true); }}
            title={!dateFrom || !dateTo ? "Set a From and To date first" : undefined}
          >
            <FileStack className="mr-1 h-4 w-4" /> Batch Invoice
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                <SelectItem value="FLAGGED_FOR_REVIEW">Flagged for Review</SelectItem>
                <SelectItem value="FINALIZED">Finalized</SelectItem>
                <SelectItem value="REOPENED">Reopened</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Technician</Label>
            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All technicians</SelectItem>
                {(technicians ?? []).map((technician) => <SelectItem key={technician.id} value={technician.id}>{technician.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Service Type</Label>
            <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All service types</SelectItem>
                {(serviceTypes ?? []).map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <div className="flex gap-2">
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <Button type="button" variant="outline" onClick={() => { const today = formatDateInputValue(new Date()); setDateFrom(today); setDateTo(today); }}>Today</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Review Queue ({filteredRecords.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!filteredRecords.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No service tickets match the current filters.</div>
          ) : filteredRecords.map((record) => {
            const service = record.serviceId ? serviceById.get(record.serviceId) : undefined;
            const appointment = record.appointmentId ? appointmentById.get(record.appointmentId) : undefined;
            const location = record.locationId ? locationById.get(record.locationId) : undefined;
            const customer = customerById.get(record.customerId);
            const serviceType = serviceTypeById.get(record.serviceTypeId || service?.serviceTypeId || "");
            const technician = record.technicianId ? technicianById.get(record.technicianId) : undefined;
            return (
              <button key={record.id} type="button" onClick={() => openRecordFromQueue(record.id)} className="grid w-full gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/20 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
                <div>
                  <p className="font-medium">{getCustomerLabel(customer, location)}</p>
                  <p className="text-xs text-muted-foreground">{location ? [location.address, location.city, location.state].filter(Boolean).join(", ") : "Location unavailable"}</p>
                </div>
                <div>
                  <p className="text-sm">{serviceType?.name || "Service"}</p>
                  <p className="text-xs text-muted-foreground">{service?.agreementId ? "Agreement" : "Non-agreement"}</p>
                </div>
                <div>
                  <p className="text-sm">{record.technicianName || technician?.displayName || "Technician unavailable"}</p>
                  <p className="text-xs text-muted-foreground">License {record.technicianLicenseNumber || technician?.licenseId || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm">{record.postedAt ? new Date(record.postedAt).toLocaleString() : new Date(record.serviceDate).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Duration {formatDuration(appointment?.durationMinutes)}</p>
                </div>
                <Badge variant={statusBadgeVariant(record)}>{statusLabel(record)}</Badge>
                {record.followUpRequired ? <Badge className="bg-red-600 text-white hover:bg-red-600">Follow-up</Badge> : null}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRecord} onOpenChange={(open) => { if (!open) closeReviewModal(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle>Service Ticket Review</DialogTitle>
              {/* Always rendered while a ticket from the queue is open, so the
                  run reads the same before and after Finalize; the ends
                  disable rather than disappear. */}
              {selectedIndex >= 0 ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="nav-review-tickets">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => goToRecord(previousStep)} disabled={!previousStep} data-testid="button-review-back">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  <span className="tabular-nums" data-testid="text-review-position">{selectedIndex + 1} of {navTotal}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => goToRecord(nextStep)} disabled={!nextStep} data-testid="button-review-next">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogHeader>
          {selectedRecord ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                {/* One row: who and what | where | ticket status. The address
                    sits beside the identity rather than under it, so the card
                    is three columns of content instead of one column and a badge. */}
                <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto] sm:items-start">
                  <div>
                    <p className="font-medium">{getCustomerLabel(selectedCustomer ?? undefined, selectedLocation ?? undefined)}</p>
                    <p className="text-sm text-muted-foreground">{serviceTypeById.get(selectedRecord.serviceTypeId || selectedService?.serviceTypeId || "")?.name || "Service"}</p>
                    <p className="text-xs text-muted-foreground">{selectedService?.agreementId ? "Agreement service" : "Non-agreement service"}</p>
                  </div>
                  <div className="flex items-start gap-2 text-sm" data-testid="block-review-address">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    {selectedLocation ? (
                      <div>
                        {selectedLocation.name && selectedLocation.name !== getCustomerLabel(selectedCustomer ?? undefined, selectedLocation) ? (
                          <p className="font-medium">{selectedLocation.name}</p>
                        ) : null}
                        <p>{selectedLocation.address}</p>
                        <p className="text-muted-foreground">{[selectedLocation.city, selectedLocation.state].filter(Boolean).join(", ")} {selectedLocation.zip}</p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Location unavailable</p>
                    )}
                  </div>
                  <div className="order-first flex flex-col items-start gap-1.5 sm:order-none sm:items-end sm:justify-self-end">
                    <Badge variant={statusBadgeVariant(selectedRecord)} className="w-fit">{statusLabel(selectedRecord)}</Badge>
                    <VisitInvoiceBlock appointmentId={selectedAppointment?.id ?? null} serviceRecordId={selectedRecord.id} onOpenInvoice={setOpenInvoiceId} />
                  </div>
                </div>
              </div>
              {selectedRecord.flaggedAt ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                  <p className="text-sm font-bold uppercase tracking-wide">Flagged for review</p>
                  <p className="mt-1 text-sm">{selectedRecord.flagReason || "This visit was invoiced before the ticket was finalized."}</p>
                  <p className="mt-1 text-xs text-amber-900/80">
                    Flagged {new Date(selectedRecord.flaggedAt).toLocaleString()}{selectedRecord.flaggedByLabel ? ` by ${selectedRecord.flaggedByLabel}` : " automatically when the ticket was posted"}.
                    The customer already has the invoice; finalize this ticket against it. A price difference needs a correction on the invoice, not a change here.
                  </p>
                </div>
              ) : null}
              {/* Money, full width and above Finalize: the visit priced as the
                  office will invoice it, then what the technician collected at
                  it. Two stacked blocks, not two columns - a short collections
                  list beside a tall billing block left a column of dead space. */}
              <div className="rounded-md border p-3" data-testid="block-review-visit-billing">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Visit billing</p>
                {selectedAppointment ? (
                  <div className="mt-1">
                    <VisitBillingTable summary={visitBilling} isLoading={visitBillingLoading} isError={visitBillingError} />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Not on an appointment - there is no visit to price.</p>
                )}
              </div>
              <VisitCollectionsBlock appointmentId={selectedAppointment?.id ?? null} locationId={selectedLocation?.id ?? null} />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p>
                  <p className="mt-1 font-medium">{selectedRecord.technicianName || "Not captured"}</p>
                  <p className="text-xs text-muted-foreground">License {selectedRecord.technicianLicenseNumber || "N/A"}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Timing</p>
                  <p className="mt-1 text-sm">In: {selectedAppointment?.timeInAt ? new Date(selectedAppointment.timeInAt).toLocaleString() : "Not tracked"}</p>
                  <p className="text-sm">Out: {selectedAppointment?.timeOutAt ? new Date(selectedAppointment.timeOutAt).toLocaleString() : "Not tracked"}</p>
                  <p className="text-sm">Duration: {formatDuration(selectedAppointment?.durationMinutes)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing Readiness</p>
                  <p className="mt-1 font-medium">{selectedRecord.readyForBilling ? "Ready for billing" : "Not billing-ready"}</p>
                  <p className="text-xs text-muted-foreground">Only finalized services are billing eligible.</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{selectedRecord.notes || "No notes."}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Target Pests</p>
                  <p className="mt-1 text-sm">{selectedRecord.targetPests?.length ? selectedRecord.targetPests.join(", ") : "None captured."}</p>
                </div>
              </div>
              {selectedRecord.followUpRequired ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-950">
                  <p className="text-sm font-bold uppercase tracking-wide">Follow-up Required</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{selectedRecord.followUpNotes || "No follow-up notes provided."}</p>
                </div>
              ) : null}
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Materials</p>
                {!selectedMaterials.length ? (
                  <p className="mt-1 text-sm text-muted-foreground">No materials logged.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedMaterials.map((material) => (
                      <div key={material.id} className="rounded-md bg-muted/20 p-2 text-sm">
                        <p className="font-medium">{material.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[material.epaRegNumber && `EPA ${material.epaRegNumber}`, material.dilutionLabel, material.amountApplied && `${material.amountApplied} ${material.unit || ""}`.trim(), material.applicationLocation, material.activeIngredientAmount && `AI ${material.activeIngredientAmount}`].filter(Boolean).join(" | ")}
                        </p>
                        {material.applicationMethod ? <p className="text-xs text-muted-foreground">Method: {material.applicationMethod}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedRecord.reopenedAt ? (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Reopen Audit</p>
                  <p className="text-muted-foreground">Reopened {new Date(selectedRecord.reopenedAt).toLocaleString()} by {selectedRecord.reopenedByLabel || "Office"}</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedRecord.reopenReason}</p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Reopen Reason</Label>
                <Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Required if reopening a posted/finalized ticket" />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => selectedLocation && setLocation(`/customers/${selectedRecord.customerId}?locationId=${selectedLocation.id}`)}>Open Location</Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={closeReviewModal}>Close</Button>
                  <Button type="button" variant="secondary" onClick={() => reopenMutation.mutate({ id: selectedRecord.id, reason: reopenReason })} disabled={reopenMutation.isPending || !reopenReason.trim()}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Reopen
                  </Button>
                  <Button type="button" onClick={() => finalizeMutation.mutate(selectedRecord.id)} disabled={finalizeMutation.isPending || !!selectedRecord.confirmed}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Finalize
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <InvoiceOnFinalizePrompt prompt={invoicePrompt} onClose={() => setInvoicePrompt(null)} />

      {/* Pass 11b: the visit's invoice, opened from the badge in the review
          modal. Page state rather than the URL: the page's one deep link is
          the ticket (?recordId=), and the modal's own "Open ticket" navigates
          to it, which closes this. */}
      <InvoiceDetailDialog
        invoiceId={openInvoiceId}
        open={!!openInvoiceId}
        onOpenChange={(next) => {
          if (!next) setOpenInvoiceId(null);
        }}
      />

      <Dialog open={batchDialogOpen} onOpenChange={closeBatchDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileStack className="h-4 w-4" /> Batch Invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dateFrom && dateTo ? `${dateFrom} through ${dateTo}` : "Set a From and To date to preview."}
          </p>

          {!batchResult ? (
            <div className="space-y-3">
              {batchPreviewLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Loading eligible tickets...</div>
              ) : !batchPreview?.length ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No finalized, billing-ready tickets without an invoice in this date range.</div>
              ) : (
                <>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <span className="font-medium">{batchPreview.length}</span> ticket{batchPreview.length === 1 ? "" : "s"} eligible across <span className="font-medium">{batchPreviewVisitCount}</span> visit{batchPreviewVisitCount === 1 ? "" : "s"}, totaling <span className="font-medium">{formatCents(batchPreviewTotalCents)}</span>
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {batchPreview.map((record) => {
                      const service = record.serviceId ? serviceById.get(record.serviceId) : undefined;
                      const customer = customerById.get(record.customerId);
                      const location = record.locationId ? locationById.get(record.locationId) : undefined;
                      const serviceType = serviceTypeById.get(record.serviceTypeId || service?.serviceTypeId || "");
                      return (
                        <div key={record.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/20">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{getCustomerLabel(customer, location)}</p>
                            <p className="truncate text-xs text-muted-foreground">{serviceType?.name || "Service"}</p>
                          </div>
                          <span className="shrink-0 font-medium">
                            {record.billingLineType === "AGREEMENT_COVERED"
                              ? record.billingNote === "warranty callback - no charge"
                                ? "Callback - no charge"
                                : "Covered by agreement"
                              : record.billableAmountCents != null
                                ? formatCents(record.billableAmountCents)
                                : "Cannot bill"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
                <Button
                  type="button"
                  onClick={() => batchGenerateMutation.mutate()}
                  disabled={!batchPreview?.length || batchGenerateMutation.isPending}
                >
                  Generate {batchPreviewVisitCount ? `${batchPreviewVisitCount} ` : ""}Invoice{batchPreviewVisitCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <span className="font-medium">{batchResult.invoiced.length}</span> invoice{batchResult.invoiced.length === 1 ? "" : "s"} generated, totaling <span className="font-medium">{formatCents(batchResult.totalAmountCents)}</span>
                {batchResult.skipped.length > 0 && <span> - {batchResult.skipped.length} skipped</span>}
              </div>
              {batchResult.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Skipped</p>
                  {batchResult.skipped.map((item) => (
                    <div key={item.appointmentId ?? item.serviceRecordIds.join(",")} className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs">
                      {item.reason}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setBatchDialogOpen(false)}>Close</Button>
                {canSendInvoice && batchResult.invoiced.length > 0 && (
                  <Button
                    type="button"
                    onClick={() => batchSendMutation.mutate(batchResult.invoiced.map((item) => item.invoiceId))}
                    disabled={batchSendMutation.isPending}
                  >
                    <Send className="mr-1 h-4 w-4" /> Send All
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
