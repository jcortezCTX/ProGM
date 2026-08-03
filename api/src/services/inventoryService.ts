import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export type InventoryTransactionType = "received" | "issued" | "adjustment" | "delivered_out";
export type InventoryCustomFieldType = "text" | "textarea" | "number" | "select" | "checkbox";
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

type ItemWithTags = Prisma.inventory_itemsGetPayload<{
  include: { inventory_item_tags: { include: { inventory_tags: true } } };
}>;

function tagNames(item: ItemWithTags): string[] {
  return item.inventory_item_tags.map((it) => it.inventory_tags.name);
}

export async function listItems() {
  const [items, stockRows] = await Promise.all([
    prisma.inventory_items.findMany({
      orderBy: { name: "asc" },
      include: { inventory_item_tags: { include: { inventory_tags: true } } },
    }),
    prisma.inventory_current_stock.findMany(),
  ]);

  const stockByItem = new Map<string, Prisma.Decimal>();
  for (const row of stockRows) {
    if (!row.item_id) continue;
    const running = stockByItem.get(row.item_id) ?? new Prisma.Decimal(0);
    stockByItem.set(row.item_id, running.plus(row.quantity_on_hand ?? 0));
  }

  return items.map(({ inventory_item_tags: _tags, ...item }) => {
    const quantityOnHand = stockByItem.get(item.id) ?? new Prisma.Decimal(0);
    return {
      ...item,
      quantity_on_hand: quantityOnHand,
      total_value: quantityOnHand.times(item.price),
      low_stock: quantityOnHand.lessThan(item.reorder_threshold),
      tags: tagNames({ ...item, inventory_item_tags: _tags }),
    };
  });
}

export interface CreateItemInput {
  sku: string;
  name: string;
  description?: string | null;
  unit?: string;
  reorder_threshold?: DecimalInput;
  price?: DecimalInput;
  notes?: string | null;
  barcode?: string | null;
  product_link?: string | null;
  custom_fields?: Record<string, unknown>;
  tags?: string[];
}

function mapPrismaWriteError(err: unknown, sku: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.target as string[] | undefined) ?? [];
    if (target.includes("barcode")) {
      throw new ConflictError("Another inventory item already uses this barcode");
    }
    throw new ConflictError(`Inventory item with sku ${sku} already exists`);
  }
  throw err;
}

// Replaces the item's tag set to exactly match `tags`, creating any new tag
// names on the fly. Runs inside the caller's transaction.
async function syncTags(tx: Prisma.TransactionClient, itemId: string, tags: string[]) {
  const uniqueNames = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];

  const tagRows = await Promise.all(
    uniqueNames.map((name) =>
      tx.inventory_tags.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  await tx.inventory_item_tags.deleteMany({ where: { item_id: itemId } });
  if (tagRows.length > 0) {
    await tx.inventory_item_tags.createMany({
      data: tagRows.map((tag) => ({ item_id: itemId, tag_id: tag.id })),
    });
  }
}

export async function createItem(input: CreateItemInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.inventory_items.create({
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit ?? "each",
          reorder_threshold: input.reorder_threshold ?? 0,
          price: input.price ?? 0,
          notes: input.notes ?? null,
          barcode: input.barcode ?? null,
          product_link: input.product_link ?? null,
          custom_fields: (input.custom_fields ?? {}) as Prisma.InputJsonValue,
        },
      });
      if (input.tags) await syncTags(tx, item.id, input.tags);
      return item;
    });
  } catch (err) {
    mapPrismaWriteError(err, input.sku);
  }
}

export interface UpdateItemInput {
  name?: string;
  description?: string | null;
  unit?: string;
  reorder_threshold?: DecimalInput;
  price?: DecimalInput;
  notes?: string | null;
  barcode?: string | null;
  product_link?: string | null;
  custom_fields?: Record<string, unknown>;
  tags?: string[];
}

export async function updateItem(itemId: string, input: UpdateItemInput) {
  const existing = await prisma.inventory_items.findUnique({ where: { id: itemId } });
  if (!existing) throw new NotFoundError(`Inventory item ${itemId} not found`);

  const mergedCustomFields = input.custom_fields
    ? { ...(existing.custom_fields as Record<string, unknown>), ...input.custom_fields }
    : undefined;

  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.inventory_items.update({
        where: { id: itemId },
        data: {
          name: input.name,
          description: input.description,
          unit: input.unit,
          reorder_threshold: input.reorder_threshold,
          price: input.price,
          notes: input.notes,
          barcode: input.barcode,
          product_link: input.product_link,
          custom_fields: mergedCustomFields as Prisma.InputJsonValue | undefined,
        },
      });
      if (input.tags) await syncTags(tx, itemId, input.tags);
      return item;
    });
  } catch (err) {
    mapPrismaWriteError(err, existing.sku);
  }
}

export async function getItem(itemId: string) {
  const item = await prisma.inventory_items.findUnique({
    where: { id: itemId },
    include: { inventory_item_tags: { include: { inventory_tags: true } } },
  });
  if (!item) throw new NotFoundError(`Inventory item ${itemId} not found`);

  const { inventory_item_tags, ...rest } = item;
  const stockRows = await stockRowsForItem(itemId);
  const quantityOnHand = totalStock(stockRows);
  return {
    ...rest,
    quantity_on_hand: quantityOnHand,
    total_value: quantityOnHand.times(rest.price),
    stock_by_location: stockRows.map((row) => ({
      location: row.location,
      quantity_on_hand: row.quantity_on_hand ?? new Prisma.Decimal(0),
    })),
    tags: inventory_item_tags.map((it) => it.inventory_tags.name),
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

export async function listTags() {
  return prisma.inventory_tags.findMany({ orderBy: { name: "asc" } });
}

export async function listCustomFieldDefs() {
  return prisma.inventory_custom_field_defs.findMany({ orderBy: { sort_order: "asc" } });
}

export async function createCustomFieldDef(input: {
  field_key: string;
  label: string;
  field_type: InventoryCustomFieldType;
  options?: string[];
  sort_order?: number;
}) {
  try {
    return await prisma.inventory_custom_field_defs.create({
      data: {
        field_key: input.field_key,
        label: input.label,
        field_type: input.field_type,
        options: input.options ? (input.options as Prisma.InputJsonValue) : undefined,
        sort_order: input.sort_order ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(`Custom field with key ${input.field_key} already exists`);
    }
    throw err;
  }
}

export const _internal = { signedQuantity, totalStock };
