// PLAN_BILLING_V1_1.md D4 (owner correction, 2026-09-09): the initial charge -
// a down payment, cleanout surcharge, or prepay-in-full owed at agreement
// start - is a term of ONE sale, derived from that agreement's contract price.
// It lives on the Agreement (the actual) and the Agreement Template (the
// default), the same defaultPriceCents -> priceCents relationship the rest of
// the form uses. It does NOT live on the Billing Plan: a plan says how and
// when a customer is charged and is shared by every agreement using it, so a
// flat amount there forced the same down payment onto every sale and could
// not express "half down" at all.
//
// Shared because the server normalizes and resolves the amount, both forms
// collect it, and the agreement card displays it - one vocabulary, one
// resolver, so the credited/invoiced amount and the amount the office saw
// when selling can never disagree.

export const INITIAL_CHARGE_TYPES = ["DOWN_PAYMENT", "CLEANOUT_SURCHARGE", "PREPAY_FULL"] as const;
export type InitialChargeType = (typeof INITIAL_CHARGE_TYPES)[number];

/** FLAT is `initialChargeCents`; PERCENT_OF_PRICE is `initialChargePercentBasisPoints` of the contract price. */
export const INITIAL_CHARGE_AMOUNT_MODES = ["FLAT", "PERCENT_OF_PRICE"] as const;
export type InitialChargeAmountMode = (typeof INITIAL_CHARGE_AMOUNT_MODES)[number];

/**
 * Who MAY collect the charge - sale logistics, not a record of who did. Null
 * is the third state: either role may collect. One nullable column rather
 * than two checkboxes, so "both" and "neither checked" cannot become two rows
 * meaning one thing (D4). "Nobody collects it" needs no representation at
 * all - that is no initial charge.
 */
export const INITIAL_CHARGE_COLLECTORS = ["OFFICE_AT_SIGNING", "TECH_AT_FIRST_SERVICE"] as const;
export type InitialChargeCollector = (typeof INITIAL_CHARGE_COLLECTORS)[number];

/** Basis points: 10000 = 100% of the contract price. Same unit as taxRates.rateBasisPoints. */
export const MAX_INITIAL_CHARGE_BASIS_POINTS = 10000;

export interface InitialChargeFields {
  initialChargeType: string | null;
  initialChargeAmountMode: string | null;
  initialChargeCents: number | null;
  initialChargePercentBasisPoints: number | null;
  initialChargeCollectedBy: string | null;
}

/** The template carries the same block under `default*` names. */
export interface TemplateInitialChargeFields {
  defaultInitialChargeType: string | null;
  defaultInitialChargeAmountMode: string | null;
  defaultInitialChargeCents: number | null;
  defaultInitialChargePercentBasisPoints: number | null;
  defaultInitialChargeCollectedBy: string | null;
}

export const NO_INITIAL_CHARGE: InitialChargeFields = {
  initialChargeType: null,
  initialChargeAmountMode: null,
  initialChargeCents: null,
  initialChargePercentBasisPoints: null,
  initialChargeCollectedBy: null,
};

export function isInitialChargeType(value: unknown): value is InitialChargeType {
  return typeof value === "string" && (INITIAL_CHARGE_TYPES as readonly string[]).includes(value);
}

export function isInitialChargeAmountMode(value: unknown): value is InitialChargeAmountMode {
  return typeof value === "string" && (INITIAL_CHARGE_AMOUNT_MODES as readonly string[]).includes(value);
}

export function isInitialChargeCollector(value: unknown): value is InitialChargeCollector {
  return typeof value === "string" && (INITIAL_CHARGE_COLLECTORS as readonly string[]).includes(value);
}

type InitialChargeInput = Partial<Record<keyof InitialChargeFields, unknown>>;

function toInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

/**
 * The invariants every writer goes through. No type means no charge at all -
 * every other field is nulled, so a stale amount can never survive clearing
 * the type. With a type, exactly one amount is kept according to the mode
 * (FLAT is the default when the mode is missing, matching what the old
 * plan-level block could express), and an unknown collector reads as "either".
 */
