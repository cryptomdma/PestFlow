import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Appointment, Service, ServiceType, Technician } from "@shared/schema";

interface MaterialLine {
  productName: string;
  amountApplied: string;
  applicationLocation: string;
  epaRegNumber: string;
  applicationMethod: string;
}

interface ServiceCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
  appointment?: Appointment | null;
  technicians?: Technician[];
  serviceTypes?: ServiceType[];
  defaultTechnicianId?: string | null;
  onCompleted?: () => void;
}

function formatDateTimeLocalValue(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function ServiceCompletionDialog({
  open,
  onOpenChange,
  service,
  appointment,
  technicians,
  serviceTypes,
  defaultTechnicianId,
  onCompleted,
}: ServiceCompletionDialogProps) {
  const { toast } = useToast();
  const [technicianId, setTechnicianId] = useState("");
  const [serviceDate, setServiceDate] = useState(formatDateTimeLocalValue(new Date()));
  const [notes, setNotes] = useState("");
  const [targetPests, setTargetPests] = useState("");
  const [areasServiced, setAreasServiced] = useState("");
  const [conditionsFound, setConditionsFound] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [materials, setMaterials] = useState<MaterialLine[]>([
    { productName: "", amountApplied: "", applicationLocation: "", epaRegNumber: "", applicationMethod: "" },
  ]);

  const serviceTypeName = useMemo(() => {
    return serviceTypes?.find((serviceType) => serviceType.id === service?.serviceTypeId)?.name ?? "Service";
  }, [service?.serviceTypeId, serviceTypes]);

  useEffect(() => {
    if (!open || !service) return;
    setTechnicianId(defaultTechnicianId || service.assignedTechnicianId || appointment?.assignedTechnicianId || "");
    setServiceDate(formatDateTimeLocalValue(appointment?.scheduledDate ?? new Date()));
    setNotes("");
    setTargetPests("");
    setAreasServiced("");
    setConditionsFound("");
    setRecommendations("");
    setMaterials([{ productName: "", amountApplied: "", applicationLocation: "", epaRegNumber: "", applicationMethod: "" }]);
  }, [appointment?.assignedTechnicianId, appointment?.scheduledDate, defaultTechnicianId, open, service]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("Service is required");
      const response = await apiRequest("POST", `/api/services/${service.id}/complete`, {
        appointmentId: appointment?.id ?? service.appointmentId ?? null,
        technicianId: technicianId || null,
        serviceDate,
        notes,
        targetPests: targetPests.split(",").map((value) => value.trim()).filter(Boolean),
        areasServiced,
        conditionsFound,
        recommendations,
        confirmed: true,
        productApplications: materials
          .filter((material) => material.productName.trim())
          .map((material) => ({
            productName: material.productName,
            amountApplied: material.amountApplied || null,
            applicationLocation: material.applicationLocation || null,
            epaRegNumber: material.epaRegNumber || null,
            applicationMethod: material.applicationMethod || null,
          })),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Service completed" });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/by-location"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-records/by-location"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
      onCompleted?.();
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Unable to complete service", description: error.message, variant: "destructive" }),
  });

  const updateMaterial = (index: number, key: keyof MaterialLine, value: string) => {
    setMaterials((current) => current.map((material, currentIndex) => currentIndex === index ? { ...material, [key]: value } : material));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complete Service</DialogTitle>
        </DialogHeader>
        {service && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{serviceTypeName}</p>
              {appointment?.scheduledDate && <p className="text-muted-foreground">Scheduled {new Date(appointment.scheduledDate).toLocaleString()}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Technician</Label>
                <Select value={technicianId || "UNASSIGNED"} onValueChange={(value) => setTechnicianId(value === "UNASSIGNED" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Select technician" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    {(technicians ?? []).map((technician) => (
                      <SelectItem key={technician.id} value={technician.id}>
                        {technician.displayName} ({technician.licenseId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service Date</Label>
                <Input type="datetime-local" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Completion Notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What was completed?" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Target Pests</Label>
                <Input value={targetPests} onChange={(event) => setTargetPests(event.target.value)} placeholder="Ants, roaches, spiders" />
              </div>
              <div className="space-y-2">
                <Label>Areas Serviced</Label>
                <Input value={areasServiced} onChange={(event) => setAreasServiced(event.target.value)} placeholder="Exterior perimeter, garage" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Conditions Found</Label>
                <Textarea value={conditionsFound} onChange={(event) => setConditionsFound(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Materials / Chemicals Used</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((current) => [...current, { productName: "", amountApplied: "", applicationLocation: "", epaRegNumber: "", applicationMethod: "" }])}>
                  Add Material
                </Button>
              </div>
              {materials.map((material, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  <Input placeholder="Product/material" value={material.productName} onChange={(event) => updateMaterial(index, "productName", event.target.value)} />
                  <Input placeholder="Amount" value={material.amountApplied} onChange={(event) => updateMaterial(index, "amountApplied", event.target.value)} />
                  <Input placeholder="Application location" value={material.applicationLocation} onChange={(event) => updateMaterial(index, "applicationLocation", event.target.value)} />
                  <Input placeholder="EPA reg #" value={material.epaRegNumber} onChange={(event) => updateMaterial(index, "epaRegNumber", event.target.value)} />
                  <Input className="sm:col-span-2" placeholder="Application method" value={material.applicationMethod} onChange={(event) => updateMaterial(index, "applicationMethod", event.target.value)} />
                </div>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending || !serviceDate}>
                {completeMutation.isPending ? "Completing..." : "Complete Service"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
