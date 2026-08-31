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

Pass 3 (`feature/phase-1-invoice-appointment-anchor`, D1) is pushed and awaiting merge — invoices now
anchor on `appointmentId` (one visit, one invoice, one line per finalized Service Record), with
`serviceRecordId` kept as the fallback anchor for appointment-less one-offs and two mutually-exclusive
partial unique indexes enforcing both. Agreement-covered work rides along as $0 `AGREEMENT_COVERED`
lines and still never produces a `billing_events` row. Generation is audit-logged as `invoice_issued`
and surfaces on the location History tab. The helper signatures and the behavior passes 4-5 need to
know are written out in `PLAN_BILLING_V1_1_EXECUTION.md` under "Shipped in Pass 3" — read that rather
than re-deriving it. Next up once it merges: **Pass 4 —
`feature/phase-1-draft-invoice-lifecycle`** (D3, Q3).

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
- Agreement revenue comes only from the nightly billing run. Agreement-covered services appear on visit
  invoices at $0 billable. Never emit service-driven billing events for agreement work.
- Price is never mutated by COA, deposits, or applications. Status fields derive from amounts and are
  never hand-set.
- Payments, applications, credit memos, and audit logs are append-only. Corrections are new records
  (void + re-entry, credit memo, forward revert), never edits or deletions.
- All money integer cents; all tables org-scoped; no route trusts a client-supplied actor.
- Not in this phase: Stripe/card processing (Phase 2), QBO sync, unschedule action, preferred-tech
  behavior, opportunity taxonomy migration, proposal generator, tech payment-collection UI relabel
  (lands immediately after payments-lite as its own pass), Services-tab PENDING_SCHEDULING-vs-SCHEDULED
  display clarity (a real, separately-noted UI gap — not a billing concern).
