import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate, type CursorPayload } from "../lib/listQuery.js";
import { deriveFulfillment, fulfillmentByLogItemIds } from "./mechanicalLogFulfillment.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}

export type DeliveryLineDisposition = "accept" | "conditional_use" | "reject";
export type DeliveryStatus = "open" | "closed";
type DecimalInput = string | number | Prisma.Decimal;

type DeliverySortField = "report_number" | "received_date" | "status" | "requisition_number";

export interface ListDeliveriesParams {
  cursor?: string;
  limit: number;
  sort?: DeliverySortField;
  order: "asc" | "desc";
  q?: string;
  status?: DeliveryStatus;
}

// Free-text search spans the fields someone would type a fragment of when
// looking for a delivery, not every column. requisition_number lives on the
// related requisition, not a column here, so it's left out of text search
// (it's still sortable - see requisitionNumberWhere below).
const SEARCH_FIELDS = ["supplier", "bill_of_lading_no", "truck_number"] as const;

// requisition_number isn't a column on `deliveries` - it's requisition_number
// on the related (optional) requisitions row - so it needs its own keyset
// shape rather than the flat-column keysetWhere helper. A delivery with no
// linked requisition (requisition_id null) sorts as a null value, same
// nulls-last(asc)/nulls-first(desc) convention as every other nullable sort
// field (see lib/listQuery.ts).
function requisitionNumberWhere(order: "asc" | "desc", cursor: CursorPayload | null): Record<string, unknown> {
  if (!cursor) return {};
  const cmp = order === "asc" ? "gt" : "lt";

  if (cursor.v === null) {
    return order === "asc"
      ? { requisition_id: null, id: { gt: cursor.id } }
      : { OR: [{ requisitions: { isNot: null } }, { requisition_id: null, id: { lt: cursor.id } }] };
  }

  return {
    OR: [
      { requisitions: { requisition_number: { [cmp]: cursor.v } } },
      { requisitions: { requisition_number: cursor.v }, id: { [cmp]: cursor.id } },
      ...(order === "asc" ? [{ requisition_id: null }] : []),
    ],
  };
}

