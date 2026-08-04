import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { addDeliveryLineItem, createDelivery, getDelivery } from "./deliveryService.js";
import { createRequisition } from "./requisitionService.js";

const sku = `TEST-PIPE-${Date.now()}`;
let itemId: string;
let requisitionId: string;
let reqLineItemId: string;
let deliveryId: string;

beforeAll(async () => {
  const item = await prisma.inventory_items.create({
    data: { sku, name: "Vitest test pipe", unit: "each" },
  });
  itemId = item.id;

  const requisition = await createRequisition({
    requisition_number: `TEST-REQ-${Date.now()}`,
    line_items: [{ inventory_item_id: itemId, quantity_ordered: 10 }],
  });
  requisitionId = requisition.id;
  reqLineItemId = requisition.requisition_line_items[0].id;

  const delivery = await createDelivery({ requisition_id: requisitionId });
  deliveryId = delivery.id;
});

afterAll(async () => {
  await prisma.inventory_transactions.deleteMany({ where: { item_id: itemId } });
  await prisma.delivery_line_items.deleteMany({ where: { delivery_id: deliveryId } });
  await prisma.deliveries.delete({ where: { id: deliveryId } });
  await prisma.requisitions.delete({ where: { id: requisitionId } });
  await prisma.inventory_items.delete({ where: { id: itemId } });
});

describe("delivery line item disposition drives inventory transactions", () => {
  it("posts a received transaction for an accepted line item", async () => {
    await addDeliveryLineItem(deliveryId, {
      requisition_line_item_id: reqLineItemId,
      inventory_item_id: itemId,
      quantity_received: 4,
      disposition: "accept",
      location: "test-loc",
    });

    const transactions = await prisma.inventory_transactions.findMany({ where: { item_id: itemId } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("received");
    expect(transactions[0].quantity.toString()).toBe("4");
  });

  it("posts a received transaction for a conditional_use line item", async () => {
    await addDeliveryLineItem(deliveryId, {
      requisition_line_item_id: reqLineItemId,
      inventory_item_id: itemId,
      quantity_received: 2,
      disposition: "conditional_use",
      location: "test-loc",
    });

    const transactions = await prisma.inventory_transactions.findMany({ where: { item_id: itemId } });
    expect(transactions).toHaveLength(2);
  });

  it("posts nothing for a rejected line item", async () => {
    await addDeliveryLineItem(deliveryId, {
      requisition_line_item_id: reqLineItemId,
      inventory_item_id: itemId,
      quantity_received: 3,
      disposition: "reject",
      location: "test-loc",
    });

    const transactions = await prisma.inventory_transactions.findMany({ where: { item_id: itemId } });
    expect(transactions).toHaveLength(2); // unchanged from the previous test

    const stock = await prisma.inventory_current_stock.findMany({ where: { item_id: itemId } });
    const total = stock.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? 0), 0);
    expect(total).toBe(6); // 4 (accept) + 2 (conditional_use), the 3 rejected never landed
  });

  it("only counts accept/conditional_use toward requisition fulfillment, not reject", async () => {
    const delivery = await getDelivery(deliveryId);
    expect(delivery.line_items).toHaveLength(3);

    const fulfillment = await prisma.requisition_fulfillment.findFirst({
      where: { requisition_line_item_id: reqLineItemId },
    });
    expect(fulfillment?.quantity_received?.toString()).toBe("6");
  });
});
