import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import { can, PERMISSIONS } from "@shared/permissions";
import { isInvoiceIssued } from "@shared/invoice-status";
import type { Invoice } from "@shared/schema";
import { Download, FileText, Send } from "lucide-react";

// The invoice document, on every invoice row (Pass 10). GET
// /api/invoices/:id/document has rendered and stored the PDF since
// PLAN_BILLING_V1.md §1.7 but had no affordance anywhere; these are it.
//
// Open shows the PDF in a new tab (the route answers inline); Download asks
// the same route for an attachment. A DRAFT renders as a preview that says
// "Status: DRAFT" and is never stored, so its buttons say Preview. Mark Sent
// is honest about what exists: there is no email delivery, so "send" stamps
// sentAt and pins the stored document (batchSendInvoices) - the office
// delivers the PDF itself. The stamp is shown wherever the row is.

export function invoiceDocumentUrl(invoice: Pick<Invoice, "id">, download = false): string {
  return `/api/invoices/${invoice.id}/document${download ? "?download=1" : ""}`;
}

function downloadInvoiceDocument(invoice: Pick<Invoice, "id" | "invoiceNumber">) {
  const anchor = document.createElement("a");
  anchor.href = invoiceDocumentUrl(invoice, true);
  anchor.download = `invoice-${invoice.invoiceNumber}.pdf`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** "Sent <date>" for an invoice that has been marked sent, else nothing. */
export function InvoiceSentStamp({ invoice, className }: { invoice: Pick<Invoice, "id" | "sentAt">; className?: string }) {
  if (!invoice.sentAt) return null;
  return (
    <span className={className} data-testid={`text-invoice-sent-${invoice.id}`}>
      Sent {new Date(invoice.sentAt).toLocaleDateString()}
    </span>
  );
}

export function InvoiceDocumentActions({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canSend = can(user?.role ?? "", PERMISSIONS.SEND_INVOICE);
  const issued = isInvoiceIssued(invoice.status);
  const isDraft = invoice.status === "DRAFT";
  const sizeClass = compact ? "h-6 px-2 text-xs" : undefined;
  const iconClass = compact ? "h-3 w-3" : "h-3 w-3 mr-1";

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices/batch-send", { invoiceIds: [invoice.id] });
      return (await response.json()) as Invoice[];
    },
    onSuccess: (sent) => {
      invalidateInvoiceViews();
      if (sent.length === 0) {
        toast({ title: `${invoice.invoiceNumber} was not marked sent`, description: "Only an issued invoice can be sent - not a draft or a voided one.", variant: "destructive" });
        return;
      }
      toast({ title: `Invoice ${invoice.invoiceNumber} marked sent`, description: "The PDF is pinned as the sent document. There is no email delivery yet - open or download it to deliver it." });
    },
    onError: (error: Error) => toast({ title: "Unable to mark the invoice sent", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={sizeClass}
        onClick={() => window.open(invoiceDocumentUrl(invoice), "_blank", "noopener")}
        title={isDraft ? "Preview the draft as a PDF. It is not stored; the numbers are re-priced at issue." : "Open the invoice PDF in a new tab"}
        data-testid={`button-open-document-${invoice.id}`}
      >
        <FileText className={iconClass} /> {isDraft ? "Preview PDF" : "Open PDF"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={compact ? "h-6 w-6 p-0" : "h-8 w-8 p-0"}
        onClick={() => downloadInvoiceDocument(invoice)}
        title={isDraft ? "Download the draft preview" : "Download the invoice PDF"}
        aria-label={isDraft ? "Download the draft preview" : "Download the invoice PDF"}
        data-testid={`button-download-document-${invoice.id}`}
      >
        <Download className="h-3 w-3" />
      </Button>
      {issued && !invoice.sentAt && canSend ? (
        <Button
          variant="ghost"
          size="sm"
          className={sizeClass}
          onClick={() => sendMutation.mutate()}
          disabled={sendMutation.isPending}
          title="Stamps the invoice as sent and pins its PDF. There is no email delivery yet - deliver the PDF yourself."
          data-testid={`button-mark-sent-${invoice.id}`}
        >
          <Send className={iconClass} /> {sendMutation.isPending ? "Marking..." : "Mark Sent"}
        </Button>
      ) : null}
    </>
  );
}
