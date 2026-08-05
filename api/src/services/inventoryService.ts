import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate, type CursorPayload } from "../lib/listQuery.js";

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

type InventorySortField = "name" | "sku" | "price" | "quantity_on_hand";

export interface ListItemsParams {
  cursor?: string;
  limit: number;
  sort?: InventorySortField;
  order: "asc" | "desc";
  q?: string;
  tag?: string;
  low_stock?: "true" | "false";
}

// Free-text search spans the fields someone would type a fragment of when
// looking for an item, not every column.
const SEARCH_FIELDS = ["sku", "name", "description", "barcode"] as const;

// name/sku/price are all NOT NULL columns on inventory_items.
const FLAT_SORT_FIELDS = ["name", "sku", "price"] as const;
type FlatSortField = (typeof FLAT_SORT_FIELDS)[number];

function isFlatSortField(field: InventorySortField): field is FlatSortField {
  return (FLAT_SORT_FIELDS as readonly string[]).includes(field);
}

async function stockByItemIds(itemIds: string[]): Promise<Map<string, Prisma.Decimal>> {
  if (itemIds.length === 0) return new Map();
  const rows = await prisma.inventory_current_stock.findMany({ where: { item_id: { in: itemIds } } });
  const stockByItem = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (!row.item_id) continue;
    const running = stockByItem.get(row.item_id) ?? new Prisma.Decimal(0);
    stockByItem.set(row.item_id, running.plus(row.quantity_on_hand ?? 0));
  }
  return stockByItem;
}

async function tagsByItemIds(itemIds: string[]): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await prisma.inventory_item_tags.findMany({
    where: { item_id: { in: itemIds } },
    include: { inventory_tags: true },
  });
  const tagsByItem = new Map<string, string[]>();
  for (const row of rows) {
    const list = tagsByItem.get(row.item_id) ?? [];
    list.push(row.inventory_tags.name);
    tagsByItem.set(row.item_id, list);
  }
  return tagsByItem;
}

// Fast path: sort field is a plain, directly-comparable column. Stock is
// attached afterward, batched only over the returned page's item ids
// (bounded to `limit`, not the whole table like the pre-pagination version).
async function listItemsFlatSort(params: ListItemsParams & { sort?: FlatSortField }) {
  const sortField = params.sort ?? "name";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
    params.tag ? { inventory_item_tags: { some: { inventory_tags: { name: params.tag } } } } : {},
  );

  const rows = await prisma.inventory_items.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => {
    const raw = row[sortField];
    const v = raw instanceof Prisma.Decimal ? raw.toString() : raw;
    return { v, id: row.id };
  });

  const pageIds = page.map((item) => item.id);
  const [stockByItem, tagsByItem] = await Promise.all([stockByItemIds(pageIds), tagsByItemIds(pageIds)]);

  const data = page.map((item) => {
    const quantityOnHand = stockByItem.get(item.id) ?? new Prisma.Decimal(0);
    return {
      ...item,
      quantity_on_hand: quantityOnHand,
      total_value: quantityOnHand.times(item.price),
      low_stock: quantityOnHand.lessThan(item.reorder_threshold),
      tags: tagsByItem.get(item.id) ?? [],
    };
  });

  return { data, hasMore, nextCursor };
}

// quantity_on_hand isn't a column - it's SUM(quantity) from
// inventory_transactions via the inventory_current_stock view (CLAUDE.md:
// stock is derived, never stored). Sorting or filtering (low_stock) on it
// needs a raw query joining inventory_items against a per-item aggregation
// of that existing view - still fully reusing the view's derived logic,
// not re-deriving stock a second way. Every value interpolated below goes
// through Prisma.sql's parameter binding, never string concatenation.
const SORT_EXPR: Record<InventorySortField, string> = {
  name: "ii.name",
  sku: "ii.sku",
  price: "ii.price",
  quantity_on_hand: "COALESCE(stock.total, 0)",
};

// price/quantity_on_hand compare against a NUMERIC column - Postgres has no
// `numeric > text` operator, so a cursor value bound as text (the default
// for a JS string parameter) fails on any page past the first. name/sku
// compare against text columns and need no cast.
const NUMERIC_SORT_FIELDS = new Set<InventorySortField>(["price", "quantity_on_hand"]);

interface RawItemRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorder_threshold: Prisma.Decimal;
  price: Prisma.Decimal;
  notes: string | null;
  barcode: string | null;
  product_link: string | null;
  custom_fields: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
  quantity_on_hand: Prisma.Decimal;
}

