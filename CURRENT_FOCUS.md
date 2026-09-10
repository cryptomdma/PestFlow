# Current Focus

## Active goal
Phase 1 — Billing core: appointment-anchored invoicing wired to finalization, payments-lite ledger
(cash/check, unapplied balances, application/release), COA as payment application, and the promotion of
`audit_logs` to the system-wide immutable financial history.

## Status
Pass 1 (`feature/phase-1-appointment-status-enum`, D1a) merged as PR #56.
Pass 2 (`feature/phase-1-audit-log-infrastructure`, D7 infra half) merged as PR #57 — `audit_logs` has
a single transaction-aware `recordAuditLog()` write helper on `DatabaseStorage`, a read-only
`GET /api/audit-logs`, and a History tab on the location screen, with the entity/action vocabulary in
`shared/audit.ts` as compile-time unions.

Pass 3 (`feature/phase-1-invoice-appointment-anchor`, D1) merged as PR #58 — invoices now
anchor on `appointmentId` (one visit, one invoice, one line per finalized Service Record), with
`serviceRecordId` kept as the fallback anchor for appointment-less one-offs and two mutually-exclusive
partial unique indexes enforcing both. Whether an agreement service is $0 or chargeable is decided by
one shared predicate — `isScheduleBilledPlan()` in `shared/billing-plan.ts`, read by both the nightly
run and invoice generation so they can never disagree about who bills a visit. Generation is
audit-logged as `invoice_issued` and surfaces on the location History tab. The helper signatures and
the behavior passes 4-5 need to know are written out in `PLAN_BILLING_V1_1_EXECUTION.md` under
"Shipped in Pass 3" — read that rather than re-deriving it.

Pass 3.5 (`feature/phase-1-agreement-billing-plan-selector`) is pushed and awaiting merge — an
unplanned pass inserted ahead of Pass 4, from Pass 3's live-testing finding that `billingPlanId` had no
writer anywhere in the client. Both the agreement form and the agreement-template form now carry a real
Billing Plan selector in place of the free-typed billing-frequency input, and attaching a plan to an
**existing** agreement now sets `nextBillingDate` and refreshes `billingPlanSnapshot` — it previously
set neither, so an edited agreement looked correctly configured and was never billed by anyone. The
attachment rules (mid-term anchoring, the two refusals that prevent double-billing, and what is
deliberately still legacy) are written out in `PLAN_BILLING_V1_1_EXECUTION.md` under "Shipped in
Pass 3.5". It also fixes `advanceAgreementDate()`, which had no `DAY`/`WEEK` case and so billed a
daily or weekly plan monthly, at roughly 30x the correct per-period amount — unreachable until
agreements could carry a plan.

Next up once it merges: **Pass 4 — `feature/phase-1-draft-invoice-lifecycle`** (D3, Q3). Newly
sequenced behind it: **Pass 5.5 — `feature/phase-1-initial-charge-to-agreement`**, an owner correction
to D4 moving the down-payment type/amount off the shared Billing Plan and onto the Agreement and
Agreement Template, where a per-sale amount derived from contract price belongs. It must land before
Pass 6 turns that block into a real receivable. See D4's correction note in `PLAN_BILLING_V1_1.md` and
the Pass 5.5 section of `PLAN_BILLING_V1_1_EXECUTION.md`.

Full ordered plan, impact analysis, conflict resolutions, and per-pass verification steps live in
`PLAN_BILLING_V1_1_EXECUTION.md` — read it before starting a pass, and update its "Pass status" table
when a pass finishes. This file only tracks the one-line "where are we" pointer; the execution doc is
the source of truth for what each pass actually does.

## Reference documents, in reading order
1. `AGENT_WORKING_AGREEMENT.md` — how a session works here (one pass, one branch, when to stop)
2. `CANONICAL_DOMAIN_RULES_V1.md` — canonical domain model; measure any change against this
3. `PLAN_BILLING_V1_1.md` — the settled decision record (D1-D9); governs over any older billing doc
4. `PLAN_BILLING_V1_1_EXECUTION.md` — the ordered, impact-analyzed execution plan for D1-D9
5. This file — current status pointer only

## Constraints (apply to every pass below)
- Finalization remains the authoritative completion event. Pre-finalization invoices are DRAFT-only;
  issuing early requires `ISSUE_INVOICE_PREFINALIZATION` (Manager+) and flags the ticket.
- Agreement revenue comes only from the nightly billing run **for plans the run actually bills**
  (`isScheduleBilledPlan()`); those services appear on visit invoices at $0 billable. Every other plan
  — COD/per-service, charge-at-start, installment, or no plan — makes the visit the billing event and
  the line carries a real amount. Never emit service-driven billing events for agreement work either way.
- Price is never mutated by COA, deposits, or applications. Status fields derive from amounts and are
  never hand-set.
- Payments, applications, credit memos, and audit logs are append-only. Corrections are new records
  (void + re-entry, credit memo, forward revert), never edits or deletions.
- All money integer cents; all tables org-scoped; no route trusts a client-supplied actor.
- Not in this phase: Stripe/card processing (Phase 2), QBO sync, unschedule action, preferred-tech
  behavior, opportunity taxonomy migration, proposal generator, tech payment-collection UI relabel
  (lands immediately after payments-lite as its own pass), Services-tab PENDING_SCHEDULING-vs-SCHEDULED
  display clarity (a real, separately-noted UI gap — not a billing concern).
