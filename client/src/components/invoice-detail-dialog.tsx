import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ApiError, apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { can, PERMISSIONS } from "@shared/permissions";
import { formatCents } from "@shared/money";
import { isFullyAgreementCovered, isInvoiceIssued, NO_CHARGE_LABEL } from "@shared/invoice-status";
import {
  describeBillToSource,
  describeInvoiceLineType,
  describeInvoiceOrigin,
  describeInvoiceTerms,
  describeTaxSnapshot,
  describeTicketStatus,
  readBillingProfileSnapshot,
  type InvoiceDetail,
  type UnfinalizedTicketView,
} from "@shared/invoice-detail";
import { formatCreditMemoReason, formatPaymentMethod, type InvoiceLocationBalance } from "@shared/payments";
import type { AuditLog, Invoice, Location } from "@shared/schema";
import { InvoiceDocumentActions, InvoiceSentStamp } from "@/components/invoice-document-actions";
import { InvoiceStatusBadge, isInvoiceOverdue } from "@/components/invoice-status-badge";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { ApplyLocationBalancePrompt } from "@/components/apply-location-balance-prompt";
import { InvoiceApplications, IssueCreditMemoDialog, type InvoiceLedgerResponse } from "@/components/location-ledger-panel";
import { AuditLogEntryCard, formatAuditTimestamp } from "@/components/audit-log-entry-card";
import { Ban, CalendarDays, DollarSign, FileCheck, MapPin, User } from "lucide-react";

// The invoice modal (PLAN_ROADMAP_V2.md Part D, Pass 11a). One component
// carries every figure and every act an invoice row used to spread across six
// to nine buttons: header, visit, lines, totals, terms, ledger, notes, history,
// and a footer that follows the invoice's state. It reads GET /api/invoices/:id
// (the row, its lines, the customer / location / visit) plus the reads that
// already existed (ledger, location balance, audit rows), and every act goes
// through the route that already gated it - nothing here writes a figure.
//
// Void follows the SERVER, not the old row: voidInvoiceTx voids a PAID invoice
// too, releasing its applications back to the location (the recorded
// void-and-re-enter correction path), so Void is offered on every non-void
// invoice behind a confirm that names what it will release. There is no Email
// button: "send" is still the sentAt stamp and the pinned PDF (Pass 10).
//
// Pass 11b (C2.1b) added its reach: every line with a ticket behind it links
// to that ticket on Service Ticket Review (?recordId=), and an invoice with
// no location - the two rows from before one was required - offers Assign
// location to a manager, through the server's own customer-location rule.

function formatDate(value: string | Date | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "";
}

