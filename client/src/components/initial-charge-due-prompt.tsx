import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { useAuth } from "@/hooks/use-auth";
import { can, PERMISSIONS } from "@shared/permissions";
import { formatCents } from "@shared/money";
import type { InitialChargeDue } from "@shared/initial-charge";

// Pass 11d, D4 step 1 ("payment recorded at scheduling"): "Collect the $X
// down payment now?" The server decided whether to ask - POST /api/agreements
// and POST /api/appointments answer `initialChargeDue` when a down payment
// the office may collect is still owed and no money designated to the
// agreement covers it. Yes opens the office's Record Payment dialog with the
// amount and the designation preset: the money lands on the location balance
// as a payment designated to the agreement (intent, never application) and
// is offered first when the first visit is invoiced, where the down payment
// rides as its own line. Not now leaves the deposit on the visit, where the
// technician's figures show it as due.

/** What the two creation routes append to their row (mirrors the server's InitialChargeDue). */
export type WithInitialChargeDue<T> = T & { initialChargeDue?: InitialChargeDue | null };

export function InitialChargeDuePrompt({ due, onClose }: { due: InitialChargeDue | null; onClose: () => void }) {
  const { user } = useAuth();
  const canRecord = can(user?.role ?? "", PERMISSIONS.TAKE_PAYMENT_FIELD);
  const [recording, setRecording] = useState(false);
  const amount = formatCents(due?.amountCents ?? 0);
  const notNow = due?.collectedBy === "OFFICE_AT_SIGNING"
    ? "Not now leaves it owed on the first visit's invoice; only the office may collect it, so the technician is not asked to."
    : "Not now leaves it on the visit: the technician is shown it as due today and may collect it.";

  return (
    <>
      <AlertDialog open={!!due && !recording} onOpenChange={(next) => !next && onClose()}>
        <AlertDialogContent data-testid="dialog-initial-charge-due">
          <AlertDialogHeader>
            <AlertDialogTitle>Collect the {amount} down payment now?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {due?.agreementName} carries a {amount} down payment that has not been collected. It is billed on the first visit's invoice;
                  money collected now is recorded on the location balance, designated to the agreement, and applied to that invoice by the office.
                </p>
                <p className="text-sm">{notNow}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-initial-charge-not-now">Not now</Button>
            {canRecord && (
              <Button type="button" onClick={() => setRecording(true)} data-testid="button-initial-charge-record">
                Record payment
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {due && (
        <RecordPaymentDialog
          open={recording}
          onOpenChange={(next) => {
            if (!next) {
              setRecording(false);
              onClose();
            }
          }}
          locationId={due.locationId}
          preset={{
            designatedAgreementId: due.agreementId,
            designatedAgreementName: due.agreementName,
            amountCents: due.amountCents,
            title: `Collect the down payment for ${due.agreementName}`,
          }}
        />
      )}
    </>
  );
}
