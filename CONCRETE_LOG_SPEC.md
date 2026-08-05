# CONCRETE_LOG_SPEC.md — Concrete Log module

Direct user request (like the Mechanical Log — not a numbered BUILD_PLAN phase).
Source material: `logs_samples/AWWTF - Concrete Log (Weekly Report + Trends).xlsx`.
Read that file before building — it is the real, live company log for job
0673 OWP AWWTF. Follow all rules in `CLAUDE.md` (Zod, service layer, NUMERIC
via strings/decimals, TIMESTAMPTZ, migrations via the diff/apply/resolve flow,
verify with curl + `tsc --noEmit`, tests for derived math).

## What the Excel does (and why the web app must restructure it)

The workbook has 11 sheets, but only 6 hold real data. The rest are
formula-driven views. Map as follows:

| Excel sheet | Nature | In the app |
|---|---|---|
| Summary Sheet | Formulas (monthly totals, per-structure est vs actual) | Dashboard — computed, never stored |
| Concrete Pour Summary | Data — Garney self-perform pours + break samples | `concrete_pours` + `concrete_samples` |
| Concrete Pour Summary - Subs | Data — same fields for subcontractor pours | Same tables, `is_subcontractor = true` |
| Weekly Report | Formulas (results entered in a chosen week, pass/fail) | Report page — computed by date range |
| Trends | Formulas/charts (pass rate, fails, margin above design) | Dashboard charts — computed |
| Pump Truck | Data — rental tracker | `pump_truck_rentals` |
| Concrete Credits | Data — credit tracker | `concrete_credits` |
| Mix Designs | Reference data per supplier | `concrete_mix_designs` |
| Instructions / Estimate / Estimate ex | Notes + pasted estimate reference | Not modeled; structures carry est. values |

Two structural fixes over the Excel — these are the point of the exercise:

1. **The two pour sheets merge into one table.** They are the same log; the
   only real differences are a boolean (who performed the work) and that the
   sub sheet lacks invoice columns (nullable anyway). One list + a filter
   replaces maintaining two near-identical sheets.
2. **Samples become child rows, not wide columns.** The Excel reserves 4
   fixed "Sample #N" column groups (7-day AVG, 28-day AVG each) per pour row,
   plus computed averages. In the Subs sheet the workaround is worse: one row
   per sample, duplicating the pour info (e.g. the 5 "Grout Mix Design Test"
   rows on 2026-04-28 are one pour with 5 samples). Model
   `concrete_samples(pour_id, ...)` — unlimited samples, no duplication,
   averages computed.

## Schema (new tables — Prisma migration, established workflow)

All money/quantity columns NUMERIC. All derived values (marked below) are
computed in the service layer or SQL views — never stored (CLAUDE.md rule 1
spirit applies throughout).

### concrete_settings (single row)
- `job_number` text, `job_name` text, `start_date` date,
  `total_est_cy` NUMERIC nullable (Excel: Summary!C4, currently "TBD";
  Pour Summary!E2 says 13006 — seed with 13006).

### concrete_mix_designs
- `supplier` text (e.g. "Garney - CEMEX", "Baker - Quickcrete")
- `concrete_class` text nullable, `mix_type` text nullable
- `mix_number` text — unique together with supplier
- `type_of_work` text nullable
- `design_strength_psi` int nullable, `slump_range` text nullable,
  `air_range` text nullable, `active` boolean default true
- Seed from the Mix Designs sheet. Pours reference mix designs, but the pour
  sheets contain mix #s absent from that sheet (1602011, 1588170,
  P356F0480910…) — the import must upsert those as minimal mix-design rows.

### concrete_structures
- `name` text unique (Warehouse, Temporary, Site-wide, N/A…),
  `est_cy` NUMERIC nullable, `est_cost` NUMERIC nullable
- From Summary Sheet's structure column + Estimate reference. Est. values are
  mostly unpopulated in the workbook; leave nullable, editable in UI.
- Derived per structure: JTD yards, JTD cost, diff vs estimate, est rate
  ($/CY), actual rate — from pours.

