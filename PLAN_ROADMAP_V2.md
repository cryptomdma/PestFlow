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
from `origin/main`, `npm run check` + double boot + the pass's smoke test before the push, never
merge, never push to main. A pass that changes server code needs the owner's `npm run dev:full`
restarted before manual testing. Pass sizes below are calibrated to Phase 1's: Pass 6 (four tables,
routes, three dialogs) is the ceiling.

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
| Aging report (current/30/60/90/90+) | ABSENT | only `isOverdue()` in `invoices.tsx:56` and an Overdue count in `reports.tsx:207`; V1 §1.4 says derived, never stored |
| Customer-wide (all locations) balance in the header | ABSENT | header card `customer-detail.tsx:3538-3593` shows no money |
| Location balance below location notes | ABSENT | balance only in the Ledger panel (`location-ledger-panel.tsx:494`); the location switcher shows per-location Open / on-account (`customer-detail.tsx:3617-3638`) from `getLocationBalancesByCustomer` (`storage.ts:4421`) |
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
| "Monthly billing" in template invoice terms | **MISREAD** | terms are `DUE_ON_RECEIPT / NET_15 / NET_30 / NET_60` (`settings.tsx:423-432`); monthly cadence is a Billing Plan, not a term. See B5. |
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
| Batch Invoice on the Invoices screen | ABSENT | lives on Ticket Review (`service-ticket-review.tsx:407-417, 666-755`) |
| Batch by route / technician, grouped by date | ABSENT | date range only; the page's Technician filter is **not** passed to batch-preview (`:345-348`); `appointments` carry no route columns |
| Batch auto-charges cards on file | ABSENT (Phase 6) | — |
| Batch date range labelled as posting date | ABSENT | subtitle is bare "from through to" (`:672`); server filters `postedAt ?? serviceDate` (`storage.ts:4538`) |
| Appointment-based invoicing (one visit, one invoice) | DONE | D1 / Pass 3 |
| Generate Invoice from the Ticket Review modal, generate-and-send | PARTIAL | the on-finalize prompt (Pass 5: Generate / Generate & Send / Later) is the only Generate on that page (`service-ticket-review.tsx:216`); a ticket finalized with "Later" or under `OFF` has no Generate on the modal afterwards — only Batch or the Invoices screen |
| … "sends invoice / service report to customer" | PARTIAL | invoice = `sentAt` stamp + pinned PDF (Pass 10); no service report document exists |
| Paid status derived; check deferred until cleared; cash paid only by a manager | DONE, by a different mechanism | status derives from confirmed applications; `payments.status = PENDING` and `pendingAppliedCents` carry "pending" — there is **no invoice-level PENDING status** and none is needed (see B4) |
| "Invoices are not being created upon finalization" | DONE | Pass 5; under `PROMPT`, "Later" creates nothing by design |
| "New Invoice" links to an existing service, pre-finalization, and becomes the visit's invoice | PARTIAL, under a different name | the capability is the **Draft invoice**, reachable only from the Services tab (Pass 4: appointment-anchored, adopted at finalization, never duplicated). The dialog called "New Invoice" is the *manual* invoice: one `ADJUSTMENT` line, no service reference possible (`routes.ts:1853-1861`, `storage.ts:4895-4952`). See B6. |
| Review modal: price/payment details, address, Next/Back | DONE | Pass 7.6 (`service-ticket-review.tsx:517-583`) |
| Review modal: office Edit button (role-gated) | ABSENT | modal is read-only; footer is Open Location / Close / Reopen / Finalize (`:648-657`) |
| Review modal: reopen reason as a pop-up with a settings list, "Other" requires text | ABSENT | inline free-text `Textarea` (`:643-646`); `reopenReason` is text, no code column, no settings key |
| Reopen must be role-authorized | DONE | `REOPEN_TICKET` support+ (`routes.ts:1669`), reason required, audit-logged (Pass 8) |
| Fields immutable once posted / finalized (price, service date, collection data) | **NOT ENFORCED** | `PATCH /api/service-records/:id` (`routes.ts:1647-1657`) has no permission gate and no status guard; `updateServiceRecord` (`storage.ts:3866-3902`) blind-writes; `completeService` re-posts over a FINALIZED record and resets `confirmed / ticketStatus / finalizedAt / readyForBilling` (`:3971-3988`). Lockdown is a UI convention (`ServiceDetailModal` hides re-post; `technician-work.tsx:477-485` still passes the existing record into the ticket dialog). Payment records are immutable (Pass 6). |
| Technician ticket: add a second service / surcharge line / Generate Proposal | ABSENT | none in `service-completion-dialog.tsx`; `ADD_FIELD_SURCHARGE` permission exists (`permissions.ts:9`) with no UI; `lineType: "SURCHARGE"` exists in schema |

