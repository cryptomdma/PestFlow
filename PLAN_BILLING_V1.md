# PestFlow — Billing & Foundations Plan v1

> Scope of this document: the architecture for Phase 0 (multi-tenancy, money, RBAC, integration ports)
> and Phase 1 (billing core / invoicing). It is written to be measured against
> `CANONICAL_DOMAIN_RULES_V1.md` and should be promoted into that canon once accepted.
>
> Status: proposed. Nothing here is built yet.

---

## 0. Strategic context

| Decision | Answer | Architectural consequence |
|---|---|---|
| Product trajectory | Internal-first (Heritage), SaaS-eventual | Multi-tenancy **now**, before the schema matures |
| Lead/sales layer | GoHighLevel stays; HubSpot etc. must be possible later | CRM is a **port**, not a hardcode |
| Inventory | PCO Inventory Master stays a separate product, API-linked | Inventory is a **port**; PestFlow must work when it is down |
| Accounting | PestFlow = basic metrics + AR; QuickBooks = books of record | PestFlow is an **AR subledger**, not a GL |
| Payments | Stripe first, but not land-locked | Payments are a **port**; Stripe Connect model for SaaS |
| Billing profiles | Fully user-configurable in Settings | **Two objects:** Billing Profile (payer) + Billing Plan (agreement). Both template → snapshot |
| Invoice granularity | One invoice per service ticket; statements on request | True for **service-driven** plans. Schedule-driven plans invoice on a calendar, independent of services |
| Batch invoicing | Many customers/locations over a period, run from Ticket Review | Batch = bulk generate + bulk send over finalized records |
| Sales tax | 8.25% DFW default; configurable rates for SaaS | Tax **engine**, rate snapshotted onto the invoice |
| Production value | Feeds both analytics **and** technician comp; configurable | Production value must be **immutable and auditable** |

### The one-line strategic rule

**PestFlow owns operations and accounts receivable. It integrates with everything else.**
GHL owns the funnel. QuickBooks owns the ledger. PCO Inventory owns stock. Stripe owns money movement.
No vendor type is ever allowed into the core domain model.

---

## PHASE 0 — FOUNDATIONS
*Build these before invoicing. They are cheap now and brutally expensive later.*

### 0.1 Multi-tenancy

Every table gets `orgId NOT NULL`, referencing a new `organizations` table. Heritage is org #1.

**Why now:** retrofitting tenancy into a mature schema means touching every table, every query, and
every route, and discovering the leaks in production. Right now the data volume is near-zero and the
blast radius is a single migration.

Rules:
- `orgId` on **every** domain table, including all Settings/reference data (service types, target pests,
  material products, cancellation policies, billing profile templates, tax rates).
- Every composite index leads with `orgId`.
- A repository/data-access layer that **requires** an org context. No raw table access from routes.
- Org is resolved from the session in middleware and carried in a request-scoped context.
- Recommended defense-in-depth: Postgres Row-Level Security keyed on a session GUC. Even if a query
  forgets its `WHERE orgId`, the database refuses to leak.
- Migration path: add `orgId` nullable → backfill to org #1 → set `NOT NULL` → add FKs/indexes.

### 0.2 Money representation

- **All monetary values are integer cents.** Column suffix `...Cents`. Never float, never JS `number`
  arithmetic on dollars.
- A single `currency` field (ISO-4217) per org for now; carried on invoices for future-proofing.
- Rounding is done once, at the line level, using a documented rule (half-up). Invoice totals are the
  **sum of stored line values**, never a re-derived float.
- Existing money columns (`subtotal`, `taxAmount`, `totalAmount`, `balanceDue`, `Payment.amount`,
  `ServiceAgreement.defaultPrice`) must be migrated to cents as part of this phase.

### 0.3 Roles & permissions (RBAC)

