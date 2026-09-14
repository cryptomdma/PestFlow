import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { can, PERMISSIONS } from "@shared/permissions";
import { formatCents } from "@shared/money";
import { formatCreditMemoReason, formatPaymentMethod, type InvoiceLocationBalance } from "@shared/payments";
import type { Invoice } from "@shared/schema";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";

// PLAN_BILLING_V1_1.md D4: "Apply $X location balance to this invoice?" The
// server decides the X - unapplied payments and credit memos at the invoice's
// location, designated ones first, capped by what the invoice can still take
// - and one Apply draws on them in that order. Money designated to a
// different agreement is named but never drawn on. Opens only when there is
// something to suggest; otherwise it closes itself so the caller's flow
// (the finalize prompt) continues without a beat.

/** Mirrors ApplyLocationBalanceResult (server/storage.ts). */
interface ApplyLocationBalanceResponse {
  invoice: Invoice;
  applied: Array<{ kind: "payment" | "credit_memo"; sourceId: string; amountCents: number }>;
  appliedCents: number;
}

export function ApplyLocationBalancePrompt({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canApply = can(user?.role ?? "", PERMISSIONS.APPLY_PAYMENT);

  const { data: balance, isLoading, isError } = useQuery<InvoiceLocationBalance>({
    queryKey: ["/api/invoices", invoice?.id ?? "", "location-balance"],
    enabled: !!invoice,
    staleTime: 0,
  });

  const nothingToSuggest = !!invoice && !isLoading && (isError || !balance || balance.suggestedCents <= 0 || !canApply);
  useEffect(() => {
    if (nothingToSuggest) onClose();
  }, [nothingToSuggest, onClose]);

  const applyMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiRequest("POST", `/api/invoices/${invoiceId}/apply-location-balance`, {});
      return (await response.json()) as ApplyLocationBalanceResponse;
    },
    onSuccess: (result) => {
      invalidateInvoiceViews();
      toast({
        title: `${formatCents(result.appliedCents)} applied to ${result.invoice.invoiceNumber}`,
        description: result.invoice.balanceDueCents > 0
          ? `${formatCents(result.invoice.balanceDueCents)} still due. Pending payments count once confirmed.`
          : result.invoice.status === "PAID" ? "The invoice is paid." : "Applied; the invoice is paid once its pending payments are confirmed.",
      });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Unable to apply the location balance", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const open = !!invoice && !!balance && balance.suggestedCents > 0 && canApply;
  const isPending = applyMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Apply {formatCents(balance?.suggestedCents ?? 0)} location balance to {invoice?.invoiceNumber}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This location has {formatCents((balance?.unappliedConfirmedCents ?? 0) + (balance?.unappliedPendingCents ?? 0))} not yet applied to any invoice
                {balance && balance.unappliedPendingCents > 0 ? ` (${formatCents(balance.unappliedPendingCents)} of it pending confirmation)` : ""}.
                The invoice can take {formatCents(balance?.applicableCents ?? 0)} more.
              </p>
              <ul className="list-disc pl-5 text-sm">
                {(balance?.sources ?? []).map((source) => (
                  <li key={`${source.kind}-${source.id}`}>
                    {source.kind === "payment" ? `${formatPaymentMethod(source.label)} payment` : `Credit memo (${formatCreditMemoReason(source.label)})`}
                    {" - "}{formatCents(source.unappliedCents)} unapplied
                    {source.status === "PENDING" ? ", pending" : ""}
                    {source.designatedAgreementId ? ", designated to this agreement" : ""}
                  </li>
                ))}
              </ul>
              {balance && balance.designatedElsewhereCents > 0 && (
                <p className="text-sm">A further {formatCents(balance.designatedElsewhereCents)} is designated to a different agreement and is not touched here.</p>
              )}
              <p className="text-sm">Not now leaves the money on the location balance; it can be applied from the location's Invoices tab at any time.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Not now</Button>
          <Button type="button" onClick={() => invoice && applyMutation.mutate(invoice.id)} disabled={isPending} data-testid="button-apply-location-balance">
            {isPending ? "Applying..." : `Apply ${formatCents(balance?.suggestedCents ?? 0)}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
