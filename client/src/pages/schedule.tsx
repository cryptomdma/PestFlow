import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, ClipboardList, MapPin, Users } from "lucide-react";
import type { Appointment, Customer, Location, Service, ServiceType, Technician } from "@shared/schema";

const VIEW_OPTIONS = [
  { value: "day", label: "1 Day", step: 1 },
  { value: "three-day", label: "3 Day", step: 3 },
  { value: "week", label: "1 Week", step: 7 },
] as const;

const HOURS = [8, 10, 12, 14, 16];

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  const { data: technicians, isLoading: techniciansLoading } = useQuery<Technician[]>({ queryKey: ["/api/technicians"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: pendingServices, isLoading: pendingLoading } = useQuery<Service[]>({ queryKey: ["/api/services/pending"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });

  const activeTechnicians = useMemo(() => (technicians ?? []).filter((technician) => technician.status === "ACTIVE"), [technicians]);
  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);

  const currentView = VIEW_OPTIONS.find((option) => option.value === view)!;
  const boardDates = useMemo(() => {
    return Array.from({ length: currentView.step }, (_, index) => startOfDay(addDays(currentDate, index)));
  }, [currentDate, currentView.step]);

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

  const selectedService = useMemo(() => {
    return (pendingServices ?? []).find((service) => service.id === selectedServiceId) ?? null;
  }, [pendingServices, selectedServiceId]);

  const appointmentsByTechnicianAndSlot = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of appointments ?? []) {
      if (!appointment.assignedTechnicianId) continue;
      const scheduled = new Date(appointment.scheduledDate);
      const hourSlot = HOURS.reduce((closest, hour) => (Math.abs(hour - scheduled.getHours()) < Math.abs(closest - scheduled.getHours()) ? hour : closest), HOURS[0]);
      const key = `${appointment.assignedTechnicianId}:${formatDateInputValue(scheduled)}:${hourSlot}`;
      const items = map.get(key) ?? [];
      items.push(appointment);
      map.set(key, items);
    }
    return map;
  }, [appointments]);

  const scheduleMutation = useMutation({
    mutationFn: async ({ service, technician, slotDate }: { service: Service; technician: Technician; slotDate: Date }) => {
      const endDate = service.expectedDurationMinutes
        ? new Date(slotDate.getTime() + service.expectedDurationMinutes * 60 * 1000)
        : null;
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
        notes: service.notes || null,
      });
      return response.json() as Promise<Appointment>;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      if (selectedService?.locationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", selectedService.locationId] });
        queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", selectedService.locationId] });
      }
      toast({ title: "Service scheduled" });
      const returnTo = params.get("returnTo");
      if (returnTo) {
        setLocation(returnTo);
      }
    },
    onError: (error: Error) => toast({ title: "Unable to schedule service", description: error.message, variant: "destructive" }),
  });

  const moveWindow = (direction: 1 | -1) => {
    setCurrentDate((prev) => addDays(prev, currentView.step * direction));
  };

  const isLoading = techniciansLoading || appointmentsLoading || pendingLoading || prefillServiceMutation.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Dispatch Board</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Technicians run vertically, time runs horizontally, and pending services stay visible until dispatched.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {VIEW_OPTIONS.map((option) => (
            <Button key={option.value} variant={view === option.value ? "default" : "outline"} size="sm" onClick={() => setView(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => moveWindow(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => moveWindow(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
        </div>
        <p className="text-sm font-medium">
          {boardDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {boardDates.length > 1 && ` - ${boardDates[boardDates.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Technician Dispatch Board</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((index) => <Skeleton key={index} className="h-20" />)}</div>
          ) : activeTechnicians.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No active technicians available for dispatch.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[960px]">
                <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: `180px repeat(${boardDates.length * HOURS.length}, minmax(120px, 1fr))` }}>
                  <div className="border-r px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Technician</div>
                  {boardDates.flatMap((date) => HOURS.map((hour) => (
                    <div key={`${formatDateInputValue(date)}-${hour}`} className="border-r px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                      <div>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      <div>{new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" })}</div>
                    </div>
                  )))}
                </div>
                {activeTechnicians.map((technician) => (
                  <div key={technician.id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: `180px repeat(${boardDates.length * HOURS.length}, minmax(120px, 1fr))` }}>
                    <div className="border-r px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: technician.color || "#2563eb" }} />
                        <div>
                          <p className="text-sm font-medium">{technician.displayName}</p>
                          <p className="text-xs text-muted-foreground">{technician.licenseId}</p>
                        </div>
                      </div>
                    </div>
                    {boardDates.flatMap((date) => HOURS.map((hour) => {
                      const slotDate = buildSlotDate(date, hour);
                      const slotKey = `${technician.id}:${formatDateInputValue(slotDate)}:${hour}`;
                      const slotAppointments = appointmentsByTechnicianAndSlot.get(slotKey) ?? [];
                      return (
                        <button
                          key={slotKey}
                          type="button"
                          className={`min-h-[92px] border-r px-2 py-2 text-left align-top transition-colors ${selectedService ? "hover:bg-primary/5" : "hover:bg-muted/20"}`}
                          onClick={() => selectedService && scheduleMutation.mutate({ service: selectedService, technician, slotDate })}
                          disabled={!selectedService || scheduleMutation.isPending}
                        >
                          <div className="text-[11px] text-muted-foreground">{new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" })}</div>
                          <div className="mt-2 space-y-1">
                            {slotAppointments.map((appointment) => (
                              <div key={appointment.id} className="rounded-md border bg-background px-2 py-1 text-xs">
                                <p className="font-medium">{customerById.get(appointment.customerId)?.lastName || "Location"}</p>
                                <p className="text-muted-foreground">{serviceTypeNameById.get(appointment.serviceTypeId || "") || "Service"}</p>
                              </div>
                            ))}
                            {!slotAppointments.length && selectedService && (
                              <div className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-primary">Place here</div>
                            )}
                          </div>
                        </button>
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
                    onClick={() => setSelectedServiceId(service.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{customer ? `${customer.firstName} ${customer.lastName}` : "Location service"}</p>
                        <Badge variant="outline" className="text-xs">{service.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"} | {service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Duration not set"} | Due {service.dueDate || "Not set"}</p>
                      {location && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {location.name} - {location.address}</p>}
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
    </div>
  );
}
