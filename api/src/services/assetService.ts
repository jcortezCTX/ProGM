import type { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { decodeCursor, paginate, type CursorPayload } from "../lib/listQuery.js";
import { validateAttributes, type FieldValidationError } from "../lib/attributeSchemaValidator.js";
import type { geoJsonGeometrySchema } from "../validation/assets.js";

export type GeoJsonGeometry = z.infer<typeof geoJsonGeometrySchema>;
export type AssetStatus =
  | "planned"
  | "under_construction"
  | "active"
  | "inactive"
  | "out_of_service"
  | "abandoned_in_place"
  | "removed";
export type AssetSource = "field_gps" | "as_built" | "digitized" | "import";

export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class ConflictError extends Error {}

// Carries field-level errors (spec 5.1: "return field-level validation
// errors, not a generic 400") from either the attribute_schema validator or
// a geometry-type mismatch against the asset type's allowed_geom_types.
export class AttributeValidationError extends Error {
  fields: FieldValidationError[];
  constructor(message: string, fields: FieldValidationError[]) {
    super(message);
    this.fields = fields;
  }
}

// One geometry column, mixed types (spec 2.1) - geom is Unsupported in
// Prisma (no PostGIS type), so every read/write touching it goes through
// raw SQL. ASSET_COLUMNS is shared between list/detail queries so the two
// never drift out of sync with each other.
const ASSET_COLUMNS = Prisma.sql`
  a.id, a.site_id, a.asset_type_id, a.parent_id, a.tag, a.name, a.description,
  a.geom_type, a.centroid_lat, a.centroid_lon, a.elevation_ft, a.depth_below_grade_ft,
  a.floor_level, a.layout_id, a.status, a.condition_rating, a.condition_assessed_on,
  a.criticality, a.manufacturer, a.model, a.serial_number, a.install_date, a.in_service_date,
  a.expected_life_years, a.replacement_cost, a.acquisition_cost, a.owner_dept, a.attributes,
  a.source, a.accuracy_ft, a.created_by, a.updated_by, a.created_at, a.updated_at, a.deleted_at,
  ST_AsGeoJSON(a.geom)::json AS geom
`;

interface RawAssetRow {
  id: string;
  site_id: string;
  asset_type_id: string;
  parent_id: string | null;
  tag: string;
  name: string;
  description: string | null;
  geom_type: string | null;
  centroid_lat: Prisma.Decimal | null;
  centroid_lon: Prisma.Decimal | null;
  elevation_ft: Prisma.Decimal | null;
  depth_below_grade_ft: Prisma.Decimal | null;
  floor_level: string | null;
  layout_id: string | null;
  status: string;
  condition_rating: number | null;
  condition_assessed_on: Date | null;
  criticality: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: Date | null;
  in_service_date: Date | null;
  expected_life_years: number | null;
  replacement_cost: Prisma.Decimal | null;
  acquisition_cost: Prisma.Decimal | null;
  owner_dept: string | null;
  attributes: Prisma.JsonValue;
  source: string | null;
  accuracy_ft: Prisma.Decimal | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  geom: GeoJsonGeometry | null;
  asset_type_code: string;
  asset_type_name: string;
}

function toAssetSummary(row: RawAssetRow) {
  const { asset_type_code, asset_type_name, ...rest } = row;
  return { ...rest, asset_type: { id: rest.asset_type_id, code: asset_type_code, name: asset_type_name } };
}

type AssetSortField = "tag" | "name" | "status" | "created_at";

// criticality/install_date are useful filters but stay out of the sortable
// set for now - they're nullable columns, and this raw-SQL path doesn't yet
// replicate lib/listQuery.ts's nulls-last(asc)/nulls-first(desc) handling
// the way the Prisma-native list endpoints do.
const SORT_EXPR: Record<AssetSortField, string> = {
  tag: "a.tag",
  name: "a.name",
  status: "a.status",
  created_at: "a.created_at",
};
const SORT_CAST: Partial<Record<AssetSortField, string>> = {
  status: "::asset_status",
  created_at: "::timestamptz",
};

function keysetClauseRaw(sortField: AssetSortField, order: "asc" | "desc", cursor: CursorPayload | null): Prisma.Sql {
  if (!cursor) return Prisma.sql`TRUE`;
  const cmp = order === "asc" ? Prisma.sql`>` : Prisma.sql`<`;
  const expr = Prisma.raw(SORT_EXPR[sortField]);
  const cast = SORT_CAST[sortField];
  const value = cast ? Prisma.sql`(${cursor.v}::text)${Prisma.raw(cast)}` : Prisma.sql`${cursor.v}`;
  return Prisma.sql`(${expr} ${cmp} ${value} OR (${expr} = ${value} AND a.id ${cmp} ${cursor.id}::uuid))`;
}

export interface ListAssetsParams {
  cursor?: string;
  limit: number;
  sort?: AssetSortField;
  order: "asc" | "desc";
  q?: string;
  type?: string;
  status?: string;
  criticality?: number;
  parent_id?: string;
  bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  near?: { lon: number; lat: number };
  radius_ft?: number;
  attr?: Record<string, string>;
}

// Every value below is bound through Prisma.sql's parameterization, never
// string concatenation - attr.* keys/values come straight from the query
// string, so this is the one place in the module an injection would be
// possible if that discipline slipped.
function buildFilterClauses(siteId: string, params: ListAssetsParams): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [Prisma.sql`a.site_id = ${siteId}::uuid`, Prisma.sql`a.deleted_at IS NULL`];

  if (params.type) clauses.push(Prisma.sql`t.code = ${params.type}`);
  if (params.status) clauses.push(Prisma.sql`a.status = ${params.status}::asset_status`);
  if (params.criticality !== undefined) clauses.push(Prisma.sql`a.criticality = ${params.criticality}`);
  if (params.parent_id) clauses.push(Prisma.sql`a.parent_id = ${params.parent_id}::uuid`);
  if (params.q) {
    clauses.push(Prisma.sql`(a.tag ILIKE ${"%" + params.q + "%"} OR a.name ILIKE ${"%" + params.q + "%"})`);
  }
  if (params.bbox) {
    const { minLon, minLat, maxLon, maxLat } = params.bbox;
    clauses.push(
      Prisma.sql`a.geom IS NOT NULL AND ST_Intersects(a.geom, ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326))`,
    );
  }
  if (params.near && params.radius_ft !== undefined) {
    const meters = params.radius_ft * 0.3048;
    clauses.push(
      Prisma.sql`a.geom IS NOT NULL AND ST_DWithin(a.geom::geography, ST_SetSRID(ST_MakePoint(${params.near.lon}, ${params.near.lat}), 4326)::geography, ${meters})`,
    );
  }
  for (const [key, value] of Object.entries(params.attr ?? {})) {
    clauses.push(Prisma.sql`a.attributes ->> ${key} = ${value}`);
  }

  return clauses;
}

