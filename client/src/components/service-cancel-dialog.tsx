// Pass 28 (PLAN_ROADMAP_V2.md C4.3a; the owner's review of 2026-09-25,
// finding 5): cancel ONE service outright - a pending one from the dispatch
// queue or the location's Services tab, a placed one from the dispatch
// sheet - through POST /api/services/:id/cancel, with the disposition's
// semantics for that service: a reason from the settings list, the
// opportunity choice (Update existing / Create / None), a one-time service
// cancelled, an agreement service recycled with its window reset from today.
// One dialog for the three surfaces: it reads the reasons list and the
// location's open opportunities itself, runs the mutation, invalidates what
// the visit, the queue and the location read, and hands the result back.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { invalidateAuditViews } from "@/lib/invalidate-audit-views";
import type { Opportunity, Service } from "@shared/schema";
import type { DispositionOpportunityChoice } from "@shared/appointment-disposition";
import { describeCompositionRefusal, describeServiceCancelEffect, type ServiceCancelRequest, type ServiceCancelResult } from "@shared/appointment-composition";

function pluralize(count: number, noun: string, plural?: string) {
  return `${count} ${count === 1 ? noun : plural ?? `${noun}s`}`;
}

/** The invalidations every cancel needs: the queue, the board, the location's tabs, the opportunities. */
export function invalidateAfterServiceCancel(locationId: string | null | undefined) {
  queryClient.invalidateQueries({ queryKey: ["/api/services"] });
  queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
  queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
  queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
  queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
  queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
  invalidateAuditViews();
  if (locationId) {
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
  }
}

export function describeServiceCancelResult(result: ServiceCancelResult): { title: string; description?: string } {
  const created = result.opportunities.filter((outcome) => outcome.action === "CREATED").length;
  const updated = result.opportunities.filter((outcome) => outcome.action === "UPDATED").length;
  return {
    title: result.effect === "CANCELLED" ? "Service cancelled" : "Agreement service recycled",
    description: [
      result.effect === "REQUEUED" ? `Back in the pending queue${result.windowReset ? " with its window reset from today" : ""}` : null,
      result.detached ? "Taken off its visit" : null,
      created ? `${pluralize(created, "opportunity", "opportunities")} created` : null,
      updated ? `${pluralize(updated, "open opportunity", "open opportunities")} re-dated` : null,
    ].filter(Boolean).join("; ") || undefined,
  };
}

export function ServiceCancelDialog({
  service,
  serviceTypeName,
  open,
  onOpenChange,
  onCancelled,
}: {
  service: Service | null;
  serviceTypeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: (result: ServiceCancelResult) => void;
}) {
  const { toast } = useToast();
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [opportunityChoice, setOpportunityChoice] = useState<DispositionOpportunityChoice>("CREATE");
  const [refusal, setRefusal] = useState<string | null>(null);

  const { data: cancelReasonSettings } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/appointment-cancel-reasons"], enabled: open });
  const { data: locationOpportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities/by-location", service?.locationId ?? ""],
    enabled: open && !!service?.locationId,
  });
  const cancelReasons = cancelReasonSettings?.reasons ?? [];
  const openOpportunityCount = useMemo(
    () => (locationOpportunities ?? []).filter((opportunity) => opportunity.status === "OPEN" && !!service && opportunity.sourceServiceId === service.id).length,
    [locationOpportunities, service],
  );

  // Reset on the service (keyed on its id, Pass 27b's rule) and whenever the
  // dialog opens; the default choice follows what is open on the service.
  const serviceId = service?.id ?? null;
  useEffect(() => {
    setReasonCode("");
    setNotes("");
    setRefusal(null);
  }, [serviceId, open]);
  useEffect(() => {
    if (!open) return;
    setOpportunityChoice(openOpportunityCount > 0 ? "UPDATE_EXISTING" : "CREATE");
  }, [open, openOpportunityCount, serviceId]);

  const mutation = useMutation({
    mutationFn: async (payload: ServiceCancelRequest) => {
      if (!service) throw new Error("No service selected");
      const response = await apiRequest("POST", `/api/services/${service.id}/cancel`, payload);
      return response.json() as Promise<ServiceCancelResult>;
    },
    onSuccess: (result) => {
      invalidateAfterServiceCancel(service?.locationId);
      toast(describeServiceCancelResult(result));
      onOpenChange(false);
      onCancelled?.(result);
    },
    onError: (error: Error) => {
      const message = describeCompositionRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error);
      setRefusal(message);
      toast({ title: "Unable to cancel service", description: message, variant: "destructive" });
    },
  });

  const isAgreementService = !!service?.agreementId;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-service-cancel">
        <DialogHeader>
          <DialogTitle>{isAgreementService ? "Cancel this visit of the agreement" : "Cancel service"}</DialogTitle>
          <DialogDescription>{service ? describeServiceCancelEffect(service) : ""}</DialogDescription>
        </DialogHeader>
        {service ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <p className="font-medium">{serviceTypeName}</p>
              <p className="text-xs text-muted-foreground">
                {service.dueDate ? `Due ${service.dueDate}` : "No due date"}
                {service.status === "SCHEDULED" && service.appointmentId ? " - on a scheduled visit" : ""}
                {isAgreementService ? " - agreement work" : " - one-time work"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-cancel-reason">Reason</Label>
              <select
                id="service-cancel-reason"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-service-cancel-reason"
              >
                <option value="">Select a reason</option>
                {cancelReasons.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">From Settings, Appointment Cancel / Reschedule Reasons - the same list the appointment cancel uses.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-cancel-notes">Notes</Label>
              <Textarea
                id="service-cancel-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Customer context or office instructions."
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Opportunity</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="service-cancel-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "UPDATE_EXISTING"}
                  onChange={() => setOpportunityChoice("UPDATE_EXISTING")}
                  disabled={openOpportunityCount === 0}
                />
                <span>
                  <span className={openOpportunityCount === 0 ? "text-muted-foreground" : ""}>Update the open opportunity on the service</span>
                  <span className="block text-xs text-muted-foreground">
                    {openOpportunityCount > 0
                      ? `Re-dates ${pluralize(openOpportunityCount, "open opportunity", "open opportunities")} to today.`
                      : "None is open on this service."}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="service-cancel-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "CREATE"}
                  onChange={() => setOpportunityChoice("CREATE")}
                />
                <span>
                  Create a new opportunity
                  <span className="block text-xs text-muted-foreground">
                    {isAgreementService ? "Reschedule, for the recycled agreement service." : "Win-back, for the cancelled one-time service."}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="service-cancel-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "NONE"}
                  onChange={() => setOpportunityChoice("NONE")}
                />
                <span>
                  No opportunity
                  <span className="block text-xs text-muted-foreground">Nothing keeps this work visible for follow-up.</span>
                </span>
              </label>
            </fieldset>
            {refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="text-service-cancel-refusal">{refusal}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Back</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!reasonCode || mutation.isPending}
                onClick={() => mutation.mutate({ reasonCode, notes: notes.trim() || null, opportunity: opportunityChoice })}
                data-testid="button-service-cancel-confirm"
              >
                {mutation.isPending ? "Cancelling..." : isAgreementService ? "Recycle service" : "Cancel service"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
