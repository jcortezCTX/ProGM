import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type DecimalInput = string | number | Prisma.Decimal;

export interface CreateRequisitionLineItemInput {
  inventory_item_id: string;
  description?: string | null;
  quantity_ordered: DecimalInput;
}

export interface CreateRequisitionInput {
  requisition_number: string;
  supplier?: string | null;
  notes?: string | null;
  created_by?: string | null;
  line_items?: CreateRequisitionLineItemInput[];
}

function mapWriteError(err: unknown, requisitionNumber: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictError(`Requisition with number ${requisitionNumber} already exists`);
  }
  throw err;
}

// requisition_fulfillment is derived (never stored) - only accepted /
// conditional_use delivery line items count, same rule as inventory stock.
async function fulfillmentByLineItemIds(ids: string[]): Promise<Map<string, Prisma.Decimal>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.requisition_fulfillment.findMany({
    where: { requisition_line_item_id: { in: ids } },
  });
  const map = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (row.requisition_line_item_id) {
      map.set(row.requisition_line_item_id, row.quantity_received ?? new Prisma.Decimal(0));
    }
  }
  return map;
}

export async function createRequisition(input: CreateRequisitionInput) {
  try {
    return await prisma.requisitions.create({
      data: {
        requisition_number: input.requisition_number,
        supplier: input.supplier ?? null,
        notes: input.notes ?? null,
        created_by: input.created_by ?? null,
        requisition_line_items: input.line_items
          ? {
              create: input.line_items.map((li) => ({
                inventory_item_id: li.inventory_item_id,
                description: li.description ?? null,
                quantity_ordered: li.quantity_ordered,
              })),
            }
          : undefined,
      },
      include: { requisition_line_items: true },
    });
  } catch (err) {
    mapWriteError(err, input.requisition_number);
  }
}

export async function listRequisitions() {
  const requisitions = await prisma.requisitions.findMany({
    orderBy: { created_at: "desc" },
    include: { requisition_line_items: true },
  });

  const allLineItemIds = requisitions.flatMap((r) => r.requisition_line_items.map((li) => li.id));
  const fulfillment = await fulfillmentByLineItemIds(allLineItemIds);

  return requisitions.map((r) => {
    const quantityOrdered = r.requisition_line_items.reduce(
      (sum, li) => sum.plus(li.quantity_ordered),
      new Prisma.Decimal(0),
    );
    const quantityReceived = r.requisition_line_items.reduce(
      (sum, li) => sum.plus(fulfillment.get(li.id) ?? 0),
      new Prisma.Decimal(0),
    );
    const { requisition_line_items, ...rest } = r;
    return {
      ...rest,
      line_item_count: requisition_line_items.length,
      quantity_ordered: quantityOrdered,
      quantity_received: quantityReceived,
    };
  });
}

export async function getRequisition(id: string) {
  const requisition = await prisma.requisitions.findUnique({
    where: { id },
    include: { requisition_line_items: { include: { inventory_items: true } } },
  });
  if (!requisition) throw new NotFoundError(`Requisition ${id} not found`);

  const fulfillment = await fulfillmentByLineItemIds(requisition.requisition_line_items.map((li) => li.id));

  const { requisition_line_items, ...rest } = requisition;
  return {
    ...rest,
    line_items: requisition_line_items.map(({ inventory_items, ...li }) => ({
      ...li,
      item_sku: inventory_items.sku,
      item_name: inventory_items.name,
      quantity_received: fulfillment.get(li.id) ?? new Prisma.Decimal(0),
    })),
  };
}
