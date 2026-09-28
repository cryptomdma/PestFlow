// PLAN_ROADMAP_V2.md C3.7 (Pass 24): the WORK KIND of a Service, and the
// callback link. CANONICAL_DOMAIN_RULES_V1.md §10 "Service designation and
// warranty callbacks".
//
// A callback is a kind of work, not a position in a counter: a re-treatment,
// a warranty return, a follow-up on conducive conditions is a callback
// because of what it is, and it stays $0 covered whether it falls inside or
// outside the agreement's service interval. Until this pass the code
// INFERRED callbacks from a filled-slot counter on the production ledger,
// which was wrong in both directions (a real callback inside the interval
// consumed a paid slot; the last real visit was then credited $0).
//
// Vocabulary, deliberately named so it cannot be confused with two things
// that already exist:
//   - `serviceTypes.category` is FREE TEXT ("General / Termite / Rodent")
//     and stays the display grouping it is. The canon's "category" is this
//     module's `workKind`, a new column beside it.
//   - `ServiceBillingDesignation` (shared/visit-billing.ts: BILLABLE |
//     PRODUCTION) says what the invoice LINE is - collect today, or a covered
//     $0 line. The work kind says what the WORK is. Both PRODUCTION values
//     exist; the badges say which is which ("Kind: Production" here, plain
//     "Production" on the billing badge).
//
// The type carries the default (`serviceTypes.workKind`, Settings -> Service
// Types); the instance carries its own (`services.workKind`), defaulted from
// the type on every creation path and overridable per instance - the price's
// shape (type default, instance override) and the price's permissions.

import { can, PERMISSIONS, rolesWithPermission, type Permission } from "./permissions";

export const SERVICE_WORK_KINDS = ["SERVICE", "PRODUCTION", "CALLBACK"] as const;
export type ServiceWorkKind = (typeof SERVICE_WORK_KINDS)[number];

/** What every row from before Pass 24 carries, and what an unknown value reads as. */
export const DEFAULT_SERVICE_WORK_KIND: ServiceWorkKind = "SERVICE";

export function isServiceWorkKind(value: unknown): value is ServiceWorkKind {
  return typeof value === "string" && (SERVICE_WORK_KINDS as readonly string[]).includes(value);
}

/** A stored value as a kind - a row inserted by raw SQL or from before the column reads as SERVICE. */
export function normalizeServiceWorkKind(value: string | null | undefined): ServiceWorkKind {
  return isServiceWorkKind(value) ? value : DEFAULT_SERVICE_WORK_KIND;
}

export function isCallbackKind(value: string | null | undefined): boolean {
  return normalizeServiceWorkKind(value) === "CALLBACK";
}

export function formatServiceWorkKind(kind: string | null | undefined): string {
  switch (normalizeServiceWorkKind(kind)) {
    case "CALLBACK":
      return "Callback";
    case "PRODUCTION":
      return "Production";
    default:
      return "Service";
  }
}

/** The one-line meaning under the Select and behind the badge. */
export function describeServiceWorkKind(kind: string | null | undefined): string {
  switch (normalizeServiceWorkKind(kind)) {
    case "CALLBACK":
      return "Answers an earlier service - a re-treatment, a warranty return, a follow-up. $0 unless a price is set; earns no production credit.";
    case "PRODUCTION":
      return "An agreement's scheduled visit - production work, billed by the agreement's plan.";
    default:
      return "Billable work priced on its own - a one-time job or an add-on.";
  }
}

/** The badge's text: prefixed so it is never read as the BILLABLE / PRODUCTION billing badge. */
export function formatServiceWorkKindBadge(kind: string | null | undefined): string {
  return `Kind: ${formatServiceWorkKind(kind)}`;
}

/**
 * The creation default: the type's kind, with one exception. An agreement's
 * own scheduled visit (source AGREEMENT_GENERATED or AGREEMENT_INITIAL) is
 * never a callback - it is the work the agreement schedules, and there is
 * nothing for it to answer - so a CALLBACK type on an agreement reads as
 * PRODUCTION there. A MANUAL service on an agreement customer keeps the
 * type's CALLBACK: that is the warranty callback this pass exists for.
 */
export function defaultWorkKindForService(input: {
  typeKind: string | null | undefined;
  source: string | null | undefined;
  hasAgreement: boolean;
}): ServiceWorkKind {
  const typeKind = normalizeServiceWorkKind(input.typeKind);
  const isAgreementVisit = input.hasAgreement && (input.source === "AGREEMENT_GENERATED" || input.source === "AGREEMENT_INITIAL");
  if (typeKind === "CALLBACK" && isAgreementVisit) {
    return "PRODUCTION";
  }
  return typeKind;
}

// --- The callback link -------------------------------------------------------

export type CallbackLinkRefusalCode =
  | "CALLBACK_LINK_REQUIRED"
  | "CALLBACK_LINK_NOT_ALLOWED"
  | "CALLBACK_LINK_NOT_FOUND"
  | "CALLBACK_LINK_SELF"
  | "CALLBACK_LINK_LOCATION_MISMATCH"
  | "CALLBACK_LINK_NOT_COMPLETED"
  | "CALLBACK_LINK_IS_CALLBACK";

export interface CallbackLinkRefusal {
  code: CallbackLinkRefusalCode;
  message: string;
}

/**
 * The part of the rule that needs no database: a CALLBACK names the Service
 * it answers, and nothing else may carry a link. Required, not optional
 * (canon §10): an unattributed callback is invisible to exactly the analysis
 * callbacks exist to support.
 */
