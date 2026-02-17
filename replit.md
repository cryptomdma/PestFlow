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
- **Customers** - Core entity with multi-contact and multi-location support
- **Contacts** - Multiple contacts per customer with roles
- **Locations** - Multiple locations per customer with property details
- **Service Types** - Configurable service catalog
- **Appointments** - Scheduling with assigned technicians
- **Service Records** - Compliance documentation with conditions and recommendations
- **Product Applications** - EPA-compliant chemical usage tracking (product name, EPA reg #, dilution rate, amount, device, location)
- **Invoices** - Billing with status tracking
- **Communications** - Email, phone, SMS logging

## Key Features
- Dashboard with KPI stats and upcoming services
- Customer management with multi-location/contact support
- Calendar-based scheduling
- Service history with compliance documentation (products, EPA numbers, etc.)
- Invoice creation and payment tracking
- Communication logging
- Reports and analytics
- Dark/light theme toggle
- Sidebar navigation

## Running
- `npm run dev` starts both frontend (Vite) and backend (Express) on port 5000
- `npm run db:push` syncs database schema
