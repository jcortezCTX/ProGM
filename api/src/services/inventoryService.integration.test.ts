import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  createItem,
  getItem,
  getTransactionHistory,
  listItems,
  recordTransaction,
} from "./inventoryService.js";

const sku = `TEST-${Date.now()}`;
let itemId: string;

beforeAll(async () => {
  const item = await createItem({ sku, name: "Vitest widget", reorder_threshold: 15 });
  itemId = item.id;
});

afterAll(async () => {
  await prisma.inventory_transactions.deleteMany({ where: { item_id: itemId } });
  await prisma.inventory_items.delete({ where: { id: itemId } });
});

describe("inventory stock math against a real database", () => {
  it("computes stock per location and totals across locations", async () => {
    await recordTransaction({ item_id: itemId, type: "received", quantity: 100, location: "main" });
    await recordTransaction({ item_id: itemId, type: "received", quantity: 30, location: "warehouse-b" });
    await recordTransaction({ item_id: itemId, type: "issued", quantity: 15, location: "main" });
    await recordTransaction({ item_id: itemId, type: "adjustment", quantity: -5, location: "warehouse-b" });

    const detail = await getItem(itemId);
    expect(detail.quantity_on_hand.toString()).toBe("110");

    const byLocation = Object.fromEntries(
      detail.stock_by_location.map((row) => [row.location, row.quantity_on_hand.toString()]),
    );
    expect(byLocation).toEqual({ main: "85", "warehouse-b": "25" });
  });

  it("reflects negative deltas driving stock below the reorder threshold", async () => {
    await recordTransaction({ item_id: itemId, type: "issued", quantity: 100, location: "main" });

    const items = await listItems();
    const item = items.find((i) => i.id === itemId);
    expect(item?.quantity_on_hand.toString()).toBe("10");
    expect(item?.low_stock).toBe(true);
  });

  it("orders transaction history most-recent first", async () => {
    const history = await getTransactionHistory(itemId);
    expect(history.length).toBeGreaterThanOrEqual(5);
    const timestamps = history.map((t) => t.created_at.getTime());
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });
});
