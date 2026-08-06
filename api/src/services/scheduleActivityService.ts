import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { listHolidaySet } from "./scheduleHolidayService.js";
import {
  type DayOverrideInput,
  type EntryMode,
  type ScheduleWindow,
  firstLastDay,
  fromIsoDate,
  resolveDaySet,
  toIsoDate,
  validateDayOverrides,
} from "./scheduleDaySet.js";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export interface ActivityInput {
  section_id?: string;
  code?: string | null;
  description?: string;
  crew?: string | null;
  responsibility?: string | null;
  notes?: string | null;
  budget_mh?: string | number | null;
  burned_mh?: string | number | null;
  entry_mode?: EntryMode;
  start_date?: string | null;
  end_date?: string | null;
  duration_days?: number | null;
  night_work?: boolean;
  critical_path?: boolean;
  shutdown?: boolean;
  sort_order?: number;
}

export interface ActivitiesListFilters {
  section_id?: string;
  responsibility?: string;
  crew?: string;
  night_work?: boolean;
  critical_path?: boolean;
  shutdown?: boolean;
  scheduled_between?: { from: string; to: string };
}

type ActivityRow = Prisma.schedule_activitiesGetPayload<Record<string, never>>;
type DayRow = { day: Date; kind: string; crew_count: number | null; marker: string | null };

function isCheckConstraintError(err: unknown, constraint: string): boolean {
  return err instanceof Error && err.message.includes(constraint);
}

function toWindow(row: ActivityRow): ScheduleWindow {
  return {
    entry_mode: row.entry_mode,
    start_date: row.start_date,
    end_date: row.end_date,
    duration_days: row.duration_days,
  };
}

// Business-rule cross-check mirroring the DB CHECK constraint
// (schedule_activities_entry_mode_check) - run here so a bad PATCH gets a
// clean 400 with a useful message from the merged row, not a raw Postgres
// error. The DB constraint stays as the ultimate backstop.
function validateEntryModeConsistency(window: ScheduleWindow) {
  if (!window.start_date) return; // unscheduled - always allowed
  if (window.entry_mode === "start_end") {
    if (!window.end_date) throw new ValidationError("end_date is required when entry_mode is start_end and start_date is set");
    if (window.end_date.getTime() < window.start_date.getTime()) {
      throw new ValidationError("end_date must be on or after start_date");
    }
  } else {
    if (!window.duration_days || window.duration_days <= 0) {
      throw new ValidationError("duration_days is required and must be greater than 0 when entry_mode is start_duration and start_date is set");
    }
  }
}

function overridesToDayRows(overrides: DayRow[]): DayOverrideInput[] {
  return overrides.map((o) => ({ day: o.day, kind: o.kind as "add" | "exclude" }));
}

export interface DerivedFields {
  first_day: string | null;
  last_day: string | null;
  days: number;
  delta: string | null;
}

function computeDerived(row: ActivityRow, overrides: DayRow[], holidays: ReadonlySet<string>): DerivedFields {
  const resolved = resolveDaySet(toWindow(row), holidays, overridesToDayRows(overrides));
  const { first, last } = firstLastDay(resolved);
  const delta = row.budget_mh !== null && row.burned_mh !== null ? row.budget_mh.minus(row.burned_mh).toString() : null;
  return { first_day: first, last_day: last, days: resolved.length, delta };
}

function toDecimalInput(v: string | number | null | undefined) {
  if (v === undefined) return undefined;
  return v === null ? null : new Prisma.Decimal(v);
}