### A3. Dispatch, field tickets, appointment details, opportunities, cancellations

| Note | Status | Evidence |
|---|---|---|
| Dispatch "Slot Interval" → rename "View Interval" | PARTIAL | control exists in the Window popover (`schedule.tsx:838-886`), options **1 h / 2 h only** (`:40`); it sets grid *column* width; state is session-only (`:430`, popover says so) |
| Schedule (snap) interval 15 / 30 / 60 min, configured in Dispatch Board settings | ABSENT | placement snaps to the top of the slot hour (`buildSlotDate`, `:75`, `moveAppointmentToSlot`, `:679-707`); sheet start/end are free `datetime-local`; no dispatch section in `settings.tsx`; the only `app_settings` keys are `service_time_tracking_mode` and `appointment_cancel_reschedule_reasons` (`storage.ts:4324, 4341`) |
| Moving an appointment on the board asks for confirmation | ABSENT | click the card, click a slot, it moves (`moveAppointmentToSlot`) — the accidental-reschedule risk the owner named |
| Pending queue: name → location link, link to details | ABSENT | queue rows are select-for-placement buttons (`schedule.tsx:1067-1119`), name is plain text (`:1094`) |
| Unschedule / reschedule to the queue (return a scheduled stop to pending) | ABSENT on the board — **but the mechanism exists** | the technician's `POST /api/appointments/:id/cancel-reschedule` → `requestAppointmentCancelOrReschedule` (`storage.ts:3637-3732`) marks the appointment CANCELED with `rescheduleRequested`, requeues services to `PENDING_SCHEDULING` (`:3690`), and creates an opportunity if none is open (`:3703-3732`) |
| Board cancel: reason required from a settings list; opportunity prompt | ABSENT on the board; DONE on the technician path | board cancel is `PATCH /api/appointments/:id { status: CANCELED }` (`schedule.tsx:305-317`) → `updateAppointment` (`storage.ts:3606-3635`) which cascades every service to `CANCELLED` (`:1543-1555`), takes **no reason**, creates **no opportunity**. The settings-managed list `appointment_cancel_reschedule_reasons` (`settings.tsx:1885-1910`) is consumed only by `technician-work.tsx:426-433`. **Two divergent cancel paths.** |
| Smart Schedule / AUTO_ELIGIBLE pill | ABSENT | badge is the raw `schedulingMode` text (`schedule.tsx:1097`); no auto-schedule; no skills column on technicians/users, no required skills on service types, no lat/long on locations (`schema.ts:51-72, 148-172`) |
| Opportunity type / category / assignee | PARTIAL | `status` is an enum (`routes.ts:288`); `opportunityType` is free text (per-service-type label or hardcoded strings, `storage.ts:1627, 3420, 3720`); `source` is hardcoded (`AGREEMENT_CONTACT_REQUIRED`, `AGREEMENT_CANCELLATION_RETENTION`, `AGREEMENT_INITIAL`, `APPOINTMENT_RESCHEDULE_REQUIRED`, `APPOINTMENT_CANCELLATION_REVIEW`, `NON_CONTRACT_FOLLOW_UP`); dispositions are settings-managed (`opportunity_dispositions`, `settings.tsx:704-740`); no assignee column |
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
| Service-level cancel / return one service to pending | ABSENT | "Cancel Service" (`schedule.tsx:315`) cancels the whole appointment; `PATCH /api/services/:id` accepts `PENDING_SCHEDULING` (`routes.ts:175`) but no UI uses it that way |
| Materials modeled as products with allowed methods / equipment / areas | DONE | `materialProducts` (`schema.ts:556-579`) |
| Role profiles configurable in Settings | ABSENT | four fixed roles, matrix in `shared/permissions.ts:44-86`, one `can()` helper |
| Technicians and users are one table | ABSENT | `technicians` (`schema.ts:160-172`) has no `userId`; the two are unlinked |

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
an unscheduled service has no anchor.

