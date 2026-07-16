// Pure rendering layer for server/documents/** - no DB access here. All
// data is assembled once by storage.ts's getInvoiceDocumentContext and
// passed in, so the renderers stay deterministic and easy to test: the
// same context always produces the same HTML string / PDF bytes.

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
  billToName: string;
  billToAddress: string | null;
  lineItems: InvoiceDocumentLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  branding: InvoiceDocumentBranding;
}
