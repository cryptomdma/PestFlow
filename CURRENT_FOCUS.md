# Current Focus

## Active Goal
Implement the MVP foundation for Agreement Cancellation Policies.

## Current branch
`feature/agreement-cancellation-policies`

## Constraints
- Location remains the canonical customer/service record
- Cancellation Policies are reusable Settings-level templates
- Agreement Templates select a Cancellation Policy
- Location Agreements inherit and snapshot policy context at creation
- Cancellation must be policy-driven with an impact preview, not a simple status flip
- Do not build full billing/payment collection, contract generation, bundles, SMS/Twilio, or AI automation in this pass

## Next tasks
1. Verify Settings can create, edit, activate, and deactivate Cancellation Policies
2. Verify Agreement Templates can select a Cancellation Policy
3. Verify new Location Agreements copy policy ID and snapshot terms
4. Verify Cancel Agreement modal applies policy defaults to pending services, scheduled appointments, and open opportunities
5. Verify retention opportunities are created when the selected policy requires them

## Agreement roadmap after generation cleanup
1. Finish Agreement Cancellation Policies and cancellation workflow
2. Terms & Conditions / contract snapshot/versioning
3. Agreement amendment, upgrade, downgrade, replacement, renewal lifecycle
4. Bundles / unified billing layer
5. Billing enforcement, proration, and payment collection logic

## Next implementation priority
Terms & Conditions / contract snapshot/versioning after cancellation policy MVP verification.

Cancellation policy MVP behavior:
- policies live in Settings
- Agreement Templates select a Cancellation Policy
- Location Agreements inherit policy ID and snapshot policy terms
- cancellation stores cancellation metadata on the agreement
- cancellation can cancel pending agreement-generated Services, cancel scheduled agreement Appointments, close open agreement Opportunities, and create retention Opportunities
- billing collection and signed contract rendering remain future layers