export async function listAssets(siteId: string, params: ListAssetsParams) {
  const sortField = params.sort ?? "tag";
  const cursor = decodeCursor(params.cursor);
  const orderDir = params.order === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
  const whereClause = Prisma.join(
    [...buildFilterClauses(siteId, params), keysetClauseRaw(sortField, params.order, cursor)],
    " AND ",
  );

  const rows = await prisma.$queryRaw<RawAssetRow[]>`
    SELECT ${ASSET_COLUMNS}, t.code AS asset_type_code, t.name AS asset_type_name
    FROM assets a
    JOIN asset_types t ON t.id = a.asset_type_id
    WHERE ${whereClause}
    ORDER BY ${Prisma.raw(SORT_EXPR[sortField])} ${orderDir}, a.id ${orderDir}
    LIMIT ${params.limit + 1}
  `;

  const { page, hasMore, nextCursor } = paginate(rows, params.limit, (row) => ({
    v: sortField === "created_at" ? row.created_at.toISOString() : (row[sortField] as string),
    id: row.id,
  }));

  return { data: page.map(toAssetSummary), hasMore, nextCursor };
}

// ?format=geojson (spec 5.1): a FeatureCollection for direct map loading,
// not the paginated envelope - the caller is expected to scope this with
// bbox for anything past a small site.
export async function listAssetsAsGeoJson(siteId: string, params: ListAssetsParams) {
  const whereClause = Prisma.join(buildFilterClauses(siteId, params), " AND ");

  const rows = await prisma.$queryRaw<RawAssetRow[]>`
    SELECT ${ASSET_COLUMNS}, t.code AS asset_type_code, t.name AS asset_type_name
    FROM assets a
    JOIN asset_types t ON t.id = a.asset_type_id
    WHERE ${whereClause}
    ORDER BY a.tag ASC
    LIMIT ${params.limit}
  `;

  return {
    type: "FeatureCollection" as const,
    features: rows.map((row) => {
      const { geom, ...properties } = toAssetSummary(row);
      return { type: "Feature" as const, geometry: geom, properties };
    }),
  };
}