export function normalizeInitialCharge(input: InitialChargeInput): InitialChargeFields {
  if (!isInitialChargeType(input.initialChargeType)) {
    return { ...NO_INITIAL_CHARGE };
  }

  const mode: InitialChargeAmountMode = isInitialChargeAmountMode(input.initialChargeAmountMode) ? input.initialChargeAmountMode : "FLAT";
  return {
    initialChargeType: input.initialChargeType,
    initialChargeAmountMode: mode,
    initialChargeCents: mode === "FLAT" ? toInteger(input.initialChargeCents) : null,
    initialChargePercentBasisPoints: mode === "PERCENT_OF_PRICE" ? toInteger(input.initialChargePercentBasisPoints) : null,
    initialChargeCollectedBy: isInitialChargeCollector(input.initialChargeCollectedBy) ? input.initialChargeCollectedBy : null,
  };
}

/**
 * The one thing normalization cannot decide for the caller: a typed charge
 * with no usable amount is a refusal, not a silent $0. Returns the message to
 * show, or null when the block is valid. Run on the NORMALIZED block.
 */
export function validateInitialCharge(charge: InitialChargeFields): string | null {
  if (!charge.initialChargeType) {
    return null;
  }
  if (charge.initialChargeAmountMode === "PERCENT_OF_PRICE") {
    const basisPoints = charge.initialChargePercentBasisPoints;
    if (basisPoints == null || basisPoints <= 0 || basisPoints > MAX_INITIAL_CHARGE_BASIS_POINTS) {
      return "Initial charge percent must be greater than 0 and at most 100";
    }
    return null;
  }
  if (charge.initialChargeCents == null || charge.initialChargeCents <= 0) {
    return "Initial charge amount must be greater than zero";
  }
  return null;
}

/**
 * The amount actually owed at start, in cents. Null when there is no charge,
 * or when a percent charge has no contract price to resolve against - the
 * caller decides what that means (the form warns, the surcharge credit
 * withholds, Pass 6's receivable refuses).
 */
export function resolveInitialChargeCents(
  charge: InitialChargeFields,
  contractPriceCents: number | null | undefined,
): number | null {
  if (!charge.initialChargeType) {
    return null;
  }
  if (charge.initialChargeAmountMode === "PERCENT_OF_PRICE") {
    if (contractPriceCents == null || charge.initialChargePercentBasisPoints == null) {
      return null;
    }
    return Math.round((contractPriceCents * charge.initialChargePercentBasisPoints) / MAX_INITIAL_CHARGE_BASIS_POINTS);
  }
  return charge.initialChargeCents;
}

/**
 * True only when the technician is the SOLE permitted collector. This is the
 * narrowing D4 requires: the collector field is a permission, not a record of
 * who took the money, so "either may collect" (null) cannot justify crediting
 * the technician - the office may have banked it at signing. Credit keys off
 * the recorded collection event once D5's payments ledger records one; until
 * then a withheld credit is the visible failure and a wrong one is silent.
 */
export function isTechnicianSoleInitialChargeCollector(charge: Pick<InitialChargeFields, "initialChargeType" | "initialChargeCollectedBy">): boolean {
  return !!charge.initialChargeType && charge.initialChargeCollectedBy === "TECH_AT_FIRST_SERVICE";
}

/**
 * The one case that earns the technician a SEPARATE production-value credit
 * (basis SURCHARGE): a cleanout surcharge, which is extra work priced on top
 * of the contract, that only the technician may collect. A down payment or a
 * prepayment is part of the contract price, and the technician's production
 * for that price is already contract price / expected visits - crediting the
 * collection again would pay the same money twice (owner review 2026-09-13).
 * Transitional: goes away once the surcharge is a line the technician adds
 * on the ticket, the credit keys off that recorded line, and the technician's
 * comp plan says whether surcharge lines earn production at all (a per-plan
 * selector, owner 2026-09-13 - see CURRENT_FOCUS.md, compensation entry).
 */
