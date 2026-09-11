// PLAN_BILLING_V1_1.md D2: what the finalization that COMPLETES a visit (every
// active Service on the appointment now has a finalized ticket) does about that
// visit's invoice. One org-level setting, read by finalizeServiceRecord() at
// the moment the visit completes; the outcome rides back on the finalize
// response so the reviewer's screen can act on it.
//
// Shared because both sides need the same vocabulary: the server decides, the
// Settings page offers the choice, and the review/location screens render the
// outcome. Keeping the three strings in one place is what stops them drifting.

export const INVOICE_ON_FINALIZE_MODES = ["PROMPT", "AUTO_DRAFT", "OFF"] as const;

export type InvoiceOnFinalizeMode = (typeof INVOICE_ON_FINALIZE_MODES)[number];

/** D2's stated default: ask the reviewer. */
export const DEFAULT_INVOICE_ON_FINALIZE_MODE: InvoiceOnFinalizeMode = "PROMPT";

/** The app_settings key. */
export const INVOICE_ON_FINALIZE_SETTING_KEY = "invoice_on_finalize";

export function normalizeInvoiceOnFinalizeMode(value: string | null | undefined): InvoiceOnFinalizeMode {
  return (INVOICE_ON_FINALIZE_MODES as readonly string[]).includes(value ?? "")
    ? (value as InvoiceOnFinalizeMode)
    : DEFAULT_INVOICE_ON_FINALIZE_MODE;
}

/**
 * One honest sentence per mode for the Settings select. Describes the code
 * that EXISTS: "send" today stamps sentAt - there is no email delivery yet.
 */
export function describeInvoiceOnFinalizeMode(mode: InvoiceOnFinalizeMode): { label: string; description: string } {
  switch (mode) {
    case "PROMPT":
      return {
        label: "Prompt the reviewer",
        description: "When the last ticket on a visit is finalized, ask: Generate, Generate & Send, or Later. Later leaves the visit on the ready-to-bill list.",
      };
    case "AUTO_DRAFT":
      return {
        label: "Create a draft automatically",
        description: "When the last ticket on a visit is finalized, a DRAFT invoice is created (or the existing draft kept). The office issues it from the Invoices screen.",
      };
    case "OFF":
      return {
        label: "Off",
        description: "Finalization changes nothing about invoicing. The visit waits on the ready-to-bill list for Generate or Batch Invoice.",
      };
  }
}

/**
 * What finalization did about the visit's invoice - null on the finalize
 * response when this ticket did not complete its visit (siblings still pending)
 * or the record has no appointment.
 *
 *  PROMPT            visit complete, setting PROMPT, nothing issued yet. `invoice`
 *                    is the DRAFT to adopt if one exists, else null. The client
 *                    asks Generate / Generate & Send / Later.
 *  DRAFTED           setting AUTO_DRAFT: `invoice` is the visit's DRAFT -
 *                    created now (`created` true) or already there.
 *  DRAFT_FAILED      setting AUTO_DRAFT, but drafting refused (`message` says
 *                    why - e.g. an agreement with no plan and no price). The
 *                    finalization itself stands.
 *  ALREADY_INVOICED  an issued invoice already covers the visit (a manager's
 *                    pre-finalization override, or a pre-D1 row). Nothing to do.
 *  OFF               setting OFF. `invoice` reports a DRAFT if one exists.
 */
export interface FinalizationInvoicingOutcome<TInvoice = unknown> {
  mode: InvoiceOnFinalizeMode;
  action: "PROMPT" | "DRAFTED" | "DRAFT_FAILED" | "ALREADY_INVOICED" | "OFF";
  appointmentId: string;
  invoice: TInvoice | null;
  created?: boolean;
  message?: string;
}
