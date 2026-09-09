# PLAN_BILLING_V1.1 — Phase 1 Decision Record

> Addendum to `PLAN_BILLING_V1.md`. Where the two conflict, **this document governs.**
> Decisions below were resolved between the owner and planning after Claude Code's ground-truth report
> on the post-Phase-0 codebase. Line references cite that report.

---

## D1. Invoices anchor to the APPOINTMENT (visit), not the Service Record

Supersedes v1's "one invoice per service ticket."

- The customer experienced one visit → one combined invoice. One line item per finalized Service
  Record on that appointment (plus add-on/surcharge/discount lines).
- Ground truth supports this: appointment↔service is already one-to-many via `services.appointmentId`,
  and `getLinkedServicesForAppointmentTx()` is the load-bearing resolver used by technician-work,
  reschedule, and finalize-rollup. Reuse it; do not invent a parallel join.
- **Idempotency moves:** one non-void invoice per `appointmentId` (partial unique index). For work with
  no appointment (direct one-offs), fall back to one non-void invoice per `serviceRecordId`.
- **Generation timing:** an invoice for an appointment may be generated once **all** linked Services are
  finalized (the existing appointment-completion rollup condition). Partial finalization does not
  invoice. Settings may later allow per-service splitting; not now.
- `invoices.serviceRecordId` becomes `invoices.appointmentId` + line-level `serviceRecordId` on
  `invoice_line_items`.

### D1a. Prerequisite: harden `appointments.status`

