import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";
import { deriveFulfillment, fulfillmentByLogItemIds } from "./mechanicalLogFulfillment.js";

export class NotFoundError extends Error {}

type MechanicalLogSortField = "tag_number" | "due_date" | "created_at";

export interface ListMechanicalLogItemsParams {
  cursor?: string;
  limit: number;
  sort?: MechanicalLogSortField;
  order: "asc" | "desc";
  q?: string;
  // Powers the "Add items from Mechanical Log" picker (§7.1): the delivery's
  // own requisition is the default filter, with a toggle that widens to the
  // whole log for the ~10% of receipts that were never on it.
  requisition_id?: string;
  unreleased?: boolean;
}

// Free-text search spans the fields someone would actually type a fragment
// of when looking for an entry - not every column. size/area/system are in
// here because the receiving picker searches on them (§7.1).
const SEARCH_FIELDS = ["tag_number", "description", "supplier", "material", "size", "area", "system"] as const;

// tag_number/due_date are nullable columns; created_at is not - keysetWhere
// needs to know which, since it must never emit `{ field: null }` against a
// non-nullable column (Prisma rejects that as an invalid filter).
const NULLABLE_SORT_FIELDS = new Set<MechanicalLogSortField>(["tag_number", "due_date"]);

function cursorValue(item: Record<string, unknown>, sortField: string): string | number | null {
  const raw = item[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

type DecimalInput = string | number;

// Mirrors every column in logs_samples/Mechanical Log.csv - see the model
// comment in schema.prisma for why this is a dedicated table rather than
// routed through inventory_items or the generic custom-log engine.
//
// inventory_item_id is deliberately absent: it is claimed once by the
// receiving service at first receipt and is not user-editable in v1 (§4.1).
export interface MechanicalLogItemInput {
  requisition_id?: string | null;
  release?: string | null;
  supplier?: string | null;
  review?: string | null;
  tag_number?: string | null;
  qty_released?: DecimalInput | null;
  unit?: string | null;
  size?: string | null;
  description?: string | null;
  material?: string | null;
  lining?: string | null;
  coating?: string | null;
  release_date?: string | null;
  due_date?: string | null;
  area?: string | null;
  system?: string | null;
  contract_dwg?: string | null;
  system2?: string | null;
  shop_dwg?: string | null;
  delivered_qty?: DecimalInput | null;
  need_qty?: DecimalInput | null;
  received_on?: string | null;
  received_by?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  estimate_cost?: DecimalInput | null;
  contract_unit_price?: DecimalInput | null;
  contract_extended_price?: DecimalInput | null;
  above_below?: string | null;
  invoice_no?: string | null;
  invoice_unit_price?: DecimalInput | null;
  invoice_extended_price?: DecimalInput | null;
  delta_invoice_contract?: DecimalInput | null;
  qty_invoiced_to_date?: DecimalInput | null;
  created_by?: string | null;
}

const DATE_FIELDS = ["release_date", "due_date", "received_on"] as const;

// PATCH semantics: a field only ends up in the write payload if the caller
// included the key at all, so omitting a field leaves it untouched while
// explicit `null` clears it. Date-shaped strings are converted to Date;
// everything else (including Decimal fields, which Prisma accepts as
// strings/numbers directly) passes through as-is.
function toWriteData(input: MechanicalLogItemInput) {
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

export async function listMechanicalLogItems(params: ListMechanicalLogItemsParams) {
  const sortField = params.sort ?? "tag_number";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor, { nullable: NULLABLE_SORT_FIELDS.has(sortField) }),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
    params.requisition_id ? { requisition_id: params.requisition_id } : {},
    params.unreleased ? { requisition_id: null } : {},
  );

  const rows = await prisma.mechanical_log_items.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
    include: { requisitions: true, inventory_items: true },
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  // Received/outstanding/status come from the view, resolved for the whole page
  // in one query rather than per row (§4.3).
  const fulfillment = await fulfillmentByLogItemIds(page.map((r) => r.id));

  const data = page.map(({ requisitions, inventory_items, ...row }) => ({
    ...row,
    requisition_number: requisitions?.requisition_number ?? null,
    item_sku: inventory_items?.sku ?? null,
    ...deriveFulfillment(row.qty_released, fulfillment.get(row.id)),
  }));

  return { data, hasMore, nextCursor };
}

/**
 * Detail view, including the Procurement panel data (§7.2): the requisition
 * this row was released on, the inventory item it resolved to, and every
 * delivery line that has hit it.
 */
export async function getMechanicalLogItem(id: string) {
  const item = await prisma.mechanical_log_items.findUnique({
    where: { id },
    include: {
      requisitions: true,
      inventory_items: true,
      delivery_line_items: {
        include: { deliveries: true },
        orderBy: { created_at: "asc" },
      },
    },
  });
  if (!item) throw new NotFoundError(`Mechanical log item ${id} not found`);

  const fulfillment = await fulfillmentByLogItemIds([id]);
  const { requisitions, inventory_items, delivery_line_items, ...rest } = item;

  return {
    ...rest,
    requisition_number: requisitions?.requisition_number ?? null,
    item_sku: inventory_items?.sku ?? null,
    item_name: inventory_items?.name ?? null,
    ...deriveFulfillment(rest.qty_released, fulfillment.get(id)),
    delivery_lines: delivery_line_items.map(({ deliveries, ...li }) => ({
      id: li.id,
      delivery_id: li.delivery_id,
      report_number: deliveries.report_number,
      received_date: deliveries.received_date,
      quantity_received: li.quantity_received,
      disposition: li.disposition,
      note: li.note,
    })),
  };
}

export async function createMechanicalLogItem(input: MechanicalLogItemInput) {
  return prisma.mechanical_log_items.create({ data: toWriteData(input) });
}

export async function updateMechanicalLogItem(id: string, input: MechanicalLogItemInput) {
  const existing = await prisma.mechanical_log_items.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Mechanical log item ${id} not found`);

  return prisma.mechanical_log_items.update({ where: { id }, data: toWriteData(input) });
}