### concrete_pours
- `pour_date` date, `location` text (free text, e.g. "Warehouse Posts")
- `structure_id` FK nullable → concrete_structures
- `mix_design_id` FK nullable → concrete_mix_designs
- `design_strength_psi` int — snapshot at time of pour (Excel stores it per
  row; keep it so pass/fail is stable even if a mix design is edited)
- `yds_required`, `yds_delivered`, `yds_installed` NUMERIC nullable
- `is_subcontractor` boolean, `poured_by` text (Garney, Menard, …)
- `invoice_number` text nullable, `invoice_total` NUMERIC nullable
- `notes` text nullable
- Derived, never stored: month bucket; over/under required
  (`installed − required`); waste (`delivered − installed`). Do NOT copy the
  Excel "Yield/Waste" formula `(I−G)/100` — it divides by a hardcoded 100 and
  is simply wrong; compute real differences instead and surface both.

### concrete_samples
- `pour_id` FK → concrete_pours (cascade delete)
- `report_number` text nullable (the "Arehna Report #" — AC13445 etc.)
- `seven_day_psi` NUMERIC nullable, `seven_day_entered_on` date nullable
- `twenty_eight_day_psi` NUMERIC nullable, `twenty_eight_day_entered_on` date nullable
- `notes` text nullable
- Derived: `result` = Pass/Fail = `twenty_eight_day_psi >= pour.design_strength_psi`
  (null until 28-day exists); per-pour sample averages; margin above design.
- "No Samples Taken" pours (Excel rows with 'NA') = a pour with zero samples;
  keep the note on the pour.

### pump_truck_rentals
- `rental_date` date, `location` text,
  `truck_size_requested` text nullable, `truck_size_sent` text nullable,
  `hours` NUMERIC nullable, `invoice_number` text nullable,
  `amount` NUMERIC nullable, `cubic_yards` NUMERIC nullable,
  `date_approved` date nullable, `notes` text nullable
- Derived: `$/CY = amount / cubic_yards`.

### concrete_credits
- `date_received` date, `amount` NUMERIC, `date_approved` date nullable,
  `notes` text nullable

## API (REST, Zod at boundaries, service layer)

- `GET|POST /api/concrete/pours`, `GET|PATCH|DELETE /api/concrete/pours/:id`
  — list supports filters: month, structure, is_subcontractor, poured_by,
  and `pending_results` (see overdue logic below). List response includes
  derived fields and sample counts/averages.
- `GET|POST /api/concrete/pours/:id/samples`,
  `PATCH|DELETE /api/concrete/samples/:id`
- `GET|POST /api/concrete/mix-designs` (+ id routes)
- `GET|POST /api/concrete/structures` (+ id routes)
- `GET|POST /api/concrete/pump-rentals` (+ id routes)
- `GET|POST /api/concrete/credits` (+ id routes)
- `GET /api/concrete/summary` — dashboard payload: total CY placed, % of
  total_est_cy, monthly CY series, per-structure est-vs-actual rows,
  28-day pass/fail counts + pass rate, avg margin above design strength.
- `GET /api/concrete/weekly-report?weekEnding=YYYY-MM-DD` — replaces the
  Weekly Report sheet. Given a week-ending Friday, return: (a) samples whose
  `seven_day_entered_on` falls in that Mon–Fri window (with pour context +
  7-day psi), (b) samples whose `twenty_eight_day_entered_on` falls in the
  window (with psi + Pass/Fail), (c) counts (7-day results, 28-day pass,
  28-day fail). Default weekEnding = upcoming Friday.

**Overdue logic** (Excel had a manual "Report Overdue" cell; make it real):
a pour is "7-day overdue" if it has ≥1 expected sample (i.e. any sample row)
with no `seven_day_psi` and `pour_date` > 10 days ago; "28-day overdue"
likewise at > 35 days. Constants in one place in the service module.

## UI (React, GarneyOne styling, reuse existing patterns)

Add a **Concrete** nav tab with sub-navigation (follow existing Layout.tsx
conventions):

