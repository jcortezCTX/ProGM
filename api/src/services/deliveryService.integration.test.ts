import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  ConflictError,
  addDeliveryLineItem,
  createDelivery,
  deleteDeliveryLineItem,
  getDelivery,
  updateDeliveryLineItem,
} from "./deliveryService.js";
import { createRequisition } from "./requisitionService.js";
import { getMechanicalLogItem } from "./mechanicalLogService.js";

/**
 * Covers the verification checklist in MATERIAL_FLOW_SPEC.md §9 for the
 * Mechanical Log -> Requisition -> Delivery -> Inventory chain.
 *
 * Everything is namespaced by RUN so the suite is safe to run repeatedly
 * against the shared dev database.
 */
const RUN = Date.now();
const TAG_SHARED = `TEST-TAG-SHARED-${RUN}`;
const TAG_PARTIAL = `TEST-TAG-PARTIAL-${RUN}`;
const TAG_REJECT = `TEST-TAG-REJECT-${RUN}`;
const TAG_OVER = `TEST-TAG-OVER-${RUN}`;
const TAG_DELETE = `TEST-TAG-DELETE-${RUN}`;

let req1Id: string;
let req2Id: string;
let delivery1Id: string;
let delivery2Id: string;

// mechanical_log_items ids
const log: Record<string, string> = {};

async function makeLogItem(
  key: string,
  data: { tag_number?: string | null; qty_released?: number; requisition_id?: string | null; unit?: string },
) {
  const row = await prisma.mechanical_log_items.create({
    data: {
      tag_number: data.tag_number ?? null,
      qty_released: data.qty_released ?? null,
      requisition_id: data.requisition_id ?? null,
      unit: data.unit ?? "LF",
      description: `Vitest ${key} ${RUN}`,
      size: '20"',
      material: "DI",
      release: data.requisition_id === req2Id ? "2" : "1",
      contract_unit_price: 12.5,
    },
  });
  log[key] = row.id;
  return row;
}

beforeAll(async () => {
  const r1 = await createRequisition({ requisition_number: `TEST-REQ-1-${RUN}`, supplier: "KAT" });
  req1Id = r1.id;
  const r2 = await createRequisition({ requisition_number: `TEST-REQ-2-${RUN}`, supplier: "KAT" });
  req2Id = r2.id;

  // The shared-tag case: same tag number released twice, on two requisitions.
  await makeLogItem("sharedA", { tag_number: TAG_SHARED, qty_released: 10, requisition_id: req1Id });
  await makeLogItem("sharedB", { tag_number: TAG_SHARED, qty_released: 5, requisition_id: req2Id });

  await makeLogItem("partial", { tag_number: TAG_PARTIAL, qty_released: 100, requisition_id: req1Id });
  await makeLogItem("reject", { tag_number: TAG_REJECT, qty_released: 8, requisition_id: req1Id });
  await makeLogItem("over", { tag_number: TAG_OVER, qty_released: 10, requisition_id: req1Id });
  await makeLogItem("delete", { tag_number: TAG_DELETE, qty_released: 20, requisition_id: req1Id });

  // Two untagged rows - these must get generated SKUs at first receipt.
  await makeLogItem("blank1", { tag_number: null, qty_released: 3, requisition_id: req1Id });
  await makeLogItem("blank2", { tag_number: "   ", qty_released: 4, requisition_id: req1Id });

  delivery1Id = (await createDelivery({ requisition_id: req1Id })).id;
  delivery2Id = (await createDelivery({ requisition_id: req2Id })).id;
});

afterAll(async () => {
  const logIds = Object.values(log);
  const rows = await prisma.mechanical_log_items.findMany({ where: { id: { in: logIds } } });
  const itemIds = rows.map((r) => r.inventory_item_id).filter((v): v is string => v !== null);

  const deliveryIds = [delivery1Id, delivery2Id];
  await prisma.inventory_transactions.deleteMany({ where: { item_id: { in: itemIds } } });
  await prisma.delivery_line_items.deleteMany({ where: { delivery_id: { in: deliveryIds } } });
  await prisma.deliveries.deleteMany({ where: { id: { in: deliveryIds } } });
  await prisma.mechanical_log_items.deleteMany({ where: { id: { in: logIds } } });
  await prisma.requisitions.deleteMany({ where: { id: { in: [req1Id, req2Id] } } });
  await prisma.inventory_items.deleteMany({ where: { id: { in: itemIds } } });
});

