import { PDF_FONT_STACK, PDF_THEME_TOKENS } from "./pdfTheme.js";

// Builds the printable 6 Week Lookahead sheet as a self-contained HTML
// document for `pdfRenderer`. Kept pure and free of Chromium so the markup can
// be unit-tested directly.
//
// The layout deliberately mirrors `web/src/pages/ScheduleGanttPage.tsx` and the
// `.gantt-*` rules in `web/src/index.css` — same frozen columns, same section
// grouping, same CREW TOTALS row, same flag tints — because the sheet's whole
// purpose is to be the on-screen lookahead on paper. Screen-only affordances
// (sticky positioning, scroll container, hover outlines, cell-editor links)
// are dropped: they mean nothing on a printed page.

export interface LookaheadDay {
  date: string;
  day_of_week: string;
  is_weekend: boolean;
  holiday_name: string | null;
}

export interface LookaheadCell {
  date: string;
  scheduled: boolean;
  crew_count: number | null;
  marker: string | null;
}

export interface LookaheadActivity {
  id: string;
  code: string | null;
  crew: string | null;
  description: string;
  responsibility: string | null;
  night_work: boolean;
  critical_path: boolean;
  shutdown: boolean;
  cells: LookaheadCell[];
}

export interface LookaheadSection {
  id: string;
  name: string;
  activities: LookaheadActivity[];
}

