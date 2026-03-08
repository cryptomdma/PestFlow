# Dev Notes

## Known good local setup
- Node 20.20.0
- Docker Desktop running
- Repo path: `C:\dev\PestFlow-main`

## Startup
- `docker compose up -d`
- `npm run dev`

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
- verify `.env` exists in project root