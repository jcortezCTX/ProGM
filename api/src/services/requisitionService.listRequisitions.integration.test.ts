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
const logItemIds: string[] = [];
const requisitionIds: string[] = [];
let itemId: string | null = null;
let deliveryId: string;

beforeAll(async () => {
  // A requisition's line items ARE its Mechanical Log rows (spec §3.2), so the
  // fixture data lives there instead of a standalone requisition_line_items row.
  const logR1 = await prisma.mechanical_log_items.create({
    data: { tag_number: `TEST-REQLIST-TAG-${runId}`, qty_released: 10, unit: "each", notes: marker, release: "1" },
  });
  const logR2 = await prisma.mechanical_log_items.create({
    data: { tag_number: `TEST-REQLIST-TAG2-${runId}`, qty_released: 5, unit: "each", notes: marker, release: "2" },
  });
  logItemIds.push(logR1.id, logR2.id);

  // R1 has a supplier and a line item that's partially fulfilled; R2 has no
  // supplier (nullable sort field exercised); R3 has a supplier but no line
  // items at all (quantity_ordered/quantity_received both zero).
  const r1 = await createRequisition({
    requisition_number: `TEST-REQ-LIST-${runId}-1`,
    supplier: `Marker-${runId} Co`,
    notes: marker,
    mechanical_log_item_ids: [logR1.id],
  });
  const r2 = await createRequisition({
    requisition_number: `TEST-REQ-LIST-${runId}-2`,
    notes: marker,
    mechanical_log_item_ids: [logR2.id],
  });
  const r3 = await createRequisition({
    requisition_number: `TEST-REQ-LIST-${runId}-3`,
    supplier: `Marker-${runId} Co`,
    notes: marker,
  });
  requisitionIds.push(r1.id, r2.id, r3.id);

  const delivery = await createDelivery({ requisition_id: r1.id });
  deliveryId = delivery.id;
  const result = await addDeliveryLineItem(deliveryId, {
    mechanical_log_item_id: logR1.id,
    quantity_received: 4,
    disposition: "accept",
    location: "test-loc",
  });
  itemId = result.inventory_item.id;
});

afterAll(async () => {
  if (itemId) await prisma.inventory_transactions.deleteMany({ where: { item_id: itemId } });
  await prisma.delivery_line_items.deleteMany({ where: { delivery_id: deliveryId } });
  await prisma.deliveries.delete({ where: { id: deliveryId } });
  await prisma.mechanical_log_items.deleteMany({ where: { id: { in: logItemIds } } });
  await prisma.requisitions.deleteMany({ where: { id: { in: requisitionIds } } });
  if (itemId) await prisma.inventory_items.deleteMany({ where: { id: itemId } });
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
    expect(seen.sort()).toEqual([...requisitionIds].sort());
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

describe("createRequisition claims Mechanical Log rows (spec §5.1)", () => {
  it("409s when a log row is already claimed by a different requisition", async () => {
    await expect(
      createRequisition({
        requisition_number: `TEST-REQ-LIST-${runId}-conflict`,
        mechanical_log_item_ids: [logItemIds[0]], // already on r1
      }),
    ).rejects.toThrow(/already on another requisition/i);
  });
});