**B7. "Opportunity Type/Category: Agreement, One-time, Reschedule, Cancel/Win-back, Retention."** The
list mixes two axes, which D8 already separated: `category` = reason (NEW_SALE, SERVICE_DUE,
RESCHEDULE, WINBACK, RETENTION; settings-managed) and `workType` = AGREEMENT | ONE_TIME. Today `type`
is free text and `source` is six hardcoded strings. **Owner:** agreed; the point is **searching open
opportunities by these criteria**, and an **ASSIGNED_TO** is wanted — assign (and auto-assign from
Settings by zones, zip codes, or other parameters) opportunities to sales reps, office reps, or
managers. C4.1 gains the assignee and the filters; C4.1b builds the assignment rules and zones.

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
| C2.2 (**Pass 12**) | **Billing Plan required on every Agreement + sale attribution.** Backfill the 11, `billingPlanId NOT NULL` + zod; `agreements.soldByUserId` — a `users` FK (owner: one identity table for techs and office), defaulting to the session user at creation, changed only under a new `ASSIGN_SALE_CREDIT` (manager+), audit `update`; template propagation untouched. `technicians` has no link to `users` today (`schema.ts:160-172`), so the same pass adds a nullable `technicians.userId` bridge; the full merge is C5.7. | Compensation basis (CURRENT_FOCUS) | — | Answered 2026-09-19: attach the billing plan named **Monthly Recurring** to all 11 — the 9 `Quarterly Control` rows (monthly billing for a quarterly program, the industry norm; the marked "Monthly" line in `notes` is deleted once attached) and the 2 Wildlife rows, whose term is already past its end, so Pass 3.5's attach rule starts no schedule and bills nothing. The 4 CANCELLED rows attach for the constraint only. The pass prints the per-row effect (`nextBillingDate` or the refusal) before committing. |
| C2.3 (**Pass 13**) | **Batch Invoice moves to the Invoices screen**; range labelled "posted between"; group by technician then service date (a "route" is technician × day — `appointments` carry no route columns); technician filter passed to preview; Send All stays; Ticket Review loses the button. **New Invoice is removed** (owner); the screen gains **"Draft invoice for a visit"** (customer → location → un-invoiced appointment → `createDraftInvoiceForAppointment`, `storage.ts:5618`); the manual path survives only as **"Add fee / adjustment"** on the location ledger panel (owner, B6); `createManualInvoice` keeps requiring a location. | Move Batch Invoice (×2), batch by route/tech, sort by date, New Invoice → Draft | C2.1a (result rows open the modal) | — |
| C2.4 (**Pass 14**) | **Aging and balances on the customer screen.** Derived reads: `GET /api/customers/:id/aging` (per location + rollup) and `GET /api/reports/aging` (org-wide); buckets **Current (0-30) / 31-60 / 61-90 / Over 90 days since invoiced** (`issuedAt`, B20) over issued open balances, pending-applied and on-account shown beside, never netted. Header card: the customer-wide open balance, on-account figure and oldest bucket sit beside the primary-location chip (`customer-detail.tsx:3538-3593`); location profile card: the location's strip below `LocationNotesPanel`; Reports: an Aging tab. Nothing stored; UTC days like every other date-only value. | Aging report, customer balance at top with primary location info, location balance below notes | C2.1a (bucket rows open the modal) | — |
| C2.5 (**Pass 15**) | **Statements.** Location statement (period roll-up: opening balance, invoices, payments, credits, closing balance, aging strip) and **account statement** (the same across every location of the account — the property-manager case) through the existing renderer, stored like invoices; a **paid-in-full / zero-balance letter** variant with agreement status for a home sale; Open / Download from the location Invoices tab and the customer header; on request only (a scheduled monthly statement is a later Settings toggle); delivery arrives with C6.3. | B5 (statements for commercial, property managers, home sale) | C2.4 | — |

### Phase 3 — Ticket integrity and the field workflow