export async function getAsset(id: string) {
  const rows = await prisma.$queryRaw<RawAssetRow[]>`
    SELECT ${ASSET_COLUMNS}, t.code AS asset_type_code, t.name AS asset_type_name
    FROM assets a
    JOIN asset_types t ON t.id = a.asset_type_id
    WHERE a.id = ${id}::uuid AND a.deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row) throw new NotFoundError(`Asset ${id} not found`);

  const [parent, children, attachments] = await Promise.all([
    row.parent_id
      ? prisma.assets.findUnique({
          where: { id: row.parent_id },
          select: { id: true, tag: true, name: true, status: true },
        })
      : Promise.resolve(null),
    prisma.assets.findMany({
      where: { parent_id: id, deleted_at: null },
      select: { id: true, tag: true, name: true, status: true },
      orderBy: { tag: "asc" },
    }),
    prisma.attachments.findMany({ where: { entity_type: "asset", entity_id: id }, orderBy: { created_at: "desc" } }),
  ]);

  return { ...toAssetSummary(row), parent, children, attachments };
}

async function assertGeometryAllowed(assetTypeId: string, geometryType: string): Promise<void> {
  const assetType = await prisma.asset_types.findUnique({
    where: { id: assetTypeId },
    select: { allowed_geom_types: true },
  });
  if (assetType && !assetType.allowed_geom_types.includes(geometryType)) {
    throw new AttributeValidationError("geometry is not valid for this asset type", [
      {
        path: "geometry",
        message: `type must be one of: ${assetType.allowed_geom_types.join(", ")} (got ${geometryType})`,
      },
    ]);
  }
}

// The trigger (assets_geom_biu, migration 20260806120000) re-derives
// geom_type/centroid and re-checks allowed_geom_types itself, but
// assertGeometryAllowed runs first so a mismatch comes back as a clean
// field-level 400 instead of a raw Postgres exception surfacing as a 500.
async function writeGeometry(assetId: string, geometry: GeoJsonGeometry | null): Promise<void> {
  if (geometry === null) {
    await prisma.$executeRaw`UPDATE assets SET geom = NULL WHERE id = ${assetId}::uuid`;
    return;
  }
  try {
    await prisma.$executeRaw`
      UPDATE assets
      SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)
      WHERE id = ${assetId}::uuid
    `;
  } catch (err) {
    throw new ValidationError(`invalid geometry: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface CreateAssetInput {
  asset_type_id: string;
  parent_id?: string;
  tag: string;
  name: string;
  description?: string;
  geometry?: GeoJsonGeometry;
  elevation_ft?: number;
  depth_below_grade_ft?: number;
  floor_level?: string;
  layout_id?: string;
  status?: AssetStatus;
  condition_rating?: number;
  condition_assessed_on?: Date;
  criticality?: number;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  install_date?: Date;
  in_service_date?: Date;
  expected_life_years?: number;
  replacement_cost?: number;
  acquisition_cost?: number;
  owner_dept?: string;
  attributes?: Record<string, unknown>;
  source?: AssetSource;
  accuracy_ft?: number;
  created_by?: string | null;
}

