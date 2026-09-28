import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeServiceWorkKind, formatServiceWorkKindBadge, normalizeServiceWorkKind } from "@shared/service-kind";

/**
 * Pass 24 (PLAN_ROADMAP_V2.md C3.7): what the WORK is - Service, Production
 * or Callback (shared/service-kind.ts). Distinct from ServiceDesignationBadge
 * (visit-billing-summary.tsx), which says what the invoice LINE is (Billable /
 * Production): the text here is prefixed "Kind:" so the two are never read as
 * one badge where both show (the dispatch sheet). Lists show it only for a
 * kind other than the plain SERVICE; detail views always do.
 */
export function ServiceWorkKindBadge({ workKind, className }: { workKind: string | null | undefined; className?: string }) {
  const kind = normalizeServiceWorkKind(workKind);
  return (
    <Badge
      variant="outline"
      className={cn(
        kind === "CALLBACK"
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : kind === "PRODUCTION"
            ? "border-sky-300 bg-sky-50 text-sky-900"
            : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
      title={describeServiceWorkKind(kind)}
      data-testid={`badge-service-work-kind-${kind.toLowerCase()}`}
    >
      {formatServiceWorkKindBadge(kind)}
    </Badge>
  );
}

/** A list's badge: shown only when the kind is not the plain SERVICE kind, so a hundred rows do not repeat it. */
export function ServiceWorkKindListBadge({ workKind, className }: { workKind: string | null | undefined; className?: string }) {
  if (normalizeServiceWorkKind(workKind) === "SERVICE") {
    return null;
  }
  return <ServiceWorkKindBadge workKind={workKind} className={className} />;
}
