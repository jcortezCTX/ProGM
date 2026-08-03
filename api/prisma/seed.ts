import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

const DEV_USER = {
  email: "dev@opshub.local",
  display_name: "Dev User",
  role: "admin" as const,
};

const ITEMS = [
  { sku: "BOLT-M10", name: "Hex Bolt M10x40", unit: "each", reorder_threshold: 50 },
  { sku: "NUT-M10", name: "Hex Nut M10", unit: "each", reorder_threshold: 50 },
  { sku: "WASH-M10", name: "Flat Washer M10", unit: "each", reorder_threshold: 100 },
  { sku: "PIPE-2IN", name: "Steel Pipe 2in x 6ft", unit: "each", reorder_threshold: 10 },
  { sku: "PIPE-4IN", name: "Steel Pipe 4in x 6ft", unit: "each", reorder_threshold: 10 },
  { sku: "WIRE-12AWG", name: "12 AWG Wire", unit: "ft", reorder_threshold: 500 },
  { sku: "CONDUIT-1IN", name: "Conduit 1in", unit: "ft", reorder_threshold: 200 },
  { sku: "GLOVE-L", name: "Work Gloves (Large)", unit: "pair", reorder_threshold: 20 },
  { sku: "SAFETY-GLASS", name: "Safety Glasses", unit: "each", reorder_threshold: 15 },
  { sku: "TAPE-ELEC", name: "Electrical Tape", unit: "roll", reorder_threshold: 30 },
];

async function main() {
  const user = await prisma.users.upsert({
    where: { email: DEV_USER.email },
    update: {},
    create: DEV_USER,
  });

  for (const [index, itemInput] of ITEMS.entries()) {
    const item = await prisma.inventory_items.upsert({
      where: { sku: itemInput.sku },
      update: {},
      create: itemInput,
    });

    const alreadySeeded = await prisma.inventory_transactions.findFirst({
      where: { item_id: item.id },
    });
    if (alreadySeeded) continue;

    // Vary stock levels: most items comfortably stocked, a couple driven
    // below their reorder_threshold to exercise the low-stock indicator.
    const received = itemInput.reorder_threshold * (index % 3 === 0 ? 0.5 : 3);
    await prisma.inventory_transactions.create({
      data: {
        item_id: item.id,
        type: "received",
        quantity: received,
        location: "main",
        created_by: user.id,
      },
    });

    if (index % 4 === 0) {
      await prisma.inventory_transactions.create({
        data: {
          item_id: item.id,
          type: "received",
          quantity: itemInput.reorder_threshold,
          location: "warehouse-b",
          created_by: user.id,
        },
      });
    }

    if (index % 2 === 0) {
      await prisma.inventory_transactions.create({
        data: {
          item_id: item.id,
          type: "issued",
          quantity: Math.floor(received * 0.2) || 1,
          location: "main",
          note: "job site draw",
          created_by: user.id,
        },
      });
    }
  }

  console.log(`Seeded dev user (${user.email}) and ${ITEMS.length} inventory items.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
