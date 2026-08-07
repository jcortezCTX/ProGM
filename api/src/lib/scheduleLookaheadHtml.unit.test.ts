import { describe, expect, it } from "vitest";
import {
  type LookaheadActivity,
  type LookaheadDay,
  type LookaheadSheetData,
  buildLookaheadFooterTemplate,
  buildLookaheadHtml,
} from "./scheduleLookaheadHtml.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 2026-01-04 is a Sunday, matching the gantt service's Sunday-snapped window. */
function makeDays(startIso: string, count: number, holidays: Record<string, string> = {}): LookaheadDay[] {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    return {
      date: iso,
      day_of_week: DAY_NAMES[dow],
      is_weekend: dow === 0 || dow === 6,
      holiday_name: holidays[iso] ?? null,
    };
  });
}

function makeActivity(days: LookaheadDay[], overrides: Partial<LookaheadActivity> = {}): LookaheadActivity {
  return {
    id: "a1",
    code: "104Ua",
    crew: "GS CREW #1",
    description: "Install yard pipe",
    responsibility: "Garney",
    night_work: false,
    critical_path: false,
    shutdown: false,
    cells: days.map((d) => ({ date: d.date, scheduled: false, crew_count: null, marker: null })),
    ...overrides,
  };
}

function makeData(days: LookaheadDay[], activities: LookaheadActivity[]): LookaheadSheetData {
  return {
    window: { start: days[0].date, weeks: days.length / 7, days },
    sections: [{ id: "s1", name: "YARD PIPE", activities }],
    crew_totals: days.map((d) => ({ date: d.date, total: 0 })),
    days_by_activity: new Map(activities.map((a) => [a.id, 5])),
  };
}

describe("buildLookaheadHtml", () => {
  const days = makeDays("2026-01-04", 42);

  it("renders one column per window day plus the frozen columns", () => {
    const html = buildLookaheadHtml(makeData(days, [makeActivity(days)]));
    // Header row 2 is the per-day band: one <th> per day in the window.
    const dayHeaders = html.match(/class="day-header/g) ?? [];
    expect(dayHeaders).toHaveLength(42);
    // The section row spans frozen columns + day columns.
    expect(html).toContain('colspan="47"');
  });

  it("groups weeks into 6 week-of headers", () => {
    const html = buildLookaheadHtml(makeData(days, [makeActivity(days)]));
    const weekHeaders = html.match(/class="week-header"/g) ?? [];
    expect(weekHeaders).toHaveLength(6);
    expect(html).toContain("Week of 01/04");
  });

  it("shades weekends and holidays, and names the holiday", () => {
    const withHoliday = makeDays("2026-01-04", 42, { "2026-01-19": "County Holiday" });
    const html = buildLookaheadHtml(makeData(withHoliday, [makeActivity(withHoliday)]));
    expect(html).toContain("County Holiday");
    expect(html).toContain("weekend");
    expect(html).toContain("holiday");
  });

  it("tints scheduled cells by activity flag", () => {
    const scheduled = (flag: Partial<LookaheadActivity>) => {
      const activity = makeActivity(days, {
        ...flag,
        cells: days.map((d, i) => ({ date: d.date, scheduled: i === 1, crew_count: 4, marker: "P" })),
      });
      return buildLookaheadHtml(makeData(days, [activity]));
    };
    expect(scheduled({ critical_path: true })).toContain("c sched f-critical");
    expect(scheduled({ shutdown: true })).toContain("c sched f-shutdown");
    expect(scheduled({ night_work: true })).toContain("c sched f-night");
  });

  it("prints crew count and marker only on scheduled days", () => {
    const activity = makeActivity(days, {
      cells: days.map((d, i) => ({
        date: d.date,
        // An unscheduled day carrying stale values must stay blank on paper.
        scheduled: i === 1,
        crew_count: 6,
        marker: "P",
      })),
    });
    const html = buildLookaheadHtml(makeData(days, [activity]));
    const contents = html.match(/<span class="cell-content">.*?<\/span>/g) ?? [];
    expect(contents).toHaveLength(1);
    expect(contents[0]).toContain("6 P");
  });

  it("renders the derived Days column from days_by_activity", () => {
    const data = makeData(days, [makeActivity(days)]);
    data.days_by_activity.set("a1", 17);
    expect(buildLookaheadHtml(data)).toContain(">17</td>");
  });

  it("falls back to an em dash when an activity has no resolved duration", () => {
    const data = makeData(days, [makeActivity(days)]);
    data.days_by_activity.clear();
    expect(buildLookaheadHtml(data)).toContain(">—</td>");
  });

  it("escapes free-text fields so a typed description cannot inject markup", () => {
    const activity = makeActivity(days, {
      description: '<script>alert("x")</script>',
      crew: "A & B",
      marker: undefined,
    } as Partial<LookaheadActivity>);
    const data = makeData(days, [activity]);
    data.sections[0].name = "<b>YARD</b>";
    const html = buildLookaheadHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("&lt;b&gt;YARD&lt;/b&gt;");
  });

  it("omits sections that have no activities in the window", () => {
    const data = makeData(days, [makeActivity(days)]);
    data.sections.push({ id: "s2", name: "SITE ELECTRICAL", activities: [] });
    const html = buildLookaheadHtml(data);
    expect(html).toContain("YARD PIPE");
    expect(html).not.toContain("SITE ELECTRICAL");
  });

  it("still renders the grid and says so when nothing is scheduled", () => {
    const data = makeData(days, []);
    data.sections = [];
    const html = buildLookaheadHtml(data);
    expect(html).toContain("No activities are scheduled in this window.");
    expect((html.match(/class="day-header/g) ?? []).length).toBe(42);
  });

  it("titles the sheet with the window length and date range", () => {
    const html = buildLookaheadHtml(makeData(days, [makeActivity(days)]));
    expect(html).toContain("6 Week Lookahead");
    expect(html).toContain("Jan 4, 2026");
    expect(html).toContain("Feb 14, 2026");
  });

  it("keeps the CREW TOTALS row and blanks zero totals", () => {
    const data = makeData(days, [makeActivity(days)]);
    data.crew_totals[3] = { date: days[3].date, total: 12 };
    const html = buildLookaheadHtml(data);
    // Spans the frozen block so the label is not clipped by the Code column.
    expect(html).toContain('<td class="frozen" colspan="5">CREW TOTALS</td>');
    expect(html).toContain(">12</td>");
    expect(html).not.toContain(">0</td>");
  });
});

describe("buildLookaheadFooterTemplate", () => {
  it("includes the generation timestamp and Chromium's page-number spans", () => {
    const footer = buildLookaheadFooterTemplate({ generatedAt: new Date("2026-08-07T15:04:00Z") });
    expect(footer).toContain("Generated");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
  });
});
