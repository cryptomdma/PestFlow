import { queryClient } from "@/lib/queryClient";

/**
 * Every query that reads invoices, the ledger, or the audit trail, whatever
 * its key shape - "/api/invoices", ["/api/invoices/by-location", id],
 * "/api/invoices/ready-for-billing", "/api/audit-logs?locationId=...",
 * ["/api/payments/by-location", id], ["/api/locations", id, "ledger-summary"],
 * ["/api/location-balances", customerId], ["/api/agreements", id,
 * "initial-charge-invoice"], ["/api/appointments", id, "billing-summary"]
 * (D6's field figures - only that key, not every appointment list). A prefix
 * match on the first element would miss most of these, so match on the
 * string itself. Money moving changes every one of them
 * (PLAN_BILLING_V1_1.md D5), which is why there is one invalidation rather
 * than a list per call site.
 */
export function invalidateInvoiceViews() {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const head = String(query.queryKey[0] ?? "");
      return (
        (head.startsWith("/api/appointments") && query.queryKey.includes("billing-summary"))
        || head.startsWith("/api/invoices")
        || head.startsWith("/api/audit-logs")
        || head.startsWith("/api/payments")
        || head.startsWith("/api/credit-memos")
        || head.startsWith("/api/locations")
        || head.startsWith("/api/location-balances")
        || head.startsWith("/api/agreements")
      );
    },
  });
}
