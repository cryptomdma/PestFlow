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
import { apiRequest, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { can, PERMISSIONS } from "@shared/permissions";
import { selectableUsers, userDisplayName } from "@shared/users";
import {
  OPPORTUNITY_ASSIGNEE_ME,
  OPPORTUNITY_ASSIGNEE_UNASSIGNED,
  OPPORTUNITY_SOURCES,
  OPPORTUNITY_WORK_TYPES,
  describeOpportunitySource,
  describeOpportunityWorkType,
  type OpportunityWorkType,
} from "@shared/opportunities";
import { OpportunityDispositionDialog } from "@/components/opportunity-disposition-dialog";
import { OpportunityHistoryDialog } from "@/components/opportunity-history-dialog";
import { OpportunityConvertDialog } from "@/components/opportunity-convert-dialog";
import { OpportunityTaxonomyChips } from "@/components/opportunity-taxonomy-chips";
import { ChevronDown, ExternalLink, Target } from "lucide-react";
import type { Customer, Location, Opportunity, OpportunityCategory, OpportunityDisposition, Service, ServiceRecord, ServiceType, UserSummary } from "@shared/schema";

const STATUS_OPTIONS = ["OPEN", "CONTACTED", "CONVERTED", "DISMISSED"] as const;
const UNASSIGNED_VALUE = "UNASSIGNED";

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

// What the PATCH accepts from this screen (Pass 25): the two taxonomy axes
// and the assignee. Notes and dates are not edited here.
type OpportunityPatch = { categoryKey: string } | { workType: OpportunityWorkType } | { assignedUserId: string | null };

export default function Opportunities() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user: sessionUser } = useAuth();
  const canAssign = can(sessionUser?.role ?? "", PERMISSIONS.ASSIGN_OPPORTUNITY);
  const [status, setStatus] = useState("OPEN");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("ALL");
  // Pass 25 (C4.1): the taxonomy and search filters, all applied server-side.
  const [categoryKey, setCategoryKey] = useState("ALL");
  const [workType, setWorkType] = useState("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [zip, setZip] = useState("");
  const [locationText, setLocationText] = useState("");
  const [dispositionOpportunity, setDispositionOpportunity] = useState<Opportunity | null>(null);
  const [selectedDispositionId, setSelectedDispositionId] = useState<string | null>(null);
  const [historyOpportunity, setHistoryOpportunity] = useState<Opportunity | null>(null);
  const [convertOpportunity, setConvertOpportunity] = useState<Opportunity | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (dueFrom) params.set("dueFrom", dueFrom);
    if (dueTo) params.set("dueTo", dueTo);
    if (serviceTypeId !== "ALL") params.set("serviceTypeId", serviceTypeId);
    if (categoryKey !== "ALL") params.set("categoryKey", categoryKey);
    if (workType !== "ALL") params.set("workType", workType);
    if (assignee !== "ALL") params.set("assignee", assignee);
    if (source !== "ALL") params.set("source", source);
    if (zip.trim()) params.set("zip", zip.trim());
    if (locationText.trim()) params.set("location", locationText.trim());
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [assignee, categoryKey, dueFrom, dueTo, locationText, serviceTypeId, source, status, workType, zip]);

  const { data: opportunities, isLoading } = useQuery<Opportunity[]>({ queryKey: [`/api/opportunities${queryString}`] });
  const { data: dispositions } = useQuery<OpportunityDisposition[]>({ queryKey: ["/api/opportunity-dispositions"] });
  // Inactive categories included: a row may still carry a key the office
  // has since deactivated, and the filter has to be able to find it.
  const { data: categories } = useQuery<OpportunityCategory[]>({ queryKey: ["/api/opportunity-categories?includeInactive=true"] });
  const { data: users } = useQuery<UserSummary[]>({ queryKey: ["/api/users"] });
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
  // The assignee filter and the assign control list the same people: every
  // active user, alphabetical, with the session user first as "Me".
  const activeUsers = useMemo(() => selectableUsers(users ?? [], null), [users]);
  const otherActiveUsers = useMemo(() => activeUsers.filter((candidate) => candidate.id !== sessionUser?.id), [activeUsers, sessionUser?.id]);

  const invalidateOpportunities = () => {
    queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
    queryClient.invalidateQueries({ queryKey: ["/api/location-counts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/communications/by-location"] });
  };

  // Pass 25: category, work type and assignee changes go through the one
  // PATCH; the server validates the user / category and writes the audit
  // row, and the location's History tab reads it.
  const patchOpportunity = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: OpportunityPatch }) => {
      const response = await apiRequest("PATCH", `/api/opportunities/${id}`, patch);
      return response.json() as Promise<Opportunity>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/opportunities") });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities/by-location", updated.locationId] });
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/audit-logs") });
    },
    onError: (err: unknown) => toast({ title: "Opportunity not updated", description: getApiErrorMessage(err), variant: "destructive" }),
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

  // "My opportunities": what is assigned to the session user and still open.
  // The other filters stay as they are so it composes with a date range.
  const setMyOpportunities = () => {
    setAssignee(OPPORTUNITY_ASSIGNEE_ME);
    setStatus("OPEN");
  };

  const resetFilters = () => {
    setDueFrom("");
    setDueTo("");
    setServiceTypeId("ALL");
    setStatus("OPEN");
    setCategoryKey("ALL");
    setWorkType("ALL");
    setAssignee("ALL");
    setSource("ALL");
    setZip("");
    setLocationText("");
  };

  const rows = [...(opportunities ?? [])].sort((a, b) => actionableDate(a).localeCompare(actionableDate(b)));
  const activeDispositions = (dispositions ?? []).filter((item) => item.isActive && item.key !== "CONVERTED_TO_SERVICE");
  const myOpportunitiesActive = assignee === OPPORTUNITY_ASSIGNEE_ME && status === "OPEN";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opportunities</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Disposition-driven follow-up queue, searchable by category, work type, assignee, source and location.</p>
        </div>
        <Badge variant="secondary" className="text-sm">{rows.length} shown</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Queue Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="filter-opportunity-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryKey} onValueChange={setCategoryKey}>
              <SelectTrigger data-testid="filter-opportunity-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.key} value={category.key}>{category.label}{category.isActive ? "" : " (inactive)"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Work Type</Label>
            <Select value={workType} onValueChange={setWorkType}>
              <SelectTrigger data-testid="filter-opportunity-work-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Agreement and one-time</SelectItem>
                {OPPORTUNITY_WORK_TYPES.map((item) => <SelectItem key={item} value={item}>{describeOpportunityWorkType(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger data-testid="filter-opportunity-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Anyone</SelectItem>
                <SelectItem value={OPPORTUNITY_ASSIGNEE_ME}>Me{sessionUser ? ` (${userDisplayName(sessionUser)})` : ""}</SelectItem>
                <SelectItem value={OPPORTUNITY_ASSIGNEE_UNASSIGNED}>Unassigned</SelectItem>
                {otherActiveUsers.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{userDisplayName(candidate)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger data-testid="filter-opportunity-source"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sources</SelectItem>
                {OPPORTUNITY_SOURCES.map((item) => <SelectItem key={item} value={item}>{describeOpportunitySource(item)}</SelectItem>)}
              </SelectContent>
            </Select>
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
          <div className="space-y-1.5">
            <Label>Next Action From</Label>
            <Input type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Next Action To</Label>
            <Input type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Location or Customer</Label>
            <Input
              placeholder="Location name, address, city or customer name"
              value={locationText}
              onChange={(event) => setLocationText(event.target.value)}
              data-testid="filter-opportunity-location"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Zip Starts With</Label>
            <Input placeholder="e.g. 760" value={zip} onChange={(event) => setZip(event.target.value)} data-testid="filter-opportunity-zip" />
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("OVERDUE")}>Overdue</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("TODAY")}>Due Today</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("WEEK")}>This Week</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset("MONTH")}>This Month</Button>
            <Button type="button" variant={myOpportunitiesActive ? "default" : "outline"} size="sm" onClick={setMyOpportunities} data-testid="preset-my-opportunities">
              My Opportunities
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
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
            <p className="mt-1 text-sm text-muted-foreground">Adjust the status, category, assignee or next-action date range to inspect older or closed opportunities.</p>
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
            const isPatching = patchOpportunity.isPending && patchOpportunity.variables?.id === opportunity.id;
            // The assign control lists the session user first, then every
            // other active user, plus the current assignee even when inactive
            // so a row assigned to someone who has left still names them.
            const assignableUsers = selectableUsers(users ?? [], opportunity.assignedUserId).filter((candidate) => candidate.id !== sessionUser?.id);

            return (
              <Card key={opportunity.id} data-testid={`card-opportunity-${opportunity.id}`}>
                <CardContent className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{opportunity.opportunityType || serviceType?.name || "Opportunity"}</p>
                      <Badge variant={opportunity.status === "OPEN" ? "default" : "secondary"}>{opportunity.status}</Badge>
                    </div>
                    <OpportunityTaxonomyChips
                      className="mt-1.5"
                      opportunity={opportunity}
                      categories={categories}
                      users={users}
                      changeDisabled={isPatching}
                      onCategoryChange={(key) => {
                        if (key !== opportunity.categoryKey) patchOpportunity.mutate({ id: opportunity.id, patch: { categoryKey: key } });
                      }}
                      onWorkTypeChange={(nextWorkType) => {
                        if (nextWorkType !== opportunity.workType) patchOpportunity.mutate({ id: opportunity.id, patch: { workType: nextWorkType } });
                      }}
                    />
                    <p className="mt-1.5 text-sm text-muted-foreground">Next action {formatDateOnly(opportunity.nextActionDate || opportunity.dueDate)}</p>
                    <p className="text-xs text-muted-foreground">Original due {formatDateOnly(opportunity.dueDate)}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{customerLabel(customer)}</p>
                    <p className="text-muted-foreground">{location ? `${location.name} · ${location.address}` : "Unknown location"}</p>
                    {location?.zip ? <p className="text-xs text-muted-foreground">{[location.city, location.state, location.zip].filter(Boolean).join(", ")}</p> : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Service: {sourceServiceType?.name || "Service"}</p>
                    <p>{sourceRecord?.serviceDate ? formatDateOnly(String(sourceRecord.serviceDate)) : "Service date unknown"}</p>
                    {opportunity.lastDispositionLabel ? <p className="mt-1 text-xs">Last disposition: {opportunity.lastDispositionLabel}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    <Select
                      value={opportunity.assignedUserId || UNASSIGNED_VALUE}
                      disabled={!canAssign || isPatching}
                      onValueChange={(value) => {
                        const next = value === UNASSIGNED_VALUE ? null : value;
                        if (next !== (opportunity.assignedUserId ?? null)) patchOpportunity.mutate({ id: opportunity.id, patch: { assignedUserId: next } });
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-[190px] text-xs"
                        title={canAssign ? "Assign this opportunity" : "Assigning needs support, manager or admin"}
                        data-testid={`select-opportunity-assignee-${opportunity.id}`}
                      >
                        <SelectValue placeholder="Assign to" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                        {sessionUser ? <SelectItem value={sessionUser.id}>Me ({userDisplayName(sessionUser)})</SelectItem> : null}
                        {assignableUsers.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {userDisplayName(candidate)}{candidate.status === "active" ? "" : " (inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpportunity(opportunity)}>
                      View History
                    </Button>
                    <Button type="button" size="sm" disabled={isTerminal} onClick={() => setConvertOpportunity(opportunity)}>
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
      <OpportunityHistoryDialog
        open={!!historyOpportunity}
        onOpenChange={(open) => {
          if (!open) setHistoryOpportunity(null);
        }}
        opportunity={historyOpportunity}
      />
      <OpportunityConvertDialog
        open={!!convertOpportunity}
        onOpenChange={(open) => {
          if (!open) setConvertOpportunity(null);
        }}
        opportunity={convertOpportunity}
        customerLabel={customerLabel(convertOpportunity ? customerById.get(locationById.get(convertOpportunity.locationId)?.customerId || "") : undefined)}
        locationLabel={convertOpportunity ? `${locationById.get(convertOpportunity.locationId)?.name || "Location"} - ${locationById.get(convertOpportunity.locationId)?.address || ""}` : "Location"}
        opportunityTypeLabel={convertOpportunity ? (convertOpportunity.opportunityType || serviceTypeById.get(convertOpportunity.serviceTypeId || "")?.name || "Opportunity") : "Opportunity"}
        sourceServiceLabel={convertOpportunity ? (serviceById.get(convertOpportunity.sourceServiceId || "")?.serviceTypeId ? serviceTypeById.get(serviceById.get(convertOpportunity.sourceServiceId || "")!.serviceTypeId || "")?.name || "Service" : "Source service unavailable") : "Source service unavailable"}
        serviceTypeLabel={convertOpportunity ? (serviceTypeById.get(convertOpportunity.serviceTypeId || "")?.name || "Service") : "Service"}
        returnTo="/opportunities"
        onConverted={invalidateOpportunities}
      />
    </div>
  );
}
