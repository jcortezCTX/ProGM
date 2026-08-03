# CLAUDE.md — Ops Hub

## What this project is

An internal web app replacing a sprawl of Excel files with one tool. Modules:
Inventory Log, Delivery Log, Drawing Log, Task Management, Scheduling, and a
generic custom-log engine for future log types.

It is a **standalone web app**, not a SharePoint SPFx project. Microsoft 365 is
a *connector* (Azure AD for sign-in, Graph API for file storage), never the
foundation. It may later be displayed inside SharePoint via the built-in Embed
web part (an iframe), which requires no SharePoint-specific code.

**Do not** introduce SPFx, `.sppkg` packaging, gulp, or the Yeoman SPFx
generator. Avoiding Microsoft lock-in is an explicit project requirement.

## Stack

- **Database**: Postgres 16 in Docker (`db/docker-compose.yml`), local dev
- **Backend**: Node + TypeScript + Express + Prisma (`api/`)
- **Frontend**: React + TypeScript + Vite (`web/`)
- **Repo**: monorepo, npm workspaces
- **Dev machine**: macOS, Apple Silicon

## Repo layout

```
opshub/
├── db/       Postgres docker-compose + original schema.sql (reference)
├── api/      Backend API
├── web/      Frontend
└── CLAUDE.md
```

## Database rules — important

The canonical schema lives in `db/schema.sql`. Read it before writing any
data-touching code. Key design decisions that must not be "optimized" away:

1. **Inventory stock is derived, never stored.** Current stock comes from the
   `inventory_current_stock` view summing `inventory_transactions`. Do NOT add
   a `quantity_on_hand` column to `inventory_items` — that field inevitably
   drifts out of sync with transaction history. All stock changes are new
   transaction rows.
2. **Drawing revisions are append-only.** Each revision is its own row in
   `drawing_revisions`. Never overwrite or delete a revision.
   `drawings.current_revision` is a convenience pointer only.
3. **Custom logs are schema-less by design.** `log_types.field_schema` (JSONB)
   defines the form; `log_entries.data` (JSONB) holds values. Adding a new log
   type is a runtime UI action, never a migration.
4. **Attachments are polymorphic.** One `attachments` table with
   `entity_type` + `entity_id`. Keep all SharePoint Graph API wiring in one
   module rather than duplicating it per feature.
5. **Users mirror Azure AD.** `users.azure_ad_oid` maps to the `oid` claim.
   Never store passwords — this app does not own credentials.

### Migrations

After the initial `prisma db pull`, **all** schema changes go through Prisma
migrations committed to git. Never hand-edit `db/schema.sql` to change the
live schema — it only auto-applies to a fresh Docker volume and will silently
diverge from reality.

## Conventions

- TypeScript strict mode on, everywhere.
- No `any` unless there is a comment explaining why.
- API routes: REST, plural nouns, `/api/inventory/items`, `/api/deliveries`.
- Validate all request bodies with Zod at the route boundary.
- Errors: return proper HTTP status codes with `{ error: string }` bodies.
  Never swallow an error silently or return 200 on failure.
- Money/quantities: use `NUMERIC` in DB, handle as strings or decimal library
  in JS. Never float arithmetic on quantities.
- Timestamps: always `TIMESTAMPTZ`, always UTC in the DB.
- Keep business logic in service modules, not inside route handlers.

## Verification — do this, don't skip it

You are largely working unsupervised. Assume nothing works until proven.

- After any API change: actually call the endpoint (curl or a test) and show
  the real response. Do not report success based on the code looking correct.
- After any schema/migration change: query the database and confirm the
  structure changed as intended.
- Run `tsc --noEmit` before declaring a task complete.
- If something fails, fix it and re-verify — don't note it as a caveat and
  move on.
- Write tests for service-layer logic, especially inventory stock math.

## Git

- Small, focused commits with clear messages. Commit working increments as you
  go rather than one giant commit at the end.
- Never commit `.env`, credentials, or `node_modules`.
- Never force-push or rewrite history.
- Never run destructive DB commands against anything but the local dev
  database, and say so before you do.

## Stop and ask me when

- A decision would be expensive to reverse later (auth architecture, hosting,
  swapping a core library).
- The schema seems to need a structural change beyond adding a column.
- Requirements are ambiguous — guessing and building the wrong thing costs
  more than asking.
- You're about to add a major dependency not listed in this file.
- Something about the Azure AD / SharePoint tenant setup requires credentials
  or admin access that only I have.

Prefer asking one clear question over building on an assumption.

## Do not

- Add auth before Phase 3 (see BUILD_PLAN.md) — hardcode a dev user until then.
- Build multiple modules in parallel. One vertical slice at a time, finished
  and verified, before starting the next.
- Add features not asked for. If you think something is missing, mention it
  rather than building it.
