import { z } from "zod";

export const holidaySchema = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "day must be an ISO date (YYYY-MM-DD)"),
  name: z.string().min(1),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