Design rule for every tech-view unit (owner, B13): the field is a PWA today and a native app later,
so every field action is a route and every screen is data from a read — no page-only logic.

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C3.1 (**Pass 16**) | **Ticket lockdown (D9) enforced server-side.** `PATCH /api/service-records/:id` gated by a new `EDIT_TICKET` (support+) and refused on FINALIZED ("reopen first"); `completeService` refuses a re-post on a FINALIZED ticket, and a technician's re-post on a ticket already in office review (the office reopens; the technician re-posts a REOPENED one); every accepted edit writes `ticket_edited` (before/after, product applications included; payment records are already immutable and out of scope). The only UI change: `technician-work.tsx:477-485` stops passing a posted record into the ticket dialog. A defect fix, not a feature. | Immutable fields once posted | — | — |
| C3.2 (**Pass 17**) | **Reopen-reason pop-up** with a settings list (`ticket_reopen_reasons`, the `app_settings` shape of `appointment_cancel_reschedule_reasons`), `reopenReasonCode` + text; "Other" requires text and `REOPEN_TICKET_OTHER` (manager+); the inline textarea leaves the modal; the modal closes on Finalize when the queue is exhausted. | Remove reopen reason from modal; pop-up; dropdown config; Other role-gated; close on finalize | — (after C3.1 only to avoid a footer merge conflict) | — |
| C3.1b (**Pass 18**) | **Office Edit on the review modal** (D9): the role-gated Edit button opens `service-completion-dialog.tsx` in an `office-edit` mode (same fields, materials included) that submits through the gated PATCH instead of the post route; `ADJUST_PRICE_AGREEMENT` still guards an agreement price (support edits everything else); a FINALIZED ticket says "reopen first". | Office edit button | C3.1, C3.2 | — |
| C3.3 (**Pass 19**) | **Technician ticket modal, money and instructions**: draft-price override on the billing-summary read (`?serviceId=&priceCents=`, priced server-side through `resolveServiceLineBillingTx` + tax), dollars.cents on blur, service instructions (agreement `serviceInstructions`, service notes, location notes) at the top, the **billing-plan pill** in the ticket header (the profile display waits for C5.2), **time-in prompt** on opening a ticket with no Time In (bypass allowed). Landing after Post unchanged (B1). | Tech modal items 1-4; time-in prompt; display billing plan | — | — |
| C3.4a (**Pass 20**) | **Material units and application areas**: a settings-managed unit list (`material_units`) feeding a Unit dropdown, product `defaultUnit` migrated to pick from it; an org-level application-area list in Settings feeding products' allowed areas; application area multi-select per material line (`applicationAreas[]`, areas serviced still derived). | Unit dropdown; Application area multi-select | — | — |
| C3.4b (**Pass 21**) | **Target pests, two levels** (B12): `productApplications.targetPests[]` per material row from the target-pest list (compliance); the ticket-level target pests stay on the ticket, selectable from a searchable multi-select placed in the Materials section, and are **selected ∪ every material's pests**; the summary line at the top of the ticket shows that union. | Target pests; pest per application | C3.4a | — |
| C3.5 (**Pass 22**) | **Service report document** — customer-facing summary of a posted/finalized ticket (technician + license, date, services, pests, materials, notes, recommendations, signature placeholder) through the document renderer, stored like invoices; Open / Download on the review modal and the Services tab, Preview in the collect step. **Settings toggle "Attach service report to visit invoices"** (B11): when on, a visit-anchored invoice's PDF appends the report(s) for its lines; schedule-driven and manual invoices have no visit and append nothing. Both documents stay separately openable. | "Preview/print/save/send service summary"; "sends invoice / service report" | — | — |
| C3.6 (**Pass 23**) | **Field surcharge line** — as specified in `CURRENT_FOCUS.md`: SURCHARGE line on the ticket → invoice line; allow/reject toggle moves from plan to template; `CLEANOUT_SURCHARGE` / `PREPAY_FULL` leave the initial-charge vocabulary; test-data defaults migrated; `ADD_FIELD_SURCHARGE` gets its UI. **Transitional credit rule until Phase 7:** a recorded SURCHARGE line always credits the posting technician, marked transitional (dev rule 4), replacing today's permission inference in `createSurchargeEntryIfConfigured()`. | (owner-specified 2026-09-13) | — | — |
| C3.7 (**Pass 24**) | **Service designation + callback attribution** — `ServiceType.category` (CALLBACK / PRODUCTION / SERVICE) in Settings, instance designation on Service defaulted from the type, a required "answers Service …" link on a CALLBACK chosen at scheduling; production basis and invoice $0 read the designation instead of the slot counter. Canon §10. Its urgency in `CURRENT_FOCUS.md` came from plan-less agreements billing per visit; that drops once Pass 12 lands, so it sequences after it (COD-plan callbacks remain the case it fixes). | (roadmap note in canon) | C2.2 | — |

