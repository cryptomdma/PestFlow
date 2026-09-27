// Pure rendering layer for server/documents/** - no DB access here. All
// data is assembled once by storage.ts's getInvoiceDocumentContext and
// passed in, so the renderers stay deterministic and easy to test: the
// same context always produces the same HTML string / PDF bytes.

import type { AccountStatement, LocationStatement, ZeroBalanceLetter } from "@shared/statements";

export interface InvoiceDocumentLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  taxable: boolean;
}

export interface InvoiceDocumentBranding {
  orgName: string;
  logoUrl: string | null;
  primaryColorHex: string | null;
  remitToName: string | null;
  remitToAddress: string | null;
  remitToEmail: string | null;
  remitToPhone: string | null;
}

export interface InvoiceDocumentContext {
  invoiceNumber: string;
  publicId: string;
  issueDate: string; // YYYY-MM-DD, derived from invoice.createdAt - immutable once issued
  dueDate: string | null;
  status: string;
  /** The party billed, frozen at issue (Pass 11c: `billingProfileSnapshot.billTo`) - the billing
   *  profile's address, else a location override's own, else the customer's primary location's. */
  billToName: string;
  billToAddress: string | null;
  /** Where the work was done - the invoice's location as frozen at issue. Null only for the
   *  location-less rows from before Pass 10; renderers omit the block then. */
  serviceLocation: { name: string; address: string | null } | null;
  lineItems: InvoiceDocumentLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** D5 rollups as of rendering. A document is stored on first render, so
   *  these are the figures at that moment - the ledger is the live truth. */
  amountPaidCents: number;
  balanceDueCents: number;
  /**
   * The visit was fully covered by the customer's service agreement and no
   * money moved (`isFullyAgreementCovered` in shared/invoice-status.ts).
   *
   * The invoice's stored status for such a row derives to PAID, which is
   * correct bookkeeping but the wrong story to print: the customer did not
   * settle a bill, their agreement absorbed the visit. Renderers show
   * "No Charge - Covered by Service Agreement" instead. Resolved once, here, so
   * every customer-facing document tells the same story without re-deriving it.
   */
  noChargeCoveredByAgreement: boolean;
  notes: string | null;
  branding: InvoiceDocumentBranding;
  /**
   * Pass 22 (C3.5; B11): the service reports appended after the invoice's own
   * pages when the office has "Attach service report to visit invoices" on -
   * one per distinct ticket among the invoice's lines, in line order, each
   * drawn by drawServiceReport() into the same document. Undefined (nothing
   * appended) for an invoice with no visit, and when the setting is off.
   */
  attachedServiceReports?: ServiceReportDocumentContext[];
}

// ---------------------------------------------------------------------------
// Statements (PLAN_ROADMAP_V2.md C2.5, Pass 15). The same pattern: storage
// assembles the context once (generateLocationStatement /
// generateAccountStatement / generateZeroBalanceLetter in storage.ts) from
// the ledger's rows through the pure summarizers in shared/statements.ts,
// and renderStatementPdf turns it into bytes. Nothing here is a live join:
// the figures are the ledger as it stood at generation, and the parties are
// resolved once, so a stored statement reproduces byte for byte.
// ---------------------------------------------------------------------------

/** A party as a statement prints it: a name and a one-line address. */
export interface StatementDocumentParty {
  name: string;
  address: string | null;
}

interface StatementDocumentBase {
  /** The UTC day the statement was generated - printed as the statement date, and what the PDF's dates are pinned to. */
  statementDate: string;
  /** The customer's display name (company first). */
  customerName: string;
  /** Who the statement is addressed to - the invoice's Bill To rule (Pass 11c): the billing profile's address, else a location override's own, else the primary location's. */
  billTo: StatementDocumentParty;
  branding: InvoiceDocumentBranding;
}

export type StatementDocumentContext =
  | (StatementDocumentBase & { variant: "LOCATION"; location: StatementDocumentParty; statement: LocationStatement })
  | (StatementDocumentBase & { variant: "ACCOUNT"; statement: AccountStatement })
  | (StatementDocumentBase & { variant: "ZERO_BALANCE_LETTER"; location: StatementDocumentParty; letter: ZeroBalanceLetter });

// ---------------------------------------------------------------------------
// Service report (PLAN_ROADMAP_V2.md C3.5, Pass 22; B11; canon §12). The same
// pattern once more: storage assembles the context from the ticket as it
// stands (getServiceReportDocumentContext / renderServiceReportPreview in
// storage.ts) and renderServiceReportPdf turns it into bytes. The technician
// name and license are the compliance snapshot copied onto the ticket at
// post, the target pests the stored union of the ticket's picks and every
// material's, the materials the product application rows in the org's
// vocabulary - nothing here is a live join to today's profiles or lists.
// ---------------------------------------------------------------------------

/** One product application row as the report prints it. */
export interface ServiceReportMaterialLine {
  productName: string;
  epaRegNumber: string | null;
  amountApplied: string | null;
  unit: string | null;
  dilutionLabel: string | null;
  dilutionRate: string | null;
  applicationMethod: string | null;
  device: string | null;
  applicationAreas: string[];
  targetPests: string[];
}

export interface ServiceReportDocumentContext {
  /** The UTC day of the service (YYYY-MM-DD) - printed, and what the PDF's dates are pinned to. */
  serviceDate: string;
  /** True for the render-only preview of an unposted ticket: the header says so and nothing is stored. */
  preview: boolean;
  /** The customer's display name (company first). */
  customerName: string;
  /** Where the work was done, as every document prints a location. Null only for a ticket with no location. */
  serviceLocation: { name: string; address: string | null } | null;
  serviceTypeName: string | null;
  /** The compliance snapshot (canon §12): copied onto the ticket at post, never today's profile. */
  technicianName: string | null;
  technicianLicenseNumber: string | null;
  /** The ticket's stored set: its picks plus every material's pests (Pass 21). */
  targetPests: string[];
  /** Derived from the materials' areas (Pass 20), else the ticket's own text. */
  areasServiced: string | null;
  materials: ServiceReportMaterialLine[];
  notes: string | null;
  conditionsFound: string | null;
  recommendations: string | null;
  followUpRequired: boolean;
  followUpNotes: string | null;
  /** Whether the ticket records a customer signature; the report prints a signature line either way and says which. */
  customerSignature: boolean;
  /** Pass 23 (C3.6): the field surcharge recorded on the ticket - amount and label - or null when none. Printed in the Service section. */
  surchargeCents: number | null;
  surchargeLabel: string | null;
  branding: InvoiceDocumentBranding;
}
