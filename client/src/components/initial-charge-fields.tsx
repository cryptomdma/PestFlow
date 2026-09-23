import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dollarsToCents, centsToDollarString } from "@shared/money";
import {
  INITIAL_CHARGE_COLLECTORS,
  INITIAL_CHARGE_TYPES,
  basisPointsToPercentString,
  describeInitialCharge,
  formatInitialChargeType,
  normalizeInitialCharge,
  percentToBasisPoints,
  validateInitialCharge,
  type InitialChargeFields,
} from "@shared/initial-charge";

// PLAN_BILLING_V1_1.md D4: the initial charge is a term of one sale, so it is
// collected next to Price on the agreement form (the actual) and the
// agreement-template form (the default) - not on the Billing Plan form. One
// component for both so the two forms cannot drift; the string-valued state
// below is what a form holds, and the two converters are the only bridge to
// the shared InitialChargeFields the API speaks.

/** "NONE" / "EITHER" are form-only sentinels for the nullable API fields (Select cannot hold ""). */
export interface InitialChargeFormState {
  initialChargeType: string;
  initialChargeAmountMode: string;
  initialChargeAmount: string;
  initialChargeCollectedBy: string;
  /** D4 owner review: a down payment counts toward the price by default; this is the explicit exception. */
  initialChargeInAdditionToPrice: boolean;
}

export function initialChargeFormStateFrom(fields: InitialChargeFields | null | undefined): InitialChargeFormState {
  const charge = normalizeInitialCharge(fields ?? {});
  return {
    initialChargeType: charge.initialChargeType ?? "NONE",
    initialChargeAmountMode: charge.initialChargeAmountMode ?? "FLAT",
    initialChargeAmount: charge.initialChargeAmountMode === "PERCENT_OF_PRICE"
      ? basisPointsToPercentString(charge.initialChargePercentBasisPoints)
      : charge.initialChargeCents != null ? centsToDollarString(charge.initialChargeCents) : "",
    initialChargeCollectedBy: charge.initialChargeCollectedBy ?? "EITHER",
    initialChargeInAdditionToPrice: charge.initialChargeInAdditionToPrice,
  };
}

export function initialChargeFieldsFrom(state: InitialChargeFormState): InitialChargeFields {
  return normalizeInitialCharge({
    initialChargeType: state.initialChargeType === "NONE" ? null : state.initialChargeType,
    initialChargeAmountMode: state.initialChargeAmountMode,
    initialChargeCents: state.initialChargeAmountMode === "FLAT" ? dollarsToCents(state.initialChargeAmount) : null,
    initialChargePercentBasisPoints: state.initialChargeAmountMode === "PERCENT_OF_PRICE" ? percentToBasisPoints(state.initialChargeAmount) : null,
    initialChargeCollectedBy: state.initialChargeCollectedBy === "EITHER" ? null : state.initialChargeCollectedBy,
    initialChargeInAdditionToPrice: state.initialChargeInAdditionToPrice,
  });
}

/** The form-side validation, same rule as the server's: a typed charge needs a usable amount. */
export function validateInitialChargeFormState(state: InitialChargeFormState): string | null {
  return validateInitialCharge(initialChargeFieldsFrom(state));
}

const COLLECTOR_LABELS: Record<(typeof INITIAL_CHARGE_COLLECTORS)[number], string> = {
  OFFICE_AT_SIGNING: "Office at signing only",
  TECH_AT_FIRST_SERVICE: "Technician at first service only",
};

