import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { createItem, listItems, recordTransaction } from "./inventoryService.js";

// This table already holds real seed items, so every query below is scoped
// via a marker embedded in `name` unique to this test run - never via a
// full-table walk or unbounded `limit`. A random suffix (not just
// Date.now()) avoids the cross-file collision seen previously with
// deliveryService's TEST-REQ-LIST-* fixtures under vitest's parallelism.
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const marker = `MARK${runId}`;
const tag = `TESTTAG-${runId}`;
const sku = (n: string) => `TEST-INVLIST-${runId}-${n}`;
const ids: string[] = [];

beforeAll(async () => {
  // A: stock 5, threshold 10 -> low stock. B: stock 20, threshold 10 -> not
  // low stock. C: no transactions (stock 0), threshold 5 -> low stock.
  // D: stock 50, threshold 100 -> low stock. A and C carry a shared tag.
  const a = await createItem({ sku: sku("A"), name: `${marker} Alpha`, reorder_threshold: 10, tags: [tag] });
  const b = await createItem({ sku: sku("B"), name: `${marker} Beta`, reorder_threshold: 10 });
  const c = await createItem({ sku: sku("C"), name: `${marker} Gamma`, reorder_threshold: 5, tags: [tag] });
  const d = await createItem({ sku: sku("D"), name: `${marker} Delta`, reorder_threshold: 100 });
  ids.push(a.id, b.id, c.id, d.id);

  await recordTransaction({ item_id: a.id, type: "received", quantity: 5, location: "main" });
  await recordTransaction({ item_id: b.id, type: "received", quantity: 20, location: "main" });
  await recordTransaction({ item_id: d.id, type: "received", quantity: 50, location: "main" });
});

afterAll(async () => {
  await prisma.inventory_transactions.deleteMany({ where: { item_id: { in: ids } } });
  await prisma.inventory_item_tags.deleteMany({ where: { item_id: { in: ids } } });
  await prisma.inventory_items.deleteMany({ where: { id: { in: ids } } });
  await prisma.inventory_tags.deleteMany({ where: { name: tag } });
});

describe("listItems fast path (flat-column sort)", () => {
  it("walks every page to the end with no duplicates or omissions", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listItems({ cursor, limit: 2, order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it("sorts asc by name", async () => {
    const res = await listItems({ limit: 50, sort: "name", order: "asc", q: marker });
    expect(res.data.map((r) => r.name)).toEqual([
      `${marker} Alpha`,
      `${marker} Beta`,
      `${marker} Delta`,
      `${marker} Gamma`,
    ]);
  });

  it("filters by tag", async () => {
    const res = await listItems({ limit: 50, order: "asc", q: marker, tag });
    expect(res.data.map((r) => r.sku).sort()).toEqual([sku("A"), sku("C")].sort());
  });
});

describe("listItems derived path (quantity_on_hand sort / low_stock filter)", () => {
  it("sorts asc by quantity_on_hand matching hand-computed stock", async () => {
    const res = await listItems({ limit: 50, sort: "quantity_on_hand", order: "asc", q: marker });
    expect(res.data.map((r) => r.sku)).toEqual([sku("C"), sku("A"), sku("B"), sku("D")]);
    expect(res.data.map((r) => r.quantity_on_hand.toString())).toEqual(["0", "5", "20", "50"]);
  });

  it("sorts desc by quantity_on_hand", async () => {
    const res = await listItems({ limit: 50, sort: "quantity_on_hand", order: "desc", q: marker });
    expect(res.data.map((r) => r.sku)).toEqual([sku("D"), sku("B"), sku("A"), sku("C")]);
  });

  it("paginates correctly across the raw-SQL derived path with a small limit", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await listItems({ cursor, limit: 1, sort: "quantity_on_hand", order: "asc", q: marker });
      seen.push(...res.data.map((r) => r.id));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it("filters by low_stock=true", async () => {
    const res = await listItems({ limit: 50, order: "asc", q: marker, low_stock: "true" });
    expect(res.data.map((r) => r.sku).sort()).toEqual([sku("A"), sku("C"), sku("D")].sort());
    expect(res.data.every((r) => r.low_stock)).toBe(true);
  });

  it("filters by low_stock=false", async () => {
    const res = await listItems({ limit: 50, order: "asc", q: marker, low_stock: "false" });
    expect(res.data.map((r) => r.sku)).toEqual([sku("B")]);
    expect(res.data[0].low_stock).toBe(false);
  });

  it("combines the tag filter with the low_stock derived filter", async () => {
    const res = await listItems({ limit: 50, order: "asc", q: marker, tag, low_stock: "true" });
    expect(res.data.map((r) => r.sku).sort()).toEqual([sku("A"), sku("C")].sort());
  });

  it("returns an empty page (not an error) when nothing matches", async () => {
    const res = await listItems({ limit: 50, order: "asc", q: `no-such-thing-${runId}`, low_stock: "true" });
    expect(res).toEqual({ data: [], hasMore: false, nextCursor: null });
  });
});
