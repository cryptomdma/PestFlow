# PLAN_ROADMAP_V2 — Phases 2-9, pass by pass

> The plan for everything after Phase 1. `PLAN_BILLING_V1_1.md` (D1-D9) and its execution doc stay
> the record of what Phase 1 decided and built; this document schedules the rest of the owner's
> notes as pass-sized units, records where those notes contradict decisions the repo already holds,
> and carries the owner's answers (review of 2026-09-19). `CURRENT_FOCUS.md` still says which pass is
> next; this file says why, and what comes after.
>
> Written 2026-09-17 from a read-only inventory of `origin/main` at PR #71 (`be4389d`) — three
> Explore sweeps over the client, server and schema, plus the docs. File:line citations in Part A are
> from that commit and will drift; the file names will not.

**How to read this.** Part A is ground truth: every note the owner wrote, classified done / partial
/ absent with the file that proves it. Part B is the list of notes that contradict or misread a
recorded decision, each with the resolution. Part C is the roadmap: nine themed phases, each a table
of passes with dependencies. Part D is the full spec of the next pass. Part E is the decision log.

**Mapping to older citations.** `PLAN_BILLING_V1.md` and several Phase 1 notes say "Phase 2" for card
processing and "Phase 2.5" for the compensation engine. Here those are **Phase 6** and **Phase 7**;
V1's "Phase 3 — Comms" is **Phase 8**, "Phase 4+" is **Phase 9**. Where an older doc says "Phase 2",
read Phase 6.

**Pass discipline is unchanged** (`AGENT_WORKING_AGREEMENT.md`): one pass per session, one branch
from `origin/main`, `npm run check` + double boot + the pass's smoke test before the push, then the
PR opened by the session (owner, 2026-09-24); never merged by it, never pushed to main. A pass that changes server code needs the owner's `npm run dev:full`
restarted before manual testing. Every pass ends by writing the next pass's handoff prompt (the last
section of `CURRENT_FOCUS.md`, and the session's final message; owner, 2026-09-23). Pass sizes below
are calibrated to Phase 1's: Pass 6 (four tables, routes, three dialogs) is the ceiling.

---

## Part A — Ground truth: what exists today (inventory of 2026-09-17)

### A1. Customer screen and accounting

| Note | Status | Evidence |
|---|---|---|
| Names/addresses hyperlinked — dispatch board cards | DONE | `schedule.tsx:998-1012` customer label navigates to `/customers/:id?locationId=` |
| … — dispatch appointment sheet, hover card, Service Details dialog | ABSENT | `schedule.tsx:220-225, 370-371, 1036` plain text |
| … — Service Ticket Review list + modal | PARTIAL | plain text at `service-ticket-review.tsx:486, 538, 546`; only an "Open Location" button at `:648`; batch rows plain at `:695` |
| … — Service History page / location Services tab | ABSENT | `services.tsx:386` plain span; Services tab has no customer column (`customer-detail.tsx:3054-3063`) |
| … — invoice rows | ABSENT | customer and location are plain text on both invoice surfaces |
| Aging report (current/30/60/90/90+) | DONE — Pass 14 (2026-09-24) | `GET /api/reports/aging` behind the Reports page's Aging section, and `GET /api/customers/:id/aging` on the customer screen; buckets Current (0-30) / 31-60 / 61-90 / Over 90 **days since invoiced** (B20), derived in `shared/aging.ts` at read time, nothing stored. See "Shipped in Pass 14" at the end of Part D. Was: only `isOverdue()` in `invoices.tsx:56` (still the Overdue tile's due-date test, deliberately distinct) and an Overdue count in `reports.tsx:207` |
| Customer-wide (all locations) balance in the header | DONE — Pass 14 (2026-09-24) | `CustomerAgingChips` beside the primary-location chip (`customer-detail.tsx:3661`): Open $X across all locations, the oldest bucket, on account, pending confirmation - a rollup of the locations; the balance still lives at each location. Was: the header card showed no money |
| Location balance below location notes | DONE — Pass 14 (2026-09-24); placement revised in Pass 15b (2026-09-25, owner's note) | `LocationAgingSummaryRow` inside `LocationNotesPanel`, one row directly below the notes (Current always, other buckets only when owed, on account / pending, no invoice links); the full `LocationAgingStrip` with the invoices behind each bucket moved to the Invoices tab under the ledger panel. Was: the strip as a second card under the notes panel in the profile grid's right column. The Ledger panel's Balance card and the switcher's Open / on-account line (`getLocationBalancesByCustomer`) are unchanged and agree with it (verified) |
| Preferred technician (location + customer level) | ABSENT | no column, no UI anywhere |
| "Make Primary" inside the contact modal | PARTIAL | inline button on the contact card (`customer-detail.tsx:3824-3835`); the add/edit dialog already has an `isPrimary` checkbox (`ContactForm`, `:340-360`) |
| Customer/account history log for all changes | PARTIAL | `audit_logs` + History tab exist (Pass 2). Only `updateLocationProfile()` writes `customer` / `location` `update` rows (`storage.ts:2186-2222`). No `contact` / `account` / `agreement` / `appointment` entity in `shared/audit.ts`. No revert. |
| Payment without an invoice (cash/check) | DONE | `record-payment-dialog.tsx:96` sends `applyToInvoiceId: null` when no invoice; opens from the ledger panel (location-level and per-invoice) and the Invoices screen |
| Pre-payments / deposits (half-down at scheduling) | DONE | an unapplied payment designated to the agreement (`payments.designatedAgreementId`, `schema.ts:738`, D4); offered first by the D4 prompt and the field's "COA available" |
| Payment application (+ release) UI | DONE | `ApplySourceDialog` (`location-ledger-panel.tsx:102-175`) applies one payment or credit memo to a chosen invoice; Release exists on applications; the D4 "Apply location balance" prompt fires after Generate and from open rows |
| Invoice generation checks location unapplied balance and prompts | DONE | Pass 6, `apply-location-balance-prompt.tsx`, wired into `invoice-on-finalize-prompt.tsx:20` |
| Card / ACH / auto-draft framework | ABSENT | enums named, route refuses them (Pass 6); no `payment_methods`, no provider port |
| Widen the New Service modal | ABSENT | bare `<DialogContent>` (`customer-detail.tsx:3045`), default `sm:max-w-lg`; Edit Location uses `max-w-2xl` |
| COA applied by support, role-gated | DONE | `APPLY_PAYMENT` is support+ (`permissions.ts:60,76`); technician cannot apply |
| COA "auto-adjusts the service price with notation" | **REJECTED by D6** | COA is a payment application; Price / COA / Due today is what ships (Pass 7). See B3. |
| Billing Plans tied to agreement templates, replacing billing frequency | DONE | Pass 3.5 selector, Pass 9 column drop |
| Billing profile changeable from the customer screen (edit / add location) | ABSENT | no selector in either dialog; only a "Billing Override" badge (`customer-detail.tsx:3633,3659`). Resolution exists server-side: `resolveBillingProfileForLocation()` (`storage.ts:2522`) location override → account default |
| Default billing profile option in Settings | ABSENT | `customers.defaultBillingProfileId` exists (`schema.ts:20`) with no UI; no org-level default |
| "Monthly billing" in template invoice terms | **MISREAD**; the statement B5 asked for instead is DONE — Pass 15 (2026-09-25) | terms are `DUE_ON_RECEIPT / NET_15 / NET_30 / NET_60` (`settings.tsx:423-432`); monthly cadence is a Billing Plan, not a term. See B5. The statement: `shared/statements.ts` (the arithmetic), `server/documents/statement-pdf.ts` (the document), `StatementDialog` on the location Invoices tab and the customer header. See "Shipped in Pass 15" at the end of Part D. |
| Agreement Type as a dropdown | ABSENT | free-text `Input` at `settings.tsx:1130`; `agreements.agreementType` is untyped text; seed holds "Residential Recurring" etc. |

### A2. Invoices, ticket review, services

**What an invoice row carries today** (the thing the modal absorbs):

- Invoices screen row (`invoices.tsx:441-514`): status icon + derived badge (incl. client-only
  "overdue"), number, customer name, location or a red "No location", issued date, draft note, due
  date, "Sent <date>", Paid / Balance, "$Z pending confirmation", total. Controls: Open/Preview PDF,
  Download, Mark Sent (`SEND_INVOICE`), **Issue** (DRAFT, `GENERATE_INVOICE`, 409 → prefinalization
  confirm), **Record Payment** (`TAKE_PAYMENT_FIELD`), **Void** (not gated client-side; server gates
  `VOID_INVOICE`). Not on it: notes/due-date edit, applications, apply balance, release, line items,
  any link to the visit or ticket.
- Location Invoices tab (`InvoiceRowLedger`, `location-ledger-panel.tsx:346-402`): Paid / Due /
  pending line, sent stamp, the same document actions, **Applications** toggle → per-application
  rows with **Release** (`APPLY_PAYMENT`), **Record Payment**, **Apply location balance**.
- **No invoice detail dialog exists.** **No `GET /api/invoices/:id`** — only `GET /api/invoices`
  (bare rows, no joins), `PATCH /api/invoices/:id` (notes + dueDate, `SEND_INVOICE`, **no client
  caller**), `GET /api/invoices/:id/line-items` (`routes.ts:1873`, **no client caller — line items
  are never rendered anywhere in the app**), `/ledger`, `/location-balance`, `/document-info`,
  `/document`. Lines carry `serviceId` + `serviceRecordId` (`schema.ts:843-866`), so ticket links are
  possible from data that already exists.

| Note | Status | Evidence |
|---|---|---|
| Invoice modal from the Invoices tab with full capabilities | ABSENT | see above |
| Invoice → service ticket link (system-wide) | ABSENT | no row renders `appointmentId` / `serviceRecordId` |
| Service → invoice link | PARTIAL | Services tab Invoice column switches to the Invoices tab without selecting the row (`customer-detail.tsx:3108-3135`); `ServiceDetailModal` shows number + status, no link (`:2750-2759`); Ticket Review shows nothing |
| Void in the modal | ABSENT (Void is inline) | `invoices.tsx:499-509` |
| Payment collection from the invoice: cash / check | DONE | Record Payment on both surfaces, applies directly when an invoice is given |
| … card on file / process card | ABSENT (Phase 6) | route refuses CARD / ACH |
| "Send to customer" — email | ABSENT | no transport anywhere; `nodemailer` appears only as a dead esbuild external (`script/build.ts:22`) |
| … — print | ABSENT as an affordance, trivially available | the PDF opens in a new tab; no `window.print`, no print stylesheet |
| Batch Invoice on the Invoices screen | DONE — Pass 13 (2026-09-24) | `BatchInvoiceDialog` (`client/src/components/batch-invoice-dialog.tsx`) behind the Invoices screen's header button; result rows open the invoice modal; Send All kept; Service Ticket Review lost the button and dialog. See "Shipped in Pass 13" at the end of Part D. Was: lived on Ticket Review (`service-ticket-review.tsx:407-417, 666-755`) |
| Batch by route / technician, grouped by date | DONE — Pass 13 (2026-09-24) | `technicianId` on `GET /api/invoices/batch-preview` and `POST /api/invoices/batch-generate` (`BatchInvoiceFilters`, `shared/batch-invoice.ts`); the preview groups technician → service date → visit (`groupBatchInvoicePreview`), a "route" being a technician on a day since `appointments` carry no route columns. Was: date range only; the page's Technician filter was not passed (`:345-348`) |
| Batch auto-charges cards on file | ABSENT (Phase 6) | — |
| Batch date range labelled as posting date | DONE — Pass 13 (2026-09-24) | the dialog's inputs are "Posted from" / "Posted to" and its copy says "posted between"; the server still filters `postedAt ?? serviceDate` (`getServiceRecordsReadyForBillingInRange`). Was: a bare "from through to" subtitle (`:672`) |
| Appointment-based invoicing (one visit, one invoice) | DONE | D1 / Pass 3 |
| Generate Invoice from the Ticket Review modal, generate-and-send | PARTIAL | the on-finalize prompt (Pass 5: Generate / Generate & Send / Later) is the only Generate on that page (`service-ticket-review.tsx:216`); a ticket finalized with "Later" or under `OFF` has no Generate on the modal afterwards — only Batch or the Invoices screen |
| … "sends invoice / service report to customer" | PARTIAL | invoice = `sentAt` stamp + pinned PDF (Pass 10); no service report document exists |
| Paid status derived; check deferred until cleared; cash paid only by a manager | DONE, by a different mechanism | status derives from confirmed applications; `payments.status = PENDING` and `pendingAppliedCents` carry "pending" — there is **no invoice-level PENDING status** and none is needed (see B4) |
| "Invoices are not being created upon finalization" | DONE | Pass 5; under `PROMPT`, "Later" creates nothing by design |
| "New Invoice" links to an existing service, pre-finalization, and becomes the visit's invoice | DONE — Pass 13 (2026-09-24) | New Invoice is gone from the Invoices screen; **"Draft invoice for a visit"** (`draft-invoice-for-visit-dialog.tsx`: customer → location → draftable visit → Pass 4's `draft-for-appointment` route, the DRAFT opening in the modal) takes its place, and the manual invoice survives only as **"Add fee / adjustment"** on the location ledger panel (`add-fee-adjustment-dialog.tsx`, the location fixed, B6). Was: the capability existed only on the Services tab as Draft invoice, and "New Invoice" was the *manual* invoice (one `ADJUSTMENT` line, no service reference; `routes.ts:1853-1861`, `storage.ts:4895-4952`). |
| Review modal: price/payment details, address, Next/Back | DONE | Pass 7.6 (`service-ticket-review.tsx:517-583`) |
| Review modal: office Edit button (role-gated) | DONE — Pass 18 (2026-09-25) | was: modal read-only, footer Open Location / Close / Reopen / Finalize (`:648-657`). Now Edit (`EDIT_TICKET`; disabled "reopen first" on a finalized ticket) opens `service-completion-dialog.tsx` in `mode="office-edit"`, saved through the gated PATCH with the Service's price / type under the post's rule (see "Shipped in Pass 18" at the end of Part D) |
| Review modal: reopen reason as a pop-up with a settings list, "Other" requires text | DONE — Pass 17 (2026-09-25) | was: inline free-text `Textarea` (`:643-646`), `reopenReason` text only, no code column, no settings key. Now `ReopenTicketDialog` over `ticket_reopen_reasons`, `reopenReasonCode` + text, Other gated by `REOPEN_TICKET_OTHER` (see "Shipped in Pass 17" at the end of Part D) |
| Reopen must be role-authorized | DONE | `REOPEN_TICKET` support+ (`routes.ts:1669`), reason required, audit-logged (Pass 8) |
| Fields immutable once posted / finalized (price, service date, collection data) | DONE — Pass 16 (2026-09-23) | was **NOT ENFORCED**: `PATCH /api/service-records/:id` had no permission gate and no status guard, `updateServiceRecord` blind-wrote (and completed the Service on `confirmed`), and `completeService` re-posted over a FINALIZED record and reset its stamps. Now the PATCH is `EDIT_TICKET` (support+), content-only and strict, 409 on FINALIZED; a re-post is refused on FINALIZED (anyone) and on a ticket in review without `EDIT_TICKET`; every accepted edit or re-post writes `ticket_edited`; the rules are `shared/ticket-status.ts`, read by the technician view too. See "Shipped in Pass 16" at the end of Part D. Payment records were already immutable (Pass 6). |
| Technician ticket: add a second service / surcharge line / Generate Proposal | ABSENT | none in `service-completion-dialog.tsx`; `ADD_FIELD_SURCHARGE` permission exists (`permissions.ts:9`) with no UI; `lineType: "SURCHARGE"` exists in schema |
| Invoice document: Bill To from the primary location / billing profile; a Service Location block (owner, 2026-09-21) | DONE — Pass 11c (2026-09-21) | was a defect: `getInvoiceDocumentContext` fell back to the **service** location's live address when no profile address was snapshotted, which was every invoice on the dev DB. Now the parties are frozen at issue in `billingProfileSnapshot.billTo` / `.serviceLocation` by `resolveInvoicePartiesTx` on every issuing path, the renderer prints Remit To / Bill To / Service Location, and the 64 pre-11c rows (45 with no snapshot, 19 profile-only) resolve at render by the same rule, marked transitional. Documents already stored keep their bytes (§1.7). See "Shipped in Pass 11c" at the end of Part D. C2.1c |
| Down payment collected in the field rides the first visit's invoice; the technician sees it as due today (owner, 2026-09-21) | DONE — Pass 11d (2026-09-22) | now: `createAgreement` issues nothing; the down payment rides the first visit's invoice as an `INITIAL_CHARGE` line (`buildVisitInvoiceLinesTx`), `getVisitBillingSummary` prices it into the visit's figures as `charges`, the collector field has its readers (the office prompt at signing and scheduling, the technician's callout), the explicit up-front button stays, and the three unissued `Daily Rodent Trapping` deposits are settled outside the ledger. See "Shipped in Pass 11d" at the end of Part D. Was: `createAgreement` issues a standalone `INITIAL_CHARGE` invoice (`storage.ts:3252`, `7625-7714`); `getVisitBillingSummary` (`:4724`) never finds it, so the ticket says $0 due; `initialChargeCollectedBy` has no reader in the field. Owner correction recorded under D4 in `PLAN_BILLING_V1_1.md`. C2.1d |

### A3. Dispatch, field tickets, appointment details, opportunities, cancellations

