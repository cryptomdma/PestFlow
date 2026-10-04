// Pass 30 (PLAN_ROADMAP_V2.md C4.4; CURRENT_FOCUS.md "Compensation &
// attribution", gap 1 "Crew"): who ran a visit, recorded as it is planned.
//
// `appointment_technicians` holds one row per technician on a visit: exactly
// one LEAD - always the same technician as appointments.assignedTechnicianId,
// kept in step by the two writers of that column (createAppointment and
// updateAppointment) - and any number of SUPPORT technicians, added and
// removed from the dispatch sheet's crew block through
// POST /api/appointments/:id/crew and DELETE /api/appointments/:id/crew/:technicianId
// (one appointment_crew_changed audit row each).
//
// Every reader that existed before this pass keeps reading
// appointments.assignedTechnicianId: the board, the technician's day (which
// now also lists the visits a technician supports, read-only), the ticket's
// technician snapshot and therefore the production ledger - a production
// entry still credits ONE technician (the ticket's) until Phase 7's split
// allocation reads this table. A SUPPORT technician the customer excluded is
// refused like a placement (TECHNICIAN_EXCLUDED, manager override).

export const APPOINTMENT_CREW_ROLES = ["LEAD", "SUPPORT"] as const;
export type AppointmentCrewRole = (typeof APPOINTMENT_CREW_ROLES)[number];

export interface AppointmentCrewMember {
  technicianId: string;
  technicianName: string;
  role: AppointmentCrewRole;
  createdAt: string | Date;
}

/** GET /api/appointments/:id/crew and the result of an add / remove. */
export interface AppointmentCrew {
  appointmentId: string;
  /** The lead first, then support by name. */
  members: AppointmentCrewMember[];
}

/** The technician's day: the role this technician has on a visit. */
export type TechnicianWorkCrewRole = AppointmentCrewRole;

// Error codes the routes answer with, beside the message.
/** 409: a support technician needs a lead - assign the visit's technician first. */
export const CREW_LEAD_REQUIRED = "CREW_LEAD_REQUIRED";
/** 409: the technician is already on the crew (as lead or support). */
export const CREW_MEMBER_EXISTS = "CREW_MEMBER_EXISTS";
/** 409: the lead leaves the crew by changing the visit's technician, not through the crew route. */
export const CREW_LEAD_NOT_REMOVABLE = "CREW_LEAD_NOT_REMOVABLE";
/** 404: the technician is not on this visit's crew. */
export const CREW_MEMBER_NOT_FOUND = "CREW_MEMBER_NOT_FOUND";
/** 409: the visit is cancelled or completed - its crew is history. */
export const CREW_NOT_EDITABLE = "CREW_NOT_EDITABLE";
/**
 * Pass 30b (owner, 2026-10-03): 409 - the support technician already has a
 * visit (as lead or support) whose planned window overlaps this one. The body
 * lists `conflicts`; the add is resent with `confirmConflicts: true` once the
 * user confirms, and the ADD row records what was acknowledged.
 */
export const CREW_SCHEDULE_CONFLICT = "CREW_SCHEDULE_CONFLICT";

/** A visit's planned length when it has no end and its service names no duration (the board's fallback). */
export const DEFAULT_VISIT_MINUTES = 60;

/** The planned window: the stored end, else start + the representative's duration, else start + DEFAULT_VISIT_MINUTES. */
export function plannedWindow(start: Date | string, end: Date | string | null | undefined, fallbackMinutes: number | null | undefined): { start: Date; end: Date } {
  const from = new Date(start);
  const stored = end ? new Date(end) : null;
  if (stored && stored.getTime() > from.getTime()) {
    return { start: from, end: stored };
  }
  const minutes = fallbackMinutes && fallbackMinutes > 0 ? fallbackMinutes : DEFAULT_VISIT_MINUTES;
  return { start: from, end: new Date(from.getTime() + minutes * 60000) };
}

/** Two windows overlap when each starts before the other ends; back-to-back (end == start) does not. */
export function windowsOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export interface CrewScheduleConflict {
  appointmentId: string;
  /** The technician's role on the other visit. */
  role: AppointmentCrewRole;
  scheduledDate: string | Date;
  plannedEnd: string | Date;
  customerName: string;
}

function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "John Doe is already booked 9:00 AM - 10:00 AM (Smith, lead)." - the 409's message and the prompt's lines. */
export function describeCrewConflict(conflict: CrewScheduleConflict): string {
  return `${formatTime(conflict.scheduledDate)} - ${formatTime(conflict.plannedEnd)}: ${conflict.customerName || "a visit"} (${conflict.role === "LEAD" ? "lead" : "support"})`;
}

export function describeCrewConflicts(technicianName: string, conflicts: CrewScheduleConflict[]): string {
  return `${technicianName} is already booked during this visit: ${conflicts.map(describeCrewConflict).join("; ")}. Confirm to add them anyway.`;
}

/** Pass 30b: the board's support cards - GET /api/appointment-crews/support?from=&to=. */
export interface SupportAssignment {
  appointmentId: string;
  technicianId: string;
}

export function describeCrewRefusal(code: string | null | undefined): string | null {
  switch (code) {
    case CREW_LEAD_REQUIRED:
      return "Assign the visit's technician first - a support technician joins a lead.";
    case CREW_MEMBER_EXISTS:
      return "That technician is already on this visit's crew.";
    case CREW_LEAD_NOT_REMOVABLE:
      return "The lead is the visit's technician - change the technician instead.";
    case CREW_MEMBER_NOT_FOUND:
      return "That technician is not on this visit's crew.";
    case CREW_NOT_EDITABLE:
      return "This visit is cancelled or completed - its crew is history.";
    // CREW_SCHEDULE_CONFLICT has no fixed text: the server's message names the visits.
    default:
      return null;
  }
}

/** "Austin Lowe (lead), John Doe" - the crew in one line. */
export function describeCrew(members: Array<{ technicianName: string; role: string }>): string {
  return members.map((member) => member.role === "LEAD" ? `${member.technicianName} (lead)` : member.technicianName).join(", ");
}
