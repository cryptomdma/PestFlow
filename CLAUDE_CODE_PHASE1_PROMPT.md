# Claude Code — Phase 1 Plan Mode Prompt

Setup: copy `PLAN_BILLING_V1_1.md` into the repo root and replace `CURRENT_FOCUS.md` with
`CURRENT_FOCUS_PHASE1.md`. Commit on a `docs/phase-1-plan` branch (or fold into the first work
branch). Then, in Plan Mode:

---

```
Read in full: PLAN_BILLING_V1.md, PLAN_BILLING_V1_1.md (governs on conflict),
CURRENT_FOCUS.md, CANONICAL_DOMAIN_RULES_V1.md, shared/schema.ts, and your own prior
ground-truth findings on invoice wiring, appointment cardinality, billing plans,
audit_logs, and payments (none exist).

DO NOT WRITE CODE IN THIS PASS.

PLAN_BILLING_V1_1.md is a decision record from planning: D1-D9 are settled decisions,
not proposals. Your job is to turn them into an executable, ordered plan and to catch
anything the decisions break in the real code.

Produce:

1. IMPACT ANALYSIS
   - D1 moves invoice anchoring from serviceRecordId to appointmentId. Trace every
     current consumer of invoices.serviceRecordId and generateInvoiceFromServiceRecord()
     (both manual routes, the batch route, the nightly billing run) and state exactly
     how each changes.
   - D1a: enumerate every write-site of appointments.status and every string literal
     comparison against it, so the enum migration list is complete. Propose the casing
     convention and the row-normalization migration.
   - D9: every read of defaultBillingFrequency / billingFrequency, and the count of
     existing agreement rows that have legacy text but no billingPlanId.

2. PLAN CRITIQUE
   - Where do D1-D9 conflict with existing code paths or each other? Flag anything
     that risks double-invoicing, orphaned drafts, or agreement billing-run overlap
     with visit invoices ($0-billable lines must never double-charge).
   - The transactional boundary for D5 rollups (amountPaidCents/balanceDueCents
     updated with applications): propose it concretely.

3. ORDERED WORK PLAN
   - Map to the seven branch-passes in CURRENT_FOCUS.md. Reorder if dependencies
     demand it, and say why. Each pass: files touched, Drizzle migration yes/no,
     what it unblocks, how it's verified, and confirmation the app runs green
     between passes.
   - Keep each pass small enough to PR-review in one sitting. If a pass can't be,
     split it and show the split.

4. QUESTIONS
   - Ask anything ambiguous before finalizing. Domain rules you should NOT guess at:
     tax on partially-COA-covered invoices, credit memo interaction with unapplied
     balances, and what happens to a DRAFT invoice when its appointment is canceled.

Rules: reuse getLinkedServicesForAppointmentTx() and the existing snapshot patterns;
no parallel joins, no new architecture without flagging it; note every migration;
keep the app runnable between commits.
```

---

After the plan lands: review the markdown plan doc, annotate, approve. One branch per pass,
PR + merge each, read every diff. Bring architecture-level surprises back to the planning chat;
sequencing-level ones are Claude Code's to resolve.