async function stockFor(itemId: string): Promise<number> {
  const rows = await prisma.inventory_current_stock.findMany({ where: { item_id: itemId } });
  return rows.reduce((sum, r) => sum + Number(r.quantity_on_hand ?? 0), 0);
}

describe("receiving auto-creates and reuses inventory items (spec §5.2)", () => {
  it("creates the inventory item from the log row when the tag has none yet", async () => {
    const result = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.sharedA,
      quantity_received: 10,
      disposition: "accept",
      location: "test-loc",
    });

    expect(result.inventory_item_created).toBe(true);
    expect(result.inventory_item.sku).toBe(TAG_SHARED);
    // §5.2e: unit and price carry over from the log row.
    expect(result.inventory_item.unit).toBe("LF");
    expect(await stockFor(result.inventory_item.id)).toBe(10);

    // §5.2f: the log row now durably claims that item.
    const logRow = await prisma.mechanical_log_items.findUniqueOrThrow({ where: { id: log.sharedA } });
    expect(logRow.inventory_item_id).toBe(result.inventory_item.id);

    const item = await prisma.inventory_items.findUniqueOrThrow({ where: { id: result.inventory_item.id } });
    expect(item.custom_fields).toMatchObject({ size: '20"', material: "DI" });
  });

  it("converges a second release of the same tag on the SAME inventory item", async () => {
    const first = await prisma.mechanical_log_items.findUniqueOrThrow({ where: { id: log.sharedA } });

    // Different requisition, hence a different delivery - this is the real
    // 38-tags-across-two-releases case (invariant §8.5).
    const result = await addDeliveryLineItem(delivery2Id, {
      mechanical_log_item_id: log.sharedB,
      quantity_received: 5,
      disposition: "accept",
      location: "test-loc",
    });

    expect(result.inventory_item_created).toBe(false);
    expect(result.inventory_item.id).toBe(first.inventory_item_id);

    // Stock is the sum, not two separate items.
    expect(await stockFor(result.inventory_item.id)).toBe(15);

    const items = await prisma.inventory_items.findMany({ where: { sku: TAG_SHARED } });
    expect(items).toHaveLength(1);

    const logB = await prisma.mechanical_log_items.findUniqueOrThrow({ where: { id: log.sharedB } });
    expect(logB.inventory_item_id).toBe(first.inventory_item_id);
  });

  it("generates sequential ML- SKUs for untagged rows", async () => {
    const a = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.blank1,
      quantity_received: 3,
      disposition: "accept",
      location: "test-loc",
    });
    const b = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.blank2,
      quantity_received: 4,
      disposition: "accept",
      location: "test-loc",
    });

    // The spec's worked example is ML-000001 / ML-000002 on a fresh database.
    // mechanical_log_sku_seq is global and shared, so what is actually
    // guaranteed - and what this asserts - is the format and that the two are
    // consecutive.
    expect(a.inventory_item.sku).toMatch(/^ML-\d{6}$/);
    expect(b.inventory_item.sku).toMatch(/^ML-\d{6}$/);
    expect(Number(b.inventory_item.sku.slice(3))).toBe(Number(a.inventory_item.sku.slice(3)) + 1);

    // A blank tag must not collide with the whitespace-only tag.
    expect(a.inventory_item.id).not.toBe(b.inventory_item.id);
    expect(a.inventory_item_created).toBe(true);
    expect(b.inventory_item_created).toBe(true);
  });

  it("rejects a receipt that names neither a log row nor an inventory item", async () => {
    await expect(
      addDeliveryLineItem(delivery1Id, { quantity_received: 1, disposition: "accept" }),
    ).rejects.toThrow(/required/i);
  });
});

