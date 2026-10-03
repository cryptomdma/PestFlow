// Pass 28 (PLAN_ROADMAP_V2.md C4.3a; B13 "Appointment Details"; the owner's
// review of 2026-09-25, finding 5): the composition of a visit - which
// Services are on an Appointment - and cancelling ONE Service, placed or
// pending. The vocabulary the server, the routes and the dispatch sheet
// share, plus the two pure rules (the planned end, the representative).
//
// Four routes, each one transaction through getLinkedServicesForAppointmentTx
// and one audit row:
// - POST  /api/appointments/:id/services                  add a queued service, or create one placed
// - POST  /api/appointments/:id/services/:serviceId/remove  return ONE service to the queue (dates kept)
// - PATCH /api/appointments/:id/services/:serviceId       the service's type (agreement work locked) or duration
// - POST  /api/services/:id/cancel                        cancel ONE service outright, placed or pending
// The disposition (shared/appointment-disposition.ts) stays the only way an
// Appointment leaves the board; the LAST service on a visit is refused here
// so the office reschedules or cancels the appointment instead.
//
// Pass 29 (PLAN_ROADMAP_V2.md C4.3b; B13; Part E answer 7): the technician's
// side of the same routes. The add carries an ORIGIN - OFFICE (the default,
// the dispatch sheet and the board) or FIELD (the technician's Appointment
// Details). A FIELD add is one-time work only (a new MANUAL service at the
// visit's location; the queue's pending services are the office's to place),
// is attributed to the session user (services.addedInFieldByUserId) and so
// FLAGGED FOR OFFICE REVIEW until the office marks it reviewed (POST
// /api/services/:id/field-review), and is REFUSED when the visit's extended
// end would run into the technician's NEXT STOP (NEXT_STOP_OVERLAP) - the
// office's add is never refused for that, only told. A technician edits the
// instructions (services.notes) only on a service they added
// (SERVICE_INSTRUCTIONS_LOCKED on the generic PATCH); the type is the same
// PATCH as the sheet's, locked on agreement work as everywhere.

import type { Appointment, Service } from "./schema";
import type { DispositionOpportunityChoice, DispositionOpportunityOutcome } from "./appointment-disposition";

/** Where an add comes from (Pass 29). OFFICE is the default; FIELD turns on the one-time-only rule, the flag stamp and the next-stop check. */
export const COMPOSITION_ORIGINS = ["OFFICE", "FIELD"] as const;
export type CompositionOrigin = (typeof COMPOSITION_ORIGINS)[number];

/** The body of POST /api/appointments/:id/services - exactly one of serviceId / service. */
export interface AppointmentServiceAddRequest {
  /** A PENDING_SCHEDULING service at the visit's location, from the queue. Refused with origin FIELD. */
  serviceId?: string;
  /** A new one-time (MANUAL) service, created already placed on the visit. */
  service?: NewPlacedServiceRequest;
  /** Pass 29: OFFICE (default) or FIELD - the technician's Appointment Details. */
  origin?: CompositionOrigin;
}

export interface NewPlacedServiceRequest {
  serviceTypeId: string;
  /** Defaults to the type's estimatedDuration. */
  expectedDurationMinutes?: number | null;
  /** Defaults to the type's defaultPriceCents. */
  priceCents?: number | null;
  notes?: string | null;
  timeWindow?: string | null;
  /** The work kind, else the type's default; a callback names the service it answers (Pass 24's rules). */
  workKind?: string;
  answersServiceId?: string | null;
}

/** The body of PATCH /api/appointments/:id/services/:serviceId - at least one field. */
export interface AppointmentServiceUpdateRequest {
  serviceTypeId?: string;
  expectedDurationMinutes?: number | null;
}

/** The body of POST /api/services/:id/cancel - the disposition's CANCEL semantics for one service. */
export interface ServiceCancelRequest {
  /** Required, from the settings list (appointment_cancel_reschedule_reasons). */
  reasonCode: string;
  notes?: string | null;
  opportunity: DispositionOpportunityChoice;
}

/**
 * Pass 29: the technician's next stop after a visit, as an add computed it -
 * the next board placement (not CANCELED) assigned to the same technician on
 * the visit's day. `overlapped` is true when the add extended the planned
 * end past the next stop's start; a FIELD add is refused on it
 * (NEXT_STOP_OVERLAP), an OFFICE add is told.
 */
