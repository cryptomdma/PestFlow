// PLAN_ROADMAP_V2.md C5.4 (Pass 36; B23 "make all names/addresses hyperlinks"):
// the one customer labeler behind the names the dispatch board, the dispatch
// sheet and its Service Details dialog, the pending queue, Service Ticket
// Review and the Service History page print - and, since this pass, link.
//
// Three private copies of it had grown (schedule.tsx, service-ticket-review.tsx,
// batch-invoice-dialog.tsx - development rule 10), each with its own last-
// resort word, and the Service History page had a fourth inline that read the
// person's name only, so a commercial customer printed as " " there. The two
// pages this pass touched delegate here with their own fallback, so no wording
// moved; batch-invoice-dialog.tsx keeps its copy (not a C5.4 surface) and is
// noted in the pass record.
//
// Precedence: the person's name, else the company name, else the location's
// nickname, else the caller's fallback - a residential account has the person,
// a commercial one the company, and a row whose customer is not loaded yet
// still has its location.

export interface CustomerLabelSource {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}

export interface LocationLabelSource {
  name?: string | null;
  address?: string | null;
}

/** "Sarah Chen" | "Golden Gate Properties" | the location's nickname | fallback. */
export function describeCustomerLabel(
  customer: CustomerLabelSource | null | undefined,
  location?: LocationLabelSource | null,
  fallback = "Customer",
): string {
  const fullName = `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim();
  if (fullName) return fullName;
  if (customer?.companyName) return customer.companyName;
  if (location?.name) return location.name;
  return fallback;
}

/** "Nickname - 123 Main St" (either half alone when the other is missing) | fallback. */
export function describeLocationLabel(location: LocationLabelSource | null | undefined, fallback = "Location"): string {
  if (!location) return fallback;
  const parts = [location.name, location.address].filter(Boolean);
  return parts.length ? parts.join(" - ") : fallback;
}
