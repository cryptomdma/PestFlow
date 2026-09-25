import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { formatCents } from "@shared/money";
import { can, PERMISSIONS } from "@shared/permissions";
import {
  describeBatchTicketBilling,
  groupBatchInvoicePreview,
  toUtcDay,
  type BatchGenerateResult,
  type BatchInvoicePreview,
  type BatchInvoicePreviewTicket,
} from "@shared/batch-invoice";
import type { Customer, Location, ServiceType, Technician } from "@shared/schema";
import { FileStack, Send } from "lucide-react";

// Batch Invoice (PLAN_ROADMAP_V2.md C2.3, Pass 13), on the Invoices screen -
// it is an invoicing action, and it sat on the Service Ticket Review queue
// until now. The office picks a POSTING window ("posted between": the server
// keeps a ticket whose postedAt, falling back to serviceDate, lands in it)
// and optionally one technician; the server answers every eligible ticket
// with what it will actually bill, plus the down payments the visit invoices
// will carry (Pass 11d's line, which the old preview left silent); this
// dialog groups the answer by technician, then service date, then visit - a
// "route" being a technician on a day - and adds. Generate issues one
// invoice per visit; every result row opens the invoice modal; Send All
// stamps them sent (still the sentAt stamp plus the pinned PDF, no delivery).

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A YYYY-MM-DD day rendered without a timezone shift. */
function formatDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function customerLabel(customer: Customer | undefined, location: Location | undefined) {
  const fullName = `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim();
  return fullName || customer?.companyName || location?.name || "Customer";
}

function locationLabel(location: Location | undefined) {
  if (!location) return null;
  return [location.name, location.address].filter(Boolean).join(" - ");
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function BatchInvoiceDialog({
  open,
  onOpenChange,
  onOpenInvoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A generated invoice's row opens it in the invoice modal. */
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canSendInvoice = can(user?.role ?? "", PERMISSIONS.SEND_INVOICE);

  // The last 30 days of postings by default - a batch cadence, not a rule;
  // both dates are editable.
  const [dateFrom, setDateFrom] = useState(() => formatDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(() => formatDateInputValue(new Date()));
  const [technicianId, setTechnicianId] = useState("ALL");
  const [result, setResult] = useState<BatchGenerateResult | null>(null);
  // The preview as it stood when Generate was pressed, so the result rows can
  // still be labelled after the eligible list has emptied.
  const [previewAtGenerate, setPreviewAtGenerate] = useState<BatchInvoicePreview | null>(null);

  const rangeValid = !!dateFrom && !!dateTo && dateFrom <= dateTo;
  const filters = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (technicianId !== "ALL") params.set("technicianId", technicianId);
    return params.toString();
  }, [dateFrom, dateTo, technicianId]);

  const { data: preview, isLoading: previewLoading, isError: previewError, error: previewErrorValue } = useQuery<BatchInvoicePreview>({
    queryKey: [`/api/invoices/batch-preview?${filters}`],
    enabled: open && rangeValid && !result,
  });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"], enabled: open });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"], enabled: open });
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"], enabled: open });

  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const serviceTypeById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType])), [serviceTypes]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);

  // Grouping is shared/batch-invoice.ts (pure); the label prefers the live
  // profile name and falls back to the name the ticket snapshotted.
  const summary = useMemo(
    () =>
      preview
        ? groupBatchInvoicePreview(preview, (id, snapshotName) =>
          id ? technicianById.get(id)?.displayName ?? snapshotName ?? "Technician" : "Unassigned technician",
        )
        : null,
    [preview, technicianById],
  );

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices/batch-generate", {
        dateFrom,
        dateTo,
        ...(technicianId !== "ALL" ? { technicianId } : {}),
      });
      return (await response.json()) as BatchGenerateResult;
    },
    onSuccess: (generated) => {
      setPreviewAtGenerate(preview ?? null);
      setResult(generated);
      toast({ title: "Batch invoicing complete", description: `${pluralize(generated.invoiced.length, "invoice")} generated, ${generated.skipped.length} skipped.` });
      invalidateInvoiceViews();
    },
    onError: (error: Error) => toast({ title: "Batch invoicing failed", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const response = await apiRequest("POST", "/api/invoices/batch-send", { invoiceIds });
      return (await response.json()) as unknown[];
    },
    onSuccess: (sent) => {
      toast({ title: "Invoices marked sent", description: `${pluralize(sent.length, "invoice")} stamped as sent and their PDFs pinned. There is no delivery yet - open or download each PDF to deliver it.` });
      invalidateInvoiceViews();
    },
    onError: (error: Error) => toast({ title: "Unable to send invoices", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const close = (next: boolean) => {
    if (generateMutation.isPending || sendMutation.isPending) return;
    onOpenChange(next);
    if (!next) {
      setResult(null);
      setPreviewAtGenerate(null);
    }
  };

  const ticketById = useMemo(
    () => new Map((previewAtGenerate?.tickets ?? []).map((ticket) => [ticket.id, ticket] as [string, BatchInvoicePreviewTicket])),
    [previewAtGenerate],
  );
  const describeResultRow = (serviceRecordIds: string[]) => {
    const ticket = serviceRecordIds.map((id) => ticketById.get(id)).find((candidate): candidate is BatchInvoicePreviewTicket => !!candidate);
    if (!ticket) return null;
    const customer = customerById.get(ticket.customerId);
    const location = ticket.locationId ? locationById.get(ticket.locationId) : undefined;
    return [customerLabel(customer, location), locationLabel(location)].filter(Boolean).join(" - ");
  };

  const technicianFilterLabel = technicianId === "ALL" ? null : technicianById.get(technicianId)?.displayName ?? "the selected technician";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileStack className="h-4 w-4" /> Batch Invoice</DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Finalized, billing-ready tickets with no invoice yet, <span className="font-medium text-foreground">posted between</span> the two dates
              {technicianFilterLabel ? <> by <span className="font-medium text-foreground">{technicianFilterLabel}</span></> : null}. Each visit
              becomes one invoice carrying every finalized ticket on it, including tickets posted outside this window or by another technician.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="batch-posted-from">Posted from</Label>
                <Input id="batch-posted-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-batch-posted-from" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-posted-to">Posted to</Label>
                <Input id="batch-posted-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-batch-posted-to" />
              </div>
              <div className="space-y-1.5">
                <Label>Technician</Label>
                <Select value={technicianId} onValueChange={setTechnicianId}>
                  <SelectTrigger data-testid="select-batch-technician"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All technicians</SelectItem>
                    {(technicians ?? []).map((technician) => (
                      <SelectItem key={technician.id} value={technician.id}>{technician.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!dateFrom || !dateTo ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Set both dates to preview.</div>
            ) : !rangeValid ? (
              <div className="py-6 text-center text-sm text-destructive">The "posted from" date is after the "posted to" date.</div>
            ) : previewLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading eligible tickets...</div>
            ) : previewError ? (
              <div className="py-6 text-center text-sm text-destructive">Could not load the preview: {getApiErrorMessage(previewErrorValue)}</div>
            ) : !summary || summary.ticketCount === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground" data-testid="text-batch-empty">
                No finalized, billing-ready ticket without an invoice was posted between these dates{technicianFilterLabel ? ` by ${technicianFilterLabel}` : ""}.
              </div>
            ) : (
              <>
                <div className="rounded-md border bg-muted/20 p-3 text-sm" data-testid="text-batch-summary">
                  <span className="font-medium">{pluralize(summary.ticketCount, "ticket")}</span> across <span className="font-medium">{pluralize(summary.visitCount, "visit")}</span>
                  {summary.chargeCount > 0 ? <>, with <span className="font-medium">{pluralize(summary.chargeCount, "down payment")}</span> riding along</> : null}
                  , billable <span className="font-medium">{formatCents(summary.amountCents)}</span> before tax
                </div>
                <div className="max-h-[45vh] space-y-4 overflow-y-auto pr-1">
                  {summary.groups.map((group) => (
                    <div key={group.technicianId ?? "unassigned"} className="space-y-1.5" data-testid={`batch-group-${group.technicianId ?? "unassigned"}`}>
                      <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <span>{group.technicianLabel}</span>
                        <span>{pluralize(group.visitCount, "visit")} · {pluralize(group.ticketCount, "ticket")} · {formatCents(group.amountCents)}</span>
                      </div>
                      {group.days.map((day) => (
                        <div key={day.serviceDate} className="rounded-md border">
                          <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-2 py-1 text-xs font-medium">
                            <span>{formatDay(day.serviceDate)}</span>
                            <span>{formatCents(day.amountCents)}</span>
                          </div>
                          {day.visits.map((visit) => {
                            const customer = customerById.get(visit.customerId);
                            const location = visit.locationId ? locationById.get(visit.locationId) : undefined;
                            return (
                              <div key={visit.key} className="border-b px-2 py-1.5 last:border-b-0" data-testid={`batch-visit-${visit.key}`}>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="min-w-0 truncate font-medium">
                                    {customerLabel(customer, location)}
                                    {locationLabel(location) ? <span className="font-normal text-muted-foreground"> - {locationLabel(location)}</span> : null}
                                  </span>
                                  <span className="shrink-0 font-medium">{formatCents(visit.amountCents)}</span>
                                </div>
                                {visit.tickets.map((ticket) => {
                                  const billing = describeBatchTicketBilling(ticket);
                                  const serviceType = serviceTypeById.get(ticket.serviceTypeId || "");
                                  const ticketDay = toUtcDay(ticket.serviceDate);
                                  return (
                                    <div key={ticket.id} className="flex items-center justify-between gap-3 pl-3 text-xs text-muted-foreground" data-testid={`batch-ticket-${ticket.id}`}>
                                      <span className="min-w-0 truncate">
                                        {serviceType?.name || "Service"}
                                        {ticketDay !== day.serviceDate ? ` (${formatDay(ticketDay)})` : ""}
                                      </span>
                                      <span className={`shrink-0 ${billing.kind === "CANNOT_BILL" ? "text-destructive" : ""}`} title={billing.note ?? undefined}>
                                        {billing.kind === "AMOUNT"
                                          ? formatCents(billing.amountCents ?? 0)
                                          : billing.kind === "CALLBACK"
                                            ? "Callback - no charge"
                                            : billing.kind === "COVERED"
                                              ? "Covered by agreement"
                                              : `Cannot bill${billing.note ? `: ${billing.note}` : ""}`}
                                      </span>
                                    </div>
                                  );
                                })}
                                {visit.charges.map((charge) => (
                                  <div key={charge.agreementId} className="flex items-center justify-between gap-3 pl-3 text-xs" data-testid={`batch-charge-${charge.agreementId}`}>
                                    <span className="min-w-0 truncate">
                                      {charge.description} <span className="text-muted-foreground">- billed on this visit's invoice</span>
                                    </span>
                                    <span className="shrink-0">{formatCents(charge.amountCents)}</span>
                                  </div>
                                ))}
                                {visit.tickets.length > 1 ? (
                                  <p className="pl-3 text-[11px] text-muted-foreground">One invoice for the visit.</p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={generateMutation.isPending}>Cancel</Button>
              <Button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={!rangeValid || !summary || summary.ticketCount === 0 || generateMutation.isPending}
                data-testid="button-batch-generate"
              >
                {generateMutation.isPending ? "Generating..." : `Generate ${summary?.visitCount ? `${summary.visitCount} ` : ""}Invoice${summary?.visitCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/20 p-3 text-sm" data-testid="text-batch-result">
              <span className="font-medium">{pluralize(result.invoiced.length, "invoice")}</span> generated, totaling <span className="font-medium">{formatCents(result.totalAmountCents)}</span>
              {result.skipped.length > 0 ? <span> - {result.skipped.length} skipped</span> : null}
            </div>
            {result.invoiced.length > 0 ? (
              <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                {result.invoiced.map((item) => {
                  const label = describeResultRow(item.serviceRecordIds);
                  return (
                    <button
                      key={item.invoiceId}
                      type="button"
                      onClick={() => onOpenInvoice(item.invoiceId)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Open invoice ${item.invoiceNumber}`}
                      data-testid={`button-batch-result-${item.invoiceId}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{item.invoiceNumber}</span>
                        {label ? <span className="text-muted-foreground"> - {label}</span> : null}
                      </span>
                      <span className="shrink-0 font-medium">{formatCents(item.totalAmountCents)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {result.skipped.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Skipped</p>
                {result.skipped.map((item) => (
                  <div key={item.appointmentId ?? item.serviceRecordIds.join(",")} className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs">
                    {describeResultRow(item.serviceRecordIds) ? <span className="font-medium">{describeResultRow(item.serviceRecordIds)}: </span> : null}
                    {item.reason}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={sendMutation.isPending}>Close</Button>
              {canSendInvoice && result.invoiced.length > 0 ? (
                <Button
                  type="button"
                  onClick={() => sendMutation.mutate(result.invoiced.map((item) => item.invoiceId))}
                  disabled={sendMutation.isPending}
                  data-testid="button-batch-send-all"
                >
                  <Send className="mr-1 h-4 w-4" /> {sendMutation.isPending ? "Sending..." : "Send All"}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
