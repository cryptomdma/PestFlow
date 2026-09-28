// PLAN_ROADMAP_V2.md C3.6 (Pass 23): the field surcharge line.
//
// A cleanout surcharge is NOT a term of the sale (owner, 2026-09-13, the
// Pass 5.5 review under PLAN_BILLING_V1_1.md D4): the technician charges it
// at the initial service for what scheduling could not see - a larger home,
// conducive conditions - and it is owed IN ADDITION to the contract price,
// unlike a down payment. So it is a line the technician adds on the ticket:
// an amount and a short label on the Service Record (the ticket's content -
// edited by the office's PATCH, snapshotted by `ticket_edited`, printed by
// the service report), never a change to the Service's price (D6: price is
// never mutated; the surcharge is its own SURCHARGE line on the visit
// invoice, taxed like the service line, never counted toward the contract
// price and never "covered"). Whether the technician MAY add one is the
// agreement template's toggle (`agreementTemplates.fieldSurchargeAllowed`);
// whether this user may is ADD_FIELD_SURCHARGE. Both are decided here, once,
// so the server's refusal and the ticket dialog's disabled input give the
// same reason (development rule 6: disabled with the reason, never hidden).

import { can, PERMISSIONS, rolesWithPermission } from "./permissions";

/** The label a surcharge carries when the technician types none. */
export const DEFAULT_SURCHARGE_LABEL = "Cleanout surcharge";

/** Longest label the ticket accepts - it is printed on the invoice line and the service report. */
export const MAX_SURCHARGE_LABEL_LENGTH = 60;

/**
 * TRANSITIONAL (development rule 4): until Phase 7's comp engine carries the
 * per-plan selector "earns production on surcharge lines: yes / no" (owner,
 * 2026-09-13), a recorded SURCHARGE line ALWAYS credits the posting
 * technician with its amount as a basis SURCHARGE production-value entry -
 * standing in for a plan that answers "yes". This replaced Pass 5.5's
 * inference from the initial-charge collector permission
 * (createSurchargeEntryIfConfigured), which credited a configuration rather
 * than a recorded line. Named so the ledger write and the docs cite one rule.
 */
export const SURCHARGE_CREDIT_RULE = "TRANSITIONAL_ALWAYS_CREDITS_POSTING_TECHNICIAN";

/** The two columns as stored on the ticket: both null, or a positive amount with a label. */
export interface SurchargeFields {
  surchargeCents: number | null;
  surchargeLabel: string | null;
}

export const NO_SURCHARGE: SurchargeFields = { surchargeCents: null, surchargeLabel: null };

/**
 * The invariants every writer goes through. No amount, or a zero one, means
 * no surcharge at all - the label is dropped with it, so a stale label can
 * never survive clearing the amount. A positive amount without a label takes
 * the default; a label is trimmed and capped. A negative or fractional amount
 * is the caller's to refuse (the route schemas do) - here it reads as none.
 */
export function normalizeSurcharge(input: { surchargeCents?: number | null; surchargeLabel?: string | null }): SurchargeFields {
  const cents = typeof input.surchargeCents === "number" && Number.isFinite(input.surchargeCents) ? Math.round(input.surchargeCents) : null;
  if (cents == null || cents <= 0) {
    return { ...NO_SURCHARGE };
  }
  const label = (input.surchargeLabel ?? "").trim().slice(0, MAX_SURCHARGE_LABEL_LENGTH);
  return { surchargeCents: cents, surchargeLabel: label || DEFAULT_SURCHARGE_LABEL };
}

/** True when the surcharge as stored differs from the surcharge as sent - the one case that is gated and audited. */
export function surchargeChanged(before: SurchargeFields, after: SurchargeFields): boolean {
  return before.surchargeCents !== after.surchargeCents || before.surchargeLabel !== after.surchargeLabel;
}

