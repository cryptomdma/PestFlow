import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ServiceCompletionDialog } from "@/components/service-completion-dialog";
import { CollectPaymentDialog, resolveVisitDesignation } from "@/components/collect-payment-dialog";
import { DraftInvoiceVoidPrompt, getDraftInvoiceDecisionRequired, type DraftInvoiceRef } from "@/components/draft-invoice-void-prompt";
import { ServiceBillingBlock, VisitDueTodayTotal, VisitInitialChargeCallout, describeBillingSource, useVisitBillingSummary } from "@/components/visit-billing-summary";
import { ServiceWorkKindBadge } from "@/components/service-work-kind-badge";
import { FieldAddedBadge } from "@/components/field-added-badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { can, PERMISSIONS } from "@shared/permissions";
import { isTicketFinalized, isTicketReopened, technicianMayPostTicket } from "@shared/ticket-status";
import { centsToDollarString, dollarsToCents } from "@shared/money";
import {
  FIELD_ADD_RULE_TEXT,
  describeCompositionRefusal,
  type AppointmentCompositionResult,
  type AppointmentServiceAddRequest,
  type AppointmentServiceUpdateRequest,
} from "@shared/appointment-composition";
import { AlertTriangle, Banknote, CalendarDays, CheckCircle2, ClipboardList, Clock3, MapPin, Navigation, Plus } from "lucide-react";
import type { Appointment, Customer, CustomerNote, Location, Service, ServiceRecord, ServiceType, Technician } from "@shared/schema";

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

// D9 (Pass 16): the button offers exactly what the server accepts. The rule
// is shared/ticket-status.ts's technicianMayPostTicket - no record yet, or a
// REOPENED one - so this view can never offer a post the route refuses. A
// disabled button names the ticket's state honestly (it opens nothing).
function getTicketActionLabel(service: Service, serviceRecord?: ServiceRecord | null) {
  if (!serviceRecord) return hasLocalTicketDraft(service.id) ? "Resume Service Ticket" : "Create Service Ticket";
  if (isTicketFinalized(serviceRecord)) return "Ticket Finalized";
  if (isTicketReopened(serviceRecord)) return "Edit Reopened Ticket";
  return "Ticket in Office Review";
}

function canOpenTicketEditor(serviceRecord?: ServiceRecord | null) {
  return technicianMayPostTicket(serviceRecord);
}