- Also not in this phase, each documented where it belongs rather than scheduled here. The first two
  are the ones that gate real use of the billing engine:
  - ~~**Attach a Billing Plan to an Agreement (UI).**~~ **Done — Pass 3.5**, pushed as
    `feature/phase-1-agreement-billing-plan-selector`. Both forms now carry a real plan selector, and
    plan-attachment-on-update sets the billing schedule instead of silently doing nothing. This
    unblocks D9's column drop and the required-field work below, and clears the sequencing constraint
    that Pass 5 (D2) could not land before it.
  - **Open / download / send an invoice document.** `GET /api/invoices/:id/document` renders the PDF
    and has no UI affordance anywhere — no button on the invoice list or detail. Owner calls this
    mandatory, not optional.
  - **Billing Plan required on every Agreement** — backfill the 11 plan-less agreements, then
    `billingPlanId NOT NULL` + zod. **Unblocked by Pass 3.5**: the creation UI, template propagation,
    and plan-attachment-on-update all exist now, so what remains is the backfill and the constraint.
    Until then a plan-less agreement bills COD per visit. Sequence before D9's column drop, which
    resolves the same rows.
  - **Service designation + callback attribution** — `ServiceType.category`
    (`CALLBACK | PRODUCTION | SERVICE`) in Settings, instance designation on Service, and a required
    link from a callback to the Service it answers. See `CANONICAL_DOMAIN_RULES_V1.md` §10. More
    urgent than it first looked: because every agreement is currently plan-less (above), the
    slot-counter proxy can charge a customer for a warranty callback performed inside the service
    interval.
  - **Service-level cancel / return-to-queue** — cancelling or rescheduling ONE service on a
    multi-service appointment. Only the appointment-wide path exists, and the schedule screen's
    "Cancel Service" button actually cancels the whole appointment (dev behavior rule 6). Confirmed in
    live testing: the wording still speaks of cancelling the appointment. Note that once a ticket is
    posted, remaining services on that appointment can be cancelled without disturbing the invoice.
  - **Move Batch Invoice from Service Ticket Review to the Invoices screen** — it is an invoicing
    action sitting on a review queue.
  - **Multi-party production attribution — splits across technicians, plus a salesperson dimension.**
    Owner-raised 2026-09-10. **Not in the codebase and not in any plan doc** — confirmed by full-repo
    sweep, not assumed. Today `production_value_entries.technicianId` is a single nullable varchar
    (not even an FK), so one entry credits exactly one technician; there is no salesperson concept
    anywhere (`soldBy` / commission / share: zero hits across all `.ts`, `.tsx`, `.md`); and the
    deleted `PLAN_BILLING_V1.md` assumed a single technician throughout ("production value feeds both
    analytics and technician comp"). PestPac-style configurable splits are the target shape.

    Sketch, so the next person doesn't re-derive it: keep `production_value_entries` as the "what was
    earned" fact and add append-only **allocation** rows beneath it — party type
    (`TECHNICIAN | SALESPERSON`), party reference, and share. Existing entries backfill as one 100%
    technician allocation, so no history is reinterpreted. Salesperson must be assignable to any
    **user**, not just a technician, and `technicians`/`users` are separate tables, so the party
    reference has to span both; assigning or changing sales credit is role-gated
    (`shared/permissions.ts`). The ledger is append-only per canon, so correcting a split is a new
    allocation set, never an edit.

    **The real blocker is assignment, not the ledger.** `services.assignedTechnicianId` and
    `appointments.assignedTechnicianId` are single FKs and there is no crew/assignment join table, so
    the app cannot even record that two technicians ran a job. That half is **not backfillable** — who
    else was on a visit is unrecoverable after the fact, while ledger splits can be added later
    additively. If any part of this is pulled forward, pull forward multi-technician assignment.

    Same principle as Pass 5.5's `initialChargeCollectedBy` finding: credit must key off what was
    **recorded to have happened**, never inferred from a configuration field.
  - **`PLAN_BILLING_V1.md` is cited 24 times across 9 files but is not in the repo** — including 9
    citations in `shared/schema.ts` and 6 in `server/storage.ts`, all pointing at section numbers
    (`§1.1`, `§1.6 path 2`) that cannot be read. It existed in two early commits and was removed
    before `origin/main`; `PLAN_BILLING_V1_1.md` still opens by calling itself an addendum to it.
    Either restore it as a historical reference or repoint the citations — the current state means
    load-bearing code comments cite a source nobody can open.
  - **`CUSTOM` recurrence silently means "days"** — small, mechanical, worth doing before it spreads.
    `billingPlans.intervalUnit` offers `DAY | WEEK | MONTH | QUARTER | YEAR` and (since Pass 3.5) all
    of them step correctly with any interval count. But the **service recurrence** and **agreement
    term** dropdowns — on both the agreement form and the agreement-template form — offer only
    `MONTH | QUARTER | YEAR | CUSTOM`, and `advanceAgreementDate()` maps `CUSTOM` to `addDays()`. So
    "Custom / 7" means "every 7 days" with nothing in the UI saying so, and `CUSTOM(7)` is
    indistinguishable in behavior from `WEEK(1)`. Replace `CUSTOM` with explicit `DAY` and `WEEK`
    options on those two dropdowns and migrate `CUSTOM(N)` → `DAY(N)`. Affects 7 agreements and 2
    templates today, including the Wildlife Trapping Program rows, which are `CUSTOM/7` term *and*
    recurrence — i.e. the daily-trap-check case this vocabulary was quietly already serving.
