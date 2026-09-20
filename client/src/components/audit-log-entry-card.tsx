import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { describeAuditAction, describeAuditEntityType, diffAuditSnapshots } from "@shared/audit";
import type { AuditLog } from "@shared/schema";

// One audit_logs row, rendered as the location History tab has since Pass 2:
// entity and action badges, when, by whom, then the field-level diff of the
// before / after snapshots (shared/audit.ts). Extracted in Pass 11a so the
// invoice modal's History section renders a row exactly the way the
// location's History tab does - one renderer, not two that drift.

export function formatAuditTimestamp(value: string | Date) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAuditFieldName(field: string) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function AuditLogEntryCard({ entry, showEntityType = true }: { entry: AuditLog; showEntityType?: boolean }) {
  const changes = diffAuditSnapshots(entry.beforeJson, entry.afterJson);

  return (
    <Card data-testid={`card-audit-log-${entry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {showEntityType ? <Badge variant="outline" className="text-xs">{describeAuditEntityType(entry.entityType)}</Badge> : null}
          <Badge variant="secondary" className="text-xs">{describeAuditAction(entry.action)}</Badge>
          <span className="text-xs text-muted-foreground">{formatAuditTimestamp(entry.createdAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          By: {entry.actorLabel?.trim() || "System"}
        </p>
        {changes.length > 0 ? (
          <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-1.5">
            {changes.map((change) => (
              <div key={change.field} className="text-xs flex flex-wrap gap-x-2">
                <span className="font-medium text-foreground">{formatAuditFieldName(change.field)}</span>
                <span className="text-muted-foreground line-through break-all [overflow-wrap:anywhere]">
                  {formatAuditValue(change.before)}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground break-all [overflow-wrap:anywhere]">
                  {formatAuditValue(change.after)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs italic text-muted-foreground">
            Recorded with no field-level differences.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