/** What a record carries, normalized - a row from before Pass 23 reads as none. */
export function surchargeOf(record: { surchargeCents?: number | null; surchargeLabel?: string | null } | null | undefined): SurchargeFields {
  return normalizeSurcharge({ surchargeCents: record?.surchargeCents ?? null, surchargeLabel: record?.surchargeLabel ?? null });
}

export type FieldSurchargeRefusalCode = "SURCHARGE_FORBIDDEN" | "SURCHARGE_NOT_ALLOWED";

export interface FieldSurchargeRefusal {
  code: FieldSurchargeRefusalCode;
  message: string;
}

export interface FieldSurchargeGateInput {
  /** The session's role - ADD_FIELD_SURCHARGE decides whether this user may add or change one. */
  actorRole: string;
  /** True for an agreement-generated service: then the agreement's template must allow the surcharge. */
  isAgreementService: boolean;
  /**
   * The agreement's template, when the service has an agreement: its toggle
   * decides. Null for an agreement with no template - then nothing allows the
   * surcharge and it is refused (the safe direction: a refused surcharge is
   * the visible failure, a charge nobody authorized is the silent one).
   * Ignored for a non-agreement service, which has no template to ask.
   */
  template: { name?: string | null; fieldSurchargeAllowed: boolean } | null | undefined;
  /**
   * True when the body adds or changes a surcharge; false when it removes
   * one. Removing needs the permission only - the template says whether the
   * technician may ADD a charge, and taking one off never needs its consent.
   */
  adding: boolean;
}

/**
 * Whether this actor may record this surcharge on this service. Null means
 * yes. The same function gates the post and the office edit on the server
 * (403 with the code, before anything is written) and disables the ticket
 * dialog's input with the same message.
 *
 * A non-agreement service (one-time / COD work) has no template to consult:
 * ADD_FIELD_SURCHARGE alone gates it. The technician may already set such a
 * service's price (ADJUST_PRICE_NON_AGREEMENT); a labelled surcharge line is
 * the more honest record of extra work than folding it into the price (D6),
 * so it is allowed rather than refused for lack of a template.
 */
export function resolveFieldSurchargeGate(input: FieldSurchargeGateInput): FieldSurchargeRefusal | null {
  if (!can(input.actorRole, PERMISSIONS.ADD_FIELD_SURCHARGE)) {
    return {
      code: "SURCHARGE_FORBIDDEN",
      message: `Adding a surcharge on the ticket needs a ${rolesWithPermission(PERMISSIONS.ADD_FIELD_SURCHARGE).join(" or ")}.`,
    };
  }
  if (!input.adding || !input.isAgreementService) {
    return null;
  }
  if (!input.template) {
    return {
      code: "SURCHARGE_NOT_ALLOWED",
      message: "This agreement has no template, so no template allows a field surcharge on its services.",
    };
  }
  if (!input.template.fieldSurchargeAllowed) {
    const name = input.template.name?.trim();
    return {
      code: "SURCHARGE_NOT_ALLOWED",
      message: `The agreement's template${name ? ` "${name}"` : ""} does not allow a field surcharge; the office can allow it under Settings, Agreement Templates.`,
    };
  }
  return null;
}

function formatCentsPlain(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** "Cleanout surcharge $50.00" for a ticket that carries one; null otherwise. The review modal, the Services tab and the report print it. */
export function describeSurcharge(record: { surchargeCents?: number | null; surchargeLabel?: string | null } | null | undefined): string | null {
  const surcharge = surchargeOf(record);
  if (surcharge.surchargeCents == null) {
    return null;
  }
  return `${surcharge.surchargeLabel} ${formatCentsPlain(surcharge.surchargeCents)}`;
}

/**
 * The invoice line's description: "<label> - <service type> - <date>", the
 * service line's own "<service type> - <date>" with the label in front, so
 * the two lines read as a pair on the invoice and in the visit's figures.
 */
export function surchargeLineDescription(label: string, serviceTypeName: string, dateText: string): string {
  return `${label} - ${serviceTypeName} - ${dateText}`;
}
