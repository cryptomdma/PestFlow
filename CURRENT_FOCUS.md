# Current Focus

## Active Goal
Harden the Technician Work / Service Ticket workflow with structured material logging and office review/finalization.

## Current branch
`feature/material-logging-and-tech-hardening`

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
- Posted tickets enter office review pending; office finalization is separate from technician posting.

## Next tasks
1. Verify technician Service Ticket drafts restore after closing/reopening and clear after posting.
2. Verify structured material rows populate from Material Product defaults and calculate active ingredient amount.
3. Verify posted tickets show office review pending and can be finalized/reopened from service detail.
4. Verify Appointment status becomes completed only after all linked Services have posted tickets.
5. Verify agreement-generated Service ticket posting advances the Agreement next service date.

## Recommended next implementation priority
Richer service ticket and review workflow:
- role-gated office finalization/reopen permissions
- invoice draft generation from completed billable Service Records
- customer signature/photo/file capture
- inventory-integrated material usage
- technician authentication binding instead of admin/testing technician selector
