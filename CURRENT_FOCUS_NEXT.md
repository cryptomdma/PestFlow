# Current Focus

## Active Goal
Phase 0 foundations (multi-tenancy, money-as-cents, RBAC, integration ports) followed by Phase 1
billing core: turn finalized Service Records into correct, taxed, immutable Invoices.

## Current branch
`feature/tenancy-and-billing-foundations`

> Prior branch `feature/service-ticket-review-finalization` is complete (Ticket Review MVP).
> Tag `codex-baseline` marks the final Codex-era state.

## Reference documents
- `CANONICAL_DOMAIN_RULES_V1.md` — canonical domain truth
- `PLAN_BILLING_V1.md` — **this phase's spec.** Where it conflicts with the canon, the plan's
  "Conflicts" table governs and the canon gets updated.

## Constraints
- Location remains the canonical customer/service record.
- Service remains the individual work unit. Appointment is dispatch placement only.
- **Appointments carry no price.** Delete the agreement-price inheritance path.
- Office finalization remains the authoritative completion event and the only source of billing-ready
  Service Records. Do not bypass office review.
- All money is integer cents. No floats, anywhere.
- PestFlow never sees, transmits, or stores a card number, CVV, or full ACH credentials. Tokens only.
- No vendor SDK (Stripe, QBO, GHL, PCO Inventory) may be imported outside `server/integrations/*/providers/`.
- PestFlow is an AR subledger, not a general ledger. Do not model a chart of accounts, journal entries, or AP.
- Do not build in this pass: the customer portal UI, contract e-sign/T&C, route optimization, native
  mobile apps, technician comp calculation, inventory deduction.

## Current implementation direction
- `orgId` is added to every domain and settings table, NOT NULL, Heritage seeded as org #1.
  Every index leads with `orgId`. Data access goes through an org-scoped repository layer.
- Three distinct money concepts replace `ServiceAgreement.defaultPrice`:
  **contract price** (agreement total), **billable amount** (what hits AR, decided by Billing Profile),
  **production value** (internal worth of work performed, basis for tech comp).
- `BillingProfile` is split into **three** objects:
  - `payment_methods` — the tokenized instrument (Stripe token; never a card number).
  - `billing_profiles` — **who pays and how**: billing contact, billing address, delivery
    (email/mail/portal), Net terms, autocharge, tax exemption. Attached to the **payer**
    (Account default, Location override).
  - `billing_plans` — **when they're billed, how much, and what's due up front**: interval, initial
    charge / down payment / cleanout surcharge, proration. Attached to the **thing being sold**
    (Agreement, or Service Type default for one-time work).
- A location is not "a monthly customer." A quarterly pest *agreement* is billed monthly. One payer may
  hold several agreements on different Billing Plans simultaneously.
- Both use the existing template→snapshot pattern. Settings holds `billing_profile_templates` and
  `billing_plan_templates`; the **Agreement Template selects a Billing Plan from a dropdown**, and the
  Location Agreement snapshots it at creation — identical to the Cancellation Policy pattern.
- A Billing Plan is a **charge-schedule emitter**: it produces billing events, not invoices. The Billing
  Profile then decides how the resulting invoice is delivered and paid.
- **An agreement sells coverage, not visits.** The customer buys a term of warranted, on-demand
  protection. Two visits or ten, the price is the same. Services are the *cost of delivering* coverage,
  not the trigger for billing. **Agreement Services never emit billing events.**
- **Three sources of billing events:** (1) schedule-driven — a nightly **billing run** walks active
  agreements and emits charges on the Billing Plan's schedule, *with no service involved*. This is the
  only source of agreement revenue. (2) service-driven — office finalization of a billing-ready Service
  Record, **for non-agreement / COD work only**. (3) initial charges — down payment / cleanout / prepay,
  collected by office at signing or by the tech at first service. The billing run must be idempotent per
  (agreement x period) and safely re-runnable.
- Agreement Services always invoice at $0 billable while retaining full production value.
- **Production value: one rule.** `production value = contract price / expectedServiceCount`.
  Callbacks, retreats, and warranty visits carry **$0** production value. A one-time service's
  production value is the full price of that service.
  Wildlife ($499, 5 services) = $99.80 each. Annual quarterly ($600, 4 services) = $150 each.
- Because callbacks contribute nothing, **sum(production value across scheduled services) = contract
  price, always.** There is no separate reconciliation rule per agreement kind.
- `expectedServiceCount` is derived from term x frequency and **snapshotted onto the Location Agreement
  at creation**, so a later frequency change cannot retroactively alter the production value of services
  already performed and already paid out as commission.
- **Production value is revenue allocation, NOT cost.** `contract price - sum(production value)` is
  structurally zero and is not a margin metric. True margin requires **cost-to-serve** (labor, chemical,
  drive time), which is deferred to a later accounting phase. Until then, **callback rate** is the
  available quality/cost signal.
- **Comp consequence:** because production value is the comp basis, a callback pays the technician
  nothing. This is deliberate and aligns incentives (sloppy initial service creates unpaid return trips).
  `callbackProductionValue` is a Settings knob (default $0), not a hardcoded rule.