Existing roles (`admin | manager | support | technician`) become a real permission matrix. Support = the
CSR/office role (Heritage: the owner's wife). Technician = field only.

| Capability | Tech | Support | Manager | Admin |
|---|:--:|:--:|:--:|:--:|
| Post service ticket | ✅ | ✅ | ✅ | ✅ |
| Finalize ticket | ❌ | ✅ | ✅ | ✅ |
| Reopen ticket (with reason) | ❌ | ✅ | ✅ | ✅ |
| Adjust price — non-agreement service | ✅* | ✅ | ✅ | ✅ |
| Adjust price — agreement service | ❌ | ❌ | ✅ | ✅ |
| Add cleanout/surcharge line in field | ✅* | ✅ | ✅ | ✅ |
| Generate invoice / batch invoice | ❌ | ✅ | ✅ | ✅ |
| Send invoice | ❌ | ✅ | ✅ | ✅ |
| Void invoice | ❌ | ❌ | ✅ | ✅ |
| Issue credit memo | ❌ | ❌ | ✅ | ✅ |
| Take payment in field | ✅ | ✅ | ✅ | ✅ |
| Refund payment | ❌ | ❌ | ✅ | ✅ |
| Waive cancellation fee | ❌ | ❌ | ✅ | ✅ |
| View cost / margin / LTV | ❌ | ❌ | ✅ | ✅ |
| View production value / comp | own only | ❌ | ✅ | ✅ |
| Manage Settings | ❌ | ❌ | partial | ✅ |

\* = settings-gated per org.

Implement as `permission` string constants checked in a single `can(user, permission, resource)` helper.
Roles map to permission sets; SaaS orgs get custom role definitions later without a refactor.

### 0.4 Integration ports

Directory shape:

```
server/integrations/
  payments/     types.ts  providers/stripe.ts
  accounting/   types.ts  providers/quickbooks.ts
  crm/          types.ts  providers/gohighlevel.ts
  inventory/    types.ts  providers/pcoInventory.ts
  outbox/       (shared transactional outbox)
```

**Rule: the domain layer imports only `types.ts`. No vendor SDK is ever imported outside `providers/`.**

| Port | Interface (sketch) | Notes |
|---|---|---|
| `PaymentProvider` | `createCustomer`, `attachPaymentMethod`, `charge`, `refund`, `handleWebhook` | Stripe first. Model **org-level credentials** from day one (SaaS → Stripe Connect, each tenant its own connected account). Do not build a single global API key you'll have to unwind. |
| `AccountingSync` | `pushCustomer`, `pushInvoice`, `pushPayment`, `pushCreditMemo` | One-way push to QBO. PestFlow does **not** model a chart of accounts, journal entries, or AP. |
| `CrmProvider` | `upsertContact`, `pushLifecycleStatus`, `ingestLead` | Normalized lead/contact shape. **Once a lead becomes a Location, PestFlow is system of record** and pushes status back. No GHL-shaped fields in core tables. |
| `InventoryProvider` | `listProducts`, `emitConsumption` | Material Products cache locally with `externalProductId`. **A tech must be able to post a ticket when inventory is unreachable.** Consumption is emitted async on finalization. |

**Transactional outbox.** All four ports write side effects to an `outbox_events` table inside the same
DB transaction as the domain change, and a worker drains it with retries. One pattern, four uses. This
is what makes "invoice syncs to QuickBooks" and "ticket decrements inventory" reliable instead of
best-effort.

---

## PHASE 1 — BILLING CORE

### 1.1 The three money concepts

This is the heart of the plan and the fix for the "appointment inherits agreement price" bug.

| Concept | Lives on | Means | Example (Wildlife: 5 services, $499) |
|---|---|---|---|
| **Contract price** | Agreement | Total the customer owes for the whole agreement | `$499` once |
| **Billable amount** | Invoice line (derived via Billing Profile) | What actually hits AR on a given event | `$499` on service 1, `$0` on services 2–5 |
| **Production value** | Service / Service Record | Allocation of contract price to the work that earns it | `$99.80` on each of the 5 scheduled services; `$0` on any callback |

Billable is decided by the **Billing Plan**, not by the service and never by the appointment.

**Appointments carry no price at all.** Delete the inheritance path.

#### Production value: one rule

An agreement sells **coverage**, not visits. The customer buys a term of warranted, on-demand
protection. Two visits or ten, the price is the same. Services are the **cost of delivering** coverage,
not the trigger for billing.

Therefore **agreement Services never emit billing events.** The Billing Plan's schedule is the *only*
source of agreement revenue. Service-driven billing exists solely for non-agreement / COD work.

Production value allocates the contract price across the work that earns it:

> **Production value = contract price ÷ expected scheduled service count.**
> **Callbacks, retreats, and warranty visits carry $0 production value.**
> **A one-time service's production value = the full price of that service.**

| Agreement | Contract price | Scheduled services | Production value each |
|---|---|---|---|
| Wildlife trapping | $499 | 5 | $99.80 |
| Annual quarterly pest | $600 | 4 | $150.00 |
| Warranty callback | — | — | **$0.00** |
| One-time termite treatment | $850 | 1 | $850.00 |

Because callbacks contribute nothing, **`Σ production value across scheduled services = contract price`,
always.** There is no separate reconciliation rule for different agreement kinds. Ten callbacks on a
$600 agreement still allocate exactly $600 of production value across its four scheduled services.

`expectedServiceCount` is derived from term × frequency and **snapshotted onto the Location Agreement at
creation**, so that a later frequency change cannot retroactively alter the production value of services
already performed (which would corrupt technician compensation).

#### What production value is NOT

Production value is **revenue allocation**, not cost. `contract price − Σ production value` is
structurally zero and is not a margin metric.

**True margin requires cost-to-serve** — labor, chemical, drive time — which is deferred to a later
accounting phase. Until then:

- **Callback rate** (callbacks per agreement / per technician) is the available quality-and-cost signal.
  A technician generating many callbacks produces zero production value on those trips, so poor initial
  service is naturally visible as depressed productivity.
- **Cost-to-serve** is modeled later and, combined with production value, yields real per-agreement and
  per-technician margin.

#### Compensation consequence (decide deliberately)

Because production value is the comp basis, **a callback pays the technician nothing.** This is standard
in the industry and aligns incentives — sloppy initial service creates unpaid return trips. It is,
however, a real comp-design decision. It is org-configurable for SaaS; confirm it is the intended
Heritage policy.

### 1.2 Billing Profile vs. Billing Plan (the objects that are missing)

Today's `BillingProfile` is doing the work of **three** objects. Split it.

> **The distinction that matters:**
> **Billing Profile** = *who* pays, *how* they pay, *where* it's delivered. Attaches to the **payer** (Account, overridable per Location).
> **Billing Plan** = *when* they're billed, *how much*, and what's due *up front*. Attaches to the **thing being sold** (Agreement / Service Type).
>
> A location is not "a monthly customer." A *quarterly pest agreement* is billed monthly. The same
> customer can simultaneously hold a monthly mosquito plan, a prepaid-annual termite agreement, and a
> COD one-time job — one Billing Profile, three Billing Plans.

**`payment_methods`** — the tokenized instrument (this is what today's `billingType` half-was):

```
payment_methods
  id, orgId, accountId, locationId?
  provider                    -- 'stripe'
  providerCustomerId          -- token
  providerPaymentMethodId     -- token
  type                        -- card | ach
  brand, last4, expMonth, expYear   -- display only
  isDefault, status, createdAt, updatedAt
```

> **PCI:** PestFlow never sees, transmits, or stores a card number, CVV, or full ACH credentials.
> Card capture happens in Stripe Elements / SetupIntent on the client; PestFlow receives a token.
> This keeps you in SAQ-A scope. This is a hard rule, not a preference.

**`billing_profiles`** — *who* pays and *how*. Attached to the payer.

```
billing_profile_templates   -- Settings, org-scoped, user-creatable
billing_profiles            -- instance, snapshotted from template
  id, orgId, accountId, locationId?      -- locationId set = override
  templateId?, label
  billingContactId?    -- a Contact (role = billing / AP)
  billingEmail?        -- override
  billingAddress*      -- override; defaults to primary location
  deliveryMethod       -- EMAIL | PRINT | PORTAL | NONE
  paymentTermsDays     -- Net 0 / 15 / 30
  autoChargeOnFile     -- boolean
  defaultPaymentMethodId?
  taxExempt, taxExemptCertificateId?
  isDefault, status, createdAt, updatedAt
```

Inheritance follows the canon already in place: **account/primary-location provides the default;
a child location may override.**

**`billing_plans`** — *when*, *how much*, and *what's due up front*. Attached to what's being sold.
Settings holds the reusable templates; the **Agreement Template selects one from a dropdown**; the
Location Agreement **snapshots** it at creation (identical to the Cancellation Policy pattern already
in the canon).

```
billing_plan_templates      -- Settings, org-scoped, user-creatable
                            -- e.g. "Quarterly — Bill Per Service", "Monthly Recurring",
                            --      "Prepaid Annual", "Monthly w/ Cleanout", "COD"
billing_plans               -- snapshot onto a Location Agreement (or Service Type default)
  id, orgId
  agreementId?              -- snapshotted instance
  serviceTypeId?            -- default plan for non-agreement / one-time work
  templateId?, label

  chargeTrigger        -- ON_SERVICE_COMPLETION | ON_SCHEDULE | ON_AGREEMENT_START
                       -- NOTE: agreements are ON_SCHEDULE. ON_SERVICE_COMPLETION is for
                       -- non-agreement / COD work only.
  billingMode          -- PER_SERVICE | RECURRING_INTERVAL | PREPAID_TERM | INSTALLMENT
  intervalUnit?        -- DAY | WEEK | MONTH | QUARTER | YEAR
  intervalCount?
  installmentCount?

  -- Anchoring (org-configurable; Heritage default = SIGNUP_DATE)
  anchorMode           -- SIGNUP_DATE | CALENDAR_DAY | CUSTOM
  anchorDay?           -- only when anchorMode = CALENDAR_DAY (bill on the Nth)
  prorationRule        -- NONE | DAILY | FIRST_PERIOD_FULL   (default NONE, since anchoring
                       -- to signup makes proration unnecessary)

  -- Initial charges
  initialChargeType?   -- NONE | DOWN_PAYMENT | CLEANOUT_SURCHARGE | PREPAY_FULL
  initialChargeCents?  -- or percent of contract price
  initialChargeCoversFirstPeriod  -- boolean; if true, the recurring schedule starts one
                                  -- period after the initial charge (no double-bill)
  initialChargeCollectedBy   -- OFFICE_AT_SIGNING | TECH_AT_FIRST_SERVICE
  fieldAddableSurcharge      -- boolean; tech may add cleanout fee from mobile

  status, createdAt, updatedAt
```

**The Billing Plan is a charge-schedule emitter.** It does not itself create invoices — it emits
*billing events* (a charge is due, for this amount, on this date). The Billing Profile then decides how
the resulting invoice reaches the customer and how it gets paid. Keeping these separate is what makes a
$0-billable wildlife follow-up trivially correct: **no billing event → no invoice → full production
value retained.**

Non-agreement and one-time work still needs a plan: Service Types carry a **default Billing Plan**
(normally COD / `PER_SERVICE`), so ad-hoc work has a charge rule without an agreement.

**Anchoring (Heritage default: `SIGNUP_DATE`).** A customer signing on the 17th is billed on the 17th of
each period. This avoids proration entirely, which is why `prorationRule` defaults to `NONE`. Where a
down payment exists, it typically **covers the first period** — set
`initialChargeCoversFirstPeriod = true` so the recurring schedule starts one period out and the customer
is not billed twice for the same month. All of this is org-configurable for SaaS; other operators
anchor to the calendar and prorate.

### 1.3 Invoices

**Immutable snapshots.** An invoice line freezes description, price, and tax **as of issue**. It does not
live-join to the service or the price book. Prices change; issued invoices don't. Corrections happen via
**credit memos, never edits.**

```
invoices
  id, orgId, accountId, locationId
  invoiceNumber            -- per-org gapless sequence
  publicId                 -- uuid, safe for customer-facing links
  serviceRecordId?         -- one invoice per finalized ticket
  billingProfileSnapshot   -- jsonb: terms, remit-to, delivery, tax decision at issue
  status                   -- DRAFT | OPEN | PARTIALLY_PAID | PAID | VOID
  issueDate, dueDate, sentAt?
  subtotalCents, discountCents, taxCents, totalCents
  amountPaidCents, balanceDueCents
  taxRateSnapshot, taxJurisdictionSnapshot
  currency
  createdAt, updatedAt

invoice_line_items
  id, orgId, invoiceId
  serviceId?, serviceRecordId?
  lineType                 -- SERVICE | ADDON | SURCHARGE | FEE | DISCOUNT | ADJUSTMENT
  description              -- SNAPSHOT, not a join
  quantity, unitPriceCents, amountCents
  taxable, taxCents
  sortOrder
```

Notes:
- `sent` is **not** a status — it's a timestamp. A sent invoice is still `OPEN`. (Fixes the current enum,
  which conflates delivery with lifecycle.)
- An invoice is mutable **only** while `DRAFT`. On issue it locks.
- Numbering: per-org counter table with row lock (`FOR UPDATE`), not a global Postgres sequence.
- **Idempotency:** a partial unique index guarantees one non-void invoice per `serviceRecordId`. Batch
  runs and double-clicks cannot double-bill a customer.

### 1.4 Payments, credits, and the AR ledger

Append-only, ledger-style — consistent with the immutable-ledger instinct already proven in PCO Inventory.

```
payments                 -- money received (an event, never edited)
  id, orgId, accountId, locationId?, serviceRecordId?
  method                 -- CARD | CASH | CHECK | ACH | OTHER
  amountCents
  status                 -- PENDING | AUTHORIZED | CAPTURED | FAILED | VOIDED | REFUNDED
  providerPaymentId?     -- Stripe token
  checkNumber?, referenceNumber?, proofAttachmentId?
  collectedByUserId?, collectedAt
  confirmedByUserId?, confirmedAt      -- office confirmation of cash/check

payment_applications     -- payment → invoice, many-to-many
  id, orgId, paymentId, invoiceId, amountAppliedCents

credit_memos             -- the ONLY correction mechanism
  id, orgId, accountId, invoiceId?, reasonCode, amountCents, issuedByUserId

credit_applications      -- credit → invoice
```

This gives you, for free: partial payments, one payment across several invoices, overpayment becoming an
account credit, and field payments taken **before** an invoice exists (they sit unapplied and auto-apply
on invoice generation).

**Aging is derived, never stored.** 0–30 / 31–60 / 61–90 / 90+ computed from open invoices' `dueDate`.
Roll up by location, by account, and (per your notes) by tech.

Field payment confirmation, per your notes:
- **Check** → photo attachment required.
- **Cash** → customer signature required.
- **Card** → Stripe PaymentIntent; approval/decline is authoritative.
- Cash and check post as `PENDING` and require **office confirmation** in Ticket Review before they count
  toward AR. Cards do not.

### 1.5 Sales tax

⚠️ **I am not a tax advisor.** Texas taxability of pest control has real nuance (treatment of residential
vs. commercial structures, what counts as a taxable real-property service, exemption handling). Confirm
the actual rules with your CPA or the Texas Comptroller before go-live. Also note: you described tax as
charged "anytime money is collected" — architecturally, tax is **calculated and frozen at invoice issue**,
which is the accrual-correct behavior and what QuickBooks will expect.

The architecture is the same regardless of what the rules turn out to be:

```
tax_rates            -- org-scoped, Settings-configurable; DFW default 8.25%
  id, orgId, name, ratePercent, jurisdiction, effectiveFrom, effectiveTo?

tax_rules            -- taxability decision matrix
  id, orgId, serviceTypeId?, locationType?  -- residential | commercial
  taxable boolean

tax_exemption_certificates
  id, orgId, accountId, certificateNumber, expiresAt?, documentId
```

Decision order at invoice time: exemption certificate → tax rule (service type × customer type) →
tax rate → **snapshot rate, jurisdiction, and taxability onto the invoice.** Never recompute tax on an
issued invoice.

### 1.6 Invoice generation & batch invoicing

**There are three sources of billing events, not one.** This is the consequence of Billing Plans and it
is the single most important thing to get right in Phase 1.

```
                  ┌──────────────────────────────────────────────┐
                  │            billing_events                    │
                  │  (a charge is due: amount, date, source)     │
                  └──────────────────────────────────────────────┘
                        ▲              ▲              ▲
        ┌───────────────┘              │              └────────────────┐
        │                              │                               │
1. SERVICE-DRIVEN            2. SCHEDULE-DRIVEN            3. INITIAL CHARGE
Plan.chargeTrigger =         Plan.chargeTrigger =          Plan.initialChargeType
ON_SERVICE_COMPLETION        ON_SCHEDULE                   != NONE
        │                              │                               │
Office finalizes a           Nightly BILLING RUN walks     Agreement start:
Service Record →             active agreements, finds      down payment / cleanout /
billing-ready →              plans with a charge due       prepay. Collected by office
emit event                   for the period → emit event   at signing, OR by the tech
                                                           in the field at first service.
        │                              │                               │
        └──────────────────────────────┴───────────────────────────────┘
                                       │
                        resolve Billing Profile (location override → account default)
                        build line items (service, add-ons, surcharges, discounts)
                        apply tax rules → snapshot
                                       │
                              Invoice (DRAFT → OPEN on issue)
```

**Path 2 is the primary path for all agreement revenue.** An agreement sells coverage; the customer is
billed on the plan's schedule whether or not a technician showed up. Path 1 exists **only for
non-agreement / COD work**. Agreement Services emit no billing events, ever.

The billing run is a scheduled job. It must be **idempotent per (agreement × period)** and safely
re-runnable after a failure — a double-run must never double-bill.

Agreement Services therefore always invoice at `$0` billable while retaining full production value. The
wildlife case and the annual-warranty case now fall out of the same rule rather than being special-cased.

### 1.6.1 Holds, billing pauses, and credits — three different things

These must not be collapsed. The existing `Hold` entity already has `blocksService` and `blocksBilling`
as **independent** flags; keep them independent.

| Mechanism | Effect | When |
|---|---|---|
| **Hold (`blocksService`)** | Stop servicing the location. **Billing continues.** | DNS, aggressive dog, credit hold. The customer is still under contract and still owes. |
| **Billing pause** (`blocksBilling`) | Stop emitting billing events | **Remedial only.** Role-gated, requires a reason. Used when *we* erred. Not a routine status. |
| **Credit memo** | Correct a charge already issued | The only way to fix an issued invoice. |

**A service-blocking Hold must never silently pause billing.** Doing so would stop collection on
customers still under contractual coverage. If service delivery failed through the company's fault, the
correction is an explicit, role-gated billing pause or a credit — a deliberate act, never a side effect.

- Settings flag: auto-create invoice **draft** on billing event, vs. manual generation. Default:
  auto-draft, manual issue.
- **Batch invoicing** (per your definition): from the Ticket Review queue, filter finalized/billing-ready
  records over a date range → preview → generate → optionally bulk-send. Idempotent by construction
  (see 1.3). Show a summary with count, total, and any skipped records with reasons.
- A `$0` billable service still produces a **record** (for history and production value) but should not
  generate a customer-facing invoice unless the org opts in.

### 1.6.2 Compensation — build the basis, defer the engine

> **PestFlow computes earnings. QuickBooks pays them.**
>
> This mirrors the AR/GL boundary. QBO has no concept of a service record, a technician, a callback, or
> a production value allocation — that data exists only in PestFlow. But PestFlow must **never** run
> payroll: no withholding, no tax calculation, no W2/1099, no direct deposit. It emits a per-technician,
> per-period earnings statement and hands it off.

**Phase 1 builds only the basis.** This is the part that cannot be added retroactively — you cannot
reconstruct what a technician earned last March if the basis was never recorded.

```
production_value_entries        -- append-only, immutable, audit-logged
  id, orgId
  serviceRecordId               -- one per finalized Service Record
  technicianId                  -- snapshot; do not rely on a live join
  agreementId?
  serviceTypeId
  basis                         -- SCHEDULED_AGREEMENT_SERVICE | ONE_TIME_SERVICE
                                -- | CALLBACK | SURCHARGE
  productionValueCents          -- frozen at office finalization
  contractPriceCentsSnapshot?   -- what it was allocated from
  expectedServiceCountSnapshot?
  finalizedAt, createdAt
```

Frozen at office finalization. **Never edited.** Corrections are new adjustment entries, never mutations
— same discipline as invoices and credit memos.

**Phase 2/3 adds the engine.** Comp plans do not need to be enumerated; they need to be *composed*. Every
plan in the industry is a set of components:

```
comp_plans          -- org-scoped, Settings-configurable, assignable per technician
comp_components
  type              -- PERCENT_OF_PRODUCTION | PERCENT_OF_COLLECTED_REVENUE
                    -- | FLAT_PER_SERVICE | HOURLY | SALARY
                    -- | COMMISSION_ON_NEW_AGREEMENT | TIERED_BONUS
  ratePercent? / rateCents?
  filters           -- service type, agreement vs one-time, include/exclude callbacks
  tiers?            -- thresholds for TIERED_BONUS

comp_earnings       -- append-only ledger; plan + rate SNAPSHOTTED at time of earning
  id, orgId, technicianId, periodId
  sourceEntryId     -- production_value_entry, payment, or agreement sale
  componentId, basisCents, rateSnapshot, earnedCents
```

Notes:
- Components paying on **collected** revenue require the payment ledger — so the engine partly *must*
  wait for Phase 2. This is a reason to defer it, not a problem.
- `callbackProductionValue` (default `$0`) is a Settings knob, not a hardcoded rule. Heritage's policy is
  the industry norm; other SaaS tenants will differ.
- The plan and rate are **snapshotted onto each earning**. Changing a comp plan must never retroactively
  alter what someone was already paid.

### 1.7 Document rendering

Needed for emailing invoices regardless — and it's most of what the future portal needs.

- `documents` table + a render service: Invoice → HTML → PDF.
- Org-level branding (logo, colors, remit-to) — Heritage's brand assets exist already.
- Rendered PDFs are **stored artifacts**, hashed and attached to the invoice. What you sent is what you
  can always re-produce, byte for byte.
- Location **statements** (on request, per your answer) reuse the same renderer: a period roll-up of
  invoices, payments, credits, and balance.

### 1.8 Customer Portal — framework only, no portal

Per the decision that portal is Phase 2+, we build only the four things that make it cheap later —
three of which invoicing needs anyway:

1. `publicId` (uuid) on invoices and locations. **Never expose sequential DB ints in customer-facing URLs.**
2. The document render layer (§1.7). ✅ already required for email.
3. `access_tokens` — scoped, expiring, single-purpose magic links (`VIEW_INVOICE`, `PAY_INVOICE`). This
   creates a customer-facing auth boundary that is **not** your staff login. A "pay this invoice" link is
   a portal-of-one and it ships with Phase 2 payments.
4. A `customerVisible` flag discipline on records, so you're never later auditing what's safe to expose.

That's the framework. No portal is built.

---

## Phasing

| Phase | Contents | Exit criteria |
|---|---|---|
| **0 — Foundations** | `orgId` everywhere; money→cents; RBAC matrix; integration ports as empty interfaces; outbox | Heritage runs as org #1; no query bypasses org scope; no float money remains |
| **1 — Billing core** | Billing Profiles + Billing Plans (both template→snapshot); billing events; the scheduled billing run; contract/billable/production split; invoices + line items; credit memos; tax engine; aging; batch invoicing; document render | A finalized ticket becomes a correct, taxed, immutable invoice; a monthly plan invoices with no service at all; wildlife bills $499 once |
| **2 — Payments** | Stripe behind the port; CC-on-file; field payment capture; payment/credit ledger; QBO sync | Money moves; AR reconciles; books export cleanly |
| **2.5 — Compensation engine** | Composable comp plans/components; earnings ledger; per-tech per-period statement export to QBO Payroll | A comp plan can be configured, not coded; changing it never alters past pay |
| **3 — Comms** | Twilio VOIP/SMS; email log + parse; Automation Center; GHL boundary honored | Invoices send and reminders fire automatically |
| **4+** | Customer Portal; T&C / contract snapshot + e-sign; route optimization; inventory integration; HR suite | — |

### ⚠️ Roadmap conflict to resolve

`PROJECT_MAP.md` names **Terms & Conditions / contract snapshot/versioning** as the immediate next
priority. You've said **invoicing**. These compete for the same next branch.

**Recommendation: invoicing wins.** You need to get paid to run Heritage; contract e-sign is
sales-polish that a signed paper agreement covers in the meantime. The two are not entangled — the only
shared groundwork is *pricing snapshot on the agreement*, which Phase 1 builds anyway, so doing billing
first actually makes the T&C work cheaper. `PROJECT_MAP.md` should be updated to reflect the reordering.

---

## Open decisions

1. **Postgres RLS** for tenant isolation — defense-in-depth, or app-layer scoping only? (Recommend RLS.)
2. **Auto-issue vs. auto-draft** invoices on finalization. (Recommend draft; a human issues.)
3. **`$0` billable services** — suppress the invoice entirely, or issue a $0 invoice for the paper trail?
4. **Statement cadence** — on-request only (as answered), or scheduled monthly for commercial accounts?
5. **Initial service weighting** — flat even split across scheduled services (current default), or weight
   the initial service higher? Many operators do the latter; it's the hardest visit.
6. **Cleanout / down-payment surcharge** — does the surcharge generate production value for the
   technician who collects it in the field, or is it pure revenue? (Touches comp; decide before money
   moves.)
7. **Comp engine scope** — confirmed deferred to Phase 2.5. PestFlow computes earnings and exports;
   it never runs payroll.

---

## Conflicts with `CANONICAL_DOMAIN_RULES_V1.md` (must be reconciled)

| Canon today | Problem | Resolution |
|---|---|---|
| `BillingProfile.billingType (card\|ach\|invoice_terms\|cash\|check)` | One object doing three jobs: instrument, payer config, and cadence | Split into **three** → `payment_methods` + `billing_profiles` (payer) + `billing_plans` (agreement) (§1.2) |
| `ServiceAgreement.defaultPrice` | Single price doing three jobs; inherited onto appointments | Split → contract price / billable / production value (§1.1) |
| `Invoice.status` includes `sent` | Delivery is not lifecycle | `sent` → `sentAt` timestamp; status becomes `DRAFT\|OPEN\|PARTIALLY_PAID\|PAID\|VOID` |
| No `orgId` anywhere | Blocks SaaS; expensive to retrofit | §0.1 |
| Money columns untyped/implicit | Float risk | Integer cents (§0.2) |
| No tax model at all | Can't invoice legally | §1.5 |
| No production value concept | Comp and analytics have no basis | §1.1 |
| Invoices have no line items | Can't itemize, discount, or surcharge | `invoice_line_items` (§1.3) |
| Payment has no application model | Can't do partial/split payments or credits | `payment_applications`, `credit_memos` (§1.4) |
| `ServiceAgreement.billingProfileId` | Points an agreement at a payer profile; there is nowhere to express cadence | Agreement gets a snapshotted **Billing Plan**; the payer profile stays on Account/Location (§1.2) |
| Invoicing assumed to flow only from completed services | Agreements sell **coverage**, not visits. Agreement Services never emit billing events | Schedule-driven **billing run** is the only source of agreement revenue (§1.6) |
| No `expectedServiceCount` on ServiceAgreement | Production value cannot be allocated, and a later frequency change would corrupt already-paid comp | Snapshot `expectedServiceCount` at agreement creation (§1.1) |
| `Hold.blocksBilling` unused/ambiguous | A service Hold silently pausing billing would stop collection on covered customers | Hold, billing pause, and credit memo are three distinct mechanisms (§1.6.1) |
| Roadmap: T&C next | Competes with invoicing | See roadmap conflict above |