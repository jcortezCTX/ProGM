import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";
import { getConcreteSettings } from "./concreteSettingsService.js";

export class NotFoundError extends Error {}

// Overdue thresholds (CONCRETE_LOG_SPEC.md "Overdue logic") - kept in one
// place so both the list filter and the per-row badge use the same numbers.
export const SEVEN_DAY_OVERDUE_DAYS = 10;
export const TWENTY_EIGHT_DAY_OVERDUE_DAYS = 35;

type PourSortField = "pour_date" | "created_at";

export interface ListPoursParams {
  cursor?: string;
  limit: number;
  sort?: PourSortField;
  order: "asc" | "desc";
  q?: string;
  month?: string; // "YYYY-MM"
  structure_id?: string;
  is_subcontractor?: boolean;
  poured_by?: string;
  pending_results?: boolean;
}

const SEARCH_FIELDS = ["location", "poured_by", "invoice_number", "notes"] as const;

function cursorValue(row: Record<string, unknown>, sortField: string): string | number | null {
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

function monthRange(month: string): { gte: Date; lt: Date } {
  const [year, mon] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// A pour is N-day overdue if it has at least one sample row (i.e. results
// were expected) but no non-null value yet for that field, and enough time
// has passed since the pour. Expressed as a relation filter so it composes
// with keyset pagination instead of needing a post-fetch filter pass.
function overdueWhere(field: "seven_day_psi" | "twenty_eight_day_psi", thresholdDays: number) {
  return {
    pour_date: { lt: daysAgo(thresholdDays) },
    concrete_samples: { some: { [field]: null } },
  };
}

type SampleRow = {
  id: string;
  seven_day_psi: unknown;
  twenty_eight_day_psi: unknown;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleDerived(sample: SampleRow, designStrengthPsi: number) {
  const twentyEightDayPsi = toNumber(sample.twenty_eight_day_psi);
  return {
    result: twentyEightDayPsi === null ? null : twentyEightDayPsi >= designStrengthPsi ? "pass" : "fail",
    margin_above_design: twentyEightDayPsi === null ? null : twentyEightDayPsi - designStrengthPsi,
  };
}

function pourDerived<T extends { pour_date: Date; design_strength_psi: number; yds_required: unknown; yds_delivered: unknown; yds_installed: unknown; concrete_samples: SampleRow[] }>(
  pour: T,
) {
  const required = toNumber(pour.yds_required);
  const delivered = toNumber(pour.yds_delivered);
  const installed = toNumber(pour.yds_installed);
  const samples = pour.concrete_samples;

  const sevenDayValues = samples.map((s) => toNumber(s.seven_day_psi)).filter((v): v is number => v !== null);
  const twentyEightDayValues = samples
    .map((s) => toNumber(s.twenty_eight_day_psi))
    .filter((v): v is number => v !== null);

  const now = Date.now();
  const daysSincePour = (now - pour.pour_date.getTime()) / (24 * 60 * 60 * 1000);

  const { concrete_samples, ...rest } = pour;

  return {
    ...rest,
    month: `${pour.pour_date.getUTCFullYear()}-${String(pour.pour_date.getUTCMonth() + 1).padStart(2, "0")}`,
    over_under_required: installed === null || required === null ? null : installed - required,
    waste: delivered === null || installed === null ? null : delivered - installed,
    sample_count: samples.length,
    seven_day_avg: average(sevenDayValues),
    twenty_eight_day_avg: average(twentyEightDayValues),
    seven_day_overdue:
      samples.length > 0 && daysSincePour > SEVEN_DAY_OVERDUE_DAYS && samples.some((s) => s.seven_day_psi === null),
    twenty_eight_day_overdue:
      samples.length > 0 &&
      daysSincePour > TWENTY_EIGHT_DAY_OVERDUE_DAYS &&
      samples.some((s) => s.twenty_eight_day_psi === null),
    samples: samples.map((s) => ({ ...s, ...sampleDerived(s, pour.design_strength_psi) })),
  };
}

export async function listPours(params: ListPoursParams) {
  const sortField = params.sort ?? "pour_date";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor),
    params.month ? { pour_date: monthRange(params.month) } : {},
    params.structure_id ? { structure_id: params.structure_id } : {},
    params.is_subcontractor !== undefined ? { is_subcontractor: params.is_subcontractor } : {},
    params.poured_by ? { poured_by: params.poured_by } : {},
    params.pending_results
      ? {
          OR: [
            overdueWhere("seven_day_psi", SEVEN_DAY_OVERDUE_DAYS),
            overdueWhere("twenty_eight_day_psi", TWENTY_EIGHT_DAY_OVERDUE_DAYS),
          ],
        }
      : {},
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
  );

  const rows = await prisma.concrete_pours.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
    include: { concrete_samples: true },
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  return { data: page.map(pourDerived), hasMore, nextCursor };
}

export async function getPour(id: string) {
  const pour = await prisma.concrete_pours.findUnique({
    where: { id },
    include: { concrete_samples: { orderBy: { created_at: "asc" } } },
  });
  if (!pour) throw new NotFoundError(`Pour ${id} not found`);
  return pourDerived(pour);
}

type DecimalInput = string | number;

export interface PourInput {
  pour_date?: string;
  location?: string;
  structure_id?: string | null;
  mix_design_id?: string | null;
  design_strength_psi?: number;
  yds_required?: DecimalInput | null;
  yds_delivered?: DecimalInput | null;
  yds_installed?: DecimalInput | null;
  is_subcontractor?: boolean;
  poured_by?: string | null;
  invoice_number?: string | null;
  invoice_total?: DecimalInput | null;
  notes?: string | null;
  created_by?: string | null;
}

const DATE_FIELDS = ["pour_date"] as const;

function toWriteData(input: PourInput) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value !== null && (DATE_FIELDS as readonly string[]).includes(key)) {
      data[key] = new Date(value as string);
    } else {
      data[key] = value;
    }
  }
  return data;
}

