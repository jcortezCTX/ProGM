import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const requisitionsListQuerySchema = buildListQuerySchema([
  "requisition_number",
  "supplier",
  "created_at",
] as const);

// requisition_number stays free-text and is never coerced to an integer -
// future jobs may number differently (§5.1). A requisition's line items are the
// Mechanical Log rows it claims, so there is no separate quantity to supply.
export const createRequisitionSchema = z.object({
  requisition_number: z.string().min(1),
  supplier: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  mechanical_log_item_ids: z.array(z.string().uuid()).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
