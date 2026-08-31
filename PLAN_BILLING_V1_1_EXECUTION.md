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
| 3 | `feature/phase-1-invoice-appointment-anchor` | D1 | Not started |
| 4 | `feature/phase-1-draft-invoice-lifecycle` | D3, Q3 | Not started |
| 5 | `feature/phase-1-finalize-invoice-wiring` | D2 | Not started |
| 6 | `feature/phase-1-payments-lite` | D5, D4 | Not started |
| 7 | `feature/phase-1-coa-and-field-display` | D6 | Not started |
| 8 | `feature/phase-1-audit-log-backfill` | D7 (remainder) | Not started |
| 9 | `feature/phase-1-legacy-billing-frequency-removal` | D9 | Not started |

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
| `customer-detail.tsx:246,1425,1772` | both / `billingFrequency` | form init, submit payload, "Billing Frequency Override" input field |
| `settings.tsx:1026,1051,1119,1778` | `defaultBillingFrequency` | form init, submit payload, input field, list-card display text |
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

**Design note carried into Pass 4**: D3's "flags the linked ticket(s) for review" has no existing
"flagged" concept in the schema. Reuse/extend `serviceRecords.ticketStatus` (currently
`OFFICE_REVIEW_PENDING | FINALIZED | REOPENED`) rather than inventing a parallel flag field.

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
