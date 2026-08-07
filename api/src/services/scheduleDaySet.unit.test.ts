import { describe, expect, it } from "vitest";
import {
  type DayOverrideInput,
  type ScheduleWindow,
  firstLastDay,
  fromIsoDate,
  generateAutoDaySet,
  isWorkingDay,
  resolveDaySet,
  toIsoDate,
  validateDayOverrides,
} from "./scheduleDaySet.js";

const NO_HOLIDAYS = new Set<string>();

function startEnd(start: string, end: string): ScheduleWindow {
  return { entry_mode: "start_end", start_date: fromIsoDate(start), end_date: fromIsoDate(end), duration_days: null };
}

function startDuration(start: string, days: number): ScheduleWindow {
  return { entry_mode: "start_duration", start_date: fromIsoDate(start), end_date: null, duration_days: days };
}

describe("toIsoDate / fromIsoDate", () => {
  it("round-trips", () => {
    expect(toIsoDate(fromIsoDate("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("isWorkingDay", () => {
  it("Monday is a working day", () => {
    expect(isWorkingDay(fromIsoDate("2026-01-05"), NO_HOLIDAYS)).toBe(true);
  });

  it("Saturday is not", () => {
    expect(isWorkingDay(fromIsoDate("2026-01-03"), NO_HOLIDAYS)).toBe(false);
  });

  it("Sunday is not", () => {
    expect(isWorkingDay(fromIsoDate("2026-01-04"), NO_HOLIDAYS)).toBe(false);
  });

  it("a configured holiday is not, even on a weekday", () => {
    expect(isWorkingDay(fromIsoDate("2026-01-06"), new Set(["2026-01-06"]))).toBe(false);
  });
});

describe("generateAutoDaySet - start_end mode", () => {
  it("a pure weekday range includes every day", () => {
    expect(generateAutoDaySet(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("skips a weekend inside the range", () => {
    expect(generateAutoDaySet(startEnd("2026-01-05", "2026-01-12"), NO_HOLIDAYS)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-12",
    ]);
  });

  it("skips a configured holiday inside the range", () => {
    const holidays = new Set(["2026-01-06"]);
    expect(generateAutoDaySet(startEnd("2026-01-05", "2026-01-09"), holidays)).toEqual([
      "2026-01-05",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("crosses a month/year boundary correctly", () => {
    expect(generateAutoDaySet(startEnd("2025-12-29", "2026-01-02"), NO_HOLIDAYS)).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("a single-day range on a weekday returns that day", () => {
    expect(generateAutoDaySet(startEnd("2026-01-05", "2026-01-05"), NO_HOLIDAYS)).toEqual(["2026-01-05"]);
  });

  it("a single-day range on a weekend returns nothing", () => {
    expect(generateAutoDaySet(startEnd("2026-01-03", "2026-01-03"), NO_HOLIDAYS)).toEqual([]);
  });

  it("an unscheduled activity (start_date null) generates nothing", () => {
    const window: ScheduleWindow = { entry_mode: "start_end", start_date: null, end_date: null, duration_days: null };
    expect(generateAutoDaySet(window, NO_HOLIDAYS)).toEqual([]);
  });
});

describe("generateAutoDaySet - start_duration mode", () => {
  it("counts consecutive weekdays with no weekend in the way", () => {
    expect(generateAutoDaySet(startDuration("2026-01-05", 5), NO_HOLIDAYS)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("skips a weekend while counting working days, extending duration into the next week", () => {
    // Thu, Fri, (skip Sat/Sun), Mon, Tue = 4 working days.
    expect(generateAutoDaySet(startDuration("2026-01-08", 4), NO_HOLIDAYS)).toEqual([
      "2026-01-08",
      "2026-01-09",
      "2026-01-12",
      "2026-01-13",
    ]);
  });

  it("starting on a weekend does not count the weekend, and starts accruing from the next working day", () => {
    // Sat 1/3, Sun 1/4 not counted; Mon 1/5, Tue 1/6 are the 2 duration days.
    expect(generateAutoDaySet(startDuration("2026-01-03", 2), NO_HOLIDAYS)).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("skips a holiday while counting working days", () => {
    const holidays = new Set(["2026-01-06"]);
    expect(generateAutoDaySet(startDuration("2026-01-05", 3), holidays)).toEqual([
      "2026-01-05",
      "2026-01-07",
      "2026-01-08",
    ]);
  });

  it("crosses a month/year boundary correctly", () => {
    // Mon 12/29 .. counting 5 working days: 12/29,12/30,12/31,1/1,1/2 (weekend 1/3-1/4 not needed).
    expect(generateAutoDaySet(startDuration("2025-12-29", 5), NO_HOLIDAYS)).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("duration_days null or zero generates nothing", () => {
    expect(generateAutoDaySet(startDuration("2026-01-05", 0), NO_HOLIDAYS)).toEqual([]);
    const window: ScheduleWindow = {
      entry_mode: "start_duration",
      start_date: fromIsoDate("2026-01-05"),
      end_date: null,
      duration_days: null,
    };
    expect(generateAutoDaySet(window, NO_HOLIDAYS)).toEqual([]);
  });

  it("an unscheduled activity (start_date null) generates nothing", () => {
    const window: ScheduleWindow = {
      entry_mode: "start_duration",
      start_date: null,
      end_date: null,
      duration_days: 5,
    };
    expect(generateAutoDaySet(window, NO_HOLIDAYS)).toEqual([]);
  });
});

describe("resolveDaySet - overrides", () => {
  it("exclude removes a day from the generated set", () => {
    const overrides: DayOverrideInput[] = [{ day: fromIsoDate("2026-01-07"), kind: "exclude" }];
    expect(resolveDaySet(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("add inserts a weekend day that auto-generation would never produce", () => {
    const overrides: DayOverrideInput[] = [{ day: fromIsoDate("2026-01-10"), kind: "add" }]; // Saturday
    expect(resolveDaySet(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
    ]);
  });

  it("add on an already-generated day is idempotent (no duplicate)", () => {
    const overrides: DayOverrideInput[] = [{ day: fromIsoDate("2026-01-06"), kind: "add" }];
    expect(resolveDaySet(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("combines multiple add and exclude overrides", () => {
    const overrides: DayOverrideInput[] = [
      { day: fromIsoDate("2026-01-05"), kind: "exclude" },
      { day: fromIsoDate("2026-01-10"), kind: "add" }, // Saturday night work
      { day: fromIsoDate("2026-01-11"), kind: "add" }, // Sunday night work
    ];
    expect(resolveDaySet(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual([
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      "2026-01-11",
    ]);
  });
});

describe("firstLastDay", () => {
  it("returns nulls for an empty set", () => {
    expect(firstLastDay([])).toEqual({ first: null, last: null });
  });

  it("returns first/last regardless of input order", () => {
    expect(firstLastDay(["2026-01-08", "2026-01-05", "2026-01-07"])).toEqual({
      first: "2026-01-05",
      last: "2026-01-08",
    });
  });
});

describe("validateDayOverrides", () => {
  it("accepts an exclude for a day actually in the generated set", () => {
    const overrides: DayOverrideInput[] = [{ day: fromIsoDate("2026-01-06"), kind: "exclude" }];
    expect(validateDayOverrides(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual({
      valid: true,
    });
  });

  it("accepts an add for any day, including a weekend", () => {
    const overrides: DayOverrideInput[] = [{ day: fromIsoDate("2026-01-10"), kind: "add" }];
    expect(validateDayOverrides(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual({
      valid: true,
    });
  });

  it("rejects an exclude for a day not in the generated set", () => {
    const overrides: DayOverrideInput[] = [{ day: fromIsoDate("2026-01-10"), kind: "exclude" }]; // Saturday, never generated
    expect(validateDayOverrides(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual({
      valid: false,
      invalidDays: ["2026-01-10"],
    });
  });

  it("reports every invalid day, not just the first", () => {
    const overrides: DayOverrideInput[] = [
      { day: fromIsoDate("2026-01-10"), kind: "exclude" },
      { day: fromIsoDate("2026-01-11"), kind: "exclude" },
      { day: fromIsoDate("2026-01-06"), kind: "exclude" }, // valid, should not appear
    ];
    expect(validateDayOverrides(startEnd("2026-01-05", "2026-01-09"), NO_HOLIDAYS, overrides)).toEqual({
      valid: false,
      invalidDays: ["2026-01-10", "2026-01-11"],
    });
  });
});
