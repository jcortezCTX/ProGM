import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createActivity, listActivities, upsertActivityDays } from "./scheduleActivityService.js";
import { createSection } from "./scheduleSectionService.js";

// Fixture names carry a random suffix as well as a timestamp: vitest runs test
// files in parallel and two files picking the same `TEST-<Date.now()>` name
// have collided in this repo before.
const marker = `ZZZ-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectionId: string;
const activityIds: string[] = [];

async function makeActivity(description: string, start: string, end: string) {
  sectionId ??= (await createSection({ name: `${marker} SECTION`, sort_order: 9999 })).id;
  const activity = await createActivity({
    section_id: sectionId,
    description: `${marker} ${description}`,
    entry_mode: "start_end",
    start_date: start,
    end_date: end,
  });
  activityIds.push(activity.id);
  return activity;
}

afterAll(async () => {
  // schedule_activity_days cascades on activity delete (see schema.prisma).
  await prisma.schedule_activities.deleteMany({ where: { id: { in: activityIds } } });
  if (sectionId) await prisma.schedule_sections.deleteMany({ where: { id: sectionId } });
});

describe("listActivities scheduled_between", () => {
  it("matches an activity that has working days inside the range", async () => {
    // 2026-03-02 is a Monday; Mon-Fri that week are all working days.
    const activity = await makeActivity("in range", "2026-03-02", "2026-03-06");
    const rows = await listActivities({ scheduled_between: { from: "2026-03-02", to: "2026-03-08" } });
    expect(rows.map((r) => r.id)).toContain(activity.id);
  });

  it("excludes an activity whose span covers the range but works no days in it", async () => {
    // The regression this filter had: spans Feb-Apr, but every working day in
    // the sampled week is excluded, so it is not "scheduled" that week at all.
    const activity = await makeActivity("gap over range", "2026-02-02", "2026-04-03");
    const gapWeek = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
    await upsertActivityDays(
      activity.id,
      gapWeek.map((day) => ({ action: "upsert" as const, day, kind: "exclude" as const })),
    );

    const rows = await listActivities({ scheduled_between: { from: "2026-03-02", to: "2026-03-06" } });
    expect(rows.map((r) => r.id)).not.toContain(activity.id);

    // Still found either side of the gap, so the exclusion is about the range
    // and not the activity disappearing outright.
    const before = await listActivities({ scheduled_between: { from: "2026-02-02", to: "2026-02-06" } });
    expect(before.map((r) => r.id)).toContain(activity.id);
  });

  it("matches on a weekend day added as an explicit override", async () => {
    // Auto-generation never lands on a weekend, so a Saturday-only range can
    // only match through an `add` override - the deliberate weekend-work case.
    const activity = await makeActivity("weekend add", "2026-03-02", "2026-03-06");
    await upsertActivityDays(activity.id, [{ action: "upsert", day: "2026-03-07", kind: "add" }]);

    const saturdayOnly = await listActivities({ scheduled_between: { from: "2026-03-07", to: "2026-03-07" } });
    expect(saturdayOnly.map((r) => r.id)).toContain(activity.id);
  });

  it("excludes a range that falls entirely on a weekend the activity does not work", async () => {
    const activity = await makeActivity("no weekend work", "2026-03-02", "2026-03-06");
    const weekend = await listActivities({ scheduled_between: { from: "2026-03-07", to: "2026-03-08" } });
    expect(weekend.map((r) => r.id)).not.toContain(activity.id);
  });

  it("excludes unscheduled activities, which have no days to match", async () => {
    sectionId ??= (await createSection({ name: `${marker} SECTION`, sort_order: 9999 })).id;
    const activity = await createActivity({
      section_id: sectionId,
      description: `${marker} unscheduled placeholder`,
      entry_mode: "start_end",
    });
    activityIds.push(activity.id);

    const rows = await listActivities({ scheduled_between: { from: "2026-01-01", to: "2026-12-31" } });
    expect(rows.map((r) => r.id)).not.toContain(activity.id);
  });

  it("includes boundary days at both ends of the range", async () => {
    const activity = await makeActivity("boundaries", "2026-03-02", "2026-03-06");
    const firstDayOnly = await listActivities({ scheduled_between: { from: "2026-03-02", to: "2026-03-02" } });
    expect(firstDayOnly.map((r) => r.id)).toContain(activity.id);

    const lastDayOnly = await listActivities({ scheduled_between: { from: "2026-03-06", to: "2026-03-06" } });
    expect(lastDayOnly.map((r) => r.id)).toContain(activity.id);
  });

  it("does not leak the internal resolved day set into the response", async () => {
    await makeActivity("shape check", "2026-03-02", "2026-03-06");
    const [row] = await listActivities({ scheduled_between: { from: "2026-03-02", to: "2026-03-06" } });
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("resolved");
    expect(row).toHaveProperty("days");
    expect(row).toHaveProperty("first_day");
  });
});
