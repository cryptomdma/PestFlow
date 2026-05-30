# PestFlow Handoff Prompt for Next Agent

You are taking over work on PestFlow.

Before changing anything, read these repository documents and treat them as canonical:

* `docs/PRODUCT_ROADMAP.md`
* `docs/CODEX_RULES.md`
* `CANONICAL_DOMAIN_RULES_V1.md`

## Current project context

PestFlow began as a Replit-exported prototype and later received hybrid UI work from another AI-generated build. The current strategy is to preserve working functionality, align the architecture to the canonical domain model, and standardize UI around real workflows.

## Canonical product truth

* Every customer is a Location.
* Account is a lightweight grouping context for one or more locations.
* The primary location acts as the customer identity in the UI.
* Operational records should generally be location-scoped.
* Account-level data must survive primary-location changes.
* Agreement generation creates pending Services, not Appointments.
* Agreement cancellation is policy-driven, not a simple status flip.
* Service Record is the compliance/ticket truth layer tied to a Service.
* Technician-posted Service Tickets must snapshot technician name and license number.
* One Appointment may contain multiple Services, and Services get independent Service Tickets.
* Office finalization is separate from technician posting.

## Current status

Already completed or underway:

* accounts/grouping layer introduced
* compatibility read projection added for customer detail
* primary location normalization added
* customer create flow updated so a new customer creates a primary location transactionally
* dashboard demo shell reduced toward a truthful baseline
* schedule status labels normalized
* agreements, agreement templates, agreement-generated pending services, opportunities, dispatch foundations, and Service Ticket / Technician Work foundations are underway

Still transitional:

* legacy `customers` remains as compatibility anchor
* contacts still need full normalization
* notes still need canonical account-vs-location split
* flags/holds not implemented yet
* service agreements exist, and cancellation policy MVP work is underway; contract versioning, amendment lifecycle, bundles, and billing enforcement remain roadmap work
* payments/users/audit logging not fully implemented yet

## Immediate next priority

### Service Ticket / Technician Work

Build and verify the mobile-first web/PWA technician work route, structured material logging, and office review/finalization foundation.

### Requirements

* technicians can view assigned scheduled Appointments by day
* compact appointment cards open detail views
* multi-service Appointments show each linked Service independently
* posting one Service Ticket creates or updates one Service Record
* Service Record snapshots technician name and license number
* local drafts protect same-device interruption with localStorage
* route date navigation supports Today, previous day, next day, and date picker
* structured material rows use Material Product definitions where available
* material cards add newest at top, allow removal, and collapse into summaries
* target pests are internal Service Ticket treatment context, not warranted pests
* non-agreement Services can be adjusted for service type/price in the ticket flow; agreement-generated Services are locked
* active ingredient amount is captured on Product Application rows
* office finalization/reopen is staged separately from technician posting
* Appointment status completes only after all linked Services have posted tickets
* agreement-generated Service ticket posting advances agreement recurrence
* non-agreement Service ticket posting preserves Opportunity generation behavior
* return a concise implementation summary with files changed, edge cases, and known follow-up work

## Constraints

* Do not build SMS/Twilio/AI automation.
* Do not implement bundles before cancellation policy and contract snapshot/versioning.
* Do not redesign the whole UI.
* Do not add fake widgets or dead controls.
* Keep the app functional at every step.

## Delivery format

When you finish your task, return:

1. what changed
2. files changed
3. migration/backfill logic if any
4. assumptions / edge cases
5. known follow-up work
6. whether the app remains on the canonical roadmap
