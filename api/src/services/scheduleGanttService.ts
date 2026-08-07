import { prisma } from "../lib/prisma.js";
import { listHolidaySet } from "./scheduleHolidayService.js";
import {
  type DayOverrideInput,
  type ScheduleWindow,
  fromIsoDate,
  resolveDaySet,
  toIsoDate,
} from "./scheduleDaySet.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function snapToSunday(d: Date): Date {
  const dow = d.getUTCDay();
  return new Date(d.getTime() - dow * MS_PER_DAY);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface GanttParams {
  start?: string;
  weeks: number;
}

export async function getGantt(params: GanttParams) {
  return (await buildGantt(params)).gantt;
}

/**
 * The gantt payload plus each in-window activity's total resolved working-day
 * count (the Excel's col I). The PDF sheet needs that column, and the gantt
 * payload deliberately does not carry it — it is derived, so it is computed
 * here from the same resolved day set rather than re-queried or stored.
 */
export async function getGanttWithDurations(params: GanttParams) {
  const { gantt, daysByActivity } = await buildGantt(params);
  return { ...gantt, days_by_activity: daysByActivity };
}

async function buildGantt(params: GanttParams) {
  const rawStart = params.start ? fromIsoDate(params.start) : new Date(new Date().toISOString().slice(0, 10));
  const windowStart = snapToSunday(rawStart);
  const totalDays = params.weeks * 7;
  const windowEnd = addDays(windowStart, totalDays - 1);
  const windowStartIso = toIsoDate(windowStart);
  const windowEndIso = toIsoDate(windowEnd);

  const holidays = await listHolidaySet();
  const holidayNames = await loadHolidayNames();

  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = addDays(windowStart, i);
    const iso = toIsoDate(d);
    const dow = d.getUTCDay();
    return {
      date: iso,
      day_of_week: DAY_NAMES[dow],
      is_weekend: dow === 0 || dow === 6,
      holiday_name: holidayNames.get(iso) ?? null,
    };
  });

  const sections = await prisma.schedule_sections.findMany({ orderBy: { sort_order: "asc" } });
  const activities = await prisma.schedule_activities.findMany({
    where: { section_id: { in: sections.map((s) => s.id) } },
    orderBy: [{ schedule_sections: { sort_order: "asc" } }, { sort_order: "asc" }],
  });
  const overridesRows = await prisma.schedule_activity_days.findMany({
    where: { activity_id: { in: activities.map((a) => a.id) } },
  });

  const overridesByActivity = new Map<string, typeof overridesRows>();
  for (const row of overridesRows) {
    const list = overridesByActivity.get(row.activity_id) ?? [];
    list.push(row);
    overridesByActivity.set(row.activity_id, list);
  }

  const crewTotals = new Map<string, number>(days.map((d) => [d.date, 0]));
  const daysByActivity = new Map<string, number>();

  const activitiesBySection = new Map<string, ReturnType<typeof buildActivityCell>[]>();
  for (const activity of activities) {
    const overrides = overridesByActivity.get(activity.id) ?? [];
    const window: ScheduleWindow = {
      entry_mode: activity.entry_mode,
      start_date: activity.start_date,
      end_date: activity.end_date,
      duration_days: activity.duration_days,
    };
    const overrideInputs: DayOverrideInput[] = overrides.map((o) => ({ day: o.day, kind: o.kind as "add" | "exclude" }));
    const resolved = new Set(resolveDaySet(window, holidays, overrideInputs));

    const inWindow = [...resolved].some((iso) => iso >= windowStartIso && iso <= windowEndIso);
    if (!inWindow) continue;

    daysByActivity.set(activity.id, resolved.size);

    const overrideByDay = new Map(overrides.map((o) => [toIsoDate(o.day), o]));
    const cells = days.map((d) => {
      const scheduled = resolved.has(d.date);
      const override = overrideByDay.get(d.date);
      const crew_count = override?.crew_count ?? null;
      if (scheduled && crew_count !== null) {
        crewTotals.set(d.date, (crewTotals.get(d.date) ?? 0) + crew_count);
      }
      return {
        date: d.date,
        scheduled,
        crew_count: scheduled ? crew_count : null,
        marker: scheduled ? (override?.marker ?? null) : null,
      };
    });

    const cell = buildActivityCell(activity, cells);
    const list = activitiesBySection.get(activity.section_id) ?? [];
    list.push(cell);
    activitiesBySection.set(activity.section_id, list);
  }

  const gantt = {
    window: { start: windowStartIso, weeks: params.weeks, days },
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      sort_order: section.sort_order,
      activities: activitiesBySection.get(section.id) ?? [],
    })),
    crew_totals: days.map((d) => ({ date: d.date, total: crewTotals.get(d.date) ?? 0 })),
  };

  return { gantt, daysByActivity };
}

function buildActivityCell(
  activity: {
    id: string;
    code: string | null;
    crew: string | null;
    description: string;
    responsibility: string | null;
    section_id: string;
    night_work: boolean;
    critical_path: boolean;
    shutdown: boolean;
    budget_mh: { toString(): string } | null;
    burned_mh: { toString(): string } | null;
  },
  cells: { date: string; scheduled: boolean; crew_count: number | null; marker: string | null }[],
) {
  return {
    id: activity.id,
    code: activity.code,
    crew: activity.crew,
    description: activity.description,
    responsibility: activity.responsibility,
    section_id: activity.section_id,
    night_work: activity.night_work,
    critical_path: activity.critical_path,
    shutdown: activity.shutdown,
    cells,
  };
}

async function loadHolidayNames(): Promise<Map<string, string>> {
  const rows = await prisma.schedule_holidays.findMany();
  return new Map(rows.map((r) => [toIsoDate(r.day), r.name]));
}
