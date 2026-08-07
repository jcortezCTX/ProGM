import { describe, expect, it } from "vitest";
import {
  type WeeklyReportData,
  type WeeklyReportSample,
  buildWeeklyReportHtml,
} from "./concreteWeeklyReportHtml.js";

function sample(overrides: Partial<WeeklyReportSample> = {}): WeeklyReportSample {
  return {
    report_number: "AC13427",
    seven_day_psi: "4113",
    twenty_eight_day_psi: "6417",
    result: "pass",
    pour: { pour_date: "2026-04-28T00:00:00.000Z", location: "Grout Mix Design Test", design_strength_psi: 3500 },
    ...overrides,
  };
}

function report(overrides: Partial<WeeklyReportData> = {}): WeeklyReportData {
  return {
    week_start: "2026-06-15",
    week_ending: "2026-06-19",
    seven_day_results: [sample()],
    twenty_eight_day_results: [sample()],
    counts: { seven_day_results: 1, twenty_eight_day_pass: 1, twenty_eight_day_fail: 0 },
    ...overrides,
  };
}

const JOB = { job_number: "0673", job_name: "OWP AWWTF" };

describe("buildWeeklyReportHtml", () => {
  it("keeps the three sections in the order the pdfkit version used", () => {
    const html = buildWeeklyReportHtml(report(), JOB);
    const order = ["7-Day Results", "28-Day Results", "Counts"].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("renders the job and week range in the subtitle", () => {
    const html = buildWeeklyReportHtml(report(), JOB);
    expect(html).toContain("0673");
    expect(html).toContain("OWP AWWTF");
    expect(html).toContain("Jun 15, 2026");
    expect(html).toContain("Jun 19, 2026");
  });

  it("omits the job label entirely when settings have not been saved", () => {
    const html = buildWeeklyReportHtml(report(), null);
    expect(html).toContain("Week of");
    expect(html).not.toContain("Job ");
  });

  it("badges a passing 28-day result as PASS and a failing one as FAIL", () => {
    const passing = buildWeeklyReportHtml(report(), JOB);
    expect(passing).toContain('<span class="badge pass">PASS</span>');

    const failing = buildWeeklyReportHtml(
      report({ twenty_eight_day_results: [sample({ result: "fail" })] }),
      JOB,
    );
    expect(failing).toContain('<span class="badge fail">FAIL</span>');
  });

  it("shows an em dash for a 28-day sample with no result yet", () => {
    const html = buildWeeklyReportHtml(
      report({ twenty_eight_day_results: [sample({ result: null, twenty_eight_day_psi: null })] }),
      JOB,
    );
    expect(html).toContain("<td>—</td>");
  });

  it("renders PSI values as given, never through float arithmetic", () => {
    // NUMERIC columns arrive as strings; a naive Number() round-trip is what
    // this guards against (CLAUDE.md: no float math on quantities).
    const html = buildWeeklyReportHtml(
      report({ seven_day_results: [sample({ seven_day_psi: "4113.50" })] }),
      JOB,
    );
    expect(html).toContain("4113.50");
  });

  it("says so explicitly when a section has no results", () => {
    const html = buildWeeklyReportHtml(
      report({ seven_day_results: [], twenty_eight_day_results: [] }),
      JOB,
    );
    expect(html).toContain("No 7-day results entered this week.");
    expect(html).toContain("No 28-day results entered this week.");
  });

  it("renders all three count tiles including a zero", () => {
    const html = buildWeeklyReportHtml(
      report({ counts: { seven_day_results: 35, twenty_eight_day_pass: 26, twenty_eight_day_fail: 0 } }),
      JOB,
    );
    expect(html).toContain(">35</div>");
    expect(html).toContain(">26</div>");
    expect(html).toContain(">0</div>");
  });

  it("escapes free text so a pour location cannot inject markup", () => {
    const html = buildWeeklyReportHtml(
      report({
        seven_day_results: [
          sample({ pour: { pour_date: "2026-04-28", location: "<img src=x>", design_strength_psi: 3500 } }),
        ],
      }),
      { job_number: "0673", job_name: "A & B" },
    );
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("uses brand tokens rather than the hardcoded hexes the pdfkit version had", () => {
    const html = buildWeeklyReportHtml(report(), JOB);
    expect(html).toContain("var(--title)");
    expect(html).toContain("var(--text-muted)");
    expect(html).not.toContain("#555");
  });

  it("prints letter portrait", () => {
    expect(buildWeeklyReportHtml(report(), JOB)).toContain("size: letter portrait");
  });
});
