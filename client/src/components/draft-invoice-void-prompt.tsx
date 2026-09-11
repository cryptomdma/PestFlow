import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/queryClient";
import { formatCents } from "@shared/money";

// Q3 (PLAN_BILLING_V1_1_EXECUTION.md §5): cancelling an appointment that
// carries a DRAFT invoice prompts rather than auto-voiding or silently
// orphaning. Every appointment-cancel path - the agreement cancellation modal,
// the technician cancel/reschedule dialog, and the schedule sheet's status
// change - answers the server's 409 with this one prompt and resubmits with
// `voidDraftInvoices` set to the choice.

export interface DraftInvoiceRef {
  id: string;
  invoiceNumber: string;
  appointmentId: string | null;
  totalAmountCents: number;
}

/** The drafts a cancel request tripped over, or null if the error is anything else. */
export function getDraftInvoiceDecisionRequired(err: unknown): DraftInvoiceRef[] | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as { code?: unknown; draftInvoices?: unknown } | null;
  if (body?.code !== "DRAFT_INVOICE_DECISION_REQUIRED" || !Array.isArray(body.draftInvoices)) return null;
  return body.draftInvoices as DraftInvoiceRef[];
}

export function DraftInvoiceVoidPrompt({
  drafts,
  isPending,
  onDecide,
  onBack,
}: {
  drafts: DraftInvoiceRef[] | null;
  isPending?: boolean;
  onDecide: (voidDraftInvoices: boolean) => void;
  onBack: () => void;
}) {
  const plural = (drafts?.length ?? 0) > 1;
  return (
    <AlertDialog open={!!drafts?.length} onOpenChange={(open) => !open && onBack()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{plural ? "Void the draft invoices on these appointments?" : "Void the draft invoice on this appointment?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {plural
                  ? "The appointments being cancelled have draft invoices that were never issued. Voiding them keeps the invoice list honest; keeping them leaves drafts on cancelled visits that you can void later."
                  : "This appointment has a draft invoice that was never issued. Voiding it keeps the invoice list honest; keeping it leaves a draft on a cancelled visit that you can void later."}
              </p>
              <ul className="list-disc pl-5 text-sm">
                {(drafts ?? []).map((draft) => (
                  <li key={draft.id}>
                    {draft.invoiceNumber} - {formatCents(draft.totalAmountCents)}
                  </li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>Back</Button>
          <Button type="button" variant="secondary" onClick={() => onDecide(false)} disabled={isPending}>
            {plural ? "Keep drafts, cancel anyway" : "Keep draft, cancel anyway"}
          </Button>
          <Button type="button" variant="destructive" onClick={() => onDecide(true)} disabled={isPending}>
            {isPending ? "Working..." : plural ? "Void drafts and cancel" : "Void draft and cancel"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
