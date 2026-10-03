import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { describeCompositionRefusal, describeFieldAddedService, isFieldAdded, needsFieldReview, type FieldReviewFields } from "@shared/appointment-composition";
import { can, PERMISSIONS } from "@shared/permissions";
import type { Service } from "@shared/schema";

/**
 * Pass 29 (PLAN_ROADMAP_V2.md C4.3b; Part E answer 7): a service a technician
 * added to a visit from the field is "flagged for office review" until the
 * office marks it reviewed (shared/appointment-composition.ts: isFieldAdded /
 * needsFieldReview). One badge for the dispatch sheet's composition block,
 * the technician's own row, the location's Services tab and Service Ticket
 * Review: amber "Field-added - review" while the office owes it a look, a
 * quiet "Field-added" once reviewed (the title says who and when). Nothing
 * for a service the office placed.
 */
export function FieldAddedBadge({ service, className }: { service: FieldReviewFields; className?: string }) {
  if (!isFieldAdded(service)) {
    return null;
  }
  const pending = needsFieldReview(service);
  return (
    <Badge
      variant="outline"
      className={cn(pending ? "border-amber-400 bg-amber-50 text-amber-900" : "border-border bg-muted/40 text-muted-foreground", className)}
      title={describeFieldAddedService(service)}
      data-testid={pending ? "badge-field-added-review" : "badge-field-added-reviewed"}
    >
      {pending ? "Field-added - review" : "Field-added"}
    </Badge>
  );
}

/** What a review changes for the office's screens: the service rows everywhere, the visit, the tickets and the History tab. */
export function invalidateAfterFieldReview(locationId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ["/api/services"] });
  queryClient.invalidateQueries({ queryKey: ["/api/services/by-location"] });
  queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
  queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
  queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
  if (locationId) {
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
  }
}

/**
 * "Mark reviewed" - POST /api/services/:id/field-review (FINALIZE_TICKET,
 * support+: the office's review permission). Renders nothing unless the
 * service still needs the review and the user may give it, so a row never
 * carries a dead control (dev behavior rule 6). Stops the click from
 * reaching a row that opens on click.
 */
export function MarkFieldReviewedButton({
  service,
  className,
  onReviewed,
}: {
  service: Pick<Service, "id" | "locationId"> & FieldReviewFields;
  className?: string;
  onReviewed?: (service: Service) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/services/${service.id}/field-review`, {});
      return response.json() as Promise<Service>;
    },
    onSuccess: (updated) => {
      invalidateAfterFieldReview(updated.locationId);
      toast({ title: "Field-added service reviewed" });
      onReviewed?.(updated);
    },
    onError: (error: Error) => {
      toast({ title: "Unable to mark reviewed", description: describeCompositionRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error), variant: "destructive" });
    },
  });
  if (!needsFieldReview(service) || !can(user?.role ?? "", PERMISSIONS.FINALIZE_TICKET)) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("border-amber-400 text-amber-900 hover:bg-amber-50", className)}
      disabled={mutation.isPending}
      title="The technician added this service in the field - mark it reviewed by the office"
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate();
      }}
      data-testid={`button-field-review-${service.id}`}
    >
      {mutation.isPending ? "Marking..." : "Mark reviewed"}
    </Button>
  );
}
