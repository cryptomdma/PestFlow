import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { formatCents } from "@shared/money";
import { can, PERMISSIONS } from "@shared/permissions";
import {
  CASH_CONFIRM_NOTE,
  MANUAL_PAYMENT_METHODS,
  formatPaymentMethod,
  formatPaymentStatus,
  mayConfirmPayment,
  needsCashAuthority,
  paymentHoldsValue,
  paymentListSearchParams,
  utcDayKey,
  type BatchConfirmResult,
  type CollectionsBucket,
  type CollectionsReport,
  type ConfirmAuthority,
  type PaymentListFilters,
  type PaymentListResult,
  type PaymentListRow,
  type PaymentMethod,
  type PaymentStatus,
} from "@shared/payments";
import { Banknote, CheckCircle2, Clock, HandCoins, Search, X } from "lucide-react";

// The Payments screen (PLAN_BILLING_V1_1.md D5, owner review of Pass 7.5,
// item 4): the org-wide list with server-side filters, the pending queue with
// batch confirmation, and the collections report. Confirm is gated by the
// same expression the location ledger panel and the review modal use
// (mayConfirmPayment); the server checks it again per payment.

const STATUS_OPTIONS: Array<{ value: "all" | PaymentStatus; label: string }> = [
  { value: "PENDING", label: "Pending confirmation" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "VOIDED", label: "Voided" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "all", label: "All statuses" },
];

interface FilterState {
  status: "all" | PaymentStatus;
  method: "all" | PaymentMethod;
  receivedFrom: string;
  receivedTo: string;
  collectedByUserId: "all" | string;
  search: string;
}

const DEFAULT_FILTERS: FilterState = { status: "PENDING", method: "all", receivedFrom: "", receivedTo: "", collectedByUserId: "all", search: "" };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toApiFilters(state: FilterState): PaymentListFilters {
  return {
    status: state.status === "all" ? undefined : [state.status],
    method: state.method === "all" ? undefined : [state.method],
    receivedFrom: DATE_KEY.test(state.receivedFrom) ? state.receivedFrom : undefined,
    receivedTo: DATE_KEY.test(state.receivedTo) ? state.receivedTo : undefined,
    collectedByUserId: state.collectedByUserId === "all" ? undefined : state.collectedByUserId,
    search: state.search,
  };
}

function paymentStatusClass(status: string) {
  switch (status) {
    case "CONFIRMED": return "bg-primary/10 text-primary";
    case "PENDING": return "bg-chart-3/10 text-chart-3";
    default: return "bg-muted text-muted-foreground";
  }
}

