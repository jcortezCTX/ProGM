import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type StructureSortField = "name" | "created_at";

export interface ListStructuresParams {
  cursor?: string;
  limit: number;
  sort?: StructureSortField;
  order: "asc" | "desc";
  q?: string;
}

function cursorValue(row: Record<string, unknown>, sortField: string): string | number | null {
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

export interface StructureInput {
  name?: string;
  est_cy?: string | number | null;
  est_cost?: string | number | null;
}

export async function listStructures(params: ListStructuresParams) {
  const sortField = params.sort ?? "name";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor),
    params.q ? { name: { contains: params.q, mode: "insensitive" as const } } : {},
  );

  const rows = await prisma.concrete_structures.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  return { data: page, hasMore, nextCursor };
}

export async function getStructure(id: string) {
  const row = await prisma.concrete_structures.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`Structure ${id} not found`);
  return row;
}

// Used by the import script to upsert distinct "Structure" values seen on
// pour rows (the Summary Sheet's own structure column is unpopulated).
export async function upsertStructure(name: string) {
  return prisma.concrete_structures.upsert({
    where: { name },
    create: { name },
    update: {},
  });
}

export async function createStructure(input: StructureInput) {
  if (!input.name) throw new Error("name is required");
  const existing = await prisma.concrete_structures.findUnique({ where: { name: input.name } });
  if (existing) throw new ConflictError(`Structure ${input.name} already exists`);

  return prisma.concrete_structures.create({ data: { ...input, name: input.name } });
}

export async function updateStructure(id: string, input: StructureInput) {
  const existing = await prisma.concrete_structures.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Structure ${id} not found`);

  return prisma.concrete_structures.update({ where: { id }, data: input });
}

export async function deleteStructure(id: string) {
  const existing = await prisma.concrete_structures.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Structure ${id} not found`);

  await prisma.concrete_structures.delete({ where: { id } });
}
