import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export type InventoryTransactionType = "received" | "issued" | "adjustment" | "delivered_out";
type DecimalInput = string | number | Prisma.Decimal;

export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class ConflictError extends Error {}

// received/issued/delivered_out take a positive magnitude and this derives the
// signed delta stored in inventory_transactions.quantity; adjustment passes
// its signed delta straight through since it corrects drift either direction.
function signedQuantity(type: InventoryTransactionType, quantity: DecimalInput): Prisma.Decimal {
  const magnitude = new Prisma.Decimal(quantity);
  switch (type) {
    case "received":
      return magnitude.abs();
    case "issued":
    case "delivered_out":
      return magnitude.abs().negated();
    case "adjustment":
      return magnitude;
  }
}

async function stockRowsForItem(itemId: string) {
  return prisma.inventory_current_stock.findMany({ where: { item_id: itemId } });
}

function totalStock(rows: { quantity_on_hand: Prisma.Decimal | null }[]): Prisma.Decimal {
  return rows.reduce((sum, row) => sum.plus(row.quantity_on_hand ?? 0), new Prisma.Decimal(0));
}

export async function listItems() {
  const [items, stockRows] = await Promise.all([
    prisma.inventory_items.findMany({ orderBy: { name: "asc" } }),
    prisma.inventory_current_stock.findMany(),
  ]);

  const stockByItem = new Map<string, Prisma.Decimal>();
  for (const row of stockRows) {
    if (!row.item_id) continue;
    const running = stockByItem.get(row.item_id) ?? new Prisma.Decimal(0);
    stockByItem.set(row.item_id, running.plus(row.quantity_on_hand ?? 0));
  }

  return items.map((item) => {
    const quantityOnHand = stockByItem.get(item.id) ?? new Prisma.Decimal(0);
    return {
      ...item,
      quantity_on_hand: quantityOnHand,
      low_stock: quantityOnHand.lessThan(item.reorder_threshold),
    };
  });
}

export async function createItem(input: {
  sku: string;
  name: string;
  description?: string | null;
  unit?: string;
  reorder_threshold?: DecimalInput;
}) {
  try {
    return await prisma.inventory_items.create({
      data: {
        sku: input.sku,
        name: input.name,
        description: input.description ?? null,
        unit: input.unit ?? "each",
        reorder_threshold: input.reorder_threshold ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(`Inventory item with sku ${input.sku} already exists`);
    }
    throw err;
  }
}

export async function getItem(itemId: string) {
  const item = await prisma.inventory_items.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError(`Inventory item ${itemId} not found`);

  const stockRows = await stockRowsForItem(itemId);
  return {
    ...item,
    quantity_on_hand: totalStock(stockRows),
    stock_by_location: stockRows.map((row) => ({
      location: row.location,
      quantity_on_hand: row.quantity_on_hand ?? new Prisma.Decimal(0),
    })),
  };
}

export async function recordTransaction(input: {
  item_id: string;
  type: InventoryTransactionType;
  quantity: DecimalInput;
  location?: string;
  note?: string | null;
  created_by?: string | null;
}) {
  const item = await prisma.inventory_items.findUnique({ where: { id: input.item_id } });
  if (!item) throw new NotFoundError(`Inventory item ${input.item_id} not found`);

  const quantity = signedQuantity(input.type, input.quantity);
  if (quantity.isZero()) {
    throw new ValidationError("Transaction quantity must not be zero");
  }

  return prisma.inventory_transactions.create({
    data: {
      item_id: input.item_id,
      type: input.type,
      quantity,
      location: input.location ?? "main",
      note: input.note ?? null,
      created_by: input.created_by ?? null,
    },
  });
}

export async function getTransactionHistory(itemId: string) {
  const item = await prisma.inventory_items.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError(`Inventory item ${itemId} not found`);

  return prisma.inventory_transactions.findMany({
    where: { item_id: itemId },
    orderBy: { created_at: "desc" },
  });
}

export const _internal = { signedQuantity, totalStock };
