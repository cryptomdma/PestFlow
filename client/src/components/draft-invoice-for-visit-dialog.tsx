import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateInvoiceViews } from "@/lib/invalidate-invoice-views";
import type { Appointment, Customer, Invoice, Location, Service, ServiceType, Technician } from "@shared/schema";
import { FileText } from "lucide-react";

// "Draft invoice for a visit" (PLAN_ROADMAP_V2.md B6 / C2.3, Pass 13): what
// the Invoices screen offers in place of New Invoice. An invoice for work is
// the visit's invoice (D1), drafted before the tickets are finalized (D3,
// Pass 4's path) and adopted at finalization, never duplicated - so the
// office picks the customer, the location and one of that location's
// draftable visits, and the DRAFT opens in the invoice modal. Draftable is
// the Services tab's rule (customer-detail.tsx canDraftForVisit): a visit
// that is not cancelled, not completed (a completed, finalized visit is
// invoiced from Ready to Bill), with an active service and no invoice yet;
// the server refuses anything the list got wrong. A charge with no visit
// behind it is "Add fee / adjustment" on the location's ledger.

function customerLabel(customer: Customer) {
  const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
  const company = customer.companyName?.trim();
  if (fullName && company) return `${fullName} (${company})`;
  return fullName || company || "Customer";
}

function locationLabel(location: Location) {
  return [location.name, location.address].filter(Boolean).join(" - ");
}

function formatVisitDate(value: Date | string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
};

export function DraftInvoiceForVisitDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The created (or already existing) DRAFT, for the caller to open in the modal. */
  onCreated: (invoice: Invoice) => void;
}) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open });
  const { data: customerLocations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations", customerId],
    enabled: open && !!customerId,
  });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/by-location", locationId],
    enabled: open && !!locationId,
  });
  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/services/by-location", locationId],
    enabled: open && !!locationId,
  });
  const { data: locationInvoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices/by-location", locationId],
    enabled: open && !!locationId,
  });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"], enabled: open });
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"], enabled: open });

  // The primary location is the customer identity (canon rule 3): it is the
  // default, and the office changes it when the visit is elsewhere.
  useEffect(() => {
    if (!customerLocations) return;
    setLocationId((current) => {
      if (current && customerLocations.some((location) => location.id === current)) return current;
      const primary = customerLocations.find((location) => location.isPrimary) ?? customerLocations[0];
      return primary?.id ?? "";
    });
  }, [customerLocations]);

  const serviceTypeById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType])), [serviceTypes]);
  const technicianById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician])), [technicians]);

  const visits = useMemo(() => {
    if (!appointments || !services || !locationInvoices) return null;
    const invoiceByAppointmentId = new Map(
      locationInvoices.filter((invoice) => invoice.appointmentId && invoice.status !== "VOID").map((invoice) => [invoice.appointmentId!, invoice]),
    );
    let alreadyInvoiced = 0;
    const draftable = appointments
      .filter((appointment) => appointment.status !== "CANCELED" && appointment.status !== "COMPLETED")
      .flatMap((appointment) => {
        // The visit's services, the way the server rolls them up: those
        // pointing at the appointment, plus the one the appointment names.
        const linked = services.filter((service) => service.appointmentId === appointment.id || service.id === appointment.serviceId);
        const active = linked.filter((service) => service.status !== "CANCELLED");
        if (!active.length) return [];
        const invoice = invoiceByAppointmentId.get(appointment.id);
        if (invoice) {
          alreadyInvoiced += 1;
          return [];
        }
        return [{ appointment, services: active }];
      })
      .sort((a, b) => new Date(a.appointment.scheduledDate).getTime() - new Date(b.appointment.scheduledDate).getTime());
    return { draftable, alreadyInvoiced };
  }, [appointments, services, locationInvoices]);

  const visitsLoading = !!locationId && (appointmentsLoading || servicesLoading || invoicesLoading);

  const describeVisit = ({ appointment, services: visitServices }: { appointment: Appointment; services: Service[] }) => {
    const names = Array.from(new Set(visitServices.map((service) => serviceTypeById.get(service.serviceTypeId || "")?.name || "Service")));
    const technician = appointment.assignedTechnicianId ? technicianById.get(appointment.assignedTechnicianId) : undefined;
    const status = APPOINTMENT_STATUS_LABELS[appointment.status];
    return [formatVisitDate(appointment.scheduledDate), names.join(", "), technician?.displayName, status && status !== "Scheduled" ? status : null]
      .filter(Boolean)
      .join(" · ");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invoices/draft-for-appointment/${appointmentId}`, {});
      return (await response.json()) as Invoice;
    },
    onSuccess: (invoice) => {
      invalidateInvoiceViews();
      toast({
        title: `Draft invoice ${invoice.invoiceNumber} created`,
        description: "Not a receivable until issued. It is re-priced from the finalized tickets when issued, and generation adopts it - never a second invoice.",
      });
      onOpenChange(false);
      onCreated(invoice);
    },
    onError: (error: Error) => toast({ title: "Unable to draft the invoice", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const close = (next: boolean) => {
    if (mutation.isPending) return;
    onOpenChange(next);
    if (!next) {
      setCustomerId("");
      setLocationId("");
      setAppointmentId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Draft invoice for a visit</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          An invoice for work is the visit's invoice: drafted now, before the tickets are finalized, and adopted when the visit is finalized
          and generated - never a second one. A fee with no visit behind it is "Add fee / adjustment" on the location's Invoices tab.
        </p>
        <div className="space-y-1.5">
          <Label>Customer *</Label>
          <Select value={customerId} onValueChange={(value) => { setCustomerId(value); setLocationId(""); setAppointmentId(""); }}>
            <SelectTrigger data-testid="select-draft-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {(customers ?? []).map((customer) => <SelectItem key={customer.id} value={customer.id}>{customerLabel(customer)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Location *</Label>
          <Select value={locationId} onValueChange={(value) => { setLocationId(value); setAppointmentId(""); }} disabled={!customerId || locationsLoading}>
            <SelectTrigger data-testid="select-draft-location">
              <SelectValue placeholder={!customerId ? "Select a customer first" : locationsLoading ? "Loading locations..." : "Select location"} />
            </SelectTrigger>
            <SelectContent>
              {(customerLocations ?? []).map((location) => (
                <SelectItem key={location.id} value={location.id}>{locationLabel(location)}{location.isPrimary ? " (primary)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Visit *</Label>
          <Select value={appointmentId} onValueChange={setAppointmentId} disabled={!locationId || visitsLoading || !visits?.draftable.length}>
            <SelectTrigger data-testid="select-draft-appointment">
              <SelectValue
                placeholder={
                  !locationId
                    ? "Select a location first"
                    : visitsLoading
                      ? "Loading visits..."
                      : !visits?.draftable.length
                        ? "No visit to draft for"
                        : "Select a visit"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(visits?.draftable ?? []).map((visit) => (
                <SelectItem key={visit.appointment.id} value={visit.appointment.id}>{describeVisit(visit)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {locationId && visits && !visitsLoading ? (
            <p className="text-xs text-muted-foreground" data-testid="text-draft-visit-note">
              {visits.draftable.length === 0
                ? visits.alreadyInvoiced > 0
                  ? `Every scheduled visit at this location already has an invoice (${visits.alreadyInvoiced}). Finalized visits are invoiced from Ready to Bill.`
                  : "No scheduled or in-progress visit with an active service at this location. Finalized visits are invoiced from Ready to Bill."
                : `Scheduled and in-progress visits with no invoice yet${visits.alreadyInvoiced > 0 ? `; ${visits.alreadyInvoiced} other${visits.alreadyInvoiced === 1 ? "" : "s"} already invoiced` : ""}. Finalized visits are invoiced from Ready to Bill.`}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={!appointmentId || mutation.isPending} data-testid="button-draft-invoice-create">
            {mutation.isPending ? "Drafting..." : "Create Draft"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
