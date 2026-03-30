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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@shared/phone";
import {
  ArrowLeft, Mail, Phone, MapPin, Plus, Calendar, FileText, MessageSquare,
  ClipboardList, Building2, User, ChevronDown, ArrowUpRight, StickyNote,
  History,
  CreditCard, Star, KeyRound, Ruler, ChevronUp, Check,
} from "lucide-react";
import type { Customer, Contact, Location, Appointment, Invoice, ServiceRecord, Communication, CustomerNote, BillingProfile, NoteRevision } from "@shared/schema";

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

const BASE_LOCATION_TYPE_OPTIONS = ["residential", "commercial"] as const;
const BASE_SOURCE_OPTIONS = ["Google", "Youtube", "Referal", "Facebook"] as const;
const CONTACT_PHONE_TYPE_OPTIONS = ["mobile", "home", "work", "fax"] as const;

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

function AddLocationDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", zip: "", propertyType: "residential", isPrimary: false, gateCode: "", squareFootage: "" });
  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/locations", { ...data, customerId, squareFootage: data.squareFootage ? parseInt(data.squareFootage) : null }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(`/api/customer-detail-compat/${customerId}`),
      });
      toast({ title: "Location added" });
      onClose();
    },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5"><Label>Location Name</Label><Input data-testid="input-loc-name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Main Office, Home" /></div>
      <div className="space-y-1.5"><Label>Address</Label><Input data-testid="input-loc-address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>State</Label><Input value={form.state} onChange={(e) => setForm(p => ({ ...p, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>ZIP</Label><Input value={form.zip} onChange={(e) => setForm(p => ({ ...p, zip: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Property Type</Label>
          <Select value={form.propertyType} onValueChange={(v) => setForm(p => ({ ...p, propertyType: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="residential">Residential</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
              <SelectItem value="multi-family">Multi-Family</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Sq Ft</Label><Input type="number" value={form.squareFootage} onChange={(e) => setForm(p => ({ ...p, squareFootage: e.target.value }))} /></div>
      </div>
      <div className="space-y-1.5"><Label>Gate Code</Label><Input value={form.gateCode} onChange={(e) => setForm(p => ({ ...p, gateCode: e.target.value }))} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm(p => ({ ...p, isPrimary: e.target.checked }))} /> Set as primary location</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending} data-testid="button-save-location">{mutation.isPending ? "Saving..." : "Add Location"}</Button></div>
    </form>
  );
}

function EditLocationDialog({
  customer,
  location,
  onClose,
}: {
  customer: Customer;
  location: Location;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isPrimaryLocation = location.isPrimary;
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
  const [confirmPrimaryOpen, setConfirmPrimaryOpen] = useState(false);

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

  const { data: locationCounts } = useQuery<{ contacts: number; appointments: number; services: number; invoices: number; communications: number }>({
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

  const setPrimaryMutation = useMutation({
    mutationFn: (locationId: string) => apiRequest("POST", `/api/locations/${locationId}/set-primary`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(`/api/customer-detail-compat/${customerId}`),
      });
    },
  });

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
                <span className="truncate max-w-[200px]">{activeLocation?.name || "Select Location"}</span>
                <Badge variant="secondary" className="text-xs ml-1">{allLocations?.length || 0}</Badge>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {allLocations?.map((loc) => (
                <DropdownMenuItem key={loc.id} onClick={() => selectLocation(loc.id)} className={`flex flex-col items-start gap-0.5 py-2 ${loc.id === activeLocationId ? "bg-accent" : ""}`} data-testid={`location-option-${loc.id}`}>
                  <div className="flex items-center gap-2 w-full">
                    {loc.id === activeLocationId ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
                    <span className="font-medium text-sm">{loc.name}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      {loc.isPrimary && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Primary</Badge>}
                      {loc.billingProfileId && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Billing Override</Badge>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{loc.city}, {loc.state}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" data-testid="button-add-location"><Plus className="h-3 w-3 mr-1" /> Add Location</Button></DialogTrigger>
            <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader><AddLocationDialog customerId={customerId} onClose={() => setLocDialogOpen(false)} /></DialogContent>
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
                      <EditLocationDialog customer={customer} location={activeLocation} onClose={() => setEditLocDialogOpen(false)} />
                    </DialogContent>
                  </Dialog>
                  {!activeLocation.isPrimary && (
                    <AlertDialog open={confirmPrimaryOpen} onOpenChange={setConfirmPrimaryOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid="button-set-primary">
                          <Star className="h-3 w-3 mr-1" /> Set Primary
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Set this as the primary location?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will make {activeLocation.name} the customer identity shown in the UI for this account. Account-level data will stay with the account.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => setPrimaryMutation.mutate(activeLocation.id)}
                            data-testid="button-confirm-set-primary"
                          >
                            Confirm
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
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
        <Tabs defaultValue="contacts">
          <TabsList className="flex-wrap">
            <TabsTrigger value="contacts" data-testid="tab-contacts"><User className="h-3 w-3 mr-1" /> Contacts ({locationCounts?.contacts ?? contacts?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="schedule" data-testid="tab-schedule"><Calendar className="h-3 w-3 mr-1" /> Schedule ({locationCounts?.appointments ?? 0})</TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services"><ClipboardList className="h-3 w-3 mr-1" /> Services ({locationCounts?.services ?? 0})</TabsTrigger>
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

          <TabsContent value="schedule" className="mt-4 space-y-3">
            {!locationAppts || locationAppts.length === 0 ? (
              <Card><CardContent className="text-center py-8"><Calendar className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No appointments for this location</p></CardContent></Card>
            ) : locationAppts.map((appt) => (
              <Card key={appt.id} data-testid={`card-appt-${appt.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{new Date(appt.scheduledDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                    {appt.notes && <p className="text-xs text-muted-foreground mt-0.5">{appt.notes}</p>}
                    {appt.assignedTo && <p className="text-xs text-muted-foreground">Tech: {appt.assignedTo}</p>}
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${appt.status === "completed" ? "bg-primary/10 text-primary" : appt.status === "scheduled" ? "bg-chart-2/10 text-chart-2" : ""}`}>{appt.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="services" className="mt-4 space-y-3">
            {!locationServices || locationServices.length === 0 ? (
              <Card><CardContent className="text-center py-8"><ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No service history for this location</p></CardContent></Card>
            ) : locationServices.map((svc) => (
              <Card key={svc.id} className="hover-elevate" data-testid={`card-service-${svc.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{new Date(svc.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                      {svc.technicianName && <p className="text-xs text-muted-foreground">Tech: {svc.technicianName}</p>}
                      {svc.areasServiced && <p className="text-xs text-muted-foreground mt-0.5">Areas: {svc.areasServiced}</p>}
                    </div>
                    {svc.confirmed && <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">Confirmed</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
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
                  {comm.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{comm.body}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