export async function createPour(input: PourInput) {
  if (!input.pour_date || !input.location || input.design_strength_psi === undefined) {
    throw new Error("pour_date, location, and design_strength_psi are required");
  }
  // Required-ness already checked above (Zod also enforces it at the route
  // boundary) - the cast just tells Prisma's generated types what toWriteData
  // already guarantees at runtime.
  const pour = await prisma.concrete_pours.create({
    data: toWriteData(input) as Prisma.concrete_poursUncheckedCreateInput,
  });
  return getPour(pour.id);
}

export async function updatePour(id: string, input: PourInput) {
  const existing = await prisma.concrete_pours.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Pour ${id} not found`);

  await prisma.concrete_pours.update({
    where: { id },
    data: toWriteData(input) as Prisma.concrete_poursUncheckedUpdateInput,
  });
  return getPour(id);
}

export async function deletePour(id: string) {
  const existing = await prisma.concrete_pours.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Pour ${id} not found`);

  await prisma.concrete_pours.delete({ where: { id } });
}

export interface SampleInput {
  report_number?: string | null;
  seven_day_psi?: DecimalInput | null;
  seven_day_entered_on?: string | null;
  twenty_eight_day_psi?: DecimalInput | null;
  twenty_eight_day_entered_on?: string | null;
  notes?: string | null;
}

const SAMPLE_DATE_FIELDS = ["seven_day_entered_on", "twenty_eight_day_entered_on"] as const;

function toSampleWriteData(input: SampleInput) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value !== null && (SAMPLE_DATE_FIELDS as readonly string[]).includes(key)) {
      data[key] = new Date(value as string);
    } else {
      data[key] = value;
    }
  }
  return data;
}

export async function listPourSamples(pourId: string) {
  const pour = await prisma.concrete_pours.findUnique({ where: { id: pourId } });
  if (!pour) throw new NotFoundError(`Pour ${pourId} not found`);

  const samples = await prisma.concrete_samples.findMany({ where: { pour_id: pourId }, orderBy: { created_at: "asc" } });
  return samples.map((s) => ({ ...s, ...sampleDerived(s, pour.design_strength_psi) }));
}

export async function addSample(pourId: string, input: SampleInput) {
  const pour = await prisma.concrete_pours.findUnique({ where: { id: pourId } });
  if (!pour) throw new NotFoundError(`Pour ${pourId} not found`);

  const sample = await prisma.concrete_samples.create({ data: { ...toSampleWriteData(input), pour_id: pourId } });
  return { ...sample, ...sampleDerived(sample, pour.design_strength_psi) };
}

export async function updateSample(id: string, input: SampleInput) {
  const existing = await prisma.concrete_samples.findUnique({ where: { id }, include: { concrete_pours: true } });
  if (!existing) throw new NotFoundError(`Sample ${id} not found`);

  const sample = await prisma.concrete_samples.update({ where: { id }, data: toSampleWriteData(input) });
  return { ...sample, ...sampleDerived(sample, existing.concrete_pours.design_strength_psi) };
}

