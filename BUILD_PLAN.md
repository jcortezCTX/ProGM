# BUILD_PLAN.md — Ops Hub

Work through these phases **in order**. Each phase has a definition of done.
Do not start a phase until the previous one's checks actually pass.

Mark progress by checking boxes in this file as you go, and commit the update
so state survives between sessions.

---

## Phase 0 — Foundation

- [x] Confirm Postgres is running: `cd db && docker compose up -d`
- [x] Verify tables exist (`\dt` via psql) — expect users, tasks, inventory_items,
      inventory_transactions, deliveries, drawings, drawing_revisions,
      log_types, log_entries, attachments, and others
- [x] Set up npm workspaces at repo root for `api` and `web`
- [x] Root `.gitignore` (node_modules, .env, dist, build)
- [x] Initial commit

**Done when**: `docker compose ps` shows postgres healthy and the schema is
queryable.

---

## Phase 1 — Backend + Inventory API

- [x] Scaffold `api/`: TypeScript, Express, Prisma, Zod, tsx for dev
- [x] `.env.example` with `DATABASE_URL` (no real secrets committed)
- [x] `npx prisma db pull` to generate `schema.prisma` from the live database
- [x] Review generated schema — confirm the `inventory_current_stock` view and
      enums came through sensibly; note anything Prisma handled awkwardly
- [x] Set up Prisma Migrate going forward (baseline the existing schema)
- [x] Health check endpoint `GET /api/health`
- [x] Inventory endpoints:
  - `GET /api/inventory/items` (list, with current stock joined in)
  - `POST /api/inventory/items` (create)
  - `GET /api/inventory/items/:id`
  - `POST /api/inventory/transactions` (record in/out movement)
  - `GET /api/inventory/items/:id/transactions` (history)
- [x] Service-layer tests for stock math, including negative deltas and
      multiple locations
- [x] Seed script: a dev user, ~10 inventory items, some transactions

**Done when**: every endpoint above returns a correct real response via curl,
`tsc --noEmit` is clean, and stock math tests pass.

---

## Phase 2 — Inventory UI (first vertical slice)

- [ ] Scaffold `web/`: Vite + React + TypeScript
- [ ] API client layer with typed responses
- [ ] Inventory list view: items with current stock, low-stock indicator when
      below `reorder_threshold`
- [ ] Item detail view with transaction history
- [ ] Forms: add item, record transaction (in/out/adjustment)
- [ ] Basic layout shell with nav placeholders for future modules
- [ ] Hardcoded dev user — **no auth yet**

**Done when**: you can add an item, record movements, and see stock update
correctly in the browser, end to end, against the real API.

**Stop here and check in with me before Phase 3.** This slice proves the whole
architecture; worth a human look before building on it.

---

## Phase 3 — Auth (Azure AD)

Requires tenant details from me — ask before starting.

- [ ] Azure AD app registration values via env vars
- [ ] MSAL on the frontend, **redirect flow** (not popup/silent-iframe — those
      break when the app is later embedded in SharePoint via iframe due to
      third-party cookie restrictions)
- [ ] Backend token validation middleware
- [ ] Auto-provision `users` row on first sign-in from the `oid` claim
- [ ] Replace hardcoded dev user everywhere
- [ ] Role enforcement (admin / manager / member)

**Done when**: a real Microsoft account signs in, gets a `users` row, and
unauthenticated API requests are properly rejected.

---

## Phase 4 — Delivery Log

Reuses inventory. A delivery going out should create `delivered_out`
transactions, not a separate stock mechanism.

- [ ] Delivery CRUD endpoints + line items
- [ ] Status transitions (scheduled → in_transit → delivered/failed)
- [ ] On delivery completion, write inventory transactions atomically in one
      DB transaction — a partial write here corrupts stock
- [ ] Delivery list + detail UI

---

## Phase 5 — Drawing Log

- [ ] Drawing CRUD + revision endpoints (revisions append-only)
- [ ] Revision history UI, clearly showing current vs superseded
- [ ] Status workflow (draft → in_review → approved → superseded)

---

## Phase 6 — Tasks & Scheduling

- [ ] Task CRUD, assignment, comments, status board UI
- [ ] Optional links from tasks to deliveries/drawings
- [ ] Schedule events + attendees, calendar view

---

## Phase 7 — Custom log engine

The payoff module: admins define new log types without a deploy.

- [ ] Log type CRUD, with `field_schema` builder UI
- [ ] Dynamic form renderer driven by `field_schema`
- [ ] Dynamic list/table view per log type
- [ ] Server-side validation of entry `data` against its type's `field_schema`

---

## Phase 8 — SharePoint file attachments

- [ ] Graph API client module (one place, reused by all entity types)
- [ ] Upload to a SharePoint document library, store pointers in `attachments`
- [ ] Attach/view files from inventory, deliveries, drawings, log entries
- [ ] Handle token refresh and Graph API failures gracefully

---

## Phase 9 — Embed in SharePoint + deploy prep

- [ ] Set `Content-Security-Policy: frame-ancestors <tenant>.sharepoint.com`
- [ ] Verify auth redirect flow works while iframed (test in Safari, which is
      strictest on third-party cookies)
- [ ] `postMessage` iframe height resizing
- [ ] Production build config, env var documentation, deploy runbook

---

## Working notes

Append anything future-you needs to know here — decisions made, gotchas found,
things deferred. Keep it short and factual.

- 2026-08-03: `CLAUDE.md`/`BUILD_PLAN.md`/`KICKOFF.md` originally landed under
  `cl/` instead of repo root; moved to root so `CLAUDE.md` auto-loads.
- 2026-08-03: `db/schema.sql` didn't exist yet, so it was designed from
  scratch against the data-model rules in `CLAUDE.md` (not pulled from an
  existing source) — reviewed and approved before Postgres was started.
- 2026-08-03: inventory stock is tracked per (item, location) — the
  `inventory_current_stock` view groups by both — since Phase 1 calls for
  multi-location stock math tests.
- 2026-08-03: Prisma's `views` preview feature introspects the view fine, but
  neither the view nor the `schedule_events` check constraint are managed by
  `prisma migrate` — both were appended by hand to the `0_init` baseline
  migration so the migration history actually matches the live DB. Any future
  change to the view definition needs the same manual treatment.
- 2026-08-03: `POST /api/inventory/transactions` takes a positive `quantity`
  magnitude for `received`/`issued`/`delivered_out` (service derives the sign);
  `adjustment` takes a signed delta directly since it corrects drift either
  direction. Keep this contract in mind when building the Delivery Log
  (Phase 4), which posts `delivered_out` transactions.