Ground truth: `appointments.status` is unvalidated plain text with casing/spelling drift
(`"canceled"` lowercase single-L vs services' `"CANCELLED"`). Before this table anchors money:

- Add a zod enum server-side: `SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED` (pick ONE casing
  convention and align a migration to normalize existing rows).
- Reschedule remains field-tracked (`rescheduleRequested*`), not a status. Unschedule (see D8) archives
  the placement rather than adding a status value.

## D2. Finalization wires invoice generation (the confirmed gap)

Ground truth: `finalizeServiceRecord()` sets `readyForBilling: true` but nothing acts on it; generation
is reachable only via two manual routes and the nightly billing run.

- On the finalization that completes an appointment (all linked Services finalized):
  **generate-or-adopt** the appointment's invoice:
  - If a DRAFT invoice already exists for the appointment (D3), **adopt it**: refresh lines from
    finalized Service Records, then present for issue. Never create a second.
  - Else create one (respecting the D1 idempotency index).
- Per the owner's notes: **prompt the reviewer on finalization** — Generate / Generate & Send / Later.
  Settings: `invoiceOnFinalize = PROMPT | AUTO_DRAFT | OFF` (default `PROMPT`).
- Schedule-driven agreement billing is untouched: the nightly run remains the only source of agreement
  revenue. This wiring applies to billable (COD / per-service) work only. Agreement-covered services
  still produce $0-billable lines on the visit invoice (visible, not chargeable) — display-only truth
  for the customer.

## D3. Pre-finalization invoices are DRAFT-only

- An invoice may be **created** (DRAFT) against an unfinalized service/appointment — legitimate for
  office prep/preview.
- It may not be **issued** before finalization except by a role-gated override
  (`ISSUE_INVOICE_PREFINALIZATION`, Manager+) which flags the linked ticket(s) for review.
- Finalization adopts the draft (D2). "Invoice generation does not repeat after finalization" —
  guaranteed by the idempotency index, not by convention.

## D4. Deposits and pre-payments live in the PAYMENTS LEDGER, not draft invoices

The half-down-at-scheduling case is served by unapplied payments, not by pre-created invoices:

1. Payment recorded at scheduling → **unapplied** balance at the **location** (not customer) level,
   optionally **designated** toward an agreement/service. Designation is intent; application is fact.
2. Invoice generates at finalization → the already-specified prompt fires:
   *"Apply $X location balance to this invoice?"* — designated balances are suggested first.
3. Remaining balance = invoice total − applied payments. Computed, never stored by hand.

Structured agreement down payments (half-down as a *term of sale*) use the `initialCharge*` block →
a real issued invoice at agreement start. Three tools, three jobs:
- **Agreement initial charge** → contractual deposit, proper receivable.
- **Unapplied payment (designated)** → ad-hoc deposit/pre-payment.
- **Draft invoice** → office preparing a bill early. Not a wallet.

> **Owner correction (2026-09-09): the initial charge belongs to the Agreement, not the Billing Plan.**
> This section originally said "the Billing Plan's `initialCharge*` block," and the schema built it
> there. That is wrong. A Billing Plan says **how and when** a customer is charged; it is shared by
> every agreement using it. The down-payment **amount** is a term of *one sale* and is derived from
> that agreement's contract price — a flat `initialChargeCents` on a shared plan forces the same
> down payment onto every agreement regardless of price, and cannot express "half down" at all, which
> is the exact case this section exists to serve.
>
> Splitting the block by that test:
> - **Moves to Agreement / Agreement Template** (what is being sold): `initialChargeType`,
>   `initialChargeCents`. Template carries the default, the agreement carries the actual, the same
>   `defaultPriceCents` → `priceCents` relationship the rest of the form already uses.
> - **Stays on the Billing Plan** (how the charge interacts with the cadence):
>   `initialChargeCoversFirstPeriod` — purely "does the up-front money buy period 1," which is a
>   billing-arrangement question — and `fieldAddableSurcharge`, a plan-level permission.
> - **Open question for the owner**: `initialChargeCollectedBy` (`OFFICE_AT_SIGNING` |
>   `TECH_AT_FIRST_SERVICE`). It does not affect the billing arrangement, so by the test above it is
>   per-sale and moves with the amount — but it is also arguably plan policy. It currently drives
>   technician production credit (`createSurchargeEntryIfConfigured`), so whichever way it goes, that
>   read has to follow it.
>
> Expressing "half down" properly also wants an amount **mode** (flat cents vs. percent of contract
> price) alongside the amount, rather than only flat cents. Sequenced as Pass 5.5 in
> `PLAN_BILLING_V1_1_EXECUTION.md` — it must land before Pass 6 builds D4's receivable.

## D5. Payments-lite ships in Phase 1

Stripe remains Phase 2. Phase 1 builds the ledger with manual instruments:

- `payments` (append-only; CASH | CHECK | OTHER now; CARD/ACH enums present but unreachable until
  Phase 2), `payment_applications`, `credit_memos`, `credit_applications` — per v1 §1.4.
- **Application and release** (un-apply) are explicit, role-gated, audit-logged actions. Release
  requires a reason.
- Add `amountPaidCents` / `balanceDueCents` to invoices as **computed-and-stored** rollups updated
  transactionally with applications. Ground truth: `PARTIALLY_PAID` is currently a hand-set label with
  no backing amount — that ends here; status becomes derived from amounts, never hand-set.
- Pending-confirmation flow per prior canon: cash/check post `PENDING`; check confirms on clearance,
  cash confirms only by a user with cash-handling permission. `PENDING` payments show on the invoice
  but do not mark it paid.
- The existing permission stubs (`TAKE_PAYMENT_FIELD`, `REFUND_PAYMENT`, `ISSUE_CREDIT_MEMO`) get wired
  to real routes. Refunds against CASH/CHECK are manual records; card refunds wait for Phase 2.

## D6. COA is payment application. Price is never mutated.

- Cash-on-account **never** adjusts a service or invoice price. Revenue, tax basis, production value,
  and audit trail all depend on price integrity.
- Field display (tech ticket + appointment details): **Price / COA applied / Due today**, plus the
  service's billing designation — `BILLABLE` (collect today) vs `PRODUCTION` (agreement-covered,
  nothing due). Appointment details shows the sum of due-today amounts only.
- Billing-plan pill on agreements (owner clarification): agreements with a recurring plan display a
  pill — plan name + periodic amount (e.g. `Monthly · $50`) — on the agreement card and location
  screen. Customers/locations are never "COD" or "monthly" as a whole; **plans attach to agreements.**

## D7. Audit: promote `audit_logs` to the system-wide immutable history

Ground truth: `audit_logs` exists with the right shape (entity/action/before/after) but is written from
one legacy path and has no read endpoint. Note-revisions is the only real history.

