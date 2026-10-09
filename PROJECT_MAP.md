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
  (PDF/HTML rendering)
- `client/` — frontend app (`src/pages/`, `src/components/`, `src/lib/`)
- `shared/` — schema, types, and cross-cutting constants shared by both client and server
  (`schema.ts`, `permissions.ts` - the permission list and the `can()` registry -, `role-profiles.ts`,
  `users.ts` - the display name, the login-status vocabulary, the email helpers -, `technicians.ts` -
  the technician status vocabulary and the `TechnicianSummary` projection `GET /api/technicians`
  answers since Pass 38 (a technician is a users row) -, `technician-preferences.ts`,
  `appointment-crew.ts`, `money.ts`, `production-value.ts`, `audit.ts`, `app-settings.ts` - the settings keys
  labelled for the Settings page's "Recent settings changes" list, Pass 39)
- `script/` — build/util scripts

## Migration convention
No `drizzle-kit generate`/`migrations/` directory. The core tables come from `npm run db:push` on a
fresh database; every later schema change is hand-written idempotent SQL in `server/*-bootstrap.ts`
files (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, guarded backfills,
a one-time table merge that returns silently once the old table is gone - Pass 38's
`technician-users-bootstrap.ts` - and a guarded column drop or foreign-key add - Pass 39's
`billing-profile-bootstrap.ts`: `DROP COLUMN` behind a column-exists check, `ADD CONSTRAINT` behind a
`pg_constraint` check by column, each printed once and silent after), run in sequence on every server
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

## Local startup
1. `docker compose up -d`
2. `npm run db:push` (first time on a machine - the core tables)
3. `npm run dev` (`npm run dev:full` does 1 and 3)