/** A stored instant as the viewer's local calendar day, for a date input or the schedule's ?date=. */
function localDateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function humanizeToken(value: string | null | undefined) {
  if (!value) return null;
  const spaced = value.replace(/_/g, " ").trim().toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

// Pass 11b: the repair for an invoice with no location. The office picks one
// of the customer's locations (defaulting to the primary, as the New Invoice
// dialog does) and POST /api/invoices/:id/assign-location applies the same
// rule createManualInvoice does - this customer's location, or a refusal.
// Offered only while the invoice has none: it is a repair, not a transfer.
function AssignInvoiceLocationDialog({ invoice, open, onOpenChange }: { invoice: Invoice; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const { data: customerLocations, isLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations", invoice.customerId],
    enabled: open,
  });
  const [locationId, setLocationId] = useState("");
  useEffect(() => {
    if (!open || !customerLocations) return;
    setLocationId((prev) => {
      if (prev && customerLocations.some((location) => location.id === prev)) return prev;
      const primary = customerLocations.find((location) => location.isPrimary) ?? customerLocations[0];
      return primary?.id ?? "";
    });
  }, [open, customerLocations]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invoices/${invoice.id}/assign-location`, { locationId });
      return (await response.json()) as Invoice;
    },
    onSuccess: (updated) => {
      invalidateInvoiceViews();
      onOpenChange(false);
      toast({ title: `Invoice ${updated.invoiceNumber} assigned to a location`, description: "It is now on that location's Invoices tab, in its balance and on its History." });
    },
    onError: (err: Error) => toast({ title: "Unable to assign the location", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-assign-invoice-location">
        <DialogHeader>
          <DialogTitle>Assign {invoice.invoiceNumber} to a location</DialogTitle>
          <DialogDescription>
            This invoice was created before a location was required. Pick which of the customer's locations it belongs to. Its terms and figures stay as issued, and it cannot be moved again from here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="assign-invoice-location">Location</Label>
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="assign-invoice-location" data-testid="select-assign-invoice-location">
                <SelectValue placeholder="Choose a location" />
              </SelectTrigger>
              <SelectContent>
                {(customerLocations ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {[location.name, location.address].filter(Boolean).join(" - ")}{location.isPrimary ? " (primary)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={!locationId || mutation.isPending} data-testid="button-assign-invoice-location-confirm">
            {mutation.isPending ? "Assigning..." : "Assign location"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDetailDialog({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canIssue = can(role, PERMISSIONS.GENERATE_INVOICE);
  const canVoid = can(role, PERMISSIONS.VOID_INVOICE);
  const canEditTerms = can(role, PERMISSIONS.SEND_INVOICE);
  const canRecord = can(role, PERMISSIONS.TAKE_PAYMENT_FIELD);
  const canApply = can(role, PERMISSIONS.APPLY_PAYMENT);
  const canCredit = can(role, PERMISSIONS.ISSUE_CREDIT_MEMO);
  const canAssignLocation = can(role, PERMISSIONS.ASSIGN_INVOICE_LOCATION);

  const enabled = open && !!invoiceId;
  const { data: detail, isLoading, isError, error } = useQuery<InvoiceDetail>({
    queryKey: ["/api/invoices", invoiceId ?? ""],
    enabled,
  });
  const invoice = detail?.invoice;
  const issued = !!invoice && isInvoiceIssued(invoice.status);
  const isDraft = invoice?.status === "DRAFT";
  const isVoid = invoice?.status === "VOID";
  const hasLocation = !!invoice?.locationId;

  // The ledger feeds the void confirm (what it will release); the section
  // itself reads the same key through InvoiceApplications. A draft holds no
  // applications, so it is not asked.
  const { data: ledger } = useQuery<InvoiceLedgerResponse>({
    queryKey: ["/api/invoices", invoiceId ?? "", "ledger"],
    enabled: enabled && !!invoice && !isDraft,
  });
  const { data: history, isLoading: historyLoading, isError: historyError } = useQuery<AuditLog[]>({
    queryKey: [`/api/audit-logs?entityType=invoice&entityId=${invoiceId ?? ""}`],
    enabled,
  });
  // "Apply location balance" is offered only when the server has something
  // to suggest - a pool that is all designated elsewhere would open a prompt
  // that immediately closes itself.
  const { data: locationBalance } = useQuery<InvoiceLocationBalance>({
    queryKey: ["/api/invoices", invoiceId ?? "", "location-balance"],
    enabled: enabled && !!invoice && issued && hasLocation && invoice.balanceDueCents > 0 && canApply,
  });

  const [notesDraft, setNotesDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  useEffect(() => {
    if (!invoice) return;
    setNotesDraft(invoice.notes ?? "");
    setDueDateDraft(localDateKey(invoice.dueDate));
  }, [invoice?.id, invoice?.notes, invoice?.dueDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const [recordOpen, setRecordOpen] = useState(false);
  const [applyInvoice, setApplyInvoice] = useState<Invoice | null>(null);
  const [creditOpen, setCreditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [issuePrompt, setIssuePrompt] = useState<UnfinalizedTicketView[] | null>(null);

  const notesChanged = !!invoice && notesDraft !== (invoice.notes ?? "");
  const dueDateChanged = !!invoice && dueDateDraft !== localDateKey(invoice.dueDate);
  const updateMutation = useMutation({
    mutationFn: async () => {
      // Only what changed goes in the body, so an unchanged save sends nothing
      // and the server's "only when a value actually changed" audit rule
      // (Pass 8) sees exactly the edit that was made.
      const body: { notes?: string | null; dueDate?: string | null } = {};
      if (notesChanged) body.notes = notesDraft.trim() ? notesDraft : null;
      if (dueDateChanged) body.dueDate = dueDateDraft ? new Date(`${dueDateDraft}T12:00:00`).toISOString() : null;
      const response = await apiRequest("PATCH", `/api/invoices/${invoice!.id}`, body);
      return (await response.json()) as Invoice;
    },
    onSuccess: (updated) => {
      invalidateInvoiceViews();
      toast({ title: `Invoice ${updated.invoiceNumber} updated`, description: "The change is on the invoice's history." });
    },
    onError: (err: Error) => toast({ title: "Unable to update the invoice", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  // D3: DRAFT -> issued. The first attempt sends no confirmation; a 409
  // (manager+) lists the unfinalized tickets and the prompt below asks before
  // retrying with confirmPrefinalization; a 403 (support) just toasts.
  const issueMutation = useMutation({
    mutationFn: async ({ confirmPrefinalization }: { confirmPrefinalization?: boolean }) => {
      const response = await apiRequest("POST", `/api/invoices/${invoice!.id}/issue`, { confirmPrefinalization });
      return (await response.json()) as Invoice;
    },
    onSuccess: (issuedInvoice) => {
      invalidateInvoiceViews();
      queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
      setIssuePrompt(null);
      toast({ title: `Invoice ${issuedInvoice.invoiceNumber} issued` });
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && getApiErrorCode(err) === "PREFINALIZATION_ISSUE_REQUIRED") {
        const body = err.body as { unfinalizedTickets?: UnfinalizedTicketView[] };
        setIssuePrompt(body.unfinalizedTickets ?? []);
        return;
      }
      toast({ title: "Unable to issue invoice", description: getApiErrorMessage(err), variant: "destructive" });
    },
  });

  const liveApplications = useMemo(() => {
    if (!ledger) return [];
    return [
      ...ledger.paymentApplications
        .filter(({ application }) => !application.released)
        .map(({ application, payment }) => ({
          id: application.id,
          label: `${formatPaymentMethod(payment.method)} payment${payment.checkNumber ? ` #${payment.checkNumber}` : ""}${payment.status === "PENDING" ? " (pending confirmation)" : ""}`,
          amountCents: application.amountCents,
        })),
      ...ledger.creditApplications
        .filter(({ application }) => !application.released)
        .map(({ application, creditMemo }) => ({
          id: application.id,
          label: `Credit memo (${formatCreditMemoReason(creditMemo.reasonCode)})`,
          amountCents: application.amountCents,
        })),
    ];
  }, [ledger]);

  const voidMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invoices/${invoice!.id}/void`);
      return (await response.json()) as Invoice;
    },
    onSuccess: (voided) => {
      invalidateInvoiceViews();
      setVoidOpen(false);
      toast({
        title: `Invoice ${voided.invoiceNumber} voided`,
        description: liveApplications.length > 0
          ? `${liveApplications.length === 1 ? "One application" : `${liveApplications.length} applications`} released back to the location balance.`
          : undefined,
      });
    },
    onError: (err: Error) => toast({ title: "Unable to void invoice", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  const origin = detail ? describeInvoiceOrigin(detail.invoice, detail.lines) : null;
  const billingSnapshot = invoice ? readBillingProfileSnapshot(invoice.billingProfileSnapshot) : null;
  const taxLine = invoice ? describeTaxSnapshot(invoice.taxSnapshot) : null;
  const voidEntry = isVoid ? history?.find((entry) => entry.action === "invoice_voided") : undefined;
  const fullyCovered = !!detail && isFullyAgreementCovered({ totalAmountCents: detail.invoice.totalAmountCents, lines: detail.lines });
  const canEdit = canEditTerms && !!invoice && !isVoid;
  const suggestedBalanceCents = locationBalance?.suggestedCents ?? 0;
  const noLocationReason = "This invoice has no location (created before one was required), so nothing can be recorded against it.";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="dialog-invoice-detail">
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap pr-8">
              <DialogTitle data-testid="text-invoice-detail-title">{invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice"}</DialogTitle>
              {invoice ? <InvoiceStatusBadge invoice={invoice} /> : null}
              {invoice ? <InvoiceSentStamp invoice={invoice} className="text-xs text-muted-foreground" /> : null}
            </div>
            <DialogDescription asChild>
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
                {detail ? (
                  <>
                    <Link href={`/customers/${detail.customer.id}`} className="font-medium text-foreground hover:underline" data-testid="link-invoice-customer">
                      {detail.customer.label}
                    </Link>
                    {detail.location ? (
                      <Link href={`/customers/${detail.customer.id}?locationId=${detail.location.id}`} className="inline-flex items-center gap-1 hover:underline" data-testid="link-invoice-location">
                        <MapPin className="h-3.5 w-3.5" />
                        {[detail.location.name, detail.location.address].filter(Boolean).join(" - ")}, {detail.location.city}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-destructive" title="Created before a location was required. It is on no location's Invoices tab and in no location balance." data-testid="text-invoice-no-location">No location</span>
                        {canAssignLocation && !isVoid ? (
                          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setAssignOpen(true)} data-testid="button-assign-invoice-location">
                            Assign location
                          </Button>
                        ) : null}
                      </span>
                    )}
                    <span>{isDraft ? `Drafted ${formatDate(detail.invoice.createdAt)}` : `Issued ${formatDate(detail.invoice.issuedAt ?? detail.invoice.createdAt)}`}</span>
                    {detail.invoice.dueDate ? <span>Due {formatDate(detail.invoice.dueDate)}</span> : null}
                  </>
                ) : (
                  <span>Line items, the visit, the ledger and the history of one invoice.</span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-3" data-testid="loading-invoice-detail">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : isError || !detail || !invoice ? (
            <p className="text-sm text-destructive" data-testid="error-invoice-detail">
              {error ? getApiErrorMessage(error) : "Unable to load this invoice."}
            </p>
          ) : (
            <div className="space-y-4">
              {isVoid ? (
                <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm" data-testid="banner-invoice-void">
                  Voided{voidEntry ? ` ${formatAuditTimestamp(voidEntry.createdAt)} by ${voidEntry.actorLabel?.trim() || "System"}` : ""}. Nothing is owed; anything applied to it was released back to the location balance. Read-only.
                </div>
              ) : null}
              {isDraft ? (
                <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm" data-testid="banner-invoice-draft">
                  Draft - not a receivable until issued. Lines, tax, terms and the due date are re-priced from the visit as it stands at issue.
                </div>
              ) : null}
              {fullyCovered ? (
                <div className="rounded-md border bg-muted/20 p-3 text-sm" data-testid="banner-invoice-covered">{NO_CHARGE_LABEL}</div>
              ) : null}

              <section className="rounded-lg border p-3 space-y-2">
                <SectionTitle>Visit</SectionTitle>
                {detail.appointment ? (
                  <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm" data-testid="block-invoice-visit">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {new Date(detail.appointment.scheduledDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {detail.appointment.technicianLabel ?? "No technician assigned"}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">{detail.appointment.status.toLowerCase().replace(/_/g, " ")}</Badge>
                    <Link
                      href={`/schedule?appointmentId=${detail.appointment.id}&date=${localDateKey(detail.appointment.scheduledDate)}`}
                      className="text-primary hover:underline"
                      data-testid="link-invoice-visit"
                    >
                      Open on schedule
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-invoice-origin">{origin?.label}</p>
                )}
              </section>

              <section className="rounded-lg border p-3 space-y-2">
                <SectionTitle>Lines</SectionTitle>
                {detail.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-invoice-no-lines">No line items are recorded for this invoice; it predates line items. The totals below are what it carries.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Tax</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.lines.map((line) => (
                          <TableRow key={line.id} data-testid={`row-invoice-line-${line.id}`}>
                            <TableCell className="py-2">
                              <div className="text-sm">{line.description}</div>
                              {line.serviceTypeName || line.serviceDate || line.ticketStatus || line.serviceRecordId ? (
                                <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                  {line.serviceTypeName ? <span>{line.serviceTypeName}</span> : null}
                                  {line.serviceDate ? <span>Serviced {formatDate(line.serviceDate)}</span> : null}
                                  {line.ticketStatus ? (
                                    <Badge variant="outline" className={`text-[10px] ${line.ticketStatus === "FLAGGED_FOR_REVIEW" ? "border-destructive/50 text-destructive" : ""}`}>
                                      Ticket {describeTicketStatus(line.ticketStatus).toLowerCase()}
                                    </Badge>
                                  ) : null}
                                  {line.serviceRecordId ? (
                                    <Link
                                      href={`/service-ticket-review?recordId=${encodeURIComponent(line.serviceRecordId)}`}
                                      className="text-primary hover:underline"
                                      data-testid={`link-invoice-line-ticket-${line.id}`}
                                    >
                                      Open ticket
                                    </Link>
                                  ) : null}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge variant={line.lineType === "AGREEMENT_COVERED" ? "secondary" : "outline"} className="text-xs">{describeInvoiceLineType(line.lineType)}</Badge>
                            </TableCell>
                            <TableCell className="py-2 text-right tabular-nums">{line.quantity}</TableCell>
                            <TableCell className="py-2 text-right tabular-nums">{formatCents(line.unitPriceCents)}</TableCell>
                            <TableCell className="py-2 text-right tabular-nums font-medium">{formatCents(line.amountCents)}</TableCell>
                            <TableCell className="py-2 text-right tabular-nums">{line.taxable ? formatCents(line.taxCents) : <span className="text-muted-foreground">-</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm" data-testid="block-invoice-totals">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="text-right tabular-nums">{formatCents(invoice.amountCents)}</dd>
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="text-right tabular-nums">{formatCents(invoice.taxCents ?? 0)}</dd>
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-right tabular-nums font-semibold" data-testid="text-invoice-total">{formatCents(invoice.totalAmountCents)}</dd>
                  {issued ? (
                    <>
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="text-right tabular-nums" data-testid="text-invoice-paid">{formatCents(invoice.amountPaidCents)}</dd>
                      {invoice.pendingAppliedCents > 0 ? (
                        <>
                          <dt className="text-chart-3">Pending confirmation</dt>
                          <dd className="text-right tabular-nums text-chart-3" data-testid="text-invoice-pending">{formatCents(invoice.pendingAppliedCents)}</dd>
                        </>
                      ) : null}
                      <dt className={`font-semibold ${isInvoiceOverdue(invoice) ? "text-destructive" : ""}`}>Balance due</dt>
                      <dd className={`text-right tabular-nums font-semibold ${isInvoiceOverdue(invoice) ? "text-destructive" : ""}`} data-testid="text-invoice-balance">{formatCents(invoice.balanceDueCents)}</dd>
                    </>
                  ) : null}
                </dl>
                {isDraft ? <p className="text-xs text-muted-foreground text-right">A preview - re-priced from the tickets at issue.</p> : null}
                {isVoid ? <p className="text-xs text-muted-foreground text-right">Voided - nothing owed.</p> : null}
              </section>

              <section className="rounded-lg border p-3 space-y-2">
                <SectionTitle>Terms</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div className="space-y-0.5" data-testid="block-invoice-billing-profile">
                    <p className="text-xs text-muted-foreground">Billing profile</p>
                    {billingSnapshot ? (
                      <>
                        {billingSnapshot.profileId || billingSnapshot.label ? (
                          <p>{billingSnapshot.label ?? "Billing profile"}{billingSnapshot.billingType ? ` - ${humanizeToken(billingSnapshot.billingType)}` : ""}</p>
                        ) : (
                          // Pass 11c: the snapshot is written with or without a profile. No profile means default terms; the parties below still say who is billed.
                          <p>No billing profile - default terms</p>
                        )}
                        {describeInvoiceTerms(billingSnapshot.invoiceTerms) ? <p className="text-muted-foreground">{describeInvoiceTerms(billingSnapshot.invoiceTerms)}</p> : null}
                        {billingSnapshot.billTo ? (
                          <p className="text-muted-foreground" data-testid="text-invoice-bill-to">
                            Bill to {billingSnapshot.billTo.name}{billingSnapshot.billTo.address ? `, ${billingSnapshot.billTo.address}` : ""}
                            {" "}<span className="whitespace-nowrap">({describeBillToSource(billingSnapshot.billTo.source)})</span>
                          </p>
                        ) : billingSnapshot.billingName ? (
                          // A pre-Pass-11c snapshot: the profile's name was frozen, the parties were not.
                          <p className="text-muted-foreground">Bill to {billingSnapshot.billingName}{billingSnapshot.billingAddress ? `, ${billingSnapshot.billingAddress}` : ""}</p>
                        ) : null}
                        {billingSnapshot.serviceLocation ? (
                          <p className="text-muted-foreground" data-testid="text-invoice-service-location">
                            Service location: {billingSnapshot.serviceLocation.name}{billingSnapshot.serviceLocation.address ? `, ${billingSnapshot.serviceLocation.address}` : ""}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-muted-foreground">{isDraft ? "Resolved from the location's billing profile at issue." : "No billing profile was snapshotted."}</p>
                    )}
                  </div>
                  <div className="space-y-0.5" data-testid="block-invoice-tax">
                    <p className="text-xs text-muted-foreground">Tax</p>
                    <p>{taxLine ?? (isDraft ? "Decided by the tax engine at issue." : "Entered manually - no tax rule was applied.")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice-due-date" className="text-xs text-muted-foreground font-normal">Due date</Label>
                    {canEdit ? (
                      <>
                        <Input
                          id="invoice-due-date"
                          type="date"
                          value={dueDateDraft}
                          onChange={(e) => setDueDateDraft(e.target.value)}
                          disabled={isDraft || updateMutation.isPending}
                          data-testid="input-invoice-due-date"
                        />
                        {isDraft ? <p className="text-xs text-muted-foreground">Set from the billing profile's terms at issue.</p> : null}
                      </>
                    ) : (
                      <p>{formatDate(invoice.dueDate) || "No due date"}</p>
                    )}
                  </div>
                </div>
              </section>

              {!isDraft ? (
                <section className="rounded-lg border p-3 space-y-2">
                  <SectionTitle>Applications</SectionTitle>
                  <InvoiceApplications invoice={invoice} confirmPending />
                </section>
              ) : null}

              <section className="rounded-lg border p-3 space-y-2">
                <SectionTitle>Notes</SectionTitle>
                {canEdit ? (
                  <>
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      rows={3}
                      className="resize-none"
                      disabled={updateMutation.isPending}
                      data-testid="input-invoice-notes"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => updateMutation.mutate()}
                        disabled={!(notesChanged || dueDateChanged) || updateMutation.isPending}
                        data-testid="button-save-invoice"
                      >
                        {updateMutation.isPending ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-invoice-notes">{invoice.notes || <span className="text-muted-foreground">No notes</span>}</p>
                )}
              </section>

              <section className="rounded-lg border p-3 space-y-2">
                <SectionTitle>History</SectionTitle>
                {historyLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : historyError ? (
                  <p className="text-sm text-destructive">Unable to load this invoice's history.</p>
                ) : !history || history.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="empty-invoice-history">No recorded changes for this invoice.</p>
                ) : (
                  <div className="space-y-2" data-testid="list-invoice-history">
                    {history.map((entry) => (
                      <AuditLogEntryCard key={entry.id} entry={entry} showEntityType={false} />
                    ))}
                  </div>
                )}
              </section>

              <div className="flex items-center justify-end gap-2 flex-wrap border-t pt-3" data-testid="footer-invoice-actions">
                <InvoiceDocumentActions invoice={invoice} />
                {isDraft && canIssue ? (
                  <Button size="sm" onClick={() => issueMutation.mutate({})} disabled={issueMutation.isPending} data-testid="button-issue-invoice">
                    <FileCheck className="h-3 w-3 mr-1" /> {issueMutation.isPending ? "Issuing..." : "Issue"}
                  </Button>
                ) : null}
                {issued && invoice.balanceDueCents > 0 && canRecord ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRecordOpen(true)}
                    disabled={!hasLocation}
                    title={hasLocation ? undefined : noLocationReason}
                    data-testid="button-record-payment"
                  >
                    <DollarSign className="h-3 w-3 mr-1" /> Record Payment
                  </Button>
                ) : null}
                {issued && invoice.balanceDueCents > 0 && canApply && hasLocation && suggestedBalanceCents > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => setApplyInvoice(invoice)} data-testid="button-apply-location-balance-open">
                    Apply location balance
                  </Button>
                ) : null}
                {issued && canCredit ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCreditOpen(true)}
                    disabled={!hasLocation}
                    title={hasLocation ? undefined : noLocationReason}
                    data-testid="button-issue-credit-memo"
                  >
                    Issue credit memo
                  </Button>
                ) : null}
                {!isVoid && canVoid ? (
                  <Button variant="ghost" size="sm" onClick={() => setVoidOpen(true)} disabled={voidMutation.isPending} data-testid="button-void-invoice">
                    <Ban className="h-3 w-3 mr-1" /> Void
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {invoice?.locationId ? (
        <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} locationId={invoice.locationId} invoice={invoice} />
      ) : null}
      <ApplyLocationBalancePrompt invoice={applyInvoice} onClose={() => setApplyInvoice(null)} />
      {invoice?.locationId ? (
        <IssueCreditMemoDialog open={creditOpen} onOpenChange={setCreditOpen} locationId={invoice.locationId} invoices={[invoice]} defaultInvoiceId={invoice.id} />
      ) : null}
      {invoice && !invoice.locationId ? (
        <AssignInvoiceLocationDialog invoice={invoice} open={assignOpen} onOpenChange={setAssignOpen} />
      ) : null}

      <AlertDialog open={voidOpen} onOpenChange={(next) => !next && !voidMutation.isPending && setVoidOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {invoice?.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {isDraft ? (
                  <p>The draft is voided and the visit is free to be invoiced again. The record stays, marked void.</p>
                ) : (
                  <p>
                    The invoice stays on the record, marked void, and owes nothing. To bill this again, issue a corrected invoice.
                    {invoice?.status === "PAID" ? " This invoice is paid: voiding it puts the money back on the location balance, the void-and-re-enter correction path." : ""}
                  </p>
                )}
                {liveApplications.length > 0 ? (
                  <>
                    <p>Voiding releases {liveApplications.length === 1 ? "this application" : `these ${liveApplications.length} applications`} back to the location's unapplied balance:</p>
                    <ul className="list-disc pl-5 text-sm" data-testid="list-void-releases">
                      {liveApplications.map((application) => (
                        <li key={application.id}>{application.label} - {formatCents(application.amountCents)}</li>
                      ))}
                    </ul>
                  </>
                ) : issued ? (
                  <p>Nothing is applied to it, so nothing is released.</p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidMutation.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); voidMutation.mutate(); }} disabled={voidMutation.isPending} data-testid="button-void-invoice-confirm">
              {voidMutation.isPending ? "Voiding..." : "Void invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!issuePrompt} onOpenChange={(next) => !next && setIssuePrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue {invoice?.invoiceNumber} before the visit is finalized?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {issuePrompt?.length === 1
                    ? "One service on this visit is not finalized."
                    : `${issuePrompt?.length ?? 0} services on this visit are not finalized.`}{" "}
                  Issuing now bills the customer from the tickets as they stand and flags those tickets for review, so the office finalizes them knowing the invoice is already out.
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {(issuePrompt ?? []).map((ticket) => (
                    <li key={ticket.serviceId}>{ticket.description}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); issueMutation.mutate({ confirmPrefinalization: true }); }}
              disabled={issueMutation.isPending}
              data-testid="button-issue-and-flag"
            >
              Issue and flag tickets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
