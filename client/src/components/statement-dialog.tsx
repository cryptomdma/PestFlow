import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorCode, getApiErrorMessage, queryClient } from "@/lib/queryClient";
import { formatCents } from "@shared/money";
import { AGING_BASIS_LABEL, AGING_BUCKET_LABELS, AGING_BUCKETS } from "@shared/aging";
import {
  defaultStatementPeriod,
  describeStatementPeriod,
  isUtcDay,
  LOCATION_HAS_BALANCE,
  STATEMENT_VARIANT_LABELS,
  type AccountStatement,
  type LocationStatement,
  type StatementGenerateResult,
  type StatementVariant,
  type ZeroBalanceLetter,
} from "@shared/statements";
import { StatementDocumentActions } from "@/components/statement-document-actions";

// The Statement dialog (PLAN_ROADMAP_V2.md C2.5, Pass 15; B5). From the
// location Invoices tab's Balance card it offers the location's period
// statement or its paid-in-full letter; from the customer header, the
// account statement across every location. Generate stores one document on
// request - never on a schedule (a monthly statement is a later Settings
// toggle) - and the result shows the figures it printed with Open PDF /
// Download through the invoice document's pattern. There is no delivery
// yet (C6.3); the office delivers the PDF itself.

export type StatementDialogScope =
  | { kind: "location"; locationId: string; locationLabel: string }
  | { kind: "account"; locationCount: number };

type Generated = StatementGenerateResult<LocationStatement | AccountStatement | ZeroBalanceLetter>;

function isLetter(data: Generated["data"]): data is ZeroBalanceLetter {
  return "agreements" in data;
}

function isAccount(data: Generated["data"]): data is AccountStatement {
  return "sections" in data;
}

