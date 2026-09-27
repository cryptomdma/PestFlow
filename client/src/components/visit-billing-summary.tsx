import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCents } from "@shared/money";
import { formatInitialChargeCollector } from "@shared/initial-charge";
import {
  describeServiceDesignation,
  formatServiceDesignation,
  type ServiceBillingDesignation,
  type VisitBillingSummary,
  type VisitChargeBilling,
  type VisitServiceBilling,
} from "@shared/visit-billing";

// PLAN_BILLING_V1_1.md D6 - the field's view of money on a visit: Price /
// COA applied / Due today per service, BILLABLE vs PRODUCTION, and the sum of
// due-today amounts for appointment details. Everything rendered here comes
// from GET /api/appointments/:id/billing-summary, which prices the visit
// through the same resolver invoicing uses. Nothing in this file derives
// coverage or an amount from agreementId or a plan - that is the drift the
// server-side resolver exists to prevent.

/** Pass 19 (C3.3): the ticket's unposted price, priced by the read (VisitBillingDraft in shared/visit-billing.ts says what came of it). */
export interface VisitBillingDraftPrice {
  serviceId: string;
  priceCents: number;
}

// The draft rides the key's last segment as the query string, so a changed
// draft is a new read and every ["/api/appointments"] prefix invalidation
// still reaches it.
export function visitBillingSummaryQueryKey(appointmentId: string, draft?: VisitBillingDraftPrice | null) {
  const search = draft ? `?serviceId=${encodeURIComponent(draft.serviceId)}&priceCents=${draft.priceCents}` : "";
  return ["/api/appointments", appointmentId, `billing-summary${search}`] as const;
}

export function useVisitBillingSummary(appointmentId: string | null | undefined, draft?: VisitBillingDraftPrice | null) {
  return useQuery<VisitBillingSummary>({
    queryKey: visitBillingSummaryQueryKey(appointmentId ?? "", draft),
    enabled: !!appointmentId,
    // A changed draft re-reads under a new key; keep the same visit's last
    // figures on screen while it is in flight rather than flashing "Loading
    // billing...". Another visit's figures are never shown as a placeholder.
    placeholderData: (previousData, previousQuery) => (previousQuery?.queryKey[1] === appointmentId ? previousData : undefined),
  });
}

export function ServiceDesignationBadge({ designation, className }: { designation: ServiceBillingDesignation; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        designation === "PRODUCTION" ? "border-primary/30 bg-primary/10 text-primary" : "border-chart-3/40 bg-chart-3/10 text-chart-3",
        className,
      )}
      title={describeServiceDesignation(designation)}
      data-testid={`badge-service-designation-${designation.toLowerCase()}`}
    >
      {formatServiceDesignation(designation)}
    </Badge>
  );
}

// "Applied" is a fact on the invoice's ledger; "available" is what the office
// will apply when the visit is invoiced (D4: designation is intent,
// application is fact). The label says which one the number is.
function coaLabel(invoiced: boolean) {
  return invoiced ? "COA applied" : "COA available";
}

/** The three figures a service line and a charge line share. */
type BillingFigures = Pick<VisitServiceBilling, "priceCents" | "taxCents" | "coaAppliedCents" | "coaAvailableCents" | "dueTodayCents">;

