// PLAN_ROADMAP_V2.md C3.5 (Pass 22; B11): the service report - the
// customer-facing document of one Service Record (canon §12), rendered by
// server/documents/service-report-pdf.ts and stored like an invoice's PDF
// (`documents`, kind SERVICE_REPORT, one row per ticket). Shared because
// both sides need the same vocabulary: the routes name the file the way the
// client's Download names it, and the Settings page and storage read the
// one toggle the same way.
//
// The toggle (owner, 2026-09-19): the invoice and the service report stay
// separate documents; when "Attach service report to visit invoices" is on,
// a visit-anchored invoice's PDF ends with the report of every ticket on
// it. An invoice with no visit - agreement billing on a schedule, a manual
// fee or adjustment - has nothing to attach and appends nothing ("omit on
// null"). One app_settings row, the invoice_on_finalize shape.

export const ATTACH_SERVICE_REPORT_SETTING_KEY = "attach_service_report_to_invoices";

/** B11's default: off until the office turns it on. */
export const DEFAULT_ATTACH_SERVICE_REPORT = false;

/** The stored value as a boolean; no row, or an unrecognised value, reads as the default. */
export function normalizeAttachServiceReport(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") return false;
  return DEFAULT_ATTACH_SERVICE_REPORT;
}

/** The value as app_settings stores it. */
export function serializeAttachServiceReport(enabled: boolean): string {
  return enabled ? "true" : "false";
}

/**
 * A stored report's identity as GET /api/service-records/:id/report-info
 * answers it: the `documents` row without its bytes, plus the file name the
 * document route sends.
 */
export interface ServiceReportInfo {
  id: string;
  serviceRecordId: string;
  contentHash: string;
  mimeType: string;
  /** ISO instant the stored row was rendered. */
  createdAt: string;
  fileName: string;
}

/** The UTC day of a service date, the way every document in this repo prints a date. */
export function serviceReportDay(serviceDate: string | Date): string {
  const date = typeof serviceDate === "string" ? new Date(serviceDate) : serviceDate;
  return Number.isNaN(date.getTime()) ? "undated" : date.toISOString().slice(0, 10);
}

/** A location name as a file-name stem: lower-case, letters and digits, hyphens between words, at most 40 characters. */
export function fileNameSlug(text: string | null | undefined, fallback = "location"): string {
  const slug = (text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** `service-report-<service day>-<location>.pdf` - the document route's and the Download button's one name. */
export function serviceReportFileName(input: { serviceDate: string | Date; locationName?: string | null }): string {
  return `service-report-${serviceReportDay(input.serviceDate)}-${fileNameSlug(input.locationName)}.pdf`;
}
