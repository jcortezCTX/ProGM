// WorkLoad brand tokens for server-rendered PDFs.
//
// The canonical source is `web/src/tokens.css` (see CLAUDE.md — "Never
// hardcode brand colors; use the CSS variables"). The API cannot import that
// file at runtime: it is part of the web workspace's source tree and would not
// ship in an api-only build. So the `:root` block is mirrored here, and
// `pdfTheme.unit.test.ts` parses the real tokens.css and fails if the two ever
// drift. Every PDF stylesheet must reference these via var(), never a literal.
//
// Only the tokens the PDF sheets actually use are mirrored — adding a token
// here without adding it to tokens.css will fail the sync test.
export const PDF_THEME_TOKENS = `
:root {
  --primary: #00A15D;

  --rgba-primary-1: rgba(0, 161, 93, 0.1);
  --rgba-primary-2: rgba(0, 161, 93, 0.2);

  --success: #09BD3C;
  --info: #D653C1;
  --warning: #FFCF6D;
  --danger: #FC2E53;
  --secondary: #FF5E4B;

  --rgba-success-1: rgba(9, 189, 60, 0.14);
  --rgba-danger-1: rgba(252, 46, 83, 0.12);
  --rgba-danger-2: rgba(252, 46, 83, 0.35);
  --rgba-info-2: rgba(214, 83, 193, 0.3);
  --rgba-secondary-2: rgba(255, 94, 75, 0.35);
  --rgba-warning-1: rgba(255, 207, 109, 0.25);

  --page-bg: #F8F8F8;
  --card-bg: #ffffff;
  --border: rgba(0, 0, 0, 0.125);
  --rgba-neutral-1: rgba(0, 0, 0, 0.05);

  --text: #393939;
  --title: #000000;
  --text-muted: #89879f;

  --radius-sm: 0.625rem;
}
`.trim();

// tokens.css pulls Roboto from Google Fonts. A PDF render must not depend on
// network access (the renderer runs with no navigation to external hosts), so
// the sheets fall back to the system UI stack instead of importing a webfont.
export const PDF_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
