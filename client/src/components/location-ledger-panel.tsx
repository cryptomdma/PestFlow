import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { can, PERMISSIONS } from "@shared/permissions";
import { centsToDollarString, dollarsToCents, formatCents } from "@shared/money";
import { isInvoiceIssued } from "@shared/invoice-status";
import {
  CREDIT_MEMO_REASON_CODES,
  formatCreditMemoReason,
  formatPaymentMethod,
  formatPaymentStatus,
  paymentHoldsValue,
  type LocationLedgerSummary,
} from "@shared/payments";
import type { Agreement, CreditApplication, CreditMemo, Invoice, Payment, PaymentApplication } from "@shared/schema";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { ApplyLocationBalancePrompt } from "@/components/apply-location-balance-prompt";
import { DollarSign, ReceiptText } from "lucide-react";

// PLAN_BILLING_V1_1.md D5 / D4: the location's ledger, on its Invoices tab.
// Balances at the top (open, on account, pending), then every payment and
// credit memo at the location with the lifecycle acts each role may take
// (confirm / apply / void / refund), then the invoice list the tab already
// had, each row with its paid / due figures and its applications.

/** Mirrors InvoiceLedger (server/storage.ts). */
interface InvoiceLedgerResponse {
  invoice: Invoice;
  paymentApplications: Array<{ application: PaymentApplication; payment: Payment }>;
  creditApplications: Array<{ application: CreditApplication; creditMemo: CreditMemo }>;
}

function formatDate(value: string | Date | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "";
}

function paymentStatusClass(status: string) {
  switch (status) {
    case "CONFIRMED": return "bg-primary/10 text-primary";
    case "PENDING": return "bg-chart-3/10 text-chart-3";
    default: return "bg-muted text-muted-foreground";
  }
}