- **Compensation: build the basis, defer the engine.** PestFlow computes earnings; QuickBooks pays them.
  PestFlow must never run payroll (no withholding, tax, W2/1099, or direct deposit) — it emits a
  per-technician, per-period earnings statement and hands it off.
  - **Phase 1 (this pass):** `production_value_entries` — an append-only, immutable, audit-logged ledger,
    one entry per finalized Service Record, with technician snapshotted. This is the part that cannot be
    added retroactively; you cannot reconstruct what a tech earned last March without it.
  - **Phase 2.5 (later):** the composable comp engine (`comp_plans` / `comp_components` /
    `comp_earnings`). Components paying on *collected* revenue need the payment ledger, so it must wait
    for Phase 2 anyway. Plan and rate are snapshotted onto each earning so changing a comp plan never
    retroactively alters past pay.
  - Do **not** build comp calculation in this pass.
- **Anchoring defaults to SIGNUP_DATE** (org-configurable). Signing on the 17th bills on the 17th,
  which avoids proration entirely (`prorationRule` default `NONE`). Where a down payment exists it
  normally covers the first period; `initialChargeCoversFirstPeriod` starts the recurring schedule one
  period out so the customer is not double-billed.
- **Hold, billing pause, and credit memo are three distinct mechanisms.** A service-blocking Hold
  (`blocksService`: DNS, aggressive dog, credit hold) **does not pause billing** — the customer is still
  under contract and still owes. A billing pause (`blocksBilling`) is remedial only, role-gated, and
  requires a reason; it is used when the company erred. A credit memo corrects charges already issued.
  A service Hold must never silently pause billing.
- Invoices are immutable snapshots with line items. A line freezes description, price, and tax at issue.
  Corrections are credit memos, never edits. `sent` is a timestamp, not a status.
- One non-void invoice per Service Record, enforced by a partial unique index. Batch invoicing cannot
  double-bill.
- Payments and credits are an append-only ledger with an application table, supporting partial payments,
  split payments across invoices, and unapplied field payments taken before an invoice exists.
- Cash and check payments post as PENDING and require office confirmation in Ticket Review.
  Card payments are authoritative on Stripe approval.
- Tax is a rules engine (service type × customer type → taxable), with org-configurable rates
  (DFW default 8.25%) and exemption certificates. Rate and taxability are snapshotted onto the invoice.
- Production value is frozen onto the Service Record at office finalization and is immutable thereafter,
  because it is the basis for technician compensation.
- Aging is derived from open invoices, never stored.
- Integration ports (`PaymentProvider`, `AccountingSync`, `CrmProvider`, `InventoryProvider`) are defined
  as interfaces in Phase 0 with a transactional outbox; only Stripe is implemented, in Phase 2.

## Next tasks
1. `organizations` table; add `orgId` to all tables (nullable → backfill org #1 → NOT NULL); org-scoped
   repository layer; session-resolved org context middleware.
2. Migrate all money columns to integer cents.
3. Permission matrix + `can(user, permission, resource)` helper; gate finalize/reopen/void/credit/refund.
4. Define the four integration port interfaces and the `outbox_events` table. No implementations yet.
5. `billing_profile_templates` + `billing_profiles` + `payment_methods`; Settings UI for templates.
5b. `billing_plan_templates` + `billing_plans`; Billing Plan dropdown on the Agreement Template;
    snapshot onto Location Agreement; default plan on Service Type for one-time work.
6. Add contract price / production value to Agreement and Service; **remove appointment price inheritance**.
7. `invoices` + `invoice_line_items` + `credit_memos`; generation from finalized Service Records.
8. Tax rates/rules/exemptions; snapshot onto invoice at issue.
9. `billing_events` + the scheduled billing run (idempotent per agreement x period).
10. Batch invoicing from the Ticket Review queue (date-range filter → preview → generate → bulk send).
11. Document render (Invoice → HTML → PDF) with org branding; store the rendered artifact.
12. `production_value_entries` append-only ledger, frozen at office finalization (comp basis only —
    no comp calculation in this pass).

## Verification targets
- Wildlife agreement (5 services, $499) bills **$499 once** and $0 on services 2–5, while each service
  carries $99.80 production value and Σ production value reconciles to contract price.
- A monthly Billing Plan on the same agreement produces periodic invoices **with no service performed**,
  and the billing run produces zero duplicates when re-run for the same period.
- A COVERAGE agreement billed 12x/year keeps billing when a service is skipped, canceled, or when the
  location is on a service-blocking Hold.
- Ten warranty callbacks on a $499 agreement produce **zero** production value and zero additional
  customer charges. The agreement's five scheduled services still allocate exactly $499 total.
- Changing an agreement's service frequency mid-term does **not** alter the production value of services
  already performed.
- An agreement with a cleanout surcharge collects it once, at first service, addable by the tech in the
  field when the plan allows it.
- No query can return another org's rows.
- Batch invoicing run twice over the same date range produces zero duplicate invoices.
- An issued invoice's totals never change when a service type's price is later edited in Settings.

## Recommended next implementation priority
- **Phase 2 — Payments:** Stripe behind the port, CC-on-file, field payment capture, payment
  application, QBO sync.
- **Phase 2.5 — Compensation engine:** composable comp plans/components on top of the production value
  ledger; per-tech per-period earnings statement exported to QBO Payroll.