import { z } from "zod";

const decimalString = z.union([z.number(), z.string()]).transform((v) => String(v));

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

export const addDeliveryLineItemSchema = z
  .object({
    requisition_line_item_id: z.string().uuid().optional(),
    inventory_item_id: z.string().uuid(),
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
  });

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
