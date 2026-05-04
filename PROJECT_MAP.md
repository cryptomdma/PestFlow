# PestFlow Project Map

## Stack
- Frontend: React + Vite + Tailwind
- Backend: Express + TypeScript
- ORM: Drizzle
- Database: Postgres
- Runtime: Node 20
- Local DB: Docker Compose

## Entry Points
- Server entry: `server/index.ts`
- Build script: `script/build.ts`

## Important Directories
- `server/` - backend app, routes, db, API logic
- `client/` - frontend app
- `shared/` - shared schemas/types/constants
- `script/` - build/util scripts

## Current Domain Direction
- Location is the canonical customer/service record.
- Services are queueable work units and may exist before scheduling.
- Appointments are dispatch-board placements for one or more Services.
- Agreement generation creates pending Services only.
- `generationLeadDays` means generate pending agreement work X days before `nextServiceDate`.
- `serviceWindowDays` means the generated Service window starts on `nextServiceDate` and ends `serviceWindowDays` later.
- Agreement scheduling modes are `AUTO_ELIGIBLE`, `CONTACT_REQUIRED`, and `MANUAL`.
- `CONTACT_REQUIRED` agreement Services create linked Opportunities for office follow-up.
- Opportunities can represent non-contract follow-up, agreement contact-required work, cancellation recovery, and future retention-risk workflows.
- Auto-scheduling and route optimization are future layers, not part of the current agreement generation pass.

## Environment
Required env vars:
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

## Rules
- Keep env loading at top of `server/index.ts`
- Prefer shared types in `shared/`
- Do not invent new architecture without checking existing patterns
- Follow existing Tailwind design language unless explicitly changing UI system
