# Current Focus

## Active Goal
Refactor recurring Agreement generation to create pending Services instead of synthetic Appointments.

## Current branch
`feature/agreement-generation-pending-services`

## Constraints
- Location remains the canonical customer/service record
- Agreements generate queueable Services, not dispatch placements
- Appointments are created only when work is scheduled on the board
- Do not build cancellation logic, route optimization, SMS/Twilio, or AI automation in this pass

## Next tasks
1. Verify agreement-generated Services enter the pending dispatch queue
2. Verify `generationLeadDays` creates pending work inside the lead window
3. Verify `serviceWindowDays` writes service window start/end dates
4. Verify `CONTACT_REQUIRED` agreement work creates linked Opportunities
5. Verify service completion advances the Agreement `nextServiceDate`

## Agreement roadmap after generation cleanup
1. Agreement Cancellation Policies and cancellation workflow
2. Terms & Conditions / contract snapshot/versioning
3. Agreement amendment, upgrade, downgrade, replacement, renewal lifecycle
4. Bundles / unified billing layer
5. Billing enforcement, proration, and payment collection logic

## Next implementation priority
Agreement Cancellation Policies.

Cancellation policy work should stay Settings/template-driven:
- policies are reusable Settings-level templates
- Agreement Templates select a Cancellation Policy
- Location Agreements inherit policy context from their template
- future signed agreements should snapshot policy/version terms
- cancellation should use a confirmation modal with impact preview and role-gated manager/admin override