describe("disposition drives stock (spec §8.7)", () => {
  it("posts nothing for a rejected line and leaves fulfillment untouched", async () => {
    const result = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.reject,
      quantity_received: 8,
      disposition: "reject",
      location: "test-loc",
    });

    // The line row exists...
    expect(result.line_item.id).toBeTruthy();
    // ...but posted no stock.
    const txs = await prisma.inventory_transactions.findMany({
      where: { delivery_line_item_id: result.line_item.id },
    });
    expect(txs).toHaveLength(0);
    expect(await stockFor(result.inventory_item.id)).toBe(0);

    const view = await prisma.mechanical_log_fulfillment.findMany({
      where: { mechanical_log_item_id: log.reject },
    });
    expect(view).toHaveLength(0);

    const detail = await getMechanicalLogItem(log.reject);
    expect(detail.fulfillment_status).toBe("not_received");
    expect(Number(detail.quantity_received)).toBe(0);
  });

  it("re-syncs stock when a disposition is corrected in both directions", async () => {
    const result = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.reject,
      quantity_received: 2,
      disposition: "reject",
      location: "test-loc",
    });
    const itemId = result.inventory_item.id;
    expect(await stockFor(itemId)).toBe(0);

    // reject -> accepted must CREATE the transaction.
    await updateDeliveryLineItem(result.line_item.id, { disposition: "accept", location: "test-loc" });
    expect(await stockFor(itemId)).toBe(2);

    // accepted -> reject must DELETE it again.
    await updateDeliveryLineItem(result.line_item.id, { disposition: "reject", location: "test-loc" });
    expect(await stockFor(itemId)).toBe(0);

    await deleteDeliveryLineItem(result.line_item.id);
  });
});

describe("fulfillment status is derived from receipts (spec §4.3)", () => {
  it("moves not_received -> partial -> complete across successive receipts", async () => {
    const before = await getMechanicalLogItem(log.partial);
    expect(before.fulfillment_status).toBe("not_received");
    expect(Number(before.quantity_outstanding)).toBe(100);

    await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.partial,
      quantity_received: 40,
      disposition: "accept",
      location: "test-loc",
    });

    const mid = await getMechanicalLogItem(log.partial);
    expect(mid.fulfillment_status).toBe("partial");
    expect(Number(mid.quantity_received)).toBe(40);
    expect(Number(mid.quantity_outstanding)).toBe(60);

    // Closing the balance flips it to complete.
    await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.partial,
      quantity_received: 60,
      disposition: "accept",
      location: "test-loc",
    });

    const done = await getMechanicalLogItem(log.partial);
    expect(done.fulfillment_status).toBe("complete");
    expect(Number(done.quantity_received)).toBe(100);
    expect(Number(done.quantity_outstanding)).toBe(0);
    expect(done.delivery_lines).toHaveLength(2);
  });

  it("allows over-receipt but flags it as a warning, not an error", async () => {
    const result = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.over,
      quantity_received: 14, // ordered 10
      disposition: "accept",
      location: "test-loc",
    });

    expect(result.warning).toBe("over_received");
    expect(Number(result.ordered)).toBe(10);
    expect(Number(result.received_to_date)).toBe(14);

    // Outstanding floors at 0 rather than going negative.
    const detail = await getMechanicalLogItem(log.over);
    expect(Number(detail.quantity_outstanding)).toBe(0);
    expect(detail.fulfillment_status).toBe("complete");
  });

  it("returns no warning on a normal receipt", async () => {
    const result = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.delete,
      quantity_received: 5, // ordered 20
      disposition: "accept",
      location: "test-loc",
    });
    expect(result.warning).toBeNull();
  });
});

