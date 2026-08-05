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

- [x] Drawing CRUD + revision endpoints (revisions append-only)
- [x] Revision history UI, clearly showing current vs superseded
- [x] Status workflow (draft → in_review → approved → superseded)

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
- 2026-08-04: built the Mechanical Log module (not a formally numbered phase
  above — direct user request). `mechanical_log_items` is a dedicated typed
  table (33 columns, one per CSV column) rather than routed through
  `inventory_items` or the not-yet-built custom-log engine (Phase 7) —
  release/PO/pricing/delivery-tracking fields go well beyond either. Every
  field is nullable: the real export itself is sparse (129 of 565 rows have
  no tag number at all). Deliberately NOT wired into
  `inventory_transactions` — unlike the Delivery Log, this tracks contract
  release/receiving/invoicing, not warehouse stock; revisit if that turns
  out to be wrong. Imported the real CSV (`api/prisma/importMechanicalLog.ts`,
  552 rows after dropping 13 fully-blank ones) as the initial dataset rather
  than inventing demo data, since the file is the actual company log.
  Backend curl-verified (CRUD + 404/400 paths); CSV parsing (money incl.
  `$(1,789.06)`-style negatives, M/D/YY and M/D/YYYY dates, Windows-1252
  encoding for curly quotes) spot-checked against the DB. New-entry UI
  reuses the Sortly-style item-detail-page template
  (`InventoryDetailPage.tsx`) directly — same page handles create (`/new`)
  and edit — per explicit request that entry should "look like the item
  detail page."
- 2026-08-04: added customizable table columns (`useTableColumns` hook +
  `ColumnPicker` component, `web/src/hooks/` and `web/src/components/`) to
  Inventory, Deliveries, Requisitions, and the new Mechanical Log list
  pages — visible columns persist per-table in localStorage. Also removed
  `.app-main`'s `max-width: 1100px` so list-page tables use the full
  viewport width, per direct request. Verified with a real headless-browser
  pass (Playwright, installed locally for this session only — not added to
  package.json) against a running dev server: screenshotted all four list
  pages, the columns picker open/toggling, and a full create round-trip on
  the Mechanical Log ending on the persisted entry; zero console errors.
