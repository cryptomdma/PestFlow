import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Opportunity, OpportunityActivity } from "@shared/schema";

function formatDateOnly(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function OpportunityHistoryDialog({
  open,
  onOpenChange,
  opportunity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
}) {
  const { data: activities, isLoading } = useQuery<OpportunityActivity[]>({
    queryKey: ["/api/opportunities", opportunity?.id, "activities"],
    queryFn: async () => {
      const response = await fetch(`/api/opportunities/${opportunity?.id}/activities`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load opportunity history");
      return response.json();
    },
    enabled: open && !!opportunity?.id,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Opportunity History</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{opportunity?.opportunityType || "Opportunity"}</span>
              {opportunity?.status ? <Badge variant="outline">{opportunity.status}</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Current next action {formatDateOnly(opportunity?.nextActionDate || opportunity?.dueDate || null)}</p>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {isLoading ? (
              [1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)
            ) : !activities?.length ? (
              <p className="text-sm text-muted-foreground">No opportunity history yet.</p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{activity.dispositionLabel || activity.dispositionKey || "Activity"}</span>
                      {activity.nextActionDate ? <Badge variant="secondary">Next action {formatDateOnly(activity.nextActionDate)}</Badge> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
                  </div>
                  {activity.createdByLabel ? <p className="mt-1 text-xs text-muted-foreground">By {activity.createdByLabel}</p> : null}
                  {activity.notes ? <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{activity.notes}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
