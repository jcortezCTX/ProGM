import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate, type CursorPayload } from "../lib/listQuery.js";

export class NotFoundError extends Error {}

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
      delivery_line_items: { include: { inventory_items: true }, orderBy: { created_at: "asc" } },
    },
  });
  if (!delivery) throw new NotFoundError(`Delivery ${id} not found`);

  const { delivery_line_items, requisitions, ...rest } = delivery;
  return {
    ...rest,
    requisition_number: requisitions?.requisition_number ?? null,
    line_items: delivery_line_items.map(({ inventory_items, ...li }) => ({
      ...li,
      item_sku: inventory_items.sku,
      item_name: inventory_items.name,
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
  requisition_line_item_id?: string | null;
  inventory_item_id: string;
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

// Accepted / conditionally-accepted material posts a `received` inventory
// transaction in the same DB transaction as the line item insert - a
// partial write here would corrupt stock (see CLAUDE.md, BUILD_PLAN Phase 4).
// Rejected material posts nothing.
export async function addDeliveryLineItem(deliveryId: string, input: AddDeliveryLineItemInput) {
  const delivery = await prisma.deliveries.findUnique({ where: { id: deliveryId } });
  if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

  const item = await prisma.inventory_items.findUnique({ where: { id: input.inventory_item_id } });
  if (!item) throw new NotFoundError(`Inventory item ${input.inventory_item_id} not found`);

  if (input.requisition_line_item_id) {
    const reqLineItem = await prisma.requisition_line_items.findUnique({
      where: { id: input.requisition_line_item_id },
    });
    if (!reqLineItem) {
      throw new NotFoundError(`Requisition line item ${input.requisition_line_item_id} not found`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const lineItem = await tx.delivery_line_items.create({
      data: {
        delivery_id: deliveryId,
        requisition_line_item_id: input.requisition_line_item_id ?? null,
        inventory_item_id: input.inventory_item_id,
        shipment_number: input.shipment_number ?? null,
        description: input.description ?? null,
        quantity_received: input.quantity_received,
        condition: input.condition ?? null,
        properly_marked: input.properly_marked ?? null,
        disposition: input.disposition,
        note: input.note ?? null,
      },
    });

    if (input.disposition === "accept" || input.disposition === "conditional_use") {
      await tx.inventory_transactions.create({
        data: {
          item_id: input.inventory_item_id,
          type: "received",
          quantity: new Prisma.Decimal(input.quantity_received).abs(),
          location: input.location ?? "main",
          note: input.note ?? null,
          delivery_line_item_id: lineItem.id,
          created_by: input.created_by ?? null,
        },
      });
    }

    return lineItem;
  });
}
