import PDFDocument from "pdfkit";
import type { Prisma } from "../generated/prisma/client.js";

// All PDF generation for the Concrete Log lives here (CONCRETE_LOG_SPEC.md:
// "Keep it isolated in one module"). Renders directly from data with pdfkit
// rather than an HTML+headless-browser pipeline - the report is a simple
// tabular layout, and pdfkit avoids bundling/launching a Chromium binary.

type Decimalish = Prisma.Decimal | string | number | null;

interface ReportSample {
  report_number: string | null;
  seven_day_psi: Decimalish;
  twenty_eight_day_psi?: Decimalish;
  result?: string | null;
  pour: { pour_date: Date; location: string; design_strength_psi: number };
}

interface WeeklyReportData {
  week_start: string;
  week_ending: string;
  seven_day_results: ReportSample[];
  twenty_eight_day_results: ReportSample[];
  counts: { seven_day_results: number; twenty_eight_day_pass: number; twenty_eight_day_fail: number };
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: "UTC" });
}

function fmt(v: Decimalish): string {
  return v === null || v === undefined ? "—" : String(v);
}

export function renderWeeklyReportPdf(
  report: WeeklyReportData,
  job: { job_number: string; job_name: string } | null,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "letter", margin: 40 });

  doc.fontSize(16).text("Concrete Weekly Report", { align: "left" });
  if (job) doc.fontSize(10).fillColor("#555").text(`Job ${job.job_number} — ${job.job_name}`);
  doc
    .fontSize(10)
    .fillColor("#555")
    .text(`Week of ${fmtDate(report.week_start)} – ${fmtDate(report.week_ending)}`);
  doc.moveDown(1);

  doc.fillColor("#000").fontSize(12).text("7-Day Results", { underline: true });
  doc.moveDown(0.3);
  if (report.seven_day_results.length === 0) {
    doc.fontSize(10).text("No 7-day results entered this week.");
  } else {
    for (const r of report.seven_day_results) {
      doc
        .fontSize(9)
        .text(
          `${fmtDate(r.pour.pour_date)}  ${r.pour.location}  —  Report ${r.report_number ?? "—"}  —  7-day PSI: ${fmt(r.seven_day_psi)}`,
        );
    }
  }
  doc.moveDown(1);

  doc.fontSize(12).text("28-Day Results", { underline: true });
  doc.moveDown(0.3);
  if (report.twenty_eight_day_results.length === 0) {
    doc.fontSize(10).text("No 28-day results entered this week.");
  } else {
    for (const r of report.twenty_eight_day_results) {
      const resultLabel = r.result ? r.result.toUpperCase() : "—";
      doc
        .fontSize(9)
        .text(
          `${fmtDate(r.pour.pour_date)}  ${r.pour.location}  —  Report ${r.report_number ?? "—"}  —  28-day PSI: ${fmt(r.twenty_eight_day_psi ?? null)} (design ${r.pour.design_strength_psi})  —  ${resultLabel}`,
        );
    }
  }
  doc.moveDown(1);

  doc.fontSize(12).text("Counts", { underline: true });
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .text(`7-day results: ${report.counts.seven_day_results}`)
    .text(`28-day pass: ${report.counts.twenty_eight_day_pass}`)
    .text(`28-day fail: ${report.counts.twenty_eight_day_fail}`);

  doc.end();
  return doc;
}
