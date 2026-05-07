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
- Agreement Cancellation Policies now exist as Settings-level templates for the MVP cancellation workflow.
- Agreement Templates select a Cancellation Policy, and Location Agreements snapshot policy terms when created from a template.
- Agreement cancellation is policy-driven and can affect pending generated Services, scheduled Appointments, open Opportunities, and retention Opportunity creation.
- Billing collection and contract rendering are future layers, not part of the cancellation policy MVP.

## Agreement Roadmap Direction
- Cancellation Policies are reusable Settings-level templates selected by Agreement Templates and inherited/snapshotted by Location Agreements.
- Agreement cancellation must be a policy-driven workflow with impact preview, not a simple status flip.
- Agreement cancellation and service/appointment cancellation are separate workflows with different recovery behavior.
- Terms & Conditions are future Settings-level templates used with Agreement Templates, Cancellation Policies, pricing, and warranty/scope language to generate customer-facing contracts.
- Signed contracts should be immutable historical records with rendered text, terms version, cancellation policy snapshot/version, pricing snapshot, and signature metadata.
- Agreement changes after signing should use amendments, versions, replacements, upgrades, downgrades, renewals, or cancellation workflows.
- Bundles are a billing/pricing/grouping layer above independent agreements. Use `bundles` and `bundle_agreements` rather than a simple nullable agreement `bundleId`.
- Bundles should not control scheduling, generate Services, replace Agreements, or hide individual agreement lifecycle.
- Recommended build order: finish cancellation policy verification, contract snapshot/versioning, amendment lifecycle, bundles/unified billing, billing enforcement/proration/payment collection.
- Immediate next implementation priority after this MVP: Terms & Conditions / contract snapshot/versioning.

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
