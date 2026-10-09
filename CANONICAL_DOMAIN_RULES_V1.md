# PestFlow Canonical Domain Rules v1

## Purpose

This document is the canonical source of truth for PestFlow's domain model, scope rules, workflow rules, and architectural assumptions. Any code audit, refactor, roadmap, or implementation plan should be measured against this document.

The goal is to keep PestFlow:

* location-centric
* operationally intuitive for pest control companies
* scalable without unnecessary bloat
* structured to avoid major refactors later

---

## Core Product Philosophy

### 1. Every customer is a location

In PestFlow, the real customer record is always a **Location**.

A user should feel like they are creating, opening, editing, and servicing a location.

### 2. An Account is a grouping context

An **Account** exists to group one or more related locations together.

It is not intended to be a bloated, user-facing CRM object. Its primary purposes are:

* grouping related locations
* designating the primary location
* preserving account-level data that should survive a primary-location change
* enabling grouped billing defaults, balances, reporting, and navigation

An Account may group:

* one location
* two related residential locations
* a family cluster
* a landlord / property manager portfolio
* a commercial organization with many service sites

### 3. The primary location is the customer identity in the UI

Each Account has exactly one **primary location**.

That primary location acts as the main customer identity in the interface.

This means the user experience should feel like:

* the customer is the primary location
* related locations are subordinate or sibling locations within the same grouped relationship

### 4. Real work happens at the location level

Operational records should generally belong to the **Location**.

This includes:

* contacts
* appointments
* service agreements
* service visits
* invoices (or at minimum invoice linkage)
* communication logs
* notes specific to the site
* service conditions
* devices/assets
* portal-visible information

### 5. Shared defaults, local overrides

Some behaviors should inherit from the primary location or account context by default, but allow location-level override when needed.

Examples:

* billing profile defaults
* communication defaults
* automation behavior later

### 6. Workflow simplicity matters

The user should not be forced to think in terms of hidden architecture.

Creating a new customer should feel like **adding a location**. The grouping/account logic should happen in the background.

---

## Canonical Entity Model

## 1. Account

### Definition

A lightweight grouping context for one or more related locations.

### Purpose

* group related locations
* designate the current primary location
* retain account-level data when the primary location changes
* support grouped billing/reporting behaviors

### Required fields

* id
* primaryLocationId
* status
* createdAt
* updatedAt

### Optional / computed fields

* lifetimeValue (LTV)
* aggregate balance data

### Notes

* Account is mostly an internal/domain object
* The account's default billing is its `billing_profiles` row with no location (§4) - there is no pointer
  column on the account (a `defaultBillingProfileId` was listed here until Pass 39; the code's lived on
  `customers`, was read by nothing, and was dropped - PLAN_ROADMAP_V2.md C5.8)
* It should not become a bloated duplicate of Location
* Account type should **not** include `multi_location` or `property_management`
* The real customer type logic belongs on Location (`residential` or `commercial`)

---

## 2. Location

### Definition

The canonical customer and service-site record.

### Purpose

* represent a service address
* serve as the primary operational unit in PestFlow

### Required fields

* id
* locationCode
* accountId
* isPrimary
* locationType (`residential` | `commercial`)
* serviceAddress1
* serviceAddress2 nullable
* city
* state
* zip
* status
* createdAt
* updatedAt

### Residential-friendly fields

* firstName nullable
* lastName nullable

### Commercial-friendly fields

* companyName nullable

### Optional fields

* county nullable
* latitude nullable
* longitude nullable
* sqft nullable
* linearFt nullable
* source nullable

### Notes

* `gateCode` should **not** be a core Location field
* `accessInstructions` should **not** be a core Location field
* those belong in location notes
* `lat/long`, `sqft`, and `linearFt` should live in a collapsed or advanced property details UI section

---

## 3. Contact

### Definition

A person associated with a specific location.

### Canonical rule

**Contacts are location-scoped.**

There is no ambiguity here: contact info lives at the location.

### Required fields

* id
* locationId
* firstName
* lastName
* phone nullable
* phoneType (`mobile` | `home` | `work` | `fax` | `other`) nullable
* email nullable
* contactRole nullable
* isPrimary boolean
* notes nullable
* createdAt
* updatedAt

### Notes

Examples of contact roles:

* primary
* billing
* on_site
* tenant
* spouse
* AP
* scheduler

For commercial:

* on-site contact = Contact
* billing/AP contact = Contact

### Canonical rule — one primary contact per location (PLAN_ROADMAP_V2.md C5.4; Pass 36)

A location with contacts has **exactly one** primary contact. The first contact of a location is
primary whatever the form said (`createContact`); making another contact primary demotes the current
one in the same transaction, one audit row each (Pass 32, `auditDemotedContactsTx`); and the current
primary is **never made non-primary on its own** - a contact update that would leave the location
with no primary is refused (400 `CONTACT_PRIMARY_REQUIRED`, `shared/contacts.ts`), on the contact
dialog (its "Make primary contact" box is disabled on the current primary, with the note) and on the
server, where a History revert of a promotion row goes through the same write path and is refused the
same way - the row to revert is the other contact's. The one way to change who is primary is to
promote the other contact (the dialog's checkbox, or `POST /api/contacts/:id/set-primary` for an API
caller - the route promotes only). Before Pass 36 nothing enforced this and the dialog could leave a
location with none.

---

## 4. BillingProfile

### Definition

Billing information used by a location or inherited from the account context.

### Required fields

* id
* accountId
* label
* billingType (`card` | `ach` | `invoice_terms` | `cash` | `check`)
* isDefault
* status (`active` | `inactive` - a retired profile is never deleted; invoices carry its id)
* createdAt
* updatedAt

### Optional fields

