# PestFlow Project Map

Mechanical reference only — stack, entry points, directories, environment. For domain rules, read
`CANONICAL_DOMAIN_RULES_V1.md`. For current priorities, read `CURRENT_FOCUS.md`.

## Stack
- Frontend: React + Vite + Tailwind
- Backend: Express + TypeScript
- ORM: Drizzle
- Database: Postgres
- Runtime: Node 22.12+ (`.nvmrc` pins 24; `engines` in `package.json` enforces the floor)
- Local DB: Docker Compose

## Entry points
- Server entry: `server/index.ts` — also where every `bootstrap*()` call is sequenced on boot
- Build script: `script/build.ts`

## Important directories
- `server/` — backend app: `routes.ts` (every HTTP route, always via `req.storage`, never raw Drizzle),
  `storage.ts` (the single `IStorage`/`DatabaseStorage` repository — all org-scoped queries live here),
  `db.ts` (connection pool), `*-bootstrap.ts` (idempotent schema/seed scripts, one per feature area,
  run on every boot), `jobs/` (scheduled jobs — currently just the nightly billing run), `documents/`
  (PDF/HTML rendering), `integrations/` (the vendor ports - PLAN_BILLING_V1.md §0.4: `payments/types.ts` the
  port the domain imports, `payments/index.ts` the factory, `payments/providers/stripe.ts` the ONLY file that
  imports the `stripe` SDK, `payments/providers/fake.ts` the smoke test's double, `payments/credentials.ts` the
  encryption at rest; `outbox/`, `accounting/`, `crm/`, `inventory/` are types only - Pass 40, C6.1)
- `client/` — frontend app (`src/pages/`, `src/components/`, `src/lib/`)
- `shared/` — schema, types, and cross-cutting constants shared by both client and server
  (`schema.ts`, `permissions.ts` - the permission list and the `can()` registry -, `role-profiles.ts`,
  `users.ts` - the display name, the login-status vocabulary, the email helpers -, `technicians.ts` -
  the technician status vocabulary and the `TechnicianSummary` projection `GET /api/technicians`
  answers since Pass 38 (a technician is a users row) -, `technician-preferences.ts`,
  `appointment-crew.ts`, `money.ts`, `production-value.ts`, `audit.ts`, `app-settings.ts` - the settings keys
  labelled for the Settings page's "Recent settings changes" list, Pass 39 -, `payment-methods.ts` - the card on
  file and the payment provider account: the vocabulary, the summaries every read answers (display fields, never
  a provider id), the error codes, Pass 40)
- `script/` — build/util scripts

## Migration convention
No `drizzle-kit generate`/`migrations/` directory. The core tables come from `npm run db:push` on a
fresh database; every later schema change is hand-written idempotent SQL in `server/*-bootstrap.ts`
files (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, guarded backfills,
a one-time table merge that returns silently once the old table is gone - Pass 38's
`technician-users-bootstrap.ts` - and a guarded column drop or foreign-key add - Pass 39's
`billing-profile-bootstrap.ts`: `DROP COLUMN` behind a column-exists check, `ADD CONSTRAINT` behind a
`pg_constraint` check by column, each printed once and silent after; Pass 40's
`payment-methods-bootstrap.ts` creates its three tables behind a table-exists check and names its keys and
indexes the way `db:push` does), run in sequence on every server
boot via `server/index.ts`. This is why
every pass's verification includes booting the server twice — the second boot is what proves the
migration is actually idempotent, not just correct on a fresh database.

## Environment
Required env vars (see `.env`):
- `DATABASE_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`
- `SESSION_SECRET`
- `PORT`
- `PAYMENT_CREDENTIALS_KEY` (Pass 40, C6.1) - the master key that encrypts the payment provider's secret key and
  webhook signing secret at rest (`server/integrations/payments/credentials.ts`, AES-256-GCM): 32 bytes as 64 hex
  characters or base64. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  Unset, the server boots and warns every time, and Settings → Payments cannot store a key (503
  `PAYMENT_CREDENTIALS_KEY_MISSING`). Changing it orphans the stored secrets - save the provider keys again.

Optional (dev only):
- `PAYMENT_PROVIDER_FAKE_ALLOWED=1` - lets Settings → Payments connect the `fake` provider
  (`server/integrations/payments/providers/fake.ts`, an in-process double with no network) so a smoke test can
  drive the SetupIntent / confirm / remove paths without a Stripe key. Refused in production.

## Local startup
1. `docker compose up -d`
2. `npm run db:push` (first time on a machine - the core tables)
3. `npm run dev` (`npm run dev:full` does 1 and 3)
