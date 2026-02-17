import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  ClipboardList,
  CheckCircle,
  Beaker,
  AlertTriangle,
} from "lucide-react";
import type { Customer, ServiceRecord, ProductApplication, ServiceType, Location } from "@shared/schema";

function ProductApplicationForm({
  products,
  setProducts,
}: {
  products: Array<{
    productName: string;
    epaRegNumber: string;
    dilutionRate: string;
    amountApplied: string;
    applicationMethod: string;
    device: string;
    applicationLocation: string;
  }>;
  setProducts: (p: typeof products) => void;
}) {
  const addProduct = () => {
    setProducts([
      ...products,
      { productName: "", epaRegNumber: "", dilutionRate: "", amountApplied: "", applicationMethod: "", device: "", applicationLocation: "" },
    ]);
  };

  const updateProduct = (idx: number, field: string, value: string) => {
    const updated = [...products];
    (updated[idx] as any)[field] = value;
    setProducts(updated);
  };

  const removeProduct = (idx: number) => {
    setProducts(products.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Products Applied</Label>
        <Button type="button" variant="outline" size="sm" onClick={addProduct} data-testid="button-add-product">
          <Plus className="h-3 w-3 mr-1" /> Add Product
        </Button>
      </div>
      {products.map((p, idx) => (
        <Card key={idx} className="relative">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Product {idx + 1}</span>
              <Button type="button" variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => removeProduct(idx)}>Remove</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Product Name *</Label><Input data-testid={`input-product-name-${idx}`} value={p.productName} onChange={(e) => updateProduct(idx, "productName", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">EPA Reg #</Label><Input data-testid={`input-epa-${idx}`} value={p.epaRegNumber} onChange={(e) => updateProduct(idx, "epaRegNumber", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">Dilution Rate</Label><Input value={p.dilutionRate} onChange={(e) => updateProduct(idx, "dilutionRate", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Amount Applied</Label><Input value={p.amountApplied} onChange={(e) => updateProduct(idx, "amountApplied", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Method</Label><Input value={p.applicationMethod} onChange={(e) => updateProduct(idx, "applicationMethod", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Device</Label><Input value={p.device} onChange={(e) => updateProduct(idx, "device", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Application Location</Label><Input value={p.applicationLocation} onChange={(e) => updateProduct(idx, "applicationLocation", e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ServiceRecordForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: allLocations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });

  const [form, setForm] = useState({
    customerId: "",
    locationId: "",
    serviceTypeId: "",
    serviceDate: new Date().toISOString().slice(0, 16),
    technicianName: "",
    targetPests: "",
    areasServiced: "",
    conditionsFound: "",
    recommendations: "",
    customerSignature: false,
    confirmed: false,
  });

  const [products, setProducts] = useState<Array<{
    productName: string; epaRegNumber: string; dilutionRate: string;
    amountApplied: string; applicationMethod: string; device: string; applicationLocation: string;
  }>>([]);

  const customerLocations = allLocations?.filter((l) => l.customerId === form.customerId) || [];

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/service-records", {
        ...data,
        serviceDate: new Date(data.serviceDate).toISOString(),
        targetPests: data.targetPests ? data.targetPests.split(",").map((s) => s.trim()) : [],
        locationId: data.locationId || null,
        serviceTypeId: data.serviceTypeId || null,
        appointmentId: null,
      });
      const record = await res.json();

      for (const product of products) {
        if (product.productName) {
          await apiRequest("POST", "/api/product-applications", {
            serviceRecordId: record.id,
            ...product,
          });
        }
      }

      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
      toast({ title: "Service record created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1.5">
        <Label>Customer *</Label>
        <Select value={form.customerId} onValueChange={(v) => setForm((p) => ({ ...p, customerId: v, locationId: "" }))}>
          <SelectTrigger data-testid="select-sr-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
          <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {customerLocations.length > 0 && (
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Select value={form.locationId} onValueChange={(v) => setForm((p) => ({ ...p, locationId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
            <SelectContent>{customerLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} - {l.address}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Service Type</Label>
          <Select value={form.serviceTypeId} onValueChange={(v) => setForm((p) => ({ ...p, serviceTypeId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>{serviceTypes?.map((st) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Service Date *</Label>
          <Input type="datetime-local" data-testid="input-service-date" value={form.serviceDate} onChange={(e) => setForm((p) => ({ ...p, serviceDate: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5"><Label>Technician</Label><Input data-testid="input-technician" value={form.technicianName} onChange={(e) => setForm((p) => ({ ...p, technicianName: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Target Pests (comma-separated)</Label><Input value={form.targetPests} onChange={(e) => setForm((p) => ({ ...p, targetPests: e.target.value }))} placeholder="e.g., Ants, Roaches, Spiders" /></div>
      <div className="space-y-1.5"><Label>Areas Serviced</Label><Input value={form.areasServiced} onChange={(e) => setForm((p) => ({ ...p, areasServiced: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Conditions Found</Label><Textarea value={form.conditionsFound} onChange={(e) => setForm((p) => ({ ...p, conditionsFound: e.target.value }))} className="resize-none" /></div>
      <div className="space-y-1.5"><Label>Recommendations</Label><Textarea value={form.recommendations} onChange={(e) => setForm((p) => ({ ...p, recommendations: e.target.value }))} className="resize-none" /></div>

      <ProductApplicationForm products={products} setProducts={setProducts} />

      <div className="flex items-center gap-4 pt-2">
        <div className="flex items-center gap-2">
          <Checkbox id="signature" checked={form.customerSignature} onCheckedChange={(c) => setForm((p) => ({ ...p, customerSignature: !!c }))} />
          <Label htmlFor="signature" className="text-sm">Customer Signature</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="confirmed" checked={form.confirmed} onCheckedChange={(c) => setForm((p) => ({ ...p, confirmed: !!c }))} />
          <Label htmlFor="confirmed" className="text-sm">Confirmed</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.customerId} data-testid="button-save-service-record">
          {mutation.isPending ? "Saving..." : "Save Record"}
        </Button>
      </div>
    </form>
  );
}

export default function Services() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: services, isLoading } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: productApps } = useQuery<ProductApplication[]>({ queryKey: ["/api/product-applications"] });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/service-records/${id}`, { confirmed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
      toast({ title: "Service record confirmed" });
    },
  });

  const filtered = services?.filter((s) => {
    const cust = customers?.find((c) => c.id === s.customerId);
    const text = `${cust?.firstName || ""} ${cust?.lastName || ""} ${s.technicianName || ""} ${s.areasServiced || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  }) || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Service History</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Complete service records with compliance documentation</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-service-record">
              <Plus className="h-4 w-4 mr-2" />
              New Service Record
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Service Record</DialogTitle></DialogHeader>
            <ServiceRecordForm onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search service records..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-services" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No service records</h3>
            <p className="text-sm text-muted-foreground mb-4">Document your first service</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Service Record</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered
            .sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime())
            .map((svc) => {
              const cust = customers?.find((c) => c.id === svc.customerId);
              const apps = productApps?.filter((p) => p.serviceRecordId === svc.id) || [];
              return (
                <Card key={svc.id} data-testid={`card-service-${svc.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{cust ? `${cust.firstName} ${cust.lastName}` : "Unknown"}</span>
                          <Badge variant="secondary" className="text-xs">
                            {new Date(svc.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </Badge>
                          {svc.confirmed ? (
                            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                              <CheckCircle className="h-3 w-3 mr-1" /> Confirmed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-chart-3/10 text-chart-3">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Unconfirmed
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                          {svc.technicianName && <p>Technician: {svc.technicianName}</p>}
                          {svc.areasServiced && <p>Areas: {svc.areasServiced}</p>}
                          {svc.targetPests && svc.targetPests.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span>Pests:</span>
                              {svc.targetPests.map((pest, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{pest}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        {apps.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-xs font-semibold flex items-center gap-1"><Beaker className="h-3 w-3" /> Products Applied:</p>
                            {apps.map((app) => (
                              <div key={app.id} className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                                <span className="font-medium text-foreground">{app.productName}</span>
                                {app.epaRegNumber && <span> | EPA: {app.epaRegNumber}</span>}
                                {app.dilutionRate && <span> | Rate: {app.dilutionRate}</span>}
                                {app.amountApplied && <span> | Amt: {app.amountApplied}</span>}
                                {app.device && <span> | Device: {app.device}</span>}
                                {app.applicationLocation && <span> | Location: {app.applicationLocation}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {!svc.confirmed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmMutation.mutate(svc.id)}
                          disabled={confirmMutation.isPending}
                          data-testid={`button-confirm-${svc.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" /> Confirm
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
