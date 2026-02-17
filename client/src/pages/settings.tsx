import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Settings as SettingsIcon, Wrench, Trash2 } from "lucide-react";
import type { ServiceType } from "@shared/schema";

function ServiceTypeForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    defaultPrice: "",
    estimatedDuration: "",
    category: "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/service-types", {
        ...data,
        defaultPrice: data.defaultPrice || null,
        estimatedDuration: data.estimatedDuration ? parseInt(data.estimatedDuration) : null,
        category: data.category || null,
        description: data.description || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-types"] });
      toast({ title: "Service type created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5"><Label>Name *</Label><Input data-testid="input-st-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Default Price ($)</Label><Input type="number" step="0.01" value={form.defaultPrice} onChange={(e) => setForm((p) => ({ ...p, defaultPrice: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={form.estimatedDuration} onChange={(e) => setForm((p) => ({ ...p, estimatedDuration: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5"><Label>Category</Label><Input placeholder="e.g., General, Termite, Wildlife" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !form.name} data-testid="button-save-service-type">{mutation.isPending ? "Saving..." : "Create"}</Button></div>
    </form>
  );
}

export default function Settings() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: serviceTypes, isLoading } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Configure your PestFlow CRM</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Wrench className="h-4 w-4" /> Service Types</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-service-type"><Plus className="h-3 w-3 mr-1" /> Add Type</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>New Service Type</DialogTitle></DialogHeader><ServiceTypeForm onClose={() => setDialogOpen(false)} /></DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !serviceTypes || serviceTypes.length === 0 ? (
            <div className="text-center py-8">
              <Wrench className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No service types configured</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>Add Service Type</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {serviceTypes.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`card-service-type-${st.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{st.name}</span>
                      {st.category && <Badge variant="outline" className="text-xs">{st.category}</Badge>}
                    </div>
                    {st.description && <p className="text-xs text-muted-foreground mt-0.5">{st.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    {st.defaultPrice && <span className="font-semibold">${parseFloat(st.defaultPrice).toFixed(2)}</span>}
                    {st.estimatedDuration && <span className="text-xs text-muted-foreground">{st.estimatedDuration} min</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Company Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Company Name</Label><Input placeholder="Your Pest Control Co." data-testid="input-company-name-settings" /></div>
            <div className="space-y-1.5"><Label>License Number</Label><Input placeholder="PCO-XXXXX" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="(555) 123-4567" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input placeholder="office@pestcontrol.com" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Company settings will be used in reports and invoices. (Save functionality coming soon)</p>
        </CardContent>
      </Card>
    </div>
  );
}
