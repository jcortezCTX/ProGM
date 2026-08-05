import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type MixDesignSortField = "supplier" | "mix_number" | "design_strength_psi" | "created_at";

export interface ListMixDesignsParams {
  cursor?: string;
  limit: number;
  sort?: MixDesignSortField;
  order: "asc" | "desc";
  q?: string;
  active?: boolean;
}

const SEARCH_FIELDS = ["supplier", "mix_number", "concrete_class", "mix_type", "type_of_work"] as const;
const NULLABLE_SORT_FIELDS = new Set<MixDesignSortField>(["design_strength_psi"]);

function cursorValue(row: Record<string, unknown>, sortField: string): string | number | null {
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

export interface MixDesignInput {
  supplier?: string;
  concrete_class?: string | null;
  mix_type?: string | null;
  mix_number?: string;
  type_of_work?: string | null;
  design_strength_psi?: number | null;
  slump_range?: string | null;
  air_range?: string | null;
  active?: boolean;
}

export async function listMixDesigns(params: ListMixDesignsParams) {
  const sortField = params.sort ?? "supplier";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor, { nullable: NULLABLE_SORT_FIELDS.has(sortField) }),
    params.active !== undefined ? { active: params.active } : {},
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
  );

  const rows = await prisma.concrete_mix_designs.findMany({
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

export async function getMixDesign(id: string) {
  const row = await prisma.concrete_mix_designs.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`Mix design ${id} not found`);
  return row;
}

// Used by the import script to upsert mix numbers referenced by a pour but
// absent from the Mix Designs sheet (see CONCRETE_LOG_SPEC.md).
export async function upsertMixDesign(supplier: string, mixNumber: string, input: Partial<MixDesignInput> = {}) {
  return prisma.concrete_mix_designs.upsert({
    where: { supplier_mix_number: { supplier, mix_number: mixNumber } },
    create: { supplier, mix_number: mixNumber, ...input },
    update: {},
  });
}

export async function createMixDesign(input: MixDesignInput) {
  if (!input.supplier || !input.mix_number) {
    throw new Error("supplier and mix_number are required");
  }
  const existing = await prisma.concrete_mix_designs.findUnique({
    where: { supplier_mix_number: { supplier: input.supplier, mix_number: input.mix_number } },
  });
  if (existing) throw new ConflictError(`Mix design ${input.supplier}/${input.mix_number} already exists`);

  return prisma.concrete_mix_designs.create({
    data: { ...input, supplier: input.supplier, mix_number: input.mix_number },
  });
}

export async function updateMixDesign(id: string, input: MixDesignInput) {
  const existing = await prisma.concrete_mix_designs.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Mix design ${id} not found`);

  return prisma.concrete_mix_designs.update({ where: { id }, data: input });
}

export async function deleteMixDesign(id: string) {
  const existing = await prisma.concrete_mix_designs.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Mix design ${id} not found`);

  await prisma.concrete_mix_designs.delete({ where: { id } });
}
