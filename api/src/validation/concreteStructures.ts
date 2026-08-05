import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const structuresListQuerySchema = buildListQuerySchema(["name", "created_at"] as const);

const decimal = z.union([z.number(), z.string()]).nullable().optional();

export const structureSchema = z.object({
  name: z.string().min(1).optional(),
  est_cy: decimal,
  est_cost: decimal,
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