export function isTechnicianCollectedCleanoutSurcharge(charge: Pick<InitialChargeFields, "initialChargeType" | "initialChargeCollectedBy">): boolean {
  return charge.initialChargeType === "CLEANOUT_SURCHARGE" && isTechnicianSoleInitialChargeCollector(charge);
}

type TemplateInitialChargeInput = Partial<Record<keyof TemplateInitialChargeFields, unknown>>;

export function initialChargeFromTemplate(template: TemplateInitialChargeInput | null | undefined): InitialChargeFields {
  if (!template) {
    return { ...NO_INITIAL_CHARGE };
  }
  return normalizeInitialCharge({
    initialChargeType: template.defaultInitialChargeType,
    initialChargeAmountMode: template.defaultInitialChargeAmountMode,
    initialChargeCents: template.defaultInitialChargeCents,
    initialChargePercentBasisPoints: template.defaultInitialChargePercentBasisPoints,
    initialChargeCollectedBy: template.defaultInitialChargeCollectedBy,
  });
}

export function initialChargeToTemplate(charge: InitialChargeFields): TemplateInitialChargeFields {
  return {
    defaultInitialChargeType: charge.initialChargeType,
    defaultInitialChargeAmountMode: charge.initialChargeAmountMode,
    defaultInitialChargeCents: charge.initialChargeCents,
    defaultInitialChargePercentBasisPoints: charge.initialChargePercentBasisPoints,
    defaultInitialChargeCollectedBy: charge.initialChargeCollectedBy,
  };
}

export function formatInitialChargeType(type: string | null | undefined): string {
  switch (type) {
    case "DOWN_PAYMENT":
      return "Down payment";
    case "CLEANOUT_SURCHARGE":
      return "Cleanout surcharge";
    case "PREPAY_FULL":
      return "Prepay in full";
    default:
      return "No initial charge";
  }
}

export function formatInitialChargeCollector(collectedBy: string | null | undefined): string {
  switch (collectedBy) {
    case "OFFICE_AT_SIGNING":
      return "office at signing";
    case "TECH_AT_FIRST_SERVICE":
      return "technician at first service";
    default:
      return "office at signing or technician at first service";
  }
}

/** "50" -> 5000; "" or garbage -> null. The percent input's unit conversion, shared by both forms. */
export function percentToBasisPoints(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) {
    return null;
  }
  return Math.round(num * 100);
}

/** 5000 -> "50"; 1250 -> "12.5". */
export function basisPointsToPercentString(basisPoints: number | null | undefined): string {
  if (basisPoints == null) {
    return "";
  }
  return String(basisPoints / 100);
}

function formatCentsPlain(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/**
 * One sentence for the agreement card and both forms. Null when there is no
 * charge. Says what the code will do, including the one case it cannot
 * resolve: a percent of a price that has not been set yet.
 */
export function describeInitialCharge(charge: InitialChargeFields, contractPriceCents: number | null | undefined): string | null {
  if (!charge.initialChargeType) {
    return null;
  }
  const resolved = resolveInitialChargeCents(charge, contractPriceCents);
  const collector = `Collected by ${formatInitialChargeCollector(charge.initialChargeCollectedBy)}.`;
  if (charge.initialChargeAmountMode === "PERCENT_OF_PRICE") {
    const percent = basisPointsToPercentString(charge.initialChargePercentBasisPoints) || "0";
    const amount = resolved != null ? formatCentsPlain(resolved) : "set a contract price to resolve the amount";
    return `${formatInitialChargeType(charge.initialChargeType)}: ${percent}% of contract price (${amount}). ${collector}`;
  }
  return `${formatInitialChargeType(charge.initialChargeType)}: ${formatCentsPlain(resolved ?? 0)}. ${collector}`;
}