| Note | Status | Evidence |
|---|---|---|
| Dispatch "Slot Interval" → rename "View Interval" | PARTIAL | control exists in the Window popover (`schedule.tsx:838-886`), options **1 h / 2 h only** (`:40`); it sets grid *column* width; state is session-only (`:430`, popover says so) |
| Schedule (snap) interval 15 / 30 / 60 min, configured in Dispatch Board settings | ABSENT | placement snaps to the top of the slot hour (`buildSlotDate`, `:75`, `moveAppointmentToSlot`, `:679-707`); sheet start/end are free `datetime-local`; no dispatch section in `settings.tsx`; the only `app_settings` keys are `service_time_tracking_mode` and `appointment_cancel_reschedule_reasons` (`storage.ts:4324, 4341`) |
| Moving an appointment on the board asks for confirmation | DONE — Pass 27 (2026-09-25) | click the card, click a slot, and "Move to <technician>, <day time>?" holds the move until confirmed (`pendingMove` / `confirmPendingMove` in `schedule.tsx`). Was: it moved on the click (`moveAppointmentToSlot`) — the accidental-reschedule risk the owner named |
| Pending queue: name → location link, link to details | ABSENT | queue rows are select-for-placement buttons (`schedule.tsx:1067-1119`), name is plain text (`:1094`). Owner review of 2026-09-25 (Pass 27): the queue needs the appointment / service details so a pending service can be cancelled without placing it first - the details link is C5.4 (Pass 36), the cancel itself is C4.3a (Pass 28) |
| Unschedule / reschedule to the queue (return a scheduled stop to pending) | DONE — Pass 27 (2026-09-25) | **Reschedule** on the dispatch sheet → `POST /api/appointments/:id/disposition { mode: RESCHEDULE }` → `dispositionAppointment`: CANCELED + `rescheduleRequested`, no reason, no opportunity, every service back to `PENDING_SCHEDULING` with its dates kept and `lastAppointmentId` set; the technician's route is the same path with origin FIELD. See "Shipped in Pass 27" at the end of Part D. Was: only the technician's `requestAppointmentCancelOrReschedule` |
| Board cancel: reason required from a settings list; opportunity prompt | DONE — Pass 27 (2026-09-25) | **Cancel appointment** on the dispatch sheet → `{ mode: CANCEL, reasonCode, opportunity: UPDATE_EXISTING \| CREATE \| NONE }`: the reason must be on `appointment_cancel_reschedule_reasons`, agreement services recycle with the window reset from today, one-time services are CANCELLED with a WINBACK opportunity; the status PATCH to CANCELED answers 409 `CANCEL_DISPOSITION_REQUIRED`. One path for the board and the field. Was: `PATCH { status: CANCELED }` → `updateAppointment` cascading every service to CANCELLED with no reason and no opportunity — two divergent cancel paths |
| Smart Schedule / AUTO_ELIGIBLE pill | ABSENT | badge is the raw `schedulingMode` text (`schedule.tsx:1097`); no auto-schedule; no skills column on technicians/users, no required skills on service types, no lat/long on locations (`schema.ts:51-72, 148-172`) |
| Opportunity type / category / assignee | DONE — Pass 25 (2026-09-24) | `categoryKey` (a key of the settings-managed `opportunity_categories`, five seeded keys and no others) + `workType` (AGREEMENT / ONE_TIME) on every row, stamped by source in `shared/opportunities.ts` and backfilled onto the 16 rows; the assignee on `assignedUserId` (a `users` FK, manual under `ASSIGN_OPPORTUNITY` support+, audit `update`), "My opportunities"; the list read filters on category, work type, assignee, source and location / zip in SQL. See "Shipped in Pass 25" at the end of Part D. Was: `status` is an enum (`routes.ts:288`); `opportunityType` is free text (per-service-type label or hardcoded strings, `storage.ts:1627, 3420, 3720`); `source` is hardcoded (`AGREEMENT_CONTACT_REQUIRED`, `AGREEMENT_CANCELLATION_RETENTION`, `AGREEMENT_INITIAL`, `APPOINTMENT_RESCHEDULE_REQUIRED`, `APPOINTMENT_CANCELLATION_REVIEW`, `NON_CONTRACT_FOLLOW_UP`); dispositions are settings-managed (`opportunity_dispositions`, `settings.tsx:704-740`); no assignee column |
| Ticket: prompt to time in when opened without a Time In | ABSENT | no `timeInAt` read in `service-completion-dialog.tsx`; the only prompt is time-*out* after post under `PROMPT_FOR_TIMEOUT` (`:353`) |
| Ticket: target pests as a searchable multi-select | PARTIAL | pill toggles **with a search box** (`:501-514`), from `/api/target-pests`, stored comma-joined (`:225`) |
| Ticket: target pests relocated to Materials with a summary; pest per application | ABSENT | no per-material pest column (`productApplications`) |
| Material Unit as a settings-managed dropdown | ABSENT | free-text input (`:636-637`); products carry one free-text `defaultUnit` (`schema.ts:572`), no unit list |
| Application area as multi-select | PARTIAL | single-select from the product's `allowedApplicationAreas[]` else free text (`:663-674`); areas serviced derived across lines (`:308`); no org-level area list (per-product comma text, `settings.tsx:296`) |
| Generate Proposal | ABSENT | no `proposal` anywhere |
| Ticket / appointment details: due vs prepaid, Price / COA / Due today, designation | DONE | Pass 7 (`ServiceBillingBlock` at `:446`; `technician-work.tsx:376, 392`) |
| … billing plan/profile display, card-on-file icon | PARTIAL / ABSENT | plan pill on agreement card + location profile (Pass 7); nothing on the ticket; no card icon (no `payment_methods`) |
| Post-ticket sequence: finish → collect → post | DONE, with D8's labels not the notes' | Pass 7.5 (see B1); the collect step's "preview / print / send service summary" is the service report document, C3.5 |
| Appointment status "Scheduled → Pending" | **REJECTED (Q4 / D1a)** | no fifth status; the feature is the reschedule-to-queue action (see B2) |
| Appointment Details (tech): service price = sum of due services | DONE | `VisitDueTodayTotal` (`technician-work.tsx:392`) |
| Appointment Details (tech): auto refresh after Time In / Out | DONE | `refreshWork()` invalidates on both mutations (`technician-work.tsx:128-190`). The note predates this or reflects a stale dev server (Pass 7.6's finding); re-verify after `npm run dev:full` restart. |
| Appointment Details: change service type, add service, change duration, order instructions | ABSENT | tech modal is read-only (`:357-389`); service *type* changes only inside the ticket dialog for non-agreement work (`service-completion-dialog.tsx:466-482`); the dispatch sheet edits start/end/status/notes only (`schedule.tsx:220-320`) |
| Service Time Tracking Mode | DONE | `AUTO_TIMEOUT_ON_TICKET_POST / PROMPT_FOR_TIMEOUT / MANUAL_TIMEOUT` (`storage.ts:272`, `settings.tsx:1860-1883`) |
| Service-level cancel / return one service to pending | ABSENT | since Pass 27 the sheet's buttons are **Cancel appointment** and **Reschedule** and act on the whole visit, as they say; a disposition skips a COMPLETED or CANCELLED service but has no per-service form. `PATCH /api/services/:id` accepts `PENDING_SCHEDULING` but no UI uses it that way. C4.3a (Pass 28) |
| Materials modeled as products with allowed methods / equipment / areas | DONE | `materialProducts` (`schema.ts:556-579`) |
| Role profiles configurable in Settings | ABSENT | four fixed roles, matrix in `shared/permissions.ts:44-86`, one `can()` helper |
| Technicians and users are one table | PARTIAL — Pass 12 | `technicians.userId` (nullable, one technician per user) bridges a technician profile to its login, set in Settings → Technicians; the merge itself is C5.7. Was: `technicians` (`schema.ts:160-172`) had no `userId`; the two were unlinked |

---

## Part B — Contradictions, counterintuitive requests, and the "PLEASE ADVISE" answers

Each item names the note, what the repo has decided or built, the recommendation, and the owner's
answer (review of 2026-09-19). Where a note conflicts with a recorded decision the decision stands
unless the owner reverses it in writing, the way D4's correction was recorded in `PLAN_BILLING_V1_1.md`.

**B1. "Change 'Post Service Ticket' to 'Complete Service'… returns to Appointment details… Collect
Payment… returns to Appointment Details… then Post."** Conflicts with D8, which ruled the button must
*not* say "Complete" (office finalization owns that word) and built finish → collect → post as
Pass 7.5, inside the ticket dialog, with "Collect Payment" also on the technician's appointment
details. The notes' sequence adds two round-trips through appointment details for the same outcome.
**Owner:** agreed — addressed in an earlier planning session; the notes were not updated. Keep as
built; no landing-screen change.

**B2. "Change status from scheduled to Pending → removes from schedule, places in pending queue"
and "Unschedule button".** Two notes, one feature. A `PENDING` appointment status was explicitly
rejected in Q4 / D1a: an appointment row *is* a placement, and "pending" is
`services.status = PENDING_SCHEDULING`. D8 decided the action: archive the placement, return the
Services to pending, no cancellation policy fires. The inventory found the mechanism already exists on
the technician side (`requestAppointmentCancelOrReschedule`: CANCELED + `rescheduleRequested`,
services requeued, opportunity created), while the board's own cancel path cascades services to
CANCELLED with no reason and no opportunity. **Owner (2026-09-19):** agreed, with three refinements
that are now the spec of C4.2:
- **The action is called RESCHEDULE, not Unschedule.** It pulls the job off the technician's schedule
  and places it as `PENDING_SCHEDULING` for the office to pick a new day and time. It does not start
  the cancellation flow. Data model unchanged and stated so nobody adds a status: rescheduled =
  `status CANCELED` + `rescheduleRequested = true` + no `cancelReason`, which is the shape the
  technician path already writes; the UI distinguishes on the flag.
- **CANCEL starts the flow**: reason required from the settings list, an opportunity created or
  assigned, and **agreement-generated services go back into the scheduling queue with their service
  window reset from the cancel date** (so the visit is not silently "missed"), the opportunity being
  the fallback that keeps it visible. Non-agreement services are cancelled with the opportunity
  prompt. There is no *appointment* cancellation policy today — only the agreement policy — and none
  is built here; the owner floated one as a Settings addition (Phase 9 list).
- **Moving an appointment on the board is too easy** — click the card, click a slot, it moves. The
  same pass adds a confirmation on drop ("Move to <slot>?"), so a reschedule is always a deliberate
  act, whether by moving or by returning to the queue.
Technician-raised reschedules keep creating the office-handoff opportunity (canon §9); office-raised
ones from the board do not need one.

**B3. "COA… auto-adjust the service price with notation ('$X.XX COA')."** Contradicts D6 (COA is a
payment application; price is never mutated) and the verified Pass 7 behavior. The same notes, under
the ticket, say "display amount to be collected today… there could be COA applied for part or all of
the service due" — that second reading is what shipped: Price / COA / Due today. **Owner:** agreed,
old notes, no change. The "$X COA" notation is the COA row.

**B4. "Check → 'Pending' status option on the invoice; cash → marked paid by a manager."** Built by a
different mechanism: `payments.status = PENDING` plus the invoice's `pendingAppliedCents` rollup
("pending shows, confirmed counts"), and `CONFIRM_CASH_PAYMENT` (manager+). There is no invoice-level
PENDING status and adding one would let a bounced check mark an invoice paid. **Owner:** agreed, no
change. The Invoice modal shows the pending figure and the pending payments with Confirm.

**B5. "Add monthly billing to template invoice terms."** A category mix-up: invoice **terms** (Billing
Profile: Due on receipt / Net 15 / 30 / 60) say when a bill is due; **monthly** is a Billing Plan
cadence (RECURRING_INTERVAL · MONTH) attached to an agreement, which exists. **Owner:** agreed, no
terms change — but a **statement** is wanted: for commercial locations, property managers (many
locations, one payer), and a home sale (a paid-in-full / zero-balance letter with agreement status).
That is C2.5, now a real unit, not conditional.

**B6. "'New Invoice' must link to an existing service; does not require finalized status; generation
does not repeat after finalization."** That is the **Draft invoice** (Pass 4): appointment-anchored,
adopted at finalization, never duplicated, offered on the Services tab and by `AUTO_DRAFT`. The
dialog called "New Invoice" on the Invoices screen is the *manual* invoice (one ADJUSTMENT line, no
service reference). **Owner:** remove New Invoice entirely; Draft takes its place. **Pushback,
recorded for the owner's call:** a few charges have no visit to draft against — a returned-check or
late fee, a re-inspection fee, a product sale, a cancellation fee, and "billing history back" for
periods that elapsed plan-less (Pass 3.5 left that as a deliberate manual act). Recommendation: the
Invoices screen loses New Invoice and gains "Draft invoice for a visit"; the manual path survives
only as **"Add fee / adjustment" on the location ledger panel**, where the location is already known,
so a location-less row can never recur. **Owner (second review, 2026-09-19): keep it, as
recommended.** C2.3 builds exactly that. Note the limit Pass 4 chose: a draft needs an appointment;
an unscheduled service has no anchor. **Built as Pass 13** (`feature/phase-2-batch-invoice-and-draft`,
2026-09-24): the Invoices screen has "Draft invoice for a visit" and Batch Invoice, the ledger panel
has "Add fee / adjustment", and New Invoice is gone.

**B7. "Opportunity Type/Category: Agreement, One-time, Reschedule, Cancel/Win-back, Retention."** The
list mixes two axes, which D8 already separated: `category` = reason (NEW_SALE, SERVICE_DUE,
RESCHEDULE, WINBACK, RETENTION; settings-managed) and `workType` = AGREEMENT | ONE_TIME. Today `type`
is free text and `source` is six hardcoded strings. **Owner:** agreed; the point is **searching open
opportunities by these criteria**, and an **ASSIGNED_TO** is wanted — assign (and auto-assign from
Settings by zones, zip codes, or other parameters) opportunities to sales reps, office reps, or
managers. C4.1 gains the assignee and the filters; C4.1b builds the assignment rules and zones.
**Built as Pass 25** (`feature/phase-4-opportunity-taxonomy`, 2026-09-24): the two axes, the settings
list with the five keys only (owner, second review), the manual assignee under `ASSIGN_OPPORTUNITY`
(support+) and the filters; the rules and zones remain C4.1b.

**B8. "Agreement Type: pest, termite, bundle? subscription, one-time?"** D8: two dimensions —
`serviceCategory` (settings reference data) and structure, which the Billing Plan +
`expectedServiceCount` already express ("subscription" is a recurring plan; "one-time" is one expected
visit; INSTALLMENT is a billing plan, not a type). **Bundle is not an agreement type** (canon §9: a
grouping layer via `bundle_agreements`). **Owner:** a dropdown, **configurable in Settings**, seeded
with Pest control / Termite / Mosquito / Wildlife / **Evaluation**; no hardcoded structure list. The
existing free text migrates into the list (each distinct value becomes an entry the office can rename
or merge). C5.3.

**B9. "Designate the service type as Production or Billable; agreement services / billing profiles
with monthly billing show as production."** Built (Pass 7), but the designation is decided per
**Billing Plan** at read time (`isScheduleBilledPlan()`), never per service type or billing profile.
**Owner:** agreed, old notes, no change.

**B10. "Send to customer — email or print."** No email transport exists anywhere; "send" is the
`sentAt` stamp plus the pinned PDF. Print is the PDF in a new tab. **Owner:** agreed — the modal
offers Open PDF / Download / Mark Sent now and gains Email only when delivery exists (C6.3). Dev rule
6 forbids a dead Email button.

**B11. "Generate and send: sends invoice / service report."** The invoice half exists; a
customer-facing **service report** document does not (Pass 7.5 named it future). **Owner:** keep them
separate, with a **Settings option to attach the service report to visit invoices**: a visit-anchored
invoice (COD or any plan billed at the visit) includes the report(s) for its lines; a schedule-driven
monthly invoice has no visit and omits it — "omit on null". C3.5 builds the document and the toggle.

**B12. "Target pests → dropdown multi-select with search; preferably relocate to the Material section;
auto-summarize on the main screen."** Search exists; the control is pill toggles. Canon §12 treats
target pests as per ticket. **Owner:** keep target pests **at the service (ticket) level**, selectable
from the modal, **and** add **pest per material application** for compliance; the ticket-level set
**includes every material's pests** (selected ∪ material pests) and is what the summary shows. C3.4b.

**B13. "Appointment Details" appears under both the tech view and the dispatch board.** The notes'
"Auto refresh when timing in/out" is already built on the technician modal. **Owner:** on the dispatch
board, Appointment Details is where the appointment's services are edited (change type, add a
service, change duration, instructions). The tech view gets the same, **tucked behind selectors**: the
service is displayed and becomes editable on click; Add service is a small button or link; duration
is not edited from the tech side except that adding a service extends the visit and must not overlap
the next stop; instructions are editable only on services the technician added. "Order instructions"
= appointment-level instructions to the technician (`appointments.notes`). **The tech view's end
state is a native Android / iOS app**, so every field action is a route, never page-only logic. C4.3a
(server + dispatch sheet), C4.3b (field).

**B14. "Preferred technician — location level inside edit/add location modal? customer level
located…"** D8 answered: location-level in the edit/add location modal (overrides), customer-level
as the account default, soft constraint. **Owner:** agreed, plus **EXCLUDE_TECH** — a customer asks
that a specific technician never be scheduled (poor service, unhappy). Preferences are per location;
for a multi-location customer a checkbox on the primary location's preferences applies them across
all locations, especially the exclusion. Model in C4.4: one `technician_preferences` table with
`scopeType account | location` (the flags/holds shape), `kind PREFERRED | EXCLUDED`; the "apply to
all locations" checkbox writes the account-scoped row; exclusion is a **hard block** on placement
(manager override with a reason, logged), preference stays a soft hint.

**B15. "Consider making fields immutable once posted — price, service date, collection data."** D9
decided it: after tech post → locked from the technician, office edits role-gated and logged; after
finalization → immutable, corrections via reopen-with-reason or credit memo. **The inventory found it
is not enforced**: the service-record PATCH has no gate and no status guard, and a re-post silently
un-finalizes a FINALIZED ticket. **Owner:** agreed — enforce server-side first (C3.1), a defect fix.
**Built as Pass 16** (`feature/phase-3-ticket-lockdown`, 2026-09-23).

**B16. "Reopen must be role-authorized."** Done (`REOPEN_TICKET`, support+). **Owner:** no change, but
**role profiles must be configurable in Settings** for the production-ready product — org-defined
roles as permission sets, not four fixed ones. New unit C5.6. Until then "manager+" is the interim
answer wherever this roadmap says it.

**B17. Duplicates in the notes.** "Move Batch Invoice" (Invoices + Ticket Review sections), "Generate
Invoice on the review modal" (Invoices + Ticket Review), "Collect Payment button" (ticket + appointment
details — both exist). Each is one unit below.

**B18. "API ready for Stripe or other processor… framework for card, auto-draft, ACH."** The framework
is V1 §0.4's provider port (`server/integrations/payments/`), org-level credentials, and tokenized
`payment_methods`. Nothing of it exists; the enums are named and refused. Phase 6, with a PCI rule:
PestFlow never sees a card number. **Owner:** agreed; the **last four digits must be visible** — they
are (`payment_methods.last4`, shown on the billing profile and behind the card icon).

**B19. "Batch: if CC on file and appropriate billing profile selected, auto-process with a
confirmation."** Needs Phase 6 (cards) and C5.2 (a billing profile the location actually selects,
with `autoChargeOnFile`). **Owner:** agreed.

**B20. Aging "current/30/60/90/90+".** V1 §1.4: derived, never stored. **Owner:** "Current" should mean
0-30 days; better semantics welcome. Resolution for C2.4: age by **invoice date** (`issuedAt`, days
since invoiced), buckets **Current (0-30) / 31-60 / 61-90 / Over 90**, labelled "days since invoiced";
a later Settings toggle can switch to due-date aging for Net-terms commercial accounts. The
customer-wide figure is a rollup; the balance still lives at the location (canon rule 1). Money on
account is shown beside, never netted.

**B21. "Customer/account history log for all changes."** The History tab and the append-only log exist
(Pass 2); only the profile edit writes customer/location rows. D7 named this follow-up. "Revert" = a
new forward change that records what it reverted. **Owner:** agreed, old notes. C5.1.

**B22. "Invoices are not being created upon finalization."** Resolved in Pass 5. Under the default
`PROMPT`, "Later" creates nothing on purpose; `OFF` creates nothing at all. **Owner:** confirmed.

**B23. "Make all names/addresses hyperlinks."** Done on dispatch cards and the Payments /
Opportunities screens; missing on the dispatch sheet, ticket review, service history, the pending
queue, **and the invoice rows** (owner: "don't forget invoice cards"). Folded into C2.1a (invoice rows
and the modal header) and C5.4 (everything else).

**B24. Phase numbering.** Older docs say "Phase 2" for card processing and "Phase 2.5" for the comp
engine. This roadmap renumbers by theme; the mapping is at the top of this file. **Owner:** understood.

---

## Part C — The roadmap

Phases are themes; passes are the unit of work. Order within a phase is the recommended order;
phases overlap where a unit's dependencies allow. Pass numbers continue Phase 1's sequence (Pass 10
was the last). A unit's "Notes covered" column is the traceability back to Part A.

### Phase 1 — Billing core (done)

D1-D9 and Pass 10, verified end to end (PR #70), merged through PR #71. Leftovers are scheduled below
by name; `CURRENT_FOCUS.md`'s unscheduled list points at them.

### Phase 2 — Invoices you can work from (AR surfaces + Phase 1 close-out)

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C2.1a (**Pass 11a**) — **done** (`feature/phase-2-invoice-modal-core`, 2026-09-19; see "Shipped in Pass 11a" at the end of Part D) | **Invoice modal, core** — new `GET /api/invoices/:id`; `InvoiceDetailDialog` with every section and every action; the Invoices screen rows slimmed to data + open, **no quick action** (owner), customer and location on the row become links; `/invoices?invoiceId=`. Spec in Part D. | Invoices: modal, Void in modal, cash/check collection, mark sent / print; hyperlinks on invoice rows | — | — |
| C2.1b (**Pass 11b**) — **done** (`feature/phase-2-invoice-modal-reach`, 2026-09-20; see "Shipped in Pass 11b" at the end of Part D) | **Invoice modal, reach** — `InvoiceRowLedger` rows open the same modal; `/customers/:id?locationId=&tab=invoices&invoiceId=`; Ticket Review reads `?recordId=` (entry point `openRecordFromQueue`, `service-ticket-review.tsx:280`) so the modal's per-line "Open ticket" lands; new `GET /api/invoices/by-appointment/:id` feeding an **invoice badge** on the review modal, or **Generate** when the visit is finalized and un-invoiced (the "Later" case); the Services tab Invoice column and `ServiceDetailModal` open the modal; `POST /api/invoices/:id/assign-location` (manager+, audit `update`) for the two location-less rows. | Links to the ticket system-wide; Generate Invoice on the review modal | C2.1a | — |
| C2.1c (**Pass 11c**) — **done** (`feature/phase-2-invoice-document-parties`, 2026-09-21; see "Shipped in Pass 11c" at the end of Part D) | **Invoice document parties** (owner review 2026-09-21, item 1). The Bill To is decided at **issue** and frozen: `resolveInvoiceTermsForLocationTx` (`storage.ts:5463`) always writes a snapshot, growing the existing `billingProfileSnapshot` jsonb with `billTo: { name, address, source: PROFILE \| LOCATION_OVERRIDE \| PRIMARY_LOCATION }` and `serviceLocation: { name, address }`, `profileId` null when no profile resolved. Address rule: the profile's `billingAddress`, else (a location-override profile) that location's own address, else the customer's **primary location's** address; name: the profile's `billingName`, else today's customer-name order. `createManualInvoice` (`storage.ts:5045`, snapshot hardcoded null) and the schedule-driven path's inline duplicate of the snapshot (`~storage.ts:6141`) both call the resolver. `getInvoiceDocumentContext` reads the keys; the 45 legacy null-snapshot rows fall back at render (primary location for Bill To, the invoice's location for Service Location), marked transitional. `InvoiceDocumentContext` gains `serviceLocation`; the PDF and HTML print a third block. Client: `readBillingProfileSnapshot` (`shared/invoice-detail.ts`) reads the keys; the modal's Terms shows "Bill to … (primary location)" and the service location; "No billing profile was snapshotted" only for legacy rows. No migration. **Verify** (5001): a manual invoice at a non-primary location → `billTo.source = PRIMARY_LOCATION` with the primary's address and `serviceLocation` = that location; a `POST /api/billing-profiles` override row with an address → `PROFILE`; an override row without one → `LOCATION_OVERRIDE` with that location's own address; a legacy row's document still renders; the `/document` PDF is stored once; fixture profiles deleted in cleanup. | Bill To from the primary location; service location on the invoice (owner, 2026-09-21) | C2.1a | — |
| C2.1d (**Pass 11d**) — **done** (`feature/phase-2-down-payment-first-visit`, 2026-09-22; see "Shipped in Pass 11d" at the end of Part D; the open flag in Part E answered the same day) | **Down payment on the first visit's invoice** (owner correction 2026-09-21 under D4, `PLAN_BILLING_V1_1.md`). `createAgreement` stops calling `issueInitialChargeInvoiceTx` (`storage.ts:3252`); `POST /api/agreements/:id/issue-initial-charge` and its event stay as the explicit up-front path. A **live** event is an `INITIAL_CHARGE` billing event whose invoice is not VOID (or that has no invoice: settled outside the ledger). `buildVisitInvoiceLinesTx` (`storage.ts:5496`) appends, for each agreement behind the visit's services with `initialChargeType = DOWN_PAYMENT`, a resolvable amount (`resolveInitialChargeCents`) and no live event, an `INITIAL_CHARGE` line "Down payment - <agreement>" taxed as the standalone path taxes it; generation and `issueInvoiceTx` (never the draft) insert the event with `invoiceId` = the visit invoice, so a void of that invoice makes the event non-live and the corrected invoice carries the line again. `DOWN_PAYMENT` only (`CLEANOUT_SURCHARGE` / `PREPAY_FULL` leave in C3.6). `isFullyAgreementCovered` must not read a covered visit with a down-payment line as "No charge". `getVisitBillingSummary`'s un-invoiced branch prices the pending line as `BILLABLE` (Price / COA in D4's order / Due today) so the ticket, appointment details, collect step and review modal show it. `initialChargeCollectedBy` gets its reader: the office prompt at scheduling fires unless `TECH_AT_FIRST_SERVICE`; the technician's collect step shows a "Down payment $X" callout unless `OFFICE_AT_SIGNING`; both when null. **Office prompt**: appointment creation (`POST /api/appointments` and the schedule screen's placement) for a service on an agreement with a live-less down payment and no designated payment covering it returns `initialChargeDue: { agreementId, amountCents }`; the client asks "Collect the $X down payment now?" → `RecordPaymentDialog` with `designatedAgreementId` + `appointmentId` (split into 11e if the pass runs long — the routing and the technician's figures are the must-haves). Copy: `initial-charge-fields.tsx:106`; the agreement card's `AgreementInitialChargeStatus` → "Billed on the first visit's invoice" + "Issue up front instead", "Invoiced as INV-x (first visit)" once fired. **Migration** (`agreement-bootstrap.ts`, guarded, per-row effect printed before commit): the three `Daily Rodent Trapping` rows per the open flag in Part E. Canon §13 and the initial-charge canon corrected in the same PR. **Verify** (5001): `DOWN_PAYMENT` $100 on a plan-less agreement → no invoice at creation; the first visit's summary shows the `INITIAL_CHARGE` line `BILLABLE` $100 beside the service line at remaining ÷ expected; generate → both lines and the event on the visit invoice; the second visit's summary has no down-payment line; void the first invoice → the summary shows it again; the explicit button on a fresh agreement → standalone + event, second press refused; a schedule-billed agreement → $100 down + $0 covered, no "No charge" banner; appointment creation returns `initialChargeDue`, and not after a covering designated payment. | Down payment shares the visit's invoice; office prompt at scheduling; tech collects against it (owner, 2026-09-21) | C2.1c (the line's Bill To), Pass 6 | Open flag in Part E (the three unissued rows) |
| C2.2 (**Pass 12**) — **done** (`feature/phase-2-billing-plan-required-sold-by`, 2026-09-23; see "Shipped in Pass 12" at the end of Part D) | **Billing Plan required on every Agreement + sale attribution.** Backfill the 11, `billingPlanId NOT NULL` + zod; `agreements.soldByUserId` — a `users` FK (owner: one identity table for techs and office), defaulting to the session user at creation, changed only under a new `ASSIGN_SALE_CREDIT` (manager+), audit `update`; template propagation untouched. `technicians` has no link to `users` today (`schema.ts:160-172`), so the same pass adds a nullable `technicians.userId` bridge; the full merge is C5.7. | Compensation basis (CURRENT_FOCUS) | — | Answered 2026-09-19: attach the billing plan named **Monthly Recurring** to all 11 — the 9 `Quarterly Control` rows (monthly billing for a quarterly program, the industry norm; the marked "Monthly" line in `notes` is deleted once attached) and the 2 Wildlife rows, whose term is already past its end, so Pass 3.5's attach rule starts no schedule and bills nothing. The 4 CANCELLED rows attach for the constraint only. The pass prints the per-row effect (`nextBillingDate` or the refusal) before committing. **Built as decided** (the DB had 5 CANCELLED rows, not 4; the 4 ACTIVE rows anchored on 2026-09-24, the Wildlife rows refused at their term end, nothing else asked). |
| C2.3 (**Pass 13**) — **done** (`feature/phase-2-batch-invoice-and-draft`, 2026-09-24; see "Shipped in Pass 13" at the end of Part D) | **Batch Invoice moves to the Invoices screen**; range labelled "posted between"; group by technician then service date (a "route" is technician × day — `appointments` carry no route columns); technician filter passed to preview **and generate**; the preview shows the down payment generate will bill (the Pass 11d gap); Send All stays; Ticket Review loses the button. **New Invoice is removed** (owner); the screen gains **"Draft invoice for a visit"** (customer → location → un-invoiced appointment → `createDraftInvoiceForAppointment`); the manual path survives only as **"Add fee / adjustment"** on the location ledger panel (owner, B6); `createManualInvoice` keeps requiring a location and defaults a blank due date from the location's billing terms. | Move Batch Invoice (×2), batch by route/tech, sort by date, New Invoice → Draft | C2.1a (result rows open the modal) | — |
| C2.4 (**Pass 14**) — **done** (`feature/phase-2-aging-and-balances`, 2026-09-24; see "Shipped in Pass 14" at the end of Part D) | **Aging and balances on the customer screen.** Derived reads: `GET /api/customers/:id/aging` (per location + rollup) and `GET /api/reports/aging` (org-wide); buckets **Current (0-30) / 31-60 / 61-90 / Over 90 days since invoiced** (`issuedAt`, B20) over issued open balances, pending-applied and on-account shown beside, never netted. Header card: the customer-wide open balance, on-account figure and oldest bucket sit beside the primary-location chip; location profile card: the location's strip below `LocationNotesPanel`, its invoices opening the modal; Reports: an Aging **section** (the page has no tabs - owner's handoff of 2026-09-24), every row linking to the customer screen. Both reads open to any authenticated role, like every invoice read (the reasoning is in the shipped record). Nothing stored; UTC days like every other date-only value. | Aging report, customer balance at top with primary location info, location balance below notes | C2.1a (bucket rows open the modal) | — |
| C2.5 (**Pass 15**) — **done** (`feature/phase-2-statements`, 2026-09-25; see "Shipped in Pass 15" at the end of Part D) | **Statements.** Location statement (period roll-up: opening balance, invoices, payments, credits, closing balance, aging strip) and **account statement** (the same across every location of the account — the property-manager case) through the existing renderer, stored like invoices; a **paid-in-full / zero-balance letter** variant with agreement status for a home sale; Open / Download from the location Invoices tab and the customer header; on request only (a scheduled monthly statement is a later Settings toggle); delivery arrives with C6.3. | B5 (statements for commercial, property managers, home sale) | C2.4 | — |

### Phase 3 — Ticket integrity and the field workflow