1. **Dashboard** — stat tiles (Total CY Placed, % Complete, 28-Day Pass Rate,
   Fails, Avg Margin Above Design), monthly yards-poured bar chart,
   per-structure est-vs-actual table. This replaces Summary Sheet + Trends.
2. **Pours** — list with customizable columns (reuse `useTableColumns` +
   `ColumnPicker`), filters above the table, overdue badges on rows.
   Pour detail page: pour fields + inline samples table (add/edit sample,
   Pass/Fail chips, averages footer). Create/edit follows the existing
   detail-page-as-form pattern used by the Mechanical Log.
3. **Weekly Report** — Friday picker (default next Friday), the two result
   sections + counts, print-friendly styling, and **Download PDF**.
   The user has explicitly approved adding ONE dependency for server-side
   PDF generation (this satisfies CLAUDE.md's ask-first rule). Preferred
   approach: render the same report as print-styled HTML and generate the
   PDF from it server-side (e.g. playwright-core/puppeteer); pdfkit is an
   acceptable alternative if that proves heavy. Keep it isolated in one
   module.
4. **Pump Truck** — simple list + create/edit, $/CY column computed.
5. **Credits** — simple list + create/edit.
6. **Mix Designs** — reference table grouped by supplier, CRUD.
7. **Structures** — small management view (name, est CY, est cost) so
   dashboard comparisons have data; can live under Concrete settings.

## One-time import (like `importMechanicalLog.ts`)

Script `api/prisma/importConcreteLog.ts` reading the xlsx from
`logs_samples/` (use `xlsx` (SheetJS) or `exceljs` — dev-time script,
already-acceptable tooling class; keep it out of runtime dependencies if
possible):

- **Mix Designs sheet** → `concrete_mix_designs` (two supplier blocks:
  Garney-CEMEX rows 3–9, Baker-Quickcrete rows 12–18; columns are
  transposed — classes across columns).
- **Concrete Pour Summary** (rows 8+, until blank) → pours with
  `is_subcontractor=false`. Sample groups: cols O/P, Q/R, S/T, U/V are
  sample 1–4 (7-day, 28-day); Y/Z are entered-on dates for the averages —
  apply them as the entered-on for each sample. 'NA' / 'No Samples Taken'
  → zero samples. Upsert structures and mix numbers on the fly.
- **Concrete Pour Summary - Subs** (rows 8+) → `is_subcontractor=true`.
  IMPORTANT: this sheet is one-row-per-sample. Group rows by
  (pour_date, location, mix #) into a single pour with N samples
  (report numbers live in the Notes column here, e.g. AC13427–AC13431).
  Sample values in cols M/N, entered-on in W/X.
- **Pump Truck** (rows 4+) and **Concrete Credits** (rows 4+, currently
  empty) → their tables. Skip formula-only placeholder rows.
- Seed `concrete_settings` from Summary Sheet B1/B2 + total est CY 13006.
- After import: query the DB and reconcile counts/total CY against the
  workbook (Pour Summary E3 total) — print a verification summary.

## Build order (one vertical slice; verify each step per CLAUDE.md)

1. Migration + Prisma models → confirm structure in psql.
2. Services + routes + Zod → curl-verify every endpoint.
3. Tests for derived math: pass/fail boundaries (exactly equal = Pass),
   averages with partial samples, weekly-report window edges (Mon/Fri
   inclusive), overdue thresholds, $/CY with null/zero cubic_yards.
4. Import script → run, show reconciliation output.
5. UI pages in the order listed above; Playwright-style browser check like
   prior modules.
6. `tsc --noEmit` clean; commit in small increments.

## Do not

- Do not store any derived value (stock-rule spirit): no totals, averages,
  pass/fail, waste, or $/CY columns.
- Do not build this on the Phase 7 custom-log engine — parent/child rows,
  cross-table aggregates, and a PDF report are beyond schema-less JSONB logs.
- Do not add per-contract (BRSLS/AWWTF) structure — already ruled out on
  2026-08-04; this module is job-scoped via `concrete_settings`.
- Do not replicate the Excel's `(installed − required)/100` yield formula.
- Ask before any dependency beyond the single approved PDF library and a
  dev-time xlsx parser.
