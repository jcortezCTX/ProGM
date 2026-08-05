import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).nullable().optional();

export const concreteSettingsSchema = z.object({
  job_number: z.string().min(1).optional(),
  job_name: z.string().min(1).optional(),
  start_date: z.string().min(1).optional(),
  total_est_cy: decimal,
});