export function StatementDialog({
  open,
  onOpenChange,
  customerId,
  customerLabel,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerLabel: string;
  scope: StatementDialogScope;
}) {
  const { toast } = useToast();
  const locationId = scope.kind === "location" ? scope.locationId : null;
  const [variant, setVariant] = useState<StatementVariant>(scope.kind === "account" ? "ACCOUNT" : "LOCATION");
  const [period, setPeriod] = useState(defaultStatementPeriod());
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A fresh form on every open: the default period is month to date, and a
  // previous result is not carried into the next request.
  useEffect(() => {
    if (open) {
      setVariant(scope.kind === "account" ? "ACCOUNT" : "LOCATION");
      setPeriod(defaultStatementPeriod());
      setGenerated(null);
      setRefusal(null);
    }
  }, [open, scope.kind]);

  const periodValid = isUtcDay(period.from) && isUtcDay(period.to) && period.from <= period.to;
  const needsPeriod = variant !== "ZERO_BALANCE_LETTER";

  const mutation = useMutation({
    mutationFn: async () => {
      const path =
        variant === "ACCOUNT"
          ? `/api/customers/${customerId}/statements`
          : variant === "LOCATION"
            ? `/api/locations/${locationId}/statements`
            : `/api/locations/${locationId}/zero-balance-letter`;
      const response = await apiRequest("POST", path, needsPeriod ? { periodFrom: period.from, periodTo: period.to } : undefined);
      return (await response.json()) as Generated;
    },
    onSuccess: (result) => {
      setGenerated(result);
      setRefusal(null);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "statements"] });
      if (locationId) queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "statements"] });
      toast({
        title: `${STATEMENT_VARIANT_LABELS[result.statement.variant]} generated`,
        description: "Stored as a document - open or download it. There is no email delivery yet; deliver the PDF yourself.",
      });
    },
    onError: (error: Error) => {
      if (getApiErrorCode(error) === LOCATION_HAS_BALANCE) {
        setRefusal(getApiErrorMessage(error));
        return;
      }
      toast({ title: "Unable to generate the statement", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const close = (next: boolean) => {
    if (mutation.isPending) return;
    onOpenChange(next);
  };

  const title = scope.kind === "account" ? `Account statement - ${customerLabel}` : `Statement - ${scope.locationLabel}`;
  const letter = generated && isLetter(generated.data) ? generated.data : null;
  const figures = generated && !isLetter(generated.data) ? generated.data : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {scope.kind === "account"
              ? `Every location of this customer (${scope.locationCount}), one section each, with a rollup - the statement for a property manager with one payer.`
              : "A customer-facing document generated on request from the ledger as it stands, and stored so it can be reproduced."}
          </DialogDescription>
        </DialogHeader>

        {generated ? (
          <div className="space-y-4" data-testid="statement-generated">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{STATEMENT_VARIANT_LABELS[generated.statement.variant]}</span>
              <Badge variant="outline" className="text-xs">{describeStatementPeriod(generated.statement)}</Badge>
            </div>
            {letter ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p data-testid="text-letter-balance">No outstanding balance as of {letter.asOf}. {letter.invoiceCount} invoice{letter.invoiceCount === 1 ? "" : "s"} issued to date, all paid.</p>
                <p className="text-muted-foreground">
                  {letter.agreements.length} agreement{letter.agreements.length === 1 ? "" : "s"} listed with status
                  {letter.onAccountCents > 0 ? `; ${formatCents(letter.onAccountCents)} on account` : ""}
                  {letter.pendingUnappliedCents > 0 ? `; ${formatCents(letter.pendingUnappliedCents)} pending confirmation` : ""}.
                </p>
              </div>
            ) : figures ? (
              <div className="rounded-md border p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Opening balance</span>
                <span className="text-right tabular-nums" data-testid="text-statement-opening">{formatCents(figures.openingBalanceCents)}</span>
                <span className="text-muted-foreground">Charges ({figures.invoiceCount} invoice{figures.invoiceCount === 1 ? "" : "s"})</span>
                <span className="text-right tabular-nums">{formatCents(figures.chargesCents)}</span>
                <span className="text-muted-foreground">Payments and credits applied</span>
                <span className="text-right tabular-nums">{formatCents(figures.creditsCents)}</span>
                <span className="font-medium">Closing balance</span>
                <span className="text-right font-semibold tabular-nums" data-testid="text-statement-closing">{formatCents(figures.closingBalanceCents)}</span>
                {figures.onAccountCents > 0 ? (
                  <>
                    <span className="text-muted-foreground">On account, not subtracted</span>
                    <span className="text-right tabular-nums">{formatCents(figures.onAccountCents)}</span>
                  </>
                ) : null}
                {figures.pendingAppliedCents + figures.pendingUnappliedCents > 0 ? (
                  <>
                    <span className="text-muted-foreground">Pending confirmation</span>
                    <span className="text-right tabular-nums">{formatCents(figures.pendingAppliedCents + figures.pendingUnappliedCents)}</span>
                  </>
                ) : null}
                <span className="col-span-2 text-xs text-muted-foreground pt-1">
                  {isAccount(figures) ? `${figures.sections.length} location section${figures.sections.length === 1 ? "" : "s"}. ` : ""}
                  Open balance by {AGING_BASIS_LABEL} as of {figures.periodTo}:{" "}
                  {AGING_BUCKETS.map((bucket) => `${AGING_BUCKET_LABELS[bucket]} ${formatCents(figures.aging.buckets[bucket])}`).join(", ")}.
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <StatementDocumentActions statement={generated.statement} />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setGenerated(null)} data-testid="button-statement-another">Generate another</Button>
                <Button type="button" size="sm" onClick={() => close(false)} data-testid="button-statement-done">Done</Button>
              </div>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (needsPeriod && !periodValid) return;
              mutation.mutate();
            }}
            className="space-y-4"
          >
            {scope.kind === "location" ? (
              <RadioGroup value={variant} onValueChange={(value) => { setVariant(value as StatementVariant); setRefusal(null); }} className="space-y-2">
                <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer" htmlFor="statement-variant-location">
                  <RadioGroupItem value="LOCATION" id="statement-variant-location" className="mt-0.5" data-testid="radio-statement-location" />
                  <span className="text-sm">
                    <span className="font-medium">Location statement</span>
                    <span className="block text-xs text-muted-foreground">Opening balance, the period's invoices, payments and credits, closing balance, and the open balance by {AGING_BASIS_LABEL}.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer" htmlFor="statement-variant-letter">
                  <RadioGroupItem value="ZERO_BALANCE_LETTER" id="statement-variant-letter" className="mt-0.5" data-testid="radio-statement-letter" />
                  <span className="text-sm">
                    <span className="font-medium">Paid-in-full letter</span>
                    <span className="block text-xs text-muted-foreground">Confirms a zero balance as of today and lists this location's agreements with their status - for a home sale. Refused while a balance remains.</span>
                  </span>
                </label>
              </RadioGroup>
            ) : null}

            {needsPeriod ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="statement-period-from">From</Label>
                    <Input id="statement-period-from" type="date" value={period.from} onChange={(e) => setPeriod((prev) => ({ ...prev, from: e.target.value }))} data-testid="input-statement-from" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="statement-period-to">To</Label>
                    <Input id="statement-period-to" type="date" value={period.to} onChange={(e) => setPeriod((prev) => ({ ...prev, to: e.target.value }))} data-testid="input-statement-to" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Inclusive calendar days (UTC), like every other date in PestFlow; month to date by default. Balances are as the ledger stands now - pending payments show, confirmed payments count.
                </p>
                {!periodValid ? <p className="text-xs text-destructive">From must be a day on or before To.</p> : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Speaks as of today. Money on account is stated; a pending payment is noted and does not change the balance.</p>
            )}

            {refusal ? (
              <p className="text-sm text-destructive rounded-md border border-destructive/40 p-3" data-testid="text-statement-refusal">{refusal}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending || (needsPeriod && !periodValid)} data-testid="button-statement-generate">
                {mutation.isPending ? "Generating..." : variant === "ZERO_BALANCE_LETTER" ? "Generate letter" : "Generate statement"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
