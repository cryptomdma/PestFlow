import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorCode, getApiErrorMessage } from "@/lib/queryClient";
import { invalidateAuditViews, invalidateRevertedEntityViews } from "@/lib/invalidate-audit-views";
import {
  describeAuditAction,
  describeAuditEntityType,
  describeAuditRevertability,
  diffAuditSnapshots,
  extractAuditRevertedRef,
  HISTORY_REVERT_CODES,
  type AuditFieldChange,
} from "@shared/audit";
import type { AuditLog } from "@shared/schema";

// One audit_logs row, rendered as the location History tab has since Pass 2:
// entity and action badges, when, by whom, then the field-level diff of the
// before / after snapshots (shared/audit.ts). Extracted in Pass 11a so the
// invoice modal's History section renders a row exactly the way the
// location's History tab does - one renderer, not two that drift. Pass 33
// (C5.1b): the customer-level rollup's rows carry the location they belong
// to (a chip; "Account" for the account-level rows); a one-sided row (a
// `created` / `deleted`) renders its snapshot instead of "no differences";
// a `reverted` row says which change it put back, above its diff; and a
// revertable row offers Revert to a caller who may (canRevert, the
// REVERT_HISTORY check made per site) - the confirm names the fields that go
// back and the hook below posts, toasts and refreshes.

/** A row as the customer-level read annotates it; the location read's rows have neither field. */
export type AuditLogEntry = AuditLog & { locationId?: string | null; locationName?: string | null };

export interface AuditLogRevertResponse {
  entityType: string;
  entityId: string;
  revertedAuditLogId: string | null;
}

/**
 * POST /api/history/:id/revert, with the toasts and the refreshes: every
 * History read, and the reverted entity's own reads. A 409 HISTORY_STALE
 * (the record moved since) refreshes History so the newer row is in view.
 */
export function useAuditLogRevert() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (entry: AuditLogEntry) => {
      const response = await apiRequest("POST", `/api/history/${entry.id}/revert`, {});
      return (await response.json()) as AuditLogRevertResponse;
    },
    onSuccess: (result, entry) => {
      toast({
        title: "Change reverted",
        description: `${describeAuditEntityType(entry.entityType)}: the ${describeAuditAction(entry.action).toLowerCase()} of ${formatAuditTimestamp(entry.createdAt)} was put back.`,
      });
      invalidateAuditViews();
      invalidateRevertedEntityViews(result.entityType);
    },
    onError: (error) => {
      const code = getApiErrorCode(error);
      toast({
        title: code === HISTORY_REVERT_CODES.STALE ? "The record has changed since" : "Could not revert",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
      if (code === HISTORY_REVERT_CODES.STALE) invalidateAuditViews();
    },
  });
}

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

// Fields a one-sided snapshot never lists: the identity and the tenant.
const SNAPSHOT_HIDDEN_FIELDS = new Set(["id", "orgId", "org_id"]);

// A `created` row's after (or a `deleted` row's before), as "field: value"
// lines for the non-empty fields - what the diff box cannot show when one
// side is missing.
function snapshotFields(entry: AuditLog): Array<{ field: string; value: unknown }> {
  const snapshot = entry.action === "deleted" ? entry.beforeJson : entry.afterJson ?? entry.beforeJson;
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return [];
  return Object.entries(snapshot as Record<string, unknown>)
    .filter(([field, value]) => !SNAPSHOT_HIDDEN_FIELDS.has(field) && value !== null && value !== undefined && value !== "")
    .map(([field, value]) => ({ field, value }));
}

function DiffLine({ change }: { change: AuditFieldChange }) {
  return (
    <div className="text-xs flex flex-wrap gap-x-2">
      <span className="font-medium text-foreground">{formatAuditFieldName(change.field)}</span>
      <span className="text-muted-foreground line-through break-all [overflow-wrap:anywhere]">
        {formatAuditValue(change.before)}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="text-foreground break-all [overflow-wrap:anywhere]">
        {formatAuditValue(change.after)}
      </span>
    </div>
  );
}

