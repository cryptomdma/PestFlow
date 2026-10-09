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
| Names/addresses hyperlinked — dispatch board cards | DONE — a real link since Pass 36 (2026-10-07) | the card's name is a wouter `<Link>` to `/customers/:id?locationId=` (`schedule.tsx` `link-card-location-*`; middle-click and a new tab work). Was: a `<button>` calling `setLocation()` (:2134-2150 at the time; the earlier `:998-1012` citation had drifted) - a navigation, not a link |
| … — dispatch appointment sheet, hover card, Service Details dialog | DONE — Pass 36 (2026-10-07, C5.4) | the sheet's customer / service type / location (`link-sheet-customer` / `-service` / `-location`), the hover card's customer and location (`link-hover-customer-*` / `-location-*`), the support card's name (`link-support-customer-*`) and the dispatch Service Details dialog's customer / location / service type (`link-service-detail-*`) are `<Link>`s; a service name points at the location's Services tab (`&tab=services` - no per-service deep link, decided against). The URL shape is one module, `client/src/lib/customer-links.ts`. See "Shipped in Pass 36" at the end of Part D. Was: plain `<p>` at `schedule.tsx` :629-634 / :2172-2173 / :1162-1163 (the `:220-225, 370-371, 1036` citations had drifted) |
| … — Service Ticket Review list + modal | DONE — Pass 36 (2026-10-07, C5.4) | the list row is a `div[role=button]` with keyboard handling (`row-review-ticket-*`; it was one `<button>`, which cannot nest a link) carrying the customer and the address as `<Link>`s (`link-review-customer-*` / `-location-*`); the modal's customer, service type and address block link (`link-review-modal-*`) and "Open Location" is a link-styled button (`link-review-open-location`, disabled with a title when the ticket has no location). Was: plain text at `:634-635` / `:687-703`, a `setLocation()` button at `:811` (the `:486, 538, 546, 648` citations had drifted). The "batch rows" left this file in Pass 13 and are plain in `batch-invoice-dialog.tsx` (:252-253) - not a C5.4 surface, noted |
| … — Service History page / location Services tab | DONE — Pass 36 (2026-10-07, C5.4), the page | `services.tsx`: the card's customer is a `<Link>` (`link-service-customer-*`) through the shared labeler (the old span printed `firstName lastName` only - a commercial customer was blank), and the page gained a location line with a `<Link>` (`link-service-location-*`, from `/api/all-locations`; it showed no location at all); the search covers the company and the location. The location Services tab needs no customer column: the tab is location-scoped on the customer's own screen (canon UI rule 3). Was: `services.tsx:391` plain span (the `:386` and `customer-detail.tsx:3123` citations had drifted) |
| … — invoice rows | DONE — Pass 11a (2026-09-20) | `invoices.tsx` :277-293 (`link-invoice-customer-*` / `-location-*`) and `invoice-detail-dialog.tsx` :334-338 - this row read ABSENT until Pass 36 corrected it |
| Aging report (current/30/60/90/90+) | DONE — Pass 14 (2026-09-24) | `GET /api/reports/aging` behind the Reports page's Aging section, and `GET /api/customers/:id/aging` on the customer screen; buckets Current (0-30) / 31-60 / 61-90 / Over 90 **days since invoiced** (B20), derived in `shared/aging.ts` at read time, nothing stored. See "Shipped in Pass 14" at the end of Part D. Was: only `isOverdue()` in `invoices.tsx:56` (still the Overdue tile's due-date test, deliberately distinct) and an Overdue count in `reports.tsx:207` |
| Customer-wide (all locations) balance in the header | DONE — Pass 14 (2026-09-24) | `CustomerAgingChips` beside the primary-location chip (`customer-detail.tsx:4036`): Open $X across all locations, the oldest bucket, on account, pending confirmation - a rollup of the locations; the balance still lives at each location. Was: the header card showed no money |
| Location balance below location notes | DONE — Pass 14 (2026-09-24); placement revised in Pass 15b (2026-09-25, owner's note) | `LocationAgingSummaryRow` inside `LocationNotesPanel`, one row directly below the notes (Current always, other buckets only when owed, on account / pending, no invoice links); the full `LocationAgingStrip` with the invoices behind each bucket moved to the Invoices tab under the ledger panel. Was: the strip as a second card under the notes panel in the profile grid's right column. The Ledger panel's Balance card and the switcher's Open / on-account line (`getLocationBalancesByCustomer`) are unchanged and agree with it (verified) |
| Preferred technician (location + customer level) | DONE — Pass 30 (2026-10-03) | `technician_preferences` (`shared/technician-preferences.ts`): PREFERRED (a hint) or EXCLUDED (B14's EXCLUDE_TECH - a hard block on placement with a manager's override), per location or for all of the account's locations ("Apply to all locations" on the primary location's Edit Location); chips on the customer header card (all locations) and the location profile card (what applies here); the dispatch queue row's "Prefers <tech>" / "Never <tech>" and the sheet's select. See "Shipped in Pass 30" at the end of Part D. Was: no column, no UI anywhere |
| "Make Primary" inside the contact modal | DONE — Pass 36 (2026-10-07, C5.4) | the dialog's "Make primary contact" checkbox (`ContactDialogForm`, `checkbox-contact-primary`) is the one way to promote a contact; the inline button and its `setPrimaryContactMutation` are gone (`POST /api/contacts/:id/set-primary` stays for API callers - it promotes only). Closed with it: the location keeps **exactly one primary** - the box is disabled on the current primary (`text-contact-primary-locked`) and the server refuses the demotion, 400 `CONTACT_PRIMARY_REQUIRED` (`shared/contacts.ts`; `ContactError` in `storage.ts updateContact`; a History revert of a promotion row is refused the same way, the demotion row is the one to revert), and the dialog invalidates the account-wide contacts read so the location switcher's contact label follows a primary change. Canon §3 records the rule. Was: inline button (:4734 at the time; `:4338` had drifted), the checkbox already there (`:1585`; `:1146` had drifted), and unchecking the current primary left the location with none |
| Customer/account history log for all changes | DONE — Pass 32 (2026-10-04), the rows; Pass 33 (2026-10-05), the customer-level History and Revert | Every create / update / status change of a customer, location, contact, billing profile (instance and org template), agreement, agreement template, appointment and service writes `audit_logs` inside its transaction (`server/storage.ts` `auditCreatedTx` / `auditChangeTx` / `auditDeletedTx` :1956-1971, called from `createCustomer` :3391 through `generateScheduleDrivenInvoice` :10877); `shared/audit.ts` gained `contact`, `billing_profile`, `billing_profile_template`, `agreement_template` and the actions `created` / `status_changed` / `deleted` (:34-48, :147-183); an unchanged save writes nothing (`auditChangeAction` :299); the location History read (`getAuditLogsForLocation` :2002) lists the contacts' and billing profiles' rows too. No `account` entity by decision (the primary flip is logged on the locations). See "Shipped in Pass 32" at the end of Part D. Was: only `updateLocationProfile()` wrote `customer` / `location` `update` rows, on every save. **Pass 33 (C5.1b)** added the customer-level History (a sheet from the customer screen's toolbar over `GET /api/audit-logs?customerId=`: every location of the account plus the account-level rows, each row naming its location) and **Revert** (`POST /api/history/:auditLogId/revert`, `REVERT_HISTORY` - the built-in manager and admin profiles, any profile since Pass 37: the fields a row changed are put back through the entity's own write path, recorded as one `reverted` row naming the source) - see "Shipped in Pass 33" at the end of Part D. |
| Payment without an invoice (cash/check) | DONE | `record-payment-dialog.tsx:96` sends `applyToInvoiceId: null` when no invoice; opens from the ledger panel (location-level and per-invoice) and the Invoices screen |
| Pre-payments / deposits (half-down at scheduling) | DONE | an unapplied payment designated to the agreement (`payments.designatedAgreementId`, `schema.ts:738`, D4); offered first by the D4 prompt and the field's "COA available" |
| Payment application (+ release) UI | DONE | `ApplySourceDialog` (`location-ledger-panel.tsx:102-175`) applies one payment or credit memo to a chosen invoice; Release exists on applications; the D4 "Apply location balance" prompt fires after Generate and from open rows |
| Invoice generation checks location unapplied balance and prompts | DONE | Pass 6, `apply-location-balance-prompt.tsx`, wired into `invoice-on-finalize-prompt.tsx:20` |
| Card / ACH / auto-draft framework | PARTIAL — Pass 40 (2026-10-09, C6.1): the provider port, the Stripe adapter, the per-org provider account and the card on file | `server/integrations/payments/` (types, `providers/stripe.ts`, the factory), `payment_provider_accounts` (encrypted keys, Settings → Payments), `payment_provider_customers`, `payment_methods` captured by Stripe's own form (SetupIntent) and shown on the customer screen; charging, auto-draft and ACH capture are C6.2 / later - `POST /api/payments` still refuses CARD / ACH. See "Shipped in Pass 40" at the end of Part D. Was: enums named, route refuses them (Pass 6); the port's types and the outbox table existed, nothing else |
| Widen the New Service modal | DONE — Pass 36 (2026-10-07, C5.4; `OWNER_FEEDBACK.md` FB-010) | `<DialogContent className="max-w-2xl">` (`dialog-service-form`, `ServicesTab` in `customer-detail.tsx`) - the width of the customer screen's Service Details dialog; the one dialog serves New Service and Edit Service. Was: a bare `<DialogContent>` (:3780 at the time; `:3045` had drifted) taking `ui/dialog.tsx`'s default `max-w-lg` (this row said `sm:max-w-lg`; the default has no breakpoint prefix) |
| COA applied by support, role-gated | DONE | `APPLY_PAYMENT` is support+ (`permissions.ts:60,76`); technician cannot apply |
| COA "auto-adjusts the service price with notation" | **REJECTED by D6** | COA is a payment application; Price / COA / Due today is what ships (Pass 7). See B3. |
| Billing Plans tied to agreement templates, replacing billing frequency | DONE | Pass 3.5 selector, Pass 9 column drop |
| Billing profile changeable from the customer screen (edit / add location) | DONE | Pass 34 (2026-10-05, C5.2): a Billing selector in Add Location and Edit Location (`AddLocationDialog` / `EditLocationDialog` / `LocationBillingSelector` in `customer-detail.tsx`) - inherit the account default or override for this location - and the account default's own fields on the primary location's Edit Location. Resolution is still `resolveBillingProfileForLocation()` (`storage.ts`; since Pass 34 a wrapper over the reader-taking `resolveBillingProfileForLocationTx`): the location's active override, else the account's active default. `billing_profiles.location_id` is the only pointer read; `locations.billing_profile_id` is a mirror the profile write path keeps, read by nothing |
| Default billing profile option in Settings | DONE | Pass 34 (C5.2): Settings -> Billing Defaults, one `app_settings` row `default_billing_profile_template_id` (`shared/billing-profile-defaults.ts`), read at customer creation; the write is audited (`app_setting`) since Pass 39. `customers.defaultBillingProfileId` (a dead column) was dropped in Pass 39 (C5.8) |
| "Monthly billing" in template invoice terms | **MISREAD**; the statement B5 asked for instead is DONE — Pass 15 (2026-09-25) | terms are `DUE_ON_RECEIPT / NET_15 / NET_30 / NET_60` (`settings.tsx:423-432`); monthly cadence is a Billing Plan, not a term. See B5. The statement: `shared/statements.ts` (the arithmetic), `server/documents/statement-pdf.ts` (the document), `StatementDialog` on the location Invoices tab and the customer header. See "Shipped in Pass 15" at the end of Part D. |
| Agreement Type as a dropdown | DONE | Pass 35 (2026-10-06, C5.3): a `Select` over the org's `agreement_types` list on the template form (`settings.tsx` `AgreementTemplateForm`, `select-template-agreement-type`) and on the agreement form (`customer-detail.tsx` `AgreementForm`, `select-agreement-type`, the template's default preselected), plus "None"; `agreements.agreementType` holds the type's KEY (nullable); the list is Settings → Agreement Types (Add / Edit / Merge, admin). Was: a free-text `Input` (`settings.tsx:1281` at the time, not :1130 - that was the form's declaration); the dev DB held "Annual" (16 agreements, one template) and NULL, not the seed's "Residential Recurring" (`server/seed.ts`, which now names the seed keys PEST_CONTROL / TERMITE / MOSQUITO) |

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
| … card on file / process card | PARTIAL — Pass 40 (C6.1): the card on file is captured and shown on the customer screen; "Charge card on file" / "Process card" are C6.2 | route still refuses CARD / ACH |
| "Send to customer" — email | ABSENT | no transport anywhere; `nodemailer` appears only in the esbuild bundle allowlist (`script/build.ts`, beside `stripe` - a real dependency since Pass 40), not as a transport |
| … — print | ABSENT as an affordance, trivially available | the PDF opens in a new tab; no `window.print`, no print stylesheet |
| Batch Invoice on the Invoices screen | DONE — Pass 13 (2026-09-24) | `BatchInvoiceDialog` (`client/src/components/batch-invoice-dialog.tsx`) behind the Invoices screen's header button; result rows open the invoice modal; Send All kept; Service Ticket Review lost the button and dialog. See "Shipped in Pass 13" at the end of Part D. Was: lived on Ticket Review (`service-ticket-review.tsx:407-417, 666-755`) |
| Batch by route / technician, grouped by date | DONE — Pass 13 (2026-09-24) | `technicianId` on `GET /api/invoices/batch-preview` and `POST /api/invoices/batch-generate` (`BatchInvoiceFilters`, `shared/batch-invoice.ts`); the preview groups technician → service date → visit (`groupBatchInvoicePreview`), a "route" being a technician on a day since `appointments` carry no route columns. Was: date range only; the page's Technician filter was not passed (`:345-348`) |
| Batch auto-charges cards on file | ABSENT (Phase 6) | — |
| Batch date range labelled as posting date | DONE — Pass 13 (2026-09-24) | the dialog's inputs are "Posted from" / "Posted to" and its copy says "posted between"; the server still filters `postedAt ?? serviceDate` (`getServiceRecordsReadyForBillingInRange`). Was: a bare "from through to" subtitle (`:672`) |
| Appointment-based invoicing (one visit, one invoice) | DONE | D1 / Pass 3 |
| Generate Invoice from the Ticket Review modal, generate-and-send | PARTIAL | the on-finalize prompt (Pass 5: Generate / Generate & Send / Later) is the only Generate on that page (`service-ticket-review.tsx:216`); a ticket finalized with "Later" or under `OFF` has no Generate on the modal afterwards — only Batch or the Invoices screen |
| … "sends invoice / service report to customer" | PARTIAL — the documents exist, delivery does not | invoice = `sentAt` stamp + pinned PDF (Pass 10); the service report document since Pass 22 (C3.5, 2026-09-27): Open / Download per ticket, a Settings toggle attaching it to visit invoices; email delivery of either is C6.3 |
| Paid status derived; check deferred until cleared; cash paid only by a manager | DONE, by a different mechanism | status derives from confirmed applications; `payments.status = PENDING` and `pendingAppliedCents` carry "pending" — there is **no invoice-level PENDING status** and none is needed (see B4) |
| "Invoices are not being created upon finalization" | DONE | Pass 5; under `PROMPT`, "Later" creates nothing by design |
| "New Invoice" links to an existing service, pre-finalization, and becomes the visit's invoice | DONE — Pass 13 (2026-09-24) | New Invoice is gone from the Invoices screen; **"Draft invoice for a visit"** (`draft-invoice-for-visit-dialog.tsx`: customer → location → draftable visit → Pass 4's `draft-for-appointment` route, the DRAFT opening in the modal) takes its place, and the manual invoice survives only as **"Add fee / adjustment"** on the location ledger panel (`add-fee-adjustment-dialog.tsx`, the location fixed, B6). Was: the capability existed only on the Services tab as Draft invoice, and "New Invoice" was the *manual* invoice (one `ADJUSTMENT` line, no service reference; `routes.ts:1853-1861`, `storage.ts:4895-4952`). |
| Review modal: price/payment details, address, Next/Back | DONE | Pass 7.6 (`service-ticket-review.tsx:517-583`) |
| Review modal: office Edit button (role-gated) | DONE — Pass 18 (2026-09-25) | was: modal read-only, footer Open Location / Close / Reopen / Finalize (`:648-657`). Now Edit (`EDIT_TICKET`; disabled "reopen first" on a finalized ticket) opens `service-completion-dialog.tsx` in `mode="office-edit"`, saved through the gated PATCH with the Service's price / type under the post's rule (see "Shipped in Pass 18" at the end of Part D) |
| Review modal: reopen reason as a pop-up with a settings list, "Other" requires text | DONE — Pass 17 (2026-09-25) | was: inline free-text `Textarea` (`:643-646`), `reopenReason` text only, no code column, no settings key. Now `ReopenTicketDialog` over `ticket_reopen_reasons`, `reopenReasonCode` + text, Other gated by `REOPEN_TICKET_OTHER` (see "Shipped in Pass 17" at the end of Part D) |
| Reopen must be role-authorized | DONE | `REOPEN_TICKET` support+ (`routes.ts:1669`), reason required, audit-logged (Pass 8) |
| Fields immutable once posted / finalized (price, service date, collection data) | DONE — Pass 16 (2026-09-23) | was **NOT ENFORCED**: `PATCH /api/service-records/:id` had no permission gate and no status guard, `updateServiceRecord` blind-wrote (and completed the Service on `confirmed`), and `completeService` re-posted over a FINALIZED record and reset its stamps. Now the PATCH is `EDIT_TICKET` (support+), content-only and strict, 409 on FINALIZED; a re-post is refused on FINALIZED (anyone) and on a ticket in review without `EDIT_TICKET`; every accepted edit or re-post writes `ticket_edited`; the rules are `shared/ticket-status.ts`, read by the technician view too. See "Shipped in Pass 16" at the end of Part D. Payment records were already immutable (Pass 6). |
| Technician ticket: add a second service / surcharge line / Generate Proposal | DONE but Generate Proposal — the surcharge line Pass 23 (2026-09-27), a second service from the field Pass 29 (2026-10-02) | was: none in `service-completion-dialog.tsx`, `ADD_FIELD_SURCHARGE` (`permissions.ts:22`) read by nothing. Now the Surcharge ($) / Surcharge Label inputs on the ticket (post and office edit), gated by `ADD_FIELD_SURCHARGE` and the agreement template's toggle, a `SURCHARGE` invoice line per ticket and a transitional SURCHARGE production credit (C3.6). A second service from the field: **Add service** on the technician's Appointment Details (`technician-work.tsx` `block-tech-add-service`) posts `POST /api/appointments/:id/services { origin: "FIELD", service }` - one-time work at the visit's location, stamped `addedInFieldByUserId` and flagged for office review, the visit's end extended, refused 409 `NEXT_STOP_OVERLAP` past the technician's next stop (C4.3b; see "Shipped in Pass 29" at the end of Part D). Generate Proposal is Phase 9 |
| Invoice document: Bill To from the primary location / billing profile; a Service Location block (owner, 2026-09-21) | DONE — Pass 11c (2026-09-21) | was a defect: `getInvoiceDocumentContext` fell back to the **service** location's live address when no profile address was snapshotted, which was every invoice on the dev DB. Now the parties are frozen at issue in `billingProfileSnapshot.billTo` / `.serviceLocation` by `resolveInvoicePartiesTx` on every issuing path, the renderer prints Remit To / Bill To / Service Location, and the 64 pre-11c rows (45 with no snapshot, 19 profile-only) resolve at render by the same rule, marked transitional. Documents already stored keep their bytes (§1.7). See "Shipped in Pass 11c" at the end of Part D. C2.1c |
| Down payment collected in the field rides the first visit's invoice; the technician sees it as due today (owner, 2026-09-21) | DONE — Pass 11d (2026-09-22) | now: `createAgreement` issues nothing; the down payment rides the first visit's invoice as an `INITIAL_CHARGE` line (`buildVisitInvoiceLinesTx`), `getVisitBillingSummary` prices it into the visit's figures as `charges`, the collector field has its readers (the office prompt at signing and scheduling, the technician's callout), the explicit up-front button stays, and the three unissued `Daily Rodent Trapping` deposits are settled outside the ledger. See "Shipped in Pass 11d" at the end of Part D. Was: `createAgreement` issues a standalone `INITIAL_CHARGE` invoice (`storage.ts:3252`, `7625-7714`); `getVisitBillingSummary` (`:4724`) never finds it, so the ticket says $0 due; `initialChargeCollectedBy` has no reader in the field. Owner correction recorded under D4 in `PLAN_BILLING_V1_1.md`. C2.1d |

### A3. Dispatch, field tickets, appointment details, opportunities, cancellations

| Note | Status | Evidence |
|---|---|---|
| Dispatch "Slot Interval" → rename "View Interval" | DONE — Pass 31 (2026-10-03) | the Window popover's select is **View Interval** (`schedule.tsx` `select-board-view-interval`, ~:2029) with 30 minutes / 1 hour / 2 hours from `DISPATCH_VIEW_INTERVALS` (`shared/dispatch-board.ts`); the Board Window card reads "8 AM - 6 PM \| 2-hour view" (`configSummary`, ~:1916); the default is Settings → Dispatch Board's `dispatch_view_interval_minutes` and the popover's choice is a session override (`windowOverride`, ~:1229 - React state, reset on reload; there never was a persisted one) with a "Back to the defaults" button. The slots are minutes of day end to end, so the 30-minute view works (see "Shipped in Pass 31" at the end of Part D). Was: "Slot Interval", 1 h / 2 h only, `useState(2)` |
| Schedule (snap) interval 15 / 30 / 60 min, configured in Dispatch Board settings | DONE — Pass 31 (2026-10-03) | `dispatch_snap_minutes` (15 / 30 / 60, default 60) on the Settings → Dispatch Board card (`settings.tsx` `card-dispatch-board`, ~:2770), read by the board: the sheet's Scheduled Start / End step by it and round to it on save (`snapDateToInterval`, nearest, a half up; `schedule.tsx` ~:941), and every placement / move start passes through it (`handleSlotClick`, ~:1815) - a no-op on a slot start, since the rules keep the snap no coarser than the view interval. **There is no drag-and-drop**: placement is a slot click, a move click-then-confirm. The server stores the snap and never rounds. Was: placement on the top of the slot hour, free `datetime-local` inputs, no dispatch section; "the only `app_settings` keys are …" was stale even then (seven keys in the code, five rows; eleven keys now - the four `dispatch_` keys have no row until an admin changes one) |
| Moving an appointment on the board asks for confirmation | DONE — Pass 27 (2026-09-25) | click the card, click a slot, and "Move to <technician>, <day time>?" holds the move until confirmed (`pendingMove` / `confirmPendingMove` in `schedule.tsx`). Was: it moved on the click (`moveAppointmentToSlot`) — the accidental-reschedule risk the owner named |
| Pending queue: name → location link, link to details | DONE — the cancel Pass 28 (2026-09-29); the links and Details Pass 36 (2026-10-07, C5.4) | the row (`queue-row-*`, a `div[role=button]` since Pass 28) carries the customer (`link-queue-customer-*`, to the customer) and the location (`link-queue-location-*`) as `<Link>`s that stop the row's select click, and a **Details** button (`button-queue-details-*`) opening the dispatch board's Service Details dialog for the pending service (it resolves from `GET /api/services`, so no new read; its description no longer says "tied to the selected dispatch card"). Owner review of 2026-09-25 (Pass 27): **Cancel** on the row (`ServiceCancelDialog`, `POST /api/services/:id/cancel`; an agreement service is recycled, not cancelled). The scheduling-mode badge beside the name reads "Scheduling: auto-eligible" (the row below); the raw `status` badge stays until C4.7 (FB-013) humanizes it |
| Unschedule / reschedule to the queue (return a scheduled stop to pending) | DONE — Pass 27 (2026-09-25) | **Reschedule** on the dispatch sheet → `POST /api/appointments/:id/disposition { mode: RESCHEDULE }` → `dispositionAppointment`: CANCELED + `rescheduleRequested`, no reason, no opportunity, every service back to `PENDING_SCHEDULING` with its dates kept and `lastAppointmentId` set; the technician's route is the same path with origin FIELD. See "Shipped in Pass 27" at the end of Part D. Was: only the technician's `requestAppointmentCancelOrReschedule` |
| Board cancel: reason required from a settings list; opportunity prompt | DONE — Pass 27 (2026-09-25) | **Cancel appointment** on the dispatch sheet → `{ mode: CANCEL, reasonCode, opportunity: UPDATE_EXISTING \| CREATE \| NONE }`: the reason must be on `appointment_cancel_reschedule_reasons`, agreement services recycle with the window reset from today, one-time services are CANCELLED with a WINBACK opportunity; the status PATCH to CANCELED answers 409 `CANCEL_DISPOSITION_REQUIRED`. One path for the board and the field. Was: `PATCH { status: CANCELED }` → `updateAppointment` cascading every service to CANCELLED with no reason and no opportunity — two divergent cancel paths |
| Smart Schedule / AUTO_ELIGIBLE pill | PARTIAL — the pill DONE, Pass 36 (2026-10-07, C5.4); Smart Schedule ABSENT (Phase 9) | the queue's badge reads **"Scheduling: auto-eligible"** (`badge-queue-scheduling-*`, its title saying what the mode means today) through `shared/agreement-types.ts` `SCHEDULING_MODES` / `describeSchedulingMode()`; the agreement card and the Settings template row read the same labeler, the two form selects its labels ("Auto-eligible / Contact required / Manual"), and the server's enum the same list - no surface prints the raw enum and none promises auto-scheduling (dev rule 6; canon §9). Was: the raw `schedulingMode` text (`schedule.tsx` :2308 at the time; `:1097` had drifted). Still absent: any auto-scheduling, a skills column on technicians/users, required skills on service types, lat/long on locations (`schema.ts:51-72, 148-172`) |
| Opportunity type / category / assignee | DONE — Pass 25 (2026-09-24) | `categoryKey` (a key of the settings-managed `opportunity_categories`, five seeded keys and no others) + `workType` (AGREEMENT / ONE_TIME) on every row, stamped by source in `shared/opportunities.ts` and backfilled onto the 16 rows; the assignee on `assignedUserId` (a `users` FK, manual under `ASSIGN_OPPORTUNITY` support+, audit `update`), "My opportunities"; the list read filters on category, work type, assignee, source and location / zip in SQL. See "Shipped in Pass 25" at the end of Part D. Was: `status` is an enum (`routes.ts:288`); `opportunityType` is free text (per-service-type label or hardcoded strings, `storage.ts:1627, 3420, 3720`); `source` is hardcoded (`AGREEMENT_CONTACT_REQUIRED`, `AGREEMENT_CANCELLATION_RETENTION`, `AGREEMENT_INITIAL`, `APPOINTMENT_RESCHEDULE_REQUIRED`, `APPOINTMENT_CANCELLATION_REVIEW`, `NON_CONTRACT_FOLLOW_UP`); dispositions are settings-managed (`opportunity_dispositions`, `settings.tsx:704-740`); no assignee column |
| Ticket: prompt to time in when opened without a Time In | ABSENT | no `timeInAt` read in `service-completion-dialog.tsx`; the only prompt is time-*out* after post under `PROMPT_FOR_TIMEOUT` (`:353`) |
| Ticket: target pests as a searchable multi-select | PARTIAL | pill toggles **with a search box** (`:501-514`), from `/api/target-pests`, stored comma-joined (`:225`) |
| Ticket: target pests relocated to Materials with a summary; pest per application | ABSENT | no per-material pest column (`productApplications`) |
| Material Unit as a settings-managed dropdown | ABSENT | free-text input (`:636-637`); products carry one free-text `defaultUnit` (`schema.ts:572`), no unit list |
| Application area as multi-select | PARTIAL | single-select from the product's `allowedApplicationAreas[]` else free text (`:663-674`); areas serviced derived across lines (`:308`); no org-level area list (per-product comma text, `settings.tsx:296`) |
| Generate Proposal | ABSENT | no `proposal` anywhere |
| Ticket / appointment details: due vs prepaid, Price / COA / Due today, designation | DONE | Pass 7 (`ServiceBillingBlock` at `technician-work.tsx:686`, `VisitDueTodayTotal` at `:754`, since Pass 29's edits) |
| … billing plan/profile display, card-on-file icon | PARTIAL | plan pill on agreement card + location profile (Pass 7); the customer screen's billing chip and location line print the card on file ("· Visa •••• 4242") since Pass 40 (C6.1); nothing on the ticket; the card icon on the ticket / appointment details and "last four behind a click" are C6.2 |
| Post-ticket sequence: finish → collect → post | DONE, with D8's labels not the notes' | Pass 7.5 (see B1); the collect step's "preview / print / send service summary" is the service report document — built as Pass 22 (C3.5): Preview in the collect step, Open / Download on the review modal and the Services tab; "send" waits for C6.3 |
| Appointment status "Scheduled → Pending" | **REJECTED (Q4 / D1a)** | no fifth status; the feature is the reschedule-to-queue action (see B2) |
| Appointment Details (tech): service price = sum of due services | DONE | `VisitDueTodayTotal` (`technician-work.tsx:754`) |
| Appointment Details (tech): auto refresh after Time In / Out | DONE | `refreshWork()` invalidates on both mutations (`technician-work.tsx:201-212`; since Pass 29 it also invalidates the services, the location rows and the History read, which the field's composition changes). The note predates this or reflects a stale dev server (Pass 7.6's finding); re-verify after `npm run dev:full` restart. |
| Appointment Details: change service type, add service, change duration, order instructions | DONE — the dispatch sheet Pass 28 (2026-09-29), the tech modal Pass 29 (2026-10-02) | the dispatch sheet's block (`schedule.tsx` `sheet-composition`) edits each service's type (agreement work locked to ADJUST_PRICE_AGREEMENT) and duration, adds a service (from the queue or new), removes or cancels one, and its "Scheduling Notes" edit `appointments.notes` (B13's order instructions, audited since Pass 28) - all through `POST/PATCH /api/appointments/:id/services[/:serviceId]` and `POST /api/services/:id/cancel`. The tech modal (`technician-work.tsx` Appointment Details, `:483-800`): each service row opens on click (`button-tech-service-edit-*`) to a type select on non-agreement, un-ticketed work (the same PATCH; the locked label otherwise) and an instructions editor on a service this user added in the field (the generic service PATCH, 403 `SERVICE_INSTRUCTIONS_LOCKED` otherwise); **Add service** (`block-tech-add-service`) posts the add with origin FIELD; duration is not edited from the field (B13); "Appointment Notes" stays read-only; the sheet, the Services tab and Service Ticket Review show the "Field-added - review" badge with **Mark reviewed** (`POST /api/services/:id/field-review`, FINALIZE_TICKET). See "Shipped in Pass 29" at the end of Part D. An earlier version of this row said the sheet edited start/end/status/notes only and that attach-from-queue was absent - the notes edit and the queue-then-card attach both predated Pass 28 |
| Service Time Tracking Mode | DONE | `AUTO_TIMEOUT_ON_TICKET_POST / PROMPT_FOR_TIMEOUT / MANUAL_TIMEOUT` (`storage.ts:272`, `settings.tsx:1860-1883`) |
| Service-level cancel / return one service to pending | DONE — Pass 28 (2026-09-29) | per service on the dispatch sheet: **Remove** (`POST /api/appointments/:id/services/:serviceId/remove` - back to the queue, dates kept, the representative reassigned) and **Cancel** (`POST /api/services/:id/cancel` - a reason from the list, the opportunity choice, a one-time service CANCELLED and detached, an agreement service recycled); the last active service prompts to reschedule or cancel the appointment instead. The generic `PATCH /api/services/:id` now refuses status CANCELLED (409 SERVICE_CANCEL_REQUIRED), appointmentId null (400) and SCHEDULED -> PENDING_SCHEDULING while placed (409 SERVICE_REMOVE_REQUIRED) - before this pass any client could write all three with no reason, audit row or opportunity. See "Shipped in Pass 28" at the end of Part D |
| Materials modeled as products with allowed methods / equipment / areas | DONE | `materialProducts` (`schema.ts:556-579`) |
| Role profiles configurable in Settings | DONE — Pass 37 (2026-10-08, C5.6) | `role_profiles` + `role_profile_permissions` per org (`server/role-profile-bootstrap.ts` creates and seeds them), the four built-ins seeded as editable, cloneable profiles, Settings → **Roles** / **Users**, `PATCH /api/users/:id { role }`; `can()` (`shared/permissions.ts`) reads the profile registry with `ROLE_PERMISSIONS` as the built-in defaults, so no call site changed; `rolesWithPermission()` names profiles. See "Shipped in Pass 37" at the end of Part D. Was: four fixed roles, the matrix `ROLE_PERMISSIONS` (the row's ":44-86" had drifted to :98-149) and two helpers, `can()` and `rolesWithPermission()` |
| Technicians and users are one table | DONE — Pass 38 (2026-10-08, C5.7) | the `technicians` table is dropped; a technician is a `users` row with a `technicianStatus` (ACTIVE / INACTIVE / TERMINATED; NULL = not a technician) and the technician block (`licenseId`, `color`, `technicianNotes`, `phone`), `shared/technicians.ts`; the five technician FKs reference `users(id)`; `GET /api/technicians` is a facade over those rows in the old shape; Settings → Users edits a person and their technician block. See "Shipped in Pass 38" at the end of Part D. Was: PARTIAL — Pass 12's `technicians.userId` bridge (never linked on the dev DB); before that `technicians` had no `userId` |

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
("pending shows, confirmed counts"), and `CONFIRM_CASH_PAYMENT` (a profile holding it - the built-in manager and admin do; any profile since Pass 37). There is no invoice-level
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
or merge). C5.3. **Built as Pass 35** (`feature/phase-5-agreement-vocabulary`, 2026-10-06): the
`agreement_types` list seeded with the five, Add / Edit / **Merge** in Settings, the two dropdowns, the
one free-text value "Annual" migrated as its own entry ANNUAL for the office to rename or merge (not
silently Pest control), NULL left as "None"; no structure list - the Billing Plan and `expectedServiceCount`
remain the structure, and a bundle remains a grouping layer.

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
roles as permission sets, not four fixed ones. New unit C5.6. **Built as Pass 37** (`feature/phase-5-role-profiles`,
2026-10-08): `role_profiles` + `role_profile_permissions` per org, the four built-ins seeded as editable, cloneable
profiles, Settings → Roles and Users, `can()` reading the profile registry. Every "manager+" / "support+" /
"admin-only" in this roadmap now reads: the built-in profile named holds the permission by default, and the
office may give it to any profile (the interim answer is retired; the sentences below the C5.6 row say so where
they said "until C5.6").

**B17. Duplicates in the notes.** "Move Batch Invoice" (Invoices + Ticket Review sections), "Generate
Invoice on the review modal" (Invoices + Ticket Review), "Collect Payment button" (ticket + appointment
details — both exist). Each is one unit below.

**B18. "API ready for Stripe or other processor… framework for card, auto-draft, ACH."** The framework
is V1 §0.4's provider port (`server/integrations/payments/`), org-level credentials, and tokenized
`payment_methods`. **Built in Pass 40 (C6.1, 2026-10-09):** the port and the Stripe adapter (the only
file importing the SDK), the per-org provider account (`payment_provider_accounts` - keys encrypted at
rest, Settings → Payments, Connect-ready by data), one provider Customer per PestFlow account, and the
card on file captured by Stripe's own Payment Element through a SetupIntent (PestFlow never sees a card
number - the PCI rule holds). Charging and auto-draft are C6.2; ACH capture is a later pass; the CARD /
ACH payment methods stay refused until C6.2. **Owner:** agreed; the **last four digits must be visible** —
they are (`payment_methods.last4`: the customer screen's billing chip and Edit Location's Cards on file
list, for every role; behind the card icon on the ticket in C6.2).

**B19. "Batch: if CC on file and appropriate billing profile selected, auto-process with a
confirmation."** Needs Phase 6 (cards) and C5.2 (a billing profile the location actually selects,
with `autoChargeOnFile`). **Owner:** agreed. C5.2 shipped as Pass 34 (2026-10-05): a location now
selects its profile (the account default or its own override) and every invoice carries it; what Phase
6 still needs is the card on file itself and the `autoChargeOnFile` flag.

**B20. Aging "current/30/60/90/90+".** V1 §1.4: derived, never stored. **Owner:** "Current" should mean
0-30 days; better semantics welcome. Resolution for C2.4: age by **invoice date** (`issuedAt`, days
since invoiced), buckets **Current (0-30) / 31-60 / 61-90 / Over 90**, labelled "days since invoiced";
a later Settings toggle can switch to due-date aging for Net-terms commercial accounts. The
customer-wide figure is a rollup; the balance still lives at the location (canon rule 1). Money on
account is shown beside, never netted.

**B21. "Customer/account history log for all changes."** The History tab and the append-only log exist
(Pass 2); only the profile edit writes customer/location rows. D7 named this follow-up. "Revert" = a
new forward change that records what it reverted. **Owner:** agreed, old notes. C5.1. **Built:** the
rows in Pass 32 (C5.1a - every non-financial create / update / status change, no `account` entity: the
account's facts are logged on the location whose primary flag moved or on the customer); the
customer-level History and Revert in Pass 33 (C5.1b, 2026-10-05): a History sheet from the customer
screen's toolbar rolling up every location plus the account-level rows, and Revert on a row - the
fields that row changed put back through the entity's own write path, recorded as a `reverted` row
naming the source; a profile holding `REVERT_HISTORY` (the built-in manager and admin; any profile since Pass 37). A `created`, a `deleted`, a financial, a
service / appointment / opportunity row and an agreement's cancellation are refused with a code - the
inverse of each is its own workflow, never a revert.

**B22. "Invoices are not being created upon finalization."** Resolved in Pass 5. Under the default
`PROMPT`, "Later" creates nothing on purpose; `OFF` creates nothing at all. **Owner:** confirmed.

**B23. "Make all names/addresses hyperlinks."** Done on dispatch cards and the Payments /
Opportunities screens; missing on the dispatch sheet, ticket review, service history, the pending
queue, **and the invoice rows** (owner: "don't forget invoice cards"). Folded into C2.1a (invoice rows
and the modal header) and C5.4 (everything else). **C5.4 shipped as Pass 36 (2026-10-07):** every surface
above links (the board card is a real `<Link>` now, not a `setLocation()` button), the Service History page
gained the location it never showed, and the URL shape is one client module (`client/src/lib/customer-links.ts`);
a service name points at the location's Services tab, since no per-service deep link exists (decided against).
Left plain and noted: `batch-invoice-dialog.tsx` :252-253 (the batch preview's rows) and `opportunities.tsx`
:395 ("Open location" is a `setLocation()` button).

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
| C2.1d (**Pass 11d**) — **done** (`feature/phase-2-down-payment-first-visit`, 2026-09-22; see "Shipped in Pass 11d" at the end of Part D; the open flag in Part E answered the same day) | **Down payment on the first visit's invoice** (owner correction 2026-09-21 under D4, `PLAN_BILLING_V1_1.md`). `createAgreement` stops calling `issueInitialChargeInvoiceTx` (`storage.ts:3252`); `POST /api/agreements/:id/issue-initial-charge` and its event stay as the explicit up-front path. A **live** event is an `INITIAL_CHARGE` billing event whose invoice is not VOID (or that has no invoice: settled outside the ledger). `buildVisitInvoiceLinesTx` (`storage.ts:5496`) appends, for each agreement behind the visit's services with `initialChargeType = DOWN_PAYMENT`, a resolvable amount (`resolveInitialChargeCents`) and no live event, an `INITIAL_CHARGE` line "Down payment - <agreement>" taxed as the standalone path taxes it; generation and `issueInvoiceTx` (never the draft) insert the event with `invoiceId` = the visit invoice, so a void of that invoice makes the event non-live and the corrected invoice carries the line again. `DOWN_PAYMENT` only (`CLEANOUT_SURCHARGE` / `PREPAY_FULL` left in C3.6, Pass 23). `isFullyAgreementCovered` must not read a covered visit with a down-payment line as "No charge". `getVisitBillingSummary`'s un-invoiced branch prices the pending line as `BILLABLE` (Price / COA in D4's order / Due today) so the ticket, appointment details, collect step and review modal show it. `initialChargeCollectedBy` gets its reader: the office prompt at scheduling fires unless `TECH_AT_FIRST_SERVICE`; the technician's collect step shows a "Down payment $X" callout unless `OFFICE_AT_SIGNING`; both when null. **Office prompt**: appointment creation (`POST /api/appointments` and the schedule screen's placement) for a service on an agreement with a live-less down payment and no designated payment covering it returns `initialChargeDue: { agreementId, amountCents }`; the client asks "Collect the $X down payment now?" → `RecordPaymentDialog` with `designatedAgreementId` + `appointmentId` (split into 11e if the pass runs long — the routing and the technician's figures are the must-haves). Copy: `initial-charge-fields.tsx:106`; the agreement card's `AgreementInitialChargeStatus` → "Billed on the first visit's invoice" + "Issue up front instead", "Invoiced as INV-x (first visit)" once fired. **Migration** (`agreement-bootstrap.ts`, guarded, per-row effect printed before commit): the three `Daily Rodent Trapping` rows per the open flag in Part E. Canon §13 and the initial-charge canon corrected in the same PR. **Verify** (5001): `DOWN_PAYMENT` $100 on a plan-less agreement → no invoice at creation; the first visit's summary shows the `INITIAL_CHARGE` line `BILLABLE` $100 beside the service line at remaining ÷ expected; generate → both lines and the event on the visit invoice; the second visit's summary has no down-payment line; void the first invoice → the summary shows it again; the explicit button on a fresh agreement → standalone + event, second press refused; a schedule-billed agreement → $100 down + $0 covered, no "No charge" banner; appointment creation returns `initialChargeDue`, and not after a covering designated payment. | Down payment shares the visit's invoice; office prompt at scheduling; tech collects against it (owner, 2026-09-21) | C2.1c (the line's Bill To), Pass 6 | Open flag in Part E (the three unissued rows) |
| C2.2 (**Pass 12**) — **done** (`feature/phase-2-billing-plan-required-sold-by`, 2026-09-23; see "Shipped in Pass 12" at the end of Part D) | **Billing Plan required on every Agreement + sale attribution.** Backfill the 11, `billingPlanId NOT NULL` + zod; `agreements.soldByUserId` — a `users` FK (owner: one identity table for techs and office), defaulting to the session user at creation, changed only under a new `ASSIGN_SALE_CREDIT` (manager+), audit `update`; template propagation untouched. `technicians` had no link to `users` then (the `technicians` pgTable, since dropped by Pass 38), so the same pass added a nullable `technicians.userId` bridge; the full merge was C5.7 (Pass 38). | Compensation basis (CURRENT_FOCUS) | — | Answered 2026-09-19: attach the billing plan named **Monthly Recurring** to all 11 — the 9 `Quarterly Control` rows (monthly billing for a quarterly program, the industry norm; the marked "Monthly" line in `notes` is deleted once attached) and the 2 Wildlife rows, whose term is already past its end, so Pass 3.5's attach rule starts no schedule and bills nothing. The 4 CANCELLED rows attach for the constraint only. The pass prints the per-row effect (`nextBillingDate` or the refusal) before committing. **Built as decided** (the DB had 5 CANCELLED rows, not 4; the 4 ACTIVE rows anchored on 2026-09-24, the Wildlife rows refused at their term end, nothing else asked). |
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
| C3.3 (**Pass 19**) — **done** (`feature/phase-3-tech-ticket-money-instructions`, 2026-09-25; see "Shipped in Pass 19" at the end of Part D) | **Technician ticket modal, money and instructions**: draft-price override on the billing-summary read (`?serviceId=&priceCents=`, priced server-side through `resolveServiceLineBillingTx` + tax), dollars.cents on blur, service instructions (agreement `serviceInstructions`, service notes, location notes) at the top, the **billing-plan pill** in the ticket header (the profile display waits for C5.2), **time-in prompt** on opening a ticket with no Time In (bypass allowed). Landing after Post unchanged (B1). | Tech modal items 1-4; time-in prompt; display billing plan | — | — |
| C3.4a (**Pass 20**) — **done** (`feature/phase-3-material-units-areas`, 2026-09-26; see "Shipped in Pass 20" at the end of Part D) | **Material units and application areas**: a settings-managed unit list (`material_units`) feeding a Unit dropdown, product `defaultUnit` migrated to pick from it; an org-level application-area list in Settings feeding products' allowed areas; application area multi-select per material line (`applicationAreas[]`, areas serviced still derived). | Unit dropdown; Application area multi-select | — | — |
| C3.4b (**Pass 21**) — **done** (`feature/phase-3-target-pests-two-levels`, 2026-09-27; see "Shipped in Pass 21" at the end of Part D) | **Target pests, two levels** (B12): `productApplications.targetPests[]` per material row from the target-pest list (compliance); the ticket-level target pests stay on the ticket, selectable from a searchable multi-select placed in the Materials section, and are **selected ∪ every material's pests**; the summary line at the top of the ticket shows that union. Decided there: `applicationLocation` dropped. | Target pests; pest per application | C3.4a | — |
| C3.5 (**Pass 22**) — **done** (`feature/phase-3-service-report-document`, 2026-09-27; see "Shipped in Pass 22" at the end of Part D) | **Service report document** — customer-facing summary of a posted/finalized ticket (technician + license, date, services, pests, materials, notes, recommendations, signature placeholder) through the document renderer, stored like invoices; Open / Download on the review modal and the Services tab, Preview in the collect step. **Settings toggle "Attach service report to visit invoices"** (B11): when on, a visit-anchored invoice's PDF appends the report(s) for its lines; schedule-driven and manual invoices have no visit and append nothing. Both documents stay separately openable. | "Preview/print/save/send service summary"; "sends invoice / service report" | — | — |
| C3.6 (**Pass 23**) — **done** (`feature/phase-3-field-surcharge-line`, 2026-09-27; see "Shipped in Pass 23" at the end of Part D) | **Field surcharge line** — as specified in `CURRENT_FOCUS.md`: SURCHARGE line on the ticket → invoice line; allow/reject toggle moves from plan to template; `CLEANOUT_SURCHARGE` / `PREPAY_FULL` leave the initial-charge vocabulary; test-data defaults migrated; `ADD_FIELD_SURCHARGE` gets its UI. **Transitional credit rule until Phase 7:** a recorded SURCHARGE line always credits the posting technician, marked transitional (dev rule 4), replacing today's permission inference in `createSurchargeEntryIfConfigured()`. As built: the surcharge lives on the ticket (`service_records.surchargeCents` / `surchargeLabel`), audited as `surcharge_recorded`; the gate is `ADD_FIELD_SURCHARGE` plus the template's toggle for an agreement service (a non-agreement service: the permission alone); the migration decided each template's default from its agreements' plans (agree → that flag; none → its default plan's; disagree → off); the four unit-15 credit rows stand as history. | (owner-specified 2026-09-13) | — | — |
| C3.7 (**Pass 24**) — **done** (`feature/phase-3-service-designation-callbacks`, 2026-09-27; see "Shipped in Pass 24" at the end of Part D) | **Service designation + callback attribution** — `ServiceType.category` (CALLBACK / PRODUCTION / SERVICE) in Settings, instance designation on Service defaulted from the type, a required "answers Service …" link on a CALLBACK chosen at scheduling; production basis and invoice $0 read the designation instead of the slot counter. Canon §10. Its urgency in `CURRENT_FOCUS.md` came from plan-less agreements billing per visit; that drops once Pass 12 lands, so it sequences after it (COD-plan callbacks remain the case it fixes). As built: the new thing is the **work kind** (`serviceTypes.workKind` / `services.workKind`, `shared/service-kind.ts`) - `category` already existed as free text and "designation" is the billing badge's word; the link is `services.answersServiceId` (same location, COMPLETED, not a callback); the override is the price's permission, frozen once the ticket is finalized or the visit invoiced, audited `work_kind_changed`; the slot counter is gone (an extra visit credits the per-visit value); an unpriced callback reads "warranty callback - no charge" on every plan and a priced one bills "callback" on every plan; the type routes' writes are MANAGE_SETTINGS. | (roadmap note in canon) | C2.2 | — |
| C3.8 | **Ticket Review viewport** (`OWNER_FEEDBACK.md` FB-002, QUALIFIED 2026-10-07 in Pass 36, which touched the file for C5.4's links and built only FB-010 by the owner's word). "Currently requires horizontal scroll." What exists: the page is full width (`p-4 sm:p-6`, no max-width); the queue row is a five-column grid from `md` up (`row-review-ticket-*`, a `div[role=button]` since Pass 36); the modal is `sm:max-w-3xl` with vertical scroll only (`max-h-[92vh] overflow-y-auto`). Which element overflows has not been rendered by any session - the modal's billing table (`VisitBillingTable`) and the materials rows are the candidates; the pass needs the owner's screen width and the surface named. Unscheduled - the owner sequences it. | FB-002 | — | which surface scrolls, at what width |

### Phase 4 — Scheduling and dispatch (D8's deferred scheduling pass, split)

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C4.1 (**Pass 25**) — **done** (`feature/phase-4-opportunity-taxonomy`, 2026-09-24; see "Shipped in Pass 25" at the end of Part D) | **Opportunity taxonomy, assignee and search** — `category` (settings-managed, seeded NEW_SALE / SERVICE_DUE / RESCHEDULE / WINBACK / RETENTION) + `workType` (AGREEMENT / ONE_TIME); `assignedToUserId` (a `users` FK, manual assign / reassign, "My opportunities"); migration maps the six hardcoded sources and the free-text types; the Opportunities screen filters on category, work type, status, assignee, source, and location / zip. | Opportunity Type/Category; ASSIGNED_TO; search open opportunities | — | — (owner: the five only) |
| C4.1b (**Pass 26**) — **done** (`feature/phase-4-opportunity-assignment-rules`, 2026-09-28; see "Shipped in Pass 26" at the end of Part D) | **Opportunity assignment rules and zones** — Settings: `zones` (named zip-code lists, reusable later by dispatch and Smart Schedule) and `opportunity_assignment_rules` (category / work type / zone / source → user, ordered, first match wins); auto-assign at creation, unassigned when no rule matches; reassignment logged. As built: two org-scoped tables (`shared/zones.ts`, `shared/opportunity-assignment.ts`), one insert path (`insertOpportunityTx`) that stamps the assignee and `opportunities.assignedByRuleId` at creation under the system actor with an `opportunity_auto_assigned` audit row; a rule naming an inactive user or zone is skipped and reported on the card; writes are MANAGE_SETTINGS; a manual reassignment nulls the rule and stays the logged `update`; the chips read "(auto)". | ASSIGNED_TO auto-assign by zones / zip / params | C4.1 | — |
| C4.2 (**Pass 27**) — **done** (`feature/phase-4-cancel-reschedule`, 2026-09-25; see "Shipped in Pass 27" at the end of Part D) | **Cancel and Reschedule, one path** (B2). New `POST /api/appointments/:id/disposition { mode: CANCEL \| RESCHEDULE, reasonCode?, opportunity: UPDATE_EXISTING \| CREATE \| NONE, voidDraftInvoices? }` built on `requestAppointmentCancelOrReschedule` (the technician's cancel-reschedule route becomes a thin alias that always creates the office-handoff opportunity). **RESCHEDULE**: services back to `PENDING_SCHEDULING`, no reason required, no policy, no opportunity when the office does it from the board. **CANCEL**: reason required from the settings list; agreement-generated services return to `PENDING_SCHEDULING` with `serviceWindowStart/End` reset from the cancel date and an opportunity created or assigned as the fallback; non-agreement services are `CANCELLED` with the opportunity prompt (category defaulted by path). Both keep the draft-invoice prompt. `PATCH /api/appointments/:id { status: CANCELED }` is refused with 409 `CANCEL_DISPOSITION_REQUIRED`; the sheet's status Select drops CANCELED and its "Cancel Service" button becomes **Cancel appointment** + **Reschedule**. **Board moves confirm on drop** ("Move to <slot>?"). The location's Services tab shows Scheduled / Pending / Rescheduling / Cancelled distinctly — also Q4's PENDING_SCHEDULING-vs-SCHEDULED gap. | Unschedule → Reschedule; cancel reason required; opportunity prompt; agreement services recycled; accidental moves; Services-tab clarity | C4.1 | — |
| C4.2b (**Pass 27b**) — **done** (`feature/phase-4-cancel-reschedule-review`, 2026-09-25; see "Shipped in Pass 27b" at the end of Part D) | **Cancel and Reschedule, owner review** (live testing of 2026-09-25, Part E). (1) A CANCELED placement leaves the dispatch board - cancelled and rescheduled alike, so the slot is free for new work; it stays in the location's Services tab ("Was <date>", the reason) and History as the record. One shared predicate for "shows on the board", read by the board's viewport, slot map and analytics (`getTechnicianWork` already excludes CANCELED). (2) The Cancel appointment and Reschedule dialogs close when the disposition completes: the sheet resets on the appointment prop only while one is set, so the dialog stays open after the sheet closes. (3) Re-verify, with a fresh agreement service and a fresh one-time service, that the opportunity a CANCEL creates is OPEN until the recycled service is placed again (placement converts it, the pre-existing rule); the owner saw CONVERTED and attributed it to the agreement path. No new behavior otherwise. | Owner review of Pass 27 | C4.2 | — |
| C4.3a (**Pass 28**) — **done** (`feature/phase-4-appointment-composition`, 2026-09-29; see "Shipped in Pass 28" at the end of Part D) | **Appointment composition, server + dispatch sheet** (B13) — add a service to an appointment (new or from the pending queue), remove / cancel / return ONE service to pending (the last service prompts to reschedule the appointment), change a service's type (agreement work stays locked) and duration, appointment instructions (`appointments.notes`) editable; all through `getLinkedServicesForAppointmentTx`. UI on the dispatch sheet. **Also (owner review of 2026-09-25): cancelling a `PENDING_SCHEDULING` service outright**, from the pending queue and the location's Services tab, with the disposition's semantics. As built: `shared/appointment-composition.ts`; four routes (`POST /api/appointments/:id/services`, `POST .../services/:serviceId/remove`, `PATCH .../services/:serviceId`, `POST /api/services/:id/cancel`), each one transaction and one audit row (`appointment_composition_changed` / `service_cancelled`); the representative follows the first remaining sibling; the planned end grows on add and never shrinks; a service landing on a visit converts its handoff opportunities like a placement (the board's attach and grouped placement use the same route); an agreement service's type is ADJUST_PRICE_AGREEMENT everywhere; the last active service is refused; a posted ticket, a settled service and an issued invoice refuse; the generic service PATCH refuses the lifecycle moves; the reasons list's write is MANAGE_SETTINGS; one `ServiceCancelDialog` on the sheet, the queue and the Services tab. | Appointment Details build-out; service-level cancel; cancel a pending service | C4.2 | — |
| C4.3b (**Pass 29**) — **done** (`feature/phase-4-field-composition`, 2026-10-02; see "Shipped in Pass 29" at the end of Part D) | **Appointment composition in the field** (B13) — the technician's appointment details: each service displayed, editable on click (type, for non-agreement work); **Add service** as a small button; adding extends the visit's duration and refuses an overlap with the technician's next stop; instructions editable only on services the technician added; an added non-agreement service is **flagged for office review** (owner). Same routes as C4.3a. As built: `origin: "FIELD"` on the add route's body (one-time work only, 400 `FIELD_ADD_NEW_ONLY` on a queued service; the session user stamped on `services.addedInFieldByUserId`; 409 `NEXT_STOP_OVERLAP` when the extended end would pass the technician's next placement that day - the office's add is told, never refused); the flag is the stamp with `fieldReviewedAt` null, cleared by `POST /api/services/:id/field-review` (FINALIZE_TICKET, one `field_service_reviewed` row); the type through the C4.3a PATCH; the instructions through the generic PATCH, refused 403 `SERVICE_INSTRUCTIONS_LOCKED` to a technician on a service they did not add; the "Field-added - review" badge and **Mark reviewed** on the sheet, the Services tab and Service Ticket Review; the row's kind badge, agreement marker and planned duration; no new permission. | Add service in the field (tech-modal item 5) | C4.3a | — |
| C4.4 (**Pass 30**) — **done** (`feature/phase-4-technician-preferences-crew`, 2026-10-03; see "Shipped in Pass 30" at the end of Part D) | **Technician preferences + crew** (B14). `technician_preferences` (`scopeType account \| location`, `technicianId`, `kind PREFERRED \| EXCLUDED`, note, created-by); editors in edit/add location and on the primary location with an "apply to all locations" checkbox that writes the account-scoped row; chip on the card. Dispatch: EXCLUDED is a **hard block** on placement (manager override with a reason, audit-logged), PREFERRED a "Prefers <tech>" hint on the queue row and the sheet. Crew: `appointment_technicians` (lead + support) — the comp basis D8 collects here; production entries stay single-technician until Phase 7's split allocation. As built: one org-scoped table in canon §6 / §7's account \| location shape (`shared/technician-preferences.ts`: the location's row wins over the account's for the same technician; ACCOUNT rows written and cleared from the primary location only); the block in `createAppointment` and in `updateAppointment` when the technician changes - 409 `TECHNICIAN_EXCLUDED` naming the technician and the scope, `{ overrideExclusion: { reason } }` under the new `OVERRIDE_TECHNICIAN_EXCLUSION` (manager+; 403 / 400 otherwise), one `placement_exclusion_overridden` row; the board prompts a manager for the reason and resends; `appointment_technicians` with one LEAD mirroring `assignedTechnicianId` (115 rows backfilled on the dev DB) and SUPPORT rows from the sheet's crew block (`POST` / `DELETE /api/appointments/:id/crew`, `appointment_crew_changed`; an excluded support technician is refused the same way); the support technician's day lists the stop read-only; preference editors in Edit / Add Location, open to every role; set / clear audited on the location or the account's customer. | Preferred technician; EXCLUDE_TECH; apply across locations; crew | — | — |
| C4.4b (**Pass 30b**) — **done** (`feature/phase-4-crew-schedule-review`, 2026-10-03; see "Shipped in Pass 30b" at the end of Part D) | **Technician preferences + crew, owner's additions** (`OWNER_FEEDBACK.md` FB-018, FB-019, given after Pass 30 merged). (1) A support technician's copy of the visit on their own row of the board (a second card on the same visit - never a second appointment), and adding a support technician who is already booked during the visit is a prompt: 409 `CREW_SCHEDULE_CONFLICT` listing the clashing visits, resent with `confirmConflicts`. (2) Placing or re-assigning a visit to anyone but the customer's preferred technician is a prompt naming the preference: 409 `PREFERENCE_NOT_HONORED`, resent with `acknowledgePreference` (any role), logged `placement_preference_bypassed`; a manager's exclusion override covers it. | Support schedule copy; double booking; preferred-technician reminder | C4.4 | — |
| C4.5 (**Pass 31**) — **done** (`feature/phase-4-dispatch-board-settings`, 2026-10-03; see "Shipped in Pass 31" at the end of Part D) | **Dispatch board settings.** Settings → Dispatch Board: **view interval** (the rename; keep 1 h / 2 h, add 30 min), **snap interval** 15 / 30 / 60 (`dispatch_snap_minutes`; drag placement and the sheet's time inputs round to it), default visible hours (the session override stays). As built: `shared/dispatch-board.ts` with one `app_settings` row per value (`dispatch_view_interval_minutes` 30 \| 60 \| 120, `dispatch_snap_minutes` 15 \| 30 \| 60, `dispatch_default_start_hour` / `_end_hour` whole hours 6..21; defaults 120 / 60 / 8 / 18 - today's board), no seed row, read together by `GET /api/settings/dispatch-board` and written by a partial `PATCH` (MANAGE_SETTINGS; 400 `DISPATCH_BOARD_SETTINGS_INVALID` when start >= end or the snap is coarser than the view interval); the board's slots are minutes of day end to end (the 30-minute view), `isSameStart` compares to the minute (a move inside the hour no longer escapes lockTime), the snap rounds the sheet's Start / End on save and every placement start (**there is no drag** - placement is a slot click, a move click-then-confirm; the server never rounds), the Window popover's "View Interval" (was "Slot Interval") and hours are a session override of the settings with the end-hour clamp fixed and a reset, and "in view" is per day (the multi-day spill fixed; a visit past the end hour no longer rides the last slot). | Schedule interval; View Interval | — | — |
| C4.5b (**Pass 31b**) — **done** (Pass 31's branch and PR, 2026-10-04; see the addendum under "Shipped in Pass 31" at the end of Part D) | **Dispatch board layout** (`OWNER_FEEDBACK.md` FB-021, given while PR #103 was open). (1) A full day fits without horizontal scrolling at every view interval: the page is full-width and the 1-day view's slot columns share it (`minmax(0, 1fr)` over a fixed 160 px technician column; compact padding in the 30-minute view); a 3-day or week view keeps a 96 px floor per column and scrolls. (2) Nothing variable above the navigation row: the in-view figures (Jobs In View, Scheduled Revenue, Board Window, the per-technician cards) moved below the pending queue under "In view", and the selection box moved directly below the board. Client only - no route, no data. | FB-021 | C4.5 | — |
| C4.6 | **Visit duration on the board** (`OWNER_FEEDBACK.md` FB-020, 2026-10-03). A card spans its planned window - the stored end, else the representative service's duration, else 60 minutes (`plannedWindow`, Pass 30b) - across the slots it covers, instead of sitting in its start slot printing "N min"; a duration change on the sheet re-checks the lead's other visits and prompts on a clash the way Pass 30b's crew add does (today the lead's own placement is never checked - noted in Pass 30b). Board rendering on Pass 31's minute slots; no new data. **Unscheduled**: the owner sequences it against Phase 5. | FB-020 | C4.5 | — |
| C4.7 | **Dispatch sheet and queue, the owner's items** (`OWNER_FEEDBACK.md` FB-013 / FB-014 / FB-015, ACCEPTED 2026-10-07 in Pass 36, which touched both surfaces for C5.4's links and built none of the three by the owner's word). (1) **FB-013** - the pending queue row tags a service whose last placement was cancelled or rescheduled from the field: the data exists (`services.lastAppointmentId` → the appointment's `rescheduleRequested` / `cancelRequestedByLabel`; `resolveServiceScheduleState` already answers "Rescheduling" on the Services tab), and the queue still prints the raw `status` badge - humanize it through `SERVICE_SCHEDULE_STATE_LABELS` and add the origin pill. (2) **FB-014** - the sheet's technician select, Scheduled Start / End and the Lock switches (`AppointmentSheet`) lock behind Reschedule (the disposition path, C4.2); FB-019's reminder moves with the technician change. (3) **FB-015** - the always-open add block (`sheet-add-service`) collapses behind an "Add Service" button. Unscheduled - the owner sequences it against Phase 5. | FB-013, FB-014, FB-015 | C4.2, C4.3a | — |

Smart Schedule is Phase 9: it needs geocoded locations, technician skills, service windows and the
zones from C4.1b, and only the last exists by then.

### Phase 5 — Customer record, agreements, settings hygiene

| # | Unit | Notes covered | Depends on | Open decision |
|---|---|---|---|---|
| C5.1a (**Pass 32**) — **done** (`feature/phase-5-audit-coverage`, 2026-10-04; see "Shipped in Pass 32" at the end of Part D) | **Non-financial audit coverage (D7 follow-up).** Every mutation of customer, location, contact, billing profile, agreement, agreement template, appointment, and service (create / update / status) writes the log through the existing helper, with new entity members in `shared/audit.ts`. Excludes `service_records` (C3.1's `ticket_edited`) and price overrides (Pass 8). As built: `contact`, `billing_profile`, `billing_profile_template`, `agreement_template` join `AuditEntityType` (no `account` - the primary flip is logged on the locations, the account's facts sit on the customer); `created` / `status_changed` / `deleted` join `AuditAction` beside the existing `update` (one member for "updated"); three private writers (`auditCreatedTx` / `auditChangeTx` / `auditDeletedTx`) write inside each method's transaction, a change only when the History tab's own diff would show something (`auditChangeAction`; `updateLocationProfile`'s always-write fixed), `status_changed` when `status` moved; whole-row snapshots for the simple entities (the agreement's with its sold-by user named), the curated `serviceAuditSnapshot` / `appointmentAuditSnapshot` grown for the two scheduling entities; the fourteen actor-less storage methods take `actor` and every route passes `getAuditActor(req)`; an agreement's own schedule executing - the generated service (also from the three write-on-GET routes), the recurrence advance, the billing run's `nextBillingDate` - signs as `SYSTEM_AUDIT_ACTOR`; `cancelAgreement`'s visits carry the disposition's cancel fields and a `status_changed` each; `deleteService` writes `deleted` (and no longer fails on the crew FK); the location History read lists the contacts' and the billing profiles' rows, the templates are read by `entityType` + `entityId`; `audit_logs_entity_idx` on (org_id, entity_type, entity_id); the dead public `recordAuditLog` removed; the client's five dead `["/api/audit-logs"]` invalidations replaced by `invalidateAuditViews()` and every mutation that now writes a row calls it. | Customer/account history log | — | — |
| C5.1b (**Pass 33**) — **done** (`feature/phase-5-customer-history-revert`, 2026-10-05; see "Shipped in Pass 33" at the end of Part D) | **Customer-level History + Revert.** A History view on the customer that rolls up every location plus account-level rows; **Revert** on a row = a new forward update through the entity's normal write path, logged as `reverted` naming the source row; a profile holding `REVERT_HISTORY` - the built-in manager and admin; configurable since Pass 37 (owner). As built: `GET /api/audit-logs?customerId=` (the third exclusive form) backed by `getAuditLogsForCustomer` - the account's locations (keyed on the account, the screen's own source; `locations.customerId` only for a legacy customer with no account row) with every record anchored to them, plus the customer's own rows, the account's billing profiles with no location and any contact with no location, newest first at the read's clamp, each row annotated `locationId` / `locationName` (null = "Account"); a **History** button on the customer screen's toolbar beside Statement opening a sheet with a location filter and a record-type filter (the tab list is location-scoped by canon, so no customer-level tab); the per-location History tab untouched. Revert: `POST /api/history/:auditLogId/revert` under `REVERT_HISTORY` (the built-in manager and admin profiles hold it; the table's own API stays read-only) - the storage plans it (`shared/audit.ts` `describeAuditRevertability`: `update` / `status_changed` / `reverted` rows of customer, location, contact, billing profile, the two templates and agreement; the entity must exist; the fields the row changed must still hold its after values, else 409 `HISTORY_STALE` with the current row), the route validates the planned payload with the entity's own zod schema and the agreement's sale-credit rule, and the entity's existing update method replays it - ONE `reverted` row (the write path writes it instead of its `update`, the after carrying `reverted` = { auditLogId, action, createdAt, actorLabel }), re-checking the fields inside its transaction. Refused with a code: `created` / `deleted` rows, the financial entities, service / appointment / opportunity rows, the special actions (preference set / clear...), an agreement's cancellation, a location made non-primary. The card renders a one-sided row's snapshot, the location chip, the "Reverted the ... of ..." line and the Revert button with an AlertDialog confirm; the reverted entity's own reads refresh. | History for all changes; revert | C5.1a | — |
| C5.2 (**Pass 34**) — **done** (`feature/phase-5-billing-profile-customer-screen`, 2026-10-05; see "Shipped in Pass 34" at the end of Part D) | **Billing profile on the customer screen.** Selector in edit/add location (inherit account default / override), account default on the customer edit modal, org default template in Settings (`default_billing_profile_template_id`) used at customer creation; the "Billing: Per-location / Default" chip reads real data. As built: `billing_profiles.location_id` is the one pointer read (`locations.billing_profile_id` was a mirror the profile write path kept and `customers.default_billing_profile_id` a dead column - both dropped in Pass 39, C5.8); `shared/billing-profile-defaults.ts` holds the setting key, the vocabularies and the `LocationBillingProjection` (ACCOUNT_DEFAULT \| LOCATION_OVERRIDE \| NONE) the compat read answers for the selected location beside `accountDefault` and `billingOverrideLocationIds`; Settings -> Billing Defaults (`GET` open / `PATCH` MANAGE_SETTINGS, 400 `BILLING_DEFAULTS_INVALID` for an unknown or inactive template, null deletes the row); `createCustomerWithPrimaryLocation` creates the account-default row from that template in its transaction, audited `created` (no template, or a stale one: no profile; no backfill of existing accounts); the writers refuse a foreign location, a second active override per location and a second active default per account (400 with a code), never type the card / ACH tokens, and retire with `status: "inactive"` (never a delete - invoices carry the id); the Add / Edit Location dialogs carry the selector (inherit / override with label, type, terms, billing name, address) and the primary location's Edit Location the account default's fields (created there when the account has none, prefilled from the org template); the template routes' writes are MANAGE_SETTINGS (the card gated), the instance routes stay open like the location PATCH; the chip prints "<label> (account default)" / "<label> (this location)" / "No billing profile", the switcher and profile-card badges read the projection, the ticket header prints the resolved profile; `getAuditLogsForLocation` narrowed to the location's own overrides plus the account's location-less rows. The setting's write is audited since Pass 39 (C5.8, the `app_setting` entity). | Billing profile from customer screen; add-location setup; default in settings | — | — |
| C5.3 (**Pass 35**) — **done** (`feature/phase-5-agreement-vocabulary`, 2026-10-06; see "Shipped in Pass 35" at the end of Part D) | **Agreement vocabulary.** A settings-managed **Agreement types** list (seeded Pest control / Termite / Mosquito / Wildlife / Evaluation) with dropdowns on template and agreement; the existing free text migrated into entries the office can rename or merge; no hardcoded structure list (B8). `CUSTOM` recurrence → explicit DAY / WEEK with the `CUSTOM(N)` → `DAY(N)` migration (this row said 7 agreements and 2 templates; the DB had NINE and 2, every one with recurrence CUSTOM/1, and the 7 / 10 sat on the TERM columns, so the migration covered four columns). As built: `agreement_types` (id, orgId, key, label, description, isActive, sortOrder; unique (org_id, key)) with `shared/agreement-types.ts` holding the seed, the key derivation (upper snake from the label), the one unit list `AGREEMENT_UNITS` = DAY \| WEEK \| MONTH \| QUARTER \| YEAR and its labelers; `agreements.agreement_type` / `agreement_templates.default_agreement_type` keep their columns and hold the type's KEY, nullable - a type is not required (the dropdowns offer "None"; no "Untyped" entry); the agreement bootstrap seeds the five keys per org, turned the one free-text value "Annual" (16 agreements and the Quarterly Control template) into the entry ANNUAL "Annual" at sort 60 for the office to rename or merge (never silently Pest control; NULL stayed NULL on 9 agreements and 2 templates), and rewrote CUSTOM → DAY with the same interval on all four unit columns (recurrence CUSTOM/1 → DAY/1 on 9 agreements and 2 templates; term CUSTOM/7 → DAY/7 on 6 agreements and 2 templates, CUSTOM/10 → DAY/10 on 3 - exact, never WEEK(1) for a 7; next-service, renewal and billing dates untouched), each row printed before its write, both steps self-guarding and unaudited (bootstrap UPDATEs); `server/seed.ts` names the seed keys on its three templates. Settings → **Agreement Types** card: Add (the key derived and previewed; fixed once created), Edit (label / description / active / sort), **Merge** (every agreement and template on the source moves to the target in one transaction, the source inactive); a type in use - any agreement whatever its status, or any template - cannot be made inactive without a merge (409 `AGREEMENT_TYPE_IN_USE`); no DELETE (405); the controls admin-only. Routes: `GET /api/agreement-types[?includeInactive=true]` open, each row with `agreementCount` / `templateCount`; `POST`, `PATCH /:id`, `POST /:id/merge { intoId }` MANAGE_SETTINGS, strict (a key on a PATCH refused), 400 `AGREEMENT_TYPE_KEY_TAKEN` / `_KEY_INVALID` / `_LABEL_REQUIRED` / `_MERGE_TARGET_INVALID` (self, unknown, inactive), 404 `_NOT_FOUND`; the agreement and template writers refuse a key that is not an ACTIVE type (400 `AGREEMENT_TYPE_UNKNOWN`, `assertActiveAgreementTypeTx`, on insert and on a change); `recurrenceUnitSchema` = `z.enum(AGREEMENT_UNITS)` on all four columns (CUSTOM refused). Audit: `agreement_type` joins `AuditEntityType` (`created` / `update`; never revertable) and `agreement_type_merged` joins `AuditAction` (the source's row, the after naming `merge` { intoId, intoKey, intoLabel, agreementsMoved, templatesMoved }) PLUS one `update` per moved agreement (`agreementAuditSnapshotTx` - the key reads as a field change on the location's History) and per moved template - direct UPDATEs inside the merge's transaction, not `updateAgreement` (its own transaction, re-derives billing, regenerates services). `advanceAgreementDate` dropped its CUSTOM case (an unknown unit is a MONTH; no row carries CUSTOM); a pre-migration History row whose before holds CUSTOM replays as DAY (`REVERT_UNIT_FIELDS`). Client: the two type dropdowns (template form; agreement form with the template's default preselected) over the active types plus "None" (plus the row's own key if since inactive); the four unit selects over the list; the three labelers delegate to the shared ones; `addAgreementInterval` gained DAY / WEEK (WEEK(1) previewed as one day before); the type shows in ONE place, "Type: <label>" on the agreement card (nowhere else read it). Untouched by decision: billing plan `anchorMode` CUSTOM, cancellation `effectiveDateMode` CUSTOM, the material "Custom / Unlisted"; `service_types.category` (Termite / General / Rodent / Commercial free text) overlaps the list and was not merged; POST / PATCH `/api/agreement-templates` and the Settings Agreement Templates card stayed ungated until Pass 39 (C5.8) made them MANAGE_SETTINGS. | Agreement Type dropdown; CUSTOM recurrence | — | — |
| C5.4 (**Pass 36**) — **done** (`feature/phase-5-ui-hygiene`, 2026-10-07; see "Shipped in Pass 36" at the end of Part D) | **UI hygiene.** Hyperlinks on the dispatch sheet, hover card, Service Details dialog, pending-queue rows, the Ticket Review list and modal, and the Service History page; a details link from the pending queue (service details + location); the `schedulingMode` badge humanized ("Scheduling: auto-eligible") with no auto-schedule promise (dev rule 6); Make Primary moves into the contact dialog (inline button removed); New Service modal `max-w-2xl`. As built: **the link convention** is a wouter `<Link>` with `hover:underline` and a `link-*` test id (the Pass 11a / 14 precedent), the targets built by one module `client/src/lib/customer-links.ts` (`customerPath`, `locationPath(customerId, locationId, tab?)`, `stopLinkPropagation`); a service name links to the location's Services tab (`&tab=services`) - no `serviceId` deep link (decided against); **one shared labeler**, `shared/customer-label.ts` `describeCustomerLabel` / `describeLocationLabel`, with `schedule.tsx`'s and `service-ticket-review.tsx`'s copies delegating with their own fallback words (Pass 35's delegation precedent) and `services.tsx` reading it (its inline ignored `companyName`); `batch-invoice-dialog.tsx`'s copy left. **The surfaces:** the board card's name a real `<Link>` (was a `setLocation()` button), the hover card's and the support card's names, the sheet header (customer / service type / location; the composition rows stay plain - the edit surface), the dispatch Service Details dialog (customer / location / service type; description reworded now the queue opens it), the queue row (customer / location, stopping the row's select click), the Ticket Review list (the `<button>` row restructured to a `div[role=button]` with Enter / Space, customer / address links) and modal (customer / service type / address block; "Open Location" a link-styled button, disabled with a title when no location), the Service History page (customer link, a location line with a link - the page showed no location - and the search covering company and location). **The queue's Details** (`button-queue-details-*`) opens the board's `ServiceDetailDialog` through `setDetailServiceId` (it resolves from `GET /api/services`; no new read; `customer-detail.tsx`'s richer `ServiceDetailModal` stays file-local, not exported). **The badge:** `SCHEDULING_MODES` / `SchedulingMode` / `SCHEDULING_MODE_LABELS` / `SCHEDULING_MODE_DESCRIPTIONS` / `isSchedulingMode` / `describeSchedulingModeLabel` / `describeSchedulingMode` ("Scheduling: auto-eligible") / `describeSchedulingModeDetail` in `shared/agreement-types.ts` (Pass 35's vocabulary module); the queue badge (title = what the mode means today), the agreement card ("Auto-eligible" under its own heading) and the Settings template row read it, the two form selects read the labels ("Auto Eligible" → "Auto-eligible"), and `routes.ts`' `agreementSchedulingModeSchema` is `z.enum(SCHEDULING_MODES)`. **Make Primary:** the inline button and `setPrimaryContactMutation` removed; the dialog's checkbox disabled on the current primary with a note (`shared/contacts.ts` `CONTACT_PRIMARY_LOCKED_NOTE`); the zero-primary guard the inventory found - `ContactError` 400 `CONTACT_PRIMARY_REQUIRED` from `updateContact` when the location's only primary would be made non-primary (or moved - unreachable through the routes, whose schemas drop `locationId`; defense in depth), mapped by the contact PATCH and by the revert route (a revert of a promotion row is refused; the demotion row is the one to revert); both dialog mutations invalidate `["/api/contacts", customerId]` (the switcher's label was stale); `POST /api/contacts/:id/set-primary` **kept** (promotes only, API callers, the same audit rows); canon §3 records the rule. **The modal:** `max-w-2xl` (`dialog-service-form`), New Service and Edit Service alike (FB-010 DONE). **Not touched:** FB-002 / -013 / -014 / -015 (reviewed; C3.8 / C4.7), `batch-invoice-dialog.tsx` :252-253 and `opportunities.tsx` :395 (name-printing, noted), the queue's raw `status` badge (C4.7), the selection box and the move confirm. No migration, no table, no column, no new route. | Hyperlinks; pending-queue links; AUTO_ELIGIBLE pill; Make Primary; widen modal | — | — |
| C5.6 (**Pass 37**) — **done** (`feature/phase-5-role-profiles`, 2026-10-08; see "Shipped in Pass 37" at the end of Part D) | **Role profiles in Settings** (B16). `role_profiles` + `role_profile_permissions` (org-scoped); the four built-in roles seeded as editable, cloneable profiles; users assigned a profile; `can()` reads the profile instead of the fixed matrix (`shared/permissions.ts`), so no call site changes; an admin cannot remove `MANAGE_SETTINGS` from their own profile; every profile change audit-logged. Interim "manager+" answers elsewhere in this roadmap become profile permissions. As built: **design (A) - the role string IS the profile key.** `users.role` holds a `role_profiles.key` (the built-ins keep `admin` / `manager` / `support` / `technician`, so no user row moved; no `users.role_profile_id` - the key is the assignment), and `can(role, permission)` stays synchronous and keyed by the string, reading a process-level **registry** (`setPermissionMatrix` / `getPermissionMatrix` / `hasPermissionMatrix`) the server fills at boot and after every profile write (`server/role-profile-bootstrap.ts` `loadPermissionRegistry`) and the client fills from the `roleProfiles` list `GET /api/auth/me` and the login answer carry (`use-auth.ts`, set before the payload is committed so the first render reads it) - the ~125 call sites did not change; with an empty registry `can()` reads `ROLE_PERMISSIONS`, now exported as the built-in defaults. **Known limit, stated:** the registry is per process, not per org - exact with one organization; Phase 9 keys it by org (the bootstrap loads the first org and warns when more exist). **Schema:** `role_profiles` (id, orgId, key, name, description, isBuiltIn, isActive, sortOrder; unique (org_id, key)) + `role_profile_permissions` (id, orgId, profileId FK ON DELETE CASCADE, permission; unique (profile_id, permission)) - a join row per permission, as the row said; both in `TABLES_REQUIRING_ORG_ID`; the bootstrap (between auth and agreements in `index.ts`) creates them and seeds the four per org from `ROLE_PERMISSIONS` with ON CONFLICT DO NOTHING (printed when inserted, quiet after; a warning per user whose role names no active profile, and when more than one org exists), then loads the registry. **A 29th permission**, `EDIT_ANY_SERVICE_INSTRUCTIONS` (support / manager / admin, not technician): the one direct role check (`storage.ts` `updateService`, Pass 29's `SERVICE_INSTRUCTIONS_LOCKED`) reads it instead of `actorRole === "technician"`, so a clone of Technician inherits the lock - the seed counts are technician 4 / support 13 / manager 28 / admin 29. `shared/permissions.ts` gained `PERMISSION_LABELS` / `PERMISSION_DESCRIPTIONS` / `PERMISSION_GROUPS` / `describePermission` (the checklist), `PERMISSION_VALUES` / `isPermission` / `sortPermissions` (declaration order - the snapshots' and the API's order), `BUILT_IN_ROLE_PROFILES` (the seed: names, descriptions, sort 10 / 20 / 30 / 40), `rolesWithPermission()` returning profile NAMES from the registry ("Manager or Admin" - the existing refusal sentences stay true), `describePermissionHolders()` and `describeRoleName()` (`shared/users.ts` `describeUserRole` delegates; `ROLE_LABELS` is gone); `UserRole` is `string`, `BuiltInRole` the four. `shared/role-profiles.ts` (new): the seed, `deriveRoleProfileKey` (the agreement-type derivation), `isValidRoleProfileKey` (a built-in key or upper snake), `ROLE_PROFILE_ERROR_CODES`, `RoleProfileSummary`, `holdsManageSettings`, `describeRoleProfileUsage`, `cloneRoleProfileName`. **Routes:** `GET /api/role-profiles[?includeInactive=true]` open (each row with `permissions` and `userCount`); `POST`, `PATCH /:id`, `POST /:id/clone` MANAGE_SETTINGS, strict (the key never in a body - derived from the name, fixed after; 400 `ROLE_PROFILE_NAME_REQUIRED` / `_KEY_INVALID` / `_KEY_TAKEN` (case-insensitive, so "Admin" cannot sit beside "admin") / `_PERMISSION_UNKNOWN`, 404 `_NOT_FOUND`); `DELETE` 405 (a profile is made inactive; a built-in is never removed - rename and edit allowed); and the users write the row presupposed and the code lacked, `PATCH /api/users/:id { role }` (MANAGE_SETTINGS, strict; the role must be an ACTIVE profile key of the org - 400 `ROLE_PROFILE_UNKNOWN`; 404 `USER_NOT_FOUND`; live on the user's next request since `deserializeUser` re-reads the row, no re-login; `GET /api/users` stays open). **The guards:** (a) 409 `ROLE_PROFILE_SELF_LOCKOUT` - the acting user cannot remove `MANAGE_SETTINGS` from the profile their own role names, make that profile inactive, or move themselves to a profile without it; (b) 409 `ROLE_PROFILE_LAST_SETTINGS_MANAGER` - no write may leave the org with no active profile holding `MANAGE_SETTINGS` (built in storage as defense in depth: unreachable through the API while the actor must hold Manage Settings and (a) protects their own profile; the smoke exercises it through the storage with a synthetic actor); 409 `ROLE_PROFILE_IN_USE` - a profile users hold cannot be made inactive (Pass 35's in-use rule). **Audit:** `role_profile` and `user` join `AuditEntityType` - `created` (a clone's row carrying `clonedFrom` { id, key, name }; plain `created`, no dedicated action) and `update` with the permission list in both snapshots (the diff names what moved; an unchanged save writes nothing), `user` `update` with `role` before / after (the first `user` rows; never the hash); neither revertable. **Settings:** a **Roles** card (rows: name, Built-in / Active / "Your role" badges, key, N of 29 permissions, users, sort; Add / Edit with the grouped permission checklist - Manage Settings disabled on the acting user's own profile, the Active select disabled on a profile in use or one's own; **Clone** with the name defaulting to "<name> (copy)") and a **Users** card (name, email, status, a role select per row writing the PATCH; no create / password / status flow - the auth bootstrap's); `invalidateRoleProfileViews()` refreshes `/api/role-profiles`, `/api/users` and `/api/auth/me` (the client registry). **The copy sweep:** the 17 "Admins manage … / Only an admin can change …" strings in `settings.tsx`, the 6 "a manager or (an) admin" strings (customer-detail, schedule, payments, collect-payment-dialog) and 4 server refusals read `describePermissionHolders()` ("Service types are managed by Admin (Manage Settings).", "Only Admin can change this setting (Manage Settings).", "Manager or Admin may change it"). **Not done, by decision:** the ungated writes this roadmap deferred to C5.6 (service / appointment cancel and disposition, the opportunity categories PATCH, the agreement templates POST / PATCH, customer-data edits, the money reads) stayed ungated - Pass 39 (C5.8) gated the Settings reference data and listed the workflow routes under C5.10; `technicians.userId` stays the C5.7 bridge; no password / invite flows; PLAN_BILLING_V1.md §0.3's "own only" production value and "partial" Manage Settings are not modeled. | Role profile creation | — | — |
| C5.7 (**Pass 38**) — **done** (`feature/phase-5-technicians-are-users`, 2026-10-08; see "Shipped in Pass 38" at the end of Part D) | **Technicians are users** (owner decision 2): technician profile fields (license, color, display name) move onto `users`; `technicians` becomes a compatibility view or is dropped after every FK (`appointments`, `services`, `service_records`, `production_value_entries`, `technician_preferences`, crew) is rewired; the C2.2 bridge is the migration key. As built: **(1) the profile on `users`** - `phone`, `licenseId`, `color`, `technicianNotes` and `technicianStatus` (ACTIVE \| INACTIVE \| TERMINATED, the old table's vocabulary; NULL = not a technician - the column is the marker, no boolean); `displayName` is NOT stored (it is `userDisplayName`, "First Last"); `users.status` stays the LOGIN flag and `technicianStatus` the FIELD flag - not folded (a technician who never signs in is `inactive` as a login and ACTIVE in the field). **(2) The migration** (`server/technician-users-bootstrap.ts`, after the auth bootstrap - which owns the five columns - and before the role profiles, one transaction): the bridge was EMPTY (both rows `user_id` NULL), so an unlinked technician is MINTED as a users row under the SAME id (first / last split from `display_name` on the first space, the technician's email or `<id>@technicians.local`, a random unusable hash, status `inactive`, role `technician`, the block copied) and NO FK row is rewritten; a linked one (none today) is REMAPPED technician.id -> user_id across the five FK columns and the bare ledger column, its block copied onto the user; every FK referencing `technicians` is dropped by the name the catalog holds (three `*_technicians_id_fk`, two `*_fkey`) and re-created against `users(id)` under the db:push names (`services_assigned_technician_id_users_id_fk` etc.), `technicians` is DROPPED; `production_value_entries.technician_id` (NO FK - this row's "every FK" was wrong about it; a snapshot by design) keeps its ids; the 38 `audit_logs` rows embedding a technicianId stay as history; every step printed, the whole quiet on the second boot. Option (B) - new ids and ~600 FK rewrites - not taken. **(3) The table is dropped, not a view**: storage's `getTechnicians` is a FACADE over users rows with a technician status, answering `TechnicianSummary` (`shared/technicians.ts`: the old row shape - `displayName` derived, `licenseId` "" when null, `status` = the technician status, `userId` = the row's own id), exported from `shared/schema.ts` under the old name `Technician` so the ten client readers and the shared helpers keyed on a technician id read on unchanged; every storage join on the old table (`resolveServiceRecordTechnicianSnapshot`, `technicianNameMapTx`, `crewMembersTx`, `setTechnicianPreference`, `addAppointmentCrewMember`, `updateServiceRecord`'s re-snapshot, `getInvoiceDetail`, the service report context) reads users through one `technicianProfileTx` (a writer's lookup requires a technician status - a preference or crew row naming an office login is 404 `TECHNICIAN_NOT_FOUND`); `createTechnician` / `updateTechnician` / `assertTechnicianUserLink` / `insertTechnicianSchema` / the pgTable are gone; `seed.ts`'s Jake Miller / Sam Torres are users rows. **(4) The users write surface**: `POST /api/users` (MANAGE_SETTINGS, strict: firstName, lastName, email, role - an ACTIVE profile key -, the technician block; the row is created with status `inactive` and NO password - an unusable hash; "set password" / invite is C5.9) and `PATCH /api/users/:id` widened from Pass 37's `{ role }` to the name, email (trimmed, lowercased, unique whatever the case), login status, role and the technician block (strict); refusals 400 `USER_NAME_REQUIRED` / `USER_EMAIL_INVALID` / `USER_EMAIL_TAKEN` / `USER_STATUS_INVALID`, 409 `USER_SELF_DEACTIVATE` (one's own login), 409 `TECHNICIAN_HAS_HISTORY` (a user the visits, services, tickets, crew rows, preferences or production entries name cannot become "not a technician" - Terminated retires them), 404 `USER_NOT_FOUND`, plus the Pass 37 role rules; `POST` / `PATCH /api/technicians` (ungated since Pass 12) are GONE; the Settings Technicians card is MERGED into the Users card ("Users and technicians": Add / Edit one person - name, email, phone, role, login status, Field technician select, license, colour, notes; the inline role select kept), and the old card's stale-cache bug (invalidating `["/api/technicians"]` while every reader keys `?includeInactive=true`) is fixed by a prefix invalidation. **(5) The Tech View identity**: the page defaults to the SESSION USER when `user.technicianStatus` is set and shows the picker only to a role holding a 30th permission, `VIEW_OTHER_TECHNICIAN_WORK` (support / manager / admin by default), which `GET /api/technicians/:id/work` refuses for another technician's day without (403 `TECHNICIAN_WORK_FORBIDDEN`); the ticket dialog's default technician follows the page, so a technician's post and production credit are their own; the permission is granted to the seeded built-ins by the role-profile bootstrap's new `SEEDED_PROFILE_GRANTS` (the first exercise of the Pass 37 rule; the seed counts are 4 / 14 / 29 / 30). **(6) Heritage Tech** (`tech@heritage.local`) is made an ACTIVE technician with placeholder license `DEMO-0001` by the auth bootstrap (once, guarded by a NULL status). **(7) Not done:** the password / invite flow (a minted or created user cannot log in until one exists - C5.9), the audit JSON remap, the client sweep from `Technician` to `UserSummary` (left again by Pass 39 - on C5.9), `appointments.assigned_to` and the ticket's name / license snapshots (text by design), the 5 of 77 tickets with a null technician (canon §12 notes them), Smart Schedule. | One table for all users | C2.2, C5.6 | — |
| C5.5 | **Org timezone** for every date-only value (billing run "today", collections days, batch range, aging). Cross-cutting; scheduled when the UTC-day slips become a real complaint. | (Pass 7.7 note) | — | — |
| C5.8 (**Pass 39**) — **done** (`feature/phase-5-schema-settings-hygiene`, 2026-10-08; see "Shipped in Pass 39" at the end of Part D) | **Schema and settings hygiene** (found by Pass 34; the owner sequenced it after Pass 38). A list of unrelated items, decided one by one. BUILT: **(1) the two dead billing pointers DROPPED** - `locations.billing_profile_id` (the pre-Pass-34 reverse pointer the write path mirrored; the billing-profile bootstrap's backfill read it on every boot) and `customers.default_billing_profile_id` (read by nothing; `insertCustomerSchema` let three customer routes and the revert schema write it from a body) - by `server/billing-profile-bootstrap.ts` behind a column-exists guard, the reverse-pointer carry onto `billing_profiles.location_id` run ONE last time before the drop (0 rows on the dev DB: the one pointer agreed), the mirror writer `syncLegacyLocationPointerTx` and the three comments describing it gone, the columns gone from `shared/schema.ts` (so no body can carry them - stripped, not refused: the customer / location schemas are not strict), `accountId` out of the two location CREATE bodies (storage derives it from the customer), `REVERT_ENTITY_STRIPPED_FIELDS.customer` naming the dropped field (a revert of a pre-Pass-39 row puts back nothing for it; the 16 location and 14 customer snapshots that embed the fields stay as history). **(2) The three `billing_profiles` foreign keys** the schema declared and the DB lacked - `billing_profiles_account_id_accounts_id_fk` / `_location_id_locations_id_fk` / `_template_id_billing_profile_templates_id_fk` (db:push's names, so a fresh and a migrated database agree) - added by the bootstrap when NO foreign key exists on the column (`pg_constraint` by column, never by name; a row naming a missing referent is printed and the key skipped, never deleted - 0 orphans on the dev DB), the missing `billing_profiles_template_id_idx`, `billing_profile_templates` in `TABLES_REQUIRING_ORG_ID` (its org index and default), and the gap the keys would have exposed closed: a `templateId` naming no template of the org is 400 `BILLING_PROFILE_TEMPLATE_UNKNOWN` from `assertBillingProfileRulesTx` on POST and PATCH (active or not - a retired template's profiles are still edited under it) where the key would have made it a 500. **(3) The `app_settings` audit** - `app_setting` joins `AuditEntityType` (never revertable; `shared/app-settings.ts` labels the keys); every one of the nine setters takes the session's actor and writes through one `upsertSettingTx` / `clearSettingTx` pair that records `update` on the KEY with `{ key, value }` (the stored text) before and after - null for a row that did not exist or was deleted, one row per dispatch key that moved, nothing on an unchanged save; the nine PATCH `/api/settings/*` routes pass `getAuditActor(req)`; `PATCH /api/settings/service-time-tracking` is MANAGE_SETTINGS like its eight siblings (it was the one ungated settings write; the dev DB's PROMPT_FOR_TIMEOUT came through it on 2026-07-13) and the card's select disables below it; `GET /api/audit-logs?entityType=` with no `entityId` is a form of its own (every row of the type, org-wide) and feeds a **Recent settings changes** card at the bottom of Settings (the last 20, the key labelled, rendered by the History tab's own `AuditLogEntryCard`). **(5) The Settings reference data GATED** - POST / PATCH `/api/agreement-templates`, `/api/target-pests`, `/api/material-products`, `/api/billing-plans`, `/api/agreement-cancellation-policies`, `/api/opportunity-dispositions` and PATCH `/api/opportunity-categories/:id` are MANAGE_SETTINGS (14 routes with service-time-tracking; the Pass 24 service-types precedent), the seven cards' Add hidden and Edit disabled below it with the "managed by" note (reads stay open). **(7)** `POST_SERVICE_TICKET`, seeded since Phase 0 and read by nothing, gates `POST /api/services/:id/complete` and `POST /api/service-records` (every built-in profile holds it, so no user changes; a profile stripped of it is 403); `users.email`'s column-level `.unique()` replaced by the declared `users_email_uidx` on lower(email) the DB has had since the auth bootstrap (a db:push database now gets the same index); `VIEW_COST_MARGIN_LTV` kept, its description pointing at C5.10. RECORDED, not built: **(4)** `server/seed.ts` versus the dev DB - the seed is a demo for an EMPTY org (it runs only when the org has no customers; the dev DB's date from 2026-03-08) and the dev DB is the owner's data, so its four templates, two technicians and "Warranty Callback" never ran here and nothing is merged; **(5b)** the 43 other ungated writing routes and the money reads - a workflow decision per route, the new row **C5.10**; **(6)** `service_types.category` stays the free-text display grouping (the agreement types name a PROGRAM, the category a service offering's shelf; Termite the one overlap, Rodent / Commercial have no program; no filter, grouping or report reads it); **(7b)** the client `Technician` -> `UserSummary` sweep (behaviour-free; on C5.9 with the users work - this pass already touches the schema, the bootstrap, nine writers, fourteen routes and seven cards). Not touched: C5.9, C5.5, Smart Schedule, the workflow gates. | (Pass 34, 35 and 38 notes) | C5.2, C5.3, C5.7 | — |
| C5.9 | **Users: password and invite flow** (found by Pass 38, unscheduled - the owner sequences it). A user minted by Pass 38's migration or created from Settings → Users has an unusable password hash and `status = 'inactive'`: nothing can set a password today (the auth bootstrap seeds the four demo logins with `ChangeMe123!`). Build "set password" / "send invite" (and a password change for oneself), decide who turns a login on, and whether `forcePasswordReset` (canon §16 named it; no column) is wanted. Until then a field-only technician never needs a login, and an office user is created by the auth bootstrap's seed or by SQL. **Also here, left by Pass 39 (C5.8):** the client `Technician` -> `UserSummary` sweep - the nine files importing `Technician` from `@shared/schema` (batch-invoice-dialog, draft-invoice-for-visit-dialog, service-completion-dialog, technician-preferences, customer-detail, schedule, service-ticket-review, services, technician-work) read the `TechnicianSummary` projection `GET /api/technicians` answers; they could read `GET /api/users` through `technicianSummariesFromUsers` (`shared/technicians.ts`) and the facade and the alias retire - behaviour-free, so it rides with the users work rather than the hygiene pass. **And the owner's FB022 (2026-10-08):** a home / starting address on every user (no column today; Smart Schedule's prerequisite too) and whatever else a profile should carry, the fields named by the owner - the editable profile, the role-gated create and the license number on tickets exist since Pass 38. | (Pass 38 note; FB022) | C5.7 | — |
| C5.10 | **Workflow permission gates** (found by Pass 39's inventory, unscheduled - the owner decides route by route). Pass 39 (C5.8) gated the Settings reference data only; these stay open to every authenticated role and are each a product decision, not hygiene - a LIST, not decided: **customer data** - POST `/api/customers`, `create-with-primary-location`, PATCH `/api/customers/:id`, PATCH `/api/customers/:customerId/locations/:locationId/profile`, POST / PATCH `/api/locations` (the PATCH still takes `customerId` / `accountId` re-parenting), `set-primary`, the contact POST / PATCH / `set-primary`, the billing profile POST / PATCH (the instances; the templates are gated), `PUT /api/notes/scoped`, the technician preferences PUT / DELETE; **scheduling** - the appointment POST / PATCH, crew add / remove, composition add / remove / change, time-in / time-out, the disposition (cancel / reschedule) and its technician alias (who may cancel); **services** - POST / PATCH `/api/services`, the per-service cancel, DELETE, the field add's origin (the flag is the control); **agreements** - POST / PATCH / cancel / `link-initial-appointment` (the sold-by and the fee waiver have their own permissions); **opportunities** - PATCH / disposition / convert; **communications** POST; `POST /api/product-applications`; **the money reads** - every invoice / payment / credit memo / statement / aging / balance / tax GET and `/api/audit-logs` are open to every role, `VIEW_COST_MARGIN_LTV` is read by nothing and `VIEW_PRODUCTION_VALUE` gates only the two production-value-entries GETs; `GET /api/dev/account-invariants` carries a TODO to gate it. The Settings cards gated on the server but still showing working buttons to everyone - Tax Rates, Tax Rules, Organization Branding Save - and Company Settings (inputs, no save) are dev-rule-6 items of the same row. The Pass 39 inventory (the session's `pass39-inventory.md` §5, route by route with what each writes) is the source; re-grep before building. | (Pass 39 inventory) | C5.6 | which routes get a permission, and whether reads get any |

### Phase 6 — Card / ACH payments and invoice delivery (V1's "Phase 2")

| # | Unit | Notes covered | Depends on |
|---|---|---|---|
| C6.1 (**Pass 40**) — **done** (`feature/phase-6-payment-provider-port`, 2026-10-09; see "Shipped in Pass 40" at the end of Part D) | **Payment provider port** (`server/integrations/payments/`, Stripe first, org-level credentials, Connect-ready), `payment_methods` (tokens, brand, **last4** shown on the billing profile, expiry), SetupIntent capture from the billing profile; PCI: no card number ever touches PestFlow. As built, decision by decision: **(1) the account model** - a per-org provider-account ROW (`payment_provider_accounts`: provider, mode test \| live, the keys, a nullable `connectedAccountId`), the adapter built per request from that row by `server/integrations/payments/index.ts`, never a process env key; Heritage starts on its own Stripe account; Stripe Connect later is a data change (the connected account id becomes the Stripe-Account header) plus onboarding, not a refactor. **(2) where the secret lives** - that table, born `org_id NOT NULL` (not `organizations`, whose GET answers every role; not `app_settings`): the secret key and the webhook signing secret AES-256-GCM under env `PAYMENT_CREDENTIALS_KEY` (`.env.example`, PROJECT_MAP) with an 8-hex fingerprint beside each; write-only from Settings → **Payments** (`PUT` / `DELETE /api/payment-provider`, MANAGE_SETTINGS; a blank secret keeps the stored one, a mode change or a reconnect needs that mode's key - 400 `PAYMENT_PROVIDER_SECRET_REQUIRED`; a live key under test mode 400 `_MODE_MISMATCH`, a key of the wrong shape 400 `_KEY_INVALID`, no master key 503 `PAYMENT_CREDENTIALS_KEY_MISSING`) whose read (`GET`, open) answers configured / provider / mode / publishable key / connected account / hasWebhookSecret / encryptionReady - never a secret; a disconnect clears the secrets and keeps the row `inactive`; audited as its own entity `payment_provider_account`. **(3) test mode** - the explicit per-org `mode`, `livemode` on every card row, "Test mode" badges on the Payments card, the Add card dialog and beside every test card; the dev DB holds test keys only. **(4) who** - the 31st permission `MANAGE_PAYMENT_METHODS` ("Manage cards on file"; support / manager / admin by default through SEEDED_PROFILE_GRANTS: 4 / 15 / 30 / 31), the last four open to every role (B18); field capture at the visit not built - the owner's call. **(5) the row** - `payment_methods` per V1 §1.2 (org, account, location?, provider, the two provider ids, type card \| ach, brand, last4, expMonth, expYear, isDefault, status active \| removed, livemode, the added / removed stamps) with `billing_profiles.defaultPaymentMethodId` (foreign key `billing_profiles_default_payment_method_fk`, named explicitly because db:push's derived name exceeds Postgres's 63 characters) checked by `assertBillingProfileRulesTx` - an ACTIVE card of the profile's account or 400 `BILLING_PROFILE_PAYMENT_METHOD_UNKNOWN`, cleared inside a removal, never put back by a revert; the three legacy columns `cardOnFileToken` / `achToken` / `lastFour` left UNREAD (the one `'4242'` ignored: seed data with no token behind it; a later hygiene pass drops the three). **(6) the Stripe Customer** - one per PestFlow account per provider and mode in `payment_provider_customers`, minted by the first session (name from the company or the person, the customer's email or the primary contact's), reused after, the id never answered. **(7) the capture flow** - `POST /api/accounts/:accountId/setup-intents` (MANAGE_PAYMENT_METHODS: a SetupIntent, usage off_session, card only, metadata pestflowOrgId / pestflowAccountId; 409 `PAYMENT_PROVIDER_NOT_CONFIGURED` without a provider) → the client mounts Stripe's Payment Element (`@stripe/stripe-js` 9.17.0 / `@stripe/react-stripe-js` 6.12.0, loaded from js.stripe.com only when the dialog opens - SAQ-A) → `stripe.confirmSetup` in the browser → `POST /api/accounts/:accountId/payment-methods { setupIntentId, makeDefault?, billingProfileId?, locationId? }`, which reads the intent back from the provider (never the body's word): the account's own customer (400 `PAYMENT_METHOD_INTENT_MISMATCH`), succeeded (400 `PAYMENT_METHOD_SETUP_INCOMPLETE` with `details.status`), a card (400 `PAYMENT_METHOD_TYPE_UNSUPPORTED`), the location the account's (400 `PAYMENT_METHOD_LOCATION_MISMATCH`), idempotent on the provider's method id, the first active card the account's default; no webhook (C6.2's); ACH not captured. **(8) the port** - `types.ts` reshaped (createCustomer / createSetupIntent / retrieveSetupIntent / detachPaymentMethod; `PaymentMethodRef` with type / brand / last4 / expiry / livemode; `PaymentProviderError` with a status and a code; charge / refund / handleWebhook declared and answering 501 `PAYMENT_PROVIDER_NOT_IMPLEMENTED` until C6.2), the `stripe` SDK 22.6.2 imported by `providers/stripe.ts` alone, a `providers/fake.ts` in-process double the route accepts only under `PAYMENT_PROVIDER_FAKE_ALLOWED=1` outside production (the smoke test's provider), the row type `StoredPaymentMethod` (shared/payments.ts keeps `PaymentMethod`). **(9) what the profile shows** - Edit Location's Billing block gains a **Cards on file** list (account-level: "Visa •••• 4242 · exp 04/28", Default / Expired / Test mode badges, Make default, Remove behind a confirm - a soft status plus a provider detach, never a delete -, Add card; disabled with the reason when no provider is connected or the role lacks the permission) and each profile's fields a **Card for this profile** select (the pointer; "Account default card" = null); the header chip and the location line append "· Visa •••• 4242" from `LocationBillingProjection.paymentMethod` (display fields only - `resolveProfilePaymentMethod`: the pointer, else the account's default); the ticket / appointment icon and "last four behind a click" stay C6.2. **(10)** `billingType` stays the payer arrangement (no migration); a card-type profile with no card on file WARNS (an amber note in the block), not refused - the owner decides. **(11) audit** - `payment_method` (`created`; `update` on isDefault; `status_changed` on removal; display fields, never a provider id; on the customer-level History and the location it was noted against) and `payment_provider_account` (`created` / `update` / `status_changed`; the fingerprints, never a key; listed on the Payments card); neither revertable; the `payment_method` prefixes in `invalidate-audit-views.ts`. **(12) not done:** charging, webhooks, the outbox worker, the magic link, email, ACH, the legacy column drop, C5.5 / C5.9 / C5.10, Smart Schedule; the Payment Element and every card affordance are unrendered (no browser, no key - the smoke test drove the port through the fake provider). | Stripe framework; card on file | C5.2 |
| C6.2 | **Charge from the invoice** (modal: "Charge card on file" / "Process card" → PaymentIntent → payment CAPTURED → applied), refunds through the provider, webhooks via a transactional outbox; **batch auto-charge** with the confirmation prompt (billing profile `autoChargeOnFile`); "pay this invoice" magic link (`access_tokens`, V1 §1.8). Card icon on the ticket and appointment details, last four behind a click, permission-gated. Pass 40's notes for this row: `paymentHoldsValue` / `paymentCountsAsPaid` (`shared/payments.ts`) know PENDING and CONFIRMED only, so a CAPTURED card payment counts for nothing until they learn it; the webhook signing secret is already stored (encrypted) on `payment_provider_accounts` and `handleWebhook(rawBody, signature)` is on the port; the card a profile charges is `resolveProfilePaymentMethod` (its pointer, else the account's default); **FB-023** (a per-agreement card - `agreements.paymentMethodId`, charged before the profile's; the payer-split half of that note is a billing-profile-per-agreement question for the owner) joins the auto-charge work here. | Process CC; auto-process in batch; CC icon | C6.1, C2.1a, C2.3 |
| C6.3 | **Email delivery**: an email port (Resend / SES) + outbox; "Send to customer" in the modal sends the PDF to the billing contact; batch send emails; statements and service reports by email. | Send to customer (email) | C2.1a, C2.5, C3.5 |

### Phase 7 — Compensation engine (V1's "Phase 2.5")

Per V1 §1.6.2 and the `CURRENT_FOCUS.md` compensation entry: `comp_plans` / `comp_components` /
`comp_earnings` with plan and rate snapshotted per earning; split allocation rows beneath production
entries (needs C4.4's crews - `appointment_technicians`, built in Pass 30: one LEAD, SUPPORT rows
beside it, read by nothing until this phase); components that pay a non-technician (needs C2.2's sold-by); the
per-plan surcharge selector (C3.6 / Pass 23 keys the credit off the recorded line under the
transitional always-credit rule, `SURCHARGE_CREDIT_RULE`; the selector replaces that rule, and an
adjustment entry for a surcharge changed after its credit belongs here too); per-period statements
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
  a profile holding `ASSIGN_INVOICE_LOCATION` (manager and admin by default), and the owner picks. Once assigned, a row cannot be moved again from the UI (the route
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
  location's own address (`LOCATION_OVERRIDE`). Until Pass 34 (C5.2) no screen created a profile or gave one an
  address, so on the dev DB only Golden Gate's two locations (its account default and the Westside override, both
  address-less) resolved one and every other new invoice billed the primary location; since Pass 34 the location
  dialogs create, address and retire profiles.
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
  visit and are issued only from the card until C3.6 retires them (retired in Pass 23); a visit carrying two agreements'
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
  Program` rows (`6e6f03c3`, `1044779c`) hit Pass 3.5's term-end refusal (CUSTOM/7 terms - DAY/7 since Pass 35's migration - that ended
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
  the role name, so Pass 37's profiles (C5.6) inherit it. A re-post by anyone over an existing record is logged
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
  A typed due date still wins. On the dev DB only Golden Gate's two locations resolved a profile
  then (the correction of 2026-10-05: the earlier "every location has none" was wrong), so blank
  stayed blank everywhere else until Pass 34 (C5.2) let the office give a location one.
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
  profile the fee dialog could create (C5.2, Pass 34: profiles are created from the location
  dialogs, not from the fee dialog, which still only reads the resolved one).
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
  stands: Pass 37's role profiles (C5.6) are where such a gate would be configured per org rather
  than hardcoded per route, but that pass added no money-read permission, and Pass 39 (C5.8) listed
  the money reads under C5.10 - the decision is per route, the owner's.
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
  `requestAppointmentCancelOrReschedule` - since Pass 27 that fourth writer is
  `dispositionAppointment`, and since Pass 26 all four insert through `insertOpportunityTx`)
  spread `opportunityTaxonomyColumns()` into their
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
  dispositions precedent - this list and the dispositions were open to every role until Pass 39 (C5.8) made both MANAGE_SETTINGS - and the Settings
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
- **Not built:** auto-assignment rules and zones (C4.1b - built as Pass 26), a category on the location
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
                                               //   ungated like every appointment write (who may cancel: no permission yet - listed under C5.10, per route)
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
  permission on the disposition (none yet - listed under C5.10; Pass 37's profiles would hold one), un-cancelling from the sheet, assignment rules and zones
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

**Shipped in Pass 19** (`feature/phase-3-tech-ticket-money-instructions`, 2026-09-25) — the C3.3
row as built, plus what it found.

```ts
// shared/visit-billing.ts
export interface VisitBillingDraft { serviceId: string; priceCents: number; applied: boolean; note: string | null }
VisitBillingSummary.draft: VisitBillingDraft | null   // the draft the read was asked to price, or null when it carried none

// server/storage.ts
export class VisitBillingDraftError extends Error { status: 400; code: string }   // -> { code, message }; the TicketEditError shape
export interface VisitBillingDraftInput { serviceId: string; priceCents: number; actorRole: UserRole | string }
getVisitBillingSummary(appointmentId, draft?)   // as before, plus: the draft's service must be on the visit's billing (400
                                                // DRAFT_SERVICE_NOT_ON_VISIT, a CANCELLED service included); an agreement-
                                                // generated service (agreementId, or source AGREEMENT_GENERATED) is re-priced
                                                // only for can(actorRole, ADJUST_PRICE_AGREEMENT) - otherwise applied: false,
                                                // the note naming "manager or admin"; an ISSUED invoice -> applied: false, the
                                                // note naming the invoice. Applied: that service goes to
                                                // resolveServiceLineBillingTx as { ...service, priceCents: draft.priceCents }
                                                // and resolveTaxDecision prices its amount exactly as before; a covered plan
                                                // stays $0 and the note says so. Nothing written, no audit row.

// Routes
GET /api/appointments/:id/billing-summary?serviceId=&priceCents=   // the open read as before; both params or neither (400);
                                                // priceCents digits only and a safe integer (400 otherwise - "" is not $0);
                                                // actorRole = the session's; 400 { code, message } from VisitBillingDraftError

// client/src/components/visit-billing-summary.tsx
export interface VisitBillingDraftPrice { serviceId: string; priceCents: number }
visitBillingSummaryQueryKey(appointmentId, draft?)   // ["/api/appointments", id, "billing-summary?serviceId=..&priceCents=.."]
useVisitBillingSummary(appointmentId, draft?)        // placeholderData keeps the SAME visit's previous figures while a new
                                                     // draft's read is in flight; another visit's are never shown
ServiceBillingBlock                                  // full mode prints the draft caption for its service (text-service-draft-price-<id>)

// client/src/components/collect-payment-dialog.tsx
draftPrice?: VisitBillingDraftPrice | null           // read with the summary, so the default amount is the draft's due today

// client/src/components/billing-plan-pill.tsx
useBillingPlanById(enabled = true)                   // the dialog reads the plans only for an open agreement ticket

// client/src/components/service-completion-dialog.tsx
locationNotes                                        // GET /api/notes/location/:locationId under the customer screen's query key -
                                                     // the canonical LOCATION-scope customer_notes rows; locations.notes is the
                                                     // legacy column and is not read
committedPrice / commitPrice()                       // onBlur of the price box (input-ticket-price): dollars.cents, and the
                                                     // value the draft derives from
draftPrice                                           // serviceOverridePayload's rule: allowServiceOverride, != service.priceCents,
                                                     // and for an agreement service != computedProductionValueCents; else null
instructions                                         // [Agreement instructions, Service notes, Location notes] minus the empty
                                                     // ones (block-ticket-instructions), between the header card and the
                                                     // technician / date grid; location notes pinned first, newest first, one
                                                     // paragraph each
<BillingPlanPill>                                    // under the mode badge once `agreement` and the plans have loaded

// client/src/pages/technician-work.tsx
selectedVisit / detailVisit                          // the clicked snapshot, and the live row from `visits` by appointment id
detailLocationNotes                                  // the sheet's Location Notes block, from the same notes read (it read
                                                     // locations.notes before - blank everywhere)
openTicket(service, appointment)                     // no timeInAt -> the prompt; otherwise opens the ticket
openTicketWithoutTimeIn() / timeInAndOpenTicket()    // the prompt's two buttons (button-time-in-prompt-skip / -yes); Yes posts
                                                     // POST /api/appointments/:id/time-in through timeInMutation.mutateAsync
                                                     // (refreshWork runs on success) and opens on the returned appointment
```

Behavior worth knowing before the next pass touches it:
- **Ignored, not refused.** A technician's (or support's) draft on an agreement-generated service
  answers 200 with the stored figures and `draft.applied: false`. The read is a preview of what
  Post will produce, and `completeService` ignores that price too; a 403 would blank the ticket's
  billing block for a case the dialog never sends (its price box is read-only for that user). The
  office edit's PATCH keeps its 403 - a write is a different question.
- **The draft is the Service's price and nothing more.** No arithmetic in the route or the client:
  the resolver's own branches decide what the draft means, which is why a covered plan stays $0
  (as it does at Post) and why a plan the run does not bill prices the draft over the derived
  amount exactly as a stamped price would.
- **The dialog's draft rule is the post's rule**, deliberately - a manual service whose box still
  shows the stored price sends nothing (the figures are the stored figures, as before this pass),
  and an agreement service at the computed default sends nothing because the post would leave it
  unstamped; so the first render of every ticket is unchanged and the caption appears only when
  the technician has changed the price.
- **Both modes re-price.** The header block is shared, so the office-edit mode's price box drives
  the figures the same way (server-side, under the same rule); its save (Pass 18) is untouched. On
  an invoiced visit the read says the figures are the invoice's.
- **The prompt is the technician view's.** It sits in front of the ticket's open, where Time In
  means something, and never in the dialog: the office-edit mode and the Services tab's office
  post never ask. The rule is the sheet's own (`!appointment.timeInAt`, whatever the status).
- **Location notes are `customer_notes`, not `locations.notes`.** The owner's live test of
  2026-09-26 found no location notes anywhere on the tech view: the sheet (since before this pass)
  and the first cut of the instructions block read the transitional legacy column, empty on all 14
  dev locations, while the notes written on the customer screen are LOCATION-scope
  `customer_notes` rows. Both surfaces now read `GET /api/notes/location/:locationId` under the
  customer screen's query key; the `location` prop and the customer-locations fallback are gone.
- **Verified 2026-09-25, re-run 2026-09-26 with the location-notes fix** (PORT=5001): `npm run
  check` clean; boot 1 printed only the serving line with all 44 table counts unchanged (no
  migration); 52 API / SQL assertions on boot 1 as the four
  roles - a fixture customer and location, a manual service at $150.00 and an agreement-generated
  service on the COD (Per Service) plan ($400 over 4 visits) placed on one appointment through
  `POST /api/appointments` and `PATCH /api/services/:id`; the plain read (both lines, tax = the
  org's default 8.25% rate rounded per line, `draft: null`); the technician's draft on the manual
  service ($250.00 -> price, tax and due today follow, the other line untouched, totals follow,
  the stored price still 15000, no audit row, `applied: true`), a $0 draft, support's draft
  applying too; the technician's and support's draft on the agreement service ignored with the
  "manager or admin" note, the manager's and admin's applied ($999.00 + tax), stored prices
  unchanged (null, 15000) and no audit row after every read; a pinned LOCATION-scope note on the
  fixture location returned by `GET /api/notes/location/:id` to the technician while
  `locations.notes` is empty; a serviceId not on the visit 400

  `DRAFT_SERVICE_NOT_ON_VISIT`, one param without the other 400, priceCents abc / 1.5 / -1 / ""
  400, an unknown appointment 404, no session 401; the time-in route stamping once (a second
  call keeps the first `timeInAt`, status IN_PROGRESS); then both tickets posted by the technician
  and finalized by support, the invoice generated by the manager, and the manager's draft on the
  invoiced visit ignored with the invoice number in the note, the line the invoice's; every
  fixture (invoice, line items, billing events, production entries included) deleted and every
  table count back at the run's start (`session` up by the four logins); boot 2 printed only the
  serving line with every count unchanged; Vite 200 on the five touched client modules and
  `shared/visit-billing.ts` with the new symbols in the transforms. **Nothing was rendered in a
  browser** - the repo has no browser automation and this session had no browser - so the
  re-pricing on blur, the dollars.cents formatting, the draft caption, the instructions block, the
  pill, the time-in prompt and the live sheet reach the owner first.

**Shipped in Pass 20** (`feature/phase-3-material-units-areas`, 2026-09-26) — the C3.4a row as
built, plus what it decided.

```ts
// shared/material-lists.ts (new)
MATERIAL_UNITS_SETTING_KEY = "material_units"; APPLICATION_AREAS_SETTING_KEY = "application_areas"
DEFAULT_MATERIAL_UNITS = ["oz", "fl oz", "gal", "lb", "g", "mL", "L", "each"]
DEFAULT_APPLICATION_AREAS = ["Exterior", "Exterior Perimeter", "Interior", "Interior Baseboards", "Kitchen",
                             "Bathrooms", "Garage", "Attic", "Crawl Space", "Yard"]
sanitizeMaterialList(values)                  // trimmed, empties dropped, deduped case-insensitively (the first spelling wins)
normalizeMaterialUnits(v) / normalizeApplicationAreas(v)   // the stored row as a list; no row or nothing usable -> the defaults
matchListEntry(list, v) / isOnList(list, v)   // the list's spelling of a case-insensitive match, or null
toListSpelling(list, v) / toListSpellings(list, vs)        // the list's spelling when matched, the value kept (trimmed) otherwise
applicationAreasOf(row)                       // row.applicationAreas, else [row.applicationLocation], else []
deriveAreasServiced(rows)                     // the union of every row's areas in row order joined ", ", or null
formatApplicationAreas(row)                   // the row's areas joined ", ", or null

// shared/schema.ts
productApplications.applicationAreas: text[]  // beside applicationLocation (TRANSITIONAL, dev rule 4: written as the first area)

// server/service-scheduling-bootstrap.ts
bootstrapMaterialVocabulary()                 // guarded on the application_areas column: copies each application_location in as a
                                              // one-element array; rewrites material_products.default_unit and product_applications.unit
                                              // in the org's unit list's spelling where the match is case-insensitive, the per-row effect
                                              // printed; a unit no list names is reported and left as written

// server/storage.ts
interface MaterialVocabulary { units: string[]; areas: string[] }
readMaterialVocabularyTx(tx)                  // the two app_settings rows (the defaults when absent), read inside the post / edit tx
getMaterialUnits() / setMaterialUnits(units) / getApplicationAreas() / setApplicationAreas(areas)   // one row each, upsert on (org_id, key)
normalizeProductApplicationInputs(list, vocabulary)   // + unit -> the list's spelling; applicationAreas = applicationAreasOf(row) in the
                                              // list's spelling, deduped, null when none; applicationLocation = areas[0] ?? null
PRODUCT_APPLICATION_SNAPSHOT_FIELDS           // + "applicationAreas" (the ticket_edited diff's shape)
completeService / updateServiceRecordContent  // areasServiced = deriveAreasServiced(rows) ?? the body's text when materials are sent;
                                              // the content edit it always was when the body carries none
normalizeMaterialProductInput(data)           // defaultUnit / allowedApplicationAreas / defaultApplicationArea -> the lists' spelling, off-list kept
createProductApplication(data)                // the legacy route's row goes through the same normalizer

// Routes
GET   /api/settings/material-units            // open -> { units }
PATCH /api/settings/material-units            // MANAGE_SETTINGS; { units: string[] } (min 1) -> { units } sanitized
GET   /api/settings/application-areas         // open -> { areas }
PATCH /api/settings/application-areas         // MANAGE_SETTINGS; { areas: string[] } (min 1) -> { areas } sanitized
POST / PATCH /api/material-products           // shape and gating unchanged (none); values written in the lists' spelling

// client/src/components/list-multi-select.tsx (new)
<ListMultiSelect options value onChange placeholder searchPlaceholder offListCaption disabled testId />
                                              // Popover + Command (search) + toggles, selected values as chips; a value off the list is a
                                              // chip marked with offListCaption, removable, never dropped

// client/src/components/service-completion-dialog.tsx
MaterialLine.applicationAreas: string[]       // replaces applicationLocation on the line; materialFromDraft() migrates an older local draft
Unit                                          // a Select over the org's units (select-material-unit-<i>); an off-list unit is an extra option
Application Areas                             // a ListMultiSelect over the product's allowed areas, else the org's list (multiselect-material-areas-<i>)
materialsPayload()                            // sends applicationAreas, never applicationLocation; neither body sends areasServiced any more

// client/src/pages/settings.tsx
Material Units / Application Areas cards      // a textarea one entry per line, disabled (not hidden) for anyone but an admin; above Material Products
MaterialProductForm({ units, areas })         // Default Unit a Select over the units; Allowed Areas a ListMultiSelect over the areas;
                                              // Default Area a Select over the product's allowed areas (the org's list when it has none)
```

Behavior worth knowing before the next pass touches it:
- **Off the list: kept and marked, never refused.** A material row is the compliance record of
  what the technician did; a refusal at post time would block a ticket from the field over
  vocabulary the technician cannot edit, and 8 of the dev DB's 45 rows carry free-text areas no
  list names ("Exterior perimeter, 3ft up/3ft out", "(1) Roof, (1) Attic", ...). The Selects
  offer such a value as an extra option labelled "(not on the unit list)", the multi-selects show
  it as an outlined chip with the caption; the read surfaces print what was recorded.
- **Casing converges without a refusal.** A value matching a list entry apart from casing or
  whitespace is written in the list's spelling (Each -> each, GARAGE -> Garage) by the migration
  once and by every post, office edit and product save after it; a re-save that differs only in
  casing changes nothing and writes no `ticket_edited` row. The lists themselves dedupe
  case-insensitively (the first spelling wins), so the rule is never ambiguous.
- **Areas serviced is the server's derivation.** Whenever a post or an office edit sends
  materials, `areasServiced` is the union of every row's areas in row order; the body's own text
  counts only when no row names an area, and a content edit without materials keeps the field as
  sent. The dialog stopped computing it (B13: one rule in the route, so a native client gets the
  same answer). The `areasServiced` field stays in both bodies for the no-materials case.
- **The lists are not seeded.** No `app_settings` row exists until Settings saves one; the defaults
  read until then (the Pass 17 shape). The smoke test's cleanup deleted the two rows it created,
  so the dev org still reads the defaults.
- **`applicationLocation` is transitional (dev rule 4).** Storage writes it as the first area, the
  seed writes both, and only surfaces from before the list read it. C3.4b decides its fate.
- **The migration ran against the shared dev DB during this pass's verification** (boot 1 on
  PORT=5001 against the same Docker database), so the owner's `npm run dev:full` restart prints
  nothing for Pass 20. What it did: 44 of 45 `product_applications` got their location copied in
  (the one row with no location stays null); `Live Trap`'s `default_unit` and its 3 application
  rows went `Each` -> `each`; every other unit (each x6, gal x27, 9 null) already matched.
- **Verified 2026-09-26** (PORT=5001): `npm run check` clean; boot 1 printed the migration's
  per-row effect (above) with all 44 table counts unchanged; 52 API / SQL assertions as the four
  roles - both lists' GET open (401 without a session) and answering the defaults, PATCH 403 for
  technician / support / manager and 400 on `[]` and `[""]`, the admin's save trimmed and deduped
  case-insensitively with the GET reflecting it and two `app_settings` rows created; a fixture
  product through `POST /api/material-products` (GAL -> gal; ["exterior perimeter", "Garage",
  "Eaves", " garage "] -> ["Exterior Perimeter", "Garage", "Eaves"]; GARAGE -> Garage; a PATCH to
  "quart" kept off-list, to "Bucket" respelled "bucket"); a ticket posted through
  `POST /api/services/:id/complete` with four material rows - a list unit respelled, a body
  naming only `applicationLocation` read as one area, an off-list unit kept, a nameless row
  dropped - answering `areasServiced` "Exterior Perimeter, Garage, Attic, Kitchen window sill"
  with the body's own text ignored and every `applicationLocation` the row's first area; the
  technician's PATCH 403; support's replace-all -> `areasServiced` "Yard" and one `ticket_edited`
  row whose before carries the three rows' `applicationAreas` and whose after carries ["Yard"];
  the same rows re-sent in other casing writing nothing; a content edit without materials keeping
  its text; rows without areas -> null, or the body's text; the legacy
  `POST /api/product-applications` carrying `applicationAreas` and the respelled unit; every
  fixture deleted and every count back at the post-boot baseline (`session` +4 per run); boot 2
  printed only the serving line with every count unchanged; Vite 200 with the new symbols on the
  six touched client modules and `shared/material-lists.ts`. **Nothing was rendered in a browser**
  - the repo has no browser automation and this session had no browser - so the Unit Select, the
  two multi-selects, the product form's three pickers and the two Settings cards reach the owner
  first.
- **Known follow-up.** The Service History page's pre-Phase-1 "New Service Record" form
  (`services.tsx`, its own `POST /api/service-records`) still takes Areas Serviced and each
  product's Application Location as free text; its product rows now go through the same
  normalizer, but its `areasServiced` is typed, not derived. Untouched here (scope); it is the one
  surface left with a freeform area field. The material-products routes stay ungated, as before.

**Shipped in Pass 21** (`feature/phase-3-target-pests-two-levels`, 2026-09-27) — the C3.4b row as
built, plus what it decided.

```ts
// shared/material-lists.ts
interface MaterialRowPests { targetPests?: readonly string[] | null }
targetPestsOf(row)                            // the row's pests trimmed, empties dropped, order kept
deriveTicketTargetPests(list, selected, rows) // the ticket's set: the picks first in the order picked, then every row's pests in row order,
                                              // each in the list's spelling (toListSpellings), deduped case-insensitively - storage stores it,
                                              // the dialog shows it
formatTargetPests(row)                        // the row's pests joined ", ", or null
MaterialRowAreas.applicationLocation          // kept as an optional INPUT field for the dialog's pre-Pass-20 local drafts only; the column is gone

// shared/schema.ts
productApplications.targetPests: text[]       // beside applicationAreas; applicationLocation REMOVED (the column dropped)
serviceRecords.targetPests                    // documented as the derived union

// server/service-scheduling-bootstrap.ts
bootstrapMaterialTargetPests()                // after the target_pests seed: ADD COLUMN target_pests text[] (guarded, printed once, no backfill -
                                              // no row carried a pest); then, guarded on the column's presence, copies any row's
                                              // application_location into an empty application_areas (0 on the dev DB) and DROPs
                                              // application_location, printed once

// server/storage.ts
interface MaterialVocabulary { units; areas; pests }   // + pests: the org's active target_pests labels in sort order
readMaterialVocabularyTx(tx)                  // + a select on target_pests (active) in the same transaction as the settings rows
normalizeProductApplicationInputs(list, vocabulary)   // + targetPests in the list's spelling, deduped, null when none; applicationLocation gone
deriveStoredTargetPests(list, selected, rows) // deriveTicketTargetPests; an empty union keeps the picks' own shape (null -> null, [] -> [])
PRODUCT_APPLICATION_SNAPSHOT_FIELDS           // "applicationLocation" -> "targetPests" (the ticket_edited diff's shape)
completeService                               // targetPests = deriveStoredTargetPests(pests, body.targetPests, the normalized rows)
updateServiceRecord                           // targetPests = deriveStoredTargetPests(pests, body.targetPests ?? the stored set,
                                              //   the rows sent ?? the existing rows); the vocabulary read once at the top of the edit
createProductApplication(data)                // the legacy route, now in a transaction: the row's pests spelled and folded into its ticket's set

// Routes (bodies; no new route)
POST /api/services/:id/complete               // each productApplications[] row accepts targetPests: string[] - drizzle-zod picked the column
PATCH /api/service-records/:id                //   up with no schema edit (confirmed); applicationLocation is stripped from a body (not a column)
POST /api/product-applications                // same

// server/seed.ts                             // the four seed rows carry targetPests instead of applicationLocation

// client/src/components/service-completion-dialog.tsx
MaterialLine.targetPests: string[]            // materialFromDraft() reads an older draft as []; materialFromApplication() reads the row
targetPests (state): string[]                 // the picks (was a comma-joined string; an older local draft's string is split on restore);
                                              //   an office edit seeds it from the stored set whole
ticketTargetPests                             // deriveTicketTargetPests(targetPestOptions, targetPests, materials) - the header's summary line
                                              //   (text-ticket-target-pests, under the service type, both modes, absent when empty) and the
                                              //   caption under the ticket-level control naming the pests that come from materials alone
Target Pests (ticket level)                   // a ListMultiSelect at the top of the Materials section (multiselect-ticket-target-pests); the
                                              //   pill toggles, their search box and toggleTargetPest are gone; both bodies send the array
Target Pests (per row)                        // a ListMultiSelect per material row (multiselect-material-pests-<i>, offListCaption "not on the
                                              //   pest list"); the collapsed summary prints "for <pests>"
materialsPayload()                            // sends targetPests per row

// client/src/pages/service-ticket-review.tsx / customer-detail.tsx / services.tsx
                                              // each material line prints the row's pests (formatTargetPests); the review modal's Target Pests
                                              //   line (the stored union) gains the caption "The ticket's picks plus every material's pests.";
                                              //   the customer screen's ticket card prints Target Pests; the Service History legacy form's
                                              //   product row sends applicationAreas: [applicationArea] (label "Application Area")
```

Behavior worth knowing before the next pass touches it:
- **The set is derived on the server, and only the union is stored.** Whenever a ticket is posted
  or edited, `service_records.targetPests` = the picks ∪ every row's pests, in that order, deduped
  case-insensitively, each in the pest list's spelling. The picks are the body's `targetPests`, or
  the stored set when the body omits them; the rows are the body's when materials are sent, the
  existing rows otherwise - so a content edit without materials still names every row's pest. The
  dialog computes the same union with the same shared function for its summary line (B13: one
  rule, so a native client gets the same answer from the read).
- **A pick is never silently dropped.** There is no second column for "selected": on an office
  edit the stored set seeds the ticket-level control whole, so a pest that came in through a
  material stays a pick until someone removes it from the control. Removing a material's pest
  therefore never removes it from the ticket by itself; sending explicit picks replaces the picks
  and keeps the rows' pests (`{Fleas}` + a Termites row -> `{Fleas,Termites}`).
- **Off the list: kept and marked, never refused** (Pass 20's rule). "Crickets" on a ticket from
  before the list and "Squirrels" or "raccoons" on a row stay as written (trimmed) and show as
  outlined chips; a value matching an active pest apart from casing or whitespace is written in
  the list's spelling ("roaches" -> "Roaches"), and a re-save that differs only in casing writes
  no `ticket_edited` row. The list is the table's **active** rows, in sort order - the same list
  `GET /api/target-pests` offers the dialog; a deactivated pest already on a ticket is therefore
  kept and marked, not respelled.
- **An empty union keeps the picks' shape.** Picks `[]` with no row pests store `{}`; picks `null`
  store `NULL` - what the two bodies stored before this pass, so nothing rewrites a ticket that
  did not change.
- **`applicationLocation` is gone.** Decided here (the C3.4b row): every reader already went
  through `applicationAreasOf()` / `formatApplicationAreas()`, every writer wrote
  `applicationAreas`, no dev-DB row had a location without areas, and the client has no service
  worker, so no cached client can still send the field. The bootstrap drops the column after a
  safety copy; the field left the row's API shape with it (drizzle-zod strips it from a body, so
  the Service History legacy form now sends `applicationAreas`); the snapshot shape carries
  `targetPests` in its place; the one reader left of the name is the dialog's restore of a local
  draft saved before Pass 20.
- **The migration did NOT run against the shared dev DB.** A column drop breaks any server still
  running the previous code against the same database (drizzle selects columns by name), so this
  pass's verification ran against a copy (`pestflow_verify`, restored from a fresh dump, dropped
  afterwards - the recipe is in `DEV_NOTES.md`). The owner's `npm run dev:full` restart runs both
  steps on the shared DB and prints them: 45 rows gain `target_pests` with nothing backfilled;
  `application_location` is dropped with 0 rows copied first.
- **Verified 2026-09-27** (PORT=5001, against the copy): `npm run check` clean; boot 1 printed the
  two Pass 21 lines with all 44 table counts unchanged; 36 API / SQL assertions as the four roles -
  `GET /api/target-pests` 401 without a session, 200 and the same list for technician and admin;
  a ticket posted through `POST /api/services/:id/complete` as the technician with picks
  `["roaches", " Ants ", "Crickets"]` and rows Demand CS `["ants", " Spiders "]`, Advion Ant Gel
  `["Rodents", "Squirrels", "ANTS"]` and a nameless row -> the stored set
  `{Roaches,Ants,Crickets,Spiders,Rodents,Squirrels}`, the rows `{Ants,Spiders}` and
  `{Rodents,Squirrels,Ants}`, `areasServiced` "Garage, Kitchen", no `applicationLocation` in the
  response and no such column; `GET /api/service-records/:id` as manager and
  `GET /api/product-applications` as admin reading them back; the technician's PATCH 403;
  support's replace-all with one Termites row and no picks -> the set kept every pick and gained
  Termites, one `ticket_edited` row whose before carries the two rows' `targetPests` and the old
  set and whose after carries `["Termites"]` and the new set, neither snapshot naming
  `applicationLocation`; explicit picks `["fleas"]` with the same row -> `{Fleas,Termites}`; a
  content edit `["ticks"]` without materials -> `{Ticks,Termites}`; `["TICKS"]` again -> unchanged
  and no audit row; picks `[]` with a row naming Squirrels and raccoons -> both kept as written; an
  empty union storing `{}` for `[]` and `NULL` for `null`; the legacy `POST /api/product-applications`
  with `["bed bugs", "Moths"]` -> `{Bed Bugs,Moths}` on the row and on the ticket; a legacy body
  naming only `applicationLocation` -> 201 with `applicationAreas` null; every fixture deleted and
  every count back at the post-boot baseline (`session` +4); boot 2 printed only the serving line
  with every count unchanged; Vite 200 with the new symbols on the four touched client modules,
  `shared/material-lists.ts` and the untouched `list-multi-select.tsx`. **Nothing was rendered in
  a browser** - the repo has no browser automation and this session had no browser - so the two
  multi-selects, the summary line and the material lines' pest captions reach the owner first.
- **Known follow-up.** The Service History page's legacy "New Service Record" form still types the
  ticket's target pests comma-separated into its own `POST /api/service-records`, which stores
  them as typed (not respelled; its product rows do go through the normalizer and fold their
  pests into the set). The dialog's `FALLBACK_TARGET_PEST_OPTIONS` still stands in for an org with
  no configured pests. The target-pests routes stay ungated, as before.

---

**Shipped in Pass 22** (`feature/phase-3-service-report-document`, 2026-09-27) — the C3.5 row as
built, plus what it decided.

```ts
// shared/service-report.ts
ATTACH_SERVICE_REPORT_SETTING_KEY = "attach_service_report_to_invoices"   // one app_settings row, "true" / "false"; DEFAULT_ATTACH_SERVICE_REPORT = false
normalizeAttachServiceReport(value) / serializeAttachServiceReport(enabled)
interface ServiceReportInfo { id; serviceRecordId; contentHash; mimeType; createdAt; fileName }   // what GET .../report-info answers
serviceReportDay(serviceDate)                    // the UTC day, YYYY-MM-DD - what the report prints and pins its dates to
fileNameSlug(text, fallback)                     // lower-case letters and digits, hyphens between words, at most 40 characters
serviceReportFileName({ serviceDate, locationName })   // service-report-<day>-<location>.pdf: the route's name and the Download button's

// shared/schema.ts
documents.kind                                   // INVOICE | STATEMENT | SERVICE_REPORT
documents.serviceRecordId                        // a SERVICE_REPORT row's identity (FK service_records); null on every other kind

// server/document-bootstrap.ts
bootstrapDocuments()                             // + ADD COLUMN service_record_id (guarded on the column, printed once) and the partial unique index
                                                 //   documents_service_record_id_uidx (service_record_id) WHERE kind = 'SERVICE_REPORT'

// server/documents/types.ts
interface ServiceReportMaterialLine { productName; epaRegNumber; amountApplied; unit; dilutionLabel; dilutionRate; applicationMethod; device;
                                      applicationAreas: string[]; targetPests: string[] }
interface ServiceReportDocumentContext { serviceDate; preview; customerName; serviceLocation; serviceTypeName; technicianName; technicianLicenseNumber;
                                         targetPests; areasServiced; materials; notes; conditionsFound; recommendations; followUpRequired;
                                         followUpNotes; customerSignature; branding }
InvoiceDocumentContext.attachedServiceReports?   // the reports appended after the invoice's own pages; undefined = nothing appended

// server/documents/service-report-pdf.ts
drawServiceReport(doc, context)                  // draws the report into a pdfkit document the caller owns, from the top of its current page,
                                                 //   paginating (the statement renderer's local helpers: drawTable / paragraph / sectionHeading / partyBlock)
renderServiceReportPdf(context): Promise<Buffer> // a document of its own; CreationDate / ModDate pinned to the service date, byte-deterministic

// server/documents/invoice-pdf.ts
renderInvoicePdf(context)                        // unchanged layout; after its pages, for each attachedServiceReports[] entry: addPage() + drawServiceReport()

// server/storage.ts
getAttachServiceReportToInvoices() / setAttachServiceReportToInvoices(enabled)   // the toggle: upsert on (org_id, key); readAttachServiceReportTx(reader)
interface ServiceReportDocumentResult { document: Document; fileName }
interface ServiceReportPreviewInput { serviceId; appointmentId?; technicianId?; serviceDate: Date; serviceTypeId?; notes?; targetPests?; areasServiced?;
                                      conditionsFound?; recommendations?; followUpRequired?; followUpNotes?; customerSignature?; productApplications? }
interface ServiceReportPreviewResult { pdf: Buffer; fileName }
getServiceReportDocumentContext(recordId)        // the ticket as it stands: the snapshot technician (the live profile only for a pre-snapshot row), the
                                                 //   stored pest union, the rows, customer / service location / service type, documentBrandingOf(org)
getOrCreateServiceReportDocument(recordId)       // the stored SERVICE_REPORT row if any, else render / sha256 / insert (customer_id and location_id set),
                                                 //   23505 race recovery; answers the row and its file name
renderServiceReportPreview(input)                // render-only: normalizeProductApplicationInputs + deriveStoredTargetPests + deriveAreasServiced +
                                                 //   resolveServiceRecordTechnicianSnapshot exactly as a post; preview: true; nothing written
invalidateServiceReportTx(tx, recordId)          // deletes the stored row; called by updateServiceRecord (when the ticket or its materials changed),
                                                 //   completeService (a re-post over an existing record) and createProductApplication (the legacy route)
getInvoiceDocumentContext(invoiceId)             // + attachedServiceReports: with the toggle on and invoice.appointmentId set, the context of each distinct
                                                 //   non-null line serviceRecordId in line order; undefined otherwise. A DRAFT preview follows the same rule.

// Routes
GET   /api/service-records/:id/report            // session; inline PDF, ?download=1 for an attachment, filename service-report-<day>-<location>.pdf; 404 unknown
GET   /api/service-records/:id/report-info       // session; the row without contentBase64, plus fileName
POST  /api/service-records/preview-report        // session, any role; completeServiceSchema + serviceId -> the PDF, stored nowhere; 400 no serviceId, 404 unknown
GET   /api/settings/attach-service-report        // open; { enabled }
PATCH /api/settings/attach-service-report        // MANAGE_SETTINGS; { enabled: boolean } -> { enabled }; 400 on a non-boolean

// client/src/components/service-report-actions.tsx
serviceReportUrl(record, download?)              // /api/service-records/:id/report[?download=1]
ServiceReportActions({ record, locationName?, compact? })   // "Service Report" (window.open, inline) + Download (<a download> named by serviceReportFileName);
                                                 //   testids button-open-service-report-<id> / button-download-service-report-<id>
openServiceReportPreviewWindow()                 // window.open("", "_blank") in the click handler, a "Rendering..." placeholder written into it
showServiceReportPreview(body, target)           // POST the preview, blob -> target.location.href (an <a download> when the tab was blocked); revoked after 60 s

// client/src/pages/service-ticket-review.tsx    // ServiceReportActions beside Open Location on the modal footer's left
// client/src/pages/customer-detail.tsx          // ServiceDetailModal's action row: ServiceReportActions before Reopen / Finalize; locationName threaded
                                                 //   from the page (activeLocation) through ServicesTab
// client/src/components/collect-payment-dialog.tsx   // props onPreviewReport / previewingReport; "Preview report" (button-preview-service-report) on the
                                                      //   footer's left, Back / Post Service Ticket on the right
// client/src/components/service-completion-dialog.tsx // previewReportMutation(target): the post's content -> showServiceReportPreview; the tab is opened
                                                       //   in the click handler (openServiceReportPreviewWindow()) and handed to the mutation
// client/src/pages/settings.tsx                 // the "Service Report" card (card-service-report): a Switch (switch-attach-service-report) disabled for
                                                 //   anyone but an admin, the "already rendered keeps what it rendered" caption
```

Behavior worth knowing before the next pass touches it:
- **Stored on first request, retired on a content write.** The report is the ticket as it
  stands, never a history: a re-post, an office edit that changed the ticket or its materials,
  and a material row added by the legacy `POST /api/product-applications` each delete the
  stored row in the same transaction as their write, so the next Open renders afresh (a new
  `contentHash`, still one row). A no-op edit, finalize and reopen write no content and keep the
  row. The audit log (`ticket_edited`) is the history of what changed.
- **The attach rule is read at the invoice's first render and frozen with it.** An INVOICE
  document is never re-rendered (Pass 10), so a visit invoice PDF rendered while the toggle was
  on keeps its reports even after those tickets are edited or the toggle is turned off, and one
  rendered while it was off never gains them - the Settings card says so. A DRAFT preview is
  re-rendered on every open and follows the toggle as it stands. An invoice with no
  `appointmentId` (schedule-driven, manual, the standalone initial charge) appends nothing
  whatever the toggle says.
- **Inside one pdfkit document, not a merge.** The report's renderer exposes
  `drawServiceReport(doc, context)`; the invoice renderer calls it after `addPage()` per
  attached report. pdfkit cannot embed another PDF's pages, so the alternative was a new
  dependency (pdf-lib) to merge stored bytes; drawing from the context keeps the repo on one
  PDF library and keeps the invoice's own layout untouched. The layout helpers are local to the
  file, as they are in `statement-pdf.ts` - three renderers now carry a copy each.
- **Dates are UTC days**, as every document here prints them (`serviceReportDay`); a late-evening
  service in a US timezone prints the next day, exactly as the invoice's issue date does. An
  org-level timezone would fix every document at once; it is a known follow-up, not this pass's.
- **The technician is the snapshot.** The name and license come from the ticket's
  `technicianName` / `technicianLicenseNumber` (copied at post, canon §12); only a row from
  before the snapshot existed (neither set, a `technicianId`) reads the live profile, as the
  review queue does. The preview resolves them exactly as a post will
  (`resolveServiceRecordTechnicianSnapshot`: the body's technician, else the service's, else the
  appointment's).
- **The preview is render-only and any role's.** It prints "PREVIEW - not yet posted" in the
  header and "as drafted by the technician; the posted ticket is the record" in the footer; the
  body's service type is printed as sent (the post applies it only under its override rule, but
  nothing is written here). The tab is opened synchronously in the click handler so a browser's
  popup rule sees the gesture; a blocked tab falls back to a download of the same bytes.
- **Determinism holds.** Same context, same bytes: the standalone render of one context twice
  gave one hash; the stored row answers the same `contentHash` on every later GET; the invoice
  document with reports is stored once and re-served.
- **Verified 2026-09-27** (PORT=5001, the shared dev DB - an additive migration, safe under the
  owner's server on 5000): `npm run check` clean; a standalone render (deterministic, one page;
  40 material rows and a long note paginate to four; an invoice with two reports is three pages,
  alone one); boot 1 printed the Pass 22 line once with all 44 table counts unchanged; 133 API /
  SQL assertions as the four roles - a ticket posted through `POST /api/services/:id/complete`
  with picks `["roaches"]` and two rows (Demand CS: Exterior Perimeter + Garage, ants + Spiders;
  Contrac Blox: Attic, Rodents) -> `GET .../report` 401 without a session, 200 as the technician
  with `inline; filename="service-report-2026-09-27-pass22-smoke-house.pdf"`, one page whose text
  prints the org and letterhead, the customer, the location and address, "John Doe", "License #
  0123456", "Service date: 2026-09-27", "Service: General Pest Control", the union "Roaches, Ants,
  Spiders, Rodents", "Exterior Perimeter, Garage, Attic", "Required - 2 weeks", each row's
  product / EPA / amount + unit / dilution / method / device / areas / pests, the notes,
  conditions and recommendations, the signature line and "A customer signature was captured";
  one SERVICE_REPORT row with customer_id and location_id whose `content_hash` is the sha256 of
  the bytes served; `report-info` as manager answering it without bytes plus the file name; the
  same GET as support answering the same bytes with `?download=1` an attachment and no second
  row; 404 for an unknown ticket; the preview as the technician answering a PDF marked PREVIEW
  with its own date, notes, "Fleas, Ticks" and "No customer signature was captured", storing
  nothing, 401 / 400 / 404 for no session / no serviceId / an unknown service; a no-op office edit
  keeping the row, a real one retiring it and the next GET rendering the new notes under a new
  hash with one row; finalize keeping it; the toggle GET 200 `{ enabled: false }` as all four
  roles, PATCH 403 as technician / support / manager, 400 on a non-boolean, 200 as admin and a
  row written; a two-ticket visit (the Pass 19 recipe) invoiced through
  `generate-from-service-record` with the toggle on -> a 3-page invoice PDF carrying both
  reports after the invoice in line order, stored once and re-served, each ticket's own report
  still one page; a second visit's DRAFT preview 3 pages with the toggle on and 1 page with it
  off, unstored, then issued with it off -> the invoice alone, stored; a manual invoice 1 page
  with the toggle on and off; a reopen keeping the report and the re-post retiring it while the
  visit invoice's stored PDF kept its hash; the legacy material-row route retiring it; every
  fixture deleted, the settings row deleted (none existed), every count back at the run's start
  (`session` +4); boot 2 printed only the serving line with every count unchanged; Vite 200 with
  the new symbols on the six touched client modules and `shared/service-report.ts`. **Nothing was
  rendered in a browser** - the repo has no browser automation and this session had no browser -
  so the Open / Download pairs, the Preview button, the Switch card and the PDF's look reach the
  owner first.
- **Known follow-up.** An org-level timezone for the dates on every document; a shared layout
  module for the three renderers' local helpers when a fourth document arrives; `logoUrl` is
  still carried and drawn by no renderer; email delivery of the report is C6.3; the report of a
  REOPENED ticket is still served (its content stands until the technician re-posts, which
  retires it); a `text[]` row order in the materials table is the table's heap order, as every
  other reader of `product_applications` shows it.

---

**Shipped in Pass 23** (`feature/phase-3-field-surcharge-line`, 2026-09-27) — the C3.6 row as
built, plus what it decided.

```ts
// shared/field-surcharge.ts (new) - the line's vocabulary, invariants, gate and copy, read by the server and the client
DEFAULT_SURCHARGE_LABEL = "Cleanout surcharge"; MAX_SURCHARGE_LABEL_LENGTH = 60
SURCHARGE_CREDIT_RULE = "TRANSITIONAL_ALWAYS_CREDITS_POSTING_TECHNICIAN"   // development rule 4: the ledger write cites it until Phase 7's per-plan selector
interface SurchargeFields { surchargeCents: number | null; surchargeLabel: string | null }; NO_SURCHARGE
normalizeSurcharge({ surchargeCents?, surchargeLabel? })    // no / zero amount -> both null; a positive amount -> rounded, the label trimmed, capped and defaulted
surchargeChanged(before, after); surchargeOf(record)         // the gated-and-audited test; a row from before Pass 23 reads as none
resolveFieldSurchargeGate({ actorRole, isAgreementService, template, adding })   // null, or { code: "SURCHARGE_FORBIDDEN" | "SURCHARGE_NOT_ALLOWED", message }
describeSurcharge(record)                                    // "Cleanout surcharge $50.00" | null - the review modal, the Services tab
surchargeLineDescription(label, serviceTypeName, dateText)   // "<label> - <service type> - <date>" - the invoice line, the visit's charge, the batch preview

// shared/schema.ts
serviceRecords.surchargeCents / surchargeLabel               // nullable; the ticket's content
agreementTemplates.fieldSurchargeAllowed                     // boolean NOT NULL DEFAULT false - the allow / reject toggle
billingPlans.fieldAddableSurcharge                           // DROPPED; BillingPlanSnapshotFields / BillingPlanSnapshot / buildBillingPlanSnapshot lose the key (old snapshots keep it as history)

// shared/initial-charge.ts
INITIAL_CHARGE_TYPES = ["DOWN_PAYMENT"]                       // CLEANOUT_SURCHARGE / PREPAY_FULL gone: formatInitialChargeType's cases, initialChargeCountsTowardPrice's branch,
                                                             //   isTechnicianSoleInitialChargeCollector and isTechnicianCollectedCleanoutSurcharge deleted

// shared/audit.ts
AuditAction + "surcharge_recorded"                           // "Surcharge recorded": entity service_record, before / after { surchargeCents, surchargeLabel }

// shared/visit-billing.ts
type VisitChargeBilling = VisitInitialChargeBilling | VisitSurchargeBilling
                                                             // kind INITIAL_CHARGE (agreementId, agreementName) | SURCHARGE (serviceId, serviceRecordId, serviceTypeName, label); collectedBy null on a surcharge
visitChargeKey(charge); describeVisitChargeKind(charge)      // the agreement id | "surcharge-<serviceId>"; "down payment" | "surcharge"
interface VisitBillingDraft { serviceId; priceCents: number | null; applied; note; surchargeCents: number | null; surchargeApplied; surchargeNote }

// shared/batch-invoice.ts
interface BatchInvoicePreviewCharge { kind: "INITIAL_CHARGE" | "SURCHARGE"; agreementId | null; agreementName | null; ticketServiceRecordId | null; ... }; batchChargeKey(charge)

// server/storage.ts
CompleteServiceInput / UpdateServiceRecordInput / ServiceReportPreviewInput   // + surchargeCents?: number | null; surchargeLabel?: string | null
interface VisitBillingDraftInput { serviceId; priceCents?; surchargeCents?; actorRole }
resolveFieldSurchargeGateTx(tx, { actorRole, service, adding })   // loads the agreement's template; the post, the PATCH and the billing read all call it
completeService / updateServiceRecord                        // normalize -> gate (403 with the code, before any write) -> write the columns -> `surcharge_recorded` when it moved
createProductionValueEntriesForFinalizedRecord               // the main entry and the SURCHARGE entry checked independently; SURCHARGE = record.surchargeCents for the ticket's technician
buildVisitInvoiceLinesTx                                     // + one SURCHARGE line per ticket right after its service line; a tax snapshot entry { serviceRecordId, lineType: "SURCHARGE", ... }
getVisitBillingSummary                                       // un-invoiced: the draft's (gated) or the record's surcharge as a SURCHARGE charge, taxed like the service line;
                                                             //   invoiced: SURCHARGE lines paired by serviceRecordId / serviceId; the service's own line lookup skips SURCHARGE lines
getBatchInvoicePreviewForDateRange                           // + a SURCHARGE charge per finalized ticket of each visit, listed before the visit's down payment
serviceReportContextForRecordTx / renderServiceReportPreview  // + surchargeCents / surchargeLabel on the context

// server/routes.ts
completeServiceSchema / updateServiceRecordSchema (previewServiceReportSchema extends the former)   // surchargeCents: int >= 0 | null | absent; surchargeLabel: <= 60 chars | null | absent
GET  /api/appointments/:id/billing-summary?serviceId=&priceCents=&surchargeCents=   // serviceId with either or both; a fractional or orphaned param is a 400
POST /api/services/:id/complete                              // + 403 { code: "SURCHARGE_FORBIDDEN" | "SURCHARGE_NOT_ALLOWED", message }
PATCH /api/service-records/:id                               // the same two codes

// server/agreement-bootstrap.ts
bootstrapAgreements()                                        // + ADD COLUMN agreement_templates.field_surcharge_allowed (silent); one-shot keyed on billing_plans.field_addable_surcharge existing
                                                             //   (each template's default printed, then DROP COLUMN); one-shot clearing every CLEANOUT_SURCHARGE / PREPAY_FULL block
                                                             //   (printed per row, self-guarding); the Pass 5.5 one-shot's IN lists narrowed to DOWN_PAYMENT
// server/service-scheduling-bootstrap.ts
bootstrapServiceSchedulingFoundation()                       // + service_records.surcharge_cents / surcharge_label (guarded on the column, printed once, no backfill)

// server/documents/types.ts, service-report-pdf.ts
ServiceReportDocumentContext.surchargeCents / surchargeLabel  // the Service section prints a "Surcharge" row: "<label> - $X (in addition to the service, billed as its own line on the visit invoice)"

// client
service-completion-dialog.tsx        // Surcharge ($) + Surcharge Label (input-ticket-surcharge, input-ticket-surcharge-label, text-ticket-surcharge-note) under the price grid;
                                     //   surchargeGate = resolveFieldSurchargeGate over /api/agreement-templates (disabled with the reason; "Checking..." while loading);
                                     //   draft { serviceId, priceCents?, surchargeCents? }; surchargePayload() on the post, the PATCH and the report preview; the local draft saves both boxes
visit-billing-summary.tsx            // VisitBillingDraftPrice { serviceId; priceCents?; surchargeCents? }; charge rows keyed by visitChargeKey (row-visit-charge-<key>);
                                     //   ServiceBillingBlock shows the service's own surcharge (text-service-surcharge-<id>) and the draft echo (text-service-draft-surcharge-<id>);
                                     //   the reconciling line sums charges by kind; VisitInitialChargeCallout lists INITIAL_CHARGE charges only
settings.tsx                         // template form: checkbox-template-field-surcharge; template card: text-template-field-surcharge-<id>; the plan form's checkbox and caption gone
service-ticket-review.tsx            // "Surcharge: <label> $X - billed as its own line in addition to the service." (text-review-surcharge) under Billing Readiness
customer-detail.tsx                  // ServiceDetailModal: "Surcharge: <label> $X (in addition to the service)" (text-service-surcharge-<record id>)
batch-invoice-dialog.tsx             // charge rows keyed by batchChargeKey
initial-charge-fields.tsx            // the two captions no longer name a cleanout surcharge or a prepayment as initial charges
```

Behavior worth knowing before the next pass touches it:
- **The gate fires only on a change.** `surchargeChanged(stored, sent)` decides: a new or changed
  positive amount needs `ADD_FIELD_SURCHARGE` and, on an agreement service, the template's
  toggle; a removal needs the permission alone (the template says whether the technician may ADD
  one); an unchanged value is never gated, so the dialog re-sends what the ticket carries even
  when its box is locked, and a template toggled off after a surcharge was recorded never strands
  it. An agreement service with no template is refused (the safe direction). A non-agreement
  service is gated by the permission alone - decided, not owner-specified: it has no template to
  ask, the technician may already set its price, and a labelled line beats a folded-in extra
  (D6). Every role holds the permission today, so the role refusal is exercised only by the pure
  function; it is there for the day a role loses it.
- **The post writes the ticket whole.** A re-post that omits `surchargeCents` clears a recorded
  surcharge (as it clears notes), through the gate and with a `surcharge_recorded` row; the PATCH
  keeps an omitted one. The dialog sends the boxes on both paths, so neither drops one by
  accident; a native client re-posting must send it.
- **Two audit rows for one edit.** An office edit that changes the surcharge writes
  `surcharge_recorded` (the two fields) and `ticket_edited` (the whole ticket, in which the two
  fields also appear) - the same pairing as `price_overridden` beside `ticket_edited`. A first post
  writes `surcharge_recorded` alone (there is no ticket to have edited).
- **The credit is per ticket and once.** The SURCHARGE entry's idempotency is the method's own
  select (the ledger's partial unique index excludes SURCHARGE, as before); the main entry and the
  surcharge entry are checked independently, so a ticket reopened, given a surcharge and
  re-finalized earns the credit then. A surcharge CHANGED after its credit keeps the first
  amount - the ledger is append-only and has no adjustment entry; Phase 7 owns that. The
  technician is the ticket's snapshot, as the main entry's is; `contractPriceCentsSnapshot` is the
  agreement's price when there is one.
- **The unit-15 rows stand.** The three Daily Rodent Trapping $99.95 SURCHARGE credits (down
  payments, wrong under Pass 5.5's rule) and Unit 15 Ledger Test's $50.00 (a real cleanout, its
  initial charge now cleared) are left as history: deleting them would break the append-only
  rule, a negative adjustment row has no vocabulary yet, and no engine pays them. When Phase 7
  builds adjustment entries, they are its first four cases.
- **The draft prices the surcharge exactly as Post will accept it.** `&surchargeCents=` goes
  through the same gate; a refused draft prices the stored surcharge and says why
  (`surchargeNote`, the dialog's caption); 0 previews the removal; the label of a draft is the
  stored one, else the default (the read carries no label). An invoiced visit's figures are the
  invoice's and no draft applies, as before.
- **The invoice line pairs with its service by ids.** A SURCHARGE line carries the same
  `serviceId` / `serviceRecordId` as the ticket's service line, so the invoice modal's "Open
  ticket", the detail read's type / date / status enrichment and the visit read's pairing all
  work unchanged; readers that look a service line up by `serviceId` must skip `SURCHARGE` lines
  (the billing read does). The tax snapshot is PER_LINE with a `lineType: "SURCHARGE"` entry.
- **Migration decisions.** The template default was derived from its agreements' plans (agree →
  that flag; none → the template's default plan's flag; disagree → off) and printed per template;
  the office flips it in Settings. The plan snapshots keep `fieldAddableSurcharge` as dead
  history (the Pass 5.5 precedent). The Pass 5.5 one-shot (dead on this DB) now carries only
  DOWN_PAYMENT forward, since the Pass 23 one-shot would clear anything else at once. The
  handoff's claim that the Quarterly Control template carried a cleanout default was wrong - it
  carries a DOWN_PAYMENT, which stands; run the SQL, never trust a doc's data claim.
- **Verified 2026-09-27** (PORT=5001 against a copy of the dev DB, `pestflow_verify`, dropped
  afterwards - a column drop is never verified under the owner's running server): `npm run
  check` clean; boot 1 printed the seven migration lines once (3 templates, the summary; Unit 15
  Ledger Test, the summary; the two ticket columns) with all 44 table counts unchanged; boot 2
  printed only the serving line with every count unchanged; 95 API / SQL assertions as the four
  roles - the pure gate (a role without the permission, no template, a forbidding template, an
  allowing one, a removal); two templates through the API (toggle on / off), `GET
  /api/billing-plans` without the old key; the billing read's draft on the allowed agreement
  (SURCHARGE $50.00 + $4.13 tax BILLABLE, Due today 16238 beside the $100.00 + $8.25 service
  line, the description "Cleanout surcharge - General Pest Control - <date>"), refused with the
  reason on the forbidding template, price and surcharge together on the manual service, 0 as a
  removal, 400 for an orphaned or fractional param; the technician's post with $50.00 → the
  ticket carries it with the default label, one `surcharge_recorded` (null → 5000) by the
  technician, the read pairs it and Due today follows; the forbidding template's post and office
  PATCH refused 403 `SURCHARGE_NOT_ALLOWED` naming the template with nothing written; the manual
  service's labelled surcharge trimmed and kept, its DRAFT carrying SERVICE 15000 then SURCHARGE
  2500 with the ticket's ids; the office edit to $75.00 "Heavy cleanout" (a second audit row plus
  `ticket_edited`), a no-op edit writing nothing, an omitted field keeping it, -1 and a 61-char
  label 400, a fractional post 400; reopen → re-post at $60.00 (a third row, the label back to
  the default) → finalize → exactly the main entry plus one SURCHARGE 6000 for John Doe on the
  agreement with the price snapshot, a second finalize and a reopen + re-finalize writing none,
  the technician's production read listing it; the batch preview listing it on its visit with
  tax; generate → SERVICE 10000/825 then SURCHARGE 6000/495, taxable, the ids, total 17320 OPEN, a
  PER_LINE tax snapshot with the SURCHARGE entry, the detail read enriching the line, the
  invoiced read pairing it (Due today 17320), the service report printing "Cleanout surcharge -
  $60.00", the invoice PDF printing the line; the covered agreement's visit - PRODUCTION $0 plus a
  BILLABLE $30.00 surcharge (Due today 3248), the credit written, the invoice AGREEMENT_COVERED 0
  + SURCHARGE 3000/248 total 3248 OPEN and its PDF never "No Charge"; a PATCH to 0 removing the
  surcharge (label too, the audit row's after both null), the credit then ONE_TIME_SERVICE alone,
  and the DRAFT issued without the removed line; the report preview printing a typed $42.00
  label and storing nothing; the template toggle flipped on making the office PATCH pass, flipped
  off leaving an unchanged surcharge alone, a removal allowed and an add refused; CLEANOUT_SURCHARGE
  and PREPAY_FULL refused by the template schema (400) while DOWN_PAYMENT stands; every fixture
  deleted (the two templates included), every count back at the run's start (`session` +4); a
  Vite 200 with the new symbols on the seven touched client modules, the three consuming pages and
  the four shared modules. **Nothing was rendered in a browser** - the repo has no browser
  automation and the session had no browser - so the two inputs, the template checkbox, the card
  line, the figures and the report row reach the owner first.
- **Known follow-up.** A surcharge changed after its credit (Phase 7's adjustment entry); the
  comp-plan selector itself; `technicianMayCollectInitialCharge` is still exported and read by
  nothing; the draft read carries no label (the stored one or the default is shown until Post);
  the Service History legacy form (`POST /api/service-records`) writes no surcharge; a surcharge
  on a ticket with no service is refused rather than modelled; the invoice document prints the
  SURCHARGE line as any line, with no badge of its own.

**Shipped in Pass 24** (`feature/phase-3-service-designation-callbacks`, 2026-09-27) — the C3.7
row as built, plus what it decided.

```ts
// shared/service-kind.ts (new) - the work kind's vocabulary, defaults, link rule, gate and basis, read by the server and the client
SERVICE_WORK_KINDS = ["SERVICE", "PRODUCTION", "CALLBACK"]; type ServiceWorkKind; DEFAULT_SERVICE_WORK_KIND = "SERVICE"
isServiceWorkKind(v); normalizeServiceWorkKind(v)            // an unknown or null stored value reads as SERVICE
isCallbackKind(v); formatServiceWorkKind(k)                  // "Service" | "Production" | "Callback"
describeServiceWorkKind(k); formatServiceWorkKindBadge(k)    // the Select's caption; "Kind: <label>" - never read as the BILLABLE / PRODUCTION billing badge
defaultWorkKindForService({ typeKind, source, hasAgreement }) // the type's kind; an agreement's AGREEMENT_GENERATED / AGREEMENT_INITIAL visit on a CALLBACK type -> PRODUCTION
resolveCallbackLinkShape(workKind, answersServiceId)         // CALLBACK_LINK_REQUIRED | CALLBACK_LINK_NOT_ALLOWED | null
canAnswerService({ status, workKind })                        // the picker's predicate: COMPLETED and not a callback
resolveCallbackLinkTarget({ serviceId, locationId, answered }) // CALLBACK_LINK_NOT_FOUND | _SELF | _LOCATION_MISMATCH | _IS_CALLBACK | _NOT_COMPLETED | null
describeAnswersLink(typeName, dateText)                       // "Answers <type> on <date>"
workKindOverridePermission(isAgreementService)                // ADJUST_PRICE_AGREEMENT | ADJUST_PRICE_NON_AGREEMENT - the price's rule
resolveWorkKindOverrideGate({ actorRole, isAgreementService }) // { code: "WORK_KIND_FORBIDDEN", message } | null; a null actor (a server path) always may
productionBasisForService({ workKind, hasAgreement })         // CALLBACK | SCHEDULED_AGREEMENT_SERVICE | ONE_TIME_SERVICE - never a counter

// shared/schema.ts
serviceTypes.workKind                                         // text NOT NULL DEFAULT 'SERVICE' - the type's default; `category` (free text) untouched
services.workKind                                             // text NOT NULL DEFAULT 'SERVICE' - the instance's kind
services.answersServiceId                                     // varchar, self FK -> services(id), nullable - the Service a CALLBACK answers

// shared/audit.ts
AuditAction + "work_kind_changed"                             // "Work kind changed": entity service, before / after { workKind, answersServiceId }

// server/storage.ts
class ServiceKindError(status: 400 | 403 | 409, code, message) // the link codes (400), WORK_KIND_FORBIDDEN (403), SERVICE_KIND_LOCKED (409); routes answer { code, message }
interface ServiceWriteContext { actorRole?: UserRole | null; actor?: AuditActor | null }
createService(data, context?) / updateService(id, data, context?)   // both resolve the kind and the link through resolveServiceWorkKindTx; an update audits a change
resolveServiceWorkKindTx(tx, { serviceId, locationId, agreementId, source, serviceTypeId, requestedWorkKind, requestedAnswersServiceId, current, actorRole })
                                                              // -> { workKind, answersServiceId, changed }. Create: the type's default unless requested (gated when it differs).
                                                              //    Update: unchanged unless requested; a kind leaving CALLBACK drops its link; a change is gated, locked, audited.
assertServiceKindUnlockedTx(tx, serviceId)                    // 409 SERVICE_KIND_LOCKED on a finalized ticket (isTicketFinalized) or an issued visit invoice; a DRAFT does not lock
generateServiceForAgreement                                   // workKind = defaultWorkKindForService(type, AGREEMENT_GENERATED, true); answersServiceId null
convertOpportunityToService                                   // a CALLBACK-type conversion answers opportunity.sourceServiceId (validated); no source -> 400 CALLBACK_LINK_REQUIRED
createProductionValueEntriesForFinalizedRecord                // basis = productionBasisForService(service.workKind, !!agreement); the scheduled-count query is gone
resolveServiceLineBillingTx({ service, agreementContext })     // the `record` parameter is dropped; isCallbackKind(service.workKind) first: priced -> SERVICE "callback",
                                                              //    unpriced -> AGREEMENT_COVERED "warranty callback - no charge" - before the plan, and with no agreement too
completeService                                               // a type change on the ticket never re-derives the kind (comment only)

// server/routes.ts
serviceWorkKindSchema = z.enum(SERVICE_WORK_KINDS); serviceTypeSchema = insertServiceTypeSchema.extend({ workKind: optional })
POST /api/service-types, PATCH /api/service-types/:id         // requirePermission(MANAGE_SETTINGS) - the first gate on these routes; GET stays open
POST /api/services, PATCH /api/services/:id                   // + workKind? (enum), answersServiceId? (nullable); { actorRole, actor } passed to storage; ServiceKindError -> { code, message }
POST /api/opportunities/:id/convert                           // ServiceKindError -> { code, message }

// server/service-scheduling-bootstrap.ts
bootstrapServiceWorkKind()                                    // service_types.work_kind (every type printed once), services.work_kind (backfilled from the type, printed once,
                                                              //    then NOT NULL DEFAULT 'SERVICE'), services.answers_service_id + partial index + FK (printed once); called last
// server/seed.ts
serviceTypes                                                  // the five carry workKind SERVICE; + "Warranty Callback" (CALLBACK, no default price, 30 min) - fresh databases only

// client
components/service-work-kind-badge.tsx (new)                  // ServiceWorkKindBadge ("Kind: <label>"; amber CALLBACK, sky PRODUCTION, muted SERVICE; badge-service-work-kind-<kind>)
                                                              //    and ServiceWorkKindListBadge (null for SERVICE - lists show the kind only when it is not the plain one)
settings.tsx                                                  // ServiceTypeForm: Work Kind Select (select-st-work-kind) with a caption; the card: a kind badge per type; Add Type and
                                                              //    Edit only for canManageSettings, "Admins manage service types." otherwise (text-service-types-admin-only)
customer-detail.tsx                                           // ServiceWorkKindFields (Work Kind Select + Answers Select; select-service-work-kind-<n|edit>, select-service-answers-<n|edit>)
                                                              //    on every New Service line with a type and on the Edit form, disabled with the reason (role, or a completed service);
                                                              //    the kind follows the type until touched; submit disabled while a CALLBACK line has no answer; the POST and PATCH
                                                              //    bodies carry both fields. ServicesTab: answerCandidates (the location's COMPLETED non-callback services, most
                                                              //    recent first, "<type> on <date>"), answersLabelFor(service), the row's ServiceWorkKindListBadge under the type;
                                                              //    ServiceDetailModal: a Work Kind cell (the badge) with "Answers <type> on <date>" (text-service-answers-<id>)
schedule.tsx                                                  // the queue card's ServiceWorkKindListBadge and answers line (text-queue-answers-<id>); ServiceDetailDialog: a Work Kind
                                                              //    cell; AppointmentSheet: a "Work kind per service" block (sheet-service-kinds) above the billing rows, with the
                                                              //    caption that the Billable / Production badge below is the invoice line; prefillServiceMutation gains an onError toast
```

Behavior worth knowing before the next pass touches it:
- **Two collisions, both resolved by naming.** `serviceTypes.category` was already free text
  ("General / Termite / Rodent / Commercial", every row set, edited as a text input) and stays the
  display grouping; the canon's "category" is the new `workKind` column beside it. "Designation"
  was already `ServiceBillingDesignation` (BILLABLE / PRODUCTION - what the invoice LINE is), so the
  new thing is the **work kind** everywhere: the column, the type, the badge ("Kind: Callback") and
  the audit action. Where both badges show (the dispatch sheet) the kind block's caption says the
  billing badge below is the invoice line.
- **PRODUCTION and SERVICE drive nothing yet.** Only CALLBACK changes what a visit credits and
  bills; PRODUCTION vs SERVICE is the office's classification (an agreement's visit vs billable
  one-off work), kept for the badge and for later analytics. The ledger basis follows the agreement
  link and billing follows the plan for both, exactly as before. The migration defaulted every
  existing type to SERVICE and printed them; the office sets its program types to PRODUCTION and
  its callback types to CALLBACK in Settings.
- **The default has one exception.** An agreement's own AGREEMENT_GENERATED or AGREEMENT_INITIAL
  visit never defaults to CALLBACK (nothing to answer) - a CALLBACK type there reads PRODUCTION. A
  MANUAL service on an agreement customer keeps the type's CALLBACK; that is the warranty callback
  this pass exists for, and it needs no override and no permission beyond creating a service.
- **The link's target rule is strict on purpose.** COMPLETED, same location, not itself a callback,
  not itself. A callback answering a callback is refused so the callback rate per original service
  is one group-by; the picker (the location's completed non-callback services) can never offer a
  refused row. The board's prefill offers no picker because its only caller is the agreement's
  initial service, which never defaults to a callback; a hand-built prefill URL for a CALLBACK type
  gets a toast naming the Services tab.
- **The override is the price's permission, and it freezes with the money.** Every role may set or
  change a non-agreement service's kind (ADJUST_PRICE_NON_AGREEMENT); a profile holding ADJUST_PRICE_AGREEMENT (manager and admin by default) an agreement
  service's (ADJUST_PRICE_AGREEMENT). A change on a service with a finalized ticket or an issued
  visit invoice is 409 SERVICE_KIND_LOCKED (a credit memo or Phase 7's adjustment entry is the
  correction); a DRAFT does not lock, and a posted, unfinalized ticket may still be re-designated -
  the reviewer's moment. A kind moving off CALLBACK drops its link unless the body names one. A
  type change alone, on the form or on the ticket, never re-derives the kind. The board's placement
  PATCH names neither field and touches neither.
- **The counter is gone, and so is the cap.** An agreement's PRODUCTION or SERVICE visit past
  `expectedServiceCount` now credits SCHEDULED_AGREEMENT_SERVICE at the per-visit value, so a
  ledger's per-agreement total can exceed the contract price when the office schedules more visits
  than it expected or forgets to designate a callback. Decided: the designation is the control; a
  wrongly credited visit is visible in the ledger, a real visit credited $0 was not. A CALLBACK
  credits $0 priced or not - no production on callbacks (canon §13).
- **The kind precedes the plan.** An unpriced callback on a schedule-billed plan reads "warranty
  callback - no charge" (not "covered by agreement"), and a priced one bills "callback" on a
  schedule-billed plan too - it is not one of the plan's paid visits. Non-agreement work follows
  the same rule, so a price-less one-time callback no longer throws "Service has no price set" and
  a DRAFT for its visit prices it $0 before the ticket exists. `describeBatchTicketBilling`'s
  CALLBACK kind and the ticket's "(warranty callback - no charge)" note follow without a change.
- **The three CALLBACK rows stand.** The slot counter's entries on Unit 15 Ledger Test (two test
  rows and the misclassified 2026-07-16 visit) and their $0 lines on PAID invoices are history; the
  ledger is append-only and Phase 7 owns adjustment entries. Their services read SERVICE like every
  other row. The seed's "Warranty Callback" type exists on fresh databases only.
- **Verified 2026-09-27** (PORT=5001 against a copy of the dev DB, `pestflow_verify`, dropped
  afterwards): `npm run check` clean; boot 1 printed the migration once (six types -> SERVICE, 102
  services from their type, the three counter CALLBACK entries noted as history, the FK) with all
  44 table counts unchanged; boot 2 printed only the serving line with every count unchanged; 101
  API / SQL assertions as the four roles - the pure module (defaults, basis, link shape, gate,
  picker predicate, badge text); the type routes (403 for tech / support / manager, 400 on an
  unknown kind, admin 201 / 200, a type without a kind is SERVICE, every pre-existing type
  SERVICE); the link (REQUIRED, LOCATION_MISMATCH, NOT_COMPLETED, NOT_FOUND, NOT_ALLOWED,
  IS_CALLBACK, SELF, nothing written by a refusal); the technician creating a callback from the
  type's default; the DRAFT pricing a one-time callback $0 before its ticket, its ticket credited
  CALLBACK $0, the DRAFT issued at $0 and the invoiced read pairing it; a COD agreement's visit 1
  and visit 2 (past expectedServiceCount 1) both SCHEDULED_AGREEMENT_SERVICE 40000; an agreement's
  initial visit on a CALLBACK type reading PRODUCTION; a technician's kind override on an agreement
  service 403 and a manager's 201; a priced callback BILLABLE 5000 "callback" credited CALLBACK $0
  and invoiced SERVICE 5000 "(callback)"; an unpriced one PRODUCTION $0 "warranty callback - no
  charge" invoiced AGREEMENT_COVERED 0; the batch preview's AMOUNT and CALLBACK kinds; a
  schedule-billed plan's visit "covered by agreement" beside its callbacks "warranty callback - no
  charge" / "callback" 2500; the override rule (technician 200 on a one-time service with the audit
  row, an unchanged kind writing none, a placement PATCH touching nothing, a type change alone
  keeping the kind, CALLBACK without a link 400, off-CALLBACK dropping the link, support / tech 403
  on an agreement service, manager 200, a finalized ticket 409, a DRAFT not locking, an issued
  pre-finalization invoice 409 naming the invoice); the opportunity conversion (a CALLBACK type
  answering its source, no source 400 and nothing changed, a SERVICE type unchanged); every fixture
  deleted (the three types included), every count back at the run's start (`session` +4); a Vite
  200 with the new symbols on the three touched pages, the badge component and the three shared
  modules. **Nothing was rendered in a browser** - the repo has no browser automation and the
  session had no browser - so the Work Kind Select, the badges, the Answers picker and the sheet's
  kind block reach the owner first.
- **Known follow-up.** A callback rate / warranty report per original service (the group-by now
  exists; no screen reads it); an "extra visit past the count" report (Phase 7, with the
  adjustment entries); the technician's ticket carries no kind and no link (by design - the
  office re-designates from the Services tab before finalization); the board's prefill offers no
  picker (no caller needs one); `GET /api/services` is unfiltered, so the picker's candidates are
  filtered client-side from the location's services; the `Service History` legacy form and the
  seed's services carry the column default.

---

**Shipped in Pass 26** (`feature/phase-4-opportunity-assignment-rules`, 2026-09-28) — the C4.1b
row as built, plus what it decided.

```ts
// shared/zones.ts (new) - zones: named ZIP-code lists; the normalization and the match predicate, read by the server and the Settings card
ZIP_CODE_PATTERN; MAX_ZONE_NAME_LENGTH = 80; interface ZoneLike { id, name, zipCodes, isActive }
normalizeZipCode(value)                        // "76053-1234" -> "76053"; anything that is not a ZIP or a ZIP+4 -> null
splitZipCodeText(text)                         // the textarea: newlines, commas, semicolons, spaces
normalizeZipCodes(values)                      // -> { zipCodes: unique five-digit, sorted; invalid: as typed - reported, never dropped }
locationZipKey(zip); zoneCoversZip(zone, zip)  // an ACTIVE zone whose list names the location's five-digit ZIP
describeZipCodes(list, max = 6)                // "76053, 76102 and 4 more" - the card's one line

// shared/opportunity-assignment.ts (new) - the rules' vocabulary and the ONE resolver, read by the server's insert path and by the card
ANY_MATCHER_LABEL = "Any"; AssignmentRuleLike / AssignmentUserLike / AssignmentCategoryLike; AssignmentSubject { categoryKey, workType, source, zip }
sortAssignmentRules(rules)                     // sortOrder, then createdAt, then id - the order the resolver tries and the card lists
describeRuleProblems(rule, zones, users)       // [{ code: ASSIGNEE_UNKNOWN | ASSIGNEE_INACTIVE | ZONE_UNKNOWN | ZONE_INACTIVE, message }] - the resolver skips on any; the card prints them
assignmentRuleMatches(rule, zones, subject)    // a null matcher matches anything; a zone through zoneCoversZip
resolveAssignmentRule(rules, zones, users, subject) // -> { rule: the first active, sound match in order | null; skipped: [{ rule, problems }] }
describeRuleMatchers(rule, names) / describeAssignmentRule(rule, names) // "Service due · Any work type · Zone North · Any source -> Heritage Support"

// shared/schema.ts
zones                                          // id, orgId, name, zipCodes text[] NOT NULL DEFAULT '{}', isActive, sortOrder, notes, timestamps; unique (org_id, lower(name)) - the bootstrap's index
opportunityAssignmentRules                     // id, orgId, sortOrder, categoryKey?, workType?, zoneId? -> zones, source?, assignedUserId -> users NOT NULL, isActive, timestamps
opportunities.assignedByRuleId                 // nullable FK -> opportunity_assignment_rules: the rule that auto-assigned the row; nulled by a manual reassignment
insertZoneSchema / insertOpportunityAssignmentRuleSchema; Zone / InsertZone / OpportunityAssignmentRule / InsertOpportunityAssignmentRule

// shared/audit.ts                             AuditAction + "opportunity_auto_assigned" ("Auto-assigned by rule"), entity opportunity; snapshots
                                               //    { assignedUserId, assignedTo, assignedAt, assignedByRuleId, assignedByRule, categoryKey, workType } - the manual `update`'s shape, + the rule
// shared/permissions.ts, shared/opportunities.ts   the two comments that promised C4.1b now say what was built

// server/storage.ts
SYSTEM_AUDIT_ACTOR                             // { userId: null, actorLabel: "System" } - canon §17's system-driven write, exported for any later system writer
class OpportunityAssignmentError(status: 400 | 404 | 409, code, message)   // routes answer { code, message }
ZoneInput / ZoneUpdateInput; OpportunityAssignmentRuleInput / OpportunityAssignmentRuleUpdateInput
insertOpportunityTx(tx, values: InsertOpportunity) // private; THE insert path: loads the active rules, every zone, every user and the category labels once per
                                               //    transaction (a WeakMap keyed on the tx), reads the location's zip, resolves, stamps assignedUserId / assignedAt /
                                               //    assignedByRuleId on the insert, writes the opportunity_auto_assigned row under SYSTEM_AUDIT_ACTOR; returns the row
ensureOpportunityForServiceRecordTx / ensureAgreementContactRequiredOpportunityTx / cancelAgreement (retention) / dispositionAppointment (CREATE)
                                               // the four writers call insertOpportunityTx; createOpportunity (dead - no route, no caller) and its IStorage entry are deleted
updateOpportunity                              // an assignee change also sets assignedByRuleId = null; opportunityAuditSnapshotTx += assignedByRuleId, assignedByRule
describeAssignmentRuleTx(reader, ruleId)       // the snapshot's rule text, from the rule, its zone, the category labels and the user
getZones(includeInactive?) / createZone / updateZone / deleteZone
                                               // 400 ZIP_CODES_INVALID (names the entries) / ZIP_CODES_REQUIRED / ZONE_NAME_REQUIRED; 409 ZONE_NAME_TAKEN (23505 on the index);
                                               //    409 ZONE_IN_USE (a rule names it: "<n> assignment rule(s) name zone ...")
getOpportunityAssignmentRules(includeInactive?) / createOpportunityAssignmentRule / updateOpportunityAssignmentRule / deleteOpportunityAssignmentRule / reorderOpportunityAssignmentRules(ids)
                                               // 400 RULE_CATEGORY_UNKNOWN (not an org key) / RULE_ZONE_UNKNOWN / RULE_ASSIGNEE_INVALID (assertActiveOrgUserTx, on set or change);
                                               //    409 RULE_IN_USE (rows carry assigned_by_rule_id); 400 RULE_ORDER_INVALID (every rule of the org exactly once); a new rule
                                               //    appends at max(sortOrder) + 10; reorder rewrites sort_order 10, 20, 30 ... in one transaction

// server/routes.ts (every write requirePermission(MANAGE_SETTINGS); reads open like every read)
GET  /api/zones?includeInactive=true | POST /api/zones | PATCH /api/zones/:id | DELETE /api/zones/:id (204)
GET  /api/opportunity-assignment-rules?includeInactive=true | POST ... | POST .../reorder { ids } | PATCH .../:id | DELETE .../:id (204)
                                               // zoneSchema { name (<= 80), zipCodes: string[] (>= 1), isActive?, sortOrder?, notes? } strict; opportunityAssignmentRuleSchema
                                               //    { categoryKey? | null, workType? z.enum | null, zoneId? | null, source? z.enum(OPPORTUNITY_SOURCES) | null, assignedUserId, isActive?, sortOrder? } strict

// server/service-scheduling-bootstrap.ts      bootstrapOpportunityAssignment() - zones + zones_org_name_uidx, opportunity_assignment_rules + (org_id, sort_order) index,
                                               //    opportunities.assigned_by_rule_id + partial index + FK; each step printed once (tableExists() / columnExists() guards); called last
// server/tenancy-bootstrap.ts                 TABLES_REQUIRING_ORG_ID + zones, opportunity_assignment_rules

// client
components/opportunity-taxonomy-chips.tsx      // describeOpportunityAssignee(opportunity, users) appends " (auto)" when assignedByRuleId is set; the assignee chip's title names the origin
pages/settings.tsx                             // ZoneForm (name, sort, a ZIP textarea whose caption previews what is kept and, in amber, what will be refused - through the shared
                                               //    normalization; active; notes; Delete in edit mode); OpportunityAssignmentRuleForm (Category / Work Type / Zone / Source Selects with
                                               //    "Any", inactive entries labeled; Assign to (active users + the current one); Active; Delete); the Zones card (card-zones: name,
                                               //    Active, "<n> ZIP codes", the list) and the Opportunity Assignment card (card-opportunity-assignment: "#n", describeRuleMatchers,
                                               //    "-> user", Active, amber describeRuleProblems lines, Move up / Move down through POST reorder, Edit), both after Opportunity
                                               //    Categories; the header shows Add for canManageSettings and "Admins manage zones." / "Admins manage assignment rules." otherwise
```

Behavior worth knowing before the next pass touches it:
- **One insert path.** `insertOpportunityTx` is the only place an opportunity row is written, and
  the four writers (the finalization follow-up, the agreement contact-required cycle, the
  cancellation's retention row, the disposition's CREATE) call it. The dead `createOpportunity`
  (no route, no caller: there is no `POST /api/opportunities`) was deleted rather than left as a
  way to insert around the rules. A fifth writer that inserts directly would compile - the columns
  are nullable - so the rule is the helper, not the type system; put any new writer through it.
- **The match.** A rule's four matchers are ANDed; a null one matches anything. The zone matcher
  compares the location's zip through `locationZipKey` (its first five characters, only when the
  stored value is a ZIP or a ZIP+4 - the dev DB's `00000` placeholder is a ZIP that no zone
  names) against the zone's list, and an inactive zone covers nothing. The source is the row's
  `source` (a disposition's CREATE picks it through `opportunitySourceForDisposition`, so a rule on
  `APPOINTMENT_CANCELLATION_WINBACK` catches cancelled one-time work and nothing else); the two
  axes are what `taxonomyForSource` stamped. First match in `sortAssignmentRules` order wins;
  nothing after it is consulted. No rule at all (the dev DB today) means every read of the rules
  finds none and the insert is exactly Pass 25's.
- **The actor and the audit.** The auto-assignment is `SYSTEM_AUDIT_ACTOR` - user id null, label
  "System" - written as `opportunity_auto_assigned`, a new action rather than the manual `update`,
  so the History tab (which already collects the location's opportunities) tells the two apart by
  the badge alone. Both actions share one snapshot shape, now with `assignedByRuleId` and
  `assignedByRule` (the rule's description at the time), so a manual reassignment of an
  auto-assigned row diffs as `assignedTo` Support -> Admin and `assignedByRule` "<rule text>" ->
  null under the manager's label: a person overriding a rule. Dispositions and Convert still write
  no audit row (their activity trail is unchanged).
- **Skips, never re-points.** A rule can only be saved naming an active user of the org
  (`RULE_ASSIGNEE_INVALID` on create, and on a PATCH that changes the user - an unchanged user is
  not re-checked, the Pass 12 rule); a rule whose user goes inactive later, or whose zone is
  deactivated, is skipped at evaluation and the next rule is tried. The same
  `describeRuleProblems` the resolver reads is what the card prints in amber under the rule, so what
  the card says is skipped is what the server skips. An inactive rule is not considered at all and
  reports nothing.
- **The gate.** Zones and rules are Settings: every write is `MANAGE_SETTINGS` (admin), the header
  says "Admins manage ..." to everyone else and the Edit / Move buttons are disabled, not hidden;
  reads are open (the cards, and the chips' "(auto)" needs nothing but the row). The manual assign
  on the opportunity stays `ASSIGN_OPPORTUNITY` (support+). Decided against `ASSIGN_OPPORTUNITY`
  for the rules: a rule is the office's standing dispatch instruction, and support should not be
  able to route every future opportunity to themselves.
- **`assignedByRuleId` is how the read knows.** A stored nullable FK, not an inference from the
  audit log: the chips read it, the History snapshots it, `updateOpportunity` nulls it whenever the
  assignee changes by hand (to a user or to nobody). A row that was auto-assigned and then
  reassigned by a person reads as a person's from then on. Nothing re-runs the rules on a category
  or work-type change - "at creation" is the rule.
- **Delete guards.** A zone named by any rule answers 409 `ZONE_IN_USE` (the count named); a rule
  that has assigned any row answers 409 `RULE_IN_USE` (the count named) - those rows carry the
  rule as history and the FK would otherwise dangle. Deactivate instead (the form says so before
  the confirm). A zone or rule nothing references deletes with 204. Reorder is one request naming
  every rule of the org exactly once (400 `RULE_ORDER_INVALID` otherwise), so an order is never
  half-applied; the card's Move up / Move down swap two ids and send the whole list.
- **Found on the way, docs corrected.** The follow-up opportunity for a one-time service is written
  at office **finalization** (`finalizeServiceRecord` -> `ensureOpportunityForServiceRecordTx`,
  canon §12), not at the technician's post - the Pass 26 handoff said "a ticket posted". The Pass 25
  record named the fourth writer as `requestAppointmentCancelOrReschedule`; it has been
  `dispositionAppointment` since Pass 27.
- **Verified 2026-09-28** (PORT=5001 against a copy of the dev DB, `pestflow_verify`, dropped
  afterwards): `npm run check` clean; boot 1 printed the migration's three lines (zones created,
  rules created, `assigned_by_rule_id` added with 30 rows / 0 assigned by hand / none by a rule)
  with every one of the 44 pre-existing table counts unchanged and the two new tables at 0; boot 2
  printed only the serving line with every count unchanged; 120 API / SQL assertions as the four
  roles - the two pure modules (ZIP+4 to five digits, four digits and letters refused, unique
  sorted lists with the invalid entries reported, an inactive zone and a malformed location zip
  matching nothing; the resolver: sort order first, category fall-through, an inactive user and an
  inactive zone skipped with their codes while an inactive rule is ignored, no match null; the
  problem and description texts); zones (reads open to a technician; POST / PATCH / DELETE 403 for
  tech, support and manager; invalid entries 400 naming them, no valid ZIP 400, an unknown field
  400, admin 201 with a ZIP+4 and a duplicate collapsed to a sorted unique list, a case-different
  duplicate name 409, PATCH replacing the list, an unknown id 404, org-scoped); rules (the same
  gate; unknown category / zone / user each 400 with its code, a bad source and work type 400,
  no user 400; three rules appended at 10 / 20 / 30 and listed in order); then, through the REAL
  writers on a fixture customer with a ZIP+4 location in the zone and a second location outside
  it: a finalized one-time ticket on a type with `opportunityLeadDays` landing SERVICE_DUE /
  ONE_TIME assigned to support by the zone rule (first) with exactly one
  `opportunity_auto_assigned` row - user id null, label "System", the rule's id, "Heritage
  Support" and the rule's text - and found by `?assignee=<support>` and support's `me`; a reorder
  (support 403; a list missing a rule or naming one twice 400) putting the category rule first
  and the next finalized ticket landing with the manager; a disposition CANCEL + CREATE at the
  outside location landing WINBACK / ONE_TIME unassigned with no rule and no auto row; the
  fixture rep set inactive - a new rule naming them 400, re-pointing a rule at them 400, the card's
  `describeRuleProblems` reporting ASSIGNEE_INACTIVE by name - and a win-back at the zone location
  skipping that rule to land with support by the zone rule while the disposition's own
  `appointment_cancelled` row still names the opportunity; the manager reassigning it to the admin
  (the technician 403) - the response and the row with `assignedByRuleId` null, one `update` by
  "Heritage Manager" naming Support -> Admin and the rule -> null, both rows on the location's
  History read, a re-send writing nothing; the zone deactivated - the card reporting ZONE_INACTIVE,
  a follow-up skipping the zone rule to the category rule, a win-back landing unassigned, the
  active-only read omitting the zone - and reactivated; a rule deactivated (omitted from the
  active-only read, a follow-up outside the zone left unassigned) and reactivated (the next one
  assigned); DELETE of the zone 409 naming two rules, of the assigning rule 409, of the unused rule
  204 (support 403) then 404, PATCH of the deleted rule 404, an unknown field 400, the zone rule
  re-pointed to any zone and then the zone deleted 204 then 404; the 30 pre-existing rows still
  unassigned with no rule; 8 fixture opportunities, 5 auto-assigned with exactly one auto row each;
  every fixture (customer, two locations, services, appointments, tickets, opportunities, audit
  rows, the rules, the zone, the rep user, the service type) deleted and every count back at the
  run's start (`session` up by the run's four logins); Vite 200 with the new symbols on the two
  pages, the location page, the chips component and, under `/@fs/`, the two new shared modules,
  the audit vocabulary and the schema. **Nothing was rendered in a browser** - the repo has no
  browser automation and the session had no browser - so the Zones card, the Opportunity
  Assignment card, their two dialogs and the "(auto)" chip reach the owner first.
- **Known follow-up.** A "this rule would assign ..." preview on the card (the shared resolver is
  ready for it; the row called it optional); applying the rules to the rows that exist (all 30 stay
  unassigned - the rules are forward-only, and a bulk assign is a person's act); dispatch and Smart
  Schedule reading `zones` (Phase 9); a zone filter on the queue (the zip prefix exists); who may
  edit Settings is a profile holding `MANAGE_SETTINGS` since Pass 37; `GET /api/users` stays open to every role (the rule form
  and the chips need it).

---

**Shipped in Pass 28** (`feature/phase-4-appointment-composition`, 2026-09-29) — the C4.3a row as
built, plus the nine decisions the handoff asked for.

```ts
// shared/appointment-composition.ts (new) - the composition's vocabulary and its two pure rules, read by storage, the routes and the client
AppointmentServiceAddRequest { serviceId? | service?: NewPlacedServiceRequest }   // exactly one; NewPlacedServiceRequest { serviceTypeId, expectedDurationMinutes?, priceCents?, notes?, timeWindow?, workKind?, answersServiceId? }
AppointmentServiceUpdateRequest { serviceTypeId?, expectedDurationMinutes? }        // at least one
ServiceCancelRequest { reasonCode, notes?, opportunity: DispositionOpportunityChoice }
AppointmentCompositionResult { appointment, service, services, scheduledEndDateExtendedMinutes, opportunitiesConverted }
ServiceCancelResult { service, appointment | null, effect: CANCELLED | REQUEUED, windowReset, detached, opportunities: DispositionOpportunityOutcome[] }
LAST_SERVICE_ON_APPOINTMENT (409) / SERVICE_NOT_ON_APPOINTMENT (404) / SERVICE_NOT_PENDING / SERVICE_LOCATION_MISMATCH / APPOINTMENT_NOT_COMPOSABLE / VISIT_INVOICED / SERVICE_SETTLED
  / SERVICE_HAS_TICKET (409) / SERVICE_TYPE_LOCKED (403) / SERVICE_TYPE_UNKNOWN / ADD_SERVICE_TARGET_REQUIRED (400) / SERVICE_CANCEL_REQUIRED / SERVICE_REMOVE_REQUIRED (409, the generic PATCH)
isActiveOnVisit(service)                       // not COMPLETED / CANCELLED
pickRepresentative(remaining)                  // the first remaining sibling by createdAt, then id - deleteService's rule (decision 1)
plannedEndOf(appointment, representativeExpectedMinutes)                    // scheduledEndDate, else start + the representative's expected duration, else null
extendPlannedEnd(appointment, representativeExpectedMinutes, deltaMinutes)  // -> { scheduledEndDate, extendedMinutes }; a positive delta grows the end from the planned end (or the start); never shrinks (decision 3)
PLANNED_END_RULE_TEXT; describeServiceCancelEffect(service); describeCompositionRefusal(code)   // the sheet's caption, the cancel dialog's description, the client's text for a refusal code

// shared/audit.ts                             AuditAction += "service_cancelled" ("Service cancelled") | "appointment_composition_changed" ("Visit services changed") (decision 5)
// server/service-scheduling-bootstrap.ts      bootstrapAppointmentComposition() - services_appointment_id_idx (partial, where appointment_id is set), printed once; indexExists()

// server/storage.ts
class ServiceCompositionError(status 400 | 403 | 404 | 409, code, message)
AddServiceToAppointmentInput / RemoveServiceFromAppointmentInput / UpdateAppointmentServiceInput / CancelServiceInput   // each with actorRole / actor
serviceAuditSnapshot(service)                  // id, status, appointmentId, lastAppointmentId, assignedTechnicianId, agreementId, serviceTypeId, workKind, expectedDurationMinutes, priceCents, the dates, notes
appointmentAuditSnapshot(appointment, services) // + serviceId, serviceTypeId, scheduledEndDate, notes; services[] through serviceAuditSnapshot (decision 4) - the disposition's rows carry the fuller shape too
addServiceToAppointment(input)                 // a PENDING_SCHEDULING service at the visit's location, or a new MANUAL one (the type's duration and price as defaults, due the visit's day, Pass 24's kind
                                               //   and link rules) -> attachServiceToAppointmentTx: SCHEDULED with the visit's technician; the representative and appointments.serviceTypeId when the visit
                                               //   has none of its own (a dangling serviceId is healed); the planned end + its expected duration; convertPlacementOpportunitiesTx (decision 8); one
                                               //   appointment_composition_changed row { composition: { action: "ADD", serviceId, from: "QUEUE" | "NEW", scheduledEndDateExtendedMinutes, opportunitiesConverted } }
removeServiceFromAppointment(input)            // the RESCHEDULE semantics for one service: PENDING_SCHEDULING, appointmentId null, technician null, lastAppointmentId stamped, dates kept; the representative
                                               //   reassigned (reassignRepresentativeTx); the end untouched; 404 SERVICE_NOT_ON_APPOINTMENT; 409 SERVICE_SETTLED / SERVICE_HAS_TICKET / VISIT_INVOICED /
                                               //   LAST_SERVICE_ON_APPOINTMENT; { action: "REMOVE", representativeReassigned } with the removed service in the after list
updateAppointmentService(input)                // the type (an agreement service: ADJUST_PRICE_AGREEMENT else 403 SERVICE_TYPE_LOCKED; a ticket: 409 SERVICE_HAS_TICKET; an issued invoice: 409; the
                                               //   representative's type follows onto the appointment) and the duration (a longer one extends the end by the difference, a shorter one leaves it); nothing
                                               //   changed writes nothing; { action: "UPDATE", changes: { serviceTypeId?, expectedDurationMinutes? }, scheduledEndDateExtendedMinutes }
cancelService(input)                           // the reason checked before the tx (DISPOSITION_REASON_REQUIRED / _NOT_ON_LIST, 400); 404 unknown; 409 SERVICE_SETTLED / SERVICE_HAS_TICKET; on a live visit:
                                               //   VISIT_INVOICED and the LAST active service 409; a one-time service -> CANCELLED, an agreement service -> PENDING_SCHEDULING with resolveAgreementWindowResetTx
                                               //   (due date and window from today by serviceWindowDays); both: appointmentId null (a stale link to a settled placement too), technician null,
                                               //   lastAppointmentId = the placement (decision 2); the representative reassigned; applyServiceOpportunityChoiceTx(mode CANCEL); one service_cancelled row
                                               //   { before: the service, after: the service + cancel: { reasonCode, notes, opportunity, effect, windowReset, appointmentId, detached, representativeReassigned, opportunities } }
updateService(id, data, context)               // + 409 SERVICE_CANCEL_REQUIRED (a status move to CANCELLED), 409 SERVICE_REMOVE_REQUIRED (appointmentId null, or SCHEDULED -> PENDING_SCHEDULING while placed),
                                               //   403 SERVICE_TYPE_LOCKED (assertServiceTypeUnlocked: an agreement service's type without ADJUST_PRICE_AGREEMENT; a server write with no role always may);
                                               //   an unchanged value echoed by the customer Edit form passes (decision 7)
updateAppointment(id, data, actor?)            // + one appointment_composition_changed { action: "NOTES" } when notes change - B13's instructions edited from the sheet; the scheduling fields stay unaudited (C5.1a)
createAppointment                              // its conversion block is now convertPlacementOpportunitiesTx(tx, serviceId, appointmentId), shared with the add - behavior unchanged
dispositionAppointment                         // its opportunity choice is applyServiceOpportunityChoiceTx and its window reset resolveAgreementWindowResetTx, both shared with cancelService - behavior unchanged
finalizeServiceRecord                          // the allFinalized rollup skips CANCELLED linked services, as getAppointmentBillingGroupTx does (decision 2)

// server/routes.ts (ungated like every appointment write - a gate per route is C5.10's list - except where said)
POST  /api/appointments/:id/services                     // appointmentServiceAddSchema strict, exactly one of serviceId / service (newPlacedServiceSchema strict) -> 201 AppointmentCompositionResult
POST  /api/appointments/:id/services/:serviceId/remove   // -> 200 AppointmentCompositionResult
PATCH /api/appointments/:id/services/:serviceId          // appointmentServiceUpdateSchema strict, at least one field -> 200 AppointmentCompositionResult
POST  /api/services/:id/cancel                           // serviceCancelSchema strict -> 200 ServiceCancelResult; 404 unknown
PATCH /api/services/:id                                  // updateServiceSchema: appointmentId must be a string (null -> 400); the storage refusals answered { code, message }
PATCH /api/appointments/:id                              // passes getAuditActor(req) to updateAppointment
PATCH /api/settings/appointment-cancel-reasons           // requirePermission(MANAGE_SETTINGS) (decision 9); the GET stays open to every role
respondServiceCompositionError(res, err)                 // { message, code }

// client
components/service-cancel-dialog.tsx (new)     // ServiceCancelDialog { service, serviceTypeName, open, onOpenChange, onCancelled } - one dialog for the sheet, the queue and the Services tab: reads the
                                               //   reasons list and the location's open opportunities itself, the reason select / notes / opportunity radios (Update existing when one is open, else
                                               //   Create), describeServiceCancelEffect as the description, POST /api/services/:id/cancel, invalidateAfterServiceCancel(locationId),
                                               //   describeServiceCancelResult as the toast; a refusal code's text shown inline (describeCompositionRefusal)
pages/schedule.tsx                             // AppointmentSheet + serviceTypes, queueCandidates, ticketedServiceIds, canChangeAgreementType, onAddService / onRemoveService / onUpdateService /
                                               //   onCancelService, isComposing; the "Work kind per service" block is the composition block (sheet-composition): per service the type select (disabled with
                                               //   the reason: settled / a ticket / agreement work without the permission), Minutes (committed on blur), the kind badge, the answers line, the price,
                                               //   Remove / Cancel (disabled with the reason on a settled or ticketed service); "Add service" (a select of the location's pending services + Add; a new
                                               //   one-time line with the type's duration and price defaults + Create; PLANNED_END_RULE_TEXT as the caption); the last-service prompt
                                               //   (dialog-last-service -> Reschedule appointment / Cancel appointment / Back); servicesByAppointmentId and the two card fallbacks skip CANCELLED (the
                                               //   "+N other services" and the revenue sums with them); attachServiceToAppointmentMutation and the placement's ?serviceIds= extras go through the add route,
                                               //   one request per service in order; the queue row is a div[role=button] with a Cancel action; ServiceCancelDialog; useAuth for the type gate
pages/customer-detail.tsx                      // ServiceForm: the Edit Service Type select disabled with the reason on an agreement service without ADJUST_PRICE_AGREEMENT (text-service-type-locked);
                                               //   ServicesTab: Cancel beside Edit / Schedule (button-service-row-cancel-*), disabled with the reason (completed / already cancelled / a posted ticket /
                                               //   the only service on its live visit), ServiceCancelDialog
pages/settings.tsx                             // the Appointment Cancel / Reschedule Reasons card: textarea and Save disabled for everyone but an admin, "Only an admin can change this list."
```

Behavior worth knowing before the next pass touches it - the decisions, numbered as the handoff asked:
- **(1) The representative follows the first remaining sibling.** `appointments.serviceId` is read
  by the resolver (it appends the row it names whatever its `appointmentId`), by the generic PATCH's
  sync (which would re-link an unlinked representative) and by `completeService`'s fallback, so it
  is never nulled while a service remains: a remove or a cancel of the representative reassigns it
  to the first remaining active sibling by creation (`pickRepresentative`, deleteService's rule) and
  moves `appointments.serviceTypeId` with it, since the board's card and the sheet's title read
  that. A service added to a visit whose `serviceId` names nothing of its own (null, or a dangling
  id) becomes the representative, which heals the 13 dangling pointers on the dev DB one visit at a
  time. The disposition still leaves `serviceId` as history on a CANCELED placement.
- **(2) A cancelled service leaves a live visit.** `finalizeServiceRecord`'s `allFinalized` counted
  every linked service, CANCELLED included, while the billing group excluded them - a one-time
  service cancelled off a live visit under the disposition's convention (CANCELLED, still linked)
  would have held the visit open forever. Both: `cancelService` detaches the service (`appointmentId`
  null, `lastAppointmentId` the placement, the technician cleared) and the rollup now skips
  CANCELLED like the billing group, so a legacy linked row cannot block a visit either (verified: a
  CANCELLED service re-linked by SQL, the visit still COMPLETED on the last finalize). The
  disposition's own convention is untouched - it cancels the appointment too, so nothing rolls up.
- **(3) The planned end grows and never shrinks.** `scheduledEndDate` was written only by the client
  (placement = slot + the representative's expected duration; the move confirm; the sheet's End).
  Now an add extends it by the added service's `expectedDurationMinutes` (from the planned end, or
  from the start when no end and no representative duration is known), a longer duration extends it
  by the difference, and a removal or a shorter duration leaves it - the office shortens it on the
  sheet, whose Add block says so (`PLANNED_END_RULE_TEXT`). Every result reports
  `scheduledEndDateExtendedMinutes`; the toasts read it.
- **(4) The audit snapshot is fuller.** `appointmentAuditSnapshot` carries `serviceId`,
  `serviceTypeId`, `scheduledEndDate` and `notes`, and each service's `serviceTypeId`, `workKind`,
  `expectedDurationMinutes`, `priceCents` and `notes` (`serviceAuditSnapshot`, shared with
  `service_cancelled`), so a composition change diffs on the History tab; Pass 27's disposition rows
  written from now on carry the same shape (older rows keep theirs). A removed service stays in the
  after list with `appointmentId` null, so the diff shows it leaving.
- **(5) Two actions.** `service_cancelled` on the service (one row per cancel, placed or pending)
  and `appointment_composition_changed` on the appointment for add / remove / type / duration /
  notes - one row per request, `composition.action` naming which (ADD / REMOVE / UPDATE / NOTES).
  The location History collects both (services and appointments were already rolled in).
- **(6) Gates.** Add, remove, duration and notes are ungated like the disposition and every other
  appointment write (who may: no permission yet, listed under C5.10); an agreement service's **type** is
  `ADJUST_PRICE_AGREEMENT` (the price's rule, Pass 24's precedent for the kind), refused 403
  `SERVICE_TYPE_LOCKED` - 403 rather than the handoff's suggested 409 because it is a role refusal,
  the codebase's convention (WORK_KIND_FORBIDDEN, SURCHARGE_FORBIDDEN); the outright cancel follows
  the disposition - ungated, the reason required.
- **(7) The type lock holds on the generic PATCH too.** Nothing locked `serviceTypeId` on an
  agreement service before: the customer Edit form offered it to every role and `updateService`
  wrote it. `assertServiceTypeUnlocked` refuses a *change* without the permission on the PATCH and on
  the composition route alike (an unchanged value echoed by the form passes; a server-driven write
  with no role always may), and the Edit form's Select is disabled with the reason. Also refused on
  the PATCH now: a status move to CANCELLED (409 `SERVICE_CANCEL_REQUIRED`), `appointmentId: null`
  (400 - the schema takes a string only) and SCHEDULED -> PENDING_SCHEDULING while placed (409
  `SERVICE_REMOVE_REQUIRED`) - each was an unaudited, reason-less lifecycle write any client could
  make, and each now has its own route.
- **(8) Every landing converts.** `createAppointment` converted the representative's open
  RESCHEDULE / CANCELLATION_REVIEW opportunities only; the attach PATCH converted none, so a requeued
  service re-placed as an extra kept its OPEN handoff row. The block is one helper,
  `convertPlacementOpportunitiesTx`, called at creation and by every add (verified: a seeded OPEN
  handoff opportunity on a re-added service reads CONVERTED with its activity and communication
  rows, `opportunitiesConverted` 1). **Decided:** the board's queue-then-card attach *and* the
  grouped placement's `?serviceIds=` extras go through the add route too, one request per service
  in order - one path for a service landing on a visit, so the end date, the conversion and the
  audit row apply everywhere; a failed extra is reported on the placement toast.
- **(9) The reasons list's write is `MANAGE_SETTINGS`**, like the reopen list; the Settings card is
  disabled for everyone else. Reads stay open - three dialogs fill from it.
- **An agreement service is recycled, never cancelled outright.** The row's own words: from the
  queue or a visit, `cancelService` on an agreement service returns it to PENDING_SCHEDULING with
  its due date and window reset from today (the disposition's B2 refinement) and runs the
  opportunity choice (RESCHEDULE / AGREEMENT) - a "push this visit out" with a reason. The dialog
  says so and its button reads "Recycle service". Ending the plan is the agreement cancellation
  workflow (Phase 9).
- **What refuses, and why.** A service with a posted ticket cannot be removed, cancelled or re-typed
  on the sheet (`SERVICE_HAS_TICKET`: the work happened, and the ticket flow - reopen, the office
  edit - owns it; its duration may still change); a settled service is history
  (`SERVICE_SETTLED`); a CANCELED or COMPLETED appointment is not composable
  (`APPOINTMENT_NOT_COMPOSABLE`; its notes still edit through the generic PATCH); an issued invoice
  on the visit freezes add / remove / cancel / type (`VISIT_INVOICED`; a DRAFT is re-priced at issue
  and does not); a new service on a visit is one-time MANUAL work at the visit's location (an
  agreement's visits are generated, never typed onto a card), so the sheet's "New one-time service"
  line offers no agreement.
- **Not touched:** C4.3b's technician-side composition (the field's Add service, the review flag -
  see the Pass 29 handoff for what exists), C4.4's crew and preferred technician, the board's move
  and placement UX beyond routing attach and the extras through the add route, an appointment
  cancellation policy (Phase 9), `cancelAgreement`'s direct CANCELED write (noted in canon §11, left
  as it is), the Services-tab reopen defect (`reopenTicketMutation` posts `{ reason }` from
  `window.prompt`, but the reopen route's strict schema needs `reasonCode` since Pass 17 - the
  Services-tab Reopen has been broken since then; noted, left), a permission on the cancel (listed under C5.10; Passes 37 and 39 gated nothing here). Cancelling a service still
  linked to a CANCELED placement clears that stale link too. The Services tab's Cancelled row shows
  the appointment's reason only (a per-service cancel's reason is on the History tab, not on the
  row - the service has no reason column).
- **Verified 2026-09-29** (PORT=5001 against a copy of the dev DB, `pestflow_verify`, dropped
  afterwards; the shared DB untouched - no index, no new audit action): `npm run check` clean; boot
  1 printed the migration's one line (the partial index, 91 placed services) with every one of the
  46 table counts unchanged; 128 API / SQL assertions as the four roles - the pure module (the end
  grows from the planned end or the start, never shrinks, stays null when nothing is known; the
  representative by creation then id; the refusal texts); a fixture customer with two locations, an
  agreement (window 7) and services placed through the real routes: a one-time service placed
  (end = start + 60), a queued one added as support (end + 30, SCHEDULED with the visit's
  technician, the ADD row by "Heritage Support" with the fuller snapshot), a new one created placed
  as manager (MANUAL, due the visit's day, end + 15) and another taking the type's duration and
  price; the add refusals (already on the visit, another location, both / neither / an unknown key
  400, an unknown appointment 404, an unknown type, a CALLBACK without its answer); the notes PATCH
  writing one NOTES row by "Heritage Admin" and an identical PATCH none; the type change on a
  one-time service (the UPDATE row's `changes`), 15 -> 45 minutes extending the end by 30 and
  45 -> 10 leaving it, an unchanged duration writing nothing, an unknown field / an empty body 400,
  a service off the visit 404; an agreement service added and its type refused 403 for support and
  the technician, allowed for the manager, the same on the generic PATCH (an unchanged type passing
  for the technician, the admin allowed), its duration ungated; the generic PATCH refusing status
  CANCELLED (409), `appointmentId: null` (400) and PENDING_SCHEDULING while placed (409) and passing
  an unchanged status; remove of a non-representative (PENDING_SCHEDULING, detached,
  `lastAppointmentId`, no technician, the end unchanged, the REMOVE row by "Heritage Tech" showing
  it leave), of the representative (reassigned to the first remaining by creation with its type),
  again 404, of the agreement service (dates kept), of the LAST one 409 with the code; a seeded OPEN
  handoff opportunity CONVERTED by a re-add with its activity and communication rows; the cancel
  refusals (a reason off the list, no reason, an unknown choice, an extra key); the cancel of one of
  two (the representative, one-time) as support: CANCELLED, detached, `lastAppointmentId`, the
  representative moved, a WINBACK / ONE_TIME "Win-back" row (`APPOINTMENT_CANCELLATION_WINBACK`) and
  the `service_cancelled` row with the reason, the effect and the visit; cancelling it again 409, and
  adding it back 409; a posted ticket refusing cancel / remove / type (409 SERVICE_HAS_TICKET) while
  the duration still changes; the CANCELLED service re-linked by SQL and the visit still going
  COMPLETED when the second ticket finalized; a COMPLETED visit refusing an add and a COMPLETED
  service refusing a cancel; the outright cancel of a pending one-time service with NONE (CANCELLED,
  not detached, no opportunity, the row by "Heritage Manager") and of a pending agreement service
  with CREATE (REQUEUED, due today, window today .. today + 7, a RESCHEDULE / AGREEMENT row) then
  with UPDATE_EXISTING (the open row re-dated, two rows by "Heritage Admin"), an unknown service 404;
  the reasons PATCH 403 for support and manager, 200 for admin with the same list; the location
  History read carrying both actions; 18 composition rows (6 ADD, 2 NOTES, 6 UPDATE, 4 REMOVE) and
  4 `service_cancelled` rows, every one with an actor label; every fixture deleted and every count
  back at the run's start (`session` up by the run's four logins); boot 2 printed only the serving
  line with every count unchanged; Vite 200 with the new symbols on the three pages, the new
  component and, under `/@fs/`, the new shared module and the audit vocabulary. **Nothing was
  rendered in a browser** - the repo has no browser automation and the session had no browser - so
  the sheet's composition block, the last-service prompt, the queue's Cancel, the Services tab's
  Cancel, the Edit form's disabled type and the cancel dialog itself reach the owner first.
- **Owner's first render, 2026-09-30 (before merge):** the Appointment Details sheet could not be
  scrolled - the shadcn `SheetContent` is pinned to the viewport's height (`inset-y-0 h-full`) with
  no overflow rule, and the composition block pushed Save / Cancel appointment / Reschedule below the
  fold. Second commit on the branch: `overflow-y-auto` on the sheet (`sheet-appointment-details`),
  the pattern the technician's Appointment Details dialog (`max-h-[92vh] overflow-y-auto`) already
  used. The note-history sheet on the customer screen (`customer-detail.tsx`, the same
  `SheetContent` shape) has the same exposure with a long revision list and was left as it is.

**Shipped in Pass 29** (`feature/phase-4-field-composition`, 2026-10-02) — the C4.3b row as built,
plus the eight decisions the handoff asked for.

```ts
// shared/schema.ts                            services += addedInFieldByUserId (users FK, nullable, never cleared), fieldReviewedAt, fieldReviewedByUserId (users FK), fieldReviewedByLabel - all
//                                             server-written (insertServiceSchema omits the four); the generic PATCH cannot set them
// server/service-scheduling-bootstrap.ts      bootstrapFieldComposition() - the four columns + services_added_in_field_idx (partial, where set), printed once; no backfill
// shared/audit.ts                             AuditAction += "field_service_reviewed" ("Field-added service reviewed"); an ADD's composition carries origin / flagged / nextStop

// shared/appointment-composition.ts
COMPOSITION_ORIGINS = ["OFFICE", "FIELD"]; CompositionOrigin           // AppointmentServiceAddRequest.origin? (default OFFICE)
NextStopRef { appointmentId, scheduledDate, plannedEnd, overlapped }     // AppointmentCompositionResult += flagged: boolean, nextStop: NextStopRef | null (null on remove / update, no technician, the day's last visit)
NEXT_STOP_OVERLAP (409) / FIELD_ADD_NEW_ONLY (400) / FIELD_ACTOR_REQUIRED (400) / SERVICE_INSTRUCTIONS_LOCKED (403) / SERVICE_NOT_FIELD_ADDED (409) / SERVICE_FIELD_REVIEWED (409)
overlapsNextStop(plannedEnd, nextStart, extendedMinutes)                // true only when an extension ran the end past the next stop's start (an add that extends nothing cannot overlap)
describeNextStopOverlap(nextStart, plannedEnd)                          // the 409's message, both times named - built on the server, shown by the field as sent (describeCompositionRefusal returns null for the code)
describeNextStopWarning(nextStop)                                       // the office's toast when its own add ran past the next stop
FieldReviewFields; isFieldAdded(service); needsFieldReview(service); describeFieldAddedService(service)   // the badge's rules and title
FIELD_ADD_RULE_TEXT                                                     // the technician's Add service caption
describeCompositionRefusal(code)                                        // + FIELD_ADD_NEW_ONLY, SERVICE_INSTRUCTIONS_LOCKED, SERVICE_NOT_FIELD_ADDED, SERVICE_FIELD_REVIEWED

// server/storage.ts
AddServiceToAppointmentInput.origin?; FieldReviewServiceInput { serviceId, actor }
serviceAuditSnapshot(service)                  // + addedInFieldByUserId, fieldReviewedAt; fieldReviewSnapshot(service) - the four columns, field_service_reviewed's shape
nextStopTx(tx, appointment)                    // the next not-CANCELED placement of the same technician after this visit on its day (local midnight to midnight, getTechnicianWork's day); null without a technician
resolveNextStopTx(tx, appointment, representative, deltaMinutes)   // -> NextStopRef | null: the shared extendPlannedEnd against the next stop
addServiceToAppointment(input)                 // origin FIELD: serviceId -> 400 FIELD_ADD_NEW_ONLY; no actor userId -> 400 FIELD_ACTOR_REQUIRED; a new service's would-be end checked BEFORE the insert and
                                               //   refused 409 NEXT_STOP_OVERLAP (nothing written); addedInFieldByUserId stamped from the actor; origin OFFICE (default) unchanged except nextStop reported;
                                               //   composition += { origin, flagged, nextStop }; result += { flagged, nextStop }
updateService(id, data, context)               // + 403 SERVICE_INSTRUCTIONS_LOCKED: actorRole technician, notes changed, addedInFieldByUserId not the actor's userId (the office's roles are not held to it)
markServiceFieldReviewed(input)                // 409 SERVICE_NOT_FIELD_ADDED / SERVICE_FIELD_REVIEWED; stamps fieldReviewedAt / ByUserId / ByLabel from the actor; one field_service_reviewed row on the service

// server/routes.ts
POST /api/appointments/:id/services            // body += origin: "OFFICE" | "FIELD" (optional); open to every role
POST /api/services/:id/field-review            // requirePermission(FINALIZE_TICKET) -> 200 Service; 404 unknown; the composition refusals mapped

// client
components/field-added-badge.tsx (new)         // FieldAddedBadge { service } ("Field-added - review" amber while needsFieldReview, "Field-added" once reviewed, the title names who / when; nothing for an
                                               //   office service); MarkFieldReviewedButton { service, onReviewed? } (renders only when the review is needed AND the user holds FINALIZE_TICKET; POST
                                               //   .../field-review; invalidateAfterFieldReview: services, by-location, appointments, service-records, audit-logs)
pages/technician-work.tsx                      // the Appointment Details' Linked Services: each row's type name is a button (button-tech-service-edit-*) opening the row's editor (tech-service-editor-*): a
                                               //   type Select on non-agreement, un-ticketed, active work (PATCH /api/appointments/:id/services/:serviceId) else the locked label "(agreement locked)" with
                                               //   the reason; an Instructions textarea + Save (PATCH /api/services/:id { notes }) only when service.addedInFieldByUserId === user.id, else read-only with the
                                               //   reason; every row shows ServiceWorkKindBadge, an Agreement badge, FieldAddedBadge and "<n> min planned"; "Add service" (button-tech-add-service) opens a
                                               //   compact form (type -> the type's minutes and price as defaults, instructions; FIELD_ADD_RULE_TEXT) posting { origin: "FIELD", service }; a refusal shows
                                               //   inline (text-tech-add-error - NEXT_STOP_OVERLAP's message names the times); the editor and the form reset when the visit changes or closes; refreshWork
                                               //   also invalidates /api/services, /api/services/by-location and /api/audit-logs; "Appointment Notes" unchanged (read-only)
pages/schedule.tsx                             // the composition row: FieldAddedBadge + MarkFieldReviewedButton; the add toasts append describeNextStopWarning (the queue-then-card attach reads the last result's)
pages/customer-detail.tsx                      // ServicesTab row: FieldAddedBadge under the status, MarkFieldReviewedButton first in the actions
pages/service-ticket-review.tsx                // the queue row and the modal header: FieldAddedBadge; the modal: MarkFieldReviewedButton beside the status badge
```

Behavior worth knowing before the next pass touches it - the decisions, numbered as the handoff asked:
- **(1) What "flagged for office review" is.** A nullable `services.addedInFieldByUserId` (users FK,
  stamped by a FIELD add, never cleared) plus the office's review stamp `fieldReviewedAt` /
  `fieldReviewedByUserId` / `fieldReviewedByLabel` (the ticket's flagged* shape). "Flagged" is the
  first set with the second null - a derived state, no boolean. Not a `reviewRequired` boolean: the
  identity is needed anyway for decision (6) (who may edit the instructions), a boolean loses who added
  it and who reviewed it and when, and one column carrying two facts cannot disagree with itself. The
  ticket's `FLAGGED_FOR_REVIEW` is untouched - it stays the invoice-driven flag canon §12 defines.
- **(2) Identity.** The session user (`getAuditActor(req).userId`), never the technician picker: no
  technician row is linked to a user on the dev DB (0 of 2) and the work route checks nothing against
  the session, so the picker cannot carry identity. The instructions gate compares
  `addedInFieldByUserId` to the actor's user id. `GET /api/technicians/:id/work` stayed open until
  Pass 38 (C5.7 merged the identities: the page defaults to the session user and another
  technician's day needs `VIEW_OTHER_TECHNICIAN_WORK`). A FIELD
  add with no session user is refused (400 `FIELD_ACTOR_REQUIRED`) rather than flagged anonymously.
- **(3) The overlap rule.** A server check inside the add, for origin FIELD: the technician's next
  stop is the next placement (isBoardPlacement's rule, not CANCELED) assigned to the same technician
  after this visit on the visit's day, read as `getTechnicianWork` reads the day (local midnight to
  midnight - the day's list IS the next-stop source, and a stop on another day is never consulted);
  the would-be end is `extendPlannedEnd` (a visit with no `scheduledEndDate` falls back to the
  representative's duration, as the board reads it); 409 `NEXT_STOP_OVERLAP` when the extension would
  run that end past the next stop's start, checked before the insert so nothing is written. An add
  that extends nothing (0 minutes) cannot overlap. An end that already runs past the next stop refuses
  any further extension - the office shortens or moves from the sheet. **The office's add is never
  refused** (B13 gives the constraint to the field) **but it is told**: every add's result and audit
  row carry `nextStop` and the sheet's toast says "The visit now runs to X, past the technician's next
  stop at Y" - the warning the handoff asked about, cheap because the server computes the next stop
  for both origins anyway.
- **(4) How the field reaches the route.** `origin: "FIELD"` on the body of the existing add route,
  default OFFICE - not a separate route: the same transaction, the same refusals, the same
  `appointment_composition_changed` row (now carrying `origin` and `flagged`), the disposition's
  precedent for an origin. FIELD turns on the one-time-only rule (a new MANUAL service at the visit's
  location; a `serviceId` - the queue's, agreement or not - is 400 `FIELD_ADD_NEW_ONLY` before anything
  is read), the stamp and the next-stop check. The origin is open to every role: it describes the
  surface, and an office user on the technician page is flagged like a technician (verified) - the
  flag is the control, not the role.
- **(5) The type edit on click.** The row's type name opens an editor; a Select on non-agreement,
  un-ticketed, active work posts the C4.3a PATCH (`PATCH /api/appointments/:id/services/:serviceId`);
  the technician role is enough (the route is ungated; `SERVICE_TYPE_LOCKED` and `SERVICE_HAS_TICKET`
  are the server's). An agreement service shows the locked label "(agreement locked)" with the reason,
  as the ticket dialog does. The field's generic-PATCH type lock from Pass 28 still holds.
- **(6) Instructions.** `services.notes` - the Service's own "Instructions", never `appointments.notes`
  ("Appointment Notes", read-only in the field, edited on the sheet as B13's order instructions). The
  generic `PATCH /api/services/:id` now refuses a technician's notes change unless
  `addedInFieldByUserId` is theirs (403 `SERVICE_INSTRUCTIONS_LOCKED`; an unchanged value passes; the
  office's roles are not held to it; a server write with no role may). Before this pass a technician
  could PATCH any service's notes. The stamp is never cleared, so the technician keeps editing their
  own service's instructions after the office's review.
- **(7) What the row shows.** The kind badge (`ServiceWorkKindBadge`, the sheet's), an Agreement
  marker (so the locked type reads as a rule, not a defect), the field-added badge, and the planned
  duration ("45 min planned"); the price stays `ServiceBillingBlock` (Price / COA / Due today, D6).
  The answers line is NOT shown: the day's read carries the service rows but not the service a
  callback answers, and resolving it is the sheet's location-wide map - a CALLBACK reads its kind badge.
- **(8) Gates.** No new permission (`POST_SERVICE_TICKET` is held by every role and was read by nothing until Pass 39 gated the ticket post with it;
  "add a service in the field" would be a fifth technician permission nothing else reads). The add is
  open with the flag as the control (no permission yet - listed under C5.10). The one gate added is on the
  **review**: `POST /api/services/:id/field-review` is `FINALIZE_TICKET` (support and above - the
  office's review permission), so a technician cannot clear their own flag; the button renders only
  for a holder and only while the review is owed (dev behavior rule 6).
- **Where the review is reachable.** The dispatch sheet's composition row, the location's Services tab
  row and the Service Ticket Review modal (the ticket of a field-added service is the office's natural
  review moment) - one `FieldAddedBadge` and one `MarkFieldReviewedButton` component for all three and
  the technician's own row (badge only). The badge reads "Field-added - review" (amber) while owed and
  "Field-added" (quiet) once reviewed, the title naming who and when.
- **Not touched:** the technician picker and a session check on the work route (C5.7 - built in Pass 38), a gate on the
  add (C5.10), crew (C4.4), the ticket dialog's own type / price edit at post, `cancelAgreement`'s
  direct CANCELED write (canon §11 still notes it), the Services-tab reopen defect (`reopenTicketMutation`
  still posts `{ reason }`, broken since Pass 17 - noted a third time, left), the office's add
  (unchanged except the nextStop report), duration from the field (B13: not edited there), a field
  cancel of one service (the alias route is the field's cancel; `ServiceCancelDialog` stays reusable).
- **Verified 2026-10-02** (PORT=5001 against a copy of the dev DB, `pestflow_verify`, dropped
  afterwards; the shared DB untouched): `npm run check` clean; boot 1 printed Pass 29's one migration
  line (the four columns and the partial index) - and NOT Pass 28's index line, because the owner's
  restart after PR #98 had already created it on the shared DB (the handoff expected both) - with every
  one of the 46 table counts unchanged; 103 API / SQL assertions as the four roles, first run: the pure
  module (overlap only with an extension and past the start, equal does not overlap, the texts, the
  badge rules, the audit label); a fixture customer with two locations, an agreement and six services
  placed through the real routes on a day in 2027 the technician had nothing on - A1 10:00-11:00, A2
  11:30-12:00, A4 15:00 with no planned end, A5 16:15-16:45, A6 17:00 with no technician; the FIELD
  add of 20 min on A1 as the technician: 201, flagged, end extended to 11:20, `nextStop` A2 not
  overlapped, the service MANUAL at 7500 with its instructions, `addedInFieldByUserId` the technician
  user's, the ADD row by "Heritage Tech" with origin FIELD / flagged / nextStop and the stamp in its
  snapshot; the FIELD add of 30 min: 409 `NEXT_STOP_OVERLAP` naming 11:30 and 11:50, with the services,
  the end and the audit log unchanged; the office's add of the same 30 min as support: 201, not flagged,
  the end 11:50 and `nextStop.overlapped` true (the warning), the row origin OFFICE; the office's
  queue add of the agreement service reported the next stop too; an explicit origin OFFICE behaving as
  the default; a FIELD add naming a queued service (one-time or at another location) 400
  `FIELD_ADD_NEW_ONLY` while the office's cross-location add stays 409 `SERVICE_LOCATION_MISMATCH`; an
  unknown origin 400; a FIELD add by support flagged with support's id; the type change on the field
  service as the technician 200, on the agreement service 403 `SERVICE_TYPE_LOCKED` then 200 as manager,
  on the office's one-time service 200; the technician's notes PATCH on their own field service 200, on
  the office's services 403 `SERVICE_INSTRUCTIONS_LOCKED` (unchanged notes passing, a duration PATCH
  passing), support's notes PATCH on both 200; the review as the technician 403, on an office service
  409 `SERVICE_NOT_FIELD_ADDED`, unknown 404, as support 200 with the stamp and label "Heritage
  Support" and its `field_service_reviewed` row (before null, after stamped), again 409
  `SERVICE_FIELD_REVIEWED`, the technician still editing the reviewed service's instructions; the
  technician's day read listing the four assigned visits in order with the new fields on every row;
  the no-end visit: +20 refused (16:20 past 16:15, the end still null), +10 accepted with the end now
  stored at 16:10, +0 accepted with nothing extended; the day's last visit and the technician-less
  visit: `nextStop` null, the type's duration and price as defaults; the generic PATCH still refusing
  CANCELLED / `appointmentId` null / PENDING_SCHEDULING while placed and ignoring the stamp columns; a
  field-added service removable to the queue with its stamp kept; the location History carrying
  `field_service_reviewed`; audit totals A1 = 9 (4 ADD, 3 UPDATE, 2 REMOVE), the other visits 4 ADD,
  1 review, every row with an actor label; five stamped services, four still owed a review; the
  partial index present; every fixture deleted and every count back at the run's start (`session` up
  by the run's four logins); boot 2 printed only the serving line with every count unchanged; Vite 200
  with the new symbols on the four pages, the new component and, under `/@fs/`, the shared module and
  the audit vocabulary. **Nothing was rendered in a browser** - the repo has no browser automation and
  the session had no browser - so the technician's row editor, the Add service form and its inline
  refusal, the badge on four surfaces and the Mark reviewed button reach the owner first.

**Shipped in Pass 30** (`feature/phase-4-technician-preferences-crew`, 2026-10-03) — the C4.4 row as
built, plus the eight decisions the handoff asked for.

```ts
// shared/schema.ts                            technicianPreferences (technician_preferences: id, orgId, scopeType, accountId -> accounts, locationId -> locations, technicianId -> technicians,
//                                             kind, note, createdByUserId -> users, createdAt, updatedAt); appointmentTechnicians (appointment_technicians: id, orgId, appointmentId -> appointments,
//                                             technicianId -> technicians, role, createdByUserId -> users, createdAt); types TechnicianPreference, AppointmentTechnician
// server/service-scheduling-bootstrap.ts      bootstrapTechnicianPreferencesAndCrew() - both tables, technician_preferences_account_uidx (account_id, technician_id) WHERE scope ACCOUNT,
//                                             technician_preferences_location_uidx (location_id, technician_id) WHERE scope LOCATION, appointment_technicians_member_uidx (appointment_id,
//                                             technician_id), appointment_technicians_lead_uidx (appointment_id) WHERE role LEAD, appointment_technicians_technician_idx; the LEAD backfill
//                                             (one row per appointment with a technician) only when the table is created; each printed once
// server/tenancy-bootstrap.ts                 TABLES_REQUIRING_ORG_ID += technician_preferences, appointment_technicians
// shared/permissions.ts                       OVERRIDE_TECHNICIAN_EXCLUSION (manager, admin)
// shared/audit.ts                             AuditAction += technician_preference_set, technician_preference_cleared, placement_exclusion_overridden, appointment_crew_changed (no new entity type)

// shared/technician-preferences.ts (new)
TECHNICIAN_PREFERENCE_KINDS = ["PREFERRED", "EXCLUDED"]; TECHNICIAN_PREFERENCE_SCOPES = ["ACCOUNT", "LOCATION"]; MAX_..._NOTE_LENGTH / MAX_EXCLUSION_OVERRIDE_REASON_LENGTH = 500
TechnicianPreferenceFields / TechnicianPreferenceView (+ technicianName, createdByUserId, createdAt) / EffectiveTechnicianPreference { technicianId, technicianName, kind, note, preferenceId, scopeType, inherited }
LocationTechnicianPreferences { locationId, accountId, isPrimaryLocation, locationRows, accountRows, effective }; TechnicianPreferenceSetRequest { technicianId, kind, note?, scope? }; ExclusionOverrideRequest { reason }
resolveEffectivePreferences(rows, { locationId, accountId }, names)   // per technician: the LOCATION row, else the ACCOUNT row (inherited); other scopes ignored; EXCLUDED first, then by name
findExclusion(effective, technicianId); preferredTechnicians(effective); describePreferredHint(effective) ("Prefers A, B" | null)
describePreferenceChip(kind, name) ("Prefers X" / "Never X"); describePreferenceScope(scopeType); describePreferenceTitle(entry); describeExclusionRefusal(name, scopeType)
TECHNICIAN_EXCLUDED (409) / EXCLUSION_OVERRIDE_FORBIDDEN (403) / EXCLUSION_OVERRIDE_REASON_REQUIRED (400) / ACCOUNT_SCOPE_PRIMARY_ONLY (409) / LOCATION_HAS_NO_ACCOUNT (409) /
  TECHNICIAN_NOT_FOUND (404) / PREFERENCE_NOT_FOUND (404); describeTechnicianPreferenceRefusal(code); TechnicianExcludedRefusal (the 409 body)

// shared/appointment-crew.ts (new)
APPOINTMENT_CREW_ROLES = ["LEAD", "SUPPORT"]; AppointmentCrewMember { technicianId, technicianName, role, createdAt }; AppointmentCrew { appointmentId, members (lead first) }
CREW_LEAD_REQUIRED (409) / CREW_MEMBER_EXISTS (409) / CREW_LEAD_NOT_REMOVABLE (409) / CREW_MEMBER_NOT_FOUND (404) / CREW_NOT_EDITABLE (409); describeCrewRefusal(code); describeCrew(members)

// server/storage.ts
PlacementRefusedError(status, code, message, exclusion); TechnicianPreferenceError; AppointmentCrewError; PlacementOptions { overrideExclusion?, actorRole?, actor? }
createAppointment(data, options?)              // assertPlacementAllowedTx BEFORE the insert; syncCrewLeadTx after it; the override row after the write
updateAppointment(id, data, actor?, options?)  // the check only when assignedTechnicianId changes (an unchanged technician is never re-checked); syncCrewLeadTx when it changed
assertPlacementAllowedTx(tx, { locationId, technicianId, options })   // -> { exclusion, reason } | null; 409 / 403 / 400 thrown before any write; an override with nothing excluded is ignored
recordExclusionOverrideTx(tx, { appointment, override, via: CREATE | UPDATE | CREW_ADD, previousTechnicianId?, actor })   // placement_exclusion_overridden on the appointment
getLocationTechnicianPreferences(locationId); getEffectiveTechnicianPreferences(locationIds)   // the location read; the board's { [locationId]: effective } (empty locations omitted)
setTechnicianPreference({ locationId, technicianId, kind, note, scope, actor })   // ACCOUNT: 409 LOCATION_HAS_NO_ACCOUNT / ACCOUNT_SCOPE_PRIMARY_ONLY; upsert by (scope row, technician);
                                               //   an unchanged set writes nothing; technician_preference_set on the location (LOCATION) or the location's customer (ACCOUNT)
clearTechnicianPreference({ locationId, preferenceId, actor })   // the row must apply to the location (404 otherwise); an ACCOUNT row from the primary only; technician_preference_cleared
syncCrewLeadTx(tx, appointmentId, leadTechnicianId)   // LEAD mirrors assignedTechnicianId; a promoted support loses its SUPPORT row; null -> no LEAD
getAppointmentCrew(id); addAppointmentCrewMember({ appointmentId, technicianId, overrideExclusion?, actorRole?, actor? }); removeAppointmentCrewMember({ appointmentId, technicianId, actor })
                                               //   CANCELED / COMPLETED -> CREW_NOT_EDITABLE; add: no lead -> CREW_LEAD_REQUIRED, member -> CREW_MEMBER_EXISTS, then the exclusion check;
                                               //   remove: the lead -> CREW_LEAD_NOT_REMOVABLE; one appointment_crew_changed row each ({ crew } before / after + change { action, technician, role })
getTechnicianWork(technicianId, date)          // + the visits the technician supports (a SUPPORT row); TechnicianWorkVisit += crewRole (LEAD | SUPPORT), crew

// server/routes.ts
POST /api/appointments, PATCH /api/appointments/:id   // body += overrideExclusion?: { reason } (strict, taken off before the write); respondPlacementRefused (code + technicianId,
                                               //   technicianName, preferenceId, scopeType, note)
GET / POST /api/appointments/:id/crew; DELETE /api/appointments/:id/crew/:technicianId   // ungated like every appointment write
GET / PUT /api/locations/:id/technician-preferences; DELETE /api/locations/:id/technician-preferences/:preferenceId   // open to every role
GET /api/technician-preferences/effective?locationIds=a,b   // the board's map (at most 500 ids)

// client
components/technician-preferences.tsx (new)   // useLocationTechnicianPreferences, invalidateTechnicianPreferences, TechnicianPreferenceChips, TechnicianPreferencesEditor (live; the primary's
                                               //   "Apply to all locations" checkbox), TechnicianPreferenceDraftEditor (Add Location), getTechnicianExcludedRefusal, useCanOverrideExclusion,
                                               //   ExclusionOverridePrompt (the reason dialog)
pages/customer-detail.tsx                      // AddLocationDialog: the draft list, written (PUT, LOCATION) after the location is created; EditLocationDialog: the live editor above "Set as Primary
                                               //   Location" (the form now scrolls, max-h 75vh); the header card's chip row: the account's rows; the location profile card: the effective chips
                                               //   (row-location-technician-preferences), inherited marked "(all locations)"
pages/schedule.tsx                             // the effective map for the queue's and the sheet's locations; the queue row's text-queue-preferences-*; the sheet's select marks "excluded by the
                                               //   customer" / "preferred", the hint and the exclusion warning; AppointmentCrewBlock (sheet-crew); scheduleMutation and updateAppointmentMutation
                                               //   open ExclusionOverridePrompt on a 409 for a manager and resend with the reason (anyone else: the toast)
pages/technician-work.tsx                      // a SUPPORT visit's card: dashed, not clickable, "Support" badge, "Supporting <lead> - the lead posts the ticket"; a lead's card names its support crew
```

Behavior worth knowing before the next pass touches it - the decisions, numbered as the handoff asked:
- **(1) The table shape.** As recommended: one org-scoped `technician_preferences` with an
  `updatedAt` beside `createdAt` (a set over an existing row changes its kind and note in place - one
  technician has one row per scope, the partial unique indexes, so a row's kind IS the answer for
  that scope). FKs to `accounts`, `locations`, `technicians` and `users`: the boot-order worry
  (`customer_notes.account_id` went without one) does not bite, because `accounts` and `locations` are
  never created by a bootstrap - they come from `db:push`, which creates this table too - so on any
  database this code boots against both exist when the scheduling bootstrap runs. The vocabulary and
  the resolve rule are `shared/technician-preferences.ts`. No seed.
- **(2) The scope reach.** A location reaches its account through `locations.accountId` (all 14 set on
  the dev DB); "customer-level" (D8) is the ACCOUNT row (`customers` has no account column;
  `accounts.legacyCustomerId` is 1:1). The primary location's Edit Location carries "Apply to all
  locations", which writes the ACCOUNT row; every other editor writes the LOCATION row. The server
  holds the rule too: an ACCOUNT row is written and cleared from the primary location only (409
  `ACCOUNT_SCOPE_PRIMARY_ONLY`), and a location without an account cannot have one (409
  `LOCATION_HAS_NO_ACCOUNT`). **The location's row wins** for the same technician, either way: a
  location PREFERRED lifts an account-wide exclusion there (verified), a location EXCLUDED blocks a
  technician the account prefers. The chips: the header card shows the account's rows ("Never John
  Doe"); the location card shows what applies at that location, an inherited row marked "(all
  locations)"; the editor labels each row "This location", "This location - overrides all locations",
  "All locations" or "All locations - overridden here". The title of every chip is the origin and the
  note.
- **(3) Where the hard block sits.** In `createAppointment`'s transaction before the insert, and in
  `updateAppointment` only when `assignedTechnicianId` changes - an unchanged technician is never
  re-checked, so the sheet's Save on a visit placed before the exclusion was recorded still saves (the
  sheet says "placed before the exclusion was recorded"). `PlacementRefusedError` -> 409
  `TECHNICIAN_EXCLUDED` with the technician, the preference row, its scope and note; nothing is written.
  The override is `{ overrideExclusion: { reason } }` on the body (strict), checked in storage with the
  exclusion: the new `OVERRIDE_TECHNICIAN_EXCLUSION` (manager and admin, the
  ISSUE_INVOICE_PREFINALIZATION precedent) or 403 `EXCLUSION_OVERRIDE_FORBIDDEN`, a typed reason or 400
  `EXCLUSION_OVERRIDE_REASON_REQUIRED`, then one `placement_exclusion_overridden` row on the appointment
  (`via` CREATE / UPDATE / CREW_ADD, the reason, the preference row; UPDATE's before names the previous
  technician). An override sent when nothing is excluded is ignored and records nothing. The composition
  add (`attachServiceToAppointmentTx`) inherits the visit's technician and has no check of its own.
  **`lockTechnician` stays client-only** (decided: left, noted - the board refuses the move, the server
  never reads it). Not checked: a PATCH that moves a visit to another location while keeping its
  technician (nothing writes that today).
- **(4) The crew.** `appointment_technicians` as recommended: exactly one LEAD per appointment, always
  `appointments.assignedTechnicianId` - `syncCrewLeadTx` runs in the column's two writers, a support
  technician who becomes the lead loses the support row, a visit with no technician has no lead - and
  SUPPORT rows edited from the sheet's crew block (`POST /api/appointments/:id/crew`, `DELETE
  .../crew/:technicianId`, one `appointment_crew_changed` row each). The backfill wrote one LEAD per
  appointment with a technician when the table was created: **115** on the copy of the dev DB (the
  handoff said 112 - the DB had grown to 123 appointments, 115 assigned). A SUPPORT technician the
  customer excluded is refused like a placement (decided: B14's "never be scheduled" covers a crew
  member), with the same override. A support technician needs a lead (409 `CREW_LEAD_REQUIRED`); the
  lead leaves only by changing the visit's technician (409 `CREW_LEAD_NOT_REMOVABLE`); a cancelled or
  completed visit's crew is history (409 `CREW_NOT_EDITABLE`). **The support technician's day lists the
  visit** (decided: yes) - `getTechnicianWork` adds the visits with a SUPPORT row, `crewRole` tells them
  apart, and the card is read-only (dashed, not clickable, "Support", "Supporting <lead> - the lead
  posts the ticket"); the lead's card names the support crew. Every older reader keeps reading
  `assignedTechnicianId`: the board, the ticket's technician snapshot and so production (one entry, one
  technician, until Phase 7), and Pass 29's next-stop check (`nextStopTx`), which measures the lead's
  day only.
- **(5) The audit vocabulary.** Dedicated actions, no new entity type: `technician_preference_set` /
  `technician_preference_cleared` with the preference row (and the technician's name) as the snapshot,
  recorded on the `location` for a LOCATION row and on the account's `customer` for an ACCOUNT row -
  every location's History tab already collects its customer, so the account-wide change shows on each
  of them with no change to the collector; `placement_exclusion_overridden` and
  `appointment_crew_changed` on the `appointment`. The LEAD's sync is unaudited, as the technician
  change itself is until C5.1a.
- **(6) The chips and the board.** As (2); on the dispatch queue each row reads "Prefers <tech>"
  (green) and "Never <tech>" (red) for its location; the sheet's native select marks "- excluded by
  the customer" / "- preferred" on each option, shows the hint, and warns when the chosen technician is
  excluded. An excluded technician stays choosable (decided: allowed, not disabled) - the 409 opens the
  reason prompt for a manager and the same request is resent (the dispositionDraftPrompt pattern),
  everyone else gets the refusal as a toast. The board's own placement (a slot click) and a confirmed
  move go through the same two mutations, so all three paths prompt.
- **(7) Gates.** The preference editors and their routes are open to every role, like the location
  profile - it is the customer's word, not a setting; the override is a profile holding
  `OVERRIDE_TECHNICIAN_EXCLUSION` (manager and admin by default); the crew routes are ungated like
  every appointment write (a gate per route is C5.10's list; Passes 37 and 39 added none here).
- **(8) Smart Schedule (Phase 9)** reads the same table through the same resolve rule: PREFERRED as a
  weight, EXCLUDED as a constraint. Nothing is built for it.
- **Found while building:** the handoff's DB figures had moved (123 appointments, 115 assigned; Pass
  29's four `services` columns already on the shared DB - the owner restarted after PR #99, so the
  copy printed only Pass 30's two lines); the scratchpad's `counts.sql` was a fixed list of the 46
  tables and was rebuilt from `pg_tables`.
- **Not touched:** the technicians / users merge (C5.7 - both new tables keyed on `technicians.id` and
  were in its rewire list; Pass 38 re-pointed them at `users`), split allocation and the comp engine (Phase 7), Smart Schedule (Phase 9),
  the technician CRUD gates (`POST` / `PATCH /api/technicians` were not MANAGE_SETTINGS-gated -
  Pass 38 removed them; the users routes are gated), `lockTechnician`'s server enforcement, the Services-tab reopen defect
  (`reopenTicketMutation` still posts `{ reason }` - noted a fourth time), `cancelAgreement`'s direct
  CANCELED write, a permission on the crew routes (C5.10).
- **Verified 2026-10-03** (PORT=5001 against a copy of the dev DB, `pestflow_verify`, dropped
  afterwards; the shared DB untouched): `npm run check` clean; boot 1 printed Pass 30's two lines (the
  preferences table; the crew table with **115** LEAD rows backfilled) and nothing else, every other
  table count unchanged, every assigned appointment with its LEAD row; 108 API / SQL assertions as the
  four roles, first run: the pure modules (the resolve rule both ways, inheritance, foreign scopes
  ignored, a location without an account, the sort, the hint, the refusal texts, the crew vocabulary,
  the four audit labels, the permission on manager and admin only); a fixture customer with two
  locations on one account and two active technicians; the read as the technician; an ACCOUNT row from
  the non-primary location 409 with nothing written; "Apply to all locations" from the primary as
  support (the row, its customer-entity audit row, L2 inheriting it); a LOCATION row as the technician;
  an unchanged set writing nothing; a changed note updating the one row with before / after; unknown
  technician 404, bad kind 400, extra key 400; the effective map (excluded first, an empty location
  omitted, no ids -> {}); placing the excluded technician 409 naming the technician, the row, the
  scope and the note, with nothing written; support's and the technician's override 403, a blank
  reason 400, an extra override key 400; the manager's override 201 with the LEAD row and one override
  row (via CREATE); a technician not excluded placing with no row; an override for a non-excluded
  technician ignored; a location PREFERRED lifting the account exclusion at L2 only and clearing it
  restoring the block; the PATCH refusing a re-assignment (nothing changed), the manager's override
  moving the LEAD (via UPDATE, before naming the old technician), a notes-only PATCH on the overridden
  visit passing, a re-assignment back passing; the crew read; an excluded SUPPORT refused 409 / 403
  then added by the manager's override (ADD row + CREW_ADD override row); duplicates 409, unknown
  technician 404, extra key 400, unknown appointment 404; the support technician's day listing the
  visit as SUPPORT with the lead in its crew and the lead's day naming the support; removing the lead
  409, a non-member 404, the support 200 (REMOVE row) and the day no longer listing it; a support
  promoted to lead leaving one LEAD row; unassigning removing the LEAD; no lead 409; a completed visit
  409 for add and remove; clearing the ACCOUNT row from L2 409, a foreign row 404, from the primary as
  the technician 200 (the cleared row on the customer) and the technician placing at L1 afterwards;
  both locations' History tabs carrying the new actions; totals (5 override rows, 3 crew rows, every
  row with an actor label); the LEAD invariant over the whole copy and the four indexes; every fixture
  deleted and every count back at the run's start (`session` up by the run's four logins); boot 2
  printed only the serving line with all 48 counts unchanged; Vite 200 with the new symbols on the three
  pages, the new component and, under `/@fs/`, the two new shared modules, the audit vocabulary and the
  permissions. **Nothing was rendered in a browser** - the repo has no browser automation and the
  session had no browser - so the editors, the chips, the queue hint, the sheet's marked select and
  warning, the override prompt, the crew block and the support card reach the owner first.

**Shipped in Pass 30b** (`feature/phase-4-crew-schedule-review`, 2026-10-03) — the C4.4b row as built:
the owner's two additions after Pass 30 merged (`OWNER_FEEDBACK.md` FB-018, FB-019). No migration.

```ts
// shared/appointment-crew.ts                  CREW_SCHEDULE_CONFLICT (409); DEFAULT_VISIT_MINUTES = 60; plannedWindow(start, end, fallbackMinutes) (the stored end, else the representative's
//                                             duration, else 60); windowsOverlap(a, b) (back-to-back is not a clash); CrewScheduleConflict { appointmentId, role, scheduledDate, plannedEnd,
//                                             customerName }; describeCrewConflict / describeCrewConflicts; SupportAssignment { appointmentId, technicianId }
// shared/technician-preferences.ts            PREFERENCE_NOT_HONORED (409); describePreferenceBypass(preferredNames, chosenName); PreferenceNotHonoredRefusal; TechnicianExcludedRefusal.preferred?
// shared/audit.ts                             AuditAction += placement_preference_bypassed; a crew ADD's change += conflictsAcknowledged; the override row's after += preferredBypassed
// server/storage.ts                           PlacementOptions.acknowledgePreference; AppointmentCrewAddInput.confirmConflicts; PlacementRefusedError += preferred, technician;
//                                             AppointmentCrewError += conflicts; assertPlacementAllowedTx(..., checkPreference) -> { override, preferenceBypassed } (createAppointment and
//                                             updateAppointment check the preference, the crew add does not); recordPlacementChecksTx (the override row, or one placement_preference_bypassed
//                                             row: via CREATE | UPDATE, the technician chosen, the preferred passed over); plannedWindowsTx; findTechnicianConflictsTx(tx, appointment,
//                                             technicianId) (lead or support, not CANCELED, overlapping); addAppointmentCrewMember: exclusion first, then the conflict;
//                                             getSupportAssignments(from, to)
// server/routes.ts                            POST / PATCH /api/appointments body += acknowledgePreference?: boolean; POST /api/appointments/:id/crew body += confirmConflicts?: boolean;
//                                             respondPlacementRefused += preferred (and the chosen technician on PREFERENCE_NOT_HONORED); crew refusals += conflicts;
//                                             GET /api/appointment-crews/support?from=&to= (400 on bad dates)
// client/src/components/technician-preferences.tsx   getPreferenceNotHonoredRefusal; PreferenceBypassPrompt ("The customer prefers X" / "Schedule Y"); ExclusionOverridePrompt names the
//                                             preference the override also passes over
// client/src/pages/schedule.tsx               promptPlacementCheck / resendPlacement (both prompts resend the same request with what was confirmed so far); the sheet's "Not the customer's
//                                             preferred technician" warning; AppointmentCrewBlock's conflict dialog (dialog-crew-conflict, "Add anyway"); the board's support cards
//                                             (supportAppointmentsBySlot, card-support-<appointment>-<technician>: dashed, "Support", "With <lead>", opens the sheet, never selected for a move);
//                                             invalidateSupportAssignments on a crew change and an appointment update
```

Behavior worth knowing:
- **The support copy is a card, not a row.** Duplicating the appointment would double its services and
  its invoice; the support card reads the crew and opens the same visit. The lead's card is the one that
  moves it; the board's analytics still count the visit once, on the lead.
- **What a clash is.** Another live visit (not CANCELED) of the same technician, as lead or support,
  whose planned window overlaps this one - the window being the stored end, else the representative
  service's expected duration, else 60 minutes; back-to-back (one ends as the other starts) is not a
  clash. Checked when a SUPPORT technician is added, after the exclusion; the user confirms or cancels.
  Not checked (noted): moving a visit later re-checks nothing against its support technicians, and the
  lead's own placement is not checked for a clash (it never was).
- **The preference reminder.** Only when the visit's location has a PREFERRED technician in effect and
  the technician chosen is none of them; any role confirms. An unassigned visit, an unchanged
  technician and a support add are not asked. With an exclusion, the manager's override is the one
  prompt and its row lists the preference passed over.
- **Verified 2026-10-03** (PORT=5001 against a copy of the dev DB, dropped afterwards; the copy already
  had Pass 30's tables, so boot 1 printed only the serving line): `npm run check` clean; 54 new smoke
  assertions first run (the pure window / overlap / text functions; the reminder as support and as the
  technician, a non-boolean 400, the confirmation and its CREATE row, the preferred technician and an
  unassigned visit not asked, the PATCH reminder and its UPDATE row, an unchanged technician not asked;
  the excluded technician's 409 naming the preference and the override alone placing with
  `preferredBypassed` and no bypass row; a location preferring both technicians not asking; a support
  clash with a lead visit 409 then confirmed with `conflictsAcknowledged`, back-to-back accepted at once,
  a clash with a support visit, the 60-minute fallback window, exclusion then conflict then both
  confirmed; the support-assignments read and its 400s; the support technician's day) and the Pass 30
  suite's 108 again; every count back at baseline; boot 2 only the serving line; Vite 200 on the page,
  the component and the three shared modules. **Not rendered in a browser.**

**Shipped in Pass 31** (`feature/phase-4-dispatch-board-settings`, 2026-10-03) — the C4.5 row as built,
the last Phase 4 row. No migration, no table, no column; no seed row.

```ts
// shared/dispatch-board.ts                    DISPATCH_VIEW_INTERVALS [30, 60, 120]; DISPATCH_SNAP_INTERVALS [15, 30, 60]; DISPATCH_BOARD_FIRST_HOUR 6 / DISPATCH_BOARD_LAST_HOUR 21;
//                                             DispatchBoardSettings { viewIntervalMinutes, snapMinutes, defaultStartHour, defaultEndHour }; DEFAULT_DISPATCH_BOARD_SETTINGS (120 / 60 / 8 / 18);
//                                             DISPATCH_BOARD_SETTING_FIELDS; DISPATCH_BOARD_SETTING_KEYS (dispatch_view_interval_minutes, dispatch_snap_minutes, dispatch_default_start_hour,
//                                             dispatch_default_end_hour) / DISPATCH_BOARD_SETTING_KEY_LIST; DISPATCH_BOARD_SETTINGS_INVALID (the 400 code); isDispatchViewInterval /
//                                             isDispatchSnapInterval / isBoardStartHour (6..20) / isBoardEndHour (7..21); boardStartHourOptions() / boardEndHourOptions(start);
//                                             visibleEndHourFor(start, end) (keep an end after the start, else the next hour, capped at 21); formatMinutesOfDay(480) "8 AM" / (510) "8:30 AM";
//                                             formatHourOfDay(h); describeDispatchBoardProblem(settings) -> string | null (unknown interval, hour off the board, start >= end, snap > view);
//                                             normalizeDispatchBoardSettings(stored) (unknown -> its default; start >= end -> the default pair; snap > view -> the view); serializeDispatchBoardSetting;
//                                             describeViewInterval(m) -> { label "30 minutes" | "1 hour" | "2 hours", summary "30-min view" | "1-hour view" | "2-hour view" }; describeSnapInterval(m);
//                                             minutesOfDay(date); slotStartsForWindow(start, end, interval) (minutes of day; the last slot may run past the end hour);
//                                             windowEndMinutes(starts, interval, start) (the last slot's end); slotStartFor(minutes, starts, interval) -> number | null (no clamping);
//                                             snapDateToInterval(date, snap) (local; nearest, a half rounds up; seconds dropped; 11:50 PM at 60 rolls to the next midnight)
// server/storage.ts                           DispatchBoardSettingsError (code DISPATCH_BOARD_SETTINGS_INVALID); getDispatchBoardSettings(); readDispatchBoardSettingsTx(reader: DbReader)
//                                             (one inArray read of the four keys, then normalize); setDispatchBoardSettings(patch) (one tx: read, lay the patch over, describeDispatchBoardProblem,
//                                             upsert only the keys given - a refused change writes nothing)
// server/routes.ts                            GET /api/settings/dispatch-board (any session) -> DispatchBoardSettings; PATCH (requirePermission MANAGE_SETTINGS) with a partial .strict() body
//                                             (dispatchBoardSettingsSchema: each value checked alone - z.number().int() + the shared guards / the hour bounds; "nothing to change" on {}) -> the
//                                             full settings; 400 { code: DISPATCH_BOARD_SETTINGS_INVALID, message } on a cross-field refusal
// client/src/pages/settings.tsx               the "Dispatch Board" card (card-dispatch-board; select-dispatch-view-interval / -snap-interval / -start-hour / -end-hour): each select PATCHes at
//                                             once; a view below the snap carries snapMinutes = view, a start at or past the end carries visibleEndHourFor(start, end); the snap options coarser
//                                             than the view are disabled; disabled + "Only an admin can change this setting." for a non-admin
// client/src/pages/schedule.tsx               useQuery /api/settings/dispatch-board seeds the window (the grid waits for it); windowOverride { startHour?, endHour?, viewIntervalMinutes? }
//                                             (session state; "Back to the defaults", button-board-window-reset); snapMinutes = min(the setting, the view in use); slotStarts (minutes of day) /
//                                             windowStartMinutes / windowEnd; viewportBounds (the support cards' fetch range); viewportAppointments per day (boardDayKeys and
//                                             [windowStartMinutes, windowEnd)); slotKeyFor(tech, date) -> `${tech}:${day}:${slotStart}` | null for the lead map, the support map and the grid;
//                                             buildSlotDate(day, minutes); isSameStart (to the minute); handleSlotClick snaps the start before scheduleMutation / moveAppointmentToSlot;
//                                             AppointmentSheet.snapMinutes (step on both datetime-local inputs, text-sheet-snap-hint, snapDateToInterval on Save, an end that rounds onto or
//                                             before the start = start + snap); the Window popover's "View Interval" (select-board-view-interval), hours (select-board-start-hour / -end-hour
//                                             from the shared options), footer; configSummary "8 AM - 6 PM | 2-hour view"
```

Behavior worth knowing:
- **One key per value, not a JSON blob.** Each value normalizes on its own (an unrecognised view interval
  falls back to 2 hours without losing the snap), the model is `invoice_on_finalize` /
  `attach_service_report_to_invoices`, and `dispatch_snap_minutes` is the key the roadmap row names. No
  seed row: the reader returns the defaults, which are today's board, so nothing changed for the office
  until an admin touches the card.
- **There is no drag.** The row says "drag placement rounds to it"; the client has no drag-and-drop
  anywhere - placement is a slot click (`handleSlotClick`), a move is click-then-confirm (`pendingMove`).
  So the snap governs the sheet's typed times (step + rounding on save) and, literally, every placement
  start the board writes - which is a no-op, because the rules refuse a snap coarser than the view
  interval: a 60-minute snap on a 30-minute view would place a :30 slot's click on the next hour, in a
  different cell than the one clicked. The Settings card disables those snap options and sends the snap
  down with a finer view; when the board's session override picks a finer view than the stored snap
  allows, the snap in use is the view interval (the same rule the reader applies to stored rows).
- **The server never rounds.** A client rule, like `lockTechnician`: the API stores the snap and writes
  the time it was asked for (the field app's routes, Pass 29's add-service extension of the end, the
  disposition all keep their times). Noted, not a gap.
- **Minute slots.** `isSameStart` replaces the hours-only `isSameSlot`: a visit saved at 8:15 from the
  sheet and clicked onto the 8:00 slot is now a time move (lockTime holds), and clicking a card's own slot
  offers, with the usual confirm, to put it on the slot's start. The end hour's select reaches 9 PM (the
  old start-hour clamp set 21 on a select that stopped at 20, a value it could not show).
- **"In view" is per day.** The visit's own day is on the board and its start is inside
  [start hour, the last slot's end). Before, one continuous range from the first day's start to the last
  day's end let an off-window visit on a middle day of a 3-day or week view through, and
  `getSlotHourForDate`'s clamp put it in the first or last slot of its row (the spill); the same range
  also let a visit up to one interval past the end hour ride the last slot. Both gone; a visit before the
  start hour was never shown and still is not; Jobs In View counts what the grid shows. The window of a
  range that is not a multiple of the interval (8 AM - 5 PM in two-hour columns) ends with its last slot
  (6 PM), with the grid.
- **Verified 2026-10-03** (PORT=5001 against the shared dev DB - no migration, so no copy was needed;
  the four rows the test wrote were deleted at the end): `npm run check` clean; 82 smoke assertions first
  run (the pure module - the defaults, normalize on every key and both pairs, the four rules, the snap at
  15 / 30 / 60 at the boundaries with a time already on the snap unchanged and seconds dropped, the slot
  starts and the window's end, `slotStartFor` without clamping, the labels, the hour options and the clamp;
  the read as all four roles with no row; the three non-admin 403s writing nothing; admin's PATCH of each
  value alone and the read back as support; the upsert; fourteen 400s - an unknown interval, a snap off
  the list, start >= end in one body and against the stored end, hours off the board at both edges, a
  snap coarser than the view, a non-integer, a string, an unknown field, an empty body, a null - none
  writing a row; the two-value bodies the card sends; stored garbage and inconsistent pairs read as the
  rules say); boot 1 and boot 2 print only the serving line, every count unchanged but the smoke's four
  session rows; Vite 200 on the page, the settings page and the shared module with the new symbols and
  "Slot Interval" gone. **Nothing new was rendered in a browser** - the Settings card, the 30-minute
  board, the renamed popover and its reset, the sheet's stepped inputs and their rounding reach the owner
  first.

**Pass 31b addendum** (2026-10-04, Pass 31's branch and PR; `OWNER_FEEDBACK.md` FB-021, the C4.5b row) — the
board's layout. `schedule.tsx`'s page root is full-width (was `max-w-7xl`); the grid is `TECH_COLUMN_PX`
(160) + `repeat(columns, minmax(0, 1fr))` (`boardGridTemplate`) with no minimum width on the 1-day view
(`boardMinWidth` undefined) and `TECH_COLUMN_PX + columns * MULTI_DAY_MIN_COLUMN_PX` (96) on a 3-day or
week view, so a day fits the window at every view interval and a multi-day view scrolls; the 30-minute
view uses compact cell and card padding (`denseColumns`) and the card's time row wraps. The navigation
row (prev / next, Today, Jump to Date, the viewport label, Window) sits directly under the title with
nothing variable above it; the in-view figures (the three summary cards and the per-technician cards,
which exist only when something is in view) are the last section of the page
(`section-board-analytics`, "In view"); the selection box (`card-selection-banner`) sits between the
board and the pending queue. Client only - no route, no data, no setting. Verified: `npm run check`
clean, one boot, Vite 200 on the page with the new test ids. **Not rendered in a browser.**

**Shipped in Pass 32** (`feature/phase-5-audit-coverage`, 2026-10-04) — the C5.1a row as built, the
first Phase 5 row. One additive migration: `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON
audit_logs (org_id, entity_type, entity_id)` (`server/audit-bootstrap.ts`, after the tenancy
bootstrap; declared on the table in `shared/schema.ts` too). No table, no column, no seed row.

```ts
// shared/audit.ts                             AuditEntityType + contact | billing_profile | billing_profile_template | agreement_template (15 members; no account - decided);
//                                             AuditAction + created | status_changed | deleted (35 members; `update` stays the one member for "updated"); the labels;
//                                             DIFF_IGNORED_FIELDS + updatedByUserId / updated_by_user_id (a last-actor stamp, D7); auditChangeAction(before, after) ->
//                                             "update" | "status_changed" | null (null = nothing the diff shows moved - the writer then writes no row); auditSnapshotsDiffer(before, after)
// shared/schema.ts                            auditLogs: index audit_logs_entity_idx (orgId, entityType, entityId)
// server/audit-bootstrap.ts                   bootstrapAudit() - the index, CREATE INDEX IF NOT EXISTS (server/index.ts, after bootstrapTenancy)
// server/storage.ts                           private auditCreatedTx(tx, entityType, entityId, after, actor) / auditChangeTx(tx, entityType, entityId, before, after, actor): Promise<boolean>
//                                             (writes only when auditChangeAction is non-null) / auditDeletedTx(tx, entityType, entityId, before, actor); agreementAuditSnapshotTx(reader, agreement)
//                                             ({ ...row, soldBy }); serviceAuditSnapshot grown (customerId, locationId, source, answersServiceId, generatedForDate, timeWindow, schedulingMode,
//                                             fieldReviewedByUserId / Label) + serviceAuditSnapshotWithoutKind (an update beside work_kind_changed); appointmentRowAuditSnapshot (the row part:
//                                             + customerId, locationId, agreementId, source, generatedForDate, timeInAt, timeOutAt, durationMinutes, lockTime, lockTechnician, assignedTo) and
//                                             appointmentAuditSnapshot = row + services; the public recordAuditLog REMOVED (IStorage too - no caller; recordAuditLogTx is the writer, canon §17);
//                                             actor?: AuditActor | null added to createCustomer, updateCustomer, createContact, updateContact, setPrimaryContact, createLocation, updateLocation,
//                                             setPrimaryLocation, createBillingProfileTemplate, updateBillingProfileTemplate, createBillingProfile, updateBillingProfile, createAgreementTemplate,
//                                             updateAgreementTemplate, deleteService, timeInAppointment, timeOutAppointment, createServiceRecord, and to the inputs of
//                                             createCustomerWithPrimaryLocation / createLocationWithPrimaryContact; ensurePrimaryLocationInvariant(tx, accountId, preferred?, actor?) now runs
//                                             INSIDE the caller's transaction (createLocation, createLocationWithPrimaryContact, updateLocation, setPrimaryLocation each wrap one) and writes
//                                             a location `update` per primary flag it flipped (the request's actor, else System); syncAgreementInitialAppointmentDates(tx, id, actor?, { audit? })
//                                             writes the agreement's `update` itself unless audit: false (the agreement writers pass false and record the final row once);
//                                             attachInitialAppointmentTx (the initial visit taking the agreement: an appointment `update`); auditAgreementAdvanceTx (System);
//                                             setAppointmentRepresentativeTx; auditDemotedContactsTx (one `update` per sibling a primary change demoted);
//                                             getAuditLogsForLocation: allRefs + contact (by location) + billing_profile (the location's override and the account's profiles);
//                                             cancelAgreement: the agreement's status_changed; each visit written once with cancelReason (the agreement's reason), cancelNotes
//                                             ("Agreement cancelled: <name>"), cancelRequestedAt / ByLabel and a status_changed with its services (a COMPLETED visit is left alone);
//                                             each service a status_changed; deleteService: `deleted` (service; the visit too when it was the last) and the crew rows deleted first
// server/routes.ts                            getAuditActor(req) passed to every method above; GET /api/audit-logs unchanged (locationId | entityType + entityId)
// client/src/lib/invalidate-audit-views.ts    invalidateAuditViews() - predicate startsWith("/api/audit-logs"); called from the five fixed sites (schedule.tsx crew, technician-work.tsx
//                                             refreshWork, technician-preferences.tsx, field-added-badge.tsx, service-cancel-dialog.tsx), opportunities.tsx, and every customer-detail.tsx /
//                                             schedule.tsx mutation that now writes a row (add / edit location, contacts, set-primary, agreements, cancel, services, delete, finalize, reopen,
//                                             placement, move, composition, disposition)
```

**Decided (1), the vocabulary.** Four entity members, no `account`: canon has no account history, Pass
30 put account-scoped rows on the customer, and `accounts.status` / `primaryLocationId` move with the
location invariant - so the primary flip is logged as each location's `update` (isPrimary before /
after) and the account's own row is not logged. `billing_profile_template` joined (the row says
"billing profile"; the template is the org default Pass 34 (C5.2) reads at customer creation). Three actions: `created`,
`status_changed`, `deleted`; updates reuse the existing `update` rather than adding a second spelling
of it (35 rows already carry `update`, its label is "Updated"). **Decided (2), the snapshot.** Whole
rows for customer, location, contact, the two billing profile tables, the two templates and the
agreement (plus `soldBy`, the user named - Pass 12's row widened into the one row an edit writes);
the curated snapshots for service and appointment, grown. A change row is written only when
`auditChangeAction` finds something the History tab's own diff would show - the same ignore list
(`id`, `orgId`, `updatedAt`, now `updatedByUserId`), so a form that sends the row back unchanged
leaves no trace; `updateLocationProfile`'s always-write is fixed the same way. The action is
`status_changed` when `status` moved, else `update`. A service's status move made by a placement, a
disposition or a composition change rides the visit's row (its `services` list), as since Pass 27 -
not a row per service. A visit's notes change keeps its `appointment_composition_changed` row; every
other PATCH field (technician, time, status, locks) writes `update`. A `work_kind_changed` beside a
service `update` in one save: the two kind fields are taken out of the `update`'s diff.
**Decided (3), the actor.** Every request signs what it causes, derived writes included - the
invariant's primary flip, the agreement dates a placement re-derives, a finalization's service and
visit status moves. `SYSTEM_AUDIT_ACTOR` (explicit `{ userId: null, actorLabel: "System" }`) signs an
agreement's own schedule executing: the service `generateServiceForAgreement` creates (whichever
request ran it), `advanceAgreementForCompletedAppointment` / `...Service` moving `nextServiceDate`,
`generateScheduleDrivenInvoice` moving `nextBillingDate` (the billing run), and the invariant when no
request is behind it. `getAuditActor`'s no-user branch is unreachable behind `requireAuth`.
**Decided (4), the writes on GET.** Logged: `generateServiceForAgreement` writes `created` under
System - it IS a creation, once per cycle, so a page load that generates nothing writes nothing; the
cycle's backfill of an existing service writes a System `update` only when it filled something in.
Three GET routes generate on read, not two: `/api/location-counts/:id`,
`/api/appointments/by-location/:id` and `/api/agreements/location/:id`. Not moved. **Decided (5),
the read side.** `getAuditLogsForLocation` collects the location's contacts and the billing profiles
that apply to it (its override and the account's). The templates have no location: their rows are
read by `GET /api/audit-logs?entityType=agreement_template|billing_profile_template&entityId=` for a
later Settings surface; nothing on the History tab. The five client invalidations keyed
`["/api/audit-logs"]` / `["/api/audit-logs/location", id]` never matched the tab's string key
(`queryClient` compares key elements; `staleTime` is Infinity): one predicate helper
(`invalidateAuditViews`, the `invalidateInvoiceViews` pattern) replaces them, and - beyond the five -
every mutation on the customer page and the board that now writes a row calls it, or the tab would
keep its first read until a reload. **Decided (6), the leftovers.** `cancelAgreement`'s visits are
not routed through `dispositionAppointment` (it recycles agreement services back to the queue with a
reset window - the opposite of a cancellation); they carry the disposition's cancel fields (the
agreement's reason, a note naming the agreement, when, by whom) and a `status_changed` each, written
once per visit (the two old loops could hit one twice) and never on a COMPLETED visit. The Services
tab's Reopen `{ reason }` defect and the ungated technician CRUD routes stay noted. **Decided (7),
the index:** `audit_logs_entity_idx` (org_id, entity_type, entity_id) - both reads filter on it.
**Decided (8), the writer.** The public `recordAuditLog` had no caller and is gone from `IStorage`;
canon §17 now names `recordAuditLogTx` and the explicit system actor. **Found and fixed on the way:**
`deleteService` of a visit's last service had failed with a 400 on the crew table's foreign key since
Pass 30 (every placed visit has a LEAD row) - the crew rows are deleted first now. **Verified**
(PORT=5001 against the shared dev DB; the index is additive): `npm run check` clean; 88 smoke
assertions on the third run (the first two lost one each to the test harness - a stale keep-alive
connection, and the cleanup not finding a hard-deleted service's rows - and one to the crew FK above,
fixed): the shared helpers; a fixture customer with two locations, a contact, a billing profile
template and profile, an agreement template and agreement through the real routes as all four roles -
one row per create, `update` with the right diff per change, NO row for the same request repeated
(customer, profile edit, contact, template, agreement, appointment, time-in, set-primary), the
invariant's two flips, the demoted contact, the generated service under System, the write-on-GET
routes writing nothing for a generated cycle, the sold-by change naming both users, the visit's
`created` carrying its services, time-in `status_changed` by the technician, the post writing nothing
on the Service or the visit, finalize and reopen moving both, `deleted` with the before snapshot (alone
and with the visit), the cancel's three rows with the reason on the visit, the History read listing
the contacts' and the profile's rows and not the templates' or the other location's, the templates by
entityType + entityId, all five actor labels; the fixture deleted in FK order with its rows, counts
back at baseline (+4 session rows). Boot 1 and boot 2 print only "serving on port 5001"; every table
count unchanged. Vite 200 on the eight touched client modules and `shared/audit.ts`. **Not rendered
in a browser:** the History tab's new rows (a `created` or `deleted` row prints "Recorded with no
field-level differences" - the card renders only a two-sided diff; rendering a one-sided row's
snapshot is C5.1b's, with the per-customer rollup and Revert).

---

**Shipped in Pass 33** (`feature/phase-5-customer-history-revert`, 2026-10-05) — the C5.1b row as built,
the second Phase 5 row. No migration, no table, no column, no seed row; verified against the shared dev
DB.

```ts
// shared/audit.ts                             AuditAction + reverted (36 members; label "Reverted"); AUDIT_REVERTED_MARKER ("reverted" - the key on a reverted row's after
//                                             naming the source; on the diff's ignore list); AUDIT_LOG_DEFAULT_LIMIT 100 / AUDIT_LOG_MAX_LIMIT 500 (moved here from storage.ts);
//                                             auditSnapshotDrift(expected, current) -> the fields of expected whose current value differs (the ignore list applies);
//                                             AuditRevertedRef { auditLogId, action, createdAt, actorLabel } + extractAuditRevertedRef(after); REVERTABLE_AUDIT_ENTITY_TYPES
//                                             (customer, location, contact, billing_profile, billing_profile_template, agreement_template, agreement) / RevertableAuditEntityType
//                                             / isRevertableAuditEntityType; REVERTABLE_AUDIT_ACTIONS (update, status_changed, reverted); FINANCIAL_AUDIT_ENTITY_TYPES;
//                                             HISTORY_REVERT_CODES (HISTORY_ROW_NOT_FOUND 404; HISTORY_CREATED_ / DELETED_ / FINANCIAL_ / ENTITY_ / ACTION_ / CANCELLATION_ /
//                                             PRIMARY_ / SNAPSHOT_NOT_REVERTABLE, HISTORY_ENTITY_GONE, HISTORY_NOTHING_TO_REVERT, HISTORY_STALE - 409);
//                                             describeAuditRevertability(row) -> { revertable: true, entityType, fields } | { revertable: false, code, reason } (pure; the
//                                             client's button and the server's plan share it)
// shared/permissions.ts                       REVERT_HISTORY ("revert_history") in the manager set (admin inherits via Object.values)
// server/storage.ts                           AuditChangeOptions { action?: "reverted"; reverted?: AuditRevertedRef; expectFields? } - the last optional argument of updateCustomer,
//                                             updateLocation, updateContact, updateBillingProfile, updateBillingProfileTemplate, updateAgreementTemplate, updateAgreement (IStorage
//                                             too), handed to auditChangeTx(tx, type, id, before, after, actor, options?) which re-checks expectFields against `before` INSIDE the
//                                             transaction (HistoryRevertError 409 HISTORY_STALE - the update rolls back) and writes `reverted` with after + { reverted } instead
//                                             of the generic action; recordAuditLogTx returns the row id; AuditRef { entityType, entityId, locationId }; private
//                                             collectLocationAuditRefs(locationIds) / queryAuditLogsForRefs(refs, limit) shared by getAuditLogsForLocation (the same rows as
//                                             before) and getAuditLogsForCustomer(customerId, limit) -> AuditLogWithLocation[] (AuditLog & { locationId, locationName }, null =
//                                             account level); HistoryRevertError(status 404 | 409, code, message, current?, drift?); planAuditLogRevert(auditLogId) ->
//                                             AuditLogRevertPlan { row, entityType, entityId, fields, payload, expectFields, current, source }; revertAuditLogEntry({ auditLogId,
//                                             payload?, actor }) -> AuditLogRevertResult { entityType, entityId, entity, source, revertedAuditLogId }; REVERT_STRIPPED_FIELDS /
//                                             REVERT_ENTITY_STRIPPED_FIELDS / REVERT_TIMESTAMP_FIELDS / AGREEMENT_INITIAL_CHARGE_FIELDS; private readRevertableEntity(type, id)
// server/routes.ts                            auditLogQuerySchema: locationId | customerId | entityType + entityId (exactly one form); GET /api/audit-logs?customerId=&limit=;
//                                             POST /api/history/:auditLogId/revert (requirePermission REVERT_HISTORY): planAuditLogRevert -> the entity's own zod schema on the
//                                             planned payload (revertPayloadSchemas) -> the agreement's ASSIGN_SALE_CREDIT rule -> revertAuditLogEntry; a HistoryRevertError
//                                             answers { message, code, current?, drift? } (respondHistoryRevertError); zod 400s and the write path's own 400 { message } pass through
// client/src/lib/invalidate-audit-views.ts    invalidateRevertedEntityViews(entityType) - the reverted entity's own reads, by query-key prefix
// client/src/components/audit-log-entry-card.tsx  AuditLogEntry (AuditLog & { locationId?, locationName? }); useAuditLogRevert() (the mutation: POST, the toasts,
//                                             invalidateAuditViews + invalidateRevertedEntityViews; a HISTORY_STALE refreshes History); AuditLogEntryCard({ entry, showEntityType?,
//                                             canRevert?, onRevert?, revertPending? }) - the location chip ("Account" for null), the "Reverted the <action> of <date> by <label>"
//                                             line, a one-sided row's snapshot (snapshotFields), the Revert button (canRevert && onRevert && describeAuditRevertability(entry)
//                                             .revertable) and its AlertDialog confirm listing the fields that go back
// client/src/components/customer-history-sheet.tsx  CustomerHistorySheet({ open, onOpenChange, customerId, customerLabel, locations }) - the rollup at AUDIT_LOG_MAX_LIMIT, a
//                                             location filter (Every location / Account level / each location) and a record-type filter, the count badge, "Showing the latest
//                                             500 changes" at the limit, the cards with Revert
// client/src/pages/customer-detail.tsx        the toolbar's History button (button-account-history, every role) beside Statement + the sheet; LocationHistoryTab passes
//                                             canRevert / onRevert / revertPending; ?tab=communications maps to the "comms" trigger (the pre-existing mismatch fixed)
```

**Decided (1), the read.** `?customerId=` is the third exclusive form of the one audit read, backed by
`getAuditLogsForCustomer`. The locations are keyed on the **account** (canon §2: the account groups the
locations, and the screen itself lists them by accountId in `getCustomerDetailCompat`); only a legacy
customer with no account row falls back to `locations.customerId` (none on the dev data), and the read
never creates an account the way the compat read's resolver does - a read should not write. The two
reads share one ref collector (`collectLocationAuditRefs`) so the location tab and the rollup never
disagree about what a location's History holds; the per-location read returns exactly the rows it did.
Account level: the customer's own rows (its field changes, Pass 30's account-scoped preferences), the
account's billing profiles with no location and any contact with no location; a location's override
profile sits with its location. The org templates stay out, as on the tab. Each row is annotated
`locationId` / `locationName` from the refs collected (one map, no second request); the clamp stands at
500 and the client asks for exactly that, saying "Showing the latest 500 changes" when it got that
many - paging is a later pass. **Decided (2), where it sits.** A **History** button on the toolbar
beside Statement (Pass 15's customer-wide precedent) opening a right-hand sheet (the component the note
revisions and the dispatch sheet use) with a location filter ("Every location" / "Account level" / each
location) and a record-type filter; the account-level rows are folded into the one stream with an
"Account" chip, not a separate section. The tab list is location-scoped by canon (UI rule 3), so there is
no customer-level TabsList to add to; the per-location History tab is untouched. Open to every role - a
read. **Decided (3), which rows revert.** The pure half lives in `shared/audit.ts`
(`describeAuditRevertability`), run by the client to show the button and by the server before the
database checks: `update`, `status_changed` and `reverted` rows (a revert is a forward change, so
reverting one is another - a redo) of customer, location, contact, billing profile, the two org
templates and agreement. Refused, each with its 409 code and nothing written: `created` (the inverse is
a delete) and `deleted` (the inverse is a re-create with the old id) - out of scope, decided; the
financial entities (D7: a void and a re-entry, never a revert); service, appointment and opportunity rows
(curated snapshots, lifecycle moves the PATCHes refuse - a technician / time / notes revert on a visit is
not special-cased, decided); every special action (the preference set / clear, the placement overrides,
the crew change) - their write paths are their own; an agreement's cancellation (the `status_changed`
whose after is CANCELLED: the cancel took visits and services with it; a new agreement, not a revert);
a location made non-primary (the invariant would re-promote something at once - revert the row of the
location that was primary before instead); a row whose entity is gone (`HISTORY_ENTITY_GONE`); and a
row whose fields have moved since (`HISTORY_STALE`, the current row and the drift in the body). **The
revert puts back the fields the row changed, not the whole row**: the plan intersects the row's diff
with what the entity's write path accepts (never id / orgId / createdAt / the actor stamps / the
ownership keys customerId, accountId, locationId on a contact / the agreement's derived
billingPlanSnapshot, nextBillingDate, contractUploadedAt, expectedServiceCount, soldBy; the agreement's
initial-charge block moves as one), and "stale" means those fields no longer hold the row's after values
- so an unrelated later edit (someone else's, the billing run's) neither blocks the revert nor is
clobbered by it, and a later row on the same field must be reverted first. **Decided (4), the write -
ONE row.** `POST /api/history/:auditLogId/revert`, not under `/api/audit-logs` (the table's API stays
read-only; this writes nothing to it directly). The storage plans, the route validates the planned
payload with the SAME zod schema the entity's PATCH uses (a rule added since the row was written refuses
the replay as a 400 the way the PATCH would; jsonb's ISO strings go back to Dates first) and applies the
PATCH's own permission rule (an agreement's sale credit), then `revertAuditLogEntry` replays through the
entity's existing update method with `AuditChangeOptions`: the method's own `auditChangeTx` writes
`reverted` INSTEAD of its generic `update` / `status_changed` - the whole-row snapshots as any edit, the
after carrying `reverted` = { auditLogId, action, createdAt, actorLabel } - after re-checking the
fields against the row it replaced inside its transaction, so a concurrent edit rolls the revert back as
409 rather than overwriting it. The write path's refusals pass through unchanged: `updateAgreement`'s
"Use the agreement cancellation workflow" 400 (a row whose before is CANCELLED), `requireBillingPlanId`,
`assertOrgUserTx`, the location invariant (reverting the row of the location that lost primary makes it
primary again and writes the other location's `update` - two rows, the second a consequence), the
contact's demotions. A plan change on an agreement re-derives `billingPlanSnapshot` and `nextBillingDate`
as any plan change does, so that one replay is not pure (stated). **Decided (5), the vocabulary.**
`reverted` joins `AuditAction` ("Reverted"); the marker key joins the diff's ignore list so it never
reads as a field change and the stale check skips it; `diffAuditSnapshots` / `auditChangeAction` are
otherwise unchanged; the read limits moved to the shared module so the client and the clamp agree.
**Decided (6), the card.** `canRevert` + `onRevert` + `revertPending` props; the button only where the
shared rule says the row is revertable; the confirm is an AlertDialog (the RESCHEDULE confirm's pattern)
listing the fields that go back (after -> before) and saying a new change is recorded, nothing removed;
after a revert `invalidateAuditViews()` plus the entity's own reads (`invalidateRevertedEntityViews`, by
key prefix: the compat read, contacts, billing profiles, the templates, agreements); a one-sided row
(`created` / `deleted`) renders its snapshot's non-empty fields instead of "no differences" - yes, this
pass owns the surface; the rollup's rows carry a location chip, "Account" for the account-level ones; a
`reverted` row says "Reverted the <action> of <date> by <label>" above its diff. **Decided (7), who.**
`REVERT_HISTORY` in the manager set (Part E answer 8; a profile permission since Pass 37); each site
calls `can(user?.role, PERMISSIONS.REVERT_HISTORY)` with `useAuth()` (there is no useCan hook, as before);
support and technician see no button; the server answers 403 regardless. **Decided (8), account level.**
The rollup's account-level rows are the customer entity's (its own field changes and Pass 30's
ACCOUNT-scoped preference rows), the account's billing profiles with `location_id` null and any contact
with no location; the primary flip sits on each location (named). Folded into the stream under an
"Account" chip, selectable by the filter. **Fixed on the way:** `?tab=communications` selected nothing
(the trigger's value is "comms") - both spellings land on the tab; `server/auth.ts` pointed at a
`server/permissions.ts` that does not exist; the A1 citations for the aging chips, Make Primary, the
contact form and the Services tab. **Verified** (PORT=5001 against the shared dev DB; no migration):
`npm run check` clean; 63 smoke assertions on the first run - the shared rule and the drift helper pure,
the permission's holders, a fixture customer with two locations, a contact on each, an account-default
and an override billing profile, the templates, an agreement on the second location, a manual service;
rows on both locations and the customer; the customer read as support: the union newest first, every row
annotated (the customer's and the account-default profile's as account, the second location's contact,
agreement and generated service as that location), the templates excluded, the three query forms
exclusive, the per-location read unchanged; Revert as support and technician 403; a stale customer row
409 with the current row and the drift; the newest customer row reverted as manager - the phone back,
ONE `reverted` row by Heritage Manager with whole rows and the marker naming the source, its diff
[phone]; the same row again 409 stale; the older row then revertable; a revert of a revert as admin;
the read refreshed with the `reverted` row on top; a location, a contact (two fields), the
account-default profile, a template and an agreement (soldBy on both sides, nextBillingDate untouched)
reverted with one row each; the "became primary" row refused, the "lost primary" row stale while it is
primary again, then reverted through the invariant (two rows); `created`, financial, service, preference
set, unknown, `deleted`, the cancellation and a gone entity refused with their codes and nothing written;
a row whose before is CANCELLED passes the write path's 400 through; every `reverted` row this run
signed by the manager or the admin and naming an existing row; the fixture deleted in FK order, counts
back at baseline (+4 session rows). Boot 1 and boot 2 print only "serving on port 5001"; every table
count unchanged. Vite 200 on the four touched client modules and the two shared ones. **Not rendered in
a browser:** the History sheet, its filters and the limit note, the Revert button, the AlertDialog
confirm, the one-sided snapshot, the location chip and the "Reverted the..." line - the repo has no
browser automation and the session had no browser; restart `npm run dev:full` before trying them.

**Shipped in Pass 34** (`feature/phase-5-billing-profile-customer-screen`, 2026-10-05) — the C5.2 row as built,
the third Phase 5 row. No migration, no table, no column, no seed row; verified against the shared dev DB.

```ts
// shared/billing-profile-defaults.ts         BILLING_TYPES / BillingType (card | ach | invoice_terms | cash | check); INVOICE_TERMS / InvoiceTerms (DUE_ON_RECEIPT | NET_15 |
//                                             NET_30 | NET_60); BILLING_PROFILE_STATUSES / BillingProfileStatus (active | inactive); BILLING_PROFILE_ERROR_CODES
//                                             (BILLING_PROFILE_ACCOUNT_NOT_FOUND / _LOCATION_MISMATCH / _OVERRIDE_EXISTS / _DEFAULT_EXISTS - the writers' 400 codes);
//                                             isBillingType / isInvoiceTerms / describeBillingType; DEFAULT_BILLING_PROFILE_TEMPLATE_SETTING_KEY
//                                             ("default_billing_profile_template_id"); BillingDefaults { defaultBillingProfileTemplateId: string | null };
//                                             DEFAULT_BILLING_DEFAULTS (null); BILLING_DEFAULTS_INVALID; normalizeBillingDefaults(values) (blank -> null);
//                                             BILLING_PROFILE_SOURCES / BillingProfileSource (ACCOUNT_DEFAULT | LOCATION_OVERRIDE | NONE); BillingProfileSummary
//                                             { profileId, label, billingType, invoiceTerms }; LocationBillingProjection { source, profileId, label, billingType,
//                                             invoiceTerms }; NO_BILLING_PROFILE; projectLocationBilling(locationId, profile); describeBillingProfileSource(source);
//                                             describeLocationBilling(billing) -> "<label> (account default)" | "<label> (this location)" | "No billing profile";
//                                             describeBillingProfileTerms(billing, describeInvoiceTerms) -> "Invoice terms · Net 30" | "Card" | null
// shared/schema.ts                            the billingProfiles comment: which pointer is read, the two dead columns, the tokens are Phase 6's
// server/storage.ts                           CustomerDetailCompatProjection { legacyCustomer, account, primaryLocation, selectedLocation, relatedLocations, billing:
//                                             LocationBillingProjection, accountDefault: BillingProfileSummary | null, billingOverrideLocationIds: string[] }
//                                             (hasBillingOverride gone); pickAccountDefaultProfile(profiles) / summarizeBillingProfile(profile) (module level);
//                                             BillingDefaultsError (code BILLING_DEFAULTS_INVALID); BillingProfileError(code, message); IStorage getBillingDefaults() /
//                                             setBillingDefaults(next) beside the dispatch pair, private readBillingDefaultsTx(reader); private
//                                             createAccountDefaultProfileFromOrgDefaultTx(tx, accountId, actor) inside createCustomerWithPrimaryLocation; private
//                                             assertBillingProfileRulesTx(tx, next) and syncLegacyLocationPointerTx(tx, before, after) inside createBillingProfile /
//                                             updateBillingProfile; resolveBillingProfileForLocation(locationId) wraps private resolveBillingProfileForLocationTx(reader,
//                                             location), which resolveInvoiceTermsForLocationTx (through its tx now), statementBillToTx and getCustomerDetailCompat read;
//                                             getAuditLogsForLocation narrowed; REVERT_ENTITY_STRIPPED_FIELDS: location + billingProfileId, billing_profile +
//                                             cardOnFileToken / achToken / lastFour
// server/routes.ts                            billingProfileWriteSchema (insertBillingProfileSchema minus the tokens; label required; billingType / invoiceTerms / status
//                                             enums; strict) and updateBillingProfileSchema = its partial (the revert's schema too); POST / PATCH /api/billing-profiles
//                                             answer BillingProfileError as 400 { code, message }; POST / PATCH /api/billing-profile-templates requirePermission
//                                             MANAGE_SETTINGS; GET /api/settings/billing-defaults (open) / PATCH (MANAGE_SETTINGS; billingDefaultsSchema
//                                             { defaultBillingProfileTemplateId: string | null } strict; 400 BILLING_DEFAULTS_INVALID); billingProfileId omitted from
//                                             createCustomerWithLocationSchema.location, updateLocationProfileSchema.location and PATCH /api/locations/:id
// client/src/lib/invalidate-audit-views.ts    invalidateBillingProfileViews() (the compat read, the account's profiles, the location's resolved profile)
// client/src/pages/customer-detail.tsx        CustomerDetailCompatResponse (+ account, billing, accountDefault, billingOverrideLocationIds); BillingProfileFormState,
//                                             EMPTY_BILLING_PROFILE_FORM, billingProfileFormFrom(profile), billingProfileFormFromTemplate(template),
//                                             billingProfilePayload(form), billingProfileFormChanged(form, profile), pickAccountDefaultProfile, pickLocationOverrideProfile;
//                                             BillingProfileFields({ form, onChange, idPrefix }); LocationBillingSelector({ mode, onModeChange, form, onFormChange,
//                                             accountDefault, idPrefix, isPrimary }); AddLocationDialog(+ accountDefault) posts the override after the location (a refusal
//                                             is reported, the location stands); EditLocationDialog(+ accountId) reads ["/api/accounts", accountId, "billing-profiles"]
//                                             (and the setting plus the templates to prefill a new account default) and writes the account default (primary location
//                                             only; created when the account has none and a label was typed) and the override (create / update / retire) after the
//                                             profile PATCH; the chip (chip-billing) prints describeLocationBilling(compat.billing) with the type and terms as its title;
//                                             the switcher's "Billing Override" badge reads billingOverrideLocationIds; the profile card's badge-billing-override reads
//                                             billing.source and text-location-billing prints the resolved profile with its terms
// client/src/pages/settings.tsx               the Billing Defaults card (card-billing-defaults; select-default-billing-profile-template: None + the active templates,
//                                             an inactive stored one listed disabled with text-default-billing-template-inactive; "Only an admin can change this
//                                             setting."); the Templates card's Add / Edit gated by canManageSettings (text-billing-profile-templates-admin-only)
// client/src/components/service-completion-dialog.tsx  text-ticket-billing-profile under the billing-plan pill: "Billing profile: <label> · <type · terms> (this location |
//                                             account default)" or "No billing profile resolves for this location", from GET /api/locations/:id/billing-profile
```

**Decided (1), which pointer is the truth.** Three default / override pointers existed and one was read.
`billing_profiles.location_id` - canon §4's shape, the resolver's, Pass 11c's invoice parties - is the truth:
the compat read's `hasBillingOverride` and both "Billing Override" badges, which read the legacy reverse
pointer `locations.billing_profile_id`, now read a `billing` projection the compat read resolves by the same
code as the invoices (`resolveBillingProfileForLocationTx`), plus `accountDefault` and
`billingOverrideLocationIds` for the Add Location copy and the switcher's badge. `locations.billing_profile_id`
has no reader any more and is still WRITTEN, as a mirror by the profile write path (the active override's id on
its location, cleared when the override is retired or moved; no location audit row - the profile's own row is
the record, and a location `update` naming the mirror would invite a Revert that desyncs the two), so the Phase 1
unit 7 bootstrap backfill (f4d43c8, not Pass 11c) stayed true; it left the two location PATCH bodies and the
create-with-primary-location location (not POST /api/locations, which still took it until Pass 39 dropped the
column) and is stripped from a location revert.
`customers.default_billing_profile_id` is read by nothing on either side (set for one customer on the dev DB,
consistent with that account's default) and is left alone. Both columns were DROPPED by Pass 39 (C5.8, on the
copy-database recipe). **Decided (2), the org default.** One `app_settings` key,
`default_billing_profile_template_id`, on Pass 31's one-key pattern: no seed row, the reader answers null,
`setBillingDefaults` upserts an id that names an ACTIVE template of the org (else 400
`BILLING_DEFAULTS_INVALID`) and deletes the row for null, so "no row" stays the one representation of "none".
The stored id is answered as stored even if the template is later deactivated: the creation path checks again
and creates nothing then, and the Settings select lists the stored inactive template disabled with a red note.
`GET /api/settings/billing-defaults` is open (the location dialogs say what a new account starts with); the
`PATCH` is MANAGE_SETTINGS like every settings write. The write was NOT audited - no `set*` app_settings writer
was and there was no `app_setting` audit entity - until Pass 39 (C5.8) added both. **Decided (3), creation.**
`createCustomerWithPrimaryLocation` creates the account-default row from the org default template inside its
transaction (accountId the new account, locationId null, templateId, label = the template's name, its
billingType, invoiceTerms = its defaultInvoiceTerms when the type is invoice terms, isDefault, active), audited
`created` by the same actor as the customer, location and contact; no template set, or the setting naming a
template that is gone or inactive, creates nothing (the resolver answers nothing, as before) - a stale setting
never fails a customer's creation. `createLocation` / `createLocationWithPrimaryContact` create nothing: a
location inherits. The legacy `POST /api/customers` path (`createCustomer`) creates nothing either - its account
is made after the fact and the customers screen posts create-with-primary-location. No backfill: the nine
accounts with no profile keep none; an existing account gets its default when someone saves the primary
location's Edit Location with the account-default block filled in (prefilled from the org template when one is
set), or never. **Decided (4), the selector.** Both location dialogs carry a Billing section:
`LocationBillingSelector`, a radio - "Use the account default" (the account default's label and terms shown,
or "No account default yet - ...") or "Override for this location" with the override's fields (label, type,
terms when invoice terms, billing name, Bill To address; a card or ACH choice says the capture is a later
phase). Add Location posts the override after the location exists (a refusal is reported in the toast; the
location stands). Edit Location reads the account's profiles, seeds the radio from the location's active
override, and on save creates the override, updates it when its fields changed, or retires it with `status:
"inactive"` when the radio went back to inherit - never a delete: invoices carry `profileId` in their snapshot
and the resolver already filters on active; a later override on the same location is a new row beside the
retired one. There is no separate customer edit modal (Pass 30's finding), so "account default on the customer
edit modal" is the primary location's Edit Location: an "Account default" block with the row's label, type,
terms, billing name and address, created there (locationId null, isDefault, templateId when prefilled from the
org template) when the account has none and a label was typed, updated when changed. **Decided (5), the
permissions.** The templates are Settings reference data: POST / PATCH `/api/billing-profile-templates` are
MANAGE_SETTINGS and the Settings card's Add / Edit disable for everyone else ("Admins manage billing profile
templates."). The instances are customer data and stay open to every role like the location PATCH beside them;
who may edit customer data has no permission yet (Pass 37 gated nothing new; Pass 39 listed it under C5.10). **The writers' rules** (inside the transaction, against the
row as it will be): the account exists in the org (`BILLING_PROFILE_ACCOUNT_NOT_FOUND`), an override's
location belongs to that account (`_LOCATION_MISMATCH`), one ACTIVE override per location
(`_OVERRIDE_EXISTS` - the resolver takes the first it finds, so a second would be silent), one active default
per account (`_DEFAULT_EXISTS`; a non-default account-level row is allowed); the route schema is strict, the
vocabulary checked, the label required, and `cardOnFileToken` / `achToken` / `lastFour` are not in it (Phase 6
captures them through its own path). **Decided (6), the location History read.** `getAuditLogsForLocation`
listed every profile of the account (its comment said "own override and the account's default"); it now lists
the location's own override rows (any status) and the account's location-less rows only - a sibling's override
sits with its location, on its tab and on the customer-level History. `getAuditLogsForCustomer` is unchanged.
**Decided (7), the invoice side.** Nothing changes in `resolveInvoicePartiesTx` / `resolveInvoiceTermsForLocationTx`
/ `computeDueDateFromInvoiceTerms` / `statementBillToTx` except that the first and the last now resolve the
profile through their own reader instead of `db`; the smoke test proves an invoice issued on an override
location carries that profile's id, label and terms, bills to the profile's own address and name, and is due
thirty days out. **Decided (8), the ticket header.** One line under the billing-plan pill, from
`GET /api/locations/:id/billing-profile`: "Billing profile: <label> · <type · terms> (this location | account
default)", or "No billing profile resolves for this location" on the 404. The fee dialog already read the
resolved profile and is unchanged. **Found on the way:** four docs claimed no location on the dev DB resolved
a profile; Golden Gate's two did (19 invoices carry a profileId) - corrected where this pass touched them.
**Verified** (PORT=5001 against the shared dev DB; no migration): `npm run check` clean; 55 smoke assertions on
the first run - the shared module pure; the template routes 403 for support / manager / technician and 201 /
200 for the admin, the GET open; the setting's GET open to the technician, PATCH 403 for the three, 400 with
the code for an unknown and an inactive template and 400 for '' / {} / an extra key, 200 for the active one
(the row holds the id) and for null (the row deleted); a customer created with no default gets no profile
(compat NONE, the resolver 404); one created with the default gets ONE account-default row (location null,
the template, its name, NET_15, isDefault, active) audited `created` by the support user, compat
ACCOUNT_DEFAULT; a second location inherits; an override chosen on it (201, `created`, the mirror set, compat
LOCATION_OVERRIDE with its label and terms, the primary still ACCOUNT_DEFAULT with the override listed); the
refusals (a second override, a second default, a foreign location, an unknown account, a typed token, a bad
type, bad terms, a blank label) with their codes and nothing written; a non-default account-level row allowed
and retired; the override edited (one `update`); the two location PATCHes dropping `billingProfileId`; an
invoice issued on the override location (service, visit, posted by the technician, finalized by support,
generated by the manager) with the override's snapshot, PROFILE Bill To and a due date 30 days out; the
override retired (inactive, one `status_changed`, the mirror cleared, compat and the resolver back to the
account default, the invoice's snapshot untouched), re-activated, retired again and a new one accepted beside
it; the account default's fields edited through the dialog's PATCH; an account with none given one; the loc2
History listing its overrides and the default, the loc1 History the default only, the rollup annotating the
override with its location; every profile row by the support user; the fixture deleted in FK order, the
setting restored, counts back at baseline (+4 session rows). Boot 1 and boot 2 print only "serving on port
5001"; every table count unchanged. Vite 200 on the four touched client modules and the shared one. **Not
rendered in a browser:** the Billing section of both dialogs (the radio, the override fields, the account
default block and its prefill), the Billing Defaults card, the gated Templates card, the chip's new text, the
two badges, the profile card's billing line and the ticket header's line - the repo has no browser automation
and the session had no browser; restart `npm run dev:full` before trying them.

**Shipped in Pass 35** (`feature/phase-5-agreement-vocabulary`, 2026-10-06) — the C5.3 row as built, the
fourth Phase 5 row. One new table (`agreement_types`: CREATE TABLE IF NOT EXISTS, a unique index on
(org_id, key), five seed rows per org) and two data migrations (the free-text type → key; CUSTOM → DAY on the
four unit columns), all in `server/agreement-bootstrap.ts` `bootstrapAgreementVocabulary()`, self-guarding,
unaudited (bootstrap UPDATEs, as Pass 25's were). Verified on the **copy-database recipe** (the migration
rewrites 9 agreements and 2 templates the owner uses), so the owner's `npm run dev:full` restart after the
merge prints the five seed rows, the 17 "Annual" → ANNUAL rows and the 11 CUSTOM → DAY rows once, then nothing.

```ts
// shared/agreement-types.ts                  AGREEMENT_UNITS / AgreementUnit (DAY | WEEK | MONTH | QUARTER | YEAR); AGREEMENT_UNIT_LABELS; LEGACY_AGREEMENT_UNIT ("CUSTOM");
//                                             isAgreementUnit; normalizeLegacyAgreementUnit (CUSTOM -> DAY, else unchanged); describeAgreementUnit; describeAgreementCadence(unit,
//                                             interval) -> "Quarterly" | "Every 7 Days"; describeAgreementTerm(unit, interval) -> "Renews every 7 days"; AGREEMENT_TYPE_SEED
//                                             (PEST_CONTROL "Pest control" 10 / TERMITE 20 / MOSQUITO 30 / WILDLIFE 40 / EVALUATION 50); AGREEMENT_TYPE_KEY_MAX_LENGTH 64 /
//                                             _LABEL_ 80 / _DESCRIPTION_ 500; deriveAgreementTypeKey(label) (NFKD, upper, [^A-Z0-9]+ -> _, trimmed - "Bed-bug (heat)" ->
//                                             BED_BUG_HEAT); isValidAgreementTypeKey; AGREEMENT_TYPE_ERROR_CODES (NOT_FOUND 404; LABEL_REQUIRED / KEY_INVALID / KEY_TAKEN /
//                                             MERGE_TARGET_INVALID / UNKNOWN 400; IN_USE 409); AgreementTypeUsage { agreementCount, templateCount }; NO_AGREEMENT_TYPE_USAGE;
//                                             describeAgreementType(key, types) -> label | key | ""; describeAgreementTypeUsage(usage) -> "16 agreements and 1 template"
// shared/schema.ts                            agreementTypes (id, orgId, key, label, description, isActive, sortOrder, createdAt, updatedAt; agreement_types_org_key_uidx);
//                                             insertAgreementTypeSchema; AgreementType / InsertAgreementType; the agreementType / termUnit / defaultAgreementType comments
// shared/audit.ts                             AuditEntityType + agreement_type (16 members; not in REVERTABLE_AUDIT_ENTITY_TYPES); AuditAction + agreement_type_merged (36 members);
//                                             the two labels ("Agreement type", "Agreement type merged")
// shared/agreement-schedule.ts                advanceAgreementDate(dateOnly, unit, interval) without the CUSTOM case (DAY / WEEK / QUARTER / YEAR; MONTH and default = months);
//                                             the header comment rewritten (one vocabulary, the history of the DAY / WEEK gap and of CUSTOM)
// server/agreement-bootstrap.ts               bootstrapAgreementVocabulary() - the table, the index, the per-org seed (printed when inserted) -> migrateLegacyAgreementTypes(org)
//                                             (SELECT the agreements / templates whose text is NOT IN the org's keys; one entry per distinct value - key derived, label as typed,
//                                             sort max+10, a value whose derived key exists maps to it; the per-row print then the UPDATE) -> migrateCustomAgreementUnits()
//                                             (SELECT both tables WHERE a unit = 'CUSTOM'; the count report; the per-row print with the next-service date; four guarded UPDATEs
//                                             to 'DAY'); called last in bootstrapAgreements(), after the plan attach
// server/tenancy-bootstrap.ts                 TABLES_REQUIRING_ORG_ID + agreement_types
// server/seed.ts                              the three seed templates' defaultAgreementType -> PEST_CONTROL / TERMITE / MOSQUITO (were "Residential Recurring" etc.)
// server/storage.ts                           AgreementTypeError(status 400 | 404 | 409, code: AgreementTypeErrorCode, message); AgreementTypeInput { label, key?, description?,
//                                             isActive?, sortOrder? }; AgreementTypeUpdateInput { label?, description?, isActive?, sortOrder? }; AgreementTypeWithUsage =
//                                             AgreementType & AgreementTypeUsage; AgreementTypeMergeResult { source, target, agreementsMoved, templatesMoved };
//                                             IStorage getAgreementTypes(includeInactive?) / createAgreementType(data, actor?) / updateAgreementType(id, data, actor?) /
//                                             mergeAgreementTypes(sourceId, targetId, actor?); private agreementTypeUsageTx(reader) (two GROUP BY counts), readAgreementTypeTx,
//                                             nextAgreementTypeSortOrderTx (max+10), assertActiveAgreementTypeTx(reader, key) - called by createAgreementTemplate,
//                                             updateAgreementTemplate (on a change), createAgreement, updateAgreement (on a change); REVERT_UNIT_FIELDS (agreement: termUnit /
//                                             recurrenceUnit; agreement_template: the defaults) read by coerceRevertValue (CUSTOM -> DAY)
// server/routes.ts                            recurrenceUnitSchema = z.enum(AGREEMENT_UNITS); agreementTypeKeySchema (trimmed string 1..64, nullable, optional) on
//                                             agreementTemplateBaseSchema.defaultAgreementType and agreementBaseSchema.agreementType; agreementTypeCreateSchema { label, key?,
//                                             description?, isActive?, sortOrder? } / agreementTypeUpdateSchema (no key) / agreementTypeMergeSchema { intoId }, all .strict();
//                                             respondAgreementTypeError(res, e); GET /api/agreement-types[?includeInactive=true] (open); POST /api/agreement-types
//                                             (MANAGE_SETTINGS, 201); PATCH /api/agreement-types/:id (MANAGE_SETTINGS; 404 NOT_FOUND; 409 IN_USE); POST
//                                             /api/agreement-types/:id/merge (MANAGE_SETTINGS; 404 / 400 / 200 { source, target, agreementsMoved, templatesMoved });
//                                             DELETE /api/agreement-types/:id -> 405; the template and agreement POST / PATCH and the revert route answer an
//                                             AgreementTypeError as { code, message }
// client/src/pages/settings.tsx               formatTemplateRecurrence / formatTemplateTerm delegate to describeAgreementCadence / describeAgreementTerm; AgreementTypeRow;
//                                             invalidateAgreementTypeViews(); AgreementTemplateForm { agreementTypes? } - the "Agreement Type" Select
//                                             (select-template-agreement-type; active types + the template's own key if inactive + "None") and the unit selects over
//                                             AGREEMENT_UNITS (select-template-term-unit / select-template-recurrence-unit); AgreementTypeForm (Add / Edit: label, the key
//                                             previewed from the label and fixed on Edit, description, Active - disabled with the usage when in use -, sort);
//                                             AgreementTypeMergeForm (the target among the active types, the counts before and after, a destructive Merge); the
//                                             Agreement Types card (card-agreement-types: Add / Edit / Merge admin-only, "Admins manage agreement types." otherwise;
//                                             row-agreement-type-<KEY> printing Key | Sort | usage) above Agreement Templates
// client/src/pages/customer-detail.tsx        formatAgreementRecurrence delegates; AgreementTypeRow; addAgreementInterval with DAY and WEEK cases; AgreementForm - the
//                                             agreement-types query, selectableAgreementTypes, the "Agreement Type" Select (select-agreement-type; the template's default
//                                             preselected through buildAgreementFormState and applyTemplate) and the unit selects over AGREEMENT_UNITS
//                                             (select-agreement-term-unit / select-agreement-recurrence-unit); AgreementsTab - the agreement-types query and the card's one
//                                             "Type: <label>" line (text-agreement-type-<id>)
```

**Decided (1), the list:** a new table on Pass 25's `opportunity_categories` pattern, not an `app_settings`
JSON list - a type needs a stable row for its usage counts and its audit trail; the two type columns stay
and hold the KEY, nullable; **a type is not required** (9 agreements and 2 templates had none, and an
"Untyped" entry would be a lie - the dropdowns offer "None"); the migration maps each distinct free-text
value to its own entry (label as typed, key derived exactly as Settings derives one, so "Annual" → ANNUAL
"Annual" at sort 60), never to a seed entry by guess - the owner's answer was rename or merge, and the
Settings card now has both; a value whose derived key already exists ("Termite") maps to that entry;
`server/seed.ts` names the seed keys (the mapping lives in the seed, not the migration, so a fresh database
needs none). **Decided (2), rename or merge:** Add (the key derived from the label, upper snake, previewed in
the form; a caller may name a key, upper-cased and validated; fixed once created - the PATCH schema refuses
one), Edit (label / description / active / sort), Merge (`POST /api/agreement-types/:id/merge { intoId }`),
no DELETE (405); **a type in use cannot be made inactive** - in use means any agreement whatever its status
(a cancelled one still names it) or any template carries the key - 409 `AGREEMENT_TYPE_IN_USE` naming the
counts, merge first; an unused type can be made inactive and reactivated; the writes MANAGE_SETTINGS (the
settings-reference-data rule, Pass 34's precedent), the card's Add / Edit / Merge admin-only, the read open.
The opportunity-category precedent (label / active / sort only, ungated, unaudited) stays as it is - noted,
not this row. **Decided (3), audit:** `agreement_type` joins the entity vocabulary with `created` / `update`
(an active flip reads as `update` - the row has `isActive`, not `status`) and a dedicated
`agreement_type_merged` action rather than an `update` with a marker, because a merge is a workflow the
History reader should name; the merge writes the source type's row (before = the source, after = the source
inactive plus `merge` { intoId, intoKey, intoLabel, agreementsMoved, templatesMoved }) PLUS one `update` per
moved agreement and template through `auditChangeTx` with the same whole-row snapshots the writers use (the
agreement's with `soldBy` named), so each agreement's own History shows the key moving, by the admin who
merged - as direct UPDATEs inside the merge's one transaction, not through `updateAgreement` /
`updateAgreementTemplate` (each runs its own transaction, so a failure half-way would leave half the rows
moved; `updateAgreement` also re-derives billing and regenerates services, none of which a type change
touches); the per-row cost is 16 rows for Annual on the dev DB. The migration's own mapping is NOT audited
(a bootstrap UPDATE, printed at boot - Pass 25's rule). The type's own rows have no location and are read by
`GET /api/audit-logs?entityType=agreement_type&entityId=`; no Settings surface lists them yet. **Decided
(4), the dropdowns:** a Select over the ACTIVE types plus "None" on both forms, the row's own key kept in the
list when it has since gone inactive (a merge moves rows, so that is a race, not a state) and shown as "(not
on the Settings list)" if it is on no row at all; the agreement form preselects the template's default
(`buildAgreementFormState` already did; `buildAgreementInsertFromTemplate` still copies it once at creation);
the type showed NOWHERE before this pass (no badge, filter, report or document read it) and shows in ONE
place now - "Type: <label>" on the agreement card. **Decided (5), CUSTOM → DAY / WEEK:** one enum for all
four columns; the migration rewrites every CUSTOM(N) as DAY(N) - the same interval, exactly, never WEEK(1)
for a 7 (the office may pick WEEK afterwards); next-service, renewal and billing dates untouched (the
arithmetic did not change: CUSTOM stepped by days); `advanceAgreementDate` DROPS the CUSTOM case rather than
keeping an alias - the enum refuses it and no row carries it, and a stray CUSTOM would now step by a month
(stated); the client's `addAgreementInterval` gained DAY and WEEK (its default added days, so WEEK(1) would
have previewed as one day); the three labelers delegate to the shared `describeAgreementCadence` /
`describeAgreementTerm`; the other CUSTOMs (billing plan `anchorMode`, cancellation `effectiveDateMode`, the
material "Custom / Unlisted") untouched. **Decided (6), Revert:** the two `agreement|update` rows on the dev
DB carry only `soldBy` / `soldByUserId`, so no stored row is affected; still, a pre-migration row whose
before holds CUSTOM replays as DAY (`REVERT_UNIT_FIELDS` in `coerceRevertValue`, the migration's own rule)
rather than 400ing at the enum; a row whose after holds CUSTOM is stale anyway once the migration rewrote the
current row; a type-key revert is a legitimate replay (the key re-validated against the active list by
`updateAgreement`); a type's own rows are never revertable (a merge is undone by hand). **Decided (7), not
this row:** POST / PATCH `/api/agreement-templates` keep no permission gate and the Settings Agreement
Templates card stayed ungated until Pass 39 (C5.8) gated them (Pass 37 left it). **Found and fixed:** the row's "7
agreements, 2 templates" (9 and 2, the 7 / 10 on the TERM); CURRENT_FOCUS's "Wildlife is CUSTOM/7 term and
recurrence" (recurrence was CUSTOM/1); A1 :61's `settings.tsx:1130` (the Input was :1281) and "seed holds
Residential Recurring" (the dev DB held Annual and NULL); canon §9's fixed `agreementType` enum and
`frequencyRule` (neither existed in code; now the settings-managed list by key and the four unit columns);
`shared/agreement-schedule.ts`'s header (DAY and WEEK were never billing-only in the switch); D8's
`serviceCategory` name (no such symbol; the dimension is the agreement type).

Verified on the copy-database recipe on PORT=5001: `npm run check` clean; boot 1 printed the table's five seed
rows, the "Annual" report with its 17 per-row lines and the CUSTOM report with its 11 per-row lines (each row's
next-service date unchanged); boot 2 printed only "serving on port 5001" with every table count unchanged (the
one diff against the pre-boot snapshot: `agreement_types` 6). **100 smoke assertions passed on the first
run:** the pure functions (DAY(7) and WEEK(1) step the same seven days; CUSTOM has no case; the key derivation;
the labelers); the migrated rows read back (six types, ANNUAL ×16 / NULL ×9, no CUSTOM, the four known
next-service dates unchanged, no audit rows from the migration); the list's GET open to every role with usage
counts (ANNUAL 16 / 1); POST / PATCH / merge 403 for tech, support and manager; as admin a create with the key
derived (201, `created` row), a duplicate 400 KEY_TAKEN, a no-letters label 400 KEY_INVALID, a blank label and
an unknown field 400, a given key stored upper-cased, a bad key 400, an edit (200, `update` row, an unchanged
PATCH writing nothing), a key on a PATCH 400, an unknown id 404, DELETE 405, an unused type made inactive and
dropped from the active read, the type's rows on `GET /api/audit-logs?entityType=agreement_type`; a template
with an unknown or inactive key 400 AGREEMENT_TYPE_UNKNOWN and with CUSTOM 400, then 201 with the key, DAY/28
and WEEK/1; an agreement created from it with the type, WEEK/1 and DAY/28 preselected, a second with an
explicit type and DAY/7, both `expectedServiceCount` 4 on a DAY/28 term, an unknown / inactive key and a
CUSTOM unit refused on POST and PATCH; the real path - one AGREEMENT_GENERATED service per agreement at
creation, the tech posting both tickets and support finalizing them, both next-service dates advanced from
yesterday by exactly seven days (WEEK/1 and DAY/7 agree), no second service, the System `update` row; the
in-use rule (409 with "2 agreements and 1 template"); the merge's refusals (self, unknown, inactive target
400; unknown source 404; strict body) and the merge itself (200, 2 agreements and 1 template moved, the
source inactive, exactly four audit rows - the `agreement_type_merged` row naming the target and the counts,
an `update` per agreement with the key before / after and `soldBy` named, the template's `update` - the usage
counts after, the location History listing the moved agreements' rows, the merged type reactivated and made
inactive again); a revert of the agreement's type (TARGET → null → back, one `reverted` row) and of its unit
(WEEK → MONTH → back through the enum; support 403); a merge row and a type's `created` row not revertable;
the fixture deleted in FK order, counts back at baseline (+4 session rows). Vite 200 on `settings.tsx`,
`customer-detail.tsx` and the three shared modules, the new symbols in the transforms. The copy was dropped
afterwards; the shared dev DB is untouched (no `agreement_types`, the 9 CUSTOM rows still there) until the
owner's restart. **Not rendered in a browser:** the Agreement Types card (its rows, the Add / Edit form with
the key preview and the disabled Active select, the Merge form and its counts, the admin-only note), the two
type dropdowns, the four unit selects now listing Day / Week, the agreement card's "Type:" line - the repo
has no browser automation and the session had no browser; restart `npm run dev:full` before trying them.

---

**Shipped in Pass 36** (`feature/phase-5-ui-hygiene`, 2026-10-07) — the C5.4 row as built, the fifth Phase 5
row. No migration, no table, no column, no new route: three new modules, one server refusal, and the client.
Verified against the shared dev DB on PORT=5001 under the owner's port-5000 server; the owner's `npm run
dev:full` restart after the merge prints nothing.

```ts
// shared/agreement-types.ts                  SCHEDULING_MODES / SchedulingMode (AUTO_ELIGIBLE | CONTACT_REQUIRED | MANUAL); SCHEDULING_MODE_LABELS ("Auto-eligible" / "Contact
//                                             required" / "Manual"); SCHEDULING_MODE_DESCRIPTIONS (what each mode means today - no mode schedules anything by itself);
//                                             isSchedulingMode; describeSchedulingModeLabel(mode) -> label | raw | ""; describeSchedulingMode(mode) -> "Scheduling: auto-eligible"
//                                             | "" ; describeSchedulingModeDetail(mode) -> description | ""
// shared/customer-label.ts (new)              CustomerLabelSource / LocationLabelSource; describeCustomerLabel(customer, location?, fallback = "Customer") -> person | company |
//                                             location nickname | fallback; describeLocationLabel(location, fallback = "Location") -> "name - address" | either half | fallback
// shared/contacts.ts (new)                    CONTACT_ERROR_CODES { PRIMARY_REQUIRED: "CONTACT_PRIMARY_REQUIRED" } / ContactErrorCode; CONTACT_PRIMARY_REQUIRED_MESSAGE (the 400's
//                                             message); CONTACT_PRIMARY_LOCKED_NOTE (under the disabled checkbox)
// client/src/lib/customer-links.ts (new)      CustomerScreenTab; customerPath(customerId) -> /customers/:id; locationPath(customerId, locationId, tab?) -> /customers/:id?locationId=
//                                             &tab= (no location id -> the customer); stopLinkPropagation(event) for a link inside a clickable row or card
// server/storage.ts                           ContactError(code, message) status 400; updateContact: the primary guard before the sibling demotion (existing.isPrimary && (!requested
//                                             || moved) && no other primary at the location -> throw) - the revert path shares it
// server/routes.ts                            agreementSchedulingModeSchema = z.enum(SCHEDULING_MODES); PATCH /api/contacts/:id and POST /api/history/:auditLogId/revert answer a
//                                             ContactError as 400 { code, message }; POST /api/contacts/:id/set-primary kept (promotes only), commented
// client/src/pages/schedule.tsx               getCustomerLabel / getLocationLabel delegate ("Location service" / "Location"); the board card's name a <Link> (link-card-location-<apptId>);
//                                             the hover card's customer / location Links (link-hover-customer-<apptId> / -location-, stopPropagation); the support card's name
//                                             (link-support-customer-<apptId>); AppointmentSheet's header Links (link-sheet-customer / -service -> &tab=services / -location);
//                                             ServiceDetailDialog's Links (link-service-detail-customer / -location / -service) and its description; the queue row's Links
//                                             (link-queue-customer-<id> / link-queue-location-<id>), its badge (badge-queue-scheduling-<id>, title = the description) and the
//                                             Details button (button-queue-details-<id> -> setDetailServiceId)
// client/src/pages/service-ticket-review.tsx  getCustomerLabel delegates ("Location"); the list row a div[role=button] with Enter / Space (row-review-ticket-<recordId>) carrying
//                                             link-review-customer-<recordId> / link-review-location-<recordId>; the modal's link-review-modal-customer / -service (&tab=services)
//                                             / -location (the address block) and "Open Location" as <Button asChild><Link> (link-review-open-location; disabled with a title
//                                             when the ticket has no location)
// client/src/pages/services.tsx               the /api/all-locations query and locationById; the card's customer <Link> through describeCustomerLabel (link-service-customer-<id>);
//                                             the location line with a MapPin <Link> (link-service-location-<id>; text-service-no-location-<id> otherwise); the search covers the
//                                             company name and the location
// client/src/pages/customer-detail.tsx        ContactDialogForm: invalidates ["/api/contacts", customerId] too, the toast reads getApiErrorMessage, primaryLocked disables the
//                                             checkbox (checkbox-contact-primary) with the note (text-contact-primary-locked); the inline Make Primary button and
//                                             setPrimaryContactMutation removed; the agreement card's "Scheduling Mode" value (text-agreement-scheduling-<id>) through
//                                             describeSchedulingModeLabel; AgreementForm's select over SCHEDULING_MODES (select-agreement-scheduling-mode); ServicesTab's
//                                             <DialogContent className="max-w-2xl"> (dialog-service-form)
// client/src/pages/settings.tsx               the template form's select over SCHEDULING_MODES (select-template-scheduling-mode); the template row's segment through
//                                             describeSchedulingMode (text-template-scheduling-<id>)
```

**Decided (1), the link convention:** a wouter `<Link>` with `hover:underline` and a `link-*` test id, the
precedent of `invoice-detail-dialog.tsx` / `payments.tsx` / `reports.tsx` / `invoices.tsx` (Passes 11a and 14);
the targets `/customers/:id` for a customer and `/customers/:id?locationId=` for a location, built by one new
client module so the shape lives in one place; a **service name links to the location's Services tab**
(`&tab=services`) because the customer screen reads only `locationId`, `tab` and `invoiceId` - a `serviceId`
deep link was **not added** (a dialog-opening parameter is its own small pass, and the Services tab is the
closest a service name can honestly point at); **one shared labeler** replaces the three copies on the
surfaces this pass touched - `describeCustomerLabel(customer, location, fallback)` in `shared/customer-label.ts`,
the two page copies delegating with their own fallback words so no wording moved (Pass 35's "the three labelers
delegate" precedent, development rule 10) and `services.tsx` reading it (its inline printed `firstName lastName`
only, so a commercial customer was blank there); `batch-invoice-dialog.tsx`'s copy is not a C5.4 surface and
was left. **Decided (2), the surfaces:** the board card's name becomes a real `<Link>` (it was a `<button>`
calling `setLocation()` - no middle-click, no new tab - which is what A1 :38 had called DONE), stopping the
card's click; the hover card's customer and location link and stop the slot's click behind them (the slot
places or moves on click); the support card's name links to the location (its click still opens the sheet);
the sheet's header links its three names (`appointment.customerId` / `locationId` are on the prop already) and
the composition rows stay plain text - they are the edit surface, and every one of them would point at the same
tab; the dispatch Service Details dialog links its three and its description reads "opened from a dispatch card
or from the pending queue"; the queue row links its two with `stopPropagation` (the row selects for dispatch on
click, as its Cancel button already protected); the Ticket Review list row, one `<button>` before, is a
`div[role=button]` with Enter / Space (the queue row's Pass 28 shape) so the two links can nest; the modal links
its customer, service type and the whole address block, and "Open Location" stays as the footer's action but
as `<Button asChild><Link>` (disabled, saying why, when the ticket has no location - development rule 6); the
Service History page links the customer and gains the location it never showed, from the `/api/all-locations`
read its own form already used. **Decided (3), the queue's details:** the board's `ServiceDetailDialog` is
reused through `setDetailServiceId` - it resolves from `serviceById` over `GET /api/services` (every service),
so a pending service opens with no new query; `customer-detail.tsx`'s richer `ServiceDetailModal` stays
file-local and is **not exported** (it takes the location's ticket, invoice and sibling rows the board does
not load). **Decided (4), the badge:** the labeler lives in `shared/agreement-types.ts` (Pass 35's vocabulary
module; the nearest precedent is `SERVICE_SCHEDULE_STATE_LABELS`); "Scheduling: auto-eligible" / "Scheduling:
contact required" / "Scheduling: manual" on the queue and the template row, the bare label under the agreement
card's own "Scheduling Mode" heading, the **two form selects read the shared labels** ("Auto Eligible" is
"Auto-eligible" now - one vocabulary, Pass 35's rule), the badge's `title` says what the mode means today
(AUTO_ELIGIBLE: a future pool, pending until placed; CONTACT_REQUIRED: the contact opportunity; MANUAL: by
hand) and no text promises auto-scheduling (the smoke asserts it); the server's enum reads the same list (no
behaviour change). **Decided (5), Make Primary:** the inline button and its mutation go; the dialog's existing
checkbox is the one way, **disabled on the current primary** with the note; the two risks the inventory found
are closed - the server refuses a contact update that would leave the location with no primary (400
`CONTACT_PRIMARY_REQUIRED` from `updateContact`, so the History revert of a promotion row is refused too, which
is right: the row to revert is the other contact's demotion, and the smoke shows that revert promoting back),
and both dialog mutations invalidate the account-wide contacts read that feeds the location switcher's contact
label; the guard also covers a move of the primary to another location, which no route can do today (the
contact update schema and the revert payload schema both drop `locationId`) - defense in depth, stated; the
`set-primary` route is **kept**: it promotes only (the rule cannot be broken through it), an API caller or the
field app later wants the one-call form, and it writes the same audit rows; canon §3 gained the rule. **Decided
(6), the modal:** `max-w-2xl`, the customer-screen Service Details dialog's width; the same dialog serves Edit
Service, so both widen (FB-010 DONE and archived). **Decided (7), what stays:** FB-002 / -013 / -014 / -015
touch the same files and were reviewed, not built (the owner's word): FB-002 QUALIFIED as C3.8, the three
dispatch items ACCEPTED as C4.7; `batch-invoice-dialog.tsx` :252-253 and `opportunities.tsx` :395 print names
without links and are noted; the queue's raw `status` badge was not named by the row and C4.7's FB-013 will
humanize it; the selection box and the move confirm name nothing. **Found and fixed:** A1 :38 called the board
card DONE at `:998-1012` (it was `:2134-2150` and a `<button>`, not a link); A1 :39-42, :47, :54 and A3 :120,
:123 cited lines that had drifted (now at the symbols); A1 :42 "invoice rows ABSENT" was stale since Pass 11a;
A1 :54 said the default was `sm:max-w-lg` (`ui/dialog.tsx` has `max-w-lg`); the row's "Service Details dialog"
named no file (two exist - `schedule.tsx`'s is the one with plain names); the row's "Make Primary moves into
the contact dialog" described work mostly done (the checkbox was there; the work was the removal and the
guard). Also found: the contact update schema drops `locationId`, so a contact cannot change location through
the API (nothing in the docs claimed it could).

Verified against the shared dev DB on PORT=5001: `npm run check` clean; boot 1 and boot 2 printed only "serving
on port 5001" with every table count unchanged (no migration; `session` +4 per smoke run). **59 smoke assertions
passed on the second run** (the first lost two to the test itself - it expected the location move to be refused,
but the schema drops the field, and it compared a psql boolean rendered through `||` to `t` instead of `true`;
none to the code): the pure functions (the three badges, "" for none, the raw value kept for one off the list,
the labels, the AUTO_ELIGIBLE description naming a future pool and "pending", no label / description / badge
matching an auto-scheduling promise, the customer labeler's four fallbacks and its person-over-company order,
the location labeler, the contact code and texts, the five URL shapes); the four roles logged in; a fixture
customer with a primary location and an annex; a `PENDING_SCHEDULING` fixture service with `schedulingMode`
AUTO_ELIGIBLE (201, the mode stored) in `GET /api/services/pending` for every role with its customer and
location ids (the queue's link targets) and in `GET /api/services` (the dialog's read); a mode off the list 400;
CONTACT_REQUIRED on a manual service 201; the primary rule - the first contact primary whatever the box said,
the second not, exactly one primary, the account-wide contacts read, the only primary's demotion 400
`CONTACT_PRIMARY_REQUIRED` with nothing written and no audit row, the same as a technician, a `locationId` on
the PATCH dropped by the schema (200, not moved, no row), an edit of the primary that keeps it primary 200, an
edit of the other contact 200, the dialog's promotion PATCH 200 demoting the sibling with Pass 32's two `update`
rows (true → false by Heritage Support, false → true), the new primary's demotion 400; History - the promotion
row's revert 400 with the same code and nothing written, the demotion row's revert 200 promoting back (one
`reverted` row naming the source, the sibling's `update`), a revert as support 403; the kept `set-primary`
route 200 twice with the rows; an unknown contact 404; the annex's first contact its own primary (per location,
not per customer); org-wide no location with contacts and no primary and none with two; `GET /api/all-locations`
and `GET /api/customers` as the technician; the fixture deleted in FK order, counts back at baseline. Vite 200 on
`schedule.tsx`, `service-ticket-review.tsx`, `services.tsx`, `customer-detail.tsx`, `settings.tsx`,
`lib/customer-links.ts` and the three shared modules, every new test id in the transforms and
`button-make-primary-contact` gone from `customer-detail.tsx`'s. **Not rendered in a browser:** every link
(hover underline, middle-click, the row's click staying put), the hover card's links over the slot, the queue's
Details button and the badge's text and title, the restructured review rows' Enter / Space, the modal's links
and the link-styled Open Location, the Service History cards' location line, the contact dialog's disabled
checkbox and its note, the toast on the 400, the New Service modal's width, the selects' new labels - the repo
has no browser automation and the session had no browser; restart `npm run dev:full` before trying them (the
server changed: the refusal and the enum).

---

**Shipped in Pass 37** (`feature/phase-5-role-profiles`, 2026-10-08) — the C5.6 row as built, the sixth Phase 5
row. Two new tables and a per-org seed (`server/role-profile-bootstrap.ts`, between the auth and agreement
bootstraps), one new shared module, a 29th permission, the users write route, two Settings cards. Verified against a
COPY of the dev DB (`pestflow_verify`, dropped afterwards) on PORT=5001; the owner's `npm run dev:full` restart
after the merge prints the seed once (the four profiles with 4 / 13 / 28 / 29 permissions and "permission registry
loaded: 4 active profile(s)") and nothing after.

```ts
// shared/permissions.ts                      BuiltInRole (the four) / BUILT_IN_ROLES; UserRole = string; PERMISSIONS + EDIT_ANY_SERVICE_INSTRUCTIONS (29); PERMISSION_VALUES;
//                                             isPermission; PERMISSION_LABELS / PERMISSION_DESCRIPTIONS / PERMISSION_GROUPS (7 groups) / describePermission; ROLE_PERMISSIONS
//                                             (exported - the built-in defaults: technician 4 / support 13 / manager 28 / admin 29); PermissionMatrixEntry { key, name,
//                                             sortOrder, permissions }; sortPermissions (declaration order, dedupe, unknown dropped); BUILT_IN_ROLE_PROFILES (the seed);
//                                             setPermissionMatrix(entries | null) / hasPermissionMatrix / getPermissionMatrix (least -> most privileged; the defaults when
//                                             empty); can(role, permission) -> the registry else the defaults; rolesWithPermission -> profile NAMES; describePermissionHolders
//                                             -> "Admin" | "Manager or Admin" | "Technician, Support, Manager or Admin" | "no role"; describeRoleName(key) -> name | built-in | key
// shared/role-profiles.ts (new)               BUILT_IN_ROLE_PROFILE_KEYS; ROLE_PROFILE_SEED; *_MAX_LENGTH (key 64 / name 80 / description 500); deriveRoleProfileKey(name);
//                                             isBuiltInRoleProfileKey; isValidRoleProfileKey; ROLE_PROFILE_ERROR_CODES { NOT_FOUND 404, NAME_REQUIRED / KEY_INVALID / KEY_TAKEN /
//                                             PERMISSION_UNKNOWN / UNKNOWN 400, IN_USE / SELF_LOCKOUT / LAST_SETTINGS_MANAGER 409, USER_NOT_FOUND 404 }; RoleProfileSummary
//                                             (the row + permissions + userCount); toPermissionMatrixEntry; holdsManageSettings; describeRoleProfileUsage; cloneRoleProfileName
// shared/users.ts                             describeUserRole delegates to describeRoleName (ROLE_LABELS gone)
// shared/audit.ts                             AuditEntityType + "role_profile" | "user" (labels "Role profile" / "User"); neither in REVERTABLE_AUDIT_ENTITY_TYPES
// shared/schema.ts                            roleProfiles (role_profiles: id, orgId, key, name, description, isBuiltIn, isActive, sortOrder, timestamps; role_profiles_org_key_uidx);
//                                             roleProfilePermissions (role_profile_permissions: id, orgId, profileId FK cascade, permission;
//                                             role_profile_permissions_profile_permission_uidx); insertRoleProfileSchema; RoleProfile / InsertRoleProfile / RoleProfilePermission
// server/role-profile-bootstrap.ts (new)      bootstrapRoleProfiles(): the two tables, the per-org seed (ON CONFLICT (org_id, key) DO NOTHING, printed when inserted), a warning
//                                             per user whose role names no active profile, a warning when > 1 org, then loadPermissionRegistry(); loadPermissionRegistry():
//                                             the first org's ACTIVE profiles -> setPermissionMatrix (called by storage after every profile write)
// server/index.ts                             bootstrapRoleProfiles() after bootstrapAuth(), before setupAuth / the agreement bootstrap
// server/tenancy-bootstrap.ts                 TABLES_REQUIRING_ORG_ID + role_profiles, role_profile_permissions
// server/auth.ts                              POST /api/auth/login and GET /api/auth/me answer { ...user, roleProfiles: getPermissionMatrix() }; requirePermission unchanged in code
// server/storage.ts                           RoleProfileError(status 400 | 404 | 409, code); RoleProfileInput / RoleProfileUpdateInput / RoleProfileCloneInput /
//                                             RoleProfileWriteContext { actor, actorRole, actorUserId }; IStorage + getRoleProfiles(includeInactive?) / createRoleProfile /
//                                             updateRoleProfile / cloneRoleProfile / updateUserRole(userId, role, context); the helpers readRoleProfileTx,
//                                             roleProfilePermissionsTx, roleProfileUserCountsTx, roleProfileSummariesTx, roleProfileAuditSnapshot (row + permissions [+ clonedFrom]),
//                                             userAuditSnapshot (never the hash), normalizeRoleProfileName / -Permissions, claimRoleProfileKeyTx (derived, lower()-unique),
//                                             nextRoleProfileSortOrderTx (+10), writeRoleProfilePermissionsTx (delete + insert), assertSettingsManagerRemainsTx (rule b);
//                                             updateService's instructions lock: `actorRole != null && !can(actorRole, EDIT_ANY_SERVICE_INSTRUCTIONS)`
// server/routes.ts                            roleProfileCreateSchema / roleProfileUpdateSchema / roleProfileCloneSchema / userRoleSchema (strict; the name's blank check is
//                                             storage's, for the code); respondRoleProfileError; roleProfileWriteContext(req); PATCH /api/users/:id { role } (MANAGE_SETTINGS);
//                                             GET /api/role-profiles[?includeInactive=true] (open); POST / PATCH /:id / POST /:id/clone (MANAGE_SETTINGS); DELETE /:id 405;
//                                             four refusal messages read describePermissionHolders()
// client/src/hooks/use-auth.ts                AuthUser = user + roleProfiles?; the /api/auth/me queryFn and the login onSuccess call setPermissionMatrix BEFORE the cache
//                                             commit; logout clears it
// client/src/pages/settings.tsx               invalidateRoleProfileViews(); RoleProfileForm (name / key preview / description / active / sort / the grouped checklist;
//                                             input-role-profile-name, input-role-profile-key, select-role-profile-active, checkbox-permission-<permission>,
//                                             text-role-profile-hint, button-save-role-profile); RoleProfileCloneForm (input-role-profile-clone-name / -key,
//                                             button-confirm-role-profile-clone); the Roles card (card-role-profiles, button-add-role-profile, row-role-profile-<key>,
//                                             button-edit-role-profile-<key>, button-clone-role-profile-<key>, text-role-profiles-admin-only); the Users card (card-users,
//                                             row-user-<id>, select-user-role-<id>, text-users-admin-only; updateUserRoleMutation); settingsManagers / settingsManagedBy
//                                             (the 17 swept strings)
// client (sweep)                              customer-detail.tsx (3), schedule.tsx (1), payments.tsx (1), collect-payment-dialog.tsx (1 + a comment),
//                                             customer-history-sheet.tsx (a comment) read describePermissionHolders()
```

Behavior worth knowing before the next pass touches it:
- **The registry is the one place a role is resolved.** `can()` never reads the tables; the server loads the
  registry at boot and after each profile write, the client from `/api/auth/me`. A user whose role names no
  active profile holds nothing (the bootstrap warns per user). A SECOND server process (none today) would hold a
  stale registry until its next boot or write - the per-process limit, keyed by org in Phase 9.
- **The seed never re-syncs an existing org.** A later pass that adds a permission must also grant it to the
  seeded profiles that should hold it (an UPDATE guarded by key and `is_built_in`, printed) - `ROLE_PERMISSIONS` is
  the default for a NEW org, not the truth for an existing one.
- **Rule (b) is unreachable through the API** while the actor must hold Manage Settings and the self-lockout
  protects their own profile; it is a storage guard for a future user-deactivation route.
- **A memoized `can()` goes stale until re-render**: `payments.tsx` and `service-ticket-review.tsx` memo on
  `user?.role`; after a profile edit the `/api/auth/me` refetch re-renders every `useAuth()` consumer, but a memo
  keyed on the unchanged role string keeps its value until its component remounts. Noted, left.
- **Not rendered in a browser:** the Roles and Users cards, the permission checklist and its locked Manage
  Settings box, the clone form, the role select, every refusal toast and the swept fallback copy.

**Shipped in Pass 38** (`feature/phase-5-technicians-are-users`, 2026-10-08) — the C5.7 row as built, the seventh
and last scheduled Phase 5 row. Five users columns, one migration bootstrap (`server/technician-users-bootstrap.ts`),
one new shared module, a 30th permission, the users write surface, one merged Settings card, the Tech View's
identity. Verified against a COPY of the dev DB (`pestflow_verify`, dropped afterwards) on PORT=5001; the owner's
`npm run dev:full` restart after the merge prints the migration once (the five columns, Heritage Tech's grant, the
five drops, the two minted users, the five adds, the drop, the permission grant and the registry line) and nothing
after.

```ts
// shared/technicians.ts (new)                 TECHNICIAN_STATUSES / TechnicianStatus / isTechnicianStatus; TECHNICIAN_STATUS_LABELS; NOT_A_TECHNICIAN_LABEL;
//                                             describeTechnicianStatus; DEFAULT_TECHNICIAN_COLOR ("#2563eb" - the board's dot); TechnicianUserFields (the users columns a
//                                             projection reads); TechnicianSummary (the old row: id, orgId, displayName, licenseId "" when null, status, email, phone,
//                                             color, notes = technicianNotes, userId = id, timestamps); isTechnicianUser; technicianSummaryFromUser (null for a
//                                             non-technician); technicianSummariesFromUsers(list, includeInactive) (ACTIVE only by default, by display name);
//                                             USER_ERROR_CODES { NOT_FOUND 404, NAME_REQUIRED / EMAIL_INVALID / EMAIL_TAKEN / STATUS_INVALID 400, SELF_DEACTIVATE /
//                                             TECHNICIAN_HAS_HISTORY 409 }; describeTechnicianHistory
// shared/users.ts                             USER_STATUSES / UserStatus / isUserStatus (the LOGIN flag); normalizeUserEmail (trim + lower); isPlausibleUserEmail;
//                                             splitDisplayName ("Austin Lowe" -> Austin / Lowe; "Cher" -> Cher / "")
// shared/permissions.ts                       PERMISSIONS + VIEW_OTHER_TECHNICIAN_WORK (30; label "View another technician's day", group "Sales and scheduling";
//                                             support / manager / admin in ROLE_PERMISSIONS - 4 / 14 / 29 / 30)
// shared/schema.ts                            users + phone, licenseId, color, technicianNotes, technicianStatus (all nullable text); the `technicians` pgTable,
//                                             insertTechnicianSchema and InsertTechnician GONE; `Technician` = TechnicianSummary; services.assignedTechnicianId,
//                                             appointments.assignedTechnicianId, serviceRecords.technicianId, technicianPreferences.technicianId and
//                                             appointmentTechnicians.technicianId reference users.id
// server/auth-bootstrap.ts                    CREATE TABLE users carries the five columns; ALTER TABLE users ADD COLUMN IF NOT EXISTS x5 (printed once);
//                                             tech@heritage.local -> technician_status ACTIVE, license_id DEMO-0001 (UPDATE guarded by technician_status IS NULL, printed once)
// server/technician-users-bootstrap.ts (new)  bootstrapTechnicianUsers(): returns when `technicians` does not exist; else ONE transaction - drop every FK whose confrelid is
//                                             technicians (by catalog name, printed), mint (same id, unusable scrypt hash of 32 random bytes, inactive, technician, the
//                                             block, created_at / updated_at kept; email fallback <id>@technicians.local when null or taken) or remap (five FK columns +
//                                             production_value_entries.technician_id, the block copied with COALESCE) per row, ADD CONSTRAINT <table>_<column>_users_id_fk
//                                             REFERENCES users(id) x5 (skipped when present), DROP TABLE technicians; each step printed
// server/role-profile-bootstrap.ts            SEEDED_PROFILE_GRANTS [{ VIEW_OTHER_TECHNICIAN_WORK, support / manager / admin, "Pass 38" }]: an INSERT per (built-in
//                                             key, permission) guarded by key + is_built_in, ON CONFLICT DO NOTHING, printed once - the rule for every later permission
// server/service-scheduling-bootstrap.ts      the technicians CREATE TABLE / status index / Pass 12 bridge ALTER + unique index REMOVED; services, technician_preferences
//                                             and appointment_technicians CREATE TABLE IF NOT EXISTS reference users(id)
// server/tenancy-bootstrap.ts                 TABLES_REQUIRING_ORG_ID - technicians
// server/index.ts                             bootstrapTechnicianUsers() after bootstrapAuth(), before bootstrapRoleProfiles()
// server/seed.ts                              Jake Miller / Sam Torres inserted into users (role technician, status inactive, unusable hash, licenseId, color,
//                                             technicianStatus ACTIVE) - an empty org only
// server/storage.ts                           UserError(status 400 | 404 | 409, code: UserErrorCode); UserCreateInput / UserUpdateInput; IStorage: getTechnicians(includeInactive?)
//                                             (the facade: users where technicianStatus is not null -> technicianSummariesFromUsers), getUsers (+ the five columns),
//                                             createUser(data, context) / updateUser(userId, data, context) (updateUserRole / createTechnician / updateTechnician /
//                                             assertTechnicianUserLink / normalizeTechnicianInsert / -Update GONE); technicianProfileTx(reader, id, technicianOnly?)
//                                             -> { id, displayName, licenseId, status } from users (the one lookup every old join reads: the ticket snapshot, the
//                                             preference and crew writers (technicianOnly), updateServiceRecord's re-snapshot, getInvoiceDetail's label, the service
//                                             report's fallback); technicianNameMapTx over every org user; crewMembersTx leftJoins users; resolveRoleProfileForUserTx
//                                             (the Pass 37 role rules, shared by create and update); normalizeUserName; claimUserEmailTx (lower()-unique, 400 codes);
//                                             normalizeTechnicianStatus; technicianHistoryTx (six counts); assertActiveSettingsManagerRemainsTx (rule (b) for people -
//                                             an ACTIVE user on an ACTIVE profile with Manage Settings must remain after a status / role change; unreachable through
//                                             the API, like Pass 37's); createUser: status 'inactive', hashPassword(random), audited `user` created; updateUser: a
//                                             field-by-field patch, an unchanged save writes nothing, audited `user` update (never the hash)
// server/routes.ts                            technicianStatusSchema = z.enum(TECHNICIAN_STATUSES); userCreateSchema / userUpdateSchema (strict; the block optional,
//                                             technicianStatus nullable; status z.enum(USER_STATUSES) on the update only); respondRoleProfileError answers UserError
//                                             too; POST /api/users (MANAGE_SETTINGS, 201); PATCH /api/users/:id (MANAGE_SETTINGS; 404 USER_NOT_FOUND); POST / PATCH
//                                             /api/technicians and technicianSchema / updateTechnicianSchema GONE; GET /api/technicians unchanged (the facade); GET
//                                             /api/technicians/:id/work: 403 TECHNICIAN_WORK_FORBIDDEN unless the id is the session user's or the role holds
//                                             VIEW_OTHER_TECHNICIAN_WORK
// client/src/pages/settings.tsx               invalidateUserViews() (the role-profile views + every "/api/technicians*" key - the stale-cache fix); UserForm (form-user:
//                                             input-user-first-name / -last-name / -email / -phone, select-user-form-role, select-user-login-status (disabled on create and
//                                             on oneself, text-user-login-hint), select-user-technician-status, block-user-technician with input-user-license /
//                                             input-user-color (a swatch) / textarea-user-technician-notes, button-save-user); the Users card ("Users and technicians":
//                                             button-add-user, row-user-<id> with a login badge, badge-user-technician-<id> (the colour dot, the status, the licence),
//                                             button-edit-user-<id>, the Pass 37 select-user-role-<id> kept); TechnicianForm, the Technicians card, the technicians
//                                             query and the `Technician` import GONE
// client/src/pages/technician-work.tsx        sessionIsTechnician = isTechnicianUser(user); canViewOthers = can(role, VIEW_OTHER_TECHNICIAN_WORK); the selected technician
//                                             defaults to the session user once (a functional set, so a later pick stands); the picker (select-work-technician, the
//                                             session user marked "- you") only for canViewOthers, else text-work-technician-self ("<name> (<licence>) - your day") or
//                                             text-work-technician-none; the empty state names the permission for a non-technician without it
// client/src/pages/schedule.tsx               the row dot reads DEFAULT_TECHNICIAN_COLOR
```

Behavior worth knowing before the next pass touches it:
- **The id did not move.** A technician id in `services`, `appointments`, `service_records`, the crew, the
  preferences, the ledger and the 38 audit snapshots is now a `users.id` - the same string. A row from before
  Pass 38 names the same person it always did.
- **Two statuses, two questions.** `users.status` answers "may they sign in"; `technicianStatus` answers "are they
  offered on the board". Austin Lowe and John Doe are `inactive` / ACTIVE: on every picker, on the board, unable
  to log in. Heritage Tech is `active` / ACTIVE. A user with neither is an office login.
- **A technician with history is retired, never un-made.** `technicianStatus: null` is refused once any of the six
  tables names the user (409 TECHNICIAN_HAS_HISTORY, the counts in the message); TERMINATED takes them off the
  active pickers and the board keeps them while they hold visits.
- **The facade filters, the DB does not.** `getTechnicians()` answers ACTIVE rows; `?includeInactive=true` every
  row with a technician status; a user with NULL status is never a technician row. A writer naming a technician
  (a preference, a crew member, a ticket's technician change) requires the status; a label lookup does not.
- **No password exists for a minted or created user.** `POST /api/auth/login` is 401 for alowe@email.com,
  jdoe@email.com and anyone created from the Users card until C5.9 builds a password / invite flow; turning the
  login status to `active` changes nothing until then.
- **Rule (b) for people is unreachable through the API**: the actor must hold Manage Settings, cannot turn their
  own login off and cannot move themselves off Manage Settings, so `assertActiveSettingsManagerRemainsTx` is a
  storage guard for a future route (a bulk deactivation, a delete).
- **Not rendered in a browser:** the merged Users card, the UserForm and its technician block, the Tech View's
  default and hidden picker, every refusal toast.
- **Verified** (2026-10-08, PORT=5001 against a copy of the dev DB): `npm run check` clean; boot 1 printed the
  migration (above), boot 2 only the serving line with every count unchanged by name across the 50 tables; **87 smoke
  assertions on the second run** (the first lost one query to a `group by` mistake in the test, none to the code):
  the pure projection and vocabulary, the minted rows under the old ids with the block and an unusable login, the
  five FKs by name, every per-technician count unchanged against the pre-boot snapshot, Heritage Tech's grant, the
  seeded profiles at 4 / 14 / 29 / 30, the facade as every role in the old shape, `/api/auth/me` and `/api/users`
  carrying the block and never the hash, the work route (own 200 / another 403 / office 200), `POST /api/users`
  (403 x3, 201, the `user` created row, login 401, every refusal, two strict bodies), `PATCH` (the block with its
  audit rows, INACTIVE off the active list, null then ACTIVE again, the login on and still 401, the role row,
  the name following into `displayName`, every refusal including Austin's 409 naming "77 visits" and the admin's
  two self-refusals, TERMINATED then restored), a ticket posted as the tech carrying "Heritage Tech" / DEMO-0001
  from the users row, a preference naming a technician 200 and naming the admin 404, cleanup to baseline (+4
  sessions); Vite 200 on settings.tsx, technician-work.tsx, schedule.tsx, use-auth.ts and the four shared modules.

**Shipped in Pass 39** (`feature/phase-5-schema-settings-hygiene`, 2026-10-08) — the C5.8 row as built, the
unscheduled Phase 5 hygiene list the owner sequenced after Pass 38. A migration that drops two columns and adds
three foreign keys, one audit entity, fourteen gates, one card. Signatures:

```ts
// server/billing-profile-bootstrap.ts (runs after bootstrapCanonicalAccounts, every boot, quiet once done)
//   if locations.billing_profile_id exists: UPDATE billing_profiles SET location_id = l.id ... WHERE bp.location_id IS NULL
//     AND l.billing_profile_id = bp.id (the pre-Pass-34 carry, one last time), then DROP COLUMN, printed with the row count
//   if customers.default_billing_profile_id exists: DROP COLUMN, printed
//   CREATE INDEX IF NOT EXISTS billing_profiles_template_id_idx (printed when created)
//   addForeignKeyIfMissing(column, refTable, name): no FK on the column in pg_constraint (by column, not name) ->
//     orphans counted (printed and SKIPPED when > 0, never deleted) -> ALTER TABLE billing_profiles ADD CONSTRAINT name
//     billing_profiles_account_id_accounts_id_fk, billing_profiles_location_id_locations_id_fk,
//     billing_profiles_template_id_billing_profile_templates_id_fk  (db:push's names)
// server/tenancy-bootstrap.ts   TABLES_REQUIRING_ORG_ID += "billing_profile_templates" (org index, Heritage default)

// shared/schema.ts
//   customers: defaultBillingProfileId GONE; locations: billingProfileId GONE (insertCustomerSchema / insertLocationSchema follow)
//   users: email text().notNull() (no .unique()); uniqueIndex("users_email_uidx").on(sql`lower(email)`) declared
// shared/audit.ts         AuditEntityType += "app_setting" (label "Setting"; not in REVERTABLE_AUDIT_ENTITY_TYPES)
// shared/app-settings.ts  APP_SETTING_KEY_LABELS (12 keys), describeAppSettingKey(key), APP_SETTING_AUDIT_ENTITY_TYPE
// shared/billing-profile-defaults.ts  BILLING_PROFILE_ERROR_CODES.TEMPLATE_UNKNOWN = "BILLING_PROFILE_TEMPLATE_UNKNOWN"
// shared/permissions.ts   the post_service_ticket / view_cost_margin_ltv descriptions (no new permission; 30)

// server/storage.ts
REVERT_ENTITY_STRIPPED_FIELDS.customer = ["defaultBillingProfileId"]   // a pre-Pass-39 snapshot's field, nowhere to put it
assertBillingProfileRulesTx(tx, { ..., templateId })   // 400 TEMPLATE_UNKNOWN when it names no template of the org (active or not)
// syncLegacyLocationPointerTx REMOVED (createBillingProfile / updateBillingProfile no longer mirror)
private readSettingValueTx(tx, key): string | null
private upsertSettingTx(tx, key, value, actor): AppSetting   // reads before, upserts, auditChangeTx("app_setting", key, {key,value}, {key,value})
private clearSettingTx(tx, key, actor): void                 // deletes when a row exists, audits before -> value null
setServiceTimeTrackingMode(mode, actor?) / setAppointmentCancelReasons(reasons, actor?) / setTicketReopenReasons(reasons, actor?)
setMaterialUnits(units, actor?) / setApplicationAreas(areas, actor?) (writeMaterialList(key, values, msg, actor))
setInvoiceOnFinalizeMode(mode, actor?) / setAttachServiceReportToInvoices(enabled, actor?)
setDispatchBoardSettings(patch, actor?)   // one row per key whose value moved
setBillingDefaults(next, actor?)          // upsert, or clearSettingTx on null
getAuditLogsForEntity(entityType, entityId: string | null, limit?)   // null = every row of the type

// server/routes.ts
createLocationSchema = insertLocationSchema.omit({ accountId })   // POST /api/locations, both forms; the account is derived
GET   /api/audit-logs?entityType=app_setting[&entityId=][&limit=]   // entityType alone is a form; entityId without it 400
PATCH /api/settings/service-time-tracking                           // MANAGE_SETTINGS (was open); every settings PATCH passes getAuditActor(req)
POST / PATCH /api/agreement-templates, /api/target-pests, /api/material-products, /api/billing-plans,
      /api/agreement-cancellation-policies, /api/opportunity-dispositions; PATCH /api/opportunity-categories/:id   // MANAGE_SETTINGS
POST  /api/services/:id/complete, POST /api/service-records          // POST_SERVICE_TICKET
POST / PATCH /api/billing-profiles                                   // 400 BILLING_PROFILE_TEMPLATE_UNKNOWN

// client/src/pages/settings.tsx
RecentSettingsChanges   // GET /api/audit-logs?entityType=app_setting&limit=20, each row labelled + AuditLogEntryCard; card-recent-settings-changes
// the seven cards: Add inside `canManageSettings ? <Dialog/> : <p data-testid="text-<list>-admin-only">`, Edit disabled with settingsManagedBy;
// select-service-time-tracking disabled below Manage Settings; the nine settings mutations call invalidateAuditViews()
```

- **Decided (1), the dead pointers: dropped, both.** The carry onto `billing_profiles.location_id` ran once before
  the drop (0 rows on the dev DB - the one reverse pointer agreed with the forward one; Sarah Chen's customer
  pointer named her account default, consistent and unread). A body naming either field is stripped, not refused
  (the customer / location schemas are not strict - a strict customer body is a behaviour change this pass did
  not take). The 16 location and 14 customer audit snapshots embedding the fields stay as history; a revert of
  one puts back nothing for the dropped field (`REVERT_ENTITY_STRIPPED_FIELDS`).
- **Decided (2), the foreign keys by column, never by name.** A fresh `db:push` database has them under drizzle's
  names from creation; the dev DB had the pkey alone. The bootstrap looks for ANY foreign key on the column
  (`pg_constraint` joined to `pg_attribute`), so both agree, and it never deletes to satisfy a key: an orphan is
  printed and the key skipped for the owner to fix. The template refusal is storage's, inside the write's
  transaction, so the key is a backstop and not the error path.
- **Decided (3), the settings audit is on the KEY.** `entityId` = the setting's key, the snapshots the stored text
  (`{ key, value }`), so the History card's diff reads "Value: PROMPT -> OFF"; a list reads as its JSON string. No
  row before reads as `value: null`, a deleted row (the cleared billing default) as `null` after, and an unchanged
  save writes nothing - `auditChangeTx`'s own rule. The bootstrap seeds (the time-tracking default, the cancel
  reasons, invoice-on-finalize) are raw SQL and write no row. The Settings page shows the last 20 org-wide
  (`entityType` alone is now a valid audit read; the read stays open like every audit read - the C5.10 question).
- **Decided (5), the Settings reference data is gated; the workflow routes are listed.** Fourteen routes gained
  MANAGE_SETTINGS (the Pass 24 service-types precedent, the Pass 34 templates precedent); the seven cards hide Add
  and disable Edit below it. The 43 other ungated writing routes and the money reads are a product decision each
  and sit, grouped, under the new row C5.10 - not decided here.
- **Decided (7), `POST_SERVICE_TICKET` is read.** Every built-in profile holds it (the DB agrees: technician 4 /
  support 14 / manager 29 / admin 30 each include it), so gating the two ticket-creating routes changes nothing
  for any user today and makes the Roles card's checkbox true; a profile the office strips it from is 403
  before the body is read. `VIEW_COST_MARGIN_LTV` stays seeded and unread, its description saying so.
- **Recorded, not built:** seed.ts (a demo for an empty org; nothing to merge), `service_types.category` (free
  text, a shelf not a program), the `Technician` -> `UserSummary` sweep (C5.9), the workflow gates (C5.10).
- **Found and fixed in the docs:** the C5.8 row's two "no reader" claims, "leaves every location body", "Pass
  11c" (f4d43c8, Phase 1 unit 7), "like every settings write"; canon §1's Account `defaultBillingProfileId`
  (never a column - the dead one was on customers), the Agreement's and the Invoice's `billingProfileId` (neither
  table has one; the invoice carries `billingProfileSnapshot`); `server/index.ts`'s "must run before
  bootstrapTenancy()" (tenancy runs twice); the eleven `routes.ts` comments that still deferred gates to C5.6.
- **Not rendered in a browser:** the seven cards' hidden Add / disabled Edit and their notes, the disabled
  time-tracking select, the Recent settings changes card, every refusal toast.
- **Verified** (2026-10-08, PORT=5001 against a copy of the dev DB): `npm run check` clean; boot 1 printed the two
  drops (0 pointers carried), the index and the three keys, boot 2 only the serving line with every count
  unchanged by name across the 50 tables; **135 smoke assertions on the first run**: the labels and the audit
  vocabulary, the columns gone from `information_schema`, the three keys by name and definition, the template
  index, the templates table's org index and default, the two owner `billing_profiles` rows byte-identical to the
  pre-boot snapshot, the email index, a bogus account refused by the key (SQL), a customer / location / PATCH
  carrying the dead fields answered 201 / 201 / 200 with the fields stripped and a bogus `accountId` ignored, the
  templateId refusal on POST and PATCH with the COD template accepted and cleared, every settings PATCH as
  tech / support / manager 403 (service-time-tracking's new) and as admin 200 with its `app_setting` row (key,
  value before / after, "Heritage Admin") and no row on the identical re-save, the untouched dispatch key silent,
  the billing default created then cleared (before the id, after null) then cleared again silently, the org-wide
  read newest first, by key, limited, and `entityId` alone 400, the six reference lists 403 x3 on POST and PATCH
  then 201 / 200 for admin and the categories PATCH, the ticket post 201 as the tech then 403 on a permission-less
  profile (both routes) and 400-by-zod once restored, cleanup to baseline (+4 sessions); Vite 200 on
  settings.tsx, customer-detail.tsx, app-settings.ts, audit.ts, billing-profile-defaults.ts, schema.ts,
  permissions.ts and technicians.ts.

**Shipped in Pass 40** (`feature/phase-6-payment-provider-port`, 2026-10-09) — the C6.1 row as built, the first
Phase 6 row: the provider port and the Stripe adapter, the per-org provider account, the provider customer
mapping, the card on file, a 31st permission, two audit entities, one Settings card, one block in Edit
Location. Signatures:

```ts
// shared/payment-methods.ts (new)
export const PAYMENT_PROVIDERS = ["stripe"] as const;  export const FAKE_PAYMENT_PROVIDER = "fake";
export const PAYMENT_PROVIDER_MODES = ["test", "live"] as const;
export const STORED_PAYMENT_METHOD_TYPES = ["card", "ach"] as const;  // ach named, not captured
export const STORED_PAYMENT_METHOD_STATUSES = ["active", "removed"] as const;
export const PAYMENT_PROVIDER_ERROR_CODES = { NOT_CONFIGURED (409), UNSUPPORTED (400), KEY_INVALID (400), MODE_MISMATCH (400),
  SECRET_REQUIRED (400), ENCRYPTION_KEY_MISSING (503 PAYMENT_CREDENTIALS_KEY_MISSING), REQUEST_FAILED (502), NOT_IMPLEMENTED (501) };
export const PAYMENT_METHOD_ERROR_CODES = { ACCOUNT_NOT_FOUND (404), NOT_FOUND (404), SETUP_INCOMPLETE (400, details.status),
  INTENT_MISMATCH (400), TYPE_UNSUPPORTED (400), LOCATION_MISMATCH (400), REMOVED (409) };
export interface PaymentProviderAccountSummary { configured; provider; mode; publishableKey; connectedAccountId; hasWebhookSecret; status; encryptionReady; updatedAt }
export interface PaymentProviderAccountInput { provider; mode; publishableKey?; secretKey?; webhookSecret?; connectedAccountId? }  // the PUT body
export interface PaymentMethodDisplay { id; type; brand; last4; expMonth; expYear; isDefault; status; livemode }   // never a provider id
export interface StoredPaymentMethodSummary extends PaymentMethodDisplay { accountId; locationId; addedByLabel; createdAt; removedAt }
export interface SetupIntentSession { setupIntentId; clientSecret; provider; mode; publishableKey; livemode }
export interface ConfirmPaymentMethodInput { setupIntentId; makeDefault?; billingProfileId?; locationId? }
describeStoredPaymentMethod(m)           // "Visa •••• 4242 · exp 04/28" / "No card on file"
describeCardBrand, formatCardExpiry, isPaymentMethodExpired(m, now), describePaymentProvider, describePaymentProviderMode
stripeSecretKeyMode(key) / stripePublishableKeyMode(key)  // "test" | "live" | null from the sk_/rk_/pk_ prefix
pickDefaultPaymentMethod(list)           // the active default, else the oldest active, else null
resolveProfilePaymentMethod(profile, list)  // the profile's pointer when active, else pickDefaultPaymentMethod

// shared/billing-profile-defaults.ts: BillingProfileSummary / LocationBillingProjection gain `paymentMethod: PaymentMethodDisplay | null`;
//   projectLocationBilling(locationId, profile, paymentMethod = null); BILLING_PROFILE_ERROR_CODES.PAYMENT_METHOD_UNKNOWN.
// shared/permissions.ts: PERMISSIONS.MANAGE_PAYMENT_METHODS = "manage_payment_methods" (Payments group; support / manager / admin;
//   SEEDED_PROFILE_GRANTS "Pass 40" - the seed counts are 4 / 15 / 30 / 31).
// shared/audit.ts: AuditEntityType += "payment_method" | "payment_provider_account" ("Card on file" / "Payment provider"; not revertable).
// shared/schema.ts: paymentProviderAccounts, paymentProviderCustomers, paymentMethods (declared before billingProfiles);
//   billingProfiles.defaultPaymentMethodId + foreignKey "billing_profiles_default_payment_method_fk" + its index;
//   types PaymentProviderAccount, PaymentProviderCustomer, StoredPaymentMethod (no insert zod schemas - storage writes them).

// server/integrations/payments/types.ts (the port, reshaped)
export interface PaymentProviderCredentials { provider; mode; secretKey; publishableKey; webhookSecret; connectedAccountId }
export interface PaymentMethodRef { externalPaymentMethodId; externalCustomerId; type; brand; last4; expMonth; expYear; livemode }
export interface SetupIntentRef { setupIntentId; clientSecret; livemode }
export interface SetupIntentResult { setupIntentId; status: SetupIntentStatus; livemode; externalCustomerId; paymentMethod: PaymentMethodRef | null }
export class PaymentProviderError extends Error { status: 400 | 409 | 501 | 502 | 503; code; details? }
export interface PaymentProvider { name; mode; createCustomer(input); createSetupIntent(customer, { types, metadata? }); retrieveSetupIntent(id);
  detachPaymentMethod(id); charge(...) / refund(...) / handleWebhook(rawBody: Buffer, signature) /* C6.2: 501 until then */ }
// server/integrations/payments/index.ts: createPaymentProvider(credentials) -> stripe | fake; isSupportedPaymentProvider(name);
//   fakePaymentProviderAllowed() = NODE_ENV !== "production" && PAYMENT_PROVIDER_FAKE_ALLOWED === "1".
// server/integrations/payments/providers/stripe.ts: createStripeProvider(credentials) - new Stripe(secretKey, { stripeAccount? });
//   customers.create / setupIntents.create({ usage: "off_session", payment_method_types }) / setupIntents.retrieve(id, { expand: ["payment_method"] })
//   / paymentMethods.detach; every Stripe failure -> 502 REQUEST_FAILED with Stripe's message (never a key). The ONLY file importing `stripe`.
// server/integrations/payments/providers/fake.ts: createFakePaymentProvider - cus_fake_n / seti_fake_n (succeeded, a Visa or Mastercard) /
//   seti_fake_pending_<cus> / seti_fake_canceled_<cus> / an unknown id -> 502; per-process state.
// server/integrations/payments/credentials.ts: encryptCredential / decryptCredential (AES-256-GCM, "v1:iv:tag:ct", env PAYMENT_CREDENTIALS_KEY -
//   64 hex or base64 of 32 bytes), credentialsEncryptionReady(), describeCredentialsKeyProblem(), fingerprintCredential() (8 hex of SHA-256).

// server/payment-methods-bootstrap.ts (after bootstrapBillingProfiles, every boot; each step printed once, silent after)
//   CREATE TABLE payment_provider_accounts / payment_provider_customers / payment_methods (org_id NOT NULL; the FKs under db:push's names),
//   their unique and plain indexes; ALTER TABLE billing_profiles ADD COLUMN default_payment_method_id; ADD CONSTRAINT
//   billing_profiles_default_payment_method_fk (orphans printed and skipped); a WARN on every boot while PAYMENT_CREDENTIALS_KEY is unset.

// server/storage.ts (IStorage; every write takes the actor)
getPaymentProviderAccount(): Promise<PaymentProviderAccountSummary>
setPaymentProviderAccount(input, actor)          // validate the key shapes against the mode, encrypt, upsert on (org, provider); audit created / update
disconnectPaymentProviderAccount(actor)          // secrets cleared, status inactive; audit status_changed; 409 when none
getPaymentMethodsForAccount(accountId, includeRemoved = false): Promise<StoredPaymentMethodSummary[]>
createSetupIntentForAccount(accountId, actor): Promise<SetupIntentSession>   // requirePaymentProviderTx + ensureProviderCustomer + provider.createSetupIntent
confirmSetupIntentForAccount(accountId, input, actor): Promise<StoredPaymentMethodSummary>  // retrieve, the four refusals, insert (first = default), audit created
setDefaultPaymentMethod(id, actor) / removePaymentMethod(id, actor)   // demote the others (audit each); detach when the connected provider is the card's,
                                                                      // status removed, profiles' pointers cleared (their own audit rows), the oldest active promoted
// private: requirePaymentProviderTx(reader) -> { provider, account } (409 NOT_CONFIGURED), toPaymentProviderCredentials(row) (decrypt),
//   ensureProviderCustomer(provider, account) (find-or-create outside any transaction), listActivePaymentMethodsTx, setPaymentMethodDefaultTx,
//   setBillingProfilePaymentMethodTx; assertBillingProfileRulesTx checks `defaultPaymentMethodId`; getCustomerDetailCompat fills
//   `billing.paymentMethod` / `accountDefault.paymentMethod`; the two History reads collect `payment_method` refs; PaymentMethodError.

// server/routes.ts
GET  /api/payment-provider                               (open)              -> PaymentProviderAccountSummary
PUT  /api/payment-provider                               (MANAGE_SETTINGS)   strict { provider, mode, publishableKey?, secretKey?, webhookSecret?, connectedAccountId? }
DELETE /api/payment-provider                             (MANAGE_SETTINGS)   -> the summary, disconnected
GET  /api/accounts/:accountId/payment-methods            (open)              ?includeRemoved=true -> StoredPaymentMethodSummary[]
POST /api/accounts/:accountId/setup-intents              (MANAGE_PAYMENT_METHODS) -> 201 SetupIntentSession
POST /api/accounts/:accountId/payment-methods            (MANAGE_PAYMENT_METHODS) strict ConfirmPaymentMethodInput -> 201 the summary
POST /api/payment-methods/:id/make-default               (MANAGE_PAYMENT_METHODS)
POST /api/payment-methods/:id/remove                     (MANAGE_PAYMENT_METHODS)   never a DELETE
// billingProfileWriteSchema gains defaultPaymentMethodId (nullable); respondPaymentError answers { code, message, details? } under the status.

// client
// components/payment-methods-block.tsx: PaymentMethodsBlock({ accountId, idPrefix, warnNoCard }), PaymentMethodSelect({ value, onChange, methods, idPrefix }),
//   useAccountPaymentMethods(accountId), usePaymentProviderSummary(); AddCardDialog -> POST setup-intents, loadStripe(publishableKey) once per key,
//   <Elements options={{ clientSecret }}> + <PaymentElement>, stripe.confirmSetup({ elements, redirect: "if_required" }), POST payment-methods.
// components/payment-provider-settings-card.tsx: PaymentProviderSettingsCard({ canManageSettings, settingsManagers }) - the Payments card.
// pages/customer-detail.tsx: BillingProfileFormState.defaultPaymentMethodId; BillingProfileFields / LocationBillingSelector take `paymentMethods?`;
//   EditLocationDialog renders the block; the header chip and the location line append the card. lib/invalidate-audit-views.ts: invalidatePaymentMethodViews().
```

Verified on PORT=5001 against a COPY of the dev DB (`pestflow_verify`, dropped afterwards) with `PAYMENT_PROVIDER_FAKE_ALLOWED=1`
and a throwaway `PAYMENT_CREDENTIALS_KEY`: `npm run check` clean; boot 1 printed the grant, the three tables, the column and
the key; boot 2 only the serving line with every count unchanged by name across the 53 tables; 99 smoke assertions on the
second run (the first lost one to the fake provider's pending intent carrying no customer - the double, not the server);
Vite 200 on the two pages, the two new components, the two client libs and the six shared modules. Not rendered: the Payment
Element, the Cards on file block, the card select, the Payments card and every refusal toast (no browser, no Stripe key).

## Part E — Decision log

**Owner review of 2026-09-19** (answers to the questions the 2026-09-17 plan raised):

| # | Question | Answer |
|---|---|---|
| 1 | Quick action on the invoice row | None; the row opens the modal |
| 2 | Sold-by reference | One `users` table for everyone, techs and office. Recorded as a `users` FK plus a `technicians.userId` bridge in Pass 12; **built in Pass 38 (C5.7)**: the technicians table is dropped, a technician is a users row with a technician status, the five technician FKs reference users, and the bridge (never linked on the dev DB) was replaced by minting each technician's users row under the technician's own id |
| 3 | B1 landing screen after Post | Unchanged |
| 4 | B5 statement | Yes — commercial, property managers, home sale (C2.5) |
| 5 | B12 target pests | Ticket level, including every material's pests; per-application pests for compliance (C3.4b) |
| 6 | B13 order instructions | Appointment-level instructions to the technician; dispatch and tech views both edit services, the tech view behind selectors |
| 7 | Technician adds a service without approval | Yes, flagged for review (C4.3b) |
| 8 | Who may revert | Manager+ was the interim; a configurable profile permission since Pass 37 (C5.6) - the built-in manager and admin profiles hold `REVERT_HISTORY`, the office may give it to any profile |
| 9 | B8 structure label | None; a settings-managed Agreement types list seeded with Pest control / Termite / Mosquito / Wildlife / Evaluation (C5.3) - **built in Pass 35** (2026-10-06): `agreement_types`, Settings → Agreement Types with Add / Edit / Merge; the migrated "Annual" is its own entry to rename or merge |
| — | B2 | The action is RESCHEDULE; CANCEL runs the flow; agreement services recycle with a reset window; confirm board moves (C4.2) |
| — | B7 | ASSIGNED_TO with auto-assignment rules (C4.1, C4.1b) |
| — | B11 | Separate documents; a Settings toggle attaches the service report to visit invoices (C3.5) |
| — | B14 | EXCLUDE_TECH, per location with apply-to-all-locations (C4.4) |
| — | B16 | Role profiles configurable in Settings (C5.6 - built as Pass 37) |
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
| 5 | A PENDING_SCHEDULING service cannot be cancelled without placing it on the board first; the appointment details are needed from the queue | **Built**: cancelling a pending service outright, from the queue and the Services tab, joined C4.3a (Pass 28); the queue's **Details** button (the board's Service Details dialog for the pending service) and its customer / location links shipped in C5.4 (Pass 36, 2026-10-07) |
