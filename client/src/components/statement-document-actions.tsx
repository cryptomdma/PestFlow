import { Button } from "@/components/ui/button";
import { statementFileName, type StatementInfo } from "@shared/statements";
import { Download, FileText } from "lucide-react";

// A stored statement's document (PLAN_ROADMAP_V2.md C2.5, Pass 15) - the
// InvoiceDocumentActions pattern (Pass 10): Open shows the PDF in a new tab
// (GET /api/statements/:id/document answers inline), Download asks the same
// route for an attachment. No Mark Sent: a statement carries no sent stamp
// and no delivery exists until C6.3, so the office delivers the PDF itself.

export function statementDocumentUrl(statement: Pick<StatementInfo, "id">, download = false): string {
  return `/api/statements/${statement.id}/document${download ? "?download=1" : ""}`;
}

function downloadStatementDocument(statement: Pick<StatementInfo, "id" | "variant" | "periodTo">) {
  const anchor = document.createElement("a");
  anchor.href = statementDocumentUrl(statement, true);
  anchor.download = statementFileName(statement);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function StatementDocumentActions({ statement, compact = false }: { statement: Pick<StatementInfo, "id" | "variant" | "periodTo">; compact?: boolean }) {
  const sizeClass = compact ? "h-6 px-2 text-xs" : undefined;
  const iconClass = compact ? "h-3 w-3" : "h-3 w-3 mr-1";
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={sizeClass}
        onClick={() => window.open(statementDocumentUrl(statement), "_blank", "noopener")}
        title="Open the statement PDF in a new tab"
        data-testid={`button-open-statement-${statement.id}`}
      >
        <FileText className={iconClass} /> {compact ? "" : "Open PDF"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={compact ? "h-6 w-6 p-0" : "h-8 w-8 p-0"}
        onClick={() => downloadStatementDocument(statement)}
        title="Download the statement PDF"
        aria-label="Download the statement PDF"
        data-testid={`button-download-statement-${statement.id}`}
      >
        <Download className="h-3 w-3" />
      </Button>
    </>
  );
}
