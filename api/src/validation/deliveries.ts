import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

const decimalString = z.union([z.number(), z.string()]).transform((v) => String(v));

export const deliveriesListQuerySchema = buildListQuerySchema(
  ["report_number", "received_date", "status", "requisition_number"] as const,
  { status: z.enum(["open", "closed"]).optional() },
);

export const createDeliverySchema = z.object({
  requisition_id: z.string().uuid().optional(),
  supplier: z.string().min(1).optional(),
  bill_of_lading_no: z.string().min(1).optional(),
  truck_number: z.string().min(1).optional(),
  received_date: z.string().min(1).optional(),
});

export const updateDeliverySchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  accepted_by_supervision: z.boolean().optional(),
  received_in_good_condition: z.boolean().optional(),
  conforms_to_specifications: z.boolean().optional(),
  qc_notes: z.string().min(1).nullable().optional(),
  accepted_by: z.string().min(1).nullable().optional(),
});

// Receiving is normally driven off the Mechanical Log; inventory_item_id is
// the escape hatch for the ~10% of material that was never on it. At least one
// must be present - the service must never invent an item from nothing (§5.2).
export const addDeliveryLineItemSchema = z
  .object({
    mechanical_log_item_id: z.string().uuid().optional(),
    inventory_item_id: z.string().uuid().optional(),
    shipment_number: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    quantity_received: decimalString,
    condition: z.string().min(1).optional(),
    properly_marked: z.boolean().optional(),
    disposition: z.enum(["accept", "conditional_use", "reject"]),
    note: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
  })
  .refine((body) => Number(body.quantity_received) > 0, {
    message: "quantity_received must be a positive number",
    path: ["quantity_received"],
  })
  .refine((body) => Boolean(body.mechanical_log_item_id ?? body.inventory_item_id), {
    message: "Either mechanical_log_item_id or inventory_item_id is required",
    path: ["mechanical_log_item_id"],
  });

export const updateDeliveryLineItemSchema = z
  .object({
    quantity_received: decimalString.optional(),
    disposition: z.enum(["accept", "conditional_use", "reject"]).optional(),
    condition: z.string().min(1).nullable().optional(),
    properly_marked: z.boolean().nullable().optional(),
    note: z.string().min(1).nullable().optional(),
    location: z.string().min(1).optional(),
  })
  .refine((body) => body.quantity_received === undefined || Number(body.quantity_received) > 0, {
    message: "quantity_received must be a positive number",
    path: ["quantity_received"],
  });

export const lineItemIdParamSchema = z.object({
  id: z.string().uuid(),
  lineItemId: z.string().uuid(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
