import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import type { Appointment, Customer, Location, Service, ServiceType, Technician } from "@shared/schema";

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

function formatCurrency(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(value));
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

function AppointmentSheet({
  appointment,
  service,
  technicianOptions,
  serviceTypeName,
  customerLabel,
  locationLabel,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  appointment: Appointment | null;
  service: Service | null;
  technicianOptions: Technician[];
  serviceTypeName: string;
  customerLabel: string;
  locationLabel: string;
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
  isSaving: boolean;
}) {
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [lockTime, setLockTime] = useState(false);
  const [lockTechnician, setLockTechnician] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!appointment) return;
    setAssignedTechnicianId(appointment.assignedTechnicianId || "");
    setScheduledDate(formatDateTimeLocalValue(appointment.scheduledDate));
    setScheduledEndDate(formatDateTimeLocalValue(appointment.scheduledEndDate));
    setStatus(appointment.status || "scheduled");
    setLockTime(appointment.lockTime ?? false);
    setLockTechnician(appointment.lockTechnician ?? false);
    setNotes(appointment.notes || "");
  }, [appointment]);

  return (
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
                <Badge variant="outline">{appointment.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{locationLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Service value: {formatCurrency(service?.price)}</p>
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
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
                <option value="pending">Pending</option>
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

            <div className="flex items-center justify-end gap-2">
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
                <p className="mt-1 font-medium">{formatCurrency(service.price)}</p>
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

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: allServices, isLoading: servicesLoading } = useQuery<Service[]>({ queryKey: ["/api/services"] });
  const { data: pendingServices, isLoading: pendingLoading } = useQuery<Service[]>({ queryKey: ["/api/services/pending"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const serviceById = useMemo(() => new Map((allServices ?? []).map((service) => [service.id, service])), [allServices]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);
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

  const viewportAppointments = useMemo(() => {
    return (appointments ?? []).filter((appointment) => {
      const scheduled = new Date(appointment.scheduledDate);
      return scheduled >= viewportBounds.start && scheduled < viewportBounds.end;
    });
  }, [appointments, viewportBounds.end, viewportBounds.start]);

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
  const selectedAppointment = useMemo(() => (appointments ?? []).find((appointment) => appointment.id === selectedAppointmentId) ?? null, [appointments, selectedAppointmentId]);
  const editingAppointment = useMemo(() => (appointments ?? []).find((appointment) => appointment.id === editingAppointmentId) ?? null, [appointments, editingAppointmentId]);
  const detailService = useMemo(() => (detailServiceId ? serviceById.get(detailServiceId) ?? null : null), [detailServiceId, serviceById]);

  const prefillServiceMutation = useMutation({
    mutationFn: async () => {
      const customerId = params.get("customerId");
      const locationId = params.get("locationId");
      const serviceTypeId = params.get("serviceTypeId");
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
        expectedDurationMinutes: null,
        price: null,
        status: "PENDING_SCHEDULING",
        assignedTechnicianId: null,
        source: params.get("agreementId") ? "AGREEMENT_INITIAL" : "MANUAL",
        notes: params.get("agreementName") ? `Agreement: ${params.get("agreementName")}` : null,
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
        generatedForDate: service.source === "AGREEMENT_GENERATED" ? service.dueDate || null : null,
        scheduledDate: slotDate.toISOString(),
        scheduledEndDate: endDate ? endDate.toISOString() : null,
        status: "scheduled",
        lockTime: false,
        lockTechnician: false,
        notes: service.notes || null,
      });
      return response.json() as Promise<Appointment>;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      setSelectedServiceId(null);
      toast({ title: "Service scheduled" });
      const returnTo = params.get("returnTo");
      if (returnTo) {
        setLocation(returnTo);
      }
    },
    onError: (error: Error) => toast({ title: "Unable to schedule service", description: error.message, variant: "destructive" }),
  });

  const attachServiceToAppointmentMutation = useMutation({
    mutationFn: async ({ service, appointment }: { service: Service; appointment: Appointment }) => {
      const response = await apiRequest("PATCH", `/api/services/${service.id}`, {
        appointmentId: appointment.id,
        assignedTechnicianId: appointment.assignedTechnicianId || null,
        status: appointment.status === "completed" ? "COMPLETED" : appointment.status === "canceled" ? "CANCELLED" : "SCHEDULED",
      });
      return response.json() as Promise<Service>;
    },
    onSuccess: (_service, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setSelectedServiceId(null);
      toast({ title: "Service added to shared visit" });
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
      setSelectedAppointmentId(null);
      setEditingAppointmentId((current) => current === appointment.id ? null : current);
      toast({ title: "Appointment updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update appointment", description: error.message, variant: "destructive" }),
  });

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

    const linkedService = appointment.serviceId ? serviceById.get(appointment.serviceId) : null;
    const durationMinutes = getAppointmentDurationMinutes(appointment, linkedService || undefined);
    const scheduledEndDate = durationMinutes ? new Date(slotDate.getTime() + durationMinutes * 60 * 1000).toISOString() : null;

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
    const totals = { jobs: viewportAppointments.length, revenue: 0 };
    const byTechnician = new Map<string, { technicianName: string; jobs: number; revenue: number }>();

    for (const appointment of viewportAppointments) {
      const linkedServices = servicesByAppointmentId.get(appointment.id)
        ?? (appointment.serviceId ? [serviceById.get(appointment.serviceId)].filter((service): service is Service => !!service) : []);
      const revenue = linkedServices.reduce((sum, service) => sum + (service.price ? parseFloat(service.price) : 0), 0);
      totals.revenue += revenue;

      const technician = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId) : null;
      const key = appointment.assignedTechnicianId || "unassigned";
      const current = byTechnician.get(key) || {
        technicianName: technician?.displayName || appointment.assignedTo || "Unassigned",
        jobs: 0,
        revenue: 0,
      };
      current.jobs += 1;
      current.revenue += revenue;
      byTechnician.set(key, current);
    }

    return {
      ...totals,
      byTechnician: Array.from(byTechnician.values()).sort((left, right) => right.jobs - left.jobs),
    };
  }, [serviceById, servicesByAppointmentId, technicianById, viewportAppointments]);

  const editingAppointmentService = editingAppointment?.serviceId ? serviceById.get(editingAppointment.serviceId) ?? null : null;
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
        <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled Revenue</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(String(analytics.revenue.toFixed(2)))}</p></div><DollarSign className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Board Window</p><p className="mt-1 text-sm font-semibold">{configSummary}</p><p className="mt-1 text-xs text-muted-foreground">{getViewportLabel(boardDates)}</p></div><Clock3 className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
      </div>

      {analytics.byTechnician.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {analytics.byTechnician.map((row) => (
            <Card key={row.technicianName}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{row.technicianName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.jobs} jobs in view</p>
                <p className="mt-2 text-sm font-semibold">{formatCurrency(String(row.revenue.toFixed(2)))}</p>
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

                              return (
                                <HoverCard key={appointment.id} openDelay={150}>
                                  <HoverCardTrigger asChild>
                                    <div
                                      className={`rounded-md border bg-background px-2 py-2 text-xs shadow-sm transition-colors ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleAppointmentCardClick(appointment);
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <button type="button" className="truncate text-left font-medium underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); if (linkedService?.id) setDetailServiceId(linkedService.id); }}>
                                            {customerLabel}
                                          </button>
                                          <button type="button" className="mt-0.5 block truncate text-left text-muted-foreground underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); if (linkedService?.id) setDetailServiceId(linkedService.id); }}>
                                            {serviceTypeName}
                                          </button>
                                          {siblingCount > 0 ? <p className="mt-1 text-[11px] text-muted-foreground">+ {siblingCount} other service{siblingCount === 1 ? "" : "s"}</p> : null}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          {hasLocks ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                                          <button type="button" className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={(event) => { event.stopPropagation(); setEditingAppointmentId(appointment.id); }} aria-label="Edit appointment">
                                            <Settings2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
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
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1">{appointment.status}</p></div>
                                        <div><p className="uppercase tracking-wide text-muted-foreground">Revenue</p><p className="mt-1">{formatCurrency(String(linkedServices.reduce((sum, service) => sum + (service.price ? parseFloat(service.price) : 0), 0).toFixed(2)))}</p></div>
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
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"} | {service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Duration not set"} | Due {service.dueDate || "Not set"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{getLocationLabel(location)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{formatCurrency(service.price)}</p>
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
        technicianOptions={technicians ?? []}
        serviceTypeName={editingAppointment ? serviceTypeNameById.get(editingAppointment.serviceTypeId || editingAppointmentService?.serviceTypeId || "") || "Service" : "Service"}
        customerLabel={editingAppointment ? getCustomerLabel(customerById.get(editingAppointment.customerId), editingAppointment.locationId ? locationById.get(editingAppointment.locationId) : undefined) : "Location service"}
        locationLabel={editingAppointment?.locationId ? getLocationLabel(locationById.get(editingAppointment.locationId)) : "Location"}
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
        isSaving={updateAppointmentMutation.isPending}
      />

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
