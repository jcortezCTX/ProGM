import { PDF_FONT_STACK, PDF_THEME_TOKENS } from "./pdfTheme.js";

// Page chrome shared by every server-rendered PDF sheet: escaping, the base
// stylesheet (brand tokens + print-safe resets) and the footer template.
// Kept separate from any one sheet so a second sheet cannot quietly drift into
// its own font stack, margin story or escaping helper.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes a value for interpolation into markup. Every sheet renders
 * user-typed free text (activity descriptions, pour locations, report
 * numbers), so this is not optional.
 */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Brand tokens plus the resets every printed sheet needs. Sheets append their
 * own rules after this and must reference colors via var(), never literals.
 */
export function baseSheetCss(): string {
  return `
${PDF_THEME_TOKENS}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ${PDF_FONT_STACK};
  color: var(--text);
  background: var(--card-bg);
  /* Background fills carry meaning on these sheets (Gantt bars, pass/fail
     badges); Chromium drops them when printing unless told otherwise. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Repeats a table's header band on every page it spans. */
thead { display: table-header-group; }
tr { break-inside: avoid; }

h1, h2, p { margin: 0; }
`.trim();
}

export interface SheetFooterMeta {
  /** Timestamp shown in the footer. Injectable so tests are deterministic. */
  generatedAt?: Date;
}

/**
 * Chromium renders header/footer templates as an isolated document that
 * inherits none of the page's styles, so everything here has to be inline.
 */
export function buildFooterTemplate(meta: SheetFooterMeta = {}): string {
  const generated = (meta.generatedAt ?? new Date()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    `<div style="width:100%;margin:0 0.35in;font-size:7pt;color:#89879f;` +
    `display:flex;justify-content:space-between;">` +
    `<span>Generated ${esc(generated)}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>`
  );
}
