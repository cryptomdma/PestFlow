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
    default:
      return null;
  }
}

/** "Austin Lowe (lead), John Doe" - the crew in one line. */
export function describeCrew(members: Array<{ technicianName: string; role: string }>): string {
  return members.map((member) => member.role === "LEAD" ? `${member.technicianName} (lead)` : member.technicianName).join(", ");
}