- 2026-08-04: user asked for a login page + admin permissions UI. Flagged the
  conflict with CLAUDE.md (Phase 3 is Azure AD and requires tenant details +
  explicit go-ahead; DB rule #5 says never store passwords) and asked before
  building anything. Decisions confirmed by the user, then built the same
  day (in parallel with another session's Drawing Log work, in a separate
  worktree — see below): temporary local username/password login (knowingly
  relaxes DB rule #5 until Phase 3 replaces it with MSAL/Azure AD), 3 fixed
  roles (admin/manager/member, no per-page/per-CRUD matrix, no schema
  pre-built for Inventory Task or Scheduling). Delivered:
  - `password_hash` (nullable) on `users`, new `sessions` table — the row id
    doubles as an opaque bearer token; revocable by design (delete the row),
    deliberately not a stateless JWT. Hashing uses Node's built-in
    `crypto.scrypt`, no new dependency.
  - `requireAuth` now guards every existing API route except `/api/health`
    and `/api/auth/*`; `/api/users` (admin-only) supports listing users,
    creating one, and changing a user's role.
  - Frontend: `/login` page, `AuthContext` (token in localStorage, listens
    for a global 401 event to bounce back to `/login`), route guards on
    every module route, `/admin/users` UI (list + inline role dropdown +
    create-user form), real signed-in user + logout in the header.
  - Dev credentials seeded for local testing: `dev@opshub.local` /
    `devpassword123` (admin), `member@opshub.local` / `memberpassword123`
    (member) — not real secrets, local dev only.
  - Full flow curl- and browser-verified (Playwright): login success/
    failure, route protection, admin-only enforcement, role changes,
    logout invalidating the token, and a member user losing the Admin nav
    link and being redirected away from `/admin/users`.
  - Gotcha: while working in a worktree, generated a `prisma migrate diff`
    against the live shared dev DB and it included an unrelated
    `DROP COLUMN` on `attachments` (`content_type`/`size_bytes`/
    `storage_key`) that the concurrent Drawing Log session had already
    added directly to the live DB but not yet reflected in this worktree's
    `schema.prisma`. Hand-trimmed the migration to only the auth-related
    changes before applying — since Postgres is one shared instance across
    worktrees (not git-isolated like the code), always diff carefully and
    re-check what a generated migration script actually contains before
    running it. Also: a cleanup `pkill -f vite` after finishing killed a
    *different* session's Vite dev server on port 5173 (own server had
    landed on 5174 since 5173 was taken) — prefer killing dev servers by
    PID, not by broad process-name match, when other sessions may be
    running concurrently.
- 2026-08-04: **found while starting Phase 5**: the live dev DB already has a
  `sessions` table and `users.password_hash` column that aren't in any
  branch's `schema.prisma` yet — i.e. someone/some session already applied
  DB changes for the login work described above, ahead of the "queued for
  after Phase 5" plan and without a matching Prisma migration in git. Left
  entirely alone (did not touch, did not drop, did not model in
  `schema.prisma`) — generated the Drawing Log migration by hand rather than
  from a full `prisma migrate diff`, specifically because that diff wanted to
  drop both. Whoever picks up the login work should reconcile this (pull the
  real column/table into a proper migration) before it drifts further.
- 2026-08-04: Phase 5 (Drawing Log) done - backend (CRUD + append-only
  `POST /:id/revisions`, current_revision_id updated atomically with the
  revision insert), list + detail UI, curl- and browser-verified. Extended
  `drawings` with `discipline`/`drawing_type`/`area` and `drawing_revisions`
  with `external_link` (a per-revision link to wherever the file actually
  lives - Google Drive/Wasabi/etc - since revisions are append-only, each
  revision gets its own link rather than one mutable link on `drawings`).
  Deliberately did NOT mirror `logs_samples/Drawing Release Log.csv` column
  for column the way the Mechanical Log did - that CSV is very sparse
  (~65 of 262 rows have most fields at all, revision/status columns are
  <3% populated) and several columns (Project/Sub-Project) map onto the
  BRSLS/AWWTF contract split already ruled out as dedicated schema. Also
  built a non-image-specific `FileAttachments` component (filename/size list,
  not a thumbnail grid) reusing the same `/api/attachments` backend as the
  inventory photo uploader, and widened its accepted mime types to include
  `application/pdf`; attached per-revision, not per-drawing, for the same
  append-only reasoning as the link field. Revision content itself
  (code/notes/link) is not editable after creation, but attachments on a
  revision can still be added/removed freely - that's supplementary, not the
  append-only record itself.
- 2026-08-05: **note for the Drawing Log session**: the login/permissions work
  (the `sessions` table / `users.password_hash` flagged above) is done and
  merged into local `main`, on top of Phase 5 — merge commit `abc7e0a`,
  resolved conflicts in this file, `App.tsx`, `index.ts`/`attachments.ts`/
  `schema.prisma` (`/api/attachments` is now gated per-route: GET/POST/DELETE
  require sign-in, `:id/file` stays open since it's loaded via `<img src>`).
  Pushed to `origin/main`. If your worktree is still behind, `git pull`
  before continuing — your branch's `schema.prisma`/`index.ts` will conflict
  with what's already on `main` otherwise. Full details a few entries up.
- 2026-08-05: the 2026-08-03 UI visual-language note above (navy header,
  sky-blue accent, GarneyOne intranet reference) is superseded — the app was
  restyled to the **WorkLoad** theme per `branding/BRANDING.md` and
  `branding/UI-MIGRATION.md` (white header/sidebar, green `--primary` accent,
  large-radius soft-shadow cards). New UI work should follow `BRANDING.md`,
  not the old GarneyOne reference screenshot.
