import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import type { Appointment, Customer, Location, ProductApplication, Service, ServiceRecord, ServiceType, Technician } from "@shared/schema";

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCustomerLabel(customer?: Customer, location?: Location) {
  const fullName = `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim();
  return fullName || customer?.companyName || location?.name || "Location";
}

function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "Not tracked";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function statusLabel(record: ServiceRecord) {
  if (record.confirmed || record.ticketStatus === "FINALIZED") return "Finalized";
  if (record.ticketStatus === "REOPENED") return "Reopened";
  return "Pending Review";
}

export default function ServiceTicketReview() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState("PENDING_REVIEW");
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const { data: serviceRecords } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: services } = useQuery<Service[]>({ queryKey: ["/api/services"] });
  const { data: appointments } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });
  const { data: productApplications } = useQuery<ProductApplication[]>({ queryKey: ["/api/product-applications"] });

  const serviceById = useMemo(() => new Map((services ?? []).map((service) => [service.id, service])), [services]);
  const appointmentById = useMemo(() => new Map((appointments ?? []).map((appointment) => [appointment.id, appointment])), [appointments]);
  const serviceTypeById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType])), [serviceTypes]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const applicationsByRecordId = useMemo(() => {
    const map = new Map<string, ProductApplication[]>();
    for (const application of productApplications ?? []) {
      const existing = map.get(application.serviceRecordId) ?? [];
      existing.push(application);
      map.set(application.serviceRecordId, existing);
    }
    return map;
  }, [productApplications]);

  const selectedRecord = useMemo(() => serviceRecords?.find((record) => record.id === selectedRecordId) ?? null, [selectedRecordId, serviceRecords]);
  const selectedService = selectedRecord?.serviceId ? serviceById.get(selectedRecord.serviceId) ?? null : null;
  const selectedAppointment = selectedRecord?.appointmentId ? appointmentById.get(selectedRecord.appointmentId) ?? null : null;
  const selectedLocation = selectedRecord?.locationId ? locationById.get(selectedRecord.locationId) ?? null : null;
  const selectedCustomer = selectedRecord ? customerById.get(selectedRecord.customerId) ?? null : null;
  const selectedMaterials = selectedRecord ? applicationsByRecordId.get(selectedRecord.id) ?? [] : [];

  const filteredRecords = useMemo(() => {
    return (serviceRecords ?? []).filter((record) => {
      const service = record.serviceId ? serviceById.get(record.serviceId) : undefined;
      if (statusFilter === "PENDING_REVIEW" && (record.confirmed || record.ticketStatus === "FINALIZED")) return false;
      if (statusFilter === "FINALIZED" && !(record.confirmed || record.ticketStatus === "FINALIZED")) return false;
      if (statusFilter === "REOPENED" && record.ticketStatus !== "REOPENED") return false;
      if (technicianFilter !== "ALL" && record.technicianId !== technicianFilter) return false;
      if (serviceTypeFilter !== "ALL" && (record.serviceTypeId || service?.serviceTypeId) !== serviceTypeFilter) return false;
      const postedDate = (record.postedAt || record.serviceDate) ? new Date(record.postedAt || record.serviceDate).toISOString().slice(0, 10) : "";
      if (dateFrom && postedDate < dateFrom) return false;
      if (dateTo && postedDate > dateTo) return false;
      return true;
    }).sort((a, b) => new Date(b.postedAt || b.serviceDate).getTime() - new Date(a.postedAt || a.serviceDate).getTime());
  }, [dateFrom, dateTo, serviceById, serviceRecords, serviceTypeFilter, statusFilter, technicianFilter]);

  const invalidateReviewData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
  };

  const finalizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/service-records/${id}/finalize`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Service ticket finalized", description: "The service is now completed and billing-ready." });
      invalidateReviewData();
    },
    onError: (error: Error) => toast({ title: "Unable to finalize ticket", description: error.message, variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/service-records/${id}/reopen`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Service ticket reopened", description: "Technician edits are available again." });
      setReopenReason("");
      invalidateReviewData();
    },
    onError: (error: Error) => toast({ title: "Unable to reopen ticket", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Office review and finalization</p>
        <h1 className="text-2xl font-semibold tracking-tight">Service Ticket Review</h1>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                <SelectItem value="FINALIZED">Finalized</SelectItem>
                <SelectItem value="REOPENED">Reopened</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Technician</Label>
            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All technicians</SelectItem>
                {(technicians ?? []).map((technician) => <SelectItem key={technician.id} value={technician.id}>{technician.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Service Type</Label>
            <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All service types</SelectItem>
                {(serviceTypes ?? []).map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <div className="flex gap-2">
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <Button type="button" variant="outline" onClick={() => { const today = formatDateInputValue(new Date()); setDateFrom(today); setDateTo(today); }}>Today</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Review Queue ({filteredRecords.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!filteredRecords.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No service tickets match the current filters.</div>
          ) : filteredRecords.map((record) => {
            const service = record.serviceId ? serviceById.get(record.serviceId) : undefined;
            const appointment = record.appointmentId ? appointmentById.get(record.appointmentId) : undefined;
            const location = record.locationId ? locationById.get(record.locationId) : undefined;
            const customer = customerById.get(record.customerId);
            const serviceType = serviceTypeById.get(record.serviceTypeId || service?.serviceTypeId || "");
            const technician = record.technicianId ? technicianById.get(record.technicianId) : undefined;
            return (
              <button key={record.id} type="button" onClick={() => setSelectedRecordId(record.id)} className="grid w-full gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/20 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
                <div>
                  <p className="font-medium">{getCustomerLabel(customer, location)}</p>
                  <p className="text-xs text-muted-foreground">{location ? [location.address, location.city, location.state].filter(Boolean).join(", ") : "Location unavailable"}</p>
                </div>
                <div>
                  <p className="text-sm">{serviceType?.name || "Service"}</p>
                  <p className="text-xs text-muted-foreground">{service?.agreementId ? "Agreement" : "Non-agreement"}</p>
                </div>
                <div>
                  <p className="text-sm">{record.technicianName || technician?.displayName || "Technician unavailable"}</p>
                  <p className="text-xs text-muted-foreground">License {record.technicianLicenseNumber || technician?.licenseId || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm">{record.postedAt ? new Date(record.postedAt).toLocaleString() : new Date(record.serviceDate).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Duration {formatDuration(appointment?.durationMinutes)}</p>
                </div>
                <Badge variant={record.confirmed ? "default" : "secondary"}>{statusLabel(record)}</Badge>
                {record.followUpRequired ? <Badge className="bg-red-600 text-white hover:bg-red-600">Follow-up</Badge> : null}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRecord} onOpenChange={(open) => { if (!open) setSelectedRecordId(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Service Ticket Review</DialogTitle></DialogHeader>
          {selectedRecord ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{getCustomerLabel(selectedCustomer ?? undefined, selectedLocation ?? undefined)}</p>
                    <p className="text-sm text-muted-foreground">{serviceTypeById.get(selectedRecord.serviceTypeId || selectedService?.serviceTypeId || "")?.name || "Service"}</p>
                    <p className="text-xs text-muted-foreground">{selectedService?.agreementId ? "Agreement service" : "Non-agreement service"}</p>
                  </div>
                  <Badge variant={selectedRecord.confirmed ? "default" : "secondary"}>{statusLabel(selectedRecord)}</Badge>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p>
                  <p className="mt-1 font-medium">{selectedRecord.technicianName || "Not captured"}</p>
                  <p className="text-xs text-muted-foreground">License {selectedRecord.technicianLicenseNumber || "N/A"}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Timing</p>
                  <p className="mt-1 text-sm">In: {selectedAppointment?.timeInAt ? new Date(selectedAppointment.timeInAt).toLocaleString() : "Not tracked"}</p>
                  <p className="text-sm">Out: {selectedAppointment?.timeOutAt ? new Date(selectedAppointment.timeOutAt).toLocaleString() : "Not tracked"}</p>
                  <p className="text-sm">Duration: {formatDuration(selectedAppointment?.durationMinutes)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing Readiness</p>
                  <p className="mt-1 font-medium">{selectedRecord.readyForBilling ? "Ready for billing" : "Not billing-ready"}</p>
                  <p className="text-xs text-muted-foreground">Only finalized services are billing eligible.</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{selectedRecord.notes || "No notes."}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Target Pests</p>
                  <p className="mt-1 text-sm">{selectedRecord.targetPests?.length ? selectedRecord.targetPests.join(", ") : "None captured."}</p>
                </div>
              </div>
              {selectedRecord.followUpRequired ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-950">
                  <p className="text-sm font-bold uppercase tracking-wide">Follow-up Required</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{selectedRecord.followUpNotes || "No follow-up notes provided."}</p>
                </div>
              ) : null}
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Materials</p>
                {!selectedMaterials.length ? (
                  <p className="mt-1 text-sm text-muted-foreground">No materials logged.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedMaterials.map((material) => (
                      <div key={material.id} className="rounded-md bg-muted/20 p-2 text-sm">
                        <p className="font-medium">{material.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[material.epaRegNumber && `EPA ${material.epaRegNumber}`, material.dilutionLabel, material.amountApplied && `${material.amountApplied} ${material.unit || ""}`.trim(), material.applicationLocation, material.activeIngredientAmount && `AI ${material.activeIngredientAmount}`].filter(Boolean).join(" | ")}
                        </p>
                        {material.applicationMethod ? <p className="text-xs text-muted-foreground">Method: {material.applicationMethod}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedRecord.reopenedAt ? (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Reopen Audit</p>
                  <p className="text-muted-foreground">Reopened {new Date(selectedRecord.reopenedAt).toLocaleString()} by {selectedRecord.reopenedByLabel || "Office"}</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedRecord.reopenReason}</p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Reopen Reason</Label>
                <Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Required if reopening a posted/finalized ticket" />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => selectedLocation && setLocation(`/customers/${selectedRecord.customerId}?locationId=${selectedLocation.id}`)}>Open Location</Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setSelectedRecordId(null)}>Close</Button>
                  <Button type="button" variant="secondary" onClick={() => reopenMutation.mutate({ id: selectedRecord.id, reason: reopenReason })} disabled={reopenMutation.isPending || !reopenReason.trim()}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Reopen
                  </Button>
                  <Button type="button" onClick={() => finalizeMutation.mutate(selectedRecord.id)} disabled={finalizeMutation.isPending || !!selectedRecord.confirmed}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Finalize
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