export default function TechnicianWork() {
  const [selectedDate, setSelectedDate] = useState(formatDateInputValue(new Date()));
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [completionContext, setCompletionContext] = useState<{ service: Service; appointment: Appointment } | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<TechnicianWorkVisit | null>(null);
  // Pass 19 (C3.3): "Time in now?" - the ticket the technician asked to open
  // on a visit with no Time In, held while the prompt is up.
  const [timeInPrompt, setTimeInPrompt] = useState<{ service: Service; appointment: Appointment } | null>(null);
  const [cancelAction, setCancelAction] = useState<"cancel" | "reschedule" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [draftPrompt, setDraftPrompt] = useState<DraftInvoiceRef[] | null>(null);
  // D8: collect on the visit outside the ticket flow (the customer pays
  // after the ticket is posted, or before it is started).
  const [collectOpen, setCollectOpen] = useState(false);
  // Pass 29 (C4.3b; B13 "tucked behind selectors"): the service row open for
  // editing (its type / instructions), the Add service form, and the add's
  // refusal shown inline (a NEXT_STOP_OVERLAP names the times).
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addTypeId, setAddTypeId] = useState("");
  const [addMinutes, setAddMinutes] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addInstructions, setAddInstructions] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const canCollect = can(user?.role ?? "", PERMISSIONS.TAKE_PAYMENT_FIELD);

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: cancelReasonSettings } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/appointment-cancel-reasons"] });
  const { data: visits, isLoading: visitsLoading } = useQuery<TechnicianWorkVisit[]>({
    queryKey: [`/api/technicians/${selectedTechnicianId}/work?date=${selectedDate}`],
    enabled: !!selectedTechnicianId && !!selectedDate,
  });
  // The open sheet follows the day's read (Pass 19): a Time In / Time Out
  // recorded from it, or from the ticket's prompt, shows without closing and
  // reopening the sheet. The snapshot stands until the refetch lands.
  const detailVisit = useMemo(
    () => (selectedVisit ? visits?.find((visit) => visit.appointment.id === selectedVisit.appointment.id) ?? selectedVisit : null),
    [selectedVisit, visits],
  );

  // D6: Price / COA / Due today per service and the visit's due-today sum,
  // server-resolved. Refetched by refreshWork's ["/api/appointments"] prefix.
  const { data: detailBilling, isLoading: detailBillingLoading, isError: detailBillingError } = useVisitBillingSummary(detailVisit?.appointment.id);
  // The location's notes (Pass 19): the canonical LOCATION-scope customer_notes
  // rows through the customer screen's own read and query key. This block read
  // locations.notes before - the transitional legacy column, empty everywhere -
  // so it had been silently blank. Pinned first, then newest.
  const detailLocationId = detailVisit?.appointment.locationId ?? detailVisit?.location?.id ?? null;
  const { data: detailLocationNoteRows } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/location", detailLocationId], enabled: !!detailLocationId });
  const detailLocationNotes = useMemo(
    () => [...(detailLocationNoteRows ?? [])]
      .filter((note) => note.body.trim().length > 0)
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [detailLocationNoteRows],
  );
  const collectLocationId = detailVisit?.appointment.locationId ?? detailVisit?.location?.id ?? detailVisit?.services[0]?.service.locationId ?? null;
  // D9 (Pass 16): the ticket dialog is handed a record only to edit and
  // re-post a REOPENED ticket. A posted or finalized record is never passed -
  // the server refuses that re-post, so the dialog never starts from it.
  const completionRecord = completionContext
    ? detailVisit?.services.find(({ service }) => service.id === completionContext.service.id)?.serviceRecord ?? null
    : null;
  const reopenedRecordForCompletion = completionRecord && isTicketReopened(completionRecord) ? completionRecord : null;
  const collectDesignation = resolveVisitDesignation((detailVisit?.services ?? []).map(({ service }) => service.agreementId));
  const closeDetail = () => {
    setCollectOpen(false);
    setSelectedVisit(null);
    setEditingServiceId(null);
    setAddOpen(false);
  };
  // A different visit opens with nothing in edit and the Add form closed.
  const detailAppointmentId = detailVisit?.appointment.id ?? null;
  useEffect(() => {
    setEditingServiceId(null);
    setInstructionsDraft("");
    setAddOpen(false);
    setAddTypeId("");
    setAddMinutes("");
    setAddPrice("");
    setAddInstructions("");
    setAddError(null);
  }, [detailAppointmentId]);
  // The composition is open on a visit still on the board (the server's
  // APPOINTMENT_NOT_COMPOSABLE rule, read here so nothing dead is offered).
  const detailComposable = !!detailVisit && detailVisit.appointment.status !== "CANCELED" && detailVisit.appointment.status !== "COMPLETED";

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
    // Pass 29: the composition changes the services, the location's rows
    // and the History tab too.
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location"] });
    queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
  };
  const timeInMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("POST", `/api/appointments/${appointmentId}/time-in`, {});
      return response.json();
    },
    onSuccess: refreshWork,
  });
  const cancelRescheduleMutation = useMutation({
    // voidDraftInvoices is undefined on the first attempt; the server answers
    // 409 if the visit carries a DRAFT invoice (Q3), the prompt below asks,
    // and the retry carries the answer.
    mutationFn: async (voidDraftInvoices?: boolean) => {
      if (!detailVisit || !cancelAction) throw new Error("Appointment is not selected");
      const response = await apiRequest("POST", `/api/appointments/${detailVisit.appointment.id}/cancel-reschedule`, {
        reason: cancelReason,
        notes: cancelNotes,
        rescheduleRequested: cancelAction === "reschedule",
        voidDraftInvoices,
      });
      return response.json();
    },
    onSuccess: () => {
      refreshWork();
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setDraftPrompt(null);
      setCancelAction(null);
      setCancelReason("");
      setCancelNotes("");
      setSelectedVisit(null);
    },
    onError: (error: Error) => {
      const drafts = getDraftInvoiceDecisionRequired(error);
      if (drafts) {
        setDraftPrompt(drafts);
        return;
      }
      toast({
        title: cancelAction === "reschedule" ? "Unable to request reschedule" : "Unable to cancel appointment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
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

  // Pass 29 (C4.3b; B13): the field's composition, through the dispatch
  // sheet's routes - every field action is a route (the field is a native
  // app later). The type goes through PATCH .../services/:serviceId, where
  // the server locks agreement work (SERVICE_TYPE_LOCKED) and a ticketed
  // service (SERVICE_HAS_TICKET); the instructions through the generic
  // service PATCH, where a technician is refused on a service they did not
  // add (SERVICE_INSTRUCTIONS_LOCKED); the add posts origin FIELD - one-time
  // work only, stamped with this user and flagged for office review, refused
  // when the visit would run into the next stop (NEXT_STOP_OVERLAP) - and
  // that refusal is shown inline on the form, naming the times.
  const describeCompositionError = (error: unknown) => describeCompositionRefusal(getApiErrorCode(error)) ?? getApiErrorMessage(error);
  const updateVisitServiceMutation = useMutation({
    mutationFn: async ({ appointmentId, serviceId, payload }: { appointmentId: string; serviceId: string; payload: AppointmentServiceUpdateRequest }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${appointmentId}/services/${serviceId}`, payload);
      return response.json() as Promise<AppointmentCompositionResult>;
    },
    onSuccess: () => {
      refreshWork();
      toast({ title: "Service type changed" });
    },
    onError: (error: Error) => toast({ title: "Unable to change the service type", description: describeCompositionError(error), variant: "destructive" }),
  });
  const updateInstructionsMutation = useMutation({
    mutationFn: async ({ serviceId, notes }: { serviceId: string; notes: string | null }) => {
      const response = await apiRequest("PATCH", `/api/services/${serviceId}`, { notes });
      return response.json() as Promise<Service>;
    },
    onSuccess: () => {
      refreshWork();
      setEditingServiceId(null);
      toast({ title: "Instructions saved" });
    },
    onError: (error: Error) => toast({ title: "Unable to save instructions", description: describeCompositionError(error), variant: "destructive" }),
  });
  const addFieldServiceMutation = useMutation({
    mutationFn: async ({ appointmentId, payload }: { appointmentId: string; payload: AppointmentServiceAddRequest }) => {
      const response = await apiRequest("POST", `/api/appointments/${appointmentId}/services`, payload);
      return response.json() as Promise<AppointmentCompositionResult>;
    },
    onSuccess: (result) => {
      refreshWork();
      setAddOpen(false);
      resetAddForm();
      toast({
        title: "Service added to this visit",
        description: [
          result.scheduledEndDateExtendedMinutes ? `Visit end extended by ${result.scheduledEndDateExtendedMinutes} min` : null,
          result.flagged ? "The office will review it" : null,
        ].filter(Boolean).join("; ") || undefined,
      });
    },
    onError: (error: Error) => setAddError(describeCompositionError(error)),
  });
  const toggleServiceEditor = (service: Service) => {
    if (editingServiceId === service.id) {
      setEditingServiceId(null);
      return;
    }
    setInstructionsDraft(service.notes ?? "");
    setEditingServiceId(service.id);
  };
  const resetAddForm = () => {
    setAddTypeId("");
    setAddMinutes("");
    setAddPrice("");
    setAddInstructions("");
    setAddError(null);
  };
  // The type's duration and price are the defaults, as on the sheet and the customer form.
  const selectAddType = (value: string) => {
    const id = value === "NONE" ? "" : value;
    const serviceType = serviceTypes?.find((item) => item.id === id);
    setAddTypeId(id);
    setAddMinutes(serviceType?.estimatedDuration ? String(serviceType.estimatedDuration) : "");
    setAddPrice(serviceType?.defaultPriceCents != null ? centsToDollarString(serviceType.defaultPriceCents) : "");
    setAddError(null);
  };
  const submitFieldAdd = () => {
    if (!detailVisit || !addTypeId) return;
    const minutes = addMinutes.trim();
    setAddError(null);
    addFieldServiceMutation.mutate({
      appointmentId: detailVisit.appointment.id,
      payload: {
        origin: "FIELD",
        service: {
          serviceTypeId: addTypeId,
          expectedDurationMinutes: minutes === "" ? null : parseInt(minutes, 10),
          priceCents: dollarsToCents(addPrice),
          notes: addInstructions.trim() || null,
        },
      },
    });
  };

  // Pass 19 (C3.3): opening a ticket on a visit with no Time In asks first.
  // Yes posts the existing time-in route (the day's read refreshes, and the
  // ticket opens on the stamped appointment); No opens the ticket anyway -
  // bypass allowed. The technician view is the one surface that opens the
  // post mode from a visit, so the office-edit mode never comes through here.
  const openTicket = (service: Service, appointment: Appointment) => {
    if (!appointment.timeInAt) {
      setTimeInPrompt({ service, appointment });
      return;
    }
    setCompletionContext({ service, appointment });
  };
  const openTicketWithoutTimeIn = () => {
    if (!timeInPrompt) return;
    setCompletionContext(timeInPrompt);
    setTimeInPrompt(null);
  };
  const timeInAndOpenTicket = async () => {
    if (!timeInPrompt) return;
    const context = timeInPrompt;
    setTimeInPrompt(null);
    try {
      const updated = (await timeInMutation.mutateAsync(context.appointment.id)) as Appointment | undefined;
      setCompletionContext({ ...context, appointment: updated?.id ? updated : context.appointment });
    } catch (error) {
      // The ticket is never blocked by a failed time-in: say so and open it.
      toast({ title: "Unable to time in", description: getApiErrorMessage(error), variant: "destructive" });
      setCompletionContext(context);
    }
  };

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
            <Card key={visit.appointment.id} className="overflow-hidden transition-colors hover:bg-muted/10" onClick={() => setSelectedVisit(visit)}>
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
                    <Badge variant={visit.appointment.status === "COMPLETED" ? "default" : "secondary"}>{visit.appointment.status}</Badge>
                    <span className="text-xs text-muted-foreground">{completedCount}/{visit.services.length} posted</span>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );})}
        </div>
      )}

      <Dialog open={!!detailVisit} onOpenChange={(open) => !open && closeDetail()}>
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
                  {detailVisit.appointment.status !== "CANCELED" && detailVisit.appointment.status !== "COMPLETED" ? (
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
                {detailVisit.appointment.status === "CANCELED" && (
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
              {detailLocationNotes.length > 0 && (
                <div className="rounded-lg border p-3" data-testid="block-detail-location-notes">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Location Notes</p>
                  {detailLocationNotes.map((note) => (
                    <p key={note.id} className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <p className="text-sm font-medium">Linked Services</p>
                {detailVisit.services.map(({ service, serviceRecord }) => {
                  const posted = service.status === "COMPLETED" || !!serviceRecord;
                  // Pass 29 (C4.3b; B13): the row is displayed and becomes
                  // editable on click - the type on non-agreement work with no
                  // ticket yet (the same PATCH as the dispatch sheet; the lock
                  // is the server's, the caption the ticket dialog's), and the
                  // instructions (services.notes) only on a service THIS USER
                  // added in the field. "Appointment Notes" above stays the
                  // office's. The kind badge, the agreement marker, the
                  // field-added flag and the planned duration show on every row.
                  const settled = service.status === "COMPLETED" || service.status === "CANCELLED";
                  const isAgreement = !!service.agreementId || service.source === "AGREEMENT_GENERATED";
                  const mine = !!user && service.addedInFieldByUserId === user.id;
                  const typeName = serviceTypeNameById.get(service.serviceTypeId || "") || "Service";
                  const canEditType = detailComposable && !settled && !serviceRecord && !isAgreement;
                  const typeLockReason = settled
                    ? "Settled - its type is history."
                    : serviceRecord
                      ? "A ticket is posted - the type is changed on the ticket."
                      : isAgreement
                        ? "Agreement work - the type is locked in the field; the office changes it."
                        : null;
                  const canEditInstructions = detailComposable && !settled && mine;
                  const editing = editingServiceId === service.id;
                  return (
                    <div key={service.id} className="rounded-lg border p-3" data-testid={`tech-service-${service.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="text-left font-medium underline-offset-2 hover:underline disabled:no-underline"
                            onClick={() => toggleServiceEditor(service)}
                            disabled={!detailComposable || settled}
                            title={detailComposable && !settled ? (editing ? "Close" : "Tap to change the type or instructions") : undefined}
                            data-testid={`button-tech-service-edit-${service.id}`}
                          >
                            {typeName}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <ServiceWorkKindBadge workKind={service.workKind} className="text-[10px]" />
                            {isAgreement ? <Badge variant="secondary" className="text-[10px]">Agreement</Badge> : null}
                            <FieldAddedBadge service={service} className="text-[10px]" />
                            <span className="text-xs text-muted-foreground" data-testid={`text-tech-service-duration-${service.id}`}>
                              {service.expectedDurationMinutes ? `${formatDuration(service.expectedDurationMinutes)} planned` : "No planned duration"}
                            </span>
                          </div>
                          {!editing ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{service.notes || "No service instructions."}</p> : null}
                        </div>
                        <Badge variant={posted ? "default" : "outline"}>{posted ? "Ticket Posted" : service.status}</Badge>
                      </div>
                      {editing ? (
                        <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-2" data-testid={`tech-service-editor-${service.id}`}>
                          <div className="space-y-1">
                            <Label className="text-xs">Service type</Label>
                            {canEditType ? (
                              <Select
                                value={service.serviceTypeId || "NONE"}
                                onValueChange={(value) => {
                                  if (value !== "NONE" && value !== service.serviceTypeId) {
                                    updateVisitServiceMutation.mutate({ appointmentId: detailVisit.appointment.id, serviceId: service.id, payload: { serviceTypeId: value } });
                                  }
                                }}
                                disabled={updateVisitServiceMutation.isPending}
                              >
                                <SelectTrigger data-testid={`select-tech-service-type-${service.id}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="NONE">Select service type</SelectItem>
                                  {(serviceTypes ?? []).map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="rounded-md border bg-background px-3 py-2 text-sm">
                                {typeName} {isAgreement ? <span className="text-xs text-muted-foreground">(agreement locked)</span> : null}
                              </div>
                            )}
                            {typeLockReason ? <p className="text-xs text-muted-foreground" data-testid={`text-tech-service-type-locked-${service.id}`}>{typeLockReason}</p> : null}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Instructions</Label>
                            {canEditInstructions ? (
                              <>
                                <Textarea
                                  value={instructionsDraft}
                                  onChange={(event) => setInstructionsDraft(event.target.value)}
                                  rows={3}
                                  placeholder="What the office and the ticket should know about this service."
                                  data-testid={`textarea-tech-service-notes-${service.id}`}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingServiceId(null)}>Done</Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={updateInstructionsMutation.isPending || instructionsDraft.trim() === (service.notes ?? "")}
                                    onClick={() => updateInstructionsMutation.mutate({ serviceId: service.id, notes: instructionsDraft.trim() || null })}
                                    data-testid={`button-tech-service-notes-save-${service.id}`}
                                  >
                                    {updateInstructionsMutation.isPending ? "Saving..." : "Save instructions"}
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{service.notes || "No service instructions."}</p>
                                <p className="text-xs text-muted-foreground">
                                  {settled ? "Settled - its instructions are history." : "Instructions are edited in the field only on a service you added; the office edits the rest."}
                                </p>
                                <div className="flex justify-end">
                                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingServiceId(null)}>Done</Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {serviceRecord && (
                        <div className="mt-3 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1 font-medium text-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Posted {new Date(serviceRecord.serviceDate).toLocaleString()}</div>
                          {serviceRecord.technicianLicenseNumber && <div>License #{serviceRecord.technicianLicenseNumber}</div>}
                          {serviceRecord.notes && <div className="mt-1 whitespace-pre-wrap">{serviceRecord.notes}</div>}
                        </div>
                      )}
                      <div className="mt-3 rounded-md border bg-background p-2">
                        <ServiceBillingBlock summary={detailBilling} serviceId={service.id} isLoading={detailBillingLoading} isError={detailBillingError} compact />
                      </div>
                      <Button
                        type="button"
                        className="mt-3 h-11 w-full"
                        variant={posted ? "outline" : "default"}
                        onClick={() => canOpenTicketEditor(serviceRecord) && openTicket(service, detailVisit.appointment)}
                        disabled={!canOpenTicketEditor(serviceRecord)}
                      >
                        {getTicketActionLabel(service, serviceRecord)}
                      </Button>
                    </div>
                  );
                })}
                {/* Pass 29 (C4.3b; B13 "Add service is a small button"): a one-time service added to
                    this visit from the field - the type's minutes and price as defaults, the
                    instructions typed here are the service's own. The server extends the visit's end
                    and refuses an add that would run into the next stop; that refusal shows here. */}
                {detailComposable ? (
                  <div className="rounded-lg border border-dashed p-3" data-testid="block-tech-add-service">
                    {!addOpen ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => { resetAddForm(); setAddOpen(true); }} data-testid="button-tech-add-service">
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add service
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Add a one-time service to this visit</p>
                        <div className="space-y-1">
                          <Label className="text-xs">Service type</Label>
                          <Select value={addTypeId || "NONE"} onValueChange={selectAddType} disabled={addFieldServiceMutation.isPending}>
                            <SelectTrigger data-testid="select-tech-add-type"><SelectValue placeholder="Select service type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">Select service type</SelectItem>
                              {(serviceTypes ?? []).map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Minutes</Label>
                            <Input type="number" inputMode="numeric" min={0} value={addMinutes} onChange={(event) => setAddMinutes(event.target.value)} data-testid="input-tech-add-minutes" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Price ($)</Label>
                            <Input type="number" inputMode="decimal" min="0" step="0.01" value={addPrice} onChange={(event) => setAddPrice(event.target.value)} data-testid="input-tech-add-price" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Instructions</Label>
                          <Textarea rows={2} value={addInstructions} onChange={(event) => setAddInstructions(event.target.value)} placeholder="Optional - what this service is for." data-testid="textarea-tech-add-notes" />
                        </div>
                        <p className="text-xs text-muted-foreground">{FIELD_ADD_RULE_TEXT}</p>
                        {addError ? (
                          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive" data-testid="text-tech-add-error">{addError}</p>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => { setAddOpen(false); resetAddForm(); }}>Cancel</Button>
                          <Button type="button" size="sm" disabled={!addTypeId || addFieldServiceMutation.isPending} onClick={submitFieldAdd} data-testid="button-tech-add-service-submit">
                            {addFieldServiceMutation.isPending ? "Adding..." : "Add to visit"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {detailBilling && (
                  <>
                    <VisitInitialChargeCallout summary={detailBilling} />
                    <VisitDueTodayTotal summary={detailBilling} />
                    <p className="text-xs text-muted-foreground">{describeBillingSource(detailBilling)}</p>
                  </>
                )}
                {canCollect && collectLocationId && detailVisit.appointment.status !== "CANCELED" && (
                  <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setCollectOpen(true)} data-testid="button-collect-payment">
                    <Banknote className="mr-1 h-4 w-4" /> Collect Payment
                  </Button>
                )}
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
                onClick={() => cancelRescheduleMutation.mutate(undefined)}
              >
                {cancelRescheduleMutation.isPending ? "Sending..." : cancelAction === "reschedule" ? "Send to Office" : "Cancel and Send to Office"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DraftInvoiceVoidPrompt
        drafts={draftPrompt}
        isPending={cancelRescheduleMutation.isPending}
        onDecide={(voidDraftInvoices) => cancelRescheduleMutation.mutate(voidDraftInvoices)}
        onBack={() => setDraftPrompt(null)}
      />

      {detailVisit && collectLocationId && (
        <CollectPaymentDialog
          open={collectOpen}
          onOpenChange={setCollectOpen}
          appointmentId={detailVisit.appointment.id}
          locationId={collectLocationId}
          designatedAgreementId={collectDesignation}
        />
      )}

      <AlertDialog open={!!timeInPrompt} onOpenChange={(open) => !open && setTimeInPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Time in now?</AlertDialogTitle>
            <AlertDialogDescription>
              This visit has no Time In yet. Time in now and open the ticket, or open it without timing in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={openTicketWithoutTimeIn} data-testid="button-time-in-prompt-skip">Open without timing in</AlertDialogCancel>
            <AlertDialogAction onClick={timeInAndOpenTicket} disabled={timeInMutation.isPending} data-testid="button-time-in-prompt-yes">Time in and open</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceCompletionDialog
        open={!!completionContext}
        onOpenChange={(open) => !open && setCompletionContext(null)}
        service={completionContext?.service ?? null}
        appointment={completionContext?.appointment ?? null}

        technicians={technicians}
        serviceTypes={serviceTypes}
        defaultTechnicianId={selectedTechnicianId}
        existingServiceRecord={reopenedRecordForCompletion}
        onCompleted={() => {
          refreshWork();
          setCompletionContext(null);
          setSelectedVisit(null);
        }}
      />
    </div>
  );
}
