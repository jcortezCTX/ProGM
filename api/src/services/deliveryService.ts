import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}

export type DeliveryLineDisposition = "accept" | "conditional_use" | "reject";
export type DeliveryStatus = "open" | "closed";
type DecimalInput = string | number | Prisma.Decimal;

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

export async function listDeliveries() {
  const deliveries = await prisma.deliveries.findMany({
    orderBy: { report_number: "desc" },
    include: { _count: { select: { delivery_line_items: true } }, requisitions: true },
  });
  return deliveries.map(({ _count, requisitions, ...rest }) => ({
    ...rest,
    line_item_count: _count.delivery_line_items,
    requisition_number: requisitions?.requisition_number ?? null,
  }));
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
