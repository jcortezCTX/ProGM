import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  SEVEN_DAY_OVERDUE_DAYS,
  TWENTY_EIGHT_DAY_OVERDUE_DAYS,
  addSample,
  createPour,
  getPour,
  getWeeklyReport,
  listPours,
} from "./concretePourService.js";

const runId = Date.now();
const marker = `MARK${runId}`;
const pourIds: string[] = [];

async function makePour(overrides: Partial<Parameters<typeof createPour>[0]> = {}) {
  const pour = await createPour({
    pour_date: "2026-01-01",
    location: `Test Pour ${marker}`,
    design_strength_psi: 4500,
    ...overrides,
  });
  pourIds.push(pour.id);
  return pour;
}

afterAll(async () => {
  // concrete_samples cascades on pour delete (see schema.prisma).
  await prisma.concrete_pours.deleteMany({ where: { id: { in: pourIds } } });
});

describe("sample pass/fail boundary", () => {
  it("treats 28-day psi exactly equal to design strength as Pass", async () => {
    const pour = await makePour({ design_strength_psi: 4500 });
    const sample = await addSample(pour.id, { twenty_eight_day_psi: 4500 });
    expect(sample.result).toBe("pass");
    expect(sample.margin_above_design).toBe(0);
  });

  it("treats 28-day psi one below design strength as Fail", async () => {
    const pour = await makePour({ design_strength_psi: 4500 });
    const sample = await addSample(pour.id, { twenty_eight_day_psi: 4499 });
    expect(sample.result).toBe("fail");
    expect(sample.margin_above_design).toBe(-1);
  });

  it("leaves result null until a 28-day psi is entered", async () => {
    const pour = await makePour({ design_strength_psi: 4500 });
    const sample = await addSample(pour.id, { seven_day_psi: 3000 });
    expect(sample.result).toBeNull();
    expect(sample.margin_above_design).toBeNull();
  });
});

describe("per-pour sample averages with partial samples", () => {
  it("averages only the samples that have a value for each field", async () => {
    const pour = await makePour();
    await addSample(pour.id, { seven_day_psi: 3000, twenty_eight_day_psi: 4600 });
    await addSample(pour.id, { seven_day_psi: 3200 }); // no 28-day yet
    await addSample(pour.id, {}); // no results at all

    const fetched = await getPour(pour.id);
    expect(fetched.sample_count).toBe(3);
    expect(fetched.seven_day_avg).toBe((3000 + 3200) / 2);
    expect(fetched.twenty_eight_day_avg).toBe(4600);
  });

  it("reports null averages when no sample has a value yet", async () => {
    const pour = await makePour();
    await addSample(pour.id, {});
    const fetched = await getPour(pour.id);
    expect(fetched.seven_day_avg).toBeNull();
    expect(fetched.twenty_eight_day_avg).toBeNull();
  });
});