export async function deleteSample(id: string) {
  const existing = await prisma.concrete_samples.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Sample ${id} not found`);

  await prisma.concrete_samples.delete({ where: { id } });
}

// ---- Dashboard summary ----

export async function getConcreteSummary() {
  const [settings, pours, structures] = await Promise.all([
    getConcreteSettings(),
    prisma.concrete_pours.findMany({ include: { concrete_samples: true } }),
    prisma.concrete_structures.findMany(),
  ]);

  const totalCyPlaced = pours.reduce((sum, p) => sum + (toNumber(p.yds_installed) ?? 0), 0);
  const totalEstCy = toNumber(settings?.total_est_cy ?? null);
  const percentComplete = totalEstCy && totalEstCy > 0 ? (totalCyPlaced / totalEstCy) * 100 : null;

  const monthlyMap = new Map<string, number>();
  for (const p of pours) {
    const month = `${p.pour_date.getUTCFullYear()}-${String(p.pour_date.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + (toNumber(p.yds_installed) ?? 0));
  }
  const monthly = [...monthlyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, cy]) => ({ month, cy }));

  const structureRows = structures.map((s) => {
    const structurePours = pours.filter((p) => p.structure_id === s.id);
    const jtdYds = structurePours.reduce((sum, p) => sum + (toNumber(p.yds_installed) ?? 0), 0);
    const jtdCost = structurePours.reduce((sum, p) => sum + (toNumber(p.invoice_total) ?? 0), 0);
    const estCy = toNumber(s.est_cy);
    const estCost = toNumber(s.est_cost);
    return {
      id: s.id,
      name: s.name,
      est_cy: estCy,
      est_cost: estCost,
      jtd_yds: jtdYds,
      jtd_cost: jtdCost,
      diff_cy: estCy === null ? null : jtdYds - estCy,
      diff_cost: estCost === null ? null : jtdCost - estCost,
      est_rate: estCy ? (estCost ?? 0) / estCy : null,
      actual_rate: jtdYds ? jtdCost / jtdYds : null,
    };
  });

  let passCount = 0;
  let failCount = 0;
  const margins: number[] = [];
  for (const p of pours) {
    for (const s of p.concrete_samples) {
      const psi = toNumber(s.twenty_eight_day_psi);
      if (psi === null) continue;
      if (psi >= p.design_strength_psi) passCount++;
      else failCount++;
      margins.push(psi - p.design_strength_psi);
    }
  }
  const totalResults = passCount + failCount;

  return {
    total_cy_placed: totalCyPlaced,
    total_est_cy: totalEstCy,
    percent_complete: percentComplete,
    monthly,
    structures: structureRows,
    pass_count: passCount,
    fail_count: failCount,
    pass_rate: totalResults > 0 ? (passCount / totalResults) * 100 : null,
    avg_margin_above_design: average(margins),
  };
}

// ---- Weekly report ----

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function upcomingFriday(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (5 - day + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export async function getWeeklyReport(weekEndingParam?: string) {
  const weekEnding = weekEndingParam ? parseDateOnly(weekEndingParam) : upcomingFriday(new Date());
  const weekStart = new Date(weekEnding);
  weekStart.setUTCDate(weekStart.getUTCDate() - 4);

  const [sevenDaySamples, twentyEightDaySamples] = await Promise.all([
    prisma.concrete_samples.findMany({
      where: { seven_day_entered_on: { gte: weekStart, lte: weekEnding } },
      include: { concrete_pours: true },
      orderBy: { seven_day_entered_on: "asc" },
    }),
    prisma.concrete_samples.findMany({
      where: { twenty_eight_day_entered_on: { gte: weekStart, lte: weekEnding } },
      include: { concrete_pours: true },
      orderBy: { twenty_eight_day_entered_on: "asc" },
    }),
  ]);

  const sevenDayResults = sevenDaySamples.map(({ concrete_pours: pour, ...sample }) => ({
    ...sample,
    pour: { id: pour.id, pour_date: pour.pour_date, location: pour.location, design_strength_psi: pour.design_strength_psi },
  }));

  const twentyEightDayResults = twentyEightDaySamples.map(({ concrete_pours: pour, ...sample }) => ({
    ...sample,
    ...sampleDerived(sample, pour.design_strength_psi),
    pour: { id: pour.id, pour_date: pour.pour_date, location: pour.location, design_strength_psi: pour.design_strength_psi },
  }));

  const passCount = twentyEightDayResults.filter((r) => r.result === "pass").length;
  const failCount = twentyEightDayResults.filter((r) => r.result === "fail").length;

  return {
    week_start: isoDate(weekStart),
    week_ending: isoDate(weekEnding),
    seven_day_results: sevenDayResults,
    twenty_eight_day_results: twentyEightDayResults,
    counts: {
      seven_day_results: sevenDayResults.length,
      twenty_eight_day_pass: passCount,
      twenty_eight_day_fail: failCount,
    },
  };
}
