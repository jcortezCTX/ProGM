import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";
import { addDeliveryLineItem, createDelivery, updateDelivery } from "../src/services/deliveryService.js";
import { createRequisition } from "../src/services/requisitionService.js";

// Temporary local dev-login passwords — not real secrets, just seed data for
// the stopgap login system (see BUILD_PLAN.md; replaced by Azure AD Phase 3).
const DEV_USER = {
  email: "dev@opshub.local",
  display_name: "Dev User",
  role: "admin" as const,
  password: "devpassword123",
};

const MEMBER_USER = {
  email: "member@opshub.local",
  display_name: "Member User",
  role: "member" as const,
  password: "memberpassword123",
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

// Matches img/deliveryLog.png (Garney's real "Material Inspection & Receiving
// Report" #69) so the Delivery Log module has a real receiving report to
// render against. quantity_ordered on the requisition line items is
// invented for the demo — the source form only shows what was received on
// this one truck, not the full requisition total.
const PIPE_ITEMS = [
  {
    sku: "PIPE-20IN-12FT-DI",
    name: '20" 12\' Ductile Iron Pipe (RAS)',
    unit: "each",
    reorder_threshold: 5,
    custom_fields: { system: "RAS", type_material: "DI", size_dims: '20" 12\'' },
  },
  {
    sku: "PIPE-20IN-11FT6IN-DI",
    name: '20" 11\'6" Ductile Iron Pipe (RAS)',
    unit: "each",
    reorder_threshold: 5,
    custom_fields: { system: "RAS", type_material: "DI", size_dims: '20" 11\'6"' },
  },
];

const DELIVERY_LOG_DEMO = {
  requisition_number: "0673P028",
  supplier: "KAT",
  bill_of_lading_no: "2846553",
  truck_number: "Quikrete",
  received_date: "2026-07-22",
  accepted_by: "Pablo Chapellin",
  lines: [
    { sku: "PIPE-20IN-12FT-DI", shipment_number: "29210665-000", quantity: 2 },
    { sku: "PIPE-20IN-11FT6IN-DI", shipment_number: "29210665-001", quantity: 2 },
    { sku: "PIPE-20IN-12FT-DI", shipment_number: "29210665-002", quantity: 1 },
    { sku: "PIPE-20IN-11FT6IN-DI", shipment_number: "29210665-003", quantity: 1 },
  ],
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
  const devPasswordHash = await hashPassword(DEV_USER.password);
  const user = await prisma.users.upsert({
    where: { email: DEV_USER.email },
    update: { password_hash: devPasswordHash },
    create: {
      email: DEV_USER.email,
      display_name: DEV_USER.display_name,
      role: DEV_USER.role,
      password_hash: devPasswordHash,
    },
  });

  const memberPasswordHash = await hashPassword(MEMBER_USER.password);
  await prisma.users.upsert({
    where: { email: MEMBER_USER.email },
    update: { password_hash: memberPasswordHash },
    create: {
      email: MEMBER_USER.email,
      display_name: MEMBER_USER.display_name,
      role: MEMBER_USER.role,
      password_hash: memberPasswordHash,
    },
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

  const pipeItemIds = new Map<string, string>();
  for (const itemInput of PIPE_ITEMS) {
    const item = await prisma.inventory_items.upsert({
      where: { sku: itemInput.sku },
      update: {},
      create: itemInput,
    });
    pipeItemIds.set(itemInput.sku, item.id);
  }

  const existingRequisition = await prisma.requisitions.findUnique({
    where: { requisition_number: DELIVERY_LOG_DEMO.requisition_number },
    include: { requisition_line_items: true },
  });
  const requisition =
    existingRequisition ??
    (await createRequisition({
      requisition_number: DELIVERY_LOG_DEMO.requisition_number,
      supplier: DELIVERY_LOG_DEMO.supplier,
      created_by: user.id,
      line_items: PIPE_ITEMS.map((p) => ({
        inventory_item_id: pipeItemIds.get(p.sku) as string,
        description: p.name,
        quantity_ordered: 10,
      })),
    }));

  const existingDelivery = await prisma.deliveries.findFirst({
    where: { bill_of_lading_no: DELIVERY_LOG_DEMO.bill_of_lading_no },
  });
  if (!existingDelivery) {
    const delivery = await createDelivery({
      requisition_id: requisition.id,
      supplier: DELIVERY_LOG_DEMO.supplier,
      bill_of_lading_no: DELIVERY_LOG_DEMO.bill_of_lading_no,
      truck_number: DELIVERY_LOG_DEMO.truck_number,
      received_date: DELIVERY_LOG_DEMO.received_date,
      created_by: user.id,
    });

    for (const line of DELIVERY_LOG_DEMO.lines) {
      const itemId = pipeItemIds.get(line.sku) as string;
      const reqLineItem = requisition.requisition_line_items.find((li) => li.inventory_item_id === itemId);
      await addDeliveryLineItem(delivery.id, {
        requisition_line_item_id: reqLineItem?.id,
        inventory_item_id: itemId,
        shipment_number: line.shipment_number,
        description: PIPE_ITEMS.find((p) => p.sku === line.sku)?.name,
        quantity_received: line.quantity,
        condition: "GOOD",
        properly_marked: true,
        disposition: "accept",
        location: "yard",
        created_by: user.id,
      });
    }

    await updateDelivery(delivery.id, {
      status: "closed",
      accepted_by_supervision: true,
      received_in_good_condition: true,
      conforms_to_specifications: true,
      accepted_by: DELIVERY_LOG_DEMO.accepted_by,
    });
  }

  console.log(
    `Seeded dev user (${user.email}), ${ITEMS.length + 3} inventory items, ${CUSTOM_FIELD_DEFS.length} custom field defs, 1 requisition, 1 delivery.`,
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