describe("overdue thresholds", () => {
  afterEach(() => vi.useRealTimers());

  it(`is not 7-day overdue at exactly ${SEVEN_DAY_OVERDUE_DAYS} days since the pour`, async () => {
    const pourDate = new Date("2026-03-01T00:00:00.000Z");
    const pour = await makePour({ pour_date: pourDate.toISOString().slice(0, 10) });
    await addSample(pour.id, {});

    vi.useFakeTimers();
    vi.setSystemTime(new Date(pourDate.getTime() + SEVEN_DAY_OVERDUE_DAYS * 24 * 60 * 60 * 1000));
    const fetched = await getPour(pour.id);
    expect(fetched.seven_day_overdue).toBe(false);
  });

  it(`is 7-day overdue just past ${SEVEN_DAY_OVERDUE_DAYS} days when a sample is missing seven_day_psi`, async () => {
    const pourDate = new Date("2026-03-01T00:00:00.000Z");
    const pour = await makePour({ pour_date: pourDate.toISOString().slice(0, 10) });
    await addSample(pour.id, {});

    vi.useFakeTimers();
    vi.setSystemTime(new Date(pourDate.getTime() + SEVEN_DAY_OVERDUE_DAYS * 24 * 60 * 60 * 1000 + 60 * 60 * 1000));
    const fetched = await getPour(pour.id);
    expect(fetched.seven_day_overdue).toBe(true);
  });

  it("is never overdue when the pour has zero samples", async () => {
    const pourDate = new Date("2026-01-01T00:00:00.000Z");
    const pour = await makePour({ pour_date: pourDate.toISOString().slice(0, 10) });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(pourDate.getTime() + 100 * 24 * 60 * 60 * 1000));
    const fetched = await getPour(pour.id);
    expect(fetched.seven_day_overdue).toBe(false);
    expect(fetched.twenty_eight_day_overdue).toBe(false);
  });

  it(`is not 28-day overdue when a sample already has a twenty_eight_day_psi`, async () => {
    const pourDate = new Date("2026-03-01T00:00:00.000Z");
    const pour = await makePour({ pour_date: pourDate.toISOString().slice(0, 10) });
    await addSample(pour.id, { twenty_eight_day_psi: 4600 });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(pourDate.getTime() + (TWENTY_EIGHT_DAY_OVERDUE_DAYS + 5) * 24 * 60 * 60 * 1000));
    const fetched = await getPour(pour.id);
    expect(fetched.twenty_eight_day_overdue).toBe(false);
  });

  it(`is 28-day overdue past ${TWENTY_EIGHT_DAY_OVERDUE_DAYS} days when still missing twenty_eight_day_psi`, async () => {
    const pourDate = new Date("2026-03-01T00:00:00.000Z");
    const pour = await makePour({ pour_date: pourDate.toISOString().slice(0, 10) });
    await addSample(pour.id, { seven_day_psi: 3000 });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(pourDate.getTime() + (TWENTY_EIGHT_DAY_OVERDUE_DAYS + 1) * 24 * 60 * 60 * 1000));
    const fetched = await getPour(pour.id);
    expect(fetched.twenty_eight_day_overdue).toBe(true);
  });

  it("pending_results filter finds an overdue pour and excludes a resolved one", async () => {
    const pourDate = new Date("2026-03-01T00:00:00.000Z");
    const overduePour = await makePour({
      pour_date: pourDate.toISOString().slice(0, 10),
      location: `Overdue ${marker}`,
    });
    await addSample(overduePour.id, {});
    const resolvedPour = await makePour({
      pour_date: pourDate.toISOString().slice(0, 10),
      location: `Resolved ${marker}`,
    });
    await addSample(resolvedPour.id, { seven_day_psi: 3000, twenty_eight_day_psi: 4600 });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(pourDate.getTime() + (TWENTY_EIGHT_DAY_OVERDUE_DAYS + 1) * 24 * 60 * 60 * 1000));
    const res = await listPours({ limit: 50, order: "asc", pending_results: true, q: marker });
    const ids = res.data.map((p) => p.id);
    expect(ids).toContain(overduePour.id);
    expect(ids).not.toContain(resolvedPour.id);
  });
});

describe("weekly report window (Mon-Fri inclusive)", () => {
  // Week of Mon 2026-06-15 .. Fri 2026-06-19.
  const weekEnding = "2026-06-19";

  it("includes samples entered exactly on Monday and exactly on Friday", async () => {
    const pour = await makePour({ location: `WeekEdge ${marker}` });
    await addSample(pour.id, { seven_day_psi: 3000, seven_day_entered_on: "2026-06-15" }); // Monday
    await addSample(pour.id, { seven_day_psi: 3100, seven_day_entered_on: "2026-06-19" }); // Friday

    const report = await getWeeklyReport(weekEnding);
    const psis = report.seven_day_results.filter((r) => r.pour.id === pour.id).map((r) => Number(r.seven_day_psi));
    expect(psis.sort()).toEqual([3000, 3100]);
  });

  it("excludes samples entered the Saturday before or the Monday after the window", async () => {
    const pour = await makePour({ location: `WeekOutside ${marker}` });
    await addSample(pour.id, { seven_day_psi: 2000, seven_day_entered_on: "2026-06-13" }); // Sat before
    await addSample(pour.id, { seven_day_psi: 2100, seven_day_entered_on: "2026-06-22" }); // Mon after

    const report = await getWeeklyReport(weekEnding);
    const inWindow = report.seven_day_results.filter((r) => r.pour.id === pour.id);
    expect(inWindow).toHaveLength(0);
  });

  it("counts 28-day pass/fail correctly within the window", async () => {
    const pour = await makePour({ design_strength_psi: 4500, location: `WeekPassFail ${marker}` });
    await addSample(pour.id, { twenty_eight_day_psi: 4600, twenty_eight_day_entered_on: "2026-06-17" });
    await addSample(pour.id, { twenty_eight_day_psi: 4000, twenty_eight_day_entered_on: "2026-06-18" });

    const report = await getWeeklyReport(weekEnding);
    const results = report.twenty_eight_day_results.filter((r) => r.pour.id === pour.id);
    expect(results.find((r) => Number(r.twenty_eight_day_psi) === 4600)?.result).toBe("pass");
    expect(results.find((r) => Number(r.twenty_eight_day_psi) === 4000)?.result).toBe("fail");
  });
});
