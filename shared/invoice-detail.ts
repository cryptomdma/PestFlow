// The invoice modal's one read (PLAN_ROADMAP_V2.md Part D, Pass 11a):
// GET /api/invoices/:id. The invoice row, its lines with what the ticket
// behind each one knows, and the customer / location / visit it belongs to.
// Assembled on the server (getInvoiceDetail in server/storage.ts) from the
// reads that already exist - getInvoiceLineItems, getAppointment - so the
// modal never re-derives a figure the invoice already froze. Everything the
// modal DOES to an invoice goes through the routes that already existed.

import type { Invoice, InvoiceLineItem } from "./schema";

export interface InvoiceDetailLine extends InvoiceLineItem {
  /** From the ticket behind the line, else the service it priced; null for an adjustment / initial charge / scheduled charge. */
  serviceTypeName: string | null;
  /** The ticket's service date. Null when no ticket stands behind the line (a draft line, a manual or schedule-driven invoice). */
  serviceDate: Date | string | null;
  /** OFFICE_REVIEW_PENDING | FLAGGED_FOR_REVIEW | FINALIZED | REOPENED; null when no ticket stands behind the line. */
  ticketStatus: string | null;
}

export interface InvoiceDetail {
  invoice: Invoice;
  lines: InvoiceDetailLine[];
  customer: { id: string; label: string };
  location: { id: string; name: string; address: string; city: string; state: string; zip: string } | null;
  /** The visit the invoice is anchored on (D1). Null for a manual, schedule-driven, initial-charge or ticket-anchored invoice. */
  appointment: { id: string; scheduledDate: Date | string; status: string; technicianLabel: string | null } | null;
}

/** A service on a visit whose ticket is not finalized. Mirrors UnfinalizedTicketRef (server/storage.ts) - the issue route's 409 list and the by-appointment read share it. */
export interface UnfinalizedTicketView {
  serviceId: string;
  serviceRecordId: string | null;
  /** OFFICE_REVIEW_PENDING | FLAGGED_FOR_REVIEW | REOPENED; null when no ticket has been posted for the service. */
  ticketStatus: string | null;
  description: string;
}

/**
 * GET /api/invoices/by-appointment/:id (Pass 11b): where one visit stands
 * with invoicing - the Service Ticket Review modal's invoice badge and its
 * Generate. The invoice is found through either anchor (D1): the appointment,
 * or a pre-D1 row anchored on one of the visit's tickets. A DRAFT is reported
 * (it holds the anchor, and Generate adopts it); a VOID one is not (the visit
 * is free to be invoiced again). `finalized` is generation's own condition -
 * every non-cancelled service on the visit has a billing-ready ticket - so
 * "finalized, no invoice" is exactly the visit the finalize prompt's Later
 * left on the ready-to-bill list.
 */
export interface AppointmentInvoiceStatus {
  appointmentId: string;
  invoice: Invoice | null;
  finalized: boolean;
  /** Empty when `finalized`. */
  unfinalizedTickets: UnfinalizedTicketView[];
}

const LINE_TYPE_LABELS: Record<string, string> = {
  SERVICE: "Service",
  // Visible-but-not-chargeable: the agreement's plan bills the work
  // (PLAN_BILLING_V1_1_EXECUTION.md §2.1). "Covered" is what the office says.
  AGREEMENT_COVERED: "Covered",
  INITIAL_CHARGE: "Initial charge",
  ADDON: "Add-on",
  SURCHARGE: "Surcharge",
  FEE: "Fee",
  DISCOUNT: "Discount",
  ADJUSTMENT: "Adjustment",
};

export function describeInvoiceLineType(lineType: string): string {
  return LINE_TYPE_LABELS[lineType] ?? humanize(lineType);
}

const TICKET_STATUS_LABELS: Record<string, string> = {
  OFFICE_REVIEW_PENDING: "Pending review",
  FLAGGED_FOR_REVIEW: "Flagged for review",
  FINALIZED: "Finalized",
  REOPENED: "Reopened",
};

export function describeTicketStatus(status: string): string {
  return TICKET_STATUS_LABELS[status] ?? humanize(status);
}

