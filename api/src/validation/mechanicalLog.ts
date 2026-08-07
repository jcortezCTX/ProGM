import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const mechanicalLogListQuerySchema = buildListQuerySchema(["tag_number", "due_date", "created_at"] as const, {
  // The receiving picker defaults to the delivery's own requisition and widens
  // from there (§7.1); `unreleased` finds rows not yet on any requisition.
  requisition_id: z.string().uuid().optional(),
  unreleased: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const decimal = z.union([z.number(), z.string()]).nullable().optional();
const text = z.string().min(1).nullable().optional();
const date = z.string().min(1).nullable().optional();

// Same shape for create and update - every field is optional/nullable since
// real rows in the source CSV are sparse (e.g. 129 of 565 rows have no tag
// number at all), and PATCH semantics (omit vs. explicit null) match the
// rest of the API.
export const mechanicalLogItemSchema = z.object({
  // Settable from the Requisition UI. inventory_item_id is intentionally NOT
  // here - it is claimed once at first receipt and is not user-editable (§4.1).
  requisition_id: z.string().uuid().nullable().optional(),
  release: text,
  supplier: text,
  review: text,
  tag_number: text,
  qty_released: decimal,
  unit: text,
  size: text,
  description: text,
  material: text,
  lining: text,
  coating: text,
  release_date: date,
  due_date: date,
  area: text,
  system: text,
  contract_dwg: text,
  system2: text,
  shop_dwg: text,
  delivered_qty: decimal,
  need_qty: decimal,
  received_on: date,
  received_by: text,
  storage_location: text,
  notes: text,
  estimate_cost: decimal,
  contract_unit_price: decimal,
  contract_extended_price: decimal,
  above_below: text,
  invoice_no: text,
  invoice_unit_price: decimal,
  invoice_extended_price: decimal,
  delta_invoice_contract: decimal,
  qty_invoiced_to_date: decimal,
  created_by: z.string().uuid().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