function toDbInput(input: ActivityInput) {
  return {
    ...(input.section_id !== undefined ? { section_id: input.section_id } : {}),
    ...(input.code !== undefined ? { code: input.code } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.crew !== undefined ? { crew: input.crew } : {}),
    ...(input.responsibility !== undefined ? { responsibility: input.responsibility } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.budget_mh !== undefined ? { budget_mh: toDecimalInput(input.budget_mh) } : {}),
    ...(input.burned_mh !== undefined ? { burned_mh: toDecimalInput(input.burned_mh) } : {}),
    ...(input.entry_mode !== undefined ? { entry_mode: input.entry_mode } : {}),
    ...(input.start_date !== undefined ? { start_date: input.start_date ? fromIsoDate(input.start_date) : null } : {}),
    ...(input.end_date !== undefined ? { end_date: input.end_date ? fromIsoDate(input.end_date) : null } : {}),
    ...(input.duration_days !== undefined ? { duration_days: input.duration_days } : {}),
    ...(input.night_work !== undefined ? { night_work: input.night_work } : {}),
    ...(input.critical_path !== undefined ? { critical_path: input.critical_path } : {}),
    ...(input.shutdown !== undefined ? { shutdown: input.shutdown } : {}),
    ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
  };
}

export async function listActivities(filters: ActivitiesListFilters) {
  const where: Prisma.schedule_activitiesWhereInput = {
    ...(filters.section_id ? { section_id: filters.section_id } : {}),
    ...(filters.responsibility ? { responsibility: filters.responsibility } : {}),
    ...(filters.crew ? { crew: filters.crew } : {}),
    ...(filters.night_work !== undefined ? { night_work: filters.night_work } : {}),
    ...(filters.critical_path !== undefined ? { critical_path: filters.critical_path } : {}),
    ...(filters.shutdown !== undefined ? { shutdown: filters.shutdown } : {}),
  };

  const rows = await prisma.schedule_activities.findMany({
    where,
    orderBy: [{ schedule_sections: { sort_order: "asc" } }, { sort_order: "asc" }],
  });

  const holidays = await listHolidaySet();
  const overridesByActivity = await loadOverridesByActivity(rows.map((r) => r.id));

  let results = rows.map((row) => ({
    ...row,
    ...computeDerived(row, overridesByActivity.get(row.id) ?? [], holidays),
  }));

  if (filters.scheduled_between) {
    const { from, to } = filters.scheduled_between;
    results = results.filter((row) => {
      if (!row.first_day || !row.last_day) return false;
      return row.first_day <= to && row.last_day >= from;
    });
  }

  return results;
}

async function loadOverridesByActivity(activityIds: string[]): Promise<Map<string, DayRow[]>> {
  if (activityIds.length === 0) return new Map();
  const rows = await prisma.schedule_activity_days.findMany({ where: { activity_id: { in: activityIds } } });
  const map = new Map<string, DayRow[]>();
  for (const row of rows) {
    const list = map.get(row.activity_id) ?? [];
    list.push(row);
    map.set(row.activity_id, list);
  }
  return map;
}

export async function getActivity(id: string) {
  const row = await prisma.schedule_activities.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`Activity ${id} not found`);

  const holidays = await listHolidaySet();
  const overrides = await prisma.schedule_activity_days.findMany({ where: { activity_id: id }, orderBy: { day: "asc" } });
  return { ...row, ...computeDerived(row, overrides, holidays), overrides };
}

export async function createActivity(input: ActivityInput) {
  if (!input.section_id) throw new ValidationError("section_id is required");
  if (!input.description) throw new ValidationError("description is required");
  if (!input.entry_mode) throw new ValidationError("entry_mode is required");

  const section = await prisma.schedule_sections.findUnique({ where: { id: input.section_id } });
  if (!section) throw new ValidationError(`section_id ${input.section_id} does not exist`);

  const window: ScheduleWindow = {
    entry_mode: input.entry_mode,
    start_date: input.start_date ? fromIsoDate(input.start_date) : null,
    end_date: input.end_date ? fromIsoDate(input.end_date) : null,
    duration_days: input.duration_days ?? null,
  };
  validateEntryModeConsistency(window);

  const sort_order = input.sort_order ?? (await nextSortOrder(input.section_id));

  try {
    return await prisma.schedule_activities.create({
      data: {
        ...toDbInput(input),
        section_id: input.section_id,
        description: input.description,
        entry_mode: input.entry_mode,
        sort_order,
      },
    });
  } catch (err) {
    if (isCheckConstraintError(err, "schedule_activities_entry_mode_check")) {
      throw new ValidationError("entry_mode/start_date/end_date/duration_days are inconsistent");
    }
    throw err;
  }
}

