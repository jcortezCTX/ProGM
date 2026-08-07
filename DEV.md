# Running Ops Hub locally

## TL;DR

```bash
./scripts/dev.sh up        # start everything, then open http://localhost:5173
./scripts/dev.sh status    # is it running?
./scripts/dev.sh doctor    # something's broken — start here
./scripts/dev.sh down      # stop
```

Sign in with `superadmin@opshub.local` / `opshub123!`.

## The three pieces

| Piece | Port | Started by | Notes |
|---|---|---|---|
| Postgres 16 + PostGIS | 5432 | `docker compose -f db/docker-compose.yml up -d` | container `opshub-postgres`, persists in a Docker volume |
| API (Express + Prisma) | 3333 | `npm run dev -w api` | port comes from `api/.env` |
| Web (React + Vite) | 5173 | `npm run dev -w web` | talks to the API via `VITE_API_URL` in `web/.env` |

`dev.sh up` does all three in order, waits for each to actually answer, and
fails loudly with the relevant log tail if one doesn't.

## Commands

| Command | What it does |
|---|---|
| `up` | Start db → check migrations → install deps if needed → start api + web → health-check |
| `down` | Stop api + web (leaves Postgres up, it's cheap) |
| `down --all` | Also kill stray api/web processes from **other worktrees** — see below |
| `restart` | `down` then `up` |
| `status` | What's running, on what port, healthy or not, plus stray processes |
| `logs` | Tail api + web logs together |
| `doctor` | Full diagnostic: env, config, deps, schema drift, and an authenticated smoke test of every module's endpoint |
| `seed` | Re-run the Prisma seed (restores the dev users) |
| `db` | `psql` shell into the dev database |

Logs go to `.dev/logs/`, pidfiles to `.dev/pids/`. Both gitignored.

## Dev accounts

Seeded by `api/prisma/seed.ts`. Local only — these are seed data, not secrets.

| Email | Password | Role |
|---|---|---|
| `superadmin@opshub.local` | `opshub123!` | admin |
| `dev@opshub.local` | `devpassword123` | admin |
| `member@opshub.local` | `memberpassword123` | member |

Login is `POST /api/auth/login` with an **`email`** field (not `username`), and
returns a token you pass as `Authorization: Bearer <token>`.

## The two failure modes that actually bite

### 1. Stray dev servers from other worktrees

Every worktree under `.claude/worktrees/` has its own `node_modules` and can run
its own api/web. They all bind the same ports and all talk to the **same**
Postgres container. A server left running from last week will happily hold port
3333, and you'll be testing code you didn't think you were running.

`./scripts/dev.sh status` lists them. `./scripts/dev.sh down --all` kills them.

### 2. Migration drift — the shared dev database

There is one dev database shared by every worktree. If a branch runs
`prisma migrate deploy`, the **database** moves forward while whatever checkout
you're sitting in does not. Then the API queries a table or column that no
longer matches and you get a 500 with a Prisma `P2021` (table missing) or
`P2022` (column missing).

`./scripts/dev.sh doctor` diffs `_prisma_migrations` in the database against
`api/prisma/migrations/` in your checkout and names the offending migrations in
both directions:

- **database AHEAD** — another branch migrated the shared DB. Check out or merge
  that branch, or reset the DB.
- **checkout ahead** — you have migrations that haven't been applied. Run
  `npx prisma migrate deploy --schema api/prisma/schema.prisma`.

Nuclear option, local dev data only, prompts for confirmation:

```bash
./scripts/dev.sh doctor --reset-db
```

## Doing it by hand

If you'd rather not use the script:

```bash
# 1. database
docker compose -f db/docker-compose.yml up -d
docker exec opshub-postgres pg_isready -U opshub -d opshub

# 2. migrations (only if status says you're behind)
npx prisma migrate status --schema api/prisma/schema.prisma
npx prisma migrate deploy --schema api/prisma/schema.prisma

# 3. servers, in two terminals
npm run dev -w api
npm run dev -w web

# 4. check it
curl localhost:3333/api/health
open http://localhost:5173
```

Quick authenticated poke at the API:

```bash
TOKEN=$(curl -s -X POST localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@opshub.local","password":"opshub123!"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -s -H "Authorization: Bearer $TOKEN" localhost:3333/api/inventory/items
```

## Before you commit

```bash
npm run typecheck -w api
npm run test -w api
npm run build -w web
```
