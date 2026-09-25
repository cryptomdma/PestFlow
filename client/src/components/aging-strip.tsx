import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, PiggyBank, ReceiptText } from "lucide-react";
import { formatCents } from "@shared/money";
import {
  AGING_BASIS_LABEL,
  AGING_BUCKET_LABELS,
  AGING_BUCKET_RANGES,
  AGING_BUCKETS,
  emptyAgingFigures,
  type AgingBucket,
  type AgingFigures,
  type CustomerAging,
  type LocationAging,
} from "@shared/aging";

// Aging on the customer screen (PLAN_ROADMAP_V2.md C2.4, Pass 14). Two
// surfaces, one read (GET /api/customers/:id/aging): the header card's chips
// carry the customer-wide rollup beside the primary-location chip, and the
// location profile's strip, below the location notes, carries the selected
// location's buckets with the invoices behind them, each opening the invoice
// modal. Every bucket is "days since invoiced" (B20) - never days past due;
// the Invoices screen's Overdue tile keeps that meaning. Money on account and
// pending money are shown beside the balance and never netted.

/** The tone a non-empty bucket reads in: the older, the louder. */
export function agingBucketToneClass(bucket: AgingBucket): string {
  switch (bucket) {
    case "OVER_90":
      return "text-destructive";
    case "DAYS_61_90":
    case "DAYS_31_60":
      return "text-chart-3";
    default:
      return "";
  }
}

/** "31-60 days since invoiced"; Current spells its range out so "Current" never reads as "nothing owed". */
export function describeAgingBucket(bucket: AgingBucket): string {
  return bucket === "CURRENT"
    ? `Current (${AGING_BUCKET_RANGES.CURRENT} since invoiced)`
    : `${AGING_BUCKET_LABELS[bucket]} ${AGING_BASIS_LABEL}`;
}

/** The customer-wide figures as chips for the header card's chip row. Renders nothing until the read lands. */
export function CustomerAgingChips({ aging, locationCount }: { aging: CustomerAging | undefined; locationCount: number }) {
  if (!aging) return null;
  const { rollup } = aging;
  const pendingCents = rollup.pendingAppliedCents + rollup.pendingUnappliedCents;
  const scope = locationCount > 1 ? " across all locations" : "";
  return (
    <>
      <Badge
        variant="outline"
        className={`text-xs ${rollup.openBalanceCents > 0 ? "" : "text-muted-foreground"}`}
        title="Rolled up across the customer's locations; the balance itself lives at each location"
        data-testid="chip-customer-open-balance"
      >
        <ReceiptText className="h-3 w-3 mr-1" />
        {rollup.openBalanceCents > 0 ? `Open ${formatCents(rollup.openBalanceCents)}${scope}` : `No open balance${scope}`}
      </Badge>
      {rollup.oldestBucket ? (
        <Badge variant="outline" className={`text-xs ${agingBucketToneClass(rollup.oldestBucket)}`} data-testid="chip-customer-oldest-bucket">
          <Clock className="h-3 w-3 mr-1" /> Oldest: {describeAgingBucket(rollup.oldestBucket)}
        </Badge>
      ) : null}
      {rollup.onAccountCents > 0 ? (
        <Badge variant="outline" className="text-xs" title="Confirmed payments and credit memos not yet applied to an invoice - shown beside the balance, never subtracted from it" data-testid="chip-customer-on-account">
          <PiggyBank className="h-3 w-3 mr-1" /> {formatCents(rollup.onAccountCents)} on account
        </Badge>
      ) : null}
      {pendingCents > 0 ? (
        <Badge variant="outline" className="text-xs text-muted-foreground" title="Recorded payments awaiting office confirmation - pending shows, confirmed counts" data-testid="chip-customer-pending">
          {formatCents(pendingCents)} pending confirmation
        </Badge>
      ) : null}
    </>
  );
}

/** One location's aging strip. `aging` is null when the read listed nothing for the location: nothing owed, nothing on account. */
export function LocationAgingStrip({
  aging,
  asOf,
  isLoading,
  onOpenInvoice,
}: {
  aging: LocationAging | null;
  asOf?: string;
  isLoading: boolean;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const figures: AgingFigures = aging ?? emptyAgingFigures();
  const invoices = aging?.invoices ?? [];
  return (
    <Card data-testid="card-location-aging">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> Balance
          </CardTitle>
          {isLoading && !aging ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <span className="text-lg font-bold tabular-nums" data-testid="text-location-aging-open">{formatCents(figures.openBalanceCents)}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Open balance by {AGING_BASIS_LABEL}{asOf ? `, as of ${asOf}` : ""} - not days past due.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading && !aging ? (
          <Skeleton className="h-28" />
        ) : (
          <>
            <div className="divide-y rounded-md border">
              {AGING_BUCKETS.map((bucket) => {
                const cents = figures.buckets[bucket];
                const rows = invoices.filter((invoice) => invoice.bucket === bucket);
                return (
                  <div key={bucket} className="px-3 py-2" data-testid={`row-aging-bucket-${bucket}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className={`font-medium ${cents > 0 ? agingBucketToneClass(bucket) : "text-muted-foreground"}`}>{AGING_BUCKET_LABELS[bucket]}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{AGING_BUCKET_RANGES[bucket]}</span>
                      </div>
                      <span className={`font-semibold tabular-nums ${cents > 0 ? "" : "text-muted-foreground"}`} data-testid={`text-aging-bucket-${bucket}`}>
                        {formatCents(cents)}
                      </span>
                    </div>
                    {rows.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {rows.map((invoice) => (
                          <Button
                            key={invoice.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs font-normal"
                            onClick={() => onOpenInvoice(invoice.id)}
                            title={`Open ${invoice.invoiceNumber}`}
                            data-testid={`button-aging-invoice-${invoice.id}`}
                          >
                            <span className="font-medium">{invoice.invoiceNumber}</span>
                            <span className="ml-1.5 tabular-nums">{formatCents(invoice.balanceDueCents)}</span>
                            <span className="ml-1.5 text-muted-foreground">{invoice.daysSinceInvoiced === 1 ? "1 day" : `${invoice.daysSinceInvoiced} days`}</span>
                            {invoice.pendingAppliedCents > 0 ? (
                              <span className="ml-1.5 text-muted-foreground">({formatCents(invoice.pendingAppliedCents)} pending)</span>
                            ) : null}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {figures.openBalanceCents === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-location-aging-empty">Nothing owed at this location.</p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span data-testid="text-location-aging-on-account">
                <span className="font-medium text-foreground tabular-nums">{formatCents(figures.onAccountCents)}</span> on account
              </span>
              {figures.pendingAppliedCents > 0 ? (
                <span data-testid="text-location-aging-pending-applied">
                  <span className="font-medium text-foreground tabular-nums">{formatCents(figures.pendingAppliedCents)}</span> applied, awaiting confirmation
                </span>
              ) : null}
              {figures.pendingUnappliedCents > 0 ? (
                <span data-testid="text-location-aging-pending-unapplied">
                  <span className="font-medium text-foreground tabular-nums">{formatCents(figures.pendingUnappliedCents)}</span> recorded, awaiting confirmation, not yet applied
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">Money on account is shown beside the balance, never subtracted from it. Pending money shows; confirmed money counts.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