/** Price / COA / Due today for one service (or the visit's down payment), as three small figures. */
export function ServiceBillingFigures({ line, invoiced, className, testId }: { line: BillingFigures; invoiced: boolean; className?: string; testId: string }) {
  const coaCents = invoiced ? line.coaAppliedCents : line.coaAvailableCents;
  return (
    <dl className={cn("grid grid-cols-3 gap-2 text-xs", className)}>
      <div>
        <dt className="text-muted-foreground">Price</dt>
        <dd className="font-medium" data-testid={`text-service-price-${testId}`}>
          {line.priceCents == null ? "Not resolved" : formatCents(line.priceCents)}
        </dd>
        {line.taxCents > 0 && <dd className="text-muted-foreground">+ {formatCents(line.taxCents)} tax</dd>}
      </div>
      <div>
        <dt className="text-muted-foreground">{coaLabel(invoiced)}</dt>
        <dd className="font-medium" data-testid={`text-service-coa-${testId}`}>{formatCents(coaCents)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Due today</dt>
        <dd className="font-semibold" data-testid={`text-service-due-today-${testId}`}>
          {line.dueTodayCents == null ? "Unknown" : formatCents(line.dueTodayCents)}
        </dd>
      </div>
    </dl>
  );
}

/** The collector field read as a permission, for the charge row. */
function describeChargeCollector(charge: VisitChargeBilling): string {
  return `Down payment on the agreement's first visit. Collected by ${formatInitialChargeCollector(charge.collectedBy)}.`;
}

/**
 * The technician's reader of the collector field (Pass 11d): the visit's
 * down payment is called out unless only the office may collect it, in which
 * case the line says so and the collect step leaves it out of the default
 * amount. Nothing when the visit carries no charge.
 */
export function VisitInitialChargeCallout({ summary, className }: { summary: VisitBillingSummary | undefined; className?: string }) {
  if (!summary || !summary.charges.length) {
    return null;
  }
  return (
    <div className={cn("space-y-1", className)} data-testid="callout-visit-initial-charge">
      {summary.charges.map((charge) => {
        const officeOnly = charge.collectedBy === "OFFICE_AT_SIGNING";
        const settled = charge.dueTodayCents <= 0;
        const tail = settled
          ? " is covered by money on account - nothing to collect for it."
          : officeOnly
            ? " is collected by the office at signing, not on this visit."
            : " is due with this visit - collect it with the service.";
        return (
          <p
            key={charge.agreementId}
            className={cn("rounded-md border px-3 py-2 text-xs", officeOnly || settled ? "text-muted-foreground" : "border-chart-3/40 bg-chart-3/10 text-foreground")}
            data-testid={`text-visit-initial-charge-${charge.agreementId}`}
          >
            <span className="font-medium">Down payment {formatCents(charge.priceCents + charge.taxCents)}</span> for {charge.agreementName}{tail}
          </p>
        );
      })}
    </div>
  );
}

/** Where the figures come from, in one sentence, so a technician knows whether they are looking at an invoice or a price. */
export function describeBillingSource(summary: VisitBillingSummary): string {
  if (summary.invoiced && summary.invoice) {
    const pending = summary.totals.coaPendingCents > 0
      ? ` ${formatCents(summary.totals.coaPendingCents)} of the COA is pending confirmation.`
      : "";
    return `From invoice ${summary.invoice.invoiceNumber}.${pending}`;
  }
  const draft = summary.invoice ? `Draft ${summary.invoice.invoiceNumber} is re-priced when it is issued. ` : "";
  const coa = summary.totals.coaAvailableCents > 0
    ? " COA available is the location's balance the office applies when the visit is invoiced - do not collect it again."
    : "";
  return `${draft}Priced as the office will invoice it.${coa}`;
}

/**
 * One service's billing on the ticket (full) or in a service list (compact):
 * designation, the three figures, the refusal reason when there is no price,
 * and - full only - the source sentence.
 */
export function ServiceBillingBlock({
  summary,
  serviceId,
  isLoading,
  isError,
  compact = false,
}: {
  summary: VisitBillingSummary | undefined;
  serviceId: string;
  isLoading: boolean;
  isError: boolean;
  compact?: boolean;
}) {
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading billing...</p>;
  }
  if (isError || !summary) {
    return <p className="text-xs text-muted-foreground">Billing is unavailable for this visit right now.</p>;
  }
  const line = summary.services.find((item) => item.serviceId === serviceId);
  if (!line) {
    return <p className="text-xs text-muted-foreground">This service is not on the visit's billing.</p>;
  }
  // The resolver's "covered by agreement" note repeats what the designation
  // sentence already says; the callback notes do not.
  const noteSuffix = line.priceCents != null && line.note && line.note !== "covered by agreement" ? ` (${line.note})` : "";
  // The figures above are this SERVICE's. When the visit also carries the
  // agreement's down payment (Pass 11d) the visit owes more than the service
  // does, so say so here in the service's own words - "nothing due for the
  // service itself", never "nothing due today" - and reconcile the two
  // numbers in one line, so the ticket (which shows no visit total) and the
  // appointment details (whose visit total sits below several cards) both
  // read the same way as the collect step.
  const chargeCents = summary.charges.reduce((sum, charge) => sum + charge.dueTodayCents, 0);
  const hasCharges = summary.charges.length > 0;
  const designationText = hasCharges && line.designation === "PRODUCTION"
    ? "Covered by agreement - nothing due for the service itself"
    : describeServiceDesignation(line.designation);
  return (
    <div className="space-y-2" data-testid={`block-service-billing-${serviceId}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <ServiceDesignationBadge designation={line.designation} />
        <span className="text-xs text-muted-foreground">{designationText}{noteSuffix}</span>
      </div>
      <ServiceBillingFigures line={line} invoiced={summary.invoiced} testId={line.serviceId} />
      {line.priceCents == null && line.note && <p className="text-xs text-destructive">{line.note}</p>}
      {/* Pass 19: what the figures are priced at when the ticket carries an unposted price - applied, or why not. */}
      {summary.draft && summary.draft.serviceId === serviceId && (
        <p className="text-xs text-muted-foreground" data-testid={`text-service-draft-price-${serviceId}`}>
          {summary.draft.applied
            ? `Priced at the ticket's ${formatCents(summary.draft.priceCents)} - not posted yet; the stored price changes when the ticket is posted.${summary.draft.note ? ` ${summary.draft.note}` : ""}`
            : `The ticket's ${formatCents(summary.draft.priceCents)} is not priced here. ${summary.draft.note ?? ""}`}
        </p>
      )}
      {hasCharges && (
        <p className="text-xs text-muted-foreground" data-testid={`text-service-visit-due-${serviceId}`}>
          {line.dueTodayCents == null
            ? `The visit's down payment of ${formatCents(chargeCents)} is due in addition to this service.`
            : `This service ${formatCents(line.dueTodayCents)} + down payment ${formatCents(chargeCents)} = visit due today ${formatCents(summary.totals.dueTodayCents)}.`}
        </p>
      )}
      {!compact && <p className="text-xs text-muted-foreground">{describeBillingSource(summary)}</p>}
    </div>
  );
}

