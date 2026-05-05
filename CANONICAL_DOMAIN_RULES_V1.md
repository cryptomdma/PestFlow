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

* defaultBillingProfileId
* lifetimeValue (LTV)
* aggregate balance data

### Notes

* Account is mostly an internal/domain object
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

---

## 4. BillingProfile

### Definition

Billing information used by a location or inherited from the account/primary-location context.

### Required fields

* id
* accountId
* label
* billingType (`card` | `ach` | `invoice_terms` | `cash` | `check`)
* isDefault
* status
* createdAt
* updatedAt

### Optional fields

* billingName
* billingAddress fields
* cardOnFileToken
* achToken
* invoiceTerms

### Canonical behavior

* the primary location / account context provides the default billing behavior
* child/related locations inherit that billing behavior by default
* a location may override with a custom billing profile when needed

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

---

## 8. ServiceType

### Definition

Master list of service offerings.

### Required fields

* id
* name
* code nullable
* category nullable
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

Contact-required agreement Opportunities are distinct from non-contract follow-up Opportunities. They must link back to the generated Service and Agreement cycle where possible.

### Cancellation policies

Cancellation Policies are reusable Settings-level templates. Agreement Templates select the policy that applies to Location Agreements created from that template.

Examples:

* Annual Quarterly Service Cancellation Policy
* Mosquito Seasonal Cancellation Policy
* Termite Agreement Cancellation Policy
* No-Fee / Custom Cancellation Policy

When a Location Agreement is created from an Agreement Template, it should inherit the selected cancellation policy. Future implementation should snapshot policy terms or policy version onto the Location Agreement so signed historical terms remain stable.

Cancellation policy should define:

* cancellation terms
* cancellation fees if applicable
* notice requirements
* effective-date behavior
* impact on pending generated Services
* impact on scheduled Appointments
* impact on open Opportunities
* whether to create retention/recovery Opportunity
* whether charges are due immediately
* whether card-on-file collection or manual collection is required
* whether manager/admin override is allowed

Agreement cancellation is not a simple status flip. It is a policy-driven workflow with confirmation and impact preview.

Manager/admin override belongs inside the cancellation modal and should be role-gated. Override may allow:

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

1. Agreement cancellation policies and cancellation workflow
2. Terms & Conditions / contract snapshot/versioning
3. Agreement amendment/upgrade/downgrade lifecycle
4. Bundles / unified billing layer
5. Billing enforcement, proration, and payment collection logic

Immediate next implementation priority: Agreement Cancellation Policies.

### Required fields

* id
* accountId
* locationId
* serviceTypeId
* agreementType (`recurring` | `one_time` | `warranty` | `installment` | `seasonal`)
* status (`active` | `paused` | `canceled` | `expired`)
* frequencyRule nullable
* defaultPrice nullable
* billingProfileId nullable
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
* schedulingMode nullable
* createdAt
* updatedAt

### Notes

* Manual and one-time Services may be created outside Agreements
* Agreement-generated Services do not imply an Appointment exists
* One Appointment may contain multiple Services

---

## 11. Appointment

### Definition

A scheduled dispatch placement for one or more Services.

### Required fields

* id
* accountId
* locationId
* serviceAgreementId nullable
* serviceTypeId
* scheduledStart
* scheduledEnd nullable
* timeWindowStart nullable
* timeWindowEnd nullable
* assignedTechId nullable
* supportTechId nullable
* routeDate nullable
* routeSequence nullable
* estimatedDurationMinutes nullable
* status (`scheduled` | `confirmed` | `in_progress` | `completed` | `canceled` | `rescheduled` | `issue`)
* notes nullable
* createdAt
* updatedAt

### Customer-reported issue fields

* reportedPestType nullable
* reportedProblemNotes nullable

### Canonical rule

Appointments should ideally be created from a selected location context so core values are already known.

Appointments are scheduling placements. They are not the canonical work history object and should not be created by recurring agreement generation until work is actually placed on the board.

---

## 12. ServiceVisit

### Definition

The actual record of performed service.

### Purpose

* permanent operational history
* office review / staging / posting
* technician completion record

### Required fields

* id
* appointmentId nullable
* accountId
* locationId
* serviceAgreementId nullable
* serviceTypeId nullable
* technicianId
* arrivalTime nullable
* departureTime nullable
* completedAt nullable
* serviceStatus (`open` | `pending_review` | `confirmed` | `sent_back` | `void`)
* summary nullable
* detailedNotes nullable
* followUpRequired boolean nullable
* followUpReason nullable
* customerPresent boolean nullable
* customerSignatureId nullable
* paymentStatus nullable
* invoiceStatus nullable
* pestType nullable
* pestSubtype nullable
* areaText nullable
* areaFavorite nullable
* createdAt
* updatedAt

### Materials support

Materials should be modeled as child records, not stuffed into one field.

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

## 13. Invoice

### Definition

Billing output generated from service or manual billing actions.

### Required fields

* id
* accountId
* locationId nullable
* billingProfileId nullable
* invoiceNumber
* status (`draft` | `posted` | `sent` | `partially_paid` | `paid` | `void`)
* subtotal
* taxAmount nullable
* totalAmount
* balanceDue
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
* accountId
* locationId nullable
* serviceVisitId nullable
* invoiceId nullable
* billingProfileId nullable
* paymentMethod (`card` | `cash` | `check` | `ach` | `other`)
* amount
* status (`pending` | `authorized` | `captured` | `failed` | `voided`)
* createdAt
* updatedAt

### Optional fields

* checkNumber nullable
* referenceNumber nullable
* proofAttachmentId nullable
* collectedByUserId nullable

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

Internal staff user.

### Required fields

* id
* firstName
* lastName
* email
* phone nullable
* role (`admin` | `manager` | `support` | `technician`)
* status
* hireDate nullable
* homeAddress nullable
* licenseNumber nullable
* trainingStatus nullable
* serviceArea nullable
* forcePasswordReset boolean
* createdAt
* updatedAt

### Optional skills

* skills nullable

Examples:

* GPC
* Termite
* Bed Bug
* Mosquito
* Exclusion
* Rodents
* Fire Ants

---

## 17. AuditLog

### Definition

Audit trail for field changes and meaningful actions.

### Canonical rule

Admin audit logging should record **any/all field changes**.

### Fields

* id
* userId nullable
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

* default billing profile
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
* batch invoice

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
