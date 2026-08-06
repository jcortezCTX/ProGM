import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

export const sitesListQuerySchema = buildListQuerySchema(["name", "code", "created_at"] as const);

export const createSiteSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  default_zoom: z.number().int().min(0).max(24).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
