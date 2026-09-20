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

/** The frozen billing terms an invoice was issued under (resolveInvoiceTermsForLocationTx). Null when none were resolved. */
export interface BillingProfileSnapshotView {
  label: string | null;
  billingType: string | null;
  invoiceTerms: string | null;
  billingName: string | null;
  billingAddress: string | null;
}

export function readBillingProfileSnapshot(value: unknown): BillingProfileSnapshotView | null {
  if (!isRecord(value)) return null;
  return {
    label: asString(value.label),
    billingType: asString(value.billingType),
    invoiceTerms: asString(value.invoiceTerms),
    billingName: asString(value.billingName),
    billingAddress: asString(value.billingAddress),
  };
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
