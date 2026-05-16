import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceCompletionDialog } from "@/components/service-completion-dialog";
import { queryClient } from "@/lib/queryClient";
import { CalendarDays, CheckCircle2, ClipboardList, MapPin } from "lucide-react";
import type { Appointment, Customer, Location, Service, ServiceRecord, ServiceType, Technician } from "@shared/schema";

interface TechnicianWorkService {
  service: Service;
  serviceRecord?: ServiceRecord | null;
}

interface TechnicianWorkVisit {
  appointment: Appointment;
  customer?: Customer | null;
  location?: Location | null;
  services: TechnicianWorkService[];
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCustomerLabel(customer?: Customer | null, location?: Location | null) {
  const fullName = `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim();
  return fullName || customer?.companyName || location?.name || "Location";
}

function getAddress(location?: Location | null) {
  if (!location) return "Address unavailable";
  return [location.address, location.city, location.state, location.zip].filter(Boolean).join(", ");
}

function formatTimeRange(appointment: Appointment) {
  const start = new Date(appointment.scheduledDate);
  const end = appointment.scheduledEndDate ? new Date(appointment.scheduledEndDate) : null;
  const startLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endLabel = end?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
}

export default function TechnicianWork() {
  const [selectedDate, setSelectedDate] = useState(formatDateInputValue(new Date()));
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [completionContext, setCompletionContext] = useState<{ service: Service; appointment: Appointment } | null>(null);

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: visits, isLoading: visitsLoading } = useQuery<TechnicianWorkVisit[]>({
    queryKey: [`/api/technicians/${selectedTechnicianId}/work?date=${selectedDate}`],
    enabled: !!selectedTechnicianId && !!selectedDate,
  });

  const activeTechnicians = useMemo(() => (technicians ?? []).filter((technician) => technician.status === "ACTIVE"), [technicians]);
  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);

  const selectedTechnician = technicians?.find((technician) => technician.id === selectedTechnicianId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">Mobile-first completion workflow</p>
        <h1 className="text-2xl font-semibold tracking-tight">Technician Work</h1>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Technician</Label>
            {techniciansLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedTechnicianId || "NONE"} onValueChange={(value) => setSelectedTechnicianId(value === "NONE" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select technician" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select technician</SelectItem>
                  {activeTechnicians.map((technician) => (
                    <SelectItem key={technician.id} value={technician.id}>
                      {technician.displayName} ({technician.licenseId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!selectedTechnicianId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
            Select a technician to view scheduled work.
          </CardContent>
        </Card>
      ) : visitsLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !visits?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
            No scheduled work for {selectedTechnician?.displayName ?? "this technician"} on this date.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => (
            <Card key={visit.appointment.id} className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{formatTimeRange(visit.appointment)}</CardTitle>
                    <p className="mt-1 font-medium">{getCustomerLabel(visit.customer, visit.location)}</p>
                    <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{getAddress(visit.location)}</span>
                    </p>
                  </div>
                  <Badge variant={visit.appointment.status === "completed" ? "default" : "secondary"}>{visit.appointment.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {visit.appointment.notes && (
                  <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                    {visit.appointment.notes}
                  </div>
                )}
                {visit.services.map(({ service, serviceRecord }) => {
                  const completed = service.status === "COMPLETED" || !!serviceRecord;
                  return (
                    <div key={service.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{service.notes || "No service instructions."}</p>
                        </div>
                        <Badge variant={completed ? "default" : "outline"}>{completed ? "Completed" : service.status}</Badge>
                      </div>
                      {serviceRecord && (
                        <div className="mt-3 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1 font-medium text-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Completed {new Date(serviceRecord.serviceDate).toLocaleString()}</div>
                          {serviceRecord.technicianLicenseNumber && <div>License #{serviceRecord.technicianLicenseNumber}</div>}
                          {serviceRecord.notes && <div className="mt-1 whitespace-pre-wrap">{serviceRecord.notes}</div>}
                        </div>
                      )}
                      <Button
                        type="button"
                        className="mt-3 h-11 w-full"
                        variant={completed ? "outline" : "default"}
                        onClick={() => setCompletionContext({ service, appointment: visit.appointment })}
                      >
                        {completed ? "Edit Completion" : "Complete Service"}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ServiceCompletionDialog
        open={!!completionContext}
        onOpenChange={(open) => !open && setCompletionContext(null)}
        service={completionContext?.service ?? null}
        appointment={completionContext?.appointment ?? null}
        technicians={technicians}
        serviceTypes={serviceTypes}
        defaultTechnicianId={selectedTechnicianId}
        onCompleted={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/technicians/${selectedTechnicianId}/work?date=${selectedDate}`] });
          setCompletionContext(null);
        }}
      />
    </div>
  );
}
