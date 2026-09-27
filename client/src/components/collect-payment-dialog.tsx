import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { VisitBillingRows, VisitInitialChargeCallout, useVisitBillingSummary, type VisitBillingDraftPrice } from "@/components/visit-billing-summary";
import type { RecordPaymentResponse } from "@/components/record-payment-dialog";
import { can, PERMISSIONS } from "@shared/permissions";
import { centsToDollarString, dollarsToCents, formatCents } from "@shared/money";
import { MANUAL_PAYMENT_METHODS, formatPaymentMethod } from "@shared/payments";
import { technicianCollectibleCents } from "@shared/visit-billing";
import type { Agreement, Payment } from "@shared/schema";

// PLAN_BILLING_V1_1.md D8 - the post-ticket sequence is finish -> collect ->
// post. This is the field's collection step, and it is not the office's
// RecordPaymentDialog: it shows the customer what the visit costs (D6's
// Price / COA / Due today, the same read the ticket shows), defaults the
// amount to what is due today, and records the collection through
// POST /api/payments - PENDING, unapplied, designated to the visit's
// agreement as intent (D4). The field never applies money to an invoice; the
// office does (APPLY_PAYMENT), and cash is confirmed only by a manager (D5).
// Card / ACH wait for Phase 2. Signatures and a printable customer copy are
// not built.

/**
 * The one agreement a visit's money is for, when there is exactly one: the
 * designation recorded on the payment. Two different agreements on a visit,
 * or none, means undesignated - the office decides.
 */
export function resolveVisitDesignation(agreementIds: Array<string | null | undefined>): string | null {
  const distinct = Array.from(new Set(agreementIds.filter((id): id is string => !!id)));
  return distinct.length === 1 ? distinct[0] : null;
}

interface CollectPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The visit the customer is paying for. Null when the service is not on an appointment: nothing to summarize, the amount is typed. */
  appointmentId: string | null;
  /** Where the balance lives (D4) - the appointment's location, or the service's. */
  locationId: string;
  /** D4 intent, recorded on the payment: the ticket's service agreement, or the one agreement a visit's services share. */
  designatedAgreementId: string | null;
  /** Ticket flow: the step after collecting. When given, the dialog ends with "Post Service Ticket" and this runs it. */
  onPostTicket?: () => void;
  postingTicket?: boolean;
  /**
   * Pass 19 (C3.3): the ticket's unposted price, when the technician has
   * changed it. The summary here is read with it, so this step prices and
   * defaults to what Post will stamp rather than the stored amount.
   */
  draftPrice?: VisitBillingDraftPrice | null;
}

