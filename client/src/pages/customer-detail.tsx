import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useSearch, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { OpportunityDispositionDialog } from "@/components/opportunity-disposition-dialog";
import { OpportunityHistoryDialog } from "@/components/opportunity-history-dialog";
import { formatPhoneDisplay } from "@shared/phone";
import {
  ArrowLeft, Mail, Phone, MapPin, Plus, Calendar, FileText, MessageSquare,
  ClipboardList, Building2, User, ChevronDown, ArrowUpRight, StickyNote,
  History,
  CreditCard, KeyRound, Ruler, ChevronUp, Check, Link2, Target,
} from "lucide-react";
import type { Customer, Contact, Location, Appointment, Invoice, Service, ServiceRecord, Communication, CustomerNote, BillingProfile, NoteRevision, Agreement, AgreementTemplate, ServiceType, Technician, Opportunity, OpportunityDisposition } from "@shared/schema";

interface CustomerDetailCompatResponse {
  legacyCustomer: Customer;
  primaryLocation: Location;
  selectedLocation: Location;
  relatedLocations: Location[];
  hasBillingOverride: boolean;
}

interface UpdateLocationProfileResponse {
  customer?: Customer;
  location: Location;
}

interface LocationBalanceSummary {
  locationId: string;
  openBalance: number;
  totalInvoiced: number;
  invoiceCount: number;
}

const BASE_LOCATION_TYPE_OPTIONS = ["residential", "commercial"] as const;
const BASE_SOURCE_OPTIONS = ["Google", "Youtube", "Referal", "Facebook"] as const;
const CONTACT_PHONE_TYPE_OPTIONS = ["mobile", "home", "work", "fax"] as const;
const DEFAULT_TIME_WINDOW_OPTIONS = [
  "8:00am-9:00am",
  "9:00am-11:00am",
  "11:00am-1:00pm",
  "1:00pm-3:00pm",
  "3:00pm-5:00pm",
] as const;

function buildOptions(currentValue: string | null | undefined, baseOptions: readonly string[]) {
  if (!currentValue || baseOptions.includes(currentValue)) {
    return [...baseOptions];
  }

  return [currentValue, ...baseOptions];
}

function formatOptionLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeValue(value: string | Date | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getServiceDisplayDate(service: Service, appointment?: Appointment | null, serviceRecord?: ServiceRecord | null) {
  if (serviceRecord?.serviceDate) {
    return {
      label: formatDateTimeValue(serviceRecord.serviceDate),
      source: "completed",
    };
  }

  if (appointment?.scheduledDate) {
    return {
      label: formatDateTimeValue(appointment.scheduledDate),
      source: "scheduled",
    };
  }

  return {
    label: formatDateOnly(service.dueDate),
    source: "due",
  };
}

function formatAgreementRecurrence(agreement: Agreement) {
  const interval = agreement.recurrenceInterval || 1;
  const labelByUnit: Record<string, string> = {
    MONTH: "Month",
    QUARTER: "Quarter",
    YEAR: "Year",
    CUSTOM: "Day",
  };
  const unitLabel = labelByUnit[agreement.recurrenceUnit] || agreement.recurrenceUnit;
  const suffix = interval === 1 ? unitLabel : `${unitLabel}s`;
  return agreement.recurrenceUnit === "QUARTER" && interval === 1
    ? "Quarterly"
    : `Every ${interval} ${suffix}`;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date());
}

function addAgreementInterval(dateOnly: string, unit: string | null | undefined, interval: number | null | undefined) {
  if (!dateOnly) {
    return "";
  }

  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }

  const nextDate = new Date(year, month - 1, day);
  const step = Math.max(interval || 1, 1);

  switch (unit) {
    case "MONTH":
      nextDate.setMonth(nextDate.getMonth() + step);
      break;
    case "QUARTER":
      nextDate.setMonth(nextDate.getMonth() + step * 3);
      break;
    case "YEAR":
      nextDate.setFullYear(nextDate.getFullYear() + step);
      break;
    default:
      nextDate.setDate(nextDate.getDate() + step);
      break;
  }

  return formatDateInputValue(nextDate);
}

function agreementStatusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-primary/10 text-primary";
    case "PAUSED":
      return "bg-chart-3/10 text-chart-3";
    case "CANCELLED":
      return "bg-destructive/10 text-destructive";
    default:
      return "";
  }
}

function buildAgreementFormState(agreement?: Agreement | null, template?: AgreementTemplate | null) {
  const startDate = agreement?.startDate ?? "";
  const termUnit = agreement?.termUnit ?? template?.defaultTermUnit ?? "YEAR";
  const termInterval = agreement?.termInterval ? String(agreement.termInterval) : template?.defaultTermInterval ? String(template.defaultTermInterval) : "1";
  const recurrenceUnit = agreement?.recurrenceUnit ?? template?.defaultRecurrenceUnit ?? "MONTH";
  const recurrenceInterval = agreement?.recurrenceInterval ? String(agreement.recurrenceInterval) : template?.defaultRecurrenceInterval ? String(template.defaultRecurrenceInterval) : "1";

  return {
    agreementTemplateId: agreement?.agreementTemplateId ?? template?.id ?? "",
    initialAppointmentId: agreement?.initialAppointmentId ?? "",
    startDateSource: agreement?.startDateSource ?? "MANUAL",
    agreementName: agreement?.agreementName ?? template?.name ?? "",
    status: agreement?.status ?? "ACTIVE",
    agreementType: agreement?.agreementType ?? template?.defaultAgreementType ?? "",
    startDate,
    termUnit,
    termInterval,
    renewalDate: agreement?.renewalDate ?? (startDate ? addAgreementInterval(startDate, termUnit, parseInt(termInterval, 10)) : ""),
    nextServiceDate: agreement?.nextServiceDate ?? (startDate ? addAgreementInterval(startDate, recurrenceUnit, parseInt(recurrenceInterval, 10)) : ""),
    billingFrequency: agreement?.billingFrequency ?? template?.defaultBillingFrequency ?? "",
    price: agreement?.price ?? template?.defaultPrice ?? "",
    recurrenceUnit,
    recurrenceInterval,
    generationLeadDays: agreement?.generationLeadDays ? String(agreement.generationLeadDays) : template?.defaultGenerationLeadDays ? String(template.defaultGenerationLeadDays) : "14",
    serviceWindowDays: agreement?.serviceWindowDays ? String(agreement.serviceWindowDays) : template?.defaultServiceWindowDays ? String(template.defaultServiceWindowDays) : "",
    serviceTypeId: agreement?.serviceTypeId ?? template?.defaultServiceTypeId ?? "",
    serviceTemplateName: agreement?.serviceTemplateName ?? template?.defaultServiceTemplateName ?? "",
    defaultDurationMinutes: agreement?.defaultDurationMinutes ? String(agreement.defaultDurationMinutes) : template?.defaultDurationMinutes ? String(template.defaultDurationMinutes) : "",
    serviceInstructions: agreement?.serviceInstructions ?? template?.defaultInstructions ?? "",
    contractUrl: agreement?.contractUrl ?? "",
    contractSignedAt: agreement?.contractSignedAt ? new Date(agreement.contractSignedAt).toISOString().slice(0, 10) : "",
    notes: agreement?.notes ?? "",
  };
}

function isUsefulLocationNickname(name: string | null | undefined) {
  const trimmed = name?.trim();
  return !!trimmed && trimmed.toLowerCase() !== "primary location";
}

function buildContactFormState(contact?: Contact | null) {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    phoneType: contact?.phoneType ?? "mobile",
    role: contact?.role ?? "",
    isPrimary: contact?.isPrimary ?? false,
  };
}

