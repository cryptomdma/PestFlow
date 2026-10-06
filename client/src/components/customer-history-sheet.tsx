import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditLogEntryCard, useAuditLogRevert, type AuditLogEntry } from "@/components/audit-log-entry-card";
import { useAuth } from "@/hooks/use-auth";
import { can, PERMISSIONS } from "@shared/permissions";
import { AUDIT_LOG_MAX_LIMIT, describeAuditEntityType } from "@shared/audit";

// Pass 33 (PLAN_ROADMAP_V2.md C5.1b; D7, B21): the customer-level History -
// every change across the customer's locations and the account-level rows
// (the customer's own, the account-default billing profiles), newest first,
// each row naming the location it belongs to ("Account" otherwise). Opened
// from the customer screen's toolbar beside Statement (Pass 15's customer-wide
// precedent) as a sheet - the screen's tab list is location-scoped by canon
// (UI rule 3), so a customer-level tab has nowhere to sit; the per-location
// History tab stays as it is. Filters by location and by record type narrow
// the stream in place. Reads /api/audit-logs?customerId= at the read's
// maximum and says so when it got exactly that many (paging is a later
// pass). Revert on a row is the same control as on the location tab: shown
// to a manager+ (REVERT_HISTORY) on the rows the shared rule allows.

const ACCOUNT_FILTER = "account";
const ALL_FILTER = "all";

export function CustomerHistorySheet({
  open,
  onOpenChange,
  customerId,
  customerLabel,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerLabel: string;
  locations: Array<{ id: string; name: string }>;
}) {
  const { user } = useAuth();
  const canRevert = can(user?.role ?? "", PERMISSIONS.REVERT_HISTORY);
  const revert = useAuditLogRevert();
  const [locationFilter, setLocationFilter] = useState(ALL_FILTER);
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const { data: entries, isLoading, error } = useQuery<AuditLogEntry[]>({
    queryKey: [`/api/audit-logs?customerId=${customerId}&limit=${AUDIT_LOG_MAX_LIMIT}`],
    enabled: open && !!customerId,
  });

  const entityTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries ?? []) seen.add(entry.entityType);
    return Array.from(seen).sort((a, b) => describeAuditEntityType(a).localeCompare(describeAuditEntityType(b)));
  }, [entries]);

  const filtered = useMemo(() => {
    return (entries ?? []).filter((entry) => {
      if (locationFilter === ACCOUNT_FILTER && entry.locationId) return false;
      if (locationFilter !== ALL_FILTER && locationFilter !== ACCOUNT_FILTER && entry.locationId !== locationFilter) return false;
      if (typeFilter !== ALL_FILTER && entry.entityType !== typeFilter) return false;
      return true;
    });
  }, [entries, locationFilter, typeFilter]);

  const atLimit = (entries?.length ?? 0) >= AUDIT_LOG_MAX_LIMIT;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="sheet-customer-history">
        <SheetHeader className="pr-8">
          <SheetTitle>History</SheetTitle>
          <SheetDescription>
            Every recorded change for {customerLabel} across {locations.length === 1 ? "its location" : `${locations.length} locations`} and the account, newest first.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs" data-testid="select-history-location">
              <SelectValue placeholder="Every location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Every location</SelectItem>
              <SelectItem value={ACCOUNT_FILTER}>Account level</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-history-entity-type">
              <SelectValue placeholder="Every record type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Every record type</SelectItem>
              {entityTypes.map((entityType) => (
                <SelectItem key={entityType} value={entityType}>{describeAuditEntityType(entityType)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {entries?.length ? (
            <Badge variant="secondary" className="text-xs" data-testid="badge-history-count">
              {filtered.length === entries.length ? `${entries.length} changes` : `${filtered.length} of ${entries.length}`}
            </Badge>
          ) : null}
        </div>
        {atLimit ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="text-history-limit">
            Showing the latest {AUDIT_LOG_MAX_LIMIT} changes; older ones are kept but not listed here yet.
          </p>
        ) : null}

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3" data-testid="loading-customer-history">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <Card>
              <CardContent className="text-center py-8" data-testid="error-customer-history">
                <History className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-destructive">Unable to load history for this customer</p>
              </CardContent>
            </Card>
          ) : !entries || entries.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8" data-testid="empty-customer-history">
                <History className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No recorded changes for this customer yet</p>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8" data-testid="empty-customer-history-filtered">
                <p className="text-sm text-muted-foreground">No changes match these filters</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[70vh] pr-4">
              <div className="space-y-3">
                {filtered.map((entry) => (
                  <AuditLogEntryCard
                    key={entry.id}
                    entry={entry}
                    canRevert={canRevert}
                    onRevert={(row) => revert.mutate(row)}
                    revertPending={revert.isPending && revert.variables?.id === entry.id}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
