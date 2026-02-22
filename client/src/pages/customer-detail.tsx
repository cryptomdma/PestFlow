import { useState, useEffect, useMemo } from "react";
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
import {
  ArrowLeft, Mail, Phone, MapPin, Plus, Calendar, FileText, MessageSquare,
  ClipboardList, Building2, User, ChevronDown, Pin, ArrowUpRight, StickyNote,
  CreditCard, Star, KeyRound, Ruler, ChevronUp, MoreHorizontal,
} from "lucide-react";
import type { Customer, Contact, Location, Appointment, Invoice, ServiceRecord, Communication, CustomerNote, BillingProfile } from "@shared/schema";

function AddLocationDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", zip: "", propertyType: "residential", isPrimary: false, gateCode: "", squareFootage: "", notes: "" });
  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/locations", { ...data, customerId, squareFootage: data.squareFootage ? parseInt(data.squareFootage) : null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", customerId] });
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
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} className="resize-none" rows={2} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm(p => ({ ...p, isPrimary: e.target.checked }))} /> Set as primary location</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending} data-testid="button-save-location">{mutation.isPending ? "Saving..." : "Add Location"}</Button></div>
    </form>
  );
}

function AddContactDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "", isPrimary: false });
  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/contacts", { ...data, customerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", customerId] });
      toast({ title: "Contact added" });
      onClose();
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
      <div className="space-y-1.5"><Label>Role</Label><Input placeholder="e.g., Property Manager" value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending} data-testid="button-save-contact">{mutation.isPending ? "Saving..." : "Add Contact"}</Button></div>
    </form>
  );
}

function AddNoteDialog({ customerId, locationId, scope, onClose }: { customerId: string; locationId?: string; scope: "CUSTOMER" | "LOCATION"; onClose: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/notes", data),
    onSuccess: () => {
      if (scope === "CUSTOMER") {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/shared", customerId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/notes/location", locationId] });
      }
      toast({ title: "Note added" });
      onClose();
    },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ body, scope, customerId: scope === "CUSTOMER" ? customerId : null, locationId: scope === "LOCATION" ? locationId : null, createdBy: "Admin" }); }} className="space-y-4">
      <Textarea data-testid="input-note-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a note..." className="resize-none" rows={4} />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || !body.trim()} data-testid="button-save-note">{mutation.isPending ? "Saving..." : scope === "CUSTOMER" ? "Add Shared Note" : "Add Location Note"}</Button></div>
    </form>
  );
}

