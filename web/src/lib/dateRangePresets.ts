// Named date ranges for list filters. Pure and dependency-free so the math is
// obvious and reusable — the Schedule Activities list is the first caller.
//
// Weeks run Sunday–Saturday, matching the lookahead workbook and the Gantt's
// Sunday-snapped window (SCHEDULE_SPEC.md). A "this week" that started on
// Monday here would disagree with the week bands on the Gantt.

export type DateRangePresetId = "this_week" | "next_week" | "this_month" | "next_month";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Formats a Date as YYYY-MM-DD from its *local* components. `toISOString()`
 * would convert to UTC first, which shifts the date by one for anyone west of
 * Greenwich — "this week" has to mean the user's week, not UTC's.
 */
export function toIsoDateLocal(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfWeek(today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  return d;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function monthRange(today: Date, monthOffset: number): DateRange {
  const first = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  // Day 0 of the following month is the last day of this one, which keeps
  // month lengths and leap years correct without a lookup table.
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: toIsoDateLocal(first), to: toIsoDateLocal(last) };
}

export const DATE_RANGE_PRESETS: { id: DateRangePresetId; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "next_week", label: "Next week" },
  { id: "this_month", label: "This month" },
  { id: "next_month", label: "Next month" },
];

/** Resolves a preset against `today` (injectable so callers can test it). */
export function resolveDateRangePreset(id: DateRangePresetId, today: Date = new Date()): DateRange {
  switch (id) {
    case "this_week": {
      const start = startOfWeek(today);
      return { from: toIsoDateLocal(start), to: toIsoDateLocal(addDays(start, 6)) };
    }
    case "next_week": {
      const start = addDays(startOfWeek(today), 7);
      return { from: toIsoDateLocal(start), to: toIsoDateLocal(addDays(start, 6)) };
    }
    case "this_month":
      return monthRange(today, 0);
    case "next_month":
      return monthRange(today, 1);
  }
}

/**
 * Serializes a range for the API's `scheduled_between=<from>,<to>` parameter.
 * Returns undefined unless both ends are present, so a half-filled custom
 * range simply does not filter rather than sending a malformed value the API
 * would reject with a 400.
 */
export function toScheduledBetween(range: Partial<DateRange> | null): string | undefined {
  if (!range?.from || !range.to) return undefined;
  return `${range.from},${range.to}`;
}
