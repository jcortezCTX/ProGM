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

- [x] Scaffold `web/`: Vite + React + TypeScript
- [x] API client layer with typed responses
- [x] Inventory list view: items with current stock, low-stock indicator when
      below `reorder_threshold`
- [x] Item detail view with transaction history
- [x] Forms: add item, record transaction (in/out/adjustment)
- [x] Basic layout shell with nav placeholders for future modules
- [x] Hardcoded dev user — **no auth yet**

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

**Corrected 2026-08-04** — this is inbound receiving, not outbound distribution.
A vendor truck arrives on site with material against a requisition (an
internal ID for an order sent to a vendor); not everything on a requisition
arrives at once, so requisitions are fulfilled across multiple partial
deliveries over time. Reuses inventory: accepted line items post `received`
transactions, not a separate stock mechanism. Modeled on a real paper form,
`img/deliveryLog.png` (Garney's "Material Inspection & Receiving Report").

- [x] Requisition CRUD (requisition number, supplier, expected line items —
      item + quantity ordered)
- [x] Requisition fulfillment view: quantity received vs. ordered per line,
      derived from delivery line items, never stored
- [x] Delivery (receiving report) CRUD + line items: shipment #, description,
      quantity received, condition, properly marked, disposition
      (accept/conditional_use/reject), plus report-level QC acceptance
      fields and status (open/closed)
- [x] On accepting/conditionally-accepting a line item, write the inventory
      `received` transaction atomically in the same DB transaction as the
      line item insert — a partial write here corrupts stock. Rejected
      items post nothing.
- [x] Delivery list + detail UI, requisition list + detail UI (fulfillment
      progress)

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
- 2026-08-03: added `cors` to the API (permissive, no origin restriction) so
  the Vite dev server can call it cross-origin. Revisit this — tighten to an
  explicit allowlist — once there's a real deployed frontend origin, and
  definitely before Phase 9 (SharePoint embed + deploy prep).
- 2026-08-03: UI visual language (navy header, horizontal tabs, sky-blue
  accent, white cards, stat tiles) is styled to match the company's existing
  GarneyOne intranet, per a reference screenshot at `img/garneyOne.png`. Keep
  new modules visually consistent with this rather than introducing a new
  style per page.
- 2026-08-03: layout shell uses a horizontal tab bar under the header, not a
  sidebar — matches the GarneyOne reference. Future module nav items
  (Deliveries, Drawings, Tasks, Scheduling, Custom Logs) are non-interactive
  placeholders in `web/src/components/Layout.tsx` until those phases build
  real pages.
- 2026-08-03: Phase 3 (Azure AD auth) is deliberately parked — explicit call
  to finish testing the Phase 0-2 slice end-to-end first rather than starting
  auth. Do not start Phase 3 until asked.
- 2026-08-03: end-to-end test pass over Phases 0-2 (db, api, web). Found and
  fixed two error-handling gaps: duplicate SKU on item creation was a bare
  500 (now 409), and a malformed JSON request body hit Express's default HTML
  error page with a stack trace instead of the API's `{ error: string }`
  contract (now a clean 400). Everything else — validation errors, 404s,
  multi-location stock, decimal quantities, `delivered_out` sign handling —
  checked out.
- 2026-08-03: **open question, not yet decided**: `inventory_transactions`
  has no guard against issuing more than what's on hand — confirmed the API
  will happily drive an item's stock negative. Not obviously wrong (could be
  intentional, e.g. to allow backordering and reconcile later via
  `adjustment`), but worth a product decision before Phase 4 (Delivery Log)
  starts writing `delivered_out` transactions automatically.
- 2026-08-04: extended `inventory_items` for the fields shown in
  `img/item.png` (a Sortly-style item detail page): `price`, `notes`,
  `barcode` (unique), `product_link`, and a `custom_fields` JSONB column,
  plus new tables `inventory_custom_field_defs` (admin-configured field
  template shared across all items, mirroring the `log_types.field_schema`
  pattern rather than one column per field) and
  `inventory_tags`/`inventory_item_tags` (many-to-many). `total_value` is
  computed server-side (`quantity_on_hand * price`), never stored — same
  "derived, not stored" rule as stock itself.
- 2026-08-04: deliberately did NOT build the screenshot's "Requisitions
  List" folder/grouping concept or its "Orders" (linked purchase orders,
  open/closed status) submodule — those read as separate features beyond
  "fields on an item." Added a plain `product_link` text field instead of
  the Orders card. Revisit if a real Purchasing module gets scoped later.
- 2026-08-04: `prisma migrate dev` doesn't work in this non-interactive
  environment (it insists on an interactive shadow-DB prompt). Migrations
  from here on are generated via `prisma migrate diff --script`, applied by
  hand with `psql`, then recorded with `prisma migrate resolve --applied` —
  same approach as the Phase 1 baseline. Always verify zero drift afterward
  with another `migrate diff` against the live DB.
- 2026-08-04: spun up a background agent to rework
  `web/src/pages/InventoryDetailPage.tsx` to match `img/item.png`'s layout
  (stat cards, Product Information, Custom Fields, etc.) while keeping the
  GarneyOne-styled app shell and the existing transaction ledger UI intact.
- 2026-08-04: Phase 4 scope decisions, confirmed with the user:
  requisitions get full tracking (real entity + expected line items, so
  fulfillment vs. what was ordered is computable), Contract is explicitly
  NOT a modeled entity for now — this project happens to split into two
  contracts (BRSLS, AWWTF) but that's a one-off case, not something to
  build company-wide structure around; if a specific project needs it,
  extend the custom-fields pattern (like inventory items already have)
  rather than adding a dedicated column/table. QC gets the full receiving
  workflow (per-line condition/properly-marked/disposition, report-level
  acceptance statements, typed accepted-by name — no real e-signature).
- 2026-08-04: Delivery Log backend done — schema, service layer, routes,
  seed (a real receiving report, PO 0673P028/supplier KAT), curl-verified
  including reject-posts-nothing and requisition fulfillment tracking, plus
  integration tests. UI not started. `inventory_transactions` gained an
  optional `delivery_line_item_id` back-reference for audit traceability
  (which delivery caused a given stock movement).
- 2026-08-04: Delivery Log UI done — deliveries list/detail (line items,
  add-line-item form, receiving QC section) and requisitions list/detail
  (fulfillment progress bar). "Deliveries" promoted from a `FUTURE_MODULES`
  placeholder to a real nav tab in `Layout.tsx`; requisitions have no
  top-level nav slot, reached via a link from the deliveries list instead.
  Known gap, not worked around: no endpoint returns "which deliveries
  fulfilled this requisition," so the requisition detail page shows
  fulfillment quantities but not a list of contributing delivery reports —
  would need a reverse-lookup addition to `GET /api/requisitions/:id` if
  wanted.
- 2026-08-04: two dropped-in CSVs at `logs_samples/` (Mechanical Log,
  Drawing Release Log) — reference material for a future custom-log-engine
  or drawing-log phase, not yet acted on.
