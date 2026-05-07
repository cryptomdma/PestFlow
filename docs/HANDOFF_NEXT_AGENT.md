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

## Current status

Already completed or underway:

* accounts/grouping layer introduced
* compatibility read projection added for customer detail
* primary location normalization added
* customer create flow updated so a new customer creates a primary location transactionally
* dashboard demo shell reduced toward a truthful baseline
* schedule status labels normalized
* agreements, agreement templates, agreement-generated pending services, opportunities, and dispatch foundations are underway

Still transitional:

* legacy `customers` remains as compatibility anchor
* contacts still need full normalization
* notes still need canonical account-vs-location split
* flags/holds not implemented yet
* service agreements exist, and cancellation policy MVP work is underway; contract versioning, amendment lifecycle, bundles, and billing enforcement remain roadmap work
* payments/users/audit logging not fully implemented yet

## Immediate next priority

### Agreement Cancellation Policies

Verify and harden reusable Settings-level Cancellation Policies selected by Agreement Templates and inherited/snapshotted by Location Agreements.

### Requirements

* cancellation is a policy-driven workflow with impact preview
* cancellation policy defines terms, fees, notice requirements, effective-date behavior, and effects on pending Services, scheduled Appointments, open Opportunities, billing, and retention/recovery
* manager/admin override belongs in the cancellation modal and should be role-gated; the MVP stores override metadata while full permission enforcement awaits user/roles hardening
* agreement cancellation and service/appointment cancellation are distinct workflows
* signed agreement terms should not be mutated directly; future work should snapshot contract terms and policy versions
* bundles are future billing/pricing groups above independent agreements, not mega-agreements
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
