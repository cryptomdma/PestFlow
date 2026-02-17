import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  MapPin,
} from "lucide-react";
import type { Customer, Appointment, ServiceType, Location } from "@shared/schema";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function AppointmentForm({ onClose, initialDate }: { onClose: () => void; initialDate?: Date }) {
  const { toast } = useToast();
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: allLocations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });

  const [form, setForm] = useState({
    customerId: "",
    locationId: "",
    serviceTypeId: "",
    scheduledDate: initialDate ? initialDate.toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    scheduledEndDate: "",
    assignedTo: "",
    notes: "",
    status: "scheduled",
  });

  const customerLocations = allLocations?.filter((l) => l.customerId === form.customerId) || [];

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/appointments", {
        ...data,
        scheduledDate: new Date(data.scheduledDate).toISOString(),
        scheduledEndDate: data.scheduledEndDate ? new Date(data.scheduledEndDate).toISOString() : null,
        locationId: data.locationId || null,
        serviceTypeId: data.serviceTypeId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment scheduled" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Customer *</Label>
        <Select value={form.customerId} onValueChange={(v) => setForm((p) => ({ ...p, customerId: v, locationId: "" }))}>
          <SelectTrigger data-testid="select-appt-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
          <SelectContent>
            {customers?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.companyName ? ` (${c.companyName})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {customerLocations.length > 0 && (
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Select value={form.locationId} onValueChange={(v) => setForm((p) => ({ ...p, locationId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
            <SelectContent>
              {customerLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name} - {l.address}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Service Type</Label>
        <Select value={form.serviceTypeId} onValueChange={(v) => setForm((p) => ({ ...p, serviceTypeId: v }))}>
          <SelectTrigger data-testid="select-service-type"><SelectValue placeholder="Select service" /></SelectTrigger>
          <SelectContent>
            {serviceTypes?.map((st) => (
              <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Date/Time *</Label>
          <Input type="datetime-local" data-testid="input-scheduled-date" value={form.scheduledDate} onChange={(e) => setForm((p) => ({ ...p, scheduledDate: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>End Date/Time</Label>
          <Input type="datetime-local" value={form.scheduledEndDate} onChange={(e) => setForm((p) => ({ ...p, scheduledEndDate: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Assigned Technician</Label>
        <Input data-testid="input-assigned-to" placeholder="Technician name" value={form.assignedTo} onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="resize-none" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.customerId} data-testid="button-save-appointment">
          {mutation.isPending ? "Scheduling..." : "Schedule"}
        </Button>
      </div>
    </form>
  );
}

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data: appointments, isLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = new Date().toDateString();

  const apptsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments?.forEach((a) => {
      const key = new Date(a.scheduledDate).toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  const statusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "bg-chart-2";
      case "in-progress": return "bg-chart-4";
      case "completed": return "bg-primary";
      case "cancelled": return "bg-destructive";
      default: return "bg-muted-foreground";
    }
  };

  const openNewAppt = (date?: Date) => {
    setSelectedDate(date);
    setDialogOpen(true);
  };

  const calendarCells = [];
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push(<div key={`empty-${i}`} className="min-h-[100px] bg-muted/20 rounded-md" />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = dateObj.toDateString();
    const dayAppts = apptsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;

    calendarCells.push(
      <div
        key={d}
        className={`min-h-[100px] rounded-md p-1.5 cursor-pointer hover-elevate ${isToday ? "bg-primary/5 ring-1 ring-primary/30" : "bg-muted/30"}`}
        onClick={() => openNewAppt(dateObj)}
        data-testid={`calendar-day-${d}`}
      >
        <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
          {d}
        </div>
        <div className="space-y-0.5">
          {dayAppts.slice(0, 3).map((appt) => {
            const cust = customers?.find((c) => c.id === appt.customerId);
            return (
              <div
                key={appt.id}
                className="flex items-center gap-1 text-xs truncate rounded px-1 py-0.5 bg-background/80"
                title={`${cust?.firstName} ${cust?.lastName} - ${appt.status}`}
              >
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor(appt.status)}`} />
                <span className="truncate">{cust ? `${cust.firstName} ${cust.lastName.charAt(0)}.` : "N/A"}</span>
              </div>
            );
          })}
          {dayAppts.length > 3 && (
            <div className="text-xs text-muted-foreground pl-1">+{dayAppts.length - 3} more</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage appointments and service schedules</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-appointment">
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
            <AppointmentForm onClose={() => setDialogOpen(false)} initialDate={selectedDate} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} data-testid="button-prev-month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[180px] text-center" data-testid="text-current-month">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <Button variant="outline" size="icon" onClick={nextMonth} data-testid="button-next-month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={today} data-testid="button-today">Today</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1.5">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Upcoming Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div className="space-y-2">
              {appointments
                ?.filter((a) => new Date(a.scheduledDate) >= new Date() && a.status !== "cancelled")
                .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
                .slice(0, 10)
                .map((appt) => {
                  const cust = customers?.find((c) => c.id === appt.customerId);
                  return (
                    <div key={appt.id} className="flex items-center gap-3 p-3 rounded-md bg-muted/50" data-testid={`upcoming-appt-${appt.id}`}>
                      <div className={`h-2 w-2 rounded-full shrink-0 ${statusColor(appt.status)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{cust ? `${cust.firstName} ${cust.lastName}` : "N/A"}</span>
                          <Badge variant="secondary" className="text-xs capitalize">{appt.status}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(appt.scheduledDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                          {appt.assignedTo && <span className="flex items-center gap-1"><User className="h-3 w-3" />{appt.assignedTo}</span>}
                        </div>
                      </div>
                    </div>
                  );
                }) || <p className="text-sm text-muted-foreground text-center py-4">No upcoming appointments</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-chart-2" /><span className="text-xs text-muted-foreground">Scheduled</span></div>
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-chart-4" /><span className="text-xs text-muted-foreground">In Progress</span></div>
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-primary" /><span className="text-xs text-muted-foreground">Completed</span></div>
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-destructive" /><span className="text-xs text-muted-foreground">Cancelled</span></div>
      </div>
    </div>
  );
}
