# PestFlow Project Map

Mechanical reference only — stack, entry points, directories, environment. For domain rules, read
`CANONICAL_DOMAIN_RULES_V1.md`. For current priorities, read `CURRENT_FOCUS.md`.

## Stack
- Frontend: React + Vite + Tailwind
- Backend: Express + TypeScript
- ORM: Drizzle
- Database: Postgres
- Runtime: Node 20
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
  (`schema.ts`, `permissions.ts`, `money.ts`, `production-value.ts`, `audit.ts`)
- `script/` — build/util scripts

## Migration convention
No `drizzle-kit generate`/`migrations/` directory. Schema changes are hand-written idempotent SQL in
`server/*-bootstrap.ts` files (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`, guarded backfills), run in sequence on every server boot via `server/index.ts`. This is why
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
2. `npm run dev`
