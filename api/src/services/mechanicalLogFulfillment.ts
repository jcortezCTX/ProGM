import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

/**
 * Derived receipt numbers for a Mechanical Log row (MATERIAL_FLOW_SPEC.md §4.3).
 *
 * None of these are ever columns. `quantity_received` comes from the
 * mechanical_log_fulfillment view (which counts only accept / conditional_use
 * lines); outstanding and status are computed from it. A stored receipt total
 * drifts the first time a delivery line is corrected - the same failure mode as
 * inventory_items.quantity_on_hand (CLAUDE.md rule 1, spec invariants §8.1/§8.2).
 *
 * Lives in its own module because the mechanical log, requisition and delivery
 * services all need it, and importing it from any one of them would make the
 * other two circular.
 */

export type FulfillmentStatus = "not_received" | "partial" | "complete";

export interface Fulfillment {
  quantity_received: Prisma.Decimal;
  quantity_outstanding: Prisma.Decimal;
  fulfillment_status: FulfillmentStatus;
}

const ZERO = new Prisma.Decimal(0);

export type PrismaLike = Pick<typeof prisma, "mechanical_log_fulfillment">;

// Batched so callers can resolve a whole page of rows in one query rather than
// N+1-ing the view.
export async function fulfillmentByLogItemIds(
  ids: string[],
  client: PrismaLike = prisma,
): Promise<Map<string, Prisma.Decimal>> {
  const map = new Map<string, Prisma.Decimal>();
  if (ids.length === 0) return map;

  const rows = await client.mechanical_log_fulfillment.findMany({
    where: { mechanical_log_item_id: { in: ids } },
  });

  for (const row of rows) {
    if (row.mechanical_log_item_id) {
      map.set(row.mechanical_log_item_id, row.quantity_received ?? ZERO);
    }
  }
  return map;
}

export async function fulfillmentForLogItem(id: string, client: PrismaLike = prisma): Promise<Prisma.Decimal> {
  const map = await fulfillmentByLogItemIds([id], client);
  return map.get(id) ?? ZERO;
}

/**
 * qty_released is nullable on mechanical_log_items (the source spreadsheet has
 * blanks), so it is treated as 0 when absent. Checking `received <= 0` first
 * keeps a row with no ordered quantity and no receipts reading `not_received`
 * rather than falling through to `complete` on the `received >= ordered` test.
 */
export function deriveFulfillment(
  qtyReleased: Prisma.Decimal | null | undefined,
  received: Prisma.Decimal = ZERO,
): Fulfillment {
  const ordered = qtyReleased ?? ZERO;
  const outstanding = ordered.minus(received);

  let status: FulfillmentStatus;
  if (received.lessThanOrEqualTo(ZERO)) {
    status = "not_received";
  } else if (received.greaterThanOrEqualTo(ordered)) {
    status = "complete";
  } else {
    status = "partial";
  }

  return {
    quantity_received: received,
    // Floored at 0 - an over-receipt is surfaced as a warning, not as a
    // negative outstanding balance (§4.3, §5.2).
    quantity_outstanding: outstanding.lessThan(ZERO) ? ZERO : outstanding,
    fulfillment_status: status,
  };
}