export function AuditLogEntryCard({
  entry,
  showEntityType = true,
  canRevert = false,
  onRevert,
  revertPending = false,
}: {
  entry: AuditLogEntry;
  showEntityType?: boolean;
  /** The session may revert (REVERT_HISTORY); the card still shows the button only on a revertable row. */
  canRevert?: boolean;
  onRevert?: (entry: AuditLogEntry) => void;
  revertPending?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const changes = diffAuditSnapshots(entry.beforeJson, entry.afterJson);
  const revertedRef = extractAuditRevertedRef(entry.afterJson);
  const snapshot = changes.length === 0 ? snapshotFields(entry) : [];
  // The rollup annotates every row; the location tab's rows have no field at all.
  const locationLabel = entry.locationId === undefined ? null : entry.locationId ? entry.locationName ?? "Location" : "Account";
  const revertable = canRevert && !!onRevert && describeAuditRevertability(entry).revertable;

  return (
    <Card data-testid={`card-audit-log-${entry.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {showEntityType ? <Badge variant="outline" className="text-xs">{describeAuditEntityType(entry.entityType)}</Badge> : null}
          <Badge variant="secondary" className="text-xs">{describeAuditAction(entry.action)}</Badge>
          {locationLabel ? (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground" data-testid={`chip-audit-location-${entry.id}`}>
              {locationLabel}
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">{formatAuditTimestamp(entry.createdAt)}</span>
          {revertable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => setConfirmOpen(true)}
              disabled={revertPending}
              title="Put the fields this change moved back to what they were - recorded as a new change"
              data-testid={`button-revert-${entry.id}`}
            >
              <Undo2 className="h-3 w-3 mr-1" /> {revertPending ? "Reverting..." : "Revert"}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          By: {entry.actorLabel?.trim() || "System"}
        </p>
        {revertedRef ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-audit-reverted-${entry.id}`}>
            Reverted the {describeAuditAction(revertedRef.action).toLowerCase()} of {revertedRef.createdAt ? formatAuditTimestamp(revertedRef.createdAt) : "an earlier change"} by {revertedRef.actorLabel?.trim() || "System"}.
          </p>
        ) : null}
        {changes.length > 0 ? (
          <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-1.5">
            {changes.map((change) => (
              <DiffLine key={change.field} change={change} />
            ))}
          </div>
        ) : snapshot.length > 0 ? (
          <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-1.5" data-testid={`snapshot-audit-log-${entry.id}`}>
            {snapshot.map(({ field, value }) => (
              <div key={field} className="text-xs flex flex-wrap gap-x-2">
                <span className="font-medium text-foreground">{formatAuditFieldName(field)}</span>
                <span className="text-foreground break-all [overflow-wrap:anywhere]">{formatAuditValue(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs italic text-muted-foreground">
            Recorded with no field-level differences.
          </p>
        )}
      </CardContent>

      {revertable ? (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent data-testid={`dialog-revert-${entry.id}`}>
            <AlertDialogHeader>
              <AlertDialogTitle>Revert this change?</AlertDialogTitle>
              <AlertDialogDescription>
                The {describeAuditEntityType(entry.entityType).toLowerCase()} goes back to what it was before the {describeAuditAction(entry.action).toLowerCase()} of {formatAuditTimestamp(entry.createdAt)}.
                A new change is recorded in History naming this one; nothing is removed from the log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
              {changes.map((change) => (
                <DiffLine key={change.field} change={{ field: change.field, before: change.after, after: change.before }} />
              ))}
            </div>
            <AlertDialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={revertPending}>Back</Button>
              <Button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onRevert?.(entry);
                }}
                disabled={revertPending}
                data-testid={`button-revert-confirm-${entry.id}`}
              >
                Revert
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </Card>
  );
}
