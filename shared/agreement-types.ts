// PLAN_ROADMAP_V2.md C5.3 (Pass 35; B8 / PLAN_BILLING_V1_1.md D8): the
// agreement vocabulary both sides share.
//
// Two things live here. The AGREEMENT TYPE is "what kind of program this is"
// (D8's first dimension - pest control, termite, mosquito...): a settings-
// managed list, `agreement_types`, seeded per org with the five keys below
// (owner, Part E answer 9) and then the office's own - Settings adds a type,
// renames it, retires it, or MERGES one into another (every agreement and
// template on the source moves to the target and the source is retired).
// `agreements.agreementType` and `agreementTemplates.defaultAgreementType`
// hold the type's KEY (the opportunities.categoryKey shape), nullable: nine
// agreements and two templates carried no type when the list arrived, and an
// "Untyped" entry would be a lie, so the dropdowns offer "None" and the office
// fills them in. D8's second dimension - the STRUCTURE (recurring, one-time,
// installment, seasonal...) - is not a type and has no list: the Billing Plan
// and `expectedServiceCount` already express it, and a bundle is a grouping
// layer (canon §9), never a type.
//
// The UNITS are the calendar vocabulary of an agreement's term and service
// recurrence: DAY | WEEK | MONTH | QUARTER | YEAR, one list for all four
// columns (termUnit / recurrenceUnit and the templates' defaults) and the
// same five the billing plans' intervalUnit offers. `CUSTOM` left in this
// pass: it had always meant "days" (advanceAgreementDate stepped it with
// addDays) with nothing in the UI saying so, so the migration rewrote
// CUSTOM(N) as DAY(N) - the same interval, exactly, never WEEK(1) for a 7 -
// on the nine agreements and two templates that carried it.

// ---------------------------------------------------------------------------
// Units

export const AGREEMENT_UNITS = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"] as const;
export type AgreementUnit = (typeof AGREEMENT_UNITS)[number];

export const AGREEMENT_UNIT_LABELS: Record<AgreementUnit, string> = {
  DAY: "Day",
  WEEK: "Week",
  MONTH: "Month",
  QUARTER: "Quarter",
  YEAR: "Year",
};

/** The unit the Pass 35 migration retired. Kept as a name so the one place that still maps it (a pre-migration History row's replay) says what it is doing. */
export const LEGACY_AGREEMENT_UNIT = "CUSTOM";

export function isAgreementUnit(value: unknown): value is AgreementUnit {
  return (AGREEMENT_UNITS as readonly string[]).includes(value as string);
}

/** CUSTOM -> DAY (the migration's rule - CUSTOM always stepped by days); anything else unchanged. */
export function normalizeLegacyAgreementUnit<T>(unit: T): T | "DAY" {
  return unit === LEGACY_AGREEMENT_UNIT ? "DAY" : unit;
}

/** "Day", "Quarter"... - the unit itself when it is not one of the five (a row from before the vocabulary). */
export function describeAgreementUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  return AGREEMENT_UNIT_LABELS[unit as AgreementUnit] ?? unit;
}

/** "Quarterly" for QUARTER/1, else "Every 7 Days" / "Every 1 Month" - the agreement card's and the template row's cadence line. */
export function describeAgreementCadence(unit: string | null | undefined, interval: number | null | undefined): string {
  const step = Math.max(interval || 1, 1);
  if (unit === "QUARTER" && step === 1) return "Quarterly";
  const label = describeAgreementUnit(unit) || "Month";
  return `Every ${step} ${step === 1 ? label : `${label}s`}`;
}

/** "Renews every 1 year" / "Renews every 7 days" - the template row's term line. */
export function describeAgreementTerm(unit: string | null | undefined, interval: number | null | undefined): string {
  const step = Math.max(interval || 1, 1);
  const label = (describeAgreementUnit(unit) || "Year").toLowerCase();
  return `Renews every ${step} ${step === 1 ? label : `${label}s`}`;
}

// ---------------------------------------------------------------------------
// Agreement types

