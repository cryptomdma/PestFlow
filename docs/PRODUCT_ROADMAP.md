# PestFlow Product Roadmap

## Purpose

This roadmap defines PestFlow's phased product direction and implementation order. It should be used to prioritize work, avoid premature feature expansion, and keep the codebase aligned with the canonical domain model.

## Product principles

* Every customer is a **Location**.
* An **Account** exists mainly as a lightweight grouping context for one or more related locations.
* The **primary location** acts as the customer identity in the UI.
* Operational work happens primarily at the **location** level.
* Account-level data must survive primary-location changes.
* Features should improve operational clarity, not add bloat.

## Current architectural state

Completed / in progress:

* Account grouping layer introduced
* Compatibility projection added for current customer detail UX
* Primary location normalization implemented
* Customer creation flow now creates a primary location transactionally
* Dashboard demo shell stripped back toward a truthful baseline

Still transitional / not yet canonical:

* legacy `customers` remains as a compatibility anchor
* contacts are not yet fully normalized to location-only ownership everywhere
* notes still use legacy scope semantics
* no flags/holds yet
* service agreements exist, but cancellation policy, contract versioning, amendment lifecycle, bundle, and billing enforcement work remains future roadmap
* no payments yet
* no user/permission system yet
* no audit logging yet

## Phase 0 — Audit and stabilization

### Goal

Understand the exported codebase, stop architecture drift, and prevent AI-generated demo/UI confusion from becoming product truth.

### Deliverables

* architecture audit
* canonical domain rules
* compatibility migration direction
* functional UI audit
* removal of fake/dead primary-screen controls

### Status

Completed.

---

## Phase 1 — Canonical account/location foundation

### Goal

Introduce the canonical grouping layer without blowing up the working UI.

### Deliverables

* `accounts` table/entity
* `locations.accountId`
* account primary-location normalization
* compatibility read projection for customer detail
* transactional customer-create-with-primary-location flow

### Status

Completed, with follow-up hardening still recommended.

### Follow-up hardening

* make `locations.accountId` non-null once data is verified
* add invariant checks for orphaned locations / multiple primaries / bad primaryLocationId relationships
* identify and safely quarantine bootstrap placeholder locations
* clearly mark transitional code and fields

---

## Phase 2A — Contacts normalization

### Goal

Make contacts fully canonical and location-scoped.

### Why next

Contacts touch customer detail, commercial logic, communications, billing contact behavior, and future portal workflows.

### Deliverables

* require `locationId` for contacts
* remove long-term dependency on legacy customer-owned contact creation
* update customer create/edit flows so contacts are always location-bound
* add safe migration/backfill rules for existing contacts
* update customer detail and any list/search views to use location-scoped contacts consistently

### Constraints

* do not introduce account-vs-location contact ambiguity
* do not create a permanent dual-scope contact model

---

## Phase 2B — Notes normalization

### Goal

Split notes cleanly into account-level and location-level semantics.

### Deliverables

* account-level notes that survive primary-location changes
* location-level notes that remain tied to the location
* remove ambiguous legacy note scope logic over time
* preserve existing data through migration/backfill
* align UI labels and behavior to these two note classes

### Constraints

* no casual note scope conversion behavior unless explicitly redesigned later
* account-level notes must remain with the account even if a different location becomes primary

---

## Phase 3 — Service agreements and scheduling foundation

### Goal

Create the recurring-service backbone that pest control operations actually need.

### Deliverables

* service agreements model
* agreement type / status / frequency / pricing
* customer-facing agreement support with e-sign placeholders
* location-context appointment creation rules
* scheduling guardrails that respect future holds and agreement defaults

### Constraints

* do not overbuild route optimization yet
* keep appointment and service visit separate

### Current canonical direction

Agreement generation creates pending Services, not Appointments. Appointments are scheduled dispatch placements created when work is placed on the board or by a future auto-scheduling layer.