function cursorValue(row: Record<string, unknown>, sortField: DeliverySortField): string | number | null {
  if (sortField === "requisition_number") {
    const relation = row.requisitions as { requisition_number: string } | null;
    return relation?.requisition_number ?? null;
  }
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

export interface CreateDeliveryInput {
  requisition_id?: string | null;
  supplier?: string | null;
  bill_of_lading_no?: string | null;
  truck_number?: string | null;
  received_date?: Date | string;
  created_by?: string | null;
}

export async function createDelivery(input: CreateDeliveryInput) {
  if (input.requisition_id) {
    const requisition = await prisma.requisitions.findUnique({ where: { id: input.requisition_id } });
    if (!requisition) throw new NotFoundError(`Requisition ${input.requisition_id} not found`);
  }
  return prisma.deliveries.create({
    data: {
      requisition_id: input.requisition_id ?? null,
      supplier: input.supplier ?? null,
      bill_of_lading_no: input.bill_of_lading_no ?? null,
      truck_number: input.truck_number ?? null,
      received_date: input.received_date ? new Date(input.received_date) : undefined,
      created_by: input.created_by ?? null,
    },
  });
}

export async function listDeliveries(params: ListDeliveriesParams) {
  const sortField = params.sort ?? "report_number";
  const cursor = decodeCursor(params.cursor);
  const isRelationSort = sortField === "requisition_number";

  const where = combineWhere(
    isRelationSort ? requisitionNumberWhere(params.order, cursor) : keysetWhere(sortField, params.order, cursor),
    params.status ? { status: params.status } : {},
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
  );

  const orderBy = isRelationSort
    ? [{ requisitions: { requisition_number: params.order } }, { id: params.order }]
    : [{ [sortField]: params.order }, { id: params.order }];

  const rows = await prisma.deliveries.findMany({
    where,
    orderBy,
    take: params.limit + 1,
    include: { _count: { select: { delivery_line_items: true } }, requisitions: true },
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  const data = page.map(({ _count, requisitions, ...rest }) => ({
    ...rest,
    line_item_count: _count.delivery_line_items,
    requisition_number: requisitions?.requisition_number ?? null,
  }));

  return { data, hasMore, nextCursor };
}

export async function getDelivery(id: string) {
  const delivery = await prisma.deliveries.findUnique({
    where: { id },
    include: {
      requisitions: true,
      delivery_line_items: {
        include: { inventory_items: true, mechanical_log_items: true },
        orderBy: { created_at: "asc" },
      },
    },
  });
  if (!delivery) throw new NotFoundError(`Delivery ${id} not found`);

  const { delivery_line_items, requisitions, ...rest } = delivery;

  // Received-to-date for every log row on this delivery, so each line can show
  // what it contributed against the ordered quantity (derived, never stored).
  const logItemIds = delivery_line_items
    .map((li) => li.mechanical_log_item_id)
    .filter((v): v is string => v !== null);
  const fulfillment = await fulfillmentByLogItemIds(logItemIds);

  return {
    ...rest,
    requisition_number: requisitions?.requisition_number ?? null,
    // NOTE: `li.quantity_received` here is this LINE's own received qty (a
    // column on delivery_line_items). deriveFulfillment() below computes the
    // LOG ROW's cumulative total across every line that has hit it - a
    // different number that happens to share a name, so its fields are
    // nested under `log_fulfillment` rather than spread, or they'd silently
    // clobber the line's own quantity_received.
    line_items: delivery_line_items.map(({ inventory_items, mechanical_log_items, ...li }) => ({
      ...li,
      item_sku: inventory_items.sku,
      item_name: inventory_items.name,
      item_unit: inventory_items.unit,
      tag_number: mechanical_log_items?.tag_number ?? null,
      log_description: mechanical_log_items?.description ?? null,
      qty_released: mechanical_log_items?.qty_released ?? null,
      log_fulfillment: mechanical_log_items
        ? deriveFulfillment(mechanical_log_items.qty_released, fulfillment.get(mechanical_log_items.id))
        : null,
    })),
  };
}

export interface UpdateDeliveryInput {
  status?: DeliveryStatus;
  accepted_by_supervision?: boolean;
  received_in_good_condition?: boolean;
  conforms_to_specifications?: boolean;
  qc_notes?: string | null;
  accepted_by?: string | null;
}

export async function updateDelivery(id: string, input: UpdateDeliveryInput) {
  const existing = await prisma.deliveries.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`Delivery ${id} not found`);

  return prisma.deliveries.update({
    where: { id },
    data: input,
  });
}

export interface AddDeliveryLineItemInput {
  mechanical_log_item_id?: string | null; // preferred path
  inventory_item_id?: string | null; // fallback for off-log receipts
  shipment_number?: string | null;
  description?: string | null;
  quantity_received: DecimalInput;
  condition?: string | null;
  properly_marked?: boolean | null;
  disposition: DeliveryLineDisposition;
  note?: string | null;
  location?: string;
  created_by?: string | null;
}

export interface AddDeliveryLineItemResult {
  line_item: Prisma.delivery_line_itemsGetPayload<object>;
  inventory_item: { id: string; sku: string; name: string; unit: string };
  // The receiving screen has to tell the user which of the two happened
  // ("Created inventory item ABC-123" vs "Updated stock: ABC-123 -> 78 LF"), so
  // this is part of the contract, not a debugging aid (spec §7.1).
  inventory_item_created: boolean;
  quantity_on_hand: Prisma.Decimal;
  warning: "over_received" | null;
  ordered: Prisma.Decimal | null;
  received_to_date: Prisma.Decimal | null;
}

function postsStock(disposition: DeliveryLineDisposition): boolean {
  return disposition === "accept" || disposition === "conditional_use";
}

type TxClient = Prisma.TransactionClient;

// 129 of 565 real log rows have no tag number, but inventory_items.sku is
// UNIQUE NOT NULL. Allocated from a Postgres sequence at first receipt only -
// never at import, or 129 phantom items appear for material that never arrived
// (spec §5.3).
async function nextGeneratedSku(tx: TxClient): Promise<string> {
  const rows = await tx.$queryRaw<{ sku: string }[]>`
    SELECT 'ML-' || LPAD(nextval('mechanical_log_sku_seq')::text, 6, '0') AS sku
  `;
  return rows[0].sku;
}

type LogItem = Prisma.mechanical_log_itemsGetPayload<object>;

/**
 * Resolves the inventory item a receipt lands on, exactly per spec §5.2:
 * explicit id wins; otherwise the log row's existing claim; otherwise an
 * existing item with the same SKU; otherwise a new item built from the log row.
 *
 * Step (d) is the case that matters most: 38 tag numbers recur across two
 * releases, and those must converge on ONE inventory item rather than
 * duplicating (invariant §8.5).
 */
async function resolveInventoryItem(
  tx: TxClient,
  input: AddDeliveryLineItemInput,
  logItem: LogItem | null,
): Promise<{ id: string; sku: string; name: string; unit: string; created: boolean }> {
  if (input.inventory_item_id) {
    const item = await tx.inventory_items.findUnique({ where: { id: input.inventory_item_id } });
    if (!item) throw new NotFoundError(`Inventory item ${input.inventory_item_id} not found`);
    return { id: item.id, sku: item.sku, name: item.name, unit: item.unit, created: false };
  }

  if (!logItem) {
    throw new ValidationError(
      "Either mechanical_log_item_id or inventory_item_id is required to receive a line item",
    );
  }

  if (logItem.inventory_item_id) {
    const item = await tx.inventory_items.findUnique({ where: { id: logItem.inventory_item_id } });
    if (item) return { id: item.id, sku: item.sku, name: item.name, unit: item.unit, created: false };
  }

  const tag = logItem.tag_number?.trim();
  const sku = tag && tag.length > 0 ? tag : await nextGeneratedSku(tx);

  const existing = await tx.inventory_items.findUnique({ where: { sku } });
  if (existing) {
    await claimInventoryItem(tx, logItem, existing.id);
    return { id: existing.id, sku: existing.sku, name: existing.name, unit: existing.unit, created: false };
  }

  const description = logItem.description?.trim() || null;
  const created = await tx.inventory_items.create({
    data: {
      sku,
      // `name` is NOT NULL; the log's description is the only human label
      // available, and it can be long, so it's truncated for the name and kept
      // whole in `description`.
      name: description ? description.slice(0, 120) : sku,
      description,
      unit: logItem.unit?.trim() || "each",
      price: logItem.contract_unit_price ?? 0,
      custom_fields: {
        size: logItem.size,
        material: logItem.material,
        lining: logItem.lining,
        coating: logItem.coating,
        area: logItem.area,
        system: logItem.system,
        contract_dwg: logItem.contract_dwg,
        shop_dwg: logItem.shop_dwg,
      },
    },
  });

  await claimInventoryItem(tx, logItem, created.id);
  return { id: created.id, sku: created.sku, name: created.name, unit: created.unit, created: true };
}

// Idempotent claim (§5.2f). Only ever fills a NULL, so a log row keeps pointing
// at the item it was first received against.
async function claimInventoryItem(tx: TxClient, logItem: LogItem, inventoryItemId: string): Promise<void> {
  if (logItem.inventory_item_id) return;
  await tx.mechanical_log_items.update({
    where: { id: logItem.id },
    data: { inventory_item_id: inventoryItemId },
  });
}

/**
 * The heart of the material chain (spec §5.2).
 *
 * The inventory-item create, the log-row backlink, the delivery_line_items
 * insert and the inventory_transactions insert are ONE atomic unit - a partial
 * write here corrupts stock (invariant §8.6).
 *
 * Accepted / conditionally-accepted material posts a `received` transaction;
 * rejected material posts nothing (invariant §8.7).
 */
export async function addDeliveryLineItem(
  deliveryId: string,
  input: AddDeliveryLineItemInput,
): Promise<AddDeliveryLineItemResult> {
  const delivery = await prisma.deliveries.findUnique({
    where: { id: deliveryId },
    include: { requisitions: true },
  });
  if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

  return prisma.$transaction(async (tx) => {
    let logItem: LogItem | null = null;

    if (input.mechanical_log_item_id) {
      logItem = await tx.mechanical_log_items.findUnique({ where: { id: input.mechanical_log_item_id } });
      if (!logItem) {
        throw new NotFoundError(`Mechanical log item ${input.mechanical_log_item_id} not found`);
      }

      // A truck carries material from exactly one requisition (§3.1). Receiving
      // a Requisition 2 row onto a Requisition 1 delivery is a paperwork error,
      // not a partial shipment - name both numbers so the receiver can tell
      // which one is wrong.
      if (delivery.requisition_id && logItem.requisition_id !== delivery.requisition_id) {
        const logRequisition = logItem.requisition_id
          ? await tx.requisitions.findUnique({ where: { id: logItem.requisition_id } })
          : null;
        throw new ConflictError(
          `Mechanical log item ${logItem.tag_number ?? logItem.id} belongs to requisition ` +
            `${logRequisition?.requisition_number ?? "(none)"}, but this delivery is for requisition ` +
            `${delivery.requisitions?.requisition_number ?? "(none)"}`,
        );
      }
    }

    const item = await resolveInventoryItem(tx, input, logItem);
    const quantity = new Prisma.Decimal(input.quantity_received).abs();

    const lineItem = await tx.delivery_line_items.create({
      data: {
        delivery_id: deliveryId,
        mechanical_log_item_id: logItem?.id ?? null,
        inventory_item_id: item.id,
        shipment_number: input.shipment_number ?? null,
        description: input.description ?? null,
        quantity_received: input.quantity_received,
        condition: input.condition ?? null,
        properly_marked: input.properly_marked ?? null,
        disposition: input.disposition,
        note: input.note ?? null,
      },
    });

    if (postsStock(input.disposition)) {
      await tx.inventory_transactions.create({
        data: {
          item_id: item.id,
          type: "received",
          quantity,
          location: input.location ?? "main",
          note: input.note ?? null,
          delivery_line_item_id: lineItem.id,
          created_by: input.created_by ?? null,
        },
      });
    }

    // Over-receipt is a warning, not an error - field conditions produce
    // legitimate overages and blocking the receiver just moves the problem off
    // the system (§5.2).
    let warning: "over_received" | null = null;
    let ordered: Prisma.Decimal | null = null;
    let receivedToDate: Prisma.Decimal | null = null;

    if (logItem) {
      ordered = logItem.qty_released ?? new Prisma.Decimal(0);
      const rows = await tx.mechanical_log_fulfillment.findMany({
        where: { mechanical_log_item_id: logItem.id },
      });
      receivedToDate = rows[0]?.quantity_received ?? new Prisma.Decimal(0);
      if (receivedToDate.greaterThan(ordered)) warning = "over_received";
    }

    return {
      line_item: lineItem,
      inventory_item: { id: item.id, sku: item.sku, name: item.name, unit: item.unit },
      inventory_item_created: item.created,
      quantity_on_hand: await stockOnHand(tx, item.id),
      warning,
      ordered,
      received_to_date: receivedToDate,
    };
  });
}

async function stockOnHand(tx: TxClient, itemId: string): Promise<Prisma.Decimal> {
  const rows = await tx.inventory_current_stock.findMany({ where: { item_id: itemId } });
  return rows.reduce((sum, row) => sum.plus(row.quantity_on_hand ?? 0), new Prisma.Decimal(0));
}

export interface UpdateDeliveryLineItemInput {
  quantity_received?: DecimalInput;
  disposition?: DeliveryLineDisposition;
  condition?: string | null;
  properly_marked?: boolean | null;
  note?: string | null;
  location?: string;
  created_by?: string | null;
}

/**
 * Corrections (§5.4). Changing disposition accepted -> reject must delete the
 * transaction, and reject -> accepted must create one; both directions are
 * handled here, in the same transaction as the line update, or stock diverges
 * from what the paperwork says.
 */
export async function updateDeliveryLineItem(lineItemId: string, input: UpdateDeliveryLineItemInput) {
  const existing = await prisma.delivery_line_items.findUnique({ where: { id: lineItemId } });
  if (!existing) throw new NotFoundError(`Delivery line item ${lineItemId} not found`);

  return prisma.$transaction(async (tx) => {
    const lineItem = await tx.delivery_line_items.update({
      where: { id: lineItemId },
      data: {
        quantity_received: input.quantity_received ?? undefined,
        disposition: input.disposition ?? undefined,
        condition: input.condition === undefined ? undefined : input.condition,
        properly_marked: input.properly_marked === undefined ? undefined : input.properly_marked,
        note: input.note === undefined ? undefined : input.note,
      },
    });

    // Simplest correct resync: drop whatever this line posted and re-post from
    // its current state. Recomputing beats patching quantities in place, which
    // is where drift creeps in.
    await tx.inventory_transactions.deleteMany({ where: { delivery_line_item_id: lineItemId } });

    if (postsStock(lineItem.disposition)) {
      await tx.inventory_transactions.create({
        data: {
          item_id: lineItem.inventory_item_id,
          type: "received",
          quantity: new Prisma.Decimal(lineItem.quantity_received).abs(),
          location: input.location ?? "main",
          note: lineItem.note,
          delivery_line_item_id: lineItem.id,
          created_by: input.created_by ?? null,
        },
      });
    }

    return lineItem;
  });
}

/**
 * Deleting a line must delete its inventory transactions in the same
 * transaction, or stock silently inflates (§5.4).
 *
 * mechanical_log_items.inventory_item_id is deliberately NOT cleared - the link
 * is a durable identity claim, not a receipt counter.
 */
export async function deleteDeliveryLineItem(lineItemId: string) {
  const existing = await prisma.delivery_line_items.findUnique({ where: { id: lineItemId } });
  if (!existing) throw new NotFoundError(`Delivery line item ${lineItemId} not found`);

  await prisma.$transaction(async (tx) => {
    await tx.inventory_transactions.deleteMany({ where: { delivery_line_item_id: lineItemId } });
    await tx.delivery_line_items.delete({ where: { id: lineItemId } });
  });
}