export type InvoiceOriginKind = "VISIT" | "TICKET" | "INITIAL_CHARGE" | "SCHEDULE" | "MANUAL" | "UNKNOWN";

/**
 * What the invoice is for, from its anchors and its lines - the modal's visit
 * block shows the appointment for a VISIT and says why there is none
 * otherwise. Anchors first (an invoice sets at most one, D1); then the line
 * vocabulary: an initial charge is an INITIAL_CHARGE line, a manual invoice
 * is one ADJUSTMENT line, and a schedule-driven invoice is the nightly run's
 * one SERVICE line. A row from before line items existed has none and is
 * reported as such rather than guessed.
 */
export function describeInvoiceOrigin(
  invoice: Pick<Invoice, "appointmentId" | "serviceRecordId">,
  lines: Array<Pick<InvoiceLineItem, "lineType">>,
): { kind: InvoiceOriginKind; label: string } {
  if (invoice.appointmentId) {
    return { kind: "VISIT", label: "Visit invoice" };
  }
  if (invoice.serviceRecordId) {
    return { kind: "TICKET", label: "One-off ticket - no appointment on record" };
  }
  if (lines.some((line) => line.lineType === "INITIAL_CHARGE")) {
    return { kind: "INITIAL_CHARGE", label: "Agreement initial charge - not tied to a visit" };
  }
  if (lines.length > 0 && lines.every((line) => line.lineType === "ADJUSTMENT")) {
    return { kind: "MANUAL", label: "Manual invoice - not tied to a visit" };
  }
  if (lines.length > 0) {
    return { kind: "SCHEDULE", label: "Billed by the agreement's schedule - not tied to a visit" };
  }
  return { kind: "UNKNOWN", label: "Not tied to a visit; this invoice predates line items" };
}

/**
 * Where the invoice's Bill To came from, decided at issue and frozen in the
 * snapshot (Pass 11c, canon §4 / §5: billing defaults flow from the primary
 * location / account context, with a location override):
 * - PROFILE: the resolved billing profile carried its own billingAddress.
 * - LOCATION_OVERRIDE: a location-level profile with no address of its own -
 *   the override says "bill this location", so its own address is the Bill To.
 * - PRIMARY_LOCATION: no profile, or an account-level profile with no address -
 *   the customer's primary location is the customer identity, and is billed.
 */
export type InvoiceBillToSource = "PROFILE" | "LOCATION_OVERRIDE" | "PRIMARY_LOCATION";

export const INVOICE_BILL_TO_SOURCES: readonly InvoiceBillToSource[] = ["PROFILE", "LOCATION_OVERRIDE", "PRIMARY_LOCATION"];

/** The `billTo` key of `invoices.billingProfileSnapshot` since Pass 11c. */
export interface InvoiceBillToSnapshot {
  name: string;
  address: string | null;
  source: InvoiceBillToSource;
}

/** The `serviceLocation` key of `invoices.billingProfileSnapshot` since Pass 11c: the invoice's location as it stood at issue. */
export interface InvoiceServiceLocationSnapshot {
  name: string;
  address: string | null;
}

/**
 * The frozen billing terms an invoice was issued under
 * (resolveInvoiceTermsForLocationTx). Null when none were snapshotted, which
 * since Pass 11c means a row from before the resolver always wrote one.
 * `billTo` / `serviceLocation` are null on a pre-11c snapshot (a profile
 * resolved, but the parties were not frozen); `profileId` is null when the
 * snapshot was written with no billing profile resolved.
 */
export interface BillingProfileSnapshotView {
  profileId: string | null;
  label: string | null;
  billingType: string | null;
  invoiceTerms: string | null;
  billingName: string | null;
  billingAddress: string | null;
  billTo: InvoiceBillToSnapshot | null;
  serviceLocation: InvoiceServiceLocationSnapshot | null;
}