function keysetClauseRaw(
  sortExpr: string,
  order: "asc" | "desc",
  cursor: CursorPayload | null,
  numeric: boolean,
): Prisma.Sql {
  if (!cursor) return Prisma.sql`TRUE`;
  const cmp = order === "asc" ? Prisma.sql`>` : Prisma.sql`<`;
  const expr = Prisma.raw(sortExpr);
  const value = numeric ? Prisma.sql`(${cursor.v}::text)::numeric` : Prisma.sql`${cursor.v}`;
  return Prisma.sql`(${expr} ${cmp} ${value} OR (${expr} = ${value} AND ii.id ${cmp} ${cursor.id}::uuid))`;
}

// Handles any sort field (including the flat ones) whenever a low_stock
// filter is present, since that filter itself needs the derived stock
// value in scope - one unified query rather than a third branch.
async function listItemsDerivedPath(params: ListItemsParams) {
  const sortField = params.sort ?? "name";
  const cursor = decodeCursor(params.cursor);
  const sortExpr = SORT_EXPR[sortField];
  const orderDir = params.order === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");

  const searchClause = params.q
    ? Prisma.sql`(ii.sku ILIKE ${"%" + params.q + "%"} OR ii.name ILIKE ${"%" + params.q + "%"} OR ii.description ILIKE ${"%" + params.q + "%"} OR ii.barcode ILIKE ${"%" + params.q + "%"})`
    : Prisma.sql`TRUE`;

  const tagClause = params.tag
    ? Prisma.sql`EXISTS (SELECT 1 FROM inventory_item_tags iit JOIN inventory_tags it ON it.id = iit.tag_id WHERE iit.item_id = ii.id AND it.name = ${params.tag})`
    : Prisma.sql`TRUE`;

  const lowStockClause =
    params.low_stock === "true"
      ? Prisma.sql`COALESCE(stock.total, 0) < ii.reorder_threshold`
      : params.low_stock === "false"
        ? Prisma.sql`COALESCE(stock.total, 0) >= ii.reorder_threshold`
        : Prisma.sql`TRUE`;

  const whereClause = Prisma.join(
    [
      searchClause,
      tagClause,
      lowStockClause,
      keysetClauseRaw(sortExpr, params.order, cursor, NUMERIC_SORT_FIELDS.has(sortField)),
    ],
    " AND ",
  );

  const rows = await prisma.$queryRaw<RawItemRow[]>`
    SELECT ii.id, ii.sku, ii.name, ii.description, ii.unit, ii.reorder_threshold, ii.price,
           ii.notes, ii.barcode, ii.product_link, ii.custom_fields, ii.created_at, ii.updated_at,
           COALESCE(stock.total, 0) AS quantity_on_hand
    FROM inventory_items ii
    LEFT JOIN (
      SELECT item_id, SUM(quantity_on_hand) AS total FROM inventory_current_stock GROUP BY item_id
    ) stock ON stock.item_id = ii.id
    WHERE ${whereClause}
    ORDER BY ${Prisma.raw(sortExpr)} ${orderDir}, ii.id ${orderDir}
    LIMIT ${params.limit + 1}
  `;

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => {
    const v = NUMERIC_SORT_FIELDS.has(sortField) ? row[sortField].toString() : String(row[sortField]);
    return { v, id: row.id };
  });

  const pageIds = page.map((item) => item.id);
  const tagsByItem = await tagsByItemIds(pageIds);

  const data = page.map((item) => {
    const quantityOnHand = new Prisma.Decimal(item.quantity_on_hand);
    return {
      ...item,
      price: new Prisma.Decimal(item.price),
      reorder_threshold: new Prisma.Decimal(item.reorder_threshold),
      quantity_on_hand: quantityOnHand,
      total_value: quantityOnHand.times(item.price),
      low_stock: quantityOnHand.lessThan(item.reorder_threshold),
      tags: tagsByItem.get(item.id) ?? [],
    };
  });

  return { data, hasMore, nextCursor };
}

export async function listItems(params: ListItemsParams) {
  const needsDerivedPath = params.sort === "quantity_on_hand" || params.low_stock !== undefined;
  if (needsDerivedPath) return listItemsDerivedPath(params);
  const sortField = params.sort ?? "name";
  return listItemsFlatSort({ ...params, sort: isFlatSortField(sortField) ? sortField : undefined });
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
