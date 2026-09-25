// Pass 27 (PLAN_ROADMAP_V2.md C4.2; B2 with the owner's refinements of
// 2026-09-19; PLAN_BILLING_V1_1.md D8 "Unschedule action"): one path for
// taking an appointment off the board, and the vocabulary the server and the
// client share for it.
//
// Two modes on one route, POST /api/appointments/:id/disposition:
// - RESCHEDULE pulls the visit off the technician's schedule and returns its
//   services to PENDING_SCHEDULING, dates untouched, for the office to place
//   again. No reason is required, no policy fires, and from the board no
//   opportunity is created.
// - CANCEL starts the cancel flow: a reason from the settings list is
//   required; agreement services recycle to the queue with their service
//   window reset from the cancel date (the visit is not silently missed);
//   one-time services are cancelled; the opportunity choice runs.
// Both write the same appointment shape (Q4 / D1a: no fifth status): status
// CANCELED, rescheduleRequested true for a reschedule and false for a cancel,
// cancelReason null unless a reason was given. The UI distinguishes on the
// flag, never on the reason.
//
// The technician's POST /api/appointments/:id/cancel-reschedule is an alias
// with origin FIELD: a handoff, not disposal (canon §9) - every service
// returns to the queue whatever the mode, and the open office-handoff
// opportunity on each service is re-dated, or created when none is open.

import type { OpportunitySource } from "./opportunities";

export const APPOINTMENT_DISPOSITION_MODES = ["CANCEL", "RESCHEDULE"] as const;
export type AppointmentDispositionMode = (typeof APPOINTMENT_DISPOSITION_MODES)[number];

/** What to do about follow-up on each service the disposition touches. */
export const DISPOSITION_OPPORTUNITY_CHOICES = ["UPDATE_EXISTING", "CREATE", "NONE"] as const;
export type DispositionOpportunityChoice = (typeof DISPOSITION_OPPORTUNITY_CHOICES)[number];

/** OFFICE is the board's route; FIELD is the technician alias (a handoff: nothing is disposed). */
export const APPOINTMENT_DISPOSITION_ORIGINS = ["OFFICE", "FIELD"] as const;
export type AppointmentDispositionOrigin = (typeof APPOINTMENT_DISPOSITION_ORIGINS)[number];

/** The request body of POST /api/appointments/:id/disposition. */
export interface AppointmentDispositionRequest {
  mode: AppointmentDispositionMode;
  /** Required for CANCEL and checked against the settings list; optional for RESCHEDULE. */
  reasonCode?: string | null;
  notes?: string | null;
  opportunity: DispositionOpportunityChoice;
  /** Q3: undefined asks (409 when a DRAFT invoice is on the visit), true voids, false keeps. */
  voidDraftInvoices?: boolean;
}

/** REQUEUED: back to PENDING_SCHEDULING. CANCELLED: the office cancelled a one-time service. SKIPPED: already settled (COMPLETED / CANCELLED) or placed on another visit since. */
export type DispositionServiceEffect = "REQUEUED" | "CANCELLED" | "SKIPPED";

export interface DispositionServiceOutcome {
  serviceId: string;
  agreementId: string | null;
  effect: DispositionServiceEffect;
  /** True when an agreement service's due date and window were reset from the cancel date. */
  windowReset: boolean;
}

export interface DispositionOpportunityOutcome {
  serviceId: string;
  opportunityId: string;
  action: "CREATED" | "UPDATED";
  categoryKey: string;
}

/** What a disposition did, returned by the route and recorded in its audit row. */
export interface AppointmentDispositionOutcome {
  mode: AppointmentDispositionMode;
  services: DispositionServiceOutcome[];
  opportunities: DispositionOpportunityOutcome[];
  draftInvoicesVoided: number;
}

// Error codes the routes answer with, beside the message.
/** 409 on PATCH /api/appointments/:id { status: "CANCELED" }: cancelling is the disposition's. */
export const CANCEL_DISPOSITION_REQUIRED = "CANCEL_DISPOSITION_REQUIRED";
/** 400: CANCEL without a reason. */
export const DISPOSITION_REASON_REQUIRED = "DISPOSITION_REASON_REQUIRED";
/** 400: a reason that is not on the settings list. */
export const DISPOSITION_REASON_NOT_ON_LIST = "DISPOSITION_REASON_NOT_ON_LIST";
/** 409: the appointment is already CANCELED or COMPLETED. */
export const APPOINTMENT_NOT_DISPOSITIONABLE = "APPOINTMENT_NOT_DISPOSITIONABLE";

/**
 * The opportunity source a disposition stamps, by the mode and by what
 * happened to the service. Pass 25's taxonomyForSource() then gives the
 * category and work type, so the "by path" default is one mapping, not two:
 * a requeued service is RESCHEDULE (work type by its agreement); a one-time
 * service the office cancelled is WINBACK - the automatic source WINBACK
 * waited for since Pass 25.
 */
export function opportunitySourceForDisposition(mode: AppointmentDispositionMode, effect: DispositionServiceEffect): OpportunitySource {
  if (effect === "CANCELLED") return "APPOINTMENT_CANCELLATION_WINBACK";
  return mode === "RESCHEDULE" ? "APPOINTMENT_RESCHEDULE_REQUIRED" : "APPOINTMENT_CANCELLATION_REVIEW";
}

/** The appointment's status for display: a CANCELED placement with the reschedule flag reads "Rescheduled". */
export function describeAppointmentStatus(appointment: { status: string; rescheduleRequested?: boolean | null }): string {
  switch (appointment.status) {
    case "CANCELED":
      return appointment.rescheduleRequested ? "Rescheduled" : "Canceled";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "SCHEDULED":
      return "Scheduled";
    default:
      return appointment.status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

// The location's Services tab (Q4's PENDING_SCHEDULING-vs-SCHEDULED gap):
// a pending service taken off the board by a reschedule reads "Rescheduling",
// one that was never placed (or was cancelled off a visit and recycled)
// reads "Pending scheduling". The "last appointment" is the placement the
// service was last taken off - services.lastAppointmentId, set by the
// disposition on every service it touches.
export type ServiceScheduleState = "DRAFT" | "PENDING" | "RESCHEDULING" | "SCHEDULED" | "COMPLETED" | "CANCELLED";

export const SERVICE_SCHEDULE_STATE_LABELS: Record<ServiceScheduleState, string> = {
  DRAFT: "Draft",
  PENDING: "Pending scheduling",
  RESCHEDULING: "Rescheduling",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function resolveServiceScheduleState(
  service: { status: string },
  lastAppointment?: { status: string; rescheduleRequested?: boolean | null } | null,
): ServiceScheduleState {
  switch (service.status) {
    case "PENDING_SCHEDULING":
      return lastAppointment?.status === "CANCELED" && !!lastAppointment.rescheduleRequested ? "RESCHEDULING" : "PENDING";
    case "SCHEDULED":
      return "SCHEDULED";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    case "DRAFT":
      return "DRAFT";
    default:
      return "PENDING";
  }
}