- Phase 1 scope: every **financial mutation** writes `audit_logs` — invoice issue/void, line edits
  while DRAFT, credit memo issue/apply, payment record/confirm/apply/release/refund, COA application,
  price override, ticket reopen, pre-finalization issue override.
- Add a read endpoint + the customer-screen history view from the notes (user, timestamp,
  before/after). Append-only: no update/delete route may exist for this table.
- "Revert to previous state" = a **new forward change** recorded in the log, never a rollback of the
  log itself.
- Single last-actor stamps (`finalizedByUserId` etc.) remain for display; the log is the truth.
- Non-financial entities (customer/location field changes, agreements, scheduling) join the log in a
  follow-up pass — same table, same pattern, no new infrastructure.

## D8. Deferred to their own passes (explicitly NOT Phase 1 billing)

Decided now, built later, so they stop resurfacing as ambiguity:

- **Unschedule action** (distinct from cancel): archives the appointment placement, returns Services to
  pending scheduling, prompts on linked opportunity with a reschedule-type default. No cancellation
  policy fires. (Scheduling pass.)
- **Preferred technician:** soft constraint only — a weighting for Smart Schedule and a visible hint for
  dispatch, freely overridable. Location-level (in edit/add location modal) overrides customer-level
  (customer edit modal, chip on card). Schema fields may land early; behavior lands with the
  scheduling pass.
- **Opportunity taxonomy:** split axes — `category` = reason (NEW_SALE, SERVICE_DUE, RESCHEDULE,
  WINBACK, RETENTION; settings-managed) and `workType` = AGREEMENT | ONE_TIME. Migration maps existing
  types. (Opportunities pass.)
- **Agreement Type:** two dimensions — `serviceCategory` (pest/termite/mosquito/wildlife…, settings
  reference data) and structure (already expressed by Billing Plan + `expectedServiceCount`).
  **Bundle is not an agreement type** (canon: bundles are a grouping layer). (Agreements pass.)
- **Post-ticket sequence relabel:** tech flow becomes finish → collect (payment modal: type, check #,
  future signatures, customer-facing summary) → post. Button label must NOT be "Complete Service" —
  office finalization owns "complete." Use "Finish & Collect" / "Post Service Ticket."
  (Tech-view pass, after payments-lite exists to collect against.)
- **Proposal generator** from the field: future/external, API-linked. Framework note only.

## D9. Schema cleanups riding along in Phase 1

- **Delete `agreementTemplates.defaultBillingFrequency` and `agreements.billingFrequency`** (legacy
  free-text). `billingPlanId` + `billingPlanSnapshot` is the only mechanism — ground truth confirms the
  billing run already reads only the plan-driven fields. Migration: rows with legacy text and no plan
  get flagged for manual plan assignment; do not silently guess.
- Field lockdown per prior decision, now explicit: after tech post → price/date/materials/collection
  locked from tech, office edits role-gated + logged; after finalization → immutable, corrections via
  reopen-with-reason (workflow) or credit memo (money); payment records immutable from creation,
  corrections via void + new entry.
- Reopen-reason UX per notes: pop-up with settings-configured dropdown; "Other" requires text
  (role-gated). Review modal gains Next/Back ticket navigation, price/payment and address blocks, and
  the role-gated office edit button.

---

## Verification targets (Phase 1 acceptance)

- Two services finalized on one appointment → **one** invoice, two service lines; running the batch or
  the manual route again creates nothing.
- An agreement-covered service appears on the visit invoice at $0 billable; the customer's monthly
  invoice still arrives from the billing run; production value unaffected.
- A $250 designated deposit at scheduling auto-suggests on the $500 invoice at finalization → $250 due.
- A hand-edit of invoice `status` to PAID is impossible; status derives from applications.
- A check payment `PENDING` shows on the invoice without marking it paid; confirming it flips
  amounts and status atomically; the audit log shows both events with actors.
- COA application changes "due today" on the tech ticket without touching price, production value, or
  tax basis.
- Voiding an invoice requires Manager+, writes audit, and frees the appointment for regeneration.
- No route can write `audit_logs` deletions/updates; the customer-screen history renders from it.
