import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const mixDesignsListQuerySchema = buildListQuerySchema(
  ["supplier", "mix_number", "design_strength_psi", "created_at"] as const,
  { active: z.coerce.boolean().optional() },
);

const text = z.string().min(1).nullable().optional();

export const mixDesignSchema = z.object({
  supplier: z.string().min(1).optional(),
  concrete_class: text,
  mix_type: text,
  mix_number: z.string().min(1).optional(),
  type_of_work: text,
  design_strength_psi: z.coerce.number().int().nullable().optional(),
  slump_range: text,
  air_range: text,
  active: z.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
