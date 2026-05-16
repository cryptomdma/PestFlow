# Current Focus

## Active Goal
Implement the MVP foundation for Service Completion and the mobile-first Technician Work view.

## Current branch
`feature/service-completion-tech-view`

## Constraints
- Location remains the canonical customer/service record.
- Service remains the individual work unit.
- Appointment remains the scheduled dispatch placement for one or more Services.
- Service Record is the compliance/completion truth layer tied to a Service.
- Technicians are real entities with required license IDs and statuses.
- Agreements generate pending Services first; Appointments are created only when work is scheduled.
- Do not build invoicing, payments, full inventory, QuickBooks, Stripe, or native mobile apps in this pass.

## Current implementation direction
- Add `/tech` as a mobile-first web/PWA technician work view.
- Show selected technician and day with scheduled appointment visit cards.
- Show each linked Service independently inside a visit so multi-service Appointments can be completed service-by-service.
- Create or update Service Records from completion, copying technician name and license number at completion time.
- Capture lightweight materials/chemicals as Product Application rows.
- Mark the Appointment completed only after all linked Services are completed.
- Advance agreement `nextServiceDate` when an agreement-generated Service is completed.
- Preserve non-agreement Opportunity generation from completed Services.

## Next tasks
1. Verify technicians can select a date and see scheduled visits in `/tech`.
2. Verify completing one Service in a multi-service Appointment does not complete sibling Services.
3. Verify Appointment status becomes completed only after all linked Services are completed.
4. Verify completed Service Records display technician name, license number, notes, and materials.
5. Verify agreement-generated Service completion advances the Agreement next service date.

## Recommended next implementation priority
Richer service completion workflow and billing readiness:
- fuller service record detail/review workflow
- invoice draft generation from completed billable Service Records
- customer signature/photo/file capture
- inventory-integrated material usage
- technician authentication binding instead of admin/testing technician selector
