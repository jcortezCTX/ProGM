# SCHEDULE_SPEC.md — Schedule module (6 Week Lookahead)

Direct user request (like the Mechanical and Concrete Logs — not a numbered
BUILD_PLAN phase). Source material:
`logs_samples/Schedule AWWTF 12 Week Look Ahead.xlsx` (sheet "6 Week Sch").
Read it before building — it is the real, live lookahead for job 0673 OWP
AWWTF. On site this is called the **6 Week Lookahead**; despite the filename,
the workbook's day grid actually spans ~13 months (Jan 2026–Feb 2027). The app
stores the full schedule and *views* it 6 weeks at a time.

Follow all rules in `CLAUDE.md` (Zod at boundaries, service layer, NUMERIC via
strings/decimals, TIMESTAMPTZ, migrations via the diff/apply/resolve flow,
verify with curl + `tsc --noEmit`, tests for derived logic). UI follows the
**WorkLoad** theme (`branding/BRANDING.md`, `branding/tokens.css`) — never
hardcode colors, including the Gantt legend colors.

**Schedule Activities are independent of Task Management.** No FK to `tasks`,
no shared UI, no "convert to task" — explicitly out of scope for now. Also
unrelated to the existing `schedule_events` table (that is meetings/calendar);
do not reuse or extend it.

## What the Excel does (and how it maps)

One sheet. Columns A–I are the activity fields; columns J onward are a
day-per-column calendar grid.

| Excel | Nature | In the app |
|---|---|---|
| Col A "Activity ID" | Cost-code reference, free text ("104Ua", "LS1", "2027") | `code` text nullable |
| Col B "Crew" | Crew label ("GS CREW #1") | `crew` text nullable |
| Col C "Work Description" | Activity name; ALL-CAPS rows are section headers | `description`; headers → `schedule_sections` |
| Col D "Notes" | Free text | `notes` |
| Col E "Responsibility" | Company doing the work (Garney or sub name) | `responsibility` text |
| Col F "Budget" | Budgeted man-hours | `budget_mh` NUMERIC nullable |
| Col G "MH Burn Rate" | Planned/burned man-hours | `burned_mh` NUMERIC nullable |
| Col H "Delta" | Formula: F − G | Derived, never stored |
| Col I "Days" | Working-day duration | Derived from schedule (see entry modes) |
| Day grid bars (cell fills) | Which days the activity works | `start/end/duration` + per-day overrides |
| Numbers in day cells | Crew count that day | `schedule_activity_days.crew_count` |
| "X" / "P" / "I" in day cells | Subs or Garney FC on site / Pour / Inspection | `schedule_activity_days.marker` |
| CREW TOTALS row | Sum of crew counts per day | Derived — computed per day, never stored |
| Legend colors | Night Work, Critical Path (red), Holiday (purple), Shutdown (blue), County Holiday (pink) | Activity flags + `schedule_holidays` |
| Weekend shading | Sat/Sun columns greyed | Rendered by the Gantt, driven by dates |

Structural fixes over the Excel — the point of the exercise:

1. **Bars become data, not paint.** In Excel the bar is hand-filled cells; the
   "Days" column drifts from what is actually painted. In the app the
   scheduled days are computed from the activity's dates, and per-day
   exceptions are explicit rows — so duration, the bar, and crew totals can
   never disagree.
2. **Sections become an entity.** ALL-CAPS header rows (PRECON, SITEWORK,
   YARD PIPE, SITE ELECTRICAL, …) become a managed, reorderable list instead
   of a formatting convention.

## Scheduling model — read carefully

Per user decision, an activity is scheduled in one of two **entry modes**
(dropdown on the form), stored in `entry_mode`:

- `start_end` — user enters `start_date` + `end_date`.
- `start_duration` — user enters `start_date` + `duration_days`
  (working days).

Either way the service generates the same thing: the **scheduled day set** =
consecutive working days from `start_date`, where working days **exclude
Saturdays and Sundays** (hard requirement) and dates in `schedule_holidays`.
For `start_end`, the set is every working day in the range; for
`start_duration`, it extends until `duration_days` working days are consumed.

