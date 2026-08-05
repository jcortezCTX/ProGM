import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { addDeliveryLineItem, createDelivery } from "./deliveryService.js";
import { createRequisition, listRequisitions } from "./requisitionService.js";

// This table already holds real rows in dev, so every query below is
// scoped via a marker embedded in `notes` unique to this test run - never
// via a full-table walk or unbounded `limit`. A random suffix (not just
// Date.now()) avoids a real collision seen with deliveryService's own
// TEST-REQ-LIST-* fixtures: vitest runs test files in parallel, and two
// files' module-level Date.now() calls can land in the same millisecond.
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const marker = `MARK${runId}`;
const sku = `TEST-REQLIST-ITEM-${runId}`;
const ids: string[] = [];
let itemId: string;
let deliveryId: string;

beforeAll(async () => {
  const item = await prisma.inventory_items.create({ data: { sku, name: "Vitest test item", unit: "each" } });
  itemId = item.id;

  // R1 has a supplier and a line item that's partially fulfilled; R2 has no
  // supplier (nullable sort field exercised); R3 has a supplier but no line
  // items at all (quantity_ordered/quantity_received both zero).
  const r1 = await createRequisition({
    requisition_number: `TEST-REQ-LIST-${runId}-1`,
    supplier: `Marker-${runId} Co`,
    notes: marker,
    line_items: [{ inventory_item_id: itemId, quantity_ordered: 10 }],
  });
  const r2 = await createRequisition({
    requisition_number: `TEST-REQ-LIST-${runId}-2`,
    notes: marker,
    line_items: [{ inventory_item_id: itemId, quantity_ordered: 5 }],
  });
  const r3 = await createRequisition({
    requisition_number: `TEST-REQ-LIST-${runId}-3`,
    supplier: `Marker-${runId} Co`,
    notes: marker,
  });
  ids.push(r1.id, r2.id, r3.id);

  const delivery = await createDelivery({ requisition_id: r1.id });
  deliveryId = delivery.id;
  await addDeliveryLineItem(deliveryId, {
    requisition_line_item_id: r1.requisition_line_items[0].id,
    inventory_item_id: itemId,
    quantity_received: 4,
    disposition: "accept",
    location: "test-loc",
  });
});

afterAll(async () => {
  await prisma.inventory_transactions.deleteMany({ where: { item_id: itemId } });
  await prisma.delivery_line_items.deleteMany({ where: { delivery_id: deliveryId } });
  await prisma.deliveries.delete({ where: { id: deliveryId } });
  await prisma.requisition_line_items.deleteMany({ where: { requisition_id: { in: ids } } });
  await prisma.requisitions.deleteMany({ where: { id: { in: ids } } });
  await prisma.inventory_items.delete({ where: { id: itemId } });
});

describe("listRequisitions pagination", () => {
  it("walks every page to the end with no duplicates or omissions", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listRequisitions({ cursor, limit: 2, order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it("sorts asc by supplier with the unset (null) supplier last", async () => {
    const res = await listRequisitions({ limit: 50, sort: "supplier", order: "asc", q: marker });
    expect(res.data).toHaveLength(3);
    const suppliers = res.data.map((r) => r.supplier);
    expect(suppliers[suppliers.length - 1]).toBeNull();
  });

  it("sorts desc by supplier with the unset (null) supplier first", async () => {
    const res = await listRequisitions({ limit: 50, sort: "supplier", order: "desc", q: marker });
    expect(res.data).toHaveLength(3);
    expect(res.data[0].supplier).toBeNull();
  });

  it("sorts asc by requisition_number", async () => {
    const res = await listRequisitions({ limit: 50, sort: "requisition_number", order: "asc", q: marker });
    const numbers = res.data.map((r) => r.requisition_number);
    expect(numbers).toEqual([...numbers].sort());
  });

  it("computes quantity_ordered/quantity_received correctly on the paginated page", async () => {
    const res = await listRequisitions({ limit: 50, order: "asc", q: marker });
    const r1 = res.data.find((r) => r.requisition_number === `TEST-REQ-LIST-${runId}-1`);
    const r3 = res.data.find((r) => r.requisition_number === `TEST-REQ-LIST-${runId}-3`);
    expect(r1?.quantity_ordered.toString()).toBe("10");
    expect(r1?.quantity_received.toString()).toBe("4");
    expect(r3?.quantity_ordered.toString()).toBe("0");
    expect(r3?.quantity_received.toString()).toBe("0");
    expect(r3?.line_item_count).toBe(0);
  });

  it("returns an empty page (not an error) when nothing matches the search", async () => {
    const res = await listRequisitions({ limit: 50, order: "asc", q: `no-such-thing-${runId}` });
    expect(res).toEqual({ data: [], hasMore: false, nextCursor: null });
  });
});
