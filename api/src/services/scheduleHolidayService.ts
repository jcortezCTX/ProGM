import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export interface HolidayInput {
  day: string;
  name: string;
}

export async function listHolidays() {
  return prisma.schedule_holidays.findMany({ orderBy: { day: "asc" } });
}

// Used by the Gantt/day-set resolution to know which dates to skip.
export async function listHolidaySet(): Promise<Set<string>> {
  const rows = await prisma.schedule_holidays.findMany({ select: { day: true } });
  return new Set(rows.map((r) => r.day.toISOString().slice(0, 10)));
}

export async function createHoliday(input: HolidayInput) {
  const existing = await prisma.schedule_holidays.findUnique({ where: { day: new Date(input.day) } });
  if (existing) throw new ConflictError(`Holiday already exists on ${input.day}`);

  return prisma.schedule_holidays.create({ data: { day: new Date(input.day), name: input.name } });
}

export async function deleteHoliday(id: string) {
  const existing = await prisma.schedule_holidays.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Holiday ${id} not found`);

  await prisma.schedule_holidays.delete({ where: { id } });
}
