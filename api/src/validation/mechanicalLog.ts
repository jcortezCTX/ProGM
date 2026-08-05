import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const mechanicalLogListQuerySchema = buildListQuerySchema([
  "tag_number",
  "due_date",
  "created_at",
] as const);

const decimal = z.union([z.number(), z.string()]).nullable().optional();
const text = z.string().min(1).nullable().optional();
const date = z.string().min(1).nullable().optional();

// Same shape for create and update - every field is optional/nullable since
// real rows in the source CSV are sparse (e.g. 129 of 565 rows have no tag
// number at all), and PATCH semantics (omit vs. explicit null) match the
// rest of the API.
export const mechanicalLogItemSchema = z.object({
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
