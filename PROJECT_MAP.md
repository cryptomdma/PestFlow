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
- Service Records are the compliance/completion truth layer tied to individual Services.
- Technician completion captures a historical technician name and license snapshot; do not rely only on live technician joins for compliance history.
- The Technician Work MVP is a mobile-first web/PWA route, not a native app.
- Multi-service Appointments are completed service-by-service; the Appointment should be completed only when all linked Services are completed.
- Technicians post Service Tickets; office finalization/reopen is a separate review layer and finalization is the authoritative completion event.
- Appointment-level time tracking uses `timeInAt`, `timeOutAt`, and `durationMinutes`; GPS timing fields are staged for later.
- Service Time Tracking Mode lives in Settings and controls automatic, prompted, or manual time out.
- `/service-ticket-review` is the office queue for posted tickets pending review.
- Material Products are reusable compliance-aware definitions used by Product Application rows on Service Tickets.
- Product Applications should capture product, EPA number, dilution, amount/unit, method, equipment/device, application area, notes, and active ingredient amount.
- Areas serviced should be derived from structured application areas where practical.
- Technician ticket drafts are local-device `localStorage` protection only; full offline sync is future work.
- Technician route view is day-driven and should expose compact Today/Prev/Next/date-picker navigation.
- Target pests are internal treatment context on Service Tickets; warranted pests/customer-facing warranty language is future work.
- Target Pests are Settings-managed reference data for Service Ticket treatment context.
- Service Tickets can flag follow-up required with technician notes; office review owns customer contact and follow-up scheduling until route optimization/availability settings exist.
- Technician route Appointment cancel/reschedule requests require Settings-configured reasons, cancel the historical Appointment, requeue linked Services as pending scheduling, and create an open Opportunity for office follow-up/rescheduling.
- Field service type/price adjustment is allowed only for non-agreement Services. Agreement-generated Services remain locked in the technician ticket workflow.
- Service Ticket material cards should be mobile-manageable: add newest at top, allow removal, and collapse into summary rows.
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
- Cancellation policy fee types support none, flat, percentage of full contract price, percentage of remaining balance, and manual review.
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
- Do not build invoicing/payment behavior directly into Service completion; finalized/billing-ready Service Records are the future invoicing input.
- Do not bypass office review by treating technician-posted tickets as fully finalized billing events.
- Do not add technician-driven follow-up appointment self-scheduling until route optimization and admin-configured follow-up availability are in place.
