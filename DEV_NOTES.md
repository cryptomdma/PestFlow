# Dev Notes

## Known good local setup
- Node 24.21.0 / npm 11 on Windows 11 (Node 22.12+ also works; Node 20 is end-of-life)
- Docker Desktop running
- Repo path: `C:\Dev\PestFlow` (not under OneDrive - see below)
- `gh` (GitHub CLI) logged in once per machine (`gh auth login`), so a session can open the pass's
  PR at the end (`AGENT_WORKING_AGREEMENT.md`). Unauthenticated, the session hands the owner the PR
  title, body and compare link instead - it cannot run the login flow itself.

## Startup
- First time on a machine: `docker compose up -d`, then `npm run db:push`, then `npm run dev`
- After that: `npm run dev:full` (= `docker compose up -d && npm run dev`)

## Backing up and restoring the local database
Dump from inside the container and copy the file out. Do **not** use
`docker exec pestflow-db pg_dump ... > dump.sql` in PowerShell: 5.1's `>` writes UTF-16LE and
produces a dump `psql` cannot read.

- `docker exec pestflow-db pg_dump -U pestflow -d pestflow -f /tmp/dump.sql`
- `docker cp pestflow-db:/tmp/dump.sql .\pestflow.sql`

Restore into an **empty** database. The dump carries the schema, so this replaces `db:push` - do not
run `db:push` afterwards.

- `npm run db:reset`, then give Postgres a few seconds to accept connections
- `docker cp .\pestflow.sql pestflow-db:/tmp/restore.sql`
- `docker exec pestflow-db psql -U pestflow -d pestflow -v ON_ERROR_STOP=1 -f /tmp/restore.sql`
- `npm run dev` - the bootstraps migrate the restored data the rest of the way

`ON_ERROR_STOP=1` matters: without it a failing statement leaves a half-restored database that still
looks like it worked. Keep dumps out of the repo (`*.sql` is not gitignored) and off OneDrive.

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

### Restore: `psql` fails on the dump's first line, or the file reads `- -   P o s t g r e S Q L`
Cause:
- the dump is UTF-16LE, from PowerShell's `>` or `Out-File` (5.1 defaults to UTF-16 for both).
  `Get-Content dump.sql | docker exec -i ... psql` fails the same way from the other side: PS 5.1
  re-encodes pipeline text bound for a native exe through `$OutputEncoding`, which defaults to ASCII.
  Either way, avoid moving dump bytes through PowerShell - use `docker cp`, as above.

Fix (converting a dump you already have; the LF normalize matters for `COPY` data):
- `$t = [IO.File]::ReadAllText("$PWD\dump.sql", [Text.Encoding]::Unicode)`
- `[IO.File]::WriteAllText("$PWD\dump-utf8.sql", $t.Replace("`r`n", "`n"))`

`[IO.File]` resolves a relative path against .NET's working directory, not the shell's, so pass
`$PWD` explicitly or the file lands somewhere unexpected.