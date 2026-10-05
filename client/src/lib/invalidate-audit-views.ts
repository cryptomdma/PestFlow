import { queryClient } from "@/lib/queryClient";

/**
 * Every query that reads audit_logs, whatever its key shape - the location
 * History tab's [`/api/audit-logs?locationId=${id}`] and the invoice modal's
 * [`/api/audit-logs?entityType=invoice&entityId=${id}`]. Both keys are one
 * string with the query in it, and the default staleTime is Infinity, so
 * `invalidateQueries({ queryKey: ["/api/audit-logs"] })` - which matches a key
 * element by element - never refreshed either: the History tab kept its first
 * read until a reload (Pass 32 found five such calls). Match on the string
 * itself, the way invalidateInvoiceViews does, and call this from every
 * mutation that writes an audit row.
 */
export function invalidateAuditViews() {
  queryClient.invalidateQueries({
    predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/api/audit-logs"),
  });
}
