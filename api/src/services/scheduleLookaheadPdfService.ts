import { renderHtmlToPdf } from "../lib/pdfRenderer.js";
import { buildLookaheadFooterTemplate, buildLookaheadHtml } from "../lib/scheduleLookaheadHtml.js";
import { type GanttParams, getGanttWithDurations } from "./scheduleGanttService.js";

export interface LookaheadPdfResult {
  pdf: Buffer;
  filename: string;
}

/**
 * Renders the lookahead window as a print-ready PDF. Tabloid landscape: the
 * sheet gets pinned to a jobsite trailer wall, and 42 day columns plus the
 * frozen activity columns do not stay legible on letter.
 */
export async function getLookaheadPdf(params: GanttParams): Promise<LookaheadPdfResult> {
  const data = await getGanttWithDurations(params);

  const html = buildLookaheadHtml(data);
  const pdf = await renderHtmlToPdf(html, {
    format: "tabloid",
    landscape: true,
    // Deeper at the bottom to clear the generated-on/page-number footer.
    margin: { top: "0.35in", right: "0.35in", bottom: "0.55in", left: "0.35in" },
    footerTemplate: buildLookaheadFooterTemplate(),
  });

  return { pdf, filename: `${data.window.weeks}-week-lookahead-${data.window.start}.pdf` };
}
