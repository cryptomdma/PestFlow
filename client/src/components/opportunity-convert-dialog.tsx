import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Opportunity } from "@shared/schema";

function formatDateOnly(value?: string | null) {
  if (!value) return "Not set";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function OpportunityConvertDialog({
  open,
  onOpenChange,
  opportunity,
  customerLabel,
  locationLabel,
  opportunityTypeLabel,
  sourceServiceLabel,
  serviceTypeLabel,
  returnTo,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  customerLabel: string;
  locationLabel: string;
  opportunityTypeLabel: string;
  sourceServiceLabel: string;
  serviceTypeLabel: string;
  returnTo: string;
  onConverted?: () => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const invalidateAfterConvert = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/by-location"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location"] });
  };

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!opportunity) throw new Error("Opportunity context missing");
      const response = await apiRequest("POST", `/api/opportunities/${opportunity.id}/convert`);
      return response.json();
    },
    onSuccess: () => {
      invalidateAfterConvert();
      toast({ title: "Opportunity converted to pending service" });
      onOpenChange(false);
      onConverted?.();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const handleConvertAndSchedule = async () => {
    const result = await convertMutation.mutateAsync();
    const serviceId = result?.service?.id;
    if (!serviceId) return;
    const params = new URLSearchParams({
      serviceId,
      returnTo,
    });
    setLocation(`/schedule?${params.toString()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Convert Opportunity to Service</DialogTitle>
        </DialogHeader>
        {opportunity ? (
          <div className="space-y-5">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{opportunityTypeLabel}</span>
                <Badge variant="outline">{opportunity.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{customerLabel}</p>
              <p className="text-sm text-muted-foreground">{locationLabel}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Opportunity Type</p>
                <p className="text-sm">{opportunityTypeLabel}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source Service</p>
                <p className="text-sm">{sourceServiceLabel}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service Type To Create</p>
                <p className="text-sm">{serviceTypeLabel}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due / Target Date</p>
                <p className="text-sm">{formatDateOnly(opportunity.nextActionDate || opportunity.dueDate)}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {opportunity.notes || "No notes on this opportunity."}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" variant="outline" disabled={convertMutation.isPending} onClick={() => convertMutation.mutate()}>
                {convertMutation.isPending ? "Converting..." : "Convert to Pending Service"}
              </Button>
              <Button type="button" disabled={convertMutation.isPending} onClick={handleConvertAndSchedule}>
                {convertMutation.isPending ? "Converting..." : "Convert and Schedule Now"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
