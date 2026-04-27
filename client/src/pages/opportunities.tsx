import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { OpportunityDispositionDialog } from "@/components/opportunity-disposition-dialog";
import { ChevronDown, ExternalLink, Target } from "lucide-react";
import type { Customer, Location, Opportunity, OpportunityDisposition, Service, ServiceRecord, ServiceType } from "@shared/schema";

const STATUS_OPTIONS = ["OPEN", "CONTACTED", "CONVERTED", "DISMISSED"] as const;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysDateString(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthEndDateString() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function formatDateOnly(value?: string | null) {
  if (!value) return "Not set";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function customerLabel(customer?: Customer) {
  if (!customer) return "Unknown customer";
  return customer.companyName || `${customer.firstName} ${customer.lastName}`.trim();
}

function actionableDate(opportunity: Opportunity) {
  return opportunity.nextActionDate || opportunity.dueDate;
}

export default function Opportunities() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState("OPEN");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("ALL");
  const [dispositionOpportunity, setDispositionOpportunity] = useState<Opportunity | null>(null);
  const [selectedDispositionId, setSelectedDispositionId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (dueFrom) params.set("dueFrom", dueFrom);
    if (dueTo) params.set("dueTo", dueTo);
    if (serviceTypeId !== "ALL") params.set("serviceTypeId", serviceTypeId);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [dueFrom, dueTo, serviceTypeId, status]);

  const { data: opportunities, isLoading } = useQuery<Opportunity[]>({ queryKey: [`/api/opportunities${queryString}`] });
  const { data: dispositions } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/all-locations"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: serviceTypes } = useQuery<ServiceType[]>({ queryKey: ["/api/service-types"] });
  const { data: services } = useQuery<Service[]>({ queryKey: ["/api/services"] });
  const { data: serviceRecords } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });

  const locationById = useMemo(() => new Map((locations ?? []).map((location) => [location.id, location])), [locations]);
  const customerById = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer])), [customers]);
  const serviceTypeById = useMemo(() => new Map((serviceTypes ?? []).map((serviceType) => [serviceType.id, serviceType])), [serviceTypes]);
  const serviceById = useMemo(() => new Map((services ?? []).map((service) => [service.id, service])), [services]);
  const serviceRecordById = useMemo(() => new Map((serviceRecords ?? []).map((record) => [record.id, record])), [serviceRecords]);

  const invalidateOpportunities = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
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

  const setPreset = (preset: "OVERDUE" | "TODAY" | "WEEK" | "MONTH") => {
    const today = todayDateString();
    if (preset === "OVERDUE") {
      setDueFrom("");
      setDueTo(today);
    } else if (preset === "TODAY") {
      setDueFrom(today);
      setDueTo(today);
    } else if (preset === "WEEK") {
      setDueFrom(today);
      setDueTo(addDaysDateString(7));
    } else {
      setDueFrom(today);
      setDueTo(monthEndDateString());
    }
  };

  const rows = [...(opportunities ?? [])].sort((a, b) => actionableDate(a).localeCompare(actionableDate(b)));
  const activeDispositions = (dispositions ?? []).filter((item) => item.isActive && item.key !== "CONVERTED_TO_SERVICE");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opportunities</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Disposition-driven callback queue for non-agreement follow-up work.</p>
        </div>
        <Badge variant="secondary" className="text-sm">{rows.length} shown</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Queue Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.25fr]">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Next Action From</Label>
            <Input type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Next Action To</Label>
            <Input type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Service Type</Label>
            <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All service types</SelectItem>
                {(serviceTypes ?? []).map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("OVERDUE")}>Overdue</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("TODAY")}>Due Today</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("WEEK")}>This Week</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("MONTH")}>This Month</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setDueFrom(""); setDueTo(""); setServiceTypeId("ALL"); setStatus("OPEN"); }}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <h3 className="font-semibold">No opportunities match these filters</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adjust the status or next-action date range to inspect older or closed opportunities.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((opportunity) => {
            const location = locationById.get(opportunity.locationId);
            const customer = location ? customerById.get(location.customerId) : undefined;
            const serviceType = opportunity.serviceTypeId ? serviceTypeById.get(opportunity.serviceTypeId) : undefined;
            const sourceService = opportunity.sourceServiceId ? serviceById.get(opportunity.sourceServiceId) : undefined;
            const sourceRecord = opportunity.sourceServiceRecordId ? serviceRecordById.get(opportunity.sourceServiceRecordId) : undefined;
            const sourceServiceType = sourceService?.serviceTypeId ? serviceTypeById.get(sourceService.serviceTypeId) : serviceType;
            const isTerminal = opportunity.status === "CONVERTED" || opportunity.status === "DISMISSED";

            return (
              <Card key={opportunity.id}>
                <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_1fr_1fr_1.2fr] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{opportunity.opportunityType || serviceType?.name || "Opportunity"}</p>
                      <Badge variant={opportunity.status === "OPEN" ? "default" : "secondary"}>{opportunity.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Next action {formatDateOnly(opportunity.nextActionDate || opportunity.dueDate)}</p>
                    <p className="text-xs text-muted-foreground">Original due {formatDateOnly(opportunity.dueDate)}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{customerLabel(customer)}</p>
                    <p className="text-muted-foreground">{location ? `${location.name} · ${location.address}` : "Unknown location"}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Source: {sourceServiceType?.name || "Service"}</p>
                    <p>{sourceRecord?.serviceDate ? formatDateOnly(String(sourceRecord.serviceDate)) : "Source date unknown"}</p>
                    {opportunity.lastDispositionLabel ? <p className="mt-1 text-xs">Last disposition: {opportunity.lastDispositionLabel}</p> : null}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    {location && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setLocation(`/customers/${location.customerId}?locationId=${location.id}&tab=opportunities`)}>
                        <ExternalLink className="mr-1 h-3 w-3" /> Open Location
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" disabled={isTerminal || !activeDispositions.length}>
                          Disposition <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {activeDispositions.map((disposition) => (
                          <DropdownMenuItem
                            key={disposition.id}
                            onClick={() => {
                              setDispositionOpportunity(opportunity);
                              setSelectedDispositionId(disposition.id);
                            }}
                          >
                            {disposition.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button type="button" size="sm" disabled={isTerminal || convertMutation.isPending} onClick={() => convertMutation.mutate(opportunity.id)}>
                      Convert to Service
                    </Button>
                  </div>
                  {opportunity.notes ? <p className="text-sm text-muted-foreground lg:col-span-4">{opportunity.notes}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <OpportunityDispositionDialog
        open={!!dispositionOpportunity && !!selectedDispositionId}
        onOpenChange={(open) => {
          if (!open) {
            setDispositionOpportunity(null);
            setSelectedDispositionId(null);
          }
        }}
        opportunity={dispositionOpportunity}
        dispositionId={selectedDispositionId}
      />
    </div>
  );
}
