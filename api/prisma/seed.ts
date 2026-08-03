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

// Matches img/item.png so the reworked detail page has a real item to render
// against: price, notes, tags, and every custom field populated.
const DEMO_ITEM = {
  sku: "MECH-KAT-01",
  name: '24" MJ 90 BEND',
  unit: "each",
  reorder_threshold: 1,
  price: 245.5,
  barcode: "SMMOXT0489",
  notes: 'REQ-MECH-KAT-01 | TAG-110.4-24-03 | SIZE*DIM 24"',
  tags: ["Yard"],
  custom_fields: {
    req_number: "MECH-KAT-01",
    tag_number: "110.4-24-03",
    size_dims: '24"',
    description: "RAS Pump Station to Headworks",
    system: "RAS",
    finish_coating: "Asphaltic",
    type_material: "DI",
    priority: "Normal",
    mark_number: "110.4-24-03",
    reusable: false,
  },
};

// Mirrors the "Custom Fields" panel in img/item.png. Admin-configured and
// shared across all items (inventory_custom_field_defs), not a migration.
const CUSTOM_FIELD_DEFS: {
  field_key: string;
  label: string;
  field_type: "text" | "textarea" | "number" | "select" | "checkbox";
  options?: string[];
  sort_order: number;
}[] = [
  { field_key: "serial_number", label: "Serial Number", field_type: "text", sort_order: 0 },
  { field_key: "req_number", label: "Req Number", field_type: "text", sort_order: 1 },
  { field_key: "tag_number", label: "Tag Number", field_type: "text", sort_order: 2 },
  { field_key: "size_dims", label: "Size / Dims", field_type: "text", sort_order: 3 },
  { field_key: "description", label: "Description", field_type: "textarea", sort_order: 4 },
  { field_key: "system", label: "System", field_type: "text", sort_order: 5 },
  { field_key: "file_or_photo", label: "File or Photo", field_type: "text", sort_order: 6 },
  { field_key: "finish_coating", label: "Finish / Coating", field_type: "text", sort_order: 7 },
  { field_key: "type_material", label: "Type / Material", field_type: "text", sort_order: 8 },
  { field_key: "specs", label: "Specs", field_type: "textarea", sort_order: 9 },
  {
    field_key: "priority",
    label: "Priority",
    field_type: "select",
    options: ["Low", "Normal", "High"],
    sort_order: 10,
  },
  { field_key: "mark_number", label: "Mark #", field_type: "text", sort_order: 11 },
  { field_key: "reusable", label: "Reusable", field_type: "checkbox", sort_order: 12 },
  { field_key: "voltage_phase", label: "Voltage / Phase", field_type: "text", sort_order: 13 },
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

  for (const def of CUSTOM_FIELD_DEFS) {
    await prisma.inventory_custom_field_defs.upsert({
      where: { field_key: def.field_key },
      update: {},
      create: def,
    });
  }

  const demoItem = await prisma.inventory_items.upsert({
    where: { sku: DEMO_ITEM.sku },
    update: {},
    create: {
      sku: DEMO_ITEM.sku,
      name: DEMO_ITEM.name,
      unit: DEMO_ITEM.unit,
      reorder_threshold: DEMO_ITEM.reorder_threshold,
      price: DEMO_ITEM.price,
      barcode: DEMO_ITEM.barcode,
      notes: DEMO_ITEM.notes,
      custom_fields: DEMO_ITEM.custom_fields,
    },
  });

  const demoTag = await prisma.inventory_tags.upsert({
    where: { name: DEMO_ITEM.tags[0] },
    update: {},
    create: { name: DEMO_ITEM.tags[0] },
  });
  await prisma.inventory_item_tags.upsert({
    where: { item_id_tag_id: { item_id: demoItem.id, tag_id: demoTag.id } },
    update: {},
    create: { item_id: demoItem.id, tag_id: demoTag.id },
  });

  const demoAlreadySeeded = await prisma.inventory_transactions.findFirst({
    where: { item_id: demoItem.id },
  });
  if (!demoAlreadySeeded) {
    await prisma.inventory_transactions.create({
      data: {
        item_id: demoItem.id,
        type: "received",
        quantity: 2,
        location: "yard",
        created_by: user.id,
      },
    });
  }

  console.log(
    `Seeded dev user (${user.email}), ${ITEMS.length + 1} inventory items, ${CUSTOM_FIELD_DEFS.length} custom field defs.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