export interface NextStopRef {
  appointmentId: string;
  scheduledDate: Date;
  /** The visit's planned end after the add (null when nothing is known). */
  plannedEnd: Date | null;
  overlapped: boolean;
}

/** What an add / remove / update did to the visit. */
export interface AppointmentCompositionResult {
  appointment: Appointment;
  /** The service added, removed or changed. */
  service: Service;
  /** Every service now on the visit (getLinkedServicesForAppointmentTx), the representative included. */
  services: Service[];
  /** Minutes the visit's planned end grew by (never negative - the end never shrinks). */
  scheduledEndDateExtendedMinutes: number;
  /** Open reschedule / cancel-review opportunities on the added service that the placement converted. */
  opportunitiesConverted: number;
  /** Pass 29: true when the add stamped the service as added in the field (origin FIELD) - flagged for office review. */
  flagged: boolean;
  /** Pass 29: the technician's next stop, when an add had one to measure against; null otherwise (a remove / update, no technician, the day's last visit). */
  nextStop: NextStopRef | null;
}

/** CANCELLED: a one-time service is done. REQUEUED: an agreement service is recycled (window reset from today), never cancelled - ending the plan is the agreement workflow. */
export type ServiceCancelEffect = "CANCELLED" | "REQUEUED";

export interface ServiceCancelResult {
  service: Service;
  /** The live visit the service came off, or null for a pending service. */
  appointment: Appointment | null;
  effect: ServiceCancelEffect;
  windowReset: boolean;
  /** True when the service was taken off a live visit (appointmentId cleared, lastAppointmentId stamped). */
  detached: boolean;
  opportunities: DispositionOpportunityOutcome[];
}

// Error codes the routes answer with, beside the message.
/** 409: the visit has one active service left - reschedule or cancel the appointment instead. */
export const LAST_SERVICE_ON_APPOINTMENT = "LAST_SERVICE_ON_APPOINTMENT";
/** 404: the service is not placed on this appointment. */
export const SERVICE_NOT_ON_APPOINTMENT = "SERVICE_NOT_ON_APPOINTMENT";
/** 409: the queued service is not PENDING_SCHEDULING (placed elsewhere, completed, cancelled). */
export const SERVICE_NOT_PENDING = "SERVICE_NOT_PENDING";
/** 409: the service belongs to another location than the visit. */
export const SERVICE_LOCATION_MISMATCH = "SERVICE_LOCATION_MISMATCH";
/** 409: the appointment is CANCELED or COMPLETED - its composition is history. */
export const APPOINTMENT_NOT_COMPOSABLE = "APPOINTMENT_NOT_COMPOSABLE";
/** 409: the visit's invoice is issued - its lines are frozen. */
export const VISIT_INVOICED = "VISIT_INVOICED";
/** 409: the service is COMPLETED or CANCELLED. */
export const SERVICE_SETTLED = "SERVICE_SETTLED";
/** 409: a ticket is posted on the service - the work happened; the ticket flow owns it. */
export const SERVICE_HAS_TICKET = "SERVICE_HAS_TICKET";
/** 403: an agreement service's type needs ADJUST_PRICE_AGREEMENT (the price's rule, Pass 24's precedent). */
export const SERVICE_TYPE_LOCKED = "SERVICE_TYPE_LOCKED";
/** 400: the named service type is not one of the org's. */
export const SERVICE_TYPE_UNKNOWN = "SERVICE_TYPE_UNKNOWN";
/** 400: the add body named neither a queued service nor a new one. */
export const ADD_SERVICE_TARGET_REQUIRED = "ADD_SERVICE_TARGET_REQUIRED";
/** 409: PATCH /api/services/:id { status: CANCELLED } - cancelling is POST /api/services/:id/cancel's. */
export const SERVICE_CANCEL_REQUIRED = "SERVICE_CANCEL_REQUIRED";
/** 409: PATCH /api/services/:id detaching a placed service - removing is the composition route's. */
export const SERVICE_REMOVE_REQUIRED = "SERVICE_REMOVE_REQUIRED";
// Pass 29 (C4.3b) - the field's codes.
/** 409: a FIELD add would run the visit's planned end past the technician's next stop (B13). The message names both times. */
export const NEXT_STOP_OVERLAP = "NEXT_STOP_OVERLAP";
/** 400: a FIELD add named a queued service - the field adds a new one-time service only; the queue is the office's. */
export const FIELD_ADD_NEW_ONLY = "FIELD_ADD_NEW_ONLY";
/** 400: a FIELD add with no session user to attribute it to. */
export const FIELD_ACTOR_REQUIRED = "FIELD_ACTOR_REQUIRED";
/** 403: a technician changing the instructions (notes) of a service they did not add in the field. */
export const SERVICE_INSTRUCTIONS_LOCKED = "SERVICE_INSTRUCTIONS_LOCKED";
/** 409: POST /api/services/:id/field-review on a service that was not added in the field. */
export const SERVICE_NOT_FIELD_ADDED = "SERVICE_NOT_FIELD_ADDED";
/** 409: POST /api/services/:id/field-review on a service the office already reviewed. */
export const SERVICE_FIELD_REVIEWED = "SERVICE_FIELD_REVIEWED";

