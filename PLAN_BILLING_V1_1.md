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
> - **Also moves, resolved 2026-09-10**: `initialChargeCollectedBy`, as an **optional** field —
>   who *may* collect, not who did. Owner's call, and the right one: it is sale logistics, not a
>   billing arrangement, and it is meaningless without the amount and type it travels with.
>
>     Represented as **one nullable column, not two checkboxes**. The owner's "both or neither" are the
>     same state — either role may collect — and storing them as two booleans yields two distinct rows
>     meaning one thing, which is how vocabulary drift starts (see D1a). "Nobody collects it" needs no
>     representation at all: that is `initialChargeType = NONE`. So three states, no duplicates:
>     `NULL` = either may collect (the default, so the field is not required),
>     `OFFICE_AT_SIGNING` = office only, `TECH_AT_FIRST_SERVICE` = technician only. The existing value
>     names are kept because their suffixes carry *when* the collection happens, which
>     `createSurchargeEntryIfConfigured()` depends on.
>
>     **Consequence that must ship with it:** this field is not a permission today, it is an
>     *attribution trigger* — `TECH_AT_FIRST_SERVICE` is what causes a technician to receive
>     production-value credit for the surcharge. Once "either may collect" is expressible, that
>     inference is no longer sound: the code cannot tell from a permission whether the tech actually
>     took the money, so it would credit a tech for cash the office banked at signing. Credit has to
>     key off the **recorded collection event**, which is exactly what D5's payments ledger introduces.
>     Until that exists, credit only when the technician is the *sole* permitted collector, and
>     withhold it when either role may collect — a missing credit surfaces at payout, a wrong credit
>     is silent and gets paid.
>
> Expressing "half down" properly also wants an amount **mode** (flat cents vs. percent of contract
> price) alongside the amount, rather than only flat cents. Sequenced as Pass 5.5 in
> `PLAN_BILLING_V1_1_EXECUTION.md` — it must land before Pass 6 builds D4's receivable.
>
> **Owner review of Pass 5.5 (2026-09-13)** — three refinements, each landing in a named unit:
> 1. **A down payment counts toward the contract price by default.** $400 agreement, $100 down means
>    $300 remains — not $500 total. "In addition to" is the exception and needs an explicit flag. Only
>    a *surcharge* is inherently additional. Lands in **Pass 6** with the receivable: the initial-charge
>    invoice and the remaining-balance arithmetic are one design, so the flag is added there rather
>    than as a dead control now. `initialChargeCoversFirstPeriod` is this same rule for recurring plans.
> 2. **A cleanout surcharge is not a template default.** It is charged by the technician at the initial
>    service for what could not be seen at scheduling (larger home, conducive conditions). The template
>    (owner's call: template, where today `fieldAddableSurcharge` sits on the plan with no reader) holds
>    only an allow/reject toggle. Lands in the **field-surcharge unit** (`CURRENT_FOCUS.md`): the
>    surcharge becomes a line the technician adds on the ticket, `CLEANOUT_SURCHARGE` leaves the
>    initial-charge vocabulary, and the SURCHARGE production credit keys off that recorded line.
> 3. **Production value is separate from collection and from commission.** Per-service production is
>    contract price ÷ expected visits regardless of who collects or whether a balance is due, and comp
>    plans (§1.6.2) decide payout — Pass 5.5 never touched that. What the collector field governs is
>    only the *separate* SURCHARGE credit for a technician-collected cleanout; until the line above
>    exists it is inferred from the permission, and as of this review **only for
>    `CLEANOUT_SURCHARGE`** — a tech-collected down payment earned it too under unit 15, which paid the
>    same money twice. Whether a surcharge earns production *at all* is a **comp-plan selector** (per
>    plan: earns production on surcharge lines, yes / no), never a global rule; a down payment earns
>    none on any plan, since 25% down changes the initial visit's charge and not the contract price
>    production derives from. Recorded in `CURRENT_FOCUS.md`'s compensation entry for the comp engine.
>
> Related: paid-in-full is a **billing-plan** arrangement (`PREPAID_TERM` bills the whole contract
> price once at start, any term length, visits at $0), so the `PREPAY_FULL` initial-charge type
> overlaps it and should be folded when item 2 trims the vocabulary.
>
> **Owner review of 2026-09-21** (live test on James Peterson (Home), after Pass 11b) — two items,
> each assessed against the code and answered the same day. Scheduled as Passes 11c and 11d in
> `PLAN_ROADMAP_V2.md` (C2.1c, C2.1d), ahead of Pass 12.
>
> **Item 1 — the invoice's Bill To prints the service location.**
> - **1a. Defect, unscheduled until now.** `getInvoiceDocumentContext` (`server/storage.ts:7767-7777`)
>   prints the snapshotted billing profile's address when one exists and otherwise the **service
>   location's** current address; the primary location is consulted nowhere in the path. Canon
>   (`CANONICAL_DOMAIN_RULES_V1.md` §5 shared defaults / §4 BillingProfile / §3 default inheritance)
>   says billing defaults come from the primary location / account context with a location override.
>   In practice the fallback hits every invoice: the dev DB holds two `billing_profiles` rows (both
>   Sarah Chen's account, neither with an address) and 45 of 64 invoices carry no snapshot at all.
>   → **Pass 11c**: the Bill To is decided at issue and frozen in the snapshot — the profile's
>   address, else a location override's own address, else the **primary location's**; the render
>   keeps a fallback for the legacy rows only.
> - **1b. Design gap.** The document prints Remit To and Bill To only (`server/documents/invoice-pdf.ts:44-56`,
>   `invoice-html.ts:66-79`); the service location appears nowhere unless it leaks in through 1a.
>   → **Pass 11c** adds a Service Location block. The wider document redesign stays unscheduled
>   (owner: "address this later if appropriate").
> - **1c. Already scheduled.** The "unless another billing profile exists for the service location"
>   half is C5.2 (Pass 34): no screen can create a billing profile or give one an address today, so
>   the override branch — which the resolver already honours — cannot be exercised by the office until
>   then.
>
> **Item 2 — a down payment set for technician collection is its own invoice at agreement creation,
> and the technician is shown $0.00 due today.**
> - **2a. Not a code defect: it is this section's decision, and the owner reverses it.** "A real
>   issued invoice at agreement start" above is what Pass 6 built (`createAgreement` →
>   `issueInitialChargeInvoiceTx`, `server/storage.ts:3252`) and what canon §13 records. The owner's
>   correction: **a down payment is a charge of the initial service and bills on the first visit's
>   invoice**, whoever collects it — the office at scheduling (as D4's designated deposit, step 1
>   above, which then auto-applies at finalization, step 2) or the technician at the visit. Answered
>   2026-09-21 as **"first-visit line, button kept"**: `DOWN_PAYMENT` becomes an `INITIAL_CHARGE` line
>   on the agreement's first visit invoice; the automatic standalone invoice at creation stops; the
>   agreement card's "Issue initial charge invoice" stays as the explicit up-front path. → **Pass 11d**.
>   The "three tools, three jobs" list above stands with one edit: the agreement initial charge is a
>   contractual deposit that is billed **with the first visit** by default and up front on request.
> - **2b. A real defect inside the current design.** `initialChargeCollectedBy = TECH_AT_FIRST_SERVICE`
>   has no reader that touches the field: `getVisitBillingSummary` prices only the visit's own lines
>   and finds the standalone invoice through neither anchor, so the ticket, appointment details and
>   collect step say $0.00 due and never mention the deposit — a misleading control (dev behavior rule
>   6) under either model. → **Pass 11d** prices the pending down-payment line into the visit's
>   Price / COA / Due today, and the collector field gets its reader: it decides which prompt fires
>   (office at scheduling unless technician-only; technician's collect step unless office-only; both
>   when null). It stays "who may collect, never who did".
> - **2c. Pushback recorded, answered.** Two use cases argued for keeping an up-front path: a
>   commercial customer who wants a deposit invoice to pay against before the visit, and a deal whose
>   first visit never happens while the deposit is owed. The owner kept the explicit button for both
>   and removed only the automatic issue. Office collection at scheduling already exists as the
>   designated deposit; the new part is the prompt when the appointment is created.
>
> **Answered 2026-09-22, at the start of Pass 11d.** The three `Daily Rodent Trapping` deposits
> ($99.95 each, never issued, first visits already invoiced at $0) are **settled outside the ledger**
> - the default: the pass's migration inserted an `INITIAL_CHARGE` billing event with no invoice for
> each and printed the per-row effect at boot, so no visit invoice carries them. The fourth unissued
> deposit, `Wildlife Trapping Program` (25% of $499, no visit yet), **rides its first visit** under
> the new rule with no migration. Built as **Pass 11d** (`feature/phase-2-down-payment-first-visit`);
> the as-built record is "Shipped in Pass 11d" at the end of `PLAN_ROADMAP_V2.md` Part D.
>
> `CANONICAL_DOMAIN_RULES_V1.md` §13 ("real issued receivable at agreement creation") and the
> initial-charge canon were corrected **in Pass 11d's PR**, with the code, per the working agreement.

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

> **Owner review of Pass 7.5 (2026-09-15, approved 2026-09-16)** — from live testing of the
> field → office loop. Four findings, each landing in a named pass:
> 1. **The reviewer must see the field collection before finalizing.** The Service Ticket Review
>    modal shows no money; the flow was Finalize → Generate → "apply the location balance?" with
>    the collection invisible until the last step. D9's "price/payment and address blocks" on the
>    review modal were decided but never scoped into a pass (the Pass 9 row is the column drop
>    only). Lands in **Pass 7.6**.
> 2. **A payment records the visit it was collected at.** `payments.appointmentId`, nullable, set
>    by the field collect dialog and never changed — the same kind of intent as
>    `designatedAgreementId` (D4). The D4 prompt suggests visit-collected money first, then
>    agreement-designated, then undesignated. Application stays the office's explicit act. Pass 7.6.
> 3. **Pending money is visible wherever an invoice is shown.** "Pending shows, confirmed counts"
>    stands — a bounced check must never have marked an invoice paid — but applied-pending money
>    was visible only behind the location Invoices tab's Applications toggle. Invoices gain a stored
>    `pendingAppliedCents` rollup, recomputed with `amountPaidCents` / `balanceDueCents` in the same
>    transaction, shown on every invoice row and tile as "pending confirmation". Confirmation is
>    also offered from the review modal, gated exactly as the ledger panel gates it
>    (`CONFIRM_PAYMENT`; cash `CONFIRM_CASH_PAYMENT`). Pass 7.6.
> 4. **A Payments screen.** Org-wide list with server-side filters (status, method, date range,
>    collector, customer/location search), a pending-confirmation queue with **batch confirmation**
>    (permission checked per payment — cash is skipped and reported for a support user; one
>    transaction and one audit row per payment), and a **collections report** by day, collector and
>    method with pending against confirmed — the deposit-slip view. Read-only, derived, no new
>    stored data. Lands in **Pass 7.7**, after 7.6, since the queue and the report group by the
>    visit link and the collector.
>
> Sequenced 7.6 → 7.7 → 8 → 9. D9's office edit button and settings-driven reopen-reason dropdown
> remain unscheduled.

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
  **Built as Pass 7.5** (`feature/phase-1-tech-collect-relabel`, 2026-09-15). Signatures and a
  printable customer copy remain future; the office-side follow-ups from the owner's review of that
  pass are recorded under D5.
- **Technician ticket modal (owner notes, 2026-09-16, after Pass 8):** the price typed on the
  ticket must drive the Price / tax / Due today block and the collect step immediately, on
  leaving the price box. Today both read the *stored* price, so Finish & Collect shows and
  defaults to the old amount, and the new price lands only when the ticket is posted, after
  Collect. Tax stays the tax engine's answer, display-only. Also: service instructions inside
  the open ticket, dollars.cents formatting on the price box, adding a service from the field,
  and creating an agreement from the field (which wants sale attribution first). Recorded in
  full, with what exists today and the proposed design, in `CURRENT_FOCUS.md`; one
  technician-view pass after Pass 9.
- **Proposal generator** from the field: future/external, API-linked. Framework note only.

## D9. Schema cleanups riding along in Phase 1

- **Delete `agreementTemplates.defaultBillingFrequency` and `agreements.billingFrequency`** (legacy
  free-text). `billingPlanId` + `billingPlanSnapshot` is the only mechanism — ground truth confirms the
  billing run already reads only the plan-driven fields. Migration: rows with legacy text and no plan
  get flagged for manual plan assignment; do not silently guess.
  **Built as Pass 9** (`feature/phase-1-legacy-billing-frequency-removal`, 2026-09-16). The
  bootstrap reported every plan-less agreement before the drop (9 with legacy text, 2 with none),
  carried the legacy text into each of the 9 agreements' notes as a marked line, assigned no plan,
  and dropped both columns. The 11 stayed plan-less until the "Billing Plan required on every
  Agreement" item in `CURRENT_FOCUS.md` resolved them: **Pass 12** (2026-09-23) attached "Monthly
  Recurring" to all 11 on the owner's answer of 2026-09-19 and made `billingPlanId` NOT NULL.
- Field lockdown per prior decision, now explicit: after tech post → price/date/materials/collection
  locked from tech, office edits role-gated + logged; after finalization → immutable, corrections via
  reopen-with-reason (workflow) or credit memo (money); payment records immutable from creation,
  corrections via void + new entry.
  **Built as Pass 16** (`feature/phase-3-ticket-lockdown`, 2026-09-23): `PATCH /api/service-records/:id`
  is `EDIT_TICKET` (support+), content-only and strict, 409 on a finalized ticket; a re-post through
  `completeService` is refused on a FINALIZED ticket for everyone and on a ticket in office review
  without `EDIT_TICKET` (the office reopens, the technician re-posts the REOPENED ticket); every
  accepted edit or re-post writes `ticket_edited` with the ticket and its materials before and after.
  The rules are `shared/ticket-status.ts`. The pre-Phase-1 Service History "Confirm" (a bare
  `confirmed: true` that completed a Service without finalization) is gone; its cards link into
  Service Ticket Review instead.
- Reopen-reason UX per notes: pop-up with settings-configured dropdown; "Other" requires text
  (role-gated). Review modal gains Next/Back ticket navigation, price/payment and address blocks, and
  the role-gated office edit button.
  The price/payment and address blocks and Next/Back land in **Pass 7.6** (owner review of Pass 7.5,
  under D5). The reopen-reason dropdown shipped as **Pass 17** (`feature/phase-3-reopen-reason-popup`,
  2026-09-25, C3.2 - a pop-up over the `ticket_reopen_reasons` settings list, "Other" with the reason
  typed out and gated `REOPEN_TICKET_OTHER`, manager+); the office edit button shipped as **Pass 18**
  (`feature/phase-3-office-edit-ticket`, 2026-09-25, C3.1b): Edit on the review modal opens the
  ticket dialog in an office-edit mode over the gated PATCH, the Service's price and type riding
  along under the post's rule and logged `price_overridden`.

---

## Verification targets (Phase 1 acceptance)

> Run end to end on 2026-09-16 after Pass 9 merged (branch `verify/phase-1-acceptance`, PR #70).
> Every target below held; the per-target evidence and the one defect it surfaced (a voided invoice
> kept a stale `pendingAppliedCents`; fixed in Pass 10) are recorded under "Verification" at the
> end of `PLAN_BILLING_V1_1_EXECUTION.md`.

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