/** The one number D6 gives appointment details: the sum of due-today amounts. */
export function VisitDueTodayTotal({ summary, className }: { summary: VisitBillingSummary; className?: string }) {
  return (
    <div className={cn("rounded-md border bg-background px-3 py-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Due today</span>
        <span className="text-base font-semibold" data-testid="text-visit-due-today">{formatCents(summary.totals.dueTodayCents)}</span>
      </div>
      {summary.totals.unresolvedCount > 0 && (
        <p className="mt-1 text-xs text-destructive">
          {summary.totals.unresolvedCount === 1 ? "1 service" : `${summary.totals.unresolvedCount} services`} could not be priced and {summary.totals.unresolvedCount === 1 ? "is" : "are"} not in this total.
        </p>
      )}
    </div>
  );
}

/**
 * The same figures as VisitBillingRows laid out for a WIDE surface (the
 * Service Ticket Review modal): one table row per service - name and
 * designation | Price (+ tax) | COA | Due today - and a Due today footer. The
 * stacked cards of VisitBillingRows suit a phone-width dialog; beside a
 * short block on a desktop modal they leave a column of dead space.
 */
export function VisitBillingTable({ summary, isLoading, isError }: { summary: VisitBillingSummary | undefined; isLoading: boolean; isError: boolean }) {
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading billing...</p>;
  }
  if (isError || !summary) {
    return <p className="text-xs text-muted-foreground">Billing is unavailable for this visit right now.</p>;
  }
  if (!summary.services.length) {
    return <p className="text-xs text-muted-foreground">No services on this visit.</p>;
  }
  return (
    <div className="space-y-2" data-testid="table-visit-billing">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-normal">Service</th>
              <th className="py-1 pr-3 text-right font-normal">Price</th>
              <th className="py-1 pr-3 text-right font-normal">{coaLabel(summary.invoiced)}</th>
              <th className="py-1 text-right font-normal">Due today</th>
            </tr>
          </thead>
          <tbody>
            {summary.services.map((line) => {
              const coaCents = summary.invoiced ? line.coaAppliedCents : line.coaAvailableCents;
              return (
                <tr key={line.serviceId} className="border-t" data-testid={`row-visit-billing-${line.serviceId}`}>
                  <td className="py-1.5 pr-3 align-top">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{line.serviceTypeName}</span>
                      <ServiceDesignationBadge designation={line.designation} />
                    </div>
                    {line.priceCents == null && line.note && <p className="mt-0.5 text-xs text-destructive">{line.note}</p>}
                  </td>
                  <td className="py-1.5 pr-3 text-right align-top whitespace-nowrap">
                    <span className="font-medium" data-testid={`text-service-price-${line.serviceId}`}>{line.priceCents == null ? "Not resolved" : formatCents(line.priceCents)}</span>
                    {line.taxCents > 0 && <span className="block text-xs text-muted-foreground">+ {formatCents(line.taxCents)} tax</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right align-top font-medium whitespace-nowrap" data-testid={`text-service-coa-${line.serviceId}`}>{formatCents(coaCents)}</td>
                  <td className="py-1.5 text-right align-top font-semibold whitespace-nowrap" data-testid={`text-service-due-today-${line.serviceId}`}>
                    {line.dueTodayCents == null ? "Unknown" : formatCents(line.dueTodayCents)}
                  </td>
                </tr>
              );
            })}
            {summary.charges.map((charge) => {
              const coaCents = summary.invoiced ? charge.coaAppliedCents : charge.coaAvailableCents;
              return (
                <tr key={`charge-${charge.agreementId}`} className="border-t" data-testid={`row-visit-charge-${charge.agreementId}`}>
                  <td className="py-1.5 pr-3 align-top">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{charge.description}</span>
                      <ServiceDesignationBadge designation="BILLABLE" />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{describeChargeCollector(charge)}</p>
                  </td>
                  <td className="py-1.5 pr-3 text-right align-top whitespace-nowrap">
                    <span className="font-medium" data-testid={`text-service-price-charge-${charge.agreementId}`}>{formatCents(charge.priceCents)}</span>
                    {charge.taxCents > 0 && <span className="block text-xs text-muted-foreground">+ {formatCents(charge.taxCents)} tax</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right align-top font-medium whitespace-nowrap" data-testid={`text-service-coa-charge-${charge.agreementId}`}>{formatCents(coaCents)}</td>
                  <td className="py-1.5 text-right align-top font-semibold whitespace-nowrap" data-testid={`text-service-due-today-charge-${charge.agreementId}`}>
                    {formatCents(charge.dueTodayCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td colSpan={3} className="py-1.5 pr-3 text-right font-medium">Due today</td>
              <td className="py-1.5 text-right text-base font-semibold whitespace-nowrap" data-testid="text-visit-billing-due-today">{formatCents(summary.totals.dueTodayCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {summary.totals.unresolvedCount > 0 && (
        <p className="text-xs text-destructive">
          {summary.totals.unresolvedCount === 1 ? "1 service" : `${summary.totals.unresolvedCount} services`} could not be priced and {summary.totals.unresolvedCount === 1 ? "is" : "are"} not in this total.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{describeBillingSource(summary)}</p>
    </div>
  );
}

/** A visit's services with their figures, then the due-today total - for surfaces that do not already list the services. */
export function VisitBillingRows({ summary, isLoading, isError }: { summary: VisitBillingSummary | undefined; isLoading: boolean; isError: boolean }) {
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading billing...</p>;
  }
  if (isError || !summary) {
    return <p className="text-xs text-muted-foreground">Billing is unavailable for this visit right now.</p>;
  }
  if (!summary.services.length) {
    return <p className="text-xs text-muted-foreground">No services on this visit.</p>;
  }
  return (
    <div className="space-y-2" data-testid="rows-visit-billing">
      {summary.services.map((line) => (
        <div key={line.serviceId} className="rounded-md border bg-background p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{line.serviceTypeName}</span>
            <ServiceDesignationBadge designation={line.designation} />
          </div>
          <ServiceBillingFigures line={line} invoiced={summary.invoiced} className="mt-2" testId={line.serviceId} />
          {line.priceCents == null && line.note && <p className="mt-1 text-xs text-destructive">{line.note}</p>}
        </div>
      ))}
      {summary.charges.map((charge) => (
        <div key={`charge-${charge.agreementId}`} className="rounded-md border bg-background p-2" data-testid={`row-visit-charge-${charge.agreementId}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{charge.description}</span>
            <ServiceDesignationBadge designation="BILLABLE" />
          </div>
          <ServiceBillingFigures line={charge} invoiced={summary.invoiced} className="mt-2" testId={`charge-${charge.agreementId}`} />
          <p className="mt-1 text-xs text-muted-foreground">{describeChargeCollector(charge)}</p>
        </div>
      ))}
      <VisitDueTodayTotal summary={summary} />
      <p className="text-xs text-muted-foreground">{describeBillingSource(summary)}</p>
    </div>
  );
}
