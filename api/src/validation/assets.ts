import { z } from "zod";
import { buildListQuerySchema } from "./listQuery.js";

const ASSET_STATUSES = [
  "planned",
  "under_construction",
  "active",
  "inactive",
  "out_of_service",
  "abandoned_in_place",
  "removed",
] as const;

const ASSET_SOURCES = ["field_gps", "as_built", "digitized", "import"] as const;

// [lon, lat] - order matters for GeoJSON, unlike the human "lat,lon" order
// used elsewhere in this file's bbox/near query params.
const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z.array(coordinate).min(4); // closed ring: first/last position equal, enforced by PostGIS on write

const pointGeometry = z.object({ type: z.literal("Point"), coordinates: coordinate });
const lineStringGeometry = z.object({ type: z.literal("LineString"), coordinates: z.array(coordinate).min(2) });
const polygonGeometry = z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) });
const multiPolygonGeometry = z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)) });
const multiLineStringGeometry = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(coordinate).min(2)),
});

// Coordinate range is enforced by the `coordinate` tuple itself (spec 7:
// "validate incoming coordinates are in range"). The null-island refine
// below covers the other half of that same requirement: a lone Point at
// exactly (0,0) is what a failed GPS read defaults to, not a real position.
export const geoJsonGeometrySchema = z
  .discriminatedUnion("type", [
    pointGeometry,
    lineStringGeometry,
    polygonGeometry,
    multiPolygonGeometry,
    multiLineStringGeometry,
  ])
  .refine((geom) => !(geom.type === "Point" && geom.coordinates[0] === 0 && geom.coordinates[1] === 0), {
    message: "(0,0) is treated as the null-island GPS-capture-failed default and rejected",
  });

export const createAssetSchema = z.object({
  asset_type_id: z.string().uuid(),
  parent_id: z.string().uuid().optional(),
  tag: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  geometry: geoJsonGeometrySchema.optional(),
  elevation_ft: z.number().optional(),
  depth_below_grade_ft: z.number().optional(),
  floor_level: z.string().min(1).optional(),
  layout_id: z.string().uuid().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  condition_rating: z.number().int().min(1).max(5).optional(),
  condition_assessed_on: z.coerce.date().optional(),
  criticality: z.number().int().min(1).max(5).optional(),
  manufacturer: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  serial_number: z.string().min(1).optional(),
  install_date: z.coerce.date().optional(),
  in_service_date: z.coerce.date().optional(),
  expected_life_years: z.number().int().positive().optional(),
  replacement_cost: z.number().nonnegative().optional(),
  acquisition_cost: z.number().nonnegative().optional(),
  owner_dept: z.string().min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(ASSET_SOURCES).optional(),
  accuracy_ft: z.number().nonnegative().optional(),
});

export const bulkCreateAssetsSchema = z.object({
  assets: z.array(createAssetSchema).min(1).max(500),
});

const nullableText = z.string().min(1).nullable().optional();
const nullableNumber = z.number().nullable().optional();
const nullableDate = z.coerce.date().nullable().optional();

// PATCH deliberately does not accept `geometry` - the dedicated
// POST /:id/geometry endpoint exists specifically so geometry edits (the
// map drag/redraw path) don't round-trip the whole record (spec 5.1).
export const updateAssetSchema = z.object({
  asset_type_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  tag: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: nullableText,
  elevation_ft: nullableNumber,
  depth_below_grade_ft: nullableNumber,
  floor_level: nullableText,
  layout_id: z.string().uuid().nullable().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  condition_rating: z.number().int().min(1).max(5).nullable().optional(),
  condition_assessed_on: nullableDate,
  criticality: z.number().int().min(1).max(5).nullable().optional(),
  manufacturer: nullableText,
  model: nullableText,
  serial_number: nullableText,
  install_date: nullableDate,
  in_service_date: nullableDate,
  expected_life_years: z.number().int().positive().nullable().optional(),
  replacement_cost: z.number().nonnegative().nullable().optional(),
  acquisition_cost: z.number().nonnegative().nullable().optional(),
  owner_dept: nullableText,
  attributes: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(ASSET_SOURCES).nullable().optional(),
  accuracy_ft: z.number().nonnegative().nullable().optional(),
});

export const replaceAttributesQuerySchema = z.object({
  replace_attributes: z.enum(["true", "false"]).optional(),
});

export const updateGeometrySchema = z.object({
  geometry: geoJsonGeometrySchema.nullable(),
});

const lon = z.number().finite().min(-180).max(180);
const lat = z.number().finite().min(-90).max(90);

const bboxSchema = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([lon, lat, lon, lat]))
  .transform(([minLon, minLat, maxLon, maxLat]) => ({ minLon, minLat, maxLon, maxLat }));

const nearSchema = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([lon, lat]))
  .transform(([lon, lat]) => ({ lon, lat }));

export const assetsListQuerySchema = buildListQuerySchema(["tag", "name", "status", "created_at"] as const, {
  type: z.string().min(1).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  criticality: z.coerce.number().int().min(1).max(5).optional(),
  parent_id: z.string().uuid().optional(),
  bbox: bboxSchema.optional(),
  near: nearSchema.optional(),
  radius_ft: z.coerce.number().positive().optional(),
  format: z.enum(["geojson"]).optional(),
}).superRefine((val, ctx) => {
  if (Boolean(val.near) !== Boolean(val.radius_ft)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "near and radius_ft must be provided together" });
  }
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const siteIdParamSchema = z.object({
  siteId: z.string().uuid(),
});