/** The schedule page reads its `date` param as a LOCAL calendar day, so the visit link carries the visit's local date. */
function localDateKey(instant: string) {
  const date = new Date(instant);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A UTC day key rendered as a calendar date, without the viewer's zone shifting it. */
function formatDayKey(key: string) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function describePaymentRow(row: PaymentListRow) {
  return `${formatPaymentMethod(row.method)} ${formatCents(row.amountCents)} - ${row.customerLabel}`;
}

function describeApplication(row: PaymentListRow) {
  if (!paymentHoldsValue(row.status)) return null;
  if (row.appliedCents <= 0) return "On the location balance";
  if (row.appliedCents >= row.amountCents) return "Applied to invoice";
  return `${formatCents(row.appliedCents)} applied, ${formatCents(row.amountCents - row.appliedCents)} on the location balance`;
}

function SummaryTile({ icon, label, cents, count, note, testId }: { icon: React.ReactNode; label: string; cents: number; count: number; note?: string; testId: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">{icon}</div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold" data-testid={testId}>{formatCents(cents)}</p>
            <p className="text-xs text-muted-foreground">{count === 1 ? "1 payment" : `${count} payments`}{note ? ` - ${note}` : ""}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface BatchOutcome {
  result: BatchConfirmResult;
  labels: Map<string, string>;
}

function PaymentsList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const authority: ConfirmAuthority = useMemo(
    () => ({ canConfirm: can(role, PERMISSIONS.CONFIRM_PAYMENT), canConfirmCash: can(role, PERMISSIONS.CONFIRM_CASH_PAYMENT) }),
    [role],
  );

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput })), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const query = paymentListSearchParams(toApiFilters(filters));
  const listKey = `/api/payments${query ? `?${query}` : ""}`;
  const { data, isLoading, isError, error } = useQuery<PaymentListResult>({ queryKey: [listKey] });
  const rows = data?.payments ?? [];

  const confirmable = useMemo(
    () => new Set(rows.filter((row) => mayConfirmPayment(row, authority)).map((row) => row.id)),
    [rows, authority],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Only ids that are still confirmable count: a row that confirmed elsewhere
  // or dropped out of the filter is never sent twice.
  const selectedIds = useMemo(() => Array.from(selected).filter((id) => confirmable.has(id)), [selected, confirmable]);
  const headerState: boolean | "indeterminate" = confirmable.size > 0 && selectedIds.length === confirmable.size ? true : selectedIds.length > 0 ? "indeterminate" : false;

  const [lastBatch, setLastBatch] = useState<BatchOutcome | null>(null);
  const batchMutation = useMutation({
    mutationFn: async (paymentIds: string[]) => {
      const labels = new Map(rows.filter((row) => paymentIds.includes(row.id)).map((row) => [row.id, describePaymentRow(row)]));
      const response = await apiRequest("POST", "/api/payments/confirm-batch", { paymentIds });
      return { result: (await response.json()) as BatchConfirmResult, labels };
    },
    onSuccess: (outcome) => {
      invalidateInvoiceViews();
      setSelected(new Set());
      setLastBatch(outcome);
      const confirmedCents = outcome.result.confirmed.reduce((sum, payment) => sum + payment.amountCents, 0);
      toast({
        title: `${outcome.result.confirmed.length} confirmed (${formatCents(confirmedCents)})${outcome.result.skipped.length ? `, ${outcome.result.skipped.length} skipped` : ""}`,
        description: outcome.result.skipped.length ? "The skipped payments and why are listed above the table." : "They now count toward every invoice they are applied to.",
      });
    },
    onError: (err: Error) => toast({ title: "Unable to confirm", description: getApiErrorMessage(err), variant: "destructive" }),
  });

  const isFiltered = filters.status !== DEFAULT_FILTERS.status || filters.method !== "all" || !!filters.receivedFrom || !!filters.receivedTo || filters.collectedByUserId !== "all" || !!filters.search;
  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
  };

  const summary = data?.summary;
  const confirmedBatchCents = lastBatch?.result.confirmed.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {summary ? (
          <>
            <SummaryTile icon={<Clock className="h-5 w-5 text-chart-3" />} label="Pending confirmation" cents={summary.pendingCents} count={summary.pendingCount} testId="text-summary-pending" />
            <SummaryTile icon={<HandCoins className="h-5 w-5 text-chart-3" />} label="Pending cash" cents={summary.pendingCashCents} count={summary.pendingCashCount} note="confirmed by a manager or admin" testId="text-summary-pending-cash" />
            <SummaryTile icon={<CheckCircle2 className="h-5 w-5 text-primary" />} label="Confirmed" cents={summary.confirmedCents} count={summary.confirmedCount} testId="text-summary-confirmed" />
          </>
        ) : (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Totals cover every status for the range, collector, method and search in view; the status filter only changes which rows are listed.</p>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value as FilterState["status"] }))}>
                <SelectTrigger data-testid="select-payment-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={filters.method} onValueChange={(value) => setFilters((current) => ({ ...current, method: value as FilterState["method"] }))}>
                <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {MANUAL_PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{formatPaymentMethod(method)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Received from</Label>
              <Input type="date" value={filters.receivedFrom} max={filters.receivedTo || undefined} onChange={(e) => setFilters((current) => ({ ...current, receivedFrom: e.target.value }))} data-testid="input-received-from" />
            </div>
            <div className="space-y-1.5">
              <Label>Received to</Label>
              <Input type="date" value={filters.receivedTo} min={filters.receivedFrom || undefined} onChange={(e) => setFilters((current) => ({ ...current, receivedTo: e.target.value }))} data-testid="input-received-to" />
            </div>
            <div className="space-y-1.5">
              <Label>Collected by</Label>
              <Select value={filters.collectedByUserId} onValueChange={(value) => setFilters((current) => ({ ...current, collectedByUserId: value }))}>
                <SelectTrigger data-testid="select-payment-collector"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Anyone</SelectItem>
                  {(data?.collectors ?? []).map((collector) => <SelectItem key={collector.userId} value={collector.userId}>{collector.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Customer, location, check #, memo" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} data-testid="input-payment-search" />
              </div>
            </div>
          </div>
          {isFiltered ? (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters} data-testid="button-clear-payment-filters">Back to the pending queue</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {lastBatch ? (
        <div className="rounded-md border p-3 text-sm" data-testid="panel-batch-result">
          <div className="flex items-start justify-between gap-2">
            <p>
              <span className="font-medium">{lastBatch.result.confirmed.length} confirmed</span> ({formatCents(confirmedBatchCents)})
              {lastBatch.result.skipped.length ? `, ${lastBatch.result.skipped.length} skipped:` : "."}
            </p>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setLastBatch(null)} aria-label="Dismiss" data-testid="button-dismiss-batch-result"><X className="h-3.5 w-3.5" /></Button>
          </div>
          {lastBatch.result.skipped.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {lastBatch.result.skipped.map((entry) => (
                <li key={entry.id} data-testid={`text-batch-skipped-${entry.id}`}>{lastBatch.labels.get(entry.id) ?? entry.id} - {entry.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4" /> {filters.status === "PENDING" ? "Pending confirmation queue" : "Payments"}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data ? (data.total > rows.length ? `Showing the newest ${rows.length} of ${data.total}. Narrow the filters to see the rest.` : `${data.total} ${data.total === 1 ? "payment" : "payments"}`) : "Loading..."}
            </p>
          </div>
          {authority.canConfirm ? (
            <Button size="sm" onClick={() => batchMutation.mutate(selectedIds)} disabled={selectedIds.length === 0 || batchMutation.isPending} data-testid="button-batch-confirm">
              {batchMutation.isPending ? "Confirming..." : `Batch Confirm${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : isError ? (
            <p className="p-4 text-sm text-destructive" data-testid="text-payments-error">Payments could not be loaded: {getApiErrorMessage(error)}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center" data-testid="text-payments-empty">
              {filters.status === "PENDING" && !isFiltered ? "Nothing is waiting for confirmation." : "No payments match these filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 w-10 pl-4">
                    {confirmable.size > 0 ? (
                      <Checkbox
                        checked={headerState}
                        onCheckedChange={(value) => setSelected(value === true ? new Set(confirmable) : new Set())}
                        aria-label="Select every payment you can confirm"
                        data-testid="checkbox-select-all-confirmable"
                      />
                    ) : null}
                  </TableHead>
                  <TableHead className="h-9">Received</TableHead>
                  <TableHead className="h-9">Customer / location</TableHead>
                  <TableHead className="h-9">Method</TableHead>
                  <TableHead className="h-9 text-right">Amount</TableHead>
                  <TableHead className="h-9">Status</TableHead>
                  <TableHead className="h-9">Collected by</TableHead>
                  <TableHead className="h-9">Visit</TableHead>
                  <TableHead className="h-9 w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const received = new Date(row.receivedAt);
                  const application = describeApplication(row);
                  const canConfirmRow = confirmable.has(row.id);
                  return (
                    <TableRow key={row.id} data-state={selected.has(row.id) && canConfirmRow ? "selected" : undefined} data-testid={`row-payment-${row.id}`}>
                      <TableCell className="py-2 pl-4">
                        {canConfirmRow ? (
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={(value) => setSelected((current) => {
                              const next = new Set(current);
                              if (value === true) next.add(row.id); else next.delete(row.id);
                              return next;
                            })}
                            aria-label={`Select ${describePaymentRow(row)}`}
                            data-testid={`checkbox-payment-${row.id}`}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <div>{received.toLocaleDateString()}</div>
                        <div className="text-xs text-muted-foreground">{received.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Link href={`/customers/${row.customerId}?locationId=${row.locationId}`} className="font-medium hover:underline" data-testid={`link-payment-location-${row.id}`}>{row.customerLabel}</Link>
                        <div className="text-xs text-muted-foreground">{row.locationName}{row.locationAddress ? ` - ${row.locationAddress}` : ""}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div>{formatPaymentMethod(row.method)}{row.checkNumber ? ` #${row.checkNumber}` : ""}{row.referenceNumber ? ` (${row.referenceNumber})` : ""}</div>
                        {row.memo ? <div className="text-xs text-muted-foreground max-w-[16rem] truncate" title={row.memo}>{row.memo}</div> : null}
                      </TableCell>
                      <TableCell className="py-2 text-right font-semibold whitespace-nowrap" data-testid={`text-payment-amount-${row.id}`}>{formatCents(row.amountCents)}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="secondary" className={`text-xs ${paymentStatusClass(row.status)}`}>{formatPaymentStatus(row.status)}</Badge>
                        {application ? <div className="text-xs text-muted-foreground mt-0.5">{application}</div> : null}
                        {row.status === "VOIDED" && row.voidReason ? <div className="text-xs text-muted-foreground mt-0.5">Voided: {row.voidReason}</div> : null}
                        {row.status === "REFUNDED" && row.refundReason ? <div className="text-xs text-muted-foreground mt-0.5">Refunded: {row.refundReason}</div> : null}
                        {needsCashAuthority(row, authority) ? <div className="text-xs text-muted-foreground mt-0.5">{CASH_CONFIRM_NOTE}</div> : null}
                      </TableCell>
                      <TableCell className="py-2">
                        <div>{row.collectedByLabel ?? "Not recorded"}</div>
                        {row.status === "CONFIRMED" && row.confirmedByLabel ? (
                          <div className="text-xs text-muted-foreground">Confirmed by {row.confirmedByLabel}{row.confirmedAt ? ` ${new Date(row.confirmedAt).toLocaleDateString()}` : ""}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        {row.appointmentId && row.appointmentScheduledAt ? (
                          <Link href={`/schedule?appointmentId=${row.appointmentId}&date=${localDateKey(row.appointmentScheduledAt)}`} className="hover:underline" data-testid={`link-payment-visit-${row.id}`}>
                            {new Date(row.appointmentScheduledAt).toLocaleDateString()}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground" title="Not linked to a visit">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        {canConfirmRow ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchMutation.mutate([row.id])} disabled={batchMutation.isPending} data-testid={`button-confirm-payment-${row.id}`}>Confirm</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BucketTable({ title, column, buckets, totals, labelFor, testId }: {
  title: string;
  column: string;
  buckets: CollectionsBucket[];
  totals: CollectionsReport["totals"];
  labelFor?: (bucket: CollectionsBucket) => string;
  testId: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {buckets.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing collected.</p>
        ) : (
          <Table data-testid={testId}>
            <TableHeader>
              <TableRow>
                <TableHead className="h-9 pl-4">{column}</TableHead>
                <TableHead className="h-9 text-right">Confirmed</TableHead>
                <TableHead className="h-9 text-right">Pending</TableHead>
                <TableHead className="h-9 text-right pr-4">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((bucket) => (
                <TableRow key={bucket.key} data-testid={`${testId}-${bucket.key || "none"}`}>
                  <TableCell className="py-2 pl-4">
                    <div>{labelFor ? labelFor(bucket) : bucket.label}</div>
                    <div className="text-xs text-muted-foreground">{bucket.confirmedCount + bucket.pendingCount === 1 ? "1 payment" : `${bucket.confirmedCount + bucket.pendingCount} payments`}</div>
                  </TableCell>
                  <TableCell className="py-2 text-right whitespace-nowrap">{formatCents(bucket.confirmedCents)}</TableCell>
                  <TableCell className="py-2 text-right whitespace-nowrap text-muted-foreground">{formatCents(bucket.pendingCents)}</TableCell>
                  <TableCell className="py-2 text-right whitespace-nowrap font-semibold pr-4">{formatCents(bucket.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="py-2 pl-4">Total</TableCell>
                <TableCell className="py-2 text-right whitespace-nowrap">{formatCents(totals.confirmedCents)}</TableCell>
                <TableCell className="py-2 text-right whitespace-nowrap text-muted-foreground">{formatCents(totals.pendingCents)}</TableCell>
                <TableCell className="py-2 text-right whitespace-nowrap pr-4">{formatCents(totals.totalCents)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function shiftUtcDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDayKey(date);
}

function CollectionsReportView() {
  const today = utcDayKey(new Date());
  const [range, setRange] = useState({ receivedFrom: today, receivedTo: today });
  const valid = DATE_KEY.test(range.receivedFrom) && DATE_KEY.test(range.receivedTo) && range.receivedFrom <= range.receivedTo;
  const { data, isLoading, isError, error } = useQuery<CollectionsReport>({
    queryKey: [`/api/payments/collections?receivedFrom=${range.receivedFrom}&receivedTo=${range.receivedTo}`],
    enabled: valid,
  });

  const quickRanges = [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: shiftUtcDays(today, -6), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={range.receivedFrom} max={range.receivedTo || undefined} onChange={(e) => setRange((current) => ({ ...current, receivedFrom: e.target.value }))} data-testid="input-collections-from" />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={range.receivedTo} min={range.receivedFrom || undefined} onChange={(e) => setRange((current) => ({ ...current, receivedTo: e.target.value }))} data-testid="input-collections-to" />
            </div>
            <div className="flex gap-1.5">
              {quickRanges.map((quick) => (
                <Button
                  key={quick.label}
                  variant={range.receivedFrom === quick.from && range.receivedTo === quick.to ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRange({ receivedFrom: quick.from, receivedTo: quick.to })}
                  data-testid={`button-collections-${quick.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {quick.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Days are UTC calendar days, the same clock the billing run and every other date in PestFlow keep. Pending money is listed against confirmed; voided and refunded payments are counted as excluded and never summed.
          </p>
        </CardContent>
      </Card>

      {!valid ? (
        <p className="text-sm text-muted-foreground">Pick a from date on or before the to date.</p>
      ) : isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
      ) : isError || !data ? (
        <p className="text-sm text-destructive" data-testid="text-collections-error">The report could not be loaded: {getApiErrorMessage(error)}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryTile icon={<CheckCircle2 className="h-5 w-5 text-primary" />} label="Confirmed" cents={data.totals.confirmedCents} count={data.totals.confirmedCount} testId="text-collections-confirmed" />
            <SummaryTile icon={<Clock className="h-5 w-5 text-chart-3" />} label="Pending confirmation" cents={data.totals.pendingCents} count={data.totals.pendingCount} testId="text-collections-pending" />
            <SummaryTile icon={<Banknote className="h-5 w-5 text-primary" />} label="Total collected" cents={data.totals.totalCents} count={data.totals.confirmedCount + data.totals.pendingCount} note={`${formatDayKey(data.receivedFrom)}${data.receivedFrom === data.receivedTo ? "" : ` to ${formatDayKey(data.receivedTo)}`}`} testId="text-collections-total" />
          </div>
          {data.totals.excludedCount > 0 ? (
            <p className="text-xs text-muted-foreground -mt-2" data-testid="text-collections-excluded">
              {data.totals.excludedCount === 1 ? "1 voided or refunded payment" : `${data.totals.excludedCount} voided or refunded payments`} ({formatCents(data.totals.excludedCents)}) in this range {data.totals.excludedCount === 1 ? "is" : "are"} not counted.
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <BucketTable title="By day" column="Day" buckets={data.byDay} totals={data.totals} labelFor={(bucket) => formatDayKey(bucket.key)} testId="table-collections-by-day" />
            <BucketTable title="By collector" column="Collected by" buckets={data.byCollector} totals={data.totals} testId="table-collections-by-collector" />
            <BucketTable title="By method" column="Method" buckets={data.byMethod} totals={data.totals} testId="table-collections-by-method" />
          </div>
        </>
      )}
    </div>
  );
}

export default function Payments() {
  const [view, setView] = useState<"payments" | "collections">("payments");
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Payments</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Every payment recorded across the organization. Cash and checks post pending and count toward an invoice once the office confirms them.</p>
      </div>
      <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
        <TabsList>
          <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
          <TabsTrigger value="collections" data-testid="tab-collections">Collections report</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4"><PaymentsList /></TabsContent>
        <TabsContent value="collections" className="mt-4"><CollectionsReportView /></TabsContent>
      </Tabs>
    </div>
  );
}
