# Current Focus

## Active Goal
Phase 1 — Billing core: appointment-anchored invoicing wired to finalization, payments-lite ledger
(cash/check, unapplied balances, application/release), COA as payment application, and the promotion of
`audit_logs` to the system-wide immutable financial history.

## Current branch
Per working pass (small branches, PR + merge each pass):
1. `feature/phase-1-appointment-status-enum` — D1a hardening + casing normalization migration
2. `feature/phase-1-invoice-appointment-anchor` — D1 anchoring + idempotency index move
3. `feature/phase-1-finalize-invoice-wiring` — D2 generate-or-adopt + prompt + settings
4. `feature/phase-1-payments-lite` — D5 ledger + applications + pending confirmation
5. `feature/phase-1-coa-and-field-display` — D6
6. `feature/phase-1-audit-promotion` — D7
7. `feature/phase-1-legacy-billing-frequency-removal` — D9

## Reference documents
- `PLAN_BILLING_V1.md` — architecture baseline
- `PLAN_BILLING_V1_1.md` — **decision record; governs on conflict**
- `CANONICAL_DOMAIN_RULES_V1.md` — canon; update to V2 as Phase 1 lands

## Constraints
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
  (lands immediately after payments-lite as its own pass).

## Verification targets
See `PLAN_BILLING_V1_1.md` § Verification targets — treat each as an acceptance test before the pass's
PR merges.
