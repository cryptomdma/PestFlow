# PLAN_BILLING_V1.1 — Execution Plan (D1-D9)

> Turns the settled decisions in `PLAN_BILLING_V1_1.md` (D1-D9) into an ordered, PR-sized sequence of
> branches. `PLAN_BILLING_V1_1.md` is still the source of truth for *what* was decided; this document
> is *how* it gets built, in what order, and why. `CURRENT_FOCUS.md` tracks which pass is next — update
> it, not this file, when a pass finishes.

Built from three exhaustive codebase sweeps plus direct verification of `server/storage.ts`'s core
generation functions, `server/jobs/billing-run.ts`, `shared/permissions.ts`, and live DB counts —
grounded in what the code and data actually do, not what the decision record assumes.

---

## Pass status

| # | Branch | Decisions | Status |
|---|---|---|---|
| 0 | `docs/pass-0-cleanup` | — (docs cleanup) | Done |
| 1 | `feature/phase-1-appointment-status-enum` | D1a | Done |
| 2 | `feature/phase-1-audit-log-infrastructure` | D7 (infra half) | Done |
| 3 | `feature/phase-1-invoice-appointment-anchor` | D1 | Done |
| 3.5 | `feature/phase-1-agreement-billing-plan-selector` | — (gap found in Pass 3 live testing) | Done (PR #59) |
| 4 | `feature/phase-1-draft-invoice-lifecycle` | D3, Q3 | Done (PR #60) |
| 5 | `feature/phase-1-finalize-invoice-wiring` | D2 | Done (PR #61) |
| 5.5 | `feature/phase-1-initial-charge-to-agreement` | D4 (owner correction) | Done (PR #62) |
| 6 | `feature/phase-1-payments-lite` | D5, D4 | Done (PR #63) |
| 7 | `feature/phase-1-coa-and-field-display` | D6 | Done (PR #64) |
| 7.5 | `feature/phase-1-tech-collect-relabel` | D8 (post-ticket sequence relabel) | Done (PR #65) |
| 7.6 | `feature/phase-1-review-modal-field-collection` | D9 (review modal price/payment + address blocks), D5 owner review items 1-3 | Pushed, awaiting merge |
| 7.7 | `feature/phase-1-payments-screen` | D5 owner review item 4 (Payments screen, batch confirmation, collections report) | Not started |
| 8 | `feature/phase-1-audit-log-backfill` | D7 (remainder) | Not started |
| 9 | `feature/phase-1-legacy-billing-frequency-removal` | D9 | Not started |

Pass 3.5 is inserted, not renumbered in: it was not in the original D1-D9 sequence at all, but Pass 3's
live testing found that `billingPlanId` had no writer anywhere in the client, so every agreement was
plan-less and the schedule-billed half of the billing engine was unreachable through the app. It is
numbered 3.5 so passes 4-9 keep the numbers every other document already cites. Pass 7.5 is inserted
the same way: D8 named the technician collect / post relabel as its own tech-view pass "after
payments-lite exists to collect against", and `CURRENT_FOCUS.md` held it out of every numbered pass.
Passes 7.6 and 7.7 are inserted from the owner's live-testing review of Pass 7.5 (2026-09-15,
recorded under D5 in `PLAN_BILLING_V1_1.md`): the review modal's price/payment block was decided in
D9 but the Pass 9 row scoped only the column drop, so it was owned by no pass; the Payments screen
was never in D1-D9 at all. Both are rows in the Ordered Work Plan below.

Reordered from the original 7-pass sketch for two reasons: (a) audit infrastructure moves from near-last
to position 2, so passes 3-8 call the already-built helper as they write new financial mutations instead
of retrofitting logging into five already-shipped passes; (b) D2 (finalize wiring) is split from D3
(DRAFT lifecycle) because D2's "adopt an existing DRAFT" behavior is meaningless until D3 defines what
DRAFT means — two independently reviewable PRs, not one.

Migration convention: this repo uses idempotent hand-written SQL in `server/*-bootstrap.ts`, run on
every boot (`server/index.ts`) — never `drizzle-kit generate` (no `migrations/` directory exists).
"Migration" below means a bootstrap-script change.

---

## 1. Impact Analysis

### D1 — invoices.serviceRecordId / generateInvoiceFromServiceRecord() consumers

**Storage layer (`server/storage.ts`):**

| Site | What it does today | D1 impact |
|---|---|---|
| `3973-4094` `generateInvoiceFromServiceRecord()` | One-service-record-to-one-invoice. Pre-checks `eq(invoices.serviceRecordId, id)` (3986), rejects agreement-generated services (3995-3997), inserts with `serviceRecordId: record.id` (4046), 23505-catch re-queries by `serviceRecordId` (4069) | **Rewritten**: anchor on `record.appointmentId`; if present, call `getLinkedServicesForAppointmentTx()` (already private on the same class — no visibility change needed) to roll up every finalized service on that appointment into one invoice, one line per service; keep the current single-record path as the fallback for appointment-less work |
| `3674-3693` `getServiceRecordsReadyForBilling()` | Excludes already-invoiced records via `invoice.serviceRecordId` (3677); excludes agreement-generated services entirely (3684-3692) | Exclusion must become appointment-aware (exclude by `invoices.appointmentId`, falling back to `serviceRecordId` for appointment-less records); the agreement-service exclusion must become "include, but only as a $0 line" — see Critique §2.1 |
| `3701-3707` `getServiceRecordsReadyForBillingInRange()` | Delegates to the above, filters by date | Inherits the rework automatically |
| `3716-3736` `batchGenerateInvoicesForDateRange()` | Loops **per service record**, calling `generateInvoiceFromServiceRecord(record.id)` once each | Should dedupe by `appointmentId` before looping (see Critique §2.3) — otherwise two finalized records on one appointment produce one real invoice plus one wasted "already exists" round-trip and a confusing skipped/invoiced report |
| `3779-3820` `createManualInvoice()` | Inserts `serviceRecordId: null` | Unaffected — also insert `appointmentId: null`; manual/ad-hoc invoices stay anchor-less by design |
| `4102-4235` `generateScheduleDrivenInvoice()` | Inserts `serviceRecordId: null`; idempotent via `billingEvents(agreementId, periodKey)`, never touches `appointmentId` | **Untouched** — confirmed by direct read of `server/jobs/billing-run.ts`; this path bills on `locationId`/`customerId`, never an appointment |
| `4238-4241` `updateInvoice()` | Generic `.set(data)`; `serviceRecordId` theoretically writable via `InsertInvoice`, but no route exposes it (`updateInvoiceStatusSchema` restricts to `status/paidDate/dueDate/notes`) | No change needed |

**Bootstrap (`server/invoice-bootstrap.ts:48-52`):** the partial unique index
`invoices_service_record_id_non_void_uidx ON invoices (service_record_id) WHERE status != 'VOID' AND
service_record_id IS NOT NULL` — see Critique §2.2 for whether this is replaced or kept alongside a
new appointment index.

**Routes (`server/routes.ts`):**
- `1686-1693` `POST /api/invoices/generate-from-service-record/:serviceRecordId` — stays as the
  appointment-less fallback entry point; behavior changes only via the storage rewrite above.
- `1662-1665`, `1703-1723` (`ready-for-billing`, `batch-preview`, `batch-generate`) — all inherit the
  storage-layer rework, no route-shape change required.
- `1736-1751` `PATCH /api/invoices/:id` — already scoped to `status/paidDate/dueDate/notes` (a prior
  bug-sweep fix); unaffected.

**Client:**
- `client/src/pages/customer-detail.tsx:2624` — `invoiceByServiceId` reads `invoice.serviceRecordId`
  directly to mark services "already invoiced." Needs an `invoiceByAppointmentId` sibling (or a
  combined lookup) once invoices anchor on appointments.
- `client/src/pages/invoices.tsx:133` and `client/src/pages/service-ticket-review.tsx:149-166,455` —
  drive the manual/batch generate UI off `ServiceRecord.id`, not `invoice.serviceRecordId` directly;
  low direct impact, but batch UI messaging should be updated once batch-generate reports per
  appointment instead of per record (see Critique §2.3).
- No appointment/schedule view currently links to invoices at all — confirmed via full-repo grep.

### D1a — appointments.status write-sites and literal comparisons

**Complete literal-value inventory** (exhaustive, confirmed against live data):

| Value | Site count | Status |
|---|---|---|
| `"scheduled"` | 8 (schema default, storage.ts×2, schedule.tsx×4, seed.ts×3 rows) | maps to `SCHEDULED` |
| `"canceled"` | 14 across storage.ts, schedule.tsx, dashboard.tsx, technician-work.tsx, customer-detail.tsx | maps to `CANCELED` |
| `"completed"` | 12 across storage.ts, schedule.tsx, technician-work.tsx, customer-detail.tsx, seed.ts | maps to `COMPLETED` |
| `"in_progress"` | 5 across storage.ts, schedule.tsx | maps to `IN_PROGRESS` |
| `"pending"` | 1 — `schedule.tsx:271` dropdown option only, 1 live DB row | resolved — maps to `SCHEDULED`, see §5 Q4 |

Full file:line list — every one of these must be updated in the **same** PR as the enum/casing change,
since a half-migrated casing silently breaks every literal comparison below it:

- **Writes**: `storage.ts:2743,2748,3018` (`"canceled"`), `3105,3378` (`"in_progress"` ternaries),
  `3471` (`"completed"`), `3515` (`"in_progress"`/`"scheduled"` ternary), `2975-2984`
  `updateAppointment()` and `2896-2906` `createAppointment()` (both currently accept **any**
  caller-supplied string — no server-side enum exists today).
- **Comparisons**: `storage.ts:971,2137,2170,2742,3105,3143,3378,3514`;
  `dashboard.tsx:20`; `technician-work.tsx:228,272,283`; `customer-detail.tsx:2079`;
  `schedule.tsx:194,298,586,615,963,965,969,972,976`.
- **Bootstrap scripts**: none set or default `appointments.status` — confirmed across all bootstrap
  files. The table itself comes from Drizzle push, not a raw-SQL `CREATE TABLE`.
- **Seed data**: `server/seed.ts:225-229` — 2× `"completed"`, 3× `"scheduled"`.
- **UI dropdown** (the only user-facing selector): `schedule.tsx:267-271` — `scheduled | in_progress |
  completed | canceled | pending`. Remove the `"pending"` option (§5 Q4).
- **No zod enum exists today** for appointment status (contrast: `serviceStatusSchema`,
  `agreementStatusSchema`, `technicianStatusSchema`, `opportunityStatusSchema` all exist in
  `routes.ts` — appointments is the one entity in this family with zero validation).
- **Cross-table sync sites** (legitimate, not bugs, but must update in lockstep): `storage.ts:2137,2170`
  and `schedule.tsx:586,615` read lowercase `appointment.status` to derive uppercase `services.status`
  — the casing itself is currently the only signal distinguishing which table's vocabulary is meant.

**Casing convention**: `SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED` (matches `services.status`'s
existing uppercase convention, single-L `CANCELED`).

**Row-normalization migration** (bootstrap script, idempotent):
```sql
UPDATE appointments SET status = 'SCHEDULED' WHERE status = 'scheduled';
UPDATE appointments SET status = 'IN_PROGRESS' WHERE status = 'in_progress';
UPDATE appointments SET status = 'COMPLETED' WHERE status = 'completed';
UPDATE appointments SET status = 'CANCELED' WHERE status = 'canceled';
UPDATE appointments SET status = 'SCHEDULED' WHERE status = 'pending'; -- resolved, §5 Q4
ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'SCHEDULED';
```
Add `appointmentStatusSchema = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"])` in
`routes.ts`, apply it to `appointmentSchema`/`updateAppointmentSchema` (currently unconstrained), and
update all ~39 write/comparison sites above to the new literals in the same commit.

### D9 — defaultBillingFrequency / billingFrequency reads, and legacy-row count

**Live DB count** (read-only query, dev DB, 2026-08-25):

| | Total | Legacy text, no plan | Has plan | Neither |
|---|---|---|---|---|
| `agreements` | 17 | 9 (all `"Monthly"`) | 6 | **2** |
| `agreement_templates` | 2 | 0 | 2 | 0 |

The 2 agreements with **neither** field set (`1044779c-2358-4254-8e23-220062c21719`,
`6e6f03c3-f069-46ae-9d52-a044129a9a2f`, both `status = ACTIVE`) are a distinct bucket from the 9
"has legacy text" rows — they can't be caught by a `WHERE billing_frequency IS NOT NULL` flag query,
since they have no billing data at all. `agreement_templates` is already fully clean.

**Every reader/writer:**

| File:Line | Field | Kind |
|---|---|---|
| `shared/schema.ts:311,368` | both | column definitions (being dropped) |
| `storage.ts:670,721` | `billingFrequency` | write (agreement insert/update normalize) |
| `storage.ts:760,785` | `defaultBillingFrequency` | write (template insert/update normalize) |
| `storage.ts:1112` | both | the one place they intersect — template→agreement propagation |
| `seed.ts:145,167,189` | `defaultBillingFrequency` | write — must delete, or the build breaks (TS excess-property check) |
| ~~`customer-detail.tsx`~~ | — | **Removed in Pass 3.5.** No client file reads or writes either column any more — verified by full-repo grep. Pass 9 is now a server-plus-schema change only |
| ~~`settings.tsx`~~ | — | **Removed in Pass 3.5**, same as above |
| `routes.ts` (schema `.extend()` calls) | both | inherited implicitly — no line-level edit needed, resolves when the columns are dropped |

**Confirmed clean**: the nightly billing run (`server/jobs/billing-run.ts`) uses only
`nextBillingDate`, `billingPlanId`, `priceCents`, `billingPlans.intervalUnit/intervalCount/
chargeTrigger/billingMode`, `termUnit/termInterval/startDate` — never `billingFrequency`. No PDF/HTML
document renderer references either field. No zod enum constrains either field anywhere.

---

## 2. Plan Critique

### 2.1 The double-invoicing risk (D1 × D2, the most serious conflict)

Today, `generateInvoiceFromServiceRecord()` **rejects outright** any agreement-generated service
(`storage.ts:3995-3997`), and `getServiceRecordsReadyForBilling()` **excludes** them from eligibility
(`3684-3692`) with an explicit comment: *"Agreement-generated services are billed through the
agreement's billing plan... never invoiced per service record."* This is the existing guardrail that
prevents a service from being billed both by the nightly run **and** a per-service invoice.

D2 requires agreement-covered services to appear on the visit invoice as visible **$0** lines. If the
exclusion is simply removed to make that possible, nothing left in the code stops an agreement service
from acquiring a nonzero `amountCents` line or a `billingEvents` row outside the nightly run — that is
exactly how a customer gets billed twice.

> **Correction, from building it in Pass 3.** This section (and §1's impact-table row) says to include
> agreement services "as a $0 line," full stop. That is wrong for any agreement whose plan the nightly
> run does not bill — `ON_SERVICE_COMPLETION`/`PER_SERVICE` (COD), `ON_AGREEMENT_START`, `INSTALLMENT`,
> or no plan at all. The run skips exactly those (`billing-run.ts` gate), so zeroing them on the visit
> invoice means **nobody bills the work** — silently, which is worse than the loud error the old
> reject-outright behavior produced. The guard below is correct only for schedule-billed plans; the
> implemented rule is `isScheduleBilledPlan()`, and everything else is billed at the visit.

**Concrete guard, to be built in Pass 3 (D1) and enforced through Pass 5 (D2):**
- Add `AGREEMENT_COVERED` to `invoiceLineItems.lineType`'s existing set (`SERVICE | ADDON | SURCHARGE |
  FEE | DISCOUNT | ADJUSTMENT`) — structurally distinct from a chargeable line, not just a $0 amount
  that could later drift.
- The appointment-level generation function must insert agreement-covered lines with
  `amountCents: 0`, `taxable: false`, `lineType: "AGREEMENT_COVERED"`, and must **never** call
  `generateScheduleDrivenInvoice()` or insert into `billingEvents` for them — that stays exclusively
  the nightly job's responsibility.
- Verification target (add to Pass 5's acceptance test): a visit invoice's `AGREEMENT_COVERED` lines
  always sum to `$0` and never appear in `billing_events`; the agreement's own monthly invoice from
  the nightly run is unaffected by how many visit invoices reference that agreement's services.

### 2.2 D1's literal wording vs. what the code needs

D1 says *"`invoices.serviceRecordId` becomes `invoices.appointmentId` + line-level `serviceRecordId`
on `invoice_line_items`"* — read literally, this drops the invoice-header `serviceRecordId` column.
But D1's own next sentence requires a fallback: *"For work with no appointment (direct one-offs), fall
back to one non-void invoice per `serviceRecordId`"* — and `createManualInvoice()` /
`generateScheduleDrivenInvoice()` already both explicitly insert `serviceRecordId: null` today, so a
header-level "no anchor" state already exists independent of this migration.

**Resolution** (schema mechanics, not domain policy — resolved directly): **keep**
`invoices.serviceRecordId` as a nullable column, used only for the appointment-less fallback; **add**
`invoices.appointmentId` nullable; two mutually-exclusive partial unique indexes:
```sql
CREATE UNIQUE INDEX invoices_appointment_id_non_void_uidx
  ON invoices (appointment_id) WHERE status != 'VOID' AND appointment_id IS NOT NULL;
-- existing invoices_service_record_id_non_void_uidx stays as-is, unchanged
```
An invoice sets exactly one of `{appointmentId, serviceRecordId}` at the header (never both);
line-level `invoiceLineItems.serviceRecordId` already exists and is unaffected either way. The 23505
race-condition catches in `generateInvoiceFromServiceRecord`/its appointment-aware rewrite must be
re-keyed to whichever anchor was actually used for that insert.

### 2.3 Batch-generate should dedupe by anchor before looping

`batchGenerateInvoicesForDateRange()` loops per `ServiceRecord`. Once generation is appointment-aware,
two finalized records on the same appointment would call the generation function twice — idempotency
prevents a duplicate invoice, but the second call is a wasted round-trip and produces a confusing
report (`"1 invoiced + 1 skipped: already invoiced"` for what is, from the office's perspective, one
visit). Rewrite the batch loop to group eligible records by `appointmentId` (falling back to
`serviceRecordId` for appointment-less ones) before calling generation once per group.

### 2.4 Audit promotion (D7) moved earlier, not left second-to-last

D7's own scope list (*"invoice issue/void, line edits while DRAFT, credit memo issue/apply, payment
record/confirm/apply/release/refund, COA application, price override, ticket reopen, pre-finalization
issue override"*) is almost entirely **new code written in passes 3-7 of this plan**. Landing audit
promotion last would mean writing all of that financial logic once without logging, then retrofitting
`audit_logs` calls into five already-shipped passes. Split D7 into infrastructure (small, foundational,
lands at **Pass 2**, right after D1a) and backfill (mechanical, lands at **Pass 8**) so passes 3-7 call
the already-built helper as they're written instead of retrofitting later.

### 2.5 D5 transactional boundary — concrete proposal

A payment application (and its inverse, release/un-apply) must update
`invoices.amountPaidCents`/`balanceDueCents`/`status` in the **same transaction** as the
`payment_applications` row — the same single-transaction discipline already used everywhere else in
this codebase (`finalizeServiceRecord`'s multi-table update, `generateScheduleDrivenInvoice`'s
invoice+billingEvent insert).

```
async applyPayment(paymentId, invoiceId, amountCents, actor) {
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices)
      .where(and(eq(invoices.orgId, this.orgId), eq(invoices.id, invoiceId)))
      .for("update");                                    // row lock - see below
    // validate: payment has amountCents of unapplied balance remaining
    // validate: amountCents does not exceed invoice.balanceDueCents (overpayment: unified pool, §5 Q2)
    await tx.insert(paymentApplications).values({ paymentId, invoiceId, amountCents, appliedByUserId, ... });
    const applications = await tx.select().from(paymentApplications)
      .where(and(eq(paymentApplications.invoiceId, invoiceId), eq(paymentApplications.released, false)));
    const creditApps = await tx.select().from(creditApplications)
      .where(and(eq(creditApplications.invoiceId, invoiceId), eq(creditApplications.released, false)));
    const amountPaidCents = sum(applications) + sum(creditApps);   // recomputed fresh, never incremented
    const balanceDueCents = invoice.totalAmountCents - amountPaidCents;
    const status = balanceDueCents <= 0 ? "PAID" : amountPaidCents > 0 ? "PARTIALLY_PAID" : invoice.status;
    await tx.update(invoices).set({ amountPaidCents, balanceDueCents, status }).where(...);
    await tx.insert(auditLogs).values({ entityType: "invoice", action: "payment_applied", before, after, ... });
  });
}
```

Key choices:
- **Row lock** (`SELECT ... FOR UPDATE` on the invoice) — a running balance decremented by variable
  amounts, not a "does a key already exist" check, so the existing unique-index-plus-23505-catch
  pattern used elsewhere doesn't protect against two concurrent applications jointly overpaying.
- **Recompute, don't increment**: `amountPaidCents` is summed fresh from the ledger every time —
  self-healing, matches "status derives from amounts, never hand-set."
- **Release is a new record, not a delete/update-in-place**: a `released` boolean with a required
  reason column, excluded from the recompute SUM — append-only, matches D5's constraints.
- Every step commits atomically in one transaction — a partial write here (application recorded but
  invoice rollup not updated) is the exact bug class D5 exists to prevent.

---

## 3. Ordered Work Plan

| # | Branch | Decisions | Files touched (representative) | Migration? | Unblocks | Verify |
|---|---|---|---|---|---|---|
| 1 | `feature/phase-1-appointment-status-enum` | D1a | `shared/schema.ts` (default), new `appointmentStatusSchema` in `routes.ts`, ~39 write/comparison sites across `storage.ts`/`schedule.tsx`/`dashboard.tsx`/`technician-work.tsx`/`customer-detail.tsx`, `seed.ts` (remove the `"pending"` dropdown option) | Yes — row-normalization UPDATEs (including the 1 live `'pending'` → `SCHEDULED` row) + column default change | D1 (an appointment-anchored invoice needs a trustworthy status) | `npm run check`; boot ×2; PowerShell: create/cancel/complete an appointment through the API, confirm the DB holds only the 4 enum values |
| 2 | `feature/phase-1-audit-log-infrastructure` | D7 (infra half) | New `recordAuditLog()` helper in `storage.ts` (reuses the existing `auditLogs` insert shape from the one legacy call site), new `GET /api/audit-logs` route, new customer-screen history panel | No (table already exists) | Passes 3-8 call the helper as they write new financial mutations, instead of retrofitting | `npm run check`; boot ×2; PowerShell: trigger the one existing write path (customer/location compat update), confirm it's now readable via the new GET route |
| 3 | `feature/phase-1-invoice-appointment-anchor` | D1 | `shared/schema.ts` (`invoices.appointmentId`), `invoice-bootstrap.ts` (new partial unique index, §2.2), `storage.ts` (`generateInvoiceFromServiceRecord` rewrite, `getServiceRecordsReadyForBilling`, `batchGenerateInvoicesForDateRange` dedupe, `AGREEMENT_COVERED` lineType), `customer-detail.tsx` (`invoiceByAppointmentId`) | Yes — new column + new partial unique index | D2 needs this anchor to exist first | `npm run check`; boot ×2; PowerShell: finalize 2 services on 1 appointment, generate once, confirm 1 invoice/2 lines; call generate again, confirm no duplicate; confirm an agreement-covered line is $0 and produces no `billing_events` row |
| 4 | `feature/phase-1-draft-invoice-lifecycle` | D3, §5 Q3 | `shared/schema.ts` (invoices already declares `DRAFT` in its status comment — now actually used), new `ISSUE_INVOICE_PREFINALIZATION` permission in `shared/permissions.ts`, new issue route/action, `storage.ts` (draft→issue transition), review-flag mechanism (reuse/extend `serviceRecords.ticketStatus` rather than new architecture), cancel-appointment prompt ("void the draft invoice too?") wired into both `cancelAgreement`'s appointment-cancel branch (`storage.ts:2743,2748`) and `requestAppointmentCancelOrReschedule` (`storage.ts:3018`) | No (status value already exists in the enum comment, just unused) | D2's "adopt existing DRAFT" behavior | `npm run check`; boot ×2; PowerShell: create a DRAFT invoice pre-finalization as support (403 on issue), as manager (200, ticket flagged); cancel an appointment carrying a DRAFT invoice through both cancel paths, confirm the void-prompt fires on each |
| 5 | `feature/phase-1-finalize-invoice-wiring` | D2 | `storage.ts` (`finalizeServiceRecord`'s existing `allFinalized` branch at `3468-3475` — generate-or-adopt hook, reusing `getLinkedServicesForAppointmentTx`), `shared/schema.ts` (`invoiceOnFinalize` app setting), settings UI, finalize-flow prompt (Generate / Generate & Send / Later) | Yes — new `app_settings` key default | D5 (payments need real issued invoices to apply against) | `npm run check`; boot ×2; PowerShell + manual UI: finalize the last service on an appointment, confirm the prompt fires and each of the 3 choices behaves correctly; finalize again (idempotent, no second invoice) |
| 6 | `feature/phase-1-payments-lite` | D5, D4 | New `payments`, `payment_applications`, `credit_memos`, `credit_applications` tables (append-only, mirroring `productionValueEntries`'/`billingEvents`' no-update/no-delete `IStorage` surface), new `amountPaidCents`/`balanceDueCents` on `invoices`, apply/release transaction from §2.5, pending-confirmation flow, wiring of `TAKE_PAYMENT_FIELD`/`REFUND_PAYMENT`/`ISSUE_CREDIT_MEMO` (already-defined, currently-unused permission constants) to real routes, deposit-designation prompt at invoice generation | Yes — 4 new tables + 2 new invoice columns | D6 (COA is payment application — needs the ledger to exist) | `npm run check`; boot ×2; PowerShell: record a cash payment PENDING (doesn't mark paid), confirm it (flips amounts/status atomically, audit shows both events), apply/release a payment (audit-logged, reason required on release) |
| 7 | `feature/phase-1-coa-and-field-display` | D6 | Tech ticket / appointment-detail UI (Price / COA applied / Due today), `BILLABLE` vs `PRODUCTION` service designation, billing-plan pill on agreement card | No | — | `npm run check`; boot ×2; manual UI: COA application changes "due today" without touching price, production value, or tax basis |
| 7.6 | `feature/phase-1-review-modal-field-collection` | D9 (review modal price/payment + address blocks, Next/Back), D5 owner review items 1-3 | `shared/schema.ts` (`payments.appointmentId` nullable - "collected at this visit", intent like `designatedAgreementId`; `invoices.pendingAppliedCents` stored rollup), `payments-bootstrap.ts` (both columns; one-shot backfill of the pending rollup from unreleased applications of PENDING payments, Pass 6's `WHERE ... IS NULL` pattern), `storage.ts` (`recordPayment` takes `appointmentId` and refuses one at another location; `recomputeInvoiceRollupTx` stores the `pendingCents` that `sumInvoiceApplicationsTx` already computes; `unappliedSourcesForLocationTx` / `orderSourcesForAgreementsTx` carry `appointmentId` and order visit-collected first, then agreement-designated, then undesignated; a by-appointment payments read), `routes.ts` (`recordPaymentSchema.appointmentId`, the by-appointment read), `shared/payments.ts` (`UnappliedSource.appointmentId`), `shared/invoice-status.ts` (`computeInvoiceRollup` returns `pendingAppliedCents`), `collect-payment-dialog.tsx` (sends the appointment), `service-ticket-review.tsx` (the visit's `VisitBillingRows`; a "Collected in the field" list for this visit - method, amount, check #, collector, status - with Confirm gated exactly as `LocationLedgerPanel` gates it; the location's other unapplied balance in one line; address block; Next/Back over `filteredRecords`), `invoices.tsx` + `InvoiceRowLedger` (a "pending confirmation" line and tile sub-line), `apply-location-balance-prompt.tsx` ("collected at this visit" on a source). Not in scope: D9's office edit button and reopen-reason dropdown | Yes - two nullable columns + one backfill | 7.7 (the queue and the report group by visit and collector; the confirm gating is shared) | `npm run check`; boot ×2; PowerShell: a technician's collection on a visit carries `appointmentId`, and one for an appointment at another location is refused; the by-appointment read lists it; support confirms a check and is refused cash, manager confirms cash; `pendingAppliedCents` equals the applied pending sum, drops to 0 on confirm while `amountPaidCents` rises by the same amount; the D4 prompt lists visit-collected money first; the review modal (manual UI) shows the figures and the collection before Finalize |
| 7.7 | `feature/phase-1-payments-screen` | D5 owner review item 4 | `routes.ts` + `storage.ts` (an org-wide `GET /api/payments` with server-side filters - status, method, received-date range, collector, customer/location search; `POST /api/payments/confirm-batch { paymentIds }` → `{ confirmed, skipped: [{ id, reason }] }` with the permission checked per payment - CASH needs `CONFIRM_CASH_PAYMENT`, so a support user's cash is skipped and reported - one transaction and one `payment_confirmed` audit row per payment, the invoices it sits on re-rolled exactly as single confirm does; a collections read for a date range grouped by day / collector / method, pending against confirmed), `shared/payments.ts` (filter and report shapes), new `client/src/pages/payments.tsx` (pending-confirmation queue with select-all and Batch Confirm, filters, search, rows linking to the location; the collections report as the deposit-slip view), navigation entry. Read-only report, derived, nothing new stored | No | - (closes the field → office loop for real use) | `npm run check`; boot ×2; PowerShell: the list filters by status / method / date / collector; batch confirm as support with one cash and one check pending confirms the check, skips the cash with a reason, writes one audit row; as manager both confirm; the collections totals equal the sum of the listed payments for the range, pending and confirmed separately |
| 8 | `feature/phase-1-audit-log-backfill` | D7 (remainder) | Add `recordAuditLog()` calls to pre-existing financial mutation points D7 lists that passes 3-7 didn't already cover — e.g. price override in the field-ticket flow, ticket reopen | No | — | `npm run check`; boot ×2; PowerShell: exercise each listed mutation, confirm an audit row with correct before/after/actor appears |
| 9 | `feature/phase-1-legacy-billing-frequency-removal` | D9 | Drop `agreementTemplates.defaultBillingFrequency` / `agreements.billingFrequency` columns; remove all read/write sites from §1's D9 table | Yes — column drop, guarded by an `information_schema.columns` existence check per this repo's established pattern (`money-bootstrap.ts` precedent) | — (cleanup) | `npm run check`; boot ×2; confirm the 9 "legacy text, no plan" agreements and 2 "neither" agreements are surfaced in a pre-migration report before the column drop runs |

**Shipped in Pass 2, for Passes 3-8 to call** — the audit helper's actual signature, so no later pass
has to re-derive it:

```ts
// server/storage.ts, private on DatabaseStorage. Call from INSIDE the same
// db.transaction() as the mutation, passing that tx.
private async recordAuditLogTx(tx: AuditLogWriter, entry: AuditLogEntry): Promise<void>

// Public on IStorage. Only for mutations that genuinely aren't transactional.
async recordAuditLog(entry: AuditLogEntry): Promise<void>

interface AuditLogEntry {
  entityType: AuditEntityType;   // union in shared/audit.ts - add a member, don't pass a string
  entityId: string;
  action: AuditAction;           // same union file, past-tense snake_case
  actor?: AuditActor | null;     // from routes.ts getAuditActor(req); omit = system actor
  before?: unknown;              // whole-row snapshot; omit for a create
  after?: unknown;               // whole-row snapshot; omit for a delete
}
```

`orgId` and `createdAt` are set by the helper — don't pass them. Pass whole rows to `before`/`after`
rather than pre-flattened prose: the client diffs them at read time via `diffAuditSnapshots()`, which
already filters `id`/`orgId`/`updatedAt` noise. Adding a new entity or action means adding a union
member in `shared/audit.ts` plus its display label — that edit is the guard against the vocabulary
drift D1a had to clean up, not a nuisance.

Reads: `getAuditLogsForEntity(entityType, entityId, limit?)` for one record's trail, and
`getAuditLogsForLocation(locationId, limit?)` for the location History panel's rollup. As passes 3-8
land, add each new financial entity to the `refs` list inside `getAuditLogsForLocation()` so its
events surface on that panel — there is deliberately no second rollup query.

**Shipped in Pass 3, for Passes 4-5 to build on** — D2's generate-or-adopt hook and D3's DRAFT
lifecycle both act on the anchor this pass introduced, so they should reuse these rather than
re-resolving a visit:

```ts
// server/storage.ts, private on DatabaseStorage. Every non-cancelled Service on
// the appointment paired with its Service Record, resolved through
// getLinkedServicesForAppointmentTx - the same rollup finalizeServiceRecord uses.
private async getAppointmentBillingGroupTx(tx, appointmentId):
  Promise<{ appointment: Appointment; services: Service[]; records: ServiceRecord[] } | null>

// Public. Anchors on record.appointmentId when there is one, otherwise falls
// back to the per-service-record anchor. Idempotent from ANY ticket on the visit.
async generateInvoiceFromServiceRecord(serviceRecordId: string, actor?: AuditActor | null): Promise<Invoice>

// server/storage.ts, private. Decides what ONE finalized Service Record
// contributes to the visit invoice. Any pass that adds a new way to price a
// line should extend this rather than branching on agreementId at a call site.
private async resolveServiceLineBillingTx(tx, { record, service, agreementContext }):
  Promise<{ lineType: "SERVICE" | "AGREEMENT_COVERED"; amountCents: number; coverageNote: string | null }>

// shared/billing-plan.ts. The ONE predicate deciding who bills a visit.
export function isScheduleBilledPlan(plan): boolean

// shared/invoice-status.ts. Status is DERIVED FROM AMOUNTS, never assigned.
// Call this at every point that changes what an invoice is owed; never write a
// status literal at a call site. DRAFT and VOID pass through untouched, so
// Pass 4 can introduce DRAFT without this flipping one to PAID, and Pass 6's
// apply/release must call it rather than computing its own status.
export function deriveInvoiceStatus({ totalAmountCents, amountPaidCents?, currentStatus? }): InvoiceStatus

// Same file. A $0 visit whose every line is AGREEMENT_COVERED. Customer-facing
// documents render "No Charge - Covered by Service Agreement" instead of the
// derived "PAID" - correct bookkeeping, honest document, no fifth status value.
export function isFullyAgreementCovered({ totalAmountCents, lines }): boolean

// server/storage.ts, public. Batch-preview rows with billing resolved SERVER-side
// through the same resolver generation uses. The client must never re-derive
// coverage from agreementId.
async getBatchInvoicePreviewForDateRange(dateFrom, dateTo): Promise<BatchInvoicePreviewRow[]>
```

Behavior worth knowing before Pass 4/5 touches it:
- **Both anchors are checked before inserting**, in this order: a non-void invoice on the appointment,
  then a non-void invoice on *any* ticket of the visit. The second check is what keeps pre-D1 rows
  honest — `appointment_id` was deliberately **not** backfilled onto them (two pre-D1 invoices can
  share one appointment, which the new partial unique index would reject), so a service-record-anchored
  invoice is treated as already covering its visit.
- **Partial finalization is refused, not deferred**: generation throws
  `Appointment has N of M services finalized; ...`, and `getServiceRecordsReadyForBilling()` withholds
  the visit entirely until every non-cancelled linked Service is finalized. So the eligibility list and
  generation agree — a listed ticket always generates.
- `getServiceRecordsReadyForBilling()` returns **every** ticket on an eligible visit, not one per
  visit. Callers that mean "how many invoices will this produce" must group by anchor first;
  `batchGenerateInvoicesForDateRange()` does, and reports `totalVisits` alongside `totalEligible`.
- Generated invoices are still inserted as `OPEN` and audit-logged as `invoice_issued`. When Pass 4
  introduces real DRAFT creation, that action/status pair is the thing to revisit.
- **`AGREEMENT_COVERED` is not "has an agreementId"** — it is "the nightly run bills this agreement's
  plan," via `isScheduleBilledPlan()`. §2.1 below was written as though the two were the same; they
  are not, and treating them as the same is how a COD agreement's work gets billed by nobody. A
  covered line ignores any stamped `service.priceCents` rather than charging it (charging would
  double-bill against the plan's own cadence); extra work on a covered visit wants an `ADDON` line,
  which Phase 1 does not build.
- A non-schedule-billed agreement visit is priced as `service.priceCents ?? contract price ÷
  agreement.expectedServiceCount`. That arithmetic matches production value, but it is resolved as a
  BILLABLE amount in its own right (D6's `BILLABLE` vs `PRODUCTION`) so the two stay free to diverge —
  do not collapse them into one call.
- **Never write an invoice status literal.** All three creation paths call `deriveInvoiceStatus()`, so a
  fully covered $0 visit lands `PAID` on the same rule that marks a settled invoice — no branch on
  coverage anywhere. What the customer is *told* is a render-layer concern
  (`isFullyAgreementCovered` → "No Charge - Covered by Service Agreement" in the HTML and PDF
  renderers), never a fifth status value.
- **No 23505 catch inside a generation transaction.** Postgres aborts the whole transaction on a
  constraint violation, so a recovery `SELECT` in that block fails 25P02 and can never return the race
  winner — verified directly against the dev DB. `generateInvoiceFromServiceRecord` catches outside the
  transaction and re-looks-up via `findExistingInvoiceForVisit()`. `generateScheduleDrivenInvoice()`
  still has the old in-transaction catch; it is the nightly run and was left alone this pass, but it is
  the same latent bug.
- Batch grouping expands each visit to **all** its eligible tickets, not just the ones inside the date
  range, because generation bills the whole appointment regardless of the range.
- **Live-testing finding: no UI attaches a Billing Plan to an Agreement**, so every agreement had
  `billingPlanId = null` and the schedule-billed branch above was unreachable outside the API.
  **Resolved by Pass 3.5** — see "Shipped in Pass 3.5" below. Pass 5 (D2) is no longer blocked on it.
- Callbacks bill $0 unless a price is stamped. Generation reads the production ledger's `CALLBACK`
  **basis** (not its amount) so billable and production always agree on what a callback is. That basis
  is itself inferred from a filled-slot counter and is order-dependent — see the roadmap note in
  `CANONICAL_DOMAIN_RULES_V1.md` §10 on making the designation explicit on Service.

**Shipped in Pass 3.5, for every later pass that touches an agreement's plan** — the agreement form
(`customer-detail.tsx`) and the agreement-template form (`settings.tsx`) now carry a real Billing Plan
selector in place of the free-text billing-frequency input, and attaching a plan on **update** works
end to end, which it previously did not.

```ts
// server/storage.ts, private. The one piece of arithmetic deciding whether a
// schedule-billed agreement is billed at all - the nightly run only ever sees
// agreements with a nextBillingDate. Creation passes applyInitialChargeSkip
// true; the update path passes false (see below).
private computeNextBillingDateForPlan(plan, anchorDate, applyInitialChargeSkip): string | null

// Called from inside updateAgreement()'s transaction. Moves nextBillingDate
// and billingPlanSnapshot whenever the plan moves.
private async resolveBillingPlanChangeTx(tx, existing, payload): Promise<void>

// shared/billing-plan.ts. One honest sentence per plan for the two form
// selectors. Describes the code that EXISTS - ON_AGREEMENT_START and
// INSTALLMENT have no charge-emitting path, so it says the visit bills them.
export function describeBillingPlanBehavior(plan): string
```

Behavior worth knowing before a later pass changes it:
- **`normalizeAgreementUpdate()` accepted `billingPlanId` and set nothing else.** An agreement edited
  to add a plan looked correctly configured on every screen and was never billed, because only the
  creation path ever set `nextBillingDate` and the nightly run filters on it. That is fixed; the shape
  to preserve is that anything writing `billingPlanId` must also resolve `nextBillingDate`.
- **Mid-term attachment anchors on the LATER of the agreement's start date and today**, never on an
  elapsed start date. Anchoring on the start date would make the nightly run back-bill one period per
  night for every period since signup. Periods that elapsed plan-less were billed at the visit, or not
  at all, and stay that way — billing history back is a deliberate act with a manual invoice.
- **Two refusals, both leaving `nextBillingDate` null**: the agreement already carries `billing_events`
  (a schedule that already ran — re-anchoring a `PREPAID_TERM` plan would charge the full contract
  price a second time under a new period key), or the anchor already sits past the term end. The form
  renders both as "Not on a billing schedule" rather than hiding them.
- **`initialChargeCoversFirstPeriod` is honored at creation and ignored on mid-term attachment.** That
  charge only ever fires at an agreement's *first* service (`createSurchargeEntryIfConfigured`, which
  returns early once a slot is filled), so applying the skip to a plan attached mid-term would skip a
  period nobody ever collected.
- **The snapshot moves only when the plan moves.** An unrelated edit never rewrites
  `billingPlanSnapshot` — it is the terms the customer was sold, and both
  `resolveAgreementBillingPlanSnapshot()` and the TECH_AT_FIRST_SERVICE surcharge depend on that.
- **Agreements already stuck plan-attached-but-unscheduled are repaired by any edit.** Re-picking the
  plan already on an agreement is not a change, so without this they were unfixable through the UI.
  The same two refusals above still apply, so the repair cannot start a duplicate charge.
- **`buildAgreementInsertFromTemplate` distinguishes `undefined` from `null` for `billingPlanId`**:
  undefined propagates the template's plan, explicit null means the office chose "No billing plan" and
  it sticks. The old `??` collapsed the two and would have silently overridden that choice.
- "Today" here is **UTC** (`new Date().toISOString().slice(0, 10)`), matching `billing-run.ts`'s own
  `todayDateOnly()` and every date helper in `storage.ts`. Attaching a plan late in a US evening
  therefore shows tomorrow's date; the run uses the same clock, so no period is skipped or doubled.
- **`advanceAgreementDate()` gained `DAY` and `WEEK` cases.** `billingPlans.intervalUnit` offers both
  and the Settings plan form lets you pick them, but neither had a case, so both fell through to
  `default` and advanced by a **month**: a daily plan on a one-year term made
  `computeExpectedServiceCount()` return 12 instead of 365, so every charge was the contract price
  divided by 12 — roughly 30x correct — and billed monthly. Pre-existing, but unreachable until this
  pass let an agreement carry a plan at all, so it ships as part of it. Nothing uses `DAY`/`WEEK` for
  service *recurrence* (that dropdown offers `MONTH | QUARTER | YEAR | CUSTOM`, and no stored row
  holds either value), so the shared function's other caller is unaffected. Verified directly against
  the function: `N x DAY`, `N x WEEK`, `N x MONTH`, `QUARTER` and `YEAR` all step correctly for any
  interval count, and a one-year term yields 365 / 53 / 12 / 4 / 1 periods respectively — so a plan
  can now express "every 5 days" or "every 3 weeks" and be priced and billed on it.
  **Related gap, deliberately not fixed here** (see `CURRENT_FOCUS.md`): the recurrence and term
  dropdowns still offer `CUSTOM`, which `advanceAgreementDate()` maps to days — `CUSTOM(7)` behaves
  identically to `WEEK(1)` and nothing in the UI says so. Replacing it needs a data migration on 7
  agreements and 2 templates, so it is its own change.
- **Still legacy, still D9's job**: `agreements.billingFrequency` and
  `agreementTemplates.defaultBillingFrequency` columns, and the server-side normalize/propagation
  writes. Pass 3.5 removed only the inputs and the one list-card that displayed the free text.

**Shipped in Pass 4, for Pass 5 (D2) to build on** — the DRAFT lifecycle, the issue transition, the
review flag, and the Q3 cancel prompt. D2's generate-or-adopt is already half built: generation adopts
a DRAFT today, so Pass 5 has to call it from finalization and add the setting and the prompt, not
build adoption.

```ts
// server/storage.ts, public. A DRAFT against an appointment whose tickets may
// not exist yet. Prices every active service on the visit as it stands (a
// service with no ticket -> its contract price; posted-but-unfinalized -> the
// same). Holds the visit's anchor so generation adopts it. Idempotent: returns
// the existing DRAFT; throws if the visit already has an ISSUED invoice.
async createDraftInvoiceForAppointment(appointmentId, actor?): Promise<Invoice>

// Public. DRAFT -> issued. Re-prices lines, tax, billing terms and due date
// from the visit NOW, stamps issuedAt, audits invoice_issued with before/after.
// prefinalization "REFUSE" throws PrefinalizationIssueError if any active
// service lacks a finalized ticket; "OVERRIDE" issues anyway and flags them.
// Already issued -> returned unchanged. VOID -> throws.
async issueInvoice(id, { actor?, prefinalization }): Promise<Invoice | undefined>

// Private. The same transition inside an open transaction. Generation calls
// it to ADOPT a draft found on the anchor (every ticket is finalized by then,
// so REFUSE cannot fire). This is the hook D2's finalization wiring reuses.
private async issueInvoiceTx(tx, draft, input): Promise<Invoice>

// Private. One line per VisitBillingUnit { service, record?, serviceDate }
// through resolveServiceLineBillingTx (record now optional) and the tax
// engine. Generation, draft creation and issue all price through this - a new
// line type is added here, once.
private async buildVisitInvoiceLinesTx(tx, { units, accountId, locationId }): Promise<PricedVisitInvoice>

// Private. Both anchors, appointment first. INCLUDES drafts; anything that
// means "is this visit billed" also checks isInvoiceIssued().
private async findInvoiceForVisitTx(tx, appointmentId, serviceRecordIds): Promise<Invoice | undefined>

// Private. Q3, shared by all three cancel paths, given the appointment ids
// about to be cancelled. undefined -> throws DraftInvoiceDecisionRequiredError
// (routes answer 409 + draftInvoices); true -> voids in the same tx; false -> keeps.
private async resolveDraftInvoicesOnCancelTx(tx, appointmentIds, voidDraftInvoices, actor): Promise<void>

// Public. Now transactional and audit-logged (invoice_voided, before/after).
async voidInvoice(id, actor?): Promise<Invoice | undefined>

// shared/invoice-status.ts. status !== "DRAFT" && status !== "VOID".
export function isInvoiceIssued(status): boolean
```

Behavior worth knowing before Pass 5 touches it:
- **A DRAFT holds the visit's anchor but is not a bill.** The partial unique indexes ignore only VOID,
  so a DRAFT blocks a second invoice on its appointment - which is exactly what makes adoption work.
  Everything that means "billed" checks `isInvoiceIssued()`: `getServiceRecordsReadyForBilling()` (a
  drafted-then-finalized visit stays listed, and Generate issues the draft), `batchSendInvoices()`
  (skips drafts), the `PATCH /api/invoices/:id` guard (Mark Paid on a draft is refused), and the
  posting-time flag below. `getLocationBalancesByCustomer()` still sums DRAFT totals into the open
  balance; Pass 6 rebuilds balances from the ledger and should exclude DRAFT there.
- **Generation adopts a DRAFT.** `generateInvoiceFromServiceRecord()` on a fully finalized visit that
  carries a DRAFT issues that draft (re-priced) and returns it - same id, now OPEN/PAID, `issuedAt`
  set. So D2's "adopt" is: call generate. Pass 5 adds the finalization hook, the `invoiceOnFinalize`
  setting and the Generate / Generate & Send / Later prompt, nothing else.
- **Issue re-prices from scratch.** Lines are deleted and rebuilt, tax re-snapshotted, billing profile
  and due date re-resolved, because a draft's numbers are a preview and terms run from the issue date.
  Verified live: a service drafted at $110 and posted at $130 issues at $130. `invoices.issuedAt` is
  the document's issue date (`getInvoiceDocumentContext`), backfilled to `createdAt` for every row
  that existed before the column.
- **The override is two-factor**: the role (`ISSUE_INVOICE_PREFINALIZATION`, manager+, in
  `shared/permissions.ts`) AND `confirmPrefinalization: true` in the body. `POST /api/invoices/:id/issue`
  answers 403 (`PREFINALIZATION_ISSUE_FORBIDDEN`) without the role and 409
  (`PREFINALIZATION_ISSUE_REQUIRED`) with the role but no confirmation, both listing
  `unfinalizedTickets`; the Invoices screen turns the 409 into a confirm dialog.
- **The review flag is `serviceRecords.ticketStatus = FLAGGED_FOR_REVIEW`**, plus
  `flaggedAt` / `flaggedByUserId` / `flaggedByLabel` / `flagReason` mirroring the reopen columns, and an
  audit row `prefinalization_issue_override` on the `service_record` entity (now part of the location
  History rollup). It fires from two sides: at override time for tickets already posted, and **at
  posting time** (`flagTicketIfVisitAlreadyInvoicedTx`, in both `completeService` and
  `createServiceRecord`) for any ticket entering review on a visit whose invoice is already *issued* -
  which also catches a reopened ticket re-posted after normal invoicing. Posting onto a visit that has
  only a DRAFT does not flag. A REOPENED ticket keeps REOPENED at override time (the technician still
  owes the edit) and receives only the flag columns; it flags properly on re-post. A flagged ticket
  finalizes normally - `finalizeServiceRecord` never guarded on status. Review screen: a filter, a red
  badge, an amber banner; the technician screen treats it like pending.
- **Q3 is wired into three cancel paths, not two.** The plan named `cancelAgreement` and
  `requestAppointmentCancelOrReschedule`; the schedule screen's "Cancel Service" button (and its status
  dropdown) is a `PATCH /api/appointments/:id { status: "CANCELED" }` through `updateAppointment()`,
  which now takes `options.voidDraftInvoices`. All three check before writing, so the 409 rolls back
  cleanly (verified: the refused agreement cancel left the agreement ACTIVE). The client answers all
  three with one shared `<DraftInvoiceVoidPrompt>` (`client/src/components/draft-invoice-void-prompt.tsx`)
  and resubmits with the choice. Reschedule requests prompt too - the appointment is CANCELED either
  way. Cancelling a visit whose invoice is *issued* never prompts; that is a credit-memo question for
  Pass 6.
- **Client errors are structured now.** `apiRequest` throws `ApiError { status, body }` with the
  message unchanged, so every existing toast is untouched; `getApiErrorCode()` and
  `getApiErrorMessage()` live in `client/src/lib/queryClient.ts`. Anything later that branches on a
  server code should use these rather than parsing the message text.
- **A draft's PDF is preview-only.** `getOrCreateInvoiceDocument()` renders a DRAFT (the document says
  "Status: DRAFT") but never stores it; the stored artifact is created on the first request after
  issue. `document-info` for a draft returns id `draft-preview-<invoiceId>`.
- **Deliberately not done**: drafts are appointment-anchored only (no service-record-anchored draft for
  an appointment-less one-off); `createManualInvoice` stamps `issuedAt` but still writes no audit row
  (Pass 8); there is still no UI affordance to open any invoice's PDF, draft or issued (see
  `CURRENT_FOCUS.md`).

**Shipped in Pass 5 (D2), for Pass 6 to build on** — finalization is wired to invoicing. The
finalization that completes a visit (every active Service on the appointment now finalized) reports
what it did about the visit's invoice, governed by one org setting. Adoption was not rebuilt: Generate
is still `generateInvoiceFromServiceRecord()`, which issues a DRAFT it finds on the anchor.

```ts
// shared/invoice-on-finalize.ts. The whole D2 vocabulary, shared by server,
// Settings page and the two finalize call sites.
export const INVOICE_ON_FINALIZE_MODES = ["PROMPT", "AUTO_DRAFT", "OFF"] as const;   // default PROMPT
export const INVOICE_ON_FINALIZE_SETTING_KEY = "invoice_on_finalize";             // app_settings key
export function normalizeInvoiceOnFinalizeMode(value): InvoiceOnFinalizeMode         // unknown -> PROMPT
export function describeInvoiceOnFinalizeMode(mode): { label; description }
export interface FinalizationInvoicingOutcome<TInvoice> {
  mode; action: "PROMPT" | "DRAFTED" | "DRAFT_FAILED" | "ALREADY_INVOICED" | "OFF";
  appointmentId; invoice: TInvoice | null; created?: boolean; message?: string;
}

// server/storage.ts. finalizeServiceRecord() now returns BOTH - the route
// sends this object, not the bare record. `invoicing` is null unless this
// finalization completed its visit; appointment-less tickets never carry one.
export interface FinalizeServiceRecordResult { record: ServiceRecord; invoicing: FinalizationInvoicingOutcome<Invoice> | null }
async finalizeServiceRecord(id, actor?): Promise<FinalizeServiceRecordResult | undefined>

// Private. The hook, called from finalizeServiceRecord's allFinalized branch
// inside its transaction. Reads the setting, checks both anchors, and for
// AUTO_DRAFT creates the draft under a SAVEPOINT (tx.transaction) so a refused
// draft reports DRAFT_FAILED instead of rolling the finalization back.
private async resolveInvoiceOnFinalizeTx(tx, { appointment, serviceRecordIds, actor }): Promise<FinalizationInvoicingOutcome<Invoice>>

// Now takes the caller's tx (the public route wraps it in db.transaction; the
// hook calls it under a savepoint). Body unchanged.
private async createDraftInvoiceForAppointmentTx(tx, appointmentId, actor?): Promise<Invoice>

// Public, IStorage. Mirrors the service-time-tracking pair.
async getInvoiceOnFinalizeMode(): Promise<InvoiceOnFinalizeMode>
async setInvoiceOnFinalizeMode(mode): Promise<AppSetting>

// Routes. GET is open; PATCH is MANAGE_SETTINGS (admin) like tax rates and the
// billing run - it decides how every visit gets billed.
GET  /api/settings/invoice-on-finalize  -> { mode }
PATCH /api/settings/invoice-on-finalize { mode } -> { mode }

// client/src/components/invoice-on-finalize-prompt.tsx. One prompt for both
// finalize call sites (Service Ticket Review, location Services tab).
export function InvoiceOnFinalizePrompt({ prompt, onClose })
export function getInvoiceOnFinalizePrompt(result): InvoiceOnFinalizePromptState | null   // PROMPT -> open it
export function describeFinalizeResult(result): toast copy for every other outcome
export function invalidateInvoiceViews()   // every /api/invoices* and /api/audit-logs* query, whatever its key shape
```

Behavior worth knowing before Pass 6 touches it:
- **The outcome, per mode, once the visit is complete.** An issued invoice already on either anchor
  (a manager's pre-finalization override, a pre-D1 row) is `ALREADY_INVOICED` in every mode - nothing
  to generate, and the tickets were flagged at posting time. Otherwise: `PROMPT` reports the DRAFT to
  adopt (or null) and the client asks Generate / Generate & Send / Later; `AUTO_DRAFT` creates the
  DRAFT (`created: true`) or reports the one already there (`created: false`); `OFF` reports nothing
  and the visit waits on the ready-for-billing list. A ticket whose siblings are still pending gets
  `invoicing: null` - the visit is not complete, so there is no decision yet.
- **Generate is the existing route.** The prompt's Generate calls
  `POST /api/invoices/generate-from-service-record/:id` - which adopts a DRAFT, re-prices it and issues
  it, or creates the visit's one invoice - and Generate & Send follows with
  `POST /api/invoices/batch-send { invoiceIds: [id] }`. "Send" is what Batch Invoice's "Send All"
  already means: `sentAt` is stamped, nothing is delivered (there is no email and still no PDF
  affordance - see `CURRENT_FOCUS.md`). The prompt says so. A send that fails after generation
  succeeded is reported as "issued, but not marked sent", never as a failed generate.
- **Later is genuinely nothing.** No row, no flag; the visit is listed by
  `getServiceRecordsReadyForBilling()` exactly as before this pass, so Generate on the review screen
  and Batch Invoice both still pick it up. Finalizing an already-finalized ticket re-runs the hook
  (idempotently - `existingRecord.confirmed` skips every other side effect) and re-reports.
- **AUTO_DRAFT never blocks finalization.** The draft is created under a savepoint (a nested drizzle
  `tx.transaction()`), because a failed statement aborts a Postgres transaction outright and the
  finalization above it must survive. A refusal - the line resolver's "Service has no price set", an
  agreement with no plan and no price - rolls back to the savepoint and returns `DRAFT_FAILED` with the
  message; the record, the service and the appointment still commit as finalized/COMPLETED, and the
  visit stays on the ready-for-billing list. Verified live. A lost race against a concurrent "Draft
  invoice" click (23505 on the appointment index) re-reads the winner and reports it as `DRAFTED,
  created: false`.
- **An existing DRAFT is not re-priced by AUTO_DRAFT.** D2's "refresh lines" is done by issue, which
  rebuilds every line from the finalized tickets; doing it again at finalization would be a second
  pricing pass whose only reader is the Invoices list's preview total. Deliberate.
- **Scope is the `allFinalized` branch, as the plan row says.** Appointment-less tickets (legacy data;
  nothing creates them today) finalize with `invoicing: null` and bill through the ready-for-billing
  list as before - there is no draft path for the service-record anchor (Pass 4's deliberate gap).
- **Setting mechanics.** Seeded `PROMPT` by `invoice-bootstrap.ts` with the same unqualified
  `ON CONFLICT DO NOTHING` the other two settings use; a missing row reads as `PROMPT` anyway. The
  Settings card ("Invoicing on Finalization", in the billing block) is disabled - not hidden - for
  non-admins with a line saying so, because the sidebar shows Settings to every role and the other two
  settings PATCHes are unguarded. Technician, support and manager get 403 on PATCH; an unknown mode is
  400.
- **Pass 6 hook.** D4's "Apply $X location balance to this invoice?" prompt belongs at the same
  moment as this one - the outcome carries `appointmentId` and the invoice, and the prompt component
  is where a second question about the just-issued invoice would go.

**Pass 5.5 — move the initial charge off the Billing Plan** (owner correction to D4, 2026-09-09; the
full reasoning is in `PLAN_BILLING_V1_1.md` D4 and is not repeated here).

A Billing Plan says *how and when* a customer is charged and is shared across agreements. The
down-payment **amount** is a term of one sale, derived from that agreement's contract price. Today
`initialChargeType`/`initialChargeCents` sit on `billing_plans`, so a $200 down payment applies to
every agreement on that plan whatever its price, and "half down" cannot be expressed at all.

| | Moves | Stays |
|---|---|---|
| `initialChargeType` | → `agreement_templates.default_initial_charge_type`, `agreements.initial_charge_type` | |
| `initialChargeCents` | → `agreement_templates.default_initial_charge_cents`, `agreements.initial_charge_cents` | |
| amount **mode** (flat vs. percent of contract) | new field, needed for "half down" — D4's own example | |
| `initialChargeCollectedBy` | → same two tables, **nullable**: `NULL` = either role may collect, `OFFICE_AT_SIGNING` = office only, `TECH_AT_FIRST_SERVICE` = tech only | |
| `initialChargeCoversFirstPeriod` | | `billing_plans` — pure cadence semantics |
| `fieldAddableSurcharge` | | `billing_plans` — plan-level permission |

Template→agreement propagation mirrors `defaultPriceCents` → `priceCents`, which
`buildAgreementInsertFromTemplate` already does; reuse that shape rather than inventing a second one.

**Why it sequences here — after Pass 5, before Pass 6.** Pass 6 (D4/D5) is where the initial charge
becomes a real issued invoice. If it is built against `billingPlanSnapshot.initialChargeCents` and the
fields move afterwards, a financial path gets rewritten right after shipping — the same retrofit
mistake §2.4 moved audit logging forward to avoid. It is independent of Passes 4 and 5, which never
touch the initial charge, so it does not block them. Pulling it earlier is defensible if the owner
wants the model correct before more agreements freeze the current shape into `billingPlanSnapshot`;
the migration's shape is the same either way, only the row count differs.

**Migration notes for whoever takes it:**
- `billingPlanSnapshot` on `agreements` carries the old `initialCharge*` keys (4 of 8 snapshots in the
  dev DB today). Snapshots are deliberately frozen history — read them to backfill the new agreement
  columns, then leave the JSON alone rather than rewriting it.
- `createSurchargeEntryIfConfigured()` (`storage.ts`) reads `initialChargeType`,
  `initialChargeCollectedBy` and `initialChargeCents` off that snapshot to credit technician
  production value. It is live — 3 `SURCHARGE` entries exist — and must follow the fields.
- **`initialChargeCollectedBy` becomes a permission, and that breaks how credit is attributed.**
  Today `TECH_AT_FIRST_SERVICE` is the *only* signal that a technician collected the money, so the
  surcharge credit is inferred from it. Once `NULL` ("either role may collect") is expressible, that
  inference is unsound — it would credit a technician for cash the office banked at signing. This pass
  must therefore narrow the read to "credit only when the technician is the **sole** permitted
  collector," and leave a marker for D5: once payments-lite records a collection with an actor,
  attribution keys off that event instead of off the permission. Withholding an uncertain credit is
  the visible failure (a tech notices a missing payout); paying a wrong one is the silent one.
- `buildBillingPlanSnapshot()` stops carrying whatever moves.
- Settings' `BillingPlanForm` loses the moved inputs; `AgreementTemplateForm` and the agreement form
  gain them, next to Price rather than next to the plan selector.
- Only one plan currently sets an initial charge (`Unit 15 Surcharge Test Plan`,
  `CLEANOUT_SURCHARGE`/$50/`TECH_AT_FIRST_SERVICE`), so the data migration is small — but it is real
  money attached to real production credit, not disposable test data.

**Shipped in Pass 5.5 (D4 owner correction), for Pass 6 to build on** - the initial charge is a term
of the sale. It lives on `agreements.initialCharge*` (the actual) and
`agreement_templates.defaultInitialCharge*` (the default); `billing_plans` keeps only
`initialChargeCoversFirstPeriod` and `fieldAddableSurcharge`, and `buildBillingPlanSnapshot()` no
longer carries the moved keys. Everything the plan row above asked for landed; the deviations from its
notes are in the bullets.

```ts
// shared/initial-charge.ts - the whole vocabulary, one resolver, one validator, read by
// server normalization, route validation, both forms and the agreement card.
export const INITIAL_CHARGE_TYPES = ["DOWN_PAYMENT", "CLEANOUT_SURCHARGE", "PREPAY_FULL"] as const;  // null = no charge
export const INITIAL_CHARGE_AMOUNT_MODES = ["FLAT", "PERCENT_OF_PRICE"] as const;   // cents | basis points of priceCents
export const INITIAL_CHARGE_COLLECTORS = ["OFFICE_AT_SIGNING", "TECH_AT_FIRST_SERVICE"] as const;   // null = either may collect
export interface InitialChargeFields { initialChargeType; initialChargeAmountMode; initialChargeCents; initialChargePercentBasisPoints; initialChargeCollectedBy }
export function normalizeInitialCharge(input): InitialChargeFields   // no type -> all null; one amount per mode; unknown collector -> null
export function validateInitialCharge(charge): string | null         // typed charge needs cents > 0, or 0 < basis points <= 10000
export function resolveInitialChargeCents(charge, contractPriceCents): number | null   // percent of a null price -> null, never 0
export function isTechnicianSoleInitialChargeCollector(charge): boolean   // the D4 narrowing
export function initialChargeFromTemplate(template) / initialChargeToTemplate(charge)   // default* <-> actual
export function describeInitialCharge(charge, contractPriceCents): string | null   // the one sentence the UI shows

// server/agreement-bootstrap.ts - one-shot migration keyed on the legacy plan column still
// existing (money-bootstrap.ts's marker, so it can never re-run): templates take their plan's
// LIVE charge; agreements take the charge frozen in their own billingPlanSnapshot (the JSON is
// left untouched); only positive flat amounts carry; then the three plan columns are dropped.

// server/storage.ts
private createSurchargeEntryIfConfigured(tx, agreement, record, finalizedAt)
  // reads agreement.initialCharge*, not the snapshot; credits only when
  // isTechnicianCollectedCleanoutSurcharge() - CLEANOUT_SURCHARGE and the technician is the sole
  // collector; amount = resolveInitialChargeCents(agreement, agreement.priceCents)
private computeNextBillingDateForPlan(plan, anchorDate, applyInitialChargeSkip)
  // the skip now also requires the AGREEMENT to carry a charge - the plan flag alone cannot know
private buildAgreementInsertFromTemplate(input)
  // the block propagates as ONE: a caller that names initialChargeType (even null) wins outright,
  // otherwise the template's default block; never a mix

// Routes: agreement create / update / from-template and template create / update accept the
// block with enum-checked fields; a request that touches any of the five must name the type
// (an amount-only PATCH is 400); validateInitialCharge() runs on the normalized block.

// client/src/components/initial-charge-fields.tsx - one block for both forms, placed next to Price
// (Advanced Overrides > Service Details on the agreement form; Service Defaults on the template form).
export function InitialChargeFormFields({ value, onChange, contractPriceCents, labelPrefix?, testIdPrefix? })
export function initialChargeFormStateFrom(fields) / initialChargeFieldsFrom(state) / validateInitialChargeFormState(state)
```

Behavior worth knowing before Pass 6 touches it:
- **What the migration actually found.** Four agreements carried a charge in their snapshot, not one:
  `Unit 15 Ledger Test` (`CLEANOUT_SURCHARGE` $50 TECH) and the three `Daily Rodent Trapping`
  agreements (`DOWN_PAYMENT` $99.95 TECH) - sold under a `Daily Recurring` plan that no longer sets
  a charge, which is exactly why the snapshot and not the live plan is the source for agreements. The
  `Quarterly Control` template, whose plan is `Unit 15 Surcharge Test Plan`, took that plan's charge
  as its default. There were 4 `SURCHARGE` ledger entries, not 3 (Pass 5's live test added one); all
  untouched, all still `TECH_AT_FIRST_SERVICE` on their agreements, so none would be credited
  differently today.
- **The credit narrowing is live and verified, twice.** As pushed: a 25%-of-$400 charge with the
  technician as sole collector produced one `SURCHARGE` entry of $100 at first-visit finalization; the
  same charge with "either may collect" produced none, while the visit's `SCHEDULED_AGREEMENT_SERVICE`
  entry was credited as before. After the owner review (below) the credit is further limited to
  `CLEANOUT_SURCHARGE`: a tech-collected `DOWN_PAYMENT` now earns nothing extra (its money is in the
  contract price the technician is already credited for), a tech-only cleanout surcharge earns its
  amount, "either" still earns nothing. `contractPriceCentsSnapshot` on a `SURCHARGE` entry now
  records the price the amount was resolved from (it was null) - basis, per §1.6.2's snapshot rule.
  The three pre-existing `Daily Rodent Trapping` SURCHARGE entries ($99.95 each) were earned under
  unit 15's any-type rule and are left as they are: append-only ledger, test data.
- **A percent of a missing price resolves to nothing, never $0.** Allowed at the data level (the
  template default is exactly this shape until the agreement gets a price); the form says "set a
  contract price to resolve the amount", the surcharge credit is withheld, and Pass 6 must refuse the
  receivable the same way generation refuses a price-less service.
- **`initialChargeCoversFirstPeriod` now needs a charge to cover.** Before this pass the plan form
  forced the flag false whenever the plan's own charge was NONE, so the flag implied a charge. With the
  charge on the agreement that implication is gone, so `computeNextBillingDateForPlan()` skips
  period 1 only when the plan says so AND the agreement carries a charge (creation and the future-dated
  update path both). No live plan sets the flag, so nothing changed in the data.
- **Pass 6 hook.** The receivable at agreement start is `resolveInitialChargeCents(agreement,
  agreement.priceCents)` with `initialChargeType` as the line's label; `initialChargeCollectedBy` is a
  permission and D5's recorded collection event decides credit, replacing the inference in
  `createSurchargeEntryIfConfigured()`.
- **Frozen history.** `GET /api/agreements/:id/billing-plan-snapshot` still returns the old
  `initialCharge*` keys on pre-5.5 snapshots; nothing reads them and nothing should.

**Owner review of Pass 5.5 (2026-09-13)** - the decisions are recorded under D4 in
`PLAN_BILLING_V1_1.md`; what each one means for the plan:
- **Pass 6 (D4 receivable) gains a requirement:** the initial charge counts toward the contract price
  by default, with an explicit "in addition to" flag as the exception. Build the flag together with the
  remaining-balance arithmetic, not before it. The helper text on the block now says invoicing it and
  that choice "arrive with the payments ledger" rather than asserting "on top of the schedule".
- **A new unit, the field-surcharge line**, is defined in `CURRENT_FOCUS.md`'s deferred list: the
  technician adds a surcharge on the ticket at the initial service, gated by an allow/reject toggle
  the owner wants on the template (today `fieldAddableSurcharge` sits on the plan and nothing reads
  it). When it lands: `CLEANOUT_SURCHARGE` (and the overlapping `PREPAY_FULL`, which `PREPAID_TERM`
  plans already express) leave `INITIAL_CHARGE_TYPES`, leaving `DOWN_PAYMENT`; the SURCHARGE production
  credit keys off the recorded line, gated by the technician's comp-plan surcharge selector
  (`CURRENT_FOCUS.md`, compensation entry), and `createSurchargeEntryIfConfigured()`'s inference is
  deleted;
  the `Quarterly Control` template's and `Unit 15 Ledger Test` agreement's cleanout defaults are
  migrated or dropped (test data).
- **Done in this pass, on review:** the SURCHARGE credit is limited to `CLEANOUT_SURCHARGE` (see the
  bullet above); the COD plan sentence under the plan selector no longer says the visit invoice
  "carries the full amount" - it says each visit is billed on its own invoice at the service's price or
  contract price ÷ expected visits, and points at a Prepaid Term plan for paid-in-full.
- **Paid-in-full needs no new mechanism.** A `PREPAID_TERM` plan bills the whole contract price once
  at agreement start, for any term length (`billing-run.ts` ignores the plan interval in that mode),
  and every visit is a $0 `AGREEMENT_COVERED` line. The `Wildlife Trapping Program` template carries
  `Annual Prepaid`, so new agreements from it behave that way; the two live Wildlife agreements are
  plan-less (pre-Pass-3.5) and bill per visit until a plan is attached - the "Billing Plan required on
  every Agreement" item. "Annual" in that plan's name is only a label; a plan named "Prepaid Term"
  would read better for a 7-day program.

**Shipped in Pass 6 (D5 payments-lite, D4 receivable and location balance), for Pass 7 to build on** -
the ledger exists and every invoice figure derives from it. §2.5's transaction is what was built:
row lock on the invoice, rollup recomputed from the ledger (never incremented), release as a flagged
row with a required reason, everything in one transaction with its audit rows.

```ts
// shared/payments.ts - the vocabulary. Manual instruments only until Phase 2.
export const MANUAL_PAYMENT_METHODS = ["CASH", "CHECK", "OTHER"] as const;   // CARD | ACH named, refused
export const PAYMENT_STATUSES = ["PENDING", "CONFIRMED", "VOIDED", "REFUNDED", ...card states] as const;
export function paymentHoldsValue(status): boolean      // PENDING | CONFIRMED - can be applied
export function paymentCountsAsPaid(status): boolean    // CONFIRMED only - counts toward amountPaidCents
export const CREDIT_MEMO_REASON_CODES = ["BILLING_ERROR", "SERVICE_ISSUE", "GOODWILL", "CANCELLATION", "OTHER"] as const;
export interface LocationLedgerSummary { openBalanceCents; unappliedConfirmedCents; unappliedPendingCents; sources: UnappliedSource[] }
export interface InvoiceLocationBalance { balanceDueCents; pendingAppliedCents; applicableCents; suggestedCents; designatedElsewhereCents; sources }

// shared/invoice-status.ts. The three stored fields from the one number the ledger supplies.
export function computeInvoiceRollup({ totalAmountCents, amountPaidCents, currentStatus? }): { amountPaidCents; balanceDueCents; status }
  // DRAFT / VOID pass through with balanceDue 0; otherwise total - paid, and deriveInvoiceStatus()

// shared/initial-charge.ts - the owner's rule, in arithmetic.
export function initialChargeCountsTowardPrice(charge): boolean   // typed, not CLEANOUT_SURCHARGE, not inAdditionToPrice
export function resolveRemainingContractPriceCents(charge, contractPriceCents): number | null  // price - charge, never negative
export function initialChargeSkipsFirstPeriod(plan, charge): boolean   // plan flag AND the charge counts toward the price
// InitialChargeFields gained initialChargeInAdditionToPrice (template: defaultInitialChargeInAdditionToPrice);
// normalizeInitialCharge() forces it false for anything but a DOWN_PAYMENT.

// server/storage.ts - IStorage. Append-only: creates and stamped lifecycle transitions only.
recordPayment({ locationId, method, amountCents, receivedAt?, checkNumber?, referenceNumber?, memo?, designatedAgreementId?, applyToInvoiceId?, actor }): Promise<{ payment; application | null; invoice | null }>
confirmPayment(id, actor) / voidPayment(id, reason, actor) / refundPayment(id, reason, actor): Promise<Payment | undefined>
applyPayment(paymentId, { invoiceId, amountCents?, actor }) / releasePaymentApplication({ applicationId, reason, actor })
issueCreditMemo({ locationId, invoiceId?, reasonCode, reason, amountCents, applyToInvoiceId?, actor }) / voidCreditMemo / applyCreditMemo / releaseCreditApplication
getInvoiceLedger(invoiceId) / getLocationLedgerSummary(locationId) / getPaymentsByLocation / getCreditMemosByLocation
getInvoiceLocationBalance(invoiceId): Promise<InvoiceLocationBalance>          // the D4 prompt's numbers
applyLocationBalanceToInvoice(invoiceId, actor): Promise<{ invoice; applied[]; appliedCents }>   // the D4 prompt's act
issueInitialChargeInvoice(agreementId, actor): Promise<Invoice>   // explicit path; throws the refusal
getAgreementInitialChargeInvoice(agreementId): Promise<Invoice | null>
// private: lockInvoiceTx (SELECT ... FOR UPDATE), sumInvoiceApplicationsTx (paid / pending / all),
// recomputeInvoiceRollupTx, applyPaymentTx / applyCreditMemoTx (assertApplicableTx holds every refusal),
// releaseAllApplicationsForInvoiceTx (void), orderSourcesForInvoiceTx (designated first, confirmed before
// pending, oldest first; money designated to a different agreement is set aside), issueInitialChargeInvoiceTx.

// Routes (all mutations actor-from-session). Permissions in shared/permissions.ts:
POST /api/payments                         TAKE_PAYMENT_FIELD (+ APPLY_PAYMENT when applyToInvoiceId is set)
POST /api/payments/:id/confirm             CONFIRM_PAYMENT (support+); CASH additionally CONFIRM_CASH_PAYMENT (manager+)
POST /api/payments/:id/void                VOID_PAYMENT (manager+)     POST /api/payments/:id/refund   REFUND_PAYMENT
POST /api/payments/:id/apply, /api/payment-applications/release, /api/credit-memos/:id/apply, /api/credit-applications/release   APPLY_PAYMENT (support+)
POST /api/credit-memos, /api/credit-memos/:id/void   ISSUE_CREDIT_MEMO
GET  /api/invoices/:id/ledger, /api/invoices/:id/location-balance, /api/locations/:id/ledger-summary, /api/payments/by-location/:id, /api/credit-memos/by-location/:id
POST /api/invoices/:id/apply-location-balance   APPLY_PAYMENT
GET  /api/agreements/:id/initial-charge-invoice   POST /api/agreements/:id/issue-initial-charge   GENERATE_INVOICE
PATCH /api/invoices/:id now takes notes / dueDate only (strict) - status and paidDate are derived.

// client: components/record-payment-dialog.tsx (Invoices screen + location tab; applies when an invoice is
// given and the role may), components/apply-location-balance-prompt.tsx (D4 prompt; opens only when there
// is something to suggest), components/location-ledger-panel.tsx (balances, payments, credit memos,
// InvoiceRowLedger with applications + Release), lib/invalidate-invoice-views.ts (one invalidation for
// every money-reading query), agreement card's AgreementInitialChargeStatus, the in-addition checkbox on
// initial-charge-fields.tsx (DOWN_PAYMENT only).
```

Behavior worth knowing before Pass 7 touches it:
- **PENDING shows, CONFIRMED counts.** A payment can be applied while PENDING (it appears on the
  invoice's ledger) but `amountPaidCents` sums only CONFIRMED payments and ISSUED credit memos.
  Confirmation re-rolls every invoice the payment sits on in the same transaction, each with its own
  `payment_confirmed` audit row on the *invoice*, which is how an invoice's trail explains why it
  flipped to PAID. The cap on further applications counts pending ones too (`applicableCents`), so two
  pending payments cannot jointly overpay an invoice that later confirms both. Verified live: a $100
  pending cash left the $100 initial-charge invoice OPEN with $0 applicable; confirming it flipped the
  invoice to PAID; releasing it (reason required, 400 without) reopened it at $100 due.
- **Where the audit rows land.** Lifecycle acts on the `payment` / `credit_memo` entity (recorded,
  confirmed, voided, refunded, issued). Application and release on the **invoice** entity, with the
  application row carried in `after` so the amount, source and release reason are in the trail. The
  location History panel rolls both entity types in (`getAuditLogsForLocation` refs).
- **Void / refund guards.** A payment with unreleased applications cannot be voided or refunded -
  release first, explicitly, so where the money sat is on the record. A PENDING payment cannot be
  refunded (it was never confirmed as received; void it). Only a CONFIRMED, fully unapplied payment
  refunds, as a stamped `REFUNDED` transition; the money movement itself is outside the app in Phase 1.
  A credit memo with applications likewise cannot be voided.
- **Voiding an invoice releases its applications** back to the location's unapplied pool (reason
  "Invoice INV-x voided", one `payment_released` / `credit_memo_released` row each) and zeroes its
  rollup - a VOID invoice owes and holds nothing. The old `voidInvoiceTx` would have stranded money on
  it, invisible to every balance.
- **Balances come from the ledger.** `getLocationBalancesByCustomer` now sums `balanceDueCents` over
  *issued* invoices (DRAFT finally excluded, as the Pass 4 note asked) and reports
  `unappliedBalanceCents` (confirmed money on account); the location switcher shows both. The Invoices
  screen's Open / Paid / Overdue tiles read `balanceDueCents` / `amountPaidCents`.
- **The D4 prompt.** `getInvoiceLocationBalance()` orders the pool: sources designated to an agreement
  the invoice is *for* (through `billing_events` and the lines' services) first, undesignated next,
  confirmed before pending, oldest first; money designated to a *different* agreement is reported as
  `designatedElsewhereCents` and never drawn on. `applyLocationBalanceToInvoice()` draws in that order
  until the invoice can take no more, one application row per source. The prompt opens from the
  finalize prompt after Generate (only when there is something to suggest and the role may apply) and
  from "Apply location balance" on an open invoice row of the location's Invoices tab.
- **Mark Paid is gone.** `updateInvoice` refuses `status`, `paidDate`, `amountPaidCents`,
  `balanceDueCents`; the route schema is strict, so a stray `status` is a 400 naming the key. The
  Invoices screen's button is now Record Payment (disabled, with the reason, on the location-less manual
  invoices from the known gap in `CURRENT_FOCUS.md`). `paidDate` is stamped by the rollup the first
  time it lands on PAID and cleared if a release reopens the balance - display only.
- **Migration.** `payments-bootstrap.ts` creates the four tables (org_id NOT NULL from the start, like
  `invoice_line_items`) and adds the two invoice columns nullable, backfills once (`WHERE ... IS NULL`
  makes it a one-shot), then constrains them: an invoice hand-marked PAID before the ledger keeps its
  word (paid = total, due 0) because status derives from these amounts from now on; no `payments` row is
  invented for it. Every other issued invoice starts fully due; DRAFT / VOID owe 0. On the dev DB: 21
  PAID, 29 OPEN, 2 VOID, zero rows where `balance_due <> total - paid` afterwards. Every invoice insert
  now sets `balanceDueCents` explicitly (the column default is 0, which would read as paid up).
- **The receivable.** `createAgreement` issues the initial charge inside its own transaction:
  `INITIAL_CHARGE` line (description `<type label> - <agreement name>`), tax through the same
  `resolveTaxDecision` the schedule-driven path uses, terms and due date from the location's billing
  profile, an `INITIAL_CHARGE` billing event with the fixed periodKey `INITIAL_CHARGE` so it can only
  ever fire once, `invoice_issued` audit row. A percent charge with no price is REFUSED silently at
  creation (the card says "Not yet invoiced" with the button) and loudly (400) on the explicit route;
  verified both ways, and that setting the price then issuing resolves 25% of $200 to $50. Voiding the
  receivable does not re-open the event - same rule as a schedule-driven invoice; correct with a credit
  memo or a manual invoice. The plan-attachment refusal in `resolveNextBillingDateForPlanChangeTx`
  ("already carries billing_events") now ignores `INITIAL_CHARGE` events, or every agreement with a
  down payment would be unable to start a schedule.
- **The 4 live agreements with charges** (Unit 15 Ledger Test $50 cleanout; three Daily Rodent Trapping
  $99.95 down) were **not** backfilled with receivables - a boot must not invoice test customers. Each
  card offers "Issue initial charge invoice". Until it is pressed, a Daily Rodent Trapping agreement's
  schedule bills price - $99.95 spread over its periods (the down payment is assumed collected outside
  the ledger), which is the owner's default reading; issuing the receivable makes the $99.95 a real
  open invoice. Test data; the office decides.
- **"Counts toward the price", concretely.** `resolveRemainingContractPriceCents()` = price - resolved
  charge for a DOWN_PAYMENT / PREPAY_FULL without the flag; the full price for a CLEANOUT_SURCHARGE
  (inherently additional) or with `initialChargeInAdditionToPrice`. Readers: the per-visit line
  (`remaining ÷ expectedServiceCount` - verified: $400 with $100 down and 4 visits bills $75 a visit,
  while the SCHEDULED_AGREEMENT_SERVICE production entry stays $100, per the owner's third point), a
  PREPAID_TERM plan's one charge, and a RECURRING_INTERVAL plan's per-period share
  (`remaining ÷ (periods - 1 if the plan skips period 1)`, so a term still totals the contract price
  whichever way the plan flag is set; with a down payment equal to one period's share this is exactly
  the old per-period amount). `initialChargeCoversFirstPeriod` now skips period 1 only for a charge
  that counts toward the price - money owed on top cannot also buy a period - and creation
  (`computeNextBillingDateForPlan`) and the nightly run read the same predicate. No live plan sets the
  flag. The recurring-plan reading is the one place this pass went past the owner's literal words
  ("`initialChargeCoversFirstPeriod` is this same rule for recurring schedules"): with per-period =
  price ÷ N, a $100 down on a $400 monthly plan would total $500 without the remainder arithmetic, so
  it was applied there too. If the owner meant the plan flag alone, revert the `billedPeriods` /
  `remainingPriceCents` lines in `billing-run.ts`.
- **What the ledger records for the field-surcharge unit.** `payments.collectedByUserId` /
  `collectedByLabel` are the session actor at recording - the recorded collection event D4 says credit
  must key off. `createSurchargeEntryIfConfigured()` is untouched (cleanout-only, permission-inferred,
  scheduled for deletion by that unit); nothing in this pass reads the ledger for production credit.
- **Permissions added** (`shared/permissions.ts`): `APPLY_PAYMENT` (support+, both directions),
  `CONFIRM_PAYMENT` (support+), `CONFIRM_CASH_PAYMENT` (manager+), `VOID_PAYMENT` (manager+).
  `TAKE_PAYMENT_FIELD` records (technician included: an unapplied, optionally designated payment with
  the technician as collector - verified); `REFUND_PAYMENT` and `ISSUE_CREDIT_MEMO` now have routes.
  Reads are open like every other read route. Technician payment-collection *UI* is still the
  separate pass named in `CURRENT_FOCUS.md`; the route exists for it.
- **Not built, deliberately.** Card / ACH (Phase 2 - the enum names exist, the route refuses them).
  Partial refunds. Check photo / cash signature capture from the historical plan. A credit memo
  number series (memos are identified by reason and amount). Applying a payment across customers or
  locations (refused). Aging buckets (derived, not stored - a Reports item).

**Shipped in Pass 7 (D6 COA as payment application; field display; billing-plan pill), for the
technician payment-collection pass and Pass 8 to build on** - nothing new is stored. One read
resolves what the field sees, and it resolves it through the code that prices the invoice.

```ts
// shared/visit-billing.ts - the shape GET /api/appointments/:id/billing-summary returns.
export type ServiceBillingDesignation = "BILLABLE" | "PRODUCTION";
export interface VisitServiceBilling {
  serviceId; serviceRecordId; serviceTypeName; agreementId;
  designation;                 // PRODUCTION = the visit line is AGREEMENT_COVERED (schedule-billed plan, or warranty callback)
  priceCents: number | null;   // the line amount before tax; 0 for PRODUCTION; null = cannot be resolved (note says why)
  taxCents;                    // frozen on the invoice, or the tax engine's current answer before one exists
  coaAppliedCents;             // issued invoice only: unreleased applications (CONFIRMED and PENDING) allotted to lines in order
  coaAvailableCents;           // no issued invoice only: the location's unapplied pool this line could draw on, D4 order
  dueTodayCents: number | null; // price + tax - applied - available, never negative
  note;                        // "covered by agreement" | "callback" | "warranty callback - no charge" | the refusal reason
}
export interface VisitBillingSummary { appointmentId; locationId; invoice: VisitBillingInvoiceRef | null; invoiced: boolean; services; totals: { priceCents; taxCents; coaAppliedCents; coaPendingCents; coaAvailableCents; dueTodayCents; unresolvedCount } }
export function formatServiceDesignation(d) / describeServiceDesignation(d)   // "Billable" / "Collect today"; "Production" / "Covered by agreement - nothing due today"

// shared/billing-plan.ts - the pill's number IS the nightly run's number.
export function resolveBillingPlanCharge(plan: BillingPlanChargeFields | null, agreement: AgreementChargeFields): BillingPlanCharge
  // PER_PERIOD (RECURRING_INTERVAL on schedule): remaining price / (billing periods in the term - 1 if the plan's up-front money buys period 1)
  // ONCE (PREPAID_TERM): the remaining price      PER_VISIT (everything else, and no plan): remaining price / expectedServiceCount
export function describeBillingPlanPill(plan, agreement): { label; title }   // "Monthly · $50/mo" | "Prepaid Term · $400 once" | "COD · $75/visit" | "No billing plan · $75/visit" | "<plan> · price not set"

// shared/agreement-schedule.ts - addDays / addMonths / advanceAgreementDate / computeExpectedServiceCount, moved out of
// server/storage.ts (which re-exports the last two for billing-run.ts and production-value-backfill.ts) so the pill can count periods.
// shared/money.ts: formatCentsCompact() ("$50", "$12.50").

// server/storage.ts
getVisitBillingSummary(appointmentId): Promise<VisitBillingSummary | undefined>   // IStorage; undefined = no such appointment
// private: orderSourcesForAgreementsTx(reader, locationId, agreementIds) - factored out of orderSourcesForInvoiceTx so the
// field's "available" and the D4 prompt draw the pool in one order. server/jobs/billing-run.ts takes its amount from resolveBillingPlanCharge().

// Route (open read, like every other read):  GET /api/appointments/:id/billing-summary
// Client: components/visit-billing-summary.tsx (useVisitBillingSummary, ServiceDesignationBadge, ServiceBillingFigures,
// ServiceBillingBlock, VisitDueTodayTotal, VisitBillingRows, describeBillingSource), components/billing-plan-pill.tsx
// (BillingPlanPill, useBillingPlanById). invalidateInvoiceViews() now also hits ["/api/appointments", id, "billing-summary"].
```

Behavior worth knowing before the next passes touch it:
- **Two sources, never mixed.** An ISSUED invoice (OPEN / PARTIALLY_PAID / PAID) is the truth: its
  lines give price and tax, its unreleased applications give COA, allotted to lines in `sortOrder`
  so the per-service figures sum to the invoice's. No invoice, or a DRAFT: every service is priced
  through `resolveServiceLineBillingTx` + `resolveTaxDecision` - the calls generation will make -
  and the DRAFT is reported in `invoice` but not trusted for figures (issue re-prices it). A service
  that cannot be priced (no price, plan-less price-less agreement) is `priceCents: null` with
  generation's own refusal message as `note`, and is counted in `unresolvedCount` rather than shown
  as $0 - a $0 reads as "nothing to collect".
- **Pending counts toward what not to collect.** `coaAppliedCents` sums CONFIRMED and PENDING
  applications; a check the office has not cleared is still not money to collect twice. The ledger's
  `amountPaidCents` / `balanceDueCents` (CONFIRMED only) are returned unchanged in `invoice` for the
  receivable view; `totals.coaPendingCents` says how much of the COA is still pending.
- **"COA available" is intent, "COA applied" is fact** (D4). Before the visit is invoiced the
  location's unapplied pool - eligible per `orderSourcesForAgreementsTx`: undesignated or designated
  to one of the visit's agreements, never designated elsewhere - is allotted to the visit's lines and
  subtracted from due today, and the client labels it "COA available" with the sentence that the
  office applies it at invoicing. Verified live: a $40 cash recorded PENDING showed as available on a
  $100 COD visit; confirming it changed nothing; once the visit was invoiced available went to 0 and
  applying the location balance made it "COA applied" with due today = total - applied, the line
  amount, tax and invoice total untouched. A $10 check designated to a different agreement was never
  offered; one designated to the visit's agreement was.
- **Designation** is the line type, nothing else: `AGREEMENT_COVERED` (a schedule-billed plan per
  `isScheduleBilledPlan()`, or a warranty callback) is `PRODUCTION`; every `SERVICE` line, including
  a chargeable callback and a COD-plan agreement visit at remaining price / expected visits, is
  `BILLABLE`. The production-value ledger is not read and not changed.
- **Where it shows.** Service ticket header (designation, the three figures, source sentence; the
  "Service Price" field on a PRODUCTION service gains a caption saying it is production value and is
  not billed on the visit - the field itself is untouched). Technician appointment details (per
  service, compact, then the one due-today total D6 asks for). Dispatch board appointment sheet (in
  place of the raw stamped "Service value", which was null for agreement work). The schedule's
  Service Details dialog still shows the raw `service.priceCents` as "Service Value" - it can open
  for an unscheduled service with no visit to summarize.
- **The pill.** Agreement card badge row and a per-agreement "Agreements:" row on the Location
  Profile card (active agreements only; a location is never labeled monthly or COD as a whole).
  Amount from `resolveBillingPlanCharge()`, which `billing-run.ts` now bills from - the one place the
  per-period arithmetic lives, the way `isScheduleBilledPlan()` is the one place coverage lives. Ten
  arithmetic cases checked ($600/yr monthly = $50/mo; $400 with $100 down = $25/mo, $27.27/mo when
  the plan's down payment buys period 1, $33.33/mo when the down payment is in addition; COD and
  plan-less = remaining / visits; no price = "price not set"). Plan-less agreements get an honest
  outline pill - the 11 load-bearing ones are now visible on their cards without touching them.
- **Not built, deliberately.** Per-line applications (COA is applied to the invoice; the per-service
  split is an allotment for display). The technician collect action (next pass; the route exists).
  A per-service "designation" column on the location Services tab. Any change to how a price is set.
  No migration.

**Shipped in Pass 7.5 (D8 post-ticket sequence relabel), for Pass 8 to know about** - nothing new is
stored and no route changed. The field got its collection step on top of Pass 6's route and Pass 7's
read; the technician flow is finish → collect → post.

```ts
// client/src/components/collect-payment-dialog.tsx - the FIELD's dialog. The office's stays record-payment-dialog.tsx.
export function CollectPaymentDialog({ open, onOpenChange, appointmentId, locationId, designatedAgreementId, onPostTicket?, postingTicket? })
  // summary: VisitBillingRows over useVisitBillingSummary(appointmentId) - the customer-facing Price / COA / Due today rows and total
  // form: payment type (MANUAL_PAYMENT_METHODS), amount (defaults once to totals.dueTodayCents when > 0), check number (CHECK) /
  //       reference (OTHER), memo; "Collected this visit" lists what this dialog recorded
  // POST /api/payments { locationId, method, amountCents, checkNumber, referenceNumber, memo, designatedAgreementId, applyToInvoiceId: null }
  // onPostTicket given (ticket flow): footer is Back / "Post Service Ticket". Absent (appointment details): Close.
export function resolveVisitDesignation(agreementIds): string | null   // exactly one distinct agreement -> it; otherwise undesignated

// client/src/components/service-completion-dialog.tsx: the footer button is "Finish & Collect" and opens the dialog above
// (designated to service.agreementId, location = appointment.locationId ?? service.locationId). "Post Service Ticket" moved
// into the collect step and runs the unchanged POST /api/services/:id/complete mutation; success closes both dialogs.
// client/src/pages/technician-work.tsx: "Collect Payment" under the appointment details' due-today total (TAKE_PAYMENT_FIELD,
// hidden on a CANCELED visit), designated by resolveVisitDesignation() over the visit's services.
```

Behavior worth knowing before Pass 8 touches it:
- **The field records, the office applies.** The dialog never sends `applyToInvoiceId`; a technician
  who sends one anyway gets the route's 403. Every collection posts `PENDING` with
  `collectedByUserId` / `collectedByLabel` from the session - the recorded collection event D4 says
  credit must key off. Confirmation is untouched: a technician cannot confirm at all, support cannot
  confirm cash (`CONFIRM_CASH_PAYMENT` is manager+), a manager can. All verified live.
- **What the summary does after a collection.** Before the visit is invoiced the recorded money is
  undesignated or designated to a visit agreement, so the next read shows it as "COA available" and
  due today drops (verified: a $75 COD visit, $75 cash collected → due today $0, line price and tax
  untouched, D6). Once the visit is invoiced the summary reads applications only, so an unapplied
  field collection does not move its figures - that is why the dialog's "Collected this visit" block
  lists what it recorded, so the technician sees the collection took; the office applies it from the
  Invoices tab or the D4 prompt. Money designated to a different agreement is never offered to the
  visit (Pass 7's rule, re-verified with a check designated to Unit 15 Ledger Test).
- **Amount defaults once**, to due today when it is above zero and the summary has arrived, and is
  cleared after each recording - a split (cash and a check) is two recordings, and a repeat is never
  pre-filled. "Nothing collected" is allowed: Post Service Ticket is always available, with a line
  saying the office bills the balance. A service that is not on an appointment gets no summary and a
  typed amount at the service's location.
- **Labels are D8's.** "Finish & Collect" / "Post Service Ticket"; nothing on the technician side says
  "Complete" - office finalization owns that word. The three call sites of the ticket dialog (technician
  work, location Services tab, schedule) all get the same flow; the office's `RecordPaymentDialog`
  (Invoices screen, location ledger panel) is untouched.
- **Not built, deliberately.** Card / ACH (Phase 2). Signatures and a printable customer copy (D8 names
  them "future"). A required check number. Applying from the field. No migration.

**Owner review of Pass 7.5 (2026-09-15, approved 2026-09-16)** - from live testing of the whole
field → office loop, recorded in full under D5 in `PLAN_BILLING_V1_1.md`. What the review found,
and the design each finding settled, so Pass 7.6 and 7.7 build the same thing the owner approved:
- **The reviewer finalizes blind.** `service-ticket-review.tsx`'s modal shows technician, timing,
  notes, pests and materials - no price, no due today, no field collection. Pass 7's read went to
  the tech ticket, the appointment details and the dispatch sheet, never here. D9's "price/payment
  and address blocks" were decided and owned by no pass. Pass 7.6 puts `VisitBillingRows` and the
  visit's collections on the modal, above Finalize.
- **A payment cannot name its visit.** `payments` carries location, collector, `receivedAt` and an
  optional `designatedAgreementId` - nothing links it to an appointment, so "collected in the field
  for this ticket" has no honest source; a guess by location, date and technician misleads on a day
  with two visits at one location. The fix is a nullable `payments.appointmentId`, set once by the
  field collect dialog (both surfaces know the appointment) and never changed: intent, exactly as
  the agreement designation is. The D4 prompt orders visit-collected money first. Application stays
  the office's explicit act; the office `RecordPaymentDialog` does not set it.
- **Pending money vanishes after the D4 prompt.** "Pending shows, confirmed counts" stands - a
  bounced check must never have marked an invoice paid. But once applied, a pending payment leaves
  the ledger panel's Pending tile (unapplied only), the row says "Paid $0", the Invoices screen says
  nothing, and the only trace is behind the row's "Applications" toggle. `sumInvoiceApplicationsTx`
  already computes `pendingCents` inside every recompute and `recomputeInvoiceRollupTx` discards it;
  Pass 7.6 stores it as `invoices.pendingAppliedCents`, in the same transaction as the other two
  rollups, and every invoice row and tile shows it as "pending confirmation".
- **Confirm lives in one place.** The location ledger panel has the only Confirm (support+, cash
  manager+). Pass 7.6 offers the same, gated the same, on the review modal. Pass 7.7 adds the
  org-wide list, the pending queue with batch confirmation, and the collections report - none of
  which exist today (`GET /api/payments/by-location/:id` is the only payments read, `reports.tsx`
  has no collections view, the historical plan had "field payment capture" in Phase 2).
- **Left unscheduled on purpose.** D9's role-gated office edit button and the settings-driven
  reopen-reason dropdown: both are real workflow work with audit implications, and Pass 8 is about
  to touch reopen logging.

**Shipped in Pass 7.6 (D9 review-modal blocks; D5 owner review items 1-3), for Pass 7.7 to build
on** - two columns, one backfill, one read, and the reviewer sees money before Finalize.

```ts
// shared/schema.ts
payments.appointmentId          // varchar, nullable. The visit the money was collected at - intent like designatedAgreementId,
                                // set once by the field's collect dialog, never by the office's RecordPaymentDialog, never changed.
invoices.pendingAppliedCents    // integer NOT NULL DEFAULT 0. Unreleased applications of PENDING payments: shown, never counted.

// shared/invoice-status.ts
export function computeInvoiceRollup({ totalAmountCents, amountPaidCents, pendingAppliedCents?, currentStatus? })
  : { amountPaidCents; balanceDueCents; pendingAppliedCents; status }
  // pendingAppliedCents defaults to 0 (the DRAFT -> issued transition, where nothing is applied); 0 for DRAFT / VOID;
  // status never reads it - a bounced check must never have marked an invoice paid.

// shared/payments.ts
UnappliedSource.appointmentId: string | null     // null for office-recorded money and for credit memos

// server/storage.ts
RecordPaymentInput.appointmentId?: string | null // refused unless the appointment exists and sits at the payment's location
                                                 // (appointments.locationId; its services' locations when that is null - getLinkedServicesForAppointmentTx)
getPaymentsByAppointment(appointmentId): Promise<Payment[]>   // IStorage. Payments that NAMED the visit, oldest first - never a guess by location/date/tech
// private: recomputeInvoiceRollupTx now stores sums.pendingCents (sumInvoiceApplicationsTx already computed it);
// collectUnappliedSourcesTx carries appointmentId; orderSourcesForAgreementsTx(reader, locationId, agreementIds, appointmentId = null)
// ranks visit-collected (0) < agreement-designated (2) < undesignated (4), +1 when PENDING, then oldest first.
// orderSourcesForInvoiceTx passes invoice.appointmentId; getVisitBillingSummary passes appointment.id - the D4 prompt and the
// field's "COA available" still draw the pool in ONE order.

// Routes
POST /api/payments                                  body gains appointmentId (nullable, optional); TAKE_PAYMENT_FIELD as before
GET  /api/payments/by-appointment/:appointmentId    open read like the other payments reads - the review modal's list

// server/payments-bootstrap.ts (runs every boot, idempotent)
//   ALTER TABLE payments ADD COLUMN IF NOT EXISTS appointment_id varchar REFERENCES appointments(id); index on it. No backfill: nothing
//   before this pass recorded a visit, and inferring one is the misattribution the column ends.
//   ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pending_applied_cents integer; UPDATE ... WHERE pending_applied_cents IS NULL from
//   unreleased applications of PENDING payments (0 for DRAFT / VOID); SET DEFAULT 0; SET NOT NULL - the whole block behind an
//   information_schema is_nullable guard, so every boot after the first skips the table-wide UPDATE.

// client
// pages/service-ticket-review.tsx: the header card is ONE row - identity (customer, service type, agreement) | address (MapPin, street,
//   city/state zip) | status badge - then two FULL-WIDTH blocks above Finalize. "Visit billing" = VisitBillingTable (new in
//   visit-billing-summary.tsx: one table row per service - name + designation | Price (+ tax) | COA | Due today - and a Due today
//   footer; the same figures as VisitBillingRows, which stays for the phone-width collect dialog) over useVisitBillingSummary(appointment).
//   VisitCollectionsBlock = GET /api/payments/by-appointment + the location's ledger-summary: one line per payment - method / check # /
//   amount / status badge / received-by / applied-or-on-balance - with Confirm at the right, gated exactly as LocationLedgerPanel
//   (CONFIRM_PAYMENT; cash also CONFIRM_CASH_PAYMENT; "Cash is confirmed by a manager or admin." for support); "Collected $X - $Y pending
//   confirmation" in the block's title row; then "This location also has $Z on account not linked to this visit" / "No other balance on
//   account". A failed by-appointment read says "could not be loaded", never "nothing collected". Back / "n of N" / Next in the dialog
//   header over filteredRecords (goToRecord clears the reopen reason).
// components/collect-payment-dialog.tsx: POST body gains appointmentId (both surfaces already knew the appointment).
// components/apply-location-balance-prompt.tsx: a source collected at the invoice's visit says ", collected at this visit".
// pages/invoices.tsx: row prints Paid / Balance when paid OR pending > 0, plus "$X pending confirmation"; Open tile sub-line
//   "$X of it pending confirmation". components/location-ledger-panel.tsx: InvoiceRowLedger appends " - $X pending confirmation";
//   the Pending tile gains "+ $X applied to invoices, awaiting confirmation" summed from the tab's issued invoices.
```

Behavior worth knowing before Pass 7.7 touches it:
- **The visit link is a preference, not a fence.** Money designated to a *different agreement* is set
  aside (Pass 6, unchanged). Money collected at a *different visit* at the same location is still
  eligible for this invoice, ranked by its designation - otherwise a payment collected at a visit
  that was already settled could never reach the customer's next invoice. Verified live: an office
  check with no visit, recorded *before* the technician's check and cash, was listed and drawn third.
- **Read payments by appointment, never the summary.** Once the visit is invoiced,
  `getVisitBillingSummary` reads applications only, so an unapplied field collection does not move
  its figures; the modal's list reads `payments.appointmentId` directly and survives invoicing,
  application and confirmation. The list's "applied / on the location balance" suffix comes from the
  ledger-summary sources (a fully applied payment is absent from them, so absent = applied).
- **Where the pending figure moves.** Recorded PENDING and unapplied: the ledger panel's Pending tile
  (unchanged). Applied while PENDING: leaves that tile, lands in `pendingAppliedCents` on the invoice
  row, the Invoices screen row and Open tile, the InvoiceRowLedger line and the panel's new sub-line.
  Confirmed: leaves `pendingAppliedCents`, enters `amountPaidCents`, `balanceDueCents` drops - all in
  `confirmPayment`'s transaction. Verified live: $8,500 applied pending on a $100 visit read
  pending 8500 / paid 0 / due 10000; support's check confirmation moved 2500 across; the manager's
  cash confirmation moved 5000; the row, the list and `pending_applied_cents` in the table agreed at
  every step. `coaPendingCents` on the billing summary equals the stored rollup.
- **Validation is the agreement designation's, applied to the visit.** Unknown appointment: 400
  "Appointment not found". Appointment at another location: 400 "The appointment is at a different
  location than the payment". An appointment with no `locationId` is placed by its linked services.
  Verified both refusals live as the technician.
- **Backfill on the dev DB.** Zero unreleased applications of PENDING payments existed, so every row
  backfilled to 0; after boot 1 no row was NULL and zero rows disagreed with the ledger sum; boot 2
  found the column NOT NULL and skipped the block. `payments.appointment_id` is nullable for good.
- **The owner's first render (2026-09-16) found two things, fixed in the branch's second commit.**
  (1) "Nothing collected in the field" while the location showed $216.50 pending. The test ran
  against a dev server started the evening before on pre-7.6 server code: its request schema
  dropped `appointmentId` (zod strips unknown keys), so the two collections landed with a NULL
  visit link, and `/api/payments/by-appointment` fell through to the SPA's index.html, which the
  modal read as an empty list. **A pass with server changes needs the owner's `npm run dev:full`
  restarted before a manual test** - Vite hot-reloads the new client against the OLD API otherwise,
  and the failure looks exactly like a logic bug. The two unlinked payments stay unlinked (the ledger
  is append-only, and guessing the visit is what the column exists to end); they show under the
  "not linked to this visit" line, which is why that line says *not linked* rather than *not from*.
  The modal now shows a failed read as "could not be loaded", never as "nothing collected". (2) Dead
  space: the header card was one column of text plus a badge, and the short collections block sat
  beside the tall billing block. The header is now identity | address | status on one row, and the
  money blocks are full width - a per-service table for billing, one line per payment for
  collections.
- **Not built, deliberately.** D9's office edit button and settings-driven reopen-reason dropdown
  (unscheduled). Anything on a Payments screen (7.7: the org-wide list, the pending queue with batch
  confirmation, the collections report). Setting or changing `appointmentId` from the office (the
  ledger is append-only: a wrong visit is a void and a re-entry). Card / ACH (Phase 2).

**Design note carried into Pass 4** - resolved there: D3's "flags the linked ticket(s) for review" had
no existing "flagged" concept in the schema. Pass 4 extended `serviceRecords.ticketStatus` with
`FLAGGED_FOR_REVIEW` (vocabulary now `OFFICE_REVIEW_PENDING | FLAGGED_FOR_REVIEW | FINALIZED |
REOPENED`) plus the who/when/why columns in the reopen columns' shape, rather than a parallel flag
field. See "Shipped in Pass 4".

**Everything stays green between passes**: each row's Verify column includes `npm run check` +
double-boot (bootstrap idempotency) + a live PowerShell/UI smoke test. No pass leaves the app in a
broken or half-migrated state — Pass 1's enum migration, in particular, updates every one of the ~39
sites in one commit specifically so old and new casing never coexist.

---

## 5. Resolved decisions (Q1-Q4)

**Q1 — Tax on partially-COA-covered invoices: tax on full amount.** COA is a payment against an
already-fully-taxed total; `resolveTaxDecision()`'s current behavior (tax computed once at issue, on
the full line amount, no awareness of payments) is correct as-is, needs no change for D6.

**Q2 — Credit memos vs. unapplied deposits: one unified pool.** A credit memo and a cash deposit are
both just "unapplied balance at the location," applied through the same code path with no priority
ordering between them — `payment_applications` and `credit_applications` are summed together in the
§2.5 rollup.

**Q3 — DRAFT invoice fate on appointment cancel: prompt the user.** Canceling an appointment that has a
DRAFT invoice surfaces a confirmation ("Void the draft invoice on this appointment?") rather than
auto-voiding or silently orphaning it — consistent with the existing cancellation-modal pattern already
used for agreement cancellation. Lands in Pass 4, wired into both existing appointment-cancel call
sites.

**Q4 — The orphan `'pending'` appointment status: maps to SCHEDULED, no 5th enum value.**
`appointments.scheduledDate` is `NOT NULL` — an appointment row only exists once dispatch places a
service on the board with a real date. What was initially described as "not fully scheduled yet" is
already exactly `services.status = 'PENDING_SCHEDULING'` (a service with no appointment row yet), not a
distinct appointment-level state. The 1 live `'pending'` row is pre-validation data drift and remaps to
`SCHEDULED`. **Separate, out-of-scope observation**: the Location → Services tab doesn't currently make
a PENDING_SCHEDULING-vs-SCHEDULED service visually obvious at a glance — a real UI gap, but a
Services-tab display improvement reading the existing `services.status`, not a billing-plan concern.
Worth its own pass later.

---

## Verification (end to end, once all 9 passes are merged)

Run the acceptance targets already listed in `PLAN_BILLING_V1_1.md`'s own "Verification targets"
section — they map directly onto this plan's passes. In addition, confirm the three
conflict-resolution guards this plan adds are holding:
- An agreement-covered visit-invoice line is always `$0`/non-taxable and never produces a
  `billing_events` row (§2.1).
- The 9 legacy-`billingFrequency`-only agreements and the 2 no-billing-data agreements were each
  explicitly resolved (plan assigned or flagged), not silently dropped, before Pass 9's column drop.
- Canceling an appointment with a DRAFT invoice prompts rather than silently voiding or orphaning it,
  on both call sites.
