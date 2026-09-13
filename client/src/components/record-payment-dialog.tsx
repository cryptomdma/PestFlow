import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { can, PERMISSIONS } from "@shared/permissions";
import { centsToDollarString, dollarsToCents, formatCents } from "@shared/money";
import { MANUAL_PAYMENT_METHODS, formatPaymentMethod } from "@shared/payments";
import type { Agreement, Invoice, Payment, PaymentApplication } from "@shared/schema";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";

// PLAN_BILLING_V1_1.md D5: recording a payment. Cash / check / other post
// PENDING and are confirmed by the office separately. With an invoice given
// the payment is applied to it in the same call (capped by what the invoice
// can take; the rest stays on the location's balance); without one it lands
// unapplied at the location, optionally designated to an agreement (D4:
// designation is intent, application is fact).

/** Mirrors RecordPaymentResult (server/storage.ts). */
export interface RecordPaymentResponse {
  payment: Payment;
  application: PaymentApplication | null;
  invoice: Invoice | null;
}

function todayDateInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  locationId,
  invoice,
  agreements,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  /** When set, the payment is applied to this invoice in the same call. */
  invoice?: Invoice | null;
  /** Agreements at the location, offered for designation when no invoice is given. */
  agreements?: Agreement[];
  onRecorded?: (result: RecordPaymentResponse) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canApply = can(user?.role ?? "", PERMISSIONS.APPLY_PAYMENT);
  const applyingToInvoice = !!invoice && canApply;

  const [form, setForm] = useState({
    method: "CASH",
    amount: "",
    receivedAt: todayDateInputValue(),
    checkNumber: "",
    referenceNumber: "",
    memo: "",
    designatedAgreementId: "NONE",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      method: "CASH",
      amount: invoice && invoice.balanceDueCents > 0 ? centsToDollarString(invoice.balanceDueCents) : "",
      receivedAt: todayDateInputValue(),
      checkNumber: "",
      referenceNumber: "",
      memo: "",
      designatedAgreementId: "NONE",
    });
  }, [open, invoice]);

  const amountCents = dollarsToCents(form.amount);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payments", {
        locationId,
        method: form.method,
        amountCents,
        receivedAt: form.receivedAt ? new Date(`${form.receivedAt}T12:00:00`).toISOString() : null,
        checkNumber: form.method === "CHECK" ? form.checkNumber || null : null,
        referenceNumber: form.method === "OTHER" ? form.referenceNumber || null : null,
        memo: form.memo || null,
        designatedAgreementId: !invoice && form.designatedAgreementId !== "NONE" ? form.designatedAgreementId : null,
        applyToInvoiceId: applyingToInvoice ? invoice!.id : null,
      });
      return (await response.json()) as RecordPaymentResponse;
    },
    onSuccess: (result) => {
      invalidateInvoiceViews();
      const amount = formatCents(result.payment.amountCents);
      if (result.application && result.invoice) {
        const applied = formatCents(result.application.amountCents);
        const remainder = result.payment.amountCents - result.application.amountCents;
        toast({
          title: `${formatPaymentMethod(result.payment.method)} payment of ${amount} recorded`,
          description: `${applied} applied to ${result.invoice.invoiceNumber}${remainder > 0 ? `; ${formatCents(remainder)} stays on the location balance` : ""}. Pending until the office confirms it.`,
        });
      } else {
        toast({
          title: `${formatPaymentMethod(result.payment.method)} payment of ${amount} recorded`,
          description: invoice && !canApply
            ? "Recorded on the location balance; your role cannot apply it to the invoice - the office will."
            : "On the location balance, unapplied. Pending until the office confirms it.",
        });
      }
      onRecorded?.(result);
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Unable to record the payment", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const canSubmit = amountCents != null && amountCents > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{invoice ? `Record payment for ${invoice.invoiceNumber}` : "Record payment"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          {invoice ? (
            <p className="text-sm text-muted-foreground">
              Balance due {formatCents(invoice.balanceDueCents)}.{" "}
              {applyingToInvoice
                ? "The payment is applied to this invoice as far as it goes; anything over stays on the location balance."
                : "Your role records the collection; the office applies it to the invoice."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Recorded on this location's balance, to be applied to an invoice by the office.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(method) => setForm((prev) => ({ ...prev, method }))}>
                <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>{formatPaymentMethod(method)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($) *</Label>
              <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} data-testid="input-payment-amount" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Received on</Label>
              <Input type="date" value={form.receivedAt} onChange={(e) => setForm((prev) => ({ ...prev, receivedAt: e.target.value }))} data-testid="input-payment-received-at" />
            </div>
            {form.method === "CHECK" && (
              <div className="space-y-1.5">
                <Label>Check number</Label>
                <Input value={form.checkNumber} onChange={(e) => setForm((prev) => ({ ...prev, checkNumber: e.target.value }))} data-testid="input-payment-check-number" />
              </div>
            )}
            {form.method === "OTHER" && (
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={form.referenceNumber} onChange={(e) => setForm((prev) => ({ ...prev, referenceNumber: e.target.value }))} placeholder="e.g. money order #" data-testid="input-payment-reference" />
              </div>
            )}
          </div>
          {!invoice && agreements && agreements.length > 0 && (
            <div className="space-y-1.5">
              <Label>For agreement (optional)</Label>
              <Select value={form.designatedAgreementId} onValueChange={(value) => setForm((prev) => ({ ...prev, designatedAgreementId: value }))}>
                <SelectTrigger data-testid="select-payment-designation"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Not designated</SelectItem>
                  {agreements.filter((agreement) => agreement.status !== "CANCELLED").map((agreement) => (
                    <SelectItem key={agreement.id} value={agreement.id}>{agreement.agreementName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Intent only: when that agreement's invoice is issued, this money is suggested first. The office still applies it.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Memo</Label>
            <Textarea value={form.memo} onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))} className="resize-none" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="button-save-payment">
              {mutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