export interface LookaheadSheetData {
  window: { start: string; weeks: number; days: LookaheadDay[] };
  sections: LookaheadSection[];
  crew_totals: { date: string; total: number }[];
  /** Activity id → resolved working-day count (Excel col I). Derived, never stored. */
  days_by_activity: Map<string, number>;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Every value below reaches the page as markup, and activity descriptions,
// crew labels, markers and section names are all free text typed by users.
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function formatLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Weekend/holiday shading, shared by the day headers, totals row and body cells. */
function dayShadeClass(day: LookaheadDay): string {
  if (day.holiday_name) return " holiday";
  if (day.is_weekend) return " weekend";
  return "";
}

function cellClass(cell: LookaheadCell, activity: LookaheadActivity, day: LookaheadDay): string {
  const classes = ["c"];
  if (day.holiday_name) classes.push("holiday");
  else if (day.is_weekend) classes.push("weekend");
  if (cell.scheduled) {
    classes.push("sched");
    // Same precedence as the screen: later rules win in the stylesheet, so
    // critical < shutdown < night matches `.gantt-cell` ordering in index.css.
    if (activity.critical_path) classes.push("f-critical");
    if (activity.shutdown) classes.push("f-shutdown");
    if (activity.night_work) classes.push("f-night");
  }
  return classes.join(" ");
}

const FROZEN_COLS: { label: string; width: string }[] = [
  { label: "Code", width: "0.55in" },
  { label: "Crew", width: "0.80in" },
  { label: "Description", width: "2.00in" },
  { label: "Responsibility", width: "0.95in" },
  { label: "Days", width: "0.35in" },
];

function styles(): string {
  return `
${PDF_THEME_TOKENS}

/* Size only — the margins come from the renderer's margin option. Setting
   them here too would win over it and let the table run underneath the
   footer template, which Chromium draws inside the bottom margin box. */
@page {
  size: tabloid landscape;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ${PDF_FONT_STACK};
  color: var(--text);
  background: var(--card-bg);
  /* Bar fills and weekend shading carry the meaning of the grid; without
     this Chromium prints an all-white table. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.sheet-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5in;
  margin-bottom: 6pt;
}

.sheet-title {
  font-size: 15pt;
  font-weight: 700;
  color: var(--title);
  margin: 0;
}

.sheet-subtitle {
  font-size: 8.5pt;
  color: var(--text-muted);
  margin: 2pt 0 0;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10pt;
  font-size: 7pt;
  color: var(--text);
}

.legend-item { display: flex; align-items: center; gap: 3pt; white-space: nowrap; }

.legend-swatch {
  display: inline-block;
  width: 8pt;
  height: 8pt;
  border: 1px solid var(--border);
  border-radius: 2px;
}

table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  font-size: 6.5pt;
}

th, td {
  border: 0.5px solid var(--border);
  padding: 1pt 2pt;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
}

/* Repeats the week + day header bands on every printed page. */
thead { display: table-header-group; }
tr { break-inside: avoid; }

thead th {
  background: var(--page-bg);
  color: var(--text-muted);
  font-size: 6.5pt;
  font-weight: 700;
}

.frozen-header {
  text-transform: uppercase;
  letter-spacing: 0.02em;
  font-size: 6pt;
  vertical-align: middle;
}

.week-header {
  font-size: 7pt;
  color: var(--title);
}

.dow { font-weight: 700; }
.date { font-weight: 400; }
.holiday-name {
  font-size: 5pt;
  color: var(--warning);
  white-space: normal;
  line-height: 1.05;
}

.frozen {
  text-align: left;
  font-size: 6.5pt;
  color: var(--text);
}

/* Only the description is allowed to wrap — everything else stays on one
   line so the 42 day columns keep their width. */
.desc { white-space: normal; line-height: 1.15; }

.totals-row td {
  font-weight: 700;
  background: var(--rgba-primary-1);
}

.total-cell { color: var(--primary); }

.section-row td {
  text-align: left;
  font-weight: 700;
  background: var(--page-bg);
  color: var(--title);
  padding: 2pt 4pt;
  font-size: 7pt;
}

/* A section title stranded at the foot of a page is useless; keep it with
   the first activity under it. */
.section-row { break-after: avoid; }

.weekend { background: var(--rgba-neutral-1); }
.holiday { background: var(--rgba-warning-1); }

.c.sched { background: var(--rgba-primary-2); }
.c.sched.f-critical { background: var(--rgba-danger-2); }
.c.sched.f-shutdown { background: var(--rgba-secondary-2); }
.c.sched.f-night { background: var(--rgba-info-2); }

.cell-content { font-weight: 700; color: var(--title); }

.empty-note {
  margin-top: 12pt;
  font-size: 9pt;
  color: var(--text-muted);
}
`.trim();
}

function legendHtml(): string {
  const items: [string, string][] = [
    ["c sched f-critical", "Critical path"],
    ["c sched f-night", "Night work"],
    ["c sched f-shutdown", "Shutdown"],
    ["c sched", "Scheduled"],
    ["weekend", "Weekend"],
    ["holiday", "Holiday"],
  ];
  const spans = items
    .map(([cls, label]) => `<span class="legend-item"><span class="legend-swatch ${cls}"></span>${esc(label)}</span>`)
    .join("");
  return `<div class="legend">${spans}</div>`;
}

function headHtml(days: LookaheadDay[], weeks: LookaheadDay[][]): string {
  const frozenHeaders = FROZEN_COLS.map(
    (col) => `<th rowspan="2" class="frozen-header" style="width:${col.width}">${esc(col.label)}</th>`,
  ).join("");
  const weekHeaders = weeks
    .map((week) => `<th colspan="${week.length}" class="week-header">Week of ${esc(formatShort(week[0].date))}</th>`)
    .join("");
  const dayHeaders = days
    .map(
      (day) =>
        `<th class="day-header${dayShadeClass(day)}">` +
        `<div class="dow">${esc(day.day_of_week)}</div>` +
        `<div class="date">${esc(formatShort(day.date))}</div>` +
        (day.holiday_name ? `<div class="holiday-name">${esc(day.holiday_name)}</div>` : "") +
        `</th>`,
    )
    .join("");
  return `<thead><tr>${frozenHeaders}${weekHeaders}</tr><tr>${dayHeaders}</tr></thead>`;
}

function totalsRowHtml(data: LookaheadSheetData): string {
  // Spans the frozen block: "CREW TOTALS" does not fit the 0.55in Code column
  // and would be clipped by the fixed table layout.
  const frozen = `<td class="frozen" colspan="${FROZEN_COLS.length}">CREW TOTALS</td>`;
  const totals = data.crew_totals
    .map((t, idx) => {
      const day = data.window.days[idx];
      const shade = day ? dayShadeClass(day) : "";
      return `<td class="total-cell${shade}">${t.total > 0 ? esc(t.total) : ""}</td>`;
    })
    .join("");
  return `<tr class="totals-row">${frozen}${totals}</tr>`;
}

function activityRowHtml(activity: LookaheadActivity, data: LookaheadSheetData): string {
  const days = data.days_by_activity.get(activity.id);
  const frozen =
    `<td class="frozen">${esc(activity.code) || "—"}</td>` +
    `<td class="frozen">${esc(activity.crew) || "—"}</td>` +
    `<td class="frozen desc">${esc(activity.description)}</td>` +
    `<td class="frozen">${esc(activity.responsibility) || "—"}</td>` +
    `<td class="frozen">${days === undefined ? "—" : esc(days)}</td>`;

  const cells = activity.cells
    .map((cell, idx) => {
      const day = data.window.days[idx];
      if (!day) return "";
      const content = cell.scheduled
        ? `<span class="cell-content">${esc(cell.crew_count ?? "")}${cell.marker ? ` ${esc(cell.marker)}` : ""}</span>`
        : "";
      return `<td class="${cellClass(cell, activity, day)}">${content}</td>`;
    })
    .join("");

  return `<tr>${frozen}${cells}</tr>`;
}

export interface LookaheadSheetMeta {
  /** Rendered under the title, e.g. "Job 0673 — OWP AWWTF". Optional. */
  jobLabel?: string | null;
  /** Timestamp shown in the footer. Injectable so tests are deterministic. */
  generatedAt?: Date;
}

export function buildLookaheadFooterTemplate(meta: LookaheadSheetMeta = {}): string {
  const generated = (meta.generatedAt ?? new Date()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  // Chromium renders header/footer templates in an isolated document that
  // inherits none of the page styles, so everything here is inline.
  return (
    `<div style="width:100%;margin:0 0.35in;font-size:7pt;color:#89879f;` +
    `display:flex;justify-content:space-between;">` +
    `<span>Generated ${esc(generated)}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>`
  );
}

export function buildLookaheadHtml(data: LookaheadSheetData, meta: LookaheadSheetMeta = {}): string {
  const { days } = data.window;
  const weeks: LookaheadDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const windowEnd = days.length > 0 ? days[days.length - 1].date : addDaysIso(data.window.start, data.window.weeks * 7 - 1);
  const totalCols = FROZEN_COLS.length + days.length;

  const sectionsHtml = data.sections
    .filter((section) => section.activities.length > 0)
    .map(
      (section) =>
        `<tr class="section-row"><td colspan="${totalCols}">${esc(section.name)}</td></tr>` +
        section.activities.map((activity) => activityRowHtml(activity, data)).join(""),
    )
    .join("");

  const hasActivities = sectionsHtml.length > 0;
  const body = hasActivities
    ? `<table>${headHtml(days, weeks)}<tbody>${totalsRowHtml(data)}${sectionsHtml}</tbody></table>`
    : `<table>${headHtml(days, weeks)}<tbody>${totalsRowHtml(data)}</tbody></table>` +
      `<p class="empty-note">No activities are scheduled in this window.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(`${data.window.weeks} Week Lookahead — ${formatLong(data.window.start)}`)}</title>
<style>${styles()}</style>
</head>
<body>
<div class="sheet-header">
  <div>
    <h1 class="sheet-title">${esc(data.window.weeks)} Week Lookahead</h1>
    <p class="sheet-subtitle">${esc(formatLong(data.window.start))} – ${esc(formatLong(windowEnd))}${
      meta.jobLabel ? ` &nbsp;·&nbsp; ${esc(meta.jobLabel)}` : ""
    }</p>
  </div>
  ${legendHtml()}
</div>
${body}
</body>
</html>`;
}