export async function createAsset(siteId: string, input: CreateAssetInput) {
  const site = await prisma.sites.findUnique({ where: { id: siteId } });
  if (!site) throw new NotFoundError(`Site ${siteId} not found`);

  const assetType = await prisma.asset_types.findUnique({ where: { id: input.asset_type_id } });
  if (!assetType) throw new ValidationError(`asset_type_id ${input.asset_type_id} does not exist`);
  if (!assetType.is_active) throw new ValidationError(`asset type ${assetType.code} is not active`);

  if (input.geometry) await assertGeometryAllowed(assetType.id, input.geometry.type);

  const attributes = input.attributes ?? {};
  const validation = validateAttributes(assetType.attribute_schema, attributes);
  if (!validation.valid) throw new AttributeValidationError("attributes failed validation", validation.errors);

  if (input.parent_id) {
    const parent = await prisma.assets.findUnique({ where: { id: input.parent_id } });
    if (!parent) throw new ValidationError(`parent_id ${input.parent_id} does not exist`);
  }
  if (input.layout_id) {
    const layout = await prisma.site_layouts.findUnique({ where: { id: input.layout_id } });
    if (!layout) throw new ValidationError(`layout_id ${input.layout_id} does not exist`);
  }

  const clash = await prisma.assets.findUnique({ where: { site_id_tag: { site_id: siteId, tag: input.tag } } });
  if (clash) throw new ConflictError(`tag ${input.tag} already exists at this site`);

  const created = await prisma.assets.create({
    data: {
      site_id: siteId,
      asset_type_id: input.asset_type_id,
      parent_id: input.parent_id,
      tag: input.tag,
      name: input.name,
      description: input.description,
      elevation_ft: input.elevation_ft,
      depth_below_grade_ft: input.depth_below_grade_ft,
      floor_level: input.floor_level,
      layout_id: input.layout_id,
      status: input.status,
      condition_rating: input.condition_rating,
      condition_assessed_on: input.condition_assessed_on,
      criticality: input.criticality,
      manufacturer: input.manufacturer,
      model: input.model,
      serial_number: input.serial_number,
      install_date: input.install_date,
      in_service_date: input.in_service_date,
      expected_life_years: input.expected_life_years,
      replacement_cost: input.replacement_cost,
      acquisition_cost: input.acquisition_cost,
      owner_dept: input.owner_dept,
      attributes: attributes as Prisma.InputJsonValue,
      source: input.source,
      accuracy_ft: input.accuracy_ft,
      created_by: input.created_by ?? null,
    },
  });

  if (input.geometry) await writeGeometry(created.id, input.geometry);

  return getAsset(created.id);
}

export interface BulkCreateResult {
  created: number;
  errors: { index: number; error: string; fields?: FieldValidationError[] }[];
}

// Each row is its own attempt (spec 5.1: "for imports and for saving a
// batch of markers drawn in one map session") - one bad row in a 200-row
// import shouldn't roll back the other 199.
export async function bulkCreateAssets(siteId: string, inputs: CreateAssetInput[]): Promise<BulkCreateResult> {
  const errors: BulkCreateResult["errors"] = [];
  let created = 0;
  for (const [index, input] of inputs.entries()) {
    try {
      await createAsset(siteId, input);
      created++;
    } catch (err) {
      if (err instanceof AttributeValidationError) {
        errors.push({ index, error: err.message, fields: err.fields });
      } else if (err instanceof Error) {
        errors.push({ index, error: err.message });
      } else {
        errors.push({ index, error: "unknown error" });
      }
    }
  }
  return { created, errors };
}

