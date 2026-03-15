import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  User,
  Users,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import type { Customer } from "@shared/schema";

function CustomerForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const sourceOptions = ["Google", "Youtube", "Referal", "Facebook"] as const;
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
    customerType: "residential",
    source: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const trimmedFirstName = data.firstName.trim();
      const trimmedLastName = data.lastName.trim();
      const trimmedCompanyName = data.customerType === "commercial" ? data.companyName.trim() : "";
      const trimmedEmail = data.email.trim();
      const trimmedPhone = data.phone.trim();
      const trimmedSource = data.source.trim();
      const trimmedAddress = data.address.trim();
      const trimmedCity = data.city.trim();
      const trimmedState = data.state.trim();
      const trimmedZip = data.zip.trim();

      const customerRes = await apiRequest("POST", "/api/customers/create-with-primary-location", {
        customer: {
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          companyName: trimmedCompanyName || null,
          email: trimmedEmail,
          phone: trimmedPhone,
          customerType: data.customerType,
          status: "active",
          notes: null,
        },
        location: {
          name: "Primary Location",
          address: trimmedAddress,
          city: trimmedCity,
          state: trimmedState,
          zip: trimmedZip,
          propertyType: data.customerType,
          source: trimmedSource,
        },
        initialContact: {
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          email: trimmedEmail,
          phone: trimmedPhone,
          role: "primary",
          isPrimary: true,
        },
      });

      return customerRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer created successfully" });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error creating customer", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isCommercial = formData.customerType === "commercial";

    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim() ||
      !formData.source.trim()
    ) {
      toast({ title: "First name, last name, email, phone, and source are required", variant: "destructive" });
      return;
    }

    if (!formData.address.trim() || !formData.city.trim() || !formData.state.trim() || !formData.zip.trim()) {
      toast({ title: "Address, city, state, and ZIP are required", variant: "destructive" });
      return;
    }

    if (isCommercial && !formData.companyName.trim()) {
      toast({ title: "Company name is required for commercial customers", variant: "destructive" });
      return;
    }

    createMutation.mutate(formData);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Primary location</h3>
        <p className="text-sm text-muted-foreground">
          Create one primary location and use the same core contact details for the customer identity.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Customer Type</Label>
          <Select value={formData.customerType} onValueChange={(v) => updateField("customerType", v)}>
            <SelectTrigger data-testid="select-customer-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="residential">Residential</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="source">Source *</Label>
          <Select value={formData.source} onValueChange={(v) => updateField("source", v)}>
            <SelectTrigger id="source" data-testid="select-source">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {formData.customerType === "commercial" && (
        <div className="space-y-1.5">
          <Label htmlFor="companyName">Company Name *</Label>
          <Input
            id="companyName"
            data-testid="input-company-name"
            value={formData.companyName}
            onChange={(e) => updateField("companyName", e.target.value)}
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First Name *</Label>
          <Input id="firstName" data-testid="input-first-name" value={formData.firstName} onChange={(e) => updateField("firstName", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input id="lastName" data-testid="input-last-name" value={formData.lastName} onChange={(e) => updateField("lastName", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email *</Label>
          <Input id="email" type="email" data-testid="input-email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone *</Label>
          <Input id="phone" data-testid="input-phone" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">Address *</Label>
        <Input
          id="address"
          data-testid="input-address"
          placeholder="Street address"
          autoComplete="street-address"
          value={formData.address}
          onChange={(e) => updateField("address", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
        <div className="space-y-1.5">
          <Label htmlFor="city">City *</Label>
          <Input id="city" data-testid="input-city" autoComplete="address-level2" value={formData.city} onChange={(e) => updateField("city", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State *</Label>
          <Input id="state" data-testid="input-state" autoComplete="address-level1" value={formData.state} onChange={(e) => updateField("state", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zip">ZIP *</Label>
          <Input id="zip" data-testid="input-zip" autoComplete="postal-code" value={formData.zip} onChange={(e) => updateField("zip", e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-customer">
          {createMutation.isPending ? "Creating..." : "Create Customer"}
        </Button>
      </div>
    </form>
  );
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const filtered = customers?.filter((c) => {
    const matchesSearch =
      `${c.firstName} ${c.lastName} ${c.companyName || ""} ${c.email || ""} ${c.phone || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesType = filterType === "all" || c.customerType === filterType;
    return matchesSearch && matchesType;
  }) || [];

  const statusVariant = (status: string) => {
    switch (status) {
      case "active": return "bg-primary/10 text-primary";
      case "inactive": return "bg-muted text-muted-foreground";
      case "prospect": return "bg-chart-2/10 text-chart-2";
      default: return "";
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "commercial": return <Building2 className="h-4 w-4" />;
      case "industrial": return <Building2 className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Customers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your customer database</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-customer">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Customer</DialogTitle>
            </DialogHeader>
            <CustomerForm onSuccess={() => {}} onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-customers"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="industrial">Industrial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No customers found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search ? "Try adjusting your search" : "Get started by adding your first customer"}
            </p>
            {!search && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-customer">
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-customer-${customer.id}`}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex items-center justify-center h-10 w-10 rounded-md bg-primary/10 shrink-0">
                    {typeIcon(customer.customerType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {customer.firstName} {customer.lastName}
                      </span>
                      {customer.companyName && (
                        <span className="text-xs text-muted-foreground">({customer.companyName})</span>
                      )}
                      <Badge variant="secondary" className={`text-xs ${statusVariant(customer.status)}`}>
                        {customer.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {customer.customerType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                      {customer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {customer.email}
                        </span>
                      )}
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {customer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