export function resolveCallbackLinkShape(workKind: string | null | undefined, answersServiceId: string | null | undefined): CallbackLinkRefusal | null {
  const kind = normalizeServiceWorkKind(workKind);
  if (kind === "CALLBACK" && !answersServiceId) {
    return { code: "CALLBACK_LINK_REQUIRED", message: "A callback must name the service it answers - pick one of the location's completed services." };
  }
  if (kind !== "CALLBACK" && answersServiceId) {
    return { code: "CALLBACK_LINK_NOT_ALLOWED", message: `Only a callback answers an earlier service; this service's kind is ${formatServiceWorkKind(kind)}.` };
  }
  return null;
}

/** What the answered row must look like - the same predicate the picker filters on. */
export interface AnswerableService {
  id: string;
  locationId: string;
  status: string;
  workKind: string | null | undefined;
}

/**
 * The picker's predicate: a previous Service is one that was performed
 * (COMPLETED) and is not itself a callback - a second callback on the same
 * problem answers the ORIGINAL too, so the callback rate per original service
 * is one group-by, never a chain walk.
 */
export function canAnswerService(candidate: Pick<AnswerableService, "status" | "workKind">): boolean {
  return candidate.status === "COMPLETED" && !isCallbackKind(candidate.workKind);
}

/** The rest of the rule, given the answered row (or none): same location, completed, not a callback, not itself. */
export function resolveCallbackLinkTarget(input: {
  /** The callback's own id, or null while it is being created. */
  serviceId: string | null;
  /** The callback's location. */
  locationId: string;
  answered: AnswerableService | null | undefined;
}): CallbackLinkRefusal | null {
  const { answered } = input;
  if (!answered) {
    return { code: "CALLBACK_LINK_NOT_FOUND", message: "The service this callback answers was not found." };
  }
  if (input.serviceId && answered.id === input.serviceId) {
    return { code: "CALLBACK_LINK_SELF", message: "A callback cannot answer itself." };
  }
  if (answered.locationId !== input.locationId) {
    return { code: "CALLBACK_LINK_LOCATION_MISMATCH", message: "A callback answers a service at the same location." };
  }
  if (isCallbackKind(answered.workKind)) {
    return { code: "CALLBACK_LINK_IS_CALLBACK", message: "A callback answers the original service, not another callback - pick the service the first callback answered." };
  }
  if (answered.status !== "COMPLETED") {
    return { code: "CALLBACK_LINK_NOT_COMPLETED", message: "A callback answers a service that was performed - pick a completed service." };
  }
  return null;
}

/** "Answers <type> on <date>" - the queue, the dispatch sheet, the Service Details. */
export function describeAnswersLink(serviceTypeName: string, dateText: string): string {
  return `Answers ${serviceTypeName} on ${dateText}`;
}

// --- The instance override -----------------------------------------------------

export type WorkKindRefusalCode = "WORK_KIND_FORBIDDEN" | "SERVICE_KIND_LOCKED";

export interface WorkKindRefusal {
  code: WorkKindRefusalCode;
  message: string;
}

/**
 * Who may set a Service's kind away from its type's default, or change it
 * later: the price's rule, because the kind decides the same thing the
 * price decides - what the visit's line is (a CALLBACK is $0). Every role
 * holds ADJUST_PRICE_NON_AGREEMENT; ADJUST_PRICE_AGREEMENT is manager+.
 */
export function workKindOverridePermission(isAgreementService: boolean): Permission {
  return isAgreementService ? PERMISSIONS.ADJUST_PRICE_AGREEMENT : PERMISSIONS.ADJUST_PRICE_NON_AGREEMENT;
}

/** Null when the actor may; a server-driven write (generation, the seed, a conversion) has no actor and always may. */
export function resolveWorkKindOverrideGate(input: { actorRole: string | null | undefined; isAgreementService: boolean }): WorkKindRefusal | null {
  if (input.actorRole == null) {
    return null;
  }
  const permission = workKindOverridePermission(input.isAgreementService);
  if (can(input.actorRole, permission)) {
    return null;
  }
  return {
    code: "WORK_KIND_FORBIDDEN",
    message: input.isAgreementService
      ? `An agreement service's kind is locked - ${rolesWithPermission(permission).join(" or ")} may change it.`
      : `Your role may not change a service's kind - ${rolesWithPermission(permission).join(" or ")} may.`,
  };
}

// --- The ledger ----------------------------------------------------------------

/** The main production entry's basis, read from the kind and the agreement link - never from a slot counter. */
export type ServiceProductionBasis = "CALLBACK" | "SCHEDULED_AGREEMENT_SERVICE" | "ONE_TIME_SERVICE";

/**
 * A CALLBACK earns no production (canon §13: "no production on callbacks"),
 * priced or not - a deliberate charge for non-compliance is billing, not
 * production; Phase 7's comp plans can pay on collected revenue. An
 * agreement's PRODUCTION or SERVICE visit is a scheduled agreement service
 * WHATEVER its position in the count: the counter is gone, so an extra visit
 * past expectedServiceCount credits the per-visit value like any other, and
 * the office's designation - not a position - is what makes a visit a
 * callback. A service with no agreement is a one-time job at its own price.
 */
export function productionBasisForService(input: { workKind: string | null | undefined; hasAgreement: boolean }): ServiceProductionBasis {
  if (isCallbackKind(input.workKind)) {
    return "CALLBACK";
  }
  return input.hasAgreement ? "SCHEDULED_AGREEMENT_SERVICE" : "ONE_TIME_SERVICE";
}
