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