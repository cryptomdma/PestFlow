# Current Focus

## Active Goal
Harden the Technician Work / Service Ticket workflow with appointment timing, office review, finalization, and billing-readiness staging.

## Current branch
`feature/service-ticket-review-finalization`

## Constraints
- Location remains the canonical customer/service record.
- Service remains the individual work unit.
- Appointment remains the scheduled dispatch placement for one or more Services.
- Service Record is the compliance/completion truth layer tied to a Service.
- Technicians are real entities with required license IDs and statuses.
- Agreements generate pending Services first; Appointments are created only when work is scheduled.
- Do not build invoicing, payments, full inventory, QuickBooks, Stripe, route optimization, or native mobile apps in this pass.

## Current implementation direction
- Technician action language is Service Ticket oriented: techs post tickets; office finalizes them.
- `/tech` remains mobile-first web/PWA, with compact appointment cards and detail modals.
- Service Ticket drafts persist locally with `localStorage` until the ticket posts successfully.
- Technician and service date/time are treated as immutable ticket-start snapshots in the technician UI.
- Material logging is product-driven using reusable Material Product definitions.
- Product Applications capture product, EPA number, dilution, amount/unit, method, equipment, application area, notes, and active ingredient amount.
- Areas serviced should be derived from structured application areas instead of duplicated as a primary freeform field.
- Posted tickets enter office review pending; office finalization is separate from technician posting and is the authoritative completion event.
- Appointment-level time tracking now supports time in, time out, and duration. Settings controls whether time out happens automatically on ticket post, prompts the technician, or remains manual.
- `/service-ticket-review` is the office queue for reviewing posted Service Tickets, inspecting materials/compliance data, finalizing tickets, and reopening tickets with a reason.
- Finalized Service Records are billing-ready; technician-posted tickets are not billing-ready until office finalization.
- Technician route view supports compact date navigation: Today, previous day, next day, and date picker.
- Material cards add newest entries at the top, can be removed, and collapse into mobile-friendly summaries after Done.
- Target pests are internal service-ticket treatment context and are captured separately from future customer-facing warranted pests.
- Target pests are configurable in Settings with active/favorite/sort controls.
- Technicians can flag `Follow-up required` on a Service Ticket and add follow-up notes for office review/customer contact.
- Non-agreement Services may have service type and price adjusted in the ticket flow; agreement-generated Services remain locked.
- Technicians can request Appointment cancellation or reschedule from the route detail view using Settings-configured reasons. The Appointment is marked canceled for history, linked Services return to pending scheduling, and an open Opportunity is created for office follow-up/rescheduling.
- After posting a Service Ticket, the technician returns to the route/appointment list rather than remaining in a nested modal state.

## Next tasks
1. Verify Time In / Time Out behavior for all service time tracking modes.
2. Verify posted tickets appear in `/service-ticket-review`.
3. Verify finalization marks Services completed, updates Appointment status when all linked Services are finalized, and sets billing-ready.
4. Verify agreement recurrence advances from finalization, not technician posting.
5. Verify reopen requires a reason and returns the ticket to editable workflow.
6. Verify follow-up-required tickets show high-visibility alerts in office review and service detail.
7. Verify tech cancel/reschedule requests require a reason, remove linked Services from the tech route, return those Services to pending dispatch, and create an open office Opportunity.

## Recommended next implementation priority
Richer service ticket and review workflow:
- role-gated office finalization/reopen permissions
- invoice draft generation from finalized billable Service Records
- customer signature/photo/file capture
- inventory-integrated material usage
- technician authentication binding instead of admin/testing technician selector
