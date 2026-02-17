import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Plus,
  Calendar,
  FileText,
  MessageSquare,
  ClipboardList,
  Building2,
  User,
  Edit,
} from "lucide-react";
import type { Customer, Contact, Location, Appointment, Invoice, ServiceRecord, Communication } from "@shared/schema";

function AddLocationDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", zip: "", propertyType: "residential", isPrimary: false, notes: "" });
  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/locations", { ...data, customerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", customerId] });
      toast({ title: "Location added" });
      onClose();
    },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5"><Label>Name</Label><Input data-testid="input-loc-name" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} /></div>
      <div className="space-y-1.5"><Label>Address</Label><Input data-testid="input-loc-address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>State</Label><Input value={form.state} onChange={(e) => setForm(p => ({ ...p, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>ZIP</Label><Input value={form.zip} onChange={(e) => setForm(p => ({ ...p, zip: e.target.value }))} /></div>
      </div>
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
      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} className="resize-none" /></div>
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

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const customerId = params?.id || "";
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  const { data: customer, isLoading } = useQuery<Customer>({ queryKey: ["/api/customers", customerId] });
  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts", customerId] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations", customerId] });
  const { data: appointments } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: invoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: services } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: comms } = useQuery<Communication[]>({ queryKey: ["/api/communications", customerId] });

  const customerAppts = appointments?.filter((a) => a.customerId === customerId) || [];
  const customerInvoices = invoices?.filter((i) => i.customerId === customerId) || [];
  const customerServices = services?.filter((s) => s.customerId === customerId) || [];
  const customerComms = comms || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
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
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/customers">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-customer-name">
              {customer.firstName} {customer.lastName}
            </h1>
            <Badge variant="secondary" className={customer.status === "active" ? "bg-primary/10 text-primary" : ""}>
              {customer.status}
            </Badge>
          </div>
          {customer.companyName && <p className="text-sm text-muted-foreground">{customer.companyName}</p>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-chart-2/10 flex items-center justify-center shrink-0"><Mail className="h-4 w-4 text-chart-2" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Email</p><p className="text-sm font-medium truncate">{customer.email || "Not set"}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><Phone className="h-4 w-4 text-primary" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm font-medium truncate">{customer.phone || "Not set"}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-chart-3/10 flex items-center justify-center shrink-0"><Building2 className="h-4 w-4 text-chart-3" /></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Type</p><p className="text-sm font-medium capitalize">{customer.customerType}</p></div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="locations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="locations" data-testid="tab-locations"><MapPin className="h-3 w-3 mr-1" /> Locations ({locations?.length || 0})</TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts"><User className="h-3 w-3 mr-1" /> Contacts ({contacts?.length || 0})</TabsTrigger>
          <TabsTrigger value="appointments" data-testid="tab-appointments"><Calendar className="h-3 w-3 mr-1" /> Schedule ({customerAppts.length})</TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services"><ClipboardList className="h-3 w-3 mr-1" /> Services ({customerServices.length})</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices"><FileText className="h-3 w-3 mr-1" /> Invoices ({customerInvoices.length})</TabsTrigger>
          <TabsTrigger value="comms" data-testid="tab-comms"><MessageSquare className="h-3 w-3 mr-1" /> Comms ({customerComms.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
              <DialogTrigger asChild><Button size="sm" data-testid="button-add-location"><Plus className="h-3 w-3 mr-1" /> Add Location</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader><AddLocationDialog customerId={customerId} onClose={() => setLocDialogOpen(false)} /></DialogContent>
            </Dialog>
          </div>
          {!locations || locations.length === 0 ? (
            <Card><CardContent className="text-center py-8"><MapPin className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No locations added yet</p></CardContent></Card>
          ) : locations.map((loc) => (
            <Card key={loc.id} data-testid={`card-location-${loc.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm">{loc.name}</span>{loc.isPrimary && <Badge variant="secondary" className="text-xs">Primary</Badge>}<Badge variant="outline" className="text-xs capitalize">{loc.propertyType}</Badge></div>
                    <p className="text-sm text-muted-foreground mt-1"><MapPin className="h-3 w-3 inline mr-1" />{loc.address}, {loc.city}, {loc.state} {loc.zip}</p>
                    {loc.squareFootage && <p className="text-xs text-muted-foreground mt-0.5">{loc.squareFootage.toLocaleString()} sq ft</p>}
                    {loc.notes && <p className="text-xs text-muted-foreground mt-1 italic">{loc.notes}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

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

        <TabsContent value="appointments" className="mt-4 space-y-3">
          {customerAppts.length === 0 ? (
            <Card><CardContent className="text-center py-8"><Calendar className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No appointments scheduled</p></CardContent></Card>
          ) : customerAppts.map((appt) => (
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
          {customerServices.length === 0 ? (
            <Card><CardContent className="text-center py-8"><ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No service history</p></CardContent></Card>
          ) : customerServices.map((svc) => (
            <Link key={svc.id} href={`/services/${svc.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-service-${svc.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{new Date(svc.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                      {svc.technicianName && <p className="text-xs text-muted-foreground">Tech: {svc.technicianName}</p>}
                      {svc.areasServiced && <p className="text-xs text-muted-foreground mt-0.5">Areas: {svc.areasServiced}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {svc.confirmed && <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">Confirmed</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-3">
          {customerInvoices.length === 0 ? (
            <Card><CardContent className="text-center py-8"><FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No invoices</p></CardContent></Card>
          ) : customerInvoices.map((inv) => (
            <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium">{inv.invoiceNumber}</p><p className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</p></div>
                <div className="flex items-center gap-2 shrink-0"><span className="text-sm font-semibold">${parseFloat(inv.totalAmount).toFixed(2)}</span><Badge variant="secondary" className={`text-xs ${inv.status === "paid" ? "bg-primary/10 text-primary" : inv.status === "overdue" ? "bg-destructive/10 text-destructive" : "bg-chart-3/10 text-chart-3"}`}>{inv.status}</Badge></div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="comms" className="mt-4 space-y-3">
          {customerComms.length === 0 ? (
            <Card><CardContent className="text-center py-8"><MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No communications</p></CardContent></Card>
          ) : customerComms.map((comm) => (
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

      {customer.notes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{customer.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