Design rule for every tech-view unit (owner, B13): the field is a PWA today and a native app later,
so every field action is a route and every screen is data from a read — no page-only logic.

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C3.1 (**Pass 16**) — **done** (`feature/phase-3-ticket-lockdown`, 2026-09-23; see "Shipped in Pass 16" at the end of Part D) | **Ticket lockdown (D9) enforced server-side.** `PATCH /api/service-records/:id` gated by a new `EDIT_TICKET` (support+) and refused on FINALIZED ("reopen first"); `completeService` refuses a re-post on a FINALIZED ticket, and a technician's re-post on a ticket already in office review (the office reopens; the technician re-posts a REOPENED one); every accepted edit writes `ticket_edited` (before/after, product applications included; payment records are already immutable and out of scope). The only UI change: `technician-work.tsx:477-485` stops passing a posted record into the ticket dialog. A defect fix, not a feature. | Immutable fields once posted | — | — |
| C3.2 (**Pass 17**) — **done** (`feature/phase-3-reopen-reason-popup`, 2026-09-25; see "Shipped in Pass 17" at the end of Part D) | **Reopen-reason pop-up** with a settings list (`ticket_reopen_reasons`, the `app_settings` shape of `appointment_cancel_reschedule_reasons`), `reopenReasonCode` + text; "Other" requires text and `REOPEN_TICKET_OTHER` (manager+); the inline textarea leaves the modal; the modal closes on Finalize when the queue is exhausted. | Remove reopen reason from modal; pop-up; dropdown config; Other role-gated; close on finalize | — (after C3.1 only to avoid a footer merge conflict) | — |
| C3.1b (**Pass 18**) — **done** (`feature/phase-3-office-edit-ticket`, 2026-09-25; see "Shipped in Pass 18" at the end of Part D) | **Office Edit on the review modal** (D9): the role-gated Edit button opens `service-completion-dialog.tsx` in an `office-edit` mode (same fields, materials included) that submits through the gated PATCH instead of the post route; `ADJUST_PRICE_AGREEMENT` still guards an agreement price (support edits everything else); a FINALIZED ticket says "reopen first". Pass 16 built the PATCH content-only with materials as replace-all; the Service's price and type are not on it, so this unit adds the price edit (on the Service, logged `price_overridden` as a post's is). | Office edit button | C3.1, C3.2 | — |
| C3.3 (**Pass 19**) | **Technician ticket modal, money and instructions**: draft-price override on the billing-summary read (`?serviceId=&priceCents=`, priced server-side through `resolveServiceLineBillingTx` + tax), dollars.cents on blur, service instructions (agreement `serviceInstructions`, service notes, location notes) at the top, the **billing-plan pill** in the ticket header (the profile display waits for C5.2), **time-in prompt** on opening a ticket with no Time In (bypass allowed). Landing after Post unchanged (B1). | Tech modal items 1-4; time-in prompt; display billing plan | — | — |
| C3.4a (**Pass 20**) | **Material units and application areas**: a settings-managed unit list (`material_units`) feeding a Unit dropdown, product `defaultUnit` migrated to pick from it; an org-level application-area list in Settings feeding products' allowed areas; application area multi-select per material line (`applicationAreas[]`, areas serviced still derived). | Unit dropdown; Application area multi-select | — | — |
| C3.4b (**Pass 21**) | **Target pests, two levels** (B12): `productApplications.targetPests[]` per material row from the target-pest list (compliance); the ticket-level target pests stay on the ticket, selectable from a searchable multi-select placed in the Materials section, and are **selected ∪ every material's pests**; the summary line at the top of the ticket shows that union. | Target pests; pest per application | C3.4a | — |
| C3.5 (**Pass 22**) | **Service report document** — customer-facing summary of a posted/finalized ticket (technician + license, date, services, pests, materials, notes, recommendations, signature placeholder) through the document renderer, stored like invoices; Open / Download on the review modal and the Services tab, Preview in the collect step. **Settings toggle "Attach service report to visit invoices"** (B11): when on, a visit-anchored invoice's PDF appends the report(s) for its lines; schedule-driven and manual invoices have no visit and append nothing. Both documents stay separately openable. | "Preview/print/save/send service summary"; "sends invoice / service report" | — | — |
| C3.6 (**Pass 23**) | **Field surcharge line** — as specified in `CURRENT_FOCUS.md`: SURCHARGE line on the ticket → invoice line; allow/reject toggle moves from plan to template; `CLEANOUT_SURCHARGE` / `PREPAY_FULL` leave the initial-charge vocabulary; test-data defaults migrated; `ADD_FIELD_SURCHARGE` gets its UI. **Transitional credit rule until Phase 7:** a recorded SURCHARGE line always credits the posting technician, marked transitional (dev rule 4), replacing today's permission inference in `createSurchargeEntryIfConfigured()`. | (owner-specified 2026-09-13) | — | — |
| C3.7 (**Pass 24**) | **Service designation + callback attribution** — `ServiceType.category` (CALLBACK / PRODUCTION / SERVICE) in Settings, instance designation on Service defaulted from the type, a required "answers Service …" link on a CALLBACK chosen at scheduling; production basis and invoice $0 read the designation instead of the slot counter. Canon §10. Its urgency in `CURRENT_FOCUS.md` came from plan-less agreements billing per visit; that drops once Pass 12 lands, so it sequences after it (COD-plan callbacks remain the case it fixes). | (roadmap note in canon) | C2.2 | — |