* locationId (null = an account-level row; set = this location's override)
* templateId (the org template the row was created from, if any)
* billingName
* billingAddress fields
* defaultPaymentMethodId (Pass 40, C6.1 - the card on file this profile charges and shows, one of its
  ACCOUNT's active cards (see "Card on file" below); null = the account's default card; refused 400
  `BILLING_PROFILE_PAYMENT_METHOD_UNKNOWN` for another account's card, a removed one or an unknown id;
  cleared inside a card's removal; never put back by a History revert)
* cardOnFileToken, achToken, lastFour - LEGACY and UNREAD since Pass 40: the card on file lives in its
  own entity below (an account holds several; this row is whole-row-snapshotted into the audit log
  and returned by two open reads). No screen or route reads or writes them; a later hygiene pass drops
  them.
* invoiceTerms (`DUE_ON_RECEIPT` | `NET_15` | `NET_30` | `NET_60`)

### Canonical behavior

* the account context provides the default billing behavior: the account's active row with no
  locationId (its `isDefault` row first, else the first such row). There is no primary-location-scoped
  profile; the primary location shows and edits the account default because it is the customer
  identity in the UI (Pass 34, C5.2)
* every location of the account inherits that default by default - a location with no row of its own
  writes nothing
* a location may override with a custom billing profile when needed: its own active row with
  locationId = that location, one per location; switching back to the default retires the row
  (`inactive`) rather than deleting it
* `billing_profiles.locationId` is the one pointer. The two legacy pointers that shadowed it,
  `locations.billingProfileId` (a mirror the write path kept) and `customers.defaultBillingProfileId`
  (read by nothing), were dropped in Pass 39 (PLAN_ROADMAP_V2.md C5.8); the row's three foreign keys
  (account, location, template) exist on every database since then, and a `templateId` naming no
  template of the org is refused 400 `BILLING_PROFILE_TEMPLATE_UNKNOWN` before the key can refuse it
* a new customer's account gets its default created from the org's default template
  (Settings -> Billing Defaults, `default_billing_profile_template_id`) when one is set; none set,
  the account starts with no profile and every invoice bills the primary location until one is given

### Card on file (`payment_methods` - Pass 40, PLAN_ROADMAP_V2.md C6.1; PLAN_BILLING_V1.md §1.2, B18)

The tokenized instrument, beside the profile and never inside it. It belongs to the **Account** (a
profile picks one through `defaultPaymentMethodId`; the account's `isDefault` card is what a profile
with no pointer resolves to - `resolveProfilePaymentMethod` in `shared/payment-methods.ts`);
`locationId` is a note of where it was added, never a scope.

* Required: id, orgId, accountId, provider (`stripe`), providerCustomerId, providerPaymentMethodId
  (the provider's tokens - they never leave storage: every read answers the display fields alone),
  type (`card` | `ach` - `ach` is named, not captured), last4, isDefault, status (`active` |
  `removed` - removed is detached at the provider and kept, never deleted), livemode (the provider
  mode the card was captured in), createdAt, updatedAt
* Optional: locationId, brand, expMonth / expYear, addedByUserId / addedByLabel, removedAt /
  removedByUserId / removedByLabel
* **PCI, a hard rule:** no card number, CVV or bank credential ever touches PestFlow. The client
  mounts the provider's own form (Stripe's Payment Element) against a SetupIntent the server created
  for the account's provider customer; on success the server reads the intent back from the
  provider and stores brand, last four and expiry with the tokens. The owner's rule (B18): the last
  four is visible to every role - the customer screen's billing chip and Edit Location's Cards on
  file list print it; no projection, audit snapshot or API answer carries a provider id.
* One provider **Customer** per account, per provider and mode (`payment_provider_customers`),
  minted by the first capture and reused; the org's **provider account** (`payment_provider_accounts`:
  provider, mode test | live, the keys encrypted at rest under env `PAYMENT_CREDENTIALS_KEY`, a
  nullable Stripe Connect account id) is Settings reference data (Settings → Payments, MANAGE_SETTINGS,
  write-only for the secrets) - never on the organization row, never a process-wide key.
* Who: adding a card, making one the default and removing one are `MANAGE_PAYMENT_METHODS` (support /
  manager / admin by default); the first active card of an account is its default; removing the
  default promotes the oldest remaining active card and clears every profile pointer at it.
* Charging the card, refunds through the provider, webhooks and auto-charge are C6.2's; the CARD / ACH
  payment methods on a Payment stay refused until then.

---

## 5. Note

### Definition

Freeform notes stored at either account scope or location scope.

### Canonical rule

There are two note scopes:

* **Account-level notes**
* **Location-level notes**

### Account-level notes

These are notes about the overall grouped relationship.
They are not tied to a specific location.
They must remain with the Account even if the primary location changes.

Examples:

* relationship-level billing guidance
* family-wide office notes
* grouped customer context

### Location-level notes

These are notes specific to one location only.
They stay attached to that location.

Examples:

* gate/access info
* service site instructions
* technician-only site notes
* special handling for that property

### Fields

* id
* accountId nullable
* locationId nullable
* scope (`account` | `location`)
* body
* pinned boolean
* createdByUserId
* createdAt
* updatedAt

### Notes

* Do **not** rely on the UI term “Shared Notes” as the canonical definition
* If a new location becomes primary, account-level notes remain with the Account

---

## 6. Flag

### Definition

An informational or cautionary marker.

### Canonical rule

A **Flag** does not inherently block workflow.
It provides context, warning, or heightened awareness.

### Scope

Flags may exist at:

* account scope
* location scope

### Examples

* aggressive dog
* gate issue
* call first
* tenant coordination required
* conducive conditions
* VIP
* legal sensitivity

### Fields

* id
* scopeType (`account` | `location`)
* accountId nullable
* locationId nullable
* type
* severity
* active
* notes nullable
* createdByUserId
* createdAt
* updatedAt

---

## 7. Hold

### Definition

An operational restriction that can block some part of workflow.

### Canonical rule

A **Hold** is different from a Flag.
A Hold can affect scheduling, servicing, billing, or continuation of service.

### Scope

Holds may exist at:

* account scope
* location scope

### Examples

* credit hold
* do not service (DNS)
* end service
* legal hold
* office review required before scheduling

### Fields

* id
* scopeType (`account` | `location`)
* accountId nullable
* locationId nullable
* type
* active
* blocksScheduling boolean
* blocksService boolean
* blocksBilling boolean nullable
* startDate nullable
* endDate nullable
* notes nullable
* createdByUserId
* createdAt
* updatedAt

### Notes

Examples of behavior:

* account-level credit hold can block scheduling across all related locations
* location-level DNS can block only that specific location
* aggressive dog belongs as a Flag, not a Hold

Neither Flags nor Holds has a table yet. The account | location scope shape both use was first built
by `technician_preferences` (Scheduling Rules §3, Pass 30): a row is ACCOUNT-scoped (all of the
account's locations) or LOCATION-scoped, and the location's row wins.

---

## 8. ServiceType

### Definition

Master list of service offerings.

### Required fields

* id
* name
* code nullable
* category nullable — free text, the display grouping ("General / Termite / Rodent")
* workKind (`SERVICE` | `PRODUCTION` | `CALLBACK`, default `SERVICE`) — the default work kind of
  every Service created from this type (Pass 24; §10 "Service designation and warranty callbacks")
* isRecurringEligible boolean
* defaultDurationMinutes nullable
* requiresInspection boolean nullable
* active boolean

---

## 9. ServiceAgreement

### Definition

The service plan or agreement for a location.

### Purpose

* define recurring or one-time service relationship
* support customer-facing agreement output
* support e-sign
* drive scheduling and billing behavior

### Recurring generation rule

Agreements generate pending Services, not Appointments.

The generated Service is the queueable unit of work for the agreement cycle. It must remain linked to the Location and Agreement, and it becomes an Appointment only when dispatch places it on the schedule board or a future auto-scheduling layer places it.

Canonical timing fields:

* `generationLeadDays` means generate the pending Service X days before `nextServiceDate`
* `serviceWindowDays` means the service window starts on `nextServiceDate` and ends `serviceWindowDays` later
* generated agreement Services use `source = AGREEMENT_GENERATED`
* generated agreement Services start as pending scheduling work

Agreement scheduling modes:

* `AUTO_ELIGIBLE` - generated Services can enter a future auto-scheduling pool, but are still pending Services until placed
* `CONTACT_REQUIRED` - generated Services require office/customer contact and create linked Opportunities
* `MANUAL` - generated Services are manually scheduled without contact automation assumptions

The mode is one shared vocabulary (`shared/agreement-types.ts` `SCHEDULING_MODES`, read by the server's
enum and every client surface since Pass 36 / PLAN_ROADMAP_V2.md C5.4) and is shown as **"Scheduling:
auto-eligible" / "Scheduling: contact required" / "Scheduling: manual"** on the pending dispatch queue
and the Settings template row, "Auto-eligible / Contact required / Manual" on the agreement card and
the two form selects - never the raw enum, and never a promise: no auto-scheduling exists today (Smart
Schedule is Phase 9), so AUTO_ELIGIBLE means "may enter a future pool, pending until someone places it",
and CONTACT_REQUIRED is the one mode the server acts on (the contact Opportunity below).

Contact-required agreement Opportunities are distinct from non-contract follow-up Opportunities. They must link back to the generated Service and Agreement cycle where possible.

### Cancellation policies

Cancellation Policies are reusable Settings-level templates. Agreement Templates select the policy that applies to Location Agreements created from that template.

Examples:

* Annual Quarterly Service Cancellation Policy
* Mosquito Seasonal Cancellation Policy
* Termite Agreement Cancellation Policy
* No-Fee / Custom Cancellation Policy

When a Location Agreement is created from an Agreement Template, it inherits the selected cancellation policy and snapshots key policy terms onto the Location Agreement. This snapshot is the MVP bridge toward future signed contract immutability and policy versioning.

Cancellation policy should define:

* cancellation terms
* cancellation fees if applicable, including no fee, flat fee, manual review, percentage of full contract price, or percentage of remaining balance
* notice requirements
* effective-date behavior
* impact on pending generated Services
* impact on scheduled Appointments
* impact on open Opportunities
* whether to create retention/recovery Opportunity
* whether charges are due immediately
* whether card-on-file collection or manual collection is required
* whether manager/admin override is allowed

Agreement cancellation is not a simple status flip. It is a policy-driven workflow with confirmation and impact preview. The MVP cancellation workflow stores cancellation metadata on the agreement and can apply policy defaults to pending generated Services, scheduled agreement Appointments, open agreement Opportunities, and retention Opportunity creation.

Manager/admin override belongs inside the cancellation modal and should be role-gated. The MVP stores override metadata and keeps full permission enforcement as a user/roles hardening concern. Override may allow:

* waive cancellation fee
* change effective date
* cancel outside normal policy terms
* keep/cancel pending Services
* keep/cancel scheduled Appointments
* suppress/create retention Opportunity
* add required override reason

### Agreement cancellation vs service cancellation

Agreement cancellation means the customer plan is ending, pausing, or being replaced. It is governed by cancellation policy and may affect future Services, pending generated Services, Appointments, billing, Opportunities, and contract status.

Service or Appointment cancellation means one visit or Service is being canceled. It should route to recovery/reschedule logic based on the source:

* non-agreement one-time work generally prompts the user to create or reopen an Opportunity
* agreement-generated work should prioritize reschedule, return to agreement scheduling queue, or snooze/retry inside the agreement service window
* agreement-generated work should create retention/contact Opportunities only when appropriate
* opportunity-converted work should preserve its Opportunity linkage where relevant

Technician route cancel/reschedule requests are an office handoff, not full disposal of the work. The historical Appointment may be marked canceled with a required configured reason, but linked Services should return to pending scheduling and an open Opportunity should notify office staff to reschedule/contact the customer. For agreement-generated Services, the Service should remain tied to the Agreement and be recycled into the scheduling queue rather than advancing recurrence until office finalization/completion rules say so.

As built (Pass 27; PLAN_ROADMAP_V2.md C4.2 / B2, owner 2026-09-19; PLAN_BILLING_V1_1.md D8
"Unschedule action"): an Appointment leaves the board through **one path**,
`POST /api/appointments/:id/disposition`, with two modes and no fifth Appointment status (Q4 / D1a).

* **RESCHEDULE** takes the placement off the board and returns every linked Service to
  `PENDING_SCHEDULING` with its dates untouched - the visit is still due when it was due. No reason is
  required, no policy fires, and the office creates no Opportunity.
* **CANCEL** starts the cancel flow: a reason from the settings list
  (`appointment_cancel_reschedule_reasons`) is required and one not on it is refused;
  agreement-generated Services recycle to `PENDING_SCHEDULING` with `dueDate` /
  `serviceWindowStart` / `serviceWindowEnd` reset from the cancel date by the Agreement's
  `serviceWindowDays`, so the visit is not silently missed; one-time Services are `CANCELLED`; the
  office chooses, per visit, to re-date the open Opportunity on each Service, to create one
  (`RESCHEDULE` for a requeued Service, `WINBACK` for a cancelled one-time Service, the work type
  from the Service's Agreement) or none.
* Both write the same Appointment shape - `status CANCELED`, `rescheduleRequested` true for a
  reschedule and false for a cancel, `cancelReason` null unless one was given - so the UI
  distinguishes on the flag, never on the reason. Both keep the DRAFT-invoice prompt (§13), skip a
  Service that is already COMPLETED or CANCELLED, stamp `lastAppointmentId` on every Service they
  touch (§10) and write one audit row (§17, `appointment_cancelled` / `appointment_rescheduled`)
  with the Appointment and its Services before and after.
* The technician's cancel / reschedule route is the same path with a **FIELD** origin - the handoff
  above, never disposal: every Service returns to the queue whatever the mode, and the
  office-handoff Opportunity on each Service is re-dated or created.
* A status change to `CANCELED` through the generic Appointment update is refused (409). A board
  move confirms before it writes.

As built (Pass 28; PLAN_ROADMAP_V2.md C4.3a; the owner's review of 2026-09-25, finding 5): **ONE
Service is cancelled through `POST /api/services/:id/cancel`**, placed or pending - from the dispatch
sheet, the pending queue or the location's Services tab - with the disposition's CANCEL semantics
for that Service and nothing else:

* a reason from the same settings list is required and one not on it is refused; a one-time
  Service is `CANCELLED`; an agreement Service is **never cancelled outright** - it returns to
  `PENDING_SCHEDULING` with `dueDate` / `serviceWindowStart` / `serviceWindowEnd` reset from today by
  the Agreement's `serviceWindowDays` (the disposition's recycle; ending the plan is the agreement
  cancellation workflow); the same opportunity choice runs (`WINBACK` for the cancelled one-time
  Service, `RESCHEDULE` for the recycled agreement one, re-date the open one, or none).
* Off a live Appointment the Service is **detached** - `appointmentId` null, `lastAppointmentId`
  stamped, the technician cleared - and the Appointment stays on the board with the rest; the
  representative (`appointments.serviceId`) moves to the first remaining sibling. The **last active
  Service on an Appointment is refused** (`LAST_SERVICE_ON_APPOINTMENT`): the Appointment leaves the
  board only through its disposition (§11). A Service with a posted ticket is refused
  (`SERVICE_HAS_TICKET`) - the work happened, and the ticket flow owns it - as is a COMPLETED or
  CANCELLED one, and any change to a visit whose invoice is issued (`VISIT_INVOICED`).
* One audit row per cancel (§17, `service_cancelled` on the Service) with the row before and after,
  the reason, the effect and the opportunities touched. A status change to `CANCELLED` through the
  generic Service update is refused (409 `SERVICE_CANCEL_REQUIRED`), as is detaching a placed Service
  (`SERVICE_REMOVE_REQUIRED`) - the Pass 27 precedent for `CANCELED` on the Appointment.
* Ungated like the disposition (who may cancel has no permission yet - listed under PLAN_ROADMAP_V2.md
  C5.10 for the owner to decide per route; Pass 37's role profiles would hold it). The reasons list's write is
  `MANAGE_SETTINGS` since this pass, now that two flows read it.

Do not flatten all cancellation scenarios into generic Opportunity logic.

### Terms, contracts, and versioning

Terms & Conditions are future Settings-level templates that will combine with Agreement Template, Cancellation Policy, pricing/billing rules, and warranty/service scope language to generate the customer-facing service contract.

Signed contracts are immutable historical records. Do not directly edit signed contract text in place.

When an agreement is created and signed, the system should eventually store:

* rendered contract text
* terms template version
* cancellation policy version/snapshot
* pricing snapshot
* signed date/signature metadata

If terms change after signing, use an amendment, agreement version, replacement agreement, or cancel/recreate flow instead of mutating the signed contract.

### Amendments, upgrades, and downgrades

Agreement changes after signing are controlled lifecycle events, not silent edits.

Future workflows:

* Amend Agreement
* Upgrade Agreement
* Downgrade Agreement
* Replace Agreement
* Cancel Agreement
* Renew Agreement

Future model may include:

* replacesAgreementId
* replacedByAgreementId
* currentVersionId
* agreement version records
* amendment records

### Bundles

Bundles are a billing/pricing/grouping layer above agreements. They are not mega-agreements.

Agreements remain independent for scheduling, service generation, agreement lifecycle, cancellation, and service records.

Bundle examples:

* Quarterly Pest + Seasonal Mosquito
* Pest + Termite Monitoring
* Pest + Mosquito + Termite Protection

Use a join table approach:

* bundles
* bundle_agreements

Do not rely on a simple nullable `bundleId` field on agreements as the primary long-term model.

Bundles should:

* group multiple agreements
* support unified billing
* support bundle pricing/discounts
* optionally show one bundled customer-facing price
* optionally support internal/detail line-item breakdown

Bundles should not control scheduling, generate Services, replace underlying Agreements, or hide agreement lifecycle complexity.

Bundling should be explicit and user-initiated. The system may suggest bundling when multiple active agreements exist, but should not automatically bundle agreements.

Future invoice display options:

* bundled summary price
* line-item breakdown
* commercial/detail mode

### Recommended agreement build order

1. Finish Agreement cancellation policy MVP verification and hardening
2. Terms & Conditions / contract snapshot/versioning
3. Agreement amendment/upgrade/downgrade lifecycle
4. Bundles / unified billing layer
5. Billing enforcement, proration, and payment collection logic

Immediate next implementation priority after cancellation policy MVP verification: Terms & Conditions / contract snapshot/versioning.

### Sale attribution

Who sold an Agreement is comp basis that cannot be reconstructed later (PLAN_ROADMAP_V2.md C2.2,
Pass 12; the compensation entry in `CURRENT_FOCUS.md`), and it is the payee a
`COMMISSION_ON_NEW_AGREEMENT` component resolves once the comp engine exists (Phase 7).

* `soldByUserId` is a **users** FK. The owner's decision (2026-09-19) is one identity table for
  everyone, office and field - built in Pass 38 (C5.7): a technician IS a users row (§16), so a
  technician's production credit (`technicianId`, the same users id) and their sale credit meet on one
  person with no bridge. (Pass 12's `technicians.userId` was that bridge until the merge; it was never
  linked on the dev DB and is gone with the table.)
* It defaults to the session user at creation. Naming anyone else, or nobody, at creation, and any
  later change, needs `ASSIGN_SALE_CREDIT` (a profile holding it - the built-in manager and admin do); a change is recorded in the audit log (§17)
  as an `update` on the Agreement with the sold-by before and after, the users named.
* Null means **not recorded**: the agreements sold before Pass 12 keep it, never guessed from
  `createdByUserId`. Template propagation never touches it.
* It is attribution, not payout: production value stays contract price ÷ expected visits for
  whoever performs the work, and comp plans decide what a sale earns.

### Required fields

* id
* accountId
* locationId
* serviceTypeId
* agreementType nullable — the KEY of one of the org's settings-managed **agreement types**
  (`agreement_types`, seeded Pest control / Termite / Mosquito / Wildlife / Evaluation; the office adds,
  renames, retires and merges types in Settings; `shared/agreement-types.ts`; Pass 35, C5.3, B8 / D8). "What
  kind of program", never the structure: recurring / one-time / installment / seasonal is the Billing Plan
  and `expectedServiceCount` (§13), and a bundle is a grouping layer (below). Null is "no type". The fixed
  `recurring | one_time | warranty | installment | seasonal` enum this line carried before Pass 35
  contradicted B8 / D8 and never existed in code. `ServiceType.category` (§8) is a separate free-text display
  grouping that overlaps this list and was not merged into it.
* status (`active` | `paused` | `canceled` | `expired`)
* termUnit / termInterval and recurrenceUnit / recurrenceInterval — the term's length and the service
  cadence; the units are `DAY | WEEK | MONTH | QUARTER | YEAR` (`shared/agreement-types.ts` `AGREEMENT_UNITS`,
  the same five as a Billing Plan's `intervalUnit`; `CUSTOM`, which meant days, was retired in Pass 35),
  stepped by `shared/agreement-schedule.ts` `advanceAgreementDate`. The agreement templates carry the same
  four as defaults. (This line read `frequencyRule nullable` before Pass 35; the code never had it.)
* defaultPrice nullable
* billingPlanId — the Billing Plan that decides how and when the agreement is billed (§13); required since Pass 12
  (an agreement has no billing-profile column: the profile is resolved per invoice from the location, §4 - a
  `billingProfileId` was listed here until Pass 39)
* soldByUserId nullable — who sold the agreement (see "Sale attribution" above)
* startDate
* endDate nullable
* nextServiceDate nullable
* generationLeadDays
* serviceWindowDays nullable
* schedulingMode (`AUTO_ELIGIBLE` | `CONTACT_REQUIRED` | `MANUAL`)
* notes nullable
* createdAt
* updatedAt

### E-sign / document fields

* agreementDocumentTemplateId nullable
* signedDocumentId nullable
* signedAt nullable
* eSignStatus nullable

---

## 10. Service

### Definition

An individual unit of work for a Location.

### Canonical rule

A Service may exist before it is scheduled. Services are the queueable work units shown in location service history and pending dispatch queues.

### Required fields

* id
* locationId
* agreementId nullable
* serviceTypeId nullable
* dueDate nullable
* generatedForDate nullable
* serviceWindowStart nullable
* serviceWindowEnd nullable
* status (`DRAFT` | `PENDING_SCHEDULING` | `SCHEDULED` | `COMPLETED` | `CANCELLED`)
* source (`MANUAL` | `AGREEMENT_GENERATED` | `AGREEMENT_INITIAL`)
* workKind (`SERVICE` | `PRODUCTION` | `CALLBACK`) — what the work is, defaulted from the
  ServiceType (Pass 24; "Service designation and warranty callbacks" below)
* answersServiceId nullable — the Service a `CALLBACK` answers; required on a callback, never set
  otherwise (Pass 24)
* schedulingMode nullable
* appointmentId nullable — the current placement (see Notes below)
* lastAppointmentId nullable — the placement the Service was last taken off (Pass 27; also by a
  per-Service remove or cancel since Pass 28)
* addedInFieldByUserId nullable — a **users** FK: the session user who added the Service to a visit
  from the technician's Appointment Details (Pass 29; §11 "Composition in the field"); never cleared.
  Set means "added in the field": who may edit its instructions there, and that the office owes it a
  review
* fieldReviewedAt / fieldReviewedByUserId / fieldReviewedByLabel nullable — the office's review stamp on
  a field-added Service (Pass 29; the ticket's flaggedAt / flaggedByUserId / flaggedByLabel shape),
  set once; set with the stamp above null is "flagged for office review"
* expectedDurationMinutes nullable — the per-Service plan (the type's `estimatedDuration` by
  default); the Appointment's planned end is derived from the representative's at placement and
  grows by a Service's when it is added or lengthened (Pass 28)
* priceCents nullable — see the pricing rule below
* timeWindow nullable — the customer's preferred window, free text
* notes nullable — the Service's own instructions ("Instructions" on the customer screen), copied
  into the Appointment's notes at placement
* createdAt
* updatedAt

### Notes

* Manual and one-time Services may be created outside Agreements
* Agreement-generated Services do not imply an Appointment exists
* One Appointment may contain multiple Services
* `appointmentId` is the current placement, nulled when the Service returns to the queue.
  `lastAppointmentId` (Pass 27) is the placement the Service was last taken off by a cancel /
  reschedule disposition, set on every Service the disposition touches and never cleared - a
  sibling on a multi-service Appointment has no other link back, since `appointments.serviceId`
  names one representative. It is what lets a pending Service read **Rescheduling** (its last
  Appointment was CANCELED with `rescheduleRequested`) rather than **Pending scheduling**, and it
  is the server's to write, never a client's.

### Pricing rule

An agreement-generated Service carries **no durable price of its own**
(`priceCents` is null). The Agreement holds the price; the per-visit amount is
derived at read time from `agreement.priceCents / agreement.expectedServiceCount`
so an agreement price edit is reflected immediately instead of leaving generated
Services holding stale copies. Price is also **locked in the technician ticket
flow** for agreement work — overriding it requires `ADJUST_PRICE_AGREEMENT`.

A stamped `priceCents` therefore means one of exactly two things: a non-agreement
Service's own price, or a deliberate override. Both outrank the derived amount.
A price stamped or changed through the ticket flow - the technician's post, or the
office's edit of a posted ticket (the review modal's Edit, Pass 18) - is a financial
mutation and is recorded in the audit log (§17) as `price_overridden` on the Service,
with the row before and after (PLAN_BILLING_V1.1 D7). The office's edit follows the
post's rule: an agreement price needs `ADJUST_PRICE_AGREEMENT`, and without it the
edit is refused, never silently dropped.

### Service designation and warranty callbacks — the work kind (PLAN_ROADMAP_V2.md C3.7; Pass 24)

**A callback is a kind of work, not a position in a counter.** A re-treatment, a
warranty return, a follow-up on a conducive-conditions problem — it is a callback
because of what it is, and it stays $0 covered whether it falls inside the
agreement's service interval or outside it. An Agreement schedules interval-based
Services (quarterly, monthly); a callback within that window is still covered
work, not the next scheduled visit.

**As built (Pass 24).** Every Service carries a **work kind** — `workKind`:
`SERVICE` (billable work priced on its own) | `PRODUCTION` (an agreement's
scheduled visit) | `CALLBACK` (answers an earlier Service) — the vocabulary of
`shared/service-kind.ts`. It is called the work kind, not "category" and not
"designation", because both words were taken: `serviceTypes.category` is the
free-text display grouping ("General / Termite / Rodent") and stays so, and the
**billing designation** (`shared/visit-billing.ts`, `BILLABLE` | `PRODUCTION`)
says what the invoice LINE is, not what the work is. The kind badge reads
"Kind: Callback" so the two are never read as one where both show (the dispatch
sheet). The ServiceType carries the default (`serviceTypes.workKind`, set in
Settings → Service Types, whose writes are `MANAGE_SETTINGS` since this pass);
the instance carries its own, defaulted from the type on every creation path —
the customer screen's form, the dispatch board's prefill, agreement generation,
an opportunity's conversion, the seed — the same shape as price (type default,
instance override). One exception in the default: an agreement's own generated
or initial visit is never a callback (there is nothing for it to answer), so a
CALLBACK type there reads PRODUCTION; a MANUAL Service on an agreement customer
keeps the type's CALLBACK — that is the warranty callback.

**The callback link is required, not optional.** A CALLBACK names the Service it
answers (`services.answersServiceId`, a self FK), chosen where the callback is
created: a COMPLETED Service at the same location that is not itself a callback
— a second callback on the same problem answers the original too, so the
callback rate per original Service is one group-by, never a chain walk. Refused
with a code otherwise (`CALLBACK_LINK_REQUIRED`; `CALLBACK_LINK_NOT_ALLOWED` on a
non-callback; `_NOT_FOUND`, `_SELF`, `_LOCATION_MISMATCH`, `_NOT_COMPLETED`,
`_IS_CALLBACK`), and shown as "Answers <type> on <date>" on the Service Details,
the dispatch queue and the dispatch sheet. An unattributed callback is invisible
to exactly the analysis callbacks exist to support. An Opportunity of a CALLBACK
type converts into a callback answering its source Service; with no source the
conversion is refused rather than silently re-kinded.

**The instance override is the price's rule.** Setting a Service's kind away from
its type's default, or changing it or its link later, needs the price's
permission — `ADJUST_PRICE_NON_AGREEMENT` (every role) on a non-agreement
Service, `ADJUST_PRICE_AGREEMENT` (manager and admin by default) on an agreement one — because the
kind decides what the price decides: whether the line is $0. A change is
refused (409 `SERVICE_KIND_LOCKED`) once the ticket is finalized (its production
entry was written from the kind) or the visit is invoiced (its line is frozen);
a DRAFT does not lock, and a posted, unfinalized ticket is the review moment. A
change is recorded in the audit log (§17) as `work_kind_changed` with
`{ workKind, answersServiceId }` before and after (PLAN_BILLING_V1.1 D7). A type
change never re-derives the kind, and the technician's ticket does not carry it.

**The credit and the $0 decision read the kind, never a counter.** The production
ledger's basis is `productionBasisForService`: a CALLBACK is basis `CALLBACK` at
$0, priced or not — a callback earns no production (§13); a deliberate charge is
billing, and Phase 7's comp plans can pay on collected revenue. An agreement's
PRODUCTION or SERVICE visit is `SCHEDULED_AGREEMENT_SERVICE` at contract price ÷
expected visits **whatever its position in the count**: the slot counter is
gone, so an extra scheduled visit past `expectedServiceCount` credits the
per-visit value like any other and the per-agreement total is no longer capped
at the contract price — the office's designation is the control, and a wrongly
credited visit shows in the ledger rather than a real visit vanishing from it.
The invoice's resolver reads the kind before it consults the plan (§13): an
unpriced CALLBACK is an `AGREEMENT_COVERED` "warranty callback - no charge" line
on every plan, schedule-billed or not, agreement or not (a warranty return on a
one-time job is a callback too) — the more specific truth than "covered by
agreement", and what the batch preview's CALLBACK kind and the ticket's note
read; a priced CALLBACK bills a `SERVICE` "callback" line on every plan, since it
is not one of the plan's paid visits. A DRAFT prices a callback $0 before its
ticket exists. Chargeability stays per instance: no price set means warranty
work at no charge, a price set means it bills that amount (some operators
deliberately charge for callbacks caused by customer non-compliance — a messy
structure on a German roach job — as a behavioral lever).

**History.** Before this pass callbacks were *inferred*, not declared:
`createProductionValueEntriesForFinalizedRecord()` assigned basis CALLBACK once
the Agreement's `expectedServiceCount` slots were full, and invoice generation
read that entry — wrong in both directions (a genuine callback inside the
interval consumed a paid slot and was billed as a scheduled visit; the last
genuine scheduled visit was then credited $0), reachable only off schedule-billed
plans, and blind to a DRAFT. The three CALLBACK entries the counter wrote and
their $0 lines stand as history (the ledger is append-only); their Services
carry the type's kind like every other row. Attribution before this pass existed
only for non-agreement follow-up through the Opportunity flow
(`opportunities.sourceServiceId` / `sourceServiceRecordId` / `convertedServiceId`);
`serviceRecords.followUpRequired` / `followUpNotes` still record that a
follow-up is *needed*, and the answers link is what records which visit a later
Service *answered*.

---

## 11. Appointment

### Definition

A scheduled dispatch placement for one or more Services.

### Fields as built (`appointments` in `shared/schema.ts`; this list was corrected in Pass 28 to what exists)

* id, orgId
* customerId — the customer; there is no `accountId` on the row (the account is reached through the
  location, canon rule 2)
* locationId nullable
* serviceId nullable — the **representative** Service, one of the linked ones (plain varchar, no FK;
  see "Composition" below)
* agreementId nullable — plain varchar, no FK
* serviceTypeId nullable — the representative's type
* assignedTechnicianId nullable - a **users** FK since Pass 38 (the technician is a User, §16);
  assignedTo nullable (the technician's display name at placement, text).
  Since Pass 30 the technician is also the visit's **LEAD** in its crew (`appointment_technicians`,
  Scheduling Rules §4), and a technician the customer EXCLUDED is refused at placement (§3)
* source (`MANUAL` | `AGREEMENT_GENERATED` | `AGREEMENT_INITIAL`); generatedForDate nullable
* scheduledDate — the planned start (NOT NULL)
* scheduledEndDate nullable — the planned end, the only planned-duration carrier: set by the client
  at placement (slot + the representative's `expectedDurationMinutes`) and on the sheet, and since
  Pass 28 **grown by the server** when a Service is added to the visit or lengthened - never shrunk
  by a removal (the office shortens it on the sheet)
* timeInAt / timeOutAt nullable; durationMinutes nullable — **actual**, from time in / out, never a plan
* timeInLat / timeInLng / timeOutLat / timeOutLng nullable
* status (`SCHEDULED` | `IN_PROGRESS` | `COMPLETED` | `CANCELED`) — hardened to this
  four-value enum in Pass 1 (D1a) and enforced by `appointmentStatusSchema` in `routes.ts`.
  Note the single-L `CANCELED` is deliberately distinct from Service's double-L `CANCELLED`;
  the cross-table sync sites in `storage.ts` translate between the two vocabularies.
  `confirmed`, `rescheduled`, and `issue` appeared in the original sketch of this entity but
  were never implemented — a reschedule request is carried by the `rescheduleRequested` /
  `rescheduleRequestedAt` fields on a `CANCELED` appointment, not by a status value.
* cancelReason / cancelNotes / cancelRequestedAt / cancelRequestedByLabel nullable;
  rescheduleRequested (NOT NULL, default false) / rescheduleRequestedAt nullable (§9, Pass 27)
* lockTime / lockTechnician (NOT NULL, default false) — the board's move guards
* notes nullable — the visit's instructions to the technician (B13's "order instructions":
  "Scheduling Notes" on the dispatch sheet, "Appointment Notes" on the technician's day), seeded
  from the representative Service's notes at placement and edited on the sheet; a change is
  recorded in the audit log (§17, `appointment_composition_changed`, Pass 28)
* createdAt. There is **no** `updatedAt`.

Not on the row, although earlier drafts of this section listed them: `accountId`,
`serviceAgreementId`, `scheduledStart` / `scheduledEnd` (they are `scheduledDate` /
`scheduledEndDate`), `timeWindowStart` / `timeWindowEnd` (the window is the Service's free-text
`timeWindow`), `supportTechId` (the crew is the `appointment_technicians` table, Pass 30), `routeDate` / `routeSequence` (Smart Schedule, Phase
9), `estimatedDurationMinutes` (the plan lives on `services.expectedDurationMinutes`), `updatedAt`,
and `reportedPestType` / `reportedProblemNotes` (a customer's reported problem is recorded as a
location note or the Service's notes today).

### Canonical rule

Appointments should ideally be created from a selected location context so core values are already known.

Appointments are scheduling placements. They are not the canonical work history object and should not be created by recurring agreement generation until work is actually placed on the board.

One Appointment may contain multiple Services. Each linked Service remains independently visible and independently completed.

An Appointment leaves the board only through the cancel / reschedule disposition (§9, Pass 27):
`CANCELED` is never written by the generic update, and a board move is confirmed before it writes.
(One exception stands, noted in Pass 28 and left as it is: `cancelAgreement` still writes `CANCELED`
directly on the agreement's scheduled Appointments, with no reason, flag, `lastAppointmentId` or
audit row - the agreement cancellation workflow, Phase 9, owns that cascade.)
A `CANCELED` placement - cancelled or rescheduled - is history, not a board card (owner,
2026-09-25): it comes off the dispatch board so its slot is free, and it stays visible on the
location's Services tab and History tab as the record of the visit that did not happen. That rule is
one shared predicate, `isBoardPlacement()` in `shared/appointment-disposition.ts` (Pass 27b): false for
`CANCELED` whatever the reschedule flag says, read by the dispatch board's viewport, which its slot
map, analytics and card selection derive from; the technician's day (`getTechnicianWork`) excludes
`CANCELED` in SQL. The appointments read itself stays unfiltered: the Services tab, the ticket review
queue and the dashboard still need the row.

**Composition (Pass 28; PLAN_ROADMAP_V2.md C4.3a; B13).** Which Services are on an Appointment is
edited from the dispatch sheet's Appointment Details through four routes, each one transaction over
`getLinkedServicesForAppointmentTx` (development rule 10) and one audit row
(`appointment_composition_changed`, §17): **add** a Service (`POST /api/appointments/:id/services` -
a `PENDING_SCHEDULING` Service at the same location from the queue, or a new one-time Service created
placed, with its type's duration and price as defaults), **remove** one back to the queue
(`POST .../services/:serviceId/remove` - the disposition's RESCHEDULE semantics for one Service:
`PENDING_SCHEDULING`, dates kept, `lastAppointmentId` stamped), change one's **type or duration**
(`PATCH .../services/:serviceId`), and the visit's **instructions** (`notes`, through the generic
update). The rules: a Service landing on a visit is `SCHEDULED` with the visit's technician, becomes
the representative when the visit has none of its own, **extends the planned end** by its expected
duration (a longer duration extends it by the difference; nothing shrinks it), and has its open
reschedule / cancel-review Opportunities converted exactly as a placement converts them - the
board's attach-from-queue and grouped placement go through the same route. The **representative
follows the first remaining sibling** when the current one leaves (and `serviceTypeId` with it), so
it is never null while a Service remains. An **agreement Service's type is locked** to
`ADJUST_PRICE_AGREEMENT` (the price's rule, §10) - on the sheet, on the customer form and on the
generic update alike. The **last active Service** cannot be removed or cancelled on its own
(`LAST_SERVICE_ON_APPOINTMENT`): the sheet offers Reschedule or Cancel appointment instead. A Service
with a posted ticket, a settled Service and a visit whose invoice is issued are refused. Cancelling
ONE Service is §9's per-Service cancel (`service_cancelled`). A `CANCELLED` Service still linked to
a visit (the disposition's convention) counts on no rollup: the finalize rollup and the billing
group both skip it, so a cancelled sibling never holds a visit open.

**Composition in the field (Pass 29; PLAN_ROADMAP_V2.md C4.3b; B13 "the tech view gets the same, tucked
behind selectors"; Part E answers 6 and 7).** The technician's Appointment Details edits the same
visit through the same routes - every field action is a route, since the field is a native app later
(the Phase 3 design rule). Each linked Service is displayed and becomes editable on click: its
**type** through the composition PATCH (non-agreement work with no ticket yet; an agreement Service
shows the locked label as the ticket dialog does, the lock being the server's `SERVICE_TYPE_LOCKED`),
and its **instructions** (`services.notes`, the Service's own - never the visit's `appointments.notes`,
which stays "Appointment Notes", read-only in the field) through the generic Service update, which
refuses a technician's change on any Service they did not add (403 `SERVICE_INSTRUCTIONS_LOCKED`; the
office's roles are not held to it). Duration is not edited from the field. **Add service** posts the
add route with `origin: "FIELD"` (the default is `OFFICE`), which turns on three rules the office's
add does not carry: (1) **one-time work only** - a new MANUAL Service at the visit's location with the
type's duration and price as defaults; a queued Service, agreement or not, is the office's to place
(400 `FIELD_ADD_NEW_ONLY`); (2) the Service is **attributed to the session user**
(`addedInFieldByUserId` - the session user; since Pass 38 the Tech View's technician IS the session
user for a technician login, so the two agree)
and so **flagged for office review** (Part E answer 7: yes, without approval, flagged) until the office
marks it reviewed through `POST /api/services/:id/field-review` (`FINALIZE_TICKET`, support and above
- the office's review permission, so a technician cannot clear their own flag; one
`field_service_reviewed` audit row, §17; refused on a Service not added in the field or already
reviewed); (3) the add **must not run into the technician's next stop** (B13): the next stop is the
next board placement (not CANCELED) assigned to the same technician on the visit's day as the
technician's day read lists it (local midnight to midnight; a stop on another day is never
consulted), the would-be end is the shared `extendPlannedEnd` rule (a visit with no planned end falls
back to the representative's duration), and an add whose extension would run that end past the next
stop's start is refused 409 `NEXT_STOP_OVERLAP` with both times in the message, before anything is
written; an add that extends nothing cannot overlap. The **office's add is never refused** for the
next stop - it sees the board - but every add's result and audit row carry `nextStop` (the stop, the
would-be end, whether it was passed) so the sheet's toast can say the visit now runs past it. The
visit's `appointment_composition_changed` row records the add's `origin` and `flagged`. The flag shows
as a "Field-added - review" badge (quiet "Field-added" once reviewed) on the dispatch sheet's
composition block, the location's Services tab, Service Ticket Review and the technician's own row,
with **Mark reviewed** beside it for the office. No new permission: the origin is open to every role
(the surface decides, the flag is the control; a permission is listed under PLAN_ROADMAP_V2.md C5.10). The ticket's `FLAGGED_FOR_REVIEW`
(§12) is untouched - it stays the invoice-driven flag on the ticket, and this one lives on the
Service.

Appointment timing is a scheduling/field-operations layer. Time In / Time Out is tracked on the Appointment because the visit may contain multiple Services. Duration supports future route analytics and billing review, but GPS capture is staged for later.

---

## 12. Service Record

### Definition

The compliance and completion record for one performed Service.

### Purpose

* permanent operational history
* office review / staging / posting
* technician completion record
* compliance snapshot for technician name/license and materials

### Required fields

* id
* serviceId
* appointmentId nullable
* accountId
* locationId
* serviceAgreementId nullable
* serviceTypeId nullable
* technicianId
* technicianName
* technicianLicenseNumber
* serviceDate
* completion status/result
* notes nullable
* areas serviced nullable
* conditions found nullable
* recommendations nullable
* followUpRequired boolean
* followUpNotes nullable
* customerSignature nullable
* createdAt
* updatedAt

### Canonical rule

Service Records are tied to Services. Posting one Service Ticket in a multi-service Appointment should not automatically post or finalize sibling Services.

When a Service Ticket is posted, the system must copy the technician display name and license number onto the Service Record. Historical compliance rendering must not rely only on live Technician profile joins because technician profiles can change later. Since Pass 38 (C5.7) `technicianId` is a **users** FK and the copy is read from the users row (`userDisplayName`, `licenseId`); the three technician fields are listed as required above, but the column is nullable and the dev DB holds 5 tickets of 77 with no technician id (3 with no name, 5 with no license - rows from before the snapshot existed, named "Jake Miller" where named at all); they are history and are not backfilled.

An Appointment can be marked completed only when all Services linked to that Appointment have posted Service Records, unless a future explicit close/exception workflow is built.

Technician posting and office finalization are distinct lifecycle steps. Technician posting creates the compliance record and sends it to office review. Office finalization is the authoritative completion event: it marks the Service completed, locks the ticket, makes the Service Record billing-ready, advances agreement recurrence when applicable, and allows downstream reporting/billing workflows. Reopen behavior is role-gated (`REOPEN_TICKET`, support+) and must capture a reopen reason: since Pass 17 (PLAN_ROADMAP_V2 C3.2) a reason from the office's settings list (`ticket_reopen_reasons`) or "Other" with the reason typed out, which only a profile holding `REOPEN_TICKET_OTHER` may choose (the built-in manager and admin); the ticket carries the code and the text, a ticket reopened before the list existed carries its text alone, and a reopen is recorded in the audit log (§17) as `ticket_reopened` with the ticket before and after, the reason included (PLAN_BILLING_V1.1 D7).

Ticket status vocabulary is `OFFICE_REVIEW_PENDING | FLAGGED_FOR_REVIEW | FINALIZED | REOPENED`.
`FLAGGED_FOR_REVIEW` (PLAN_BILLING_V1.1 D3) is a pending ticket on a visit whose invoice was issued
before this ticket was finalized — either by a manager's pre-finalization override, or because the
ticket was posted onto a visit that was already invoiced. It is reviewed and finalized exactly like
any other pending ticket; the flag exists so the reviewer knows the customer already holds a bill, and
that a price difference is a correction on the invoice, not an edit to the ticket. Who flagged it and
why are recorded on the ticket and in the audit log.

### Canonical rule — lockdown after posting (PLAN_BILLING_V1.1 D9, enforced server-side in Pass 16)

A posted ticket is **locked from the technician**: a re-post over a ticket in office review
(`OFFICE_REVIEW_PENDING` or `FLAGGED_FOR_REVIEW`) needs `EDIT_TICKET` (support+), so the technician's
only way back in is the office's reopen, after which the `REOPENED` ticket is theirs to re-post.
The office edits a posted ticket through the gated `PATCH /api/service-records/:id` — its content
only (service date, technician, notes, target pests, areas, conditions, recommendations, follow-up,
signature, materials); the lifecycle columns belong to post / finalize / reopen and are refused,
not written. A **finalized** ticket is immutable for everyone: an edit or a re-post is refused with
"reopen first", and corrections go through reopen-with-reason (workflow, `ticket_reopened`) or a
credit memo (money, §14) — never an edit. Every accepted edit or re-post over an existing ticket is
recorded in the audit log (§17) as `ticket_edited`, the ticket row and its product applications
before and after; an edit that changes nothing writes nothing. "Finalized" is any of the three
signals finalization sets and reopen clears — `ticketStatus = FINALIZED`, `confirmed`,
`readyForBilling` — read through `shared/ticket-status.ts`, which the technician view reads too, so
the field is never offered a post the server refuses. The Service's price and type live on the
Service: a post stamps them, and since Pass 18 (C3.1b) the review modal's **Edit** changes them
through the same PATCH - under the post's rule (`ADJUST_PRICE_AGREEMENT` for an agreement price or
type, refused 403 for anyone else; support edits everything else), logged `price_overridden` on the
Service as a post's is (§10), in one transaction with the ticket's `ticket_edited`; the ticket's own
type follows the Service's as a post copies it.

Agreement-generated Services advance agreement recurrence when the generated Service is office-finalized. Non-agreement finalized Services may generate future Opportunities according to Service Type follow-up rules.

### Canonical rule — the service report (PLAN_ROADMAP_V2.md C3.5, B11; Pass 22)

A Service Record has one customer-facing document, the **service report**: the technician of
record and their license number as copied onto the ticket at post (never today's profile), the
service date, the service type, the ticket's target pests (the stored union below), the areas
serviced, every Product Application row (product, EPA registration number, amount and unit,
dilution, method, areas, pests), the notes, conditions found and recommendations, the follow-up,
and a signature line that states whether a signature was captured. It is rendered by a pure
function (`server/documents/service-report-pdf.ts`) and stored like an invoice's PDF
(`documents`, kind SERVICE_REPORT, one row per ticket) on the first request, served as the
stored bytes after that, and **retired whenever the ticket's content is written again** - a
re-post, an office edit that changed something, a material row added - so the next request
renders the ticket as it now stands; finalize and reopen change no content and keep it. The
audit log (§17) is the history; the report is always the present. A technician may preview the
report of an unposted ticket from the collect step; the preview says so and is stored nowhere.
The invoice and the service report are separate documents (owner, 2026-09-19): the Settings
toggle "Attach service report to visit invoices" appends a visit's reports to its invoice PDF
(§13), and neither replaces the other.

### Canonical rule — the field surcharge line (PLAN_ROADMAP_V2.md C3.6; owner 2026-09-13; Pass 23)

A **field surcharge** is a charge the technician records on the Service Ticket at the visit for
what scheduling could not see (a larger home, conducive conditions). It is **not a term of the
sale**: no Agreement or Agreement Template holds a surcharge default, only the template's toggle of
whether the technician may add one (`fieldSurchargeAllowed`), read through the Agreement's template
so a flip applies to every agreement on it. It is the **ticket's content** (`surchargeCents`,
`surchargeLabel`, the label defaulting to "Cleanout surcharge"; no amount means no label): the post
writes it whole, the office edit changes it, `ticket_edited` snapshots it, the service report prints
it. It is **never the Service's price** (PLAN_BILLING_V1.1 D6): the visit Invoice carries it as its
own `SURCHARGE` line beside the ticket's service line ("<label> - <service type> - <date>"), taxed as
a `SERVICE` line is, never counted toward the contract price, chargeable even when the service
itself is covered - a covered visit with a surcharge is never "No Charge". Recording, changing or
removing one needs `ADD_FIELD_SURCHARGE` and, when adding to an agreement service, the template's
toggle - refused with a code before anything is written, by one rule the server and the ticket
dialog share; a non-agreement service needs the permission alone; an unchanged surcharge is never
re-gated. Every change is a money mutation logged as `surcharge_recorded` (§17) beside the content's
`ticket_edited`. The visit's figures (§13, D6) price it as a BILLABLE charge the technician collects
with the service, and the unposted amount is priced by the read as the price is (Pass 19).
**Production credit - transitional (development rule 4):** when a ticket carrying a surcharge is
finalized, one basis `SURCHARGE` production entry credits the posting technician with the amount,
once per ticket, standing in for a comp plan that answers "yes" until Phase 7's per-plan selector;
it keys off the recorded line, never off who collected (D4 item 3).

### Materials support

Materials should be modeled as child records, not stuffed into one field.

Material Products are reusable compliance-aware definitions. They should support product identity, EPA number, manufacturer, formulation, active ingredient percentage, restricted-use flag, allowed dilution options, allowed methods, allowed equipment/devices, allowed application areas, defaults, and technician override settings.

Product Application rows should be product-driven and capture product, EPA number, dilution, amount/unit, application method, equipment/device, application area, notes, and active ingredient amount.

Areas serviced should be derived from structured application areas where practical. Avoid duplicating application areas as a separate primary freeform field.

Since Pass 20 (PLAN_ROADMAP_V2.md C3.4a) the vocabulary behind a Product Application row is the office's, in two Settings-managed lists (`app_settings` rows `material_units` and `application_areas`; `shared/material-lists.ts`): the unit of the amount applied is picked from the unit list, and the application areas are a **list per row** (`applicationAreas[]`) picked from the product's allowed areas - themselves picked from the org's area list - or from the org's list when the product names none. Areas serviced on the Service Record are **derived by the server** from every row's areas (the union, in row order) whenever a post or an office edit sends materials; free text stands only when no row names an area. A unit or area outside a list is **kept, never refused**, and shown marked "not on the list": the row is the compliance record of what the technician did, a post from the field must not fail over vocabulary the technician cannot edit, and rows from before the lists carry free text. A value matching a list entry apart from casing or whitespace is written in the list's spelling, so the vocabulary converges without a refusal. `applicationLocation` (the single area rows carried before Pass 20) was transitional (development rule 4) and was **dropped in Pass 21** (C3.4b): every reader went through the list and every writer wrote it, so the column and the body field are gone; the ticket dialog's restore of a local draft saved before Pass 20 is the one reader left of the name.

The MVP may capture Product Application rows without full inventory deduction. Full inventory, billing, invoice posting, and payment collection are future layers built from finalized/billable Service Records.

### Mobile technician workflow

The technician workflow is mobile-first web/PWA. It is not a native app yet.

Technician Service Ticket drafts may be protected locally with `localStorage`. This protects refresh/background/navigation interruptions on the same device, but it is not full offline sync.

Technician route view is day-driven and should support compact date navigation suitable for mobile field use.

Technician route view supports Time In / Time Out on the Appointment. Service Time Tracking Mode in Settings controls whether ticket posting automatically times out, prompts the technician, or requires manual time out.

The post-ticket sequence is **finish → collect → post** (PLAN_BILLING_V1.1 D8). The technician finishes the ticket, is shown the customer-facing Price / COA / Due today summary for the visit (§13, D6), records what was collected as a `PENDING`, **unapplied** Payment at the Location with the collector stamped from the session (§14; designation to the Agreement is intent, never application), and then posts. The field never applies money to an Invoice and never confirms cash; the office does both. Neither button says "complete" — office finalization owns that word ("Finish & Collect" / "Post Service Ticket").

The price typed on the ticket is **priced by the read, never by the browser** (PLAN_ROADMAP_V2.md C3.3, Pass 19): the visit's billing read takes the unposted price (`?serviceId=&priceCents=`) and prices that Service through the same resolver and tax engine as the visit invoice, writing nothing, so the Price / tax / Due today block and the collect step follow the technician's price at once while the stored price still changes only at Post (§10, `price_overridden`). The draft is subject to the post's rule - an agreement price is re-priced only for `ADJUST_PRICE_AGREEMENT`; otherwise the stored figures stand and the read says so - and an issued Invoice's figures are never re-priced. Tax on the ticket is the tax engine's answer, display-only. The open ticket also shows the Agreement's service instructions, the Service's notes and the Location's notes (site instructions belong in location notes, §5), and the technician view asks "Time in now?" when a ticket opens on a visit with no Time In, bypass allowed.


Target pests are Settings-managed reference data for internal treatment context on the Service Ticket. They are not the same as warranted pests or customer-facing warranty language, which are future contract/terms concepts.

Since Pass 21 (PLAN_ROADMAP_V2.md C3.4b; B12, owner 2026-09-19) target pests live at **two levels**. Each Product Application row carries its own target pests (`targetPests[]`) - the compliance record of what that product was applied for - picked from the org's target-pest list (`target_pests`, its active rows) and written in the list's spelling where the match is case-insensitive, kept as sent otherwise (the Pass 20 rule: kept, never refused, shown marked). The Service Record's target pests are the **ticket-level set, derived by the server** on every post and every office edit: the ticket's own picks (the body's, or the stored set when the body omits them) followed by every row's pests in row order, deduped case-insensitively, each in the list's spelling - so the set never names fewer pests than the rows do, and it is what the ticket's summary line, the review modal and the service report show. Only the union is stored; an office edit seeds its picks from the stored set whole, so a pest that arrived through a material stays until someone removes it - a pick is never dropped silently. The ticket-level control is a searchable multi-select over the list, placed in the Materials section beside the rows, each of which has the same control for its own pests.

For non-agreement Services, technicians may adjust service type and price as a staged field workflow for evaluations, upgrades, or one-time scope changes. Agreement-generated Services should keep service type and price locked in the technician ticket flow.

As built (Pass 29; PLAN_ROADMAP_V2.md C4.3b): besides the ticket's own type and price at post, the technician's Appointment Details change a non-agreement Service's **type** on click (the composition PATCH, locked on agreement work and once a ticket is posted), edit the **instructions** of a Service the technician added, and **add a one-time Service** to the visit - its type, minutes, price and instructions typed there, the visit's end extended, the technician's next stop respected, the office asked to review it (§11 "Composition in the field"). The kind badge, the agreement marker, the field-added flag and the planned duration show on every row; the price stays the visit's billing read (Price / COA / Due today, D6).

Material entry should remain mobile-manageable: new materials add at the top, empty material use is allowed, cards can be removed, and saved material rows collapse into summaries that can be expanded for review/edit.

Technicians may mark a Service Ticket as follow-up required and provide follow-up notes such as "2 weeks" or "30 days". Office review is responsible for customer contact and scheduling the follow-up. Technician-side follow-up appointment selection should wait until route optimization and admin-configured follow-up availability settings are implemented.

#### ServiceVisitMaterial

* id
* serviceVisitId
* productId nullable
* productNameSnapshot
* epaNumber nullable
* concentration nullable
* amount nullable
* unit nullable
* deviceType nullable

### Weather support

Weather should be optional and default-hidden/collapsed in the UI.

#### ServiceVisitWeather

* serviceVisitId
* precipitation nullable
* overcast nullable
* windSpeed nullable
* temperature nullable
* notes nullable

### Product usability rules

* provide a product list with defaults
* support technician favorites for frequently used products

---

## Opportunities

Opportunities represent human follow-up/action work. They can come from:

* non-contract completed-service follow-up
* agreement contact-required generated Services
* cancellation recovery
* future retention-risk workflows

Opportunities are not Appointments and do not automatically schedule work. They may convert to or link to Services depending on their source.

### Canonical rule — two axes and an assignee (PLAN_BILLING_V1.1 D8; PLAN_ROADMAP_V2.md B7 / C4.1, Pass 25)

An Opportunity carries two required axes, never one mixed list:

* `categoryKey` — the **reason** it exists: a key of the settings-managed `opportunity_categories`
  list, seeded per org with `NEW_SALE`, `SERVICE_DUE`, `RESCHEDULE`, `WINBACK`, `RETENTION` and no
  others (owner, 2026-09-19). Settings edits a category's label, order and active flag; nothing
  creates or deletes a key. An inactive category stays on the rows that carry it and can be
  filtered on; it can no longer be chosen.
* `workType` — what the work would be if it converts: `AGREEMENT` or `ONE_TIME`.

Both are stamped at creation from the row's `source` by one shared function
(`shared/opportunities.ts` `taxonomyForSource`), used by every runtime writer and by the migration
that mapped the pre-existing rows, so the two can never disagree: agreement contact-required and
non-contract follow-up are `SERVICE_DUE`, an agreement's cancellation is `RETENTION`, a cancelled
or reschedule-requested appointment is `RESCHEDULE` (work type by the service's agreement), an
agreement's initial service is `NEW_SALE`, and a one-time service the office cancels off an
appointment is `WINBACK` (source `APPOINTMENT_CANCELLATION_WINBACK`, the cancel flow's own source
since Pass 27 / C4.2 - the same review source on a field handoff requeues the service and stays
`RESCHEDULE`); `WINBACK` can also be chosen by hand. `opportunityType` (free text) is the display
label only - transitional, not an axis.

An Opportunity may be **assigned** to one user (`assignedUserId`, a `users` FK; `assignedAt`
stamped on every change, null when unassigned). Assigning, reassigning and unassigning by hand need
`ASSIGN_OPPORTUNITY` (support and above); a technician sees the queue and "My opportunities" but
assigns nothing. Every assignee, category or work-type change is an audit `update` on the
`opportunity` entity naming the users before and after.

### Canonical rule — assignment rules and zones (PLAN_ROADMAP_V2.md C4.1b, B7; Pass 26)

A new Opportunity is **auto-assigned at creation, or left unassigned** - and after that only a
person reassigns it. The office keeps two Settings lists, each its own org-scoped table (a rule
needs a stable zone id to reference and an order, which an `app_settings` JSON list cannot give):

* **Zones** (`zones`; `shared/zones.ts`): named lists of unique five-digit ZIP codes, active or
  not. A ZIP+4 is normalized to its first five digits; an entry that is not a ZIP or a ZIP+4 is
  refused by name, never dropped. A Location is in a zone when the first five characters of its
  zip are on the list; an inactive zone covers nothing. Built here for assignment; dispatch and
  Smart Schedule (Phase 9) read the same table.
* **Opportunity assignment rules** (`opportunity_assignment_rules`;
  `shared/opportunity-assignment.ts`): four nullable matchers - category key, work type, zone,
  source - and one `users` FK, in a sort order. A null matcher matches anything.

At every creation - the four runtime writers insert through one storage path,
`insertOpportunityTx` - the active rules are tried in order against the row's two axes, its source
and its Location's zip, and the **first match assigns**: `assignedUserId` / `assignedAt` are
stamped on the insert itself and `assignedByRuleId` names the rule. No match leaves the row
unassigned exactly as before. The write is the **system actor's** (§17: a null actor is a
system-driven write; label "System"), recorded as `opportunity_auto_assigned` on the `opportunity`
entity with the rule and the user named - never a person's `ASSIGN_OPPORTUNITY`. A rule naming an
inactive user cannot be saved; a rule whose user or zone later goes inactive is **skipped and
reported on the Settings card, never silently re-pointed**. A later category or work-type change
does not re-run the rules: the row says "at creation". A manual reassignment overrides a rule's -
it nulls `assignedByRuleId` and is logged as the `update` above, so the History reads as a person
overriding a rule - and the queue's assignee chip says "(auto)" while a rule's assignment stands.
The lists are Settings: reads are open, every write is `MANAGE_SETTINGS`; a zone named by a rule
and a rule that has assigned rows are refused deletion (deactivate instead), so history keeps its
references.

## 13. Invoice

### Definition

Billing output generated from service or manual billing actions.

### Canonical rule — the billing anchor

An Invoice anchors to the **Appointment**, not the Service Record (PLAN_BILLING_V1.1 D1). The customer
experienced one visit, so one visit produces one invoice carrying one line per finalized Service Record
on it, plus any add-on/surcharge/discount lines.

* at most one non-void invoice per `appointmentId`
* work with no appointment (direct one-offs) falls back to at most one non-void invoice per
  `serviceRecordId`
* an invoice sets **exactly one** of `{appointmentId, serviceRecordId}` at the header, never both;
  manual and schedule-driven (agreement) invoices set neither
* both rules are enforced by partial unique indexes, not by convention, so voiding an invoice frees the
  visit for a corrected one
* an invoice is generated only once **all** Services linked to the appointment are finalized. Partial
  finalization does not invoice.

### Canonical rule — what an agreement Service costs on a visit invoice

There is exactly one question: **does the nightly billing run bill this Agreement's Billing Plan?**
(`isScheduleBilledPlan()` in `shared/billing-plan.ts` — the single predicate both sides read, so the
run and the invoice can never disagree about who charges for a visit.)

* **Yes** (`ON_SCHEDULE` + `RECURRING_INTERVAL`/`PREPAID_TERM`) — the customer already pays on the
  plan's cadence, so the visit line is an `AGREEMENT_COVERED` line: always $0, always non-taxable,
  never accompanied by a `billing_events` row. Display-only truth for the customer; the nightly run
  remains the one and only source of that agreement's revenue.
* **No** (`ON_SERVICE_COMPLETION`, `PER_SERVICE`, `ON_AGREEMENT_START`, `INSTALLMENT`, or no plan) —
  the **visit is the billing event** and the line carries a real amount: the Service's own price if
  one is stamped, otherwise the contract price spread across the Agreement's snapshotted
  `expectedServiceCount`. A warranty callback — a Service whose work kind is `CALLBACK` with no
  price (§10, Pass 24) — is the one $0 case here, decided by the kind before the plan is consulted
  and never by absence of data; a priced callback bills its price on every plan.

Never infer coverage from the mere presence of an `agreementId`. An agreement whose plan the nightly
run skips is billed by nobody if the visit invoice also zeroes it, and that failure is silent.

**Every Agreement carries a Billing Plan.** `billingPlanId` is NOT NULL since Pass 12
(PLAN_ROADMAP_V2.md C2.2): the office names one on the form or the template supplies its default,
and an Agreement naming neither is refused at creation, never inserted plan-less. The 11 rows that
predated the constraint were attached to "Monthly Recurring" on the owner's answer of 2026-09-19,
each row's effect under Pass 3.5's attach rules printed at boot. `isScheduleBilledPlan()` still
answers "no plan" as COD, for a plan row that fails to load — the visible failure, deliberately
chosen over the silent one. An Agreement with no price refuses to invoice rather than guessing.

### Canonical rule — the initial charge is a term of the Agreement, not of the Billing Plan (PLAN_BILLING_V1.1 D4)

* A down payment owed at agreement start - the one initial-charge type since Pass 23 (C3.6): a
  cleanout surcharge is a ticket line (§12, the field surcharge line) and paid-in-full is a
  `PREPAID_TERM` billing plan - is a term of **one sale**, derived from **that** Agreement's
  contract price. It lives on the Agreement
  (`initialChargeType`, an amount mode of flat cents or percent of price, `initialChargeCollectedBy`),
  with the Agreement Template carrying the default — exactly the `defaultPriceCents` → `priceCents`
  relationship. The block moves as one: a sale's type with a template's amount describes nothing.
* **A down payment bills on the first visit's invoice** (owner, 2026-09-21; PLAN_BILLING_V1.1 D4 item
  2a, built as Pass 11d). It is a charge of the initial service, whoever collects it: the visit
  Invoice carries it as its own `INITIAL_CHARGE` line after the service lines — a covered visit is
  then $0 covered plus the deposit, never "No Charge" — and the Agreement's one `INITIAL_CHARGE`
  billing event, attached when that Invoice is issued (never by a DRAFT), is what makes it bill once.
  The event is **live** when it has no invoice (settled outside the ledger) or its invoice is not
  VOID; a voided invoice makes it non-live, so the deposit rides the corrected Invoice and the event
  is re-pointed, never duplicated. Nothing is issued at agreement creation. The explicit "issue up
  front" path on the agreement card is a standalone Invoice for a deposit the customer pays before
  the visit; it is refused once the charge is live anywhere.
* A down payment **counts toward the contract price** by default ($400 agreement, $100 down, $300
  remains); "in addition to" is an explicit exception (D4 owner review, built with the remaining-price
  arithmetic in Pass 6). Only a *surcharge* is inherently additional, and a surcharge is not a term of the sale at
  all: the technician charges it at the initial service for what scheduling could not see. The
  template holds only whether the technician may (`fieldSurchargeAllowed`; the field surcharge
  line, §12, Pass 23).
* The Billing Plan says how and when a customer is charged and is shared by every agreement on it. It
  keeps only what concerns its cadence — `initialChargeCoversFirstPeriod` (does the up-front money buy
  period 1); whether the technician may add a surcharge in the field is the Agreement Template's,
  never a plan's (`fieldAddableSurcharge` was dropped in Pass 23). A plan never carries an
  amount. Paid-in-full is a plan arrangement: `PREPAID_TERM` bills the whole contract price once at
  start, for any term length, and every visit is a $0 covered line.
* `initialChargeCollectedBy` is **who may collect**, never who did. Null means either role may. Its
  readers (Pass 11d): the office is prompted to collect the deposit at signing and at scheduling
  unless the technician is the only permitted collector, the technician's figures and collect step
  call it out unless the office is, and both happen when either may; money the office collects is a
  Payment designated to the Agreement (§14), offered first when the first visit's Invoice is issued.
  It never affects per-service production value (contract price ÷ expected visits, no production on
  callbacks), which is independent of collection and of any balance due; comp plans decide payout.
  Nothing is inferred from it since Pass 23: the *separate* SURCHARGE credit keys off the surcharge
  line recorded on the ticket (§12), never off who may collect. A withheld credit is the visible
  failure; a wrong one is silent and gets paid.
* The amount is resolved through one shared resolver (`resolveInitialChargeCents()` in
  `shared/initial-charge.ts`) wherever it is shown, credited, or invoiced. A percent of a price that is
  not set resolves to nothing — never to $0.

### Canonical rule — DRAFT before finalization (PLAN_BILLING_V1.1 D3, Q3)

* An invoice may be **created** as `DRAFT` against an Appointment whose Services are not yet
  finalized — office prep, or a preview for the customer. A DRAFT holds the visit's anchor (nothing
  else invoices that visit) but is not a receivable: no issue date, no due date, cannot be sent, paid,
  or counted as balance.
* A DRAFT is **issued** only once every active Service on the Appointment has a finalized ticket, or
  by a role-gated override (`ISSUE_INVOICE_PREFINALIZATION`, Manager+) that flags the unfinalized
  tickets for review. Issuing re-prices every line from the visit as it stands then and stamps
  `issuedAt`; the issue date on the document is `issuedAt`, never the drafting date.
* Generation on a fully finalized visit that already carries a DRAFT **adopts** it — same invoice,
  now issued — never a second invoice (D2).
* Cancelling an Appointment that carries a DRAFT **prompts**: void the draft, or keep it. Never
  auto-void, never silently orphan. Cancelling a visit whose invoice is already issued is a
  credit-memo question, not a void.

### Canonical rule — finalization is the invoicing moment (PLAN_BILLING_V1.1 D2)

The office finalization that **completes** a visit (every active Service on the Appointment now has a
finalized ticket) is when the visit's invoice is offered, drafted, or deliberately left alone — governed
by one org setting, `invoiceOnFinalize`:

* `PROMPT` (default) — the reviewer is asked: **Generate** (issue the visit's one invoice, adopting a
  DRAFT if one exists), **Generate & Send** (the same, then mark it sent), or **Later** (nothing; the
  visit stays on the ready-for-billing list for Generate or Batch Invoice).
* `AUTO_DRAFT` — the visit's DRAFT is created with the finalization, or the existing one kept. The
  office issues it from the Invoices screen.
* `OFF` — finalization changes nothing about invoicing.

Finalization is never blocked by invoicing. A refused draft (a priceless service, an Agreement with
neither plan nor price) is reported, not fatal: the ticket, Service and Appointment still complete.
A visit whose invoice is already issued is reported as such in every mode. This applies to visit
invoices only — agreement revenue on schedule-billed plans still comes solely from the nightly run.

### Canonical rule — the payments ledger (PLAN_BILLING_V1.1 D5, D4)

* A **Payment** is money received: an event, recorded once and never edited. Its lifecycle
  (`PENDING` → `CONFIRMED`, or `VOIDED`, or `REFUNDED`) is a stamped transition with who / when / why,
  never a change to the amount. A mistake is a voided payment and a new one.
* Cash, check and "other" post `PENDING`; a check confirms on clearance, cash only by a user with
  cash-handling authority. A pending payment may be applied and shows on the invoice; it **counts**
  only once confirmed.
* The unapplied balance lives at the **Location** (rule 1: location is the canonical customer record),
  never the customer. A payment may be **designated** toward an Agreement — intent, recorded at
  collection. **Application** to an Invoice is the fact, an explicit, role-gated, audit-logged act.
  **Release** (un-apply) is the same act reversed and requires a reason; the application row stays,
  flagged. Nothing in the ledger is deleted.
* A **Credit Memo** is the ledger's only correction mechanism. It is issued against a Location
  (optionally naming the Invoice it corrects), sits in the same unapplied pool as a payment, and is
  applied the same way. It never changes an Invoice's price (D6).
* An Invoice's `amountPaidCents`, `balanceDueCents` and `pendingAppliedCents` are **computed and
  stored from the ledger** — recomputed in full, under a row lock, inside the same transaction as
  every application, release, confirmation and void — and its status is derived from the first two.
  `pendingAppliedCents` is the applied money that does not count yet (unreleased applications of
  PENDING payments): it is shown wherever the invoice is shown, and never read by status. No status
  is ever hand-set; there is no "mark paid". A DRAFT or VOID invoice owes nothing and can hold
  nothing; voiding an invoice releases what was applied to it back to the location.
* The Agreement's initial charge is billed **with the first visit** by default (a `DOWN_PAYMENT` line
  on that visit's Invoice, above) and **up front on request** (the agreement card's explicit path, its
  own Invoice) — either way one `INITIAL_CHARGE` line and one billing event, fired once per Agreement,
  and refused, never issued at $0, when a percent charge has no price to resolve against. A deposit
  the office collects before the visit is an unapplied Payment designated to the Agreement, not an
  Invoice.

### Canonical rule — aging is derived, by invoice date (PLAN_ROADMAP_V2.md C2.4, B20)

Accounts-receivable aging is computed at read time from the ledger's stored rollups and is never
stored. An issued Invoice with a balance ages from its **invoice date** - `issuedAt`, the moment it
became a receivable - in whole UTC calendar days, into **Current (0-30) / 31-60 / 61-90 / Over 90
days since invoiced**. A DRAFT or VOID owes nothing and does not age; a paid Invoice drops out; a
partially paid one ages its balance. This is not days past due: `dueDate` decides "overdue" on the
Invoices screen and nowhere else, and a later Settings toggle may age Net-terms commercial accounts
by due date instead. Money on account (unapplied confirmed payments and issued credit memos, at the
Location, §14) and pending money are shown **beside** the aged balance and never netted against it.
The customer-wide figure is a rollup of its Locations' figures; the balance itself lives at the
Location (rule 1), and an Invoice with no Location is listed under its customer rather than hidden.
The buckets, the day arithmetic and the rollup are one shared module, `shared/aging.ts`, read by
the server's two reads and by the customer screen and the Reports page alike.

### Canonical rule — a statement is the ledger rolled up for a period (PLAN_ROADMAP_V2.md C2.5, B5; Pass 15)

A **statement** is a customer-facing document generated on request from the ledger as it stands
and stored like an invoice's PDF (`documents`, kind STATEMENT, one row per generation, never
re-rendered in place; a scheduled monthly statement is a later Settings toggle and delivery is
C6.3). Three variants: a **location statement** rolls up one Location's ledger over two inclusive
UTC days - the opening balance (invoices issued before the period less the confirmed applications
and credits made before it), the period's invoices, applications and money received in date
order, the closing balance, and the aging strip as of the period's end; an **account statement**
is the same for every Location of the customer, one section each and a rollup - the property
manager with many locations and one payer - keyed on the customer as the aging rollup is; a
**paid-in-full / zero-balance letter** speaks for one Location as of a day, lists its agreements
with their status (the home sale), and is **refused, never reworded**, while the Location owes
anything. The balance on a statement is what is owed on issued Invoices (D5): it moves when money
is applied to an Invoice and confirmed, never when money is merely received; money on account is
shown beside it and never netted; pending shows, confirmed counts. A DRAFT, a VOID, a released
application and a payment recorded in error do not appear. The arithmetic is one shared module,
`shared/statements.ts`; the document is `server/documents/statement-pdf.ts`.

### Canonical rule — the invoice PDF may carry the visit's service reports (PLAN_ROADMAP_V2.md C3.5, B11; Pass 22)

An invoice's PDF is rendered once, on its first open or when it is marked sent, and never
re-rendered. When the office's "Attach service report to visit invoices" setting is on at that
moment, a **visit-anchored** invoice (one with an `appointmentId`) ends with the service report
(§12) of every ticket among its lines, in line order, drawn into the same document; an invoice
with no visit - schedule-driven agreement billing, a manual fee or adjustment, a standalone
initial charge - has nothing to attach and appends nothing ("omit on null"). A DRAFT's preview
follows the same rule and is not stored. The setting's value at first render is what the stored
PDF keeps; the ticket's own report stays separately openable and follows the ticket.

### Required fields

* id
* accountId
* locationId nullable in the column, set by every writing path — a manual invoice is refused
  without one (rule 1: the location is the customer record; PLAN_BILLING_V1.1 Pass 10). Null only
  on the two manual rows that predate that. Since Pass 13 (PLAN_ROADMAP_V2.md B6 / C2.3) the manual
  invoice is reachable only as **"Add fee / adjustment" on the location's ledger**, where the
  location is given, for a charge with no visit behind it (a returned-check or late fee, a
  re-inspection fee, a product sale, a cancellation fee); work performed is always the visit's
  invoice - drafted for the visit before finalization (D3) or generated at it (D2) - so a
  location-less row cannot recur.
* appointmentId nullable — the billing anchor for visit work
* serviceRecordId nullable — the fallback anchor for appointment-less work
* billingProfileSnapshot nullable — the resolved billing profile frozen at issue (jsonb, Pass 11c); the invoice
  carries no profile id column (a `billingProfileId` was listed here until Pass 39)
* invoiceNumber
* status (`draft` | `posted` | `sent` | `partially_paid` | `paid` | `void`)
* subtotal
* taxAmount nullable
* totalAmount
* balanceDue
* issuedAt nullable — when it became a receivable; null only while DRAFT
* dueDate nullable
* sentAt nullable
* paidAt nullable
* createdAt
* updatedAt

---

## 14. Payment

### Definition

Money collection or recorded payment event.

### Required fields

* id
* customerId
* locationId — the balance lives here (D4), so it is required
* method (`CASH` | `CHECK` | `OTHER` now; `CARD` | `ACH` named for PLAN_ROADMAP_V2.md C6.2 - charging
  through the provider; the card on file itself exists since Pass 40, C6.1, as the Card on file entity
  under §4, and a card Payment will name it and the provider's payment id in C6.2 - no such column yet)
* amountCents
* status (`PENDING` | `CONFIRMED` | `VOIDED` | `REFUNDED`; `AUTHORIZED` | `CAPTURED` | `FAILED` are
  the C6.2 card states - note for that pass: `paymentHoldsValue` / `paymentCountsAsPaid` know PENDING
  and CONFIRMED only today)
* receivedAt — when the money changed hands, entered; createdAt is when it was recorded
* createdAt

### Optional fields

* designatedAgreementId nullable — intent, not application
* appointmentId nullable — the visit the money was collected at (PLAN_BILLING_V1.1 D5, owner review
  of Pass 7.5). Intent of the same kind as the agreement designation: set once by the field's collect
  dialog, never by the office, never changed; the appointment must sit at the payment's location.
  The D4 prompt offers visit-collected money first, then agreement-designated, then undesignated.
  Application stays the office's explicit act.
* checkNumber nullable
* referenceNumber nullable
* memo nullable
* collectedByUserId / collectedByLabel nullable — the session actor at recording, the recorded
  collection event
* confirmedBy* / confirmedAt, voidedBy* / voidedAt / voidReason, refundedBy* / refundedAt /
  refundReason — lifecycle stamps
* proofAttachmentId — not built (check photo / cash signature from the historical plan)

An Invoice's money comes to it only through **payment_applications** and **credit_applications**
(paymentId or creditMemoId, invoiceId, amountCents, appliedBy / appliedAt, released + releasedBy /
releasedAt / releaseReason). A **Credit Memo** carries customerId, locationId, invoiceId nullable,
reasonCode (`BILLING_ERROR` | `SERVICE_ISSUE` | `GOODWILL` | `CANCELLATION` | `OTHER`), reason,
amountCents, status (`ISSUED` | `VOIDED`) and the same issue / void stamps.

---

## 15. Asset / Device

### Definition

Optional but important site-level device tracking.

### Scope

Location-scoped.

### Device types

* rodent bait station (RBS)
* termite bait station
* insect monitor
* snap trap
* live trap

### Fields

* id
* locationId
* type
* code nullable
* installDate nullable
* status
* inspectionInterval nullable
* placementNotes nullable
* createdAt
* updatedAt

### Future-proofing

Room should be left for:

* location-relative placement data
* visual diagram overlays
* satellite-image-based placement views

---

## 16. User

### Definition

A person at the company, office or field: **one identity table for everyone** (owner decision 2,
2026-09-19; built as PLAN_ROADMAP_V2.md C5.7, Pass 38). A technician is a User whose technician status
is set; there is no separate technicians table.

### Fields as built (`users` in `shared/schema.ts`; this list was corrected in Pass 38 to what exists)

* id, orgId
* firstName, lastName - the display name is **derived**, "First Last" (`shared/users.ts`
  `userDisplayName`), never stored; it is what every technician picker, board row, crew list and
  ticket snapshot prints
* email - unique whatever the case (the auth bootstrap's `lower(email)` index); trimmed and lowercased
  on every write
* passwordHash - never leaves the storage: not in `GET /api/users`, `/api/auth/me` or an audit snapshot
* role - the KEY of one of the org's role profiles (see "Role profile" below); the four built-in keys are
  `admin` | `manager` | `support` | `technician`, and the office's own profiles add theirs
* status (`active` | `inactive`) - the **LOGIN flag**: only an `active` user may sign in
  (`server/auth.ts`). A user created from Settings → Users, or minted by the Pass 38 migration, starts
  `inactive` with an unusable password hash - no password flow exists yet (C5.9), and a field-only
  technician never needs one
* phone nullable
* **The technician block** (Pass 38): `technicianStatus` (`ACTIVE` | `INACTIVE` | `TERMINATED`,
  `shared/technicians.ts`; **NULL means "not a technician"** - the column is the marker, there is no
  boolean) - the **FIELD-availability flag**: the dispatch board, the pickers and the Tech View offer a
  technician while ACTIVE, the board keeps an INACTIVE / TERMINATED one only while they hold visits;
  `licenseId` nullable - copied onto every ticket they post with the name (§12); `color` nullable - the
  board's row dot (`DEFAULT_TECHNICIAN_COLOR` when none); `technicianNotes` nullable
* createdAt, updatedAt

The two statuses are deliberately separate and never folded: a technician who never signs in is
`inactive` as a login and ACTIVE in the field; an office login that also runs routes is `active` and
ACTIVE; a retired technician is TERMINATED (and their login turned off if they had one). Not on the row,
although earlier drafts of this section listed them: `hireDate`, `homeAddress`, `licenseNumber` (the
column is `licenseId`, the ticket's copy `technicianLicenseNumber`), `trainingStatus`, `serviceArea`,
`forcePasswordReset` and `skills` (Smart Schedule's inputs, Phase 9, when they are built).

### Canonical rules - technicians are users (Pass 38, C5.7)

* Every column that names a technician - `services.assignedTechnicianId`,
  `appointments.assignedTechnicianId`, `serviceRecords.technicianId`,
  `technicianPreferences.technicianId`, `appointmentTechnicians.technicianId` - is a **users FK**;
  `productionValueEntries.technicianId` is the same id without a constraint (a snapshot, by design).
  The migration minted each old technician's users row **under the technician's own id**, so no
  historical row moved and an id in an audit snapshot from before Pass 38 names the same person.
* `GET /api/technicians` is a **facade**: the org's users with a technician status, projected to the
  shape the old table had (`shared/technicians.ts` `TechnicianSummary`; `Technician` in
  `shared/schema.ts` is that type) - ACTIVE only, every status with `?includeInactive=true`. There is
  no technician write: a technician is created and edited as a user (`POST` / `PATCH /api/users`,
  Manage Settings), on the one Settings card for a person (Users and technicians).
* A user with **field history** - any visit, service, ticket, crew row, customer preference or
  production entry naming them - cannot be made "not a technician" (409 `TECHNICIAN_HAS_HISTORY`);
  they are retired by TERMINATED, so the history keeps its person.
* A writer that names a technician (a customer's preference, a crew member, a ticket's technician)
  accepts only a user **with** a technician status (404 `TECHNICIAN_NOT_FOUND` for an office login); a
  label lookup for a row that already names someone answers for any user.
* On the Tech View the technician **is the session user** when their login has a technician status:
  the day opens on them, the ticket's default technician and the production credit are theirs, and the
  picker is offered only to a role holding `VIEW_OTHER_TECHNICIAN_WORK` (the built-in support, manager
  and admin), which `GET /api/technicians/:id/work` requires for any day but one's own (403).
* The acting user cannot turn their own login off (409 `USER_SELF_DEACTIVATE`); the Pass 37 rules on
  the role stand through the wider write.
* Every create and update is recorded in the audit log (§17, `user` `created` / `update`, the row
  without its hash); neither is revertable.

### Role profile (Pass 37, C5.6)

A **role profile** is the org's own definition of a role: a named set of permissions
(`role_profiles` + one `role_profile_permissions` row per permission, `shared/role-profiles.ts`),
kept in Settings → Roles. Every user holds exactly one, by its key in `users.role`; `can(role,
permission)` (`shared/permissions.ts`) answers from the org's profiles (a process-level registry the
server fills at boot and after every profile write, and the client fills from `/api/auth/me`), falling
back to the built-in defaults only while the registry is empty. Rules:

* The four built-in profiles (`admin`, `manager`, `support`, `technician`) are seeded per org from the
  built-in defaults (`ROLE_PERMISSIONS`), marked `isBuiltIn`, and may be renamed, edited, cloned and
  made inactive (once no user holds them) - never deleted; no profile is ever deleted.
* A profile with users on it cannot be made inactive; a user is assigned only an active profile.
* The acting user cannot remove Manage Settings from the profile their own role names, make that
  profile inactive, or move themselves to a profile without it; and no write may leave the org with
  no active profile holding Manage Settings.
* Every profile write and every assignment is recorded in the audit log (§17); none is revertable.
* Where this document says "manager+" / "support+" / "admin", read: the built-in profile named holds
  the permission by default, and the office may give it to any profile.
* The registry is per process, not per org (exact with one organization); keying it by org is Phase 9.

---

## 17. AuditLog

### Definition

Audit trail for field changes and meaningful actions. Promoted by PLAN_BILLING_V1.1 D7 from a
single legacy write path to the system-wide immutable history.

### Canonical rule

Admin audit logging should record **any/all field changes**.

The table is **append-only**. Rows are never updated or deleted — not by a route, not by a storage
method. A correction is a new forward row describing the correction, never a rollback of the log.
"Revert to previous state" is itself a recorded change.

Writes go through the single private `recordAuditLogTx()` helper in `server/storage.ts`, called from
inside the same transaction as the mutation being recorded so the row commits or rolls back with it
(there is no public, out-of-transaction form - the one that existed had no caller and left in Pass
32). The actor comes from the session; no route accepts a client-supplied actor. A system-driven
write - an agreement's own schedule executing (the service it generates, the recurrence advancing
`nextServiceDate`, the billing run's `nextBillingDate`) - passes `SYSTEM_AUDIT_ACTOR` explicitly
(`userId` null, `actorLabel` "System"); the History tab prints "System" for any null label. Every
other row, derived writes included, is signed by the user whose request caused it.

`entity_type` and `action` are plain text columns constrained at compile time by the
`AuditEntityType` / `AuditAction` unions in `shared/audit.ts`, so the vocabulary can't drift the
way `appointments.status` did before D1a. Since Pass 32 (C5.1a, D7's follow-up) every entity below
carries a trail: customer, location, contact, billing profile (instance and org template), agreement,
agreement template, appointment and service write `created` / `update` / `status_changed` /
`deleted` rows beside the financial actions - a change only when the diff would show something, so
an unchanged save leaves no row. Since Pass 35 (C5.3) the settings-managed agreement types list writes its
own rows too (`agreement_type`: `created` / `update`, and `agreement_type_merged` when one type is merged into
another - with one `update` per agreement and template that moved); it is the first reference list with a
trail and is not revertable. Since Pass 37 (C5.6) the role profiles (`role_profile`: `created` - a clone's row
naming its source under `clonedFrom` - and `update`, the permission list in both snapshots so the diff names what
moved) and the users' profile assignments (`user`: `update` with `role` before and after, never the password
hash) write theirs; neither is revertable. Since Pass 39 (C5.8) every `app_settings` write - the nine Settings
setters behind `PATCH /api/settings/*` - records `app_setting`: `update` on the setting's KEY with the stored value
before and after (null for a row that did not exist or was deleted), nothing on an unchanged save, never
revertable (a setting is put back by setting it); the Settings page lists the recent rows org-wide. Since Pass 40
(C6.1) the card on file (`payment_method`: `created`, `update` when the default moves, `status_changed` when one is
removed - the snapshots are the display fields, brand / last four / expiry / default / status / test flag, never a
provider id; the rows sit with the account on the customer-level History and with the location a card was noted
against) and the org's payment provider account (`payment_provider_account`: `created` / `update` /
`status_changed` - provider, mode, publishable key, connected account, status and a short fingerprint per secret,
never a key; org-wide, listed on the Settings Payments card) write theirs; neither is revertable. There is no
`account` entity: the account's facts are logged on the
location whose primary flag moved or on the customer. `service_records`' content edits are D9's
`ticket_edited`; a price change is Pass 8's `price_overridden`.

Since Pass 33 (C5.1b) the customer screen reads the log two ways - the location's slice (the History
tab) and the customer's rollup (every location of the account plus the account-level rows: the
customer's own, the account's billing profiles with no location) - and offers **Revert** on a row to a
a profile holding `REVERT_HISTORY` (the built-in manager and admin; any profile the office gives it to since
Pass 37's role profiles, C5.6). A revert is the
`reverted` action: the fields the source row changed are put back through the entity's own write path
(a customer, location, contact, billing profile, template or agreement update), which records one
`reverted` row with the same whole-row snapshots, the after naming the source row; the log itself is
never touched. A `created` or `deleted` row, a financial row (a void and a re-entry, never a revert), a
service / appointment / opportunity row, a special action's row, an agreement's cancellation and a
location made non-primary are refused - their inverses are their own workflows - and a row whose fields
have moved since is refused as stale until the newer change is reverted first.

### Fields

* id
* orgId
* userId nullable
* actorLabel nullable
* entityType
* entityId
* action
* beforeJson nullable
* afterJson nullable
* createdAt

---

## Scope Rules

## 1. Account-scoped

These belong to the Account / grouping context:

* primaryLocationId
* account-level notes
* aggregated balances / grouped rollups
* default billing behavior
* account-level flags
* account-level holds
* LTV / reporting rollups

## 2. Location-scoped

These belong to Location:

* contacts
* appointments
* service agreements
* service visits
* location notes
* communication logs
* assets/devices
* service-specific conditions
* location flags
* location holds
* portal-visible service information

## 3. Default inheritance

By default, related locations inherit from the primary location/account context where applicable.

Examples:

* default billing profile (the account's active default row; a location's own active row overrides
  it - §4, Pass 34)
* grouped relationship context

Override should be allowed where appropriate.

---

## Workflow Rules

## 1. New customer creation

The workflow should feel like **adding a new location**.

The user should gather only location/customer-facing details such as:

* First Name / Last Name or Company Name
* Address
* Phone
* Email
* Source

Behind the scenes the system should:

1. create a new Account
2. create a new Location
3. mark that Location as primary
4. attach any initial contact / billing defaults as needed

The user should not be forced to explicitly create an Account object.

## 2. Adding a related location

To add a location to an existing grouped customer:

1. load the grouped customer context by searching for a known item

   * primary location address
   * phone
   * email
   * name
   * other searchable identifiers
2. open the existing customer/group
3. click **Add Location**
4. create the new location under the existing Account

A user should be able to reach the grouped customer context from any related sub-location as well.

## 3. Primary location rules

* every Account must have at least one Location
* exactly one Location per Account is primary
* the primary Location acts as the customer identity in the UI
* if the primary Location changes, account-level notes remain with the Account

## 4. Location transfer support

The domain must support carefully transferring a Location from one Account to another.

This capability is required for data correction and relationship changes.

Transfer rules should preserve integrity around:

* location ownership
* billing relationships
* notes
* invoices
* historical service records
* contact relationships
* primary-location designation logic
* audit trail

---

## UI / UX Rules

## 1. Customer detail experience

The UI should present the selected customer as a Location-centered experience.

### Header should stay brief

Suggested items:

* customer identity from primary or selected location
* status badge
* location type pill
* address widget
* primary contact widget
* location selector
* visible location count
* customer since
* LTV (admin/manager only)

## 2. Location selector

* default selected location = primary location unless deep-linked otherwise
* dropdown preferred
* should show enough identifying detail to distinguish locations
* may show status badges such as billing override, hold, due service, etc.

## 3. Tabs should be location-scoped

Tabs should scope to the currently selected location.

Examples:

* Location
* Contacts
* Upcoming Appointments
* Service History
* Invoices
* Comms
* History (the location's slice of the AuditLog — see §17)

## 4. Notes UX

* account-level notes remain available regardless of primary-location changes
* location notes remain local to the site
* site instructions and access details belong in location notes

## 5. Advanced property details

The following should be collapsed/hidden by default unless needed:

* latitude / longitude
* sqft
* linearFt
* weather details in service visits

---

## Scheduling Rules

## 1. Scheduling should originate from location context when possible

Known values should already be populated:

* location
* address
* service options
* contacts
* service notes

## 2. Schedule views

Design should support:

* multi-tech scheduling
* tech/support assignments
* 1D / 3D / 1W / custom views
* route metrics later
* clickable appointment cards

Since Pass 31 (PLAN_ROADMAP_V2.md C4.5) the board's geometry is Settings -> Dispatch Board
(`shared/dispatch-board.ts`; one `app_settings` row per value, no seed row - the defaults are the board
as it was):

* **View interval** - the width of a board column, and so one placement slot: 30 minutes, 1 hour or 2
  hours (default 2 hours).
* **Snap interval** - what a time typed on the appointment sheet rounds to when saved (nearest, a half
  up), and what every placement start passes through: 15, 30 or 60 minutes (default 60). Never coarser
  than the view interval, so a placement lands on the slot that was clicked. A client rule: the server
  stores it and never rounds a time an API caller asked for. There is no drag-and-drop; placement is a
  slot click, a move is click-then-confirm.
* **Default visible hours** - the window the board opens with, whole hours from 6 AM to 9 PM (default
  8 AM - 6 PM). The board's Window popover overrides the hours and the view interval for the session
  only; the snap has no override.

A visit is in view when its own day is on the board and its start falls inside that day's window; a
slot is a start in minutes of day; a move is a change of the start, to the minute.

## 3. Technician preferences (PLAN_ROADMAP_V2.md C4.4; B14; PLAN_BILLING_V1_1.md D8; Pass 30)

A customer's standing word about who services them, in `technician_preferences`
(`shared/technician-preferences.ts`):

* **PREFERRED** - a hint: "Prefers <tech>" on the dispatch queue and the sheet; a weight for Smart
  Schedule later. It never blocks anything.
* **EXCLUDED** - B14's EXCLUDE_TECH: the customer asked that this technician never be sent. A **hard
  block** on placement: creating a visit with the technician, re-assigning a visit to them, or adding
  them to its crew is refused (409 `TECHNICIAN_EXCLUDED`) unless a manager overrides with a reason
  (`OVERRIDE_TECHNICIAN_EXCLUSION`, manager and admin), recorded as `placement_exclusion_overridden`
  (§17). An unchanged technician is never re-checked.
* **Passing over a PREFERRED technician** (owner, Pass 30b) - placing or re-assigning a visit to anyone
  but the customer's preferred technician asks for the user's confirmation (409
  `PREFERENCE_NOT_HONORED`, any role), recorded as `placement_preference_bypassed`. A manager's exclusion
  override covers it. Support technicians are not asked: a preference names who services the visit.
* **Scope.** A row is LOCATION-scoped (that location) or ACCOUNT-scoped (every location of the account -
  D8's "customer level"), the Flag / Hold shape (§6, §7). The ACCOUNT row is written from the primary
  location's editor ("Apply to all locations") and nowhere else. For one technician the **location's
  row wins** over the account's: a location may lift an account-wide exclusion with its own PREFERRED,
  or exclude a technician the account prefers. One row per technician per scope.
* Setting and clearing a preference is open to every role (customer data, like the location profile)
  and recorded (`technician_preference_set` / `technician_preference_cleared`, on the location or on the
  account's customer).

## 4. The crew (PLAN_ROADMAP_V2.md C4.4; Pass 30)

`appointment_technicians` (`shared/appointment-crew.ts`) records who ran a visit as it is planned:
exactly one **LEAD** - always the visit's `assignedTechnicianId`, moved with it - and any number of
**SUPPORT** technicians, added and removed from the dispatch sheet (`appointment_crew_changed`, §17). A
support technician sees the stop on their own day, read-only; the ticket, its technician snapshot and
therefore the production ledger stay the lead's - one entry, one technician - until Phase 7's split
allocation reads the crew.

Since Pass 30b (owner) the support technician's time is **booked on the dispatch board**: the visit
shows on their row too, as a second card on the same visit (never a second appointment - one visit, one
invoice). Adding a support technician who already has an overlapping visit, as lead or support, asks for
confirmation (409 `CREW_SCHEDULE_CONFLICT`, listing the visits); a visit's planned window is its stored
end, else its representative service's duration, else 60 minutes, and back-to-back visits do not clash.

---

## Service History / Posting Rules

Service History should act as a posting/staging/review screen.

Suggested states:

* Open
* Pending Review
* Confirmed
* Sent Back
* Voided

Role-gated actions may include:

* edit
* confirm / unconfirm
* send back
* delete / void
* confirm payment
* send invoice
* batch invoice — an action of the **Invoices screen** since Pass 13 (PLAN_ROADMAP_V2.md C2.3),
  not of the review queue: it is invoicing, and it filters on the posting date ("posted between"),
  grouped by technician then service date. The queue keeps finalize / reopen / edit.

Service cards should be compact with expand-on-click behavior.

---

## Commercial vs Residential Rules

## Residential

Prefer streamlined data capture.
Do not force commercial-only fields.

## Commercial

Commercial-specific needs may include:

* company name
* on-site contact
* billing/AP contact
* tax-exempt or terms logic later

Canonical rule:

* service site instructions belong in location notes
* on-site and billing/AP contacts are modeled as Contacts

---

## Future-Proofing Rules

## 1. Internal IDs

Use stable internal IDs. Display codes may be user-friendly, but should not replace clean relational IDs.

## 2. Clean separation of concerns

Do not collapse:

* appointment and service visit
* billing profile, invoice, and payment
* flag and hold
* account notes and location notes

## 3. Audit everything important

Admin audit logging should record any/all field changes.

## 4. Leave room for future expansion

Potential future modules:

* persistent pest issue tracking
* portal editing of site instructions
* smart tasks / AI communications
* asset placement diagrams
* advanced routing
* advanced reporting

---

## Canonical Summary Statement

In PestFlow, every customer is a location. An Account exists mainly as a grouping context for one or more related locations, with one primary location acting as the main customer identity in the UI. Operational work happens at the location level, while grouped/customer-level data remains attached to the Account so it survives primary-location changes.

---

## Instructions for Codex / future implementation

When auditing or implementing PestFlow:

1. treat this document as canonical truth
2. identify where the current repo aligns or conflicts with these rules
3. prefer refactors that move the system toward this model
4. avoid introducing parallel abstractions that duplicate Location as a customer record
5. keep the UI lightweight and workflow-first