Agreement scheduling modes:

* `AUTO_ELIGIBLE`
* `CONTACT_REQUIRED`
* `MANUAL`

`generationLeadDays` means generate pending agreement work X days before `nextServiceDate`.

`serviceWindowDays` means the generated Service window starts on `nextServiceDate` and ends `serviceWindowDays` later.

### Agreement roadmap

Immediate next priority: Agreement Cancellation Policies.

Recommended sequencing:

1. Agreement cancellation policies and cancellation workflow
2. Terms & Conditions / contract snapshot/versioning
3. Agreement amendment/upgrade/downgrade lifecycle
4. Bundles / unified billing layer
5. Billing enforcement, proration, and payment collection logic

Cancellation Policies are reusable Settings-level templates selected by Agreement Templates and inherited by Location Agreements. Cancellation is a policy-driven workflow with impact preview and role-gated manager/admin override, not a simple status flip.

Terms & Conditions are future Settings-level templates that combine with Agreement Templates, Cancellation Policies, pricing/billing rules, and warranty/service scope language to render customer-facing contracts. Signed contracts are immutable historical records and should be changed only through amendments, versions, replacements, upgrades/downgrades, renewals, or cancellation/recreate workflows.

Bundles are a billing/pricing/grouping layer above independent agreements. They should use a join table approach (`bundles`, `bundle_agreements`) and should not control scheduling, generate Services, replace Agreements, or hide agreement lifecycle complexity.

---

## Phase 4 — Flags / Holds

### Goal

Introduce operational restrictions and caution markers in a canonical way.

### Deliverables

* separate `flags` and `holds`
* support both account-level and location-level scope
* blocking behavior for holds only
* groundwork for schedule/service blocking

### Canonical distinction

* **Flag** = informational or cautionary
* **Hold** = blocks some workflow behavior

---

## Phase 5 — Service visits / service history workflow

### Goal

Turn service history into a real posting/review workflow.

### Deliverables

* service visit lifecycle/status model
* review/posting states
* send back / confirm / void / edit actions
* material usage child records
* optional weather details
* pest/problem fields on service visit

### Constraints

* do not collapse appointment and service visit
* keep materials normalized in child records

---

## Phase 6 — Billing foundation

### Goal

Make financial workflows real and traceable.

### Deliverables

* account-level default billing with location override support
* invoices lifecycle cleanup
* payments model
* payment methods / references / proof support
* balances groundwork

---

## Phase 7 — Users / permissions / audit logging

### Goal

Make the app operationally safe for real teams.

### Deliverables

* internal user model
* roles and permission gates
* technician-specific fields and skills
* admin-grade audit logging for field changes and important actions

---

## Phase 8 — Communications foundation

### Goal

Support office workflows without fake automation.

### Deliverables

* communication log cleanup
* Twilio/SMS-ready framework
* email-ready framework
* location-scoped communication ownership with account rollup where appropriate

---

## Phase 9 — Dashboard and reporting

### Goal

Build a truthful operations dashboard based only on real data.

### Deliverables

* live KPI cards only
* no fake charts or fake widgets
* route/service/invoice/reporting drilldowns as real APIs become available

---

## Phase 10 — Mobile technician experience

### Goal

Build a real field workflow once the backend can support it.

### Deliverables

* mobile/PWA day view
* route list
* service completion flow
* notes/photos/signatures/payments as real workflows

---

## Phase 11 — Customer portal and advanced automation

### Goal

Expand outward only after the core domain is stable.

### Deliverables

* customer portal
* online billing/payment features
* reminder/automation center
* AI-assisted communication only after workflows are trustworthy

---

## What should NOT happen

* Do not build features on top of transitional legacy abstractions if canonical replacements are next in line.
* Do not let prettier fake UI outrun live functionality.
* Do not ship dead buttons, fake charts, or demo widgets on primary screens.
* Do not broaden scope in a phase without an explicit decision.
