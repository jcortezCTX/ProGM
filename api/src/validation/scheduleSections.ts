import { z } from "zod";

export const sectionSchema = z.object({
  name: z.string().min(1),
  sort_order: z.coerce.number().int().optional(),
});

export const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  sort_order: z.coerce.number().int().optional(),
});

// Body is a bare array of section ids in the desired order, per
// SCHEDULE_SPEC.md ("PUT /api/schedule/sections/order (array of ids)").
export const reorderSectionsSchema = z.array(z.string().uuid()).min(1);

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
