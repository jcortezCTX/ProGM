import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";

export class NotFoundError extends Error {}

type SortField = "date_received" | "date_approved" | "created_at";

export interface ListConcreteCreditsParams {
  cursor?: string;
  limit: number;
  sort?: SortField;
  order: "asc" | "desc";
  q?: string;
}

const NULLABLE_SORT_FIELDS = new Set<SortField>(["date_approved"]);

function cursorValue(row: Record<string, unknown>, sortField: string): string | number | null {
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

type DecimalInput = string | number;

export interface ConcreteCreditInput {
  date_received?: string;
  amount?: DecimalInput;
  date_approved?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

const DATE_FIELDS = ["date_received", "date_approved"] as const;

function toWriteData(input: ConcreteCreditInput) {
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

export async function listConcreteCredits(params: ListConcreteCreditsParams) {
  const sortField = params.sort ?? "date_received";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor, { nullable: NULLABLE_SORT_FIELDS.has(sortField) }),
    params.q ? { notes: { contains: params.q, mode: "insensitive" as const } } : {},
  );

  const rows = await prisma.concrete_credits.findMany({
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

export async function getConcreteCredit(id: string) {
  const row = await prisma.concrete_credits.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`Concrete credit ${id} not found`);
  return row;
}

export async function createConcreteCredit(input: ConcreteCreditInput) {
  if (!input.date_received || input.amount === undefined) {
    throw new Error("date_received and amount are required");
  }
  return prisma.concrete_credits.create({
    data: toWriteData(input) as Prisma.concrete_creditsUncheckedCreateInput,
  });
}

export async function updateConcreteCredit(id: string, input: ConcreteCreditInput) {
  const existing = await prisma.concrete_credits.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Concrete credit ${id} not found`);

  return prisma.concrete_credits.update({
    where: { id },
    data: toWriteData(input) as Prisma.concrete_creditsUncheckedUpdateInput,
  });
}

export async function deleteConcreteCredit(id: string) {
  const existing = await prisma.concrete_credits.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Concrete credit ${id} not found`);

  await prisma.concrete_credits.delete({ where: { id } });
}
