import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { DraftInvoiceVoidPrompt, getDraftInvoiceDecisionRequired, type DraftInvoiceRef } from "@/components/draft-invoice-void-prompt";
import { VisitBillingRows, useVisitBillingSummary } from "@/components/visit-billing-summary";
import { InitialChargeDuePrompt, type WithInitialChargeDue } from "@/components/initial-charge-due-prompt";
import type { InitialChargeDue } from "@shared/initial-charge";
import { formatCents, dollarsToCents } from "@shared/money";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  DollarSign,
  Lock,
  Settings2,
  Users,
} from "lucide-react";
import type { Appointment, Customer, Location, Opportunity, Service, ServiceRecord, ServiceType, Technician } from "@shared/schema";
import {
  describeAppointmentStatus,
  isBoardPlacement,
  type AppointmentDispositionMode,
  type AppointmentDispositionOutcome,
  type AppointmentDispositionRequest,
  type DispositionOpportunityChoice,
} from "@shared/appointment-disposition";

const VIEW_OPTIONS = [
  { value: "day", label: "1 Day", step: 1 },
  { value: "three-day", label: "3 Day", step: 3 },
  { value: "week", label: "1 Week", step: 7 },
] as const;

const HOUR_OPTIONS = Array.from({ length: 15 }, (_, index) => 6 + index);
const SLOT_INTERVAL_OPTIONS = [1, 2];

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatCurrency(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "Not set";
  return formatCents(cents);
}

function buildSlotDate(baseDate: Date, hour: number) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, 0, 0, 0);
}

function getHourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" });
}

function getFullHourRange(startHour: number, endHour: number, intervalHours: number) {
  const hours: number[] = [];
  const safeInterval = Math.max(intervalHours, 1);
  for (let hour = startHour; hour < endHour; hour += safeInterval) {
    hours.push(hour);
  }
  return hours;
}

function getSlotHourForDate(dateLike: Date | string, slotHours: number[]) {
  const hour = new Date(dateLike).getHours();
  let selected = slotHours[0];
  for (const slotHour of slotHours) {
    if (slotHour <= hour) {
      selected = slotHour;
    } else {
      break;
    }
  }
  return selected;
}

function isSameSlot(a: Date | string, b: Date) {
  const left = new Date(a);
  return left.getFullYear() === b.getFullYear()
    && left.getMonth() === b.getMonth()
    && left.getDate() === b.getDate()
    && left.getHours() === b.getHours();
}

function getCustomerLabel(customer?: Customer, location?: Location) {
  if (customer) {
    const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
    if (fullName) return fullName;
    if (customer.companyName) return customer.companyName;
  }
  return location?.name || "Location service";
}

function getLocationLabel(location?: Location) {
  if (!location) return "Location";
  const parts = [location.name, location.address].filter(Boolean);
  return parts.join(" - ");
}

function getAppointmentDurationMinutes(appointment: Appointment, linkedService?: Service) {
  if (appointment.scheduledEndDate) {
    const start = new Date(appointment.scheduledDate).getTime();
    const end = new Date(appointment.scheduledEndDate).getTime();
    return Math.max(Math.round((end - start) / 60000), 0);
  }
  return linkedService?.expectedDurationMinutes || null;
}