// A one-line reason, required by every release / void / refund (D5).
function ReasonDialog({
  title,
  description,
  confirmLabel,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) { onOpenChange(next); if (!next) setReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="space-y-1.5">
          <Label>Reason *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="resize-none" rows={2} data-testid="input-ledger-reason" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button type="button" onClick={() => onConfirm(reason)} disabled={!reason.trim() || isPending} data-testid="button-ledger-reason-confirm">
            {isPending ? "Working..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Apply one source (a payment or a credit memo) to one of the location's open
// invoices, for an explicit amount. The greedy "apply location balance" on
// an invoice row is the other way round; both land as the same ledger rows.
function ApplySourceDialog({
  source,
  invoices,
  onOpenChange,
}: {
  source: { kind: "payment" | "credit_memo"; id: string; label: string; unappliedCents: number } | null;
  invoices: Invoice[];
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const openInvoices = invoices.filter((invoice) => isInvoiceIssued(invoice.status) && invoice.balanceDueCents > 0);
  const selected = openInvoices.find((invoice) => invoice.id === invoiceId);
  const amountCents = dollarsToCents(amount);

  const mutation = useMutation({
    mutationFn: async () => {
      const path = source!.kind === "payment" ? `/api/payments/${source!.id}/apply` : `/api/credit-memos/${source!.id}/apply`;
      const response = await apiRequest("POST", path, { invoiceId, amountCents });
      return (await response.json()) as { invoice: Invoice };
    },
    onSuccess: ({ invoice }) => {
      invalidateInvoiceViews();
      toast({ title: `${formatCents(amountCents ?? 0)} applied to ${invoice.invoiceNumber}`, description: `${formatCents(invoice.balanceDueCents)} still due.` });
      onOpenChange(false);
      setInvoiceId("");
      setAmount("");
    },
    onError: (error: Error) => toast({ title: "Unable to apply", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <Dialog open={!!source} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Apply {source?.label} to an invoice</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{formatCents(source?.unappliedCents ?? 0)} unapplied. Applying more than an invoice can take is refused; the remainder stays on the location balance.</p>
        {openInvoices.length === 0 ? (
          <p className="text-sm">This location has no open invoices to apply against.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Invoice</Label>
              <Select
                value={invoiceId}
                onValueChange={(id) => {
                  setInvoiceId(id);
                  const invoice = openInvoices.find((candidate) => candidate.id === id);
                  if (invoice && source) setAmount(centsToDollarString(Math.min(invoice.balanceDueCents, source.unappliedCents)));
                }}
              >
                <SelectTrigger data-testid="select-apply-invoice"><SelectValue placeholder="Choose an open invoice" /></SelectTrigger>
                <SelectContent>
                  {openInvoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {formatCents(invoice.balanceDueCents)} due</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-apply-amount" />
              {selected ? <p className="text-xs text-muted-foreground">Up to {formatCents(Math.min(selected.balanceDueCents, source?.unappliedCents ?? 0))}.</p> : null}
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={!invoiceId || !amountCents || amountCents <= 0 || mutation.isPending} data-testid="button-apply-source">
            {mutation.isPending ? "Applying..." : "Apply"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IssueCreditMemoDialog({
  open,
  onOpenChange,
  locationId,
  invoices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  invoices: Invoice[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ reasonCode: "BILLING_ERROR", reason: "", amount: "", invoiceId: "NONE", applyNow: true });
  const openInvoices = invoices.filter((invoice) => isInvoiceIssued(invoice.status) && invoice.balanceDueCents > 0);
  const amountCents = dollarsToCents(form.amount);

  const mutation = useMutation({
    mutationFn: async () => {
      const invoiceId = form.invoiceId === "NONE" ? null : form.invoiceId;
      const response = await apiRequest("POST", "/api/credit-memos", {
        locationId,
        invoiceId,
        reasonCode: form.reasonCode,
        reason: form.reason,
        amountCents,
        applyToInvoiceId: invoiceId && form.applyNow ? invoiceId : null,
      });
      return (await response.json()) as { creditMemo: CreditMemo; invoice: Invoice | null; application: CreditApplication | null };
    },
    onSuccess: (result) => {
      invalidateInvoiceViews();
      toast({
        title: `Credit memo of ${formatCents(result.creditMemo.amountCents)} issued`,
        description: result.application && result.invoice
          ? `${formatCents(result.application.amountCents)} applied to ${result.invoice.invoiceNumber}; ${formatCents(result.invoice.balanceDueCents)} still due.`
          : "On the location balance, unapplied.",
      });
      onOpenChange(false);
      setForm({ reasonCode: "BILLING_ERROR", reason: "", amount: "", invoiceId: "NONE", applyNow: true });
    },
    onError: (error: Error) => toast({ title: "Unable to issue the credit memo", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Issue credit memo</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">The ledger's correction mechanism. It never changes an invoice's price; it is applied against what is owed, like a payment.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reason code</Label>
            <Select value={form.reasonCode} onValueChange={(reasonCode) => setForm((prev) => ({ ...prev, reasonCode }))}>
              <SelectTrigger data-testid="select-credit-reason-code"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREDIT_MEMO_REASON_CODES.map((code) => <SelectItem key={code} value={code}>{formatCreditMemoReason(code)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount ($) *</Label>
            <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} data-testid="input-credit-amount" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reason *</Label>
          <Textarea value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} className="resize-none" rows={2} data-testid="input-credit-reason" />
        </div>
        <div className="space-y-1.5">
          <Label>Corrects invoice</Label>
          <Select value={form.invoiceId} onValueChange={(invoiceId) => setForm((prev) => ({ ...prev, invoiceId }))}>
            <SelectTrigger data-testid="select-credit-invoice"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No specific invoice</SelectItem>
              {openInvoices.map((invoice) => (
                <SelectItem key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {formatCents(invoice.balanceDueCents)} due</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.invoiceId !== "NONE" ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={form.applyNow} onChange={(e) => setForm((prev) => ({ ...prev, applyNow: e.target.checked }))} />
              Apply it to that invoice now
            </label>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={!amountCents || amountCents <= 0 || !form.reason.trim() || mutation.isPending} data-testid="button-issue-credit-memo">
            {mutation.isPending ? "Issuing..." : "Issue Credit Memo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Everything applied to one invoice, with Release on the live rows.
function InvoiceApplications({ invoice }: { invoice: Invoice }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canApply = can(user?.role ?? "", PERMISSIONS.APPLY_PAYMENT);
  const { data: ledger } = useQuery<InvoiceLedgerResponse>({ queryKey: ["/api/invoices", invoice.id, "ledger"] });
  const [release, setRelease] = useState<{ kind: "payment" | "credit_memo"; applicationId: string; label: string } | null>(null);

  const releaseMutation = useMutation({
    mutationFn: async ({ kind, applicationId, reason }: { kind: "payment" | "credit_memo"; applicationId: string; reason: string }) => {
      const path = kind === "payment" ? "/api/payment-applications/release" : "/api/credit-applications/release";
      const response = await apiRequest("POST", path, { applicationId, reason });
      return (await response.json()) as { invoice: Invoice };
    },
    onSuccess: ({ invoice: updated }) => {
      invalidateInvoiceViews();
      toast({ title: `Released from ${updated.invoiceNumber}`, description: `${formatCents(updated.balanceDueCents)} now due; the money is back on the location balance.` });
      setRelease(null);
    },
    onError: (error: Error) => toast({ title: "Unable to release", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const rows = [
    ...(ledger?.paymentApplications ?? []).map(({ application, payment }) => ({
      kind: "payment" as const,
      application,
      label: `${formatPaymentMethod(payment.method)} payment${payment.checkNumber ? ` #${payment.checkNumber}` : ""}`,
      status: payment.status,
      counted: payment.status === "CONFIRMED",
    })),
    ...(ledger?.creditApplications ?? []).map(({ application, creditMemo }) => ({
      kind: "credit_memo" as const,
      application,
      label: `Credit memo (${formatCreditMemoReason(creditMemo.reasonCode)})`,
      status: creditMemo.status,
      counted: creditMemo.status === "ISSUED",
    })),
  ].sort((a, b) => new Date(a.application.appliedAt).getTime() - new Date(b.application.appliedAt).getTime());

  if (!ledger) return null;
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing applied to this invoice yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map(({ kind, application, label, status, counted }) => (
        <div key={`${kind}-${application.id}`} className={`flex items-center justify-between gap-2 text-xs ${application.released ? "text-muted-foreground line-through" : ""}`} data-testid={`row-application-${application.id}`}>
          <span>
            {label} - {formatCents(application.amountCents)} on {formatDate(application.appliedAt)}
            {!application.released && !counted ? ` (${formatPaymentStatus(status).toLowerCase()} - not yet counted)` : ""}
            {application.released ? ` - released ${formatDate(application.releasedAt)}: ${application.releaseReason}` : ""}
          </span>
          {!application.released && canApply ? (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setRelease({ kind, applicationId: application.id, label })} data-testid={`button-release-${application.id}`}>Release</Button>
          ) : null}
        </div>
      ))}
      <ReasonDialog
        title={`Release ${release?.label ?? ""} from ${invoice.invoiceNumber}?`}
        description="The application stays on the record as released; the money returns to the location's unapplied balance and the invoice's balance due goes back up."
        confirmLabel="Release"
        open={!!release}
        onOpenChange={(open) => !open && setRelease(null)}
        onConfirm={(reason) => release && releaseMutation.mutate({ ...release, reason })}
        isPending={releaseMutation.isPending}
      />
    </div>
  );
}

export function InvoiceRowLedger({
  invoice,
  locationId,
  agreements,
  unappliedCents,
}: {
  invoice: Invoice;
  locationId: string;
  agreements?: Agreement[];
  /** The location's unapplied balance (confirmed + pending), for the Apply balance affordance. */
  unappliedCents: number;
}) {
  const { user } = useAuth();
  const canRecord = can(user?.role ?? "", PERMISSIONS.TAKE_PAYMENT_FIELD);
  const canApply = can(user?.role ?? "", PERMISSIONS.APPLY_PAYMENT);
  const [recordOpen, setRecordOpen] = useState(false);
  const [applyInvoice, setApplyInvoice] = useState<Invoice | null>(null);
  const [showApplications, setShowApplications] = useState(false);
  const issued = isInvoiceIssued(invoice.status);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        {issued ? (
          <span data-testid={`text-invoice-balance-${invoice.id}`}>
            Paid {formatCents(invoice.amountPaidCents)} - Due {formatCents(invoice.balanceDueCents)}
            {invoice.pendingAppliedCents > 0 ? (
              <span className="text-chart-3" data-testid={`text-invoice-pending-${invoice.id}`}> - {formatCents(invoice.pendingAppliedCents)} pending confirmation</span>
            ) : null}
          </span>
        ) : (
          <span>{invoice.status === "DRAFT" ? "Draft - not a receivable until issued" : "Voided - nothing owed"}</span>
        )}
        {issued ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowApplications((prev) => !prev)} data-testid={`button-toggle-applications-${invoice.id}`}>
            {showApplications ? "Hide applications" : "Applications"}
          </Button>
        ) : null}
        {issued && invoice.balanceDueCents > 0 && canRecord ? (
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setRecordOpen(true)} data-testid={`button-record-payment-${invoice.id}`}>
            <DollarSign className="h-3 w-3 mr-1" /> Record Payment
          </Button>
        ) : null}
        {issued && invoice.balanceDueCents > 0 && canApply && unappliedCents > 0 ? (
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setApplyInvoice(invoice)} data-testid={`button-apply-balance-${invoice.id}`}>
            Apply location balance
          </Button>
        ) : null}
      </div>
      {showApplications ? <InvoiceApplications invoice={invoice} /> : null}
      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} locationId={locationId} invoice={invoice} agreements={agreements} />
      <ApplyLocationBalancePrompt invoice={applyInvoice} onClose={() => setApplyInvoice(null)} />
    </div>
  );
}

export function LocationLedgerPanel({
  locationId,
  invoices,
  agreements,
}: {
  locationId: string;
  invoices: Invoice[];
  agreements?: Agreement[];
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const canRecord = can(role, PERMISSIONS.TAKE_PAYMENT_FIELD);
  const canApply = can(role, PERMISSIONS.APPLY_PAYMENT);
  const canConfirm = can(role, PERMISSIONS.CONFIRM_PAYMENT);
  const canConfirmCash = can(role, PERMISSIONS.CONFIRM_CASH_PAYMENT);
  const canVoid = can(role, PERMISSIONS.VOID_PAYMENT);
  const canRefund = can(role, PERMISSIONS.REFUND_PAYMENT);
  const canCredit = can(role, PERMISSIONS.ISSUE_CREDIT_MEMO);

  const { data: summary } = useQuery<LocationLedgerSummary>({ queryKey: ["/api/locations", locationId, "ledger-summary"], enabled: !!locationId });
  const { data: locationPayments } = useQuery<Payment[]>({ queryKey: ["/api/payments/by-location", locationId], enabled: !!locationId });
  const { data: locationCredits } = useQuery<CreditMemo[]>({ queryKey: ["/api/credit-memos/by-location", locationId], enabled: !!locationId });

  const unappliedById = useMemo(() => new Map((summary?.sources ?? []).map((source) => [source.id, source.unappliedCents])), [summary]);
  const agreementNameById = useMemo(() => new Map((agreements ?? []).map((agreement) => [agreement.id, agreement.agreementName])), [agreements]);
  // Pending money that has already been applied leaves the unapplied Pending
  // figure; the stored rollup keeps it visible here (D5 owner review, item 3).
  const pendingAppliedCents = useMemo(
    () => invoices.filter((invoice) => isInvoiceIssued(invoice.status)).reduce((sum, invoice) => sum + invoice.pendingAppliedCents, 0),
    [invoices],
  );

  const [recordOpen, setRecordOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [applySource, setApplySource] = useState<{ kind: "payment" | "credit_memo"; id: string; label: string; unappliedCents: number } | null>(null);
  const [reasonAct, setReasonAct] = useState<{ kind: "void_payment" | "refund_payment" | "void_credit"; id: string; label: string } | null>(null);

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

  const reasonMutation = useMutation({
    mutationFn: async ({ kind, id, reason }: { kind: "void_payment" | "refund_payment" | "void_credit"; id: string; reason: string }) => {
      const path = kind === "void_payment" ? `/api/payments/${id}/void` : kind === "refund_payment" ? `/api/payments/${id}/refund` : `/api/credit-memos/${id}/void`;
      const response = await apiRequest("POST", path, { reason });
      return response.json();
    },
    onSuccess: (_result, variables) => {
      invalidateInvoiceViews();
      toast({ title: variables.kind === "refund_payment" ? "Payment refunded" : variables.kind === "void_payment" ? "Payment voided" : "Credit memo voided" });
      setReasonAct(null);
    },
    onError: (error: Error) => toast({ title: "Unable to complete", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const reasonCopy = reasonAct?.kind === "refund_payment"
    ? { title: `Refund ${reasonAct.label}?`, description: "Records that the money was returned to the customer. Only an unapplied, confirmed payment can be refunded - release it from any invoice first.", confirm: "Record Refund" }
    : reasonAct?.kind === "void_payment"
      ? { title: `Void ${reasonAct.label}?`, description: "For a payment recorded in error. It must hold no applications - release them first. The record stays, marked voided.", confirm: "Void Payment" }
      : { title: `Void ${reasonAct?.label ?? "credit memo"}?`, description: "It must hold no applications - release them first. The record stays, marked voided.", confirm: "Void Credit Memo" };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2"><ReceiptText className="h-4 w-4" /> Balance</CardTitle>
            <div className="flex items-center gap-2">
              {canRecord ? (
                <Button size="sm" variant="outline" onClick={() => setRecordOpen(true)} data-testid="button-record-location-payment">
                  <DollarSign className="h-3 w-3 mr-1" /> Record Payment
                </Button>
              ) : null}
              {canCredit ? (
                <Button size="sm" variant="outline" onClick={() => setCreditOpen(true)} data-testid="button-issue-credit-memo-open">Issue Credit Memo</Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open balance</p>
            <p className="mt-1 text-lg font-bold" data-testid="text-ledger-open-balance">{formatCents(summary?.openBalanceCents ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Due across issued invoices</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On account</p>
            <p className="mt-1 text-lg font-bold" data-testid="text-ledger-unapplied-confirmed">{formatCents(summary?.unappliedConfirmedCents ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Confirmed payments and credit memos not yet applied</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
            <p className="mt-1 text-lg font-bold" data-testid="text-ledger-unapplied-pending">{formatCents(summary?.unappliedPendingCents ?? 0)}</p>
            <p className="text-xs text-muted-foreground">Recorded, awaiting office confirmation, not yet applied</p>
            {pendingAppliedCents > 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-ledger-pending-applied">+ {formatCents(pendingAppliedCents)} applied to invoices, awaiting confirmation</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {(locationPayments && locationPayments.length > 0) || (locationCredits && locationCredits.length > 0) ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payments and credits</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(locationPayments ?? []).map((payment) => {
              const unapplied = unappliedById.get(payment.id) ?? 0;
              const live = paymentHoldsValue(payment.status);
              const label = `${formatPaymentMethod(payment.method)} payment of ${formatCents(payment.amountCents)}`;
              const mayConfirm = payment.status === "PENDING" && canConfirm && (payment.method !== "CASH" || canConfirmCash);
              return (
                <div key={payment.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2" data-testid={`row-payment-${payment.id}`}>
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{formatPaymentMethod(payment.method)}{payment.checkNumber ? ` #${payment.checkNumber}` : ""}{payment.referenceNumber ? ` (${payment.referenceNumber})` : ""}</span>
                      <span className="font-semibold">{formatCents(payment.amountCents)}</span>
                      <Badge variant="secondary" className={`text-xs ${paymentStatusClass(payment.status)}`}>{formatPaymentStatus(payment.status)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Received {formatDate(payment.receivedAt)}{payment.collectedByLabel ? ` by ${payment.collectedByLabel}` : ""}
                      {live ? ` - ${formatCents(unapplied)} unapplied` : ""}
                      {payment.designatedAgreementId ? ` - for ${agreementNameById.get(payment.designatedAgreementId) ?? "an agreement"}` : ""}
                      {payment.status === "VOIDED" && payment.voidReason ? ` - voided: ${payment.voidReason}` : ""}
                      {payment.status === "REFUNDED" && payment.refundReason ? ` - refunded: ${payment.refundReason}` : ""}
                      {payment.memo ? ` - ${payment.memo}` : ""}
                    </p>
                    {payment.status === "PENDING" && payment.method === "CASH" && canConfirm && !canConfirmCash ? (
                      <p className="text-xs text-muted-foreground">Cash is confirmed by a manager or admin.</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {mayConfirm ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => confirmMutation.mutate(payment.id)} disabled={confirmMutation.isPending} data-testid={`button-confirm-payment-${payment.id}`}>Confirm</Button>
                    ) : null}
                    {live && unapplied > 0 && canApply ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setApplySource({ kind: "payment", id: payment.id, label, unappliedCents: unapplied })} data-testid={`button-apply-payment-${payment.id}`}>Apply</Button>
                    ) : null}
                    {payment.status === "CONFIRMED" && unapplied === payment.amountCents && canRefund ? (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReasonAct({ kind: "refund_payment", id: payment.id, label })} data-testid={`button-refund-payment-${payment.id}`}>Refund</Button>
                    ) : null}
                    {live && unapplied === payment.amountCents && canVoid ? (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReasonAct({ kind: "void_payment", id: payment.id, label })} data-testid={`button-void-payment-${payment.id}`}>Void</Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {(locationCredits ?? []).map((memo) => {
              const unapplied = unappliedById.get(memo.id) ?? 0;
              const label = `credit memo of ${formatCents(memo.amountCents)}`;
              return (
                <div key={memo.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2" data-testid={`row-credit-memo-${memo.id}`}>
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Credit memo</span>
                      <span className="font-semibold">{formatCents(memo.amountCents)}</span>
                      <Badge variant="outline" className="text-xs">{formatCreditMemoReason(memo.reasonCode)}</Badge>
                      <Badge variant="secondary" className={`text-xs ${memo.status === "ISSUED" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{memo.status === "ISSUED" ? "Issued" : "Voided"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(memo.issuedAt)}{memo.issuedByLabel ? ` by ${memo.issuedByLabel}` : ""} - {memo.reason}
                      {memo.status === "ISSUED" ? ` - ${formatCents(unapplied)} unapplied` : ""}
                      {memo.status === "VOIDED" && memo.voidReason ? ` - voided: ${memo.voidReason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {memo.status === "ISSUED" && unapplied > 0 && canApply ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setApplySource({ kind: "credit_memo", id: memo.id, label, unappliedCents: unapplied })} data-testid={`button-apply-credit-${memo.id}`}>Apply</Button>
                    ) : null}
                    {memo.status === "ISSUED" && unapplied === memo.amountCents && canCredit ? (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReasonAct({ kind: "void_credit", id: memo.id, label })} data-testid={`button-void-credit-${memo.id}`}>Void</Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} locationId={locationId} agreements={agreements} />
      <IssueCreditMemoDialog open={creditOpen} onOpenChange={setCreditOpen} locationId={locationId} invoices={invoices} />
      <ApplySourceDialog source={applySource} invoices={invoices} onOpenChange={(open) => !open && setApplySource(null)} />
      <ReasonDialog
        title={reasonCopy.title}
        description={reasonCopy.description}
        confirmLabel={reasonCopy.confirm}
        open={!!reasonAct}
        onOpenChange={(open) => !open && setReasonAct(null)}
        onConfirm={(reason) => reasonAct && reasonMutation.mutate({ ...reasonAct, reason })}
        isPending={reasonMutation.isPending}
      />
    </div>
  );
}