function sortNotesByCreatedAt(notes: CustomerNote[]) {
  return [...notes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function buildSingleNoteState(notes: CustomerNote[] | undefined) {
  const sortedNotes = sortNotesByCreatedAt(notes ?? []);
  const currentNote = sortedNotes.length > 0 ? sortedNotes[sortedNotes.length - 1] : null;
  const body = currentNote?.body.trim() || "";

  return {
    body,
    currentNote,
  };
}

function formatRevisionTimestamp(value: string | Date) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRevisionActor(revision: NoteRevision) {
  return revision.actorLabel?.trim() || revision.actorUserId?.trim() || "Unknown user";
}

function formatRevisionChangeType(changeType: string) {
  switch (changeType) {
    case "CREATED":
      return "Created";
    case "UPDATED":
      return "Edited";
    case "CLEARED":
      return "Cleared";
    case "BASELINE":
      return "Baseline";
    default:
      return changeType;
  }
}

function NoteHistorySheet({
  open,
  onOpenChange,
  noteId,
  title,
  currentBody,
  testIdPrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId?: string;
  title: string;
  currentBody: string;
  testIdPrefix: string;
}) {
  const {
    data: revisions,
    isLoading,
    error,
  } = useQuery<NoteRevision[]>({
    queryKey: ["/api/notes", noteId ?? "", "revisions"],
    enabled: open && !!noteId,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="pr-8">
          <SheetTitle>{title} History</SheetTitle>
          <SheetDescription>
            {currentBody
              ? "Review prior saved note revisions."
              : "The current note is blank. Prior revisions remain available below when history exists."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          {!noteId ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid={`empty-${testIdPrefix}-history`}>
              No note history yet.
            </div>
          ) : isLoading ? (
            <div className="space-y-3" data-testid={`loading-${testIdPrefix}-history`}>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-destructive" data-testid={`error-${testIdPrefix}-history`}>
              Unable to load note history.
            </div>
          ) : !revisions || revisions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid={`empty-${testIdPrefix}-history`}>
              No revisions available.
            </div>
          ) : (
            <ScrollArea className="h-[70vh] pr-4">
              <div className="space-y-3">
                {revisions.map((revision, index) => (
                  <div
                    key={revision.id}
                    className="rounded-lg border bg-card p-3"
                    data-testid={`history-${testIdPrefix}-revision-${revision.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            Rev {revision.revisionNumber}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {formatRevisionChangeType(revision.changeType)}
                          </Badge>
                          {index === 0 && <Badge className="text-[10px]">Latest</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatRevisionActor(revision)} • {formatRevisionTimestamp(revision.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-md border bg-muted/20 p-3">
                      {revision.body.trim() ? (
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">
                          {revision.body}
                        </p>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">Note cleared</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function buildCommunicationHref({
  customerId,
  locationId,
  type,
  value,
}: {
  customerId: string;
  locationId?: string;
  type: "email" | "phone";
  value: string;
}) {
  const params = new URLSearchParams({
    customerId,
    type,
    direction: "outbound",
    recipient: value,
  });

  if (locationId) {
    params.set("locationId", locationId);
  }

  return `/communications?${params.toString()}`;
}

function CommunicationActionLink({
  href,
  icon,
  text,
  testId,
}: {
  href: string;
  icon: ReactNode;
  text: string;
  testId?: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
      data-testid={testId}
    >
      {icon}
      <span>{text}</span>
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

function AddLocationDialog({
  customerId,
  customerType,
  onClose,
}: {
  customerId: string;
  customerType: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const locationTypeOptions = buildOptions(customerType, BASE_LOCATION_TYPE_OPTIONS);
  const [form, setForm] = useState({
    nickname: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    source: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    propertyType: customerType,
    isPrimary: false,
    gateCode: "",
    squareFootage: "",
  });
  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const trimmedAddress = data.address.trim();
      const trimmedNickname = data.nickname.trim();

      return apiRequest("POST", "/api/locations", {
        location: {
          customerId,
          name: trimmedNickname || trimmedAddress,
          address: trimmedAddress,
          city: data.city.trim(),
          state: data.state.trim(),
          zip: data.zip.trim(),
          propertyType: data.propertyType,
          isPrimary: data.isPrimary,
          gateCode: data.gateCode.trim() || null,
          squareFootage: data.squareFootage.trim() ? parseInt(data.squareFootage, 10) : null,
          source: data.source.trim() || null,
          notes: null,
        },
        initialContact: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: data.email.trim(),
          phone: data.phone.trim(),
          role: "primary",
          isPrimary: true,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(`/api/customer-detail-compat/${customerId}`),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/by-location"] });
      toast({ title: "Location added" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error adding location", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim()
    ) {
      toast({ title: "First name, last name, email, and phone are required for the primary contact", variant: "destructive" });
      return;
    }

    if (!form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      toast({ title: "Address, city, state, and ZIP are required", variant: "destructive" });
      return;
    }

    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Primary contact</h3>
        <p className="text-sm text-muted-foreground">
          These details create the primary contact for the new location.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-first-name">First Name *</Label><Input id="add-location-contact-first-name" data-testid="input-add-location-contact-first-name" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-last-name">Last Name *</Label><Input id="add-location-contact-last-name" data-testid="input-add-location-contact-last-name" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-email">Email *</Label><Input id="add-location-contact-email" type="email" data-testid="input-add-location-contact-email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-contact-phone">Phone *</Label><Input id="add-location-contact-phone" data-testid="input-add-location-contact-phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Location details</h3>
        <p className="text-sm text-muted-foreground">
          Add another service location under this account and create its primary contact in the same step.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="add-location-type">Location Type</Label>
          <Select value={form.propertyType} onValueChange={(v) => setForm((p) => ({ ...p, propertyType: v }))}>
            <SelectTrigger id="add-location-type" data-testid="select-add-location-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {locationTypeOptions.map((option) => (
                <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-location-source">Source</Label>
          <Select value={form.source} onValueChange={(v) => setForm((p) => ({ ...p, source: v }))}>
            <SelectTrigger id="add-location-source" data-testid="select-add-location-source">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {BASE_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-location-address">Address *</Label>
        <Input
          id="add-location-address"
          data-testid="input-loc-address"
          placeholder="Street address"
          autoComplete="street-address"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
        <div className="space-y-1.5"><Label htmlFor="add-location-city">City *</Label><Input id="add-location-city" data-testid="input-add-location-city" autoComplete="address-level2" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-state">State *</Label><Input id="add-location-state" data-testid="input-add-location-state" autoComplete="address-level1" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-zip">ZIP *</Label><Input id="add-location-zip" data-testid="input-add-location-zip" autoComplete="postal-code" value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="add-location-square-footage">Sq Ft</Label><Input id="add-location-square-footage" type="number" data-testid="input-add-location-square-footage" value={form.squareFootage} onChange={(e) => setForm((p) => ({ ...p, squareFootage: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="add-location-gate-code">Gate Code</Label><Input id="add-location-gate-code" data-testid="input-add-location-gate-code" value={form.gateCode} onChange={(e) => setForm((p) => ({ ...p, gateCode: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-location-nickname">Nickname</Label>
        <Input
          id="add-location-nickname"
          data-testid="input-add-location-nickname"
          placeholder="Optional, e.g. Lake House or Warehouse"
          value={form.nickname}
          onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
        Set as primary location
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-location">
          {mutation.isPending ? "Saving..." : "Add Location"}
        </Button>
      </div>
    </form>
  );
}

function EditLocationDialog({
  customer,
  location,
  totalLocations,
  onClose,
}: {
  customer: Customer;
  location: Location;
  totalLocations: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isPrimaryLocation = !!location.isPrimary;
  const canPromoteToPrimary = !isPrimaryLocation;
  const [form, setForm] = useState({
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    companyName: customer.companyName || "",
    email: customer.email || "",
    phone: customer.phone || "",
    customerType: customer.customerType || "residential",
    name: location.name || "",
    address: location.address || "",
    city: location.city || "",
    state: location.state || "",
    zip: location.zip || "",
    propertyType: location.propertyType || "residential",
    source: location.source || "",
    squareFootage: location.squareFootage ? String(location.squareFootage) : "",
    gateCode: location.gateCode || "",
    setAsPrimary: !!location.isPrimary,
  });

  useEffect(() => {
    setForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      companyName: customer.companyName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      customerType: customer.customerType || "residential",
      name: location.name || "",
      address: location.address || "",
      city: location.city || "",
      state: location.state || "",
      zip: location.zip || "",
      propertyType: location.propertyType || "residential",
      source: location.source || "",
      squareFootage: location.squareFootage ? String(location.squareFootage) : "",
      gateCode: location.gateCode || "",
      setAsPrimary: !!location.isPrimary,
    });
  }, [customer, location]);

  const locationTypeOptions = buildOptions(form.propertyType, BASE_LOCATION_TYPE_OPTIONS);
  const customerTypeOptions = buildOptions(form.customerType, BASE_LOCATION_TYPE_OPTIONS);
  const sourceOptions = buildOptions(form.source, BASE_SOURCE_OPTIONS);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const locationPayload = {
        name: data.name.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        zip: data.zip.trim(),
        propertyType: isPrimaryLocation ? data.customerType : data.propertyType,
        source: data.source.trim() || null,
        squareFootage: data.squareFootage.trim() ? parseInt(data.squareFootage, 10) : null,
        gateCode: data.gateCode.trim() || null,
      };

      const customerPayload = isPrimaryLocation
        ? {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            companyName: data.customerType === "commercial" ? data.companyName.trim() || null : null,
            email: data.email.trim(),
            phone: data.phone.trim(),
            customerType: data.customerType,
          }
        : undefined;

      const res = await apiRequest("PATCH", `/api/customers/${customer.id}/locations/${location.id}/profile`, {
        location: locationPayload,
        customer: customerPayload,
      });

      if (data.setAsPrimary && !isPrimaryLocation) {
        await apiRequest("POST", `/api/locations/${location.id}/set-primary`, {});
      }

      return res.json() as Promise<UpdateLocationProfileResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(`/api/customer-detail-compat/${customer.id}`),
      });
      toast({ title: "Location updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error updating location", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      toast({ title: "Location name, address, city, state, and ZIP are required", variant: "destructive" });
      return;
    }

    if (isPrimaryLocation) {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim()) {
        toast({ title: "First name, last name, email, and phone are required for the primary location", variant: "destructive" });
        return;
      }

      if (form.customerType === "commercial" && !form.companyName.trim()) {
        toast({ title: "Company name is required for commercial customers", variant: "destructive" });
        return;
      }
    }

    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isPrimaryLocation ? (
        <>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Customer identity</h3>
            <p className="text-sm text-muted-foreground">
              These fields power the current primary-location identity shown at the top of this screen.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer Type</Label>
              <Select value={form.customerType} onValueChange={(value) => setForm((prev) => ({ ...prev, customerType: value, propertyType: value }))}>
                <SelectTrigger data-testid="select-edit-customer-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {customerTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(value) => setForm((prev) => ({ ...prev, source: value }))}>
                <SelectTrigger data-testid="select-edit-source"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.customerType === "commercial" && (
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input data-testid="input-edit-company-name" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>First Name</Label><Input data-testid="input-edit-first-name" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Last Name</Label><Input data-testid="input-edit-last-name" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" data-testid="input-edit-email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input data-testid="input-edit-phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} /></div>
          </div>
        </>
      ) : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Customer identity fields remain tied to the primary location in the current compatibility model. This edit updates the selected location record only.
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Location details</h3>
        <p className="text-sm text-muted-foreground">
          Update the operational details for this service location.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Location Name</Label>
        <Input data-testid="input-edit-location-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
      </div>
      {!isPrimaryLocation && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Location Type</Label>
            <Select value={form.propertyType} onValueChange={(value) => setForm((prev) => ({ ...prev, propertyType: value }))}>
              <SelectTrigger data-testid="select-edit-location-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {locationTypeOptions.map((option) => (
                  <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(value) => setForm((prev) => ({ ...prev, source: value }))}>
              <SelectTrigger data-testid="select-edit-secondary-source"><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {sourceOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="space-y-1.5"><Label>Address</Label><Input data-testid="input-edit-address" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>City</Label><Input data-testid="input-edit-city" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>State</Label><Input data-testid="input-edit-state" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>ZIP</Label><Input data-testid="input-edit-zip" value={form.zip} onChange={(e) => setForm((prev) => ({ ...prev, zip: e.target.value }))} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Sq Ft</Label><Input type="number" data-testid="input-edit-square-footage" value={form.squareFootage} onChange={(e) => setForm((prev) => ({ ...prev, squareFootage: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Gate Code</Label><Input data-testid="input-edit-gate-code" value={form.gateCode} onChange={(e) => setForm((prev) => ({ ...prev, gateCode: e.target.value }))} /></div>
      </div>
      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.setAsPrimary}
            disabled={!canPromoteToPrimary}
            onChange={(e) => setForm((prev) => ({ ...prev, setAsPrimary: e.target.checked }))}
            data-testid="checkbox-edit-location-primary"
          />
          <span className="space-y-1">
            <span className="block font-medium text-foreground">Set as Primary Location</span>
            <span className="block text-muted-foreground">
              {isPrimaryLocation
                ? totalLocations > 1
                  ? "This location is already primary. To switch the primary location, open a different location and save it as primary."
                  : "This account only has one location, so it remains the primary location."
                : "Saving will make this the primary location for the account and update the customer identity shown in the UI."}
            </span>
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-edited-location">
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function ContactDialogForm({
  customerId,
  locationId,
  contact,
  onClose,
}: {
  customerId: string;
  locationId: string;
  contact?: Contact | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditMode = !!contact;
  const [form, setForm] = useState(() => buildContactFormState(contact));

  useEffect(() => {
    setForm(buildContactFormState(contact));
  }, [contact]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEditMode
        ? apiRequest("PATCH", `/api/contacts/${contact.id}`, data).then((res) => res.json() as Promise<Contact>)
        : apiRequest("POST", "/api/contacts", { ...data, customerId, locationId }).then((res) => res.json() as Promise<Contact>),
    onSuccess: async (savedContact) => {
      queryClient.setQueryData<Contact[]>(["/api/contacts/by-location", locationId], (existing) => {
        if (!existing) {
          return [savedContact];
        }

        const existingIndex = existing.findIndex((item) => item.id === savedContact.id);
        if (existingIndex === -1) {
          return [...existing, savedContact];
        }

        return existing.map((item) => item.id === savedContact.id ? savedContact : item);
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/contacts/by-location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
      toast({ title: isEditMode ? "Contact updated" : "Contact added" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: isEditMode ? "Error updating contact" : "Error adding contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>First Name</Label><Input data-testid="input-ct-first" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Last Name</Label><Input data-testid="input-ct-last" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone Type</Label>
          <Select value={form.phoneType} onValueChange={(value) => setForm((p) => ({ ...p, phoneType: value }))}>
            <SelectTrigger data-testid="select-contact-phone-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTACT_PHONE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{formatOptionLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Role</Label><Input placeholder="e.g., Property Manager" value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
        Make primary contact
      </label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending} data-testid="button-save-contact">{mutation.isPending ? "Saving..." : isEditMode ? "Save Changes" : "Add Contact"}</Button></div>
    </form>
  );
}

function SingleNoteSection({
  title,
  scope,
  customerId,
  locationId,
  notes,
  emptyMessage,
  embedded = false,
  testIdPrefix,
  surfaceClassName,
  collapsedBodyClassName,
  expandedBodyClassName,
  footerReserveClassName,
}: {
  title: string;
  scope: "ACCOUNT" | "LOCATION";
  customerId: string;
  locationId?: string;
  notes?: CustomerNote[];
  emptyMessage: string;
  embedded?: boolean;
  testIdPrefix: string;
  surfaceClassName?: string;
  collapsedBodyClassName?: string;
  expandedBodyClassName?: string;
  footerReserveClassName?: string;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const singleNote = useMemo(() => buildSingleNoteState(notes), [notes]);
  const [draft, setDraft] = useState(singleNote.body);
  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const [hasCollapsedOverflow, setHasCollapsedOverflow] = useState(false);
  const canExpand = hasCollapsedOverflow;

  useEffect(() => {
    if (!isEditing) {
      setDraft(singleNote.body);
    }
  }, [isEditing, singleNote.body]);

  useEffect(() => {
    if (!hasCollapsedOverflow) {
      setIsExpanded(false);
    }
  }, [hasCollapsedOverflow]);

  useEffect(() => {
    if (isEditing) {
      setHasCollapsedOverflow(false);
      return;
    }

    const measureOverflow = () => {
      const element = previewBodyRef.current;
      if (!element) {
        setHasCollapsedOverflow(false);
        return;
      }

      const hasVerticalOverflow = element.scrollHeight - element.clientHeight > 1;
      const hasHorizontalOverflow = element.scrollWidth - element.clientWidth > 1;
      setHasCollapsedOverflow(hasVerticalOverflow || hasHorizontalOverflow);
    };

    measureOverflow();
    window.addEventListener("resize", measureOverflow);

    return () => {
      window.removeEventListener("resize", measureOverflow);
    };
  }, [isEditing, singleNote.body, collapsedBodyClassName]);

  const saveMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("PUT", "/api/notes/scoped", {
        scope,
        customerId: scope === "ACCOUNT" ? customerId : null,
        locationId: scope === "LOCATION" ? locationId ?? null : null,
        body,
      }),
    onSuccess: () => {
      if (scope === "ACCOUNT") {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/shared", customerId] });
      } else if (locationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/location", locationId] });
      }
      if (singleNote.currentNote?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/notes", singleNote.currentNote.id, "revisions"] });
      }

      setIsEditing(false);
      toast({ title: `${title} updated` });
    },
    onError: (error: Error) => {
      toast({ title: `Error updating ${title.toLowerCase()}`, description: error.message, variant: "destructive" });
    },
  });

  const openEditor = () => {
    setDraft(singleNote.body);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(singleNote.body);
    setIsEditing(false);
  };

  const renderBody = () => {
    if (!singleNote.body) {
      return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }

    if (isExpanded && canExpand) {
      return (
        <ScrollArea className={cn("pr-4", expandedBodyClassName ?? "h-56")}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{singleNote.body}</p>
        </ScrollArea>
      );
    }

    return (
      <div ref={previewBodyRef} className={cn("overflow-hidden", collapsedBodyClassName)}>
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground">
          {singleNote.body}
        </p>
      </div>
    );
  };

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <StickyNote className="h-4 w-4" /> {title}
        </CardTitle>
      </div>
      <div className="flex items-center gap-2">
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setHistoryOpen(true)}
            disabled={!singleNote.currentNote?.id}
            data-testid={`button-history-${testIdPrefix}-notes`}
          >
            <History className="mr-1 h-3 w-3" /> History
          </Button>
        )}
        {!isEditing && hasCollapsedOverflow && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setIsExpanded((current) => !current)}
            data-testid={`button-toggle-${testIdPrefix}-notes`}
          >
            {isExpanded ? <><ChevronUp className="mr-1 h-3 w-3" /> Collapse</> : <><ChevronDown className="mr-1 h-3 w-3" /> Expand</>}
          </Button>
        )}
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={openEditor}
            data-testid={`button-edit-${testIdPrefix}-notes`}
          >
            Edit
          </Button>
        )}
      </div>
    </div>
  );

  const body = isEditing ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate(draft);
      }}
      className="space-y-3"
    >
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add notes..."
        className="min-h-[180px] resize-y"
        data-testid={`input-${testIdPrefix}-notes`}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancelEdit}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saveMutation.isPending || draft === singleNote.body}
          data-testid={`button-save-${testIdPrefix}-notes`}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  ) : (
    <div className="space-y-3">
      <div className={cn("rounded-lg border bg-muted/20 p-3", surfaceClassName)}>
        <div className="flex-1">{renderBody()}</div>
      </div>
      {footerReserveClassName && <div className={cn("shrink-0", footerReserveClassName)} aria-hidden="true" />}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <NoteHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          noteId={singleNote.currentNote?.id}
          title={title}
          currentBody={singleNote.body}
          testIdPrefix={testIdPrefix}
        />
        {header}
        {body}
      </div>
    );
  }

  return (
    <>
      <NoteHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        noteId={singleNote.currentNote?.id}
        title={title}
        currentBody={singleNote.body}
        testIdPrefix={testIdPrefix}
      />
      <CardHeader className="pb-2">{header}</CardHeader>
      <CardContent className="pt-0">{body}</CardContent>
    </>
  );
}

function CustomerNotesPanel({
  customerId,
  embedded = false,
}: {
  customerId: string;
  embedded?: boolean;
}) {
  const { data: sharedNotes } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/shared", customerId] });

  return (
    <SingleNoteSection
      title="Customer Notes"
      scope="ACCOUNT"
      customerId={customerId}
      notes={sharedNotes}
      emptyMessage="No customer notes yet."
      embedded={embedded}
      testIdPrefix="customer"
      surfaceClassName="min-h-[4.5rem]"
      collapsedBodyClassName="min-h-[4.5rem] max-h-[4.5rem]"
    />
  );
}

function LocationNotesPanel({
  customerId,
  locationId,
}: {
  customerId: string;
  locationId: string;
}) {
  const { data: locationNotes } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/location", locationId] });

  return (
    <Card className="h-full">
      <SingleNoteSection
        title="Location Notes"
        scope="LOCATION"
        customerId={customerId}
        locationId={locationId}
        notes={locationNotes}
        emptyMessage="No location notes yet."
        testIdPrefix="location"
        surfaceClassName="h-[9rem] flex flex-col"
        collapsedBodyClassName="min-h-[7.5rem] max-h-[7.5rem]"
        expandedBodyClassName="h-[7.5rem]"
        footerReserveClassName="min-h-[3.5rem]"
      />
    </Card>
  );
}

function AgreementForm({
  customerId,
  locationId,
  agreement,
  appointments,
  onClose,
}: {
  customerId: string;
  locationId: string;
  agreement?: Agreement | null;
  appointments?: Appointment[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [draftAgreement, setDraftAgreement] = useState<Agreement | null>(agreement ?? null);
  const currentAgreement = draftAgreement ?? agreement ?? null;
  const isEditMode = !!currentAgreement;
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: agreementTemplates } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/agreement-templates"] });
  const activeTemplates = useMemo(() => {
    return (agreementTemplates ?? [])
      .filter((template) => template.isActive || template.id === currentAgreement?.agreementTemplateId)
      .sort((a, b) => {
        const sortA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sortB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) return sortA - sortB;
        return a.name.localeCompare(b.name);
      });
  }, [currentAgreement?.agreementTemplateId, agreementTemplates]);
  const templateById = useMemo(() => new Map(activeTemplates.map((template) => [template.id, template])), [activeTemplates]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(currentAgreement?.agreementTemplateId ?? "");
  const [form, setForm] = useState(() => {
    const initialTemplate = currentAgreement?.agreementTemplateId ? templateById.get(currentAgreement.agreementTemplateId) ?? null : null;
    const initialState = buildAgreementFormState(currentAgreement, initialTemplate);
    return currentAgreement ? initialState : { ...initialState, startDate: initialState.startDate || getTodayDateInputValue() };
  });
  const [renewalDateOverridden, setRenewalDateOverridden] = useState(false);
  const [nextServiceDateOverridden, setNextServiceDateOverridden] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  useEffect(() => {
    if (draftAgreement && !agreement) {
      return;
    }

    const agreementTemplate = agreement?.agreementTemplateId ? templateById.get(agreement.agreementTemplateId) ?? null : null;
    setDraftAgreement(agreement ?? null);
    setSelectedTemplateId(agreement?.agreementTemplateId ?? "");
    const nextState = buildAgreementFormState(agreement, agreementTemplate);
    setForm(agreement ? nextState : { ...nextState, startDate: nextState.startDate || getTodayDateInputValue() });
    setRenewalDateOverridden(false);
    setNextServiceDateOverridden(false);
  }, [agreement, templateById, draftAgreement]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templateById.get(templateId) ?? null;
    setForm((prev) => {
      const next = buildAgreementFormState(null, template);
      const startDate = prev.startDate || getTodayDateInputValue();
      return {
        ...next,
        agreementTemplateId: templateId,
        status: prev.status || next.status,
        startDate,
        renewalDate: renewalDateOverridden ? prev.renewalDate : addAgreementInterval(startDate, next.termUnit, parseInt(next.termInterval, 10)),
        nextServiceDate: nextServiceDateOverridden ? prev.nextServiceDate : addAgreementInterval(startDate, next.recurrenceUnit, parseInt(next.recurrenceInterval, 10)),
        contractUrl: prev.contractUrl,
        contractSignedAt: prev.contractSignedAt,
        notes: prev.notes,
      };
    });
  };

  const syncDerivedDates = (
    startDate: string,
    options?: {
      startDateSource?: string;
      termUnit?: string;
      termInterval?: string;
      recurrenceUnit?: string;
      recurrenceInterval?: string;
    },
  ) => {
    setForm((prev) => {
      const nextTermUnit = options?.termUnit ?? prev.termUnit;
      const nextTermInterval = options?.termInterval ?? prev.termInterval;
      const nextRecurrenceUnit = options?.recurrenceUnit ?? prev.recurrenceUnit;
      const nextRecurrenceInterval = options?.recurrenceInterval ?? prev.recurrenceInterval;
      const nextStartDateSource = options?.startDateSource ?? prev.startDateSource;

      return {
        ...prev,
        startDate,
        startDateSource: nextStartDateSource,
        termUnit: nextTermUnit,
        termInterval: nextTermInterval,
        recurrenceUnit: nextRecurrenceUnit,
        recurrenceInterval: nextRecurrenceInterval,
        renewalDate: renewalDateOverridden ? prev.renewalDate : addAgreementInterval(startDate, nextTermUnit, parseInt(nextTermInterval, 10)),
        nextServiceDate: nextServiceDateOverridden ? prev.nextServiceDate : addAgreementInterval(startDate, nextRecurrenceUnit, parseInt(nextRecurrenceInterval, 10)),
      };
    });
  };

  const buildAgreementPayload = (data: typeof form) => ({
    customerId,
    locationId,
    agreementTemplateId: data.agreementTemplateId || null,
    initialAppointmentId: data.initialAppointmentId || null,
    startDateSource: data.startDateSource || "MANUAL",
    agreementName: data.agreementName.trim(),
    status: data.status,
    agreementType: data.agreementType.trim() || null,
    startDate: data.startDate,
    termUnit: data.termUnit,
    termInterval: parseInt(data.termInterval, 10),
    renewalDate: data.renewalDate || null,
    nextServiceDate: data.nextServiceDate,
    billingFrequency: data.billingFrequency.trim() || null,
    price: data.price.trim() || null,
    recurrenceUnit: data.recurrenceUnit,
    recurrenceInterval: parseInt(data.recurrenceInterval, 10),
    generationLeadDays: parseInt(data.generationLeadDays, 10),
    serviceWindowDays: data.serviceWindowDays.trim() ? parseInt(data.serviceWindowDays, 10) : null,
    serviceTypeId: data.serviceTypeId || null,
    serviceTemplateName: data.serviceTemplateName.trim() || null,
    defaultDurationMinutes: data.defaultDurationMinutes.trim() ? parseInt(data.defaultDurationMinutes, 10) : null,
    serviceInstructions: data.serviceInstructions.trim() || null,
    contractUrl: data.contractUrl.trim() || null,
    contractSignedAt: data.contractSignedAt ? new Date(`${data.contractSignedAt}T00:00:00.000Z`).toISOString() : null,
    notes: data.notes.trim() || null,
  });

  const invalidateAgreementQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/agreements/location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
  };

  const persistAgreement = async (data: typeof form) => {
    const payload = buildAgreementPayload(data);
    const response = currentAgreement
      ? await apiRequest("PATCH", `/api/agreements/${currentAgreement.id}`, payload)
      : await apiRequest("POST", "/api/agreements", {
          agreementTemplateId: data.agreementTemplateId || null,
          agreement: payload,
        });

    const savedAgreement = await response.json() as Agreement;
    setDraftAgreement(savedAgreement);
    invalidateAgreementQueries();
    return savedAgreement;
  };

  const validateBeforeSave = () => {
    if (!currentAgreement && !form.agreementTemplateId) {
      toast({ title: "Select an agreement template before creating a location agreement", variant: "destructive" });
      return false;
    }

    if (!form.agreementName.trim() || !form.startDate || !form.nextServiceDate || !form.serviceTypeId) {
      toast({ title: "Agreement name, start date, next service date, and service type are required", variant: "destructive" });
      return false;
    }

    if (parseInt(form.termInterval, 10) < 1 || parseInt(form.recurrenceInterval, 10) < 1 || parseInt(form.generationLeadDays, 10) < 0) {
      toast({ title: "Term and recurrence intervals must be at least 1 and lead days cannot be negative", variant: "destructive" });
      return false;
    }

    return true;
  };

  const mutation = useMutation({
    mutationFn: persistAgreement,
    onSuccess: () => {
      toast({ title: isEditMode ? "Agreement updated" : "Agreement created" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: isEditMode ? "Error updating agreement" : "Error creating agreement", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSave()) {
      return;
    }

    mutation.mutate(form);
  };

  const initialServiceCandidates = useMemo(() => {
    return (appointments ?? [])
      .filter((appointment) => appointment.source !== "AGREEMENT_GENERATED")
      .filter((appointment) => !appointment.agreementId || appointment.agreementId === currentAgreement?.id)
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
  }, [appointments, currentAgreement?.id]);

  const linkedInitialAppointment = useMemo(() => {
    if (!form.initialAppointmentId) {
      return null;
    }
    return (appointments ?? []).find((appointment) => appointment.id === form.initialAppointmentId) ?? null;
  }, [appointments, form.initialAppointmentId]);

  const handleScheduleInitialService = async () => {
    if (!validateBeforeSave()) {
      return;
    }

    try {
      const savedAgreement = await persistAgreement(form);
      const scheduledDate = `${(form.startDate || getTodayDateInputValue())}T14:00`;
      const returnTo = `/customers/${customerId}?locationId=${locationId}`;
      const params = new URLSearchParams({
        agreementId: savedAgreement.id,
        customerId,
        locationId,
        serviceTypeId: form.serviceTypeId,
        agreementName: savedAgreement.agreementName,
        scheduledDate,
        returnTo,
      });
      setLocation(`/schedule?${params.toString()}`);
    } catch (error) {
      toast({ title: "Unable to prepare initial service scheduling", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleOpenLinkExistingService = async () => {
    if (initialServiceCandidates.length === 0) {
      toast({ title: "No existing services available to link for this location", variant: "destructive" });
      return;
    }

    if (!validateBeforeSave()) {
      return;
    }

    try {
      await persistAgreement(form);
      setLinkDialogOpen(true);
    } catch (error) {
      toast({ title: "Unable to prepare agreement for initial service linking", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleLinkExistingService = async (appointmentId: string) => {
    if (!currentAgreement) {
      return;
    }

    try {
      const response = await apiRequest("POST", `/api/agreements/${currentAgreement.id}/link-initial-appointment`, { appointmentId });
      const updatedAgreement = await response.json() as Agreement;
      setDraftAgreement(updatedAgreement);
      setForm(buildAgreementFormState(updatedAgreement, updatedAgreement.agreementTemplateId ? templateById.get(updatedAgreement.agreementTemplateId) ?? null : null));
      setRenewalDateOverridden(false);
      setNextServiceDateOverridden(false);
      invalidateAgreementQueries();
      setLinkDialogOpen(false);
      toast({ title: "Initial service linked" });
    } catch (error) {
      toast({ title: "Unable to link initial service", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Agreement Template</h3>
        <p className="text-sm text-muted-foreground">
          {isEditMode
            ? "This agreement keeps its own snapshot of values. Template changes do not rewrite it automatically."
            : "Start with a company template, then customize only what this location needs."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Agreement Template</Label>
        {isEditMode ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
            {selectedTemplateId ? (
              templateById.get(selectedTemplateId)?.name || "Template linked"
            ) : (
              <span className="text-muted-foreground">Custom / legacy agreement</span>
            )}
          </div>
        ) : (
          <Select value={form.agreementTemplateId} onValueChange={(value) => {
            setForm((prev) => ({ ...prev, agreementTemplateId: value }));
            applyTemplate(value);
          }}>
            <SelectTrigger data-testid="select-agreement-template"><SelectValue placeholder="Select a template" /></SelectTrigger>
            <SelectContent>
              {activeTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {!isEditMode && selectedTemplateId && templateById.get(selectedTemplateId)?.description && (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          {templateById.get(selectedTemplateId)?.description}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Agreement Dates and Status</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Agreement Name</Label><Input data-testid="input-agreement-name" value={form.agreementName} onChange={(e) => setForm((prev) => ({ ...prev, agreementName: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
            <SelectTrigger data-testid="select-agreement-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => syncDerivedDates(e.target.value, { startDateSource: "MANUAL" })}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline" onClick={handleScheduleInitialService}>
              Schedule initial service
            </Button>
            <Button type="button" variant="ghost" className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline" onClick={handleOpenLinkExistingService}>
              Link existing service
            </Button>
          </div>
          {linkedInitialAppointment && (
            <p className="text-xs text-muted-foreground">
              {form.startDateSource === "INITIAL_APPOINTMENT" ? "Start date derived from linked service." : "Linked initial service retained for reference."}{" "}
              {new Date(linkedInitialAppointment.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
              ({linkedInitialAppointment.status}).
            </p>
          )}
        </div>
        <div className="space-y-1.5"><Label>Renewal Date</Label><Input type="date" value={form.renewalDate} onChange={(e) => { setRenewalDateOverridden(true); setForm((prev) => ({ ...prev, renewalDate: e.target.value })); }} /></div>
        <div className="space-y-1.5"><Label>Next Service Date</Label><Input type="date" value={form.nextServiceDate} onChange={(e) => { setNextServiceDateOverridden(true); setForm((prev) => ({ ...prev, nextServiceDate: e.target.value })); }} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Contract / Document</h3>
        <p className="text-sm text-muted-foreground">This MVP stores a contract link because the app does not yet have a dedicated file upload pipeline.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Contract Link</Label><Input type="url" value={form.contractUrl} onChange={(e) => setForm((prev) => ({ ...prev, contractUrl: e.target.value }))} placeholder="https://..." /></div>
        <div className="space-y-1.5"><Label>Contract Signed Date</Label><Input type="date" value={form.contractSignedAt} onChange={(e) => setForm((prev) => ({ ...prev, contractSignedAt: e.target.value }))} /></div>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Internal Notes</h3>
      </div>
      <div className="space-y-1.5"><Label>Internal Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="resize-none" /></div>
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Link Existing Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {initialServiceCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No qualifying location services are available to link.</p>
            ) : (
              initialServiceCandidates.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => handleLinkExistingService(appointment.id)}
                  className="w-full rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(appointment.scheduledDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {appointment.status} {appointment.assignedTo ? `| ${appointment.assignedTo}` : ""} {appointment.agreementId && appointment.agreementId !== currentAgreement?.id ? "| already linked to another agreement" : ""}
                      </p>
                      {appointment.notes && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{appointment.notes}</p>}
                    </div>
                    <span className="text-xs font-medium text-primary">Link</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Accordion type="single" collapsible className="rounded-md border px-3">
        <AccordionItem value="advanced-overrides" className="border-b-0">
          <AccordionTrigger className="py-3 text-sm font-medium">Advanced Overrides</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Recurrence / Scheduling Overrides</h3>
              <p className="text-sm text-muted-foreground">Only change these when this location needs behavior that differs from the selected template.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Agreement Term Unit</Label>
                <Select value={form.termUnit} onValueChange={(value) => syncDerivedDates(form.startDate, { termUnit: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTH">Month</SelectItem>
                    <SelectItem value="QUARTER">Quarter</SelectItem>
                    <SelectItem value="YEAR">Year</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Agreement Term Interval</Label><Input type="number" min="1" value={form.termInterval} onChange={(e) => syncDerivedDates(form.startDate, { termInterval: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Recurrence Unit</Label>
                <Select value={form.recurrenceUnit} onValueChange={(value) => syncDerivedDates(form.startDate, { recurrenceUnit: value })}>
                  <SelectTrigger data-testid="select-agreement-recurrence-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTH">Month</SelectItem>
                    <SelectItem value="QUARTER">Quarter</SelectItem>
                    <SelectItem value="YEAR">Year</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Recurrence Interval</Label><Input type="number" min="1" value={form.recurrenceInterval} onChange={(e) => syncDerivedDates(form.startDate, { recurrenceInterval: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Generation Lead Days</Label><Input type="number" min="0" value={form.generationLeadDays} onChange={(e) => setForm((prev) => ({ ...prev, generationLeadDays: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Service Window Days</Label><Input type="number" min="0" value={form.serviceWindowDays} onChange={(e) => setForm((prev) => ({ ...prev, serviceWindowDays: e.target.value }))} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Billing Frequency Override</Label><Input value={form.billingFrequency} onChange={(e) => setForm((prev) => ({ ...prev, billingFrequency: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Agreement Type Override</Label><Input value={form.agreementType} onChange={(e) => setForm((prev) => ({ ...prev, agreementType: e.target.value }))} /></div>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Service Details</h3>
              <p className="text-sm text-muted-foreground">Use these only when this location needs service behavior that differs from the template defaults.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Service Type</Label>
                <Select value={form.serviceTypeId} onValueChange={(value) => setForm((prev) => ({ ...prev, serviceTypeId: value }))}>
                  <SelectTrigger data-testid="select-agreement-service-type"><SelectValue placeholder="Select service type" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes?.map((serviceType) => (
                      <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Service Template Name</Label><Input value={form.serviceTemplateName} onChange={(e) => setForm((prev) => ({ ...prev, serviceTemplateName: e.target.value }))} placeholder="Optional override label" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Default Duration Minutes</Label><Input type="number" min="0" value={form.defaultDurationMinutes} onChange={(e) => setForm((prev) => ({ ...prev, defaultDurationMinutes: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Price</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="Optional" /></div>
            </div>
            <div className="space-y-1.5"><Label>Service Instructions</Label><Textarea value={form.serviceInstructions} onChange={(e) => setForm((prev) => ({ ...prev, serviceInstructions: e.target.value }))} className="resize-none" /></div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-agreement">
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Agreement" : "Create Agreement"}
        </Button>
      </div>
    </form>
  );
}

function AgreementsTab({
  customerId,
  locationId,
  appointments,
}: {
  customerId: string;
  locationId: string;
  appointments?: Appointment[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(null);
  const { data: agreements } = useQuery<Agreement[]>({ queryKey: ["/api/agreements/location", locationId], enabled: !!locationId });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: agreementTemplates } = useQuery<AgreementTemplate[]>({ queryKey: ["/api/agreement-templates"] });

  const agreementAppointments = useMemo(() => {
    return (appointments ?? []).filter((appointment) => appointment.source === "AGREEMENT_GENERATED" && !!appointment.agreementId);
  }, [appointments]);

  const serviceTypeNameById = useMemo(() => {
    return new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name]));
  }, [serviceTypes]);
  const templateNameById = useMemo(() => {
    return new Map((agreementTemplates ?? []).map((template) => [template.id, template.name]));
  }, [agreementTemplates]);

  const appointmentsByAgreementId = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    for (const appointment of agreementAppointments) {
      if (!appointment.agreementId) {
        continue;
      }
      const items = grouped.get(appointment.agreementId) ?? [];
      items.push(appointment);
      grouped.set(appointment.agreementId, items);
    }
    return grouped;
  }, [agreementAppointments]);
  const appointmentById = useMemo(() => {
    return new Map((appointments ?? []).map((appointment) => [appointment.id, appointment]));
  }, [appointments]);

  const openCreate = () => {
    setEditingAgreement(null);
    setDialogOpen(true);
  };

  const openEdit = (agreement: Agreement) => {
    setEditingAgreement(agreement);
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingAgreement(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate} data-testid="button-add-agreement">
              <Plus className="h-3 w-3 mr-1" /> Create Agreement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAgreement ? "Edit Agreement" : "Create Agreement"}</DialogTitle>
            </DialogHeader>
            <AgreementForm customerId={customerId} locationId={locationId} agreement={editingAgreement} appointments={appointments} onClose={() => closeDialog(false)} />
          </DialogContent>
        </Dialog>
      </div>
      {!agreements || agreements.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-semibold">No agreements yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create an agreement to manage recurring service scheduling and contract details.</p>
          </CardContent>
        </Card>
      ) : (
        agreements
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .map((agreement) => {
            const linkedAppointments = (appointmentsByAgreementId.get(agreement.id) ?? [])
              .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
            const nextGeneratedAppointment = linkedAppointments.find((appointment) => appointment.status !== "completed" && appointment.status !== "canceled");
            const serviceTypeLabel = serviceTypeNameById.get(agreement.serviceTypeId || "") || agreement.serviceTemplateName || "Service not set";
            const initialAppointment = agreement.initialAppointmentId ? appointmentById.get(agreement.initialAppointmentId) ?? null : null;

            return (
              <Card key={agreement.id} data-testid={`card-agreement-${agreement.id}`}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{agreement.agreementName}</p>
                        <Badge variant="secondary" className={`text-xs ${agreementStatusBadgeClass(agreement.status)}`}>{agreement.status}</Badge>
                        <Badge variant="outline" className="text-xs">
                          {agreement.agreementTemplateId ? `Template: ${templateNameById.get(agreement.agreementTemplateId) || "Template"}` : "Custom agreement"}
                        </Badge>
                        {agreement.contractUrl && <Badge variant="outline" className="text-xs"><Link2 className="h-3 w-3 mr-1" /> Contract</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatAgreementRecurrence(agreement)} • Next due {formatDateOnly(agreement.nextServiceDate)}</p>
                      {initialAppointment && (
                        <p className="text-xs text-muted-foreground">
                          Initial service linked for {new Date(initialAppointment.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(agreement)} data-testid={`button-edit-agreement-${agreement.id}`}>
                      Edit
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service Type</p>
                      <p className="mt-1">{serviceTypeLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Price</p>
                      <p className="mt-1">{agreement.price ? formatCurrency(parseFloat(agreement.price)) : "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead Time</p>
                      <p className="mt-1">{agreement.generationLeadDays} day{agreement.generationLeadDays === 1 ? "" : "s"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Generated Orders</p>
                      <p className="mt-1">{linkedAppointments.length} total</p>
                    </div>
                  </div>
                  {nextGeneratedAppointment ? (
                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      <p className="font-medium">Upcoming generated service order</p>
                      <p className="text-muted-foreground mt-1">
                        {new Date(nextGeneratedAppointment.scheduledDate).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} • {nextGeneratedAppointment.status}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      No upcoming generated service order yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
      )}
    </div>
  );
}

function ServiceForm({
  customerId,
  locationId,
  service,
  onClose,
}: {
  customerId: string;
  locationId: string;
  service?: Service | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isEditMode = !!service;
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const [submitMode, setSubmitMode] = useState<"pending" | "schedule">("pending");
  const [form, setForm] = useState({
    dueDate: service?.dueDate ?? getTodayDateInputValue(),
    timeWindow: service?.timeWindow ?? DEFAULT_TIME_WINDOW_OPTIONS[1],
    notes: service?.notes ?? "",
  });
  const [serviceLines, setServiceLines] = useState<Array<{
    key: string;
    serviceTypeId: string;
    expectedDurationMinutes: string;
    price: string;
  }>>([
    {
      key: service?.id ?? "line-1",
      serviceTypeId: service?.serviceTypeId ?? "",
      expectedDurationMinutes: service?.expectedDurationMinutes ? String(service.expectedDurationMinutes) : "",
      price: service?.price ?? "",
    },
  ]);

  const updateServiceLine = (key: string, updates: Partial<(typeof serviceLines)[number]>) => {
    setServiceLines((current) => current.map((line) => line.key === key ? { ...line, ...updates } : line));
  };

  const addServiceLine = () => {
    setServiceLines((current) => [
      ...current,
      {
        key: `line-${Date.now()}-${current.length + 1}`,
        serviceTypeId: "",
        expectedDurationMinutes: "",
        price: "",
      },
    ]);
  };

  const removeServiceLine = (key: string) => {
    setServiceLines((current) => current.length > 1 ? current.filter((line) => line.key !== key) : current);
  };

  useEffect(() => {
    if (!serviceTypes || isEditMode) return;
    setServiceLines((current) => current.map((line) => {
      if (!line.serviceTypeId) return line;
      const selectedServiceType = serviceTypes.find((serviceType) => serviceType.id === line.serviceTypeId);
      if (!selectedServiceType) return line;
      return {
        ...line,
        expectedDurationMinutes: line.expectedDurationMinutes || (selectedServiceType.estimatedDuration ? String(selectedServiceType.estimatedDuration) : ""),
        price: line.price || selectedServiceType.defaultPrice || "",
      };
    }));
  }, [isEditMode, serviceLines.length, serviceTypes]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!service) return;
      await apiRequest("DELETE", `/api/services/${service.id}`);
    },
    onSuccess: async () => {
      setServiceLines([{
        key: "line-1",
        serviceTypeId: "",
        expectedDurationMinutes: "",
        price: "",
      }]);
      await queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
      toast({ title: "Service deleted" });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Unable to delete service", description: error.message, variant: "destructive" }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditMode && service) {
        const line = serviceLines[0];
        const payload = {
          customerId,
          locationId,
          agreementId: service.agreementId ?? null,
          serviceTypeId: line.serviceTypeId,
          dueDate: form.dueDate || null,
          timeWindow: form.timeWindow || null,
          expectedDurationMinutes: line.expectedDurationMinutes ? parseInt(line.expectedDurationMinutes, 10) : null,
          price: line.price.trim() || null,
          status: service.status,
          assignedTechnicianId: service.assignedTechnicianId ?? null,
          source: service.source ?? "MANUAL",
          notes: form.notes.trim() || null,
        };

        const response = await apiRequest("PATCH", `/api/services/${service.id}`, payload);
        return [await response.json() as Service];
      }

      const createdServices: Service[] = [];
      for (const line of serviceLines.filter((entry) => entry.serviceTypeId)) {
        const response = await apiRequest("POST", "/api/services", {
          customerId,
          locationId,
          agreementId: null,
          serviceTypeId: line.serviceTypeId,
          dueDate: form.dueDate || null,
          timeWindow: form.timeWindow || null,
          expectedDurationMinutes: line.expectedDurationMinutes ? parseInt(line.expectedDurationMinutes, 10) : null,
          price: line.price.trim() || null,
          status: "PENDING_SCHEDULING",
          assignedTechnicianId: null,
          source: "MANUAL",
          notes: form.notes.trim() || null,
        });
        createdServices.push(await response.json() as Service);
      }

      return createdServices;
    },
    onSuccess: (savedServices) => {
      queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/by-location", locationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });

      if (submitMode === "schedule") {
        const [primaryService, ...additionalServices] = savedServices;
        if (!primaryService) {
          toast({ title: "No services were created", variant: "destructive" });
          return;
        }
        const params = new URLSearchParams({
          serviceId: primaryService.id,
          serviceIds: savedServices.map((savedService) => savedService.id).join(","),
          returnTo: `/customers/${customerId}?locationId=${locationId}`,
        });
        if (primaryService.dueDate) {
          params.set("date", primaryService.dueDate);
        }
        if (primaryService.timeWindow) params.set("timeWindow", primaryService.timeWindow);
        setLocation(`/schedule?${params.toString()}`);
        return;
      }

      toast({ title: isEditMode ? "Service updated" : savedServices.length > 1 ? "Services saved" : "Service saved" });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Error saving service", description: error.message, variant: "destructive" }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
      {!isEditMode && (
        <div className="space-y-3">
          {serviceLines.map((line, index) => (
            <div key={line.key} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">Add Service {index + 1}</Label>
                {serviceLines.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeServiceLine(line.key)}>Remove</Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>Service Type</Label>
                  <Select value={line.serviceTypeId} onValueChange={(value) => {
                    const serviceType = serviceTypes?.find((item) => item.id === value);
                    updateServiceLine(line.key, {
                      serviceTypeId: value,
                      expectedDurationMinutes: line.expectedDurationMinutes || (serviceType?.estimatedDuration ? String(serviceType.estimatedDuration) : ""),
                      price: line.price || serviceType?.defaultPrice || "",
                    });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
                    <SelectContent>
                      {serviceTypes?.map((serviceType) => (
                        <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Expected Duration</Label>
                  <Input type="number" min="0" value={line.expectedDurationMinutes} onChange={(e) => updateServiceLine(line.key, { expectedDurationMinutes: e.target.value })} placeholder="Minutes" />
                </div>
                <div className="space-y-1.5">
                  <Label>Service Cost</Label>
                  <Input type="number" min="0" step="0.01" value={line.price} onChange={(e) => updateServiceLine(line.key, { price: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addServiceLine}>Add Service</Button>
        </div>
      )}

      {isEditMode && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Service Type</Label>
            <Select value={serviceLines[0]?.serviceTypeId || ""} onValueChange={(value) => updateServiceLine(serviceLines[0].key, { serviceTypeId: value })}>
              <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
              <SelectContent>
                {serviceTypes?.map((serviceType) => (
                  <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Expected Duration</Label><Input type="number" min="0" value={serviceLines[0]?.expectedDurationMinutes || ""} onChange={(e) => updateServiceLine(serviceLines[0].key, { expectedDurationMinutes: e.target.value })} placeholder="Minutes" /></div>
          <div className="space-y-1.5"><Label>Service Cost</Label><Input type="number" min="0" step="0.01" value={serviceLines[0]?.price || ""} onChange={(e) => updateServiceLine(serviceLines[0].key, { price: e.target.value })} /></div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Target Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} /></div>
        <div className="space-y-1.5">
          <Label>Time Window</Label>
          <Select value={form.timeWindow} onValueChange={(value) => setForm((prev) => ({ ...prev, timeWindow: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEFAULT_TIME_WINDOW_OPTIONS.map((windowOption) => (
                <SelectItem key={windowOption} value={windowOption}>{windowOption}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Instructions</Label><Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="resize-none" /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        {isEditMode && (
          <Button type="button" variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting..." : "Delete Service"}
          </Button>
        )}
        {!isEditMode && (
          <Button type="submit" variant="outline" onClick={() => setSubmitMode("pending")} disabled={mutation.isPending || serviceLines.every((line) => !line.serviceTypeId)}>
            {mutation.isPending && submitMode === "pending" ? "Saving..." : "Save as Pending"}
          </Button>
        )}
        <Button type="submit" onClick={() => setSubmitMode(isEditMode ? "pending" : "schedule")} disabled={mutation.isPending || serviceLines.every((line) => !line.serviceTypeId)}>
          {mutation.isPending ? "Saving..." : isEditMode ? "Save Service" : "Schedule Now"}
        </Button>
      </div>
    </form>
  );
}

function ServiceDetailModal({
  service,
  serviceTypeName,
  technicianName,
  appointment,
  serviceRecord,
  invoice,
  siblingServices,
  serviceTypeNameById,
}: {
  service: Service;
  serviceTypeName: string;
  technicianName: string;
  appointment?: Appointment | null;
  serviceRecord?: ServiceRecord | null;
  invoice?: Invoice | null;
  siblingServices?: Service[];
  serviceTypeNameById: Map<string, string>;
}) {
  const displayDate = getServiceDisplayDate(service, appointment, serviceRecord);
  const siblingCount = Math.max((siblingServices?.length ?? 1) - 1, 0);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Service Type</p><p className="mt-1 font-medium">{serviceTypeName}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1">{service.status}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Service Date</p><p className="mt-1">{displayDate.label}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Technician</p><p className="mt-1">{technicianName || "Unassigned"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Cost</p><p className="mt-1">{service.price ? formatCurrency(parseFloat(service.price)) : "Not set"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p><p className="mt-1">{service.expectedDurationMinutes ? `${service.expectedDurationMinutes} min` : "Not set"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Time Window</p><p className="mt-1">{service.timeWindow || "Not set"}</p></div>
      </div>
      {appointment && (
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked Appointment</p>
          <p className="mt-1 font-medium">{formatDateTimeValue(appointment.scheduledDate)}</p>
          {siblingCount > 0 ? <p className="mt-1 text-xs text-muted-foreground">This visit also includes {siblingCount} other service{siblingCount === 1 ? "" : "s"}.</p> : null}
        </div>
      )}
      {invoice && (
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</p>
          <p className="mt-1 font-medium">{invoice.invoiceNumber}</p>
        </div>
      )}
      {service.notes && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{service.notes}</p>
        </div>
      )}
      {serviceRecord && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Completion Details</p>
          {serviceRecord.technicianName && <p><span className="font-medium">Technician:</span> {serviceRecord.technicianName}</p>}
          {serviceRecord.technicianLicenseNumber && <p><span className="font-medium">License #:</span> {serviceRecord.technicianLicenseNumber}</p>}
          {serviceRecord.notes && <p><span className="font-medium">Notes:</span> {serviceRecord.notes}</p>}
          {serviceRecord.areasServiced && <p><span className="font-medium">Areas:</span> {serviceRecord.areasServiced}</p>}
          {serviceRecord.conditionsFound && <p><span className="font-medium">Conditions:</span> {serviceRecord.conditionsFound}</p>}
          {serviceRecord.recommendations && <p><span className="font-medium">Recommendations:</span> {serviceRecord.recommendations}</p>}
        </div>
      )}
      {appointment && siblingServices && siblingServices.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Other Services In This Visit</p>
          <div className="space-y-1">
            {siblingServices
              .filter((sibling) => sibling.id !== service.id)
              .map((sibling) => (
                <div key={sibling.id} className="rounded-md border bg-muted/20 px-3 py-2">
                  {serviceTypeNameById.get(sibling.serviceTypeId || "") || "Service"}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServicesTab({
  customerId,
  locationId,
  appointments,
  serviceRecords,
  invoices,
  onOpenInvoices,
}: {
  customerId: string;
  locationId: string;
  appointments?: Appointment[];
  serviceRecords?: ServiceRecord[];
  invoices?: Invoice[];
  onOpenInvoices: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [detailService, setDetailService] = useState<Service | null>(null);
  const { data: services } = useQuery<Service[]>({ queryKey: ["/api/services/by-location", locationId], enabled: !!locationId });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: technicians } = useQuery<Technician[]>({ queryKey: ["/api/technicians?includeInactive=true"] });
  const [, setLocation] = useLocation();

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const technicianNameById = useMemo(() => new Map((technicians ?? []).map((technician) => [technician.id, technician.displayName])), [technicians]);
  const appointmentsById = useMemo(() => new Map((appointments ?? []).map((appointment) => [appointment.id, appointment])), [appointments]);
  const appointmentByServiceId = useMemo(() => {
    const map = new Map<string, Appointment>();
    for (const service of services ?? []) {
      if (service.appointmentId && appointmentsById.has(service.appointmentId)) {
        map.set(service.id, appointmentsById.get(service.appointmentId)!);
      }
    }
    for (const appointment of appointments ?? []) {
      if (appointment.serviceId && !map.has(appointment.serviceId)) map.set(appointment.serviceId, appointment);
    }
    return map;
  }, [appointments, appointmentsById, services]);
  const serviceRecordByServiceId = useMemo(() => {
    const map = new Map<string, ServiceRecord>();
    for (const serviceRecord of serviceRecords ?? []) {
      if (serviceRecord.serviceId) map.set(serviceRecord.serviceId, serviceRecord);
    }
    return map;
  }, [serviceRecords]);
  const invoiceByServiceId = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const invoice of invoices ?? []) {
      const matchedServiceRecord = serviceRecords?.find((serviceRecord) => serviceRecord.id === invoice.serviceRecordId);
      if (matchedServiceRecord?.serviceId) {
        map.set(matchedServiceRecord.serviceId, invoice);
      }
    }
    return map;
  }, [invoices, serviceRecords]);
  const siblingServicesByAppointmentId = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of services ?? []) {
      const appointmentId = service.appointmentId;
      if (!appointmentId) continue;
      const existing = map.get(appointmentId) ?? [];
      existing.push(service);
      map.set(appointmentId, existing);
    }
    return map;
  }, [services]);

  const sortedServices = useMemo(() => {
    return [...(services ?? [])].sort((a, b) => {
      const appointmentA = appointmentByServiceId.get(a.id) ?? null;
      const appointmentB = appointmentByServiceId.get(b.id) ?? null;
      const serviceRecordA = serviceRecordByServiceId.get(a.id) ?? null;
      const serviceRecordB = serviceRecordByServiceId.get(b.id) ?? null;
      const dateA = serviceRecordA?.serviceDate
        ? new Date(serviceRecordA.serviceDate).toISOString()
        : appointmentA?.scheduledDate
          ? new Date(appointmentA.scheduledDate).toISOString()
          : `${a.dueDate ?? ""}T00:00:00.000Z`;
      const dateB = serviceRecordB?.serviceDate
        ? new Date(serviceRecordB.serviceDate).toISOString()
        : appointmentB?.scheduledDate
          ? new Date(appointmentB.scheduledDate).toISOString()
          : `${b.dueDate ?? ""}T00:00:00.000Z`;
      return dateB.localeCompare(dateA);
    });
  }, [appointmentByServiceId, serviceRecordByServiceId, services]);

  const openCreate = () => {
    setEditingService(null);
    setDialogOpen(true);
  };

  const scheduleService = (service: Service) => {
    const params = new URLSearchParams({
      serviceId: service.id,
      returnTo: `/customers/${customerId}?locationId=${locationId}`,
    });
    const linkedAppointment = appointmentByServiceId.get(service.id);
    if (linkedAppointment) {
      params.set("appointmentId", linkedAppointment.id);
    }
    if (service.dueDate) params.set("date", service.dueDate);
    setLocation(`/schedule?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Plus className="h-3 w-3 mr-1" /> New Service</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingService ? "Edit Service" : "New Service"}</DialogTitle></DialogHeader>
            <ServiceForm customerId={customerId} locationId={locationId} service={editingService} onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
      {!sortedServices.length ? (
        <Card><CardContent className="py-8 text-center"><ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No services for this location yet.</p></CardContent></Card>
      ) : (
        <div className="rounded-md border">
          <div className="grid grid-cols-[1fr_1.45fr_0.8fr_0.9fr_0.95fr_0.7fr_1fr] gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Service Date</span>
            <span>Service Type</span>
            <span>Status</span>
            <span>Service Cost</span>
            <span>Technician</span>
            <span>Invoice</span>
            <span className="text-right">Actions</span>
          </div>
          {sortedServices.map((service) => {
            const appointment = appointmentByServiceId.get(service.id) ?? null;
            const serviceRecord = serviceRecordByServiceId.get(service.id) ?? null;
            const invoice = invoiceByServiceId.get(service.id) ?? null;
            const displayDate = getServiceDisplayDate(service, appointment, serviceRecord);
            const siblingServices = service.appointmentId ? siblingServicesByAppointmentId.get(service.appointmentId) ?? [service] : [service];
            const siblingCount = Math.max(siblingServices.length - 1, 0);
            const hasSharedVisit = !!service.appointmentId && !!appointment && siblingCount > 0;
            const technicianName = technicianNameById.get(service.assignedTechnicianId || "") || serviceRecord?.technicianName || "Unassigned";
            return (
              <div
                key={service.id}
                onClick={() => setDetailService(service)}
                className="grid w-full cursor-pointer grid-cols-[1fr_1.45fr_0.8fr_0.9fr_0.95fr_0.7fr_1fr] gap-2 border-b px-3 py-2 text-left text-sm transition-colors hover:bg-muted/20 last:border-b-0"
              >
                <span>
                  <span className="block">{displayDate.label}</span>
                  {displayDate.source === "scheduled" ? <span className="text-xs text-muted-foreground">Scheduled visit date</span> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{serviceTypeNameById.get(service.serviceTypeId || "") || "Service"}</span>
                  {hasSharedVisit ? (
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Shared visit</Badge>
                      {`With ${siblingCount} other service${siblingCount === 1 ? "" : "s"}`}
                    </span>
                  ) : null}
                </span>
                <span>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{service.status}</Badge>
                </span>
                <span>{service.price ? formatCurrency(parseFloat(service.price)) : "Not set"}</span>
                <span className="truncate">{technicianName}</span>
                <span>
                  {invoice ? (
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenInvoices();
                      }}
                    >
                      {invoice.invoiceNumber}
                    </button>
                  ) : "—"}
                </span>
                <span className="flex justify-end gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={(event) => { event.stopPropagation(); setEditingService(service); setDialogOpen(true); }}>Edit</Button>
                  <Button type="button" size="sm" className="h-8 px-2" onClick={(event) => { event.stopPropagation(); scheduleService(service); }} disabled={service.status === "COMPLETED" || service.status === "CANCELLED"}>
                    {appointment ? "Reschedule" : "Schedule"}
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!detailService} onOpenChange={(open) => !open && setDetailService(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Service Details</DialogTitle></DialogHeader>
          {detailService && (
            <ServiceDetailModal
              service={detailService}
              serviceTypeName={serviceTypeNameById.get(detailService.serviceTypeId || "") || "Service"}
              technicianName={technicianNameById.get(detailService.assignedTechnicianId || "") || serviceRecordByServiceId.get(detailService.id)?.technicianName || "Unassigned"}
              appointment={appointmentByServiceId.get(detailService.id) ?? null}
              serviceRecord={serviceRecordByServiceId.get(detailService.id) ?? null}
              invoice={invoiceByServiceId.get(detailService.id) ?? null}
              siblingServices={(appointmentByServiceId.get(detailService.id) ? siblingServicesByAppointmentId.get(appointmentByServiceId.get(detailService.id)!.id) : undefined) ?? [detailService]}
              serviceTypeNameById={serviceTypeNameById}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpportunitiesTab({
  locationId,
}: {
  locationId: string;
}) {
  const { toast } = useToast();
  const { data: opportunities } = useQuery<Opportunity[]>({ queryKey: ["/api/opportunities/by-location", locationId], enabled: !!locationId });
  const { data: dispositions } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [selectedDispositionId, setSelectedDispositionId] = useState<string | null>(null);
  const [historyOpportunity, setHistoryOpportunity] = useState<Opportunity | null>(null);

  const serviceTypeNameById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType.name])), [serviceTypes]);
  const sortedOpportunities = useMemo(() => {
    return [...(opportunities ?? [])]
      .filter((opportunity) => opportunity.status !== "CONVERTED" && opportunity.status !== "DISMISSED")
      .sort((a, b) => (a.nextActionDate || a.dueDate).localeCompare(b.nextActionDate || b.dueDate));
  }, [opportunities]);
  const activeDispositions = (dispositions ?? []).filter((item) => item.isActive && item.key !== "CONVERTED_TO_SERVICE");
  const invalidateOpportunities = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
    queryClient.invalidateQueries({ queryKey: ["/api/services/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/by-location", locationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
  };
  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/opportunities/${id}/convert`);
      return response.json();
    },
    onSuccess: () => {
      invalidateOpportunities();
      toast({ title: "Opportunity converted to pending service" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  if (!sortedOpportunities.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No open opportunities for this location.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortedOpportunities.map((opportunity) => (
        <Card key={opportunity.id}>
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{opportunity.opportunityType || serviceTypeNameById.get(opportunity.serviceTypeId || "") || "Opportunity"}</p>
                <Badge variant="outline">{opportunity.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Next action {formatDateOnly(opportunity.nextActionDate || opportunity.dueDate)}</p>
              {opportunity.lastDispositionLabel ? <p className="mt-1 text-xs text-muted-foreground">Last disposition: {opportunity.lastDispositionLabel}</p> : null}
              {opportunity.notes ? <p className="mt-2 text-sm text-muted-foreground">{opportunity.notes}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={!activeDispositions.length}>
                    Disposition <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {activeDispositions.map((disposition) => (
                    <DropdownMenuItem
                      key={disposition.id}
                      onClick={() => {
                        setSelectedOpportunity(opportunity);
                        setSelectedDispositionId(disposition.id);
                      }}
                    >
                      {disposition.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpportunity(opportunity)}>
                View History
              </Button>
              <Button type="button" size="sm" disabled={opportunity.status === "CONVERTED" || opportunity.status === "DISMISSED" || convertMutation.isPending} onClick={() => convertMutation.mutate(opportunity.id)}>
                Convert to Service
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <OpportunityDispositionDialog
        open={!!selectedOpportunity && !!selectedDispositionId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOpportunity(null);
            setSelectedDispositionId(null);
          }
        }}
        opportunity={selectedOpportunity}
        dispositionId={selectedDispositionId}
        onApplied={invalidateOpportunities}
      />
      <OpportunityHistoryDialog
        open={!!historyOpportunity}
        onOpenChange={(open) => {
          if (!open) setHistoryOpportunity(null);
        }}
        opportunity={historyOpportunity}
      />
    </div>
  );
}

export default function CustomerDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id || "";
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  const urlLocationId = searchParams.get("locationId");

  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [editLocDialogOpen, setEditLocDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [activeTab, setActiveTab] = useState("contacts");
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (requestedTab && ["contacts", "agreements", "services", "invoices", "communications", "opportunities"].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const { data: compat, isLoading } = useQuery<CustomerDetailCompatResponse>({
    queryKey: [`/api/customer-detail-compat/${customerId}${urlLocationId ? `?locationId=${urlLocationId}` : ""}`],
  });

  const customer = compat?.legacyCustomer;
  const allLocations = compat?.relatedLocations;
  const primaryLocation = compat?.primaryLocation;
  const activeLocation = compat?.selectedLocation;
  const activeLocationId = activeLocation?.id || "";
  const hasBillingOverride = compat?.hasBillingOverride || false;

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: accountContacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts", customerId], enabled: !!customerId });
  const { data: locationBalances } = useQuery<LocationBalanceSummary[]>({ queryKey: ["/api/location-balances", customerId], enabled: !!customerId });

  const { data: locationCounts } = useQuery<{ contacts: number; appointments: number; agreements: number; services: number; invoices: number; communications: number; opportunities: number }>({
    queryKey: ["/api/location-counts", activeLocationId],
    enabled: !!activeLocationId,
  });

  const { data: locationAppts } = useQuery<Appointment[]>({ queryKey: ["/api/appointments/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationServices } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationInvoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationComms } = useQuery<Communication[]>({ queryKey: ["/api/communications/by-location", activeLocationId], enabled: !!activeLocationId });

  const sortedContacts = useMemo(() => {
    if (!contacts) return [];
    return [...contacts].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [contacts]);

  const primaryContact = useMemo(() => {
    const explicitPrimary = sortedContacts.find((contact) => contact.isPrimary);
    if (explicitPrimary) {
      return {
        contact: explicitPrimary,
        isFallback: false,
      };
    }

    if (sortedContacts.length > 0) {
      return {
        contact: sortedContacts[0],
        isFallback: true,
      };
    }

    if (activeLocation?.isPrimary && customer && (customer.firstName || customer.lastName || customer.email || customer.phone)) {
      return {
        contact: {
          id: "customer-fallback",
          customerId: customer.id,
          locationId: activeLocation.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          phoneType: null,
          role: "Primary location identity",
          isPrimary: true,
        } as Contact,
        isFallback: true,
      };
    }

    return null;
  }, [activeLocation, customer, sortedContacts]);

  const primaryContactNameByLocationId = useMemo(() => {
    const allScopedContacts = accountContacts ?? [];
    const grouped = new Map<string, Contact[]>();

    for (const contact of allScopedContacts) {
      if (!contact.locationId) {
        continue;
      }

      const locationContacts = grouped.get(contact.locationId) ?? [];
      locationContacts.push(contact);
      grouped.set(contact.locationId, locationContacts);
    }

    const labels = new Map<string, string>();
    for (const [locationId, locationContacts] of Array.from(grouped.entries())) {
      const [displayContact] = [...locationContacts].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });

      const fullName = `${displayContact?.firstName ?? ""} ${displayContact?.lastName ?? ""}`.trim();
      if (fullName) {
        labels.set(locationId, fullName);
      }
    }

    return labels;
  }, [accountContacts]);

  const locationBalanceByLocationId = useMemo(() => {
    return new Map((locationBalances ?? []).map((balance) => [balance.locationId, balance]));
  }, [locationBalances]);

  const activeLocationLabel = useMemo(() => {
    if (!activeLocation) {
      return "Select Location";
    }

    const nickname = isUsefulLocationNickname(activeLocation.name) ? activeLocation.name.trim() : "";
    const contactName = primaryContactNameByLocationId.get(activeLocation.id) ?? "";

    if (nickname && contactName) {
      return `${nickname} · ${contactName}`;
    }

    return nickname || contactName || activeLocation.name || "Select Location";
  }, [activeLocation, primaryContactNameByLocationId]);

  const setPrimaryContactMutation = useMutation({
    mutationFn: (contactId: string) => apiRequest("POST", `/api/contacts/${contactId}/set-primary`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/by-location", activeLocationId] });
      toast({ title: "Primary contact updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error updating primary contact", description: err.message, variant: "destructive" });
    },
  });

  function selectLocation(locId: string) {
    setLocation(`/customers/${customerId}?locationId=${locId}`);
  }

  function openCreateContactDialog() {
    setEditingContact(null);
    setContactDialogOpen(true);
  }

  function openEditContactDialog(contact: Contact) {
    setEditingContact(contact);
    setContactDialogOpen(true);
  }

  function handleContactDialogChange(open: boolean) {
    setContactDialogOpen(open);
    if (!open) {
      setEditingContact(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-semibold">Customer not found</h2>
        <Link href="/customers"><Button variant="outline" className="mt-4">Back to Customers</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto relative">
      <Link href="/customers">
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-back"
          className="absolute left-0 top-0 -translate-x-full mr-3"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>
      <div>
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-5">
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold tracking-tight" data-testid="text-customer-name">
                      {customer.firstName} {customer.lastName}
                    </h1>
                    <Badge variant="secondary" className={customer.status === "active" ? "bg-primary/10 text-primary" : ""} data-testid="badge-customer-status">
                      {customer.status}
                    </Badge>
                  </div>
                  {customer.companyName && <p className="text-sm text-muted-foreground mt-1">{customer.companyName}</p>}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {customer.email ? (
                      <CommunicationActionLink
                        href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "email", value: customer.email })}
                        icon={<Mail className="h-3.5 w-3.5" />}
                        text={customer.email}
                        testId="link-customer-email"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> <span data-testid="text-customer-email">No email</span></div>
                    )}
                    {customer.phone ? (
                      <CommunicationActionLink
                        href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "phone", value: customer.phone })}
                        icon={<Phone className="h-3.5 w-3.5" />}
                        text={formatPhoneDisplay(customer.phone)}
                        testId="link-customer-phone"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> <span data-testid="text-customer-phone">No phone</span></div>
                    )}
                    <Badge variant="outline" className="text-xs capitalize" data-testid="badge-customer-type">{customer.customerType}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {primaryLocation && (
                      <Badge variant="secondary" className="text-xs" data-testid="chip-primary-location">
                        <MapPin className="h-3 w-3 mr-1" /> Primary: {primaryLocation.name}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs" data-testid="chip-billing">
                      <CreditCard className="h-3 w-3 mr-1" /> Billing: {hasBillingOverride ? "Per-location" : "Default"}
                    </Badge>
                  </div>
                </div>

                <div className="border-t pt-5">
                  <CustomerNotesPanel customerId={customerId} embedded />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="button-location-selector">
                <MapPin className="h-4 w-4" />
                <span className="truncate max-w-[240px]">{activeLocationLabel}</span>
                <Badge variant="secondary" className="text-xs ml-1">{allLocations?.length || 0}</Badge>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              {allLocations?.map((loc) => {
                const nickname = isUsefulLocationNickname(loc.name) ? loc.name.trim() : "";
                const contactName = primaryContactNameByLocationId.get(loc.id) ?? "";
                const locationBalance = locationBalanceByLocationId.get(loc.id);
                const primaryText = nickname && contactName
                  ? `${nickname} · ${contactName}`
                  : nickname || contactName || loc.name;
                const secondaryText = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
                const balanceText = locationBalance && locationBalance.openBalance > 0
                  ? `Open ${formatCurrency(locationBalance.openBalance)}`
                  : locationBalance?.invoiceCount
                    ? "Paid up"
                    : "No balance";

                return (
                <DropdownMenuItem key={loc.id} onClick={() => selectLocation(loc.id)} className={`flex flex-col items-start gap-1 py-2 ${loc.id === activeLocationId ? "bg-accent" : ""}`} data-testid={`location-option-${loc.id}`}>
                  <div className="flex items-center gap-2 w-full">
                    {loc.id === activeLocationId ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
                    <span className="font-medium text-sm truncate">{primaryText}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      {loc.isPrimary && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Primary</Badge>}
                      {loc.billingProfileId && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Billing Override</Badge>}
                    </div>
                  </div>
                  <div className="pl-5 w-full space-y-0.5">
                    <p className="text-xs text-muted-foreground leading-4">{secondaryText}</p>
                    <p className="text-[11px] font-medium text-muted-foreground">{balanceText}</p>
                  </div>
                </DropdownMenuItem>
              )})}
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" data-testid="button-add-location"><Plus className="h-3 w-3 mr-1" /> Add Location</Button></DialogTrigger>
            <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader><AddLocationDialog customerId={customerId} customerType={customer?.customerType ?? "residential"} onClose={() => setLocDialogOpen(false)} /></DialogContent>
          </Dialog>
        </div>

        {/* Active Location Profile */}
        {activeLocation && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-location-profile">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Location Profile</CardTitle>
                <div className="flex items-center gap-1">
                  {activeLocation.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                  {activeLocation.billingProfileId && <Badge variant="outline" className="text-xs text-chart-3" data-testid="badge-billing-override">Billing Override</Badge>}
                  <Dialog open={editLocDialogOpen} onOpenChange={setEditLocDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-edit-location">
                        Edit Location
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Edit Location</DialogTitle>
                      </DialogHeader>
                      <EditLocationDialog customer={customer} location={activeLocation} totalLocations={allLocations?.length ?? 0} onClose={() => setEditLocDialogOpen(false)} />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary Contact</p>
                  {primaryContact ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="font-medium text-foreground" data-testid="text-location-primary-contact-name">
                          {primaryContact.contact.firstName} {primaryContact.contact.lastName}
                        </p>
                        {primaryContact.contact.role && (
                          <p className="text-xs text-muted-foreground">{primaryContact.contact.role}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {primaryContact.contact.phone ? (
                          <CommunicationActionLink
                            href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "phone", value: primaryContact.contact.phone })}
                            icon={<Phone className="h-3.5 w-3.5" />}
                            text={`${formatPhoneDisplay(primaryContact.contact.phone)}${primaryContact.contact.phoneType ? ` (${formatOptionLabel(primaryContact.contact.phoneType)})` : ""}`}
                            testId="link-location-primary-contact-phone"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No phone on file</p>
                        )}
                        {primaryContact.contact.email ? (
                          <CommunicationActionLink
                            href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "email", value: primaryContact.contact.email })}
                            icon={<Mail className="h-3.5 w-3.5" />}
                            text={primaryContact.contact.email}
                            testId="link-location-primary-contact-email"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No email on file</p>
                        )}
                      </div>
                      {primaryContact.isFallback && (
                        <p className="text-xs text-muted-foreground">
                          {sortedContacts.length > 0
                            ? "Using the first available contact until a primary contact is selected."
                            : "Using the primary location identity until a location-scoped primary contact is added."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No contact on file for this location yet.</p>
                  )}
                </div>
                <div className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" /><span>{activeLocation.address}, {activeLocation.city}, {activeLocation.state} {activeLocation.zip}</span></div>
                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <span className="capitalize flex items-center gap-1"><Building2 className="h-3 w-3" /> {activeLocation.propertyType}</span>
                  {activeLocation.source && <span>Source: {activeLocation.source}</span>}
                  {activeLocation.squareFootage && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" /> {activeLocation.squareFootage.toLocaleString()} sq ft</span>}
                  {activeLocation.gateCode && <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> Gate: {activeLocation.gateCode}</span>}
                </div>
              </CardContent>
            </Card>

            <LocationNotesPanel customerId={customerId} locationId={activeLocationId} />
          </div>
        )}

        {/* D) Location-scoped tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="contacts" data-testid="tab-contacts"><User className="h-3 w-3 mr-1" /> Contacts ({locationCounts?.contacts ?? contacts?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="agreements" data-testid="tab-agreements"><Calendar className="h-3 w-3 mr-1" /> Agreements ({locationCounts?.agreements ?? 0})</TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services"><ClipboardList className="h-3 w-3 mr-1" /> Services ({locationCounts?.services ?? 0})</TabsTrigger>
            <TabsTrigger value="opportunities" data-testid="tab-opportunities"><Target className="h-3 w-3 mr-1" /> Opportunities ({locationCounts?.opportunities ?? 0})</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices"><FileText className="h-3 w-3 mr-1" /> Invoices ({locationCounts?.invoices ?? 0})</TabsTrigger>
            <TabsTrigger value="comms" data-testid="tab-comms"><MessageSquare className="h-3 w-3 mr-1" /> Comms ({locationCounts?.communications ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Dialog open={contactDialogOpen} onOpenChange={handleContactDialogChange}>
                <DialogTrigger asChild><Button size="sm" data-testid="button-add-contact" onClick={openCreateContactDialog}><Plus className="h-3 w-3 mr-1" /> Add Contact</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
                  </DialogHeader>
                  <ContactDialogForm
                    customerId={customerId}
                    locationId={activeLocationId}
                    contact={editingContact}
                    onClose={() => handleContactDialogChange(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
            {sortedContacts.length === 0 ? (
              <Card><CardContent className="text-center py-8"><User className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No contacts added yet</p></CardContent></Card>
            ) : sortedContacts.map((ct) => (
              <Card key={ct.id} data-testid={`card-contact-${ct.id}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                    onClick={() => openEditContactDialog(ct)}
                    data-testid={`button-edit-contact-icon-${ct.id}`}
                    aria-label={`Edit ${ct.firstName} ${ct.lastName}`}
                  >
                    <User className="h-4 w-4 text-primary" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        className="font-semibold text-sm text-left transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm cursor-pointer"
                        onClick={() => openEditContactDialog(ct)}
                        data-testid={`button-edit-contact-name-${ct.id}`}
                      >
                        {ct.firstName} {ct.lastName}
                      </button>
                      {ct.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                      {ct.role && <span className="text-xs text-muted-foreground">{ct.role}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {ct.email && (
                        <CommunicationActionLink
                          href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "email", value: ct.email })}
                          icon={<Mail className="h-3 w-3" />}
                          text={ct.email}
                          testId={`link-contact-email-${ct.id}`}
                        />
                      )}
                      {ct.phone && (
                        <CommunicationActionLink
                          href={buildCommunicationHref({ customerId, locationId: activeLocationId, type: "phone", value: ct.phone })}
                          icon={<Phone className="h-3 w-3" />}
                          text={`${formatPhoneDisplay(ct.phone)}${ct.phoneType ? ` (${formatOptionLabel(ct.phoneType)})` : ""}`}
                          testId={`link-contact-phone-${ct.id}`}
                        />
                      )}
                    </div>
                  </div>
                  {!ct.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setPrimaryContactMutation.mutate(ct.id)}
                      disabled={setPrimaryContactMutation.isPending}
                      data-testid={`button-make-primary-contact-${ct.id}`}
                    >
                      Make Primary
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="agreements" className="mt-4 space-y-3">
            <AgreementsTab customerId={customerId} locationId={activeLocationId} appointments={locationAppts} />
          </TabsContent>

          <TabsContent value="services" className="mt-4 space-y-3">
            <ServicesTab
              customerId={customerId}
              locationId={activeLocationId}
              appointments={locationAppts}
              serviceRecords={locationServices}
              invoices={locationInvoices}
              onOpenInvoices={() => setActiveTab("invoices")}
            />
          </TabsContent>

          <TabsContent value="opportunities" className="mt-4 space-y-3">
            <OpportunitiesTab locationId={activeLocationId} />
          </TabsContent>

          <TabsContent value="invoices" className="mt-4 space-y-3">
            {!locationInvoices || locationInvoices.length === 0 ? (
              <Card><CardContent className="text-center py-8"><FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No invoices for this location</p></CardContent></Card>
            ) : locationInvoices.map((inv) => (
              <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div><p className="text-sm font-medium">{inv.invoiceNumber}</p><p className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</p></div>
                  <div className="flex items-center gap-2 shrink-0"><span className="text-sm font-semibold">${parseFloat(inv.totalAmount).toFixed(2)}</span><Badge variant="secondary" className={`text-xs ${inv.status === "paid" ? "bg-primary/10 text-primary" : inv.status === "overdue" ? "bg-destructive/10 text-destructive" : "bg-chart-3/10 text-chart-3"}`}>{inv.status}</Badge></div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="comms" className="mt-4 space-y-3">
            {!locationComms || locationComms.length === 0 ? (
              <Card><CardContent className="text-center py-8"><MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No communications for this location</p></CardContent></Card>
            ) : locationComms.map((comm) => (
              <Card key={comm.id} data-testid={`card-comm-${comm.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap"><Badge variant="outline" className="text-xs capitalize">{comm.type}</Badge><Badge variant="secondary" className="text-xs capitalize">{comm.direction}</Badge><span className="text-xs text-muted-foreground">{new Date(comm.sentAt).toLocaleString()}</span></div>
                  {comm.subject && <p className="text-sm font-medium mt-2">{comm.subject}</p>}
                  {comm.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{comm.body}</p>}
                  {comm.nextActionDate ? <p className="text-xs text-muted-foreground mt-1">Next Action: {formatDateOnly(comm.nextActionDate)}</p> : null}
                  {comm.actorLabel ? <p className="text-xs text-muted-foreground mt-1">By: {comm.actorLabel}</p> : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
