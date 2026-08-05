import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";

export class NotFoundError extends Error {}

type SortField = "rental_date" | "location" | "created_at";

export interface ListPumpTruckRentalsParams {
  cursor?: string;
  limit: number;
  sort?: SortField;
  order: "asc" | "desc";
  q?: string;
}

const SEARCH_FIELDS = ["location", "truck_size_requested", "truck_size_sent", "invoice_number", "notes"] as const;

function cursorValue(row: Record<string, unknown>, sortField: string): string | number | null {
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

type DecimalInput = string | number;

export interface PumpTruckRentalInput {
  rental_date?: string;
  location?: string;
  truck_size_requested?: string | null;
  truck_size_sent?: string | null;
  hours?: DecimalInput | null;
  invoice_number?: string | null;
  amount?: DecimalInput | null;
  cubic_yards?: DecimalInput | null;
  date_approved?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

const DATE_FIELDS = ["rental_date", "date_approved"] as const;

function toWriteData(input: PumpTruckRentalInput) {
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

// $/CY is derived here, never stored - null when cubic_yards is null or zero
// (division by zero would otherwise produce Infinity/NaN in the response).
function withDerived<T extends { amount: unknown; cubic_yards: unknown }>(row: T) {
  const amount = row.amount === null || row.amount === undefined ? null : Number(row.amount);
  const cubicYards = row.cubic_yards === null || row.cubic_yards === undefined ? null : Number(row.cubic_yards);
  const per_cy = amount === null || cubicYards === null || cubicYards === 0 ? null : amount / cubicYards;
  return { ...row, per_cy };
}

export async function listPumpTruckRentals(params: ListPumpTruckRentalsParams) {
  const sortField = params.sort ?? "rental_date";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
  );

  const rows = await prisma.pump_truck_rentals.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  return { data: page.map(withDerived), hasMore, nextCursor };
}

export async function getPumpTruckRental(id: string) {
  const row = await prisma.pump_truck_rentals.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`Pump truck rental ${id} not found`);
  return withDerived(row);
}

export async function createPumpTruckRental(input: PumpTruckRentalInput) {
  if (!input.rental_date || !input.location) {
    throw new Error("rental_date and location are required");
  }
  const row = await prisma.pump_truck_rentals.create({
    data: toWriteData(input) as Prisma.pump_truck_rentalsUncheckedCreateInput,
  });
  return withDerived(row);
}

export async function updatePumpTruckRental(id: string, input: PumpTruckRentalInput) {
  const existing = await prisma.pump_truck_rentals.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Pump truck rental ${id} not found`);

  const row = await prisma.pump_truck_rentals.update({
    where: { id },
    data: toWriteData(input) as Prisma.pump_truck_rentalsUncheckedUpdateInput,
  });
  return withDerived(row);
}

export async function deletePumpTruckRental(id: string) {
  const existing = await prisma.pump_truck_rentals.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Pump truck rental ${id} not found`);

  await prisma.pump_truck_rentals.delete({ where: { id } });
}
