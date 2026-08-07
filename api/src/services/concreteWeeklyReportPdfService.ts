import {
  type WeeklyReportData,
  type WeeklyReportJob,
  buildWeeklyReportHtml,
} from "../lib/concreteWeeklyReportHtml.js";
import { buildFooterTemplate } from "../lib/pdfLayout.js";
import { renderHtmlToPdf } from "../lib/pdfRenderer.js";

export interface WeeklyReportPdfResult {
  pdf: Buffer;
  filename: string;
}

/**
 * Renders the Concrete weekly report as a letter-portrait PDF. Unlike the
 * lookahead sheet this one is read at a desk rather than pinned to a wall, so
 * it stays on portrait letter — the size it has always printed at.
 */
export async function getWeeklyReportPdf(
  report: WeeklyReportData,
  job: WeeklyReportJob | null,
): Promise<WeeklyReportPdfResult> {
  const html = buildWeeklyReportHtml(report, job);
  const pdf = await renderHtmlToPdf(html, {
    format: "letter",
    landscape: false,
    // Deeper at the bottom to clear the generated-on/page-number footer.
    margin: { top: "0.5in", right: "0.5in", bottom: "0.7in", left: "0.5in" },
    footerTemplate: buildFooterTemplate(),
  });

  return { pdf, filename: `concrete-weekly-report-${report.week_ending}.pdf` };
}
