import { z } from "zod";

export const ganttQuerySchema = z.object({
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)")
    .optional(),
  weeks: z.coerce.number().int().min(1).max(52).default(6),
});
