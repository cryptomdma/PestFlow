import { useMutation } from "@tanstack/react-query";
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
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { can, PERMISSIONS } from "@shared/permissions";
import { formatCents } from "@shared/money";
import type { FinalizationInvoicingOutcome } from "@shared/invoice-on-finalize";
import type { Invoice, ServiceRecord } from "@shared/schema";

// D2 (PLAN_BILLING_V1_1.md): the finalization that completes a visit answers
// with an invoicing outcome. Under the PROMPT setting the reviewer is asked -
// Generate / Generate & Send / Later - and both places a ticket can be
// finalized (Service Ticket Review and the location's Services tab) answer with
// this one prompt. Generate is the existing generate route, which adopts a
// DRAFT rather than creating a second invoice; "send" today stamps sentAt (the
// same thing Batch Invoice's "Send All" does) - there is no email delivery yet.

/** Mirrors FinalizeServiceRecordResult (server/storage.ts). */
export interface FinalizeServiceRecordResponse {
  record: ServiceRecord;
  invoicing: FinalizationInvoicingOutcome<Invoice> | null;
}

export interface InvoiceOnFinalizePromptState {
  serviceRecordId: string;
  outcome: FinalizationInvoicingOutcome<Invoice>;
}

/** The prompt to open for a finalize response, or null when there is nothing to ask. */
export function getInvoiceOnFinalizePrompt(result: FinalizeServiceRecordResponse): InvoiceOnFinalizePromptState | null {
  if (result.invoicing?.action !== "PROMPT") return null;
  return { serviceRecordId: result.record.id, outcome: result.invoicing };
}

/** Toast copy for a finalize response that does not open the prompt. */
export function describeFinalizeResult(result: FinalizeServiceRecordResponse): { title: string; description: string; variant?: "default" | "destructive" } {
  const outcome = result.invoicing;
  const finalized = { title: "Service ticket finalized", description: "The service is now completed and billing-ready." };
  if (!outcome) return finalized;

  switch (outcome.action) {
    case "DRAFTED":
      return {
        title: "Service ticket finalized",
        description: outcome.created
          ? `Draft invoice ${outcome.invoice?.invoiceNumber} was created for this visit. Issue it from the Invoices screen.`
          : `This visit already has draft invoice ${outcome.invoice?.invoiceNumber}. Issue it from the Invoices screen.`,
      };
    case "DRAFT_FAILED":
      return {
        title: "Ticket finalized, but no draft invoice",
        description: `${outcome.message ?? "Drafting was refused."} The visit stays on the ready-to-bill list.`,
        variant: "destructive",
      };
    case "ALREADY_INVOICED":
      return {
        title: "Service ticket finalized",
        description: `This visit was already invoiced as ${outcome.invoice?.invoiceNumber}.`,
      };
    case "PROMPT":
    case "OFF":
    default:
      return finalized;
  }
}

/**
 * Every query that reads invoices or the audit trail, whatever its key shape -
 * "/api/invoices", ["/api/invoices/by-location", id], "/api/invoices/ready-for-billing",
 * "/api/audit-logs?locationId=...". A prefix match on the first element would
 * miss the last three, so match on the string itself.
 */
export function invalidateInvoiceViews() {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const head = String(query.queryKey[0] ?? "");
      return head.startsWith("/api/invoices") || head.startsWith("/api/audit-logs");
    },
  });
}

export function InvoiceOnFinalizePrompt({ prompt, onClose }: { prompt: InvoiceOnFinalizePromptState | null; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canGenerate = can(user?.role ?? "", PERMISSIONS.GENERATE_INVOICE);
  const canSend = canGenerate && can(user?.role ?? "", PERMISSIONS.SEND_INVOICE);
  const draft = prompt?.outcome.invoice ?? null;

  const generateMutation = useMutation({
    mutationFn: async ({ serviceRecordId, send }: { serviceRecordId: string; send: boolean }) => {
      const response = await apiRequest("POST", `/api/invoices/generate-from-service-record/${serviceRecordId}`, {});
      const invoice = (await response.json()) as Invoice;
      if (!send) {
        return { invoice, sent: false, sendError: null as string | null };
      }
      // The invoice exists from here on, so a failed send must not read as a
      // failed generate.
      try {
        await apiRequest("POST", "/api/invoices/batch-send", { invoiceIds: [invoice.id] });
        return { invoice, sent: true, sendError: null as string | null };
      } catch (err) {
        return { invoice, sent: false, sendError: getApiErrorMessage(err) };
      }
    },
    onSuccess: ({ invoice, sent, sendError }) => {
      invalidateInvoiceViews();
      const amount = formatCents(invoice.totalAmountCents);
      if (sendError) {
        toast({ title: `Invoice ${invoice.invoiceNumber} issued, but not marked sent`, description: sendError, variant: "destructive" });
      } else {
        toast({
          title: sent ? `Invoice ${invoice.invoiceNumber} issued and marked sent` : `Invoice ${invoice.invoiceNumber} issued`,
          description: draft ? `${amount}. The draft was issued in place - no second invoice.` : `${amount} for the whole visit.`,
        });
      }
      onClose();
    },
    onError: (error: Error) => toast({ title: "Unable to generate the invoice", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const isPending = generateMutation.isPending;

  return (
    <AlertDialog open={!!prompt} onOpenChange={(open) => !open && !isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{draft ? `Issue draft ${draft.invoiceNumber} for this visit?` : "Invoice this visit?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Every ticket on this visit is finalized, so it is ready to bill.</p>
              {draft ? (
                <p>
                  The draft ({formatCents(draft.totalAmountCents)} as previewed) is re-priced from the finalized tickets and issued as the visit's one invoice - it is never duplicated.
                </p>
              ) : (
                <p>Generate issues one invoice for the whole visit, one line per finalized ticket.</p>
              )}
              {canGenerate ? (
                <p className="text-sm">
                  {canSend ? "Generate & Send also marks it sent. " : ""}
                  Later leaves the visit on the ready-to-bill list, where Generate and Batch Invoice still pick it up.
                </p>
              ) : (
                <p className="text-sm">Your role cannot generate invoices. The visit stays on the ready-to-bill list for someone who can.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Later</Button>
          {canGenerate ? (
            <Button
              type="button"
              variant={canSend ? "secondary" : "default"}
              onClick={() => prompt && generateMutation.mutate({ serviceRecordId: prompt.serviceRecordId, send: false })}
              disabled={isPending}
            >
              {isPending && !generateMutation.variables?.send ? "Generating..." : "Generate"}
            </Button>
          ) : null}
          {canSend ? (
            <Button
              type="button"
              onClick={() => prompt && generateMutation.mutate({ serviceRecordId: prompt.serviceRecordId, send: true })}
              disabled={isPending}
            >
              {isPending && generateMutation.variables?.send ? "Generating..." : "Generate & Send"}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