export function InitialChargeFormFields({
  value,
  onChange,
  contractPriceCents,
  labelPrefix = "",
  testIdPrefix = "agreement",
}: {
  value: InitialChargeFormState;
  onChange: (next: InitialChargeFormState) => void;
  /** The price the percent mode resolves against - the form's own Price field, live. */
  contractPriceCents: number | null;
  /** "Default " on the template form, so labels read "Default Initial Charge". */
  labelPrefix?: string;
  testIdPrefix?: string;
}) {
  const hasCharge = value.initialChargeType !== "NONE";
  const isPercent = value.initialChargeAmountMode === "PERCENT_OF_PRICE";
  const fields = initialChargeFieldsFrom(value);
  const validationMessage = validateInitialCharge(fields);
  const description = describeInitialCharge(fields, contractPriceCents);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{labelPrefix}Initial Charge</Label>
        <Select
          value={value.initialChargeType}
          onValueChange={(type) => onChange({ ...value, initialChargeType: type })}
        >
          <SelectTrigger data-testid={`select-${testIdPrefix}-initial-charge-type`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">None</SelectItem>
            {INITIAL_CHARGE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{formatInitialChargeType(type)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">A down payment or prepayment agreed at the sale. A down payment is billed as its own line on the first visit's invoice, whoever collects it, and counts toward the contract price unless marked otherwise below; the agreement card can issue it up front instead. A cleanout surcharge or prepayment is issued only from the agreement card.</p>
      </div>
      {hasCharge && (
        <>
          {value.initialChargeType === "DOWN_PAYMENT" && (
            <div className="flex items-start gap-2 rounded-md border px-3 py-2">
              <Checkbox
                id={`${testIdPrefix}-initial-charge-in-addition`}
                checked={value.initialChargeInAdditionToPrice}
                onCheckedChange={(checked) => onChange({ ...value, initialChargeInAdditionToPrice: checked === true })}
                data-testid={`checkbox-${testIdPrefix}-initial-charge-in-addition`}
              />
              <div className="space-y-0.5">
                <Label htmlFor={`${testIdPrefix}-initial-charge-in-addition`} className="text-sm font-normal">Charged in addition to the contract price</Label>
                <p className="text-xs text-muted-foreground">Unchecked (the default), the down payment is part of the price: a $400 agreement with $100 down leaves $300 to bill through the billing plan. Check this only when the sale owes it on top.</p>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Amount Mode</Label>
              <Select
                value={value.initialChargeAmountMode}
                onValueChange={(mode) => onChange({ ...value, initialChargeAmountMode: mode, initialChargeAmount: "" })}
              >
                <SelectTrigger data-testid={`select-${testIdPrefix}-initial-charge-mode`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLAT">Flat amount ($)</SelectItem>
                  <SelectItem value="PERCENT_OF_PRICE">Percent of contract price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{isPercent ? "Percent of Price (%)" : "Amount ($)"}</Label>
              <Input
                type="number"
                min="0"
                max={isPercent ? "100" : undefined}
                step="0.01"
                value={value.initialChargeAmount}
                onChange={(e) => onChange({ ...value, initialChargeAmount: e.target.value })}
                placeholder={isPercent ? "e.g. 50 for half down" : "0.00"}
                data-testid={`input-${testIdPrefix}-initial-charge-amount`}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Who May Collect</Label>
            <Select
              value={value.initialChargeCollectedBy}
              onValueChange={(collectedBy) => onChange({ ...value, initialChargeCollectedBy: collectedBy })}
            >
              <SelectTrigger data-testid={`select-${testIdPrefix}-initial-charge-collector`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EITHER">Either office at signing or technician at first service</SelectItem>
                {INITIAL_CHARGE_COLLECTORS.map((collector) => (
                  <SelectItem key={collector} value={collector}>{COLLECTOR_LABELS[collector]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Who may take the money, not who did. It never changes regular production value (contract price divided by expected visits). Until a collected surcharge is recorded on the ticket, the separate cleanout-surcharge credit is inferred from this and given only when the technician is the sole permitted collector.
            </p>
          </div>
          <p className={`text-xs ${validationMessage ? "text-destructive" : "text-muted-foreground"}`} data-testid={`text-${testIdPrefix}-initial-charge-summary`}>
            {validationMessage ?? description}
          </p>
        </>
      )}
    </div>
  );
}
