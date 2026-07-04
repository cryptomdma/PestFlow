import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ServiceCompletionDialog } from "@/components/service-completion-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Clock3, MapPin, Navigation } from "lucide-react";
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

function addDaysToInputDate(value: string, days: number) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return formatDateInputValue(date);
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

function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "Not tracked";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function hasLocalTicketDraft(serviceId: string) {
  return !!localStorage.getItem(`pestflow.service-ticket-draft.${serviceId}`);
}

function getTicketActionLabel(service: Service, serviceRecord?: ServiceRecord | null) {
  if (!serviceRecord) return hasLocalTicketDraft(service.id) ? "Resume Service Ticket" : "Create Service Ticket";
  if (serviceRecord.confirmed || serviceRecord.ticketStatus === "FINALIZED") return "View Finalized Ticket";
  if (serviceRecord.ticketStatus === "REOPENED") return "Edit Service Ticket";
  return "View Service Ticket";
}

function canOpenTicketEditor(serviceRecord?: ServiceRecord | null) {
  return !serviceRecord || serviceRecord.ticketStatus === "REOPENED";
}

export default function TechnicianWork() {
  const [selectedDate, setSelectedDate] = useState(formatDateInputValue(new Date()));
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [completionContext, setCompletionContext] = useState<{ service: Service; appointment: Appointment } | null>(null);
  const [detailVisit, setDetailVisit] = useState<TechnicianWorkVisit | null>(null);
  const [cancelAction, setCancelAction] = useState<"cancel" | "reschedule" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: cancelReasonSettings } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/appointment-cancel-reasons"] });
  const { data: visits, isLoading: visitsLoading } = useQuery<TechnicianWorkVisit[]>({
    queryKey: [`/api/technicians/${selectedTechnicianId}/work?date=${selectedDate}`],
    enabled: !!selectedTechnicianId && !!selectedDate,
  });

  const activeTechnicians = useMemo(() => (technicians ?? []).filter((technician) => technician.status === "ACTIVE"), [technicians]);
  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);

  const selectedTechnician = technicians?.find((technician) => technician.id === selectedTechnicianId) ?? null;
  const cancelReasons = cancelReasonSettings?.reasons?.length ? cancelReasonSettings.reasons : ["Weather", "Gates locked", "Schedule conflict", "Customer not home", "Canceled by company", "Customer requested reschedule", "Access issue", "Other"];
  const refreshWork = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/technicians/${selectedTechnicianId}/work?date=${selectedDate}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/service-records"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
  };
  const timeInMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("POST", `/api/appointments/${appointmentId}/time-in`, {});
      return response.json();
    },
    onSuccess: refreshWork,
  });
  const cancelRescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!detailVisit || !cancelAction) throw new Error("Appointment is not selected");
      const response = await apiRequest("POST", `/api/appointments/${detailVisit.appointment.id}/cancel-reschedule`, {
        reason: cancelReason,
        notes: cancelNotes,
        rescheduleRequested: cancelAction === "reschedule",
      });
      return response.json();
    },
    onSuccess: () => {
      refreshWork();
      setCancelAction(null);
      setCancelReason("");
      setCancelNotes("");
      setDetailVisit(null);
    },
  });

  const openCancelAction = (action: "cancel" | "reschedule") => {
    setCancelAction(action);
    setCancelReason("");
    setCancelNotes("");
  };
  const timeOutMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("POST", `/api/appointments/${appointmentId}/time-out`, {});
      return response.json();
    },
    onSuccess: refreshWork,
  });

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
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDate(addDaysToInputDate(selectedDate, -1))}>Prev</Button>
              <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDate(addDaysToInputDate(selectedDate, 1))}>Next</Button>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedDate(formatDateInputValue(new Date()))}>Today</Button>
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
          {visits.map((visit) => {
            const completedCount = visit.services.filter(({ service, serviceRecord }) => service.status === "COMPLETED" || !!serviceRecord).length;
            const serviceLabels = visit.services.map(({ service }) => serviceTypeNameById.get(service.serviceTypeId || "") || "Service");
            return (
            <Card key={visit.appointment.id} className="overflow-hidden transition-colors hover:bg-muted/10" onClick={() => setDetailVisit(visit)}>
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{formatTimeRange(visit.appointment)}</CardTitle>
                    <p className="mt-1 font-medium">{getCustomerLabel(visit.customer, visit.location)}</p>
                    <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{getAddress(visit.location)}</span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{serviceLabels.join(", ")}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={visit.appointment.status === "completed" ? "default" : "secondary"}>{visit.appointment.status}</Badge>
                    <span className="text-xs text-muted-foreground">{completedCount}/{visit.services.length} posted</span>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );})}
        </div>
      )}

      <Dialog open={!!detailVisit} onOpenChange={(open) => !open && setDetailVisit(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Appointment Details</DialogTitle></DialogHeader>
          {detailVisit && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="font-medium">{getCustomerLabel(detailVisit.customer, detailVisit.location)}</p>
                <p className="text-sm text-muted-foreground">{formatTimeRange(detailVisit.appointment)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{getAddress(detailVisit.location)}</p>
                <div className="mt-3 grid gap-2 rounded-md border bg-background p-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">Time In</p>
                    <p className="font-medium">{detailVisit.appointment.timeInAt ? new Date(detailVisit.appointment.timeInAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Not started"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Time Out</p>
                    <p className="font-medium">{detailVisit.appointment.timeOutAt ? new Date(detailVisit.appointment.timeOutAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Not timed out"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{formatDuration(detailVisit.appointment.durationMinutes)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!detailVisit.appointment.timeInAt ? (
                    <Button type="button" size="sm" onClick={() => timeInMutation.mutate(detailVisit.appointment.id)} disabled={timeInMutation.isPending}>
                      <Clock3 className="mr-1 h-3.5 w-3.5" /> Time In
                    </Button>
                  ) : null}
                  {detailVisit.appointment.timeInAt && !detailVisit.appointment.timeOutAt ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => timeOutMutation.mutate(detailVisit.appointment.id)} disabled={timeOutMutation.isPending}>
                      Time Out
                    </Button>
                  ) : null}
                  {detailVisit.appointment.status !== "canceled" && detailVisit.appointment.status !== "completed" ? (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => openCancelAction("reschedule")}>
                        Request Reschedule
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => openCancelAction("cancel")}>
                        Cancel Appointment
                      </Button>
                    </>
                  ) : null}
                </div>
                {detailVisit.appointment.status === "canceled" && (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm">
                    <p className="font-medium text-destructive">Appointment canceled</p>
                    {"cancelReason" in detailVisit.appointment && detailVisit.appointment.cancelReason ? (
                      <p className="mt-1 text-muted-foreground">Reason: {detailVisit.appointment.cancelReason}</p>
                    ) : null}
                  </div>
                )}
                {detailVisit.location && (
                  <a
                    className="mt-3 inline-flex items-center gap-2 text-sm text-primary underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getAddress(detailVisit.location))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation className="h-3.5 w-3.5" /> Open in Google Maps
                  </a>
                )}
              </div>
              {detailVisit.appointment.notes && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Appointment Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{detailVisit.appointment.notes}</p>
                </div>
              )}
              {detailVisit.location?.notes && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Location Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{detailVisit.location.notes}</p>
                </div>
              )}
              <div className="space-y-3">
                <p className="text-sm font-medium">Linked Services</p>
                {detailVisit.services.map(({ service, serviceRecord }) => {
                  const posted = service.status === "COMPLETED" || !!serviceRecord;
                  return (
                    <div key={service.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{service.notes || "No service instructions."}</p>
                        </div>
                        <Badge variant={posted ? "default" : "outline"}>{posted ? "Ticket Posted" : service.status}</Badge>
                      </div>
                      {serviceRecord && (
                        <div className="mt-3 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1 font-medium text-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Posted {new Date(serviceRecord.serviceDate).toLocaleString()}</div>
                          {serviceRecord.technicianLicenseNumber && <div>License #{serviceRecord.technicianLicenseNumber}</div>}
                          {serviceRecord.notes && <div className="mt-1 whitespace-pre-wrap">{serviceRecord.notes}</div>}
                        </div>
                      )}
                      <Button
                        type="button"
                        className="mt-3 h-11 w-full"
                        variant={posted ? "outline" : "default"}
                        onClick={() => canOpenTicketEditor(serviceRecord) && setCompletionContext({ service, appointment: detailVisit.appointment })}
                        disabled={!canOpenTicketEditor(serviceRecord)}
                      >
                        {getTicketActionLabel(service, serviceRecord)}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Street View and service device visibility are staged here for a later mapping/device-tracking pass.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelAction} onOpenChange={(open) => !open && setCancelAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{cancelAction === "reschedule" ? "Request Reschedule" : "Cancel Appointment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This sends the linked services back to the office scheduling queue and creates an open opportunity for office follow-up.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={cancelReason || "NONE"} onValueChange={(value) => setCancelReason(value === "NONE" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select reason</SelectItem>
                  {cancelReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={cancelNotes}
                onChange={(event) => setCancelNotes(event.target.value)}
                placeholder="Add gate code details, customer context, access issue, or office instructions."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelAction(null)}>Back</Button>
              <Button
                type="button"
                variant={cancelAction === "cancel" ? "destructive" : "default"}
                disabled={!cancelReason || cancelRescheduleMutation.isPending}
                onClick={() => cancelRescheduleMutation.mutate()}
              >
                {cancelRescheduleMutation.isPending ? "Sending..." : cancelAction === "reschedule" ? "Send to Office" : "Cancel and Send to Office"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ServiceCompletionDialog
        open={!!completionContext}
        onOpenChange={(open) => !open && setCompletionContext(null)}
        service={completionContext?.service ?? null}
        appointment={completionContext?.appointment ?? null}
        technicians={technicians}
        serviceTypes={serviceTypes}
        defaultTechnicianId={selectedTechnicianId}
        existingServiceRecord={completionContext ? detailVisit?.services.find(({ service }) => service.id === completionContext.service.id)?.serviceRecord ?? null : null}
        onCompleted={() => {
          refreshWork();
          setCompletionContext(null);
          setDetailVisit(null);
        }}
      />
    </div>
  );
}