### Phase 4 — Scheduling and dispatch (D8's deferred scheduling pass, split)

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C4.1 (**Pass 25**) — **done** (`feature/phase-4-opportunity-taxonomy`, 2026-09-24; see "Shipped in Pass 25" at the end of Part D) | **Opportunity taxonomy, assignee and search** — `category` (settings-managed, seeded NEW_SALE / SERVICE_DUE / RESCHEDULE / WINBACK / RETENTION) + `workType` (AGREEMENT / ONE_TIME); `assignedToUserId` (a `users` FK, manual assign / reassign, "My opportunities"); migration maps the six hardcoded sources and the free-text types; the Opportunities screen filters on category, work type, status, assignee, source, and location / zip. | Opportunity Type/Category; ASSIGNED_TO; search open opportunities | — | — (owner: the five only) |
| C4.1b (**Pass 26**) | **Opportunity assignment rules and zones** — Settings: `zones` (named zip-code lists, reusable later by dispatch and Smart Schedule) and `opportunity_assignment_rules` (category / work type / zone / source → user, ordered, first match wins); auto-assign at creation, unassigned when no rule matches; reassignment logged. | ASSIGNED_TO auto-assign by zones / zip / params | C4.1 | — |
| C4.2 (**Pass 27**) — **done** (`feature/phase-4-cancel-reschedule`, 2026-09-25; see "Shipped in Pass 27" at the end of Part D) | **Cancel and Reschedule, one path** (B2). New `POST /api/appointments/:id/disposition { mode: CANCEL \| RESCHEDULE, reasonCode?, opportunity: UPDATE_EXISTING \| CREATE \| NONE, voidDraftInvoices? }` built on `requestAppointmentCancelOrReschedule` (the technician's cancel-reschedule route becomes a thin alias that always creates the office-handoff opportunity). **RESCHEDULE**: services back to `PENDING_SCHEDULING`, no reason required, no policy, no opportunity when the office does it from the board. **CANCEL**: reason required from the settings list; agreement-generated services return to `PENDING_SCHEDULING` with `serviceWindowStart/End` reset from the cancel date and an opportunity created or assigned as the fallback; non-agreement services are `CANCELLED` with the opportunity prompt (category defaulted by path). Both keep the draft-invoice prompt. `PATCH /api/appointments/:id { status: CANCELED }` is refused with 409 `CANCEL_DISPOSITION_REQUIRED`; the sheet's status Select drops CANCELED and its "Cancel Service" button becomes **Cancel appointment** + **Reschedule**. **Board moves confirm on drop** ("Move to <slot>?"). The location's Services tab shows Scheduled / Pending / Rescheduling / Cancelled distinctly — also Q4's PENDING_SCHEDULING-vs-SCHEDULED gap. | Unschedule → Reschedule; cancel reason required; opportunity prompt; agreement services recycled; accidental moves; Services-tab clarity | C4.1 | — |
| C4.2b (**Pass 27b**) — **done** (`feature/phase-4-cancel-reschedule-review`, 2026-09-25; see "Shipped in Pass 27b" at the end of Part D) | **Cancel and Reschedule, owner review** (live testing of 2026-09-25, Part E). (1) A CANCELED placement leaves the dispatch board - cancelled and rescheduled alike, so the slot is free for new work; it stays in the location's Services tab ("Was <date>", the reason) and History as the record. One shared predicate for "shows on the board", read by the board's viewport, slot map and analytics (`getTechnicianWork` already excludes CANCELED). (2) The Cancel appointment and Reschedule dialogs close when the disposition completes: the sheet resets on the appointment prop only while one is set, so the dialog stays open after the sheet closes. (3) Re-verify, with a fresh agreement service and a fresh one-time service, that the opportunity a CANCEL creates is OPEN until the recycled service is placed again (placement converts it, the pre-existing rule); the owner saw CONVERTED and attributed it to the agreement path. No new behavior otherwise. | Owner review of Pass 27 | C4.2 | — |
| C4.3a (**Pass 28**) | **Appointment composition, server + dispatch sheet** (B13) — add a service to an appointment (new or from the pending queue), remove / cancel / return ONE service to pending (the last service prompts to reschedule the appointment), change a service's type (agreement work stays locked) and duration, appointment instructions (`appointments.notes`) editable; all through `getLinkedServicesForAppointmentTx`. UI on the dispatch sheet. **Also (owner review of 2026-09-25): cancelling a `PENDING_SCHEDULING` service outright**, from the pending queue and the location's Services tab, with the disposition's semantics - a reason from the settings list, the opportunity choice (WINBACK for a one-time service; an agreement service is recycled or, if the agreement itself is ending, that is the agreement workflow), an audit row on the service - because today the only way to cancel a pending service is to place it on the board and cancel the placement (the service form has no status control). | Appointment Details build-out; service-level cancel; cancel a pending service | C4.2 | — |
| C4.3b (**Pass 29**) | **Appointment composition in the field** (B13) — the technician's appointment details: each service displayed, editable on click (type, for non-agreement work); **Add service** as a small button; adding extends the visit's duration and refuses an overlap with the technician's next stop; instructions editable only on services the technician added; an added non-agreement service is **flagged for office review** (owner). Same routes as C4.3a. | Add service in the field (tech-modal item 5) | C4.3a | — |
| C4.4 (**Pass 30**) | **Technician preferences + crew** (B14). `technician_preferences` (`scopeType account \| location`, `technicianId`, `kind PREFERRED \| EXCLUDED`, note, created-by); editors in edit/add location and on the primary location with an "apply to all locations" checkbox that writes the account-scoped row; chip on the card. Dispatch: EXCLUDED is a **hard block** on placement (manager override with a reason, audit-logged), PREFERRED a "Prefers <tech>" hint on the queue row and the sheet. Crew: `appointment_technicians` (lead + support) — the comp basis D8 collects here; production entries stay single-technician until Phase 7's split allocation. | Preferred technician; EXCLUDE_TECH; apply across locations; crew | — | — |
| C4.5 (**Pass 31**) | **Dispatch board settings.** Settings → Dispatch Board: **view interval** (the rename; keep 1 h / 2 h, add 30 min), **snap interval** 15 / 30 / 60 (`dispatch_snap_minutes`; drag placement and the sheet's time inputs round to it), default visible hours (the session override stays). | Schedule interval; View Interval | — | — |

Smart Schedule is Phase 9: it needs geocoded locations, technician skills, service windows and the
zones from C4.1b, and only the last exists by then.

### Phase 5 — Customer record, agreements, settings hygiene

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C5.1a (**Pass 32**) | **Non-financial audit coverage (D7 follow-up).** Every mutation of customer, location, contact, billing profile, agreement, agreement template, appointment, and service (create / update / status) writes the log through the existing helper, with new entity members in `shared/audit.ts`. Excludes `service_records` (C3.1's `ticket_edited`) and price overrides (Pass 8). | Customer/account history log | — | — |
| C5.1b (**Pass 33**) | **Customer-level History + Revert.** A History view on the customer that rolls up every location plus account-level rows; **Revert** on a row = a new forward update through the entity's normal write path, logged as `reverted` naming the source row; manager+ until C5.6 makes it a configurable permission (owner). | History for all changes; revert | C5.1a | — |
| C5.2 (**Pass 34**) | **Billing profile on the customer screen.** Selector in edit/add location (inherit account default / override), account default on the customer edit modal, org default template in Settings (`default_billing_profile_template_id`) used at customer creation; the "Billing: Per-location / Default" chip reads real data. | Billing profile from customer screen; add-location setup; default in settings | — | — |
| C5.3 (**Pass 35**) | **Agreement vocabulary.** A settings-managed **Agreement types** list (seeded Pest control / Termite / Mosquito / Wildlife / Evaluation) with dropdowns on template and agreement; the existing free text migrated into entries the office can rename or merge; no hardcoded structure list (B8). `CUSTOM` recurrence → explicit DAY / WEEK with the `CUSTOM(N)` → `DAY(N)` migration (7 agreements, 2 templates). | Agreement Type dropdown; CUSTOM recurrence | — | — |
| C5.4 (**Pass 36**) | **UI hygiene.** Hyperlinks on the dispatch sheet, hover card, Service Details dialog, pending-queue rows, the Ticket Review list and modal, and the Service History page; a details link from the pending queue (service details + location); the `schedulingMode` badge humanized ("Scheduling: auto-eligible") with no auto-schedule promise (dev rule 6); Make Primary moves into the contact dialog (inline button removed); New Service modal `max-w-2xl`. May be split across other passes that touch the same files. | Hyperlinks; pending-queue links; AUTO_ELIGIBLE pill; Make Primary; widen modal | — | — |
| C5.6 (**Pass 37**) | **Role profiles in Settings** (B16). `role_profiles` + `role_profile_permissions` (org-scoped); the four built-in roles seeded as editable, cloneable profiles; users assigned a profile; `can()` reads the profile instead of the fixed matrix (`shared/permissions.ts`), so no call site changes; an admin cannot remove `MANAGE_SETTINGS` from their own profile; every profile change audit-logged. Interim "manager+" answers elsewhere in this roadmap become profile permissions. | Role profile creation | — | — |
| C5.7 (**Pass 38**) | **Technicians are users** (owner decision 2): technician profile fields (license, color, display name) move onto `users`; `technicians` becomes a compatibility view or is dropped after every FK (`appointments`, `services`, `service_records`, `production_value_entries`, `technician_preferences`, crew) is rewired; the C2.2 bridge is the migration key. | One table for all users | C2.2, C5.6 | — |
| C5.5 | **Org timezone** for every date-only value (billing run "today", collections days, batch range, aging). Cross-cutting; scheduled when the UTC-day slips become a real complaint. | (Pass 7.7 note) | — | — |

### Phase 6 — Card / ACH payments and invoice delivery (V1's "Phase 2")

| # | Unit | Notes covered | Depends on |
|---|---|---|---|
| C6.1 | **Payment provider port** (`server/integrations/payments/`, Stripe first, org-level credentials, Connect-ready), `payment_methods` (tokens, brand, **last4** shown on the billing profile, expiry), SetupIntent capture from the billing profile; PCI: no card number ever touches PestFlow. | Stripe framework; card on file | C5.2 |
| C6.2 | **Charge from the invoice** (modal: "Charge card on file" / "Process card" → PaymentIntent → payment CAPTURED → applied), refunds through the provider, webhooks via a transactional outbox; **batch auto-charge** with the confirmation prompt (billing profile `autoChargeOnFile`); "pay this invoice" magic link (`access_tokens`, V1 §1.8). Card icon on the ticket and appointment details, last four behind a click, permission-gated. | Process CC; auto-process in batch; CC icon | C6.1, C2.1a, C2.3 |
| C6.3 | **Email delivery**: an email port (Resend / SES) + outbox; "Send to customer" in the modal sends the PDF to the billing contact; batch send emails; statements and service reports by email. | Send to customer (email) | C2.1a, C2.5, C3.5 |

### Phase 7 — Compensation engine (V1's "Phase 2.5")

Per V1 §1.6.2 and the `CURRENT_FOCUS.md` compensation entry: `comp_plans` / `comp_components` /
`comp_earnings` with plan and rate snapshotted per earning; split allocation rows beneath production
entries (needs C4.4's crews); components that pay a non-technician (needs C2.2's sold-by); the
per-plan surcharge selector (C3.6 already keys the credit off the line); per-period statements
exported to QuickBooks Payroll. Graduates to its own plan doc when scheduled.

### Phase 8 — Communications and automation (V1's "Phase 3")

Twilio SMS/voice, email log, Automation Center (appointment reminders, invoice reminders, aging
follow-ups), GHL boundary honored.

### Phase 9 — Agreements lifecycle and beyond (V1's "Phase 4+")

Terms & Conditions / contract snapshot + e-sign; amend / upgrade / downgrade / renew; bundles
(`bundle_agreements`); an **appointment cancellation policy** in Settings (late-cancel fees — floated
by the owner 2026-09-19, distinct from the agreement policy); **Generate Proposal** from the field
(external, API-linked, signature → agreement with sale attribution from C2.2); customer portal;
**Smart Schedule** / route optimization (prerequisites: lat/long on locations, skills on technicians
and required skills on service types, time windows, zones from C4.1b); inventory integration;
QuickBooks sync; location transfer between accounts; native Android / iOS technician app on the
routes Phases 3-4 leave behind.

### Recommended immediate order

Pass 11a → 11b (Invoice modal) → **11c (invoice document parties) → 11d (down payment on the first
visit's invoice)** → Pass 12 (Billing Plan required + sold-by) → Pass 16 (ticket lockdown) → Pass 13
(Batch Invoice + Draft) → Pass 14 (aging) → Pass 25 (opportunity taxonomy) → Pass 27 (cancel /
reschedule) → **Pass 27b (its owner review, before Pass 15)**. The rest in phase order. 11c and 11d are inserted ahead of 12 (owner, 2026-09-21)
because they are the money path the owner is live-testing now and both are small. Pass 16 is pulled
forward because it is an integrity hole, not a feature; Passes 25 and 27 because the board's cancel
path is the other divergence in daily use.

---

## Part D — Pass 11a: the Invoice modal (spec)

**Why one component.** Both invoice surfaces (Invoices screen, location Invoices tab) now carry six
to nine buttons per row and no way to see line items, the visit, or the ticket. The modal absorbs
every action and figure; the rows go back to being a list.

**Server (one new read; every write reuses an existing route).**
- `GET /api/invoices/:id` → `{ invoice, lines: [line + serviceTypeName, serviceDate, ticketStatus],
  customer: { id, label }, location: { id, name, address } | null, appointment: { id, scheduledDate,
  technicianLabel } | null }`. Org-scoped, 404 on a foreign id, open read like the other invoice reads.
  Lines from `getInvoiceLineItems` (`storage.ts:4465`); the appointment via `storage.getAppointment()`
  (`storage.ts:664`) inside the same read — there is no single-appointment route and none is added.
- Reused as-is: `/ledger`, `/location-balance`, `/document-info`, `/document`, `PATCH /:id` (notes,
  due date — gets its first client caller), `/issue`, `/void`, `/batch-send`, `POST /api/payments`,
  `/apply-location-balance`, `/api/payment-applications/release`, `/api/credit-memos`,
  `GET /api/audit-logs?entityType=invoice&entityId=`.
- Deferred to Pass 11b: `GET /api/invoices/by-appointment/:id` (does not exist today; only
  `/api/payments/by-appointment/:appointmentId` does) and `POST /api/invoices/:id/assign-location`.

**Client.**
- `client/src/components/invoice-detail-dialog.tsx` (`InvoiceDetailDialog({ invoiceId, open,
  onOpenChange })`). Sections: header (number, derived status badge incl. overdue, sent stamp,
  **customer link, location link** or "No location"); visit block (date, technician, "Open on
  schedule" → `/schedule?appointmentId=&date=`; absent for manual and schedule-driven invoices, which
  say so); lines table (description, type badge — AGREEMENT_COVERED reads "Covered", INITIAL_CHARGE,
  SURCHARGE…, qty, unit, amount, tax; the per-line "Open ticket" link arrives with Pass 11b); totals
  (subtotal, tax, total, paid, pending confirmation, balance due); terms (billing profile snapshot,
  due date, tax reason); ledger (`InvoiceApplications` reused, Release gated `APPLY_PAYMENT`; pending
  payments with Confirm gated exactly as the ledger panel); notes (editable, `SEND_INVOICE`); history
  (audit rows for this invoice via the existing diff renderer).
- Footer by state: DRAFT → Preview PDF, Issue (`GENERATE_INVOICE`, 409 → the existing prefinalization
  confirm), Void (`VOID_INVOICE` — now gated client-side too). Issued → Open PDF, Download, Mark Sent /
  "Sent <date>" (`SEND_INVOICE`), Record Payment (`TAKE_PAYMENT_FIELD`, existing dialog with the
  invoice), Apply location balance (`APPLY_PAYMENT`, only when the pool > 0), Issue credit memo
  (`ISSUE_CREDIT_MEMO`: `IssueCreditMemoDialog` already exists but is module-local in
  `location-ledger-panel.tsx:179` and needs a `locationId` — export it or move it to its own file;
  disabled with a reason on the two location-less rows), Void (`VOID_INVOICE`). **Void on PAID:** the
  server voids a PAID invoice today, releasing its applications back to the location (the recorded
  void-and-re-enter correction path; `voidInvoiceTx` has no PAID guard), while the Invoices row hides
  the button on PAID. The modal follows the server: Void on every issued invoice, behind a confirm that
  names the applications it will release. VOID → read-only with the void audit row shown. No Email
  button (B10).
- Rows: the Invoices screen row keeps number, status, customer (link), location (link), issued, due,
  Paid / Balance / pending one-liner, total; the whole row opens the modal; every button leaves the
  row. `invoice-document-actions.tsx` moves inside the modal (delete the row usage; keep the
  component). `InvoiceRowLedger` follows in Pass 11b.
- Deep link in this pass: `/invoices?invoiceId=` (`invoices.tsx` reads no query params today; add
  one). The customer-detail `invoiceId` param, Ticket Review's `?recordId=`, and the Services tab /
  `ServiceDetailModal` links are Pass 11b.
- `invalidateInvoiceViews()` is a `startsWith("/api/invoices")` predicate
  (`lib/invalidate-invoice-views.ts:22`), so the new read is invalidated with no change.

**Verification.** `npm run check`; double boot (no migration); API smoke on PORT=5001: the new read
for a visit invoice (lines carry `serviceRecordId`, appointment present), a manual invoice (no
appointment), a schedule-driven one, a DRAFT (no `issuedAt`), a foreign-org id (404); notes PATCH
from the modal writes one audit row and an unchanged PATCH writes none; Void as support 403 / as
manager VOID with the application released. Manual UI: the Invoices screen row opens the modal, every
former row button is reachable inside it, the row has no buttons, `/invoices?invoiceId=` opens the
right invoice. Counts back at baseline; fixtures via `POST /api/invoices` with a location (cheapest,
while the manual route still exists) and one finalized visit for the line links.

**Shipped in Pass 11a** (`feature/phase-2-invoice-modal-core`, 2026-09-19), for Pass 11b to build on —
the spec above as built, plus what it found.

```ts
// shared/invoice-detail.ts - the read's shape, and the pure describers the modal renders with.
export interface InvoiceDetail {
  invoice: Invoice;
  lines: InvoiceDetailLine[];                                   // InvoiceLineItem + serviceTypeName | serviceDate | ticketStatus (null with no ticket)
  customer: { id: string; label: string };                      // "First Last", else companyName
  location: { id; name; address; city; state; zip } | null;    // null on the two location-less rows
  appointment: { id; scheduledDate; status; technicianLabel } | null;   // null for manual / schedule-driven / initial-charge / ticket-anchored
}
export function describeInvoiceOrigin(invoice, lines): { kind: "VISIT" | "TICKET" | "INITIAL_CHARGE" | "SCHEDULE" | "MANUAL" | "UNKNOWN"; label }
export function describeInvoiceLineType(lineType)   // AGREEMENT_COVERED -> "Covered", INITIAL_CHARGE -> "Initial charge", ...
export function describeTicketStatus(status) / describeInvoiceTerms(terms) / readBillingProfileSnapshot(value)
export function describeTaxSnapshot(value)          // TAX_RULE / DEFAULT / EXEMPTION_CERTIFICATE / NO_ACTIVE_RATE, and the wrappers
                                                    // MANUAL (office-typed tax), AGREEMENT_COVERED, PER_LINE (multi-line visit, `lines[]`)

// server/storage.ts - IStorage. Composed from getInvoice (the org scope: undefined outside it),
// getInvoiceLineItems, getCustomer, getLocation, getAppointment, plus the lines' records / services /
// service types and the appointment's technician (falling back to a ticket's technicianName).
getInvoiceDetail(id): Promise<InvoiceDetail | undefined>

// Routes. Open read like every invoice read; 404 outside the org. Registered BELOW
// /api/invoices/ready-for-billing and /api/invoices/batch-preview - a bare :id above them swallows both.
GET /api/invoices/:id

// client
components/invoice-detail-dialog.tsx   InvoiceDetailDialog({ invoiceId, open, onOpenChange })
components/invoice-status-badge.tsx    isInvoiceOverdue / invoiceStatusLabel / InvoiceStatusBadge / InvoiceStatusIcon - the row and the modal share one derivation
components/audit-log-entry-card.tsx    AuditLogEntryCard({ entry, showEntityType }) - the location History tab's renderer, extracted; the tab uses it
components/location-ledger-panel.tsx   now exports IssueCreditMemoDialog (+ defaultInvoiceId), InvoiceApplications (+ confirmPending: Confirm on an
                                       unreleased PENDING payment row, gated by mayConfirmPayment exactly as the panel), InvoiceLedgerResponse
pages/invoices.tsx                     rows are data + open (customer and location are links); /invoices?invoiceId= opens the modal - push on open so
                                       Back closes it, replace on close
```

Behavior worth knowing before Pass 11b touches it:
- **Void follows the server.** The footer offers Void on every non-void invoice, DRAFT and PAID
  included, behind a confirm that lists the unreleased applications from the `/ledger` read and,
  on PAID, says the money goes back on the location balance. Verified live: voiding a PAID visit
  invoice released its confirmed check to the location's on-account pool, exactly the amount.
- **One Save for notes and due date**, sending only the keys that changed, so an unchanged save
  sends nothing and the server's audit-only-on-change rule (Pass 8) writes nothing (verified: two
  identical notes PATCHes, one `update` row). The due date goes up as local noon of the picked day;
  on a DRAFT the input is disabled, since issue re-resolves it from the billing profile.
- **Apply location balance** appears only when `/location-balance` reports `suggestedCents > 0`;
  a pool that is all designated elsewhere would open a prompt that closes itself.
- **Record Payment and Issue credit memo** are disabled with the reason on the two location-less
  rows (INV-000001, INV-000072); `assign-location` is Pass 11b.
- **What left the row**: the sent stamp and the "Draft - not issued" note now live in the modal's
  header and banner; the row keeps number, status, customer link, location link, issued, due, the
  Paid / Balance / pending line and the total. `InvoiceDocumentActions` is used by the modal footer
  and, until 11b, by the location tab's `InvoiceRowLedger`, which is otherwise untouched.
- **Not built, by the spec**: the per-line "Open ticket" link, the by-appointment read, the
  location tab rows opening the modal, `assign-location` (all 11b); email (B10).
- **Verified 2026-09-19** (PORT=5001, two boots printing only "serving on port 5001", 50 API
  assertions with every table count back at baseline, 28 pure-helper cases, and a Vite 200 on each
  touched client module): the read for a finalized visit (line names its ticket, FINALIZED, service
  type and date, technician label, taxable location's tax on the line), a manual invoice (no
  appointment, one ADJUSTMENT line, `taxSnapshot.reason = MANUAL` - the spec's "no snapshot" guess
  was wrong, the manual path snapshots its typed tax), an existing schedule-driven invoice, a DRAFT
  (no `issuedAt`, line priced from the service with no ticket), a random id (404 - the dev DB has one
  org, so a foreign-org id could not be minted; the org scope is `getInvoice`'s `orgId` clause), the
  two fixed-path routes still answering, notes / due-date PATCH audit rows, technician PATCH 403,
  support void 403, manager void with a pending application released and the 2000 back in the
  location's pending pool, void on PAID. The modal itself was not rendered here - the repo has no
  browser automation - so its layout reaches the owner first.

**Shipped in Pass 11b** (`feature/phase-2-invoice-modal-reach`, 2026-09-20) — the C2.1b row as
built, plus what it found.

```ts
// shared/invoice-detail.ts
export interface UnfinalizedTicketView { serviceId; serviceRecordId: string | null; ticketStatus: string | null; description }
                                        // the issue route's 409 list, shared now (the modal's local mirror is gone)
export interface AppointmentInvoiceStatus {
  appointmentId: string;
  invoice: Invoice | null;              // the visit's one non-void invoice through EITHER anchor (appointment, or a pre-D1 row anchored on
                                        // one of its tickets); a DRAFT counts (it holds the anchor, Generate adopts it), a VOID one does not
  finalized: boolean;                   // every non-cancelled service on the visit has a billing-ready ticket - the issue path's own test
  unfinalizedTickets: UnfinalizedTicketView[];   // empty when finalized
}

// shared/permissions.ts
ASSIGN_INVOICE_LOCATION = "assign_invoice_location"   // manager, admin

// server/storage.ts - IStorage. Both composed from helpers that already existed; no migration.
getAppointmentInvoiceStatus(appointmentId): Promise<AppointmentInvoiceStatus | undefined>
                                        // getAppointmentBillingGroupTx + findInvoiceForVisitTx + describeUnfinalizedTicketsTx; undefined outside the org
assignInvoiceLocation(id, locationId, actor?): Promise<Invoice | undefined>
                                        // refuses VOID, an invoice that already HAS a location (a repair, never a transfer), an unknown location,
                                        // another customer's location (createManualInvoice's rule); sets locationId only - snapshots and rollups
                                        // untouched; audit `update` with the before / after rows, like the notes / due-date PATCH

// Routes.
GET  /api/invoices/by-appointment/:appointmentId    open read; 404 outside the org; a fixed path, registered with the others above the bare :id reads
POST /api/invoices/:id/assign-location { locationId } ASSIGN_INVOICE_LOCATION; 404 unknown invoice, 400 for zod and every storage refusal

// client
components/invoice-detail-dialog.tsx   every line with a serviceRecordId carries "Open ticket" -> /service-ticket-review?recordId=; "No location"
                                       gains Assign location (AssignInvoiceLocationDialog, module-local: the customer's locations from
                                       /api/locations/:customerId, primary preselected) for ASSIGN_INVOICE_LOCATION on a non-void invoice
components/location-ledger-panel.tsx   InvoiceRowLedger({ invoice, onOpen }) - the whole row is data + open (status icon, number,
                                       InvoiceStatusBadge, issued / due, Paid - Balance - pending, total). Record Payment, Apply location
                                       balance, Applications and the document actions left the row for the modal; the panel header keeps its
                                       location-level Record Payment / Issue Credit Memo. The `locationId`, `agreements`, `unappliedCents` props are gone.
pages/customer-detail.tsx              /customers/:id?locationId=&tab=&invoiceId= opens the modal, hosted once at page level. openInvoice() adds
                                       invoiceId to the URL AS IT STANDS and pushes (Back closes), closeInvoice() drops it and replaces - every
                                       other parameter kept, because the compat read keys on locationId and changing it reloads the page around
                                       the modal. The Invoices tab maps rows to InvoiceRowLedger (its ledger-summary read is gone - the modal
                                       reads its own). ServicesTab's onOpenInvoices() -> onOpenInvoice(invoiceId): the Invoice column and
                                       ServiceDetailModal's invoice number open the modal (that badge is InvoiceStatusBadge now).
pages/service-ticket-review.tsx        ?recordId= opens that ticket through openRecordFromQueue, once per id (a ref: the records list refetches
                                       on every finalize, and re-running would re-snapshot the run under Next / Back); the parameter is cleared
                                       on close and on an id that does not resolve (toast). VisitInvoiceBlock in the header beside the ticket
                                       badge, from the by-appointment read: the invoice as a badge-button opening InvoiceDetailDialog (page
                                       state); "Generate invoice" (finalized, none) or "Issue draft" (finalized, DRAFT) under GENERATE_INVOICE,
                                       through generate-from-service-record - the prompt's own route - then D4's ApplyLocationBalancePrompt as
                                       the prompt asks it; otherwise one line saying why there is none. invalidateReviewData() also invalidates
                                       ["/api/invoices/by-appointment"], so the badge moves on a finalize that does not complete the visit.
```

Behavior worth knowing before the next pass touches it:
- **The two location-less rows were not assigned.** INV-000001 (Sarah Chen) and INV-000072 (Alex Jones)
  each sit on a two-location customer; the repair now exists as Assign location in the modal's header,
  manager+, and the owner picks. Once assigned, a row cannot be moved again from the UI (the route
  refuses an invoice that already has a location) - a transfer would be a separate, ledger-aware unit.
- **A deep-linked ticket leaves the queue's filters alone.** A finalized ticket opened from an invoice is
  not in the default Pending Review list, so the run is empty and Next / Back stay hidden, exactly as for
  any ticket not opened from the queue; closing it clears `?recordId=`.
- **The invoice modal on the review page is page state, not the URL**: the page's one deep link is the
  ticket, and the modal's own "Open ticket" navigates to `?recordId=`, which closes it and opens that ticket.
- **Generate on the review modal is the finalize prompt's Generate** - no Generate & Send there; Mark Sent
  lives in the modal, one click away on the badge. A visit whose services were all detached (an orphaned
  appointment) reports `finalized: true` vacuously, as generation already treats it.
- **Verified 2026-09-20** (PORT=5001, two boots printing only "serving on port 5001", 38 API assertions
  with every table count back at baseline, a Vite 200 on the five touched client modules): assign-location
  as support and technician 403, no body 400, unknown location 400, another customer's location 400, random
  invoice 404, none of which wrote an audit row; the manager's assign set the location, kept status and
  totals, wrote one `update` row (before `locationId` null, after set, actor the manager), put the invoice
  on the location's list, and a second assign refused "already has a location"; assign on VOID refused. The
  by-appointment read for a two-service visit through its whole life: no tickets (two "no ticket posted"
  refs), both posted (two OFFICE_REVIEW_PENDING refs naming the records), one finalized (`finalized`
  false, exactly the other service outstanding, the finalize response's `invoicing` null), both finalized
  under PROMPT (`finalized` true, `invoice` null - the Later case), generated (OPEN, both lines naming
  their FINALIZED tickets - the Open ticket targets), voided (`invoice` null, still finalized), drafted
  (DRAFT reported); random appointment 404; ready-for-billing, batch-preview and :id/ledger still answer.
  Nothing rendered here - the badge column in the review modal's header, the slim location-tab rows and the
  assign dialog reach the owner first.

**Shipped in Pass 11c** (`feature/phase-2-invoice-document-parties`, 2026-09-21) — the C2.1c row as
built, plus what it found.

```ts
// shared/invoice-detail.ts
export type InvoiceBillToSource = "PROFILE" | "LOCATION_OVERRIDE" | "PRIMARY_LOCATION";
export interface InvoiceBillToSnapshot { name: string; address: string | null; source: InvoiceBillToSource }
export interface InvoiceServiceLocationSnapshot { name: string; address: string | null }
export interface BillingProfileSnapshotView {   // readBillingProfileSnapshot(invoice.billingProfileSnapshot); null for a null snapshot
  profileId: string | null;                      // null when the snapshot was written with no billing profile resolved
  label; billingType; invoiceTerms; billingName; billingAddress: string | null;   // the profile's keys, all null without one
  billTo: InvoiceBillToSnapshot | null;          // null on a pre-11c snapshot (the profile keys only - the parties were not frozen)
  serviceLocation: InvoiceServiceLocationSnapshot | null;
}
describeBillToSource(source): string            // "billing profile address" | "this location's billing profile" | "primary location"

// server/storage.ts - all private; no IStorage change, no route change, no migration.
resolveInvoiceTermsForLocationTx(tx, locationId)
                                        // ALWAYS writes a snapshot when there is a location: { profileId | null, label, billingType, invoiceTerms,
                                        // billingName, billingAddress (the profile's, or null), billTo, serviceLocation, snapshottedAt }. dueDate from
                                        // the profile's terms, null without one. A null snapshot only without a location, which no path allows since
                                        // Pass 10. Callers unchanged: generate-from-record, draft, issue, initial charge. NEW callers:
                                        // createManualInvoice (the snapshot was hardcoded null) and generateScheduleDrivenInvoice (its inline copy
                                        // of the snapshot is gone).
resolveInvoicePartiesTx(reader, location, profile | null)
                                        // billTo: profile.billingAddress -> PROFILE; else a location-level profile (profile.locationId === location.id)
                                        // -> LOCATION_OVERRIDE with the location's own address; else PRIMARY_LOCATION with the primary's. Name:
                                        // profile.billingName, else "First Last", else companyName, else "Customer" - the document's old order.
                                        // serviceLocation: the invoice's location, name and one-line address.
getPrimaryLocationTx(reader, location)  // the small helper the pass added (there was none): account.primaryLocationId -> the account's isPrimary row
                                        // -> (a location without an account) the customer's isPrimary row -> the location itself. `reader` is a
                                        // transaction or `db`, so the render fallback below can use it.
formatLocationAddress(location), describeServiceLocation(location)   // module-level: "addr, city, ST, zip", every part trimmed, null when empty
getInvoiceDocumentContext(invoiceId)    // reads billTo / serviceLocation. TRANSITIONAL fallback when the snapshot has no `billTo` key (null, or the
                                        // pre-11c profile-only shape): the snapshotted profile address if any, else the PRIMARY location's - never
                                        // the service location's, which is what printed before; Service Location from the invoice's location.

// server/documents/types.ts
InvoiceDocumentContext.serviceLocation: { name: string; address: string | null } | null   // null only for the two location-less rows

// server/documents/invoice-pdf.ts, invoice-html.ts - three party blocks on one row: REMIT TO | BILL TO | SERVICE LOCATION (PDF at x 50 / 220 /
//   390, width 155, the table now starts under the TALLEST block rather than the last one written; HTML .parties is three equal flex blocks).
//   The block is omitted, not dashed, when serviceLocation is null. Both renderers stay byte-deterministic.

// client/src/components/invoice-detail-dialog.tsx - Terms block: the profile's label and type, or "No billing profile - default terms"; the
//   terms; "Bill to <name>, <address> (<source>)"; "Service location: <name>, <address>". A pre-11c snapshot keeps the old "Bill to
//   <billingName>" line; a null snapshot keeps "No billing profile was snapshotted."
```

Behavior worth knowing before the next pass touches it:
- **Two legacy shapes, one fallback.** The dev DB had 45 invoices with no snapshot and 19 with the profile-only
  shape (all Sarah Chen's account, whose two profiles have no address). Both lack a `billTo` key, and that key's
  absence is the one trigger for the render-time fallback. There is no migration: the parties of a legacy row are
  resolved when its document is first rendered, from the customer's primary location as it stands then.
- **Stored documents keep their bytes.** Eight INVOICE documents exist on the dev DB; `getOrCreateInvoiceDocument`
  returns the stored row, so those eight keep printing the service location as Bill To. That is §1.7's rule, not an
  oversight - re-rendering them would be a deliberate decision (delete the `documents` row) the owner makes.
- **An account-level profile without an address bills the primary location** (`PRIMARY_LOCATION`, `profileId` set) -
  the dev DB's "Corporate Card" profile is exactly that. Only a location-level profile without an address bills that
  location's own address (`LOCATION_OVERRIDE`). Until C5.2 (Pass 34) no screen creates a profile or gives one an
  address, so on the dev DB every new invoice bills the primary location.
- **The manual path keeps its own due date.** `createManualInvoice` now freezes the parties and profile terms but
  still writes the due date the office typed (or none), never the profile's terms - that is a behavior change the
  spec did not ask for, left for C2.3's "Add fee / adjustment" to decide.
- **Drafts carry the parties from creation** and re-resolve them at issue, as terms always did, so a customer whose
  primary location changes between drafting and issue is billed at the issue-time primary.
- **Trailing whitespace exists in live data**: the Rental location of Alex Jones (`236b63b8`) has "Rental " and
  "Hurst ". The snapshot and the document trim every part; nothing else in the app does.
- **Verified 2026-09-21** (PORT=5001, two boots printing only "serving on port 5001" - there is no bootstrap
  change - 64 assertions run on each boot with invoices / lines / documents / billing profiles / audit rows all back
  at baseline): a manual invoice at the non-primary Rental location with no profile → `PRIMARY_LOCATION` with the
  primary's address (1100 W Pipeline Rd) and Alex Jones as the name, `serviceLocation` Rental at 812 W Hurst Blvd,
  `profileId` null; a `POST /api/billing-profiles` override for Rental with an address and a billing name →
  `PROFILE` with both; the same profile PATCHed to no address and no name → `LOCATION_OVERRIDE` with Rental's own
  address and the customer's name; PATCHed to an account default (`locationId` null) → `PRIMARY_LOCATION` with
  `profileId` set; three legacy rows forced by SQL (null snapshot, profile-only with an address, profile-only
  without) → the document context prints the primary's address / the snapshotted address / the primary's address
  respectively, Service Location from the invoice's location for all three, and the null-snapshot row's
  `/document` answers a 200 PDF stored once; `/document` inline and `?download=1` attachment served from one stored
  row; `readBillingProfileSnapshot` returns the new keys for a new row, `billTo` null for the profile-only shape,
  null for a null snapshot; both renderers print the block when given one and omit it otherwise, byte-identical
  across two renders; the modal module transforms through Vite. Nothing rendered in a browser - the third block's
  layout on a real page and the Terms wording reach the owner first.

**Shipped in Pass 11d** (`feature/phase-2-down-payment-first-visit`, 2026-09-22) — the C2.1d row as
built, plus what it found.

```ts
// shared/initial-charge.ts
export function initialChargeRidesFirstVisit(charge): boolean      // DOWN_PAYMENT - the one type that bills on the first visit
export function officeMayCollectInitialCharge(charge) / technicianMayCollectInitialCharge(charge)   // the collector field's readers; null = both
export interface AgreementInitialChargeStatus { kind: "NONE" | "PENDING" | "ISSUED" | "SETTLED_OUTSIDE_LEDGER"; ridesFirstVisit; amountCents;
                                                invoice: InitialChargeInvoiceRef | null; message }
                                        // PENDING: no live event (invoice = the voided carrier, if any); ISSUED: invoice.appointmentId says visit or up front
export interface InitialChargeDue { agreementId; agreementName; locationId; amountCents; collectedBy }   // the office prompt's payload

// shared/visit-billing.ts
export interface VisitChargeBilling { kind: "INITIAL_CHARGE"; agreementId; agreementName; description; collectedBy; priceCents; taxCents;
                                      coaAppliedCents; coaAvailableCents; dueTodayCents }
VisitBillingSummary.charges: VisitChargeBilling[]     // counted in totals; COA draws on the services first, then the charges (invoice line order)
export function technicianCollectibleCents(summary)    // due today less charges only the office may collect - the collect step's default amount

// server/storage.ts - private
getInitialChargeEventTx(reader, agreementId)           // { event, invoice, live }: live = no invoice (settled outside the ledger) or invoice not VOID
resolvePendingInitialChargesTx(reader, { agreements, accountId, lock? })   // DOWN_PAYMENT, not CANCELLED, resolvable, no live event; taxed as the
                                                       // standalone path taxes it; lock = FOR UPDATE on the agreement row + re-read (the issuing paths)
attachInitialChargeEventsTx(tx, invoice, initialCharges)   // insert, or re-point a non-live event; throws if another issue made it live meanwhile
describeInitialChargeDueTx(reader, agreement)          // office may collect, still owed, designated unapplied money < amount
buildVisitInvoiceLinesTx(...)                          // appends the INITIAL_CHARGE line(s) after the service lines; PricedVisitInvoice.initialCharges
issueInitialChargeInvoiceTx(...)                       // the explicit path: row lock; refuses a LIVE event ("billed on visit invoice INV-x" /
                                                       // "issued as INV-x" / "settled outside the ledger"); re-points a non-live one
// IStorage
getAgreementInitialChargeStatus(agreementId): Promise<AgreementInitialChargeStatus | undefined>   // replaces getAgreementInitialChargeInvoice
getInitialChargeDueForAgreement(agreementId) / getInitialChargeDueForAppointment(appointmentId): Promise<InitialChargeDue | null | undefined>
issueInitialChargeInvoice(agreementId, actor)          // now throws on ALREADY_ISSUED (Pass 6 returned that invoice with a 201)

// Routes
GET  /api/agreements/:id/initial-charge-status        // replaces /initial-charge-invoice (the card was its only consumer)
POST /api/agreements, POST /api/appointments          // the created row plus `initialChargeDue: InitialChargeDue | null`

// server/agreement-bootstrap.ts - self-guarding one-shot, guarded on the ledger tables existing: DOWN_PAYMENT agreements created before
// 2026-09-22 with no INITIAL_CHARGE event whose first visit is already invoiced (non-void, appointment-anchored) get an event with no invoice;
// the per-row effect is printed before each insert. Three rows on the dev DB, none on a later boot.

// client
components/visit-billing-summary.tsx   charge rows in VisitBillingRows / VisitBillingTable; VisitInitialChargeCallout({ summary }) - the technician's
                                       reader (a muted line for OFFICE_AT_SIGNING); ServiceBillingFigures takes a testId
components/initial-charge-due-prompt.tsx   InitialChargeDuePrompt({ due, onClose }) - "Collect the $X down payment now?" -> RecordPaymentDialog
                                       with `preset` (designation and amount fixed); WithInitialChargeDue<T>
components/record-payment-dialog.tsx   preset?: RecordPaymentPreset;  components/collect-payment-dialog.tsx  default = technicianCollectibleCents
pages/schedule.tsx                     placement -> the prompt, then returnTo;  pages/customer-detail.tsx  AgreementForm.onCreated -> the prompt on
                                       the agreements tab; AgreementInitialChargeStatus reads the status: "Billed on the first visit's invoice" +
                                       "Issue up front instead" / "Invoiced as INV-x (first visit | up front)" / "settled outside the ledger"
pages/technician-work.tsx, components/service-completion-dialog.tsx   the callout beside the figures
```

Behavior worth knowing before the next pass touches it:
- **Two un-invoiced visits of one agreement both show the pending deposit.** The line means "no live
  event", not "first by date": whichever visit is issued first takes it (under the agreement's row
  lock) and the other's summary drops it on its next read. Two technicians on the same day could each
  be shown it; the office sees one line, on one invoice.
- **Liveness, not existence.** Voiding the invoice that carries the deposit - a visit's or the
  standalone - makes the charge owed again everywhere: the next visit summary shows it, generation
  carries it, the explicit button works, and the one event is re-pointed at the new carrier. Pass 6's
  "voiding does not re-open the event" no longer holds for INITIAL_CHARGE events; it still holds for
  the nightly run's SCHEDULE_DRIVEN ones.
- **A draft previews, issue attaches.** A DRAFT's lines carry the down-payment line; the event is
  written when the draft is issued, or adopted by Generate, after the lines are rebuilt.
- **The office prompt never sets `payments.appointmentId`.** The spec named the appointment; canon
  §14 reserves that column for the field's collect dialog. The designation alone puts the money in
  D4's order (designated first) for the visit's invoice and in the technician's "COA available".
- **A per-service figure is not the visit's** (owner's first render, 2026-09-23). `ServiceBillingBlock`
  shows the SERVICE's Price / COA / Due today; with a deposit on the visit a covered service read
  "nothing due today / $0.00" under a callout saying $108.20 is due, and the ticket header shows no
  visit total. The block now says "nothing due for the service itself" and adds "This service $X +
  down payment $Y = visit due today $Z" wherever a charge rides (ticket header and appointment
  details); the collect step and the review table already listed both lines. The per-service label
  stays "Due today" (D6's vocabulary); the reconciling line is what removes the contradiction.
- **Office-only deposits stay on the figures.** With `OFFICE_AT_SIGNING` the technician's due today
  still includes the deposit (it is on the invoice), the callout says the office collects it, and the
  collect step's default amount leaves it out.
- **Not built:** the batch-invoice preview's per-ticket amounts do not show a pending deposit that
  generate will bill (C2.3 moves the batch anyway); `CLEANOUT_SURCHARGE` / `PREPAY_FULL` never ride a
  visit and are issued only from the card until C3.6 retires them; a visit carrying two agreements'
  deposits prompts the office for the first by name only. The 11e split was not needed.
- **Verified 2026-09-22** (PORT=5001; boot 1 printed the migration's three rows, boot 2 printed only
  "serving on port 5001" with all 42 tables unchanged; 54 API assertions on boot 2 with every count
  back at baseline; a Vite 200 on the ten touched client modules): creation returns `initialChargeDue`
  and no invoice; the first visit's summary prices $75 (remaining ÷ 4) beside the $100 deposit,
  BILLABLE, totals summed; a $100 payment designated to the agreement silences the prompt at the next
  scheduling and shows as COA available; generate → SERVICE 7500 + INITIAL_CHARGE 10000, the tax
  snapshot per line, one event on the visit invoice, the second visit's summary empty of it, the
  explicit button refused "billed on visit invoice"; void → PENDING naming the voided invoice, the
  line back on both summaries, regenerate → the line again with the event re-pointed; the explicit
  path on a fresh agreement → standalone + event, a second press 400, a visit after it carries
  nothing, void → the visit shows the office-only charge, a third press re-points; a Monthly Recurring
  agreement → PRODUCTION $0 + the $100 deposit, a draft previews both lines with no event, Generate
  adopts and attaches; the three Daily Rodent Trapping rows read SETTLED_OUTSIDE_LEDGER with their
  next visit clean and the button refused; Wildlife PENDING at $124.75; a technician's press 403.
  Nothing was rendered in a browser: the callout, the charge rows, the prompt and the new card copy
  reach the owner first.

**Shipped in Pass 12** (`feature/phase-2-billing-plan-required-sold-by`, 2026-09-23) — the C2.2 row as
built, plus what it found.

```ts
// shared/schema.ts
agreements.billingPlanId          // NOT NULL (was nullable); every insert path resolves one
agreements.soldByUserId           // nullable users FK - sale attribution; null = not recorded
technicians.userId                // nullable users FK - the bridge to the login; partial unique index technicians_user_id_uidx
export type UserSummary = Omit<User, "passwordHash">

// shared/permissions.ts
ASSIGN_SALE_CREDIT = "assign_sale_credit"   // manager, admin

// shared/audit.ts
AuditEntityType gains "agreement"           // action `update`, written only for a soldByUserId change (the rest of the entity is C5.1a)

// shared/billing-plan.ts
export function buildBillingPlanSnapshot(plan, snapshottedAt?)   // THE snapshot builder (storage's private method delegates to it);
                                                                  // BillingPlanSnapshotFields in, BillingPlanSnapshot out
describeBillingPlanBehavior(null)           // "No billing plan chosen. Every agreement needs one: ..." (templates and an empty form)

// shared/users.ts (new)
userDisplayName(user) / sortUsersByName(list) / describeUserRole(role) / selectableUsers(list, currentId)   // active users + the current one

// server/storage.ts
getUsers(): Promise<UserSummary[]>          // IStorage; org-scoped, the hash column never selected, sorted by name
buildAgreementInsertFromTemplate            // throws "A Billing Plan is required: ..." when neither the agreement nor its template names
                                            // one, "Billing plan not found" for an unknown id; soldByUserId = the caller's value, else the actor
normalizeAgreementInsert / normalizeAgreementUpdate   // requireBillingPlanId() - a plan-less write is refused, never inserted
createAgreement / updateAgreement           // assertOrgUserTx on soldByUserId; updateAgreement writes the `agreement` `update` audit row
                                            // only when soldByUserId changes: before / after { soldByUserId, soldBy: "First Last" | null }
createTechnician / updateTechnician         // assertTechnicianUserLink: the user is the org's and linked to no OTHER technician
getAuditLogsForLocation                     // rolls the location's agreements in

// Routes
GET   /api/users                            // any authenticated user; UserSummary[]
POST  /api/agreements                       // agreement.soldByUserId other than the session user (null included) -> 403 without ASSIGN_SALE_CREDIT
PATCH /api/agreements/:id                   // a CHANGED soldByUserId -> 403 without it (the form sends the whole row; unchanged is not an
                                            // assignment); billingPlanId is z.string().min(1) - null and "" are 400
POST / PATCH /api/technicians               // userId: z.string().min(1).nullable().optional()

// server/agreement-bootstrap.ts - attachRequiredBillingPlans(), keyed on billing_plan_id still being nullable (a db:push database has
//   NOT NULL already and skips it). REPORT each plan-less row with the effect Pass 3.5's attach rules give it (plus: CANCELLED attaches for
//   the constraint only), THEN attach "Monthly Recurring" (id, snapshot, next billing date, the Pass 9 note line removed), THEN SET NOT
//   NULL - or, if an org has no plan of that name, leave its rows plan-less, say so, and let the constraint wait for the next boot.
// server/service-scheduling-bootstrap.ts - technicians.user_id + the partial unique index.

// client
pages/customer-detail.tsx   AgreementForm: the Billing Plan selector has no "No billing plan" option and Save refuses an empty one; a "Sale"
                            section with a Sold by selector (the org's active users plus the current one, "(you)" marked; defaults to the
                            session user on a new agreement; disabled below manager, with the reason). AgreementsTab card: a "Sold by" cell
                            (five columns now), "Not recorded" on a null.
pages/settings.tsx          TechnicianForm: a "Linked user" selector (None / the org's users with their role); the technicians list says
                            "Linked to X" / "No linked user". The template form's "No billing plan" option reads "No default - the office
                            picks a plan on each agreement".
```

Behavior worth knowing before the next pass touches it:
- **What the migration did on the dev DB** (boot of 2026-09-24 UTC, the evening of 2026-09-23 local).
  11 rows, all attached to Monthly Recurring. The 4 ACTIVE `Quarterly Control` rows (`76c15778`,
  `c21e8f9e`, `83408897`, `1957a3ed`) anchored on today - **next billing 2026-09-24** - because their
  April / May start dates had elapsed; the nightly run bills each **$33.33/mo** ($399.95 ÷ 12 periods
  of the term, the pill's own number) from there to its term end, never the elapsed periods. The 5
  CANCELLED `Quarterly Control` rows (`94343aa9`, `43438e38`, `12ffbbcb`, `d8de7167`, `9662bca9` -
  the roadmap said 4) attached for the constraint only, no schedule. The 2 `Wildlife Trapping
  Program` rows (`6e6f03c3`, `1044779c`) hit Pass 3.5's term-end refusal (CUSTOM/7 terms that ended
  2026-05-23 / 2026-05-30): plan attached, nothing billed. No row hit the billing-events refusal.
  The 9 `Quarterly Control` notes were exactly the Pass 9 line and are null now. A field-by-field
  diff of all 25 rows against a pre-boot JSON snapshot shows only `billing_plan_id`,
  `billing_plan_snapshot`, `next_billing_date`, `notes` and `updated_at` moving on the 11, and
  nothing but the new null column on the other 14.
- **The Wildlife rows are schedule-billed plans with no schedule.** Their visits now price as
  AGREEMENT_COVERED $0 and nothing bills them - the owner's call (the terms are over). `1044779c`'s
  pending 25% down payment still rides its first visit invoice (Pass 11d) if one is ever scheduled.
- **A new agreement from the Quarterly Control template bills one period out.** The template's
  $99.95 DOWN_PAYMENT default plus Monthly Recurring's "initial charge covers the first period" put
  `nextBillingDate` one month after the start date - Pass 3.5 / 5.5 arithmetic, unchanged; the smoke
  test's first expectation got this wrong, not the code.
- **The sale-credit gate is in the route, the audit row in the storage.** Only a *change* of
  `soldByUserId` needs the permission and only a change writes the row (Pass 8's audit-only-on-change
  rule), so a Save that leaves it alone writes nothing. Clearing to null is a change: gated, logged,
  and read as "Not recorded" everywhere.
- **Creation is not audited.** The created row carries `createdByUserId` and `soldByUserId`; a
  manager creating an agreement credited to someone else leaves no audit row until C5.1a records
  creations. The 25 pre-pass rows read "Not recorded"; the owner assigns them from the form.
- **A template still may carry no plan.** Only the agreement is constrained: a template without a
  default makes the office pick on each agreement, and the form refuses to save without one.
- **Verified 2026-09-23** (PORT=5001): `npm run check` clean; boot 1 printed the 11-row report and
  the constraint line and no bootstrap error; 80 API / SQL assertions on boot 1 as the four roles -
  the migration state row by row, the users read (sanitized, sorted, 401 unauthenticated), the plan
  refusals (missing / "" / null / unknown, on create and on PATCH), template propagation, the sold-by
  default and every gate as support, technician and manager, the audit row's actor / before / after
  and its absence on an unchanged Save, the History rollup, the technician bridge's refusals and the
  unique link - with every fixture deleted and nine table counts back at baseline; boot 2 printed
  only "serving on port 5001" with 42 of 43 tables' counts identical to the pre-boot-1 snapshot
  (`session` up by the smoke test's eight logins, which share the table with the owner's own
  sessions and were left alone); a Vite 200 on the four touched client modules and the new shared
  module. Nothing was rendered in a
  browser: the Sale section, the five-column card, the Linked user selector and the reworded plan
  text reach the owner first.

**Shipped in Pass 16** (`feature/phase-3-ticket-lockdown`, 2026-09-23) — the C3.1 row as built,
plus what it found.

```ts
// shared/ticket-status.ts (new) - the lockdown rules, read by the server and the technician view
export const TICKET_STATUSES = ["OFFICE_REVIEW_PENDING", "FLAGGED_FOR_REVIEW", "FINALIZED", "REOPENED"] as const;
isTicketFinalized(record)          // ticketStatus FINALIZED, or confirmed, or readyForBilling - finalize sets all three, reopen clears all three
isTicketInOfficeReview(record)     // OFFICE_REVIEW_PENDING | FLAGGED_FOR_REVIEW and not finalized
isTicketReopened(record)           // REOPENED and not finalized
technicianMayPostTicket(record | null)   // no record, or a REOPENED one
describeTicketLifecycle(record)    // "Finalized" (any signal) | "Pending review" | "Flagged for review" | "Reopened"

// shared/permissions.ts
EDIT_TICKET = "edit_ticket"        // support, manager, admin

// shared/audit.ts
AuditAction gains "ticket_edited"  // label "Ticket edited"; before / after = the ticket row + `productApplications` (content-only snapshots)

// server/storage.ts
export class TicketLockedError extends Error { code: "TICKET_FINALIZED" | "TICKET_IN_REVIEW"; status: 409 | 403 }
export interface UpdateServiceRecordInput { serviceDate?; technicianId?; notes?; targetPests?; areasServiced?; conditionsFound?;
                                            recommendations?; followUpRequired?; followUpNotes?; customerSignature?;
                                            productApplications? (replace-all when sent); actor? }
updateServiceRecord(id, input)     // IStorage; 409 TICKET_FINALIZED on a finalized ticket; returns the existing row untouched when nothing
                                   // changed (no UPDATE, no audit row); otherwise UPDATE + materials replaced if changed + `ticket_edited`;
                                   // a technician change re-copies technicianName / technicianLicenseNumber from the profile ("Technician
                                   // not found" for an unknown id) and follows onto services.assignedTechnicianId; a service-date change
                                   // re-syncs an INITIAL_APPOINTMENT agreement as before. The Service's status is never touched.
completeService(input)             // the existing record is read FIRST: FINALIZED -> TicketLockedError 409; in review without
                                   // can(actorRole, EDIT_TICKET) -> 403; then the post as before, plus `ticket_edited` when it wrote over
                                   // an existing record (before = old row + old materials, after = the posted row + new materials).
normalizeProductApplicationInputs(list)        // module-level: the post's trim / drop-nameless rule, now shared with the PATCH
snapshotTicketForAudit(record, applications)   // row + productApplications without ids (PRODUCT_APPLICATION_SNAPSHOT_FIELDS)

// Routes
PATCH /api/service-records/:id     // requirePermission(EDIT_TICKET); body is a STRICT z.object of the content fields above - `confirmed`,
                                   // `ticketStatus`, `readyForBilling`, the stamps and the identity columns are 400; 409 { code:
                                   // TICKET_FINALIZED } on a finalized ticket; the actor is the session's
POST  /api/services/:id/complete   // unchanged shape; 409 TICKET_FINALIZED / 403 TICKET_IN_REVIEW as above, before any write

// client
pages/services.tsx                 // the Confirm button and its PATCH { confirmed: true } are gone; the badge is describeTicketLifecycle();
                                   // each card links "Review ticket" / "Open ticket" -> /service-ticket-review?recordId=
pages/technician-work.tsx          // canOpenTicketEditor = technicianMayPostTicket; labels Create / Resume Service Ticket, Edit Reopened
                                   // Ticket, Ticket in Office Review, Ticket Finalized (the last two disabled); existingServiceRecord is
                                   // passed only for a REOPENED record
```

Behavior worth knowing before the next pass touches it:
- **Three signals, one meaning.** `confirmed`, `readyForBilling` and `ticketStatus = FINALIZED` are set
  together by finalize and cleared together by reopen, and every earlier reader used a different one
  (the finalize rollup `confirmed`, the by-appointment read `readyForBilling`, the flag guard both).
  `isTicketFinalized` reads all three, so the 10 dev-DB rows with `confirmed = true` under
  `OFFICE_REVIEW_PENDING` - the old Service History Confirm - are finalized for the lockdown exactly
  as they already were for the Services tab and the review modal; reopen unlocks them. No migration.
- **The office may re-post a ticket in review; the technician may not.** `EDIT_TICKET` is the line, not
  the role name, so C5.6's profiles inherit it. A re-post by anyone over an existing record is logged
  `ticket_edited`; a first post is an insert and writes nothing.
- **A re-post's `after` is the record as posted.** The D3 flag step (`flagTicketIfVisitAlreadyInvoicedTx`)
  writes its own `prefinalization_issue_override` row when the visit is already invoiced; the two rows
  chain (edited: old to posted; override: posted to flagged) rather than one row skipping a state.
- **Materials compare as content.** The snapshot drops `id` / `orgId` / `serviceRecordId`, so a re-post
  that resends the same materials shows no materials diff, and an unchanged PATCH with materials writes
  nothing at all. The post path still deletes and reinserts (unchanged).
- **Not on the PATCH:** the Service's price and type (C3.1b, with `ADJUST_PRICE_AGREEMENT`, logged
  `price_overridden` as a post's is); `POST /api/service-records` (the Service History page's direct
  create) is ungated as before; `updateServiceRecord`'s old `technicianName` / `technicianLicenseNumber`
  inputs are gone (the snapshot follows the technician id now).
- **Two 4xx shapes.** `{ message, code }` - `TICKET_FINALIZED` is a 409 for everyone, `TICKET_IN_REVIEW`
  a 403 for the technician; `getApiErrorCode()` reads both. The strict schema's refusal is the ordinary
  zod 400 ("Unrecognized key(s) in object: 'confirmed'").
- **Verified 2026-09-23** (PORT=5001): `npm run check` clean; boot 1 printed only "serving on port
  5001" with all 43 tables' counts unchanged; 60 API / SQL assertions on boot 1 as the four roles -
  a technician's first post (no audit row), a re-post in review 403 leaving the notes and the
  Service's price untouched, tech PATCH 403, unauthenticated 401, support PATCH with materials (one
  `ticket_edited`, actor / before / after / content-only materials), the same PATCH again and an
  empty one writing nothing, `confirmed` / `ticketStatus` / `readyForBilling` / `serviceId` /
  `finalizedAt` each 400 with the Service still SCHEDULED, a technician change (Austin Lowe /
  0526597, `assigned_technician_id` following, an unknown id 400), the office's re-post over the
  pending ticket 201 and logged with identical materials comparing equal, finalize, then tech /
  admin re-post and support / manager PATCH all 409, reopen (`ticket_reopened`), the technician's
  re-post 201 with REOPENED to OFFICE_REVIEW_PENDING and the reason cleared on the row, `GET
  /api/audit-logs` listing 5 rows (4 `ticket_edited`), finalize again; a second ticket simulating
  the legacy `confirmed` row (PATCH and re-post 409, reopen clears it) and FLAGGED_FOR_REVIEW (tech
  403, support PATCH 200), then a re-post on REOPENED 201 - with every fixture deleted and 42 of 43
  counts back at baseline (`session` up by the four logins); boot 2 printed only the serving line
  with every count unchanged; a Vite 200 on the two touched pages, the ticket dialog and the new
  shared module. Nothing was rendered in a browser: the lifecycle badge and the Review / Open ticket
  link on Service History and the technician view's relabelled button reach the owner first.

**Shipped in Pass 13** (`feature/phase-2-batch-invoice-and-draft`, 2026-09-24) — the C2.3 row as
built, plus what it found.

```ts
// shared/batch-invoice.ts (new) - the batch's shapes, read by the server and the Invoices screen
export interface BatchInvoiceFilters { dateFrom: string; dateTo: string; technicianId?: string | null }
                                   // a POSTING window (postedAt ?? serviceDate as a UTC day, inclusive); one technician or every one
export interface BatchInvoicePreviewTicket extends ServiceRecord { billingLineType: "SERVICE" | "AGREEMENT_COVERED" | null; billableAmountCents; billingNote }
export interface BatchInvoicePreviewCharge { appointmentId; serviceRecordId; agreementId; agreementName; description; amountCents; taxCents }
                                   // a down payment the visit's invoice will carry (Pass 11d's INITIAL_CHARGE line), keyed to the visit's anchor
export interface BatchInvoicePreview { tickets: BatchInvoicePreviewTicket[]; charges: BatchInvoicePreviewCharge[] }
export interface BatchGenerateResult { totalEligible; totalVisits; invoiced[]; skipped[]; totalAmountCents }   // moved from storage, shape unchanged
batchVisitKey(ticket)              // "appointment:<id>" | "serviceRecord:<id>" - D1's two anchors
toUtcDay(value)                    // YYYY-MM-DD, the repo's date-only convention
groupBatchInvoicePreview(preview, technicianLabel)
                                   // -> { groups: [{ technicianId, technicianLabel, days: [{ serviceDate, visits: [{ key, appointmentId,
                                   //    customerId, locationId, serviceDate, tickets, charges, amountCents }], amountCents }], ticketCount,
                                   //    visitCount, amountCents }], ticketCount, visitCount, chargeCount, amountCents }   (pure; before tax)
describeBatchTicketBilling(ticket) // { kind: AMOUNT | COVERED | CALLBACK | CANNOT_BILL, amountCents, note }

// server/storage.ts (BatchInvoicePreviewRow is now an alias of BatchInvoicePreviewTicket)
getServiceRecordsReadyForBillingInRange(filters)   // was (dateFrom, dateTo); technicianId filters service_records.technicianId
getBatchInvoicePreviewForDateRange(filters)        // -> BatchInvoicePreview (was BatchInvoicePreviewRow[]): per-ticket billing as before, plus
                                                   //    the charges: resolvePendingInitialChargesTx (read-only, no lock) over the agreements behind
                                                   //    EVERY finalized ticket of each listed visit, one entry per agreement, on the first visit
                                                   //    in the batch that would carry it
batchGenerateInvoicesForDateRange(filters, actor)  // was (dateFrom, dateTo, actor); the technician filter picks the visits, a visit bills whole
createManualInvoice(input)                         // dueDate: input.dueDate ?? terms.dueDate ?? null - blank means the location's billing terms

// Routes
GET  /api/invoices/batch-preview?dateFrom=&dateTo=&technicianId=   // batchInvoiceFiltersSchema (technicianId optional, non-empty); GENERATE_INVOICE
POST /api/invoices/batch-generate { dateFrom, dateTo, technicianId? } // same schema, same gate
POST /api/invoices/batch-send { invoiceIds }                          // unchanged; SEND_INVOICE
POST /api/invoices                                                    // unchanged shape; its only client is now Add fee / adjustment
POST /api/invoices/draft-for-appointment/:appointmentId               // unchanged; its second client is Draft invoice for a visit

// client
components/batch-invoice-dialog.tsx            // BatchInvoiceDialog({ open, onOpenChange, onOpenInvoice }): Posted from / Posted to (default: the last
                                               // 30 days), Technician (All technicians default), the preview grouped technician -> service date ->
                                               // visit with each visit's tickets and down-payment lines, "N tickets across M visits, with K down
                                               // payments riding along, billable $X before tax", Generate M Invoices, then result rows (number,
                                               // customer - location, total) that open the invoice modal, the skipped list, Send All (SEND_INVOICE)
components/draft-invoice-for-visit-dialog.tsx  // DraftInvoiceForVisitDialog({ open, onOpenChange, onCreated }): customer -> location (primary
                                               // default) -> that location's draftable visits (canDraftForVisit's rule: not CANCELED, not
                                               // COMPLETED, an active service, no non-void invoice) -> POST draft-for-appointment -> onCreated
components/add-fee-adjustment-dialog.tsx       // AddFeeAdjustmentDialog({ open, onOpenChange, customerId, locationId, onCreated }): description
                                               // (required), amount (> 0), tax (typed, not computed), due date (blank = the location's terms, the
                                               // hint reads GET /api/locations/:id/billing-profile), notes -> POST /api/invoices -> onCreated
components/location-ledger-panel.tsx           // LocationLedgerPanel({ customerId, locationId, invoices, agreements?, onOpenInvoice? }) - customerId is
                                               // new and required; the Balance card's third button is "Add fee / adjustment" (GENERATE_INVOICE)
pages/invoices.tsx                             // InvoiceForm and both New Invoice buttons are gone; the header carries "Draft invoice for a visit"
                                               // and "Batch Invoice" (GENERATE_INVOICE); both dialogs stay mounted under the invoice modal
pages/service-ticket-review.tsx                // the Batch Invoice button, dialog, preview query, generate / send mutations and local types are
                                               // gone; the queue's filters (including Technician) are untouched
pages/customer-detail.tsx                      // passes customerId and openInvoice to the ledger panel
```

Behavior worth knowing before the next pass touches it:
- **The window is a posting window; the grouping is by service date.** `getServiceRecordsReadyForBillingInRange`
  keeps a ticket whose `postedAt` (falling back to `serviceDate`) lands on a UTC day inside
  `dateFrom..dateTo` - unchanged since Phase 1, now said on the dialog ("posted between") - while
  the preview groups each technician's tickets by the ticket's UTC service day, a "route" being a
  technician on a day. A ticket posted on the 25th for work on the 24th is in a window that
  contains the 25th and shows under the 24th.
- **The technician filter chooses visits, not lines.** A visit is in the batch when one of its
  finalized tickets is the named technician's and was posted in the window; once in, generation
  bills every finalized ticket on it, whoever posted them and whenever - exactly how the range
  boundary was already handled. The preview lists only the tickets that matched (so a
  two-technician visit shows one ticket under a Tech A filter) and the dialog says so.
- **The preview shows the deposit generate will bill.** For each listed visit the agreements behind
  all of its finalized tickets go through `resolvePendingInitialChargesTx` without a lock, and the
  first visit in the batch that would carry an agreement's down payment lists it as a charge; a
  second visit of the same agreement lists nothing, because generate attaches the event to the
  first invoice and the next finds it live. The visit's preview figure (service lines + charges)
  matches the invoice's subtotal; the dialog's totals are **before tax**, generate's
  `totalAmountCents` includes it. `groupBatchInvoicePreview` lists a visit's charges with its first
  appearance only, so a visit split between two technicians never shows its deposit twice.
- **`GET /api/invoices/batch-preview` answers an object now** (`{ tickets, charges }`), not an
  array. The only client was the Service Ticket Review dialog this pass removed.
- **A manual invoice's blank due date means the location's terms.** `createManualInvoice` falls
  back to `resolveInvoiceTermsForLocationTx`'s `dueDate` (the resolved billing profile's
  `invoiceTerms` from today; null when no profile resolves), the default Pass 11c left for C2.3.
  A typed due date still wins. Every new invoice on the dev DB has no profile, so blank stays blank
  until C5.2 (Pass 34) can give a location one.
- **Draftable is the Services tab's rule, client-side; the server is the authority.** The draft
  dialog lists a location's SCHEDULED / IN_PROGRESS visits with an active linked service and no
  non-void invoice, sorted chronologically, and says how many others are already invoiced; a
  COMPLETED, finalized visit belongs to Ready to Bill. `createDraftInvoiceForAppointment` still
  refuses a cancelled or invoiced visit ("Appointment already has invoice INV-x") and returns the
  existing DRAFT rather than a second, so a stale list cannot create a duplicate.
- **Two dialogs under one modal.** Both the batch and the draft dialog stay mounted while the
  invoice modal opens on top (`/invoices?invoiceId=`), so a result row or a new draft opens the
  invoice and the batch's result list, with Send All, is still there when the modal closes.
- **Not built:** paging the preview (the eligible list is the whole org's), excluding one visit from
  a batch, delivery (Send All is still the `sentAt` stamp plus the pinned PDF, and its toast says
  so), a draft for a service with no appointment (no anchor - Pass 4's limit, B6), a billing
  profile the fee dialog could create (C5.2).
- **Verified 2026-09-24** (PORT=5001): `npm run check` clean; boot 1 printed only "serving on port
  5001" with all 43 tables' counts unchanged; 90 checks as the four roles - technician 403 on
  batch-preview / batch-generate / batch-send / draft / the manual invoice, unauthenticated 401,
  manager and admin 200, a missing date and an empty technicianId 400; the unfiltered preview with
  two technicians' visits over two days plus a COD agreement visit carrying a $100 down payment
  ($120 + $80 + ($400 - $100) / 4 = $75 service lines, the $100 charge on the right visit, named
  after the agreement), the grouping from `groupBatchInvoicePreview` (Tech A: two days, $120 and
  $75 + $100; Tech B: one day, $80; 3 tickets, 3 visits, 1 charge, $375 before tax; a synthetic
  two-technician visit counting once with its charge listed once; an unassigned technician sorting
  last), the Tech A / Tech B / unknown-technician filters and a window before the postings; generate
  over the range (3 visits, 3 invoices, 0 skipped; the agreement visit's invoice carrying SERVICE
  $75 + INITIAL_CHARGE $100 with the agreement's event pointed at it), the preview emptying and a
  second generate invoicing nothing; a draft for a scheduled visit (201 DRAFT, the same draft
  again, on the location's tab and outside its open balance) and 400 for an invoiced visit and an
  unknown one; three fees on the ledger's path (no profile: no due date; a NET_30 profile: due in
  30 days; a typed date kept; tax added; `invoice_issued` written; on the location's Invoices tab
  and in its open balance) with another customer's location and a missing location refused; Send
  All stamping the three and skipping the draft - every fixture deleted and 42 of 43 counts back
  at baseline (`session` up by the four logins); boot 2 printed only the serving line with every
  count unchanged; a Vite 200 on the three pages, the three new dialogs, the ledger panel and (under
  `/@fs/`) the shared module. Nothing was rendered in a browser: the two dialogs and the third
  ledger button reach the owner first.

---

**Shipped in Pass 14** (`feature/phase-2-aging-and-balances`, 2026-09-24) — the C2.4 row as built,
plus what it found.

```ts
// shared/aging.ts (new) - the aging's vocabulary and arithmetic, pure, read by the server and the client
AGING_BUCKETS = ["CURRENT", "DAYS_31_60", "DAYS_61_90", "OVER_90"]; AGING_BUCKET_LABELS; AGING_BUCKET_RANGES
AGING_BASIS_LABEL = "days since invoiced"       // said wherever a bucket is shown; never "past due"
daysBetweenUtcDays(from, asOf)                  // whole UTC calendar days; negative when issued after asOf, which buckets as Current
agingBucketForDays(days)                        // <= 30 CURRENT, <= 60 DAYS_31_60, <= 90 DAYS_61_90, else OVER_90
ageInvoice(invoice, asOf)                       // AgedInvoice | null - null for a DRAFT / VOID (isInvoiceIssued), a zero balance, or no issuedAt (never guessed)
summarizeAgingByLocation(invoices, sources, asOf) // -> LocationAging[] keyed by (customer, location): only locations with an aged balance or
                                                //    unapplied money; a location-less invoice under its customer with locationId null; invoices oldest
                                                //    first; largest open balance first, location-less last. Pure: the caller scopes the rows.
rollupAging(parts) / mergeAgingFigures(into, part) // sums every figure, oldest bucket = the older of the two; nothing netted
interface AgingFigures { openBalanceCents; buckets: Record<AgingBucket, number>; invoiceCount; oldestBucket: AgingBucket | null;
                         pendingAppliedCents; onAccountCents; pendingUnappliedCents }
interface LocationAging extends AgingFigures { customerId; locationId: string | null; invoices: AgedInvoice[] }
interface CustomerAging { customerId; asOf: "YYYY-MM-DD" (UTC); rollup: AgingFigures; locations: LocationAging[] }
interface AgingReport { asOf; totals: AgingFigures; customers: AgingReportCustomer[] }
                                                // a customer: its figures + firstName / lastName / companyName + locations (name, address, isPrimary; primary first)

// server/storage.ts
getCustomerAging(customerId)                    // -> CustomerAging | undefined (outside the org): the customer's invoices with balanceDueCents > 0 plus
                                                //    collectUnappliedSourcesTx over its payments and credit memos, through the shared summarizer
getAgingReport()                                // -> AgingReport: the org's invoices with a balance and its whole unapplied pool, grouped per customer,
                                                //    joined to customers / locations for names; customers largest open first, then on account, then name

// Routes - both open reads, like every read in the file (see "The gate" below)
GET /api/customers/:id/aging                    // 404 outside the org
GET /api/reports/aging                          // the first /api/reports route

// client
components/aging-strip.tsx                      // CustomerAgingChips({ aging, locationCount }) - the header's chips (open across all locations, oldest
                                                //    bucket, on account, pending confirmation; nothing until the read lands); LocationAgingStrip({ aging,
                                                //    asOf, isLoading, onOpenInvoice }) - the four bucket rows, each invoice a button into the modal
                                                //    (number, balance, days, its pending figure), on account / pending beneath; agingBucketToneClass,
                                                //    describeAgingBucket
pages/customer-detail.tsx                       // one query ["/api/customers", id, "aging"]; the chips after the Billing chip; the notes panel and the
                                                //    strip stacked in the profile grid's right column
pages/reports.tsx                               // AgingSection: five tiles (the four buckets + total open) and the customer / location table, rows
                                                //    linking to /customers/:id and ?locationId=, a totals row; the five existing cards untouched
lib/invalidate-invoice-views.ts                 // also ["/api/customers", id, "aging"] and /api/reports*, so both reads refresh with the ledger
```

Behavior worth knowing before the next pass touches it:
- **Age is from `issuedAt`, in whole UTC calendar days.** An invoice issued at 23:59 UTC is one
  day old at 00:01 UTC, the same arithmetic as the collections report's day key; the read's
  `asOf` names the day it counted to. Current is 0-30, so an invoice issued today and one issued
  30 days ago sit together; 31 opens the next bucket. `dueDate` is never read: the Invoices
  screen's Overdue tile and the Reports page's Overdue count keep their due-date meaning, and the
  copy on every aging surface says "days since invoiced" and "not days past due" so the two are
  not confused. Due-date aging for Net-terms accounts is B20's later Settings toggle.
- **What ages.** An issued invoice (`isInvoiceIssued` - never a DRAFT or a VOID) with
  `balanceDueCents > 0`, read from D5's stored rollups; a PAID invoice drops out, a
  PARTIALLY_PAID one ages its balance. Storage filters on the balance in SQL and the shared module
  checks the status again, so a stray `issuedAt` on a DRAFT or a stray balance on a VOID cannot
  leak in. An issued row with no `issuedAt` (none exists; every issuing path stamps it) is left out
  rather than aged from `createdAt`.
- **Nothing is netted.** Money on account is confirmed payments and issued credit memos with value
  left to apply, at the location (what `getLocationBalancesByCustomer` and the ledger panel's
  Balance card already show); pending money is listed twice over, as `pendingAppliedCents`
  summed over the aged invoices (applied, awaiting confirmation - part of the open balance until
  it counts) and `pendingUnappliedCents` (recorded, unconfirmed, unapplied). Each is a figure
  beside the balance; none is subtracted. The smoke test checks the strip's three figures against
  `/api/locations/:id/ledger-summary` and the switcher's read for every location.
- **A location-less invoice is not hidden.** The two legacy manual rows (INV-000001, INV-000072 -
  VOID today) would land under their customer as a `locationId: null` entry, "No location" on
  the report, so the customer-wide figure is complete even when no location can claim the money.
- **The report and the customer read cannot disagree.** Both go through
  `summarizeAgingByLocation`; the report's customer entry is the same locations rolled up, and the
  smoke test read every customer's own aging and matched it to the report row by row.
- **The gate.** Both reads are open to any authenticated role, like every read route in
  `server/routes.ts` and specifically like `/api/location-balances/:customerId`,
  `/api/locations/:id/ledger-summary` and `GET /api/invoices`, which already hand every role the
  same open and on-account figures this rearranges. A gate on the per-customer read would 403 the
  header card while the location switcher one inch below still says "Open $X"; a gate on the
  report would fence a total that `GET /api/invoices` already reveals. The RBAC matrix
  (PLAN_BILLING_V1.md 0.3) gates cost / margin / LTV and not receivables, and the Pass 2 note that
  "who may read financial history is a domain decision the decision record hasn't made" still
  stands: that decision is C5.6's role profiles, where a read gate can be configured per org
  rather than hardcoded per route.
- **Not built:** due-date aging (the Settings toggle), an `asOf` query parameter (today's UTC day
  only), aging by technician (V1 §1.4's "by tech"), a total-invoiced column, paging the report (it
  lists every customer with a balance or money on account), statements (C2.5). Nothing on the
  Invoices screen changed.
- **Verified 2026-09-24** (PORT=5001): `npm run check` clean; 38 checks driving `shared/aging.ts`
  directly (the boundaries -1 / 0 / 30 / 31 / 60 / 61 / 90 / 91 / 400, the UTC day arithmetic, the
  six exclusions, the summarizer's grouping and ordering, the rollup); boot 1 printed only "serving
  on port 5001" with all 43 tables' counts unchanged; 70 API checks as the four roles on a
  two-location fixture customer - seven manual invoices at the primary location back-dated by SQL
  to 0 / 30 / 31 / 60 / 61 / 90 / 91 days (Current $210, 31-60 $410, 61-90 $610, Over 90 $400, open
  $1,630, oldest Over 90, each row's days and bucket exact, oldest first), a $30 pending check
  applied to the 61-day invoice (pending applied $30, balance untouched), a confirmed $70 check and
  a $15 credit memo on account ($85, never netted), $20 pending cash at the second location
  (pending unapplied), one 45-day invoice there ($500, 31-60), a PAID invoice, a VOID and a DRAFT
  created through draft-for-appointment all excluded, the rollup the two locations summed ($2,130,
  8 invoices), every figure equal to the ledger summary and the switcher's read, the org-wide
  report's row equal to the rollup and its totals equal to its customers summed, all 11 customers'
  own reads equal to their report rows, the report's total open equal to the Invoices screen's Open
  figure, unauthenticated 401, all four roles 200, an unknown customer 404; fixtures deleted and 42
  of 43 counts back at baseline (`session` up by the four logins); boot 2 printed only the serving
  line with every count unchanged; a Vite 200 on the two pages, the strip component, the
  invalidation helper and (under `/@fs/`) the shared module. Nothing was rendered in a browser: the
  chips, the strip and the Reports section reach the owner first.

---

**Shipped in Pass 25** (`feature/phase-4-opportunity-taxonomy`, 2026-09-24) — the C4.1 row as built,
plus what it found.

```ts
// shared/opportunities.ts (new) - the taxonomy's vocabulary and the one source -> axes mapping; read by storage, the bootstrap and the client
OPPORTUNITY_WORK_TYPES = ["AGREEMENT", "ONE_TIME"]; OPPORTUNITY_WORK_TYPE_LABELS; describeOpportunityWorkType(workType)
OPPORTUNITY_CATEGORY_KEYS = ["NEW_SALE", "SERVICE_DUE", "RESCHEDULE", "WINBACK", "RETENTION"]; OPPORTUNITY_CATEGORY_SEED (key, label, sortOrder)
describeOpportunityCategory(key, categories)   // the org's label, else the seed label, else the key
OPPORTUNITY_SOURCES (the six) / OPPORTUNITY_SOURCE_LABELS / describeOpportunitySource(source)
taxonomyForSource(source, hasAgreement)        // -> { categoryKey, workType, mapped }: AGREEMENT_CONTACT_REQUIRED -> SERVICE_DUE / AGREEMENT;
                                               //    AGREEMENT_INITIAL -> NEW_SALE / AGREEMENT; AGREEMENT_CANCELLATION_RETENTION -> RETENTION / AGREEMENT;
                                               //    APPOINTMENT_RESCHEDULE_REQUIRED | APPOINTMENT_CANCELLATION_REVIEW -> RESCHEDULE / by agreement;
                                               //    NON_CONTRACT_FOLLOW_UP -> SERVICE_DUE / ONE_TIME; anything else -> SERVICE_DUE / by agreement, mapped false
OPPORTUNITY_STATUSES; OPPORTUNITY_ASSIGNEE_ME = "me"; OPPORTUNITY_ASSIGNEE_UNASSIGNED = "unassigned"

// shared/schema.ts
opportunities.categoryKey / .workType          // text NOT NULL; .assignedUserId now .references(users.id)
opportunityCategories                          // opportunity_categories: id, orgId, key, label, isActive, sortOrder, createdAt, updatedAt; unique (orgId, key)
insertOpportunityCategorySchema; OpportunityCategory; InsertOpportunityCategory

// shared/permissions.ts                       ASSIGN_OPPORTUNITY - support, manager, admin
// shared/audit.ts                             AuditEntityType += "opportunity" (action "update"; snapshots { assignedUserId, assignedTo, assignedAt, categoryKey, workType })

// server/service-scheduling-bootstrap.ts - bootstrapOpportunityTaxonomy(), guarded, quiet once done: opportunity_categories created with its
//   unique index and seeded per org (the rows inserted printed); category_key / work_type added, every unmapped row mapped by taxonomyForSource
//   (has_agreement = the row's or its source service's agreement) with the per-row effect and per-source totals printed, then SET NOT NULL;
//   indexes on category_key and assigned_user_id; the assigned_user_id -> users(id) FK added when the column has no FK under any name
// server/tenancy-bootstrap.ts                 + opportunity_categories

// server/storage.ts
OpportunityFilters += categoryKey, workType, assignedUserId (a user id | null = unassigned), source, zip (prefix), location (text)
OpportunityUpdateInput { notes?, dueDate?, nextActionDate?, categoryKey?, workType?, assignedUserId?: string | null }
OpportunityCategoryUpdateInput { label?, isActive?, sortOrder? }
getOpportunities(filters)                      // every filter in SQL; zip / location as subqueries on locations (and customers for the name), LIKE-escaped
getOpportunity(id)
updateOpportunity(id, data, actor?)            // one transaction: the category must be an active key of the org (checked on a change only), the
                                               //    assignee an active org user or null, assignedAt = now | null on a change; one audit `update` when the
                                               //    assignee, category or work type moved, nothing for a notes-only edit
getOpportunityCategories(includeInactive?) / updateOpportunityCategory(id, data)
getAuditLogsForLocation                        // + the location's opportunities
opportunityTaxonomyColumns(source, hasAgreement) // module helper spread into the four insert sites; escapeLikePattern(value)

// server/routes.ts
GET   /api/opportunities?status&dueFrom&dueTo&serviceTypeId&categoryKey&workType&assignee&source&zip&location
                                               // assignee: a user id | me (resolved to req.user) | unassigned; "ALL" / empty = not filtered; a bad workType 400
PATCH /api/opportunities/:id                   // opportunityUpdateSchema, strict; a CHANGED assignee needs ASSIGN_OPPORTUNITY (403); 404 unknown; storage's refusals 400
GET   /api/opportunity-categories?includeInactive=true
PATCH /api/opportunity-categories/:id          // { label?, isActive?, sortOrder? }, strict (a key is refused); ungated like dispositions
POST  /api/opportunity-categories -> 405; DELETE /api/opportunity-categories/:id -> 405   // the five keys are the list

// client
components/opportunity-taxonomy-chips.tsx      // OpportunityTaxonomyChips({ opportunity, categories, users, onCategoryChange?, onWorkTypeChange?, changeDisabled? })
                                               //    category (a picker over the active keys when a handler is given), work type (same), source, assignee;
                                               //    describeOpportunityAssignee(opportunity, users)
pages/opportunities.tsx                        // filters: status, category, work type, assignee (Anyone / Me / Unassigned / each active user), source,
                                               //    service type, next-action range, location / customer text, zip prefix; My Opportunities preset (assignee
                                               //    = me, status OPEN); per card the chips and an assign Select (Unassigned, Me, everyone active, the current
                                               //    assignee even if inactive) disabled without the permission; one PATCH mutation for all three changes
pages/customer-detail.tsx                      // OpportunitiesTab: the chips, display only
pages/settings.tsx                             // Opportunity Categories card (label / active / sort; no Add, no Delete) before Dispositions
```

Behavior worth knowing before the next pass touches it:
- **One mapping.** `taxonomyForSource` is the only place a source turns into a category and a
  work type. The four runtime writers (`ensureOpportunityForServiceRecordTx`,
  `ensureAgreementContactRequiredOpportunityTx`, the retention branch of `cancelAgreement`,
  `requestAppointmentCancelOrReschedule`) spread `opportunityTaxonomyColumns()` into their
  insert, and the backfill iterated the 16 rows through the same function in JS rather than a SQL
  CASE, so the migration and a new row cannot drift. The columns are NOT NULL, so a fifth writer
  fails to compile without them. `hasAgreement` decides the work type only for the two
  appointment sources; the agreement sources are AGREEMENT and the follow-up source ONE_TIME
  regardless.
- **AGREEMENT_INITIAL is not an opportunity source today.** The decision record counts it among
  the six, but every writer of that string sets `appointments.source` / `services.source`
  (`createAgreement`, `updateAgreement`, `linkAgreementInitialAppointment`), never
  `opportunities.source`; the dev DB has no such opportunity. The mapping carries it (NEW_SALE /
  AGREEMENT) so a future writer, or a hand-inserted row, lands right; the ground-truth citations in
  the Pass 25 handoff (`storage.ts:3455, :3516, :3713`) were those appointment writers.
- **The gate.** Assigning is `ASSIGN_OPPORTUNITY` (support, manager, admin). B7 names the
  assignees as sales reps, office reps and managers, so a technician - who sees the queue like
  every role, since every read in `routes.ts` is open - is refused even when assigning to
  themselves; "My opportunities" is how they find what the office handed them. The route checks
  the gate only when the assignee actually changes (the Pass 12 sold-by rule), so a form that sends
  the row back does not need the permission; storage then refuses an inactive or unknown user, or a
  user of another org, with a 400 naming the field. Content (notes, the two dates) and the two
  taxonomy axes stay ungated, as dispositions and Convert are; a technician re-categorising a row
  is a content edit, and the audit row names them. The category list's PATCH is ungated on the
  dispositions precedent - who may edit reference data is C5.6's role profiles - and the Settings
  card sits beside Dispositions and behaves the same.
- **What the PATCH accepts.** `{ notes, dueDate, nextActionDate, categoryKey, workType,
  assignedUserId }`, strict: `locationId`, `agreementId`, `source`, the source service and
  record, `status`, `convertedServiceId`, the contacted / dismissed stamps, `assignedAt` and
  `orgId` are all refused with a 400 rather than written. Before this pass the schema was
  `insertOpportunitySchema.partial()` and every one of them was writable by any authenticated
  client; `assignedUserId` in particular took any string.
- **Categories.** Five keys per org, unique on (org_id, key). Deactivating one keeps it on every
  row that carries it and in the filter (the screen reads `includeInactive=true` and labels it
  "(inactive)"); it only stops being choosable - the picker disables it, and a PATCH choosing it is
  refused, while a notes edit on a row that already carries it is not. A renamed label shows
  everywhere at once because nothing stores the label on the row; `describeOpportunityCategory`
  falls back to the seed label, then the key.
- **Audit.** One `update` per PATCH that moved the assignee, the category or the work type, on
  the `opportunity` entity, with `{ assignedUserId, assignedTo, assignedAt, categoryKey,
  workType }` before and after so the History tab's diff shows names. The location History read
  now collects the location's opportunities. Dispositions and Convert keep their activity trail
  and write no audit row - unchanged.
- **The search.** Zip is a prefix (`LIKE 'prefix%'`, wildcards escaped); the location text is
  ILIKE over the location's name, address and city and the customer's first + last name and
  company name; both are subqueries so the read still returns the plain `Opportunity` row every
  dialog already takes. The by-location read is untouched.
- **Not built:** auto-assignment rules and zones (C4.1b, Pass 26), a category on the location
  tab's cards beyond the chips, editing notes or dates from the screen (the PATCH accepts them; no
  UI sends them), a gate on category edits, bulk assignment, an assignee on the technician's own
  screens (they use the queue), paging the queue.
- **Verified 2026-09-24** (PORT=5001): `npm run check` clean; boot 1 printed the Pass 25 lines and
  nothing else - the 5 seed rows for Heritage, the 16 rows one per line then per source (4
  AGREEMENT_CANCELLATION_RETENTION -> RETENTION / AGREEMENT; 2 APPOINTMENT_CANCELLATION_REVIEW ->
  1 AGREEMENT, 1 ONE_TIME; 6 APPOINTMENT_RESCHEDULE_REQUIRED -> 2 AGREEMENT, 4 ONE_TIME; 4
  NON_CONTRACT_FOLLOW_UP -> SERVICE_DUE / ONE_TIME), the NOT NULL step and the FK - with 44 tables
  after (the new one holding 5); 193 API checks as the four roles: unauthenticated 401, every role
  200 on both reads with the five keys in seed order and org-scoped, all 16 migrated rows equal to
  `taxonomyForSource` of their source and agreement and still unassigned, the columns NOT NULL
  and exactly one FK; a fixture customer with two locations (zips 99901 / 99902), two opportunities
  through the real cancel-reschedule route (reschedule requested on a one-time service ->
  RESCHEDULE / ONE_TIME; cancel on an agreement service -> RESCHEDULE / AGREEMENT with the
  agreement carried) and four by SQL through the shared mapping; every filter returning exactly its
  rows - each category, each work type, a bad work type 400, category + work type combined, each of
  the six sources, zip 99901 / 99902 / 9990 / 99903 / an escaped `999_`, the location text by
  location name, city (case-insensitive), address and customer name, status, assignee unassigned /
  me / a named user, org-wide category and work-type counts equal to SQL, the by-location read
  carrying the axes; the technician refused 403 assigning to themselves while their notes-only
  PATCH passed with no audit row; support assigning themselves (assignedAt now, one audit row naming
  nobody -> Heritage Support), the unchanged re-send writing nothing, "me" finding it for support
  and not for the technician, the manager reassigning to the technician (a later assignedAt, a
  second row naming both), the admin unassigning (null / null, a third row), the location History
  read listing all three; an inactive user and an unknown user refused 400 with no row written;
  eight identity / lifecycle columns refused 400; unknown ids 404; a hand move to WINBACK audited
  and filterable, an unknown key 400, a work-type change audited, a bad work type 400; POST and
  DELETE on the list 405 with the five keys intact, a key on the PATCH 400, a relabel + reorder by
  the manager, deactivation dropping the key from the default read and not from
  `includeInactive`, choosing the inactive key refused 400 while the row carrying it kept it,
  stayed filterable and still took a notes edit, then the seed restored; fixtures deleted and every
  table back at baseline with `session` up by exactly the run's four logins; boot 2 printed only
  the serving line with every count unchanged; Vite 200 on the two pages, the location page, the
  chips component and, under `/@fs/`, the four shared modules. Nothing was rendered in a browser:
  the filters, chips, assign control and Settings card reach the owner first.

---

**Shipped in Pass 27** (`feature/phase-4-cancel-reschedule`, 2026-09-25) — the C4.2 row as built,
plus what it found.

```ts
// shared/appointment-disposition.ts (new) - the one path's vocabulary, read by storage, routes and both client pages
APPOINTMENT_DISPOSITION_MODES = ["CANCEL", "RESCHEDULE"]; DISPOSITION_OPPORTUNITY_CHOICES = ["UPDATE_EXISTING", "CREATE", "NONE"]; APPOINTMENT_DISPOSITION_ORIGINS = ["OFFICE", "FIELD"]
AppointmentDispositionRequest { mode, reasonCode?, notes?, opportunity, voidDraftInvoices? }   // the route body
AppointmentDispositionOutcome { mode, services: [{ serviceId, agreementId, effect: REQUEUED | CANCELLED | SKIPPED, windowReset }],
                                opportunities: [{ serviceId, opportunityId, action: CREATED | UPDATED, categoryKey }], draftInvoicesVoided }
CANCEL_DISPOSITION_REQUIRED / DISPOSITION_REASON_REQUIRED / DISPOSITION_REASON_NOT_ON_LIST / APPOINTMENT_NOT_DISPOSITIONABLE   // the error codes
opportunitySourceForDisposition(mode, effect)   // CANCELLED -> APPOINTMENT_CANCELLATION_WINBACK; RESCHEDULE -> APPOINTMENT_RESCHEDULE_REQUIRED; CANCEL -> APPOINTMENT_CANCELLATION_REVIEW
describeAppointmentStatus(appointment)          // CANCELED + rescheduleRequested -> "Rescheduled"; CANCELED -> "Canceled"; else Scheduled / In progress / Completed
ServiceScheduleState = DRAFT | PENDING | RESCHEDULING | SCHEDULED | COMPLETED | CANCELLED; SERVICE_SCHEDULE_STATE_LABELS
resolveServiceScheduleState(service, lastAppointment)   // PENDING_SCHEDULING whose last appointment is CANCELED with the flag -> RESCHEDULING, else PENDING

// shared/opportunities.ts                     OPPORTUNITY_SOURCES += "APPOINTMENT_CANCELLATION_WINBACK" ("Cancelled service win-back"); taxonomyForSource(it) -> WINBACK / by agreement
// shared/audit.ts                             AuditEntityType += "appointment"; AuditAction += "appointment_cancelled" | "appointment_rescheduled"
// shared/schema.ts                            services.lastAppointmentId (references appointments.id); omitted from insertServiceSchema - the disposition's to write

// server/service-scheduling-bootstrap.ts - bootstrapAppointmentDisposition(), guarded, quiet once done: services.last_appointment_id + index + appointments(id) FK;
//   a one-shot backfill giving a pending, unlinked service its latest CANCELED appointment when that appointment names it as representative
//   (per-row effect printed before the write; the dev DB had no such row)

// server/storage.ts
AppointmentDispositionInput { appointmentId, mode, origin, reasonCode?, notes?, opportunity, voidDraftInvoices?, actor? }
AppointmentDispositionResult = AppointmentDispositionOutcome & { appointment }
AppointmentDispositionError(status 400 | 409, code, message)
dispositionAppointment(input)                  // replaces requestAppointmentCancelOrReschedule. One transaction: the reason checked against getAppointmentCancelReasons()
                                               //   (CANCEL requires one; RESCHEDULE takes one only from the field); 409 on a CANCELED or COMPLETED appointment; the Q3 draft
                                               //   prompt before any write; the appointment -> CANCELED + cancelReason + the flag + the actor's label; per linked service:
                                               //   COMPLETED / CANCELLED or placed on another appointment -> SKIPPED; an office CANCEL of a non-agreement service -> CANCELLED
                                               //   (appointmentId kept, lastAppointmentId set); otherwise -> PENDING_SCHEDULING with appointmentId / technician cleared and
                                               //   lastAppointmentId set, and on CANCEL of an agreement service dueDate / serviceWindowStart / End reset from today by the
                                               //   agreement's serviceWindowDays (RESCHEDULE keeps every date); the opportunity choice per touched service; one audit row
updateAppointment(id, data)                    // the options argument is gone; data.status === "CANCELED" throws AppointmentDispositionError 409 CANCEL_DISPOSITION_REQUIRED
syncServicesForAppointmentTx                   // a no-op for a CANCELED or COMPLETED appointment; skips settled services and a representative placed elsewhere; writes SCHEDULED only
resolveDraftInvoicesOnCancelTx                 // returns the number of drafts voided
getAuditLogsForLocation                        // + the location's appointments
appointmentAuditSnapshot(appointment, services) // the before / after shape: status, technician, time, reason, notes, the stamps, the flag,
                                               //   services [{ id, status, appointmentId, lastAppointmentId, assignedTechnicianId, agreementId, dueDate, serviceWindowStart, serviceWindowEnd }]

// server/routes.ts
POST  /api/appointments/:id/disposition        // appointmentDispositionSchema (strict), origin OFFICE; 400 / 409 { code, message }; 409 DRAFT_INVOICE_DECISION_REQUIRED; 404;
                                               //   ungated like every appointment write (who may cancel is C5.6)
POST  /api/appointments/:id/cancel-reschedule  // the technician alias, body unchanged: mode by rescheduleRequested, origin FIELD, reasonCode = reason, opportunity UPDATE_EXISTING
PATCH /api/appointments/:id                    // updateAppointmentSchema = appointmentSchema.partial() (voidDraftInvoices gone); status CANCELED -> 409 CANCEL_DISPOSITION_REQUIRED

// client
pages/schedule.tsx                             // AppointmentSheet + linkedServices, cancelReasons, openOpportunityCount, onDisposition, isDispositioning; the status select without
                                               //   CANCELED (a cancelled placement shows its state read-only; Save omits status); "Cancel Service" -> Cancel appointment (reason select
                                               //   from the settings list, notes, opportunity radios defaulting to Update existing when one is open, else Create) + Reschedule (a
                                               //   confirm); dispositionMutation with its own DraftInvoiceVoidPrompt; moveAppointmentToSlot -> pendingMove -> "Move to <technician>,
                                               //   <day time>?" -> confirmPendingMove; the sheet badge and the hover card read describeAppointmentStatus
pages/customer-detail.tsx                      // ServicesTab: scheduleByServiceId { state, lastAppointment, liveAppointment }; the Status badge by state (amber Rescheduling with
                                               //   "Was <date>", red Cancelled with the reason, outline Pending scheduling); the date, Draft invoice and Schedule / Reschedule
                                               //   read the live visit only; ServiceDetailModal + statusLabel
```

Behavior worth knowing before the next pass touches it:
- **One path, two modes, one shape.** Both modes write `status CANCELED`, the actor's label, the
  notes and `rescheduleRequested` (true for RESCHEDULE, false for CANCEL); `cancelReason` is what
  was given - required for CANCEL, optional for RESCHEDULE - so a board reschedule carries none and
  a technician's request keeps the reason the dialog required. The UI distinguishes on the flag:
  `describeAppointmentStatus` says "Rescheduled" or "Canceled". No fifth status (Q4 / D1a).
- **RESCHEDULE keeps every date; CANCEL resets an agreement service's window.** A reschedule takes
  the placement off the board and nothing else - the visit is still due when it was due, so
  `dueDate` and the window stay. A cancel of an agreement service resets `dueDate` and the window
  from today by the agreement's `serviceWindowDays` (B2's refinement, so the visit is not silently
  missed). Before this pass the technician path reset the window on both; a reschedule request from
  the field now keeps the dates too. Say so if the owner wants the old behavior back.
- **The field is a handoff, never disposal** (canon §9): the alias carries origin FIELD, and with it
  every service returns to the queue whatever the mode - the technician's "Cancel Appointment"
  requeues a one-time service where the office's CANCEL cancels it. The alias sends
  UPDATE_EXISTING, which re-dates the open handoff opportunity or creates one when none is open, the
  same dedup the old code had.
- **The opportunity choice.** UPDATE_EXISTING re-dates every OPEN opportunity whose
  `sourceServiceId` is the service, whatever its source (due and next action to today, the action
  appended to its notes, category untouched) and creates one when none is open, so the choice never
  leaves the work invisible. CREATE always inserts. NONE writes nothing. Placing a service on an
  appointment already converts its open reschedule / cancel-review opportunities
  (`createAppointment`, the representative service only - unchanged), so on a re-placed service
  "Update existing" finds only opportunities of other sources (a contact-required or follow-up one);
  the sheet counts the open ones on the visit's services and defaults the radio accordingly.
- **WINBACK's source.** A one-time service the office cancels gets a seventh source,
  `APPOINTMENT_CANCELLATION_WINBACK` -> WINBACK / ONE_TIME, rather than an exception to
  `taxonomyForSource`: the same source (`APPOINTMENT_CANCELLATION_REVIEW`) on a field cancel
  requeues the service and stays RESCHEDULE, so "category by path" is a source per path and the
  Pass 25 invariant (one mapping for the migration and every writer) holds. The Opportunities
  screen's source filter lists it.
- **`services.lastAppointmentId`.** `appointmentId` is nulled on a requeue and
  `appointments.serviceId` names one representative, so a sibling on a multi-service visit had no
  way to say which appointment it came back from; the column is set on every service a disposition
  touches and never cleared. The Services tab reads it for Rescheduling vs Pending scheduling; the
  backfill covers only representatives (the dev DB had none to cover), so pre-pass siblings read
  Pending scheduling. A client cannot write it (omitted from `insertServiceSchema`).
- **Found on the way: the generic update's service sync.** `syncServicesForAppointmentTx` set
  every linked service SCHEDULED for any appointment status but CANCELED - a completed visit's
  finalized services included - and re-linked a representative that had since been placed
  elsewhere; editing a cancelled appointment's notes would have re-linked and CANCELLED its requeued
  services. It is now a no-op for CANCELED and COMPLETED appointments and skips settled or
  elsewhere-placed services. The API still accepts `status: SCHEDULED` on a CANCELED row (nothing
  in the UI sends it; the sheet no longer offers a way back).
- **What a disposition skips.** A COMPLETED or CANCELLED service and a representative placed on
  another appointment are left alone and reported SKIPPED. A service with a posted, unfinalized
  ticket is still requeued like before - the per-service composition is C4.3a (Pass 28).
- **Not built:** service-level cancel (C4.3a), an appointment cancellation policy (Phase 9), a
  permission on the disposition (C5.6), un-cancelling from the sheet, assignment rules and zones
  (Pass 26), the agreement cancellation workflow (untouched, its own cascade).
- **Verified 2026-09-25** (PORT=5001): `npm run check` clean; boot 1 printed one line (the
  column, its index and FK) and no backfill rows - none of the 4 pending services has an appointment
  naming it - with 44 tables after; 121 API checks as the four roles: unauthenticated 401; a
  fixture customer with an agreement service (window 7 days) and a one-time service placed through
  the real routes on one visit, the manager's RESCHEDULE requeueing both siblings with no reason,
  no opportunity, dates kept, `lastAppointmentId` set on both, the audit row with the manager's
  label and both services in its snapshots, a second disposition 409, a notes edit of the
  cancelled placement leaving the requeued services alone; CANCEL without a reason 400, "Bogus
  reason" 400, an unknown mode / choice / extra key 400, an unknown id 404, nothing written by any
  refusal; support's CANCEL of the agreement service resetting its window to today .. today + 7 and
  falling back to CREATE (RESCHEDULE / AGREEMENT, the agreement carried, equal to
  `taxonomyForSource`); the admin's UPDATE_EXISTING re-dating a seeded contact-required opportunity
  and creating nothing (B's own having been converted by the re-placement); NONE creating nothing;
  the manager's CREATE adding a row beside the open one; support's CANCEL of the one-time service
  cancelling it (still linked, WINBACK / ONE_TIME, "Win-back", the source filter and the
  by-location read carrying it); the technician alias: a reason off the list 400, a reschedule
  request requeueing the one-time service with the reason kept, the handoff opportunity created,
  the technician's audit row; the technician's cancel requeueing (not cancelling) the service and
  creating a fresh handoff opportunity once the re-placement had converted the first; the status
  PATCH to CANCELED 409 with the code, with and without the old `voidDraftInvoices` key, an
  ordinary PATCH still 200; a DRAFT invoice on the visit: RESCHEDULE without a decision 409 listing
  it and rolling back, with `voidDraftInvoices: true` voiding it (`draftInvoicesVoided` 1 in the
  response and the audit row), CANCEL keeping it (0, still DRAFT); the location History read
  listing the 10 appointment rows with all four actors and both actions; the services read carrying
  `lastAppointmentId` and a client PATCH unable to write it; the shared state function answering
  RESCHEDULING / PENDING / CANCELLED per scenario; every fixture deleted and all 44 tables back at
  baseline with `session` up by the run's four logins; boot 2 printed only the serving line with
  every count unchanged; Vite 200 on the two pages, the technician and Opportunities pages, the
  audit card and, under `/@fs/`, the four shared modules. Nothing was rendered in a browser: the
  two dialogs, the move confirmation, the read-only cancelled state and the Services-tab badges
  reach the owner first.
- **Owner's live test, 2026-09-25 (before merge):** five findings, recorded in Part E. Two are
  defects of this pass and are Pass 27b (C4.2b): a CANCELED placement must leave the board, and the
  two dialogs must close when the disposition completes. Two the owner passed once traced to the
  agreement path: an agreement service returning to the queue on CANCEL (B2's own refinement), and
  its opportunity reading CONVERTED after the recycled service was placed again (placement converts
  it). One is roadmap: cancelling a `PENDING_SCHEDULING` service without placing it first is
  added to C4.3a (Pass 28), the queue's details link stays C5.4 (Pass 36).

---

**Shipped in Pass 27b** (`feature/phase-4-cancel-reschedule-review`, 2026-09-25) — the C4.2b row
as built, plus what it found.

```ts
// shared/appointment-disposition.ts
export function isBoardPlacement(appointment: { status: string }): boolean
                                        // status !== "CANCELED". The flag is not consulted: a rescheduled placement is off the board exactly
                                        //   as a cancelled one. The board's rule only - getTechnicianWork excludes CANCELED in SQL for the
                                        //   field's day, and the appointments read stays unfiltered

// client/src/pages/schedule.tsx
boardAppointments                       // (appointments ?? []).filter(isBoardPlacement), applied once: viewportAppointments, the slot map
                                        //   (appointmentsByTechnicianAndSlot), the analytics (Jobs in View / Scheduled Revenue / per
                                        //   technician), visibleTechnicians and the card selection (selectedAppointment, editingAppointment)
                                        //   all derive from it
AppointmentSheet                        // the read-only "cancelled" state is gone (isCanceled, the status block's read-only branch, the
                                        //   hidden Cancel appointment / Reschedule buttons); onSave's status is always sent; the dialog
                                        //   state (disposition, reasonCode, dispositionNotes, opportunityChoice) resets in its own effect
                                        //   keyed on appointment?.id - null included - so both dialogs close when the page closes the sheet
statusTone / mutedTextTone              // the CANCELED (red) branch is gone - unreachable
?appointmentId= deep link               // naming a placement that has left the board -> a toast ("Appointment rescheduled" / "canceled" -
                                        //   "It is no longer on the dispatch board...") and the selection cleared
```

Behavior worth knowing before the next pass touches it:
- **The read is unfiltered on purpose.** `GET /api/appointments` has four consumers besides the
  board: the dashboard's upcoming count (which filters CANCELED itself), the Reports page, Service
  Ticket Review's appointment lookup behind a ticket (a ticket can sit on a since-cancelled visit),
  and the customer screen's by-location read for the Services tab ("Was <date>", the reason). So the
  predicate is applied in the board page, once, where the board's list is derived; the viewport, the
  slot map, the analytics and the card selection consume that list and cannot disagree, and the
  smoke test drives the same function over the live read.
- **The sheet never holds a CANCELED placement now.** `editingAppointment` resolves through the
  predicate, so the read-only cancelled state Pass 27 built became unreachable and was **removed**
  rather than kept dead (dev rule 6); the status select is always offered and Save always sends the
  status, which the server still refuses with 409 `CANCEL_DISPOSITION_REQUIRED` when it is CANCELED.
- **One mechanism for the dialogs, keyed on the id.** The reset lives in its own effect on
  `appointment?.id`, not on the row: the query client never refetches on focus (`staleTime:
  Infinity`), but an invalidation from another mutation gives the same placement a new object
  identity, and an identity-keyed reset would close a dialog the office is filling in. Closing from
  the mutation's success was not added: the state lives in the sheet, and the id going null when
  the page closes the sheet is the same event.
- **Finding 3, re-verified with fresh services - the rule as it stands:** `createAppointment`
  converts the OPEN `APPOINTMENT_RESCHEDULE_REQUIRED` / `APPOINTMENT_CANCELLATION_REVIEW`
  opportunities of the **representative service it places** (status CONVERTED, `convertedServiceId`,
  `lastDispositionKey` RESCHEDULED / "Rescheduled", one activity and one communication row);
  nothing else converts them, and the disposition's own UPDATE_EXISTING only re-dates. So a CANCEL's
  opportunity (RESCHEDULE / AGREEMENT) is OPEN and on the Opportunities screen's default list until
  the recycled agreement service is placed again, then filterable under CONVERTED; a one-time
  service's WINBACK row (`APPOINTMENT_CANCELLATION_WINBACK` -> WINBACK / ONE_TIME) is converted by
  nothing, since a CANCELLED service is never placed again. The Services tab reads the recycled
  service as **Pending scheduling**, not Rescheduling: its last placement was a CANCEL without the
  flag.
- **A deep link to a departed card** (`/schedule?appointmentId=` from the invoice modal's "Open on
  schedule" or a payment's visit link) used to select the red card and offer "Move / reassign"; it
  now toasts the placement's state and clears the selection, so a slot click cannot move a cancelled
  placement's date. The date parameter still lands the board on that day.
- **Not touched:** the appointments read, the dashboard's own CANCELED filter, the draft-for-visit
  dialog's filter, the disposition, the technician alias, the Services tab, cancelling a pending
  service outright (C4.3a), the queue's details link (C5.4). No schema change, no migration, no
  server code.
- **Verified 2026-09-25** (PORT=5001): `npm run check` clean; boot 1 printed only "serving on port
  5001" with all 44 tables' counts unchanged; 62 API / SQL checks as the four roles - the predicate
  over the five shapes (CANCELED with and without the flag false; SCHEDULED / IN_PROGRESS / COMPLETED
  true); a fixture customer with an agreement service (window 7 days) and a one-time service placed
  through the real routes; the manager's RESCHEDULE (off the board and off the technician's day,
  still in the read and the by-location read, dates kept, Rescheduling, no opportunity); support's
  CANCEL of the re-placed agreement service (window reset from today, the RESCHEDULE / AGREEMENT
  opportunity OPEN and on `status=OPEN`, absent from CONVERTED, the service Pending scheduling); the
  admin's CANCEL of the one-time visit (service CANCELLED and still linked, WINBACK / ONE_TIME OPEN);
  the re-placement converting the first row ("Rescheduled", one activity) and leaving the WINBACK row
  OPEN; SCHEDULED, IN_PROGRESS (technician time-in) and COMPLETED (generic update) all board cards,
  CANCELED through the generic update still 409, a second disposition 409; the read returning every
  row (115) to all four roles with the predicate keeping exactly SQL's non-CANCELED count (83), the
  four fixture placements all present in the read and the by-location read; three audit rows with the
  three actors; every fixture deleted and 43 of 44 tables back at baseline (`session` up by the four
  logins); boot 2 printed only the serving line with every count unchanged; a Vite 200 on the board
  page (the predicate in its transform) and, under `/@fs/`, the shared module. **Nothing was rendered
  in a browser** - the repo has no browser automation and this session had no browser - so the board
  without its red cards, the two dialogs closing on completion and the deep-link toast reach the owner
  first.

---

**Shipped in Pass 15** (`feature/phase-2-statements`, 2026-09-25) — the C2.5 row as built, plus
what it found.

```ts
// shared/statements.ts (new) - the statement's vocabulary and arithmetic, pure, read by the server, the dialog and a scratchpad script
STATEMENT_VARIANTS = ["LOCATION", "ACCOUNT", "ZERO_BALANCE_LETTER"]; STATEMENT_VARIANT_LABELS; LOCATION_HAS_BALANCE
isUtcDay(value) / defaultStatementPeriod(now) / STATEMENT_EPOCH   // inclusive UTC days, a real YYYY-MM-DD; month to date by default
summarizeLocationStatement(ledger, locationId | null, { from, to })
                                                // -> LocationStatement: opening (invoices issued before the period less the counted
                                                //    applications made before it), the period's lines in date order, closing = opening +
                                                //    charges - credits, on account / pending beside (never netted), aging as of `to`
                                                //    from the same rows cut off at the period's end, the open invoices behind it
summarizeAccountStatement(ledger, customerId, locations, period)
                                                // -> AccountStatement: a section per location (primary first, then as given) plus a
                                                //    no-location section when an issued invoice carries none; figures summed; rollupAging
buildZeroBalanceLetter(ledger, locationId, asOf, agreements) / zeroBalanceLetterRefusal(letter)
                                                // everything to date as of one day; refused - never reworded - while a balance remains
compareStatementLines / compareLetterAgreements / describeStatementPeriod(info) / statementFileName(info) / describeAgreementStatus(status)
interface StatementLine { kind: INVOICE | PAYMENT_APPLIED | CREDIT_APPLIED | PAYMENT_ON_ACCOUNT | CREDIT_ON_ACCOUNT | PAYMENT_REFUNDED;
                          date; at; description; reference; invoiceId; invoiceNumber; chargeCents; creditCents; pendingCents; balanceCents }
interface StatementFigures { openingBalanceCents; chargesCents; creditsCents; pendingAppliedCents; closingBalanceCents; onAccountCents;
                             pendingUnappliedCents; invoiceCount }
interface LocationStatement extends StatementFigures { locationId; periodFrom; periodTo; lines; aging: AgingFigures; openInvoices: AgedInvoice[] }
interface AccountStatement extends StatementFigures { customerId; periodFrom; periodTo; sections: AccountStatementSection[]; aging }
interface ZeroBalanceLetter { locationId; asOf; openBalanceCents; onAccountCents; pendingUnappliedCents; invoiceCount; lastInvoice; agreements }
interface StatementInfo { id; variant; customerId; locationId | null; periodFrom | null; periodTo; generatedAt; generatedByLabel; contentHash; mimeType }
interface StatementGenerateResult<T> { statement: StatementInfo; data: T }
interface StatementLedgerInput { invoices; payments; creditMemos; applications }   // the customer's rows; the summarizer scopes them

// server/documents/types.ts + statement-pdf.ts (new)
StatementDocumentContext                        // a union on variant: statementDate, customerName, billTo (the invoice's Bill To rule, Pass 11c),
                                                //    branding, and the location + statement / the account statement / the location + letter
renderStatementPdf(context)                     // pure, byte-deterministic (CreationDate / ModDate pinned to statementDate), a paginating table
                                                //    helper that redraws its headings on each page; no HTML twin - renderInvoiceHtml has no consumer

// shared/schema.ts + server/document-bootstrap.ts
documents.statementVariant / customerId / locationId / periodFrom / periodTo / generatedByUserId / generatedByLabel
                                                // nullable, null on an INVOICE row as invoiceId is null on a statement; ADD COLUMN IF NOT EXISTS
                                                //    x7 + partial indexes on customer_id / location_id, guarded on statement_variant so the
                                                //    effect prints once; no backfill (no STATEMENT row existed); no unique index

// server/storage.ts
StatementRefusedError(code, message, balanceDueCents)   // the letter's refusal -> 409 { code: LOCATION_HAS_BALANCE, message, balanceDueCents }
statementLedgerForCustomerTx(reader, customerId)        // the customer's invoices (+ the first line's description as `summary`), payments, credit
                                                        //    memos, and every application to its invoices (fenced to their location by the ledger)
statementBillToTx(reader, location)                     // resolveBillingProfileForLocation + resolveInvoicePartiesTx, resolved now
generateLocationStatement(locationId, period, actor) / generateAccountStatement(customerId, period, actor) / generateZeroBalanceLetter(locationId, actor)
                                                        // each renders + inserts one documents row (kind STATEMENT) and answers { statement, data };
                                                        //    undefined outside the org; the letter throws StatementRefusedError on a balance
listStatementsByLocation(locationId) / listStatementsByCustomer(customerId) / getStatement(id) / getStatementDocument(id)
                                                        // rows without their bytes, newest first; the document read is the row with them

// Routes - the generates gated GENERATE_INVOICE (support+); the reads open like every document / ledger read
POST /api/locations/:locationId/statements { periodFrom, periodTo }   // 201 { statement, data: LocationStatement }; 400 (bad day, from > to); 404
POST /api/customers/:customerId/statements { periodFrom, periodTo }   // 201 { statement, data: AccountStatement }; 404
POST /api/locations/:locationId/zero-balance-letter                   // 201 { statement, data: ZeroBalanceLetter }; 409 LOCATION_HAS_BALANCE; 404
GET  /api/locations/:locationId/statements                            // StatementInfo[] - the location's own
GET  /api/customers/:customerId/statements                            // StatementInfo[] - every statement for the customer, the account-wide ones included
GET  /api/statements/:id                                              // StatementInfo; 404 for anything that is not a STATEMENT document of the org
GET  /api/statements/:id/document[?download=1]                        // the stored bytes inline / as an attachment: statement-<to>.pdf,
                                                                      //    account-statement-<to>.pdf, paid-in-full-letter-<to>.pdf

// client
components/statement-dialog.tsx                 // StatementDialog({ open, onOpenChange, customerId, customerLabel, scope }) - scope is
                                                //    { kind: "location", locationId, locationLabel } (Location statement / Paid-in-full letter) or
                                                //    { kind: "account", locationCount }; period month to date by default; the generated figures,
                                                //    then Open PDF / Download; a 409 shows the refusal inline
components/statement-document-actions.tsx       // statementDocumentUrl(statement, download); StatementDocumentActions({ statement, compact })
components/location-ledger-panel.tsx            // "Statement" on the Balance card (GENERATE_INVOICE), `locationLabel` prop, the Statements card
                                                //    (["/api/customers", id, "statements"] filtered to this location + locationId null)
pages/customer-detail.tsx                       // "Statement" beside Add Location (GENERATE_INVOICE) -> the account statement
```

Behavior worth knowing before the next pass touches it:
- **The balance model is the ledger's (D4 / D5), not a customer-account one.** The balance on a
  statement is what is owed on issued invoices: it goes up when an invoice is issued and down when
  money is APPLIED to one (a payment application or a credit application) and the payment is
  confirmed - never when money is merely received. Money received and not applied is a
  `PAYMENT_ON_ACCOUNT` line that moves nothing, and rides in the on-account figure beside the
  balance, never netted (the Pass 14 rule). A pending payment's application is listed and marked
  and does not count. The document's footer says all of this in the office's own words.
- **The invariant the smoke test holds the pass to.** For a period ending today the closing
  balance equals `GET /api/locations/:id/ledger-summary`'s open balance and the aging strip equals
  `GET /api/customers/:id/aging`'s entry for the location (buckets, oldest, pending applied, on
  account, pending unapplied), because both derive from the same rows the same way: unreleased
  applications, confirmed counts, pending shows. The account statement's figures are the sections
  summed and its strip is the aging read's rollup.
- **Statuses are as of generation; dates place the rows.** An invoice is placed by `issuedAt`, an
  application by `appliedAt`, a payment by `receivedAt`, a credit memo by `issuedAt`, a refund
  by `refundedAt` - inclusive UTC days like every other date-only value. A past period's opening,
  closing and aging are the figures as they stood at that period's end given today's knowledge of
  each row (a check confirmed since is confirmed on it). A statement is never re-rendered: a
  second request over an unmoved ledger is a second row with identical bytes (the hash proves
  it), a request after the ledger moved is a new document, and the earlier one stays what it was.
- **What is left out.** A DRAFT (not a receivable), a VOID (owes nothing; its applications were
  released at void), a released application (excluded wherever it would have counted), a VOIDED
  payment (recorded in error). A REFUNDED payment shows as received (on account until the refund)
  and as a `PAYMENT_REFUNDED` line. An issued row with no `issuedAt` (none exists) is left out
  rather than dated from a guess, the aging module's rule.
- **The account statement is keyed on the customer**, as the aging rollup is: the canonical
  Account (`accounts`, one per customer today) has no screen and no read of its own, and
  `locations.accountId` selects the same rows as `locations.customerId`; the customer header is
  the surface. A location-less issued invoice (none today; the two legacy rows are VOID) lands in a
  trailing "Invoices with no location" section so the customer-wide figure is complete.
- **The letter is refused, not reworded.** A paid-in-full letter for a location that owes anything
  answers 409 `LOCATION_HAS_BALANCE` with the balance and the message; pending money applied to an
  open invoice does not clear it (pending shows, confirmed counts). Money on account and a
  pending unapplied payment do not block the letter and are stated in it. The agreements are
  listed active first with their status label (`describeAgreementStatus` knows ACTIVE / CANCELLED
  in the data and PAUSED / EXPIRED from canon §9), service type, start, next service and the day
  a cancelled one ended.
- **Identity lives on `documents`, not in a second table.** The STATEMENT kind had waited since
  Pass 10 with `invoice_id` as the only identity column; seven nullable columns beside it give a
  statement its own (variant, customer, location, period, who asked), the same org / hash /
  bytes / created-at columns serve both kinds, and the list reads are one query. No unique index:
  one row per generation. The Bill To is resolved at generation by the invoice's own rule (the
  billing profile's address, else a location override's own, else the primary location's).
- **The gate.** The three generates are `GENERATE_INVOICE` (support+): a statement is the office's
  customer-facing billing document, the same act as "Add fee / adjustment", and no closer
  permission exists (`SEND_INVOICE` is the sent stamp, which a statement does not carry until
  delivery arrives with C6.3). The reads are open like every document and ledger read.
- **Not built:** delivery (C6.3), a scheduled monthly statement (a later Settings toggle), a
  preview that stores nothing, a Mark Sent stamp on statements, per-invoice line detail on the
  statement (the first line's description and "+N more"), due-date aging (B20's toggle), an org
  timezone (C5.5). Invoice documents, the nightly run, the Payments screen and the Reports page
  are untouched.
- **Verified 2026-09-25** (PORT=5001): `npm run check` clean; 60 checks driving
  `shared/statements.ts` and `renderStatementPdf` directly (the period boundaries at 23:59:59.999
  and 00:00:00, DRAFT / VOID / released / voided / refunded exclusions, the pending marking, the
  running balance, a past and a later period, the account sections and rollup, the letter and its
  refusal, the day validator, byte-identical renders, a 120-line statement paginating, the PDF
  text decoded from pdfkit's hex glyph strings); boot 1 printed the migration's effect once (11
  INVOICE rows untouched) with all 44 tables' counts unchanged; 66 API checks as the four roles on
  a two-location fixture customer - invoices back-dated by SQL to 40 / 20 / 10 / 5 / 3 days (one
  voided), a confirmed check applied 30 days ago (its application back-dated), a confirmed check
  and a credit memo applied in the period, a pending cash payment applied, a confirmed check and a
  pending cash payment on account; the location statement's opening $40, charges $250, credits
  $100, pending $30, closing $190 equal to the ledger summary and its strip (Current $150, 31-60
  $40, on account $25) equal to the aging read; the account statement equal to the two locations
  summed and its strip equal to the rollup; a past period's opening $0 / closing $40 aged as it
  stood then; a second generation a second row with the same hash; the bytes served inline and as
  an attachment with the right names, hashing to the stored hash, the PDF text carrying the
  figures and both location names; the lists per location and per customer; the technician 403 on
  all three generates and 200 on every read, support 201, unauthenticated 401; from > to and an
  impossible day 400, unknown ids 404, an INVOICE document 404 as a statement; the letter 409 at
  the owing location naming $190.00 and 201 at the other once paid off, listing two SQL-inserted
  agreements active first with the cancelled one's end date and the pending cash noted, the PDF
  stating "Balance due: $0.00"; every fixture and all 8 stored statements deleted and 43 of 44
  counts back at baseline (`session` up by the four logins); boot 2 printed only the serving line
  with every count unchanged; a Vite 200 on the dialog, the actions component, the ledger panel,
  the customer page and (under `/@fs/`) the shared module. **Nothing was rendered in a browser** -
  the repo has no browser automation and this session had no browser - so the two Statement
  buttons, the dialog, the Statements card and the three PDFs' layout reach the owner first.

**Shipped in Pass 17** (`feature/phase-3-reopen-reason-popup`, 2026-09-25) — the C3.2 row as
built, plus what it found.

```ts
// shared/ticket-reopen.ts (new) - the reopen reason's vocabulary, pure, read by the server, the pop-up, Settings and the Services tab
TICKET_REOPEN_REASONS_SETTING_KEY = "ticket_reopen_reasons"; REOPEN_REASON_OTHER = "OTHER"; REOPEN_REASON_OTHER_LABEL = "Other"
DEFAULT_TICKET_REOPEN_REASONS                   // Wrong price, Wrong service date, Wrong technician, Materials missing or incorrect,
                                                //    Notes incomplete, Customer dispute, Posted on the wrong service, Finalized in error -
                                                //    the read when no row exists
REOPEN_REASON_NOT_ON_LIST / REOPEN_REASON_TEXT_REQUIRED (400); REOPEN_OTHER_FORBIDDEN (403)   // the route's codes
interface ReopenTicketRequest { reasonCode: string; reason?: string | null }                 // the route's body
isOtherReopenReason(code)                       // case-insensitive OTHER
sanitizeTicketReopenReasons(list)               // trim, drop nameless, de-duplicate (the first wins), drop any "Other" / "OTHER"
normalizeTicketReopenReasons(value)             // the stored row -> list: a JSON array (or newline / comma text); nothing usable -> the defaults
describeReopenReason(record) -> { label, text } // Other for OTHER, the entry as written, null on a legacy row; the text beside it
formatReopenReason(record) -> string | null     // "Wrong price", "Other - typed", the legacy text alone, or null

// shared/permissions.ts
REOPEN_TICKET_OTHER = "reopen_ticket_other"     // manager, admin (REOPEN_TICKET unchanged: support+)
rolesWithPermission(permission) -> UserRole[]   // least to most privileged - the refusal's "needs a manager or admin"

// shared/schema.ts + server/service-scheduling-bootstrap.ts
serviceRecords.reopenReasonCode                 // text, nullable; ADD COLUMN IF NOT EXISTS guarded on the column so the effect prints once;
                                                //    no backfill - the dev DB's 4 reopened rows keep their text with a null code

// server/storage.ts
TicketReopenError(status: 400 | 403, code, message)          // -> { code, message }
interface ReopenServiceRecordInput { id; reasonCode; reason?; actorRole; actor? }
reopenServiceRecord(input)                      // IStorage; before the transaction: OTHER -> REOPEN_TICKET_OTHER (403) then the text (400);
                                                //    else the list (400); then as before (confirmed false, REOPENED, the stamps, readyForBilling
                                                //    false, the service back to SCHEDULED, the appointment rolled back from COMPLETED) with
                                                //    reopenReason = the trimmed text or null and reopenReasonCode = OTHER or the entry as
                                                //    written; one ticket_reopened row, before / after
completeService(input)                          // the post's reset of the reopen stamps now clears reopenReasonCode too
getTicketReopenReasons() / setTicketReopenReasons(reasons)   // the cancel list's pair over the (org_id, key) row; no row -> the defaults; the
                                                //    save sanitizes and refuses an empty result ("At least one ... besides Other")

// Routes
POST  /api/service-records/:id/reopen { reasonCode, reason? }   // REOPEN_TICKET; strict (the old { reason } body is 400); 400 / 403 with the
                                                                //    codes above; 404; the role and the actor are the session's
GET   /api/settings/ticket-reopen-reasons -> { reasons }        // open (the pop-up reads it)
PATCH /api/settings/ticket-reopen-reasons { reasons: string[] } // MANAGE_SETTINGS (admin) - the invoice-on-finalize convention; the cancel
                                                                //    list's ungated PATCH is left as it is

// client
pages/service-ticket-review.tsx                 // ReopenTicketDialog (a Select of the list + Other last, disabled with "(manager or admin
                                                //    only)" without REOPEN_TICKET_OTHER; a required Textarea for Other; Cancel / Reopen); the
                                                //    inline textarea is gone; finalizeMutation takes { id, closeWhenDone: !nextStep } and closes
                                                //    the modal when done (after the D2 prompt's onClose, or at once); the Reopen Audit block
                                                //    prints label + text
pages/settings.tsx                              // "Ticket Reopen Reasons" card beside the cancel card; textarea and Save disabled without
                                                //    MANAGE_SETTINGS
pages/customer-detail.tsx                       // the Services tab's "Reopen Reason:" line is formatReopenReason(record)
```

Behavior worth knowing before the next pass touches it:
- **The code is the entry as written.** Like the disposition's cancel reason, `reopenReasonCode`
  stores the list entry's text ("Wrong price"), not a slug; `OTHER` is the one fixed code. Renaming
  an entry in Settings does not rewrite old tickets - they keep the text they were reopened with.
- **"Other" is offered, never stored.** `sanitizeTicketReopenReasons` drops it (any case) from every
  save and every read, so the list holds only the office's reasons; the pop-up appends Other last
  from the shared constant. A list of only "Other" is refused at save and reads as the defaults.
- **Permission before text.** A support user sending OTHER is 403 whether or not they typed a
  reason; the pop-up disables the option for them, so the order shows only at the API. A manager
  sending OTHER with no text is 400.
- **The text is optional beside a listed reason.** The route and storage accept `{ reasonCode:
  "Wrong price", reason: "..." }` and store both; the pop-up asks for text only under Other (the
  C3.2 spec), so the optional-detail path has no UI yet - a later pass can add a "Details" box
  without touching the server.
- **The finalize decision is taken at the click.** `closeWhenDone` is `!nextStep` when Finalize is
  pressed - the run snapshot and the live record set at that moment - and rides the mutation's
  variables; the D2 prompt's `onClose` (Generate, Generate & Send, Later, or a dismiss) then
  closes the modal through `closeReviewAfterPromptRef`. D4's "apply the balance?" prompt is the
  invoice prompt's own state and survives the modal closing. A deep-linked ticket (index -1)
  closes on Finalize like a run of one; `closeReviewModal` clears its `?recordId=` as a manual
  Close does.
- **Legacy rows show their text alone.** `describeReopenReason` gives `label: null` for the 4 rows
  reopened before this pass; the Reopen Audit block prints the text, the Services tab line prints
  it, and the audit renderer diffs `reopenReasonCode` like any column (null -> "Wrong price").
- **Verified 2026-09-25** (PORT=5001): `npm run check` clean; boot 1 printed the migration's one
  line (4 reopened rows, text kept, code null) with all 44 tables' counts unchanged; 52 API / SQL
  assertions on boot 1 as the four roles - the shared module and the matrix (eight defaults, no
  Other; sanitize / normalize / describe / format; `REOPEN_TICKET_OTHER` manager and admin only),
  the list (the defaults on an org with no row; technician, support and manager PATCH 403 with
  nothing stored; admin PATCH trimming, de-duplicating and dropping Other; Other-only, empty and
  blank 400; the cancel list untouched), a fixture ticket posted by the technician and finalized
  by support through the real routes, then technician 403, the old `{ reason }` body 400, a code
  not on the list 400, a default the saved list dropped 400, Other without text (manager) 400,
  Other with text as support 403 naming "manager or admin", Other without text as support 403,
  every refusal leaving the ticket finalized with no code, an unknown id 404; support with a
  listed code -> REOPENED with the code and no text, the service back to SCHEDULED, one
  `ticket_reopened` row with the code null -> "Finalized in error" and the actor; the technician's
  re-post clearing the code; manager with "other" + padded text -> `OTHER` and the trimmed text;
  admin with a listed code + detail storing both, three audit rows in all; the 4 pre-existing
  reopened rows byte-for-byte as before; the row removed -> the defaults again; every fixture
  deleted and 43 of 44 counts back at baseline (`session` up by the four logins); boot 2 printed
  only the serving line with every count unchanged; a Vite 200 on the three touched pages and
  (under `/@fs/`) the two shared modules. **Nothing was rendered in a browser** - the repo has no
  browser automation and this session had no browser - so the pop-up, its disabled Other option,
  the close-on-exhausted behaviour and the Settings card reach the owner first.

---

**Shipped in Pass 18** (`feature/phase-3-office-edit-ticket`, 2026-09-25) — the C3.1b row as
built, plus what it found.

```ts
// server/storage.ts
export class TicketEditError extends Error { status: 400 | 403; code: string }   // -> { code, message }; the TicketReopenError shape
export interface UpdateServiceRecordInput { ...the Pass 16 content fields...;
                                            serviceTypeId?: string | null;   // the Service's type; null keeps the current one (the post's rule)
                                            priceCents?: number | null;      // the Service's stamped price; null clears the stamp
                                            actorRole?: UserRole;            // the session's role (routes.ts)
                                            actor? }
updateServiceRecord(id, input)     // as Pass 16, plus: with serviceTypeId / priceCents on the body the Service is read; an agreement-
                                   // generated one (agreementId, or source AGREEMENT_GENERATED) without can(actorRole,
                                   // ADJUST_PRICE_AGREEMENT) -> TicketEditError 403 PRICE_ADJUSTMENT_FORBIDDEN naming "manager or admin",
                                   // whole, whatever the values, before anything is written (after the 409 TICKET_FINALIZED check);
                                   // a ticket with no service -> 400 SERVICE_NOT_FOUND. Then, in the one transaction: the Service
                                   // UPDATEd when its type or price moved and `price_overridden` (entity service, the row before /
                                   // after) when the PRICE moved - exactly completeService's block; the ticket's serviceTypeId set to
                                   // the Service's; the ticket UPDATEd + materials replaced + `ticket_edited` only when the ticket or
                                   // its materials changed. Nothing changed anywhere -> the existing row, no write, no audit row.

// Routes
PATCH /api/service-records/:id     // EDIT_TICKET; the strict body gains serviceTypeId (string | null) and priceCents (int | null);
                                   // actorRole = the session's; 403 / 400 { code, message } from TicketEditError (respondTicketEditError)
PATCH /api/services/:id            // untouched: ungated, unlogged, NOT the office price path

// client/src/components/service-completion-dialog.tsx
mode?: "post" | "office-edit"      // default "post" (technician-work.tsx and customer-detail.tsx pass none). office-edit: title "Edit
                                   // Service Ticket"; the badge "Office edit - <describeTicketLifecycle>"; no local draft (draftKey null);
                                   // the technician a Select and the service date a datetime-local (the PATCH's content); the locked
                                   // price / type caption names who may (rolesWithPermission(ADJUST_PRICE_AGREEMENT)); Cancel / Save
                                   // Changes; no CollectPaymentDialog, no time-out prompt; existingServiceRecord required
materialsPayload() / serviceOverridePayload() / invalidateTicketViews()   // shared by completeMutation (its payload unchanged) and
                                   // officeEditMutation: PATCH { technicianId, serviceDate, serviceTypeId?, priceCents?, notes,
                                   // targetPests, areasServiced, conditionsFound, recommendations, followUpRequired, followUpNotes,
                                   // productApplications } - the type and price only when allowServiceOverride, an agreement price
                                   // only when changed from the computed default (the post's rule); errors via getApiErrorMessage

// client/src/pages/service-ticket-review.tsx
Edit (button-edit-ticket)          // between Close and Reopen; rendered for can(role, EDIT_TICKET) only; disabled with "Edit (reopen
                                   // first)" + title when isTicketFinalized(selectedRecord) (shared/ticket-status.ts - all three
                                   // signals), "Edit (service unavailable)" when the record's Service is not loaded; opens
                                   // <ServiceCompletionDialog mode="office-edit"> on selectedRecord / selectedService /
                                   // selectedAppointment with the page's technicians and serviceTypes, onCompleted = invalidateReviewData;
                                   // editDialogOpen resets with the reopen pop-up on open / close / Next / Back
```

Behavior worth knowing before the next pass touches it:
- **One route, one transaction.** The price edit rides the ticket PATCH rather than a route of its
  own: the office's one save commits the Service and the ticket together or not at all, the gate
  (`EDIT_TICKET`), the 409 on a finalized ticket and the audit story stay in one place, and no
  second ungated price surface is opened. The generic `PATCH /api/services/:id` stays what it was.
- **Refused whole, whatever the values.** A support user's body naming `priceCents` or
  `serviceTypeId` for an agreement-generated service is 403 even if the values match what is
  stored - the field is not theirs to send. The dialog never sends them for that user
  (`allowServiceOverride`), so the order shows only at the API; a manager sending the stored price
  is an unchanged edit and writes nothing.
- **A price-only save logs `price_overridden` and no `ticket_edited`.** The ticket did not change.
  A type change reaches both rows: the Service's `serviceTypeId` in `price_overridden` when the
  price moved in the same save, and the ticket's own `serviceTypeId` in `ticket_edited` (it follows
  the Service's as a post copies it) - so a type-only change is still logged, on the ticket.
- **`priceCents: null` clears the stamp.** A manager can return an agreement service to its derived
  amount; the post already meant null this way. The dialog cannot send null (an empty price box
  parses to null and is sent as-is only when the user may override; an agreement price equal to the
  computed default is not sent at all).
- **The office edit seeds the technician from the ticket alone**, not from the service's or
  appointment's assignee as a post does, so Save with nothing touched sends what the ticket holds
  and writes nothing.
- **Verified 2026-09-25** (PORT=5001): `npm run check` clean; boot 1 printed only the serving line
  with all 44 table counts unchanged (no migration); 60 API / SQL assertions on boot 1 as the four
  roles - a fixture customer and location, a manual service posted by the technician through the
  real routes (no audit row on a first post at the stored price), technician PATCH 403, support's
  unchanged edit 200 writing nothing, support's price + notes edit -> `price_overridden` (support,
  15000 -> 17500) and `ticket_edited` with the notes, a type-only edit following onto the Service
  and the ticket with no `price_overridden`, materials replace-all in the third `ticket_edited`,
  `{ confirmed: true }` and a fractional price 400, an unknown id 404, finalize as support then
  support and manager edits 409 `TICKET_FINALIZED` writing nothing, reopen as support ("Wrong
  price") then a price edit 200 (17500 -> 20000, no `ticket_edited`); an agreement-generated
  service (SQL agreement + service, posted by the technician, no stamp): support's price 403
  `PRICE_ADJUSTMENT_FORBIDDEN` naming "manager or admin" and support's type-with-notes 403 whole,
  both writing nothing, support's content edit 200, manager's price 200 (null -> 12345, no
  `ticket_edited`), the same price again writing nothing, `null` clearing it (12345 -> null),
  admin's price + type + notes in one save (three `price_overridden` rows, the type in the third's
  Service diff, two `ticket_edited`), technician 403; the technician's re-post of the REOPENED
  agreement ticket still ignoring its price and logging `ticket_edited`; every fixture deleted and
  every table count back at the run's start (`session` up by the four logins); boot 2 printed only
  the serving line with every count unchanged; a Vite 200 on the two touched client modules with
  the new mode and buttons in the transforms. **Nothing was rendered in a browser** - the repo has
  no browser automation and this session had no browser - so the Edit button, its disabled state,
  the dialog's office-edit mode and its editable technician / date cards reach the owner first.

---

## Part E — Decision log

**Owner review of 2026-09-19** (answers to the questions the 2026-09-17 plan raised):

| # | Question | Answer |
|---|---|---|
| 1 | Quick action on the invoice row | None; the row opens the modal |
| 2 | Sold-by reference | One `users` table for everyone, techs and office. Recorded as a `users` FK plus a `technicians.userId` bridge in Pass 12 and the full merge in Pass 38 (C5.7), since the merge rewires every technician FK |
| 3 | B1 landing screen after Post | Unchanged |
| 4 | B5 statement | Yes — commercial, property managers, home sale (C2.5) |
| 5 | B12 target pests | Ticket level, including every material's pests; per-application pests for compliance (C3.4b) |
| 6 | B13 order instructions | Appointment-level instructions to the technician; dispatch and tech views both edit services, the tech view behind selectors |
| 7 | Technician adds a service without approval | Yes, flagged for review (C4.3b) |
| 8 | Who may revert | Manager+ as the interim; a configurable permission once role profiles exist (C5.6) |
| 9 | B8 structure label | None; a settings-managed Agreement types list seeded with Pest control / Termite / Mosquito / Wildlife / Evaluation (C5.3) |
| — | B2 | The action is RESCHEDULE; CANCEL runs the flow; agreement services recycle with a reset window; confirm board moves (C4.2) |
| — | B7 | ASSIGNED_TO with auto-assignment rules (C4.1, C4.1b) |
| — | B11 | Separate documents; a Settings toggle attaches the service report to visit invoices (C3.5) |
| — | B14 | EXCLUDE_TECH, per location with apply-to-all-locations (C4.4) |
| — | B16 | Role profiles configurable in Settings (C5.6) |
| — | B18 | Last four visible (C6.1) |
| — | B20 | Current = 0-30 days since invoiced (C2.4) |
| — | B23 | Invoice rows get links too (C2.1a) |

**Second review, 2026-09-19** — the three questions the first review left open:

| # | Question | Answer |
|---|---|---|
| 1 | C2.2 (Pass 12): the plan for the 11 plan-less agreements | The billing plan named **Monthly Recurring**, for all 11 |
| 2 | B6 / C2.3 (Pass 13): the manual-invoice path | Keep **"Add fee / adjustment"** on the location ledger panel, as recommended |
| 3 | C4.1 (Pass 25): extra opportunity categories | None; the five only |

**Owner review of 2026-09-21** (two items from a live test on James Peterson (Home) after Pass 11b;
the assessment is recorded under D4 in `PLAN_BILLING_V1_1.md`):

| # | Question | Answer |
|---|---|---|
| 1 | Item 2a: where does a `DOWN_PAYMENT` land? | **First-visit line, button kept.** An `INITIAL_CHARGE` line on the agreement's first visit invoice, priced into the technician's Due today; the automatic standalone invoice at creation stops; the agreement card's "Issue initial charge invoice" stays as the explicit up-front path (C2.1d) |
| 2 | Sequencing of the two passes | **11c and 11d before Pass 12** |
| 3 | What happens in the 11b session | **Record decisions only** — this docs branch; 11c is built in a fresh session |

**Answered 2026-09-22, at the start of Pass 11d** (the flag was: the three `Daily Rodent Trapping`
agreements carry a $99.95 `DOWN_PAYMENT` that was never issued, and under answer 1 their next visit
invoice would carry it):

| # | Question | Answer |
|---|---|---|
| 1 | The three `Daily Rodent Trapping` deposits, whose first visits were already invoiced at $0 | **Settled outside the ledger** (the default): Pass 11d's migration inserted an `INITIAL_CHARGE` billing event with no invoice for each, printing the per-row effect at boot; no visit invoice carries them and the agreement card says so |
| 2 | The fourth unissued deposit, `Wildlife Trapping Program` (25% of $499 = $124.75, COD plan, no visit yet) | **Rides its first visit**, as the new rule says; no migration touches it |

**Owner, 2026-09-23 (Pass 12 merged as PR #79):** every pass ends by writing the handoff prompt for
the next pass - the owner's start-of-session message in full - into the last section of
`CURRENT_FOCUS.md` (same PR as the code) and the session's final message. Recorded as an
end-of-pass step in `AGENT_WORKING_AGREEMENT.md`; the first such prompt, for Pass 16, is in
`CURRENT_FOCUS.md`.

**Owner, 2026-09-24 (at the start of Pass 13):** every pass ends by **opening its pull request**
after the push - `gh pr create` against `main` with the pass's summary as the body; the owner
merges. When `gh` is not authenticated on the machine, the session says so and puts the PR title,
body and compare link in its final message instead. Recorded in `AGENT_WORKING_AGREEMENT.md`,
`CLAUDE.md` and `DEV_NOTES.md`; everything else in the working agreement is unchanged.

**Owner's live-testing review of 2026-09-25** (Pass 27 on the dispatch board, before its merge;
the docs were updated on the same branch and no code was changed in that session):

| # | Finding | Answer |
|---|---|---|
| 1 | A cancelled or rescheduled appointment stays on the board as a red card | **Remove it from the board** - cancelled and rescheduled alike - so the slot is free for new work; the history stays visible on the service (the Services tab and the History tab). Pass 27b (C4.2b) |
| 2 | A cancelled appointment's agreement service came back to the queue as PENDING_SCHEDULING; only a reschedule should requeue | **Passes** once traced: that is B2's own refinement for agreement-generated services (recycled with the window reset so the visit is not silently missed); a one-time service is cancelled, not requeued. No change |
| 3 | The cancel's opportunity read CONVERTED, not OPEN, so it was not in the open list | **Passes**: the recycled agreement service was placed again, and placement converts the reschedule / cancel-review opportunity on it (the rule since before Pass 27). Pass 27b re-verifies with fresh services that the row is OPEN until then; it is filterable under CONVERTED |
| 4 | Both dialogs (Cancel appointment, Reschedule) stay open after the choice is made | **Defect** - they must close when the disposition completes. Pass 27b (C4.2b) |
| 5 | A PENDING_SCHEDULING service cannot be cancelled without placing it on the board first; the appointment details are needed from the queue | **Scheduled**: cancelling a pending service outright, from the queue and the Services tab, joins C4.3a (Pass 28); the queue's details link is C5.4 (Pass 36) |
