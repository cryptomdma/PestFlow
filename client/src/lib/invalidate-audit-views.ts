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

// Pass 33 (C5.1b): after a Revert, the reverted entity's own reads - the
// customer screen's compat read and switcher for a customer or location, the
// contacts list, the billing profiles, the templates on Settings, the
// agreements tab - so the screen shows the put-back values without a reload.
// Keyed by the entity type the server answered with; each prefix matches the
// first element of the query keys those surfaces use.
const REVERTED_ENTITY_KEY_PREFIXES: Record<string, string[]> = {
  customer: ["/api/customer-detail-compat", "/api/customers", "/api/locations", "/api/location-balances"],
  location: ["/api/customer-detail-compat", "/api/locations", "/api/location-counts", "/api/technician-preferences"],
  contact: ["/api/contacts", "/api/location-counts"],
  billing_profile: ["/api/billing-profiles", "/api/accounts", "/api/locations", "/api/customer-detail-compat"],
  billing_profile_template: ["/api/billing-profile-templates"],
  agreement_template: ["/api/agreement-templates"],
  agreement: ["/api/agreements", "/api/location-counts", "/api/services", "/api/appointments"],
  // Pass 40 (C6.1): not revertable, listed for invalidatePaymentMethodViews
  // - the account's cards (the dialogs' block), the compat read (the chip)
  // and the resolved profile (the ticket header).
  payment_method: ["/api/accounts", "/api/customer-detail-compat", "/api/locations"],
};

// Pass 34 (C5.2): after a billing profile is created, edited or retired from
// the location dialogs - the same reads a billing-profile revert refreshes:
// the compat read (the chip, the badges), the account's profiles (the
// dialogs), the location's resolved profile (the fee dialog, the ticket
// header).
export function invalidateBillingProfileViews() {
  invalidateRevertedEntityViews("billing_profile");
}

// Pass 40 (C6.1): after a card is added, made the default or removed - the
// same reads a billing profile write refreshes, plus the account's cards.
export function invalidatePaymentMethodViews() {
  invalidateRevertedEntityViews("payment_method");
  invalidateAuditViews();
}

export function invalidateRevertedEntityViews(entityType: string) {
  const prefixes = REVERTED_ENTITY_KEY_PREFIXES[entityType] ?? [];
  if (!prefixes.length) return;
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = String(query.queryKey[0] ?? "");
      return prefixes.some((prefix) => key.startsWith(prefix));
    },
  });
}
