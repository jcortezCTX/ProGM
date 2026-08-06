import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

const GEOM_TYPES = ["Point", "LineString", "Polygon", "MultiPolygon", "MultiLineString"] as const;

export const assetTypesListQuerySchema = buildListQuerySchema(["code", "name", "category", "created_at"] as const, {
  is_active: z.enum(["true", "false"]).optional(),
});

export const createAssetTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1).optional(),
  parent_type_id: z.string().uuid().optional(),
  allowed_geom_types: z.array(z.enum(GEOM_TYPES)).min(1),
  attribute_schema: z.record(z.string(), z.unknown()).optional(),
  ui_schema: z.record(z.string(), z.unknown()).optional(),
  default_useful_life_years: z.number().int().positive().optional(),
  icon: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

export const updateAssetTypeSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).nullable().optional(),
  parent_type_id: z.string().uuid().nullable().optional(),
  allowed_geom_types: z.array(z.enum(GEOM_TYPES)).min(1).optional(),
  attribute_schema: z.record(z.string(), z.unknown()).optional(),
  ui_schema: z.record(z.string(), z.unknown()).nullable().optional(),
  default_useful_life_years: z.number().int().positive().nullable().optional(),
  icon: z.string().min(1).nullable().optional(),
  color: z.string().min(1).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});