function getViewportLabel(boardDates: Date[]) {
  if (!boardDates.length) return "";
  const startLabel = boardDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endLabel = boardDates[boardDates.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return boardDates.length > 1 ? `${startLabel} - ${endLabel}` : startLabel;
}

function getLocationServicesQueryKey(locationId: string | null | undefined) {
  return ["/api/services/by-location", locationId || ""];
}

function getLocationAppointmentsQueryKey(locationId: string | null | undefined) {
  return ["/api/appointments/by-location", locationId || ""];
}

// Pass 27 (B2): the slot named in the board-move confirmation.
function formatSlotLabel(date: Date) {
  return `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function pluralize(count: number, noun: string, plural?: string) {
  return `${count} ${count === 1 ? noun : plural ?? `${noun}s`}`;
}

function AppointmentSheet({
  appointment,
  service,
  linkedServices,
  technicianOptions,
  serviceTypeName,
  customerLabel,
  locationLabel,
  cancelReasons,
  openOpportunityCount,
  open,
  onOpenChange,
  onSave,
  onDisposition,
  isSaving,
  isDispositioning,
}: {
  appointment: Appointment | null;
  service: Service | null;
  /** Every service on the visit, the representative included - what a disposition touches. */
  linkedServices: Service[];
  technicianOptions: Technician[];
  serviceTypeName: string;
  customerLabel: string;
  locationLabel: string;
  /** The settings list a cancel reason must come from. */
  cancelReasons: string[];
  /** Open opportunities already on the visit's services - what "Update existing" would re-date. */
  openOpportunityCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: {
    assignedTechnicianId: string | null;
    scheduledDate: string;
    scheduledEndDate: string | null;
    status: string;
    lockTime: boolean;
    lockTechnician: boolean;
    notes: string | null;
  }) => void;
  /** Pass 27 (C4.2): Cancel appointment / Reschedule - POST /api/appointments/:id/disposition. */
  onDisposition: (payload: AppointmentDispositionRequest) => void;
  isSaving: boolean;
  isDispositioning: boolean;
}) {
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  const [status, setStatus] = useState("SCHEDULED");
  const [lockTime, setLockTime] = useState(false);
  const [lockTechnician, setLockTechnician] = useState(false);
  const [notes, setNotes] = useState("");
  // Pass 27 (C4.2): the two ways off the board. Cancel needs a reason from
  // the settings list and the opportunity choice; Reschedule is a confirm.
  const [disposition, setDisposition] = useState<AppointmentDispositionMode | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [dispositionNotes, setDispositionNotes] = useState("");
  const [opportunityChoice, setOpportunityChoice] = useState<DispositionOpportunityChoice>("CREATE");
  // D6: the visit's Price / COA / Due today per service and its due-today
  // sum, server-resolved - in place of the raw stamped service price, which
  // is null for agreement work and says nothing about coverage.
  const { data: visitBilling, isLoading: visitBillingLoading, isError: visitBillingError } = useVisitBillingSummary(open ? appointment?.id : null);

  const activeServices = linkedServices.filter((linked) => linked.status !== "COMPLETED" && linked.status !== "CANCELLED");
  const agreementServiceCount = activeServices.filter((linked) => !!linked.agreementId).length;
  const oneTimeServiceCount = activeServices.length - agreementServiceCount;
  const defaultOpportunityChoice: DispositionOpportunityChoice = openOpportunityCount > 0 ? "UPDATE_EXISTING" : "CREATE";

  useEffect(() => {
    if (!appointment) return;
    setAssignedTechnicianId(appointment.assignedTechnicianId || "");
    setScheduledDate(formatDateTimeLocalValue(appointment.scheduledDate));
    setScheduledEndDate(formatDateTimeLocalValue(appointment.scheduledEndDate));
    setStatus(appointment.status || "SCHEDULED");
    setLockTime(appointment.lockTime ?? false);
    setLockTechnician(appointment.lockTechnician ?? false);
    setNotes(appointment.notes || "");
  }, [appointment]);

  // Pass 27b (C4.2b): the two dialogs belong to the sheet's appointment. When
  // it changes - another placement, or none once a disposition completes and
  // the page closes the sheet - their state goes with it, so neither dialog
  // outlives the sheet it was opened from. (The reset above returns early on
  // null, which left a dialog open over an empty sheet.) Keyed on the id, not
  // the row, so a refetch of the same placement cannot close a dialog
  // mid-edit.
  const appointmentId = appointment?.id ?? null;
  useEffect(() => {
    setDisposition(null);
    setReasonCode("");
    setDispositionNotes("");
    setOpportunityChoice("CREATE");
  }, [appointmentId]);

  const openDisposition = (mode: AppointmentDispositionMode) => {
    setReasonCode("");
    setDispositionNotes("");
    setOpportunityChoice(defaultOpportunityChoice);
    setDisposition(mode);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader className="pr-8">
            <SheetTitle>Appointment Details</SheetTitle>
            <SheetDescription>
              Manage scheduling attributes without leaving the dispatch board.
            </SheetDescription>
          </SheetHeader>
          {appointment ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{customerLabel}</p>
                    <p className="text-xs text-muted-foreground">{serviceTypeName}</p>
                  </div>
                  <Badge variant="outline">{describeAppointmentStatus(appointment)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{locationLabel}</p>
                <div className="mt-3">
                  <VisitBillingRows summary={visitBilling} isLoading={visitBillingLoading} isError={visitBillingError} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Technician</label>
                <select
                  value={assignedTechnicianId}
                  onChange={(event) => setAssignedTechnicianId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {technicianOptions.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.displayName} {technician.status !== "ACTIVE" ? `(${technician.status})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scheduled Start</label>
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scheduled End</label>
                  <input
                    type="datetime-local"
                    value={scheduledEndDate}
                    onChange={(event) => setScheduledEndDate(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                {/* Pass 27: CANCELED is the disposition's to write, never the
                    form's. Since Pass 27b a cancelled placement is not a board
                    card (isBoardPlacement), so the sheet never shows one and
                    the select is always offered. */}
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Lock Time</p>
                    <p className="text-xs text-muted-foreground">Prevents board moves to a different time slot.</p>
                  </div>
                  <Switch checked={lockTime} onCheckedChange={setLockTime} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Lock Technician</p>
                    <p className="text-xs text-muted-foreground">Prevents reassignment to another technician row.</p>
                  </div>
                  <Switch checked={lockTechnician} onCheckedChange={setLockTechnician} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Scheduling Notes</label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="destructive" onClick={() => openDisposition("CANCEL")} disabled={isSaving || isDispositioning}>
                  Cancel appointment
                </Button>
                <Button type="button" variant="outline" onClick={() => openDisposition("RESCHEDULE")} disabled={isSaving || isDispositioning}>
                  Reschedule
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button
                  onClick={() => onSave({
                    assignedTechnicianId: assignedTechnicianId || null,
                    scheduledDate: new Date(scheduledDate).toISOString(),
                    scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate).toISOString() : null,
                    status,
                    lockTime,
                    lockTechnician,
                    notes: notes.trim() || null,
                  })}
                  disabled={isSaving || !scheduledDate}
                >
                  Save Appointment
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={disposition === "CANCEL"} onOpenChange={(next) => { if (!next) setDisposition(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>
              The visit is cancelled with a reason. Agreement services return to the pending queue with their service window reset from today; one-time services are cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              {activeServices.length ? (
                <>
                  {agreementServiceCount > 0 ? <p>{pluralize(agreementServiceCount, "agreement service")} back to the queue, window reset from today.</p> : null}
                  {oneTimeServiceCount > 0 ? <p>{pluralize(oneTimeServiceCount, "one-time service")} cancelled.</p> : null}
                </>
              ) : (
                <p>No active services on this visit.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="disposition-reason">Reason</Label>
              <select
                id="disposition-reason"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a reason</option>
                {cancelReasons.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">From Settings, Appointment Cancel / Reschedule Reasons.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="disposition-notes">Notes</Label>
              <Textarea
                id="disposition-notes"
                value={dispositionNotes}
                onChange={(event) => setDispositionNotes(event.target.value)}
                rows={3}
                placeholder="Customer context or office instructions."
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Opportunity</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="disposition-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "UPDATE_EXISTING"}
                  onChange={() => setOpportunityChoice("UPDATE_EXISTING")}
                  disabled={openOpportunityCount === 0}
                />
                <span>
                  <span className={openOpportunityCount === 0 ? "text-muted-foreground" : ""}>Update the open opportunity on the service</span>
                  <span className="block text-xs text-muted-foreground">
                    {openOpportunityCount > 0
                      ? `Re-dates ${pluralize(openOpportunityCount, "open opportunity", "open opportunities")} to today.`
                      : "None is open on this visit's services."}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="disposition-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "CREATE"}
                  onChange={() => setOpportunityChoice("CREATE")}
                />
                <span>
                  Create a new opportunity
                  <span className="block text-xs text-muted-foreground">Reschedule for a service back in the queue; Win-back for a cancelled one-time service.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="disposition-opportunity"
                  className="mt-1"
                  checked={opportunityChoice === "NONE"}
                  onChange={() => setOpportunityChoice("NONE")}
                />
                <span>
                  No opportunity
                  <span className="block text-xs text-muted-foreground">Nothing keeps this visit visible for follow-up.</span>
                </span>
              </label>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDisposition(null)} disabled={isDispositioning}>Back</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!reasonCode || isDispositioning}
                onClick={() => onDisposition({ mode: "CANCEL", reasonCode, notes: dispositionNotes.trim() || null, opportunity: opportunityChoice })}
              >
                {isDispositioning ? "Cancelling..." : "Cancel appointment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disposition === "RESCHEDULE"} onOpenChange={(next) => { if (!next) setDisposition(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return this appointment to the queue?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeServices.length
                ? `${pluralize(activeServices.length, "service")} ${activeServices.length === 1 ? "goes" : "go"} back to Pending scheduling`
                : "The visit's services go back to Pending scheduling"}
              {" "}for the office to place on a new day and time. No reason is recorded and no opportunity is created; the placement stays in history as rescheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisposition(null)} disabled={isDispositioning}>Back</Button>
            <Button
              type="button"
              onClick={() => onDisposition({ mode: "RESCHEDULE", reasonCode: null, notes: null, opportunity: "NONE" })}
              disabled={isDispositioning}
            >
              {isDispositioning ? "Returning..." : "Reschedule"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ServiceDetailDialog({
  service,
  serviceTypeName,
  customerLabel,
  locationLabel,
  technicianName,
  open,
  onOpenChange,
}: {
  service: Service | null;
  serviceTypeName: string;
  customerLabel: string;
  locationLabel: string;
  technicianName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Service Details</DialogTitle>
          <DialogDescription>
            Current service details tied to the selected dispatch card.
          </DialogDescription>
        </DialogHeader>
        {service ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="font-semibold">{customerLabel}</p>
              <p className="text-muted-foreground">{locationLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service Type</p>
                <p className="mt-1 font-medium">{serviceTypeName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="mt-1 font-medium">{service.status}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Due / Service Date</p>
                <p className="mt-1 font-medium">{service.dueDate || "Not set"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected Duration</p>
                <p className="mt-1 font-medium">{service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Not set"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p>
                <p className="mt-1 font-medium">{technicianName || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service Value</p>
                <p className="mt-1 font-medium">{formatCurrency(service.priceCents)}</p>
              </div>
            </div>
            {service.notes ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-md border bg-background px-3 py-2">{service.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function Schedule() {
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const [view, setView] = useState<(typeof VIEW_OPTIONS)[number]["value"]>("day");
  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = params.get("date");
    return dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(params.get("serviceId"));
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(params.get("appointmentId"));
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [detailServiceId, setDetailServiceId] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [boardStartHour, setBoardStartHour] = useState(8);
  const [boardEndHour, setBoardEndHour] = useState(18);
  const [slotIntervalHours, setSlotIntervalHours] = useState(2);
  const groupedServiceIds = useMemo(() => (params.get("serviceIds") || "").split(",").map((id) => id.trim()).filter(Boolean), [params]);

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: allServices, isLoading: servicesLoading } = useQuery<Service[]>({ queryKey: ["/api/services"] });
  const { data: serviceRecords } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: pendingServices, isLoading: pendingLoading } = useQuery<Service[]>({ queryKey: ["/api/services/pending"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  // Pass 27: the sheet's Cancel appointment takes its reason from the
  // settings list.
  const { data: cancelReasonSettings } = useQuery<{ reasons: string[] }>({ queryKey: ["/api/settings/appointment-cancel-reasons"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const serviceById = useMemo(() => new Map((allServices ?? []).map((service) => [service.id, service])), [allServices]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);
  const serviceRecordByServiceId = useMemo(() => {
    const map = new Map<string, ServiceRecord>();
    for (const serviceRecord of serviceRecords ?? []) {
      if (serviceRecord.serviceId) map.set(serviceRecord.serviceId, serviceRecord);
    }
    return map;
  }, [serviceRecords]);
  const servicesByAppointmentId = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of allServices ?? []) {
      if (!service.appointmentId) continue;
      const existing = map.get(service.appointmentId) ?? [];
      existing.push(service);
      map.set(service.appointmentId, existing);
    }
    return map;
  }, [allServices]);

  const currentView = VIEW_OPTIONS.find((option) => option.value === view)!;
  const boardDates = useMemo(() => Array.from({ length: currentView.step }, (_, index) => startOfDay(addDays(currentDate, index))), [currentDate, currentView.step]);
  const slotHours = useMemo(() => getFullHourRange(boardStartHour, boardEndHour, slotIntervalHours), [boardEndHour, boardStartHour, slotIntervalHours]);

  const viewportBounds = useMemo(() => {
    const start = buildSlotDate(boardDates[0], boardStartHour);
    const end = new Date(buildSlotDate(boardDates[boardDates.length - 1], boardEndHour).getTime() + slotIntervalHours * 60 * 60 * 1000);
    return { start, end };
  }, [boardDates, boardEndHour, boardStartHour, slotIntervalHours]);

  // Pass 27b (C4.2b): what the board shows. A CANCELED placement - cancelled
  // or rescheduled alike - is history, not a card (owner, 2026-09-25): its
  // slot is free, and the location's Services and History tabs keep the
  // record. One shared predicate, applied once here; the viewport, the slot
  // map, the analytics and the card selection all derive from this list, so
  // none of them can show what the others hide. The read itself stays
  // unfiltered (the dashboard, the ticket review queue and the Services tab
  // still need the row).
  const boardAppointments = useMemo(() => (appointments ?? []).filter(isBoardPlacement), [appointments]);

  const viewportAppointments = useMemo(() => {
    return boardAppointments.filter((appointment) => {
      const scheduled = new Date(appointment.scheduledDate);
      return scheduled >= viewportBounds.start && scheduled < viewportBounds.end;
    });
  }, [boardAppointments, viewportBounds.end, viewportBounds.start]);

  const visibleTechnicians = useMemo(() => {
    const base = (technicians ?? []).filter((technician) => technician.status === "ACTIVE");
    const visibleIds = new Set(base.map((technician) => technician.id));
    const extras = viewportAppointments
      .map((appointment) => appointment.assignedTechnicianId)
      .filter((technicianId): technicianId is string => !!technicianId)
      .map((technicianId) => technicianById.get(technicianId))
      .filter((technician): technician is Technician => !!technician && !visibleIds.has(technician.id));
    return [...base, ...extras];
  }, [technicianById, technicians, viewportAppointments]);

  const appointmentsByTechnicianAndSlot = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of viewportAppointments) {
      if (!appointment.assignedTechnicianId) continue;
      const slotHour = getSlotHourForDate(appointment.scheduledDate, slotHours);
      const key = `${appointment.assignedTechnicianId}:${formatDateInputValue(new Date(appointment.scheduledDate))}:${slotHour}`;
      const items = map.get(key) ?? [];
      items.push(appointment);
      map.set(key, items);
    }
    return map;
  }, [slotHours, viewportAppointments]);

  const selectedService = useMemo(() => (pendingServices ?? []).find((service) => service.id === selectedServiceId) ?? null, [pendingServices, selectedServiceId]);
  const selectedAppointment = useMemo(() => boardAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null, [boardAppointments, selectedAppointmentId]);
  const editingAppointment = useMemo(() => boardAppointments.find((appointment) => appointment.id === editingAppointmentId) ?? null, [boardAppointments, editingAppointmentId]);
  const detailService = useMemo(() => (detailServiceId ? serviceById.get(detailServiceId) ?? null : null), [detailServiceId, serviceById]);

  const prefillServiceMutation = useMutation({
    mutationFn: async () => {
      const customerId = params.get("customerId");
      const locationId = params.get("locationId");
      const serviceTypeId = params.get("serviceTypeId");
      const expectedDurationMinutes = params.get("expectedDurationMinutes");
      const price = params.get("price");
      const serviceTemplateName = params.get("serviceTemplateName");
      if (!customerId || !locationId || !serviceTypeId) {
        throw new Error("Missing context to create the pending service");
      }
      const dueDate = params.get("date") || params.get("scheduledDate")?.slice(0, 10) || formatDateInputValue(new Date());
      const response = await apiRequest("POST", "/api/services", {
        customerId,
        locationId,
        agreementId: params.get("agreementId") || null,
        serviceTypeId,
        dueDate,
        expectedDurationMinutes: expectedDurationMinutes ? parseInt(expectedDurationMinutes, 10) : null,
        priceCents: dollarsToCents(price),
        status: "PENDING_SCHEDULING",
        assignedTechnicianId: null,
        source: params.get("agreementId") ? "AGREEMENT_INITIAL" : "MANUAL",
        notes: [params.get("agreementName") ? `Agreement: ${params.get("agreementName")}` : null, serviceTemplateName].filter(Boolean).join("\n") || null,
      });
      return response.json() as Promise<Service>;
    },
    onSuccess: (service) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      setSelectedServiceId(service.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("serviceId", service.id);
      setLocation(`/schedule?${nextParams.toString()}`);
    },
  });

  useEffect(() => {
    const hasExistingService = !!params.get("serviceId");
    const hasSeedContext = !!params.get("customerId") && !!params.get("locationId") && !!params.get("serviceTypeId");
    if (!hasExistingService && hasSeedContext && !prefillServiceMutation.isPending && !prefillServiceMutation.isSuccess) {
      prefillServiceMutation.mutate();
    }
  }, [params, prefillServiceMutation]);

  useEffect(() => {
    const appointmentId = params.get("appointmentId");
    if (appointmentId) {
      setSelectedAppointmentId(appointmentId);
      setSelectedServiceId(null);
    }
  }, [params]);

  // Pass 27b: a deep link (`?appointmentId=` from an invoice's "Open on
  // schedule" or a payment's visit link) can name a placement that has since
  // been cancelled or rescheduled. It is not a card any more, so say so
  // rather than leave a selection with nothing to move.
  useEffect(() => {
    if (!selectedAppointmentId || !appointments) return;
    const named = appointments.find((appointment) => appointment.id === selectedAppointmentId);
    if (!named || isBoardPlacement(named)) return;
    toast({
      title: `Appointment ${describeAppointmentStatus(named).toLowerCase()}`,
      description: "It is no longer on the dispatch board. The location's Services tab and History tab keep its record.",
    });
    setSelectedAppointmentId(null);
  }, [appointments, selectedAppointmentId, toast]);

  const scheduleMutation = useMutation({
    mutationFn: async ({ service, technician, slotDate }: { service: Service; technician: Technician; slotDate: Date }) => {
      const endDate = service.expectedDurationMinutes ? new Date(slotDate.getTime() + service.expectedDurationMinutes * 60 * 1000) : null;
      const response = await apiRequest("POST", "/api/appointments", {
        customerId: service.customerId,
        locationId: service.locationId,
        serviceId: service.id,
        agreementId: service.agreementId || null,
        serviceTypeId: service.serviceTypeId,
        assignedTechnicianId: technician.id,
        assignedTo: technician.displayName,
        source: service.source,
        generatedForDate: service.source === "AGREEMENT_GENERATED" ? service.generatedForDate || service.dueDate || null : null,
        scheduledDate: slotDate.toISOString(),
        scheduledEndDate: endDate ? endDate.toISOString() : null,
        status: "SCHEDULED",
        lockTime: false,
        lockTechnician: false,
        notes: service.notes || null,
      });
      return response.json() as Promise<WithInitialChargeDue<Appointment>>;
    },
    onSuccess: async (createdAppointment) => {
      const additionalServiceIds = groupedServiceIds.filter((id) => id !== createdAppointment.serviceId);
      if (additionalServiceIds.length) {
        await Promise.all(additionalServiceIds.map(async (serviceId) => {
          await apiRequest("PATCH", `/api/services/${serviceId}`, {
            appointmentId: createdAppointment.id,
            assignedTechnicianId: createdAppointment.assignedTechnicianId || null,
            status: createdAppointment.status === "COMPLETED" ? "COMPLETED" : createdAppointment.status === "CANCELED" ? "CANCELLED" : "SCHEDULED",
          });
        }));
      }

      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      if (selectedService?.locationId) {
        queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(selectedService.locationId) });
        queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(selectedService.locationId) });
      }
      setSelectedServiceId(null);
      toast({ title: additionalServiceIds.length ? "Grouped services scheduled" : "Service scheduled" });
      const returnTo = params.get("returnTo");
      // Pass 11d: the office's prompt at scheduling. The server said whether
      // a down payment is still owed on this visit; ask before leaving the
      // board, and follow returnTo once the prompt is answered.
      if (createdAppointment.initialChargeDue) {
        setInitialChargePrompt({ due: createdAppointment.initialChargeDue, returnTo });
        return;
      }
      if (returnTo) {
        setLocation(returnTo);
      }
    },
    onError: (error: Error) => toast({ title: "Unable to schedule service", description: error.message, variant: "destructive" }),
  });
  const [initialChargePrompt, setInitialChargePrompt] = useState<{ due: InitialChargeDue; returnTo: string | null } | null>(null);
  const closeInitialChargePrompt = () => {
    const returnTo = initialChargePrompt?.returnTo ?? null;
    setInitialChargePrompt(null);
    if (returnTo) {
      setLocation(returnTo);
    }
  };

  const attachServiceToAppointmentMutation = useMutation({
    mutationFn: async ({ service, appointment }: { service: Service; appointment: Appointment }) => {
      const bundleIds = groupedServiceIds.length ? groupedServiceIds : [service.id];
      await Promise.all(bundleIds.map(async (serviceId) => {
        await apiRequest("PATCH", `/api/services/${serviceId}`, {
          appointmentId: appointment.id,
          assignedTechnicianId: appointment.assignedTechnicianId || null,
          status: appointment.status === "COMPLETED" ? "COMPLETED" : appointment.status === "CANCELED" ? "CANCELLED" : "SCHEDULED",
        });
      }));
      return service;
    },
    onSuccess: (_service, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(variables.service.locationId) });
      queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(variables.service.locationId) });
      setSelectedServiceId(null);
      toast({ title: groupedServiceIds.length > 1 ? "Services added to shared visit" : "Service added to shared visit" });
      const returnTo = params.get("returnTo");
      if (returnTo) {
        setLocation(returnTo);
      } else {
        setSelectedAppointmentId(variables.appointment.id);
      }
    },
    onError: (error: Error) => toast({ title: "Unable to add service to visit", description: error.message, variant: "destructive" }),
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${id}`, payload);
      return response.json() as Promise<Appointment>;
    },
    onSuccess: (appointment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(appointment.locationId) });
      queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(appointment.locationId) });
      setSelectedAppointmentId(null);
      setEditingAppointmentId((current) => current === appointment.id ? null : current);
      toast({ title: "Appointment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to update appointment", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Pass 27 (C4.2): Cancel appointment / Reschedule from the sheet, one
  // route. A DRAFT invoice on the visit comes back 409 (Q3); the prompt asks,
  // and the same request is resent with the answer.
  const [dispositionDraftPrompt, setDispositionDraftPrompt] = useState<{ id: string; payload: AppointmentDispositionRequest; drafts: DraftInvoiceRef[] } | null>(null);
  const dispositionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AppointmentDispositionRequest }) => {
      const response = await apiRequest("POST", `/api/appointments/${id}/disposition`, payload);
      return response.json() as Promise<AppointmentDispositionOutcome & { appointment: Appointment }>;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location"] });
      queryClient.invalidateQueries({ queryKey: getLocationAppointmentsQueryKey(result.appointment.locationId) });
      queryClient.invalidateQueries({ queryKey: getLocationServicesQueryKey(result.appointment.locationId) });
      setDispositionDraftPrompt(null);
      setEditingAppointmentId((current) => current === variables.id ? null : current);
      setSelectedAppointmentId((current) => current === variables.id ? null : current);
      const requeued = result.services.filter((outcome) => outcome.effect === "REQUEUED").length;
      const cancelled = result.services.filter((outcome) => outcome.effect === "CANCELLED").length;
      const created = result.opportunities.filter((outcome) => outcome.action === "CREATED").length;
      const updated = result.opportunities.filter((outcome) => outcome.action === "UPDATED").length;
      toast({
        title: result.mode === "CANCEL" ? "Appointment cancelled" : "Appointment returned to the queue",
        description: [
          requeued ? `${pluralize(requeued, "service")} back in the pending queue` : null,
          cancelled ? `${pluralize(cancelled, "one-time service")} cancelled` : null,
          created ? `${pluralize(created, "opportunity", "opportunities")} created` : null,
          updated ? `${pluralize(updated, "open opportunity", "open opportunities")} re-dated` : null,
          result.draftInvoicesVoided ? `${pluralize(result.draftInvoicesVoided, "draft invoice")} voided` : null,
        ].filter(Boolean).join("; ") || undefined,
      });
    },
    onError: (error: Error, variables) => {
      const drafts = getDraftInvoiceDecisionRequired(error);
      if (drafts) {
        setDispositionDraftPrompt({ id: variables.id, payload: variables.payload, drafts });
        return;
      }
      toast({
        title: variables.payload.mode === "CANCEL" ? "Unable to cancel appointment" : "Unable to reschedule appointment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Pass 27 (B2): a board move is confirmed before it writes. Click a card,
  // click a slot, and this holds the move until "Move" is pressed.
  const [pendingMove, setPendingMove] = useState<{ appointment: Appointment; technician: Technician; slotDate: Date } | null>(null);

  const moveWindow = (direction: 1 | -1) => {
    setCurrentDate((prev) => addDays(prev, currentView.step * direction));
  };

  const moveAppointmentToSlot = (appointment: Appointment, technician: Technician, slotDate: Date) => {
    const currentTechId = appointment.assignedTechnicianId || "";
    const movingTechnician = currentTechId !== technician.id;
    const movingTime = !isSameSlot(appointment.scheduledDate, slotDate);

    if (appointment.lockTechnician && movingTechnician) {
      toast({ title: "Technician locked", description: "Unlock technician assignment before reassigning this job.", variant: "destructive" });
      return;
    }

    if (appointment.lockTime && movingTime) {
      toast({ title: "Time locked", description: "Unlock time before moving this job to a different slot.", variant: "destructive" });
      return;
    }

    if (!movingTechnician && !movingTime) {
      return;
    }

    setPendingMove({ appointment, technician, slotDate });
  };

  const confirmPendingMove = () => {
    if (!pendingMove) return;
    const { appointment, technician, slotDate } = pendingMove;
    const linkedService = appointment.serviceId ? serviceById.get(appointment.serviceId) : null;
    const durationMinutes = getAppointmentDurationMinutes(appointment, linkedService || undefined);
    const scheduledEndDate = durationMinutes ? new Date(slotDate.getTime() + durationMinutes * 60 * 1000).toISOString() : null;

    setPendingMove(null);
    updateAppointmentMutation.mutate({
      id: appointment.id,
      payload: {
        assignedTechnicianId: technician.id,
        assignedTo: technician.displayName,
        scheduledDate: slotDate.toISOString(),
        scheduledEndDate,
      },
    });
  };

  const handleSlotClick = (technician: Technician, slotDate: Date) => {
    if (selectedService) {
      scheduleMutation.mutate({ service: selectedService, technician, slotDate });
      return;
    }

    if (selectedAppointment) {
      moveAppointmentToSlot(selectedAppointment, technician, slotDate);
    }
  };

  const handleAppointmentCardClick = (appointment: Appointment) => {
    if (selectedService) {
      if (selectedService.locationId !== appointment.locationId) {
        toast({
          title: "Different location",
          description: "Only services from the same location can be grouped into one appointment.",
          variant: "destructive",
        });
        return;
      }

      attachServiceToAppointmentMutation.mutate({ service: selectedService, appointment });
      return;
    }

    setSelectedAppointmentId(appointment.id);
    setSelectedServiceId(null);
  };

  const analytics = useMemo(() => {
    const totals = { jobs: viewportAppointments.length, revenueCents: 0 };
    const byTechnician = new Map<string, { technicianName: string; jobs: number; revenueCents: number }>();

    for (const appointment of viewportAppointments) {
      const linkedServices = servicesByAppointmentId.get(appointment.id)
        ?? (appointment.serviceId ? [serviceById.get(appointment.serviceId)].filter((service): service is Service => !!service) : []);
      const revenueCents = linkedServices.reduce((sum, service) => sum + (service.priceCents ?? 0), 0);
      totals.revenueCents += revenueCents;

      const technician = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId) : null;
      const key = appointment.assignedTechnicianId || "unassigned";
      const current = byTechnician.get(key) || {
        technicianName: technician?.displayName || appointment.assignedTo || "Unassigned",
        jobs: 0,
        revenueCents: 0,
      };
      current.jobs += 1;
      current.revenueCents += revenueCents;
      byTechnician.set(key, current);
    }

    return {
      ...totals,
      byTechnician: Array.from(byTechnician.values()).sort((left, right) => right.jobs - left.jobs),
    };
  }, [serviceById, servicesByAppointmentId, technicianById, viewportAppointments]);

  const editingAppointmentService = editingAppointment?.serviceId ? serviceById.get(editingAppointment.serviceId) ?? null : null;
  // Pass 27: what the sheet's disposition touches, and whether an
  // opportunity is already open on any of it (the "Update existing" choice).
  const editingLinkedServices = useMemo(() => {
    if (!editingAppointment) return [];
    const linked = servicesByAppointmentId.get(editingAppointment.id) ?? [];
    return editingAppointmentService && !linked.some((linkedService) => linkedService.id === editingAppointmentService.id)
      ? [...linked, editingAppointmentService]
      : linked;
  }, [editingAppointment, editingAppointmentService, servicesByAppointmentId]);
  const { data: editingLocationOpportunities } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities/by-location", editingAppointment?.locationId ?? ""],
    enabled: !!editingAppointment?.locationId,
  });
  const editingOpenOpportunityCount = useMemo(() => {
    const serviceIds = new Set(editingLinkedServices.map((linkedService) => linkedService.id));
    return (editingLocationOpportunities ?? []).filter((opportunity) => opportunity.status === "OPEN" && !!opportunity.sourceServiceId && serviceIds.has(opportunity.sourceServiceId)).length;
  }, [editingLinkedServices, editingLocationOpportunities]);
  const detailTechnicianName = detailService?.assignedTechnicianId ? technicianById.get(detailService.assignedTechnicianId)?.displayName || "" : "";
  const configSummary = `${getHourLabel(boardStartHour)} - ${getHourLabel(boardEndHour)} | ${slotIntervalHours}-hour slots`;
  const isLoading = techniciansLoading || appointmentsLoading || servicesLoading || pendingLoading || prefillServiceMutation.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Dispatch Board</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Select pending work to place it, or select an appointment card to move or reassign it.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {VIEW_OPTIONS.map((option) => (
            <Button key={option.value} variant={view === option.value ? "default" : "outline"} size="sm" onClick={() => setView(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Jobs In View</p><p className="mt-1 text-2xl font-semibold">{analytics.jobs}</p></div><ClipboardList className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled Revenue</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(analytics.revenueCents)}</p></div><DollarSign className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Board Window</p><p className="mt-1 text-sm font-semibold">{configSummary}</p><p className="mt-1 text-xs text-muted-foreground">{getViewportLabel(boardDates)}</p></div><Clock3 className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
      </div>

      {analytics.byTechnician.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {analytics.byTechnician.map((row) => (
            <Card key={row.technicianName}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{row.technicianName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.jobs} jobs in view</p>
                <p className="mt-2 text-sm font-semibold">{formatCurrency(row.revenueCents)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => moveWindow(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => moveWindow(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                Jump to Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => {
                  if (!date) return;
                  setCurrentDate(date);
                  setDatePickerOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
            {getViewportLabel(boardDates)}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Window
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible Start Hour</label>
                <select
                  value={boardStartHour}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setBoardStartHour(value);
                    if (boardEndHour <= value + slotIntervalHours) {
                      setBoardEndHour(Math.min(value + slotIntervalHours * 2, 21));
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {HOUR_OPTIONS.map((hour) => <option key={`start-${hour}`} value={hour}>{getHourLabel(hour)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible End Hour</label>
                <select
                  value={boardEndHour}
                  onChange={(event) => setBoardEndHour(Number(event.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {HOUR_OPTIONS.filter((hour) => hour > boardStartHour).map((hour) => <option key={`end-${hour}`} value={hour}>{getHourLabel(hour)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slot Interval</label>
                <select
                  value={slotIntervalHours}
                  onChange={(event) => setSlotIntervalHours(Number(event.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SLOT_INTERVAL_OPTIONS.map((hours) => <option key={`interval-${hours}`} value={hours}>{hours} hour</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Board window configuration is live for this session. Technician/day availability blocks remain a follow-up pass.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {(selectedService || selectedAppointment) ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="text-sm">
              {selectedService ? (
                <>
                  <p className="font-medium">Scheduling selected service</p>
                  <p className="text-muted-foreground">Click an empty slot to create a new visit, or click an existing appointment card at the same location to add this service to that visit.</p>
                  {selectedService.timeWindow ? <p className="text-muted-foreground">Preferred time window: {selectedService.timeWindow}</p> : null}
                </>
              ) : selectedAppointment ? (
                <>
                  <p className="font-medium">Move / reassign selected appointment</p>
                  <p className="text-muted-foreground">Click a new slot to move it. Locked dimensions stay fixed. This visit currently includes {(servicesByAppointmentId.get(selectedAppointment.id)?.length ?? 1)} service(s).</p>
                </>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedServiceId(null); setSelectedAppointmentId(null); }}>
              Clear Selection
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Technician Dispatch Board</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((index) => <Skeleton key={index} className="h-20" />)}</div>
          ) : visibleTechnicians.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No technicians available for dispatch in this viewport.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: `200px repeat(${boardDates.length * slotHours.length}, minmax(136px, 1fr))` }}>
                  <div className="border-r px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Technician</div>
                  {boardDates.flatMap((date) => slotHours.map((hour) => (
                    <div key={`${formatDateInputValue(date)}-${hour}`} className="border-r px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                      <div>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      <div>{getHourLabel(hour)}</div>
                    </div>
                  )))}
                </div>
                {visibleTechnicians.map((technician) => (
                  <div key={technician.id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: `200px repeat(${boardDates.length * slotHours.length}, minmax(136px, 1fr))` }}>
                    <div className="border-r px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: technician.color || "#2563eb" }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{technician.displayName}</p>
                            {technician.status !== "ACTIVE" ? <Badge variant="secondary" className="text-[10px]">{technician.status}</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{technician.licenseId}</p>
                        </div>
                      </div>
                    </div>
                    {boardDates.flatMap((date) => slotHours.map((hour) => {
                      const slotDate = buildSlotDate(date, hour);
                      const slotKey = `${technician.id}:${formatDateInputValue(slotDate)}:${hour}`;
                      const slotAppointments = appointmentsByTechnicianAndSlot.get(slotKey) ?? [];
                      const slotActionable = !!selectedService || !!selectedAppointment;
                      return (
                        <div
                          key={slotKey}
                          className={`min-h-[108px] border-r px-2 py-2 align-top transition-colors ${slotActionable ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/20"}`}
                          onClick={() => slotActionable && handleSlotClick(technician, slotDate)}
                        >
                          <div className="text-[11px] text-muted-foreground">{getHourLabel(hour)}</div>
                          <div className="mt-2 space-y-2">
                            {slotAppointments.map((appointment) => {
                              const linkedServices = servicesByAppointmentId.get(appointment.id)
                                ?? (appointment.serviceId ? [serviceById.get(appointment.serviceId)].filter((service): service is Service => !!service) : []);
                              const linkedService = linkedServices[0] ?? null;
                              const customer = customerById.get(appointment.customerId);
                              const location = appointment.locationId ? locationById.get(appointment.locationId) : undefined;
                              const customerLabel = getCustomerLabel(customer, location);
                              const locationLabel = getLocationLabel(location);
                              const serviceTypeName = serviceTypeNameById.get(appointment.serviceTypeId || linkedService?.serviceTypeId || "") || "Service";
                              const durationMinutes = getAppointmentDurationMinutes(appointment, linkedService || undefined);
                              const technicianName = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId)?.displayName || appointment.assignedTo || "Technician" : appointment.assignedTo || "Unassigned";
                              const isSelected = selectedAppointmentId === appointment.id;
                              const hasLocks = appointment.lockTime || appointment.lockTechnician;
                              const siblingCount = Math.max(linkedServices.length - 1, 0);
                              const linkedServiceRecords = linkedServices
                                .map((service) => serviceRecordByServiceId.get(service.id))
                                .filter((record): record is ServiceRecord => !!record);
                              const anyTicketPosted = linkedServiceRecords.length > 0 || linkedServices.some((service) => service.status === "COMPLETED");
                              const allTicketsFinalized = linkedServices.length > 0
                                && linkedServices.every((service) => serviceRecordByServiceId.get(service.id)?.confirmed);
                              const isCompletedAppointment = appointment.status === "COMPLETED" && allTicketsFinalized;
                              const isPendingOfficeReview = anyTicketPosted && !allTicketsFinalized;
                              // Pass 27b: no red tone - a CANCELED placement is not a card (isBoardPlacement).
                              const statusTone = isCompletedAppointment
                                ? "border-green-600 bg-green-100 text-green-950"
                                : isPendingOfficeReview || appointment.status === "IN_PROGRESS"
                                  ? "border-yellow-500 bg-yellow-50 text-yellow-950"
                                  : "border-blue-500 bg-blue-50 text-blue-950";
                              const mutedTextTone = isCompletedAppointment
                                ? "text-green-900"
                                : isPendingOfficeReview || appointment.status === "IN_PROGRESS"
                                  ? "text-yellow-900"
                                  : "text-blue-900";
                              const locationHref = location ? `/customers/${appointment.customerId}?locationId=${location.id}` : `/customers/${appointment.customerId}`;

                              return (
                                <HoverCard key={appointment.id} openDelay={150}>
                                  <HoverCardTrigger asChild>
                                    <div
                                      className={`rounded-md border px-2 py-2 text-xs shadow-sm transition-colors ${statusTone} ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleAppointmentCardClick(appointment);
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <button type="button" className="truncate text-left font-medium underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); setLocation(locationHref); }}>
                                            {customerLabel}
                                          </button>
                                          <button type="button" className={`mt-0.5 block truncate text-left underline-offset-2 hover:underline ${mutedTextTone}`} onClick={(event) => { event.stopPropagation(); if (linkedService?.id) setDetailServiceId(linkedService.id); }}>
                                            {serviceTypeName}
                                          </button>
                                          {siblingCount > 0 ? <p className={`mt-1 text-[11px] ${mutedTextTone}`}>+ {siblingCount} other service{siblingCount === 1 ? "" : "s"}</p> : null}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          {hasLocks ? <Lock className={`h-3.5 w-3.5 ${mutedTextTone}`} /> : null}
                                          <button type="button" className={`rounded p-1 transition-colors hover:bg-muted hover:text-foreground ${mutedTextTone}`} onClick={(event) => { event.stopPropagation(); setEditingAppointmentId(appointment.id); }} aria-label="Edit appointment">
                                            <Settings2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className={`mt-2 flex items-center justify-between gap-2 text-[11px] ${mutedTextTone}`}>
                                        <span>{new Date(appointment.scheduledDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                                        {durationMinutes ? <span>{durationMinutes} min</span> : null}
                                      </div>
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent align="start" className="w-72 p-3">
                                    <div className="space-y-2 text-xs">
                                      <div>
                                        <p className="font-semibold">{customerLabel}</p>
                                        <p className="text-muted-foreground">{locationLabel}</p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Service</p><p className="mt-1">{serviceTypeName}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Technician</p><p className="mt-1">{technicianName}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Time</p><p className="mt-1">{new Date(appointment.scheduledDate).toLocaleString()}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Duration</p><p className="mt-1">{durationMinutes ? `${durationMinutes} min` : "Not set"}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1">{describeAppointmentStatus(appointment)}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Revenue</p><p className="mt-1">{formatCurrency(linkedServices.reduce((sum, service) => sum + (service.priceCents ?? 0), 0))}</p></div>
                                      </div>
                                      {siblingCount > 0 ? <div className="rounded-md border bg-muted/20 px-2 py-2 text-[11px]">This appointment includes {linkedServices.length} services in one visit.</div> : null}
                                      {hasLocks ? <div className="rounded-md border bg-muted/20 px-2 py-2 text-[11px]">Lock state: {appointment.lockTime ? "Time locked" : "Time flexible"} | {appointment.lockTechnician ? "Technician locked" : "Technician flexible"}</div> : null}
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            })}
                            {!slotAppointments.length && slotActionable ? <div className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-primary">{selectedService ? "Place service here" : "Move here"}</div> : null}
                          </div>
                        </div>
                      );
                    }))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Pending Dispatch Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : !pendingServices || pendingServices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No pending services waiting for dispatch.</div>
          ) : (
            <div className="space-y-2">
              {pendingServices.map((service) => {
                const location = locationById.get(service.locationId);
                const customer = customerById.get(service.customerId);
                const isSelected = service.id === selectedServiceId;
                return (
                  <button
                    key={service.id}
                    type="button"
                    className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/20"}`}
                    onClick={() => {
                      setSelectedServiceId(service.id);
                      setSelectedAppointmentId(null);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{getCustomerLabel(customer, location)}</p>
                        <Badge variant="outline" className="text-xs">{service.status}</Badge>
                        {service.source === "AGREEMENT_GENERATED" ? <Badge variant="secondary" className="text-xs">Agreement</Badge> : null}
                        {service.schedulingMode ? <Badge variant="outline" className="text-xs">{service.schedulingMode}</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"} | {service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Duration not set"} | Due {service.dueDate || "Not set"}</p>
                      {service.serviceWindowStart ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Service window: {service.serviceWindowStart}{service.serviceWindowEnd ? ` to ${service.serviceWindowEnd}` : ""}
                        </p>
                      ) : null}
                      {service.timeWindow ? <p className="mt-1 text-xs text-muted-foreground">Time window: {service.timeWindow}</p> : null}
                      {service.agreementId ? <p className="mt-1 text-xs text-muted-foreground">Agreement: {service.agreementId.slice(0, 8)}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">{getLocationLabel(location)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{formatCurrency(service.priceCents)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{isSelected ? "Selected" : "Click to dispatch"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AppointmentSheet
        appointment={editingAppointment}
        service={editingAppointmentService}
        linkedServices={editingLinkedServices}
        technicianOptions={technicians ?? []}
        serviceTypeName={editingAppointment ? serviceTypeNameById.get(editingAppointment.serviceTypeId || editingAppointmentService?.serviceTypeId || "") || "Service" : "Service"}
        customerLabel={editingAppointment ? getCustomerLabel(customerById.get(editingAppointment.customerId), editingAppointment.locationId ? locationById.get(editingAppointment.locationId) : undefined) : "Location service"}
        locationLabel={editingAppointment?.locationId ? getLocationLabel(locationById.get(editingAppointment.locationId)) : "Location"}
        cancelReasons={cancelReasonSettings?.reasons ?? []}
        openOpportunityCount={editingOpenOpportunityCount}
        open={!!editingAppointment}
        onOpenChange={(open) => { if (!open) setEditingAppointmentId(null); }}
        onSave={(payload) => {
          if (!editingAppointment) return;
          updateAppointmentMutation.mutate({
            id: editingAppointment.id,
            payload: {
              assignedTechnicianId: payload.assignedTechnicianId,
              assignedTo: payload.assignedTechnicianId ? technicianById.get(payload.assignedTechnicianId)?.displayName || null : null,
              scheduledDate: payload.scheduledDate,
              scheduledEndDate: payload.scheduledEndDate,
              status: payload.status,
              lockTime: payload.lockTime,
              lockTechnician: payload.lockTechnician,
              notes: payload.notes,
            },
          });
        }}
        onDisposition={(payload) => {
          if (!editingAppointment) return;
          dispositionMutation.mutate({ id: editingAppointment.id, payload });
        }}
        isSaving={updateAppointmentMutation.isPending}
        isDispositioning={dispositionMutation.isPending}
      />

      <InitialChargeDuePrompt due={initialChargePrompt?.due ?? null} onClose={closeInitialChargePrompt} />

      <DraftInvoiceVoidPrompt
        drafts={dispositionDraftPrompt?.drafts ?? null}
        isPending={dispositionMutation.isPending}
        onDecide={(voidDraftInvoices) => {
          if (!dispositionDraftPrompt) return;
          dispositionMutation.mutate({ id: dispositionDraftPrompt.id, payload: { ...dispositionDraftPrompt.payload, voidDraftInvoices } });
        }}
        onBack={() => setDispositionDraftPrompt(null)}
      />

      <AlertDialog open={!!pendingMove} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMove ? `Move to ${pendingMove.technician.displayName}, ${formatSlotLabel(pendingMove.slotDate)}?` : "Move appointment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove
                ? `${getCustomerLabel(customerById.get(pendingMove.appointment.customerId), pendingMove.appointment.locationId ? locationById.get(pendingMove.appointment.locationId) : undefined)} - ${serviceTypeNameById.get(pendingMove.appointment.serviceTypeId || "") || "Service"}, now ${formatSlotLabel(new Date(pendingMove.appointment.scheduledDate))} with ${pendingMove.appointment.assignedTechnicianId ? technicianById.get(pendingMove.appointment.assignedTechnicianId)?.displayName || pendingMove.appointment.assignedTo || "an unnamed technician" : "no technician"}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingMove(null)}>Keep it where it is</Button>
            <Button type="button" onClick={confirmPendingMove} disabled={updateAppointmentMutation.isPending}>Move</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceDetailDialog
        service={detailService}
        serviceTypeName={detailService ? serviceTypeNameById.get(detailService.serviceTypeId || "") || "Service" : "Service"}
        customerLabel={detailService ? getCustomerLabel(customerById.get(detailService.customerId), locationById.get(detailService.locationId)) : "Location service"}
        locationLabel={detailService ? getLocationLabel(locationById.get(detailService.locationId)) : "Location"}
        technicianName={detailTechnicianName}
        open={!!detailService}
        onOpenChange={(open) => { if (!open) setDetailServiceId(null); }}
      />
    </div>
  );
}