/** A service that still counts on a visit: not settled. */
export function isActiveOnVisit(service: Pick<Service, "status">): boolean {
  return service.status !== "COMPLETED" && service.status !== "CANCELLED";
}

/**
 * The representative (appointments.serviceId) after a service leaves the
 * visit: the first remaining sibling by creation, exactly as deleteService
 * reassigns it - never null while a service remains, since
 * getLinkedServicesForAppointmentTx, the generic PATCH's sync and
 * completeService all still read it.
 */
export function pickRepresentative(remaining: Array<Pick<Service, "id" | "createdAt">>): Pick<Service, "id" | "createdAt"> | null {
  if (!remaining.length) return null;
  return [...remaining].sort((left, right) => {
    const byCreated = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return byCreated !== 0 ? byCreated : left.id.localeCompare(right.id);
  })[0];
}

/**
 * The visit's planned end as the board reads it: scheduledEndDate when set,
 * else the representative's expected duration after the start, else null.
 * Only the client ever wrote scheduledEndDate before this pass (placement =
 * slot + the representative's expectedDurationMinutes).
 */
export function plannedEndOf(
  appointment: Pick<Appointment, "scheduledDate" | "scheduledEndDate">,
  representativeExpectedMinutes: number | null | undefined,
): Date | null {
  if (appointment.scheduledEndDate) return new Date(appointment.scheduledEndDate);
  if (representativeExpectedMinutes && representativeExpectedMinutes > 0) {
    return new Date(new Date(appointment.scheduledDate).getTime() + representativeExpectedMinutes * 60_000);
  }
  return null;
}

/**
 * Decision (3) of Pass 28: adding a service extends the visit's planned end
 * by the added service's expected duration, a longer duration extends it by
 * the difference, and the end NEVER shrinks - removing a service or
 * shortening one leaves it, and the office shortens it on the sheet. Returns
 * the end to store (null when nothing is known) and the minutes it grew.
 */
export function extendPlannedEnd(
  appointment: Pick<Appointment, "scheduledDate" | "scheduledEndDate">,
  representativeExpectedMinutes: number | null | undefined,
  deltaMinutes: number | null | undefined,
): { scheduledEndDate: Date | null; extendedMinutes: number } {
  const current = plannedEndOf(appointment, representativeExpectedMinutes);
  const delta = deltaMinutes && deltaMinutes > 0 ? Math.round(deltaMinutes) : 0;
  if (delta === 0) {
    return { scheduledEndDate: current, extendedMinutes: 0 };
  }
  const base = current ?? new Date(appointment.scheduledDate);
  return { scheduledEndDate: new Date(base.getTime() + delta * 60_000), extendedMinutes: delta };
}

/** The sheet's one-line explanation of the end-date rule. */
export const PLANNED_END_RULE_TEXT =
  "Adding a service, or lengthening one, extends the visit's end by that duration. Removing or shortening one never shrinks it - adjust Scheduled End above.";

/** Pass 29: the technician's Add service form's caption - B13's rule and Part E answer 7 in one line. */
export const FIELD_ADD_RULE_TEXT =
  "Adding a service extends this visit's end by its minutes and is refused if that would run into your next stop. The office is asked to review every service added from the field.";

/** Pass 29: true when the add's extension ran the planned end past the next stop's start. An add that extends nothing cannot overlap. */
export function overlapsNextStop(plannedEnd: Date | null | undefined, nextStart: Date | string | null | undefined, extendedMinutes: number): boolean {
  if (!plannedEnd || !nextStart || extendedMinutes <= 0) return false;
  return plannedEnd.getTime() > new Date(nextStart).getTime();
}

function formatStopTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Pass 29: the NEXT_STOP_OVERLAP refusal's text, naming the would-be end and the next stop's start - built on the server, shown by the field as it is. */
export function describeNextStopOverlap(nextStart: Date | string, plannedEnd: Date | string): string {
  return `Adding this service would run the visit to ${formatStopTime(plannedEnd)}, past your next stop at ${formatStopTime(nextStart)}. Finish this visit first, or ask the office to move the next stop.`;
}

/** Pass 29: the office's warning when its own add ran past the technician's next stop (never refused). */
export function describeNextStopWarning(nextStop: Pick<NextStopRef, "scheduledDate" | "plannedEnd" | "overlapped"> | null | undefined): string | null {
  if (!nextStop?.overlapped || !nextStop.plannedEnd) return null;
  return `The visit now runs to ${formatStopTime(nextStop.plannedEnd)}, past the technician's next stop at ${formatStopTime(nextStop.scheduledDate)}`;
}

/** The columns the field-review rules read. Satisfied by a Service row. */
export interface FieldReviewFields {
  addedInFieldByUserId: string | null;
  fieldReviewedAt: Date | string | null;
  fieldReviewedByLabel: string | null;
}

/** Pass 29: added to a visit from the field (the stamp is never cleared). */
export function isFieldAdded(service: FieldReviewFields): boolean {
  return !!service.addedInFieldByUserId;
}

/** Pass 29: added from the field and not yet marked reviewed by the office - the "Field-added - review" badge. */
export function needsFieldReview(service: FieldReviewFields): boolean {
  return isFieldAdded(service) && !service.fieldReviewedAt;
}

/** Pass 29: the badge's title. */
export function describeFieldAddedService(service: FieldReviewFields): string {
  if (!isFieldAdded(service)) return "";
  if (!service.fieldReviewedAt) return "Added to the visit by the technician in the field - awaiting office review.";
  const when = new Date(service.fieldReviewedAt).toLocaleString();
  return `Added to the visit by the technician in the field; reviewed${service.fieldReviewedByLabel ? ` by ${service.fieldReviewedByLabel}` : ""} on ${when}.`;
}

/** What the cancel dialog says will happen to this service. */
export function describeServiceCancelEffect(service: Pick<Service, "agreementId" | "appointmentId" | "status">): string {
  const onVisit = !!service.appointmentId && service.status === "SCHEDULED";
  if (service.agreementId) {
    return `An agreement service is never cancelled outright: it ${onVisit ? "comes off this visit and " : ""}returns to the pending queue with its due date and service window reset from today, and the opportunity choice keeps it visible. To end the plan itself, cancel the agreement.`;
  }
  return `This one-time service is cancelled${onVisit ? " and taken off its visit" : ""}. A Win-back opportunity is how the office keeps the customer visible.`;
}

/** The client's message for a refusal code, else null (the server's message is shown). */
export function describeCompositionRefusal(code: string | null | undefined): string | null {
  switch (code) {
    case LAST_SERVICE_ON_APPOINTMENT:
      return "This is the only active service on its visit. Reschedule or cancel the appointment instead - the visit leaves the board only through its disposition.";
    case SERVICE_HAS_TICKET:
      return "A ticket is posted on this service, so the work happened. Reopen or edit the ticket instead.";
    case SERVICE_SETTLED:
      return "This service is already completed or cancelled.";
    case VISIT_INVOICED:
      return "This visit's invoice is issued, so its lines are frozen. A correction is a credit memo.";
    case APPOINTMENT_NOT_COMPOSABLE:
      return "This appointment is cancelled or completed - its services are history.";
    case SERVICE_TYPE_LOCKED:
      return "An agreement service's type is locked. A manager or an admin may change it.";
    // Pass 29. NEXT_STOP_OVERLAP has no fixed text: the server's message
    // names the two times (describeNextStopOverlap), so it is shown as sent.
    case FIELD_ADD_NEW_ONLY:
      return "From the field a new one-time service is added to the visit. A queued service is placed by the office.";
    case SERVICE_INSTRUCTIONS_LOCKED:
      return "Instructions can be edited in the field only on a service you added. Ask the office to change these.";
    case SERVICE_NOT_FIELD_ADDED:
      return "This service was not added in the field - there is nothing to review.";
    case SERVICE_FIELD_REVIEWED:
      return "This field-added service was already reviewed.";
    default:
      return null;
  }
}