describe("deleting a line removes the stock it posted (spec §5.4)", () => {
  it("restores stock to the prior value and keeps the log row's item claim", async () => {
    const first = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.delete,
      quantity_received: 7,
      disposition: "accept",
      location: "test-loc",
    });
    const itemId = first.inventory_item.id;
    const before = await stockFor(itemId);

    const second = await addDeliveryLineItem(delivery1Id, {
      mechanical_log_item_id: log.delete,
      quantity_received: 6,
      disposition: "accept",
      location: "test-loc",
    });
    expect(await stockFor(itemId)).toBe(before + 6);

    await deleteDeliveryLineItem(second.line_item.id);

    expect(await stockFor(itemId)).toBe(before);
    const txs = await prisma.inventory_transactions.findMany({
      where: { delivery_line_item_id: second.line_item.id },
    });
    expect(txs).toHaveLength(0);

    // The identity claim is durable - it is not a receipt counter (§5.4).
    const logRow = await prisma.mechanical_log_items.findUniqueOrThrow({ where: { id: log.delete } });
    expect(logRow.inventory_item_id).toBe(itemId);
  });
});

describe("a delivery carries material from exactly one requisition (spec §5.2)", () => {
  it("409s when a log row from another requisition is received onto the delivery", async () => {
    // delivery1 is for requisition 1; log.sharedB belongs to requisition 2.
    await expect(
      addDeliveryLineItem(delivery1Id, {
        mechanical_log_item_id: log.sharedB,
        quantity_received: 1,
        disposition: "accept",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("names both requisition numbers in the conflict message", async () => {
    await expect(
      addDeliveryLineItem(delivery1Id, {
        mechanical_log_item_id: log.sharedB,
        quantity_received: 1,
        disposition: "accept",
      }),
    ).rejects.toThrow(new RegExp(`TEST-REQ-2-${RUN}[\\s\\S]*TEST-REQ-1-${RUN}`));
  });
});

describe("off-log receipts still work (the ~10%)", () => {
  it("receives straight against an inventory item with no log row", async () => {
    const item = await prisma.inventory_items.create({
      data: { sku: `TEST-OFFLOG-${RUN}`, name: "Off-log item", unit: "each" },
    });

    // No requisition on this delivery, so no requisition-match check applies.
    const delivery = await createDelivery({});
    const result = await addDeliveryLineItem(delivery.id, {
      inventory_item_id: item.id,
      quantity_received: 9,
      disposition: "accept",
      location: "test-loc",
    });

    expect(result.inventory_item_created).toBe(false);
    expect(result.line_item.mechanical_log_item_id).toBeNull();
    expect(result.warning).toBeNull();
    expect(await stockFor(item.id)).toBe(9);

    const detail = await getDelivery(delivery.id);
    expect(detail.line_items[0].tag_number).toBeNull();

    await prisma.inventory_transactions.deleteMany({ where: { item_id: item.id } });
    await prisma.delivery_line_items.deleteMany({ where: { delivery_id: delivery.id } });
    await prisma.deliveries.delete({ where: { id: delivery.id } });
    await prisma.inventory_items.delete({ where: { id: item.id } });
  });
});

describe("receiving is atomic (spec §8.6)", () => {
  it("rolls back the auto-created inventory item when the line insert fails", async () => {
    const tag = `TEST-ATOMIC-${RUN}`;
    const row = await prisma.mechanical_log_items.create({
      data: { tag_number: tag, qty_released: 5, requisition_id: req1Id, unit: "LF", release: "1" },
    });

    // A quantity Postgres NUMERIC cannot accept makes the line insert blow up
    // AFTER the inventory item would have been created.
    await expect(
      addDeliveryLineItem(delivery1Id, {
        mechanical_log_item_id: row.id,
        quantity_received: "not-a-number" as unknown as Prisma.Decimal,
        disposition: "accept",
      }),
    ).rejects.toThrow();

    // Nothing survived: no orphan item, no claim on the log row.
    expect(await prisma.inventory_items.findUnique({ where: { sku: tag } })).toBeNull();
    const after = await prisma.mechanical_log_items.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.inventory_item_id).toBeNull();

    await prisma.mechanical_log_items.delete({ where: { id: row.id } });
  });
});
