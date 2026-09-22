# Dev Notes

## Known good local setup
- Node 24.21.0 / npm 11 on Windows 11 (Node 22.12+ also works; Node 20 is end-of-life)
- Docker Desktop running
- Repo path: `C:\Dev\PestFlow` (not under OneDrive - see below)

## Startup
- First time on a machine: `docker compose up -d`, then `npm run db:push`, then `npm run dev`
- After that: `npm run dev:full` (= `docker compose up -d && npm run dev`)

## Known issues solved
- Windows requires `cross-env` for NODE_ENV in scripts
- `.env` must be loaded with `import "dotenv/config";`
- OneDrive path caused Vite/EPERM file lock issues
- Postgres container name: `pestflow-db`

## Troubleshooting
### DB seed error: "client password must be a string"
Cause:
- `.env` not loaded or password var missing

Fix:
- ensure `import "dotenv/config";` is first in `server/index.ts`
- verify `.env` exists in project root (copy `.env.example`; do not rename it - it is tracked)

### Boot: every bootstrap logs `relation "customers" does not exist` (and similar)
Cause:
- fresh database - `npm run db:push` was never run, so none of the base tables exist. The
  `server/*-bootstrap.ts` scripts alter and seed tables; they do not create the schema.

Fix:
- `npm run db:reset` (the failed boot left a few tables behind, which would make `db:push` stop on
  an interactive rename prompt), then `npm run db:push`, then `npm run dev`

### Boot: `listen ENOTSUP: operation not supported on socket 0.0.0.0:5000`
Cause:
- `reusePort: true` in `httpServer.listen()`. Windows has no `SO_REUSEPORT`; Node 20 ignored the
  option, Node 22.12+ throws. Removed in the `chore/windows-node-lts-dev-setup` pass - if you see
  this, you are on older server code.

### Boot: `null value in column "org_id" ... violates not-null constraint` from several bootstraps
Cause:
- the database came from `db:push` (every table already has `org_id NOT NULL`) but the boot ran the
  org-unaware seed inserts before `bootstrapTenancy()` set the Heritage default. Fixed in the same
  pass: tenancy now runs once right after `bootstrapOrganizations()` and again in its old slot.