/** The five seed keys, in seed order (owner, Part E answer 9). The office adds its own after them. */
export const AGREEMENT_TYPE_SEED: ReadonlyArray<{ key: string; label: string; sortOrder: number }> = [
  { key: "PEST_CONTROL", label: "Pest control", sortOrder: 10 },
  { key: "TERMITE", label: "Termite", sortOrder: 20 },
  { key: "MOSQUITO", label: "Mosquito", sortOrder: 30 },
  { key: "WILDLIFE", label: "Wildlife", sortOrder: 40 },
  { key: "EVALUATION", label: "Evaluation", sortOrder: 50 },
];

export const AGREEMENT_TYPE_KEY_MAX_LENGTH = 64;
export const AGREEMENT_TYPE_LABEL_MAX_LENGTH = 80;
export const AGREEMENT_TYPE_DESCRIPTION_MAX_LENGTH = 500;

/** Upper snake case: letters and digits, underscores between words, never empty. */
const AGREEMENT_TYPE_KEY_PATTERN = /^[A-Z0-9][A-Z0-9_]*$/;

/**
 * The key a label derives: "Pest control" -> PEST_CONTROL, "Bed-bug (heat)" ->
 * BED_BUG_HEAT, "Évaluation" -> EVALUATION. Letters outside A-Z are folded
 * to their base letter where one exists and dropped otherwise, so a label
 * with no letters or digits derives "" (refused by the writer). The same
 * derivation names the entry the Pass 35 migration created for each distinct
 * free-text value ("Annual" -> ANNUAL), so a typed label and a migrated one
 * cannot land on different keys for the same words.
 */
export function deriveAgreementTypeKey(label: string): string {
  const key = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, AGREEMENT_TYPE_KEY_MAX_LENGTH);
  return key.replace(/_+$/g, "");
}

export function isValidAgreementTypeKey(key: string): boolean {
  return key.length > 0 && key.length <= AGREEMENT_TYPE_KEY_MAX_LENGTH && AGREEMENT_TYPE_KEY_PATTERN.test(key);
}

/** The codes an agreement-type write answers when the rules refuse it (server/storage.ts AgreementTypeError). */
export const AGREEMENT_TYPE_ERROR_CODES = {
  /** 404: no type with that id in the org. */
  NOT_FOUND: "AGREEMENT_TYPE_NOT_FOUND",
  /** 400: a blank label. */
  LABEL_REQUIRED: "AGREEMENT_TYPE_LABEL_REQUIRED",
  /** 400: the label derives no key, or a given key is not upper snake case. */
  KEY_INVALID: "AGREEMENT_TYPE_KEY_INVALID",
  /** 400: another type of the org already has that key. */
  KEY_TAKEN: "AGREEMENT_TYPE_KEY_TAKEN",
  /** 409: a type carried by an agreement or a template cannot be retired - merge it first. */
  IN_USE: "AGREEMENT_TYPE_IN_USE",
  /** 400: the merge target is the source, unknown, or inactive. */
  MERGE_TARGET_INVALID: "AGREEMENT_TYPE_MERGE_TARGET_INVALID",
  /** 400: an agreement or template names a key that is not one of the org's ACTIVE types. */
  UNKNOWN: "AGREEMENT_TYPE_UNKNOWN",
} as const;
export type AgreementTypeErrorCode = (typeof AGREEMENT_TYPE_ERROR_CODES)[keyof typeof AGREEMENT_TYPE_ERROR_CODES];

/** How many agreements and templates carry a type's key - the list read answers it beside each row (the card prints it; the merge form sums it). */
export interface AgreementTypeUsage {
  agreementCount: number;
  templateCount: number;
}

export const NO_AGREEMENT_TYPE_USAGE: AgreementTypeUsage = { agreementCount: 0, templateCount: 0 };

/** The label the org gave a key, else the key itself (a row from before a rename, or a key no longer on the list); "" for no type. */
export function describeAgreementType(
  key: string | null | undefined,
  types?: ReadonlyArray<{ key: string; label: string }> | null,
): string {
  if (!key) return "";
  return types?.find((type) => type.key === key)?.label ?? key;
}

/** "16 agreements and 1 template" - the merge form's and the retire refusal's phrasing. */
export function describeAgreementTypeUsage(usage: AgreementTypeUsage): string {
  const agreements = `${usage.agreementCount} agreement${usage.agreementCount === 1 ? "" : "s"}`;
  const templates = `${usage.templateCount} template${usage.templateCount === 1 ? "" : "s"}`;
  return `${agreements} and ${templates}`;
}
