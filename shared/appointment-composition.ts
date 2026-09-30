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

import type { Appointment, Service } from "./schema";
import type { DispositionOpportunityChoice, DispositionOpportunityOutcome } from "./appointment-disposition";

/** The body of POST /api/appointments/:id/services - exactly one of the two. */
export interface AppointmentServiceAddRequest {
  /** A PENDING_SCHEDULING service at the visit's location, from the queue. */
  serviceId?: string;
  /** A new one-time (MANUAL) service, created already placed on the visit. */
  service?: NewPlacedServiceRequest;
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
    default:
      return null;
  }
}
