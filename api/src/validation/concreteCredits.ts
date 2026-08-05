import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const concreteCreditsListQuerySchema = buildListQuerySchema([
  "date_received",
  "date_approved",
  "created_at",
] as const);

const decimal = z.union([z.number(), z.string()]);
const text = z.string().min(1).nullable().optional();
const date = z.string().min(1).nullable().optional();

export const concreteCreditSchema = z.object({
  date_received: z.string().min(1).optional(),
  amount: decimal.optional(),
  date_approved: date,
  notes: text,
  created_by: z.string().uuid().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