export interface UpdateAssetInput {
  asset_type_id?: string;
  parent_id?: string | null;
  tag?: string;
  name?: string;
  description?: string | null;
  elevation_ft?: number | null;
  depth_below_grade_ft?: number | null;
  floor_level?: string | null;
  layout_id?: string | null;
  status?: AssetStatus;
  condition_rating?: number | null;
  condition_assessed_on?: Date | null;
  criticality?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  install_date?: Date | null;
  in_service_date?: Date | null;
  expected_life_years?: number | null;
  replacement_cost?: number | null;
  acquisition_cost?: number | null;
  owner_dept?: string | null;
  attributes?: Record<string, unknown>;
  source?: AssetSource | null;
  accuracy_ft?: number | null;
  updated_by?: string | null;
}

export async function updateAsset(
  id: string,
  input: UpdateAssetInput,
  options: { replaceAttributes?: boolean } = {},
) {
  const existing = await prisma.assets.findUnique({ where: { id } });
  if (!existing || existing.deleted_at) throw new NotFoundError(`Asset ${id} not found`);

  const effectiveAssetTypeId = input.asset_type_id ?? existing.asset_type_id;
  const assetType = await prisma.asset_types.findUnique({ where: { id: effectiveAssetTypeId } });
  if (!assetType) throw new ValidationError(`asset_type_id ${effectiveAssetTypeId} does not exist`);

  let attributes = existing.attributes as Record<string, unknown>;
  if (input.attributes !== undefined) {
    attributes = options.replaceAttributes ? input.attributes : { ...attributes, ...input.attributes };
  }
  if (input.attributes !== undefined || input.asset_type_id !== undefined) {
    const validation = validateAttributes(assetType.attribute_schema, attributes);
    if (!validation.valid) throw new AttributeValidationError("attributes failed validation", validation.errors);
  }

  if (input.parent_id) {
    if (input.parent_id === id) throw new ValidationError("an asset cannot be its own parent");
    const parent = await prisma.assets.findUnique({ where: { id: input.parent_id } });
    if (!parent) throw new ValidationError(`parent_id ${input.parent_id} does not exist`);
  }
  if (input.layout_id) {
    const layout = await prisma.site_layouts.findUnique({ where: { id: input.layout_id } });
    if (!layout) throw new ValidationError(`layout_id ${input.layout_id} does not exist`);
  }

  if (input.tag && input.tag !== existing.tag) {
    const clash = await prisma.assets.findUnique({
      where: { site_id_tag: { site_id: existing.site_id, tag: input.tag } },
    });
    if (clash) throw new ConflictError(`tag ${input.tag} already exists at this site`);
  }

  await prisma.assets.update({
    where: { id },
    data: {
      ...input,
      attributes: input.attributes !== undefined ? (attributes as Prisma.InputJsonValue) : undefined,
    },
  });

  return getAsset(id);
}

// The dedicated geometry endpoint (spec 5.1: "so geometry edits don't
// round-trip the whole record") - PATCH /assets/:id deliberately can't
// touch geom at all.
export async function updateAssetGeometry(id: string, geometry: GeoJsonGeometry | null) {
  const existing = await prisma.assets.findUnique({ where: { id } });
  if (!existing || existing.deleted_at) throw new NotFoundError(`Asset ${id} not found`);

  if (geometry) await assertGeometryAllowed(existing.asset_type_id, geometry.type);
  await writeGeometry(id, geometry);

  return getAsset(id);
}

export async function deleteAsset(id: string): Promise<void> {
  const existing = await prisma.assets.findUnique({ where: { id } });
  if (!existing || existing.deleted_at) throw new NotFoundError(`Asset ${id} not found`);
  await prisma.assets.update({ where: { id }, data: { deleted_at: new Date() } });
}
