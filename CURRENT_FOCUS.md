# Current Focus

## Active goal
Phase 1 — Billing core — is **complete** (D1-D9, verified in PR #70, closed by Pass 10 in PR #71):
appointment-anchored invoicing wired to finalization, payments-lite ledger (cash/check, unapplied
balances, application/release), COA as payment application, and `audit_logs` as the system-wide
immutable financial history.

Now active: **Phase 2 — Invoices you can work from**, per `PLAN_ROADMAP_V2.md`. Passes 11a-11d (the
Invoice modal, core and reach; the invoice document's parties; the down payment on the first
visit's invoice) are merged (PRs #73, #74, #76, #78), as are the owner review of 2026-09-21 (PR
#75) and the dev-setup chore (PR #77); Pass 12 (Billing Plan required on every Agreement + sale
attribution) is merged (PR #79); Pass 16 (ticket lockdown, D9, enforced server-side - the C3.1
row of that document's Phase 3 table, pulled forward because it was an integrity hole, not a
feature) is merged (PR #81); Pass 13 (Batch Invoice on the Invoices screen + Draft invoice for a
visit, C2.3) is merged (PR #82); Pass 14 (Aging and balances on the customer screen, C2.4) is
merged (PR #83); Pass 25 (Opportunity taxonomy, assignee and search, C4.1 - the first Phase 4
pass, pulled forward by the recommended order) is merged (PR #84); Pass 27 (Cancel and Reschedule,
one path, C4.2 - the other pulled-forward Phase 4 pass) is merged (PR #85) with the owner's
live-testing review of 2026-09-25 recorded on the same branch; Pass 27b (that review's two
defects, C4.2b) is merged (PR #86); Pass 15 (Statements, C2.5 - the last of the recommended
immediate order) is merged (PR #87); Pass 15b (the location balance row inside the notes box,
the owner's note of 2026-09-25) is pushed, awaiting merge; **next pass: 17, the reopen-reason pop-up** (C3.2 -
the recommended order is exhausted, so the rest runs in phase order). The roadmap sequences every
remaining item below; this file keeps the status pointer and, as its last section, the handoff
prompt that starts the next session.

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

Pass 3.5 (`feature/phase-1-agreement-billing-plan-selector`) merged as PR #59 — an
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

Pass 4 (`feature/phase-1-draft-invoice-lifecycle`, D3 + Q3) merged as PR #60. Invoices
now have a real `DRAFT` lifecycle: the office can draft an invoice against an appointment before its
tickets are finalized, and it holds the visit's anchor so nothing else invoices that visit. Issuing
re-prices it from the finalized tickets and stamps `issuedAt`; issuing *before* finalization needs
both the new `ISSUE_INVOICE_PREFINALIZATION` permission (manager+) and an explicit confirmation, and
flags the unfinalized tickets `FLAGGED_FOR_REVIEW` — a ticket posted later onto an already-invoiced
visit is flagged the same way. Generation adopts a draft it finds on a finalized visit rather than
creating a second invoice, which is most of D2's "adopt" already. Cancelling an appointment that
carries a draft now prompts (void it or keep it) on all three cancel paths — the plan named two; the
schedule screen's status PATCH was a third. Signatures and behavior are under "Shipped in Pass 4" in
`PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 5 (`feature/phase-1-finalize-invoice-wiring`, D2) merged as PR #61. Finalization is
now wired to invoicing: the finalization that completes a visit reports an invoicing outcome on the
finalize response, governed by a new org setting `invoiceOnFinalize` (`PROMPT` default | `AUTO_DRAFT` |
`OFF`, Settings → "Invoicing on Finalization", admin-only to change). Under `PROMPT` both finalize
screens (Service Ticket Review, location Services tab) open one shared Generate / Generate & Send /
Later prompt; Generate is the existing generate route, so a DRAFT is adopted, never duplicated, and
Later leaves the visit on the ready-for-billing list exactly as before. `AUTO_DRAFT` creates the
visit's DRAFT inside the finalize transaction under a savepoint, so a refused draft (a priceless
service, a plan-less price-less agreement) reports `DRAFT_FAILED` rather than undoing the
finalization. "Send" still only stamps `sentAt` - there is no delivery mechanism, and the prompt says
so. Signatures and behavior are under "Shipped in Pass 5" in `PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 5.5 (`feature/phase-1-initial-charge-to-agreement`, D4 owner correction) merged as PR #62. The
initial charge - down payment / cleanout surcharge / prepay-in-full, its amount, and who may
collect it - now lives on the Agreement (`initialCharge*`) with the Agreement Template carrying the
default, and is set next to Price on both forms; the Billing Plan keeps only `initialChargeCoversFirstPeriod`
and `fieldAddableSurcharge`, and `buildBillingPlanSnapshot()` no longer carries the moved keys. The
amount has a mode - flat cents or **percent of contract price** (basis points), so "half down" is now
expressible - and one shared resolver (`shared/initial-charge.ts`) turns it into cents everywhere.
`initialChargeCollectedBy` is nullable (null = either role may collect) and is a permission, not a record:
the technician's *separate* SURCHARGE production-value credit now fires only for a cleanout surcharge
(never a down payment - that money is in the contract price the technician is already credited for) and
only when the technician is the *sole* permitted collector; per-service production value (contract price
÷ expected visits) is untouched and never depends on collection. The owner's review of this pass
(2026-09-13) is recorded under D4 in `PLAN_BILLING_V1_1.md` and adds a Pass 6 requirement (a down
payment counts toward the contract price by default) and the field-surcharge unit below. The bootstrap
migration backfilled the 4 agreements
whose `billingPlanSnapshot` carried a charge (their snapshots are left as frozen history) and the one
template whose plan set one, then dropped the three plan columns. Signatures and behavior are under
"Shipped in Pass 5.5" in `PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 6 (`feature/phase-1-payments-lite`, D5 + D4) merged as PR #63. The payments ledger
exists: `payments` (CASH | CHECK | OTHER; posts `PENDING`, confirmed by the office - cash only by a
manager+), `payment_applications`, `credit_memos`, `credit_applications`, all append-only with
stamped lifecycle transitions (confirm / void / refund / release, each with a required reason where it
is a correction) and every act audit-logged. Invoices carry `amountPaidCents` / `balanceDueCents`,
recomputed from the ledger under a row lock inside every transaction that touches them, and
**status is derived from them - "Mark Paid" is gone**; a PENDING payment shows on the invoice but
counts only once confirmed. The unapplied balance lives at the **location**; D4's "Apply $X location
balance to this invoice?" fires from the finalize prompt right after Generate, and from every open
invoice row on the location's Invoices tab, which now carries the ledger panel (balances, payments,
credit memos, applications with Release). The initial charge is a **real issued receivable at
agreement creation** (an `INITIAL_CHARGE` line, an `INITIAL_CHARGE` billing event that makes it fire
once), refused - never $0 - when a percent charge has no price, with an explicit "Issue initial charge
invoice" on the agreement card for that case and for the 4 pre-Pass-6 agreements. Per the owner
review, **a down payment counts toward the contract price by default**: `initialChargeInAdditionToPrice`
is the explicit exception, and `resolveRemainingContractPriceCents()` is what the per-visit line, a
PREPAID_TERM charge and a recurring plan's per-period share now bill from. Signatures and behavior
are under "Shipped in Pass 6" in `PLAN_BILLING_V1_1_EXECUTION.md`. **The receivable-at-creation
half is reversed by the owner's 2026-09-21 review** `[Roadmap: Pass 11d, C2.1d]`: a down payment
bills on the first visit's invoice, the automatic standalone invoice stops, and the explicit "Issue
initial charge invoice" stays as the up-front path. Everything else in this paragraph stands.

Pass 7 (`feature/phase-1-coa-and-field-display`, D6) merged as PR #64. The field now sees
money the way the invoice will: one read, `GET /api/appointments/:id/billing-summary`, prices every
service on a visit through the same `resolveServiceLineBillingTx` invoicing uses and reports
**Price / COA / Due today** per service plus the visit's due-today sum, each service designated
`BILLABLE` (collect today) or `PRODUCTION` (agreement-covered, $0, nothing due). Once the visit's
invoice is issued the figures are its frozen lines and applications (pending ones included, so a
check the office has not cleared is not collected twice); before that they are what generation would
price right now, and "COA available" is the location's unapplied balance the visit could draw on, in
D4's order (designated-to-this-agreement first, designated-elsewhere never). **COA never touches a
price** - verified live: applying the location balance moved due today and left the line amount, tax
and total exactly as issued. Shown on the service ticket, the technician's appointment details, and
the dispatch board's appointment sheet. The **billing-plan pill** (plan name + periodic amount, e.g.
`Monthly · $50/mo`) sits on the agreement card and, named per agreement, on the Location Profile
card; its arithmetic is `resolveBillingPlanCharge()` in `shared/billing-plan.ts`, which the nightly
run now bills from too, so the card can never promise a number the run does not charge. No migration.
Signatures and behavior are under "Shipped in Pass 7" in `PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 7.5 (`feature/phase-1-tech-collect-relabel`, D8's post-ticket sequence relabel) merged as
PR #65. The technician flow is now **finish → collect → post**: the service ticket's primary
button is "Finish & Collect", which opens the field's collect step - the customer-facing summary
(the visit's Price / COA / Due today rows and total, from Pass 7's one read), payment type (cash /
check / other), check number or reference, memo, and the amount defaulted to the visit's due today -
and "Post Service Ticket" lives there. Collecting records the payment through the existing
`POST /api/payments` under `TAKE_PAYMENT_FIELD`: PENDING, **unapplied** (the office applies -
`APPLY_PAYMENT` is support+ and the dialog never sends `applyToInvoiceId`), the collector stamped
from the session, designated to the ticket's service agreement as D4 intent. The same dialog opens
from "Collect Payment" on the technician's appointment details, designated to the one agreement the
visit's services share. Cash still confirms only by a manager. Nothing says "Complete" - office
finalization owns that word. The office's Record Payment dialog is untouched. No migration. Not built:
card / ACH (Phase 2), signatures, a printable customer copy. Signatures and behavior are under
"Shipped in Pass 7.5" in `PLAN_BILLING_V1_1_EXECUTION.md`.

Owner review of Pass 7.5 (2026-09-15, decisions approved 2026-09-16), from live testing of the
field → office loop: the Service Ticket Review modal shows no money at all, so the reviewer
finalizes without seeing what the technician collected; a payment cannot be tied to the visit it
was collected at; once the D4 prompt applies a PENDING payment the money is visible only behind the
location Invoices tab's "Applications" toggle (D5's "pending shows, confirmed counts" is right, the
display is not); and confirmation lives only on the location ledger panel, with no org-wide list,
no batch confirmation and no collections report. Recorded under D5 in `PLAN_BILLING_V1_1.md` and
resolved as two inserted passes, in this order, ahead of Pass 8.

Pass 7.6 (`feature/phase-1-review-modal-field-collection`, D9's review-modal blocks and D5 owner
review items 1-3) merged as PR #66. The Service Ticket Review modal now shows money
before Finalize: the visit's Price / COA / Due today rows (Pass 7's one read), a **"Collected in the
field"** list of what the technician recorded at *this visit* with Confirm gated exactly as the
ledger panel gates it (`CONFIRM_PAYMENT`; cash also `CONFIRM_CASH_PAYMENT`, with the "cash is
confirmed by a manager" line for support), one line for the location's *other* unapplied balance,
the address block, and Back / Next over the filtered queue. A payment now records the visit it was
collected at: `payments.appointmentId`, nullable, set once by the field collect dialog on both of
its surfaces, never by the office's Record Payment dialog, validated like the agreement designation
(the appointment must exist and sit at the payment's location). The D4 order is now
**visit-collected → agreement-designated → undesignated**, confirmed before pending, oldest first,
in the prompt and in the field's "COA available" alike; money collected at a different visit stays
eligible (a preference, not a fence). Invoices carry a third stored rollup, `pendingAppliedCents` -
applied money from PENDING payments, recomputed with the other two in the same transaction and
never read by status - shown as "pending confirmation" on the Invoices screen's rows and Open tile,
the location Invoices tab's rows and the ledger panel's Pending tile. Migration: two nullable
columns and a one-shot backfill of the pending rollup from the ledger (0 everywhere on the dev DB).
Not built: D9's office edit button and reopen-reason dropdown (unscheduled); anything on a Payments
screen (7.7). The owner's first render found a stale-dev-server test artifact (a server started on
pre-7.6 code dropped the collect dialog's `appointmentId`, so two payments have no visit link and
never will) and dead space in the header and money blocks; the second commit makes the header
identity | address | status on one row, the billing a full-width per-service table, and the
collections one line per payment, and reports a failed read as such rather than as "nothing
collected", and keeps Next / Back visible after Finalize by walking a snapshot of the queue rather
than the live filtered list (`client/src/lib/review-queue-nav.ts`, pure, exercised by a scratchpad
script since the repo has no test runner). **Restart `npm run dev:full` before manually testing any
pass that changes server code.** Signatures and behavior are under "Shipped in Pass 7.6" in
`PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 7.7 (`feature/phase-1-payments-screen`, D5 owner review item 4) merged as PR #67.
The office has a **Payments** screen (sidebar Operations → Payments, route `/payments`). One read,
`GET /api/payments`, is the org-wide list with every filter applied in SQL - status, method,
received-date range, collector, and a search over customer name / company, location name / address /
city, check number, reference and memo - capped at 200 rows with the total reported, plus summary
tiles (pending, pending cash, confirmed) computed over the *whole* filtered set with the status
filter deliberately ignored, and the collector options. The **pending-confirmation queue** is that
list under its default Pending filter: a checkbox on every row the user may confirm, select-all over
those, and **Batch Confirm** through `POST /api/payments/confirm-batch`, where the route gate is
`CONFIRM_PAYMENT` and cash authority is decided once and applied *per payment*, so a support user's
cash is skipped and reported with the reason while their checks confirm; each confirmation is
`confirmPayment`'s own transaction and audit row, and a skipped one never rolls back the rest. Rows
link to the location and, when the payment named its visit, to the appointment on the schedule.
The **Collections report** tab, `GET /api/payments/collections`, groups a date range by day /
collector / method, pending against confirmed, with voided and refunded payments counted as
excluded and never summed - the deposit-slip view. The grouping (`summarizeCollections`) and the
confirm gate (`mayConfirmPayment`) are pure functions in `shared/payments.ts`; the location ledger
panel and the review modal now read the gate from there too. Nothing new is stored; no migration.
Days are **UTC calendar days**, like every other date-only value in this repo, so an evening
collection lands on the next day's slip until an org timezone exists (not scheduled). Not built:
a printable slip, paging past the cap, void / refund / apply from this screen (the location ledger
panel keeps those), D9's office edit button and reopen-reason dropdown. **Restart `npm run
dev:full` before manually testing - this pass adds routes.** Signatures and behavior are under
"Shipped in Pass 7.7" in `PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 8 (`feature/phase-1-audit-log-backfill`, D7 remainder) merged as PR #68. The
financial mutations that predate the audit helper now write it, each inside its own transaction
and each **only when a value actually changed**: the **field price override** - a ticket post
(`POST /api/services/:id/complete`) that stamps a different `priceCents`, by a technician on a
manual service or by a manager+ (`ADJUST_PRICE_AGREEMENT`) on an agreement service - records
`price_overridden` on a new `service` audit entity, because the price lives on the Service and the
ticket only reads it; a technician's price on an agreement service is not stamped and writes
nothing, and the ticket dialog sends the current price on every post of a manual service, so an
unchanged post writes nothing either. **Ticket reopen** records `ticket_reopened` on the ticket,
before FINALIZED / ready for billing, after REOPENED with the reason. The invoice **notes /
due-date PATCH** (the only invoice edit that exists) records an `update` on the invoice. The
location History tab's rollup now includes the location's services, so an override shows there
with a "Service" badge. With this, every mutation D7 lists writes the log except "line edits while
DRAFT", which has no mutation to log: nothing edits an invoice line in place (lines are written at
draft / issue and re-priced from the tickets on issue), so `invoice_line_edited` keeps no writer
until a line editor exists. Nothing new is stored; no migration. Not built: a row for a field
service-type change with no price change (not a price override), D7's non-financial entities
(its own follow-up pass), D9's office edit button and reopen-reason dropdown, and the technician
ticket modal items in the owner's notes below (the draft price does not move the ticket's
figures until Post, which is after Collect). **Restart `npm run
dev:full` before manually testing - this pass changes server code.** Signatures and behavior are
under "Shipped in Pass 8" in `PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 9 (`feature/phase-1-legacy-billing-frequency-removal`, D9's column drop) merged as PR #69.
`agreements.billingFrequency` and `agreementTemplates.defaultBillingFrequency` are
gone - from the schema, both `CREATE TABLE` statements, the four normalize writes, the
template-to-agreement propagation line and the seed - so `billingPlanId` + `billingPlanSnapshot` is
the only billing mechanism in the code, as it already was in the nightly run. The migration is one
guarded block in `server/agreement-bootstrap.ts`, keyed on the column still existing (the D4 /
money-bootstrap shape), so it ran once on the dev DB and every later boot is a no-op. Before the
drop it printed the **pre-migration report**: every plan-less agreement, in two buckets - the 9
with legacy text (all `"Monthly"`, all named `Quarterly Control`) and the 2 with no billing data at
all (both `Wildlife Trapping Program`). **No plan was assigned**: the 11 remain plan-less and bill
per visit, and they are exactly the rows the "Billing Plan required on every Agreement" item below
resolves. The legacy text of the 9 was carried into each agreement's `notes` as one marked line
(`Legacy billing frequency "Monthly" - no Billing Plan attached. Assign one on the agreement form;
until then this agreement bills per visit.`) so whoever assigns the plan still sees what was typed
at the sale and can delete the line afterward; the 4 agreements that had legacy text *and* a plan
lost the text without a note (the plan governs), the 2 no-data rows were reported only, and no
template was in the legacy-text-no-plan bucket, so nothing was carried for templates. A client
that still sends either legacy key has it stripped by zod, not refused; no client has since Pass
3.5. **Restart `npm run dev:full` now, not after the merge: a server started on pre-Pass-9 code
selects the dropped column by name and every agreement read on it fails, and the migration ran on
the shared dev DB during this pass's verification boot.** Signatures and behavior are under
"Shipped in Pass 9" in `PLAN_BILLING_V1_1_EXECUTION.md`.

With Pass 9 the D1-D9 sequence is built.

Phase 1 verification (`verify/phase-1-acceptance`, 2026-09-16) merged as PR #70. A
docs-only branch: no code changed. The eight acceptance targets in `PLAN_BILLING_V1_1.md` and the
three conflict-resolution guards at the end of `PLAN_BILLING_V1_1_EXECUTION.md` were run end to end
on the merged D1-D9 code (PORT=5001, `invoiceOnFinalize = PROMPT`) by a 91-assertion scratchpad
script: fixtures built through the API as the four roles, the nightly run triggered with the fixture
as the only due agreement, everything deleted afterward with all eleven table counts back at their
pre-run values. **Every target and guard held.** One defect surfaced and was left unfixed on purpose
(this pass verifies, it does not build): `voidInvoiceTx` in `server/storage.ts` zeroes
`amountPaidCents` / `balanceDueCents` / `paidDate` by hand and predates Pass 7.6's
`pendingAppliedCents`, so an invoice voided while a PENDING payment was applied to it keeps that
amount in `pendingAppliedCents` after the application is released (verified: 4000 left on a VOID
invoice whose status, balance, released application and location pool were all correct). The
stored rollup is wrong; which screens print it for a VOID row was not rendered here. Fix, one
line plus a backfill: `pendingAppliedCents: 0` in that UPDATE (or call `recomputeInvoiceRollupTx`),
and a one-shot `UPDATE invoices SET pending_applied_cents = 0 WHERE status = 'VOID'` in
`payments-bootstrap.ts`. **Fixed in Pass 10 below.** Two observations, not defects: the batch-invoicing date range filters on
the ticket's posting date (`postedAt`, falling back to `serviceDate`), which the Batch Invoice
dialog should say; and a DELETE / PATCH / PUT / POST to `/api/audit-logs` falls through to the SPA
shell with a 200 rather than a 404, because no such route exists - nothing is written, but an API
client cannot tell "no route" from "page". Per-target evidence is under "Verification" at the end
of `PLAN_BILLING_V1_1_EXECUTION.md`.

Pass 10 (`feature/phase-1-invoice-document-and-location`, 2026-09-17) merged as PR #71. The
owner's pick from the unscheduled items: the two Invoices-screen gaps that gated real
use of the billing engine, with the void rollup defect riding along. **The invoice document has
an affordance**: every invoice row on the Invoices screen and on the location's Invoices tab now
carries Open PDF (a new tab), Download (the same route with `?download=1`, answered as an
attachment) and, for an issued invoice not yet sent, Mark Sent (`SEND_INVOICE`), with "Sent
<date>" shown once stamped; a draft's buttons say Preview and store nothing. "Send" is still
only the `sentAt` stamp - there is no email delivery and the button says so - but marking sent
now **pins the stored PDF** (`batchSendInvoices` renders it before the stamp), so §1.7's "what
you sent is what you can reproduce" holds from the moment of sending rather than from whenever
someone first opened it. **A manual invoice carries a location**: the New Invoice dialog has a
required Location selector (the customer's locations, defaulting to the primary), the server
refuses a manual invoice without one or with another customer's, and the path now writes
`invoice_issued` like every other issuing path, so the invoice lands on the location's Invoices
tab, in its balance and on its History tab. The Invoices screen names each row's location and
marks the two pre-existing location-less rows "No location" - INV-000001 and INV-000072 (still
OPEN; an earlier note here said voided), both on two-location customers, so **neither was
backfilled** (a guess, and Pass 9's rule is report, never guess). The void fix is
`pendingAppliedCents: 0` in `voidInvoiceTx` plus a self-guarding one-shot UPDATE in
`payments-bootstrap.ts`, which squared nothing on the dev DB and squared the smoke test's forced
row. Not built: email delivery, engine-driven tax on manual invoices, a repair path for the two
location-less rows. **Restart `npm run dev:full` before manually testing - this pass changes
server code and a route.** Signatures and behavior are under "Shipped in Pass 10" in
`PLAN_BILLING_V1_1_EXECUTION.md`.

Roadmap (`docs/roadmap-v2`, 2026-09-19): `PLAN_ROADMAP_V2.md` classifies every owner note as done /
partial / absent against the code, records the notes that contradict D1-D9 with the owner's answers,
and sequences Phases 2-9 as passes 11a-38. Its recommended immediate order, as amended by the
owner's review of 2026-09-21: **11a → 11b (Invoice modal) → 11c (invoice document parties: Bill To
from the primary location, a Service Location block) → 11d (down payment on the first visit's
invoice) → 12 (Billing Plan required + sold-by) → 16 (ticket lockdown — a defect: the service-record
PATCH has no gate and a re-post un-finalizes a FINALIZED ticket) → 13 (Batch Invoice + Draft) → 14
(aging) → 25 (opportunity taxonomy) → 27 (cancel / reschedule)**. Each unscheduled item below now
carries a `[Roadmap: …]` pointer to the unit that owns it.

Pass 11a (`feature/phase-2-invoice-modal-core`, 2026-09-19, C2.1a) merged as PR #73. **The
Invoices screen is a list again and the invoice has a modal.** One new read, `GET /api/invoices/:id`
(the row, its lines with the ticket's status / service type / service date behind each, the
customer, the location and the visit - composed from `getInvoiceLineItems` and
`storage.getAppointment`, no new appointment route), feeds `InvoiceDetailDialog`
(`client/src/components/invoice-detail-dialog.tsx`): header with the derived status badge, sent
stamp and customer / location links; a visit block with "Open on schedule", or a line saying why
there is no visit (manual, schedule-driven, initial charge, one-off ticket); the lines table (type
badge - AGREEMENT_COVERED reads "Covered"); totals with paid / pending / balance; terms (billing
profile snapshot, tax reason, editable due date); applications with Release and Confirm gated as
the ledger panel; editable notes; the invoice's audit history through the History tab's renderer
(extracted to `audit-log-entry-card.tsx`). The footer follows the state: DRAFT has Preview / Issue
(409 → the prefinalization confirm) / Void; issued has Open PDF / Download / Mark Sent, Record
Payment, Apply location balance (only when the server suggests an amount), Issue credit memo
(`IssueCreditMemoDialog` is now exported and preselects the invoice), Void; VOID is read-only with
the void row shown. **Void follows the server**: offered on PAID too, behind a confirm that names
the applications it releases. The Invoices screen row is data plus open - customer and location are
links, no button, no quick action (owner) - and `/invoices?invoiceId=` deep-links into the modal.
No migration. Not built (11b): the per-line "Open ticket", the location tab's rows opening the
modal, `GET /api/invoices/by-appointment/:id`, `assign-location`. **Restart `npm run dev:full`
before manually testing - this pass adds a route, and the modal's layout has not been rendered by
anyone yet.** Signatures and behavior are under "Shipped in Pass 11a" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Pass 11b (`feature/phase-2-invoice-modal-reach`, 2026-09-20, C2.1b) merged as PR #74. **The
invoice modal reaches everywhere an invoice is named, and the ticket is one click from its line.**
The location's Invoices tab rows are data plus open (the same slim row as the Invoices screen; Record
Payment, Apply balance, Applications and the document buttons left the row for the modal) and
`/customers/:id?locationId=&tab=invoices&invoiceId=` deep-links into it, as does the Services tab's
Invoice column and the Service Details dialog. Every invoice line with a ticket behind it carries
"Open ticket", and Service Ticket Review reads `?recordId=` to open that ticket (once per id, the
queue's filters untouched, the parameter cleared on close). One new read,
`GET /api/invoices/by-appointment/:id` (`shared/invoice-detail.ts` `AppointmentInvoiceStatus`:
the visit's non-void invoice through either anchor, DRAFT included, plus `finalized` and the
unfinalized tickets - composed from the helpers Generate itself reads), feeds an **invoice badge**
in the review modal's header that opens the modal, or **Generate invoice** when the visit is
finalized and un-invoiced - the finalize prompt's "Later" case - through the prompt's own generate
route, then D4's apply-balance question. `POST /api/invoices/:id/assign-location` (new
`ASSIGN_INVOICE_LOCATION`, manager+, audit `update`) is the repair for the two location-less rows:
"Assign location" in the modal's header, the customer's locations only, refused once a location
exists (a repair, never a transfer). **Neither row was assigned - the owner picks.** No migration.
**Restart `npm run dev:full` before manually testing - this pass adds two routes and a permission,
and none of the new UI (the badge column, the slim rows, the assign dialog) has been rendered by
anyone yet.** Signatures and behavior are under "Shipped in Pass 11b" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Owner review of 2026-09-21 (`docs/owner-review-2026-09-21`, docs only, no code, merged as PR #75): two
items from the owner's live test on James Peterson (Home). **The invoice's Bill To prints the service location** -
`getInvoiceDocumentContext` falls back to the service location's live address when no billing
profile address was snapshotted, which is every invoice on the dev DB; canon says the primary
location / account, with a location override. And **a down payment set for technician collection is
its own invoice at agreement creation while the technician is shown $0.00 due** - D4's recorded
design, which the owner reversed: a down payment bills on the first visit's invoice, whoever
collects it, with the agreement card's explicit up-front button kept. The assessment (1a-1c, 2a-2c),
the answers and the one open flag (the three unissued `Daily Rodent Trapping` down payments) are
recorded under D4 in `PLAN_BILLING_V1_1.md` and in `PLAN_ROADMAP_V2.md` Part E; the work is two
passes inserted ahead of Pass 12, C2.1c (**11c**) and C2.1d (**11d**), specified in the Phase 2
table. Canon §13 is corrected in 11d's PR, with the code.

Pass 11c (`feature/phase-2-invoice-document-parties`, 2026-09-21, C2.1c) merged as PR #76.
**The invoice's parties are decided at issue and frozen.** `resolveInvoiceTermsForLocationTx` now
always writes `billingProfileSnapshot` when the invoice has a location - profile or not - and grows
it with `billTo { name, address, source }` and `serviceLocation { name, address }`; the source is
`PROFILE` (the profile's own `billingAddress`), `LOCATION_OVERRIDE` (a location-level profile with no
address bills that location's own address) or `PRIMARY_LOCATION` (no profile, or an account-level
profile with no address - the customer's primary location per canon §4 / §5, found by the small
`getPrimaryLocationTx` helper the pass added). The manual path (snapshot was hardcoded null) and the
schedule-driven path (an inline copy of the snapshot) both call the resolver now, so every issuing
path freezes the same thing. The document (`getInvoiceDocumentContext`) reads the keys and prints a
third block, **Service Location**, beside Remit To and Bill To in both the PDF and the HTML; the 64
pre-11c rows (45 with no snapshot, 19 with the profile-only shape) resolve at render by the same
rule - the snapshotted profile address if any, else the **primary** location's, never the service
location's - marked transitional. The invoice modal's Terms shows "Bill to <name>, <address>
(primary location)" and "Service location: …" from the shared reader. No migration; documents
already stored keep their bytes (§1.7), so the eight PDFs rendered before this pass still print the
service location as Bill To until the owner decides to re-render them. Not built: the wider document
redesign (owner: later), a screen that creates a billing profile or gives one an address (C5.2, Pass
34 - until then every new invoice on the dev DB bills the primary location), profile terms as the
manual invoice's default due date (left for C2.3). **Restart `npm run dev:full` before manually
testing - this pass changes server code and the document renderer, and the third block's layout has
not been rendered by anyone yet.** Signatures and behavior are under "Shipped in Pass 11c" at the end
of `PLAN_ROADMAP_V2.md` Part D.

Dev-setup chore (`chore/windows-node-lts-dev-setup`, 2026-09-21, no domain change) merged as PR #77.
Prompted by a new Windows machine on Node 24: `reusePort: true` in `httpServer.listen()`
threw `ENOTSUP` (Node 22.12+ no longer ignores it on Windows) - removed; `engines` (`>=22.12`) and
`.nvmrc` (24) added; README / DEV_NOTES / PROJECT_MAP now say Node 22/24 and the real first-boot
sequence. That sequence had never been run: **a fresh `npm run db:push` database could not boot**,
because the auth / agreement / settings bootstraps insert seed rows without `org_id` and relied on
`bootstrapTenancy()` - which ran after them - to have set the Heritage default, and tenancy's PK
swap on `app_settings` assumed the constraint name `app_settings_pkey` (push names it
`app_settings_org_id_key_pk`). `bootstrapTenancy()` now skips tables that do not exist yet,
inspects the PK's columns rather than its name, and is called once right after
`bootstrapOrganizations()` as well as in its old slot; all no-ops on the established DB. Verified:
`db:reset` → `db:push` → boot (zero bootstrap errors, seed ran, admin login and the main reads
answered) → boot again (no errors, every table's row count unchanged). The machine's dev DB is then
**the previous machine's, restored from a `pg_dump`** - 10 customers, 14 locations, 24 agreements,
66 invoices, 18 payments, 137 audit rows - so this file's history applies to it. Booting the pass's
code on the restored DB logged no bootstrap error and left all 43 tables' row counts unchanged
across a reboot, so the tenancy change is a no-op on an established database as well as a fresh one.
The dump / restore procedure, and the PowerShell UTF-16 trap that silently corrupts a dump taken
with `>`, are in `DEV_NOTES.md`. One correction to the Pass 10 note above: **INV-000001 and
INV-000072 are both VOID, and INV-000001 carries a location** - that note describes them as still
OPEN and location-less, which was true when Pass 10 shipped and is not true of this DB.

Pass 11d (`feature/phase-2-down-payment-first-visit`, 2026-09-22, C2.1d) merged as PR #78.
**A down payment bills on the first visit's invoice.** `createAgreement` issues nothing any more;
`buildVisitInvoiceLinesTx` appends, for each agreement behind the visit with a `DOWN_PAYMENT`, a
resolvable amount and no **live** `INITIAL_CHARGE` event (live = no invoice, i.e. settled outside
the ledger, or an invoice that is not VOID), an `INITIAL_CHARGE` line "Down payment - <agreement>"
after the service lines, taxed as the standalone path taxes it. Generation, issue and the explicit
up-front route attach the event to the invoice they issue (a draft previews the line and attaches
nothing), under a row lock on the agreement so two visits cannot both carry it; a voided carrier
invoice makes the event non-live, so the corrected invoice carries the line again and the event is
re-pointed, never duplicated. `getVisitBillingSummary` gains `charges` - the pending line priced
`BILLABLE` before invoicing, the invoice's own line after - counted in the totals and drawn on by COA
after the services, so the ticket, appointment details, collect step, review modal and dispatch
sheet all show the deposit as due, and a covered visit reads $0 covered plus the deposit, never "No
charge". `initialChargeCollectedBy` has its readers: `POST /api/appointments` and
`POST /api/agreements` return `initialChargeDue` when a down payment the office may collect is still
owed and no money designated to the agreement covers it, and the schedule screen's placement and the
agreement form open "Collect the $X down payment now?" → Record Payment with the designation and
amount preset (the money lands designated to the agreement and is offered first at invoicing); the
technician's surfaces carry a "Down payment $X" callout unless the office is the only collector, in
which case the collect step leaves it out of its default amount. The card's explicit button stays as
"Issue up front instead" (`GET .../initial-charge-status` replaces `.../initial-charge-invoice`)
and is refused once the charge is live anywhere. **Migration** (`agreement-bootstrap.ts`,
self-guarding one-shot, per-row report at boot): the three `Daily Rodent Trapping` deposits - never
issued, first visits already invoiced at $0 - are **settled outside the ledger** per the owner
(2026-09-22): an `INITIAL_CHARGE` event with no invoice each; the Wildlife Trapping Program deposit
(25% of $499, no visit yet) rides its first visit, as the owner chose. Canon §13 corrected in the
same PR. Not built: the batch-invoice preview's per-ticket amounts do not show a pending deposit that
generate will bill (C2.3), and a visit carrying two agreements' deposits prompts the office for the
first only. The owner's first render (2026-09-23) found the per-service block on the ticket and the
technician's appointment details saying "nothing due today / Due today $0.00" for a covered service
beside the callout's "$108.20 is due" - the service's own figure in the visit's vocabulary, and no
visit total on the ticket at all. Second commit: that block says "nothing due for the service
itself" and reconciles the two in one line ("This service $0.00 + down payment $108.20 = visit due
today $108.20"), and the duplicate "(covered by agreement)" suffix from Pass 7 is gone. **Restart
`npm run dev:full` now, not after the merge: the migration ran on the shared
dev DB during this pass's verification boot, and a server on pre-11d code still issues a deposit
invoice at agreement creation.** Signatures and behavior are under "Shipped in Pass 11d" at the end
of `PLAN_ROADMAP_V2.md` Part D.

Pass 12 (`feature/phase-2-billing-plan-required-sold-by`, 2026-09-23, C2.2) merged as PR #79.
**Every agreement carries a Billing Plan, and records who sold it.** `agreements.billingPlanId` is
NOT NULL: the route's zod refuses null and "", `buildAgreementInsertFromTemplate` refuses an
agreement that names no plan when its template carries none (template propagation untouched), and
the form's "No billing plan" option is gone. **Migration** (`agreement-bootstrap.ts`, keyed on the
column still being nullable, so it ran once and a `db:push` database skips it): the 11 plan-less
agreements were attached to **Monthly Recurring** on the owner's answer of 2026-09-19, each row's
effect under Pass 3.5's attach rules printed at boot before it was written - the 4 ACTIVE
`Quarterly Control` rows anchored on the boot's UTC day (**next billing 2026-09-24**; the elapsed
periods are never back-billed, so the nightly run bills each $33.33/mo from there to its term end),
the 5 CANCELLED `Quarterly Control` rows attached for the constraint only (no schedule; the DB has
5, the roadmap said 4), the 2 `Wildlife Trapping Program` rows refused by the term-end rule (terms
ended 2026-05-23 / 2026-05-30 - plan attached, nothing billed); no row hit the billing-events
refusal; the 9 marked "Legacy billing frequency" note lines Pass 9 wrote were deleted; then
`ALTER COLUMN billing_plan_id SET NOT NULL`. The snapshot builder moved to `shared/billing-plan.ts`
(`buildBillingPlanSnapshot`) so the migration and storage freeze the same shape. **Sale
attribution**: `agreements.soldByUserId`, a `users` FK, defaults to the session user at creation;
naming anyone else (or nobody) at creation, and any later change, needs the new
`ASSIGN_SALE_CREDIT` (manager+), and a change writes an audit `update` on a new `agreement` entity
(before / after carry the id and the user's name; the location History tab rolls agreements in).
The 25 existing rows are null - "Not recorded", never guessed from `createdByUserId`. Shown as a
"Sold by" selector on the agreement form (read-only below manager, defaulted to you) and a "Sold
by" cell on the agreement card. `technicians.userId` is the nullable bridge to the login (one
technician per user, a partial unique index), set from a "Linked user" selector on Settings →
Technicians, with each row naming its user; the full merge stays C5.7. New `GET /api/users`
(names, roles, status - never the hash). Canon §9 / §13 / §16 and D9 updated in the same PR. Not
built: a backfill of sold-by for the 25 pre-pass rows (the owner assigns from the form), audit rows
for any other agreement edit (C5.1a), a required plan on templates (a template without one just
makes the office pick on each agreement; its selector now says so). **Restart `npm run dev:full`
now, not after the merge: the migration ran on the shared dev DB during this pass's verification
boot, and a server on pre-Pass-12 code still lets the form send a plan-less agreement, which the
database now refuses.** Signatures and behavior are under "Shipped in Pass 12" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Pass 16 (`feature/phase-3-ticket-lockdown`, 2026-09-23, C3.1) merged as PR #81.
**Ticket lockdown (D9) is enforced server-side.** A defect fix, not a feature: `PATCH
/api/service-records/:id` had no permission gate and no status guard, and a re-post through
`completeService` overwrote a FINALIZED ticket and un-finalized it. Now the PATCH is gated by a
new **`EDIT_TICKET`** (support+) and takes the ticket's **content only** - service date,
technician, notes, target pests, areas, conditions, recommendations, follow-up, signature, and
materials as replace-all when sent - through a strict zod object, so a lifecycle column
(`confirmed`, `ticketStatus`, the stamps, `readyForBilling`) or an identity column is a 400, never
a silent write; a FINALIZED ticket answers 409 `TICKET_FINALIZED` ("reopen first"); an edit that
changes nothing writes nothing (Pass 8's rule); one that does writes **`ticket_edited`** (a new
`AuditAction`) with the ticket row plus its product applications before and after, the materials
snapshotted as content without ids so an unchanged list compares equal; a technician change
re-copies the name and license from the new profile and follows onto
`services.assignedTechnicianId`; and the Service's own status is no longer touched (the old path
flipped it COMPLETED on `confirmed` - a completion without finalization). `completeService`
refuses a re-post over a FINALIZED ticket for everyone (409) and over a ticket in office review
(OFFICE_REVIEW_PENDING or FLAGGED_FOR_REVIEW) unless the caller holds `EDIT_TICKET` (403
`TICKET_IN_REVIEW`: the office reopens, the technician re-posts the REOPENED ticket), checked
before the Service's price or type is touched; every accepted re-post over an existing record -
the technician's on a REOPENED one, the office's on one in review - writes `ticket_edited` too, so
a ticket's History reads reopened, edited, finalized in order. The rules live in one shared
module, **`shared/ticket-status.ts`** (`isTicketFinalized`, `isTicketInOfficeReview`,
`isTicketReopened`, `technicianMayPostTicket`, `describeTicketLifecycle`), read by the server and
the technician view alike. **"Finalized" is any of the three signals** finalize sets and reopen
clears - `ticketStatus = FINALIZED`, `confirmed`, `readyForBilling` - which is also what covers
the **10 legacy rows** on the dev DB carrying `confirmed = true` under `OFFICE_REVIEW_PENDING` (the
old Service History Confirm): they already read as finalized on the Services tab and the review
modal, the PATCH and a re-post now say "reopen first", and reopen clears them (verified on a
simulated row); no migration, by design. **The Service History "Confirm" button is gone** (dev
behavior rule 6): it was `PATCH { confirmed: true }`, the pre-Phase-1 completion that marked a
Service COMPLETED with no finalization, no invoicing moment and no audit row; each card now shows
the ticket's real lifecycle badge (Pending review / Flagged for review / Reopened / Finalized)
and a **Review ticket** / **Open ticket** link into Service Ticket Review (`?recordId=`, Pass
11b), where Finalize and Reopen live - no third finalize surface was built. The technician view's
button reads the shared predicate (Create / Resume Service Ticket, Edit Reopened Ticket, and the
disabled Ticket in Office Review / Ticket Finalized), and the ticket dialog is handed a record
only when it is REOPENED - a posted or finalized record is never passed. Not on the PATCH: the
Service's price and type (an office price edit is C3.1b's, with `ADJUST_PRICE_AGREEMENT`), and
`POST /api/service-records` (the Service History page's direct create) is untouched. No schema
change, no migration. **Restart `npm run dev:full` before manually testing - this pass changes
server code and a route's gate; the badge and link on Service History and the technician view's
relabelled button have not been rendered by anyone yet.** Signatures and behavior are under
"Shipped in Pass 16" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 13 (`feature/phase-2-batch-invoice-and-draft`, 2026-09-24, C2.3) merged as PR #82.
**Batch Invoice lives on the Invoices screen, New Invoice is gone, and the manual invoice is "Add
fee / adjustment" on the location's ledger.** The batch is an invoicing action, so it left the
Service Ticket Review queue (button, dialog, queries and types removed; the queue's own filters
untouched) for a dialog on the Invoices screen (`BatchInvoiceDialog`): "Posted from" / "Posted to"
(the last 30 days by default) and a Technician selector (all technicians by default), with the copy
saying **posted between** - the server has always filtered `postedAt` falling back to
`serviceDate`, and now says so. The preview groups by **technician, then service date, then
visit** (a "route" is a technician on a day; appointments carry no route columns), each visit
listing its tickets (amount / Covered / Callback / Cannot bill) and, new, the **down payment
generate will bill** - Pass 11d's INITIAL_CHARGE line, resolved read-only through
`resolvePendingInitialChargesTx` for the agreements behind every finalized ticket of the visit and
listed once per agreement on the first visit in the batch that would carry it; the old preview was
silent about it. The technician filter goes to both `GET /api/invoices/batch-preview` and
`POST /api/invoices/batch-generate` (`technicianId`, optional; the two parse one
`BatchInvoiceFilters`), and it picks **visits**: a visit with one of that technician's tickets in
the window is in, and once in it bills every finalized ticket on it, whoever posted them - the
range boundary's existing rule. Generate's result rows (number, customer, total) open the invoice
modal; Send All stays (`SEND_INVOICE`, still the `sentAt` stamp plus the pinned PDF). The batch's
shapes and the grouping are one shared module, `shared/batch-invoice.ts`
(`groupBatchInvoicePreview`, pure, exercised by the smoke test); the preview route answers
`{ tickets, charges }` now instead of an array, and its only client was the dialog this pass
removed. **New Invoice is removed** (owner, B6, answered twice on 2026-09-19): the screen's header
carries **"Draft invoice for a visit"** instead - customer → location (primary by default) → that
location's draftable visits (the Services tab's rule: scheduled or in progress, an active service,
no non-void invoice; a finalized visit belongs to Ready to Bill) → Pass 4's
`draft-for-appointment` route, the DRAFT opening in the modal, the server still refusing a
cancelled or invoiced visit and returning the existing draft rather than a second. The manual
invoice (one ADJUSTMENT line, no service behind it) survives only as **"Add fee / adjustment"** on
the location ledger panel's Balance card, beside Record Payment and Issue Credit Memo, where the
location is already known: description (required), amount, tax (typed, not computed), due date,
notes, through the unchanged `POST /api/invoices` (`GENERATE_INVOICE`; the location still
required, Pass 10) - and a **blank due date now defaults from the location's billing terms**
(`createManualInvoice` falls back to `resolveInvoiceTermsForLocationTx`'s due date; null when no
profile resolves, which is every location on the dev DB until C5.2), the default Pass 11c left for
C2.3; the dialog's hint reads the resolved profile and says which. `LocationLedgerPanel` takes
`customerId` (required) and `onOpenInvoice`, which the customer screen passes. No schema change,
no migration. Also this pass, at the owner's request (2026-09-24): **every pass ends by opening its
PR** after the push (`gh pr create`; the owner merges), recorded in `AGENT_WORKING_AGREEMENT.md`,
`CLAUDE.md` and `DEV_NOTES.md` - everything else in the working agreement is unchanged. Not
built: paging the preview, excluding one visit from a batch, delivery, a draft for a service with no
appointment (no anchor, Pass 4's limit). **Restart `npm run dev:full` before manually testing -
this pass changes server code and two routes' inputs, and the three dialogs and the ledger panel's
third button have not been rendered by anyone yet.** Signatures and behavior are under "Shipped in
Pass 13" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 14 (`feature/phase-2-aging-and-balances`, 2026-09-24, C2.4) merged as PR #83.
**Aging and balances on the customer screen - derived, never stored.** Two reads compute the
aging at request time from the ledger's stored rollups (D5) and the unapplied pool the location
switcher already reads: `GET /api/customers/:id/aging` (per location plus the rollup) and
`GET /api/reports/aging` (org-wide, per customer and per location) - the same figures summed, so
the two cannot disagree. Buckets are **Current (0-30) / 31-60 / 61-90 / Over 90 days since
invoiced** (B20, owner 2026-09-19): whole UTC calendar days from `issuedAt`, never days past due;
the Invoices screen's Overdue tile keeps its due-date meaning and every surface says "days since
invoiced". What ages is an issued invoice with a balance (`isInvoiceIssued` - a DRAFT or VOID owes
nothing - and `balanceDueCents > 0`, so a PAID row drops out); an invoice with no location (the
legacy manual rows) lands under its customer with `locationId` null rather than vanishing. Beside
the aged balance, never netted: money on account (confirmed payments and issued credit memos with
value left to apply, at the location, D4), pending money applied to the aged invoices
(`pendingAppliedCents`, "pending shows, confirmed counts") and pending money recorded but not yet
applied. The customer-wide figure is a rollup; the balance still lives at the location (canon rule
1). The bucketing, the day arithmetic, the rollup and the ordering are one pure shared module,
`shared/aging.ts` (`summarizeAgingByLocation`, `rollupAging`; exercised directly by the pass's
unit script), read by storage (`getCustomerAging`, `getAgingReport`) and the client. Customer
screen: the header card's chip row, beside the primary-location chip, carries Open $X across all
locations, Oldest: <bucket> days since invoiced, $Y on account and $Z pending confirmation
(`CustomerAgingChips`); the location profile's right column carries the location's **Balance**
strip below `LocationNotesPanel` (`LocationAgingStrip`): the four bucket rows with the invoices
behind each as buttons that open the invoice modal (`openInvoice`, Pass 11b's URL), on account and
pending beneath. Reports: an **Aging** section fed by `/api/reports/aging` - bucket tiles and a
table of customers with their locations, every row a link to the customer screen
(`/customers/:id` and `?locationId=`), a totals row; the five existing cards untouched (the page
has no tabs, so a section rather than the roadmap row's "tab"). **Gate: both reads are open to any
authenticated role**, like every read in `server/routes.ts` and specifically like
`/api/location-balances/:customerId`, `/api/locations/:id/ledger-summary` and `GET /api/invoices`,
which already hand every role the same open and on-account figures: a gate would 403 the header
while the switcher one inch below still says "Open $X", the RBAC matrix (PLAN_BILLING_V1.md 0.3)
gates cost / margin / LTV and not receivables, and a real read gate is C5.6's role profiles.
`invalidateInvoiceViews` refreshes both reads with the ledger. No schema change, no migration,
nothing stored. Not built: due-date aging (B20's later Settings toggle for Net-terms accounts), an
`asOf` parameter, aging by technician (V1 §1.4's "by tech"), statements (C2.5). **Restart
`npm run dev:full` before manually testing - this pass changes server code, and the header chips,
the strip and the Reports section have not been rendered by anyone yet.** Signatures and behavior
are under "Shipped in Pass 14" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 25 (`feature/phase-4-opportunity-taxonomy`, 2026-09-24, C4.1) merged as PR #84.
**Opportunity taxonomy, assignee and search.** Two axes on every opportunity, as D8 and B7
decided: `categoryKey` is the reason - a key of the new settings-managed `opportunity_categories`
list, seeded per org with NEW_SALE / SERVICE_DUE / RESCHEDULE / WINBACK / RETENTION and no others
(owner, second review of 2026-09-19; Settings edits label, order and active; nothing creates or
deletes a key, and POST / DELETE on the list answer 405) - and `workType` is AGREEMENT | ONE_TIME.
Both are stamped at creation from `source` by one shared function (`shared/opportunities.ts`
`taxonomyForSource`), read by the four runtime writers in storage and by the bootstrap's backfill,
so a migrated row and a new row of the same source cannot disagree: AGREEMENT_CONTACT_REQUIRED ->
SERVICE_DUE / AGREEMENT, AGREEMENT_INITIAL -> NEW_SALE / AGREEMENT, AGREEMENT_CANCELLATION_RETENTION
-> RETENTION / AGREEMENT, the two APPOINTMENT_ sources -> RESCHEDULE with the work type from the
source service's agreement, NON_CONTRACT_FOLLOW_UP -> SERVICE_DUE / ONE_TIME; WINBACK has no
automatic source until Pass 27's cancel flow and is chosen by hand (the category chip on the
Opportunities screen is a picker). The migration (`service-scheduling-bootstrap.ts`, guarded,
per-row effect printed before the write) seeded the 5 categories, mapped the 16 dev rows (4
RETENTION / AGREEMENT; 8 RESCHEDULE, 3 of them AGREEMENT and 5 ONE_TIME; 4 SERVICE_DUE /
ONE_TIME), made both columns NOT NULL and gave `assigned_user_id` its `users` FK;
`opportunityType` stays the display label, transitional. The assignee uses the existing
`assigned_user_id` / `assigned_at` pair (April 2026, no reader until now): `PATCH
/api/opportunities/:id` is narrowed to a strict content schema (notes, the two dates, the two
axes, the assignee - the loose `insertOpportunitySchema.partial()` that let any client write
identity and lifecycle columns is gone, the Pass 16 pattern), the assignee must be an active user
of the org or null, `assignedAt` is stamped on every change (null when unassigned), and every
assignee / category / work-type change writes an audit `update` on the new `opportunity` entity
with the users named before and after (the location History tab lists them). **The gate:
`ASSIGN_OPPORTUNITY`, support+** - a changed assignee needs it (an unchanged one sent back by a
form is not an assignment, the Pass 12 sold-by rule), a technician gets 403 even assigning to
themselves, and reads stay open to every role like every read in `routes.ts`; the reasoning is in
the shipped record. The list read gains categoryKey, workType, assignee (a user id, `me` resolved
by the route, or `unassigned`), source, a zip prefix and a location / customer text search, all
applied in SQL like `listPayments`. Opportunities screen: those filters, a **My Opportunities**
preset, category / work type / source / assignee chips on every card (the category and work-type
chips are pickers), and an assign Select (Unassigned, Me, then everyone active) disabled - not
hidden - without the permission; the location's Opportunities tab shows the chips; Settings gains
an Opportunity Categories card beside Dispositions. Found on the way: AGREEMENT_INITIAL is an
appointments / services source that no writer puts on an opportunity - the mapping carries it for
completeness and the dev DB has no such row. Not built: auto-assignment rules and zones (Pass 26),
the board's cancel / reschedule path (Pass 27), dispositions, convert, sale attribution, aging.
**Restart `npm run dev:full` before manually testing - this pass changes server code and the
schema, and the chips, the filters, the assign control and the Settings card have not been
rendered by anyone yet.** Signatures and behavior are under "Shipped in Pass 25" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Pass 27 (`feature/phase-4-cancel-reschedule`, 2026-09-25, C4.2) merged as PR #85.
**Cancel and Reschedule, one path.** One `POST /api/appointments/:id/disposition { mode: CANCEL |
RESCHEDULE, reasonCode?, notes?, opportunity: UPDATE_EXISTING | CREATE | NONE, voidDraftInvoices? }`
on a new `dispositionAppointment` (grown from the technician's
`requestAppointmentCancelOrReschedule`, which is gone): both modes write the D1a shape - CANCELED,
the flag (true for a reschedule), the reason (required for CANCEL and refused unless on the
settings list, optional for RESCHEDULE), the actor's label - share the Q3 draft prompt and write
one audit row on the new `appointment` entity (`appointment_cancelled` /
`appointment_rescheduled`, the appointment and its services before and after, the actor). RESCHEDULE
returns every service to the queue with its dates kept, no reason, and from the board no
opportunity; CANCEL recycles agreement services with due date and window reset from today by the
agreement's `serviceWindowDays`, cancels one-time services, and runs the opportunity choice per
touched service (UPDATE_EXISTING re-dates every open opportunity on the service or creates one
when none is open; CREATE inserts; NONE nothing) with the category by path through a seventh
source: a requeued service is RESCHEDULE / by agreement, a cancelled one-time service is
`APPOINTMENT_CANCELLATION_WINBACK` -> WINBACK / ONE_TIME, so `taxonomyForSource` stays the one
mapping. The technician's route is a thin alias with origin FIELD - a handoff (canon §9): every
service returns to the queue whatever the mode, the office-handoff opportunity is re-dated or
created; its dialog is unchanged. The status PATCH to CANCELED answers 409
`CANCEL_DISPOSITION_REQUIRED` (in storage, so no path cancels through the generic update); the
dispatch sheet's status select drops CANCELED (a cancelled placement shows its state read-only)
and "Cancel Service" is now **Cancel appointment** (reason from the list, notes, the opportunity
radios defaulting to Update existing when one is open on the visit's services) and **Reschedule**
(a confirm); board moves ask "Move to <technician>, <day time>?" before writing. The location's
Services tab tells Scheduled / Pending scheduling / Rescheduling / Cancelled apart through
`resolveServiceScheduleState` (`shared/appointment-disposition.ts`) and a new
`services.lastAppointmentId` - the placement a service was last taken off, set on every service a
disposition touches, since a requeued sibling on a multi-service visit had no other link back;
the migration adds the column, index and FK and backfills only representatives (none on the dev
DB), printed per row. Found on the way and fixed: the generic update's service sync set every
linked service SCHEDULED for any status but CANCELED (a completed visit's finalized services
included) and re-linked a representative placed elsewhere; it is now a no-op for CANCELED and
COMPLETED appointments. Skipped, never touched: a COMPLETED or CANCELLED service and a
representative placed on another visit. Not built: service-level cancel (C4.3a), an appointment
cancellation policy (Phase 9), a permission on the disposition (C5.6), un-cancelling from the
sheet, Pass 26. **Restart `npm run dev:full` before manually testing - this pass changes server
code and the schema, and the two dialogs, the move confirmation, the read-only cancelled state and
the Services-tab badges have not been rendered by anyone yet.** Signatures and behavior are under
"Shipped in Pass 27" at the end of `PLAN_ROADMAP_V2.md` Part D. **Owner's live test,
2026-09-25, before merge** (Part E of the roadmap; docs updated on this branch, no code changed):
(1) a cancelled or rescheduled placement must leave the board so the slot is free - the Services
and History tabs keep the record - and (4) both dialogs must close when the disposition completes
(the sheet resets its dialog state only while an appointment is set) - both defects, **Pass 27b**;
(2) an agreement service returning to the queue on CANCEL and (3) its opportunity reading
CONVERTED once the recycled service was placed again both pass as the agreement path's rules;
(5) cancelling a `PENDING_SCHEDULING` service without placing it first is added to C4.3a
(Pass 28), the queue's details link stays C5.4 (Pass 36).

Pass 27b (`feature/phase-4-cancel-reschedule-review`, 2026-09-25, C4.2b) merged as PR #86.
**Cancel and Reschedule, owner review: the two defects.** (1) A CANCELED placement leaves the
dispatch board, cancelled and rescheduled alike: one shared predicate, `isBoardPlacement()` in
`shared/appointment-disposition.ts` (false for CANCELED whatever the flag), applied once in
`schedule.tsx` where the board's list is derived, so the viewport, the slot map, the analytics
(Jobs in View, Scheduled Revenue, per technician) and the card selection all read one list and
cannot disagree; the slot is free, and the location's Services tab ("Was <date>", the reason) and
History tab keep the record. The read (`GET /api/appointments`) is unchanged - the dashboard, the
Reports page, Service Ticket Review and the Services tab's by-location read still need the row -
so the filter is the board's, not the server's. The sheet's read-only "cancelled" state became
unreachable (the sheet resolves its appointment through the predicate) and was removed rather than
left dead; the status select is always offered and Save always sends it (CANCELED through the
generic update still answers 409). A `?appointmentId=` deep link to a placement that has left the
board (an invoice's "Open on schedule", a payment's visit link) toasts its state and clears the
selection. (2) The Cancel appointment and Reschedule dialogs close when the disposition completes:
their state (mode, reason, notes, choice) resets in its own effect keyed on the appointment's id,
null included - one mechanism - instead of inside the form reset that returned early on null;
keyed on the id so a refetch of the same placement cannot close a dialog mid-edit. (3) Finding 3
re-verified with a fresh agreement service and a fresh one-time service through the real routes:
the opportunity a CANCEL creates is OPEN and on the Opportunities screen's default list until the
recycled agreement service is placed again, when placement converts it with the "Rescheduled"
disposition (filterable under CONVERTED); the one-time service's WINBACK row is converted by
nothing. The rule: placement converts the open reschedule / cancel-review opportunities of the
service it places; nothing else does. No schema change, no migration, no server code. Not
touched: the disposition, the technician alias, the Services tab, cancelling a pending service
outright (C4.3a, Pass 28), the queue's details link (C5.4). **No restart of `npm run dev:full` is
needed - no server code changed, and Vite serves the new board module to the running client - but
the board without its red cards, the two dialogs closing on completion and the deep-link toast have
not been rendered by anyone: the repo has no browser automation and the session had no browser.**
Signatures and behavior are under "Shipped in Pass 27b" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 15 (`feature/phase-2-statements`, 2026-09-25, C2.5) merged as PR #87.
**Statements.** Three customer-facing documents through the invoice document's pattern - storage
assembles the context, the renderer is pure and byte-deterministic, the bytes are stored - all on
request, none on a schedule. A **location statement** (`POST /api/locations/:id/statements
{ periodFrom, periodTo }`, two inclusive UTC days like every other date-only value): the opening
balance (invoices issued before the period less the confirmed applications and credits made
before it), the period's lines in date order (invoices issued; payments and credit memos applied
- a confirmed payment counts, a pending one shows and is marked; money received but not applied
is an on-account line that moves nothing; refunds), the closing balance = opening + charges -
credits, and the aging strip as of the period's end derived from the same rows cut off there - so
for a period ending today the closing balance equals the ledger summary's open balance and the
strip equals the customer aging read's entry, which the smoke test holds it to. An **account
statement** (`POST /api/customers/:id/statements`): one section per location, primary first, a
trailing section for issued invoices with no location when any exist, the figures summed and
`rollupAging` for the strip - keyed on the **customer**, as the aging rollup is: the canonical
Account has no screen and no read of its own and selects the same rows, and the customer header
is the surface. A **paid-in-full letter** (`POST /api/locations/:id/zero-balance-letter`) as of
today: the zero balance, any money on account or awaiting confirmation, the invoices to date, and
the location's agreements with their status, active first (the home-sale case) - **refused with
409 `LOCATION_HAS_BALANCE`** naming the balance while the location owes anything (a letter that
says "you owe $X" is a balance-due statement, and the office generates a location statement for
that); pending money applied to an open invoice does not clear it. The balance model is the
ledger's (D4 / D5), not a customer-account one: the balance is what is owed on issued invoices, it
moves when money is applied and confirmed, money on account is shown beside it and never netted,
and a DRAFT, a VOID, a released application and a payment recorded in error do not appear;
statuses are as of generation, dates place the rows. The arithmetic is one pure shared module,
`shared/statements.ts` (`summarizeLocationStatement`, `summarizeAccountStatement`,
`buildZeroBalanceLetter`, `zeroBalanceLetterRefusal`; 60 checks drive it directly); the
document is `server/documents/statement-pdf.ts` (pdfkit, dates pinned to the statement date, a
paginating table helper; no HTML twin - `renderInvoiceHtml` has no consumer). **Storage**: a
statement's identity is a small nullable column set on `documents` (`statement_variant`,
`customer_id`, `location_id`, `period_from`, `period_to`, `generated_by_user_id`,
`generated_by_label`) rather than a second table - the same org / hash / bytes / created-at
columns serve both kinds, the list reads are one query, and the columns are null on an INVOICE row
exactly as `invoice_id` is null on a statement; one row per generation, never re-rendered in
place (a second request over an unmoved ledger is a second, byte-identical row - the hash proves
it); the migration (`document-bootstrap.ts`, guarded on the first column, `IF NOT EXISTS`
throughout) printed its effect once on the dev DB (11 INVOICE rows untouched, nothing backfilled)
and nothing on the second boot. **Routes**: the three generates under `GENERATE_INVOICE`
(support+ - a statement is the office's customer-facing billing document, the same act as Add fee
/ adjustment, and no closer permission exists; the technician is 403), list reads per location and
per customer, an info read, and the bytes read (`GET /api/statements/:id/document`, inline,
`?download=1` for an attachment named statement- / account-statement- / paid-in-full-letter-
<day>.pdf), all open like every document read. **Client**: a **Statement** button on the location
Invoices tab's Balance card (location statement or paid-in-full letter, in `StatementDialog`, the
period month to date by default) and beside Add Location in the customer header (the account
statement across every location), the generated figures shown with Open PDF / Download
(`StatementDocumentActions`, the invoice pattern minus Mark Sent - a statement has no sent stamp
until delivery arrives), and a **Statements** card on the Invoices tab listing the location's
stored statements and the account-wide ones that cover it. Not built: delivery (C6.3), a scheduled
monthly statement (a later Settings toggle), a preview that stores nothing, per-invoice line detail
(the first line's description and "+N more"), due-date aging. **Restart `npm run dev:full` before
manually testing - this pass adds routes and a migration (the migration already ran on the shared
dev DB during this pass's verification boot; a server on the old code neither reads nor needs the
new columns), and the two Statement buttons, the dialog, the Statements card and the three PDFs'
layout have not been rendered by anyone: the repo has no browser automation and the session had
no browser.** Signatures and behavior are under "Shipped in Pass 15" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Pass 15b (`feature/phase-2-aging-strip-placement`, 2026-09-25, owner's note after Pass 15 merged)
pushed, awaiting merge. **The location balance rides inside the Location Notes box.** The owner's
note: Pass 14's aging strip under the notes took too much vertical space. Now the notes box
carries one horizontal row directly below the notes (`LocationAgingSummaryRow` in
`aging-strip.tsx`, passed as the notes panel's `footer`): the open balance, then Current always
and the other buckets only when something is owed in them, then on account and pending when
non-zero, with "days since invoiced" as the caption - no invoice links. The full strip with the
invoices behind each bucket (`LocationAgingStrip`, now titled "Balance by days since invoiced")
moved to the Invoices tab, under the ledger panel's Balance card and above the invoice rows, so
the links live where invoices are. Same read, no server change, no migration. **Not rendered by
anyone - the row's wrapping inside the notes box reaches the owner first.**

Next up: **Pass 17** — the reopen-reason pop-up (`PLAN_ROADMAP_V2.md` Phase 3 table, C3.2; D9's
"pop-up with settings-configured dropdown; Other requires text, role-gated", unscheduled since Pass
7.6): a settings list `ticket_reopen_reasons` in the `app_settings` shape of
`appointment_cancel_reschedule_reasons`, `reopenReasonCode` + text on the ticket, "Other"
requiring text and a new `REOPEN_TICKET_OTHER` (manager+), the inline textarea leaving the review
modal for a pop-up, and the modal closing on Finalize when the queue is exhausted. The recommended
immediate order is exhausted with Pass 15; the rest runs in phase order (Pass 17 → 18 → ..., with
Pass 26 (C4.1b) and Pass 28 (C4.3a) in Phase 4's turn). Branch from `origin/main` after confirming
it contains Pass 15b's merge. The handoff prompt for Pass 17 is the last section of this file; the
Pass 17 session writes Pass 18's (the C3.1b row carries the spec).

Phase 1's ordered plan, impact analysis, conflict resolutions, and per-pass verification steps live in
`PLAN_BILLING_V1_1_EXECUTION.md` — read it when a pass builds on a Phase 1 helper (its "Shipped in
Pass N" sections are the signatures). Update the roadmap's pass table and this file when a pass
finishes, and replace the handoff prompt at the end of this file with the next pass's (the
working agreement's end-of-pass step, owner, 2026-09-23). This file tracks the "where are we"
pointer and that prompt.

## Reference documents, in reading order
1. `AGENT_WORKING_AGREEMENT.md` — how a session works here (one pass, one branch, when to stop)
2. `CANONICAL_DOMAIN_RULES_V1.md` — canonical domain model; measure any change against this
3. `PLAN_BILLING_V1_1.md` — the settled decision record (D1-D9); governs over any older billing doc
4. `PLAN_BILLING_V1_1_EXECUTION.md` — the ordered, impact-analyzed execution plan for D1-D9
5. `PLAN_ROADMAP_V2.md` — Phases 2-9 pass by pass, the owner's recorded decisions, the next pass's spec
6. This file — current status pointer, and the handoff prompt for the next session as its last section

## Constraints (apply to every pass below)
- Finalization remains the authoritative completion event. Pre-finalization invoices are DRAFT-only;
  issuing early requires `ISSUE_INVOICE_PREFINALIZATION` (Manager+) and flags the ticket.
- Agreement revenue comes only from the nightly billing run **for plans the run actually bills**
  (`isScheduleBilledPlan()`); those services appear on visit invoices at $0 billable. Every other plan
  — COD/per-service, charge-at-start, installment — makes the visit the billing event and the line
  carries a real amount; every agreement carries a plan since Pass 12. Never emit service-driven
  billing events for agreement work either way.
- Price is never mutated by COA, deposits, or applications. Status fields derive from amounts and are
  never hand-set.
- Payments, applications, credit memos, and audit logs are append-only. Corrections are new records
  (void + re-entry, credit memo, forward revert), never edits or deletions.
- All money integer cents; all tables org-scoped; no route trusts a client-supplied actor.
- Not in this phase, each now owned by a roadmap unit (`PLAN_ROADMAP_V2.md`): Stripe/card
  processing (roadmap Phase 6 — "Phase 2" in older notes), QBO sync (Phase 9), preferred / excluded
  technician (Pass 30, C4.4), proposal generator (Phase 9). The tech payment-collection UI relabel
  that used to sit in this list shipped as Pass 7.5, the opportunity taxonomy migration as Pass 25
  (C4.1), and the reschedule-to-queue action with the Services-tab
  PENDING_SCHEDULING-vs-SCHEDULED display clarity as Pass 27 (C4.2).
- Also not in this phase, each documented where it belongs rather than scheduled here. The first two
  are the ones that gate real use of the billing engine:
  - ~~**Attach a Billing Plan to an Agreement (UI).**~~ **Done — Pass 3.5**, pushed as
    `feature/phase-1-agreement-billing-plan-selector`. Both forms now carry a real plan selector, and
    plan-attachment-on-update sets the billing schedule instead of silently doing nothing. This
    unblocks D9's column drop and the required-field work below, and clears the sequencing constraint
    that Pass 5 (D2) could not land before it.
  - ~~**Open / download / send an invoice document.**~~ **Done — Pass 10**, pushed as
    `feature/phase-1-invoice-document-and-location`. Open PDF / Download / Mark Sent on every
    invoice row of the Invoices screen and the location Invoices tab, from one component; Mark Sent
    pins the stored PDF. Still no email delivery: "send" is the `sentAt` stamp, the button says so,
    and the office delivers the PDF itself.
  - ~~**Manual invoices must carry a location.**~~ **Done — Pass 10**, same branch: a required
    Location selector on New Invoice (the customer's locations, defaulting to the primary) and the
    server refusing a manual invoice without one or with another customer's; the path also writes
    `invoice_issued` now. The two pre-existing location-less rows were **not** backfilled:
    INV-000001 (Sarah Chen) and INV-000072 (Alex Jones - still OPEN, not voided as this entry once
    said) each belong to a two-location customer, so a backfill would be a guess. They show "No
    location" on the Invoices screen with Record Payment disabled. **The repair exists since Pass
    11b**: open either in the invoice modal as a manager and use "Assign location"; the pass
    assigned neither, since which location is the owner's call.
  - ~~**Billing Plan required on every Agreement**~~ **Done — Pass 12** (`feature/phase-2-billing-plan-required-sold-by`,
    2026-09-23): all 11 attached to Monthly Recurring, `billingPlanId NOT NULL` + zod, sale attribution
    (`soldByUserId`, `ASSIGN_SALE_CREDIT`) and the `technicians.userId` bridge riding along. As it was
    specified: backfill the 11 plan-less agreements, then
    `billingPlanId NOT NULL` + zod. **Unblocked by Pass 3.5**: the creation UI, template propagation,
    and plan-attachment-on-update all exist now, so what remains is the backfill and the constraint.
    Until then a plan-less agreement bills COD per visit. D9's column drop (Pass 9, 2026-09-16)
    reported the same 11 rows without assigning anything: the 9 `Quarterly Control` agreements
    carry their old free-text `"Monthly"` in `notes` (a marked line; **the owner answered
    2026-09-19: attach the Monthly Recurring billing plan to all 11**, the 2 Wildlife rows included —
    delete the line once the plan is attached); the 2 `Wildlife Trapping Program` agreements never
    had any billing data and sit past their term end, so the attach rule starts no schedule for them. **Carry sale attribution with it** — a sold-by reference on the agreement,
    assignable to any user and role-gated — per the compensation entry below: same form, same zod,
    same propagation path, and it is basis that cannot be reconstructed later.
  - **Service designation + callback attribution** `[Roadmap: Pass 24, C3.7]` — `ServiceType.category`
    (`CALLBACK | PRODUCTION | SERVICE`) in Settings, instance designation on Service, and a required
    link from a callback to the Service it answers. See `CANONICAL_DOMAIN_RULES_V1.md` §10. More
    urgent than it first looked: because every agreement is currently plan-less (above), the
    slot-counter proxy can charge a customer for a warranty callback performed inside the service
    interval.
  - **Service-level cancel / return-to-queue** `[Roadmap: Pass 28, C4.3a]` — cancelling or rescheduling ONE service on a
    multi-service appointment. Only the appointment-wide path exists: since Pass 27 the dispatch
    sheet's buttons are **Cancel appointment** and **Reschedule** and act on the whole visit, as they
    say (the "Cancel Service" wording that cancelled the whole appointment is gone), and the
    disposition skips a COMPLETED or CANCELLED service but still requeues one with a posted,
    unfinalized ticket. Note that once a ticket is posted, remaining services on that appointment
    can be cancelled without disturbing the invoice.
  - ~~**Move Batch Invoice from Service Ticket Review to the Invoices screen**~~ **Done — Pass 13**
    (`feature/phase-2-batch-invoice-and-draft`, 2026-09-24): it is an invoicing action, and it now sits on
    the Invoices screen with its range labelled "posted between", grouped by technician then service
    date, the technician filter on preview and generate, and the down payment generate will bill shown
    in the preview.
  - **Field surcharge line.** `[Roadmap: Pass 23, C3.6]` Owner-specified 2026-09-13 in the Pass 5.5 review. A cleanout surcharge
    is not a term of the sale: the technician charges it at the initial service for what could not be
    seen at scheduling (larger home, conducive conditions), and it is *in addition to* the contract
    price, unlike a down payment. Build: (1) a SURCHARGE line the technician adds on the ticket, with
    an amount, flowing onto the visit invoice as a `SURCHARGE` line item; (2) an allow/reject toggle
    on the **agreement template** — today `fieldAddableSurcharge` sits on the billing plan and has no
    reader anywhere; (3) the SURCHARGE production credit keyed off that recorded line and gated by
    the technician's comp-plan surcharge selector (compensation entry below), deleting
    `createSurchargeEntryIfConfigured()`'s collector inference; (4) `CLEANOUT_SURCHARGE` and
    `PREPAY_FULL` leave `INITIAL_CHARGE_TYPES` (paid-in-full is a `PREPAID_TERM` plan), leaving
    `DOWN_PAYMENT`, with the `Quarterly Control` template and `Unit 15 Ledger Test` cleanout defaults
    migrated or dropped. Sequence after Pass 6, since the line is an invoice line and the credit wants
    the payments ledger's collection record. Whether the *comp* for that line is production or
    commission is a comp-plan question (§1.6.2), not this unit's.
  - **Technician ticket modal — owner notes (2026-09-16, after Pass 8).** `[Roadmap: items 1-4 Pass 19, C3.3; item 5 Pass 29, C4.3b; item 6 Phase 9, with sale attribution in Pass 12]` Six items on the field
    ticket. None was built by Pass 8 (which only *logged* the price override) and none is
    scheduled; together they are one technician-view pass, to be planned after Pass 9. What
    exists today, and the gap:
    1. **The draft price must drive the figures.** The ticket's billing block (top of the modal:
       designation badge, Price + tax, COA, Due today) and the collect step's summary both read
       `GET /api/appointments/:id/billing-summary`, which prices from the **stored**
       `services.priceCents`. The price typed in the Service Price box lives in browser state
       until Post Service Ticket writes it. So the block does not move when the technician
       changes the price, and, worse, **Finish & Collect shows the old Price / Due today and
       defaults the collected amount to it**, because Post happens after Collect. Wanted: the
       block updates when the technician leaves the price box, and the collect step prices from
       the new price. Design: give the billing-summary read a draft-price override
       (`?serviceId=&priceCents=`) so the server prices the draft through the same
       `resolveServiceLineBillingTx` and the tax engine, rather than a second pricing path in the
       browser. Tax stays computed from the org's tax settings, display-only, never editable or
       recomputed client-side. The stored price still changes only at Post, and Pass 8 already
       logs that as `price_overridden`; the preview writes nothing.
    2. **Tax on the ticket** already exists: the tax engine's per-line answer shows as
       "+ $x tax" under Price in that block (the dev org's Standard Rate, 8.25%, default and
       active, with a rule on the general service type), display only. Item 1 makes it follow
       the draft price; nothing else to build.
    3. **Dollars.cents formatting.** The price input is a bare number field: "250" parses as
       $250.00 but is not reformatted. Format to two decimals on blur.
    4. **Service instructions inside the open ticket**, near the top with the service info: the
       agreement's `serviceInstructions` (defaulted from the template's `defaultInstructions`),
       the service's own notes, and the location's notes. The technician's *appointment details*
       already show location notes and service notes; the ticket modal shows none of the three.
    5. **Add a service in the field.** Changing the service *type* exists (non-agreement
       services only; agreement work is locked). Adding a second service to the visit from the
       field does not exist anywhere. The field-surcharge line above is the nearest unit (an
       add-on line, not a service). A real add must go through the appointment↔services rollup
       (`getLinkedServicesForAppointmentTx`, dev behavior rule 10) and the same designation and
       pricing rules office scheduling applies, so the visit invoice sees it as one more line.
    6. **Create an agreement from the field.** Not built; the technician cannot reach the
       agreement form. D8 names a field proposal generator as future/external, and the
       compensation entry below wants **sale attribution** recorded on the agreement before
       field selling is real: a technician who sells an annual program on site is exactly the
       "same person earns production and commission" case.
  - **Compensation & attribution — crew splits, sales commission, non-technician payees.** `[Roadmap: sale attribution Pass 12, C2.2; crew Pass 30, C4.4; split allocation and the engine Phase 7]`
    Owner-specified 2026-09-10. **Read `PLAN_BILLING_V1.md` §1.6.2 first.** An earlier version of this
    entry said the comp model was nowhere in the plan. That was wrong: §1.6.2 ("Compensation — build
    the basis, defer the engine") already designs it, and it is still the intended direction —
    `comp_plans` (org-scoped, Settings-configurable, assignable per technician), `comp_components`
    typed `PERCENT_OF_PRODUCTION | PERCENT_OF_COLLECTED_REVENUE | FLAT_PER_SERVICE | HOURLY | SALARY
    | COMMISSION_ON_NEW_AGREEMENT | TIERED_BONUS` with per-service-type filters and tiers, and
    `comp_earnings` as an append-only ledger with **plan and rate snapshotted at time of earning**, so
    editing a comp plan never retroactively changes what someone was already paid. That covers the
    owner's bar — "configure to meet nearly any comp plan within reason" — including the company that
    pays commission on new sales and no production value at all. It is correctly deferred to Phase
    2/3 and gated on the payment ledger.

    **Two axes, not one pot.** Production value (earned by doing the work — contract price ÷ expected
    service count, per canon) and commission (earned by selling it, on its own basis and rate) are
    separate earnings, not one amount divided among parties; one person can draw both for the same
    job. The owner's scenarios:
    - a salesperson closes a complex high-ticket job that two or more technicians perform — the
      salesperson earns commission, the technicians **split** the production value
    - a technician performs a one-time service **and** sells an annual program — the same person earns
      the production value of the service *and* commission on the sale
    - office staff sells over the phone and earns the commission; the technician performs the work and
      earns the production value

    **Three gaps in §1.6.2, all of them "basis" rather than "engine":**
    1. **Crew.** `services.assignedTechnicianId` / `appointments.assignedTechnicianId` are single FKs
       with no join table, so the app cannot record that two technicians ran a job.
    2. **Split allocation.** `production_value_entries.technicianId` is one nullable varchar, so an
       entry credits exactly one technician. Needs append-only allocation rows beneath the entry
       (party, share), corrections being a new allocation set rather than an edit — the same
       append-only discipline the entry itself already follows.
    3. **Non-technician payees and sale attribution.** Every §1.6.2 component pays a *technician*, and
       nothing anywhere records **who sold** an agreement, so `COMMISSION_ON_NEW_AGREEMENT` has no
       payee to resolve. Needs a sold-by reference assignable to any **user** (`technicians` and
       `users` are separate tables, so the party reference must span both), plus role-gating on who
       may assign or change sales credit.

    **Sequencing (owner delegated the call, 2026-09-10):**
    - **Sale attribution → Phase 1**, riding with the "Billing Plan required on every Agreement" pass
      above: same form, same zod, same template-propagation path, so it is cheap to do together.
      **Built in Pass 12** (`soldByUserId`, a users FK; `ASSIGN_SALE_CREDIT`; the `technicians.userId`
      bridge; C5.7 merges the tables).
      §1.6.2's own rule is that Phase 1 builds the basis because "you cannot reconstruct what a
      technician earned last March if the basis was never recorded" — and *who sold it* is basis.
    - **Crew assignment → the deferred scheduling pass** (D8, which already collects unschedule and
      preferred-technician). It is a scheduling capability, not a comp one, and the comp work needs
      real crew data to allocate against.
    - **Split allocation → immediately after that pass**, being meaningless without crews.
    - **The engine → Phase 2/3, unchanged**, per §1.6.2, gated on the payment ledger (Pass 6) and
      extended so a component can pay a non-technician.
    - **Nothing needs to jump the queue.** The whole DB is test data and no multi-technician service
      has been exercised (owner confirmed 2026-09-10), so nothing is being lost today and no schema is
      locked in. The "unrecoverable after the fact" argument is real but only bites once live.

    When this is scheduled it should graduate to its own plan doc rather than growing here.

    Same principle as Pass 5.5's `initialChargeCollectedBy` finding, which is this problem in
    miniature: credit must key off what was **recorded to have happened**, never inferred from a
    configuration field.

    **Surcharge production is a comp-plan setting (owner, 2026-09-13).** Whether a technician earns
    production on a cleanout/surcharge line is decided per comp plan — a selector on the plan (or a
    filter on its production component) reading roughly "earns production on surcharge lines:
    yes / no" — not a global rule, and never inferred from who collected the money. A down payment
    earns no extra production on any plan: 25% down changes the initial visit's charge, not the
    contract price that production is derived from. This answers the question the historical plan
    left open (its "cleanout / down-payment surcharge" decision). Until the comp engine exists, the
    transitional credit in `createSurchargeEntryIfConfigured()` (cleanout only, technician the sole
    permitted collector) stands in for a plan that answers "yes"; the field-surcharge unit above
    deletes it.
  - ~~**`PLAN_BILLING_V1.md` is cited but missing.**~~ **Resolved 2026-09-10** — restored from git
    history with a header marking it historical and superseded, so the ~24 `§x.x` citations in
    `shared/schema.ts`, `server/storage.ts` and elsewhere resolve to something readable. Per the owner
    it is a **historical reference only: do not cite it in new work**, and it stays off `CLAUDE.md`'s
    reading list — a stale plan sitting beside the current one is how a fresh session picks up the
    wrong instructions, which is why it was removed in the first place.
  - **`CUSTOM` recurrence silently means "days"** `[Roadmap: Pass 35, C5.3]` — small, mechanical, worth doing before it spreads.
    `billingPlans.intervalUnit` offers `DAY | WEEK | MONTH | QUARTER | YEAR` and (since Pass 3.5) all
    of them step correctly with any interval count. But the **service recurrence** and **agreement
    term** dropdowns — on both the agreement form and the agreement-template form — offer only
    `MONTH | QUARTER | YEAR | CUSTOM`, and `advanceAgreementDate()` maps `CUSTOM` to `addDays()`. So
    "Custom / 7" means "every 7 days" with nothing in the UI saying so, and `CUSTOM(7)` is
    indistinguishable in behavior from `WEEK(1)`. Replace `CUSTOM` with explicit `DAY` and `WEEK`
    options on those two dropdowns and migrate `CUSTOM(N)` → `DAY(N)`. Affects 7 agreements and 2
    templates today, including the Wildlife Trapping Program rows, which are `CUSTOM/7` term *and*
    recurrence — i.e. the daily-trap-check case this vocabulary was quietly already serving.

## Handoff prompt for the next session

Replaced at the end of every pass (`AGENT_WORKING_AGREEMENT.md`, the end-of-pass step). The owner
pastes it verbatim to start the next session; it is also the last thing in the finishing session's
final message. Written 2026-09-25, after Pass 15 was pushed as `feature/phase-2-statements`.

```text
Start Pass 17 — Reopen-reason pop-up
(PLAN_ROADMAP_V2.md Phase 3 table, row C3.2; PLAN_BILLING_V1_1.md D9's "reopen-reason UX per
notes: pop-up with settings-configured dropdown; Other requires text, role-gated", unscheduled
since Pass 7.6. The recommended immediate order is exhausted; the rest runs in phase order, and
this is the first open Phase 3 row after Pass 16.) Read the CLAUDE.md docs in order first;
CURRENT_FOCUS.md's last two entries (Pass 15 and "Next up") are the ones that matter.

Branch feature/phase-3-reopen-reason-popup from origin/main. Confirm main contains the Pass 15b
merge (feature/phase-2-aging-strip-placement) before branching.

The decision is recorded (the C3.2 row; D9): a settings list ticket_reopen_reasons in the
app_settings shape of appointment_cancel_reschedule_reasons; reopenReasonCode + text on the
ticket; "Other" requires text and a new REOPEN_TICKET_OTHER (manager+); the inline textarea
leaves the review modal for a pop-up; the modal closes on Finalize when the queue is exhausted.
Ground truth today (line numbers from origin/main at the Pass 15 merge; they drift, the names do
not):
- The reopen path: POST /api/service-records/:id/reopen (routes.ts:1897, REOPEN_TICKET - support+
  per shared/permissions.ts:81 / :95) parses reopenServiceRecordSchema (:318, { reason: string,
  trimmed, min 1 }) and calls reopenServiceRecord (storage.ts:5020): one transaction that sets
  confirmed false, ticketStatus REOPENED, reopenedAt / reopenedByUserId / reopenedByLabel,
  reopenReason (the trimmed text) and readyForBilling false, then writes the audit row
  ticket_reopened (service_record entity, before / after; :5047). The columns are
  shared/schema.ts:501-504 (reopened_at, reopened_by_user_id, reopened_by_label, reopen_reason);
  there is no reason-code column. Reopen clears the three "finalized" signals
  shared/ticket-status.ts reads (isTicketFinalized :35), which is what re-admits the technician.
- The settings-list shape to copy: appointment_cancel_reschedule_reasons is one app_settings row
  (shared/schema.ts:509 - org_id + key primary key, value text) holding a JSON array of strings,
  read by getAppointmentCancelReasons (storage.ts:5133, through normalizeAppointmentCancelReasons
  :1084 with DEFAULT_APPOINTMENT_CANCEL_REASONS as the fallback when no row exists) and written by
  setAppointmentCancelReasons (:5138 - trimmed, de-duplicated, at least one); the routes are GET /
  PATCH /api/settings/appointment-cancel-reasons (routes.ts:1925 / :1930,
  appointmentCancelReasonsSchema :296 - note that PATCH carries no permission gate, unlike
  invoice-on-finalize at :1949 which is MANAGE_SETTINGS; decide which the new list gets and say
  which); the Settings page edits it as one textarea, one reason per line ("Appointment Cancel /
  Reschedule Reasons", settings.tsx:2021; state :1335, query :1352, mutation :1386). The
  server-side "the reason must be on the list" check is dispositionAppointment's
  (storage.ts:4240-4249: DISPOSITION_REASON_REQUIRED / DISPOSITION_REASON_NOT_ON_LIST from
  shared/appointment-disposition.ts:79 / :81, answered as an AppointmentDispositionError 400 with
  the code); the client dropdown fed by that list is the dispatch sheet's Cancel appointment
  dialog (schedule.tsx:427; the list read at :637).
- The review modal, client/src/pages/service-ticket-review.tsx: the inline "Reopen Reason"
  Textarea (:683-684) sits above the footer, Reopen (:690, disabled until the text is non-empty)
  beside Finalize (:693); reopenReason state (:286) is cleared by openRecordFromQueue (:349),
  closeReviewModal (:354), goToRecord (:401) and the reopen mutation's success (:439);
  reopenMutation (:432) posts { reason }. The finalize mutation (:415) invalidates, then either
  opens the D2 invoice prompt or toasts, and leaves the modal open on the same ticket; Next / Back
  walk a snapshot of the queue (navRecordIds; resolveReviewNav in
  client/src/lib/review-queue-nav.ts:33, pure, the snapshot rule in the comment at :340-348), so
  "the queue is exhausted" is resolveReviewNav answering no next step for the finalized ticket
  (say whether a run of one - a deep-linked ticket - counts). The "Reopen Audit" block (:675-680)
  shows the stamps and the free text. The audit renderer
  (client/src/components/audit-log-entry-card.tsx) prints a service_record's before / after, so a
  new column shows there like any other field.
- Permissions: shared/permissions.ts - REOPEN_TICKET is support+; a new REOPEN_TICKET_OTHER goes
  manager+ (the ADJUST_PRICE_AGREEMENT pattern); admin holds every permission.

Build per C3.2: (1) the list - ticket_reopen_reasons in app_settings, a default list when no row
exists (say which defaults), "Other" always offered last and never a stored entry (or stored - say
which), GET / PATCH /api/settings/ticket-reopen-reasons in the cancel-reasons shape, a Settings
card beside "Appointment Cancel / Reschedule Reasons" editing one reason per line; (2) the ticket
- reopenReasonCode on service_records, a nullable text column added by a guarded migration in
the bootstrap that owns service_records (its effect printed, idempotent on the second boot; the
existing reopened rows keep their free text with a null code - never guessed), the reopen route
taking { reasonCode, reason? }: a code on the list, or OTHER with required text, refused otherwise
(400 with a code, the disposition's pattern), OTHER additionally gated by REOPEN_TICKET_OTHER (a
support user reopening with Other is 403 with a message saying who may); the audit row and the
Reopen Audit block carry both; (3) the pop-up - the inline textarea leaves the modal; Reopen opens
a small dialog with a Select fed by the list, a text field that appears and is required for
Other, Cancel / Reopen; the Other option is disabled, not hidden, with the reason, for anyone
without REOPEN_TICKET_OTHER; (4) close on Finalize - when the finalize completes (after the D2
prompt is answered, or at once when there is none) and resolveReviewNav has no next step for the
run, the modal closes; otherwise it stays on the ticket exactly as today so Next still works. Not
touched: the finalize path itself, the technician's view, the location Services tab's Review
ticket link, the office edit button (C3.1b, Pass 18), the disposition's own reasons list.

Environment: Node 24.21.0, npm run dev:full (restart it before manually testing - this pass adds
routes and a migration), DEV_NOTES.md for the DB backup/restore and PowerShell traps, gh logged in
so the session can open the PR. Verify on PORT=5001 as the previous passes did: npm run check;
double boot (boot 1 prints the migration's effect, boot 2 only "serving on port 5001" with every
table count unchanged); the pass's API smoke test as all four roles (a fixture ticket posted and
finalized through the real routes; reopen with a listed code as support -> REOPENED with the code
and the audit row; a code not on the list -> 400; Other without text -> 400; Other with text as
support -> 403, as manager -> 200; the list read and PATCH, the defaults on an org with no row;
the pre-existing reopened rows' null code untouched; every fixture deleted and counts back at
baseline) and a Vite 200 on every touched client module; state plainly what was not rendered -
the pop-up and the close-on-exhausted behavior cannot be exercised without a browser.

Working agreement as always: one pass, one branch, update CURRENT_FOCUS and the roadmap's pass
table at the end, replace the handoff prompt at the end of CURRENT_FOCUS.md with the one for the
next pass (phase order: Pass 18, the office Edit on the review modal, C3.1b, whose spec is its
row, unless I say otherwise), push, open the PR and stop. I merge.
```