export function CollectPaymentDialog({
  open,
  onOpenChange,
  appointmentId,
  locationId,
  designatedAgreementId,
  onPostTicket,
  postingTicket = false,
  draftPrice = null,
}: CollectPaymentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canCollect = can(user?.role ?? "", PERMISSIONS.TAKE_PAYMENT_FIELD);
  const { data: summary, isLoading, isError } = useVisitBillingSummary(open ? appointmentId : null, draftPrice);
  const { data: designatedAgreement } = useQuery<Agreement>({
    queryKey: [`/api/agreements/${designatedAgreementId}`],
    enabled: open && !!designatedAgreementId,
  });

  const [method, setMethod] = useState<string>("CASH");
  const [amount, setAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [amountDefaulted, setAmountDefaulted] = useState(false);
  // What this dialog recorded since it opened - shown so the technician sees
  // the collection took even when the visit is already invoiced and the
  // summary's figures (which read applications, not unapplied money) do not move.
  const [collected, setCollected] = useState<Payment[]>([]);

  useEffect(() => {
    if (!open) return;
    setMethod("CASH");
    setAmount("");
    setCheckNumber("");
    setReferenceNumber("");
    setMemo("");
    setAmountDefaulted(false);
    setCollected([]);
  }, [open]);

  // Default the amount to what the visit says is due today, once - a typed
  // amount, and the empty field after a recording, both stand. A down
  // payment only the office may collect is on the visit's figures but not
  // in this default (Pass 11d): it is not the technician's to take.
  useEffect(() => {
    if (!open || amountDefaulted) return;
    if (!appointmentId) {
      setAmountDefaulted(true);
      return;
    }
    if (!summary) return;
    const collectibleCents = technicianCollectibleCents(summary);
    setAmount(collectibleCents > 0 ? centsToDollarString(collectibleCents) : "");
    setAmountDefaulted(true);
  }, [open, appointmentId, summary, amountDefaulted]);

  const amountCents = dollarsToCents(amount);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/payments", {
        locationId,
        method,
        amountCents,
        checkNumber: method === "CHECK" ? checkNumber || null : null,
        referenceNumber: method === "OTHER" ? referenceNumber || null : null,
        memo: memo || null,
        designatedAgreementId,
        // The visit this money was collected at - intent of the same kind as
        // the agreement designation, recorded once here and never by the
        // office. It is what the review modal's "Collected in the field" list
        // reads, and what the D4 prompt offers first.
        appointmentId,
        // The field records; the office applies (APPLY_PAYMENT is support+).
        applyToInvoiceId: null,
      });
      return (await response.json()) as RecordPaymentResponse;
    },
    onSuccess: (result) => {
      invalidateInvoiceViews();
      setCollected((current) => [...current, result.payment]);
      setAmount("");
      setCheckNumber("");
      setReferenceNumber("");
      toast({
        title: `${formatPaymentMethod(result.payment.method)} ${formatCents(result.payment.amountCents)} collected`,
        description: "Recorded under your name, pending office confirmation. The office applies it to the invoice.",
      });
    },
    onError: (error: Error) => toast({ title: "Unable to record the collection", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const collectedCents = collected.reduce((sum, payment) => sum + payment.amountCents, 0);
  const dueTodayCents = appointmentId && summary ? technicianCollectibleCents(summary) : null;
  const hasAmount = amountCents != null && amountCents > 0;
  const busy = mutation.isPending || postingTicket;
  const canRecord = canCollect && hasAmount && !busy;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer summary</p>
            {appointmentId ? (
              <div className="mt-2 space-y-2">
                <VisitBillingRows summary={summary} isLoading={isLoading} isError={isError} />
                <VisitInitialChargeCallout summary={summary} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Not on an appointment - there is no visit to price. Enter what was collected.</p>
            )}
          </div>

          {collected.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="block-collected-this-visit">
              <p className="font-medium">Collected this visit</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {collected.map((payment) => (
                  <li key={payment.id}>
                    {formatPaymentMethod(payment.method)} {formatCents(payment.amountCents)}
                    {payment.checkNumber ? ` - check #${payment.checkNumber}` : ""}
                    {payment.referenceNumber ? ` - ref ${payment.referenceNumber}` : ""}
                    {" - pending office confirmation"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Total {formatCents(collectedCents)}, on the location balance. The office applies it to the invoice.
              </p>
            </div>
          )}

          {canCollect ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (canRecord) mutation.mutate();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Payment type</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger data-testid="select-collect-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MANUAL_PAYMENT_METHODS.map((option) => (
                        <SelectItem key={option} value={option}>{formatPaymentMethod(option)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount ($)</Label>
                  <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="input-collect-amount" />
                  {dueTodayCents != null && dueTodayCents > 0 && collected.length === 0 && (
                    <p className="text-xs text-muted-foreground">Due today {formatCents(dueTodayCents)}.</p>
                  )}
                </div>
                {method === "CHECK" && (
                  <div className="space-y-1.5">
                    <Label>Check number</Label>
                    <Input value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} data-testid="input-collect-check-number" />
                  </div>
                )}
                {method === "OTHER" && (
                  <div className="space-y-1.5">
                    <Label>Reference</Label>
                    <Input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="e.g. money order #" data-testid="input-collect-reference" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Memo</Label>
                <Textarea value={memo} onChange={(event) => setMemo(event.target.value)} className="resize-none" rows={2} />
              </div>
              {designatedAgreementId && (
                <p className="text-xs text-muted-foreground">
                  Recorded for agreement {designatedAgreement?.agreementName ?? "..."} - intent only; the office applies it.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Cash, check or other only. Posts as pending until the office confirms it; cash is confirmed by a manager.
              </p>
              <Button type="submit" className="h-11 w-full" variant={hasAmount ? "default" : "outline"} disabled={!canRecord} data-testid="button-collect-record">
                {mutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Your role cannot record payments. The office bills the balance.</p>
          )}

          {onPostTicket && collected.length === 0 && dueTodayCents != null && dueTodayCents > 0 && (
            <p className="text-xs text-muted-foreground">Nothing collected - posting sends the ticket to office review and the office bills the balance.</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {onPostTicket ? "Back" : "Close"}
            </Button>
            {onPostTicket && (
              <Button type="button" variant={hasAmount ? "outline" : "default"} onClick={onPostTicket} disabled={busy} data-testid="button-post-service-ticket">
                {postingTicket ? "Posting..." : "Post Service Ticket"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
