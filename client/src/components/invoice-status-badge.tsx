import { Badge } from "@/components/ui/badge";
import type { Invoice } from "@shared/schema";
import { AlertCircle, Ban, CheckCircle, Clock, FileText } from "lucide-react";

// The invoice's derived status as the office reads it: the stored status
// (DRAFT / OPEN / PARTIALLY_PAID / PAID / VOID - derived from the ledger,
// never hand-set, PLAN_BILLING_V1_1.md D5) plus the one client-only reading,
// "overdue" - an OPEN invoice past its due date. Shared by the Invoices
// screen row and the invoice modal (Pass 11a) so the two never disagree.

type InvoiceStatusFields = Pick<Invoice, "status" | "dueDate">;

export function isInvoiceOverdue(invoice: InvoiceStatusFields) {
  return invoice.status === "OPEN" && !!invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now();
}

export function invoiceStatusLabel(invoice: InvoiceStatusFields) {
  return isInvoiceOverdue(invoice) ? "overdue" : invoice.status.toLowerCase().replace(/_/g, " ");
}

function invoiceStatusClass(invoice: InvoiceStatusFields) {
  if (invoice.status === "VOID") return "bg-muted text-muted-foreground";
  if (invoice.status === "DRAFT") return "border border-dashed bg-background text-foreground";
  if (isInvoiceOverdue(invoice)) return "bg-destructive/10 text-destructive";
  switch (invoice.status) {
    case "PAID": return "bg-primary/10 text-primary";
    case "OPEN":
    case "PARTIALLY_PAID": return "bg-chart-3/10 text-chart-3";
    default: return "";
  }
}

export function InvoiceStatusBadge({ invoice, className }: { invoice: InvoiceStatusFields; className?: string }) {
  return (
    <Badge variant="secondary" className={`text-xs capitalize ${invoiceStatusClass(invoice)} ${className ?? ""}`} data-testid="badge-invoice-status">
      {invoiceStatusLabel(invoice)}
    </Badge>
  );
}

export function InvoiceStatusIcon({ invoice }: { invoice: InvoiceStatusFields }) {
  if (invoice.status === "VOID") return <Ban className="h-4 w-4 text-muted-foreground" />;
  if (isInvoiceOverdue(invoice)) return <AlertCircle className="h-4 w-4 text-destructive" />;
  switch (invoice.status) {
    case "PAID": return <CheckCircle className="h-4 w-4 text-primary" />;
    case "OPEN":
    case "PARTIALLY_PAID": return <Clock className="h-4 w-4 text-chart-3" />;
    default: return <FileText className="h-4 w-4" />;
  }
}
