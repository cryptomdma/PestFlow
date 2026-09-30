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
the owner's note of 2026-09-25) is merged (PR #88); Pass 17 (the reopen-reason pop-up, C3.2 - the
first Phase 3 row in phase order, the recommended order being exhausted) is merged (PR #89); Pass
18 (the office Edit on the review modal, C3.1b) is merged (PR #90); Pass 19 (the technician
ticket modal's money and instructions, C3.3) is merged (PR #91); Pass 20 (material units and
application areas, C3.4a) is merged (PR #92); Pass 21 (target pests at two levels, C3.4b) is
merged (PR #93); Pass 22 (the service report document, C3.5) is merged (PR #94); Pass 23 (the
field surcharge line, C3.6) is merged (PR #95); Pass 24 (service designation and callback
attribution, C3.7 - the last Phase 3 row) is merged (PR #96); Pass 26 (opportunity assignment
rules and zones, C4.1b - the first open Phase 4 row in phase order) is merged (PR #97); Pass 28
(appointment composition on the server and the dispatch sheet, C4.3a) is pushed, awaiting merge;
**next pass: 29, appointment composition in the field** (C4.3b). The roadmap
sequences every remaining item below; this file keeps the status pointer and, as its last
section, the handoff prompt that starts the next session.

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
completeness and the dev DB has no such row. Not built: auto-assignment rules and zones (Pass 26 - since built),
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
sheet, Pass 26 (since built). **Restart `npm run dev:full` before manually testing - this pass changes server
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
merged as PR #88. **The location balance rides inside the Location Notes box.** The owner's
note: Pass 14's aging strip under the notes took too much vertical space. Now the notes box
carries one horizontal row directly below the notes (`LocationAgingSummaryRow` in
`aging-strip.tsx`, passed as the notes panel's `footer`): the open balance, then Current always
and the other buckets only when something is owed in them, then on account and pending when
non-zero, with "days since invoiced" as the caption - no invoice links. The full strip with the
invoices behind each bucket (`LocationAgingStrip`, now titled "Balance by days since invoiced")
moved to the Invoices tab, under the ledger panel's Balance card and above the invoice rows, so
the links live where invoices are. Same read, no server change, no migration. **Not rendered by
anyone - the row's wrapping inside the notes box reaches the owner first.**

Pass 17 (`feature/phase-3-reopen-reason-popup`, 2026-09-25, C3.2) merged as PR #89.
**The reopen reason is a pop-up over a settings list.** A reopen names a reason from the org's
list - `ticket_reopen_reasons`, one `app_settings` row in the shape of
`appointment_cancel_reschedule_reasons` (a JSON array of strings; no row reads as the eight
defaults in `shared/ticket-reopen.ts`: Wrong price, Wrong service date, Wrong technician,
Materials missing or incorrect, Notes incomplete, Customer dispute, Posted on the wrong service,
Finalized in error) - or the fixed code `OTHER` with the reason typed out. "Other" is never a
list entry: the server drops it from every save (an Other-only list is refused) and every read,
and the pop-up offers it itself, last. The ticket carries `reopenReasonCode` (the list entry as
written, or `OTHER`) and `reopenReason` (the text - required for Other, optional detail beside a
listed reason); the technician's re-post clears the code with the other reopen stamps. **The
route**, `POST /api/service-records/:id/reopen`, takes `{ reasonCode, reason? }` (strict - the
old `{ reason }` body is a 400) and answers, before anything is written, 400
`REOPEN_REASON_NOT_ON_LIST`, 400 `REOPEN_REASON_TEXT_REQUIRED` or 403 `REOPEN_OTHER_FORBIDDEN` -
the new `REOPEN_TICKET_OTHER` (manager and admin; `REOPEN_TICKET` stays support+) is checked
first, so a support user is told who may whatever they typed. The `ticket_reopened` audit row
carries the code and the text through its before / after snapshots like any other column. **The
list**: `GET / PATCH /api/settings/ticket-reopen-reasons` in the cancel list's shape, the GET open
(the pop-up reads it) and the PATCH `MANAGE_SETTINGS` - the invoice-on-finalize convention, not
the cancel list's ungated PATCH, which is left as it is; a **Ticket Reopen Reasons** card beside
the cancel card on Settings edits it one reason per line, disabled for anyone but an admin. **The
migration** (`service-scheduling-bootstrap.ts`, guarded on the column): `reopen_reason_code`
nullable, the effect printed once - the dev DB's 4 reopened rows keep their free text with a null
code, never guessed - and nothing on the second boot. **The review modal**: the inline textarea
is gone; Reopen opens a small dialog (a Select fed by the list with Other last - disabled, not
hidden, and labelled "(manager or admin only)" for a support user - a required text box that
appears for Other, Cancel / Reopen); the Reopen Audit block prints the reason and the text (a
legacy row its text alone); the Services tab's "Reopen Reason" line reads code - text. **Close on
Finalize**: Finalize carries whether `resolveReviewNav` has a next step when it is pressed; with
none - the last ticket of a run, a run of one, or a deep-linked ticket that was never in a run -
the modal closes once the finalize is done, after the D2 prompt is answered (Generate, Generate &
Send, Later or dismissed; D4's balance prompt lives inside the invoice prompt and outlives the
modal) or at once when there is none; otherwise it stays on the ticket exactly as before, so Next
still walks the run. Not touched: the finalize path itself, the technician's view, the location
Services tab's Review ticket link, the office edit button (C3.1b, Pass 18), the disposition's own
reasons list. **Restart `npm run dev:full` before manually testing - this pass adds routes and a
migration (the migration already ran on the shared dev DB during this pass's verification boot; a
server on the old code neither reads nor needs the column), and the pop-up, its disabled Other
option, the close-on-exhausted behaviour and the Settings card have not been rendered by anyone:
the repo has no browser automation and the session had no browser.** Signatures and behavior are
under "Shipped in Pass 17" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 18 (`feature/phase-3-office-edit-ticket`, 2026-09-25, C3.1b) merged as PR #90.
**The office edits a posted ticket from the review modal.** An **Edit** button sits between
Close and Reopen in the modal's footer, for `EDIT_TICKET` holders only (support+); on a finalized
ticket - any of the three signals `isTicketFinalized` reads - it is disabled, not hidden, and
reads "Edit (reopen first)" (dev rule 6). It opens `service-completion-dialog.tsx` in a new
**`mode="office-edit"`** (a prop; `"post"` is the default, so the technician view and the
Services tab's caller are untouched): the same fields and materials, seeded from the selected
record and its `/api/product-applications` rows, titled "Edit Service Ticket", the badge naming
the ticket's lifecycle, the technician and the service date editable (a Select and a
datetime-local - the PATCH's content, which a post fixes at start), no local draft read or
written, no collect step, no time-out prompt, Cancel / Save Changes. The save is **`PATCH
/api/service-records/:id`** - Pass 16's gated, strict, content-only route - which now also takes
**`serviceTypeId` / `priceCents`** in the post's shape: `updateServiceRecord` applies them to the
**Service** under the post's `allowFieldServiceOverride` rule (a manual service, or
`ADJUST_PRICE_AGREEMENT` on an agreement-generated one), checked before anything is written - a
body carrying either for an agreement-generated service without the permission is refused
whole, **403 `PRICE_ADJUSTMENT_FORBIDDEN`**, the message naming "manager or admin" (the Pass 17
pattern, a new `TicketEditError`), so support edits everything but an agreement price or type;
the ticket's own `serviceTypeId` follows the Service's as a post copies it; a price that moved is
logged **`price_overridden`** on the Service exactly as a post's is (the Service row before and
after, so a type change in the same save shows in the diff; a type-only change shows in the
ticket's `ticket_edited` diff instead); `ticket_edited` is written only when the ticket or its
materials changed - **one transaction** for the Service and the ticket, a price-only save
writing `price_overridden` alone; a save that changes nothing writes nothing; a FINALIZED ticket
answers 409 `TICKET_FINALIZED` before the price is looked at; `priceCents: null` clears the stamp
(an agreement service back to its derived amount). The dialog sends the type and price only when
this user may set them (an agreement price only when changed from the computed default, as the
post does) and shows the locked field with who may. The generic `PATCH /api/services/:id`
(ungated, unlogged) is not the path and is untouched. A successful save invalidates the review
data (records, services, appointments - prefix-matching the visit billing summary - and product
applications) and leaves the modal on the ticket. Not touched: the post route's body, finalize,
reopen and its pop-up, the disposition, the Services tab's link, the technician view (it passes
no mode and `existingServiceRecord` only for a REOPENED record), the field surcharge (C3.6). No
schema change, no migration. **Restart `npm run dev:full` before manually testing - this pass
changes a route's body and storage; the Edit button, its disabled state, the dialog's
office-edit mode and its editable technician / date cards have not been rendered by anyone: the
repo has no browser automation and the session had no browser.** Signatures and behavior are
under "Shipped in Pass 18" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 19 (`feature/phase-3-tech-ticket-money-instructions`, 2026-09-25, C3.3) merged (PR #91).
**The price typed on the ticket drives the figures, priced by the server.** `GET
/api/appointments/:id/billing-summary?serviceId=&priceCents=` (together or not at all) prices THAT
service at the draft price through the same `resolveServiceLineBillingTx` and `resolveTaxDecision`
the visit invoice uses - the draft reaches the resolver as the Service's `priceCents` and nothing
else changes, so the same branches price it (a COD service at the draft; an agreement on a plan the
run does not bill at the draft; a covered plan still $0 whatever is typed) and there is no second
pricing path - and writes nothing: the stored price still changes only at Post (Pass 8's
`price_overridden`), no audit row. **The post's rule, with the session's role**: an
agreement-generated service is re-priced only for `ADJUST_PRICE_AGREEMENT` (manager+); a draft the
role may not apply is **ignored, not refused** - echoed in the summary's new `draft` field
(`{ serviceId, priceCents, applied, note }`, the note naming "manager or admin") - because the read
previews what Post will produce and `completeService` ignores that price too; a refusal would blank
the ticket's billing block for a case the dialog never sends. An issued invoice's figures are the
invoice's and are never re-priced (echoed with the invoice number). A `serviceId` not on the visit
is 400 `DRAFT_SERVICE_NOT_ON_VISIT`; `priceCents` is digits only (an empty or fractional value is a
400, never a $0 preview); one param without the other is a 400. **The dialog**
(`service-completion-dialog.tsx`, both modes - the header block is shared): the price box commits
on blur, formatted to dollars.cents (`commitPrice`), and the committed value becomes the draft
under exactly `serviceOverridePayload`'s rule (only when this user may set the price, only when it
differs from the stored price, never an agreement service's computed default), so the figures
preview what Post will stamp; the draft rides the summary query key's last segment as the query
string (`visitBillingSummaryQueryKey(id, draft)`, so the `["/api/appointments"]` prefix
invalidations still reach it, and the same visit's last figures stay on screen while the re-read
is in flight); `CollectPaymentDialog` takes the same `draftPrice`, so **Finish & Collect shows and
defaults to the new amount**; the billing block says what its figures are priced at ("Priced at
the ticket's $X - not posted yet", or why the draft is not applied). **Instructions** near the top
of the open ticket: the agreement's `serviceInstructions`, the service's `notes` and the location's
notes, each labelled, absent when empty; the location's notes are the canonical LOCATION-scope
`customer_notes` rows through `GET /api/notes/location/:locationId` (the customer screen's notes
read and query key; pinned first, then newest, one paragraph each) - `locations.notes` is the
transitional legacy column and is empty everywhere, which is why the sheet's Location Notes block
had been silently blank since before this pass; the sheet reads the same route now (the owner's
live test of 2026-09-26, fixed on the branch before merge). **The billing-plan pill** (D6's
`BillingPlanPill`; `useBillingPlanById` now takes `enabled`) sits under the mode badge in the header
for an agreement service; the billing-profile display waits for C5.2. **Time in now?** lives in
the technician view (`technician-work.tsx`), in front of the ticket's open: an `AlertDialog` when
the appointment has no `timeInAt` - "Time in and open" posts the existing
`POST /api/appointments/:id/time-in` and opens the ticket on the stamped appointment, "Open
without timing in" opens it anyway (bypass allowed), Escape opens nothing; a failed time-in toasts
and still opens the ticket. The technician view is the one surface that opens the post mode from a
visit, so the office-edit mode never sees the prompt. The open appointment-details sheet now
follows the day's read (`detailVisit` derived from `visits` by appointment id over the selected
snapshot), so a Time In / Time Out recorded from the sheet or the prompt shows without reopening
it. Landing after Post unchanged (B1). Not touched: the post route's body and price stamping (Pass
8), the office-edit save (Pass 18), finalize / reopen, the field surcharge (C3.6), add-a-service
from the field (C4.3b), the tax engine's rules. No schema change, no migration. **Restart `npm run
dev:full` before manually testing - this pass changes a read's query and the technician's modal;
the re-pricing on blur, the instructions block, the pill and the time-in prompt have not been
rendered by anyone: the repo has no browser automation and the session had no browser.**
Signatures and behavior are under "Shipped in Pass 19" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 20 (`feature/phase-3-material-units-areas`, 2026-09-26, C3.4a) merged (PR #92, 2026-09-27).
**Material units and application areas.** Two Settings-managed lists in the reopen list's shape
(`shared/material-lists.ts`; one `app_settings` row each, `material_units` and
`application_areas`, the defaults until Settings saves one - oz / fl oz / gal / lb / g / mL / L /
each, and ten areas from Exterior to Yard): `GET` open, `PATCH` MANAGE_SETTINGS, a Settings card
each (a textarea one entry per line, disabled - not hidden - for anyone but an admin), placed above
Material Products. **The product form** picks Default Unit from the unit list (a Select), Allowed
Areas from the org's area list (a multi-select) and Default Area from the product's allowed areas.
**The material line** picks Unit from the unit list (a Select) and its **Application Areas** - a
list per row, `productApplications.applicationAreas text[]` - from the product's allowed areas or,
when the product names none, the org's list (a Popover + Command multi-select,
`client/src/components/list-multi-select.tsx`, shared with the product form); the collapsed
summary, the review modal, the customer screen's service history and the Service History page
print the list. **Areas serviced is derived by the server** now (canon §12): whenever a post or an
office edit sends materials, `areasServiced` is the union of every row's areas in row order, the
body's own text counting only when no row names an area; the dialog stopped computing it.
**Decided: a unit or area outside the lists is kept, never refused**, and the editors show it
marked "not on the list" (an extra Select option, an outlined chip) - a material row is the
compliance record of what the technician did, a post from the field must not fail over vocabulary
the technician cannot edit, and 8 of the 45 existing rows carry free text no list names; a value
matching a list entry apart from casing or whitespace is written in the list's spelling (Each ->
each, GARAGE -> Garage) on every post, office edit and product save, so the vocabulary converges
without a refusal, and a re-save that differs only in casing writes nothing.
`applicationLocation` stays as the **transitional single value** (dev rule 4): written as the first
area by storage, read only by surfaces that predate the list, its fate C3.4b's. **Migration**
(`bootstrapMaterialVocabulary`, guarded on the new column, the per-row effect printed once): 44 of
45 `product_applications` got their `application_location` copied in as a one-element array (the
row with none stays null); `Live Trap`'s `default_unit` and its 3 application rows went `Each` ->
`each`; every other unit already matched. **It ran against the shared dev DB during this pass's
verification boot, so the owner's `npm run dev:full` restart prints nothing for Pass 20.** The
legacy `POST /api/product-applications` row goes through the same normalizer; the Service History
page's pre-Phase-1 "New Service Record" form (freeform Areas Serviced and Application Location,
its own `POST /api/service-records`) is untouched and remains the one surface with a freeform area
field. Not touched: target pests (C3.4b), the post's price / type path (Passes 8, 18, 19), the tax
engine, the service report (C3.5), the material-products routes' gating (none, as before).
**Restart `npm run dev:full` before manually testing - this pass adds a column, four routes and a
column on two bodies; the Unit Select, the two multi-selects, the product form's pickers and the
two Settings cards have not been rendered by anyone: the repo has no browser automation and the
session had no browser.** Signatures and behavior are under "Shipped in Pass 20" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Pass 21 (`feature/phase-3-target-pests-two-levels`, 2026-09-27, C3.4b) merged (PR #93, 2026-09-27).
**Target pests at two levels.** Each material row carries its own target pests
(`productApplications.targetPests text[]`, beside Pass 20's `applicationAreas`) - the compliance
record of what a product was applied for - picked in the ticket dialog from the org's target-pest
list through a Target Pests multi-select per row (the Pass 20 `<ListMultiSelect>`); the
ticket-level control left its pill toggles and search box for the same multi-select, placed at the
top of the Materials section, and holds the ticket's own picks. **The ticket's set is derived by
the server** (B13: one rule in the route): on every post and every office edit,
`service_records.targetPests` = the picks (the body's, or the stored set when the body omits them)
∪ every material row's pests - the picks first in the order picked, then the rows' in row order,
each in the pest list's spelling where the match is case-insensitive and kept as written
otherwise (Pass 20's rule: "Crickets" on an old ticket, "Squirrels" on a row stay and are shown
marked), deduped; the rows are the ones the ticket ends up with (the body's when materials are
sent, the existing rows otherwise), so the set never names fewer pests than the rows. Only the
union is stored: on an office edit the stored set seeds the picks whole, so a pest that arrived
through a material stays until someone removes it - never silently dropped. **The summary line**
at the top of the ticket (the header card, under the service type, both modes, absent when empty)
shows the same union, computed by the shared `deriveTicketTargetPests()` storage uses; the review
modal's Target Pests line reads the stored union, and every material line (review modal, customer
screen, Service History page) prints the row's pests. **Decided: `applicationLocation` is
dropped** - a guarded `DROP COLUMN` in the bootstrap after a safety copy of any row whose location
was its only area (0 on the dev DB), the effect printed once. Every reader already went through
`applicationAreasOf()` / `formatApplicationAreas()`, every writer wrote `applicationAreas`, no
service worker caches an older client, and the one in-repo writer still sending the old field
(the Service History page's legacy "New Service Record" form) now sends `applicationAreas`; the
field left the API with its column (a body naming it is not read), the `ticket_edited` snapshot
carries `targetPests` in its place, and the dialog's restore of a pre-Pass-20 local draft is the
one reader left of the name. **Migration** (`bootstrapMaterialTargetPests`, two guarded steps
printed once): `target_pests text[]` added with no backfill (no row carried a pest; 45 rows on the
dev DB); `application_location` dropped. **It has NOT run against the shared dev DB: this pass's
verification ran against a copy (`pestflow_verify`, dropped afterwards - the recipe is in
`DEV_NOTES.md`), because a column drop breaks any server still running the previous code against
the same database; the owner's `npm run dev:full` restart runs it and prints both lines.** The
legacy `POST /api/product-applications` row goes through the same normalizer and folds its pests
into its ticket's set. Not touched: the unit and area lists (Pass 20), the post's price / type
path, the service report (C3.5), the target-pests routes' gating (none, as before), the legacy
form's freeform Areas Serviced. **Restart `npm run dev:full` before manually testing - this pass
adds a column, drops one and changes two bodies; the two multi-selects, the summary line and the
material lines' pest captions have not been rendered by anyone: the repo has no browser automation
and the session had no browser.** Signatures and behavior are under "Shipped in Pass 21" at the
end of `PLAN_ROADMAP_V2.md` Part D.

Pass 22 (`feature/phase-3-service-report-document`, 2026-09-27, C3.5) merged (PR #94, 2026-09-27).
**Service report document.** The customer-facing summary of a posted ticket, in the invoice
document's shape: `documents.kind = 'SERVICE_REPORT'`, one row per ticket keyed by a new
`service_record_id` column (partial unique index), rendered by a pure, paginating
`renderServiceReportPdf()` (`server/documents/service-report-pdf.ts`, the statement renderer's
template) on the first `GET /api/service-records/:id/report` and answered as the stored bytes
after that - inline, `?download=1` for an attachment, named
`service-report-<service day>-<location>.pdf`; `GET .../report-info` answers the row without its
bytes plus the file name. It prints the org header and letterhead, the customer, the service
location, the technician and license from the ticket's compliance snapshot (canon §12), the
service date (the UTC day, as every document here prints dates), the service type, the stored
target-pest union, the derived areas serviced, the follow-up, a materials table (product, EPA #,
amount + unit, dilution, method, areas, pests), notes / conditions found / recommendations when
written, and a signature line that says whether a signature was captured on the ticket.
**Decided: a stored report is retired when the ticket's content is written again** - a re-post,
an office edit that changed something and a material row added by the legacy route each delete
the row in their own transaction, and the next request renders the ticket as it now stands;
finalize and reopen change no content and keep it. **The collect step's "Preview report"** posts
the unposted ticket's content (`POST /api/service-records/preview-report`, the post's body shape
plus `serviceId`, any session role) and gets the PDF back marked "PREVIEW - not yet posted",
stored nowhere; the tab is opened on the click and the PDF navigated into it. **Open / Download**
(`ServiceReportActions`, the statement component's shape) sit beside Open Location on the review
modal and before Reopen / Finalize in the Services tab's ticket dialog. **The Settings toggle
"Attach service report to visit invoices"** (B11; `app_settings` key
`attach_service_report_to_invoices`, boolean, default off; GET open, PATCH `MANAGE_SETTINGS`; a
Switch card that says an invoice PDF already rendered keeps what it rendered): when on,
`getInvoiceDocumentContext` of an invoice with an `appointmentId` appends the report of each
distinct ticket among its lines, in line order, **drawn into the same pdfkit document**
(`drawServiceReport()`; decided over a merge dependency - pdfkit cannot embed another PDF's pages
and the repo carries no second PDF library); a DRAFT preview follows the same rule unstored; a
schedule-driven, manual or standalone initial-charge invoice has no visit and appends nothing.
Both documents stay separately openable. **Migration** (`bootstrapDocuments`, guarded, printed
once): `service_record_id` and its partial unique index. **It ran against the shared dev DB
during this pass's verification boot (an additive change, safe under the running server), so
the owner's `npm run dev:full` restart prints nothing for Pass 22.** Not touched: the invoice
document's own layout, email delivery (C6.3), the ticket dialog's fields, the legacy Service
History form, the target-pests routes' gating. **Restart `npm run dev:full` before manually
testing - this pass adds a column, an index, a settings key and five routes; the two Open /
Download pairs, the Preview button, the Switch card and the PDF's look have not been rendered by
anyone: the repo has no browser automation and the session had no browser.** Signatures and
behavior are under "Shipped in Pass 22" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 23 (`feature/phase-3-field-surcharge-line`, 2026-09-27, C3.6) merged as PR #95.
**Field surcharge line.** A cleanout surcharge is a line the technician adds on the ticket, not
a term of the sale (owner, 2026-09-13, the Pass 5.5 review under D4): `service_records.
surchargeCents` / `surchargeLabel` (nullable; the label defaults to "Cleanout surcharge";
`shared/field-surcharge.ts` normalizes both - no amount means no label), accepted by the post,
the office PATCH and the report preview's body. **Decided: it lives on the ticket, not on the
Service** - it is the ticket's content (the office PATCH edits it, `ticket_edited` snapshots it,
the service report prints it), and the owner's case is an agreement service whose price the
technician may not touch; D6 holds, the price is never mutated and the surcharge is its own line.
**Audited as `surcharge_recorded`** (a new action on the ticket, before / after `{ surchargeCents,
surchargeLabel }`, both null before a first post) whenever a post or an edit records, changes or
removes one - beside the content's `ticket_edited`, as `price_overridden` sits beside it. **The
gate** is one function for the server's refusal and the dialog's disabled input
(`resolveFieldSurchargeGate`): `ADD_FIELD_SURCHARGE` for whoever sends a new or changed surcharge
(403 `SURCHARGE_FORBIDDEN`, before anything is written) and, for an agreement service, the
agreement template's toggle (403 `SURCHARGE_NOT_ALLOWED`; an agreement with no template is refused
too); **decided: a non-agreement service needs the permission alone** (it has no template to ask,
the technician may already set its price, and a labelled line is the more honest record than a
folded-in extra); removing one needs the permission alone; an unchanged value is never re-gated,
so a template toggled off later never strands a recorded surcharge. Every role holds
`ADD_FIELD_SURCHARGE`, so the role refusal was verified on the pure function, not live. **The
invoice line:** `buildVisitInvoiceLinesTx` appends one SURCHARGE line per ticket right after its
service line - "<label> - <service type> - <date>", the ticket's ids, taxed by
`resolveTaxDecision` as the SERVICE line is, never counted toward the contract price, chargeable
on a covered visit (so `isFullyAgreementCovered` never reads "No Charge" beside one); generation,
DRAFT and issue share it, and a DRAFT priced before the ticket exists carries none. **The
visit's money:** `VisitChargeBilling` is a union - `INITIAL_CHARGE` (unchanged) | `SURCHARGE`
(serviceId, serviceRecordId, label, collectedBy null) - priced BILLABLE before invoicing and
paired with its line after, so the ticket's block, the appointment details, the collect step's
default (`technicianCollectibleCents` includes it) and the review modal all show it; the billing
read's draft gains `&surchargeCents=` (alone or beside `priceCents`; 0 previews a removal) under
the same gate, echoed as `surchargeApplied` / `surchargeNote`; the batch preview's charges gain
`kind` and list each finalized ticket's surcharge on its visit. **The toggle moved:**
`agreementTemplates.fieldSurchargeAllowed` (the template form's checkbox, the card's "Field
surcharge:" line), `billingPlans.fieldAddableSurcharge` dropped with its checkbox and its snapshot
key - **decided: the jsonb snapshots keep the old key as dead history**, as Pass 5.5 left its
keys; an agreement reads the toggle through its template, so a flip applies to every agreement
on it at once. **The vocabulary:** `INITIAL_CHARGE_TYPES` is `["DOWN_PAYMENT"]`; the Select, the
labels, `initialChargeCountsTowardPrice`, `isTechnicianSoleInitialChargeCollector`,
`isTechnicianCollectedCleanoutSurcharge` and the comments lost the two types;
`createSurchargeEntryIfConfigured` is gone. **The credit - TRANSITIONAL (dev rule 4),
`SURCHARGE_CREDIT_RULE`:** when a ticket carrying a surcharge is finalized,
`createProductionValueEntriesForFinalizedRecord` writes one basis SURCHARGE row for the posting
technician with the amount (the main entry and the surcharge entry are checked independently, so
a reopen that adds one and re-finalizes still earns it; a second finalize writes none; an amount
changed after the credit is not re-credited - the ledger is append-only and has no adjustment
entry until Phase 7's per-plan selector). **Decided: the four SURCHARGE rows from unit 15 (Unit 15
Ledger Test's $50.00 cleanout and the three Daily Rodent Trapping $99.95 down payments) stand as
history** - append-only, no adjustment vocabulary, no comp engine paying them. **Migration**
(three guarded one-shots, each printed once): `service_records.surcharge_cents` /
`surcharge_label` (service-scheduling-bootstrap, no backfill); the toggle (agreement-bootstrap,
keyed on the plan column still existing) - **decided per template: its agreements' plans all
agree on the flag → that value; no agreements → its own default plan's flag; the plans disagree
→ off** - on the dev DB Daily Rodent Trapping ALLOWED (Daily Recurring on, Pay In Full on),
Quarterly Control off (Monthly on, Quarterly off, Unit 15 plan off), Wildlife Trapping Program off
(COD off, Monthly on, Pay In Full on), then the plan column dropped; the vocabulary one-shot -
Unit 15 Ledger Test's `CLEANOUT_SURCHARGE` $50.00 → no initial charge (its $50.00 credit row
stands), PREPAY_FULL 0 agreements and 0 templates; the Pass 5.5 one-shot's IN lists narrowed to
DOWN_PAYMENT. **It has NOT run against the shared dev DB: this pass's verification ran against a
copy (`pestflow_verify`, dropped afterwards - the `DEV_NOTES.md` recipe), because the column drop
breaks any server still running the previous code against the same database; the owner's
`npm run dev:full` restart runs all three and prints their seven lines.** Client: the Surcharge
($) and Surcharge Label inputs under the price grid (post and office-edit modes; disabled with
the gate's message, never hidden, "Checking..." while an agreement service's rows load; a locked
box still shows and re-sends what the ticket carries), the figures following the typed amount
through the read's draft (the block shows the service's own surcharge line and the draft echo;
the reconciling line reads "This service $X + surcharge $Y + down payment $Z = visit due
today"), the review modal and the Services tab printing "Surcharge: <label> $X", the invoice
modal's SURCHARGE badge (already there), the service report's Surcharge row in its Service
section, the plan form's checkbox gone. Not touched: the down payment's path (C2.1d), the comp
engine (Phase 7), email delivery (C6.3), the manual invoice path, the Service History legacy form,
`technicianMayCollectInitialCharge` (still exported, still read by nothing). **Restart
`npm run dev:full` before manually testing - this pass adds two columns, drops one, changes three
bodies and the billing read; the two inputs, the template checkbox and card line, the figures
and the report row have not been rendered by anyone: the repo has no browser automation and the
session had no browser.** Signatures and behavior are under "Shipped in Pass 23" at the end of
`PLAN_ROADMAP_V2.md` Part D.

Pass 24 (`feature/phase-3-service-designation-callbacks`, 2026-09-27, C3.7) merged as PR #96.
**Service designation and callback attribution.** A callback is a kind of work, not a position in
a counter (canon §10). Built as the **work kind** - `serviceTypes.workKind` (the type's default,
set in Settings → Service Types) and `services.workKind` (the instance, defaulted from the type on
every creation path: the customer screen's form, the dispatch board's prefill, agreement
generation, an opportunity's conversion, the seed), vocabulary `SERVICE | PRODUCTION | CALLBACK`
in `shared/service-kind.ts`. **Decided: the name.** The canon's "category" collided with
`serviceTypes.category`, which already exists as free text ("General / Termite / Rodent") and
stays the display grouping; "designation" collided with `ServiceBillingDesignation` (BILLABLE /
PRODUCTION - what the invoice LINE is). So the new thing is the work kind everywhere, and its
badge reads "Kind: Callback"; on the dispatch sheet, where both badges show, the kind block's
caption says the Billable / Production badge below is the invoice line. **Decided: the default's
one exception** - an agreement's own AGREEMENT_GENERATED / AGREEMENT_INITIAL visit never defaults
to CALLBACK (nothing to answer), so a CALLBACK type there reads PRODUCTION; a MANUAL service on an
agreement customer keeps the type's CALLBACK. **The link** is `services.answersServiceId` (a self
FK): required on a CALLBACK, refused on anything else, the answered service at the same location,
COMPLETED and not itself a callback (so the callback rate per original service is one group-by) -
seven refusal codes (`CALLBACK_LINK_REQUIRED` / `_NOT_ALLOWED` / `_NOT_FOUND` / `_SELF` /
`_LOCATION_MISMATCH` / `_NOT_COMPLETED` / `_IS_CALLBACK`), chosen on the customer screen's New
Service line and Edit form (an Answers Select over the location's completed non-callback services)
and shown as "Answers <type> on <date>" on the Service Details, the queue and the dispatch sheet;
an opportunity of a CALLBACK type converts into a callback answering its source service, and one
with no source is refused rather than re-kinded. **Decided: the override is the price's rule** -
`ADJUST_PRICE_NON_AGREEMENT` (every role) on a non-agreement service, `ADJUST_PRICE_AGREEMENT`
(manager+) on an agreement one, at creation when the kind differs from the type's default and on
any later change of the kind or the link; a change is refused 409 `SERVICE_KIND_LOCKED` once the
ticket is finalized or the visit is invoiced (a DRAFT does not lock; a posted, unfinalized ticket
is the review moment) and audited as `work_kind_changed` ({ workKind, answersServiceId } before and
after); a type change never re-derives the kind and the ticket does not carry it. **Decided: the
type routes' writes are MANAGE_SETTINGS** (admin), as the other Settings cards are - they had no
gate at all; the card says "Admins manage service types." to everyone else. **The credit reads the
kind** (`productionBasisForService`): CALLBACK → basis CALLBACK $0, priced or not (no production on
callbacks); an agreement's PRODUCTION / SERVICE visit → SCHEDULED_AGREEMENT_SERVICE at the per-visit
value **whatever the count** - **decided: the slot counter goes and so does the cap**; an extra
visit past `expectedServiceCount` credits the per-visit value like any other, the designation is
the control, and a wrongly credited visit is visible where a real visit credited $0 was not. **The
$0 decision reads the kind before the plan** (`resolveServiceLineBillingTx` no longer reads a
production entry): an unpriced callback is AGREEMENT_COVERED "warranty callback - no charge" on
every plan - **decided: "warranty callback", not "covered by agreement", on a schedule-billed plan
too**, the more specific truth - and with no agreement at all (a warranty return on a one-time
job); a priced callback bills SERVICE "callback" on every plan, since it is not one of the plan's
paid visits; a DRAFT prices a callback $0 before its ticket exists (before this pass the DRAFT
showed the contracted amount and a price-less one-time service could not be drafted at all); the
batch preview's CALLBACK kind follows through the note. **PRODUCTION vs SERVICE drives nothing
yet** - the office's classification for the badge and later analytics; the ledger basis follows
the agreement link and billing follows the plan for both, as before. **Decided: the three CALLBACK
rows and their $0 lines stand as history** (append-only; Phase 7 owns adjustment entries); their
services carry the type's kind. **Migration** (`bootstrapServiceWorkKind`, three guarded steps,
each printed once): `service_types.work_kind` NOT NULL DEFAULT 'SERVICE' with every type printed
(all six → SERVICE; the office re-kinds its program and callback types in Settings),
`services.work_kind` backfilled from the type then NOT NULL DEFAULT 'SERVICE' (102 from their
type, 0 without one), `services.answers_service_id` with a partial index and the FK. **It has NOT
run against the shared dev DB: this pass's verification ran against a copy (`pestflow_verify`,
dropped afterwards); the migration is additive and safe under the owner's running server, and the
owner's `npm run dev:full` restart runs it and prints its ten lines.** Client: the Work Kind Select
on the Service Types form and the kind badge on the card; `ServiceWorkKindBadge` /
`ServiceWorkKindListBadge` (lists show the kind only when it is not the plain SERVICE; detail views
always); the Work Kind + Answers controls on the New Service lines and the Edit form (the kind
follows the type until touched; disabled with the reason; submit disabled while a callback has no
answer); the Services tab row's badge; the Service Details' Work Kind cell and answers line; the
dispatch queue's badge and answers line; the dispatch sheet's "Work kind per service" block; the
board's service dialog's Work Kind cell; an onError toast on the board's prefill. Not touched: the
technician's ticket (its Service Type select and its badges are unchanged), the surcharge line
(C3.6), the comp engine (Phase 7), C4.3b's add a service in the field, the opportunity flow beyond
the conversion's link, the billing-plan predicate, the technician's day. **Restart `npm run
dev:full` before manually testing - this pass adds three columns and changes the service bodies;
the Select, the badges, the picker and the sheet's block have not been rendered by anyone: the repo
has no browser automation and the session had no browser.** Signatures and behavior are under
"Shipped in Pass 24" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 26 (`feature/phase-4-opportunity-assignment-rules`, 2026-09-28, C4.1b) merged as PR #97.
**Opportunity assignment rules and zones.** Two org-scoped Settings tables on the target_pests /
opportunity_categories pattern - **decided: tables, not `app_settings` JSON lists** (a rule needs a
stable zone FK, typed columns and an order; a JSON blob has no row ids) - `zones` (name, `zipCodes`
text[], active, sort order, notes; unique on org + lower(name); `shared/zones.ts`) and
`opportunity_assignment_rules` (sort order; nullable matchers categoryKey / workType / zoneId FK /
source; `assignedUserId` users FK NOT NULL; active; `shared/opportunity-assignment.ts`). **Decided:
matching** - a null matcher matches anything; a zone matches when the first five characters of the
location's zip are on the zone's list (a ZIP+4 location matches its five-digit ZIP; a zone's list
is normalized to unique five-digit ZIPs and an entry that is not a ZIP or a ZIP+4 is refused by
name, never dropped); rules are tried in sort order and the first active, sound match assigns; no
match leaves the row unassigned exactly as before. **Decided: the actor and the action** - the four
runtime writers now insert through ONE storage helper, `insertOpportunityTx` (the dead
`createOpportunity` - no route, no caller - is deleted so nothing can insert around the rules),
which loads the rules, zones, users and categories once per transaction, reads the location's zip,
stamps `assignedUserId` / `assignedAt` / the new `opportunities.assignedByRuleId` on the insert and
writes one audit row `opportunity_auto_assigned` (a new action, not the manual `update`) under
`SYSTEM_AUDIT_ACTOR` ({ userId: null, actorLabel: "System" }, canon §17) with the manual row's
snapshot shape plus the rule's id and text ("Any category · Any work type · Zone North · Any source
-> Heritage Support"), so the History tells a rule from a person. **Decided: MANAGE_SETTINGS for
both lists' writes** (reads open; the manual assign stays ASSIGN_OPPORTUNITY - support should not
route every future opportunity to themselves). **Decided: no re-run** on a later category /
work-type change ("at creation"). **Decided: an inactive user is refused at save**
(RULE_ASSIGNEE_INVALID on create and on a change of the user) **and a rule whose user or zone later
goes inactive is skipped and reported on the card** through the same shared `describeRuleProblems`
the resolver reads, never re-pointed; an inactive rule is not considered. **Decided:
`assignedByRuleId`** (a nullable FK, nulled by a manual reassignment) is how the read knows: the
chips' assignee says "(auto)" and the manual `update` diffs the rule going to null beside the users
before and after - a person overriding a rule. **Decided: DELETE with a guard, plus deactivate** -
a zone named by a rule is 409 ZONE_IN_USE and a rule that assigned rows is 409 RULE_IN_USE (history
keeps its references); otherwise DELETE is 204; reordering is one `POST .../reorder { ids }` naming
every rule once (the card's Move up / Move down). Routes: `GET/POST /api/zones`, `PATCH/DELETE
/api/zones/:id`, `GET/POST /api/opportunity-assignment-rules`, `POST .../reorder`, `PATCH/DELETE
.../:id`; storage refusals carry codes (ZIP_CODES_INVALID / ZIP_CODES_REQUIRED / ZONE_NAME_REQUIRED
/ ZONE_NAME_TAKEN / ZONE_IN_USE / RULE_CATEGORY_UNKNOWN / RULE_ZONE_UNKNOWN / RULE_ASSIGNEE_INVALID
/ RULE_IN_USE / RULE_ORDER_INVALID). **Migration** (`bootstrapOpportunityAssignment`, three guarded
steps, each printed once): the two CREATEs with their indexes (no seed: the office names its own
zones, and with no rule every new opportunity stays unassigned as before) and
`opportunities.assigned_by_rule_id` with a partial index and the FK (no backfill: 30 rows, none
assigned). **It has NOT run against the shared dev DB: verification ran against a copy
(`pestflow_verify`, dropped afterwards); the migration is additive and the owner's `npm run
dev:full` restart runs it and prints its three lines.** Client: Settings -> Zones card (Add / Edit
dialog with a ZIP textarea that previews what is kept and, in amber, what will be refused; Delete
in the dialog; "Admins manage zones." for everyone else) and Settings -> Opportunity Assignment
card (rules in order with their matchers, "Any" where null, the user, Active, amber problem lines,
Move up / Move down, an Add / Edit dialog with four Selects and the assignee; "Admins manage
assignment rules." otherwise), both after Opportunity Categories; the taxonomy chips' assignee
reads "(auto)" with a title naming the rule's origin, on the queue and the location tab alike.
Found on the way and corrected in the docs: the follow-up opportunity for a one-time service is
written at office **finalization** (`finalizeServiceRecord` -> `ensureOpportunityForServiceRecordTx`,
canon §12), not at the technician's post as the Pass 26 handoff said; and the Pass 25 record named
the fourth writer `requestAppointmentCancelOrReschedule` (it is `dispositionAppointment` since
Pass 27). Not touched: the disposition flow's opportunity choices (C4.2), Smart Schedule (Phase
9), the categories' keys, the technician's view, a "this rule would assign ..." preview on the
card (the row called it optional), a bulk assignment of the 30 existing rows (the rules are
forward-only). **Restart `npm run dev:full` before manually testing - this pass adds two tables and
a column; the two cards, their two dialogs and the "(auto)" chip have not been rendered by anyone:
the repo has no browser automation and the session had no browser.** Signatures and behavior are
under "Shipped in Pass 26" at the end of `PLAN_ROADMAP_V2.md` Part D.

Pass 28 (`feature/phase-4-appointment-composition`, 2026-09-29, C4.3a) pushed, awaiting merge.
**Appointment composition on the server and the dispatch sheet, and cancelling ONE service.** Four
routes, each one transaction over `getLinkedServicesForAppointmentTx` and one audit row, with the
vocabulary in a new `shared/appointment-composition.ts`: **add** a service to a visit (`POST
/api/appointments/:id/services` - a pending service at the same location from the queue, or a new
one-time service created placed with its type's duration and price as defaults), **remove** one back
to the queue (`POST .../services/:serviceId/remove` - the disposition's RESCHEDULE semantics for one
service: PENDING_SCHEDULING, dates kept, `lastAppointmentId` stamped, the technician cleared),
change one's **type or duration** (`PATCH .../services/:serviceId`), and **cancel ONE service**
outright (`POST /api/services/:id/cancel`, placed or pending, the owner's review finding 5: a reason
from the settings list, the opportunity choice, a one-time service CANCELLED and taken off its
visit, an agreement service recycled with its window reset from today - never cancelled; ending the
plan is the agreement workflow). **Decided (1):** the representative (`appointments.serviceId`) and
`serviceTypeId` follow the first remaining sibling by creation when the current one leaves, never
null while a service remains. **Decided (2):** a service cancelled off a live visit is detached, and
`finalizeServiceRecord`'s rollup now skips CANCELLED linked services like the billing group, so a
cancelled sibling never holds a visit open. **Decided (3):** adding a service, or lengthening one,
extends `scheduledEndDate` by that duration; nothing shrinks it (the sheet says so). **Decided
(4):** `appointmentAuditSnapshot` carries notes, the end and each service's type / duration / kind.
**Decided (5):** `service_cancelled` on the service and `appointment_composition_changed` on the
appointment (add / remove / type / duration / notes, one row per request). **Decided (6):**
everything ungated like the disposition except an agreement service's type, which is
`ADJUST_PRICE_AGREEMENT` (403 `SERVICE_TYPE_LOCKED`). **Decided (7):** that lock holds on the
generic service PATCH too, whose lifecycle writes are now refused - status CANCELLED (409
`SERVICE_CANCEL_REQUIRED`), `appointmentId: null` (400), SCHEDULED -> PENDING_SCHEDULING while placed
(409 `SERVICE_REMOVE_REQUIRED`) - and the customer Edit form's type Select is disabled with the
reason. **Decided (8):** every service landing on a visit converts its open handoff opportunities
through one `convertPlacementOpportunitiesTx`, and the board's attach-from-queue and the grouped
placement's extras go through the add route. **Decided (9):** the cancel-reasons PATCH is
`MANAGE_SETTINGS`. The **last active service** is refused everywhere (`LAST_SERVICE_ON_APPOINTMENT`):
the sheet prompts to reschedule or cancel the appointment. A posted ticket, a settled service and an
issued invoice refuse. Client: the sheet's "Work kind per service" block is now the composition
block (type select locked with the reason, Minutes committed on blur, kind badge, answers line,
price, Remove / Cancel, "Add service" from the queue or a new one-time line); the cards' "+N other
services" and revenue skip CANCELLED; one `ServiceCancelDialog` component serves the sheet, the
queue row's new Cancel and the Services tab's new Cancel (disabled with the reason when it cannot
apply); the Settings reasons card is admin-only. **Migration**: one partial index,
`services_appointment_id_idx`, printed once; **it has NOT run against the shared dev DB** -
verification ran on a copy (`pestflow_verify`, dropped afterwards); the owner's `npm run dev:full`
restart creates it and prints one line. Found and left: `cancelAgreement` still writes CANCELED
directly (canon §11 notes it); the Services tab's Reopen posts `{ reason }` to a route that needs
`reasonCode` since Pass 17 (broken since then, noted in the roadmap record). **Restart `npm run
dev:full` before manually testing - this pass adds four routes, gates one, and none of the new UI
(the composition block, the last-service prompt, the two Cancel actions, the cancel dialog, the
disabled type select) has been rendered by anyone: the repo has no browser automation and the
session had no browser.** The owner's first render (2026-09-30, before merge) found the sheet
could not be scrolled - the composition block pushed the buttons below the fold of a sheet pinned
to the viewport's height; the second commit gives `SheetContent` `overflow-y-auto`, as the
technician's Appointment Details dialog already had. Signatures and behavior are under "Shipped in
Pass 28" at the end of `PLAN_ROADMAP_V2.md` Part D.

Next up: **Pass 29** — appointment composition in the field (`PLAN_ROADMAP_V2.md` Phase 4 table,
C4.3b): the technician's appointment details - each service displayed, editable on click (type, for
non-agreement work); Add service as a small button; adding extends the visit's duration and refuses
an overlap with the technician's next stop; instructions editable only on services the technician
added; an added non-agreement service is flagged for office review (owner, Part E answer 7); the
same routes as C4.3a. Branch from `origin/main` after confirming it contains Pass 28's merge. The
handoff prompt for Pass 29 is the last section of this file; the Pass 29 session writes the next one.

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
  - ~~**Service designation + callback attribution**~~ **Done — Pass 24**
    (`feature/phase-3-service-designation-callbacks`, 2026-09-27, C3.7): the **work kind**
    (`serviceTypes.workKind` / `services.workKind`, `SERVICE | PRODUCTION | CALLBACK`; the canon's
    "category" was renamed because `serviceTypes.category` already exists as free text and
    "designation" is the billing badge's word), the required `services.answersServiceId` link on a
    callback, the override under the price's permissions, the ledger basis and the invoice's $0
    decision reading the kind with the slot counter gone. See `CANONICAL_DOMAIN_RULES_V1.md` §10.
    `[Roadmap: Pass 24, C3.7]` As specified: `ServiceType.category`
    (`CALLBACK | PRODUCTION | SERVICE`) in Settings, instance designation on Service, and a required
    link from a callback to the Service it answers. Its urgency once came from plan-less agreements
    (every agreement carries a plan since Pass 12); the case it fixes is a COD-plan callback
    charged as a scheduled visit, and the scheduled visit past the count credited $0.
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
  - ~~**Field surcharge line.**~~ **Done — Pass 23** (`feature/phase-3-field-surcharge-line`,
    2026-09-27, C3.6): items (1)-(4) below as specified, the toggle on `agreementTemplates.
    fieldSurchargeAllowed` with the plan column dropped, the credit keyed off the recorded line
    under the transitional always-credit rule (`SURCHARGE_CREDIT_RULE`) until Phase 7's selector,
    and the two types gone from the vocabulary (Unit 15 Ledger Test's cleanout cleared at boot;
    the Quarterly Control template never carried a cleanout default - it carried a DOWN_PAYMENT,
    which stands). `[Roadmap: Pass 23, C3.6]` Owner-specified 2026-09-13 in the Pass 5.5 review. A cleanout surcharge
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
  - **Technician ticket modal — owner notes (2026-09-16, after Pass 8).** `[Roadmap: items 1-4 built as Pass 19, C3.3 (2026-09-25); item 5 Pass 29, C4.3b; item 6 Phase 9, with sale attribution in Pass 12]` Six items on the field
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
    left open (its "cleanout / down-payment surcharge" decision). Until the comp engine exists, a
    transitional rule stands in for a plan that answers "yes": since Pass 23 (C3.6) a SURCHARGE line
    recorded on the ticket ALWAYS credits the posting technician with its amount at finalization
    (`shared/field-surcharge.ts` `SURCHARGE_CREDIT_RULE`, written by
    `createProductionValueEntriesForFinalizedRecord`, marked transitional under development rule
    4); it replaced `createSurchargeEntryIfConfigured()`'s inference from the collector permission.
    Phase 7's selector replaces the rule, not the line.
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
final message. Written 2026-09-29, after Pass 28 was pushed as
`feature/phase-4-appointment-composition`. Its technician-side ground truth came from a read-only
Explore subagent's inventory of the working tree during Pass 28, plus the SQL it ran; the storage,
route and dispatch-page line numbers were re-read after Pass 28's changes landed. They are that
tree's, so run the SQL and grep the names before trusting any claim.

```text
Start Pass 29 — Appointment composition in the field
(PLAN_ROADMAP_V2.md Phase 4 table, row C4.3b; B13 :263-272 "Appointment Details" - "the tech view
gets the same, tucked behind selectors"; Part E answer 6 (dispatch and tech views both edit
services, the tech view behind selectors) and answer 7 ("Technician adds a service without
approval - Yes, flagged for review (C4.3b)"); the Phase 3 design rule at :357-358 (the field is a
PWA today and a native app later, so every field action is a route and every screen is data from a
read - no page-only logic); CANONICAL_DOMAIN_RULES_V1.md §11 "Composition (Pass 28)" and §12's
mobile workflow :1057 ("For non-agreement Services, technicians may adjust service type and price
as a staged field workflow ... Agreement-generated Services should keep service type and price
locked in the technician ticket flow"). Phase order: Pass 28 (C4.3a) closed the row before it, so
this is the next open Phase 4 row.) Read the CLAUDE.md docs in order first; CURRENT_FOCUS.md's last
two entries (Pass 28 and "Next up") are the ones that matter.

Branch feature/phase-4-field-composition from origin/main. Confirm main contains the Pass 28 merge
(feature/phase-4-appointment-composition) before branching.

The row: the technician's appointment details show each service, editable on click (type, for
non-agreement work); Add service as a small button; adding extends the visit's duration and refuses
an overlap with the technician's next stop; instructions editable only on services the technician
added; an added non-agreement service is flagged for office review; the same routes as C4.3a. The
owner's recorded decisions: B13 (duration is not edited from the tech side except that adding a
service extends the visit and must not overlap the next stop; instructions editable only on
services the technician added; "order instructions" = appointments.notes); Part E answer 7 (yes,
without approval, flagged for review); the Phase 3 design rule (every field action is a route);
canon §12 :1057 (type and price editable in the field on non-agreement work only). Decide and state,
in the pass: (1) what "flagged for office review" IS - no service-level flag exists (services has no
review / flag / origin column; service_records.ticketStatus FLAGGED_FOR_REVIEW is invoice-driven and
canon §12 :949-955 defines it so - reusing it changes its meaning): recommend a new nullable
services.addedInFieldByUserId (users FK, stamped by the field add, never cleared) plus a
services.fieldReviewedAt / fieldReviewedByLabel pair the office sets from the review modal or the
sheet, surfaced as a "Field-added - review" badge on the dispatch sheet's composition block, the
Services tab and Service Ticket Review; the alternative is an app_settings-free boolean column
reviewRequired - state which and why; (2) "services the technician added" needs an identity - no
technician row has user_id set on the dev DB, technician-work.tsx picks its technician from a free
Select (:268-283) and GET /api/technicians/:id/work checks nothing against the session: recommend
attributing by the session user (getAuditActor / req.user.id into addedInFieldByUserId) and gating
"instructions editable" on services.addedInFieldByUserId === req.user.id, never on the technician
picker; say whether the work route should start refusing a technician whose users row is not linked
(technicians.userId) or stay open (recommend: stay open, note C5.7); (3) the overlap rule - nothing
computes a next stop anywhere (client or server; the only "conflict" in the tree is the cancel
reason "Schedule conflict"): recommend a server check inside the add route when the origin is
FIELD - the technician's next appointment that day (assigned to the same technician, scheduledDate
after this visit's, not CANCELED, isBoardPlacement's rule) and 409 NEXT_STOP_OVERLAP when the
extended planned end (extendPlannedEnd) would pass its scheduledDate; the office's add from the
sheet stays unchecked (B13 gives the constraint to the field) - state whether the office path gets
a warning instead; (4) how the field add reaches the route - POST /api/appointments/:id/services
takes { serviceId } or { service: {...} } with no origin: recommend an `origin: "FIELD"` field on
the body (default OFFICE) that turns on the overlap check, the flag stamp and the one-time-only rule
(a technician may add MANUAL work only; the queue's agreement services are the office's), or a
separate /field route - state which; (5) the type edit on click - the ticket dialog already edits
the type at post (service-completion-dialog.tsx :806-820, allowServiceOverride =
!isAgreementGeneratedService || ADJUST_PRICE_AGREEMENT) and PATCH
/api/appointments/:id/services/:serviceId exists (SERVICE_TYPE_LOCKED on agreement work, 409
SERVICE_HAS_TICKET once a ticket is posted): recommend the details' per-service type select posts
that PATCH and the technician role is enough (the route is ungated; the lock does the rest); (6)
instructions - which notes: B13's "instructions editable only on services the technician added"
means services.notes (the service's own "Instructions"), not appointments.notes ("Appointment
Notes", read-only in the field); the generic PATCH /api/services/:id is ungated, so a technician can
already PATCH any service's notes - recommend a technician's notes PATCH be refused 403 unless
services.addedInFieldByUserId is theirs (a new check in updateService keyed on actorRole ===
"technician"), and say so; (7) whether the field's details show the kind badge, the answers line,
the duration and the price it has (getTechnicianWork returns whole service rows; the page renders
none of them - technician-work.tsx :425-457): recommend the kind badge and duration yes, the price
through ServiceBillingBlock as today; (8) a gate - everything here is ungated; recommend no new
permission (POST_SERVICE_TICKET is held by every role and read by nothing), the field add allowed
for the technician role with the flag as the control, C5.6 later.

Ground truth today (line numbers from the working tree at the end of Pass 28; they drift, the names
do not; the Pass 28 lines are fresh, the technician-side ones were inventoried by a read-only
Explore subagent during Pass 28 and re-checked):
- Routes added by Pass 28 (server/routes.ts, 3400 lines): updateServiceSchema :232 (appointmentId
  string only); newPlacedServiceSchema :246, appointmentServiceAddSchema :255 (strict, exactly one
  of serviceId / service), appointmentServiceUpdateSchema :263, serviceCancelSchema :271;
  respondServiceCompositionError :565; PATCH /api/services/:id :1726 (ServiceCompositionError
  mapped); POST /api/services/:id/cancel :1750; POST /api/services/:id/complete :1780; POST
  /api/appointments :2078; PATCH /api/appointments/:id :2098 (passes the actor); POST
  /api/appointments/:id/services :2128; POST .../services/:serviceId/remove :2148; PATCH
  .../services/:serviceId :2162; POST /api/appointments/:id/disposition :2206; the technician alias
  :2236; GET /api/technicians/:id/work :1404 (no gate, no session check); GET /api/services/pending
  :1427; PATCH /api/settings/appointment-cancel-reasons :2411 (MANAGE_SETTINGS since Pass 28). No
  route carries an origin for the add; no route computes a next stop.
- Storage (server/storage.ts, ~11960 lines): ServiceCompositionError :771; the four input
  interfaces :778-810; TechnicianWorkVisit :921 ({ appointment, customer, location, services:
  [{ service, serviceRecord }] } - whole rows, so expectedDurationMinutes, workKind,
  answersServiceId, notes, agreementId, source, priceCents and the appointment's scheduledEndDate /
  notes travel; the client keeps its own copy of the type at technician-work.tsx :25-35);
  serviceAuditSnapshot :1575; appointmentAuditSnapshot :1601; getLinkedServicesForAppointmentTx
  :2358; syncServicesForAppointmentTx :2377; createService :3631; updateService :3674 (the Pass 28
  refusals at its top: SERVICE_CANCEL_REQUIRED, SERVICE_REMOVE_REQUIRED, assertServiceTypeUnlocked;
  notes is NOT gated by role); deleteService :3767; cancelAgreement :4830 (still writes CANCELED
  directly); createAppointment :5065; convertPlacementOpportunitiesTx :5111; updateAppointment
  :5155 (the NOTES audit row); dispositionAppointment :5221; resolveAgreementWindowResetTx :5364;
  applyServiceOpportunityChoiceTx :5382; the composition block :5493-5983 -
  loadComposableAppointmentTx :5493, activeVisitServices :5509, assertVisitNotInvoicedTx :5513,
  assertServiceUnsettled :5524, assertNoTicketTx :5530, assertServiceTypeUnlocked :5543,
  reassignRepresentativeTx :5557, attachServiceToAppointmentTx :5576 (SCHEDULED + technician, the
  representative, extendPlannedEnd, the conversion - the place a FIELD origin would stamp the flag
  and check the next stop), recordCompositionChangeTx :5620, addServiceToAppointment :5641 (a new
  service is MANUAL at the visit's location with the type's defaults), removeServiceFromAppointment
  :5743, updateAppointmentService :5786, cancelService :5870; timeInAppointment :5984;
  getTechnicianWork :6020 (assigned technician + the day, ne CANCELED, ordered by scheduledDate -
  the day's list IS the next-stop source, but it stops at midnight and is N+1); completeService
  :6347 (allowFieldServiceOverride at its type / price write); finalizeServiceRecord :6596
  (allFinalized :6654 now skips CANCELLED); getAppointmentCancelReasons :6901.
- Shared: shared/appointment-composition.ts (199 lines, new): the request / result shapes :21-82,
  the codes :84-108, isActiveOnVisit :111, pickRepresentative :122, plannedEndOf :136,
  extendPlannedEnd :154 (the pure end rule a next-stop check would reuse), PLANNED_END_RULE_TEXT
  :169, describeServiceCancelEffect :173, describeCompositionRefusal :182 (add NEXT_STOP_OVERLAP's
  text here). shared/appointment-disposition.ts: isBoardPlacement :125 (the "counts as a stop"
  predicate). shared/schema.ts: services :196-247 (no flag / origin / review column; source is
  MANUAL | AGREEMENT_GENERATED | AGREEMENT_INITIAL - there is no FIELD source; workKind :238,
  answersServiceId :244), appointments :249-285 (scheduledEndDate :261 is the planned end),
  serviceRecords ticketStatus :556 and the flag columns :557-560 (flaggedAt / flaggedByUserId /
  flaggedByLabel / flagReason - invoice-driven, canon §12 :949-955), technicians.userId :191 (the
  users bridge, nullable, unique where set). shared/ticket-status.ts: isTicketFinalized :35,
  isTicketInOfficeReview :40, technicianMayPostTicket :55. shared/permissions.ts: the technician
  holds POST_SERVICE_TICKET (read by nothing), ADJUST_PRICE_NON_AGREEMENT, ADD_FIELD_SURCHARGE,
  TAKE_PAYMENT_FIELD :84-89; no permission resembles "add a service in the field".
- Client, technician day (client/src/pages/technician-work.tsx, 579 lines, untouched by Pass 28):
  local TechnicianWorkService / TechnicianWorkVisit :25-35; queries :114-120 (technicians, service
  types, the cancel reasons, `/api/technicians/${id}/work?date=`), useVisitBillingSummary :131,
  location notes :137-143; refreshWork :163-169 (invalidates the work key, appointments,
  service-records, services/pending, opportunities - add services and the location keys for the
  composition); timeIn :170-176, cancelReschedule :177-212, timeOut :219-225; the technician picker
  :268-283 (a free Select over ACTIVE technicians, default "" - nothing shows until one is chosen;
  the session user is used only for TAKE_PAYMENT_FIELD :111-112); the visit cards :318-341; the
  Appointment Details dialog :345-477 - header / time grid :350-367, Time In / Out / Request
  Reschedule / Cancel Appointment :368-389, "Appointment Notes" (appointments.notes, read-only, only
  when non-empty) :409-414, "Location Notes" :415-422, "Linked Services" :423-470 (heading :424; each
  row an inline div :428-435: the type name :431, service.notes || "No service instructions." :432,
  a "Ticket Posted" / status badge :434, the posted-record box :436-442, ServiceBillingBlock :444,
  the ticket button :446-454 via getTicketActionLabel :84-89 / canOpenTicketEditor :91-93); the
  visit totals and Collect Payment :458-469; the ServiceCompletionDialog wiring :561-576. No kind
  badge, no answers line, no duration, no agreement / source marker on a service row; no edit
  affordance anywhere. The Add service button sits naturally after the map at :457 or beside the
  heading at :424; the per-service edit-on-click inside :428-435.
- Client, the ticket (client/src/components/service-completion-dialog.tsx, 1129 lines): props
  :53-73 (mode "post" | "office-edit"); the Instructions block :536-553 / :754-766 shows agreement
  serviceInstructions, service.notes and location notes - NOT appointments.notes ("never typed
  here (instructions are edited where they live)" :540-541); allowServiceOverride :304 and the type
  Select :806-820 (locked label + agreementLockNote :306 otherwise); the post body :569-601
  (serviceOverridePayload :498-505 sends serviceTypeId / priceCents only when allowed).
- Client, dispatch (client/src/pages/schedule.tsx, 1963 lines after Pass 28): AppointmentSheet
  :194 with the composition block :399 (sheet-composition - the office's version of what the field
  gets: per-service type select / Minutes / kind / answers / Remove / Cancel, "Add service" from the
  queue or new), the last-service prompt :820, servicesByAppointmentId :991 (skips CANCELLED),
  scheduleMutation :1135 (the extras through the add route), attachServiceToAppointmentMutation
  :1235, addServiceMutation :1269, removeServiceMutation :1280, updateVisitServiceMutation :1291,
  cancelServiceTarget :1303, editingQueueCandidates :1495, ticketedServiceIds :1499, the queue row
  :1839 (div[role=button] + Cancel), ServiceCancelDialog :1941. The sheet has no "field-added"
  badge and no review action - decision (1) adds one. client/src/components/service-cancel-dialog.tsx
  (232 lines, new): ServiceCancelDialog { service, serviceTypeName, open, onOpenChange, onCancelled }
  - reusable from the technician page if the field gets a cancel (B13 does not ask for one; the
  alias route is the field's cancel).
- Client, customer screen (client/src/pages/customer-detail.tsx, 4302 lines): ServiceForm :2563
  (canChangeType :2616 - the Edit type Select disabled on agreement work without
  ADJUST_PRICE_AGREEMENT), ServicesTab :3059 (cancelService :3085, cancelDisabledReason :3374, the
  row's Cancel :3461, ServiceCancelDialog :3500; reopenTicketMutation :3286 still posts { reason } -
  the Pass 17 defect, noted and left twice).
- Bootstraps: server/service-scheduling-bootstrap.ts - bootstrapAppointmentComposition (Pass 28,
  the partial index, printed once; indexExists() :13-18 beside columnExists / tableExists) is the
  newest model for a one-step guarded migration; bootstrapOpportunityAssignment (Pass 26) for a
  column + FK + backfill count. A new services column (decision 1) is an additive migration: run the
  verification on a copy (DEV_NOTES.md) so the owner's restart prints it.
- DB today (run the SQL, never trust a doc's data claim; the shared dev DB was untouched by Pass
  28, whose verification ran on a copy - so its index does not exist there until the owner's
  restart): technicians 2 (both ACTIVE, both user_id NULL); users technician 1 / support 1 /
  manager 1 / admin 1; service_records 75 - FINALIZED 65, OFFICE_REVIEW_PENDING 10 (all 10 with
  confirmed = true, so they read finalized - there is NO genuinely pending ticket: a smoke test
  posts one); no FLAGGED_FOR_REVIEW, no REOPENED; appointments 120 - CANCELED 34, COMPLETED 54,
  IN_PROGRESS 2, SCHEDULED 30; 74 appointments with 1 service, 7 with 2, 1 with 3; assigned
  appointments with NULL scheduled_end_date: CANCELED 3, COMPLETED 4, SCHEDULED 4 (a next-stop rule
  must handle a null end - plannedEndOf falls back to the representative's duration, else null);
  services 103 - PENDING_SCHEDULING 0 (the queue is EMPTY: create fixtures), by work_kind / source
  CALLBACK/MANUAL 1, SERVICE/AGREEMENT_GENERATED 33, SERVICE/AGREEMENT_INITIAL 17, SERVICE/MANUAL 52;
  audit_logs: no service_cancelled or appointment_composition_changed rows yet (Pass 28's fixtures
  were deleted); app_settings appointment_cancel_reschedule_reasons unchanged (8 entries); 46
  public tables.
- Docs to carry: the C4.3b row (PLAN_ROADMAP_V2.md :384) and C4.4 :385; B13 :263-272; the gap rows
  :109 (a second service from the field is C4.3b), :137 (PARTIAL - the tech modal is C4.3b) and
  :131 / :135 / :136 whose technician-work.tsx line citations are stale (ServiceBillingBlock is :444,
  VisitDueTodayTotal :461, refreshWork :163-169, the dialog :345-477); Part E answers 6 and 7;
  "Shipped in Pass 28" (its "Not touched" names C4.3b); canon §11 "Composition (Pass 28)" (ends "The
  technician's side of the same routes is C4.3b"), §12 :949-955 (FLAGGED_FOR_REVIEW's definition -
  extend it or leave it, per decision 1) and :1040-1060 (the mobile workflow); CURRENT_FOCUS.md's
  Pass 28 entry and its "Next up".

Build per C4.3b: (1) server - the field's add through the C4.3a add route with the decisions above:
an origin (or a field route), the one-time-only rule for a technician's add, the flag stamp
(decision 1's column, a guarded additive migration on the Pass 26 / Pass 28 model), the next-stop
overlap check (409 NEXT_STOP_OVERLAP naming the next stop's time, shared/appointment-composition.ts
carrying the code and its text; the check reads the technician's day the way getTechnicianWork
does and uses extendPlannedEnd for the would-be end), all inside the existing transaction and
recorded in the same appointment_composition_changed row (composition.origin, composition.flagged);
a technician's notes PATCH on a service refused unless they added it (decision 6); the office's
review of a field-added service (a small route or a mode on the composition PATCH that clears the
flag, audited) - reachable from the dispatch sheet's composition block (a "Field-added" badge with
"Mark reviewed") and, if cheap, Service Ticket Review. (2) The technician's appointment details:
each linked service row becomes clickable - the type select on non-agreement work (PATCH
.../services/:serviceId; an agreement service shows the locked label as the ticket dialog does),
the kind badge and duration shown; "Add service" as a small button after the list opening a
compact form (service type, minutes defaulting to the type's, price defaulting to the type's,
instructions) that posts the add with the field origin and shows the NEXT_STOP_OVERLAP refusal as a
message naming the next stop; instructions (services.notes) editable inline only on services the
technician added; the "Appointment Notes" block stays read-only; refreshWork invalidates what the
composition changes. (3) The dispatch sheet: the "Field-added - review" badge on the row and the
review action. (4) Docs: canon §11 / §12, the roadmap rows, the row and a "Shipped in Pass 29"
record, CURRENT_FOCUS. Not touched: the technician picker (C5.7 merges identities), a gate on GET
/api/technicians/:id/work, crew (C4.4), the office's overlap warning unless decided otherwise, the
ticket dialog's own type / price edit at post, cancelAgreement's direct CANCELED write, the
Services-tab reopen defect, C5.6.

Environment: Node 24.21.0, npm run dev:full (restart it before manually testing), DEV_NOTES.md for
the DB backup / restore, the copy-database recipe and the PowerShell traps, gh logged in so the
session can open the PR. Verify on PORT=5001 as the previous passes did, against a copy per
DEV_NOTES.md since this pass adds a column (Passes 23-28 used the copy so the owner's restart prints
any migration): npm run check; double boot (boot 1 prints the migration once - and, because the
shared DB never ran Pass 28's, the copy taken from it prints Pass 28's index line too, which is
expected; boot 2 prints only "serving on port 5001" with every table count unchanged); the pass's
API smoke test as all four roles (a technician's day with two visits an hour apart through the real
routes; a field add of a one-time service that fits (SCHEDULED, flagged, the end extended, the audit
row with the origin) and one that would overlap the next stop refused 409 NEXT_STOP_OVERLAP with
nothing written; the office's add of the same not refused (or warned, per the decision); a
technician adding an agreement service or a service at another location refused; the type change
on a non-agreement service by the technician 200 and on an agreement one 403; a technician's notes
PATCH on their own added service 200 and on another service 403; the office marking the flag
reviewed with its audit row; the technician's day read carrying the new fields; the generic PATCH
still refusing the lifecycle writes; every fixture deleted, counts back at baseline) and a Vite 200
on every touched client module; state plainly what was not rendered - the technician's details, the
add form and the badge cannot be judged without a browser.

Working agreement as always: one pass, one branch, update CURRENT_FOCUS and the roadmap's pass
table at the end, replace the handoff prompt at the end of CURRENT_FOCUS.md with the one for the
next pass (phase order: Pass 30, technician preferences and crew, C4.4, whose spec is its row in the
Phase 4 table, unless I say otherwise), push, open the PR and stop. I merge.
```
