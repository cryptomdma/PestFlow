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