### Phase 4 — Scheduling and dispatch (D8's deferred scheduling pass, split)

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C4.1 (**Pass 25**) | **Opportunity taxonomy, assignee and search** — `category` (settings-managed, seeded NEW_SALE / SERVICE_DUE / RESCHEDULE / WINBACK / RETENTION) + `workType` (AGREEMENT / ONE_TIME); `assignedToUserId` (a `users` FK, manual assign / reassign, "My opportunities"); migration maps the six hardcoded sources and the free-text types; the Opportunities screen filters on category, work type, status, assignee, source, and location / zip. | Opportunity Type/Category; ASSIGNED_TO; search open opportunities | — | — (owner: the five only) |
| C4.1b (**Pass 26**) | **Opportunity assignment rules and zones** — Settings: `zones` (named zip-code lists, reusable later by dispatch and Smart Schedule) and `opportunity_assignment_rules` (category / work type / zone / source → user, ordered, first match wins); auto-assign at creation, unassigned when no rule matches; reassignment logged. | ASSIGNED_TO auto-assign by zones / zip / params | C4.1 | — |
| C4.2 (**Pass 27**) | **Cancel and Reschedule, one path** (B2). New `POST /api/appointments/:id/disposition { mode: CANCEL \| RESCHEDULE, reasonCode?, opportunity: UPDATE_EXISTING \| CREATE \| NONE, voidDraftInvoices? }` built on `requestAppointmentCancelOrReschedule` (the technician's cancel-reschedule route becomes a thin alias that always creates the office-handoff opportunity). **RESCHEDULE**: services back to `PENDING_SCHEDULING`, no reason required, no policy, no opportunity when the office does it from the board. **CANCEL**: reason required from the settings list; agreement-generated services return to `PENDING_SCHEDULING` with `serviceWindowStart/End` reset from the cancel date and an opportunity created or assigned as the fallback; non-agreement services are `CANCELLED` with the opportunity prompt (category defaulted by path). Both keep the draft-invoice prompt. `PATCH /api/appointments/:id { status: CANCELED }` is refused with 409 `CANCEL_DISPOSITION_REQUIRED`; the sheet's status Select drops CANCELED and its "Cancel Service" button becomes **Cancel appointment** + **Reschedule**. **Board moves confirm on drop** ("Move to <slot>?"). The location's Services tab shows Scheduled / Pending / Rescheduling / Cancelled distinctly — also Q4's PENDING_SCHEDULING-vs-SCHEDULED gap. | Unschedule → Reschedule; cancel reason required; opportunity prompt; agreement services recycled; accidental moves; Services-tab clarity | C4.1 | — |
| C4.3a (**Pass 28**) | **Appointment composition, server + dispatch sheet** (B13) — add a service to an appointment (new or from the pending queue), remove / cancel / return ONE service to pending (the last service prompts to reschedule the appointment), change a service's type (agreement work stays locked) and duration, appointment instructions (`appointments.notes`) editable; all through `getLinkedServicesForAppointmentTx`. UI on the dispatch sheet. | Appointment Details build-out; service-level cancel | C4.2 | — |
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

Pass 11a → 11b (Invoice modal) → Pass 12 (Billing Plan required + sold-by) → Pass 16 (ticket
lockdown) → Pass 13 (Batch Invoice + Draft) → Pass 14 (aging) → Pass 25 (opportunity taxonomy) →
Pass 27 (cancel / reschedule). The rest in phase order. Pass 16 is pulled forward because it is an
integrity hole, not a feature; Passes 25 and 27 because the board's cancel path is the other
divergence in daily use.

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

**Nothing is open.** A pass that finds a new question records it here and asks at its start.
