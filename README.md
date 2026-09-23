# PestFlow

A CRM built for small/medium pest control operators (PCOs): customer/location management, scheduling,
service tickets, agreements, invoicing, tax, payments, and reporting.

## Start here

Read `CLAUDE.md` (or `AGENT_WORKING_AGREEMENT.md` if you're not Claude Code) before making any change.
It points to the domain model, the current decision record, and the current-status doc, in the order
they need to be read.

## Tech stack

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter (routing) + TanStack Query
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM (raw idempotent SQL in `server/*-bootstrap.ts`, run on every
  boot - this repo has no `drizzle-kit generate`/migration files)
- **Auth**: `passport-local` + `express-session` (real sessions, org-scoped users, role-based
  permissions in `shared/permissions.ts`)

## Local development

### Requirements
- Node 22.x or 24.x (LTS; `.nvmrc` says 24, `engines` allows >=22.12 - Node 20 is end-of-life)
- Docker Desktop

### First-time setup
1. Copy `.env.example` to `.env` (see `PROJECT_MAP.md` for what each variable is)
2. Install dependencies: `npm install`
3. Start the database: `docker compose up -d`
4. Create the schema: `npm run db:push` (the bootstrap scripts only *evolve* tables - they do not
   create the base schema, so a fresh database needs this once before the first boot)
5. Start the app: `npm run dev` (runs the bootstrap scripts, then seeds demo data and the default
   admin login, printed to the console on first boot)

If you ran `npm run dev` before `npm run db:push`, the database is half-built: `npm run db:reset`
wipes it, then repeat steps 4-5.

### Daily startup
1. `docker compose up -d`
2. `npm run dev`

App URL: http://localhost:5000

## Current data model (summary)

Multi-tenant (every table is `org_id`-scoped). Real auth with role-based permissions
(technician/support/manager/admin). Core entities:

- **Organizations / Users** - tenant + internal staff, real login
- **Customers / Accounts / Locations** - the in-flight canonical migration is Location-as-customer,
  Account-as-grouping-context; see `CANONICAL_DOMAIN_RULES_V1.md` for the target model and current gaps
- **Agreements / Agreement Templates / Billing Plans / Cancellation Policies** - recurring service
  contracts with snapshot-on-creation billing/cancellation terms
- **Services / Appointments / Service Records** - Services are queueable work units; one Appointment
  may hold multiple Services; Service Records are the compliance/completion truth layer, finalized by
  office review (see `getLinkedServicesForAppointmentTx()` in `server/storage.ts` for the
  appointment-to-services rollup used across the codebase)
- **Invoices / Invoice Line Items / Tax Rates & Rules / Billing Events** - invoicing with integer-cents
  money, snapshotted tax at issue, and a nightly billing run for schedule-driven agreement revenue
- **Production Value Entries** - append-only comp-basis ledger, frozen at office finalization
- **Documents** - deterministic PDF/HTML rendering for invoices, stored with a content hash
- **Opportunities** - follow-up/retention workflow, distinct from Appointments

Payments/credit-memos/unapplied-balance infrastructure does not exist yet - see `PLAN_BILLING_V1_1.md`
(decision D5) and `PLAN_BILLING_V1_1_EXECUTION.md` for what's being built next.

## Repo layout

- `client/src/pages/` - page components
- `client/src/components/` - shared components
- `server/` - Express backend (`routes.ts`, `storage.ts`, `db.ts`, `*-bootstrap.ts`, `jobs/`,
  `documents/`)
- `shared/schema.ts` - Drizzle schema + Zod validation + TypeScript types (single source of truth for
  every table)
- `shared/permissions.ts` - RBAC permission constants and the role-to-permission matrix

## Useful commands

- `npm run dev` - starts both frontend (Vite) and backend (Express) on port 5000
- `npm run check` - TypeScript typecheck (also the completion gate for every pass)
- `npm run db:push` - Drizzle schema diff/push. Required once on a fresh database; after that the
  bootstrap scripts handle schema evolution on boot
- `npm run db:reset` - drop the local database volume and start an empty one (then `db:push` again)
- `npm run dev:full` - `docker compose up -d` followed by `npm run dev`