export function readBillingProfileSnapshot(value: unknown): BillingProfileSnapshotView | null {
  if (!isRecord(value)) return null;
  return {
    profileId: asString(value.profileId),
    label: asString(value.label),
    billingType: asString(value.billingType),
    invoiceTerms: asString(value.invoiceTerms),
    billingName: asString(value.billingName),
    billingAddress: asString(value.billingAddress),
    billTo: readBillTo(value.billTo),
    serviceLocation: readServiceLocation(value.serviceLocation),
  };
}

function readBillTo(value: unknown): InvoiceBillToSnapshot | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name);
  const source = asString(value.source);
  if (!name || !source || !INVOICE_BILL_TO_SOURCES.includes(source as InvoiceBillToSource)) return null;
  return { name, address: asString(value.address), source: source as InvoiceBillToSource };
}

function readServiceLocation(value: unknown): InvoiceServiceLocationSnapshot | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name);
  if (!name) return null;
  return { name, address: asString(value.address) };
}

const BILL_TO_SOURCE_LABELS: Record<InvoiceBillToSource, string> = {
  PROFILE: "billing profile address",
  LOCATION_OVERRIDE: "this location's billing profile",
  PRIMARY_LOCATION: "primary location",
};

/** The parenthetical the modal prints after the Bill To: "(primary location)". */
export function describeBillToSource(source: InvoiceBillToSource): string {
  return BILL_TO_SOURCE_LABELS[source];
}

const INVOICE_TERMS_LABELS: Record<string, string> = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET_15: "Net 15",
  NET_30: "Net 30",
  NET_60: "Net 60",
};

export function describeInvoiceTerms(invoiceTerms: string | null | undefined): string | null {
  if (!invoiceTerms) return null;
  return INVOICE_TERMS_LABELS[invoiceTerms] ?? humanize(invoiceTerms);
}

/**
 * One line for the tax decision frozen on the invoice. The snapshot is
 * resolveTaxDecision's answer for a single chargeable line (TAX_RULE /
 * DEFAULT / EXEMPTION_CERTIFICATE / NO_ACTIVE_RATE), or one of the wrappers
 * buildVisitInvoiceLinesTx and createManualInvoice put around it: PER_LINE
 * (a multi-line visit, one decision per line under `lines`), AGREEMENT_COVERED
 * (a visit with nothing chargeable), MANUAL (the office typed the tax). Null
 * only for a row from before tax snapshots existed.
 */
export function describeTaxSnapshot(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const reason = asString(value.reason);
  const taxable = value.taxable === true;
  switch (reason) {
    case "EXEMPTION_CERTIFICATE": {
      const certificate = asString(value.certificateNumber);
      return certificate ? `Tax exempt - certificate ${certificate}` : "Tax exempt - exemption certificate on the account";
    }
    case "NO_ACTIVE_RATE":
      return "Taxable, but no tax rate was active when it was issued";
    case "TAX_RULE":
    case "DEFAULT": {
      if (!taxable) return "Not taxable under a tax rule";
      const rate = describeRate(value);
      return rate ? `${rate}${reason === "TAX_RULE" ? " by tax rule" : " (default rate)"}` : "Taxable";
    }
    case "AGREEMENT_COVERED":
      return "No tax - the visit is covered by the agreement";
    case "MANUAL":
      return taxable ? "Entered by the office - no tax rule was applied" : "No tax - entered by the office";
    case "PER_LINE": {
      const lines = Array.isArray(value.lines) ? value.lines : [];
      const decisions = Array.from(new Set(lines.map(describeTaxSnapshot).filter((line): line is string => !!line)));
      if (decisions.length === 0) return taxable ? "Decided per line" : "No tax";
      if (decisions.length === 1) return `${decisions[0]}, per line`;
      return `Decided per line: ${decisions.join("; ")}`;
    }
    default:
      return taxable ? "Taxable" : "Not taxable";
  }
}

function describeRate(snapshot: Record<string, unknown>): string | null {
  const rateName = asString(snapshot.rateName);
  const basisPoints = typeof snapshot.rateBasisPoints === "number" ? snapshot.rateBasisPoints : null;
  const jurisdiction = asString(snapshot.jurisdiction);
  const percent = basisPoints === null ? null : `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  const parts = [rateName, percent, jurisdiction ? `(${jurisdiction})` : null].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").trim().toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value;
}
