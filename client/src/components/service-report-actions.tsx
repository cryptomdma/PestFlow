import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { serviceReportFileName } from "@shared/service-report";
import type { ServiceRecord } from "@shared/schema";
import { Download, FileText } from "lucide-react";

// The service report of a posted ticket (PLAN_ROADMAP_V2.md C3.5, Pass 22) -
// the StatementDocumentActions pattern (Pass 15): Open shows the PDF in a new
// tab (GET /api/service-records/:id/report answers inline, rendering and
// storing it on the first request), Download asks the same route for an
// attachment named the way the route names it. No Mark Sent and no Email:
// the report carries no sent stamp and no delivery exists until C6.3, so the
// office delivers the PDF itself.

export function serviceReportUrl(record: Pick<ServiceRecord, "id">, download = false): string {
  return `/api/service-records/${record.id}/report${download ? "?download=1" : ""}`;
}

function downloadServiceReport(record: Pick<ServiceRecord, "id" | "serviceDate">, locationName: string | null) {
  const anchor = document.createElement("a");
  anchor.href = serviceReportUrl(record, true);
  anchor.download = serviceReportFileName({ serviceDate: record.serviceDate, locationName });
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function ServiceReportActions({
  record,
  locationName = null,
  compact = false,
}: {
  record: Pick<ServiceRecord, "id" | "serviceDate">;
  /** Names the downloaded file (service-report-<date>-<location>.pdf); the route names it the same way when this is unknown. */
  locationName?: string | null;
  compact?: boolean;
}) {
  const sizeClass = compact ? "h-6 px-2 text-xs" : undefined;
  const iconClass = compact ? "h-3 w-3" : "h-3 w-3 mr-1";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={sizeClass}
        onClick={() => window.open(serviceReportUrl(record), "_blank", "noopener")}
        title="Open the service report PDF in a new tab - the customer-facing summary of this ticket"
        data-testid={`button-open-service-report-${record.id}`}
      >
        <FileText className={iconClass} /> {compact ? "" : "Service Report"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={compact ? "h-6 w-6 p-0" : "h-8 w-8 p-0"}
        onClick={() => downloadServiceReport(record, locationName)}
        title="Download the service report PDF"
        aria-label="Download the service report PDF"
        data-testid={`button-download-service-report-${record.id}`}
      >
        <Download className="h-3 w-3" />
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// The preview of an UNPOSTED ticket (the collect step's "Preview report"):
// POST /api/service-records/preview-report takes the post's content shape
// plus the service, answers the PDF and stores nothing. A fetch cannot open
// a tab: the caller opens the window on the click itself (a browser's popup
// rule wants the gesture), and the PDF is navigated into it when the render
// answers. A blocked window falls back to a download of the same bytes.
// ---------------------------------------------------------------------------

export interface ServiceReportPreviewBody {
  serviceId: string;
  appointmentId?: string | null;
  technicianId?: string | null;
  /** The ticket's service date as the post sends it (a datetime-local string or an ISO instant). */
  serviceDate: string;
  serviceTypeId?: string | null;
  notes?: string | null;
  targetPests?: string[] | null;
  areasServiced?: string | null;
  conditionsFound?: string | null;
  recommendations?: string | null;
  followUpRequired?: boolean | null;
  followUpNotes?: string | null;
  customerSignature?: boolean | null;
  productApplications?: unknown[];
}

/** Opens the tab the preview will land in. Call it in the click handler, before any await. */
export function openServiceReportPreviewWindow(): Window | null {
  const target = window.open("", "_blank");
  if (target) {
    try {
      target.document.title = "Service report preview";
      target.document.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px; color: #6b7280;">Rendering the service report preview...</p>';
    } catch {
      // A window we cannot write into still takes a navigation below.
    }
  }
  return target;
}

export async function showServiceReportPreview(body: ServiceReportPreviewBody, target: Window | null): Promise<void> {
  let blob: Blob;
  try {
    const response = await apiRequest("POST", "/api/service-records/preview-report", body);
    blob = await response.blob();
  } catch (error) {
    if (target && !target.closed) target.close();
    throw error;
  }
  const url = URL.createObjectURL(blob);
  if (target && !target.closed) {
    target.location.href = url;
  } else {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "service-report-preview.pdf";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  // The viewer reads the blob while it loads; revoke once it surely has.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
