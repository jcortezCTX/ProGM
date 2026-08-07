import { baseSheetCss, esc } from "./pdfLayout.js";

// The Concrete Log's weekly report as a self-contained HTML document for
// `pdfRenderer`. Replaces the previous pdfkit implementation so all PDF output
// in the app goes through one pipeline and picks up the WorkLoad tokens (the
// pdfkit version hardcoded #555/#000, which CLAUDE.md forbids).
//
// This is a rendering change, not a redesign: the same three sections in the
// same order carrying the same fields as before. What changed is that the rows
// are a real table with a repeating header instead of one long text line each.
//
// Kept pure and free of Chromium so the markup can be unit-tested directly.

/** Prisma Decimal, or whatever a caller hands over for a NUMERIC column. */
type Decimalish = { toString(): string } | string | number | null | undefined;

export interface WeeklyReportSample {
  report_number: string | null;
  seven_day_psi: Decimalish;
  twenty_eight_day_psi?: Decimalish;
  result?: string | null;
  pour: { pour_date: Date | string; location: string; design_strength_psi: number };
}

export interface WeeklyReportData {
  week_start: string;
  week_ending: string;
  seven_day_results: WeeklyReportSample[];
  twenty_eight_day_results: WeeklyReportSample[];
  counts: { seven_day_results: number; twenty_eight_day_pass: number; twenty_eight_day_fail: number };
}

export interface WeeklyReportJob {
  job_number: string;
  job_name: string;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: "UTC" });
}

function fmtLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** NUMERIC columns arrive as strings/Decimal; never coerce them through a float. */
function fmtNumber(v: Decimalish): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function resultBadge(result: string | null | undefined): string {
  if (!result) return "—";
  const normalized = result.toLowerCase();
  const cls = normalized === "pass" ? "badge pass" : normalized === "fail" ? "badge fail" : "badge";
  return `<span class="${cls}">${esc(result.toUpperCase())}</span>`;
}

function styles(): string {
  return `
${baseSheetCss()}

@page {
  size: letter portrait;
}

.sheet-title {
  font-size: 17pt;
  font-weight: 700;
  color: var(--title);
}

.sheet-subtitle {
  font-size: 9pt;
  color: var(--text-muted);
  margin-top: 2pt;
}

.section-heading {
  font-size: 11pt;
  font-weight: 700;
  color: var(--title);
  margin: 16pt 0 5pt;
  /* A heading stranded at the foot of a page is useless. */
  break-after: avoid;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 8.5pt;
}

th, td {
  border-bottom: 0.5px solid var(--border);
  padding: 3pt 4pt;
  text-align: left;
  vertical-align: top;
}

thead th {
  background: var(--page-bg);
  color: var(--text-muted);
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--border);
}

.num { text-align: right; white-space: nowrap; }
.nowrap { white-space: nowrap; }

.badge {
  display: inline-block;
  padding: 1pt 5pt;
  border-radius: var(--radius-sm);
  font-size: 7pt;
  font-weight: 700;
}

.badge.pass { background: var(--rgba-success-1); color: var(--success); }
.badge.fail { background: var(--rgba-danger-1); color: var(--danger); }

.counts {
  display: flex;
  gap: 10pt;
  margin-top: 6pt;
}

.count-tile {
  border: 0.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6pt 10pt;
  min-width: 90pt;
}

.count-value {
  font-size: 15pt;
  font-weight: 700;
  color: var(--title);
}

.count-label {
  font-size: 7pt;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.empty-note {
  font-size: 9pt;
  color: var(--text-muted);
}
`.trim();
}

function sevenDayTable(rows: WeeklyReportSample[]): string {
  if (rows.length === 0) return `<p class="empty-note">No 7-day results entered this week.</p>`;
  const body = rows
    .map(
      (r) =>
        `<tr>` +
        `<td class="nowrap">${esc(fmtDate(r.pour.pour_date))}</td>` +
        `<td>${esc(r.pour.location)}</td>` +
        `<td class="nowrap">${esc(r.report_number) || "—"}</td>` +
        `<td class="num">${esc(fmtNumber(r.seven_day_psi))}</td>` +
        `</tr>`,
    )
    .join("");
  return `<table><thead><tr>
<th>Pour Date</th><th>Location</th><th>Report #</th><th class="num">7-Day PSI</th>
</tr></thead><tbody>${body}</tbody></table>`;
}

function twentyEightDayTable(rows: WeeklyReportSample[]): string {
  if (rows.length === 0) return `<p class="empty-note">No 28-day results entered this week.</p>`;
  const body = rows
    .map(
      (r) =>
        `<tr>` +
        `<td class="nowrap">${esc(fmtDate(r.pour.pour_date))}</td>` +
        `<td>${esc(r.pour.location)}</td>` +
        `<td class="nowrap">${esc(r.report_number) || "—"}</td>` +
        `<td class="num">${esc(fmtNumber(r.twenty_eight_day_psi ?? null))}</td>` +
        `<td class="num">${esc(r.pour.design_strength_psi)}</td>` +
        `<td>${resultBadge(r.result)}</td>` +
        `</tr>`,
    )
    .join("");
  return `<table><thead><tr>
<th>Pour Date</th><th>Location</th><th>Report #</th>
<th class="num">28-Day PSI</th><th class="num">Design PSI</th><th>Result</th>
</tr></thead><tbody>${body}</tbody></table>`;
}

function countsBlock(counts: WeeklyReportData["counts"]): string {
  const tiles: [number, string][] = [
    [counts.seven_day_results, "7-day results"],
    [counts.twenty_eight_day_pass, "28-day pass"],
    [counts.twenty_eight_day_fail, "28-day fail"],
  ];
  const html = tiles
    .map(
      ([value, label]) =>
        `<div class="count-tile"><div class="count-value">${esc(value)}</div>` +
        `<div class="count-label">${esc(label)}</div></div>`,
    )
    .join("");
  return `<div class="counts">${html}</div>`;
}

export function buildWeeklyReportHtml(report: WeeklyReportData, job: WeeklyReportJob | null): string {
  const subtitle =
    (job ? `Job ${esc(job.job_number)} — ${esc(job.job_name)} &nbsp;·&nbsp; ` : "") +
    `Week of ${esc(fmtLongDate(report.week_start))} – ${esc(fmtLongDate(report.week_ending))}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(`Concrete Weekly Report — ${report.week_ending}`)}</title>
<style>${styles()}</style>
</head>
<body>
<h1 class="sheet-title">Concrete Weekly Report</h1>
<p class="sheet-subtitle">${subtitle}</p>

<h2 class="section-heading">7-Day Results</h2>
${sevenDayTable(report.seven_day_results)}

<h2 class="section-heading">28-Day Results</h2>
${twentyEightDayTable(report.twenty_eight_day_results)}

<h2 class="section-heading">Counts</h2>
${countsBlock(report.counts)}
</body>
</html>`;
}
