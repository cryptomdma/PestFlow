import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { dollarsToCents, formatCents } from "@shared/money";
import { isInvoiceIssued } from "@shared/invoice-status";
import { InvoiceDetailDialog } from "@/components/invoice-detail-dialog";
import { InvoiceStatusBadge, InvoiceStatusIcon, isInvoiceOverdue } from "@/components/invoice-status-badge";
import {
  Plus,
  Search,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  ReceiptText,
} from "lucide-react";
import type { Customer, Invoice, Location, ServiceRecord, ServiceType } from "@shared/schema";

function getLocationLabel(location: Location) {
  return [location.name, location.address].filter(Boolean).join(" - ");
}

function InvoiceForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const [form, setForm] = useState({
    customerId: "",
    locationId: "",
    description: "",
    amount: "",
    tax: "0",
    dueDate: "",
    notes: "",
  });

  // The location is the customer record (canon rule 1), so a manual invoice
  // is billed to one of the customer's locations - required, defaulting to
  // the primary. Without one the invoice showed on this list but on no
  // location's Invoices tab and in no location balance.
  const { data: customerLocations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations", form.customerId],
    enabled: !!form.customerId,
  });
  useEffect(() => {
    if (!customerLocations) return;
    setForm((prev) => {
      if (prev.locationId && customerLocations.some((location) => location.id === prev.locationId)) return prev;
      const primary = customerLocations.find((location) => location.isPrimary) ?? customerLocations[0];
      return { ...prev, locationId: primary?.id ?? "" };
    });
  }, [customerLocations]);

  const amountCents = dollarsToCents(form.amount) ?? 0;
  const taxCents = dollarsToCents(form.tax) ?? 0;
  const totalAmountCents = amountCents + taxCents;

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/invoices", {
        customerId: data.customerId,
        locationId: data.locationId,
        description: data.description || null,
        amountCents,
        taxCents,
        notes: data.notes || null,
        dueDate: data.dueDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Customer *</Label>
        <Select value={form.customerId} onValueChange={(v) => setForm((p) => ({ ...p, customerId: v, locationId: "" }))}>
          <SelectTrigger data-testid="select-inv-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
          <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Location *</Label>
        <Select value={form.locationId} onValueChange={(v) => setForm((p) => ({ ...p, locationId: v }))} disabled={!form.customerId || locationsLoading}>
          <SelectTrigger data-testid="select-inv-location">
            <SelectValue placeholder={!form.customerId ? "Select a customer first" : locationsLoading ? "Loading locations..." : "Select location"} />
          </SelectTrigger>
          <SelectContent>
            {customerLocations?.map((location) => (
              <SelectItem key={location.id} value={location.id}>{getLocationLabel(location)}{location.isPrimary ? " (primary)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.customerId && customerLocations && customerLocations.length === 0 ? (
          <p className="text-xs text-destructive">This customer has no location to bill. Add one on the customer screen first.</p>
        ) : (
          <p className="text-xs text-muted-foreground">The invoice lands on this location's Invoices tab and balance.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input placeholder="e.g., Cleanout fee, one-time treatment" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Amount *</Label>
          <Input type="number" step="0.01" data-testid="input-amount" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Tax</Label>
          <Input type="number" step="0.01" value={form.tax} onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Total</Label>
          <Input value={formatCents(totalAmountCents)} disabled />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Due Date</Label>
        <Input type="date" data-testid="input-due-date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="resize-none" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.customerId || !form.locationId || !form.amount} data-testid="button-save-invoice">
          {mutation.isPending ? "Creating..." : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}

function ReadyToBillSection({ invoices }: { invoices?: Invoice[] }) {
  const { toast } = useToast();
  const { data: readyRecords, isLoading } = useQuery<ServiceRecord[]>({ queryKey: ["/api/invoices/ready-for-billing"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });

  // A finalized visit that already has a DRAFT stays listed (D3); Generate
  // adopts and issues the draft rather than creating a second invoice, so the
  // button says which it will do.
  const draftByAppointmentId = new Map((invoices ?? []).filter((invoice) => invoice.status === "DRAFT" && invoice.appointmentId).map((invoice) => [invoice.appointmentId!, invoice]));

  const generateMutation = useMutation({
    mutationFn: (serviceRecordId: string) => apiRequest("POST", `/api/invoices/generate-from-service-record/${serviceRecordId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/ready-for-billing"] });
      toast({ title: "Invoice generated" });
    },
    onError: (err: Error) => toast({ title: "Unable to generate invoice", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  if (isLoading || !readyRecords?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2"><ReceiptText className="h-4 w-4" /> Ready to Bill</CardTitle>
        <p className="text-xs text-muted-foreground">Finalized service tickets awaiting an invoice. Tickets on the same appointment bill together as one visit invoice. Work on an agreement billed by its plan appears at $0; agreement work billed per visit is charged here. A visit that already has a draft invoice issues that draft.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {readyRecords.map((record) => {
          const customer = customers?.find((c) => c.id === record.customerId);
          const serviceType = serviceTypes?.find((st) => st.id === record.serviceTypeId);
          const draft = record.appointmentId ? draftByAppointmentId.get(record.appointmentId) : undefined;
          return (
            <div key={record.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3" data-testid={`card-ready-to-bill-${record.id}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{customer ? `${customer.firstName} ${customer.lastName}` : "Unknown customer"}</span>
                  {serviceType && <Badge variant="outline" className="text-xs">{serviceType.name}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(record.serviceDate).toLocaleDateString()}{record.technicianName ? ` • ${record.technicianName}` : ""}{draft ? ` • Draft ${draft.invoiceNumber}` : ""}</p>
              </div>
              <Button
                size="sm"
                onClick={() => generateMutation.mutate(record.id)}
                disabled={generateMutation.isPending}
                data-testid={`button-generate-invoice-${record.id}`}
              >
                {draft ? "Issue Draft Invoice" : "Generate Invoice"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// The Invoices screen (Pass 11a): a list. Each row is data plus "open" - the
// whole row opens the invoice modal, and the customer and location on it are
// links. Every act (document, issue, payment, void, credit memo, notes) lives
// in the modal; there is deliberately no quick action on the row (owner,
// PLAN_ROADMAP_V2.md Part E, decision 1). The open invoice is the URL:
// /invoices?invoiceId=<id> deep-links straight into the modal, and closing it
// clears the parameter.
export default function Invoices() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const openInvoiceId = useMemo(() => new URLSearchParams(searchString).get("invoiceId"), [searchString]);

  const { data: invoices, isLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  // Every row names its location (canon rule 1). A row with none is one of
  // the manual invoices from before the location was required - it is on no
  // location tab and in no location balance, and the row says so.
  const { data: allLocations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });
  const locationById = new Map((allLocations ?? []).map((location) => [location.id, location]));

  const openInvoice = (id: string) => navigate(`/invoices?invoiceId=${encodeURIComponent(id)}`);
  const closeInvoice = () => navigate("/invoices", { replace: true });

  const filtered = (invoices ?? []).filter((i) => {
    const cust = customers?.find((c) => c.id === i.customerId);
    const location = i.locationId ? locationById.get(i.locationId) : undefined;
    const text = `${cust?.firstName || ""} ${cust?.lastName || ""} ${i.invoiceNumber} ${location?.name || ""} ${location?.address || ""}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const status = isInvoiceOverdue(i) ? "OVERDUE" : i.status;
    const matchesStatus = filterStatus === "all" || status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // From the ledger rollups (D5): what is still owed, what has been collected
  // and counted, and how much of what is owed is past due.
  const totalOpenCents = filtered.filter((i) => isInvoiceIssued(i.status)).reduce((s, i) => s + i.balanceDueCents, 0);
  const totalPaidCents = filtered.filter((i) => isInvoiceIssued(i.status)).reduce((s, i) => s + i.amountPaidCents, 0);
  const totalOverdueCents = filtered.filter(isInvoiceOverdue).reduce((s, i) => s + i.balanceDueCents, 0);
  // Applied but not yet counted (D5: pending shows, confirmed counts). Part
  // of the Open figure until the payments behind it are confirmed.
  const totalPendingAppliedCents = filtered.filter((i) => isInvoiceIssued(i.status)).reduce((s, i) => s + i.pendingAppliedCents, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Invoices</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track payments and billing</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-invoice"><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
            <InvoiceForm onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-chart-3/10 flex items-center justify-center shrink-0"><Clock className="h-4 w-4 text-chart-3" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Open</p>
              <p className="text-lg font-bold" data-testid="text-total-pending">{formatCents(totalOpenCents)}</p>
              {totalPendingAppliedCents > 0 ? (
                <p className="text-xs text-muted-foreground" data-testid="text-total-pending-applied">{formatCents(totalPendingAppliedCents)} of it pending confirmation</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><CheckCircle className="h-4 w-4 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-bold" data-testid="text-total-paid">{formatCents(totalPaidCents)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center shrink-0"><AlertCircle className="h-4 w-4 text-destructive" /></div>
            <div><p className="text-xs text-muted-foreground">Overdue</p><p className="text-lg font-bold" data-testid="text-total-overdue">{formatCents(totalOverdueCents)}</p></div>
          </CardContent>
        </Card>
      </div>

      <ReadyToBillSection invoices={invoices} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-invoices" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-status"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="VOID">Void</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No invoices found</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first invoice</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((inv) => {
              const cust = customers?.find((c) => c.id === inv.customerId);
              const location = inv.locationId ? locationById.get(inv.locationId) : undefined;
              return (
                <Card
                  key={inv.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open invoice ${inv.invoiceNumber}`}
                  onClick={() => openInvoice(inv.id)}
                  onKeyDown={(e) => {
                    // Only the row itself: Enter on a link inside it is the link's.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openInvoice(inv.id);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`card-invoice-${inv.id}`}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <InvoiceStatusIcon invoice={inv} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{inv.invoiceNumber}</span>
                        <InvoiceStatusBadge invoice={inv} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <Link
                          href={`/customers/${inv.customerId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-foreground hover:underline"
                          data-testid={`link-invoice-customer-${inv.id}`}
                        >
                          {cust ? `${cust.firstName} ${cust.lastName}` : "Unknown"}
                        </Link>
                        {inv.locationId ? (
                          <Link
                            href={`/customers/${inv.customerId}?locationId=${inv.locationId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline"
                            data-testid={`link-invoice-location-${inv.id}`}
                          >
                            {location ? getLocationLabel(location) : "Location"}
                          </Link>
                        ) : (
                          <span className="text-destructive" title="Created before a location was required. It is on no location's Invoices tab and in no location balance." data-testid={`text-invoice-no-location-${inv.id}`}>No location</span>
                        )}
                        <span>{new Date(inv.issuedAt ?? inv.createdAt).toLocaleDateString()}</span>
                        {inv.dueDate && <span>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>}
                        {isInvoiceIssued(inv.status) && (inv.amountPaidCents > 0 || inv.pendingAppliedCents > 0) ? (
                          <span data-testid={`text-invoice-paid-${inv.id}`}>Paid {formatCents(inv.amountPaidCents)} - Balance {formatCents(inv.balanceDueCents)}</span>
                        ) : null}
                        {isInvoiceIssued(inv.status) && inv.pendingAppliedCents > 0 ? (
                          <span className="text-chart-3" data-testid={`text-invoice-pending-${inv.id}`}>{formatCents(inv.pendingAppliedCents)} pending confirmation</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-lg font-bold shrink-0">{formatCents(inv.totalAmountCents)}</span>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      <InvoiceDetailDialog
        invoiceId={openInvoiceId}
        open={!!openInvoiceId}
        onOpenChange={(next) => {
          if (!next) closeInvoice();
        }}
      />
    </div>
  );
}