async function nextSortOrder(sectionId: string): Promise<number> {
  const last = await prisma.schedule_activities.findFirst({ where: { section_id: sectionId }, orderBy: { sort_order: "desc" } });
  return last ? last.sort_order + 1 : 0;
}

export async function updateActivity(id: string, input: ActivityInput) {
  const existing = await prisma.schedule_activities.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Activity ${id} not found`);

  if (input.section_id) {
    const section = await prisma.schedule_sections.findUnique({ where: { id: input.section_id } });
    if (!section) throw new ValidationError(`section_id ${input.section_id} does not exist`);
  }

  const mergedWindow: ScheduleWindow = {
    entry_mode: input.entry_mode ?? existing.entry_mode,
    start_date: input.start_date !== undefined ? (input.start_date ? fromIsoDate(input.start_date) : null) : existing.start_date,
    end_date: input.end_date !== undefined ? (input.end_date ? fromIsoDate(input.end_date) : null) : existing.end_date,
    duration_days: input.duration_days !== undefined ? input.duration_days : existing.duration_days,
  };
  validateEntryModeConsistency(mergedWindow);

  try {
    return await prisma.schedule_activities.update({ where: { id }, data: toDbInput(input) });
  } catch (err) {
    if (isCheckConstraintError(err, "schedule_activities_entry_mode_check")) {
      throw new ValidationError("entry_mode/start_date/end_date/duration_days are inconsistent");
    }
    throw err;
  }
}

export async function deleteActivity(id: string) {
  const existing = await prisma.schedule_activities.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Activity ${id} not found`);

  await prisma.schedule_activities.delete({ where: { id } });
}

export type DayOverrideOp =
  | { action: "upsert"; day: string; kind: "add" | "exclude"; crew_count?: number | null; marker?: string | null }
  | { action: "remove"; day: string };

export async function upsertActivityDays(activityId: string, ops: DayOverrideOp[]) {
  const activity = await prisma.schedule_activities.findUnique({ where: { id: activityId } });
  if (!activity) throw new NotFoundError(`Activity ${activityId} not found`);

  const holidays = await listHolidaySet();
  const window = toWindow(activity);

  const excludeOps = ops.filter((op): op is Extract<DayOverrideOp, { action: "upsert" }> => op.action === "upsert" && op.kind === "exclude");
  const validation = validateDayOverrides(
    window,
    holidays,
    excludeOps.map((op) => ({ day: fromIsoDate(op.day), kind: "exclude" })),
  );
  if (!validation.valid) {
    throw new ValidationError(`exclude override(s) target day(s) not in the generated set: ${validation.invalidDays.join(", ")}`);
  }

  await prisma.$transaction(
    ops.map((op) => {
      if (op.action === "remove") {
        return prisma.schedule_activity_days.deleteMany({ where: { activity_id: activityId, day: fromIsoDate(op.day) } });
      }
      return prisma.schedule_activity_days.upsert({
        where: { activity_id_day: { activity_id: activityId, day: fromIsoDate(op.day) } },
        create: {
          activity_id: activityId,
          day: fromIsoDate(op.day),
          kind: op.kind,
          crew_count: op.crew_count ?? null,
          marker: op.marker ?? null,
        },
        update: { kind: op.kind, crew_count: op.crew_count ?? null, marker: op.marker ?? null },
      });
    }),
  );

  return getActivity(activityId);
}

export const _internal = { toIsoDate, computeDerived, toWindow };
