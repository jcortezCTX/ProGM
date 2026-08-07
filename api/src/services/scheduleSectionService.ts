import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export interface SectionInput {
  name?: string;
  sort_order?: number;
}

function isRestrictedDeleteError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2003"
  );
}

export async function listSections() {
  return prisma.schedule_sections.findMany({ orderBy: { sort_order: "asc" } });
}

export async function getSection(id: string) {
  const row = await prisma.schedule_sections.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`Section ${id} not found`);
  return row;
}

export async function createSection(input: SectionInput) {
  if (!input.name) throw new Error("name is required");
  const existing = await prisma.schedule_sections.findUnique({ where: { name: input.name } });
  if (existing) throw new ConflictError(`Section ${input.name} already exists`);

  const sort_order = input.sort_order ?? (await nextSortOrder());
  return prisma.schedule_sections.create({ data: { name: input.name, sort_order } });
}

async function nextSortOrder(): Promise<number> {
  const last = await prisma.schedule_sections.findFirst({ orderBy: { sort_order: "desc" } });
  return last ? last.sort_order + 1 : 0;
}

export async function updateSection(id: string, input: SectionInput) {
  const existing = await prisma.schedule_sections.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Section ${id} not found`);

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.schedule_sections.findUnique({ where: { name: input.name } });
    if (clash) throw new ConflictError(`Section ${input.name} already exists`);
  }

  return prisma.schedule_sections.update({ where: { id }, data: input });
}

// Restrict delete: reassign activities off this section first
// (SCHEDULE_SPEC.md - the FK is onDelete: Restrict).
export async function deleteSection(id: string) {
  const existing = await prisma.schedule_sections.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Section ${id} not found`);

  try {
    await prisma.schedule_sections.delete({ where: { id } });
  } catch (err) {
    if (isRestrictedDeleteError(err)) {
      throw new ConflictError(`Section ${id} still has activities assigned - reassign them first`);
    }
    throw err;
  }
}

export async function reorderSections(ids: string[]) {
  const existing = await prisma.schedule_sections.findMany({ where: { id: { in: ids } } });
  if (existing.length !== ids.length) {
    throw new NotFoundError("one or more section ids do not exist");
  }
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error("duplicate ids in reorder list");
  }

  await prisma.$transaction(ids.map((id, index) => prisma.schedule_sections.update({ where: { id }, data: { sort_order: index } })));
  return listSections();
}
