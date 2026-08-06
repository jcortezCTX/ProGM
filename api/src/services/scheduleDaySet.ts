// Core math for the Schedule module (SCHEDULE_SPEC.md "Scheduling model").
// Pure functions, no DB access - the resolved day set, first/last day, and
// working-day count are derived here and never stored (CLAUDE.md rule 1
// spirit, applied to the schedule module's own "Do not store derived
// values" rule).
//
// Dates are represented as ISO "YYYY-MM-DD" strings internally (from UTC
// midnight `Date`s, which is how Prisma returns @db.Date columns) so day
// membership can use plain Set/array equality instead of Date reference
// comparisons.

export type EntryMode = "start_end" | "start_duration";
export type DayOverrideKind = "add" | "exclude";

export interface ScheduleWindow {
  entry_mode: EntryMode;
  start_date: Date | null;
  end_date: Date | null;
  duration_days: number | null;
}

export interface DayOverrideInput {
  day: Date;
  kind: DayOverrideKind;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

// Hard requirement: auto-generation never lands on a Saturday, Sunday, or a
// configured holiday. Only an explicit override can.
export function isWorkingDay(d: Date, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(d) && !holidays.has(toIsoDate(d));
}

// The auto-generated set, before per-day overrides are applied. Empty for
// unscheduled activities (start_date null - the Excel's year-placeholder
// rows) and for malformed windows (the DB CHECK constraint should already
// prevent these, but this stays defensive rather than throwing).
export function generateAutoDaySet(window: ScheduleWindow, holidays: ReadonlySet<string>): string[] {
  if (!window.start_date) return [];

  if (window.entry_mode === "start_end") {
    if (!window.end_date || window.end_date.getTime() < window.start_date.getTime()) return [];
    const days: string[] = [];
    let cursor = window.start_date;
    while (cursor.getTime() <= window.end_date.getTime()) {
      if (isWorkingDay(cursor, holidays)) days.push(toIsoDate(cursor));
      cursor = addUtcDays(cursor, 1);
    }
    return days;
  }

  // start_duration: walk forward from start_date, counting only working
  // days, until duration_days of them have been collected.
  if (!window.duration_days || window.duration_days <= 0) return [];
  const days: string[] = [];
  let cursor = window.start_date;
  let remaining = window.duration_days;
  // Safety cap against a runaway loop on bad data (e.g. a holiday list that
  // somehow covers every day indefinitely) - far beyond any real schedule.
  let guard = 0;
  while (remaining > 0 && guard < 10000) {
    if (isWorkingDay(cursor, holidays)) {
      days.push(toIsoDate(cursor));
      remaining--;
    }
    cursor = addUtcDays(cursor, 1);
    guard++;
  }
  return days;
}

// Auto-generated set with add/exclude overrides applied. Overrides are
// mechanical set operations here - validating that an `exclude` targets a
// day actually in the generated set is the write-path's job (see
// validateDayOverrides below), not this read-path function's.
export function resolveDaySet(
  window: ScheduleWindow,
  holidays: ReadonlySet<string>,
  overrides: DayOverrideInput[],
): string[] {
  const resolved = new Set(generateAutoDaySet(window, holidays));
  for (const o of overrides) {
    const iso = toIsoDate(o.day);
    if (o.kind === "exclude") resolved.delete(iso);
    else resolved.add(iso);
  }
  return [...resolved].sort();
}

export interface FirstLastDay {
  first: string | null;
  last: string | null;
}

export function firstLastDay(resolvedDays: readonly string[]): FirstLastDay {
  if (resolvedDays.length === 0) return { first: null, last: null };
  const sorted = [...resolvedDays].sort();
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

// Rejects an `exclude` override for a day that isn't in the generated set
// (SCHEDULE_SPEC.md: "rejects exclude for a day not in the generated set").
// `add` is always allowed, including on weekends/holidays (deliberate -
// weekend and night work really happens) and is idempotent on an
// already-generated day.
export function validateDayOverrides(
  window: ScheduleWindow,
  holidays: ReadonlySet<string>,
  overrides: DayOverrideInput[],
): { valid: true } | { valid: false; invalidDays: string[] } {
  const autoSet = new Set(generateAutoDaySet(window, holidays));
  const invalidDays = overrides
    .filter((o) => o.kind === "exclude" && !autoSet.has(toIsoDate(o.day)))
    .map((o) => toIsoDate(o.day));
  if (invalidDays.length > 0) return { valid: false, invalidDays };
  return { valid: true };
}