function NoteCard({ note, customerId, activeLocationId, showConvertAction }: { note: CustomerNote; customerId: string; activeLocationId?: string; showConvertAction?: "makeShared" | "makeLocation" }) {
  const { toast } = useToast();
  const convertMutation = useMutation({
    mutationFn: () => {
      if (showConvertAction === "makeShared") {
        return apiRequest("PATCH", `/api/notes/${note.id}/convert-scope`, { scope: "CUSTOMER", customerId, locationId: null });
      } else {
        return apiRequest("PATCH", `/api/notes/${note.id}/convert-scope`, { scope: "LOCATION", customerId: null, locationId: activeLocationId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes/shared", customerId] });
      if (activeLocationId) queryClient.invalidateQueries({ queryKey: ["/api/notes/location", activeLocationId] });
      toast({ title: showConvertAction === "makeShared" ? "Note moved to shared" : "Note moved to location" });
    },
  });
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card" data-testid={`note-${note.id}`}>
      {note.pinned && <Pin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">{note.body}</p>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          {note.createdBy && <span>{note.createdBy}</span>}
          <span>{new Date(note.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      {showConvertAction && (
        <Button variant="ghost" size="sm" className="shrink-0 text-xs h-7" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending} data-testid={`button-convert-note-${note.id}`}>
          {showConvertAction === "makeShared" ? "Make Shared" : "Make Location"}
        </Button>
      )}
    </div>
  );
}

function CustomerNotesPanel({ customerId, activeLocationId }: { customerId: string; activeLocationId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { data: sharedNotes } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/shared", customerId] });
  const sortedNotes = useMemo(() => {
    if (!sharedNotes) return [];
    return [...sharedNotes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sharedNotes]);
  const preview = sortedNotes.slice(0, expanded ? sortedNotes.length : 1);
  if (!sharedNotes || sharedNotes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" /> Customer Notes</CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-add-shared-note"><Plus className="h-3 w-3 mr-1" /> Add Shared Note</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Add Shared Note</DialogTitle></DialogHeader><AddNoteDialog customerId={customerId} scope="CUSTOMER" onClose={() => setAddOpen(false)} /></DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground text-center py-2">No shared notes</p></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" /> Customer Notes <Badge variant="secondary" className="text-xs ml-1">{sharedNotes.length}</Badge></CardTitle>
        <div className="flex items-center gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-add-shared-note"><Plus className="h-3 w-3 mr-1" /> Add Shared Note</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Add Shared Note</DialogTitle></DialogHeader><AddNoteDialog customerId={customerId} scope="CUSTOMER" onClose={() => setAddOpen(false)} /></DialogContent>
          </Dialog>
          {sharedNotes.length > 1 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(!expanded)} data-testid="button-expand-notes">
              {expanded ? <><ChevronUp className="h-3 w-3 mr-1" /> Collapse</> : <><ChevronDown className="h-3 w-3 mr-1" /> Show All</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {preview.map((note) => (
          <NoteCard key={note.id} note={note} customerId={customerId} activeLocationId={activeLocationId} showConvertAction={activeLocationId ? "makeLocation" : undefined} />
        ))}
      </CardContent>
    </Card>
  );
}

function LocationNotesPanel({ customerId, locationId }: { customerId: string; locationId: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: locationNotes } = useQuery<CustomerNote[]>({ queryKey: ["/api/notes/location", locationId] });
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" /> Location Notes {locationNotes && locationNotes.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{locationNotes.length}</Badge>}</CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button variant="outline" size="sm" className="h-7 text-xs" data-testid="button-add-location-note"><Plus className="h-3 w-3 mr-1" /> Add Location Note</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Add Location Note</DialogTitle></DialogHeader><AddNoteDialog customerId={customerId} locationId={locationId} scope="LOCATION" onClose={() => setAddOpen(false)} /></DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {!locationNotes || locationNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">No location-specific notes</p>
        ) : locationNotes.map((note) => (
          <NoteCard key={note.id} note={note} customerId={customerId} activeLocationId={locationId} showConvertAction="makeShared" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id || "";
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  const urlLocationId = searchParams.get("locationId");

  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  const { data: customer, isLoading } = useQuery<Customer>({ queryKey: ["/api/customers", customerId] });
  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts", customerId] });
  const { data: allLocations } = useQuery<Location[]>({ queryKey: ["/api/locations", customerId] });

  const primaryLocation = allLocations?.find((l) => l.isPrimary);
  const activeLocationId = urlLocationId || primaryLocation?.id || allLocations?.[0]?.id || "";
  const activeLocation = allLocations?.find((l) => l.id === activeLocationId);

  const hasBillingOverride = allLocations?.some((l) => l.billingProfileId) || false;

  const { data: locationCounts } = useQuery<{ appointments: number; services: number; invoices: number; communications: number }>({
    queryKey: ["/api/location-counts", activeLocationId],
    enabled: !!activeLocationId,
  });

  const { data: locationAppts } = useQuery<Appointment[]>({ queryKey: ["/api/appointments/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationServices } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationInvoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices/by-location", activeLocationId], enabled: !!activeLocationId });
  const { data: locationComms } = useQuery<Communication[]>({ queryKey: ["/api/communications/by-location", activeLocationId], enabled: !!activeLocationId });

  const setPrimaryMutation = useMutation({
    mutationFn: (locationId: string) => apiRequest("POST", `/api/locations/${locationId}/set-primary`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", customerId] });
    },
  });

  function selectLocation(locId: string) {
    setLocation(`/customers/${customerId}?locationId=${locId}`);
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
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* A) Brief Customer Header */}
      <div className="flex items-start gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon" data-testid="button-back" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-customer-name">
              {customer.firstName} {customer.lastName}
            </h1>
            <Badge variant="secondary" className={customer.status === "active" ? "bg-primary/10 text-primary" : ""} data-testid="badge-customer-status">
              {customer.status}
            </Badge>
          </div>
          {customer.companyName && <p className="text-sm text-muted-foreground">{customer.companyName}</p>}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> <span data-testid="text-customer-email">{customer.email || "No email"}</span></div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> <span data-testid="text-customer-phone">{customer.phone || "No phone"}</span></div>
            <Badge variant="outline" className="text-xs capitalize" data-testid="badge-customer-type">{customer.customerType}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
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
      </div>

      {/* B) Customer Notes Panel (collapsible) */}
      <CustomerNotesPanel customerId={customerId} activeLocationId={activeLocationId} />

      {/* C) Location Selector + Tabs */}
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
                <DropdownMenuItem key={loc.id} onClick={() => selectLocation(loc.id)} className="flex flex-col items-start gap-0.5 py-2" data-testid={`location-option-${loc.id}`}>
                  <div className="flex items-center gap-2 w-full">
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
                  {!activeLocation.isPrimary && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPrimaryMutation.mutate(activeLocation.id)} data-testid="button-set-primary">
                      <Star className="h-3 w-3 mr-1" /> Set Primary
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" /><span>{activeLocation.address}, {activeLocation.city}, {activeLocation.state} {activeLocation.zip}</span></div>
                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <span className="capitalize flex items-center gap-1"><Building2 className="h-3 w-3" /> {activeLocation.propertyType}</span>
                  {activeLocation.squareFootage && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" /> {activeLocation.squareFootage.toLocaleString()} sq ft</span>}
                  {activeLocation.gateCode && <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> Gate: {activeLocation.gateCode}</span>}
                </div>
                {activeLocation.notes && <p className="text-xs text-muted-foreground italic border-t pt-2 mt-2">{activeLocation.notes}</p>}
              </CardContent>
            </Card>

            <LocationNotesPanel customerId={customerId} locationId={activeLocationId} />
          </div>
        )}

        {/* D) Location-scoped tabs */}
        <Tabs defaultValue="contacts">
          <TabsList className="flex-wrap">
            <TabsTrigger value="contacts" data-testid="tab-contacts"><User className="h-3 w-3 mr-1" /> Contacts ({contacts?.length || 0})</TabsTrigger>
            <TabsTrigger value="schedule" data-testid="tab-schedule"><Calendar className="h-3 w-3 mr-1" /> Schedule ({locationCounts?.appointments ?? 0})</TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services"><ClipboardList className="h-3 w-3 mr-1" /> Services ({locationCounts?.services ?? 0})</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices"><FileText className="h-3 w-3 mr-1" /> Invoices ({locationCounts?.invoices ?? 0})</TabsTrigger>
            <TabsTrigger value="comms" data-testid="tab-comms"><MessageSquare className="h-3 w-3 mr-1" /> Comms ({locationCounts?.communications ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
                <DialogTrigger asChild><Button size="sm" data-testid="button-add-contact"><Plus className="h-3 w-3 mr-1" /> Add Contact</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader><AddContactDialog customerId={customerId} onClose={() => setContactDialogOpen(false)} /></DialogContent>
              </Dialog>
            </div>
            {!contacts || contacts.length === 0 ? (
              <Card><CardContent className="text-center py-8"><User className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No contacts added yet</p></CardContent></Card>
            ) : contacts.map((ct) => (
              <Card key={ct.id} data-testid={`card-contact-${ct.id}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><User className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm">{ct.firstName} {ct.lastName}</span>{ct.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}{ct.role && <span className="text-xs text-muted-foreground">{ct.role}</span>}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {ct.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{ct.email}</span>}
                      {ct.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{ct.phone}</span>}
                    </div>
                  </div>
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
              <Link key={svc.id} href={`/services/${svc.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-service-${svc.id}`}>
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
              </Link>
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
