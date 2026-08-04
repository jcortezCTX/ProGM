import { z } from "zod";

const decimalString = z.union([z.number(), z.string()]).transform((v) => String(v));

export const createRequisitionLineItemSchema = z.object({
  inventory_item_id: z.string().uuid(),
  description: z.string().min(1).optional(),
  quantity_ordered: decimalString,
});

export const createRequisitionSchema = z.object({
  requisition_number: z.string().min(1),
  supplier: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  line_items: z.array(createRequisitionLineItemSchema).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
