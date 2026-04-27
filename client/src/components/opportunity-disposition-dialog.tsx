import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Opportunity, OpportunityActivity, OpportunityDisposition } from "@shared/schema";
import { OpportunityHistoryDialog } from "@/components/opportunity-history-dialog";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysDateString(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateOnly(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function OpportunityDispositionDialog({
  open,
  onOpenChange,
  opportunity,
  dispositionId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  dispositionId: string | null;
  onApplied?: () => void;
}) {
  const { toast } = useToast();
  const { data: dispositions } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions"] });
  const { data: activities, isLoading: activitiesLoading } = useQuery<OpportunityActivity[]>({
    queryKey: ["/api/opportunities", opportunity?.id, "activities"],
    queryFn: async () => {
      const response = await fetch(`/api/opportunities/${opportunity?.id}/activities`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load opportunity history");
      return response.json();
    },
    enabled: open && !!opportunity?.id,
  });

  const selectedDisposition = useMemo(
    () => dispositions?.find((item) => item.id === dispositionId) ?? null,
    [dispositionId, dispositions],
  );

  const [nextActionDate, setNextActionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open || !selectedDisposition) {
      setNextActionDate("");
      setNotes("");
      return;
    }

    if (selectedDisposition.isTerminal) {
      setNextActionDate("");
    } else if (selectedDisposition.defaultCallbackDays !== null && selectedDisposition.defaultCallbackDays !== undefined) {
      setNextActionDate(addDaysDateString(selectedDisposition.defaultCallbackDays));
    } else {
      setNextActionDate(opportunity?.nextActionDate || opportunity?.dueDate || todayDateString());
    }
    setNotes("");
  }, [open, opportunity?.dueDate, opportunity?.nextActionDate, selectedDisposition]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!opportunity || !selectedDisposition) throw new Error("Disposition context missing");
      const response = await apiRequest("POST", `/api/opportunities/${opportunity.id}/disposition`, {
        dispositionId: selectedDisposition.id,
        nextActionDate: selectedDisposition.isTerminal ? null : (nextActionDate || null),
        notes: notes.trim() || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
      if (opportunity?.locationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/location-counts", opportunity.locationId] });
        queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", opportunity.locationId] });
        queryClient.invalidateQueries({ queryKey: ["/api/communications/by-location", opportunity.locationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
      toast({ title: "Disposition saved" });
      onOpenChange(false);
      onApplied?.();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply Opportunity Disposition</DialogTitle>
        </DialogHeader>
        {!selectedDisposition || !opportunity ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedDisposition.label}</span>
                <Badge variant={selectedDisposition.isTerminal ? "secondary" : "outline"}>{selectedDisposition.resultingStatus}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Default next action: {selectedDisposition.isTerminal ? "Closed / no callback" : formatDateOnly(nextActionDate)}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Current Due Date</Label>
                <Input value={formatDateOnly(opportunity.dueDate)} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Next Action Date</Label>
                <Input
                  type="date"
                  value={nextActionDate}
                  disabled={selectedDisposition.isTerminal}
                  onChange={(event) => setNextActionDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="resize-none" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Opportunity History</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>View Full History</Button>
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {activitiesLoading ? (
                  [1, 2].map((item) => <Skeleton key={item} className="h-12 w-full" />)
                ) : !activities?.length ? (
                  <p className="text-sm text-muted-foreground">No disposition history yet.</p>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="rounded-md bg-muted/30 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{activity.dispositionLabel || activity.dispositionKey || "Activity"}</span>
                        <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
                      </div>
                      {activity.nextActionDate ? <p className="text-xs text-muted-foreground">Next action {formatDateOnly(activity.nextActionDate)}</p> : null}
                      {activity.notes ? <p className="mt-1 text-xs text-muted-foreground">{activity.notes}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Saving..." : "Save Disposition"}
              </Button>
            </div>
          </div>
        )}
        <OpportunityHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} opportunity={opportunity} />
      </DialogContent>
    </Dialog>
  );
}
