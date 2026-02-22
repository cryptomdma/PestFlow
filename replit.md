# PestFlow - Pest Control CRM

## Overview
PestFlow is a lightweight, UI-centric CRM built for small/medium Pest Control Operators (PCOs). It provides a complete workflow from customer creation through scheduling, servicing, documentation, invoicing, and reporting.

## Tech Stack
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter (routing) + TanStack Query
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Styling**: Tailwind CSS with custom design tokens

## Project Structure
- `client/src/pages/` - All page components (dashboard, customers, schedule, services, invoices, communications, reports, settings)
- `client/src/components/` - Shared components (app-sidebar, theme-toggle, ui/)
- `client/src/lib/` - Utilities (queryClient, theme-provider)
- `server/` - Express backend (routes.ts, storage.ts, db.ts, seed.ts)
- `shared/schema.ts` - Drizzle schema + Zod validation + TypeScript types

## Data Models
- **Customers** - Core entity with multi-contact and multi-location support, defaultBillingProfileId
- **Contacts** - Multiple contacts per customer with roles
- **Locations** - Multiple locations per customer with property details, gateCode, billingProfileId (for billing override)
- **Billing Profiles** - Payment method profiles per customer (card, ACH, invoice), can be overridden per-location
- **Customer Notes** - Scoped notes system: CUSTOMER scope (shared notes) or LOCATION scope (location-only notes). Notes can be converted between scopes.
- **Service Types** - Configurable service catalog
- **Appointments** - Scheduling with assigned technicians, scoped to locations
- **Service Records** - Compliance documentation with conditions and recommendations
- **Product Applications** - EPA-compliant chemical usage tracking (product name, EPA reg #, dilution rate, amount, device, location)
- **Invoices** - Billing with status tracking, locationId for location-scoped filtering
- **Communications** - Email, phone, SMS logging, locationId for location-scoped filtering

## Key Features
- Dashboard with KPI stats and upcoming services
- Customer management with multi-location/contact support
- **Location-scoped customer detail UX**: Brief header, collapsible customer notes panel, location selector dropdown, all tabs (Schedule/Services/Invoices/Comms) filtered by active location
- **Notes system**: Shared (customer-level) vs location-only notes with "Make Shared" / "Make Location" conversion actions
- **Billing profiles**: Default vs per-location billing override with visual indicators
- **URL-persisted location selection**: Active location stored in ?locationId= querystring, defaults to primary location
- Calendar-based scheduling
- Service history with compliance documentation (products, EPA numbers, etc.)
- Invoice creation and payment tracking
- Communication logging
- Reports and analytics
- Dark/light theme toggle
- Sidebar navigation

## API Routes (Location-Scoped)
- GET /api/appointments/by-location/:locationId
- GET /api/service-records/by-location/:locationId
- GET /api/invoices/by-location/:locationId
- GET /api/communications/by-location/:locationId
- GET /api/location-counts/:locationId (returns { appointments, services, invoices, communications } counts)
- GET /api/notes/shared/:customerId
- GET /api/notes/location/:locationId
- POST /api/notes
- PATCH /api/notes/:id/convert-scope
- POST /api/locations/:id/set-primary
- GET /api/billing-profiles/:customerId
- POST /api/billing-profiles

## Running
- `npm run dev` starts both frontend (Vite) and backend (Express) on port 5000
- `npm run db:push` syncs database schema