Per-day **overrides** (the Excel's hand-editing, made explicit): a
`schedule_activity_days` row can *exclude* a generated day or *add* a
non-generated day — including a Saturday/Sunday/holiday, deliberately, since
weekend and night work really happens. Auto-generation never lands on a
weekend; only an explicit override can.

Derived, never stored: the resolved day set, first/last scheduled day, working
`days` count (Excel col I), `delta = budget_mh − burned_mh`, and per-day crew
totals.

## Schema (new tables — Prisma migration, established workflow)

### schedule_sections
- `name` text unique, `sort_order` int
- Seed from the workbook's header rows in sheet order.

### schedule_activities
- `section_id` FK → schedule_sections (restrict delete: reassign first)
- `code` text nullable (Excel "Activity ID" — free text, not unique; the
  workbook reuses codes across rows)
- `description` text NOT NULL
- `crew` text nullable, `responsibility` text nullable, `notes` text nullable
- `budget_mh` NUMERIC nullable, `burned_mh` NUMERIC nullable
- `entry_mode` enum `start_end | start_duration`
- `start_date` date nullable, `end_date` date nullable,
  `duration_days` int nullable
  - CHECK: `start_end` ⇒ end_date NOT NULL AND end_date ≥ start_date;
    `start_duration` ⇒ duration_days NOT NULL AND > 0. Unscheduled
    activities (start_date NULL — the Excel's "2027"/"2028" placeholder rows)
    are allowed and simply never appear on the Gantt.
- Flags: `night_work`, `critical_path`, `shutdown` booleans default false
- `sort_order` int (position within its section)
- Timestamps + `created_by` per house style.

### schedule_activity_days
- `activity_id` FK → schedule_activities (cascade delete)
- `day` date — unique together with activity_id
- `kind` enum `add | exclude` — override relative to the generated set
- `crew_count` int nullable, `marker` text nullable (Zod: ≤ 2 chars; UI
  offers P = Pour, I = Inspection, X = Subs/Garney FC, free-typed otherwise —
  the workbook also contains stray "D" and "*")
- A row may exist purely to carry `crew_count`/`marker` on a generated day;
  use `kind = add` on an already-generated day for that (idempotent — adding
  a generated day changes nothing about the day set).

### schedule_holidays
- `day` date unique, `name` text (e.g. "County Holiday")
- Small managed list; excluded from auto-generation, shaded in the Gantt.

## API (REST, Zod at boundaries, service layer)

- `GET|POST /api/schedule/sections`, `PATCH|DELETE /api/schedule/sections/:id`,
  `PUT /api/schedule/sections/order` (array of ids)
- `GET|POST /api/schedule/activities`,
  `GET|PATCH|DELETE /api/schedule/activities/:id`
  — list supports filters: section, responsibility, crew, flags, and
  `scheduled_between=from,to`. Responses include derived fields (resolved
  first/last day, working days, delta).
- `PUT /api/schedule/activities/:id/days` — upsert/remove day overrides
  (array). Validates markers/crew_count; rejects `exclude` for a day not in
  the generated set.
- `GET|POST /api/schedule/holidays`, `DELETE /api/schedule/holidays/:id`
- `GET /api/schedule/gantt?start=YYYY-MM-DD&weeks=6` — the lookahead payload,
  computed server-side so the math is tested once: window days (with
  weekend/holiday flags), sections in order, activities having ≥ 1 resolved
  day in the window, each with its per-day cells (scheduled, crew_count,
  marker) and flags, plus the per-day crew totals row. `start` snaps to the
  Sunday of its week (the workbook's weeks run Sun–Sat); default = current
  week.

## UI (React, WorkLoad theme, reuse existing patterns)

Add a **Schedule** nav tab with two sub-tabs (follow existing Layout.tsx
sub-navigation conventions):

1. **Activities** — list with customizable columns (reuse `useTableColumns` +
   `ColumnPicker`); columns mirror the Excel: Code, Section, Crew,
   Description, Notes, Responsibility, Budget MH, Burned MH, Delta (derived),
   Days (derived), Start, End, flags. Filters above the table. Detail page as
   form (existing detail-page-as-form pattern): entry-mode dropdown toggles
   End Date vs Duration inputs; flags as checkboxes; section dropdown.
   Sections and Holidays get a small management view here (like Concrete's
   Structures/Settings).
2. **6 Week Lookahead** — the Gantt. Defaults to the current week + next 5;
   ◀ ▶ page a week at a time (window stays 6 weeks). Layout mirrors the
   Excel: left frozen columns (Code, Crew, Description, Responsibility,
   Days), then 42 day columns grouped under week headers with day-of-week +
   date, weekends/holidays shaded. Rows grouped by section in order, section
   header rows spanning the grid. CREW TOTALS row pinned at top. Bars render
   from resolved day sets; day cells show crew_count and marker. Activity
   flags tint the bar (tokens, not hex): critical path, night work, shutdown
   — with a legend above the grid, like the Excel's. Clicking a bar cell
   opens a small editor for that day (crew count, marker, add/exclude);
   clicking the row label navigates to the activity detail. Print-friendly
   CSS — this gets pinned to a jobsite trailer wall.

## One-time import (like `importConcreteLog.ts`)

Script `api/prisma/importLookahead.ts` reading the xlsx from `logs_samples/`.
Use **exceljs** (dev-time only): the bars are encoded as *cell fills*, which
SheetJS does not read reliably. Sheet "6 Week Sch":

- Row 6 holds field headers; day-grid dates are in row 8 (col J onward, one
  column per date, Sun–Sat weeks).
- Walk rows 9+: ALL-CAPS col-C rows (no Days value in col I on the row
  pattern of a real activity) → upsert `schedule_sections`; other non-empty
  col-C rows → activities under the current section, mapping cols A–G per the
  table above. Skip blank/`0`-days spacer rows. Rows whose col A/B hold year
  placeholders ("2027", "4/2027", "2028") import as **unscheduled**
  activities (no dates) with the placeholder preserved in `notes`.
- Bar detection: within a row, day cells filled with the solid bar fill
  (theme color, tint 0 — distinguish from the weekend shading tint −0.25)
  are that activity's worked days. Import as `entry_mode = start_end` with
  start/end = first/last bar day, then emit `exclude`/`add` overrides for
  any gaps or weekend days so the resolved set matches the paint exactly.
- Day-cell *values* → overrides: numbers → `crew_count`; short strings
  (X/P/I/D/*) → `marker`.
- Red/purple/pink/blue fills mark critical path, holidays, county holidays,
  and shutdown; import the holiday columns into `schedule_holidays` and set
  activity flags where a row's bar carries the critical/shutdown color.
  Best-effort — log anything ambiguous rather than guessing silently.
- After import: print a reconciliation summary — sections, activity count
  (expect ~150 real activities), and for 5 spot-check rows compare resolved
  day count against Excel col I.

## Build order (one vertical slice; verify each step per CLAUDE.md)

1. Migration + Prisma models → confirm structure in psql.
2. Day-set resolution in the service layer **with tests first** — this is the
   module's core math: both entry modes, weekend skipping, holiday skipping,
   add/exclude overrides, weekend adds, duration counting, month/year
   boundaries.
3. Routes + Zod → curl-verify every endpoint, including gantt window edges
   (activity straddling the window start, snapping to Sunday).
4. Import script → run, show reconciliation output.
5. UI: Activities slice first, then the Gantt; Playwright-style browser check
   like prior modules.
6. `tsc --noEmit` clean; commit in small increments.

## Do not

- Do not store derived values: no `days` column, no delta column, no
  materialized day sets or crew totals.
- Do not link to `tasks` or reuse `schedule_events` — independence is a
  requirement, not an oversight.
- Do not build this on the Phase 7 custom-log engine — per-day child rows,
  window math, and cross-row totals are beyond schema-less JSONB logs.
- Do not let auto-generation schedule Saturdays or Sundays — ever. Weekend
  work exists only as an explicit per-day `add` override.
- Do not add a charting/Gantt library — the grid is a table, like the Excel;
  build it with the existing table patterns. Ask before any dependency other
  than dev-time exceljs.
