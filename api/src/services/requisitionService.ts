import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { combineWhere, decodeCursor, keysetWhere, paginate } from "../lib/listQuery.js";
import { deriveFulfillment, fulfillmentByLogItemIds } from "./mechanicalLogFulfillment.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

type RequisitionSortField = "requisition_number" | "supplier" | "created_at";

export interface ListRequisitionsParams {
  cursor?: string;
  limit: number;
  sort?: RequisitionSortField;
  order: "asc" | "desc";
  q?: string;
}

// Free-text search spans the fields someone would type a fragment of when
// looking for a requisition, not every column.
const SEARCH_FIELDS = ["requisition_number", "supplier", "notes"] as const;

// supplier is nullable; requisition_number and created_at are not.
const NULLABLE_SORT_FIELDS = new Set<RequisitionSortField>(["supplier"]);

function cursorValue(row: Record<string, unknown>, sortField: RequisitionSortField): string | number | null {
  const raw = row[sortField];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

export interface CreateRequisitionInput {
  requisition_number: string;
  supplier?: string | null;
  notes?: string | null;
  created_by?: string | null;
  // A requisition's line items ARE its Mechanical Log rows (spec §3.2) - there
  // is no separate ordered-quantity to supply; it's qty_released on the row.
  mechanical_log_item_ids?: string[];
}

function mapWriteError(err: unknown, requisitionNumber: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ConflictError(`Requisition with number ${requisitionNumber} already exists`);
  }
  throw err;
}

/**
 * Creates the requisition and claims its log rows in ONE DB transaction (§5.1).
 *
 * A log row belongs to exactly one requisition, so claiming a row that already
 * belongs to a different one is a 409 rather than a silent overwrite -
 * reassignment has to be deliberate.
 */
export async function createRequisition(input: CreateRequisitionInput) {
  const ids = input.mechanical_log_item_ids ?? [];

  try {
    return await prisma.$transaction(async (tx) => {
      if (ids.length > 0) {
        const rows = await tx.mechanical_log_items.findMany({ where: { id: { in: ids } } });

        const missing = ids.filter((id) => !rows.some((r) => r.id === id));
        if (missing.length > 0) {
          throw new NotFoundError(`Mechanical log item(s) not found: ${missing.join(", ")}`);
        }

        const claimed = rows.filter((r) => r.requisition_id !== null);
        if (claimed.length > 0) {
          const existing = await tx.requisitions.findMany({
            where: { id: { in: claimed.map((r) => r.requisition_id as string) } },
          });
          const numberById = new Map(existing.map((r) => [r.id, r.requisition_number]));
          const detail = claimed
            .map((r) => `${r.tag_number ?? r.id} -> ${numberById.get(r.requisition_id as string) ?? "unknown"}`)
            .join(", ");
          throw new ConflictError(`Mechanical log item(s) already on another requisition: ${detail}`);
        }
      }

      const requisition = await tx.requisitions.create({
        data: {
          requisition_number: input.requisition_number,
          supplier: input.supplier ?? null,
          notes: input.notes ?? null,
          created_by: input.created_by ?? null,
        },
      });

      if (ids.length > 0) {
        await tx.mechanical_log_items.updateMany({
          where: { id: { in: ids } },
          data: { requisition_id: requisition.id },
        });
      }

      return tx.requisitions.findUniqueOrThrow({
        where: { id: requisition.id },
        include: { mechanical_log_items: true },
      });
    });
  } catch (err) {
    mapWriteError(err, input.requisition_number);
  }
}

export async function listRequisitions(params: ListRequisitionsParams) {
  const sortField = params.sort ?? "created_at";
  const cursor = decodeCursor(params.cursor);

  const where = combineWhere(
    keysetWhere(sortField, params.order, cursor, { nullable: NULLABLE_SORT_FIELDS.has(sortField) }),
    params.q
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: params.q, mode: "insensitive" } })) }
      : {},
  );

  const rows = await prisma.requisitions.findMany({
    where,
    orderBy: [{ [sortField]: params.order }, { id: params.order }],
    take: params.limit + 1,
    include: { mechanical_log_items: true },
  });

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: cursorValue(row, sortField),
    id: row.id,
  }));

  // quantity_ordered/quantity_received are computed here, over the returned
  // page only (not the whole table) - both are derived-never-stored values,
  // same rule as inventory stock, and not sortable/filterable in v1 (see the
  // table-enhancements plan): correctly seeking on a JS-side reduction would
  // need the same raw-SQL treatment as Inventory's derived stock sort.
  //
  // Ordered now comes from qty_released on the log rows - the single place an
  // ordered quantity lives since requisition_line_items was dropped (§3.2).
  const allLogItemIds = page.flatMap((r) => r.mechanical_log_items.map((li) => li.id));
  const fulfillment = await fulfillmentByLogItemIds(allLogItemIds);

  const data = page.map((r) => {
    const quantityOrdered = r.mechanical_log_items.reduce(
      (sum, li) => sum.plus(li.qty_released ?? 0),
      new Prisma.Decimal(0),
    );
    const quantityReceived = r.mechanical_log_items.reduce(
      (sum, li) => sum.plus(fulfillment.get(li.id) ?? 0),
      new Prisma.Decimal(0),
    );
    const { mechanical_log_items, ...rest } = r;
    return {
      ...rest,
      line_item_count: mechanical_log_items.length,
      quantity_ordered: quantityOrdered,
      quantity_received: quantityReceived,
    };
  });

  return { data, hasMore, nextCursor };
}

export async function getRequisition(id: string) {
  const requisition = await prisma.requisitions.findUnique({
    where: { id },
    include: {
      mechanical_log_items: {
        include: { inventory_items: true },
        orderBy: [{ tag_number: "asc" }, { id: "asc" }],
      },
      deliveries: { orderBy: { received_date: "desc" } },
    },
  });
  if (!requisition) throw new NotFoundError(`Requisition ${id} not found`);

  const fulfillment = await fulfillmentByLogItemIds(requisition.mechanical_log_items.map((li) => li.id));

  const { mechanical_log_items, deliveries, ...rest } = requisition;

  const lineItems = mechanical_log_items.map(({ inventory_items, ...li }) => ({
    ...li,
    item_sku: inventory_items?.sku ?? null,
    item_name: inventory_items?.name ?? null,
    ...deriveFulfillment(li.qty_released, fulfillment.get(li.id)),
  }));

  // Requisition-level roll-up, same derived rule as the per-row numbers.
  const quantityOrdered = lineItems.reduce((sum, li) => sum.plus(li.qty_released ?? 0), new Prisma.Decimal(0));
  const quantityReceived = lineItems.reduce((sum, li) => sum.plus(li.quantity_received), new Prisma.Decimal(0));
  const rollUp = deriveFulfillment(quantityOrdered, quantityReceived);

  return {
    ...rest,
    line_items: lineItems,
    deliveries,
    quantity_ordered: quantityOrdered,
    quantity_received: rollUp.quantity_received,
    quantity_outstanding: rollUp.quantity_outstanding,
    fulfillment_status: rollUp.fulfillment_status,
  };
}
