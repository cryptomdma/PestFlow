// Pass 36 (PLAN_ROADMAP_V2.md C5.4; B23): the customer screen's URL shape in
// one place, for every name and address that links to it from another page.
//
// The routes (App.tsx) have no per-location or per-service path: a location is
// the customer screen with `?locationId=`, a tab is `&tab=`, and there is no
// `serviceId` deep link (decided against in Pass 36 - the Services tab is the
// closest a service name can point at). The invoice modal's `&invoiceId=`
// (Pass 11b) is the one other parameter the screen reads and is not built here.

import type { MouseEvent } from "react";

/** The tab values customer-detail.tsx reads from `?tab=` ("communications" is also accepted there as an alias of comms). */
export type CustomerScreenTab = "contacts" | "agreements" | "services" | "invoices" | "comms" | "opportunities" | "history";

/** `/customers/:id` - the customer (its primary location). */
export function customerPath(customerId: string): string {
  return `/customers/${customerId}`;
}

/** `/customers/:id?locationId=...&tab=...` - a location of the customer, optionally on a tab; no location id falls back to the customer. */
export function locationPath(customerId: string, locationId: string | null | undefined, tab?: CustomerScreenTab): string {
  const params = new URLSearchParams();
  if (locationId) params.set("locationId", locationId);
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return query ? `${customerPath(customerId)}?${query}` : customerPath(customerId);
}

/** For a link inside a clickable row or card: the link navigates, the row's own click does not fire. */
export function stopLinkPropagation(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation();
}
