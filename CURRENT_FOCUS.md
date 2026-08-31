# Current Focus

## Active goal
Phase 1 — Billing core: appointment-anchored invoicing wired to finalization, payments-lite ledger
(cash/check, unapplied balances, application/release), COA as payment application, and the promotion of
`audit_logs` to the system-wide immutable financial history.

## Status
Pass 1 (`feature/phase-1-appointment-status-enum`, D1a) is pushed and awaiting merge — `appointments.status`
is now the four-value enum `SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED`, enforced server-side by
`appointmentStatusSchema` and normalized on every boot. Next up once it merges: **Pass 2 —
`feature/phase-1-audit-log-infrastructure`** (D7, infra half).

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
